package httpx

import (
	"errors"
	"math"
	"net/http"

	"github.com/mindutis347/keyforge/backend/internal/models"
	"github.com/mindutis347/keyforge/backend/internal/repo"
	"github.com/mindutis347/keyforge/backend/internal/service"
)

const (
	minTopupCents = 100    // €1
	maxTopupCents = 50_000 // €500
)

// handleGetWallet returns the prepaid balance and its recent movements.
//
//	GET /api/wallet
func (a *App) handleGetWallet(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	wallet, err := a.wallet.Get(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"wallet": wallet})
}

// handleWalletTopup adds money with the simulated card. The admin's top-up tax, if
// enabled, is charged on top, so the card is debited more than the wallet gains.
//
//	POST /api/wallet/topup {"amountCents":2500,"cardNumber":"4242..."}
func (a *App) handleWalletTopup(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	var body struct {
		AmountCents int    `json:"amountCents"`
		CardNumber  string `json:"cardNumber"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}
	if body.AmountCents < minTopupCents || body.AmountCents > maxTopupCents {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "top-up must be between €1 and €500"))
		return
	}
	if service.DeclinedCard(body.CardNumber) {
		WriteError(w, Errorf(http.StatusPaymentRequired, "payment_declined",
			"your card was declined (test card ending 0002 always fails)"))
		return
	}

	settings, err := a.wallet.TaxSettings(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	tax := 0
	if settings.ApplyOnTopup {
		tax = int(math.Round(float64(body.AmountCents) * float64(settings.TopupTaxBasisPoints) / 10000))
	}

	reference, err := service.NewTopupReference()
	if err != nil {
		WriteError(w, err)
		return
	}
	balance, err := a.wallet.TopUp(r.Context(), user.UserID, body.AmountCents, tax, reference)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{
		"balanceCents": balance,
		"taxCents":     tax,
		"chargedCents": body.AmountCents + tax,
		"reference":    reference,
	})
}

// handleCheckoutQuote prices the current cart for a payment method, so checkout
// can show goods, tax and total before the buyer commits.
//
//	POST /api/checkout/quote {"method":"card|wallet"}
func (a *App) handleCheckoutQuote(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	var body struct {
		Method string `json:"method"`
	}
	if r.ContentLength > 0 {
		if err := DecodeJSON(w, r, &body); err != nil {
			WriteError(w, err)
			return
		}
	}
	if body.Method == "" {
		body.Method = "card"
	}
	quote, err := a.checkout.Quote(r.Context(), user.UserID, body.Method)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"quote": quote})
}

// handleAdminTaxSettings returns the demo's tax configuration.
//
//	GET /api/admin/settings/taxes
func (a *App) handleAdminTaxSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := a.wallet.TaxSettings(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"taxes": settings})
}

// handleAdminUpdateTaxSettings stores the tax rates and where they apply.
//
//	PATCH /api/admin/settings/taxes
//	{"topupTaxBasisPoints":200,"purchaseTaxBasisPoints":500,
//	 "applyOnTopup":true,"applyOnPurchase":true}
func (a *App) handleAdminUpdateTaxSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		TopupTaxBasisPoints    int  `json:"topupTaxBasisPoints"`
		PurchaseTaxBasisPoints int  `json:"purchaseTaxBasisPoints"`
		ApplyOnTopup           bool `json:"applyOnTopup"`
		ApplyOnPurchase        bool `json:"applyOnPurchase"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}
	if body.TopupTaxBasisPoints < 0 || body.TopupTaxBasisPoints > 10000 ||
		body.PurchaseTaxBasisPoints < 0 || body.PurchaseTaxBasisPoints > 10000 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "tax rates must be between 0% and 100%"))
		return
	}
	settings, err := a.wallet.UpdateTaxSettings(r.Context(), models.TaxSettings{
		TopupTaxBasisPoints:    body.TopupTaxBasisPoints,
		PurchaseTaxBasisPoints: body.PurchaseTaxBasisPoints,
		ApplyOnTopup:           body.ApplyOnTopup,
		ApplyOnPurchase:        body.ApplyOnPurchase,
	})
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"taxes": settings})
}

// writeWalletError keeps the wallet's failure modes distinct from a generic 500.
func writeWalletError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, service.ErrInsufficientFunds):
		WriteError(w, Errorf(http.StatusPaymentRequired, "insufficient_funds", "your wallet balance is too low"))
	case errors.Is(err, repo.ErrNotFound):
		WriteError(w, ErrNotFound)
	default:
		WriteError(w, err)
	}
}
