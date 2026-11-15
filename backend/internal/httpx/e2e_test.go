package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/mindutis347/keyforge/backend/internal/config"
	"github.com/mindutis347/keyforge/backend/internal/db"
	"github.com/mindutis347/keyforge/backend/migrations"
	"github.com/mindutis347/keyforge/backend/seed"
)

// TestEndToEndPurchaseFlow is the assignment's smoke test: it boots the real
// router against a real Postgres, then walks the whole flow a buyer takes —
// browse -> product -> register -> verify -> cart -> checkout -> keys -> history
// — plus the idempotency replay.
//
// It is skipped unless TEST_DATABASE_URL is set. Point it at a throwaway Neon
// branch, NOT at the production database: seeding and orders are written for real.
//
//	TEST_DATABASE_URL='postgres://...' go test ./internal/httpx -run EndToEnd -v
func TestEndToEndPurchaseFlow(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run the end-to-end flow")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(ctx, pool, migrations.FS); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	games, err := seed.Catalog()
	if err != nil {
		t.Fatalf("load seed catalog: %v", err)
	}
	secret := []byte("integration-test-secret-value")
	if err := db.Seed(ctx, pool, games, secret); err != nil {
		t.Fatalf("seed: %v", err)
	}

	cfg := config.Config{
		JWTSecret:      secret,
		CookieSecure:   false,
		ShowDevCodes:   true,
		AllowedOrigins: []string{"http://localhost:5173"},
	}
	server := httptest.NewServer(NewApp(cfg, pool).Routes())
	defer server.Close()

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookie jar: %v", err)
	}
	client := &http.Client{Jar: jar, Timeout: 30 * time.Second}

	// --- public catalog -----------------------------------------------------
	var homepage struct {
		Blocks []struct {
			Key      string `json:"key"`
			Type     string `json:"type"`
			Products []struct {
				Slug string `json:"slug"`
			} `json:"products"`
		} `json:"blocks"`
	}
	getJSON(t, client, server.URL+"/api/homepage", &homepage)
	if len(homepage.Blocks) == 0 {
		t.Fatal("homepage returned no blocks")
	}
	for _, block := range homepage.Blocks {
		if block.Key == "" || block.Type == "" {
			t.Fatalf("homepage block is missing key/type: %+v", block)
		}
	}

	var listing struct {
		Items []struct {
			Slug          string   `json:"slug"`
			Title         string   `json:"title"`
			MinPriceCents int      `json:"minPriceCents"`
			Platforms     []string `json:"platforms"`
		} `json:"items"`
		Total int `json:"total"`
	}
	getJSON(t, client, server.URL+"/api/products?pageSize=5&sort=popular", &listing)
	if len(listing.Items) == 0 || listing.Total == 0 {
		t.Fatal("catalog returned no products")
	}
	if listing.Items[0].MinPriceCents <= 0 {
		t.Fatalf("product %q has no price", listing.Items[0].Slug)
	}

	slug := listing.Items[0].Slug
	var detail struct {
		Slug   string `json:"slug"`
		Offers []struct {
			ID         int64 `json:"id"`
			PriceCents int   `json:"priceCents"`
			Stock      int   `json:"stock"`
			Seller     struct {
				StoreName string `json:"storeName"`
			} `json:"seller"`
		} `json:"offers"`
	}
	getJSON(t, client, server.URL+"/api/products/"+slug, &detail)
	if len(detail.Offers) == 0 {
		t.Fatalf("product %q has no offers", slug)
	}
	offer := detail.Offers[0]

	// Typo-tolerant search: drop one letter from the title and expect a hit.
	if len(detail.Slug) > 3 {
		typo := strings.ToLower(detail.Slug[:len(detail.Slug)-1])
		var suggestions struct {
			Items []struct {
				Slug string `json:"slug"`
			} `json:"items"`
		}
		getJSON(t, client, server.URL+"/api/search?q="+typo, &suggestions)
		if len(suggestions.Items) == 0 {
			t.Fatalf("typo search for %q returned nothing", typo)
		}
	}

	// Filtering must actually narrow the catalog and stay self-consistent.
	var filtered struct {
		Items []struct {
			Platforms []string `json:"platforms"`
		} `json:"items"`
	}
	platform := listing.Items[0].Platforms[0]
	getJSON(t, client, server.URL+"/api/products?platform="+platform+"&pageSize=10", &filtered)
	for _, item := range filtered.Items {
		found := false
		for _, p := range item.Platforms {
			if p == platform {
				found = true
			}
		}
		if !found {
			t.Fatalf("platform filter %q leaked a product without that platform", platform)
		}
	}

	// --- registration + verification ---------------------------------------
	email := fmt.Sprintf("e2e-%d@keyforge.test", time.Now().UnixNano())
	var registered struct {
		User struct {
			ID         int64 `json:"id"`
			IsVerified bool  `json:"isVerified"`
		} `json:"user"`
		DevCode string `json:"devCode"`
	}
	postJSON(t, client, server.URL+"/api/auth/register",
		map[string]string{"email": email, "password": "TestPassword#1", "displayName": "E2E Buyer"},
		http.StatusCreated, &registered)
	if registered.DevCode == "" {
		t.Fatal("registration did not return a verification code")
	}
	if registered.User.IsVerified {
		t.Fatal("new account should start unverified")
	}

	// Signing in before verifying must be possible, but checkout must be blocked.
	postJSON(t, client, server.URL+"/api/auth/login",
		map[string]string{"email": email, "password": "TestPassword#1"}, http.StatusOK, nil)
	postJSON(t, client, server.URL+"/api/checkout", map[string]string{},
		http.StatusForbidden, nil)

	var verified struct {
		User struct {
			IsVerified bool `json:"isVerified"`
		} `json:"user"`
	}
	postJSON(t, client, server.URL+"/api/auth/verify",
		map[string]string{"email": email, "code": registered.DevCode},
		http.StatusOK, &verified)
	if !verified.User.IsVerified {
		t.Fatal("verification did not flip is_verified")
	}

	// --- cart ---------------------------------------------------------------
	var cart struct {
		ItemCount     int `json:"itemCount"`
		SubtotalCents int `json:"subtotalCents"`
	}
	postJSON(t, client, server.URL+"/api/cart",
		map[string]any{"offerId": offer.ID, "quantity": 1}, http.StatusOK, &cart)
	if cart.ItemCount != 1 || cart.SubtotalCents != offer.PriceCents {
		t.Fatalf("cart totals are wrong: %+v (offer price %d)", cart, offer.PriceCents)
	}

	// --- checkout -----------------------------------------------------------
	idempotencyKey := fmt.Sprintf("e2e-%d", time.Now().UnixNano())
	var checkout struct {
		Order struct {
			ID             int64  `json:"id"`
			Reference      string `json:"reference"`
			Status         string `json:"status"`
			SubtotalCents  int    `json:"subtotalCents"`
			TaxCents       int    `json:"taxCents"`
			TaxBasisPoints int    `json:"taxBasisPoints"`
			TotalCents     int    `json:"totalCents"`
			Items          []struct {
				ID          int64      `json:"id"`
				Refundable  bool       `json:"refundable"`
				DisplayedAt *time.Time `json:"displayedAt"`
				Keys        []struct {
					ID          int64      `json:"id"`
					DisplayedAt *time.Time `json:"displayedAt"`
				} `json:"keys"`
			} `json:"items"`
		} `json:"order"`
		Replayed bool `json:"replayed"`
	}
	postJSONWithKey(t, client, server.URL+"/api/checkout", map[string]string{
		"cardNumber": "4242 4242 4242 4242",
	}, idempotencyKey, http.StatusCreated, &checkout)

	if checkout.Order.Status != "paid" {
		t.Fatalf("order status = %q, want paid", checkout.Order.Status)
	}
	if len(checkout.Order.Items) != 1 || len(checkout.Order.Items[0].Keys) != 1 {
		t.Fatalf("expected exactly one delivered key, got %+v", checkout.Order.Items)
	}
	// The subtotal is the seller's price; the total adds the configured purchase tax
	// for a card payment (migration 0006 introduced it, so this assertion has to
	// reconcile against the rate the order recorded rather than assume zero).
	if checkout.Order.SubtotalCents != offer.PriceCents {
		t.Fatalf("order subtotal %d != offer price %d", checkout.Order.SubtotalCents, offer.PriceCents)
	}
	// The API rounds the tax to the nearest cent; integer division would truncate.
	wantTax := (offer.PriceCents*checkout.Order.TaxBasisPoints + 5000) / 10000
	if checkout.Order.TaxCents != wantTax {
		t.Fatalf("order tax %d != %d at %d bp", checkout.Order.TaxCents, wantTax, checkout.Order.TaxBasisPoints)
	}
	if checkout.Order.TotalCents != checkout.Order.SubtotalCents+checkout.Order.TaxCents {
		t.Fatalf("order total %d != subtotal %d + tax %d",
			checkout.Order.TotalCents, checkout.Order.SubtotalCents, checkout.Order.TaxCents)
	}
	item := checkout.Order.Items[0]
	if !item.Refundable || item.DisplayedAt != nil || item.Keys[0].DisplayedAt != nil {
		t.Fatalf("a fresh purchase must be refundable and undisclosed: %+v", item)
	}

	// Replaying the same idempotency key must not create a second order.
	var replay struct {
		Order struct {
			ID        int64  `json:"id"`
			Reference string `json:"reference"`
		} `json:"order"`
		Replayed bool `json:"replayed"`
	}
	postJSONWithKey(t, client, server.URL+"/api/checkout", map[string]string{
		"cardNumber": "4242 4242 4242 4242",
	}, idempotencyKey, http.StatusOK, &replay)
	if !replay.Replayed || replay.Order.ID != checkout.Order.ID {
		t.Fatalf("idempotent retry created a new order: %+v", replay)
	}

	// A second checkout with an empty cart must fail cleanly.
	postJSONWithKey(t, client, server.URL+"/api/checkout", map[string]string{
		"cardNumber": "4242 4242 4242 4242",
	}, "e2e-empty-"+idempotencyKey, http.StatusBadRequest, nil)

	// --- key disclosure ------------------------------------------------------
	// A key value must not appear in any order payload; the codes arrive only when
	// the buyer explicitly asks, which is what stops a page-level sniff of them.
	var revealed struct {
		Keys        []string   `json:"keys"`
		DisplayedAt *time.Time `json:"displayedAt"`
	}
	postJSON(t, client, fmt.Sprintf("%s/api/orders/%d/items/%d/reveal", server.URL, checkout.Order.ID, item.ID),
		nil, http.StatusOK, &revealed)
	if len(revealed.Keys) != 1 || !strings.Contains(revealed.Keys[0], "-") {
		t.Fatalf("reveal did not return exactly one key: %+v", revealed)
	}
	if revealed.DisplayedAt == nil {
		t.Fatalf("reveal did not record a display timestamp")
	}
	key := revealed.Keys[0]

	historyResp, err := client.Get(server.URL + "/api/orders")
	if err != nil {
		t.Fatalf("GET /api/orders: %v", err)
	}
	historyBody, _ := io.ReadAll(historyResp.Body)
	historyResp.Body.Close()
	if strings.Contains(string(historyBody), key) {
		t.Fatalf("order history leaked the key value %q in its payload", key)
	}
	if !strings.Contains(string(historyBody), `"displayedAt"`) {
		t.Fatalf("order history does not describe key display state: %s", historyBody)
	}

	// Once shown, the line can no longer be refunded.
	refundURL := fmt.Sprintf("%s/api/orders/%d/items/%d/refund", server.URL, checkout.Order.ID, item.ID)
	postJSON(t, client, refundURL, nil, http.StatusConflict, nil)

	var soldKeys int
	var displayedSold bool
	if err := pool.QueryRow(ctx, `
		SELECT count(*), bool_and(displayed_at IS NOT NULL)
		FROM inventory_keys WHERE key_code = $1 AND status = 'sold'`, key,
	).Scan(&soldKeys, &displayedSold); err != nil {
		t.Fatalf("query key state: %v", err)
	}
	if soldKeys != 1 || !displayedSold {
		t.Fatalf("key should be sold and stamped as displayed (sold=%d displayed=%v)", soldKeys, displayedSold)
	}

	// --- refunding an undisclosed line ---------------------------------------
	var stockBefore int
	if err := pool.QueryRow(ctx, `SELECT stock FROM offers WHERE id = $1`, offer.ID).Scan(&stockBefore); err != nil {
		t.Fatalf("query stock: %v", err)
	}
	postJSON(t, client, server.URL+"/api/cart",
		map[string]any{"offerId": offer.ID, "quantity": 1}, http.StatusOK, nil)

	var second struct {
		Order struct {
			ID    int64 `json:"id"`
			Items []struct {
				ID int64 `json:"id"`
			} `json:"items"`
		} `json:"order"`
	}
	postJSONWithKey(t, client, server.URL+"/api/checkout", map[string]string{
		"cardNumber": "4242 4242 4242 4242",
	}, "e2e-refund-"+idempotencyKey, http.StatusCreated, &second)
	secondItemID := second.Order.Items[0].ID

	var refunded struct {
		Order struct {
			Status     string `json:"status"`
			TotalCents int    `json:"totalCents"`
			Items      []struct {
				Refunded   bool `json:"refunded"`
				Refundable bool `json:"refundable"`
				Keys       []struct {
					ID int64 `json:"id"`
				} `json:"keys"`
			} `json:"items"`
		} `json:"order"`
	}
	postJSON(t, client,
		fmt.Sprintf("%s/api/orders/%d/items/%d/refund", server.URL, second.Order.ID, secondItemID),
		nil, http.StatusOK, &refunded)
	if refunded.Order.Status != "refunded" || refunded.Order.TotalCents != 0 {
		t.Fatalf("fully refunded order should be zeroed: %+v", refunded.Order)
	}
	if !refunded.Order.Items[0].Refunded || refunded.Order.Items[0].Refundable || len(refunded.Order.Items[0].Keys) != 0 {
		t.Fatalf("refunded line still looks active: %+v", refunded.Order.Items[0])
	}

	var stockAfter, keysHeld int
	if err := pool.QueryRow(ctx, `SELECT stock FROM offers WHERE id = $1`, offer.ID).Scan(&stockAfter); err != nil {
		t.Fatalf("query stock: %v", err)
	}
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM inventory_keys WHERE order_item_id = $1`, secondItemID).Scan(&keysHeld); err != nil {
		t.Fatalf("query released keys: %v", err)
	}
	if stockAfter != stockBefore || keysHeld != 0 {
		t.Fatalf("refund did not return the key to stock (stock %d -> %d, keys still held %d)",
			stockBefore, stockAfter, keysHeld)
	}

	// --- history & cart invariants ------------------------------------------
	var history struct {
		Orders []struct {
			Reference string `json:"reference"`
		} `json:"orders"`
	}
	getJSON(t, client, server.URL+"/api/orders", &history)
	if len(history.Orders) != 2 {
		t.Fatalf("order history should hold both purchases: %+v", history.Orders)
	}

	var cartRows int
	if err := pool.QueryRow(ctx,
		`SELECT count(*) FROM cart_items WHERE user_id = $1`, registered.User.ID,
	).Scan(&cartRows); err != nil {
		t.Fatalf("query cart: %v", err)
	}
	if cartRows != 0 {
		t.Fatalf("cart was not cleared after checkout")
	}
}

// --- helpers ---------------------------------------------------------------

func getJSON(t *testing.T, client *http.Client, url string, dst any) {
	t.Helper()
	resp, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		t.Fatalf("GET %s: status %d: %s", url, resp.StatusCode, body)
	}
	if dst != nil {
		if err := json.NewDecoder(resp.Body).Decode(dst); err != nil {
			t.Fatalf("GET %s: decode: %v", url, err)
		}
	}
}

func postJSON(t *testing.T, client *http.Client, url string, body any, wantStatus int, dst any) {
	t.Helper()
	postJSONWithKey(t, client, url, body, "", wantStatus, dst)
}

func postJSONWithKey(t *testing.T, client *http.Client, url string, body any, idempotencyKey string, wantStatus int, dst any) {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		req.Header.Set("Idempotency-Key", idempotencyKey)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("POST %s: %v", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != wantStatus {
		payload, _ := io.ReadAll(resp.Body)
		t.Fatalf("POST %s: status %d, want %d: %s", url, resp.StatusCode, wantStatus, payload)
	}
	if dst != nil {
		if err := json.NewDecoder(resp.Body).Decode(dst); err != nil {
			t.Fatalf("POST %s: decode: %v", url, err)
		}
	}
}
