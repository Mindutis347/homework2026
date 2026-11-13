package repo

import (
	"context"
	"fmt"

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

// Load returns one order with its items and delivered keys.
func LoadOrder(ctx context.Context, q Querier, orderID int64) (models.Order, error) {
	var o models.Order
	o.Items = []models.OrderItem{}

	err := q.QueryRow(ctx, `
		SELECT id, reference, status, subtotal_cents, total_cents, currency,
		       payment_method, created_at, paid_at
		FROM orders WHERE id = $1`, orderID,
	).Scan(&o.ID, &o.Reference, &o.Status, &o.SubtotalCents, &o.TotalCents, &o.Currency,
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
		       oi.unit_price_cents, oi.quantity, oi.commission_cents, oi.seller_payout_cents
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
		it.Keys = []string{}
		if err := rows.Scan(&it.ID, &it.ProductID, &it.ProductSlug, &it.ProductTitle, &it.CoverURL,
			&it.PlatformName, &it.RegionCode, &it.SellerStore, &it.UnitPriceCents, &it.Quantity,
			&it.CommissionCents, &it.SellerPayoutCents); err != nil {
			return o, err
		}
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
		SELECT order_item_id, key_code
		FROM inventory_keys
		WHERE order_item_id = ANY($1)
		ORDER BY order_item_id, id`, itemIDs(o.Items))
	if err != nil {
		return o, fmt.Errorf("load keys: %w", err)
	}
	defer keyRows.Close()

	for keyRows.Next() {
		var itemID int64
		var code string
		if err := keyRows.Scan(&itemID, &code); err != nil {
			return o, err
		}
		if idx, ok := itemIndex[itemID]; ok {
			o.Items[idx].Keys = append(o.Items[idx].Keys, code)
		}
	}
	return o, keyRows.Err()
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
