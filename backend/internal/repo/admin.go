package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// Admin is the back-office: accounts, approvals, accounting, tickets and the
// homepage content the marketing team controls.
type Admin struct {
	pool *pgxpool.Pool
}

func NewAdmin(pool *pgxpool.Pool) *Admin { return &Admin{pool: pool} }

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = nonSlug.ReplaceAllString(s, "-")
	return strings.Trim(s, "-")
}

// Users lists accounts with their buying activity.
func (a *Admin) Users(ctx context.Context, search string) ([]models.AdminUser, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT u.id, u.email, u.display_name, u.role, u.is_verified, u.created_at,
		       COALESCE(sp.store_name, ''),
		       COALESCE(o.cnt, 0), COALESCE(o.spent, 0)
		FROM users u
		LEFT JOIN seller_profiles sp ON sp.user_id = u.id
		LEFT JOIN (
			SELECT user_id, COUNT(*) AS cnt, SUM(total_cents) AS spent
			FROM orders WHERE status = 'paid' GROUP BY user_id
		) o ON o.user_id = u.id
		WHERE $1 = '' OR u.email ILIKE '%' || $1 || '%' OR u.display_name ILIKE '%' || $1 || '%'
		ORDER BY u.created_at DESC
		LIMIT 200`, strings.TrimSpace(search))
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	out := []models.AdminUser{}
	for rows.Next() {
		var u models.AdminUser
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.Role, &u.IsVerified,
			&u.CreatedAt, &u.StoreName, &u.Orders, &u.SpentCents); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// SetRole promotes or demotes an account. Promoting to merchant also creates the
// seller profile (with a store name) so the portal immediately works.
func (a *Admin) SetRole(ctx context.Context, userID int64, role string) (models.AdminUser, error) {
	if role != "customer" && role != "merchant" && role != "admin" {
		return models.AdminUser{}, fmt.Errorf("invalid role %q", role)
	}

	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return models.AdminUser{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var displayName, email string
	err = tx.QueryRow(ctx, `
		UPDATE users SET role = $2, updated_at = now()
		WHERE id = $1
		RETURNING display_name, email`, userID, role).Scan(&displayName, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.AdminUser{}, ErrNotFound
	}
	if err != nil {
		return models.AdminUser{}, fmt.Errorf("set role: %w", err)
	}

	if role == "merchant" {
		storeName := displayName
		if _, err := tx.Exec(ctx, `
			INSERT INTO seller_profiles (user_id, store_name)
			VALUES ($1, $2)
			ON CONFLICT (user_id) DO NOTHING`, userID, storeName); err != nil {
			// Unique constraint on store_name: fall back to a suffixed name.
			if _, err2 := tx.Exec(ctx, `
				INSERT INTO seller_profiles (user_id, store_name)
				VALUES ($1, $2)
				ON CONFLICT (user_id) DO NOTHING`, userID, fmt.Sprintf("%s #%d", storeName, userID)); err2 != nil {
				return models.AdminUser{}, fmt.Errorf("create seller profile: %w", err2)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return models.AdminUser{}, err
	}

	return models.AdminUser{
		ID: userID, Email: email, DisplayName: displayName, Role: role,
	}, nil
}

// Requests lists catalog proposals, optionally filtered by status.
func (a *Admin) Requests(ctx context.Context, status string) ([]models.ProductRequest, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT pr.id, pr.merchant_id, u.display_name, pr.title,
		       pl.slug, r.code, pr.cover_url, pr.description, pr.status, pr.admin_note,
		       p.slug, pr.created_at, pr.reviewed_at
		FROM product_requests pr
		JOIN users u      ON u.id = pr.merchant_id
		JOIN platforms pl ON pl.id = pr.platform_id
		JOIN regions r    ON r.id = pr.region_id
		LEFT JOIN products p ON p.id = pr.product_id
		WHERE $1 = '' OR pr.status = $1
		ORDER BY pr.created_at DESC
		LIMIT 200`, status)
	if err != nil {
		return nil, fmt.Errorf("list product requests: %w", err)
	}
	defer rows.Close()

	out := []models.ProductRequest{}
	for rows.Next() {
		var p models.ProductRequest
		if err := rows.Scan(&p.ID, &p.MerchantID, &p.MerchantName, &p.Title, &p.PlatformSlug,
			&p.RegionCode, &p.CoverURL, &p.Description, &p.Status, &p.AdminNote,
			&p.ProductSlug, &p.CreatedAt, &p.ReviewedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// ReviewRequest approves (creating the catalog product) or rejects a proposal.
func (a *Admin) ReviewRequest(ctx context.Context, requestID, adminID int64, approve bool, note string) (models.ProductRequest, error) {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return models.ProductRequest{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var title, description, coverURL, status string
	err = tx.QueryRow(ctx, `
		SELECT title, description, cover_url, status FROM product_requests WHERE id = $1 FOR UPDATE`,
		requestID).Scan(&title, &description, &coverURL, &status)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.ProductRequest{}, ErrNotFound
	}
	if err != nil {
		return models.ProductRequest{}, err
	}
	if status != "pending" {
		return models.ProductRequest{}, fmt.Errorf("%w: request already reviewed", ErrConflict)
	}

	status = "rejected"
	var productID *int64
	if approve {
		slug := slugify(title)
		if slug == "" {
			return models.ProductRequest{}, fmt.Errorf("title does not produce a valid slug")
		}
		var id int64
		err = tx.QueryRow(ctx, `
			INSERT INTO products (slug, title, description, cover_url, hero_url, developer, publisher)
			VALUES ($1, $2, $3, $4, $4, '', '')
			ON CONFLICT (slug) DO NOTHING
			RETURNING id`, slug, title, description, coverURL).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			// Slug already exists: reuse the existing product instead of failing.
			if err := tx.QueryRow(ctx, `SELECT id FROM products WHERE slug = $1`, slug).Scan(&id); err != nil {
				return models.ProductRequest{}, err
			}
		} else if err != nil {
			return models.ProductRequest{}, fmt.Errorf("create product: %w", err)
		}
		productID = &id
		status = "approved"
	}

	_, err = tx.Exec(ctx, `
		UPDATE product_requests
		SET status = $2, admin_note = $3, reviewed_by = $4, reviewed_at = now(), product_id = $5
		WHERE id = $1`, requestID, status, note, adminID, productID)
	if err != nil {
		return models.ProductRequest{}, fmt.Errorf("update request: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return models.ProductRequest{}, err
	}

	return a.requestByID(ctx, requestID)
}

func (a *Admin) requestByID(ctx context.Context, id int64) (models.ProductRequest, error) {
	var p models.ProductRequest
	err := a.pool.QueryRow(ctx, `
		SELECT pr.id, pr.merchant_id, u.display_name, pr.title,
		       pl.slug, r.code, pr.cover_url, pr.description, pr.status, pr.admin_note,
		       p.slug, pr.created_at, pr.reviewed_at
		FROM product_requests pr
		JOIN users u      ON u.id = pr.merchant_id
		JOIN platforms pl ON pl.id = pr.platform_id
		JOIN regions r    ON r.id = pr.region_id
		LEFT JOIN products p ON p.id = pr.product_id
		WHERE pr.id = $1`, id,
	).Scan(&p.ID, &p.MerchantID, &p.MerchantName, &p.Title, &p.PlatformSlug, &p.RegionCode,
		&p.CoverURL, &p.Description, &p.Status, &p.AdminNote, &p.ProductSlug, &p.CreatedAt, &p.ReviewedAt)
	return p, err
}

// Summary is the accounting dashboard.
func (a *Admin) Summary(ctx context.Context) (models.SalesSummary, error) {
	s := models.SalesSummary{TopSellers: []models.TopSeller{}, Daily: []models.DailySales{}}

	err := a.pool.QueryRow(ctx, `
		SELECT COUNT(*), COALESCE(SUM(total_cents), 0)
		FROM orders WHERE status = 'paid'`).Scan(&s.Orders, &s.GrossCents)
	if err != nil {
		return s, err
	}

	err = a.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(oi.quantity), 0),
		       COALESCE(SUM(oi.commission_cents), 0),
		       COALESCE(SUM(oi.seller_payout_cents), 0)
		FROM order_items oi
		JOIN orders od ON od.id = oi.order_id
		WHERE od.status = 'paid'`).Scan(&s.UnitsSold, &s.CommissionCents, &s.PayoutCents)
	if err != nil {
		return s, err
	}
	if s.Orders > 0 {
		s.AvgOrderCents = s.GrossCents / s.Orders
	}

	err = a.pool.QueryRow(ctx, `
		SELECT COUNT(DISTINCT oi.seller_id)
		FROM order_items oi JOIN orders od ON od.id = oi.order_id
		WHERE od.status = 'paid'`).Scan(&s.ActiveSellers)
	if err != nil {
		return s, err
	}

	rows, err := a.pool.Query(ctx, `
		SELECT COALESCE(NULLIF(sp.store_name, ''), u.display_name),
		       SUM(oi.quantity)::int, SUM(oi.unit_price_cents * oi.quantity)::int,
		       SUM(oi.commission_cents)::int
		FROM order_items oi
		JOIN orders od ON od.id = oi.order_id
		JOIN users u   ON u.id = oi.seller_id
		LEFT JOIN seller_profiles sp ON sp.user_id = u.id
		WHERE od.status = 'paid'
		GROUP BY 1
		ORDER BY 2 DESC
		LIMIT 5`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var t models.TopSeller
		if err := rows.Scan(&t.StoreName, &t.UnitsSold, &t.RevenueCents, &t.CommissionCents); err != nil {
			rows.Close()
			return s, err
		}
		s.TopSellers = append(s.TopSellers, t)
	}
	rows.Close()

	dayRows, err := a.pool.Query(ctx, `
		SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD'),
		       COUNT(*)::int, COALESCE(SUM(total_cents), 0)::int
		FROM orders
		WHERE status = 'paid' AND created_at > now() - interval '14 days'
		GROUP BY 1 ORDER BY 1`)
	if err != nil {
		return s, err
	}
	defer dayRows.Close()
	for dayRows.Next() {
		var d models.DailySales
		if err := dayRows.Scan(&d.Day, &d.Orders, &d.RevenueCents); err != nil {
			return s, err
		}
		s.Daily = append(s.Daily, d)
	}
	return s, dayRows.Err()
}

// Orders lists platform-wide orders for the back-office.
func (a *Admin) Orders(ctx context.Context, limit int) ([]models.AdminOrder, error) {
	if limit < 1 || limit > 200 {
		limit = 50
	}
	rows, err := a.pool.Query(ctx, `
		SELECT od.reference, u.email, od.status, od.total_cents,
		       COALESCE(SUM(oi.quantity), 0)::int, od.created_at
		FROM orders od
		JOIN users u ON u.id = od.user_id
		LEFT JOIN order_items oi ON oi.order_id = od.id
		GROUP BY od.id, od.reference, u.email, od.status, od.total_cents, od.created_at
		ORDER BY od.created_at DESC
		LIMIT $1`, limit)
	if err != nil {
		return nil, fmt.Errorf("list admin orders: %w", err)
	}
	defer rows.Close()

	out := []models.AdminOrder{}
	for rows.Next() {
		var o models.AdminOrder
		if err := rows.Scan(&o.Reference, &o.BuyerEmail, &o.Status, &o.TotalCents, &o.Items, &o.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

// Tickets lists support requests.
func (a *Admin) Tickets(ctx context.Context, status string) ([]models.Ticket, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT t.id, u.email, COALESCE(od.reference, ''), t.subject, t.body,
		       t.category, t.status, t.refund_requested, t.created_at
		FROM support_tickets t
		JOIN users u ON u.id = t.user_id
		LEFT JOIN orders od ON od.id = t.order_id
		WHERE $1 = '' OR t.status = $1
		ORDER BY t.created_at DESC
		LIMIT 200`, status)
	if err != nil {
		return nil, fmt.Errorf("list tickets: %w", err)
	}
	defer rows.Close()

	out := []models.Ticket{}
	for rows.Next() {
		var t models.Ticket
		if err := rows.Scan(&t.ID, &t.UserEmail, &t.OrderReference, &t.Subject, &t.Body,
			&t.Category, &t.Status, &t.RefundRequested, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// UpdateTicketStatus moves a ticket through open -> in_progress -> resolved.
func (a *Admin) UpdateTicketStatus(ctx context.Context, id int64, status string) error {
	tag, err := a.pool.Exec(ctx, `
		UPDATE support_tickets SET status = $2, updated_at = now() WHERE id = $1`, id, status)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CreateTicket files a support request on behalf of a signed-in user.
func (a *Admin) CreateTicket(ctx context.Context, userID int64, orderID *int64, subject, body, category string, refund bool) error {
	_, err := a.pool.Exec(ctx, `
		INSERT INTO support_tickets (user_id, order_id, subject, body, category, refund_requested)
		VALUES ($1, $2, $3, $4, $5, $6)`, userID, orderID, subject, body, category, refund)
	return err
}

// --- homepage content management -------------------------------------------

// Blocks returns every block, visible or not, for the back-office editor.
func (a *Admin) Blocks(ctx context.Context) ([]models.HomepageBlock, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT b.id, b.block_key, b.type, b.title, b.subtitle, b.config, b.position, b.is_visible,
		       COALESCE(array_agg(bp.product_id ORDER BY bp.position) FILTER (WHERE bp.product_id IS NOT NULL), '{}')
		FROM homepage_blocks b
		LEFT JOIN homepage_block_products bp ON bp.block_id = b.id
		GROUP BY b.id
		ORDER BY b.position, b.id`)
	if err != nil {
		return nil, fmt.Errorf("list blocks: %w", err)
	}
	defer rows.Close()

	out := []models.HomepageBlock{}
	for rows.Next() {
		var b models.HomepageBlock
		var raw []byte
		var productIDs []int64
		if err := rows.Scan(&b.ID, &b.Key, &b.Type, &b.Title, &b.Subtitle, &raw, &b.Position,
			&b.IsVisible, &productIDs); err != nil {
			return nil, err
		}
		if len(raw) > 0 {
			if err := json.Unmarshal(raw, &b.Config); err != nil {
				return nil, err
			}
		}
		b.ProductIDs = productIDs
		out = append(out, b)
	}
	return out, rows.Err()
}

// BlockInput is the admin payload for creating or updating a block.
type BlockInput struct {
	Key        string         `json:"key"`
	Type       string         `json:"type"`
	Title      string         `json:"title"`
	Subtitle   string         `json:"subtitle"`
	Config     map[string]any `json:"config"`
	Position   int            `json:"position"`
	IsVisible  bool           `json:"isVisible"`
	ProductIDs []int64        `json:"productIds"`
}

// CreateBlock inserts a block and its curated products.
func (a *Admin) CreateBlock(ctx context.Context, in BlockInput) (models.HomepageBlock, error) {
	cfg, err := json.Marshal(orEmpty(in.Config))
	if err != nil {
		return models.HomepageBlock{}, err
	}

	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return models.HomepageBlock{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var id int64
	err = tx.QueryRow(ctx, `
		INSERT INTO homepage_blocks (block_key, type, title, subtitle, config, position, is_visible)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		RETURNING id`,
		in.Key, in.Type, in.Title, in.Subtitle, cfg, in.Position, in.IsVisible).Scan(&id)
	if err != nil {
		return models.HomepageBlock{}, fmt.Errorf("create block: %w", err)
	}
	if err := replaceBlockProducts(ctx, tx, id, in.ProductIDs); err != nil {
		return models.HomepageBlock{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return models.HomepageBlock{}, err
	}
	return a.blockByID(ctx, id)
}

// UpdateBlock edits a block's copy, position, visibility and product list.
func (a *Admin) UpdateBlock(ctx context.Context, id int64, in BlockInput) (models.HomepageBlock, error) {
	cfg, err := json.Marshal(orEmpty(in.Config))
	if err != nil {
		return models.HomepageBlock{}, err
	}

	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return models.HomepageBlock{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `
		UPDATE homepage_blocks
		SET type = $2, title = $3, subtitle = $4, config = $5, position = $6,
		    is_visible = $7, updated_at = now()
		WHERE id = $1`, id, in.Type, in.Title, in.Subtitle, cfg, in.Position, in.IsVisible)
	if err != nil {
		return models.HomepageBlock{}, fmt.Errorf("update block: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return models.HomepageBlock{}, ErrNotFound
	}
	if err := replaceBlockProducts(ctx, tx, id, in.ProductIDs); err != nil {
		return models.HomepageBlock{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return models.HomepageBlock{}, err
	}
	return a.blockByID(ctx, id)
}

// DeleteBlock removes a block and its product links.
func (a *Admin) DeleteBlock(ctx context.Context, id int64) error {
	tag, err := a.pool.Exec(ctx, `DELETE FROM homepage_blocks WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func replaceBlockProducts(ctx context.Context, tx pgx.Tx, blockID int64, productIDs []int64) error {
	if _, err := tx.Exec(ctx, `DELETE FROM homepage_block_products WHERE block_id = $1`, blockID); err != nil {
		return fmt.Errorf("clear block products: %w", err)
	}
	for i, pid := range productIDs {
		if _, err := tx.Exec(ctx, `
			INSERT INTO homepage_block_products (block_id, product_id, position)
			VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, blockID, pid, i); err != nil {
			return fmt.Errorf("link block product: %w", err)
		}
	}
	return nil
}

func (a *Admin) blockByID(ctx context.Context, id int64) (models.HomepageBlock, error) {
	var b models.HomepageBlock
	var raw []byte
	var productIDs []int64
	err := a.pool.QueryRow(ctx, `
		SELECT b.id, b.block_key, b.type, b.title, b.subtitle, b.config, b.position, b.is_visible,
		       COALESCE(array_agg(bp.product_id ORDER BY bp.position) FILTER (WHERE bp.product_id IS NOT NULL), '{}')
		FROM homepage_blocks b
		LEFT JOIN homepage_block_products bp ON bp.block_id = b.id
		WHERE b.id = $1
		GROUP BY b.id`, id,
	).Scan(&b.ID, &b.Key, &b.Type, &b.Title, &b.Subtitle, &raw, &b.Position, &b.IsVisible, &productIDs)
	if errors.Is(err, pgx.ErrNoRows) {
		return b, ErrNotFound
	}
	if err != nil {
		return b, err
	}
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &b.Config); err != nil {
			return b, err
		}
	}
	b.ProductIDs = productIDs
	return b, nil
}

func orEmpty(m map[string]any) map[string]any {
	if m == nil {
		return map[string]any{}
	}
	return m
}
