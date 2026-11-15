package models

import "time"

// User is the account shape returned to the client. It never includes the
// password hash or verification code.
type User struct {
	ID          int64     `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"displayName"`
	Role        string    `json:"role"`
	IsVerified  bool      `json:"isVerified"`
	CreatedAt   time.Time `json:"createdAt"`
	StoreName   string    `json:"storeName,omitempty"`
}

// ProductCard is the catalog/listing shape: a game title plus the aggregate of
// its live offers. Prices never live on the product itself.
type ProductCard struct {
	ID            int64      `json:"id"`
	Slug          string     `json:"slug"`
	Title         string     `json:"title"`
	CoverURL      string     `json:"coverUrl"`
	ReleaseDate   *time.Time `json:"releaseDate"`
	Popularity    int        `json:"popularity"`
	MinPriceCents int        `json:"minPriceCents"`
	MaxPriceCents int        `json:"maxPriceCents"`
	OfferCount    int        `json:"offerCount"`
	ContentType   string     `json:"contentType"`
	Platforms     []string   `json:"platforms"`
	Regions       []string   `json:"regions"`
	// Set when the card stands for one platform+region variant of a game (the
	// store lists each variant separately). Empty for game-level cards, which the
	// homepage rows and the merchant picker still use.
	PlatformSlug string `json:"platformSlug,omitempty"`
	PlatformName string `json:"platformName,omitempty"`
	RegionCode   string `json:"regionCode,omitempty"`
	RegionName   string `json:"regionName,omitempty"`
	// BestDiscountPercent is the deepest markdown across the product's offers.
	BestDiscountPercent int `json:"bestDiscountPercent"`
}

// Seller is the public view of a merchant.
type Seller struct {
	ID          int64   `json:"id"`
	StoreName   string  `json:"storeName"`
	Rating      float64 `json:"rating"`
	RatingCount int     `json:"ratingCount"`
	SalesCount  int     `json:"salesCount"`
}

// Offer is one seller's listing of a product on a platform/region.
type Offer struct {
	ID         int64 `json:"id"`
	PriceCents int   `json:"priceCents"`
	// BasePriceCents is the seller's compare-at price when there is one, so a
	// row can show the markdown instead of only the final price.
	BasePriceCents *int   `json:"basePriceCents,omitempty"`
	Stock          int    `json:"stock"`
	Delivery       string `json:"delivery"`
	PlatformSlug   string `json:"platformSlug"`
	PlatformName   string `json:"platformName"`
	RegionCode     string `json:"regionCode"`
	RegionName     string `json:"regionName"`
	Seller         Seller `json:"seller"`
}

// ProductDetail is the product page payload.
type ProductDetail struct {
	ProductCard
	Description string        `json:"description"`
	HeroURL     string        `json:"heroUrl"`
	Developer   string        `json:"developer"`
	Publisher   string        `json:"publisher"`
	Genres      []string      `json:"genres"`
	Offers      []Offer       `json:"offers"`
	Related     []ProductCard `json:"related"`
}

// ProductSummary is the minimum a back-office editor needs to show a chosen
// product: id, name and cover. The public homepage still gets full cards.
type ProductSummary struct {
	ID       int64  `json:"id"`
	Title    string `json:"title"`
	CoverURL string `json:"coverUrl"`
}

// HomepageBlock is a marketing block. Content comes from the database; the
// frontend only decides how a given block `type` renders.
type HomepageBlock struct {
	ID               int64            `json:"id"`
	Key              string           `json:"key"`
	Type             string           `json:"type"`
	Title            string           `json:"title"`
	Subtitle         string           `json:"subtitle"`
	Config           map[string]any   `json:"config"`
	Position         int              `json:"position"`
	IsVisible        bool             `json:"isVisible"`
	ProductIDs       []int64          `json:"productIds"`
	Products         []ProductCard    `json:"products"`
	ProductSummaries []ProductSummary `json:"productSummaries,omitempty"`
}

// SearchSuggestion is a lightweight row for the search dropdown.
type SearchSuggestion struct {
	ID       int64   `json:"id"`
	Slug     string  `json:"slug"`
	Title    string  `json:"title"`
	CoverURL string  `json:"coverUrl"`
	Score    float64 `json:"score"`
	// The version the suggestion points at: a game is sold as several
	// platform+region variants, so the dropdown links straight to one of them.
	PlatformSlug string `json:"platformSlug,omitempty"`
	PlatformName string `json:"platformName,omitempty"`
	RegionCode   string `json:"regionCode,omitempty"`
	RegionName   string `json:"regionName,omitempty"`
	PriceCents   int    `json:"priceCents,omitempty"`
}

type Platform struct {
	ID   int16  `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

type Region struct {
	ID   int16  `json:"id"`
	Code string `json:"code"`
	Name string `json:"name"`
}

type Genre struct {
	ID   int16  `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

// Meta is the filter vocabulary the store UI needs, served from the database so
// the frontend has no hardcoded platform/region/genre lists.
// MetaTax tells the storefront whether a card payment will carry tax, so copy can
// warn about it without quoting prices before checkout.
type MetaTax struct {
	ApplyOnPurchase        bool `json:"applyOnPurchase"`
	PurchaseTaxBasisPoints int  `json:"purchaseTaxBasisPoints"`
	ApplyOnTopup           bool `json:"applyOnTopup"`
	TopupTaxBasisPoints    int  `json:"topupTaxBasisPoints"`
}

type Meta struct {
	Platforms  []Platform `json:"platforms"`
	Regions    []Region   `json:"regions"`
	Genres     []Genre    `json:"genres"`
	Tax        MetaTax    `json:"tax"`
	PriceRange struct {
		MinCents int `json:"minCents"`
		MaxCents int `json:"maxCents"`
	} `json:"priceRange"`
}

// Paged wraps list responses with pagination metadata.
type Paged[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"pageSize"`
}

// CartItem is a line in the buyer's cart, priced from the live offer.
type CartItem struct {
	OfferID        int64  `json:"offerId"`
	ProductID      int64  `json:"productId"`
	Slug           string `json:"slug"`
	Title          string `json:"title"`
	CoverURL       string `json:"coverUrl"`
	PlatformSlug   string `json:"platformSlug"`
	PlatformName   string `json:"platformName"`
	RegionCode     string `json:"regionCode"`
	SellerStore    string `json:"sellerStore"`
	UnitPriceCents int    `json:"unitPriceCents"`
	Quantity       int    `json:"quantity"`
	Stock          int    `json:"stock"`
	LineTotalCents int    `json:"lineTotalCents"`
}

// Cart is the whole basket plus its totals.
type Cart struct {
	Items         []CartItem `json:"items"`
	ItemCount     int        `json:"itemCount"`
	SubtotalCents int        `json:"subtotalCents"`
}

// OrderItem is an immutable snapshot of what was bought, including the keys
// once paid for.
// OrderKey is a delivered key without its value. The code itself is only sent in
// response to an explicit reveal, so a page payload never carries it.
type OrderKey struct {
	ID          int64      `json:"id"`
	DisplayedAt *time.Time `json:"displayedAt"`
}

type OrderItem struct {
	ID                int64      `json:"id"`
	ProductID         int64      `json:"productId"`
	ProductSlug       string     `json:"productSlug"`
	ProductTitle      string     `json:"productTitle"`
	CoverURL          string     `json:"coverUrl"`
	PlatformName      string     `json:"platformName"`
	RegionCode        string     `json:"regionCode"`
	SellerStore       string     `json:"sellerStore"`
	UnitPriceCents    int        `json:"unitPriceCents"`
	Quantity          int        `json:"quantity"`
	CommissionCents   int        `json:"commissionCents"`
	SellerPayoutCents int        `json:"sellerPayoutCents"`
	Keys              []OrderKey `json:"keys"`
	Refunded          bool       `json:"refunded"`
	Refundable        bool       `json:"refundable"`
	DisplayedAt       *time.Time `json:"displayedAt"`
}

// Order is the buyer-facing purchase record.
type Order struct {
	ID             int64       `json:"id"`
	Reference      string      `json:"reference"`
	Status         string      `json:"status"`
	SubtotalCents  int         `json:"subtotalCents"`
	TaxCents       int         `json:"taxCents"`
	TaxBasisPoints int         `json:"taxBasisPoints"`
	TotalCents     int         `json:"totalCents"`
	Currency       string      `json:"currency"`
	PaymentMethod  string      `json:"paymentMethod"`
	CreatedAt      time.Time   `json:"createdAt"`
	PaidAt         *time.Time  `json:"paidAt"`
	Items          []OrderItem `json:"items"`
}

// TaxCents is the tax charged on this order. It is folded into TotalCents and
// kept separately so a receipt can show it on its own.
