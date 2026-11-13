package db

import (
	"context"
	"crypto/sha256"
	"encoding/base32"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/auth"
	"github.com/mindutis347/keyforge/backend/seed"
)

// Demo credentials, logged at boot so the evaluator never has to guess.
const (
	AdminEmail     = "admin@keyforge.dev"
	AdminPassword  = "Admin#2026"
	CustomerEmail  = "demo@keyforge.dev"
	CustomerPass   = "Demo#2026"
	MerchantPass   = "Seller#2026"
	demoMerchantAt = "seller%d@keyforge.dev"
)

var seedPlatforms = []struct {
	Slug, Name string
	Sort       int16
}{
	{"steam", "Steam", 1},
	{"playstation", "PlayStation", 2},
	{"xbox", "Xbox", 3},
	{"nintendo", "Nintendo", 4},
	{"epic", "Epic Games", 5},
	{"gog", "GOG.com", 6},
}

var seedRegions = []struct {
	Code, Name string
	Sort       int16
}{
	{"GLOBAL", "Global", 1},
	{"EU", "Europe", 2},
	{"US", "United States", 3},
	{"UK", "United Kingdom", 4},
	{"TR", "Turkey", 5},
	{"BR", "Brazil", 6},
}

var seedGenres = []struct{ Slug, Name string }{
	{"action", "Action"},
	{"action-rpg", "Action RPG"},
	{"adventure", "Adventure"},
	{"fighting", "Fighting"},
	{"horror", "Horror"},
	{"indie", "Indie"},
	{"mmo", "MMO"},
	{"multiplayer", "Multiplayer"},
	{"open-world", "Open World"},
	{"platformer", "Platformer"},
	{"puzzle", "Puzzle"},
	{"racing", "Racing"},
	{"rpg", "RPG"},
	{"shooter", "Shooter"},
	{"simulation", "Simulation"},
	{"sports", "Sports"},
	{"strategy", "Strategy"},
	{"survival", "Survival"},
}

type demoMerchant struct {
	Store       string
	Bio         string
	Rating      float64
	RatingCount int
	SalesCount  int
}

var seedMerchants = []demoMerchant{
	{"PixelVault", "Instant delivery on thousands of PC and console titles.", 4.9, 18420, 41200},
	{"KeyNebula", "Gaming keys since 2016. 24/7 support, no questions asked.", 4.7, 9310, 20870},
	{"GameHarbor", "Curated indie and AAA catalogue, region-free where possible.", 4.8, 6205, 15440},
	{"NovaKeys", "Fast, automated fulfilment with pre-verified codes.", 4.6, 3388, 9902},
	{"Tradewind Games", "Boutique store focused on strategy and simulation.", 4.5, 1904, 5310},
	{"ByteBazaar", "Big names, small prices. Every code checked before shipping.", 4.4, 2711, 8460},
}

// platform price multipliers: console storefronts and Nintendo rarely undercut.
var platformPriceFactor = map[string]float64{
	"steam":       1.00,
	"playstation": 1.06,
	"xbox":        1.03,
	"nintendo":    1.12,
	"epic":        1.00,
	"gog":         0.94,
}

var regionPriceFactor = map[string]float64{
	"GLOBAL": 1.00,
	"EU":     1.02,
	"US":     1.00,
	"UK":     1.05,
	"TR":     0.72,
	"BR":     0.80,
}

// Seed populates an empty database. It is a no-op when products already exist,
// which keeps boot-time seeding idempotent across restarts and deploys.
func Seed(ctx context.Context, pool *pgxpool.Pool, games []seed.Game, secret []byte) error {
	var existing int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM products`).Scan(&existing); err != nil {
		return fmt.Errorf("count products: %w", err)
	}
	if existing > 0 {
		return nil
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	platformIDs, err := insertLookup(ctx, tx, "platforms", "slug", "name",
		func(i int) (string, string) { return seedPlatforms[i].Slug, seedPlatforms[i].Name }, len(seedPlatforms), func(i int) int16 { return seedPlatforms[i].Sort })
	if err != nil {
		return err
	}
	regionIDs, err := insertLookup(ctx, tx, "regions", "code", "name",
		func(i int) (string, string) { return seedRegions[i].Code, seedRegions[i].Name }, len(seedRegions), func(i int) int16 { return seedRegions[i].Sort })
	if err != nil {
		return err
	}
	genreIDs, err := insertLookup(ctx, tx, "genres", "slug", "name",
		func(i int) (string, string) { return seedGenres[i].Slug, seedGenres[i].Name }, len(seedGenres), nil)
	if err != nil {
		return err
	}

	// --- accounts ----------------------------------------------------------
	adminID, err := insertUser(ctx, tx, AdminEmail, AdminPassword, "Keyforge Admin", "admin", true)
	if err != nil {
		return err
	}
	if _, err := insertUser(ctx, tx, CustomerEmail, CustomerPass, "Demo Buyer", "customer", true); err != nil {
		return err
	}

	merchantIDs := make([]int64, len(seedMerchants))
	for i, m := range seedMerchants {
		id, err := insertUser(ctx, tx, fmt.Sprintf(demoMerchantAt, i+1), MerchantPass, m.Store, "merchant", true)
		if err != nil {
			return err
		}
		merchantIDs[i] = id
		if _, err := tx.Exec(ctx, `
			INSERT INTO seller_profiles (user_id, store_name, bio, rating, rating_count, sales_count)
			VALUES ($1, $2, $3, $4, $5, $6)`,
			id, m.Store, m.Bio, m.Rating, m.RatingCount, m.SalesCount); err != nil {
			return fmt.Errorf("insert seller profile %s: %w", m.Store, err)
		}
	}

	// --- catalog -----------------------------------------------------------
	productIDs := make(map[string]int64, len(games))
	genreLinks := make([][2]int64, 0, len(games)*2)

	for _, g := range games {
		var releaseDate *string
		if g.ReleaseDate != "" {
			r := g.ReleaseDate
			releaseDate = &r
		}
		var id int64
		err := tx.QueryRow(ctx, `
			INSERT INTO products (slug, title, description, cover_url, hero_url, developer,
			                      publisher, release_date, popularity)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9)
			RETURNING id`,
			g.Slug, g.Title, g.Description, g.CoverURL, g.HeroURL,
			g.Developer, g.Publisher, releaseDate, g.Popularity,
		).Scan(&id)
		if err != nil {
			return fmt.Errorf("insert product %s: %w", g.Slug, err)
		}
		productIDs[g.Slug] = id

		for _, gs := range g.Genres {
			if gid, ok := genreIDs[gs]; ok {
				genreLinks = append(genreLinks, [2]int64{id, int64(gid)})
			}
		}
	}

	for _, link := range genreLinks {
		if _, err := tx.Exec(ctx,
			`INSERT INTO product_genres (product_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			link[0], link[1]); err != nil {
			return fmt.Errorf("link genre: %w", err)
		}
	}

	// --- offers & inventory ------------------------------------------------
	type offerKey struct {
		sellerID   int64
		productID  int64
		platformID int16
		regionID   int16
	}
	keys := make([][]any, 0, len(games)*40)

	for i, g := range games {
		pid := productIDs[g.Slug]

		// Two platforms per title keeps the comparison meaningful without
		// exploding the fixture (2 platforms x 2 regions x 2 sellers = 8 offers).
		platforms := g.Platforms
		if len(platforms) > 2 {
			platforms = platforms[:2]
		}
		if len(platforms) == 0 {
			platforms = []string{"steam"}
		}
		// GLOBAL is always offered (region-free keys), plus one regional listing.
		regions := []string{"GLOBAL", seedRegions[1+i%5].Code}

		for pi, pSlug := range platforms {
			platformID, ok := platformIDs[pSlug]
			if !ok {
				continue
			}
			for ri, rCode := range regions {
				regionID, ok := regionIDs[rCode]
				if !ok {
					continue
				}
				for si := 0; si < 2; si++ {
					_ = offerKey{}
					merchantIdx := (i + pi + ri*2 + si*3) % len(seedMerchants)
					price := float64(g.BasePriceCents) *
						platformPriceFactor[pSlug] * regionPriceFactor[rCode]
					// Deterministic seller under/over-cut, ±6%.
					jitter := 1 + (float64(merchantIdx)-2.5)/45
					price *= jitter

					var basePrice *int
					// Roughly a third of listings are discounted; the base price
					// gives the UI a strike-through to render.
					if (i+pi+ri+si)%3 == 0 {
						b := cents(price)
						price *= 0.75
						basePrice = &b
					}
					priceCents := cents(price)
					if basePrice != nil && *basePrice <= priceCents {
						basePrice = nil
					}

					stock := 3 + (i+merchantIdx)%4
					var offerID int64
					err := tx.QueryRow(ctx, `
						INSERT INTO offers (product_id, seller_id, platform_id, region_id,
						                    price_cents, base_price_cents, stock)
						VALUES ($1, $2, $3, $4, $5, $6, $7)
						RETURNING id`,
						pid, merchantIDs[merchantIdx], platformID, regionID,
						priceCents, basePrice, stock,
					).Scan(&offerID)
					if err != nil {
						return fmt.Errorf("insert offer %s/%s/%s: %w", g.Slug, pSlug, rCode, err)
					}

					for k := 0; k < stock; k++ {
						keys = append(keys, []any{
							offerID,
							keyCode(g.Slug, pSlug, rCode, merchantIdx, k),
							"available",
						})
					}
				}
			}
		}
	}

	if _, err := tx.CopyFrom(ctx,
		pgx.Identifier{"inventory_keys"},
		[]string{"offer_id", "key_code", "status"},
		pgx.CopyFromRows(keys),
	); err != nil {
		return fmt.Errorf("bulk insert inventory keys: %w", err)
	}

	// --- homepage blocks ---------------------------------------------------
	if err := seedHomepage(ctx, tx, productIDs); err != nil {
		return err
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}

	slog.Info("database seeded",
		"products", len(games), "keys", len(keys),
		"admin", AdminEmail, "customer", CustomerEmail)
	_ = adminID
	return nil
}

// insertLookup bulk-inserts a reference table and returns slug/code -> id.
func insertLookup(
	ctx context.Context, tx pgx.Tx, table, keyCol, nameCol string,
	pair func(int) (string, string), n int, sortFn func(int) int16,
) (map[string]int16, error) {
	out := make(map[string]int16, n)
	for i := 0; i < n; i++ {
		key, name := pair(i)
		var id int16
		var err error
		if sortFn != nil {
			sql := fmt.Sprintf(`INSERT INTO %s (%s, %s, sort_order) VALUES ($1, $2, $3) RETURNING id`, table, keyCol, nameCol)
			err = tx.QueryRow(ctx, sql, key, name, sortFn(i)).Scan(&id)
		} else {
			sql := fmt.Sprintf(`INSERT INTO %s (%s, %s) VALUES ($1, $2) RETURNING id`, table, keyCol, nameCol)
			err = tx.QueryRow(ctx, sql, key, name).Scan(&id)
		}
		if err != nil {
			return nil, fmt.Errorf("insert %s %q: %w", table, key, err)
		}
		out[key] = id
	}
	return out, nil
}

func insertUser(ctx context.Context, tx pgx.Tx, email, password, name, role string, verified bool) (int64, error) {
	hash, err := auth.HashPassword(password)
	if err != nil {
		return 0, err
	}
	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name, role, is_verified)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id`, email, hash, name, role, verified).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("insert user %s: %w", email, err)
	}
	return id, nil
}

// seedHomepage creates the marketing blocks. Product membership is chosen by
// SQL over real offer data, so a block can never reference a product that is
// unavailable or unpriced.
func seedHomepage(ctx context.Context, tx pgx.Tx, productIDs map[string]int64) error {
	type block struct {
		key, typ, title, subtitle string
		config                    map[string]any
		position                  int
		products                  []int64
	}

	pick := func(query string, args ...any) ([]int64, error) {
		rows, err := tx.Query(ctx, query, args...)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		var ids []int64
		for rows.Next() {
			var id int64
			if err := rows.Scan(&id); err != nil {
				return nil, err
			}
			ids = append(ids, id)
		}
		return ids, rows.Err()
	}

	// Shared shape: products joined to their live offers, aggregated per title.
	const base = `
		SELECT p.id
		FROM products p
		JOIN offers o ON o.product_id = p.id AND o.is_active AND o.stock > 0
		WHERE p.is_active
		GROUP BY p.id`

	bestSellers, err := pick(base + ` ORDER BY p.popularity DESC, MIN(o.price_cents) ASC LIMIT 10`)
	if err != nil {
		return err
	}
	flashDeals, err := pick(base + `
		HAVING MAX(CASE WHEN o.base_price_cents IS NOT NULL AND o.base_price_cents > o.price_cents
		           THEN 1 - o.price_cents::numeric / o.base_price_cents ELSE 0 END) > 0.15
		ORDER BY MAX(CASE WHEN o.base_price_cents IS NOT NULL AND o.base_price_cents > o.price_cents
		           THEN 1 - o.price_cents::numeric / o.base_price_cents ELSE 0 END) DESC
		LIMIT 10`)
	if err != nil {
		return err
	}
	newReleases, err := pick(base + ` ORDER BY p.release_date DESC NULLS LAST LIMIT 10`)
	if err != nil {
		return err
	}
	budget, err := pick(base + ` HAVING MIN(o.price_cents) < 1500 ORDER BY p.popularity DESC LIMIT 10`)
	if err != nil {
		return err
	}

	heroSlug := "elden-ring"
	heroProduct, ok := productIDs[heroSlug]
	if !ok {
		for _, id := range bestSellers {
			heroProduct = id
			break
		}
	}
	if len(bestSellers) > 0 && !ok {
		heroSlug = ""
	}

	tiles := make([]map[string]any, 0, len(seedPlatforms))
	for _, p := range seedPlatforms {
		var count int
		err := tx.QueryRow(ctx, `
			SELECT count(DISTINCT o.product_id)
			FROM offers o JOIN platforms pl ON pl.id = o.platform_id
			WHERE pl.slug = $1 AND o.is_active AND o.stock > 0`, p.Slug).Scan(&count)
		if err != nil {
			return err
		}
		tiles = append(tiles, map[string]any{
			"label":        p.Name,
			"href":         "/store?platform=" + p.Slug,
			"platformSlug": p.Slug,
			"count":        count,
		})
	}

	blocks := []block{
		{
			key: "hero", typ: "hero", position: 1,
			title:    "Level up for less",
			subtitle: "Instant digital keys from verified sellers — delivered the second you pay.",
			config: map[string]any{
				"headline":          "Level up for less",
				"subheadline":       "Instant digital keys from verified sellers, delivered the second you pay.",
				"badge":             "Autumn sale — up to 70% off",
				"ctaLabel":          "Shop the sale",
				"ctaHref":           "/store?sort=discount",
				"secondaryCtaLabel": "Browse all games",
				"secondaryCtaHref":  "/store",
				"accent":            "#FAD318",
			},
			products: []int64{heroProduct},
		},
		{
			key: "best_sellers", typ: "product_carousel", position: 2,
			title: "Best sellers", subtitle: "What everyone is playing this week",
			config:   map[string]any{"href": "/store?sort=popular", "layout": "grid"},
			products: bestSellers,
		},
		{
			key: "flash_deals", typ: "product_carousel", position: 3,
			title: "Flash deals", subtitle: "Deep discounts, limited stock",
			config:   map[string]any{"href": "/store?sort=discount", "layout": "grid", "tone": "accent"},
			products: flashDeals,
		},
		{
			key: "platform_tiles", typ: "category_tiles", position: 4,
			title: "Browse by platform", subtitle: "",
			config: map[string]any{"tiles": tiles},
		},
		{
			key: "new_releases", typ: "product_carousel", position: 5,
			title: "New releases", subtitle: "Fresh keys on the shelf",
			config:   map[string]any{"href": "/store?sort=newest", "layout": "grid"},
			products: newReleases,
		},
		{
			key: "trust_banner", typ: "banner", position: 6,
			title: "Why buy on Keyforge", subtitle: "",
			config: map[string]any{"items": []map[string]any{
				{"title": "Instant delivery", "text": "Keys appear in your library the moment payment clears."},
				{"title": "Verified sellers", "text": "Every merchant is reviewed before they can list."},
				{"title": "Buyer protection", "text": "Broken key? Open a ticket and we refund it."},
			}},
		},
		{
			key: "under_15", typ: "product_carousel", position: 7,
			title: "Great games under €15", subtitle: "Cheap thrills, no compromises",
			config:   map[string]any{"href": "/store?maxPriceCents=1500&sort=popular", "layout": "grid"},
			products: budget,
		},
	}

	for _, b := range blocks {
		cfg := b.config
		if cfg == nil {
			cfg = map[string]any{}
		}
		raw, err := json.Marshal(cfg)
		if err != nil {
			return err
		}
		var blockID int64
		err = tx.QueryRow(ctx, `
			INSERT INTO homepage_blocks (block_key, type, title, subtitle, config, position)
			VALUES ($1, $2, $3, $4, $5, $6)
			RETURNING id`, b.key, b.typ, b.title, b.subtitle, raw, b.position).Scan(&blockID)
		if err != nil {
			return fmt.Errorf("insert homepage block %s: %w", b.key, err)
		}
		for pos, pid := range b.products {
			if pid == 0 {
				continue
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO homepage_block_products (block_id, product_id, position)
				VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, blockID, pid, pos); err != nil {
				return fmt.Errorf("link block product: %w", err)
			}
		}
		_ = heroSlug
	}
	return nil
}

// cents rounds a euro float to a price ending in .99.
func cents(euros float64) int {
	whole := math.Round(euros / 100)
	if whole < 1 {
		whole = 1
	}
	return int(whole*100) - 1
}

// keyCode derives a stable, fake-but-plausible key: XXXX-XXXX-XXXX-XXXX.
func keyCode(parts ...any) string {
	var b strings.Builder
	for _, p := range parts {
		fmt.Fprint(&b, p, ":")
	}
	sum := sha256.Sum256([]byte(b.String()))
	enc := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(sum[:])
	enc = strings.TrimRight(enc, "=")
	return strings.Join([]string{enc[0:4], enc[4:8], enc[8:12], enc[12:16]}, "-")
}
