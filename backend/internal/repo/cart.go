package repo

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

var (
	// ErrOfferUnavailable covers inactive offers and carts asking for more
	// copies than the seller has keys for.
	ErrOfferUnavailable = errors.New("offer unavailable")
)

// Cart stores one row per (user, offer). Prices are never cached here — they
// are always read from the live offer so a cart can never hold a stale price.
type Cart struct {
	pool *pgxpool.Pool
}

func NewCart(pool *pgxpool.Pool) *Cart { return &Cart{pool: pool} }

// Get returns the cart with fresh pricing and availability.
func (c *Cart) Get(ctx context.Context, userID int64) (models.Cart, error) {
	cart := models.Cart{Items: []models.CartItem{}}

	rows, err := c.pool.Query(ctx, `
		SELECT ci.offer_id, o.product_id, p.slug, p.title, p.cover_url,
		       pl.slug, pl.name, r.code,
		       COALESCE(NULLIF(sp.store_name, ''), u.display_name),
		       o.price_cents, ci.quantity, o.stock,
		       o.price_cents * ci.quantity AS line_total
		FROM cart_items ci
		JOIN offers o        ON o.id = ci.offer_id
		JOIN products p      ON p.id = o.product_id
		JOIN platforms pl    ON pl.id = o.platform_id
		JOIN regions r       ON r.id = o.region_id
		JOIN users u         ON u.id = o.seller_id
		LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
		WHERE ci.user_id = $1
		ORDER BY ci.added_at DESC`, userID)
	if err != nil {
		return cart, fmt.Errorf("load cart: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var it models.CartItem
		if err := rows.Scan(&it.OfferID, &it.ProductID, &it.Slug, &it.Title, &it.CoverURL,
			&it.PlatformSlug, &it.PlatformName, &it.RegionCode, &it.SellerStore,
			&it.UnitPriceCents, &it.Quantity, &it.Stock, &it.LineTotalCents); err != nil {
			return cart, fmt.Errorf("scan cart item: %w", err)
		}
		cart.Items = append(cart.Items, it)
		cart.ItemCount += it.Quantity
		cart.SubtotalCents += it.LineTotalCents
	}
	return cart, rows.Err()
}

// Add inserts or replaces a cart line, validating the offer in the same
// statement so an inactive or under-stocked offer can never enter the cart.
func (c *Cart) Add(ctx context.Context, userID, offerID int64, quantity int) error {
	if quantity < 1 || quantity > 10 {
		return fmt.Errorf("%w: quantity must be between 1 and 10", ErrOfferUnavailable)
	}
	tag, err := c.pool.Exec(ctx, `
		INSERT INTO cart_items (user_id, offer_id, quantity)
		SELECT $1, o.id, $3::smallint
		FROM offers o
		WHERE o.id = $2 AND o.is_active AND o.stock >= $3::smallint
		ON CONFLICT (user_id, offer_id)
		DO UPDATE SET quantity = EXCLUDED.quantity, added_at = now()`,
		userID, offerID, quantity)
	if err != nil {
		return fmt.Errorf("add to cart: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrOfferUnavailable
	}
	return nil
}

func (c *Cart) SetQuantity(ctx context.Context, userID, offerID int64, quantity int) error {
	if quantity < 1 || quantity > 10 {
		return fmt.Errorf("%w: quantity must be between 1 and 10", ErrOfferUnavailable)
	}
	tag, err := c.pool.Exec(ctx, `
		UPDATE cart_items ci
		SET quantity = $3::smallint, added_at = now()
		FROM offers o
		WHERE ci.user_id = $1 AND ci.offer_id = $2 AND o.id = ci.offer_id AND o.stock >= $3::smallint`,
		userID, offerID, quantity)
	if err != nil {
		return fmt.Errorf("update cart quantity: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (c *Cart) Remove(ctx context.Context, userID, offerID int64) error {
	_, err := c.pool.Exec(ctx, `DELETE FROM cart_items WHERE user_id = $1 AND offer_id = $2`, userID, offerID)
	return err
}

func (c *Cart) Clear(ctx context.Context, userID int64) error {
	_, err := c.pool.Exec(ctx, `DELETE FROM cart_items WHERE user_id = $1`, userID)
	return err
}
