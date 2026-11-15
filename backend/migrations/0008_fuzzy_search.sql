-- Fuzzy search needs edit distance, which pg_trgm cannot provide: "syber" and
-- "battlefield" both score 0.33 against "cyberpunk" and "starfield" respectively,
-- so trigrams alone cannot tell a typo from a coincidence. Levenshtein can — one
-- substitution versus five — and it is a standard contrib module, no app change.
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
