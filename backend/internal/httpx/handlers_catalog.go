package httpx

import (
	"net/http"
	"strconv"

	"github.com/mindutis347/keyforge/backend/internal/repo"
)

// intParam reads an optional integer query parameter.
func intParam(r *http.Request, key string) (*int, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return nil, nil
	}
	v, err := strconv.Atoi(raw)
	if err != nil {
		return nil, Errorf(http.StatusBadRequest, "invalid_query", key+" must be an integer")
	}
	return &v, nil
}

// handleListProducts serves the store catalog.
//
//	GET /api/products?q=&platform=&region=&genre=&minPriceCents=&maxPriceCents=
//	                 &sort=popular|price_asc|price_desc|newest|discount|title|relevance
//	                 &page=1&pageSize=24
func (a *App) handleListProducts(w http.ResponseWriter, r *http.Request) {
	filter := repo.CatalogFilter{
		Search:   r.URL.Query().Get("q"),
		Platform: r.URL.Query().Get("platform"),
		Region:   r.URL.Query().Get("region"),
		Genre:    r.URL.Query().Get("genre"),
		Sort:     r.URL.Query().Get("sort"),
		Page:     1,
		PageSize: 24,
	}

	var err error
	if filter.MinPriceCents, err = intParam(r, "minPriceCents"); err != nil {
		WriteError(w, err)
		return
	}
	if filter.MaxPriceCents, err = intParam(r, "maxPriceCents"); err != nil {
		WriteError(w, err)
		return
	}
	if filter.Page, err = strconv.Atoi(defaultStr(r.URL.Query().Get("page"), "1")); err != nil || filter.Page < 1 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_query", "page must be a positive integer"))
		return
	}
	if filter.PageSize, err = strconv.Atoi(defaultStr(r.URL.Query().Get("pageSize"), "24")); err != nil ||
		filter.PageSize < 1 || filter.PageSize > 60 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_query", "pageSize must be between 1 and 60"))
		return
	}

	result, err := a.catalog.List(r.Context(), filter)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, result)
}

// handleGetProduct serves the product page: details plus competing offers.
//
//	GET /api/products/{slug}
func (a *App) handleGetProduct(w http.ResponseWriter, r *http.Request) {
	detail, err := a.catalog.GetBySlug(r.Context(), r.PathValue("slug"))
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, detail)
}

// handleSearch serves typo-tolerant suggestions for the global search bar.
//
//	GET /api/search?q=eleden+ring&limit=8
func (a *App) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, err := strconv.Atoi(defaultStr(q.Get("limit"), "8"))
	if err != nil || limit < 1 || limit > 20 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_query", "limit must be between 1 and 20"))
		return
	}
	term := q.Get("q")
	suggestions, err := a.catalog.Search(r.Context(), term, limit)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"query": term, "items": suggestions})
}

// handleHomepage returns every visible marketing block with its content.
//
//	GET /api/homepage
func (a *App) handleHomepage(w http.ResponseWriter, r *http.Request) {
	blocks, err := a.homepage.Blocks(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"blocks": blocks})
}

// handleMeta returns the filter vocabulary (platforms, regions, genres, price
// bounds) so the store UI never hardcodes reference data.
//
//	GET /api/meta
func (a *App) handleMeta(w http.ResponseWriter, r *http.Request) {
	meta, err := a.catalog.Meta(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, meta)
}

func defaultStr(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
