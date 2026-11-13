package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
	"github.com/mindutis347/keyforge/backend/internal/repo"
)

// CommissionRate is the platform's cut of every sale (8%), recorded per order
// item so the admin ledger can be computed without re-deriving pricing.
const CommissionRate = 0.08

var (
	ErrEmptyCart         = errors.New("cart is empty")
	ErrInsufficientStock = errors.New("not enough keys in stock")
	ErrPaymentDeclined   = errors.New("payment declined")
	ErrUnavailableOffer  = errors.New("offer is no longer available")
)

// Checkout owns the purchase transaction.
type Checkout struct {
	pool *pgxpool.Pool
}

func NewCheckout(pool *pgxpool.Pool) *Checkout { return &Checkout{pool: pool} }

// PaymentInput is the simulated payment. Real providers would replace the
// settle() call only; everything else stays.
type PaymentInput struct {
	UserID         int64
	IdempotencyKey string
	CardNumber     string
	Method         string
}

// Pay turns the user's cart into a paid order and allocates keys.
//
// The whole flow is one transaction: either the buyer gets every key in their
// cart or nothing happens. Row locks are taken on offers first (ordered by id to
// avoid deadlocks) and on inventory rows with SKIP LOCKED, so two concurrent
// buyers of the same offer can never receive the same key.
func (c *Checkout) Pay(ctx context.Context, in PaymentInput) (models.Order, bool, error) {
	if in.Method == "" {
		in.Method = "simulated"
	}

	tx, err := c.pool.Begin(ctx)
	if err != nil {
		return models.Order{}, false, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Replay protection: a retried request returns the original order instead
	// of charging twice.
	if key := strings.TrimSpace(in.IdempotencyKey); key != "" {
		var existingID int64
		err := tx.QueryRow(ctx,
			`SELECT id FROM orders WHERE idempotency_key = $1 AND user_id = $2`, key, in.UserID,
		).Scan(&existingID)
		if err == nil {
			order, err := repo.LoadOrder(ctx, tx, existingID)
			return order, true, err
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return models.Order{}, false, err
		}
	}

	type line struct {
		offerID                                                   int64
		quantity                                                  int
		productID                                                 int64
		priceCents                                                int
		stock                                                     int
		sellerID                                                  int64
		isActive                                                  bool
		slug, title, cover, platformName, regionCode, sellerStore string
	}

	rows, err := tx.Query(ctx, `
		SELECT ci.offer_id, ci.quantity, o.product_id, o.price_cents, o.stock, o.seller_id, o.is_active,
		       p.slug, p.title, p.cover_url, pl.name, r.code,
		       COALESCE(NULLIF(sp.store_name, ''), u.display_name)
		FROM cart_items ci
		JOIN offers o        ON o.id = ci.offer_id
		JOIN products p      ON p.id = o.product_id
		JOIN platforms pl    ON pl.id = o.platform_id
		JOIN regions r       ON r.id = o.region_id
		JOIN users u         ON u.id = o.seller_id
		LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
		WHERE ci.user_id = $1
		ORDER BY ci.offer_id
		FOR UPDATE OF o`, in.UserID)
	if err != nil {
		return models.Order{}, false, fmt.Errorf("load cart: %w", err)
	}

	var lines []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.offerID, &l.quantity, &l.productID, &l.priceCents, &l.stock, &l.sellerID,
			&l.isActive, &l.slug, &l.title, &l.cover, &l.platformName, &l.regionCode, &l.sellerStore); err != nil {
			rows.Close()
			return models.Order{}, false, fmt.Errorf("scan cart line: %w", err)
		}
		lines = append(lines, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return models.Order{}, false, err
	}
	if len(lines) == 0 {
		return models.Order{}, false, ErrEmptyCart
	}

	subtotal := 0
	for _, l := range lines {
		if !l.isActive {
			return models.Order{}, false, fmt.Errorf("%w: %s", ErrUnavailableOffer, l.title)
		}
		if l.stock < l.quantity {
			return models.Order{}, false, fmt.Errorf("%w: %s", ErrInsufficientStock, l.title)
		}
		subtotal += l.priceCents * l.quantity
	}

	if declined(in.CardNumber) {
		return models.Order{}, false, ErrPaymentDeclined
	}

	reference, err := newReference()
	if err != nil {
		return models.Order{}, false, err
	}
	var idempotency *string
	if key := strings.TrimSpace(in.IdempotencyKey); key != "" {
		idempotency = &key
	}

	var orderID int64
	var createdAt time.Time
	var paidAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO orders (reference, user_id, status, subtotal_cents, total_cents,
		                    payment_method, payment_ref, idempotency_key, paid_at)
		VALUES ($1, $2, 'paid', $3, $3, $4, $5, $6, now())
		RETURNING id, created_at, paid_at`,
		reference, in.UserID, subtotal, in.Method, "sim_"+reference, idempotency,
	).Scan(&orderID, &createdAt, &paidAt)
	if err != nil {
		return models.Order{}, false, fmt.Errorf("create order: %w", err)
	}

	for _, l := range lines {
		lineTotal := l.priceCents * l.quantity
		commission := int(math.Round(float64(lineTotal) * CommissionRate))
		payout := lineTotal - commission

		var orderItemID int64
		err := tx.QueryRow(ctx, `
			INSERT INTO order_items (order_id, offer_id, product_id, seller_id, product_title,
			                         platform_name, region_code, unit_price_cents, quantity,
			                         commission_cents, seller_payout_cents)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
			RETURNING id`,
			orderID, l.offerID, l.productID, l.sellerID, l.title, l.platformName, l.regionCode,
			l.priceCents, l.quantity, commission, payout,
		).Scan(&orderItemID)
		if err != nil {
			return models.Order{}, false, fmt.Errorf("create order item: %w", err)
		}

		// Allocate exactly `quantity` free keys. SKIP LOCKED lets concurrent
		// checkouts take different keys without waiting on each other.
		keyRows, err := tx.Query(ctx, `
			SELECT id FROM inventory_keys
			WHERE offer_id = $1 AND status = 'available'
			ORDER BY id
			LIMIT $2
			FOR UPDATE SKIP LOCKED`, l.offerID, l.quantity)
		if err != nil {
			return models.Order{}, false, fmt.Errorf("select keys: %w", err)
		}
		var keyIDs []int64
		for keyRows.Next() {
			var id int64
			if err := keyRows.Scan(&id); err != nil {
				keyRows.Close()
				return models.Order{}, false, err
			}
			keyIDs = append(keyIDs, id)
		}
		keyRows.Close()
		if err := keyRows.Err(); err != nil {
			return models.Order{}, false, err
		}
		if len(keyIDs) < l.quantity {
			return models.Order{}, false, fmt.Errorf("%w: %s", ErrInsufficientStock, l.title)
		}

		if _, err := tx.Exec(ctx, `
			UPDATE inventory_keys
			SET status = 'sold', order_item_id = $1, sold_at = now()
			WHERE id = ANY($2)`, orderItemID, keyIDs); err != nil {
			return models.Order{}, false, fmt.Errorf("mark keys sold: %w", err)
		}

		// Guarded decrement: if another transaction drained the stock between
		// our read and here, this affects zero rows and we roll back.
		tag, err := tx.Exec(ctx, `
			UPDATE offers SET stock = stock - $2, updated_at = now()
			WHERE id = $1 AND stock >= $2`, l.offerID, l.quantity)
		if err != nil {
			return models.Order{}, false, fmt.Errorf("decrement stock: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return models.Order{}, false, fmt.Errorf("%w: %s", ErrInsufficientStock, l.title)
		}

		if _, err := tx.Exec(ctx, `
			UPDATE seller_profiles SET sales_count = sales_count + $2 WHERE user_id = $1`,
			l.sellerID, l.quantity); err != nil {
			return models.Order{}, false, fmt.Errorf("update seller stats: %w", err)
		}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM cart_items WHERE user_id = $1`, in.UserID); err != nil {
		return models.Order{}, false, fmt.Errorf("clear cart: %w", err)
	}

	order, err := repo.LoadOrder(ctx, tx, orderID)
	if err != nil {
		return models.Order{}, false, err
	}

	if err := tx.Commit(ctx); err != nil {
		return models.Order{}, false, err
	}
	return order, false, nil
}

// declined simulates a card decline for the Stripe test number ending 0002, so
// the failure path is demonstrable without a real processor.
func declined(cardNumber string) bool {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, cardNumber)
	return strings.HasSuffix(digits, "0002")
}

// newReference returns a human-friendly, collision-resistant order id.
func newReference() (string, error) {
	buf := make([]byte, 5)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "KF-" + strings.ToUpper(hex.EncodeToString(buf)), nil
}
