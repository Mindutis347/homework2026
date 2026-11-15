package httpx

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/mindutis347/keyforge/backend/internal/config"
	"github.com/mindutis347/keyforge/backend/internal/db"
)

// TestSearchToleratesTypos pins the behaviour that made search feel broken: a
// shopper who mistypes one syllable still finds the game. It also pins the other
// side of the trade-off — a word that merely rhymes with the catalogue must not
// produce a suggestion.
//
// The predicate combines trigrams with Levenshtein distance (migration 0008 adds
// fuzzystrmatch), because "syber"/"cyberpunk" and "battlefield"/"starfield" both
// score 0.33 on trigrams alone and cannot be told apart without edit distance.
func TestSearchToleratesTypos(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set TEST_DATABASE_URL to run the search checks")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()

	server := httptest.NewServer(NewApp(config.Config{
		JWTSecret: []byte("integration-test-secret-value"),
	}, pool).Routes())
	defer server.Close()

	search := func(term string) []struct {
		Title string  `json:"title"`
		Slug  string  `json:"slug"`
		Score float64 `json:"score"`
	} {
		t.Helper()
		var body struct {
			Items []struct {
				Title string  `json:"title"`
				Slug  string  `json:"slug"`
				Score float64 `json:"score"`
			} `json:"items"`
		}
		getJSON(t, http.DefaultClient, server.URL+"/api/search?q="+url.QueryEscape(term), &body)
		return body.Items
	}

	cases := []struct {
		term  string
		want  string // substring of the expected first hit
		why   string
		empty bool
	}{
		{term: "syber", want: "cyberpunk", why: "one substitution inside the first syllable"},
		{term: "skrim", want: "skyrim", why: "a dropped letter in the middle of a word"},
		{term: "cyperpunk", want: "cyberpunk", why: "transposed letters"},
		{term: "witcjer", want: "witcher", why: "one wrong vowel"},
		{term: "bladurs", want: "baldur", why: "apostrophe dropped by the shopper"},
		{term: "bg3", want: "baldur", why: "an initialism still resolves"},
		{term: "battlefield", empty: true, why: "rhymes with Starfield but shares no edit path"},
		{term: "zzzqqq", empty: true, why: "no relation to anything in the catalogue"},
	}

	for _, tc := range cases {
		results := search(tc.term)
		if tc.empty {
			if len(results) > 0 {
				t.Errorf("%q should suggest nothing (%s), got %q", tc.term, tc.why, results[0].Title)
			}
			continue
		}
		if len(results) == 0 {
			t.Errorf("%q returned nothing (%s)", tc.term, tc.why)
			continue
		}
		first := strings.ToLower(results[0].Title)
		if !strings.Contains(first, tc.want) {
			t.Errorf("%q first hit = %q, want a title containing %q (%s)", tc.term, results[0].Title, tc.want, tc.why)
		}
		if results[0].Score < 0.5 || results[0].Score > 1 {
			t.Errorf("%q scored %.2f, want between 0.5 and 1", tc.term, results[0].Score)
		}
	}
}
