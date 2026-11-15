package repo

import "strings"

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
	return `(
		SELECT MAX(GREATEST(
		           similarity(w.word, ` + term + `),
		           CASE WHEN length(` + term + `) >= 3
		                     AND abs(length(left(w.word, length(` + term + `))) - length(` + term + `)) <= 1
		                     -- Two edits are only a typo when the word still starts
		                     -- with the same letter: "hlao"/"halo" is a slip,
		                     -- "hlao"/"play" is a different word that happens to be
		                     -- two edits away.
		                     AND levenshtein(` + term + `, left(w.word, length(` + term + `)))
		                         <= CASE WHEN length(` + term + `) <= 3 THEN 0
		                                 WHEN left(w.word, 1) = left(` + term + `, 1) THEN 2
		                                 ELSE 1 END
		                THEN 1.0 - levenshtein(` + term + `, left(w.word, length(` + term + `)))::float8
		                           / length(` + term + `)
		                ELSE 0 END))
		FROM (
		    SELECT regexp_replace(word, '[^a-z0-9]', '', 'g') AS word
		    FROM unnest(string_to_array(` + searchTextExpr + `, ' ')) AS word
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
