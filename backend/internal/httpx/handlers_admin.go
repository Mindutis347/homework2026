package httpx

import (
	"errors"
	"net/http"
	"strconv"

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

// handleCreateTicket lets a signed-in buyer file a support request.
//
//	POST /api/tickets {"subject","body","category","orderId"}
//
// The refund flag is derived from the category rather than sent by the client, so
// the queue's refund filter can never disagree with the category shown beside it.
func (a *App) handleCreateTicket(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	var body struct {
		Subject  string `json:"subject"`
		Body     string `json:"body"`
		Category string `json:"category"`
		OrderID  *int64 `json:"orderId"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
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
	if err := a.admin.CreateTicket(r.Context(), user.UserID, body.OrderID, body.Subject,
		body.Body, body.Category, body.Category == "refund"); err != nil {
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
