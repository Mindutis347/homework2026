package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config is everything the process needs from the environment. It is built
// once in main and passed down explicitly — no package-level globals.
type Config struct {
	Port           string
	DatabaseURL    string
	JWTSecret      []byte
	AllowedOrigins []string
	// CookieSecure must be true in production (HTTPS-only cookies); local dev
	// over http needs false or the browser drops the session cookie.
	CookieSecure bool
	// SeedOnBoot loads the demo catalog when the products table is empty.
	SeedOnBoot bool
	// ShowDevCodes exposes verification codes in API responses instead of
	// requiring a real mailbox.
	ShowDevCodes bool
}

func Load() (Config, error) {
	LoadDotEnv()

	cfg := Config{
		Port:           env("PORT", "8080"),
		DatabaseURL:    os.Getenv("DATABASE_URL"),
		JWTSecret:      []byte(os.Getenv("JWT_SECRET")),
		CookieSecure:   envBool("COOKIE_SECURE", false),
		SeedOnBoot:     envBool("SEED_ON_BOOT", true),
		ShowDevCodes:   envBool("SHOW_DEV_CODES", true),
		AllowedOrigins: splitCSV(env("CORS_ORIGINS", "http://localhost:5173")),
	}

	if cfg.DatabaseURL == "" {
		return cfg, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 16 {
		return cfg, fmt.Errorf("JWT_SECRET must be at least 16 characters")
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func splitCSV(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

// LoadDotEnv merges KEY=VALUE pairs from the env files it finds. Real
// environment variables always win, so Render/Neon injected config is never
// overridden by a stale local file. `.env.local` is read first because tools
// like the Neon CLI write connection strings there, while `.env` holds the rest.
func LoadDotEnv() {
	paths := []string{
		".env.local", "../.env.local", "../../.env.local",
		".env", "../.env", "../../.env",
	}
	for _, path := range paths {
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") {
				continue
			}
			key, value, ok := strings.Cut(line, "=")
			if !ok {
				continue
			}
			key = strings.TrimSpace(strings.TrimPrefix(key, "export "))
			value = strings.Trim(strings.TrimSpace(value), `"'`)
			if os.Getenv(key) == "" {
				_ = os.Setenv(key, value)
			}
		}
	}
}
