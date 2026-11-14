-- The rate that produced tax_cents, so a receipt can print "Tax (5%)" and a
-- refund can recompute tax proportionally instead of leaving subtotal + tax out
-- of step with the new total. Rows created before this keep 0 and are displayed
-- without a rate.

ALTER TABLE orders ADD COLUMN tax_bp INTEGER NOT NULL DEFAULT 0
    CHECK (tax_bp BETWEEN 0 AND 10000);
