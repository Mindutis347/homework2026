package httpx

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/mindutis347/keyforge/backend/internal/repo"
)

// handleMerchantStats is the seller dashboard header.
//
//	GET /api/merchant/stats
func (a *App) handleMerchantStats(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	stats, err := a.merchant.Stats(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, stats)
}

// handleMerchantOffers lists the seller's listings.
//
//	GET /api/merchant/offers
func (a *App) handleMerchantOffers(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	offers, err := a.merchant.Offers(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"offers": offers})
}

// handleMerchantUpsertOffer creates or updates a listing on an existing product.
//
//	POST /api/merchant/offers {"productId","platformSlug","regionCode","priceCents","basePriceCents","isActive"}
func (a *App) handleMerchantUpsertOffer(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	var in repo.OfferInput
	if err := DecodeJSON(w, r, &in); err != nil {
		WriteError(w, err)
		return
	}
	if in.PriceCents <= 0 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "priceCents must be positive"))
		return
	}
	if in.BasePriceCents != nil && *in.BasePriceCents < in.PriceCents {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body",
			"basePriceCents must be greater than or equal to priceCents"))
		return
	}

	offerID, err := a.merchant.UpsertOffer(r.Context(), user.UserID, in)
	if errors.Is(err, repo.ErrInvalidReference) {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_reference",
			"unknown product, platform or region"))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	offers, err := a.merchant.Offers(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"offerId": offerID, "offers": offers})
}

// handleMerchantUploadKeys bulk-uploads digital keys into one of the seller's
// offers.
//
//	POST /api/merchant/offers/{id}/keys {"bulk":"XXXX-YYYY-ZZZZ\nAAAA-BBBB-CCCC"}
func (a *App) handleMerchantUploadKeys(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	offerID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "offer id must be a number"))
		return
	}
	var body struct {
		Bulk  string   `json:"bulk"`
		Codes []string `json:"codes"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}

	codes := body.Codes
	if body.Bulk != "" {
		codes = append(codes, splitKeys(body.Bulk)...)
	}
	if len(codes) == 0 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "no keys found in the payload"))
		return
	}
	if len(codes) > 1000 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "upload at most 1000 keys at a time"))
		return
	}

	inserted, err := a.merchant.UploadKeys(r.Context(), user.UserID, offerID, codes)
	if errors.Is(err, repo.ErrNotFound) {
		WriteError(w, ErrNotFound)
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}

	offers, err := a.merchant.Offers(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{
		"inserted": inserted,
		"skipped":  len(codes) - inserted,
		"offers":   offers,
	})
}

// handleMerchantSales lists recent sales for the seller.
//
//	GET /api/merchant/sales
func (a *App) handleMerchantSales(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	sales, err := a.merchant.Sales(r.Context(), user.UserID, 25)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"sales": sales})
}

// handleMerchantRequests lists the seller's catalog proposals.
//
//	GET /api/merchant/requests
func (a *App) handleMerchantRequests(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	requests, err := a.merchant.Requests(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"requests": requests})
}

// handleMerchantCreateRequest proposes a new catalog title.
//
//	POST /api/merchant/requests {"title","description","coverUrl","platformSlug","regionCode","contentType"}
func (a *App) handleMerchantCreateRequest(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	var body struct {
		Title        string `json:"title"`
		Description  string `json:"description"`
		CoverURL     string `json:"coverUrl"`
		PlatformSlug string `json:"platformSlug"`
		RegionCode   string `json:"regionCode"`
		ContentType  string `json:"contentType"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}
	body.Title = strings.TrimSpace(body.Title)
	if len(body.Title) < 2 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "title is required"))
		return
	}
	// What kind of catalogue entry this is: a full game, a DLC, or a package that
	// includes the base game and its DLC.
	switch body.ContentType {
	case "", "full":
		body.ContentType = "full"
	case "dlc", "both":
	default:
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "contentType must be full, dlc or both"))
		return
	}

	req, err := a.merchant.CreateRequest(r.Context(), user.UserID, body.Title, body.Description,
		body.CoverURL, body.PlatformSlug, body.RegionCode, body.ContentType)
	if errors.Is(err, repo.ErrInvalidReference) {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_reference", "unknown platform or region"))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{"request": req})
}

// handleSearchProductsForPicker lets a merchant find a product to list against.
//
//	GET /api/merchant/products?q=elden
func (a *App) handleSearchProductsForPicker(w http.ResponseWriter, r *http.Request) {
	result, err := a.catalog.List(r.Context(), repo.CatalogFilter{
		Search:   r.URL.Query().Get("q"),
		Page:     1,
		PageSize: 12,
		Sort:     "relevance",
		// A product the admin just approved has no offers yet — which is exactly
		// when a merchant needs to find it here.
		IncludeUnlisted: true,
	})
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, result)
}

// splitKeys normalises a pasted key block into distinct uppercase codes.
func splitKeys(bulk string) []string {
	fields := strings.FieldsFunc(bulk, func(r rune) bool {
		return r == '\n' || r == '\r' || r == ',' || r == ';' || r == '\t' || r == ' '
	})
	seen := make(map[string]bool, len(fields))
	out := make([]string, 0, len(fields))
	for _, f := range fields {
		code := strings.ToUpper(strings.TrimSpace(f))
		if len(code) < 4 || seen[code] {
			continue
		}
		seen[code] = true
		out = append(out, code)
	}
	return out
}
