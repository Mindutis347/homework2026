package repo

import (
	"context"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

/*
Search scoring, shared by the suggestion endpoint and the store's `q` filter so the
dropdown and the results page can never disagree.

A query is split into tokens and every token must match, which is what makes
"elden rnig" work: "elden" matches exactly, "rnig" is one edit from "ring". Tokens
are matched against a per-product document — title, publisher, developer, genres and
the platforms the product is sold on — so "steam cyberpunk" and "fromsoftware" find
their games as well.

Each token is scored by the best of four signals:

	similarity(token, title)          whole title
	word_similarity(token, document)  best substring of the document
	doc ILIKE '%token%'               0.95, exact substring
	per-word trigram / Levenshtein    typo budget 2, same-length words only

and the product's rank is the sum of a fixed boost for an exact/prefix/substring
title hit, the whole-query word similarity, and the average token score. Ties go to
popularity and then to the cheapest live offer, so a common title is not buried
behind an obscure one that happens to share trigrams.
*/

// searchTextExpr is what typo tolerance applies to: the game's name and the names
// of the people who make it. Facet words (platforms, genres) are matched exactly
// instead — "hlao" is two edits from "play", so a fuzzy match over facet words scored
// every PlayStation listing 0.5 and buried the actual Halo.
const searchTextExpr = `lower(
	p.title || ' ' || coalesce(p.developer, '') || ' ' || coalesce(p.publisher, '')
)`

// searchFacetExpr is the exact-match half: the platforms a product is listed on and
// its genres, so "steam cyberpunk" and "fromsoftware" still find their games.
const searchFacetExpr = `lower(
	COALESCE((SELECT string_agg(g.name, ' ')
	          FROM product_genres pgx JOIN genres g ON g.id = pgx.genre_id
	          WHERE pgx.product_id = p.id), '') || ' ' ||
	COALESCE((SELECT string_agg(DISTINCT pl.name, ' ')
	          FROM offers off JOIN platforms pl ON pl.id = off.platform_id
	          WHERE off.product_id = p.id AND off.is_active), '')
)`

// fuzzyWordScore matches one term against the words of the document. Punctuation is
// stripped first ("baldur's" is one edit from "bladurs", not four), the comparison
// is against an equal-length prefix, the edit budget is 2, and a word much shorter
// than the term is not a typo of it.
func fuzzyWordScore(termExpr string) string {
	term := `regexp_replace(lower(` + termExpr + `), '[^a-z0-9]', '', 'g')`
	lev := func(a, b string) string { return `levenshtein(` + a + `, ` + b + `)` }
	wholeWord := lev(term, "w.word")
	prefix := lev(term, "left(w.word, length("+term+"))")
	return `(
		SELECT MAX(GREATEST(
		           similarity(w.word, ` + term + `),
		           -- The whole word, so a letter dropped anywhere counts once
		           -- ("rst" is one edit from "rust").
		           CASE WHEN length(` + term + `) >= 3
		                     AND abs(length(w.word) - length(` + term + `)) <= 2
		                     AND ` + wholeWord + `
		                         <= CASE WHEN length(` + term + `) <= 3 THEN 1
		                                 WHEN left(w.word, 1) = left(` + term + `, 1) THEN 2
		                                 ELSE 1 END
		                THEN 1.0 - ` + wholeWord + `::float8
		                           / GREATEST(length(` + term + `), length(w.word))
		                ELSE 0 END,
		           -- The word's opening, for a slip inside the first syllable
		           -- ("syber" against "cyberpunk").
		           CASE WHEN length(` + term + `) >= 4
		                     AND length(w.word) > length(` + term + `)
		                     AND ` + prefix + `
		                         <= CASE WHEN left(w.word, 1) = left(` + term + `, 1) THEN 2 ELSE 1 END
		                THEN 1.0 - ` + prefix + `::float8 / length(` + term + `)
		                ELSE 0 END))
		FROM (
		    SELECT regexp_replace(word, '[^a-z0-9]', '', 'g') AS word
		    -- Split on punctuation as well as spaces ("half-life" is two words a
		    -- shopper may type either half of), but keep apostrophes inside a word:
		    -- "baldur's" must stay one token, or a transposed "bladurs" is three
		    -- edits away instead of two.
		    FROM regexp_split_to_table(` + searchTextExpr + `, '[^a-z0-9'']+') AS word
		) AS w
		WHERE length(w.word) >= 3 AND length(` + term + `) >= 2
	)`
}

// tokenScoreExpr scores a single token of the query against one product row.
func tokenScoreExpr(tokenExpr string) string {
	return `GREATEST(
		similarity(lower(` + tokenExpr + `), lower(p.title)),
		word_similarity(lower(` + tokenExpr + `), lower(p.title)),
		CASE WHEN ` + searchTextExpr + ` LIKE '%' || lower(` + tokenExpr + `) || '%'
		       OR ` + searchFacetExpr + ` LIKE '%' || lower(` + tokenExpr + `) || '%' THEN 0.95 ELSE 0 END,
		COALESCE(` + fuzzyWordScore(tokenExpr) + `, 0)
	)`
}

// tokenScoresExpr expands a query into one score per token (tokens shorter than two
// characters are dropped: they match everything and would rank noise first).
func tokenScoresExpr(termParam string) string {
	return `(
		SELECT ` + tokenScoreExpr("tok") + ` AS score
		FROM unnest(string_to_array(lower(trim(` + termParam + `)), ' ')) AS tok
		WHERE length(tok) >= 2
	)`
}

// fuzzyMatchExpr is true when every token of the query matched this product. An
// initialism hit ("bg3", "gta") is checked separately: it is a property of the
// whole query, not of a token.
func fuzzyMatchExpr(termParam string) string {
	return `(
		SELECT COALESCE(bool_and(t.score >= 0.45), false)
		FROM ` + tokenScoresExpr(termParam) + ` AS t
	)`
}

// fuzzyRankExpr is the composite relevance used for ordering.
func fuzzyRankExpr(termParam string) string {
	term := `lower(trim(` + termParam + `))`
	return `(
		CASE WHEN lower(p.title) = ` + term + ` THEN 3.0
		     WHEN lower(p.title) LIKE ` + term + ` || '%' THEN 2.0
		     WHEN ` + titleAcronymExpr + ` LIKE ` + term + ` || '%' THEN 1.8
		     WHEN lower(p.title) LIKE '%' || ` + term + ` || '%' THEN 1.5
		     ELSE 0.0 END
		+ word_similarity(` + term + `, ` + searchTextExpr + ` || ' ' || ` + searchFacetExpr + `)
		+ similarity(lower(p.title), ` + term + `)
		+ 0.5 * COALESCE((SELECT AVG(t.score) FROM ` + tokenScoresExpr(termParam) + ` AS t), 0)
	)`
}

// fuzzyScoreExpr is the number shown to the shopper: the best single similarity,
// clamped to 0..1, because the ordering rank sums several boosts and would render
// as "365% match".
func fuzzyScoreExpr(termParam string) string {
	term := `lower(trim(` + termParam + `))`
	return `LEAST(1.0, GREATEST(
		CASE WHEN ` + titleAcronymExpr + ` LIKE ` + term + ` || '%' THEN 0.85 ELSE 0 END,
		word_similarity(` + term + `, ` + searchTextExpr + ` || ' ' || ` + searchFacetExpr + `),
		similarity(lower(p.title), ` + term + `),
		COALESCE((SELECT AVG(t.score) FROM ` + tokenScoresExpr(termParam) + ` AS t), 0)
	))::float8`
}

// forSprintf escapes the percent signs in a match pattern so the expression can be
// embedded in a query that goes through fmt.Sprintf.
func forSprintf(expr string) string {
	return strings.ReplaceAll(expr, "%", "%%")
}

// searchQualifiers pulls platform and region words out of a query, so "elden ring
// steam eu" is a title search with a version filter rather than a title that
// contains "steam". Returns the remaining words, plus the platform slug and region
// code when one was named.
func searchQualifiers(term string) (rest, platformSlug, regionCode string) {
	platforms := map[string]string{
		"steam": "steam", "pc": "", "psn": "playstation", "ps": "playstation",
		"playstation": "playstation", "ps4": "playstation", "ps5": "playstation",
		"xbox": "xbox", "switch": "nintendo", "nintendo": "nintendo",
		"epic": "epic", "gog": "gog",
	}
	regions := map[string]string{
		"global": "GLOBAL", "worldwide": "GLOBAL", "eu": "EU", "europe": "EU",
		"us": "US", "usa": "US", "uk": "UK", "tr": "TR", "turkey": "TR",
		"br": "BR", "brazil": "BR",
	}

	words := strings.Fields(strings.ToLower(term))
	kept := make([]string, 0, len(words))
	for _, word := range words {
		if slug, ok := platforms[word]; ok {
			if slug != "" && platformSlug == "" {
				platformSlug = slug
			}
			continue
		}
		if code, ok := regions[word]; ok && regionCode == "" {
			regionCode = code
			continue
		}
		kept = append(kept, word)
	}
	return strings.Join(kept, " "), platformSlug, regionCode
}

// Search returns fuzzy suggestions for the search bar and the store filter.
//
// A query can name a version, not just a game: "elden ring steam eu" is a title
// search for "elden ring" filtered to the Steam/EU version, and "cyberpunk" alone
// resolves to its cheapest version so the dropdown can link straight to a product
// page. Scoring lives in search.go; this function parses the qualifiers, runs the
// match, then attaches the version each suggestion points at.
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

	rest, platformSlug, regionCode := searchQualifiers(term)
	if rest == "" && platformSlug == "" && regionCode == "" {
		return out, nil
	}

	// A one-letter title search still uses the prefix path, but only when no
	// platform or region was named.
	if len([]rune(rest)) == 1 && platformSlug == "" && regionCode == "" {
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
			pgx.NamedArgs{"term": rest, "limit": limit, "market_region": marketRegion},
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
		if err := rows.Err(); err != nil {
			return nil, err
		}
		return out, c.attachVersions(ctx, out, platformSlug, regionCode, marketRegion)
	}

	rank := fuzzyRankExpr("@q")
	match := fuzzyMatchExpr("@q")
	score := fuzzyScoreExpr("@q")
	// With the title words stripped ("steam", "eu"), what is left is either a real
	// title search or nothing at all — in which case any game sold on that platform
	// or in that region is a fair answer.
	titleFilter := `(@q = '' OR p.title ILIKE '%' || @q || '%' OR ` + match +
		` OR ` + titleAcronymExpr + ` LIKE lower(@q) || '%')`
	rankExpr := `CASE WHEN @q = '' THEN 1.0 ELSE ` + rank + ` END`
	scoreExpr := `CASE WHEN @q = '' THEN 1.0 ELSE ` + score + ` END`

	rows, err := c.pool.Query(ctx, `
		SELECT p.id, p.slug, p.title, p.cover_url, `+scoreExpr+` AS score
		FROM products p
		WHERE p.is_active
		  AND `+titleFilter+`
		  AND (@qual_platform = '' OR EXISTS (
		        SELECT 1 FROM offers ov JOIN platforms pv ON pv.id = ov.platform_id
		        WHERE ov.product_id = p.id AND ov.is_active AND ov.stock > 0 AND pv.slug = @qual_platform))
		  AND (@qual_region = '' OR EXISTS (
		        SELECT 1 FROM offers ov JOIN regions rv ON rv.id = ov.region_id
		        WHERE ov.product_id = p.id AND ov.is_active AND ov.stock > 0 AND rv.code = @qual_region))
		  AND EXISTS (
		        SELECT 1 FROM offers o
		        JOIN regions r ON r.id = o.region_id
		        WHERE o.product_id = p.id AND o.is_active AND o.stock > 0
		          AND (@market_region = '' OR r.code = @market_region OR r.code = 'GLOBAL'))
		ORDER BY `+rankExpr+` DESC, length(p.title) ASC, p.popularity DESC, p.title ASC
		LIMIT @limit`,
		pgx.NamedArgs{
			"q": rest, "limit": limit, "market_region": marketRegion,
			"qual_platform": platformSlug, "qual_region": regionCode,
		},
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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, c.attachVersions(ctx, out, platformSlug, regionCode, marketRegion)
}

// attachVersions fills in the platform+region version each suggestion points at:
// the one the query named, otherwise the visitor's own region when the game is sold
// there, otherwise its cheapest in-stock version. A game with no version left out
// keeps empty fields, and the UI falls back to the game URL.
func (c *Catalog) attachVersions(ctx context.Context, out []models.SearchSuggestion, platformSlug, regionCode, marketRegion string) error {
	if len(out) == 0 {
		return nil
	}
	ids := make([]int64, len(out))
	byID := make(map[int64]int, len(out))
	for i, s := range out {
		ids[i] = s.ID
		byID[s.ID] = i
	}

	rows, err := c.pool.Query(ctx, `
		SELECT o.product_id, pl.slug, pl.name, r.code, r.name, MIN(o.price_cents)::int AS price
		FROM offers o
		JOIN platforms pl ON pl.id = o.platform_id
		JOIN regions   r  ON r.id  = o.region_id
		WHERE o.product_id = ANY(@ids)
		  AND o.is_active AND o.stock > 0
		  AND (@qual_platform = '' OR pl.slug = @qual_platform)
		  AND (@qual_region = '' OR r.code = @qual_region)
		  AND (@market_region = '' OR r.code = @market_region OR r.code = 'GLOBAL')
		GROUP BY o.product_id, pl.slug, pl.name, r.code, r.name
		ORDER BY o.product_id,
		         -- the visitor's own region first, then the cheapest
		         CASE WHEN r.code = @market_region THEN 0 ELSE 1 END,
		         MIN(o.price_cents) ASC`,
		pgx.NamedArgs{
			"ids": ids, "qual_platform": platformSlug,
			"qual_region": regionCode, "market_region": marketRegion,
		},
	)
	if err != nil {
		return fmt.Errorf("attach versions: %w", err)
	}
	defer rows.Close()

	seen := map[int64]bool{}
	for rows.Next() {
		var productID int64
		var platformSlugOut, platformName, code, name string
		var price int
		if err := rows.Scan(&productID, &platformSlugOut, &platformName, &code, &name, &price); err != nil {
			return err
		}
		if seen[productID] {
			continue
		}
		seen[productID] = true
		idx, ok := byID[productID]
		if !ok {
			continue
		}
		out[idx].PlatformSlug = platformSlugOut
		out[idx].PlatformName = platformName
		out[idx].RegionCode = code
		out[idx].RegionName = name
		out[idx].PriceCents = price
	}
	return rows.Err()
}
