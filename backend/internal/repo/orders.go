package repo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// Querier is satisfied by *pgxpool.Pool and pgx.Tx, so loaders work both inside
// and outside a transaction.
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Orders reads purchase history.
type Orders struct {
	pool *pgxpool.Pool
}

func NewOrders(pool *pgxpool.Pool) *Orders { return &Orders{pool: pool} }

// Load returns one order with its items and the metadata of their keys. Key
// values are deliberately absent: they are only returned by RevealKeys.
func LoadOrder(ctx context.Context, q Querier, orderID int64) (models.Order, error) {
	var o models.Order
	o.Items = []models.OrderItem{}

	err := q.QueryRow(ctx, `
		SELECT id, reference, status, subtotal_cents, tax_cents, total_cents, currency,
		       payment_method, created_at, paid_at
		FROM orders WHERE id = $1`, orderID,
	).Scan(&o.ID, &o.Reference, &o.Status, &o.SubtotalCents, &o.TaxCents, &o.TotalCents, &o.Currency,
		&o.PaymentMethod, &o.CreatedAt, &o.PaidAt)
	if err != nil {
		if err == pgx.ErrNoRows {
			return o, ErrNotFound
		}
		return o, fmt.Errorf("load order: %w", err)
	}

	rows, err := q.Query(ctx, `
		SELECT oi.id, oi.product_id, p.slug, oi.product_title, p.cover_url, oi.platform_name,
		       oi.region_code, COALESCE(NULLIF(sp.store_name, ''), u.display_name),
		       oi.unit_price_cents, oi.quantity, oi.commission_cents, oi.seller_payout_cents,
		       oi.status
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		JOIN users u    ON u.id = oi.seller_id
		LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
		WHERE oi.order_id = $1
		ORDER BY oi.id`, orderID)
	if err != nil {
		return o, fmt.Errorf("load order items: %w", err)
	}
	defer rows.Close()

	itemIndex := map[int64]int{}
	for rows.Next() {
		var it models.OrderItem
		var itemStatus string
		it.Keys = []models.OrderKey{}
		if err := rows.Scan(&it.ID, &it.ProductID, &it.ProductSlug, &it.ProductTitle, &it.CoverURL,
			&it.PlatformName, &it.RegionCode, &it.SellerStore, &it.UnitPriceCents, &it.Quantity,
			&it.CommissionCents, &it.SellerPayoutCents, &itemStatus); err != nil {
			return o, err
		}
		it.Refunded = itemStatus == "refunded"
		itemIndex[it.ID] = len(o.Items)
		o.Items = append(o.Items, it)
	}
	if err := rows.Err(); err != nil {
		return o, err
	}
	if len(o.Items) == 0 {
		return o, nil
	}

	keyRows, err := q.Query(ctx, `
		SELECT order_item_id, id, displayed_at
		FROM inventory_keys
		WHERE order_item_id = ANY($1)
		ORDER BY order_item_id, id`, itemIDs(o.Items))
	if err != nil {
		return o, fmt.Errorf("load keys: %w", err)
	}
	defer keyRows.Close()

	for keyRows.Next() {
		var itemID int64
		var key models.OrderKey
		if err := keyRows.Scan(&itemID, &key.ID, &key.DisplayedAt); err != nil {
			return o, err
		}
		idx, ok := itemIndex[itemID]
		if !ok {
			continue
		}
		o.Items[idx].Keys = append(o.Items[idx].Keys, key)
		// A line is "displayed" once any of its keys has been shown.
		if key.DisplayedAt != nil && (o.Items[idx].DisplayedAt == nil || key.DisplayedAt.Before(*o.Items[idx].DisplayedAt)) {
			shown := *key.DisplayedAt
			o.Items[idx].DisplayedAt = &shown
		}
	}
	if err := keyRows.Err(); err != nil {
		return o, err
	}

	// Refunds are only possible while the buyer has seen nothing.
	for i := range o.Items {
		item := &o.Items[i]
		item.Refundable = o.Status == "paid" && !item.Refunded && item.DisplayedAt == nil
	}
	return o, nil
}

func itemIDs(items []models.OrderItem) []int64 {
	ids := make([]int64, len(items))
	for i, it := range items {
		ids[i] = it.ID
	}
	return ids
}

// ListByUser returns the buyer's order history, newest first.
func (r *Orders) ListByUser(ctx context.Context, userID int64) ([]models.Order, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id FROM orders WHERE user_id = $1 ORDER BY created_at DESC, id DESC`, userID)
	if err != nil {
		return nil, fmt.Errorf("list orders: %w", err)
	}
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]models.Order, 0, len(ids))
	for _, id := range ids {
		order, err := LoadOrder(ctx, r.pool, id)
		if err != nil {
			return nil, err
		}
		out = append(out, order)
	}
	return out, nil
}

// ByIDForUser returns one order, enforcing ownership (admin reads use a
// separate path in the admin repo).
func (r *Orders) ByIDForUser(ctx context.Context, orderID, userID int64) (models.Order, error) {
	var owner int64
	if err := r.pool.QueryRow(ctx, `SELECT user_id FROM orders WHERE id = $1`, orderID).Scan(&owner); err != nil {
		if err == pgx.ErrNoRows {
			return models.Order{}, ErrNotFound
		}
		return models.Order{}, err
	}
	if owner != userID {
		return models.Order{}, ErrNotFound
	}
	return LoadOrder(ctx, r.pool, orderID)
}

// RevealKeys records that the buyer has looked at a line's keys and returns the
// codes. This is the only place in the API that emits a key value, and the first
// call stamps displayed_at — which is what later blocks a refund.
func (r *Orders) RevealKeys(ctx context.Context, orderID, itemID, userID int64) ([]string, *time.Time, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var itemStatus string
	err = tx.QueryRow(ctx, `
		SELECT oi.status
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE oi.id = $1 AND oi.order_id = $2 AND o.user_id = $3 AND o.status = 'paid'
		FOR UPDATE OF oi`, itemID, orderID, userID).Scan(&itemStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	if itemStatus == "refunded" {
		return nil, nil, fmt.Errorf("%w: this line was refunded", ErrConflict)
	}

	rows, err := tx.Query(ctx, `
		UPDATE inventory_keys
		SET displayed_at = COALESCE(displayed_at, now())
		WHERE order_item_id = $1
		RETURNING key_code, displayed_at`, itemID)
	if err != nil {
		return nil, nil, fmt.Errorf("reveal keys: %w", err)
	}
	defer rows.Close()

	codes := []string{}
	var shownAt *time.Time
	for rows.Next() {
		var code string
		var displayed *time.Time
		if err := rows.Scan(&code, &displayed); err != nil {
			return nil, nil, err
		}
		codes = append(codes, code)
		if displayed != nil && (shownAt == nil || displayed.Before(*shownAt)) {
			shown := *displayed
			shownAt = &shown
		}
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}
	rows.Close()

	if err := tx.Commit(ctx); err != nil {
		return nil, nil, err
	}
	return codes, shownAt, nil
}

// RefundItem returns an undisplayed line: the buyer gets the money back, the keys
// go back in stock (nobody ever saw them, so they are still valid), and the order
// totals are recomputed. It refuses once any key of the line has been displayed.
func (r *Orders) RefundItem(ctx context.Context, orderID, itemID, userID int64) (models.Order, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return models.Order{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		itemStatus string
		offerID    *int64
		quantity   int
	)
	err = tx.QueryRow(ctx, `
		SELECT oi.status, oi.offer_id, oi.quantity
		FROM order_items oi
		JOIN orders o ON o.id = oi.order_id
		WHERE oi.id = $1 AND oi.order_id = $2 AND o.user_id = $3 AND o.status = 'paid'
		FOR UPDATE OF oi`, itemID, orderID, userID).Scan(&itemStatus, &offerID, &quantity)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.Order{}, ErrNotFound
	}
	if err != nil {
		return models.Order{}, err
	}
	if itemStatus == "refunded" {
		return models.Order{}, fmt.Errorf("%w: already refunded", ErrConflict)
	}

	var displayed int
	if err := tx.QueryRow(ctx,
		`SELECT count(*) FROM inventory_keys WHERE order_item_id = $1 AND displayed_at IS NOT NULL`,
		itemID).Scan(&displayed); err != nil {
		return models.Order{}, err
	}
	if displayed > 0 {
		return models.Order{}, fmt.Errorf("%w: the key has already been displayed", ErrConflict)
	}

	if _, err := tx.Exec(ctx,
		`UPDATE order_items SET status = 'refunded', refunded_at = now() WHERE id = $1`, itemID); err != nil {
		return models.Order{}, fmt.Errorf("refund item: %w", err)
	}

	// Undisplayed codes are still valid, so they go back on sale with the stock.
	if _, err := tx.Exec(ctx, `
		UPDATE inventory_keys SET status = 'available', order_item_id = NULL, sold_at = NULL
		WHERE order_item_id = $1`, itemID); err != nil {
		return models.Order{}, fmt.Errorf("release keys: %w", err)
	}
	if offerID != nil {
		if _, err := tx.Exec(ctx,
			`UPDATE offers SET stock = stock + $2, updated_at = now() WHERE id = $1`,
			*offerID, quantity); err != nil {
			return models.Order{}, fmt.Errorf("restore stock: %w", err)
		}
	}

	var remaining int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(unit_price_cents * quantity), 0)
		FROM order_items WHERE order_id = $1 AND status = 'paid'`, orderID).Scan(&remaining); err != nil {
		return models.Order{}, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE orders SET subtotal_cents = $2, total_cents = $2 WHERE id = $1`,
		orderID, remaining); err != nil {
		return models.Order{}, fmt.Errorf("recompute totals: %w", err)
	}
	if remaining == 0 {
		if _, err := tx.Exec(ctx, `UPDATE orders SET status = 'refunded' WHERE id = $1`, orderID); err != nil {
			return models.Order{}, fmt.Errorf("mark order refunded: %w", err)
		}
	}

	order, err := LoadOrder(ctx, tx, orderID)
	if err != nil {
		return models.Order{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return models.Order{}, err
	}
	return order, nil
}
