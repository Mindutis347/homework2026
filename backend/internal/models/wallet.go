package models

import "time"

// WalletTransaction is one movement on a wallet: a simulated card top-up or a
// purchase paid from the balance.
type WalletTransaction struct {
	ID          int64     `json:"id"`
	Kind        string    `json:"kind"`
	AmountCents int       `json:"amountCents"`
	TaxCents    int       `json:"taxCents"`
	Reference   string    `json:"reference"`
	CreatedAt   time.Time `json:"createdAt"`
}

// Wallet is a prepaid balance with its recent movements.
type Wallet struct {
	BalanceCents int                 `json:"balanceCents"`
	Transactions []WalletTransaction `json:"transactions"`
}

// TaxSettings is the demo's tax configuration. Rates are basis points: 2100 = 21%.
type TaxSettings struct {
	TopupTaxBasisPoints    int       `json:"topupTaxBasisPoints"`
	PurchaseTaxBasisPoints int       `json:"purchaseTaxBasisPoints"`
	ApplyOnTopup           bool      `json:"applyOnTopup"`
	ApplyOnPurchase        bool      `json:"applyOnPurchase"`
	UpdatedAt              time.Time `json:"updatedAt"`
}

// CheckoutQuote is what the buyer is shown before paying: goods, tax and total for
// the chosen method, plus their wallet balance for comparison.
type CheckoutQuote struct {
	Method             string `json:"method"`
	SubtotalCents      int    `json:"subtotalCents"`
	TaxBasisPoints     int    `json:"taxBasisPoints"`
	TaxCents           int    `json:"taxCents"`
	TotalCents         int    `json:"totalCents"`
	WalletBalanceCents int    `json:"walletBalanceCents"`
}
