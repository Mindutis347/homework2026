package httpx

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/mindutis347/keyforge/backend/internal/repo"
	"github.com/mindutis347/keyforge/backend/internal/service"
)

// cartQuantityBody is shared by the add and update endpoints.
type cartQuantityBody struct {
	OfferID  int64 `json:"offerId"`
	Quantity int   `json:"quantity"`
}

// handleGetCart returns the buyer's basket with live prices.
//
//	GET /api/cart
func (a *App) handleGetCart(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	cart, err := a.cart.Get(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, cart)
}

// handleAddToCart adds an offer (or changes its quantity).
//
//	POST /api/cart {"offerId":1,"quantity":1}
func (a *App) handleAddToCart(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	var body cartQuantityBody
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}
	if body.OfferID == 0 {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_body", "offerId is required"))
		return
	}
	if body.Quantity == 0 {
		body.Quantity = 1
	}
	if err := a.cart.Add(r.Context(), user.UserID, body.OfferID, body.Quantity); err != nil {
		writeCartError(w, err)
		return
	}
	cart, err := a.cart.Get(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, cart)
}

// handleUpdateCartItem changes the quantity of one cart line.
//
//	PATCH /api/cart/{offerId} {"quantity":2}
func (a *App) handleUpdateCartItem(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	offerID, err := strconv.ParseInt(r.PathValue("offerId"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "offerId must be a number"))
		return
	}
	var body struct {
		Quantity int `json:"quantity"`
	}
	if err := DecodeJSON(w, r, &body); err != nil {
		WriteError(w, err)
		return
	}
	if err := a.cart.SetQuantity(r.Context(), user.UserID, offerID, body.Quantity); err != nil {
		writeCartError(w, err)
		return
	}
	cart, err := a.cart.Get(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, cart)
}

// handleRemoveCartItem deletes one cart line.
//
//	DELETE /api/cart/{offerId}
func (a *App) handleRemoveCartItem(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	offerID, err := strconv.ParseInt(r.PathValue("offerId"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "offerId must be a number"))
		return
	}
	if err := a.cart.Remove(r.Context(), user.UserID, offerID); err != nil {
		WriteError(w, err)
		return
	}
	cart, err := a.cart.Get(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, cart)
}

// handleClearCart empties the cart.
//
//	DELETE /api/cart
func (a *App) handleClearCart(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	if err := a.cart.Clear(r.Context(), user.UserID); err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"items": []any{}, "itemCount": 0, "subtotalCents": 0})
}

// handleCheckout runs the simulated payment and delivers keys.
//
//	POST /api/checkout  Idempotency-Key: <uuid>  {"cardNumber":"4242..."}
func (a *App) handleCheckout(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	var body struct {
		CardNumber string `json:"cardNumber"`
		Method     string `json:"method"`
	}
	// The body is optional: an empty POST is a valid simulated payment.
	if r.ContentLength > 0 {
		if err := DecodeJSON(w, r, &body); err != nil {
			WriteError(w, err)
			return
		}
	}

	order, replayed, err := a.checkout.Pay(r.Context(), service.PaymentInput{
		UserID:         user.UserID,
		IdempotencyKey: r.Header.Get("Idempotency-Key"),
		CardNumber:     body.CardNumber,
		Method:         body.Method,
	})
	if errors.Is(err, service.ErrPaymentDeclined) {
		WriteError(w, Errorf(http.StatusPaymentRequired, "payment_declined",
			"your card was declined (test card ending 0002 always fails)"))
		return
	}
	if errors.Is(err, service.ErrEmptyCart) {
		WriteError(w, Errorf(http.StatusBadRequest, "empty_cart", "your cart is empty"))
		return
	}
	if errors.Is(err, service.ErrInsufficientStock) || errors.Is(err, service.ErrUnavailableOffer) {
		WriteError(w, Errorf(http.StatusConflict, "out_of_stock", err.Error()))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}

	status := http.StatusCreated
	if replayed {
		// 200 rather than 201 tells the client it already owned this order.
		status = http.StatusOK
	}
	WriteJSON(w, status, map[string]any{"order": order, "replayed": replayed})
}

// handleListOrders returns the buyer's purchase history.
//
//	GET /api/orders
func (a *App) handleListOrders(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	orders, err := a.orders.ListByUser(r.Context(), user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"orders": orders})
}

// handleGetOrder returns one order. Key metadata is included, but never a key
// value — that requires POST .../reveal.
//
//	GET /api/orders/{id}
func (a *App) handleGetOrder(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	orderID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_path", "order id must be a number"))
		return
	}
	order, err := a.orders.ByIDForUser(r.Context(), orderID, user.UserID)
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, order)
}

// handleRevealKeys discloses a line's key codes and stamps the display time.
// Callers must be the buyer; nothing is returned for an order they do not own.
//
//	POST /api/orders/{id}/items/{itemId}/reveal
func (a *App) handleRevealKeys(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	orderID, itemID, err := itemPathValues(r)
	if err != nil {
		WriteError(w, err)
		return
	}
	codes, displayedAt, err := a.orders.RevealKeys(r.Context(), orderID, itemID, user.UserID)
	if err != nil {
		writeRefundError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"keys": codes, "displayedAt": displayedAt})
}

// handleRefundItem refunds one line, allowed only while none of its keys has been
// displayed. Returns the recomputed order.
//
//	POST /api/orders/{id}/items/{itemId}/refund
func (a *App) handleRefundItem(w http.ResponseWriter, r *http.Request) {
	user := UserFrom(r.Context())
	orderID, itemID, err := itemPathValues(r)
	if err != nil {
		WriteError(w, err)
		return
	}
	order, err := a.orders.RefundItem(r.Context(), orderID, itemID, user.UserID)
	if err != nil {
		writeRefundError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"order": order})
}

func itemPathValues(r *http.Request) (int64, int64, error) {
	orderID, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		return 0, 0, Errorf(http.StatusBadRequest, "invalid_path", "order id must be a number")
	}
	itemID, err := strconv.ParseInt(r.PathValue("itemId"), 10, 64)
	if err != nil {
		return 0, 0, Errorf(http.StatusBadRequest, "invalid_path", "item id must be a number")
	}
	return orderID, itemID, nil
}

// writeRefundError turns the refund state rules into honest status codes: a
// missing or foreign order is a 404, a key already shown (or an already refunded
// line) is a 409 with the reason.
func writeRefundError(w http.ResponseWriter, err error) {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		WriteError(w, err)
		return
	}
	if errors.Is(err, repo.ErrNotFound) {
		WriteError(w, ErrNotFound)
		return
	}
	if errors.Is(err, repo.ErrConflict) {
		message := "this line can no longer be refunded"
		if idx := strings.Index(err.Error(), ":"); idx >= 0 {
			message = strings.TrimSpace(err.Error()[idx+1:])
		}
		WriteError(w, Errorf(http.StatusConflict, "conflict", message))
		return
	}
	WriteError(w, err)
}

func writeCartError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repo.ErrOfferUnavailable):
		WriteError(w, Errorf(http.StatusConflict, "offer_unavailable",
			"this offer is no longer available in that quantity"))
	case errors.Is(err, repo.ErrNotFound):
		WriteError(w, ErrNotFound)
	default:
		WriteError(w, err)
	}
}
