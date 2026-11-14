package httpx

import (
	"bytes"
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/gif" // cover art may arrive in any of these formats
	"image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"sync"
	"time"

	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

/*
Covers are hotlinked 600x900 JPEGs from Steam's CDN — around 200 KB each, drawn
in a card about 180 px wide. This endpoint serves the same artwork through the
API at a requested width, which is what makes `srcset` worth writing: a phone
fetches ~15 KB instead of ~200 KB per card.

Deliberate limits:

  - Only the widths in coverWidths are accepted, and only images from the hosts
    in coverHosts are proxied. cover_url is admin-editable, so without the host
    check an admin (or a bug) could turn this into a request for anything on the
    network the API can reach.
  - Anything unexpected (unknown host, upstream error, a format we cannot
    decode) redirects to the original URL. The store never breaks over art.
  - Resized bytes live in a bounded in-memory cache. Render's free instance has
    no disk and restarts often, so a file cache would be a lie; the cache is
    warm-up only, and correctness never depends on it.
*/

var coverWidths = []int{160, 240, 320, 480, 720}

var coverHosts = []string{
	"cdn.cloudflare.steamstatic.com",
	"shared.steamstatic.com",
	"cdn.akamai.steamstatic.com",
	"images.igdb.com",
}

const (
	coverDefaultWidth = 480
	coverMaxBytes     = 8 << 20
	coverCacheEntries = 400
	coverQuality      = 82
)

// coverCache is a bounded FIFO of resized images, keyed by product and width.
type coverCache struct {
	mu      sync.Mutex
	entries map[string][]byte
	order   []string
}

func newCoverCache() *coverCache {
	return &coverCache{entries: map[string][]byte{}}
}

func (c *coverCache) get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	data, ok := c.entries[key]
	return data, ok
}

func (c *coverCache) put(key string, data []byte) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, exists := c.entries[key]; exists {
		return
	}
	c.entries[key] = data
	c.order = append(c.order, key)
	for len(c.order) > coverCacheEntries {
		delete(c.entries, c.order[0])
		c.order = c.order[1:]
	}
}

// handleCover serves one product's artwork at a whitelisted width.
//
//	GET /api/covers/{id}?w=240
func (a *App) handleCover(w http.ResponseWriter, r *http.Request) {
	productID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "product id must be a number"))
		return
	}
	width := coverDefaultWidth
	if raw := r.URL.Query().Get("w"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || !slices.Contains(coverWidths, parsed) {
			WriteError(w, Errorf(http.StatusBadRequest, "invalid_width", "w must be one of 160, 240, 320, 480, 720"))
			return
		}
		width = parsed
	}

	source, err := a.catalog.CoverURL(r.Context(), productID)
	if err != nil {
		WriteError(w, err)
		return
	}
	parsed, err := url.Parse(source)
	if err != nil || parsed.Scheme != "https" || !slices.Contains(coverHosts, parsed.Host) {
		redirectToCover(w, r, source)
		return
	}

	key := fmt.Sprintf("%d@%d", productID, width)
	if cached, ok := a.covers.get(key); ok {
		writeCover(w, cached, key)
		return
	}

	data, err := resizeCover(r.Context(), source, width)
	if err != nil {
		// Logged by the caller's middleware; the buyer still gets their picture.
		redirectToCover(w, r, source)
		return
	}
	a.covers.put(key, data)
	writeCover(w, data, key)
}

// resizeCover fetches the original and scales it down to width. It never scales
// up: a small source is returned as it is rather than blurred.
func resizeCover(ctx context.Context, source string, width int) ([]byte, error) {
	client := &http.Client{
		Timeout: 10 * time.Second,
		// The URL comes from our own database, but following redirects would let
		// an upstream bounce the request to an internal address.
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "image/*")
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("cover upstream status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, coverMaxBytes))
	if err != nil {
		return nil, err
	}
	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	bounds := img.Bounds()
	targetHeight := width * bounds.Dy() / bounds.Dx()
	scaled := image.NewRGBA(image.Rect(0, 0, width, targetHeight))
	draw.ApproxBiLinear.Scale(scaled, scaled.Bounds(), img, bounds, draw.Over, nil)

	var out bytes.Buffer
	if err := jpeg.Encode(&out, scaled, &jpeg.Options{Quality: coverQuality}); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func writeCover(w http.ResponseWriter, data []byte, key string) {
	sum := sha1.Sum([]byte(key))
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("Cache-Control", "public, max-age=604800, immutable")
	w.Header().Set("ETag", `"`+hex.EncodeToString(sum[:8])+`"`)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	_, _ = w.Write(data)
}

func redirectToCover(w http.ResponseWriter, r *http.Request, source string) {
	// Short-lived: if the upstream is fixed, the next visit picks it up.
	w.Header().Set("Cache-Control", "public, max-age=300")
	http.Redirect(w, r, source, http.StatusTemporaryRedirect)
}
