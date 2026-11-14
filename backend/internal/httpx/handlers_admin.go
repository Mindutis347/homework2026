package httpx

import (
	"encoding/base64"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/mindutis347/keyforge/backend/internal/models"
	"github.com/mindutis347/keyforge/backend/internal/repo"
)

// handleAdminUsers lists accounts.
//
//	GET /api/admin/users?q=
func (a *App) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	users, err := a.admin.Users(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"users": users})
}

// handleAdminSetRole promotes or demotes an account.
//
//	PATCH /api/admin/users/{id}/role {"role":"merchant"}
func (a *App) handleAdminSetRole(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "user id must be a number"))
		return
	}
	var body struct {
		Role string `json:"role"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}
	if body.Role != RoleCustomer && body.Role != RoleMerchant && body.Role != RoleAdmin {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "role must be customer, merchant or admin"))
		return
	}
	// Guard against an admin locking themselves out of the back-office.
	if current := UserFrom(r.Context()); current.UserID == userID && body.Role != RoleAdmin {
		WriteError(w, Errorf(http.StatusBadRequest, "self_demotion", "you cannot remove your own admin role"))
		return
	}

	updated, err := a.admin.SetRole(r.Context(), userID, body.Role)
	if errors.Is(err, repo.ErrNotFound) {
		WriteError(w, ErrNotFound)
		return
	}
	if errors.Is(err, repo.ErrUnverified) {
		WriteError(w, Errorf(http.StatusConflict, "email_unverified",
			"only verified accounts can be promoted to merchant"))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"user": updated})
}

// handleAdminRequests lists catalog proposals.
//
//	GET /api/admin/requests?status=pending
func (a *App) handleAdminRequests(w http.ResponseWriter, r *http.Request) {
	requests, err := a.admin.Requests(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"requests": requests})
}

// handleAdminReviewRequest approves or rejects a proposal.
//
//	POST /api/admin/requests/{id}/review {"approve":true,"note":"looks good"}
func (a *App) handleAdminReviewRequest(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "request id must be a number"))
		return
	}
	var body struct {
		Approve bool   `json:"approve"`
		Note    string `json:"note"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}

	user := UserFrom(r.Context())
	req, err := a.admin.ReviewRequest(r.Context(), id, user.UserID, body.Approve, body.Note)
	if errors.Is(err, repo.ErrNotFound) {
		WriteError(w, ErrNotFound)
		return
	}
	if errors.Is(err, repo.ErrConflict) {
		WriteError(w, Errorf(http.StatusConflict, "already_reviewed", "this request was already reviewed"))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"request": req})
}

// handleAdminSummary returns the accounting overview.
//
//	GET /api/admin/summary
func (a *App) handleAdminSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := a.admin.Summary(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, summary)
}

// handleAdminOrders lists platform-wide orders.
//
//	GET /api/admin/orders
func (a *App) handleAdminOrders(w http.ResponseWriter, r *http.Request) {
	orders, err := a.admin.Orders(r.Context(), 50)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"orders": orders})
}

// handleAdminTickets lists support tickets.
//
//	GET /api/admin/tickets?status=open
func (a *App) handleAdminTickets(w http.ResponseWriter, r *http.Request) {
	tickets, err := a.admin.Tickets(r.Context(), r.URL.Query().Get("status"))
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"tickets": tickets})
}

// handleAdminUpdateTicket moves a ticket through its lifecycle.
//
//	PATCH /api/admin/tickets/{id} {"status":"resolved"}
func (a *App) handleAdminUpdateTicket(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "ticket id must be a number"))
		return
	}
	var body struct {
		Status string `json:"status"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}
	switch body.Status {
	case "open", "in_progress", "resolved":
	default:
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "unknown ticket status"))
		return
	}
	if err := a.admin.UpdateTicketStatus(r.Context(), id, body.Status); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(w, ErrNotFound)
			return
		}
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"status": body.Status})
}

// handleAdminBlocks lists homepage blocks including hidden ones.
//
//	GET /api/admin/blocks
func (a *App) handleAdminBlocks(w http.ResponseWriter, r *http.Request) {
	blocks, err := a.admin.Blocks(r.Context())
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"blocks": blocks})
}

// handleAdminCreateBlock adds a homepage block.
//
//	POST /api/admin/blocks
func (a *App) handleAdminCreateBlock(w http.ResponseWriter, r *http.Request) {
	var in repo.BlockInput
	if err := DecodeJSON(w, r, &in); err != nil {
		WriteError(w, err)
		return
	}
	if in.Key == "" || in.Type == "" {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "key and type are required"))
		return
	}
	if !validBlockType(in.Type) {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body",
			"type must be hero, product_carousel, category_tiles, banner or platform_strip"))
		return
	}
	block, err := a.admin.CreateBlock(r.Context(), in)
	if errors.Is(err, repo.ErrConflict) {
		WriteError(w, Errorf(http.StatusConflict, "block_exists", "a block with that key already exists"))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{"block": block})
}

// blockTypes mirrors the CHECK constraint on homepage_blocks.type, so an invalid
// type is a 400 from the API instead of a 500 from the database.
var blockTypes = map[string]bool{
	"hero":             true,
	"product_carousel": true,
	"category_tiles":   true,
	"banner":           true,
	"platform_strip":   true,
}

func validBlockType(t string) bool { return blockTypes[t] }

// handleAdminUpdateBlock edits a homepage block.
//
//	PATCH /api/admin/blocks/{id}
func (a *App) handleAdminUpdateBlock(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "block id must be a number"))
		return
	}
	var in repo.BlockInput
	if err := DecodeJSON(w, r, &in); err != nil {
		WriteError(w, err)
		return
	}
	if !validBlockType(in.Type) {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body",
			"type must be hero, product_carousel, category_tiles, banner or platform_strip"))
		return
	}
	block, err := a.admin.UpdateBlock(r.Context(), id, in)
	if errors.Is(err, repo.ErrNotFound) {
		WriteError(w, ErrNotFound)
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"block": block})
}

// handleAdminDeleteBlock removes a homepage block.
//
//	DELETE /api/admin/blocks/{id}
func (a *App) handleAdminDeleteBlock(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "block id must be a number"))
		return
	}
	if err := a.admin.DeleteBlock(r.Context(), id); err != nil {
		if errors.Is(err, repo.ErrNotFound) {
			WriteError(w, ErrNotFound)
			return
		}
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusNoContent, nil)
}

// handleCreateTicket lets a signed-in buyer file a support request, optionally
// with pictures of the problem attached to the opening message.
//
//	POST /api/tickets {"subject","body","category","orderId","attachments":[{"mime","data"}]}
//
// The refund flag is derived from the category rather than sent by the client, so
// the queue's refund filter can never disagree with the category shown beside it.
func (a *App) handleCreateTicket(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	var body struct {
		Subject     string                    `json:"subject"`
		Body        string                    `json:"body"`
		Category    string                    `json:"category"`
		OrderID     *int64                    `json:"orderId"`
		Attachments []ticketAttachmentPayload `json:"attachments"`
	}
	if err := DecodeJSONMax(w, r, &body, maxTicketReplyBytes); err != nil {
		WriteError(w, err)
		return
	}
	if len(body.Subject) < 3 || len(body.Body) < 5 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "subject and body are required"))
		return
	}
	switch body.Category {
	case "", "refund", "delivery", "account", "other":
	default:
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "unknown category"))
		return
	}
	if body.Category == "" {
		body.Category = "other"
	}
	attachments, err := parseAttachments(body.Attachments)
	if err != nil {
		WriteError(w, err)
		return
	}
	if err := a.admin.CreateTicket(r.Context(), user.UserID, body.OrderID, body.Subject,
		body.Body, body.Category, body.Category == "refund", attachments); err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{"status": "ticket_created"})
}

// handleMyTickets lists the signed-in buyer's own support requests.
//
//	GET /api/tickets
func (a *App) handleMyTickets(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	tickets, err := a.admin.TicketsByUser(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"tickets": tickets})
}

// --- support conversations --------------------------------------------------

const (
	maxTicketAttachments = 3
	maxAttachmentBytes   = 1_500_000
	maxTicketBodyLen     = 4000
	// Base64 inflates by roughly a third, and the envelope adds a little more.
	maxTicketReplyBytes = 8 << 20
)

var allowedImageTypes = map[string]bool{
	"image/png":  true,
	"image/jpeg": true,
	"image/webp": true,
	"image/gif":  true,
}

type ticketAttachmentPayload struct {
	Mime string `json:"mime"`
	Data string `json:"data"` // base64 of the image bytes
}

type ticketReplyBody struct {
	Body        string                    `json:"body"`
	Attachments []ticketAttachmentPayload `json:"attachments"`
}

// parseAttachments validates the pictures sent with a ticket or a reply. The
// type comes from sniffing the bytes, never from the declared mime, so a script
// cannot be uploaded by claiming to be an image.
func parseAttachments(in []ticketAttachmentPayload) ([]repo.AttachmentInput, error) {
	if len(in) > maxTicketAttachments {
		return nil, Errorf(http.StatusBadRequest, "invalid_body", "at most three pictures per message")
	}
	out := make([]repo.AttachmentInput, 0, len(in))
	for _, att := range in {
		raw, err := base64.StdEncoding.DecodeString(att.Data)
		if err != nil {
			return nil, Errorf(http.StatusBadRequest, "invalid_body", "picture data must be base64")
		}
		if len(raw) == 0 {
			continue
		}
		if len(raw) > maxAttachmentBytes {
			return nil, Errorf(http.StatusBadRequest, "invalid_body", "each picture must be 1.5 MB or smaller")
		}
		sniffed := http.DetectContentType(raw)
		if !allowedImageTypes[sniffed] {
			return nil, Errorf(http.StatusBadRequest, "invalid_body", "only PNG, JPEG, WebP or GIF pictures are accepted")
		}
		out = append(out, repo.AttachmentInput{Mime: sniffed, Bytes: len(raw), Data: raw})
	}
	return out, nil
}

// handleTicketThread returns one ticket with its conversation. A customer sees
// only their own tickets; an admin sees any.
//
//	GET /api/tickets/{id}
func (a *App) handleTicketThread(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	ticketID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "ticket id must be a number"))
		return
	}
	thread, err := a.ticketThread(r, ticketID, user)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"thread": thread})
}

// handleTicketReply appends a message to the conversation. The author side is
// derived from the caller's role, never from the payload.
//
//	POST /api/tickets/{id}/messages {"body","attachments":[{"mime","data"}]}
func (a *App) handleTicketReply(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	ticketID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "ticket id must be a number"))
		return
	}

	// Ownership first: a customer may only write into their own ticket.
	if _, err := a.admin.TicketForViewer(r.Context(), ticketID, user.UserID, user.IsAdmin()); err != nil {
		WriteError(w, err)
		return
	}

	var body ticketReplyBody
	if err := DecodeJSONMax(w, r, &body, maxTicketReplyBytes); err != nil {
		WriteError(w, err)
		return
	}
	text := strings.TrimSpace(body.Body)
	if len(text) > maxTicketBodyLen {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "message is too long"))
		return
	}
	if text == "" && len(body.Attachments) == 0 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "write a message or attach a picture"))
		return
	}

	attachments, err := parseAttachments(body.Attachments)
	if err != nil {
		WriteError(w, err)
		return
	}

	role := "customer"
	if user.IsAdmin() {
		role = "staff"
	}
	if _, err := a.admin.AddTicketMessage(r.Context(), ticketID, user.UserID, role, text, attachments); err != nil {
		WriteError(w, err)
		return
	}

	thread, err := a.ticketThread(r, ticketID, user)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusCreated, map[string]any{"thread": thread})
}

// handleTicketAttachment streams one picture from a conversation.
//
//	GET /api/tickets/attachments/{id}
func (a *App) handleTicketAttachment(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	attachmentID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "attachment id must be a number"))
		return
	}
	mime, data, err := a.admin.Attachment(r.Context(), attachmentID, user.UserID, user.IsAdmin())
	if err != nil {
		WriteError(w, err)
		return
	}
	w.Header().Set("Content-Type", mime)
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// ticketThread assembles the ticket and its messages for one viewer.
func (a *App) ticketThread(r *http.Request, ticketID int64, user *Principal) (models.TicketThread, error) {
	ticket, err := a.admin.TicketForViewer(r.Context(), ticketID, user.UserID, user.IsAdmin())
	if err != nil {
		return models.TicketThread{}, err
	}
	messages, err := a.admin.TicketMessages(r.Context(), ticketID)
	if err != nil {
		return models.TicketThread{}, err
	}
	return models.TicketThread{Ticket: ticket, Messages: messages}, nil
}

// --- catalogue management ---------------------------------------------------

// handleAdminCatalog lists catalogue entries, including inactive ones.
//
//	GET /api/admin/catalog?q=elden
func (a *App) handleAdminCatalog(w http.ResponseWriter, r *http.Request) {
	products, err := a.admin.Products(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"products": products})
}

// handleAdminUpdateProduct edits a catalogue entry. The slug stays fixed: it is
// the public URL and the search key, so changing it would break links.
//
//	PATCH /api/admin/catalog/{id}
//	{"title","description","coverUrl","heroUrl","developer","publisher",
//	 "releaseDate":"2024-06-21","contentType","isActive","genres":["action"]}
func (a *App) handleAdminUpdateProduct(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "product id must be a number"))
		return
	}
	var body struct {
		Title       string   `json:"title"`
		Description string   `json:"description"`
		CoverURL    string   `json:"coverUrl"`
		HeroURL     string   `json:"heroUrl"`
		Developer   string   `json:"developer"`
		Publisher   string   `json:"publisher"`
		ReleaseDate string   `json:"releaseDate"`
		ContentType string   `json:"contentType"`
		IsActive    bool     `json:"isActive"`
		Genres      []string `json:"genres"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}

	title := strings.TrimSpace(body.Title)
	if len(title) < 2 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "title is required"))
		return
	}
	switch body.ContentType {
	case "":
		body.ContentType = "full"
	case "full", "dlc", "both":
	default:
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "contentType must be full, dlc or both"))
		return
	}

	var release *time.Time
	if raw := strings.TrimSpace(body.ReleaseDate); raw != "" {
		parsed, err := time.Parse("2006-01-02", raw)
		if err != nil {
			WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "releaseDate must be YYYY-MM-DD"))
			return
		}
		release = &parsed
	}

	genres := make([]string, 0, len(body.Genres))
	seen := map[string]bool{}
	for _, genre := range body.Genres {
		genre = strings.TrimSpace(genre)
		if genre == "" || seen[genre] {
			continue
		}
		seen[genre] = true
		genres = append(genres, genre)
		if len(genres) == 10 {
			break
		}
	}

	product, err := a.admin.UpdateProduct(r.Context(), id, repo.ProductEditInput{
		Title:       title,
		Description: strings.TrimSpace(body.Description),
		CoverURL:    strings.TrimSpace(body.CoverURL),
		HeroURL:     strings.TrimSpace(body.HeroURL),
		Developer:   strings.TrimSpace(body.Developer),
		Publisher:   strings.TrimSpace(body.Publisher),
		ReleaseDate: release,
		ContentType: body.ContentType,
		IsActive:    body.IsActive,
		Genres:      genres,
	})
	if errors.Is(err, repo.ErrNotFound) {
		WriteError(w, ErrNotFound)
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"product": product})
}

// handleAdminBlockCards returns store cards for a hand-picked product list, so the
// homepage editor can preview a block without saving it first.
//
//	GET /api/admin/catalog/cards?ids=12,34,56
func (a *App) handleAdminBlockCards(w http.ResponseWriter, r *http.Request) {
	raw := r.URL.Query().Get("ids")
	ids := make([]int64, 0, 12)
	for _, part := range strings.Split(raw, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := strconv.ParseInt(part, 10, 64)
		if err != nil || id <= 0 {
			WriteError(w, Errorf(http.StatusBadRequest, "invalid_query", "ids must be a comma separated list of numbers"))
			return
		}
		ids = append(ids, id)
		if len(ids) == 12 {
			break
		}
	}
	cards, err := a.catalog.CardsByIDs(r.Context(), ids)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"cards": cards})
}
