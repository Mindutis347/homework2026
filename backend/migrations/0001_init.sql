-- Keyforge initial schema.
--
-- Catalog model: a product is a GAME TITLE. An offer is one seller's
-- platform/region-specific listing of that title. An inventory key is one
-- digital code belonging to an offer. Prices therefore live on offers only.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------------------
-- Accounts
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id                       BIGSERIAL PRIMARY KEY,
    email                    CITEXT NOT NULL UNIQUE,
    password_hash            TEXT NOT NULL,
    display_name             TEXT NOT NULL,
    role                     TEXT NOT NULL DEFAULT 'customer'
                             CHECK (role IN ('customer', 'merchant', 'admin')),
    is_verified              BOOLEAN NOT NULL DEFAULT FALSE,
    verification_code_hash   TEXT,
    verification_expires_at  TIMESTAMPTZ,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX users_role_idx ON users (role);

CREATE TABLE seller_profiles (
    user_id      BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    store_name   TEXT NOT NULL UNIQUE,
    bio          TEXT NOT NULL DEFAULT '',
    rating       NUMERIC(2, 1) NOT NULL DEFAULT 5.0 CHECK (rating BETWEEN 0 AND 5),
    rating_count INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    sales_count  INTEGER NOT NULL DEFAULT 0 CHECK (sales_count >= 0),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Simulated e-mail delivery. Verification codes land here so the app can show
-- them to the user (and the evaluator) without an SMTP provider.
CREATE TABLE email_outbox (
    id         BIGSERIAL PRIMARY KEY,
    recipient  CITEXT NOT NULL,
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL,
    code       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX email_outbox_recipient_idx ON email_outbox (recipient, created_at DESC);

-- ---------------------------------------------------------------------------
-- Catalog
-- ---------------------------------------------------------------------------

CREATE TABLE platforms (
    id         SMALLSERIAL PRIMARY KEY,
    slug       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE regions (
    id         SMALLSERIAL PRIMARY KEY,
    code       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    sort_order SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE genres (
    id   SMALLSERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL
);

CREATE TABLE products (
    id           BIGSERIAL PRIMARY KEY,
    slug         TEXT NOT NULL UNIQUE,
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    cover_url    TEXT NOT NULL DEFAULT '',
    hero_url     TEXT NOT NULL DEFAULT '',
    developer    TEXT NOT NULL DEFAULT '',
    publisher    TEXT NOT NULL DEFAULT '',
    release_date DATE,
    popularity   INTEGER NOT NULL DEFAULT 0 CHECK (popularity >= 0),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Typo-tolerant lookup: trigram GIN indexes drive /api/search similarity ranking.
CREATE INDEX products_title_trgm_idx ON products USING GIN (title gin_trgm_ops);
CREATE INDEX products_popularity_idx ON products (popularity DESC) WHERE is_active;

CREATE TABLE product_genres (
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    genre_id   SMALLINT NOT NULL REFERENCES genres (id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, genre_id)
);

CREATE TABLE offers (
    id           BIGSERIAL PRIMARY KEY,
    product_id   BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    seller_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    platform_id  SMALLINT NOT NULL REFERENCES platforms (id),
    region_id    SMALLINT NOT NULL REFERENCES regions (id),
    price_cents  INTEGER NOT NULL CHECK (price_cents > 0),
    -- Optional compare-at price; when set and higher than price_cents the UI
    -- shows a strike-through discount.
    base_price_cents INTEGER CHECK (base_price_cents IS NULL OR base_price_cents >= price_cents),
    stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    delivery     TEXT NOT NULL DEFAULT 'instant' CHECK (delivery IN ('instant', 'manual')),
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (seller_id, product_id, platform_id, region_id)
);

CREATE INDEX offers_product_price_idx ON offers (product_id, price_cents) WHERE is_active;
CREATE INDEX offers_platform_idx ON offers (platform_id) WHERE is_active;
CREATE INDEX offers_region_idx ON offers (region_id) WHERE is_active;
CREATE INDEX offers_seller_idx ON offers (seller_id);

-- `offers.stock` is a maintained counter for fast filtering; this table is the
-- source of truth and the thing checkout locks.
CREATE TABLE inventory_keys (
    id            BIGSERIAL PRIMARY KEY,
    offer_id      BIGINT NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
    key_code      TEXT NOT NULL UNIQUE,
    status        TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sold')),
    order_item_id BIGINT,
    sold_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX inventory_keys_available_idx ON inventory_keys (offer_id) WHERE status = 'available';

-- ---------------------------------------------------------------------------
-- Cart & orders
-- ---------------------------------------------------------------------------

CREATE TABLE cart_items (
    user_id   BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    offer_id  BIGINT NOT NULL REFERENCES offers (id) ON DELETE CASCADE,
    quantity  SMALLINT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10),
    added_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, offer_id)
);

CREATE TABLE orders (
    id              BIGSERIAL PRIMARY KEY,
    reference       TEXT NOT NULL UNIQUE,
    user_id         BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
    subtotal_cents  INTEGER NOT NULL DEFAULT 0,
    total_cents     INTEGER NOT NULL DEFAULT 0,
    currency        CHAR(3) NOT NULL DEFAULT 'EUR',
    payment_method  TEXT NOT NULL DEFAULT 'simulated',
    payment_ref     TEXT,
    idempotency_key TEXT UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at         TIMESTAMPTZ
);

CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);
CREATE INDEX orders_status_idx ON orders (status);

CREATE TABLE order_items (
    id                 BIGSERIAL PRIMARY KEY,
    order_id           BIGINT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    offer_id           BIGINT REFERENCES offers (id) ON DELETE SET NULL,
    product_id         BIGINT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
    seller_id          BIGINT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    product_title      TEXT NOT NULL,
    platform_name      TEXT NOT NULL,
    region_code        TEXT NOT NULL,
    unit_price_cents   INTEGER NOT NULL,
    quantity           SMALLINT NOT NULL,
    commission_cents   INTEGER NOT NULL,
    seller_payout_cents INTEGER NOT NULL
);

CREATE INDEX order_items_order_idx ON order_items (order_id);
CREATE INDEX order_items_seller_idx ON order_items (seller_id);

ALTER TABLE inventory_keys
    ADD CONSTRAINT inventory_keys_order_item_fk
    FOREIGN KEY (order_item_id) REFERENCES order_items (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- Homepage blocks (content is data, never hardcoded in the frontend)
-- ---------------------------------------------------------------------------

CREATE TABLE homepage_blocks (
    id         BIGSERIAL PRIMARY KEY,
    block_key  TEXT NOT NULL UNIQUE,
    type       TEXT NOT NULL
               CHECK (type IN ('hero', 'product_carousel', 'category_tiles', 'banner', 'platform_strip')),
    title      TEXT NOT NULL DEFAULT '',
    subtitle   TEXT NOT NULL DEFAULT '',
    config     JSONB NOT NULL DEFAULT '{}'::jsonb,
    position   INTEGER NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX homepage_blocks_order_idx ON homepage_blocks (position) WHERE is_visible;

CREATE TABLE homepage_block_products (
    block_id   BIGINT NOT NULL REFERENCES homepage_blocks (id) ON DELETE CASCADE,
    product_id BIGINT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    position   INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (block_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Merchant & admin workflows
-- ---------------------------------------------------------------------------

CREATE TABLE product_requests (
    id          BIGSERIAL PRIMARY KEY,
    merchant_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    platform_id SMALLINT NOT NULL REFERENCES platforms (id),
    region_id   SMALLINT NOT NULL REFERENCES regions (id),
    cover_url   TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_note  TEXT NOT NULL DEFAULT '',
    reviewed_by BIGINT REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    product_id  BIGINT REFERENCES products (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX product_requests_status_idx ON product_requests (status, created_at DESC);

CREATE TABLE support_tickets (
    id               BIGSERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    order_id         BIGINT REFERENCES orders (id) ON DELETE SET NULL,
    subject          TEXT NOT NULL,
    body             TEXT NOT NULL,
    category         TEXT NOT NULL DEFAULT 'other'
                     CHECK (category IN ('refund', 'delivery', 'account', 'other')),
    status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'in_progress', 'resolved')),
    refund_requested BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_status_idx ON support_tickets (status, created_at DESC);
