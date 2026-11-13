package repo

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// Homepage assembles marketing blocks. The frontend renders whatever types it
// receives, in the order it receives them — nothing about the landing page is
// hardcoded in React.
type Homepage struct {
	pool *pgxpool.Pool
}

func NewHomepage(pool *pgxpool.Pool) *Homepage { return &Homepage{pool: pool} }

// Blocks returns every visible block, each with its curated product list.
func (h *Homepage) Blocks(ctx context.Context) ([]models.HomepageBlock, error) {
	rows, err := h.pool.Query(ctx, `
		SELECT id, block_key, type, title, subtitle, config, position
		FROM homepage_blocks
		WHERE is_visible
		ORDER BY position ASC, id ASC`)
	if err != nil {
		return nil, fmt.Errorf("list homepage blocks: %w", err)
	}
	defer rows.Close()

	var blocks []models.HomepageBlock
	ids := make([]int64, 0, 8)
	byID := make(map[int64]int, 8)

	for rows.Next() {
		var b models.HomepageBlock
		var raw []byte
		var position int
		if err := rows.Scan(&b.ID, &b.Key, &b.Type, &b.Title, &b.Subtitle, &raw, &position); err != nil {
			return nil, fmt.Errorf("scan block: %w", err)
		}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &b.Config); err != nil {
				return nil, fmt.Errorf("decode block config: %w", err)
			}
		}
		if b.Config == nil {
			b.Config = map[string]any{}
		}
		b.Products = []models.ProductCard{}
		byID[b.ID] = len(blocks)
		ids = append(ids, b.ID)
		blocks = append(blocks, b)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(blocks) == 0 {
		return []models.HomepageBlock{}, nil
	}

	// One query for all blocks' products, stitched in memory afterwards.
	prodRows, err := h.pool.Query(ctx, `
		SELECT bp.block_id, p.id, p.slug, p.title, p.cover_url, p.release_date, p.popularity,
		       MIN(o.price_cents)::int AS min_price,
		       MAX(o.price_cents)::int AS max_price,
		       COUNT(o.id)::int        AS offer_count,
		       COALESCE(MAX(
		           CASE WHEN o.base_price_cents IS NOT NULL AND o.base_price_cents > o.price_cents
		                THEN ROUND((1 - o.price_cents::numeric / o.base_price_cents) * 100)
		                ELSE 0 END), 0)::int AS best_discount,
		       ARRAY_AGG(DISTINCT pl.slug ORDER BY pl.slug) AS platform_slugs,
		       ARRAY_AGG(DISTINCT r.code ORDER BY r.code)   AS region_codes
		FROM homepage_block_products bp
		JOIN products p    ON p.id = bp.product_id AND p.is_active
		JOIN offers o      ON o.product_id = p.id AND o.is_active AND o.stock > 0
		JOIN platforms pl  ON pl.id = o.platform_id
		JOIN regions r     ON r.id = o.region_id
		WHERE bp.block_id = ANY(@ids)
		GROUP BY bp.block_id, bp.position, p.id, p.slug, p.title, p.cover_url, p.release_date, p.popularity
		ORDER BY bp.block_id ASC, bp.position ASC, min_price ASC`,
		pgx.NamedArgs{"ids": ids},
	)
	if err != nil {
		return nil, fmt.Errorf("list block products: %w", err)
	}
	defer prodRows.Close()

	for prodRows.Next() {
		var blockID int64
		var card models.ProductCard
		if err := prodRows.Scan(
			&blockID, &card.ID, &card.Slug, &card.Title, &card.CoverURL,
			&card.ReleaseDate, &card.Popularity,
			&card.MinPriceCents, &card.MaxPriceCents, &card.OfferCount, &card.BestDiscountPercent,
			&card.Platforms, &card.Regions,
		); err != nil {
			return nil, fmt.Errorf("scan block product: %w", err)
		}
		idx, ok := byID[blockID]
		if !ok {
			continue
		}
		blocks[idx].Products = append(blocks[idx].Products, card)
	}
	return blocks, prodRows.Err()
}
