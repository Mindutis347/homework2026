package httpx

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/mindutis347/keyforge/backend/internal/repo"
)

// APIError is the single error envelope the API returns:
//
//	{"error": {"code": "not_found", "message": "product not found"}}
type APIError struct {
	Status  int    `json:"-"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

func (e *APIError) Error() string { return e.Message }

func Errorf(status int, code, message string) *APIError {
	return &APIError{Status: status, Code: code, Message: message}
}

var (
	ErrUnauthorized = Errorf(http.StatusUnauthorized, "unauthorized", "sign in to continue")
	ErrForbidden    = Errorf(http.StatusForbidden, "forbidden", "you do not have access to this resource")
	ErrNotFound     = Errorf(http.StatusNotFound, "not_found", "resource not found")
	ErrConflict     = Errorf(http.StatusConflict, "conflict", "resource already exists")
)

// WriteJSON serialises v and writes it with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if v == nil || status == http.StatusNoContent {
		return
	}
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// The status line is already sent, so all we can do is log.
		slog.Error("encode response", "error", err)
	}
}

// WriteError maps any error to the API error envelope, translating the repo's
// not-found sentinel so handlers never repeat the same HTTP mapping.
func WriteError(w http.ResponseWriter, err error) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		WriteJSON(w, apiErr.Status, map[string]any{"error": apiErr})
		return
	}
	if errors.Is(err, repo.ErrNotFound) {
		WriteJSON(w, http.StatusNotFound, map[string]any{"error": ErrNotFound})
		return
	}
	slog.Error("unhandled handler error", "error", err)
	WriteJSON(w, http.StatusInternalServerError, map[string]any{
		"error": map[string]string{"code": "internal_error", "message": "something went wrong"},
	})
}

// DecodeJSON reads a JSON request body into dst, rejecting unknown fields and
// trailing garbage so typos in client payloads fail loudly.
func DecodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	return DecodeJSONMax(w, r, dst, 1<<20)
}

// DecodeJSONMax is DecodeJSON with a caller-chosen size ceiling. Uploads need a
// larger one than ordinary forms, and the cap belongs to the handler that knows
// what it is accepting.
func DecodeJSONMax(w http.ResponseWriter, r *http.Request, dst any, maxBytes int64) error {
	if r.Body == nil {
		return Errorf(http.StatusBadRequest, "invalid_body", "request body is required")
	}
	dec := json.NewDecoder(io.LimitReader(r.Body, maxBytes))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return Errorf(http.StatusBadRequest, "invalid_body", "malformed JSON: "+err.Error())
	}
	if err := dec.Decode(&struct{}{}); err != io.EOF {
		return Errorf(http.StatusBadRequest, "invalid_body", "request body must contain a single JSON object")
	}
	return nil
}
