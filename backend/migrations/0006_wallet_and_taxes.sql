-- Shop wallet and the demo tax settings.
--
-- A wallet is a prepaid balance: top-ups credit it, purchases debit it. Taxes are
-- configured by an admin as basis points (100 = 1%) and can be aimed at top-ups,
-- purchases, or both. Wallet payments skip tax entirely, which is the point of a
-- prepaid balance in this demo.

CREATE TABLE wallets (
    user_id       BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind         TEXT NOT NULL CHECK (kind IN ('topup', 'purchase')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    tax_cents    INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
    reference    TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX wallet_transactions_user_idx ON wallet_transactions (user_id, created_at DESC);

-- Exactly one settings row; the boolean primary key makes that a database rule.
CREATE TABLE tax_settings (
    id                        BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    topup_tax_bp              INTEGER NOT NULL DEFAULT 0 CHECK (topup_tax_bp BETWEEN 0 AND 10000),
    purchase_tax_bp           INTEGER NOT NULL DEFAULT 0 CHECK (purchase_tax_bp BETWEEN 0 AND 10000),
    apply_on_topup            BOOLEAN NOT NULL DEFAULT TRUE,
    apply_on_purchase         BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO tax_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;

-- The tax charged on an order, so a receipt can show it separately from the goods.
ALTER TABLE orders ADD COLUMN tax_cents INTEGER NOT NULL DEFAULT 0;
