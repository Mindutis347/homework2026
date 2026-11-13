package repo

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// ErrNotFound is returned when a lookup matches zero rows.
var ErrNotFound = errors.New("not found")

// Catalog reads the product catalog. Every list query aggregates live offers,
// because price and availability belong to offers, not to the game title.
type Catalog struct {
	pool *pgxpool.Pool
}

func NewCatalog(pool *pgxpool.Pool) *Catalog { return &Catalog{pool: pool} }

// CatalogFilter is the fully-resolved store query. Empty strings and nil
// pointers mean "no filter", which keeps the SQL readable via @named params.
type CatalogFilter struct {
	Search        string
	Platform      string
	Region        string
	Genre         string
	MinPriceCents *int
	MaxPriceCents *int
	Sort          string
	Page          int
	PageSize      int
}

// sortClauses is a whitelist: the client picks a key, never SQL. This avoids
// injection while still supporting the store's sort options.
var sortClauses = map[string]string{
	"relevance":  "score DESC, p.popularity DESC, p.title ASC",
	"popular":    "p.popularity DESC, p.title ASC",
	"price_asc":  "min_price ASC, p.title ASC",
	"price_desc": "min_price DESC, p.title ASC",
	"newest":     "p.release_date DESC NULLS LAST, p.title ASC",
	"discount":   "best_discount DESC, p.popularity DESC",
	"title":      "p.title ASC",
}

const offerAggCTE = `
	offer_agg AS (
		SELECT o.product_id,
		       MIN(o.price_cents) AS min_price,
		       MAX(o.price_cents) AS max_price,
		       COUNT(*)::int      AS offer_count,
		       COALESCE(MAX(
		           CASE WHEN o.base_price_cents IS NOT NULL AND o.base_price_cents > o.price_cents
		                THEN ROUND((1 - o.price_cents::numeric / o.base_price_cents) * 100)
		                ELSE 0 END), 0)::int AS best_discount,
		       ARRAY_AGG(DISTINCT pl.slug ORDER BY pl.slug) AS platform_slugs,
		       ARRAY_AGG(DISTINCT r.code ORDER BY r.code)   AS region_codes
		FROM offers o
		JOIN platforms pl ON pl.id = o.platform_id
		JOIN regions   r  ON r.id  = o.region_id
		WHERE o.is_active
		  AND o.stock > 0
		  -- Platform/region filters narrow which offers contribute to the
		  -- displayed price, so a "PlayStation" filter never shows a Steam price.
		  AND (@platform = '' OR pl.slug = @platform)
		  AND (@region   = '' OR r.code  = @region)
		GROUP BY o.product_id
	)`

// List returns one page of products plus the total match count.
func (c *Catalog) List(ctx context.Context, f CatalogFilter) (models.Paged[models.ProductCard], error) {
	pg := models.Paged[models.ProductCard]{Items: []models.ProductCard{}, Page: f.Page, PageSize: f.PageSize}
	if pg.Page < 1 {
		pg.Page = 1
	}
	if pg.PageSize < 1 || pg.PageSize > 60 {
		pg.PageSize = 24
	}

	order, ok := sortClauses[f.Sort]
	if !ok {
		order = sortClauses["popular"]
	}

	query := fmt.Sprintf(`
		WITH %s
		SELECT p.id, p.slug, p.title, p.cover_url, p.release_date, p.popularity,
		       a.min_price, a.max_price, a.offer_count, a.best_discount,
		       a.platform_slugs, a.region_codes,
		       COUNT(*) OVER() AS total,
		       CASE WHEN @search = '' THEN 0 ELSE similarity(p.title, @search) END AS score
		FROM products p
		JOIN offer_agg a ON a.product_id = p.id
		WHERE p.is_active
		  AND (@search = ''
		       OR p.title ILIKE '%%' || @search || '%%'
		       OR similarity(p.title, @search) > 0.25
		       OR word_similarity(@search, p.title) > 0.6)
		  AND (@genre = '' OR EXISTS (
		       SELECT 1 FROM product_genres pg
		       JOIN genres g ON g.id = pg.genre_id
		       WHERE pg.product_id = p.id AND g.slug = @genre))
		  AND (@min_price::int IS NULL OR a.min_price >= @min_price)
		  AND (@max_price::int IS NULL OR a.min_price <= @max_price)
		ORDER BY %s
		LIMIT @limit OFFSET @offset`, offerAggCTE, order)

	args := pgx.NamedArgs{
		"search":    strings.TrimSpace(f.Search),
		"platform":  f.Platform,
		"region":    f.Region,
		"genre":     f.Genre,
		"min_price": f.MinPriceCents,
		"max_price": f.MaxPriceCents,
		"limit":     pg.PageSize,
		"offset":    (pg.Page - 1) * pg.PageSize,
	}

	rows, err := c.pool.Query(ctx, query, args)
	if err != nil {
		return pg, fmt.Errorf("list products: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var item models.ProductCard
		var total int
		var score float64
		if err := rows.Scan(
			&item.ID, &item.Slug, &item.Title, &item.CoverURL, &item.ReleaseDate, &item.Popularity,
			&item.MinPriceCents, &item.MaxPriceCents, &item.OfferCount, &item.BestDiscountPercent,
			&item.Platforms, &item.Regions, &total, &score,
		); err != nil {
			return pg, fmt.Errorf("scan product: %w", err)
		}
		pg.Total = total
		pg.Items = append(pg.Items, item)
	}
	return pg, rows.Err()
}

// GetBySlug loads a product with its genres and every live offer.
func (c *Catalog) GetBySlug(ctx context.Context, slug string) (models.ProductDetail, error) {
	d := models.ProductDetail{Genres: []string{}, Offers: []models.Offer{}}

	err := c.pool.QueryRow(ctx, `
		SELECT p.id, p.slug, p.title, p.description, p.cover_url, p.hero_url,
		       p.developer, p.publisher, p.release_date, p.popularity
		FROM products p
		WHERE p.slug = @slug AND p.is_active`,
		pgx.NamedArgs{"slug": slug},
	).Scan(
		&d.ID, &d.Slug, &d.Title, &d.Description, &d.CoverURL, &d.HeroURL,
		&d.Developer, &d.Publisher, &d.ReleaseDate, &d.Popularity,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNotFound
	}
	if err != nil {
		return d, fmt.Errorf("get product: %w", err)
	}

	rows, err := c.pool.Query(ctx, `
		SELECT g.slug
		FROM product_genres pg
		JOIN genres g ON g.id = pg.genre_id
		WHERE pg.product_id = @id
		ORDER BY g.name`,
		pgx.NamedArgs{"id": d.ID},
	)
	if err != nil {
		return d, fmt.Errorf("get genres: %w", err)
	}
	for rows.Next() {
		var g string
		if err := rows.Scan(&g); err != nil {
			rows.Close()
			return d, err
		}
		d.Genres = append(d.Genres, g)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return d, err
	}

	offerRows, err := c.pool.Query(ctx, `
		SELECT o.id, o.price_cents, o.stock, o.delivery,
		       u.id, COALESCE(NULLIF(sp.store_name, ''), u.display_name),
		       COALESCE(sp.rating, 5.0)::float8, COALESCE(sp.rating_count, 0), COALESCE(sp.sales_count, 0),
		       pl.slug, pl.name, r.code, r.name
		FROM offers o
		JOIN users u            ON u.id = o.seller_id
		LEFT JOIN seller_profiles sp ON sp.user_id = u.id
		JOIN platforms pl       ON pl.id = o.platform_id
		JOIN regions r          ON r.id = o.region_id
		WHERE o.product_id = @id
		  AND o.is_active
		  AND o.stock > 0
		  AND (sp.is_active IS NULL OR sp.is_active)
		ORDER BY o.price_cents ASC, sp.rating DESC NULLS LAST`,
		pgx.NamedArgs{"id": d.ID},
	)
	if err != nil {
		return d, fmt.Errorf("get offers: %w", err)
	}
	defer offerRows.Close()

	for offerRows.Next() {
		var o models.Offer
		if err := offerRows.Scan(
			&o.ID, &o.PriceCents, &o.Stock, &o.Delivery,
			&o.Seller.ID, &o.Seller.StoreName, &o.Seller.Rating, &o.Seller.RatingCount, &o.Seller.SalesCount,
			&o.PlatformSlug, &o.PlatformName, &o.RegionCode, &o.RegionName,
		); err != nil {
			return d, fmt.Errorf("scan offer: %w", err)
		}
		d.Offers = append(d.Offers, o)
	}
	if err := offerRows.Err(); err != nil {
		return d, err
	}

	// Card-level aggregates are derived from the offers we just loaded, so the
	// product page and the catalog can never disagree on price.
	if len(d.Offers) > 0 {
		d.MinPriceCents = d.Offers[0].PriceCents
		d.MaxPriceCents = d.Offers[len(d.Offers)-1].PriceCents
		d.OfferCount = len(d.Offers)
		seenP := map[string]bool{}
		seenR := map[string]bool{}
		for _, o := range d.Offers {
			if !seenP[o.PlatformSlug] {
				seenP[o.PlatformSlug] = true
				d.Platforms = append(d.Platforms, o.PlatformSlug)
			}
			if !seenR[o.RegionCode] {
				seenR[o.RegionCode] = true
				d.Regions = append(d.Regions, o.RegionCode)
			}
		}
	}

	return d, nil
}

// Search returns fuzzy title suggestions for the global search dropdown.
// Trigram similarity tolerates typos ("eleden ring"), ILIKE covers partial
// words ("cyberpunk"), and popularity breaks ties so famous games surface first.
func (c *Catalog) Search(ctx context.Context, term string, limit int) ([]models.SearchSuggestion, error) {
	term = strings.TrimSpace(term)
	out := []models.SearchSuggestion{}
	if len([]rune(term)) < 2 {
		return out, nil
	}
	if limit < 1 || limit > 20 {
		limit = 8
	}

	rows, err := c.pool.Query(ctx, `
		SELECT p.slug, p.title, p.cover_url,
		       GREATEST(similarity(p.title, @term), word_similarity(@term, p.title)) AS score
		FROM products p
		WHERE p.is_active
		  AND EXISTS (SELECT 1 FROM offers o WHERE o.product_id = p.id AND o.is_active AND o.stock > 0)
		  AND (p.title ILIKE '%' || @term || '%'
		       OR similarity(p.title, @term) > 0.2
		       OR word_similarity(@term, p.title) > 0.5)
		ORDER BY score DESC, p.popularity DESC, p.title ASC
		LIMIT @limit`,
		pgx.NamedArgs{"term": term, "limit": limit},
	)
	if err != nil {
		return nil, fmt.Errorf("search products: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var s models.SearchSuggestion
		if err := rows.Scan(&s.Slug, &s.Title, &s.CoverURL, &s.Score); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Meta returns the filter vocabulary straight from the reference tables.
func (c *Catalog) Meta(ctx context.Context) (models.Meta, error) {
	var m models.Meta

	rows, err := c.pool.Query(ctx, `SELECT id, slug, name FROM platforms ORDER BY sort_order, name`)
	if err != nil {
		return m, err
	}
	if m.Platforms, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (models.Platform, error) {
		var p models.Platform
		err := row.Scan(&p.ID, &p.Slug, &p.Name)
		return p, err
	}); err != nil {
		return m, err
	}

	rows, err = c.pool.Query(ctx, `SELECT id, code, name FROM regions ORDER BY sort_order, name`)
	if err != nil {
		return m, err
	}
	if m.Regions, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (models.Region, error) {
		var r models.Region
		err := row.Scan(&r.ID, &r.Code, &r.Name)
		return r, err
	}); err != nil {
		return m, err
	}

	rows, err = c.pool.Query(ctx, `SELECT id, slug, name FROM genres ORDER BY name`)
	if err != nil {
		return m, err
	}
	if m.Genres, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (models.Genre, error) {
		var g models.Genre
		err := row.Scan(&g.ID, &g.Slug, &g.Name)
		return g, err
	}); err != nil {
		return m, err
	}

	err = c.pool.QueryRow(ctx, `
		SELECT COALESCE(MIN(price_cents), 0), COALESCE(MAX(price_cents), 0)
		FROM offers WHERE is_active AND stock > 0`).Scan(&m.PriceRange.MinCents, &m.PriceRange.MaxCents)
	return m, err
}
