// Package seed holds the demo catalog. It is embedded so the binary can boot a
// fresh database with a complete marketplace and no external files.
package seed

import (
	"embed"
	"encoding/json"
)

//go:embed catalog.json
var FS embed.FS

// Game is one row of the curated catalog fixture.
type Game struct {
	Slug           string   `json:"slug"`
	Title          string   `json:"title"`
	Description    string   `json:"description"`
	CoverURL       string   `json:"coverUrl"`
	HeroURL        string   `json:"heroUrl"`
	Developer      string   `json:"developer"`
	Publisher      string   `json:"publisher"`
	ReleaseDate    string   `json:"releaseDate"`
	Genres         []string `json:"genres"`
	Popularity     int      `json:"popularity"`
	Platforms      []string `json:"platforms"`
	BasePriceCents int      `json:"basePriceCents"`
}

// Catalog decodes the embedded fixture.
func Catalog() ([]Game, error) {
	raw, err := FS.ReadFile("catalog.json")
	if err != nil {
		return nil, err
	}
	var games []Game
	if err := json.Unmarshal(raw, &games); err != nil {
		return nil, err
	}
	return games, nil
}
