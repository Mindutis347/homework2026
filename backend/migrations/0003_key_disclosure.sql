-- Keys are only disclosed on an explicit request, and a refund is only possible
-- while the buyer has not seen the key. Recording displayed_at makes that rule
-- enforceable and auditable; order line status lets a refund be partial.

ALTER TABLE inventory_keys
    ADD COLUMN displayed_at TIMESTAMPTZ;

ALTER TABLE order_items
    ADD COLUMN status TEXT NOT NULL DEFAULT 'paid'
        CHECK (status IN ('paid', 'refunded')),
    ADD COLUMN refunded_at TIMESTAMPTZ;

CREATE INDEX order_items_status_idx ON order_items (order_id, status);
