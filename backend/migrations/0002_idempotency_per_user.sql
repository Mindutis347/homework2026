-- Idempotency keys are client-supplied UUIDs. A global UNIQUE made one user's
-- key collide with another user's, turning a legitimate retry into a 500.
-- Scope the constraint to the buyer, which matches how the replay check reads it
-- (WHERE idempotency_key = $1 AND user_id = $2).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_idempotency_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS orders_user_idempotency_idx
    ON orders (user_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
