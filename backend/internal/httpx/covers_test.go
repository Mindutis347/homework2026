package httpx

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"net/http"
	"net/http/httptest"
	"testing"
)

// testCover builds a landscape-and-portrait pair of solid-colour JPEGs so the
// resizer can be checked without touching Steam's CDN.
func testCover(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for x := 0; x < width; x++ {
		for y := 0; y < height; y++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 120, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode test cover: %v", err)
	}
	return buf.Bytes()
}

func coverServer(t *testing.T, body []byte, status int) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/jpeg")
		if status != http.StatusOK {
			w.WriteHeader(status)
			return
		}
		_, _ = w.Write(body)
	}))
	t.Cleanup(server.Close)
	return server
}

func TestResizeCoverScalesToRequestedWidth(t *testing.T) {
	original := testCover(t, 600, 900)
	server := coverServer(t, original, http.StatusOK)

	out, err := resizeCover(context.Background(), server.URL, 240)
	if err != nil {
		t.Fatalf("resize: %v", err)
	}
	if len(out) >= len(original) {
		t.Errorf("resized cover is not smaller: %d bytes vs %d original", len(out), len(original))
	}
	img, err := jpeg.Decode(bytes.NewReader(out))
	if err != nil {
		t.Fatalf("decode resized cover: %v", err)
	}
	if got, want := img.Bounds().Dx(), 240; got != want {
		t.Errorf("width = %d, want %d", got, want)
	}
	// 240 of 600 is 0.4, so a 900-tall source should land on 360.
	if got, want := img.Bounds().Dy(), 360; got != want {
		t.Errorf("height = %d, want %d", got, want)
	}
}

func TestResizeCoverRejectsUnusableResponses(t *testing.T) {
	t.Run("upstream error", func(t *testing.T) {
		server := coverServer(t, nil, http.StatusNotFound)
		if _, err := resizeCover(context.Background(), server.URL, 240); err == nil {
			t.Fatal("expected an error for a 404 upstream")
		}
	})

	t.Run("not an image", func(t *testing.T) {
		server := coverServer(t, []byte("<html>nothing like art</html>"), http.StatusOK)
		if _, err := resizeCover(context.Background(), server.URL, 240); err == nil {
			t.Fatal("expected an error for a non-image body")
		}
	})

	t.Run("host unreachable", func(t *testing.T) {
		server := coverServer(t, testCover(t, 600, 900), http.StatusOK)
		url := server.URL
		server.Close()
		if _, err := resizeCover(context.Background(), url, 240); err == nil {
			t.Fatal("expected an error for a closed server")
		}
	})
}

func TestCoverCacheEvictsOldestEntries(t *testing.T) {
	cache := newCoverCache()
	for i := range coverCacheEntries + 5 {
		cache.put(string(rune('a'+i%26))+string(rune('0'+i/26)), []byte{byte(i)})
	}
	if got, want := len(cache.entries), coverCacheEntries; got != want {
		t.Errorf("cache holds %d entries, want %d", got, want)
	}
	if got := len(cache.order); got != coverCacheEntries {
		t.Errorf("cache order holds %d keys, want %d", got, coverCacheEntries)
	}
}

func TestCoverWidthWhitelist(t *testing.T) {
	allowed := map[int]bool{}
	for _, width := range coverWidths {
		allowed[width] = true
	}
	for _, width := range []int{160, 240, 320, 480, 720} {
		if !allowed[width] {
			t.Errorf("width %d should be allowed", width)
		}
	}
	for _, width := range []int{0, 1, 100, 1000, 5000} {
		if allowed[width] {
			t.Errorf("width %d should be rejected", width)
		}
	}
}
