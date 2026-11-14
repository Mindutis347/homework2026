package repo

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// Wallet reads and moves the prepaid balance.
type Wallet struct {
	pool *pgxpool.Pool
}

func NewWallet(pool *pgxpool.Pool) *Wallet { return &Wallet{pool: pool} }

// Balance returns the current balance; a user without a wallet has zero.
func (w *Wallet) Balance(ctx context.Context, userID int64) (int, error) {
	var balance int
	err := w.pool.QueryRow(ctx,
		`SELECT balance_cents FROM wallets WHERE user_id = $1`, userID).Scan(&balance)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read balance: %w", err)
	}
	return balance, nil
}

// Get returns the balance with the newest movements.
func (w *Wallet) Get(ctx context.Context, userID int64) (models.Wallet, error) {
	out := models.Wallet{Transactions: []models.WalletTransaction{}}
	balance, err := w.Balance(ctx, userID)
	if err != nil {
		return out, err
	}
	out.BalanceCents = balance

	rows, err := w.pool.Query(ctx, `
		SELECT id, kind, amount_cents, tax_cents, reference, created_at
		FROM wallet_transactions
		WHERE user_id = $1
		ORDER BY created_at DESC, id DESC
		LIMIT 25`, userID)
	if err != nil {
		return out, fmt.Errorf("list wallet transactions: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var t models.WalletTransaction
		if err := rows.Scan(&t.ID, &t.Kind, &t.AmountCents, &t.TaxCents, &t.Reference, &t.CreatedAt); err != nil {
			return out, err
		}
		out.Transactions = append(out.Transactions, t)
	}
	return out, rows.Err()
}

// TopUp credits the balance and records the movement in one transaction. The tax
// is the surcharge the buyer paid on top of the credited amount, stored so the
// ledger can show it.
func (w *Wallet) TopUp(ctx context.Context, userID int64, amountCents, taxCents int, reference string) (int, error) {
	tx, err := w.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var balance int
	err = tx.QueryRow(ctx, `
		INSERT INTO wallets (user_id, balance_cents)
		VALUES ($1, $2)
		ON CONFLICT (user_id)
		DO UPDATE SET balance_cents = wallets.balance_cents + EXCLUDED.balance_cents, updated_at = now()
		RETURNING balance_cents`, userID, amountCents).Scan(&balance)
	if err != nil {
		return 0, fmt.Errorf("credit wallet: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO wallet_transactions (user_id, kind, amount_cents, tax_cents, reference)
		VALUES ($1, 'topup', $2, $3, $4)`, userID, amountCents, taxCents, reference); err != nil {
		return 0, fmt.Errorf("record top-up: %w", err)
	}
	return balance, tx.Commit(ctx)
}

// TaxSettings reads the single settings row.
func (w *Wallet) TaxSettings(ctx context.Context) (models.TaxSettings, error) {
	var s models.TaxSettings
	err := w.pool.QueryRow(ctx, `
		SELECT topup_tax_bp, purchase_tax_bp, apply_on_topup, apply_on_purchase, updated_at
		FROM tax_settings WHERE id`).Scan(&s.TopupTaxBasisPoints, &s.PurchaseTaxBasisPoints,
		&s.ApplyOnTopup, &s.ApplyOnPurchase, &s.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		// The migration seeds a row; fall back to no tax rather than failing checkout.
		return models.TaxSettings{}, nil
	}
	if err != nil {
		return s, fmt.Errorf("read tax settings: %w", err)
	}
	return s, nil
}

// UpdateTaxSettings stores an admin's tax configuration.
func (w *Wallet) UpdateTaxSettings(ctx context.Context, in models.TaxSettings) (models.TaxSettings, error) {
	var s models.TaxSettings
	err := w.pool.QueryRow(ctx, `
		UPDATE tax_settings
		SET topup_tax_bp = $1, purchase_tax_bp = $2,
		    apply_on_topup = $3, apply_on_purchase = $4, updated_at = now()
		WHERE id
		RETURNING topup_tax_bp, purchase_tax_bp, apply_on_topup, apply_on_purchase, updated_at`,
		in.TopupTaxBasisPoints, in.PurchaseTaxBasisPoints, in.ApplyOnTopup, in.ApplyOnPurchase,
	).Scan(&s.TopupTaxBasisPoints, &s.PurchaseTaxBasisPoints, &s.ApplyOnTopup, &s.ApplyOnPurchase, &s.UpdatedAt)
	if err != nil {
		return s, fmt.Errorf("update tax settings: %w", err)
	}
	return s, nil
}
