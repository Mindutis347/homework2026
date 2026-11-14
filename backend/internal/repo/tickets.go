package repo

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/mindutis347/keyforge/backend/internal/models"
)

// AttachmentInput is a validated picture ready to be stored with a message.
type AttachmentInput struct {
	Mime  string
	Bytes int
	Data  []byte
}

// TicketForViewer loads one ticket if the viewer owns it or is an admin.
func (a *Admin) TicketForViewer(ctx context.Context, ticketID, viewerID int64, isAdmin bool) (models.Ticket, error) {
	var t models.Ticket
	err := a.pool.QueryRow(ctx, `
		SELECT t.id, u.email, u.display_name, COALESCE(od.reference, ''), t.subject, t.body,
		       t.category, t.status, t.refund_requested, t.created_at
		FROM support_tickets t
		JOIN users u ON u.id = t.user_id
		LEFT JOIN orders od ON od.id = t.order_id
		WHERE t.id = $1 AND ($2::boolean OR t.user_id = $3)`,
		ticketID, isAdmin, viewerID,
	).Scan(&t.ID, &t.UserEmail, &t.UserName, &t.OrderReference, &t.Subject, &t.Body,
		&t.Category, &t.Status, &t.RefundRequested, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, fmt.Errorf("load ticket: %w", err)
	}
	return t, nil
}

// TicketMessages returns a ticket's replies in order, with attachment metadata.
func (a *Admin) TicketMessages(ctx context.Context, ticketID int64) ([]models.TicketMessage, error) {
	rows, err := a.pool.Query(ctx, `
		SELECT m.id, m.author_role, COALESCE(u.display_name, 'Keyforge support'), m.body, m.created_at
		FROM ticket_messages m
		LEFT JOIN users u ON u.id = m.author_id
		WHERE m.ticket_id = $1
		ORDER BY m.created_at, m.id`, ticketID)
	if err != nil {
		return nil, fmt.Errorf("list ticket messages: %w", err)
	}
	defer rows.Close()

	out := []models.TicketMessage{}
	index := map[int64]int{}
	for rows.Next() {
		var m models.TicketMessage
		m.Attachments = []models.TicketAttachment{}
		if err := rows.Scan(&m.ID, &m.AuthorRole, &m.AuthorName, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		index[m.ID] = len(out)
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}

	attRows, err := a.pool.Query(ctx, `
		SELECT a.id, a.message_id, a.mime, a.byte_size
		FROM ticket_attachments a
		JOIN ticket_messages m ON m.id = a.message_id
		WHERE m.ticket_id = $1
		ORDER BY a.id`, ticketID)
	if err != nil {
		return nil, fmt.Errorf("list ticket attachments: %w", err)
	}
	defer attRows.Close()

	for attRows.Next() {
		var (
			att     models.TicketAttachment
			message int64
		)
		if err := attRows.Scan(&att.ID, &message, &att.Mime, &att.Bytes); err != nil {
			return nil, err
		}
		if idx, ok := index[message]; ok {
			out[idx].Attachments = append(out[idx].Attachments, att)
		}
	}
	return out, attRows.Err()
}

// AddTicketMessage appends a reply and moves the ticket through its lifecycle:
// a staff answer takes an open ticket into review, and a customer answer reopens
// a resolved one.
func (a *Admin) AddTicketMessage(
	ctx context.Context, ticketID, authorID int64, role, body string, attachments []AttachmentInput,
) (models.TicketMessage, error) {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return models.TicketMessage{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM support_tickets WHERE id = $1)`, ticketID).Scan(&exists); err != nil {
		return models.TicketMessage{}, err
	}
	if !exists {
		return models.TicketMessage{}, ErrNotFound
	}

	var message models.TicketMessage
	err = tx.QueryRow(ctx, `
		INSERT INTO ticket_messages (ticket_id, author_id, author_role, body)
		VALUES ($1, $2, $3, $4)
		RETURNING id, author_role, body, created_at`,
		ticketID, authorID, role, body,
	).Scan(&message.ID, &message.AuthorRole, &message.Body, &message.CreatedAt)
	if err != nil {
		return models.TicketMessage{}, fmt.Errorf("add ticket message: %w", err)
	}
	message.Attachments = []models.TicketAttachment{}

	for _, att := range attachments {
		var stored models.TicketAttachment
		err := tx.QueryRow(ctx, `
			INSERT INTO ticket_attachments (message_id, mime, byte_size, data)
			VALUES ($1, $2, $3, $4)
			RETURNING id, mime, byte_size`,
			message.ID, att.Mime, att.Bytes, att.Data,
		).Scan(&stored.ID, &stored.Mime, &stored.Bytes)
		if err != nil {
			return models.TicketMessage{}, fmt.Errorf("add attachment: %w", err)
		}
		message.Attachments = append(message.Attachments, stored)
	}

	// Any new message revives a resolved ticket; a staff answer also takes an open
	// ticket into review.
	nextStatus := `CASE WHEN status = 'open' THEN 'in_progress'
	                     WHEN status = 'resolved' THEN 'open'
	                     ELSE status END`
	if role != "staff" {
		nextStatus = `CASE WHEN status = 'resolved' THEN 'open' ELSE status END`
	}
	if _, err := tx.Exec(ctx,
		`UPDATE support_tickets SET status = `+nextStatus+`, updated_at = now() WHERE id = $1`,
		ticketID); err != nil {
		return models.TicketMessage{}, fmt.Errorf("advance ticket status: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return models.TicketMessage{}, err
	}
	return message, nil
}

// Attachment returns one picture if the viewer owns its ticket or is an admin.
func (a *Admin) Attachment(ctx context.Context, attachmentID, viewerID int64, isAdmin bool) (string, []byte, error) {
	var (
		mime string
		data []byte
	)
	err := a.pool.QueryRow(ctx, `
		SELECT a.mime, a.data
		FROM ticket_attachments a
		JOIN ticket_messages m ON m.id = a.message_id
		JOIN support_tickets t ON t.id = m.ticket_id
		WHERE a.id = $1 AND ($2::boolean OR t.user_id = $3)`,
		attachmentID, isAdmin, viewerID,
	).Scan(&mime, &data)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil, ErrNotFound
	}
	if err != nil {
		return "", nil, fmt.Errorf("load attachment: %w", err)
	}
	return mime, data, nil
}
