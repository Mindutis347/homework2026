package httpx

import (
	"context"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/mindutis347/keyforge/backend/internal/config"
	"github.com/mindutis347/keyforge/backend/internal/db"
)

// TestMerchantCatalogRequestFlow covers the path a seller takes when a game is
// missing from the catalogue: propose it, see it in their own list, have an
// admin approve it, then see it as a live catalogue title.
//
// The list call is the regression this test exists for: adding the content type
// to the query without adding it to the scan destinations made
// GET /api/merchant/requests answer 500 for every seller.
func TestMerchantCatalogRequestFlow(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run the merchant request flow")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	server := httptest.NewServer(NewApp(config.Config{
		JWTSecret:      []byte("integration-test-secret-value"),
		ShowDevCodes:   true,
		AllowedOrigins: []string{"http://localhost:5173"},
	}, pool).Routes())
	defer server.Close()

	// A seller session and an admin session, each with its own cookie jar.
	newClient := func(email, password string) *http.Client {
		t.Helper()
		jar, err := cookiejar.New(nil)
		if err != nil {
			t.Fatalf("cookie jar: %v", err)
		}
		client := &http.Client{Jar: jar, Timeout: 30 * time.Second}
		postJSON(t, client, server.URL+"/api/auth/login",
			map[string]string{"email": email, "password": password}, http.StatusOK, nil)
		return client
	}
	seller := newClient("seller1@keyforge.dev", "Seller#2026")
	admin := newClient("admin@keyforge.dev", "Admin#2026")

	// The list must answer before anything is proposed — this is where the
	// mismatched scan used to fail.
	var before struct {
		Requests []struct {
			ID          int64  `json:"id"`
			Status      string `json:"status"`
			ContentType string `json:"contentType"`
		} `json:"requests"`
	}
	getJSON(t, seller, server.URL+"/api/merchant/requests", &before)

	title := fmt.Sprintf("Probe Title %d", time.Now().UnixNano())
	var created struct {
		Request struct {
			ID          int64  `json:"id"`
			Status      string `json:"status"`
			ContentType string `json:"contentType"`
			Title       string `json:"title"`
		} `json:"request"`
	}
	postJSON(t, seller, server.URL+"/api/merchant/requests", map[string]string{
		"title": title, "description": "Filed by the integration test.",
		"coverUrl": "", "platformSlug": "steam", "regionCode": "GLOBAL", "contentType": "dlc",
	}, http.StatusCreated, &created)
	if created.Request.Status != "pending" {
		t.Fatalf("new request status = %q, want pending", created.Request.Status)
	}
	if created.Request.ContentType != "dlc" {
		t.Fatalf("contentType = %q, want dlc", created.Request.ContentType)
	}

	// It must appear in the seller's own list with its content type intact.
	var listed struct {
		Requests []struct {
			ID          int64   `json:"id"`
			Title       string  `json:"title"`
			ContentType string  `json:"contentType"`
			Status      string  `json:"status"`
			ProductSlug *string `json:"productSlug"`
		} `json:"requests"`
	}
	getJSON(t, seller, server.URL+"/api/merchant/requests", &listed)
	found := false
	for _, request := range listed.Requests {
		if request.ID == created.Request.ID {
			found = true
			if request.ContentType != "dlc" {
				t.Fatalf("listed contentType = %q, want dlc", request.ContentType)
			}
		}
	}
	if !found {
		t.Fatalf("request %d missing from the seller's list", created.Request.ID)
	}

	// Admin approval turns it into a catalogue title.
	var reviewed struct {
		Request struct {
			Status      string  `json:"status"`
			ProductSlug *string `json:"productSlug"`
		} `json:"request"`
	}
	postJSON(t, admin, fmt.Sprintf("%s/api/admin/requests/%d/review", server.URL, created.Request.ID),
		map[string]any{"approve": true, "note": "integration test"}, http.StatusOK, &reviewed)
	if reviewed.Request.Status != "approved" {
		t.Fatalf("status after approval = %q, want approved", reviewed.Request.Status)
	}
	if reviewed.Request.ProductSlug == nil || *reviewed.Request.ProductSlug == "" {
		t.Fatalf("approved request has no product slug: %+v", reviewed.Request)
	}

	// The approved title is now a real product with its content type.
	var product struct {
		ID          int64  `json:"id"`
		Title       string `json:"title"`
		ContentType string `json:"contentType"`
	}
	getJSON(t, admin, server.URL+"/api/products/"+*reviewed.Request.ProductSlug, &product)
	if product.Title != title {
		t.Fatalf("approved product title = %q, want %q", product.Title, title)
	}
	if product.ContentType != "dlc" {
		t.Fatalf("approved product contentType = %q, want dlc", product.ContentType)
	}
}
