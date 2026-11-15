-- Search indexing.
--
-- 0001 already created the pg_trgm extension and an index on `products.title`.
-- This migration makes the intent explicit and adds what fuzzy matching over more
-- than the title needs:
--
--   * `products_title_norm_idx` — the same GIN trigram index on the case-folded
--     title, which is what the ranking query compares against (trigram indexes are
--     only used when the indexed expression matches the query expression exactly).
--   * `products_search_text_idx` — a trigram index over a concatenation of the
--     product's own fields. Genres and platforms live in join tables, so they are
--     folded into the ranking expression at query time rather than into an index.
--
-- Both are `IF NOT EXISTS` so re-running on an existing database is a no-op.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS products_title_norm_idx
    ON products USING GIN (lower(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS products_search_text_idx
    ON products USING GIN (
        lower(
            title || ' ' || developer || ' ' || publisher
        ) gin_trgm_ops
    );
