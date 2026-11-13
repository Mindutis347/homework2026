package models

import "time"

// MerchantOffer is a seller's own listing with inventory counts.
type MerchantOffer struct {
	ID             int64     `json:"id"`
	ProductID      int64     `json:"productId"`
	ProductSlug    string    `json:"productSlug"`
	ProductTitle   string    `json:"productTitle"`
	CoverURL       string    `json:"coverUrl"`
	PlatformSlug   string    `json:"platformSlug"`
	PlatformName   string    `json:"platformName"`
	RegionCode     string    `json:"regionCode"`
	PriceCents     int       `json:"priceCents"`
	BasePriceCents *int      `json:"basePriceCents"`
	Stock          int       `json:"stock"`
	AvailableKeys  int       `json:"availableKeys"`
	SoldKeys       int       `json:"soldKeys"`
	IsActive       bool      `json:"isActive"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

// MerchantSale is one sold line on the seller's dashboard.
type MerchantSale struct {
	OrderReference string    `json:"orderReference"`
	ProductTitle   string    `json:"productTitle"`
	Quantity       int       `json:"quantity"`
	UnitPriceCents int       `json:"unitPriceCents"`
	PayoutCents    int       `json:"payoutCents"`
	SoldAt         time.Time `json:"soldAt"`
}

// MerchantStats is the seller dashboard header.
type MerchantStats struct {
	Offers        int `json:"offers"`
	ActiveOffers  int `json:"activeOffers"`
	KeysAvailable int `json:"keysAvailable"`
	KeysSold      int `json:"keysSold"`
	RevenueCents  int `json:"revenueCents"`
	PayoutCents   int `json:"payoutCents"`
}

// ProductRequest is a merchant's proposal to add a title to the catalog.
type ProductRequest struct {
	ID           int64      `json:"id"`
	MerchantID   int64      `json:"merchantId"`
	MerchantName string     `json:"merchantName"`
	Title        string     `json:"title"`
	PlatformSlug string     `json:"platformSlug"`
	RegionCode   string     `json:"regionCode"`
	CoverURL     string     `json:"coverUrl"`
	Description  string     `json:"description"`
	Status       string     `json:"status"`
	AdminNote    string     `json:"adminNote"`
	ProductSlug  *string    `json:"productSlug"`
	CreatedAt    time.Time  `json:"createdAt"`
	ReviewedAt   *time.Time `json:"reviewedAt"`
}

// AdminUser is the account row in the back-office.
type AdminUser struct {
	ID          int64     `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	IsVerified  bool      `json:"isVerified"`
	StoreName   string    `json:"storeName,omitempty"`
	Orders      int       `json:"orders"`
	SpentCents  int       `json:"spentCents"`
	CreatedAt   time.Time `json:"createdAt"`
}

// SalesSummary is the accounting overview.
type SalesSummary struct {
	Orders          int          `json:"orders"`
	UnitsSold       int          `json:"unitsSold"`
	GrossCents      int          `json:"grossCents"`
	CommissionCents int          `json:"commissionCents"`
	PayoutCents     int          `json:"payoutCents"`
	AvgOrderCents   int          `json:"avgOrderCents"`
	ActiveSellers   int          `json:"activeSellers"`
	TopSellers      []TopSeller  `json:"topSellers"`
	Daily           []DailySales `json:"daily"`
}

type TopSeller struct {
	StoreName       string `json:"storeName"`
	UnitsSold       int    `json:"unitsSold"`
	RevenueCents    int    `json:"revenueCents"`
	CommissionCents int    `json:"commissionCents"`
}

type DailySales struct {
	Day          string `json:"day"`
	Orders       int    `json:"orders"`
	RevenueCents int    `json:"revenueCents"`
}

// Ticket is a customer support request.
type Ticket struct {
	ID              int64     `json:"id"`
	UserEmail       string    `json:"userEmail"`
	OrderReference  string    `json:"orderReference,omitempty"`
	Subject         string    `json:"subject"`
	Body            string    `json:"body"`
	Category        string    `json:"category"`
	Status          string    `json:"status"`
	RefundRequested bool      `json:"refundRequested"`
	CreatedAt       time.Time `json:"createdAt"`
}

// AdminOrder is a platform-wide order row.
type AdminOrder struct {
	Reference  string    `json:"reference"`
	BuyerEmail string    `json:"buyerEmail"`
	Status     string    `json:"status"`
	TotalCents int       `json:"totalCents"`
	Items      int       `json:"items"`
	CreatedAt  time.Time `json:"createdAt"`
}
