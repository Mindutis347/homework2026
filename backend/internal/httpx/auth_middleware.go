package httpx

import (
	"errors"
	"net/http"
	"strconv"
)

const sessionCookie = "kf_session"

// setSessionCookie writes the JWT as an httpOnly cookie. The SPA never reads
// it, so an XSS bug cannot exfiltrate the token.
//
// SameSite:Lax suits local development (same site via Vite's proxy). When
// COOKIE_SECURE is on — production, where the SPA is on Vercel and the API on
// Render, i.e. cross-site — SameSite must be None with Secure, otherwise the
// browser drops the cookie on XHR.
func (a *App) setSessionCookie(w http.ResponseWriter, token string) {
	sameSite := http.SameSiteLaxMode
	if a.cfg.CookieSecure {
		sameSite = http.SameSiteNoneMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cfg.CookieSecure,
		SameSite: sameSite,
		MaxAge:   int(a.issuer.TTL().Seconds()),
	})
}

func (a *App) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookie,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   a.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// authenticate is the optional layer: it never rejects, it just attaches the
// principal when the cookie is valid. Authorisation is a separate decision.
func (a *App) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(sessionCookie)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}
		claims, err := a.issuer.Parse(cookie.Value)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}
		id, err := strconv.ParseInt(claims.Subject, 10, 64)
		if err != nil {
			next.ServeHTTP(w, r)
			return
		}
		next.ServeHTTP(w, r.WithContext(withUser(r.Context(), &Principal{
			UserID:      id,
			Email:       claims.Email,
			Role:        claims.Role,
			IsVerified:  claims.IsVerified,
			DisplayName: claims.Email,
		})))
	})
}

// requireAuth rejects anonymous requests.
func requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if UserFrom(r.Context()) == nil {
			WriteError(w, ErrUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireVerified rejects signed-in users who never confirmed their e-mail.
// Checkout and merchant tools sit behind this.
func requireVerified(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u := UserFrom(r.Context())
		if u == nil {
			WriteError(w, ErrUnauthorized)
			return
		}
		if !u.IsVerified {
			WriteError(w, Errorf(http.StatusForbidden, "email_unverified",
				"confirm your e-mail address to continue"))
			return
		}
		next.ServeHTTP(w, r)
	})
}

// requireRole gates a route on a minimum role. Admin implies merchant.
func requireRole(role string) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u := UserFrom(r.Context())
			if u == nil {
				WriteError(w, ErrUnauthorized)
				return
			}
			allowed := false
			switch role {
			case RoleAdmin:
				allowed = u.IsAdmin()
			case RoleMerchant:
				allowed = u.IsMerchant()
			default:
				allowed = true
			}
			if !allowed {
				WriteError(w, ErrForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// errStaleToken is used by handlers that re-read the user from the database.
var errStaleToken = errors.New("stale token")

// Route guards, composed once so the route table reads like a policy summary.
func authUser(h http.HandlerFunc) http.Handler { return requireAuth(h) }

func verifiedUser(h http.HandlerFunc) http.Handler { return requireVerified(h) }

func merchantOnly(h http.HandlerFunc) http.Handler {
	return requireVerified(requireRole(RoleMerchant)(h))
}

func adminOnly(h http.HandlerFunc) http.Handler {
	return requireVerified(requireRole(RoleAdmin)(h))
}
