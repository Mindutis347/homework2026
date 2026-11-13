package repo

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// ErrEmailTaken is returned when registration hits the unique index on email.
var ErrEmailTaken = errors.New("email already registered")

// ErrConflict marks a state conflict, e.g. reviewing an already-reviewed request.
var ErrConflict = errors.New("conflict")

// ErrUnverified means the action requires a verified e-mail address.
var ErrUnverified = errors.New("account is not verified")

// Users owns account reads and writes.
type Users struct {
	pool *pgxpool.Pool
}

func NewUsers(pool *pgxpool.Pool) *Users { return &Users{pool: pool} }

// Create inserts an unverified customer and returns the new account.
func (u *Users) Create(ctx context.Context, email, passwordHash, displayName string) (models.User, error) {
	var out models.User
	err := u.pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name)
		VALUES ($1, $2, $3)
		RETURNING id, email, display_name, role, is_verified, created_at`,
		email, passwordHash, displayName,
	).Scan(&out.ID, &out.Email, &out.DisplayName, &out.Role, &out.IsVerified, &out.CreatedAt)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return out, ErrEmailTaken
	}
	if err != nil {
		return out, fmt.Errorf("create user: %w", err)
	}
	return out, nil
}

// Credentials is what the login handler needs: the row plus its password hash.
type Credentials struct {
	User         models.User
	PasswordHash string
}

func (u *Users) ByEmail(ctx context.Context, email string) (Credentials, error) {
	var c Credentials
	err := u.pool.QueryRow(ctx, `
		SELECT u.id, u.email, u.display_name, u.role, u.is_verified, u.created_at, u.password_hash,
		       COALESCE(sp.store_name, '')
		FROM users u
		LEFT JOIN seller_profiles sp ON sp.user_id = u.id
		WHERE u.email = $1`, email,
	).Scan(&c.User.ID, &c.User.Email, &c.User.DisplayName, &c.User.Role, &c.User.IsVerified,
		&c.User.CreatedAt, &c.PasswordHash, &c.User.StoreName)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	if err != nil {
		return c, fmt.Errorf("get user by email: %w", err)
	}
	return c, nil
}

func (u *Users) ByID(ctx context.Context, id int64) (models.User, error) {
	var out models.User
	err := u.pool.QueryRow(ctx, `
		SELECT u.id, u.email, u.display_name, u.role, u.is_verified, u.created_at,
		       COALESCE(sp.store_name, '')
		FROM users u
		LEFT JOIN seller_profiles sp ON sp.user_id = u.id
		WHERE u.id = $1`, id,
	).Scan(&out.ID, &out.Email, &out.DisplayName, &out.Role, &out.IsVerified, &out.CreatedAt, &out.StoreName)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrNotFound
	}
	return out, err
}

// SetVerificationCode stores a fresh hashed code and its expiry.
func (u *Users) SetVerificationCode(ctx context.Context, userID int64, codeHash string, expiresAt time.Time) error {
	_, err := u.pool.Exec(ctx, `
		UPDATE users SET verification_code_hash = $2, verification_expires_at = $3, updated_at = now()
		WHERE id = $1`, userID, codeHash, expiresAt)
	return err
}

// VerifyCode compares a submitted code against the stored hash. It is a single
// UPDATE so two concurrent attempts cannot both succeed.
func (u *Users) VerifyCode(ctx context.Context, email, codeHash string) (models.User, error) {
	var out models.User
	err := u.pool.QueryRow(ctx, `
		UPDATE users
		SET is_verified = TRUE,
		    verification_code_hash = NULL,
		    verification_expires_at = NULL,
		    updated_at = now()
		WHERE email = $1
		  AND verification_code_hash = $2
		  AND verification_expires_at > now()
		RETURNING id, email, display_name, role, is_verified, created_at`,
		email, codeHash,
	).Scan(&out.ID, &out.Email, &out.DisplayName, &out.Role, &out.IsVerified, &out.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, ErrNotFound
	}
	if err != nil {
		return out, fmt.Errorf("verify code: %w", err)
	}
	return out, nil
}

// Mail is a message in the simulated outbox.
type Mail struct {
	Recipient string    `json:"recipient"`
	Subject   string    `json:"subject"`
	Body      string    `json:"body"`
	Code      string    `json:"code,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// RecordEmail stores the message that would have been sent by SMTP.
func (u *Users) RecordEmail(ctx context.Context, m Mail) error {
	_, err := u.pool.Exec(ctx, `
		INSERT INTO email_outbox (recipient, subject, body, code)
		VALUES ($1, $2, $3, NULLIF($4, ''))`,
		m.Recipient, m.Subject, m.Body, m.Code)
	return err
}

// LatestMailFor returns the newest message for a recipient (the dev inbox).
func (u *Users) LatestMailFor(ctx context.Context, email string) (Mail, error) {
	var m Mail
	err := u.pool.QueryRow(ctx, `
		SELECT recipient, subject, body, COALESCE(code, ''), created_at
		FROM email_outbox WHERE recipient = $1 ORDER BY created_at DESC LIMIT 1`, email,
	).Scan(&m.Recipient, &m.Subject, &m.Body, &m.Code, &m.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}
