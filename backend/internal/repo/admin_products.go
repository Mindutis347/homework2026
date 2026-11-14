package repo

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// ProductEditInput is a full replacement of the editable catalogue fields. The
// slug is deliberately absent: it is the public URL and the search key, so it is
// fixed once a product exists.
type ProductEditInput struct {
	Title       string
	Description string
	CoverURL    string
	HeroURL     string
	Developer   string
	Publisher   string
	ReleaseDate *time.Time
	ContentType string
	IsActive    bool
	Genres      []string
}

const adminProductSelect = `
		SELECT p.id, p.slug, p.title, p.description, p.cover_url, p.hero_url,
		       p.developer, p.publisher, p.release_date, p.content_type, p.is_active,
		       COALESCE(genres.slugs, '{}'), COALESCE(sales.offer_count, 0), COALESCE(sales.min_price, 0)
		FROM products p
		LEFT JOIN LATERAL (
			SELECT array_agg(g.slug ORDER BY g.slug) AS slugs
			FROM product_genres pg
			JOIN genres g ON g.id = pg.genre_id
			WHERE pg.product_id = p.id
		) genres ON TRUE
		LEFT JOIN LATERAL (
			SELECT COUNT(*)::int AS offer_count, MIN(o.price_cents)::int AS min_price
			FROM offers o
			WHERE o.product_id = p.id AND o.is_active
		) sales ON TRUE`

func scanAdminProduct(row pgx.Row) (models.AdminProduct, error) {
	var p models.AdminProduct
	err := row.Scan(&p.ID, &p.Slug, &p.Title, &p.Description, &p.CoverURL, &p.HeroURL,
		&p.Developer, &p.Publisher, &p.ReleaseDate, &p.ContentType, &p.IsActive,
		&p.Genres, &p.OfferCount, &p.MinPriceCents)
	return p, err
}

// Products lists catalogue entries for the back-office, including inactive ones
// and entries nobody sells yet.
func (a *Admin) Products(ctx context.Context, term string) ([]models.AdminProduct, error) {
	rows, err := a.pool.Query(ctx, adminProductSelect+`
		WHERE $1 = '' OR p.title ILIKE '%' || $1 || '%' OR p.slug ILIKE '%' || $1 || '%'
		ORDER BY p.is_active DESC, p.popularity DESC, p.title ASC
		LIMIT 100`, strings.TrimSpace(term))
	if err != nil {
		return nil, fmt.Errorf("list admin products: %w", err)
	}
	defer rows.Close()

	out := []models.AdminProduct{}
	for rows.Next() {
		p, err := scanAdminProduct(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// UpdateProduct replaces the editable fields and the genre links in one
// transaction, so a half-saved product can never be published.
func (a *Admin) UpdateProduct(ctx context.Context, id int64, in ProductEditInput) (models.AdminProduct, error) {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return models.AdminProduct{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		UPDATE products
		SET title = $2, description = $3, cover_url = $4, hero_url = $5,
		    developer = $6, publisher = $7, release_date = $8, content_type = $9,
		    is_active = $10, updated_at = now()
		WHERE id = $1`,
		id, in.Title, in.Description, in.CoverURL, in.HeroURL,
		in.Developer, in.Publisher, in.ReleaseDate, in.ContentType, in.IsActive)
	if err != nil {
		return models.AdminProduct{}, fmt.Errorf("update product: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return models.AdminProduct{}, ErrNotFound
	}

	if _, err := tx.Exec(ctx, `DELETE FROM product_genres WHERE product_id = $1`, id); err != nil {
		return models.AdminProduct{}, fmt.Errorf("clear genres: %w", err)
	}
	if len(in.Genres) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO product_genres (product_id, genre_id)
			SELECT $1, g.id FROM genres g WHERE g.slug = ANY($2::text[])
			ON CONFLICT DO NOTHING`, id, in.Genres); err != nil {
			return models.AdminProduct{}, fmt.Errorf("set genres: %w", err)
		}
	}

	updated, err := scanAdminProduct(tx.QueryRow(ctx, adminProductSelect+` WHERE p.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return models.AdminProduct{}, ErrNotFound
	}
	if err != nil {
		return models.AdminProduct{}, fmt.Errorf("reload product: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return models.AdminProduct{}, err
	}
	return updated, nil
}
