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

// CatalogFilter is the fully-resolved store query. Empty strings, empty slices
// and nil pointers all mean "no filter", which keeps the SQL readable via
// @named params. Platform, region and genre are lists: an empty list matches
// everything, a non-empty one matches any of its values.
type CatalogFilter struct {
	Search        string
	Platforms     []string
	Regions       []string
	Genres        []string
	ContentTypes  []string
	MinPriceCents *int
	MaxPriceCents *int
	Sort          string
	Page          int
	PageSize      int
	// MarketRegion is the visitor's region (EU, US, …). When set, only offers
	// from that region or GLOBAL ones may price a card — and because the
	// aggregate takes MIN(), the cheaper of the two always wins. An empty value
	// means "no market preference" (admin and merchant views).
	MarketRegion string
	// IncludeUnlisted keeps products that have no live offers yet. The storefront
	// never wants those, but a merchant listing a freshly approved catalogue entry
	// does: that product exists before any offer points at it.
	IncludeUnlisted bool
}

// titleAcronymExpr builds a product title's initialism in SQL — "Grand Theft
// Auto V" becomes "gtav" — so a shopper typing "gta", "bg3" or "rdr2" finds the
// game. Trigram similarity cannot reach those: they share almost no characters
// with the full title. Comparing by prefix keeps it cheap and predictable.
const titleAcronymExpr = `(SELECT string_agg(left(w, 1), '' ORDER BY ord)
					FROM regexp_split_to_table(regexp_replace(lower(p.title), '''', '', 'g'), '[^a-z0-9]+')
					     WITH ORDINALITY AS t(w, ord)
					WHERE w <> '')`

// sortClauses is a whitelist: the client picks a key, never SQL. This avoids
// injection while still supporting the store's sort options.
var sortClauses = map[string]string{
	"relevance":  "score DESC, p.popularity DESC, p.title ASC",
	"popular":    "p.popularity DESC, p.title ASC",
	"price_asc":  "min_price ASC, p.title ASC",
	"price_desc": "min_price DESC, p.title ASC",
	"newest":     "p.release_date DESC NULLS LAST, p.title ASC",
	"discount":   "best_discount DESC, p.popularity DESC",
	"title":      "lower(p.title) ASC, p.title ASC",
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
		  AND (cardinality(@platforms::text[]) = 0 OR pl.slug = ANY(@platforms::text[]))
		  AND (cardinality(@regions::text[])   = 0 OR r.code  = ANY(@regions::text[]))
		  -- A visitor only buys keys they can activate: their own region or a
		  -- global one. Explicit region chips already narrow the list, so they
		  -- switch this preference off in the handler.
		  AND (@market_region = '' OR r.code = @market_region OR r.code = 'GLOBAL')
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
		if strings.TrimSpace(f.Search) != "" {
			order = "score DESC, p.popularity DESC, p.title ASC"
		} else {
			order = sortClauses["popular"]
		}
	}
	cheapPrice := strings.ReplaceAll("COALESCE((SELECT MIN(off3.price_cents) FROM offers off3 WHERE off3.product_id = p.id AND off3.is_active AND off3.stock > 0), 2147483647)", "%", "%%")
	if ok && f.Sort == "relevance" && strings.TrimSpace(f.Search) != "" {
		// Rank sums several boosts, so it is not the number shown to the shopper;
		// order by it here and keep `score` as the 0..1 display value.
		order = forSprintf(fuzzyRankExpr("@search")) + " DESC, length(p.title) ASC, p.popularity DESC, " + cheapPrice + " ASC, p.title ASC"
	}

	// The storefront only lists products that someone actually sells, so the
	// aggregate is an inner join by default; the merchant picker flips it to a
	// left join so an approved-but-unlisted product is selectable.
	join := "JOIN offer_agg a ON a.product_id = p.id"
	if f.IncludeUnlisted {
		join = "LEFT JOIN offer_agg a ON a.product_id = p.id"
	}

	fuzzyMatchSprintf := forSprintf(fuzzyMatchExpr("@search"))
	fuzzyScoreSprintf := forSprintf(fuzzyScoreExpr("@search"))
	titleAcronymSprintf := forSprintf(titleAcronymExpr)

	query := fmt.Sprintf(`
		WITH %s
		SELECT p.id, p.slug, p.title, p.cover_url, p.release_date, p.popularity,
		       COALESCE(a.min_price, 0), COALESCE(a.max_price, 0),
		       COALESCE(a.offer_count, 0), COALESCE(a.best_discount, 0),
		       COALESCE(a.platform_slugs, '{}'), COALESCE(a.region_codes, '{}'),
		       p.content_type,
		       COUNT(*) OVER() AS total,
		       CASE WHEN @search = '' THEN 0 ELSE `+fuzzyScoreSprintf+` END AS score
		FROM products p
		%s
		WHERE p.is_active
		  AND (@search = ''
		       OR p.title ILIKE '%%' || @search || '%%'
		       OR `+fuzzyMatchSprintf+`
		       OR `+titleAcronymSprintf+` LIKE lower(@search) || '%%')
		  AND (cardinality(@content_types::text[]) = 0 OR p.content_type = ANY(@content_types::text[]))
		  AND (cardinality(@genres::text[]) = 0 OR EXISTS (
		       SELECT 1 FROM product_genres pg
		       JOIN genres g ON g.id = pg.genre_id
		       WHERE pg.product_id = p.id AND g.slug = ANY(@genres::text[])))
		  AND (@min_price::int IS NULL OR a.min_price >= @min_price)
		  AND (@max_price::int IS NULL OR a.min_price <= @max_price)
		ORDER BY %s
		LIMIT @limit OFFSET @offset`, offerAggCTE, join, order)

	args := pgx.NamedArgs{
		"search":        strings.TrimSpace(f.Search),
		"platforms":     nonNil(f.Platforms),
		"regions":       nonNil(f.Regions),
		"genres":        nonNil(f.Genres),
		"content_types": nonNil(f.ContentTypes),
		"min_price":     f.MinPriceCents,
		"max_price":     f.MaxPriceCents,
		"limit":         pg.PageSize,
		"offset":        (pg.Page - 1) * pg.PageSize,
		"market_region": f.MarketRegion,
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
			&item.Platforms, &item.Regions, &item.ContentType, &total, &score,
		); err != nil {
			return pg, fmt.Errorf("scan product: %w", err)
		}
		pg.Total = total
		pg.Items = append(pg.Items, item)
	}
	return pg, rows.Err()
}

// nonNil turns a missing filter list into an empty one so the SQL guards see
// cardinality 0 instead of NULL.
func nonNil(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

// GetBySlug loads a product with its genres and every live offer.
func (c *Catalog) GetBySlug(ctx context.Context, slug string) (models.ProductDetail, error) {
	d := models.ProductDetail{Genres: []string{}, Offers: []models.Offer{}}

	err := c.pool.QueryRow(ctx, `
		SELECT p.id, p.slug, p.title, p.description, p.cover_url, p.hero_url,
		       p.developer, p.publisher, p.release_date, p.popularity, p.content_type
		FROM products p
		WHERE p.slug = @slug AND p.is_active`,
		pgx.NamedArgs{"slug": slug},
	).Scan(
		&d.ID, &d.Slug, &d.Title, &d.Description, &d.CoverURL, &d.HeroURL,
		&d.Developer, &d.Publisher, &d.ReleaseDate, &d.Popularity, &d.ContentType,
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
		SELECT o.id, o.price_cents, o.base_price_cents, o.stock, o.delivery,
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
		  AND (sp.is_active IS NULL OR sp.is_active)
		ORDER BY (o.stock > 0) DESC, o.price_cents ASC, sp.rating DESC NULLS LAST`,
		pgx.NamedArgs{"id": d.ID},
	)
	if err != nil {
		return d, fmt.Errorf("get offers: %w", err)
	}
	defer offerRows.Close()

	for offerRows.Next() {
		var o models.Offer
		if err := offerRows.Scan(
			&o.ID, &o.PriceCents, &o.BasePriceCents, &o.Stock, &o.Delivery,
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

// Search returns fuzzy suggestions for the search bar and the store filter.
// Scoring lives in search.go; this function only adds the offer/market gate and
// the ordering: relevance, then popularity, then the cheapest live offer.
//
// Short queries are handled before any SQL runs: empty or whitespace-only returns
// an empty list, and a single character searches the title prefix only, because a
// one-letter trigram matches the entire catalogue.
func (c *Catalog) Search(ctx context.Context, term, marketRegion string, limit int) ([]models.SearchSuggestion, error) {
	term = strings.Join(strings.Fields(term), " ")
	out := []models.SearchSuggestion{}
	if term == "" {
		return out, nil
	}
	if limit < 1 || limit > 20 {
		limit = 8
	}

	// One character: prefix only. There is no trigram in a single letter, and
	// ILIKE %x% would return everything.
	if len([]rune(term)) < 2 {
		rows, err := c.pool.Query(ctx, `
			SELECT p.id, p.slug, p.title, p.cover_url, 0.9::float8 AS score
			FROM products p
			WHERE p.is_active
			  AND lower(p.title) LIKE lower(@term) || '%'
			  AND EXISTS (
			        SELECT 1 FROM offers o
			        JOIN regions r ON r.id = o.region_id
			        WHERE o.product_id = p.id AND o.is_active AND o.stock > 0
			          AND (@market_region = '' OR r.code = @market_region OR r.code = 'GLOBAL'))
			ORDER BY p.popularity DESC, p.title ASC
			LIMIT @limit`,
			pgx.NamedArgs{"term": term, "limit": limit, "market_region": marketRegion},
		)
		if err != nil {
			return nil, fmt.Errorf("search prefix: %w", err)
		}
		defer rows.Close()
		for rows.Next() {
			var s models.SearchSuggestion
			if err := rows.Scan(&s.ID, &s.Slug, &s.Title, &s.CoverURL, &s.Score); err != nil {
				return nil, err
			}
			out = append(out, s)
		}
		return out, rows.Err()
	}

	rank := fuzzyRankExpr("@term")
	match := fuzzyMatchExpr("@term")
	score := fuzzyScoreExpr("@term")
	rows, err := c.pool.Query(ctx, `
		SELECT p.id, p.slug, p.title, p.cover_url, `+score+` AS score
		FROM products p
		WHERE p.is_active
		  AND EXISTS (
		        SELECT 1 FROM offers o
		        JOIN regions r ON r.id = o.region_id
		        WHERE o.product_id = p.id AND o.is_active AND o.stock > 0
		          AND (@market_region = '' OR r.code = @market_region OR r.code = 'GLOBAL'))
		  -- every token matched, or the whole query appears in the title verbatim
		  AND (`+match+`
		       OR p.title ILIKE '%' || @term || '%'
		       OR `+titleAcronymExpr+` LIKE lower(@term) || '%')
		ORDER BY `+rank+` DESC, length(p.title) ASC, p.popularity DESC,
		         COALESCE((SELECT MIN(off.price_cents) FROM offers off
		                   WHERE off.product_id = p.id AND off.is_active AND off.stock > 0), 2147483647) ASC,
		         p.title ASC
		LIMIT @limit`,
		pgx.NamedArgs{"term": term, "limit": limit, "market_region": marketRegion},
	)
	if err != nil {
		return nil, fmt.Errorf("search products: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var s models.SearchSuggestion
		if err := rows.Scan(&s.ID, &s.Slug, &s.Title, &s.CoverURL, &s.Score); err != nil {
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
	if err != nil {
		return m, err
	}

	if m.Tax, err = c.TaxInfo(ctx); err != nil {
		return m, err
	}
	return m, nil
}

// Related lists products that share genres with the given one, most shared tags
// first, then by popularity. Products without a shared tag are still eligible, so
// a title with unusual tags never leaves the section empty; they simply rank last.
func (c *Catalog) Related(ctx context.Context, slug, marketRegion string, limit int) ([]models.ProductCard, error) {
	if limit < 1 || limit > 12 {
		limit = 8
	}
	rows, err := c.pool.Query(ctx, `
		WITH `+offerAggCTE+`,
		mine AS (
			SELECT pg.genre_id
			FROM product_genres pg
			JOIN products p ON p.id = pg.product_id
			WHERE p.slug = @slug
		),
		shared AS (
			SELECT pg.product_id, COUNT(*)::int AS overlap
			FROM product_genres pg
			JOIN mine ON mine.genre_id = pg.genre_id
			GROUP BY pg.product_id
		)
		SELECT p.id, p.slug, p.title, p.cover_url, p.release_date, p.popularity,
		       a.min_price, a.max_price, a.offer_count, a.best_discount,
		       a.platform_slugs, a.region_codes, p.content_type
		FROM products p
		JOIN offer_agg a ON a.product_id = p.id
		LEFT JOIN shared s ON s.product_id = p.id
		WHERE p.is_active AND p.slug <> @slug
		ORDER BY COALESCE(s.overlap, 0) DESC, p.popularity DESC, p.title ASC
		LIMIT @limit`,
		pgx.NamedArgs{
			"slug":          slug,
			"limit":         limit,
			"platforms":     []string{},
			"regions":       []string{},
			"market_region": marketRegion,
		})
	if err != nil {
		return nil, fmt.Errorf("related products: %w", err)
	}
	defer rows.Close()

	out := []models.ProductCard{}
	for rows.Next() {
		var item models.ProductCard
		if err := rows.Scan(&item.ID, &item.Slug, &item.Title, &item.CoverURL, &item.ReleaseDate,
			&item.Popularity, &item.MinPriceCents, &item.MaxPriceCents, &item.OfferCount,
			&item.BestDiscountPercent, &item.Platforms, &item.Regions, &item.ContentType); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// CardsByIDs builds store cards for a hand-picked set of products, in the order
// the ids were given. The homepage editor uses it to preview a block before it is
// saved; products without a live offer are omitted, exactly as the homepage would.
func (c *Catalog) CardsByIDs(ctx context.Context, ids []int64) ([]models.ProductCard, error) {
	out := []models.ProductCard{}
	if len(ids) == 0 {
		return out, nil
	}
	rows, err := c.pool.Query(ctx, `
		WITH `+offerAggCTE+`
		SELECT p.id, p.slug, p.title, p.cover_url, p.release_date, p.popularity, p.content_type,
		       a.min_price, a.max_price, a.offer_count, a.best_discount,
		       a.platform_slugs, a.region_codes
		FROM products p
		JOIN offer_agg a ON a.product_id = p.id
		WHERE p.is_active AND p.id = ANY(@ids)
		ORDER BY array_position(@ids::bigint[], p.id)`,
		pgx.NamedArgs{"ids": ids, "platforms": []string{}, "regions": []string{}, "market_region": ""})
	if err != nil {
		return nil, fmt.Errorf("cards by ids: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var item models.ProductCard
		if err := rows.Scan(&item.ID, &item.Slug, &item.Title, &item.CoverURL, &item.ReleaseDate,
			&item.Popularity, &item.ContentType, &item.MinPriceCents, &item.MaxPriceCents,
			&item.OfferCount, &item.BestDiscountPercent, &item.Platforms, &item.Regions); err != nil {
			return nil, err
		}
		out = append(out, item)
	}
	return out, rows.Err()
}

// TaxInfo is the public view of the admin's tax settings: enough for the
// storefront to say "tax is added at checkout" without quoting amounts early.
func (c *Catalog) TaxInfo(ctx context.Context) (models.MetaTax, error) {
	var t models.MetaTax
	err := c.pool.QueryRow(ctx, `
		SELECT apply_on_purchase, purchase_tax_bp, apply_on_topup, topup_tax_bp
		FROM tax_settings WHERE id`).Scan(&t.ApplyOnPurchase, &t.PurchaseTaxBasisPoints,
		&t.ApplyOnTopup, &t.TopupTaxBasisPoints)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.MetaTax{}, nil
	}
	if err != nil {
		return t, fmt.Errorf("read tax info: %w", err)
	}
	return t, nil
}

// CoverURL returns one product's artwork URL, for the image proxy.
func (c *Catalog) CoverURL(ctx context.Context, productID int64) (string, error) {
	var url string
	err := c.pool.QueryRow(ctx,
		`SELECT cover_url FROM products WHERE id = $1 AND is_active`, productID).Scan(&url)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", fmt.Errorf("load cover url: %w", err)
	}
	return url, nil
}
