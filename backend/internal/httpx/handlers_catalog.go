package httpx

import (
	"net/http"
	"strconv"
	"strings"

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

// multiParam reads a repeatable query parameter. Values may be repeated
// (?platform=steam&platform=xbox) or comma-separated (?platform=steam,xbox), and
// a single value keeps working, so old links and the filter UI both read fine.
func multiParam(r *http.Request, key string) []string {
	raw := r.URL.Query()[key]
	out := make([]string, 0, len(raw))
	seen := make(map[string]bool, len(raw))
	for _, value := range raw {
		for _, part := range strings.Split(value, ",") {
			part = strings.TrimSpace(part)
			if part == "" || seen[part] {
				continue
			}
			seen[part] = true
			out = append(out, part)
			if len(out) == 20 { // a sane ceiling for a filter list
				return out
			}
		}
	}
	return out
}

// marketParam reads the visitor's region. Anything unknown is treated as "no
// preference" rather than an error: a stale bookmark or a typo should not break
// the storefront, it should just show every region as before.
func marketParam(r *http.Request) string {
	code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("market")))
	switch code {
	case "EU", "US", "UK", "TR", "BR", "GLOBAL":
		return code
	default:
		return ""
	}
}

// handleListProducts serves the store catalog.
//
//	GET /api/products?q=&platform=&region=&genre=&minPriceCents=&maxPriceCents=
//	                 &sort=popular|price_asc|price_desc|newest|discount|title|relevance
//	                 &page=1&pageSize=24
//
// platform, region and genre accept several values, repeated or comma-separated.
// market is the visitor's own region (EU, US, …): it keeps cards priced from keys
// they can activate — their region or a global one — and the aggregate takes the
// cheaper of the two. An explicit region filter overrides it.
func (a *App) handleListProducts(w http.ResponseWriter, r *http.Request) {
	filter := repo.CatalogFilter{
		Search:       strings.TrimSpace(r.URL.Query().Get("q")),
		Platforms:    multiParam(r, "platform"),
		Regions:      multiParam(r, "region"),
		Genres:       multiParam(r, "genre"),
		ContentTypes: multiParam(r, "contentType"),
		Sort:         r.URL.Query().Get("sort"),
		Page:         1,
		PageSize:     24,
		// The store shows every platform+region as its own card.
		ByVariant: true,
	}
	if len(filter.Regions) == 0 {
		filter.MarketRegion = marketParam(r)
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
	slug := r.PathValue("slug")
	detail, err := a.catalog.GetBySlug(r.Context(), slug)
	if err != nil {
		WriteError(w, err)
		return
	}
	// "You might also like": same shape as a store card, ranked by shared genres.
	related, err := a.catalog.Related(r.Context(), slug, marketParam(r), 8)
	if err != nil {
		WriteError(w, err)
		return
	}
	detail.Related = related
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
	suggestions, err := a.catalog.Search(r.Context(), term, marketParam(r), limit)
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
	blocks, err := a.homepage.Blocks(r.Context(), marketParam(r))
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
