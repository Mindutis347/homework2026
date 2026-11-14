-- A catalogue entry is a full game, a DLC, or a package that bundles the base
-- game with its DLC. Buyers need to see which one they are getting, and sellers
-- declare it when requesting a new listing.

ALTER TABLE products
    ADD COLUMN content_type TEXT NOT NULL DEFAULT 'full'
        CHECK (content_type IN ('full', 'dlc', 'both'));

ALTER TABLE product_requests
    ADD COLUMN content_type TEXT NOT NULL DEFAULT 'full'
        CHECK (content_type IN ('full', 'dlc', 'both'));

CREATE INDEX products_content_type_idx ON products (content_type);
