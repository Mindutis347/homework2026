package httpx

import (
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mindutis347/keyforge/backend/internal/auth"
	"github.com/mindutis347/keyforge/backend/internal/config"
	"github.com/mindutis347/keyforge/backend/internal/repo"
	"github.com/mindutis347/keyforge/backend/internal/service"
)

// sessionTTL is how long a signed-in session stays valid.
const sessionTTL = 7 * 24 * time.Hour

// App owns the process-scoped dependencies (config, connection pool, repos) and
// exposes the HTTP surface. Handlers hang off it as methods, which keeps
// dependency passing explicit instead of global.
type App struct {
	cfg      config.Config
	pool     *pgxpool.Pool
	issuer   *auth.Issuer
	catalog  *repo.Catalog
	homepage *repo.Homepage
	users    *repo.Users
	cart     *repo.Cart
	orders   *repo.Orders
	checkout *service.Checkout
	merchant *repo.Merchant
	admin    *repo.Admin
}

func NewApp(cfg config.Config, pool *pgxpool.Pool) *App {
	return &App{
		cfg:      cfg,
		pool:     pool,
		issuer:   auth.NewIssuer(cfg.JWTSecret, sessionTTL),
		catalog:  repo.NewCatalog(pool),
		homepage: repo.NewHomepage(pool),
		users:    repo.NewUsers(pool),
		cart:     repo.NewCart(pool),
		orders:   repo.NewOrders(pool),
		checkout: service.NewCheckout(pool),
		merchant: repo.NewMerchant(pool),
		admin:    repo.NewAdmin(pool),
	}
}

// Routes builds the mux. Go 1.22 method+path patterns let the stdlib router
// handle everything here, so there is no third-party router to justify.
func (a *App) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", a.handleHealth)

	// Catalog & content (public)
	mux.HandleFunc("GET /api/meta", a.handleMeta)
	mux.HandleFunc("GET /api/homepage", a.handleHomepage)
	mux.HandleFunc("GET /api/products", a.handleListProducts)
	mux.HandleFunc("GET /api/products/{slug}", a.handleGetProduct)
	mux.HandleFunc("GET /api/search", a.handleSearch)

	// Authentication
	mux.HandleFunc("POST /api/auth/register", a.handleRegister)
	mux.HandleFunc("POST /api/auth/verify", a.handleVerify)
	mux.HandleFunc("POST /api/auth/resend", a.handleResendCode)
	mux.HandleFunc("POST /api/auth/login", a.handleLogin)
	mux.HandleFunc("POST /api/auth/logout", a.handleLogout)
	mux.HandleFunc("GET /api/auth/me", a.handleMe)
	mux.HandleFunc("GET /api/dev/inbox", a.handleDevInbox)

	// Cart — signing in is enough, verification is checked at checkout
	mux.Handle("GET /api/cart", authUser(a.handleGetCart))
	mux.Handle("POST /api/cart", authUser(a.handleAddToCart))
	mux.Handle("PATCH /api/cart/{offerId}", authUser(a.handleUpdateCartItem))
	mux.Handle("DELETE /api/cart/{offerId}", authUser(a.handleRemoveCartItem))
	mux.Handle("DELETE /api/cart", authUser(a.handleClearCart))

	// Checkout & order history — verified accounts only
	mux.Handle("POST /api/checkout", verifiedUser(a.handleCheckout))
	mux.Handle("GET /api/orders", authUser(a.handleListOrders))
	mux.Handle("GET /api/orders/{id}", authUser(a.handleGetOrder))
	mux.Handle("POST /api/tickets", verifiedUser(a.handleCreateTicket))

	// Merchant portal
	mux.Handle("GET /api/merchant/stats", merchantOnly(a.handleMerchantStats))
	mux.Handle("GET /api/merchant/offers", merchantOnly(a.handleMerchantOffers))
	mux.Handle("POST /api/merchant/offers", merchantOnly(a.handleMerchantUpsertOffer))
	mux.Handle("POST /api/merchant/offers/{id}/keys", merchantOnly(a.handleMerchantUploadKeys))
	mux.Handle("GET /api/merchant/sales", merchantOnly(a.handleMerchantSales))
	mux.Handle("GET /api/merchant/products", merchantOnly(a.handleSearchProductsForPicker))
	mux.Handle("GET /api/merchant/requests", merchantOnly(a.handleMerchantRequests))
	mux.Handle("POST /api/merchant/requests", merchantOnly(a.handleMerchantCreateRequest))

	// Admin back-office
	mux.Handle("GET /api/admin/users", adminOnly(a.handleAdminUsers))
	mux.Handle("PATCH /api/admin/users/{id}/role", adminOnly(a.handleAdminSetRole))
	mux.Handle("GET /api/admin/requests", adminOnly(a.handleAdminRequests))
	mux.Handle("POST /api/admin/requests/{id}/review", adminOnly(a.handleAdminReviewRequest))
	mux.Handle("GET /api/admin/summary", adminOnly(a.handleAdminSummary))
	mux.Handle("GET /api/admin/orders", adminOnly(a.handleAdminOrders))
	mux.Handle("GET /api/admin/tickets", adminOnly(a.handleAdminTickets))
	mux.Handle("PATCH /api/admin/tickets/{id}", adminOnly(a.handleAdminUpdateTicket))
	mux.Handle("GET /api/admin/blocks", adminOnly(a.handleAdminBlocks))
	mux.Handle("POST /api/admin/blocks", adminOnly(a.handleAdminCreateBlock))
	mux.Handle("PATCH /api/admin/blocks/{id}", adminOnly(a.handleAdminUpdateBlock))
	mux.Handle("DELETE /api/admin/blocks/{id}", adminOnly(a.handleAdminDeleteBlock))

	var h http.Handler = mux
	// Outermost first: panic recovery, access log, CORS, then cookie -> principal.
	return Chain(h, Recover, LogRequests, CORS(a.cfg.AllowedOrigins), a.authenticate)
}

func (a *App) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := a.pool.Ping(r.Context()); err != nil {
		WriteError(w, Errorf(http.StatusServiceUnavailable, "db_unavailable", "database unreachable"))
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "keyforge-api"})
}
