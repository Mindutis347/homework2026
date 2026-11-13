package httpx

import (
	"context"
	"log/slog"
	"net/http"
	"runtime/debug"
	"slices"
	"time"
)

type ctxKey string

const (
	ctxUser  ctxKey = "user"
	ctxReqID ctxKey = "request_id"
)

// Middleware is the standard decorator shape so handlers can be wrapped freely.
type Middleware func(http.Handler) http.Handler

// Chain applies middleware so that the first argument is the outermost layer.
func Chain(h http.Handler, mw ...Middleware) http.Handler {
	for i := len(mw) - 1; i >= 0; i-- {
		h = mw[i](h)
	}
	return h
}

// statusRecorder captures the status code for access logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusRecorder) Write(b []byte) (int, error) {
	if s.status == 0 {
		s.status = http.StatusOK
	}
	n, err := s.ResponseWriter.Write(b)
	s.bytes += n
	return n, err
}

// LogRequests emits one structured line per request with latency.
func LogRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)
		if rec.status == 0 {
			rec.status = http.StatusOK
		}
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"bytes", rec.bytes,
			"duration", time.Since(start).Round(time.Microsecond).String(),
		)
	})
}

// Recover turns a panic into a 500 instead of killing the connection, and logs
// the stack for debugging.
func Recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				slog.Error("panic recovered", "panic", rec, "stack", string(debug.Stack()))
				WriteError(w, Errorf(http.StatusInternalServerError, "internal_error", "something went wrong"))
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// CORS allows the SPA (a different origin on Vercel) to call the API with
// cookies. Credentials mode forbids "*", so the origin is echoed only when it
// is on the allow-list.
func CORS(allowedOrigins []string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && slices.Contains(allowedOrigins, origin) {
				h := w.Header()
				h.Set("Access-Control-Allow-Origin", origin)
				h.Set("Access-Control-Allow-Credentials", "true")
				h.Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Content-Type, Idempotency-Key")
				h.Set("Access-Control-Max-Age", "600")
				h.Add("Vary", "Origin")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// withUser stores the authenticated principal for downstream handlers.
func withUser(ctx context.Context, u *Principal) context.Context {
	return context.WithValue(ctx, ctxUser, u)
}

// UserFrom returns the authenticated principal, or nil for anonymous requests.
func UserFrom(ctx context.Context) *Principal {
	u, _ := ctx.Value(ctxUser).(*Principal)
	return u
}
