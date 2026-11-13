package httpx

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mindutis347/keyforge/backend/internal/repo"
)

type sample struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

func TestDecodeJSONStrictness(t *testing.T) {
	cases := []struct {
		name    string
		body    string
		wantErr bool
	}{
		{"valid", `{"name":"a","count":2}`, false},
		{"unknown field", `{"name":"a","count":2,"extra":1}`, true},
		{"trailing object", `{"name":"a","count":2}{"name":"b"}`, true},
		{"wrong type", `{"name":1,"count":2}`, true},
		{"empty", ``, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			var dst sample
			err := DecodeJSON(httptest.NewRecorder(), req, &dst)
			if tc.wantErr && err == nil {
				t.Fatal("expected an error")
			}
			if !tc.wantErr && err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}

func TestWriteErrorEnvelope(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
	}{
		{"api error", Errorf(http.StatusBadRequest, "invalid_body", "nope"), http.StatusBadRequest, "invalid_body"},
		{"not found sentinel", repo.ErrNotFound, http.StatusNotFound, "not_found"},
		{"unknown error", errors.New("boom"), http.StatusInternalServerError, "internal_error"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			WriteError(rec, tc.err)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
			body := rec.Body.String()
			if !strings.Contains(body, tc.wantCode) {
				t.Fatalf("body %q does not mention %q", body, tc.wantCode)
			}
			if tc.wantStatus == http.StatusInternalServerError && strings.Contains(body, "boom") {
				t.Fatal("internal error details leaked to the client")
			}
		})
	}
}

func TestCORSEchoesOnlyAllowedOrigins(t *testing.T) {
	handler := CORS([]string{"https://keyforge.vercel.app"})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	t.Run("allowed origin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/products", nil)
		req.Header.Set("Origin", "https://keyforge.vercel.app")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "https://keyforge.vercel.app" {
			t.Fatalf("allow-origin = %q", got)
		}
		if got := rec.Header().Get("Access-Control-Allow-Credentials"); got != "true" {
			t.Fatalf("allow-credentials = %q", got)
		}
	})

	t.Run("foreign origin", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/api/products", nil)
		req.Header.Set("Origin", "https://evil.example")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Fatalf("foreign origin was allowed: %q", got)
		}
	})

	t.Run("preflight", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodOptions, "/api/cart", nil)
		req.Header.Set("Origin", "https://keyforge.vercel.app")
		rec := httptest.NewRecorder()
		handler.ServeHTTP(rec, req)

		if rec.Code != http.StatusNoContent {
			t.Fatalf("preflight status = %d", rec.Code)
		}
	})
}

func TestRequireRole(t *testing.T) {
	guard := requireRole(RoleAdmin)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	cases := []struct {
		name       string
		principal  *Principal
		wantStatus int
	}{
		{"anonymous", nil, http.StatusUnauthorized},
		{"customer", &Principal{UserID: 1, Role: RoleCustomer}, http.StatusForbidden},
		{"merchant", &Principal{UserID: 2, Role: RoleMerchant}, http.StatusForbidden},
		{"admin", &Principal{UserID: 3, Role: RoleAdmin}, http.StatusOK},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
			if tc.principal != nil {
				req = req.WithContext(withUser(req.Context(), tc.principal))
			}
			rec := httptest.NewRecorder()
			guard.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("status = %d, want %d", rec.Code, tc.wantStatus)
			}
		})
	}
}
