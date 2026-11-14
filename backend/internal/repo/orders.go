package repo

import (
	"context"
	"errors"
	"fmt"
	"math"
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

const orderColumns = `id, reference, status, subtotal_cents, tax_cents, tax_bp, total_cents, currency,
		       payment_method, created_at, paid_at`

// Load returns one order with its items and the metadata of their keys. Key
// values are deliberately absent: they are only returned by RevealKeys.
func LoadOrder(ctx context.Context, q Querier, orderID int64) (models.Order, error) {
	orders, err := loadOrders(ctx, q, []int64{orderID})
	if err != nil {
		return models.Order{}, err
	}
	if len(orders) == 0 {
		return models.Order{Items: []models.OrderItem{}}, ErrNotFound
	}
	return orders[0], nil
}

// loadOrders reads the given orders in three queries total — the order rows,
// their items, and the key metadata — and returns them in the order of the ids
// given, skipping any that no longer exist. Batching matters here because the
// database is remote: the library costs three round trips no matter how many
// orders the buyer has, instead of three per order.
func loadOrders(ctx context.Context, q Querier, ids []int64) ([]models.Order, error) {
	if len(ids) == 0 {
		return []models.Order{}, nil
	}

	rows, err := q.Query(ctx, `SELECT `+orderColumns+` FROM orders WHERE id = ANY($1)`, ids)
	if err != nil {
		return nil, fmt.Errorf("load orders: %w", err)
	}
	defer rows.Close()

	byID := make(map[int64]models.Order, len(ids))
	for rows.Next() {
		var o models.Order
		o.Items = []models.OrderItem{}
		if err := rows.Scan(&o.ID, &o.Reference, &o.Status, &o.SubtotalCents, &o.TaxCents, &o.TaxBasisPoints,
			&o.TotalCents, &o.Currency, &o.PaymentMethod, &o.CreatedAt, &o.PaidAt); err != nil {
			return nil, fmt.Errorf("scan order: %w", err)
		}
		byID[o.ID] = o
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("load orders: %w", err)
	}
	rows.Close()

	out := make([]models.Order, 0, len(ids))
	orderIDs := make([]int64, 0, len(ids))
	for _, id := range ids {
		if o, ok := byID[id]; ok {
			out = append(out, o)
			orderIDs = append(orderIDs, id)
		}
	}
	if len(out) == 0 {
		return out, nil
	}

	orderPos := make(map[int64]int, len(out))
	for i, o := range out {
		orderPos[o.ID] = i
	}

	itemRows, err := q.Query(ctx, `
		SELECT oi.order_id, oi.id, oi.product_id, p.slug, oi.product_title, p.cover_url, oi.platform_name,
		       oi.region_code, COALESCE(NULLIF(sp.store_name, ''), u.display_name),
		       oi.unit_price_cents, oi.quantity, oi.commission_cents, oi.seller_payout_cents,
		       oi.status
		FROM order_items oi
		JOIN products p ON p.id = oi.product_id
		JOIN users u    ON u.id = oi.seller_id
		LEFT JOIN seller_profiles sp ON sp.user_id = oi.seller_id
		WHERE oi.order_id = ANY($1)
		ORDER BY oi.order_id, oi.id`, orderIDs)
	if err != nil {
		return nil, fmt.Errorf("load order items: %w", err)
	}
	defer itemRows.Close()

	type itemRef struct{ order, item int }
	itemPos := map[int64]itemRef{}
	itemIDsInPlay := make([]int64, 0, len(orderIDs)*2)
	for itemRows.Next() {
		var orderID int64
		var it models.OrderItem
		var itemStatus string
		it.Keys = []models.OrderKey{}
		if err := itemRows.Scan(&orderID, &it.ID, &it.ProductID, &it.ProductSlug, &it.ProductTitle, &it.CoverURL,
			&it.PlatformName, &it.RegionCode, &it.SellerStore, &it.UnitPriceCents, &it.Quantity,
			&it.CommissionCents, &it.SellerPayoutCents, &itemStatus); err != nil {
			return nil, err
		}
		it.Refunded = itemStatus == "refunded"
		pos, ok := orderPos[orderID]
		if !ok {
			continue
		}
		itemPos[it.ID] = itemRef{order: pos, item: len(out[pos].Items)}
		itemIDsInPlay = append(itemIDsInPlay, it.ID)
		out[pos].Items = append(out[pos].Items, it)
	}
	if err := itemRows.Err(); err != nil {
		return nil, err
	}
	itemRows.Close()

	if len(itemIDsInPlay) > 0 {
		keyRows, err := q.Query(ctx, `
			SELECT order_item_id, id, displayed_at
			FROM inventory_keys
			WHERE order_item_id = ANY($1)
			ORDER BY order_item_id, id`, itemIDsInPlay)
		if err != nil {
			return nil, fmt.Errorf("load keys: %w", err)
		}
		defer keyRows.Close()

		for keyRows.Next() {
			var itemID int64
			var key models.OrderKey
			if err := keyRows.Scan(&itemID, &key.ID, &key.DisplayedAt); err != nil {
				return nil, err
			}
			ref, ok := itemPos[itemID]
			if !ok {
				continue
			}
			item := &out[ref.order].Items[ref.item]
			item.Keys = append(item.Keys, key)
			// A line is "displayed" once any of its keys has been shown.
			if key.DisplayedAt != nil && (item.DisplayedAt == nil || key.DisplayedAt.Before(*item.DisplayedAt)) {
				shown := *key.DisplayedAt
				item.DisplayedAt = &shown
			}
		}
		if err := keyRows.Err(); err != nil {
			return nil, err
		}
	}

	// Refunds are only possible while the buyer has seen nothing.
	for i := range out {
		for j := range out[i].Items {
			item := &out[i].Items[j]
			item.Refundable = out[i].Status == "paid" && !item.Refunded && item.DisplayedAt == nil
		}
	}
	return out, nil
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

	out, err := loadOrders(ctx, r.pool, ids)
	if err != nil {
		return nil, err
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

	// Totals shrink with what is still bought, and the tax shrinks with them so
	// subtotal + tax keeps equalling total on the receipt.
	var remaining int
	if err := tx.QueryRow(ctx, `
		SELECT COALESCE(SUM(unit_price_cents * quantity), 0)
		FROM order_items WHERE order_id = $1 AND status = 'paid'`, orderID).Scan(&remaining); err != nil {
		return models.Order{}, err
	}
	var taxBP, oldSubtotal, oldTax int
	if err := tx.QueryRow(ctx,
		`SELECT tax_bp, subtotal_cents, tax_cents FROM orders WHERE id = $1`,
		orderID).Scan(&taxBP, &oldSubtotal, &oldTax); err != nil {
		return models.Order{}, fmt.Errorf("read order totals: %w", err)
	}
	tax := 0
	switch {
	case remaining == 0:
		tax = 0
	case taxBP > 0:
		tax = int(math.Round(float64(remaining) * float64(taxBP) / 10000))
	case oldSubtotal > 0 && oldTax > 0:
		// Orders taken before the rate was stored: scale the charge we do have.
		tax = int(math.Round(float64(oldTax) * float64(remaining) / float64(oldSubtotal)))
	}
	if _, err := tx.Exec(ctx,
		`UPDATE orders SET subtotal_cents = $2, tax_cents = $3, total_cents = $4 WHERE id = $1`,
		orderID, remaining, tax, remaining+tax); err != nil {
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
