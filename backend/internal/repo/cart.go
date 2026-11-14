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

// CartLine is one entry a guest keeps in their local cart.
type CartLine struct {
	OfferID  int64 `json:"offerId"`
	Quantity int   `json:"quantity"`
}

// Preview prices a guest's local cart without storing anything. Prices have to
// come from the server: a cart kept in the browser must never decide what a game
// costs.
func (c *Cart) Preview(ctx context.Context, lines []CartLine) (models.Cart, error) {
	cart := models.Cart{Items: []models.CartItem{}}
	if len(lines) == 0 {
		return cart, nil
	}

	offerIDs := make([]int64, len(lines))
	quantities := make([]int16, len(lines))
	for i, line := range lines {
		offerIDs[i] = line.OfferID
		quantities[i] = int16(line.Quantity)
	}

	rows, err := c.pool.Query(ctx, `
		SELECT o.id, o.product_id, p.slug, p.title, p.cover_url,
		       pl.slug, pl.name, r.code,
		       COALESCE(NULLIF(sp.store_name, ''), u.display_name),
		       o.price_cents, want.qty::int, o.stock,
		       o.price_cents * want.qty::int AS line_total
		FROM unnest($1::bigint[], $2::smallint[]) WITH ORDINALITY AS want(offer_id, qty, ord)
		JOIN offers o     ON o.id = want.offer_id
		JOIN products p   ON p.id = o.product_id
		JOIN platforms pl ON pl.id = o.platform_id
		JOIN regions r    ON r.id = o.region_id
		JOIN users u      ON u.id = o.seller_id
		LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
		WHERE o.is_active AND o.stock > 0
		ORDER BY want.ord`, offerIDs, quantities)
	if err != nil {
		return cart, fmt.Errorf("preview cart: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var it models.CartItem
		if err := rows.Scan(&it.OfferID, &it.ProductID, &it.Slug, &it.Title, &it.CoverURL,
			&it.PlatformSlug, &it.PlatformName, &it.RegionCode, &it.SellerStore,
			&it.UnitPriceCents, &it.Quantity, &it.Stock, &it.LineTotalCents); err != nil {
			return cart, fmt.Errorf("scan preview item: %w", err)
		}
		cart.Items = append(cart.Items, it)
		cart.ItemCount += it.Quantity
		cart.SubtotalCents += it.LineTotalCents
	}
	return cart, rows.Err()
}

// Merge folds a guest cart into the signed-in cart, which is what happens right
// after sign-in. Lines combine, are capped at the 10-per-line limit, and offers
// that went inactive are skipped rather than erroring the whole merge.
func (c *Cart) Merge(ctx context.Context, userID int64, lines []CartLine) error {
	if len(lines) == 0 {
		return nil
	}
	offerIDs := make([]int64, len(lines))
	quantities := make([]int16, len(lines))
	for i, line := range lines {
		offerIDs[i] = line.OfferID
		quantities[i] = int16(line.Quantity)
	}

	_, err := c.pool.Exec(ctx, `
		INSERT INTO cart_items (user_id, offer_id, quantity)
		SELECT $1, o.id, LEAST(want.qty, o.stock)::smallint
		FROM unnest($2::bigint[], $3::smallint[]) AS want(offer_id, qty)
		JOIN offers o ON o.id = want.offer_id AND o.is_active AND o.stock > 0
		ON CONFLICT (user_id, offer_id)
		DO UPDATE SET quantity = LEAST(cart_items.quantity + EXCLUDED.quantity, 10)::smallint,
		              added_at = now()`,
		userID, offerIDs, quantities)
	if err != nil {
		return fmt.Errorf("merge cart: %w", err)
	}
	return nil
}
