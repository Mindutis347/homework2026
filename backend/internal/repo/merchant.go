package repo

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// Merchant reads and writes everything owned by a seller.
type Merchant struct {
	pool *pgxpool.Pool
}

func NewMerchant(pool *pgxpool.Pool) *Merchant { return &Merchant{pool: pool} }

// Stats powers the seller dashboard header.
func (m *Merchant) Stats(ctx context.Context, sellerID int64) (models.MerchantStats, error) {
	var s models.MerchantStats
	err := m.pool.QueryRow(ctx, `
		SELECT COUNT(*),
		       COUNT(*) FILTER (WHERE is_active),
		       COALESCE(SUM(stock), 0)
		FROM offers WHERE seller_id = $1`, sellerID,
	).Scan(&s.Offers, &s.ActiveOffers, &s.KeysAvailable)
	if err != nil {
		return s, fmt.Errorf("merchant stats: %w", err)
	}

	err = m.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0)
		FROM inventory_keys k
		JOIN offers o ON o.id = k.offer_id
		WHERE o.seller_id = $1 AND k.status = 'sold'`, sellerID).Scan(&s.KeysSold)
	if err != nil {
		return s, err
	}

	err = m.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(oi.unit_price_cents * oi.quantity), 0),
		       COALESCE(SUM(oi.seller_payout_cents), 0)
		FROM order_items oi
		JOIN orders od ON od.id = oi.order_id
		WHERE oi.seller_id = $1 AND od.status = 'paid'`, sellerID,
	).Scan(&s.RevenueCents, &s.PayoutCents)
	return s, err
}

// Offers lists the seller's listings with live key counts.
func (m *Merchant) Offers(ctx context.Context, sellerID int64) ([]models.MerchantOffer, error) {
	rows, err := m.pool.Query(ctx, `
		SELECT o.id, o.product_id, p.slug, p.title, p.cover_url,
		       pl.slug, pl.name, r.code,
		       o.price_cents, o.base_price_cents, o.stock, o.is_active, o.updated_at,
		       COALESCE(k.available, 0), COALESCE(k.sold, 0)
		FROM offers o
		JOIN products p   ON p.id = o.product_id
		JOIN platforms pl ON pl.id = o.platform_id
		JOIN regions r    ON r.id = o.region_id
		LEFT JOIN LATERAL (
			SELECT COUNT(*) FILTER (WHERE status = 'available') AS available,
			       COUNT(*) FILTER (WHERE status = 'sold')      AS sold
			FROM inventory_keys ik WHERE ik.offer_id = o.id
		) k ON TRUE
		WHERE o.seller_id = $1
		ORDER BY o.is_active DESC, o.updated_at DESC`, sellerID)
	if err != nil {
		return nil, fmt.Errorf("list merchant offers: %w", err)
	}
	defer rows.Close()

	out := []models.MerchantOffer{}
	for rows.Next() {
		var o models.MerchantOffer
		if err := rows.Scan(&o.ID, &o.ProductID, &o.ProductSlug, &o.ProductTitle, &o.CoverURL,
			&o.PlatformSlug, &o.PlatformName, &o.RegionCode,
			&o.PriceCents, &o.BasePriceCents, &o.Stock, &o.IsActive, &o.UpdatedAt,
			&o.AvailableKeys, &o.SoldKeys); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// OfferInput is a create-or-update payload for a listing.
type OfferInput struct {
	ProductID      int64  `json:"productId"`
	PlatformSlug   string `json:"platformSlug"`
	RegionCode     string `json:"regionCode"`
	PriceCents     int    `json:"priceCents"`
	BasePriceCents *int   `json:"basePriceCents"`
	IsActive       *bool  `json:"isActive"`
}

var ErrInvalidReference = errors.New("unknown platform or region")

// UpsertOffer creates or updates the seller's listing. The UNIQUE constraint on
// (seller, product, platform, region) makes this a natural upsert: a seller can
// hold only one price per platform/region for a title.
func (m *Merchant) UpsertOffer(ctx context.Context, sellerID int64, in OfferInput) (int64, error) {
	active := true
	if in.IsActive != nil {
		active = *in.IsActive
	}

	var offerID int64
	err := m.pool.QueryRow(ctx, `
		INSERT INTO offers (product_id, seller_id, platform_id, region_id, price_cents,
		                    base_price_cents, is_active)
		SELECT p.id, $1, pl.id, r.id, $2, $3, $4
		FROM products p, platforms pl, regions r
		WHERE p.id = $5 AND p.is_active AND pl.slug = $6 AND r.code = $7
		ON CONFLICT (seller_id, product_id, platform_id, region_id)
		DO UPDATE SET price_cents = EXCLUDED.price_cents,
		              base_price_cents = EXCLUDED.base_price_cents,
		              is_active = EXCLUDED.is_active,
		              updated_at = now()
		RETURNING id`,
		sellerID, in.PriceCents, in.BasePriceCents, active,
		in.ProductID, in.PlatformSlug, in.RegionCode,
	).Scan(&offerID)

	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrInvalidReference
	}
	if err != nil {
		return 0, fmt.Errorf("upsert offer: %w", err)
	}
	return offerID, nil
}

// UploadKeys inserts codes into an offer's inventory, skipping duplicates, and
// keeps offers.stock in step with the number of available keys.
func (m *Merchant) UploadKeys(ctx context.Context, sellerID, offerID int64, codes []string) (int, error) {
	tx, err := m.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var owned bool
	if err := tx.QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM offers WHERE id = $1 AND seller_id = $2)`,
		offerID, sellerID).Scan(&owned); err != nil {
		return 0, err
	}
	if !owned {
		return 0, ErrNotFound
	}

	inserted := 0
	// One statement for the whole batch: a merchant pasting 500 keys would
	// otherwise mean 500 sequential round trips (~2 minutes against Neon).
	tag, err := tx.Exec(ctx, `
		INSERT INTO inventory_keys (offer_id, key_code)
		SELECT $1, code FROM unnest($2::text[]) AS t(code)
		ON CONFLICT (key_code) DO NOTHING`, offerID, codes)
	if err != nil {
		return 0, fmt.Errorf("insert keys: %w", err)
	}
	inserted = int(tag.RowsAffected())

	if inserted > 0 {
		if _, err := tx.Exec(ctx, `
			UPDATE offers SET stock = stock + $2, updated_at = now() WHERE id = $1`,
			offerID, inserted); err != nil {
			return 0, err
		}
	}
	return inserted, tx.Commit(ctx)
}

// Sales lists recent sold lines for the seller.
func (m *Merchant) Sales(ctx context.Context, sellerID int64, limit int) ([]models.MerchantSale, error) {
	if limit < 1 || limit > 200 {
		limit = 25
	}
	rows, err := m.pool.Query(ctx, `
		SELECT od.reference, oi.product_title, oi.quantity, oi.unit_price_cents,
		       oi.seller_payout_cents, COALESCE(od.paid_at, od.created_at)
		FROM order_items oi
		JOIN orders od ON od.id = oi.order_id
		WHERE oi.seller_id = $1
		ORDER BY od.created_at DESC
		LIMIT $2`, sellerID, limit)
	if err != nil {
		return nil, fmt.Errorf("list sales: %w", err)
	}
	defer rows.Close()

	out := []models.MerchantSale{}
	for rows.Next() {
		var s models.MerchantSale
		if err := rows.Scan(&s.OrderReference, &s.ProductTitle, &s.Quantity,
			&s.UnitPriceCents, &s.PayoutCents, &s.SoldAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// CreateRequest submits a new catalog title for admin approval.
func (m *Merchant) CreateRequest(ctx context.Context, merchantID int64, title, description, coverURL, platformSlug, regionCode string) (models.ProductRequest, error) {
	var id int64
	err := m.pool.QueryRow(ctx, `
		INSERT INTO product_requests (merchant_id, title, description, cover_url, platform_id, region_id)
		SELECT $1, $2, $3, $4, pl.id, r.id
		FROM platforms pl, regions r
		WHERE pl.slug = $5 AND r.code = $6
		RETURNING id`,
		merchantID, title, description, coverURL, platformSlug, regionCode,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.ProductRequest{}, ErrInvalidReference
	}
	if err != nil {
		return models.ProductRequest{}, fmt.Errorf("create product request: %w", err)
	}

	return m.RequestByID(ctx, id)
}

// RequestByID loads one request with its joined names.
func (m *Merchant) RequestByID(ctx context.Context, id int64) (models.ProductRequest, error) {
	var p models.ProductRequest
	err := m.pool.QueryRow(ctx, `
		SELECT pr.id, pr.merchant_id, u.display_name, pr.title,
		       pl.slug, r.code, pr.cover_url, pr.description, pr.status, pr.admin_note,
		       p.slug, pr.created_at, pr.reviewed_at
		FROM product_requests pr
		JOIN users u      ON u.id = pr.merchant_id
		JOIN platforms pl ON pl.id = pr.platform_id
		JOIN regions r    ON r.id = pr.region_id
		LEFT JOIN products p ON p.id = pr.product_id
		WHERE pr.id = $1`, id,
	).Scan(&p.ID, &p.MerchantID, &p.MerchantName, &p.Title, &p.PlatformSlug, &p.RegionCode,
		&p.CoverURL, &p.Description, &p.Status, &p.AdminNote, &p.ProductSlug, &p.CreatedAt, &p.ReviewedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

// Requests lists the merchant's catalog proposals.
func (m *Merchant) Requests(ctx context.Context, merchantID int64) ([]models.ProductRequest, error) {
	rows, err := m.pool.Query(ctx, `
		SELECT pr.id, pr.merchant_id, u.display_name, pr.title,
		       pl.slug, r.code, pr.cover_url, pr.description, pr.status, pr.admin_note,
		       p.slug, pr.created_at, pr.reviewed_at
		FROM product_requests pr
		JOIN users u      ON u.id = pr.merchant_id
		JOIN platforms pl ON pl.id = pr.platform_id
		JOIN regions r    ON r.id = pr.region_id
		LEFT JOIN products p ON p.id = pr.product_id
		WHERE pr.merchant_id = $1
		ORDER BY pr.created_at DESC`, merchantID)
	if err != nil {
		return nil, fmt.Errorf("list product requests: %w", err)
	}
	defer rows.Close()

	out := []models.ProductRequest{}
	for rows.Next() {
		var p models.ProductRequest
		if err := rows.Scan(&p.ID, &p.MerchantID, &p.MerchantName, &p.Title,
			&p.PlatformSlug, &p.RegionCode, &p.CoverURL, &p.Description, &p.Status,
			&p.AdminNote, &p.ProductSlug, &p.CreatedAt, &p.ReviewedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}
