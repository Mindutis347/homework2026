package httpx

import (
	"errors"
	"fmt"
	"net/http"
	"net/mail"
	"strings"
	"time"

	"github.com/mindutis347/keyforge/backend/internal/auth"
	"github.com/mindutis347/keyforge/backend/internal/models"
	"github.com/mindutis347/keyforge/backend/internal/repo"
)

const verificationTTL = 15 * time.Minute

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
}

type credentialsRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type verifyRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func normalizeEmail(raw string) string { return strings.ToLower(strings.TrimSpace(raw)) }

func validateEmail(raw string) error {
	if _, err := mail.ParseAddress(raw); err != nil {
		return Errorf(http.StatusBadRequest, "invalid_email", "enter a valid e-mail address")
	}
	return nil
}

func validatePassword(pw string) error {
	if len(pw) < 8 {
		return Errorf(http.StatusBadRequest, "weak_password", "password must be at least 8 characters")
	}
	if len(pw) > 72 { // bcrypt silently truncates beyond 72 bytes
		return Errorf(http.StatusBadRequest, "weak_password", "password must be at most 72 characters")
	}
	return nil
}

// issueCode generates a 6-digit code, stores only its HMAC, and records the
// "sent" e-mail. The plaintext code is returned so the UI can show it in the
// simulated inbox — no SMTP provider is needed for the evaluator.
func (a *App) issueCode(r *http.Request, userID int64, email, displayName string) (string, error) {
	code, err := auth.GenerateCode()
	if err != nil {
		return "", err
	}
	if err := a.users.SetVerificationCode(r.Context(), userID,
		auth.HashCode(a.cfg.JWTSecret, code), time.Now().Add(verificationTTL)); err != nil {
		return "", err
	}
	body := fmt.Sprintf("Hi %s,\n\nyour Keyforge verification code is %s.\nIt expires in %d minutes.",
		displayName, code, int(verificationTTL.Minutes()))
	if err := a.users.RecordEmail(r.Context(), repo.Mail{
		Recipient: email,
		Subject:   "Your Keyforge verification code",
		Body:      body,
		Code:      code,
	}); err != nil {
		return "", err
	}
	return code, nil
}

// handleRegister creates a customer account and sends a verification code.
//
//	POST /api/auth/register {"email","password","displayName"}
func (a *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := DecodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	email := normalizeEmail(req.Email)
	req.DisplayName = strings.TrimSpace(req.DisplayName)
	if req.DisplayName == "" {
		req.DisplayName = strings.Split(email, "@")[0]
	}
	if err := validateEmail(email); err != nil {
		WriteError(w, err)
		return
	}
	if err := validatePassword(req.Password); err != nil {
		WriteError(w, err)
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		WriteError(w, err)
		return
	}

	user, err := a.users.Create(r.Context(), email, hash, req.DisplayName)
	if errors.Is(err, repo.ErrEmailTaken) {
		WriteError(w, Errorf(http.StatusConflict, "email_taken", "an account with this e-mail already exists"))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}

	code, err := a.issueCode(r, user.ID, email, user.DisplayName)
	if err != nil {
		WriteError(w, err)
		return
	}

	resp := map[string]any{"user": user}
	if a.cfg.ShowDevCodes {
		resp["devCode"] = code
	}
	WriteJSON(w, http.StatusCreated, resp)
}

// handleVerify confirms the e-mail code and signs the user in.
//
//	POST /api/auth/verify {"email","code"}
func (a *App) handleVerify(w http.ResponseWriter, r *http.Request) {
	var req verifyRequest
	if err := DecodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	email := normalizeEmail(req.Email)
	code := strings.TrimSpace(req.Code)
	if code == "" {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_code", "enter the 6-digit code"))
		return
	}

	user, err := a.users.VerifyCode(r.Context(), email, auth.HashCode(a.cfg.JWTSecret, code))
	if errors.Is(err, repo.ErrNotFound) {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_code", "that code is wrong or has expired"))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}

	if err := a.startSession(w, user); err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"user": user})
}

// handleResendCode issues a fresh verification code.
//
//	POST /api/auth/resend {"email"}
func (a *App) handleResendCode(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email string `json:"email"`
	}
	if err := DecodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	email := normalizeEmail(req.Email)

	creds, err := a.users.ByEmail(r.Context(), email)
	if errors.Is(err, repo.ErrNotFound) {
		// Do not leak whether the account exists.
		WriteJSON(w, http.StatusAccepted, map[string]any{"status": "code_sent"})
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	if creds.User.IsVerified {
		WriteJSON(w, http.StatusAccepted, map[string]any{"status": "already_verified"})
		return
	}

	code, err := a.issueCode(r, creds.User.ID, email, creds.User.DisplayName)
	if err != nil {
		WriteError(w, err)
		return
	}
	resp := map[string]any{"status": "code_sent"}
	if a.cfg.ShowDevCodes {
		resp["devCode"] = code
	}
	WriteJSON(w, http.StatusAccepted, resp)
}

// handleLogin verifies credentials and sets the session cookie.
//
//	POST /api/auth/login {"email","password"}
func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req credentialsRequest
	if err := DecodeJSON(w, r, &req); err != nil {
		WriteError(w, err)
		return
	}
	email := normalizeEmail(req.Email)

	creds, err := a.users.ByEmail(r.Context(), email)
	// Same message for unknown e-mail and wrong password: no account enumeration.
	if errors.Is(err, repo.ErrNotFound) || (err == nil && !auth.CheckPassword(creds.PasswordHash, req.Password)) {
		WriteError(w, Errorf(http.StatusUnauthorized, "invalid_credentials", "wrong e-mail or password"))
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}

	if err := a.startSession(w, creds.User); err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"user": creds.User})
}

func (a *App) startSession(w http.ResponseWriter, user models.User) error {
	token, err := a.issuer.Issue(user.ID, user.Email, user.Role, user.IsVerified)
	if err != nil {
		return err
	}
	a.setSessionCookie(w, token)
	return nil
}

// handleLogout clears the cookie. Logout is idempotent.
//
//	POST /api/auth/logout
func (a *App) handleLogout(w http.ResponseWriter, r *http.Request) {
	a.clearSessionCookie(w)
	WriteJSON(w, http.StatusOK, map[string]any{"status": "signed_out"})
}

// handleMe returns the current user (or null) so the SPA can bootstrap auth
// state without treating 401 as an error.
//
//	GET /api/auth/me
func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	p := UserFrom(r.Context())
	if p == nil {
		WriteJSON(w, http.StatusOK, map[string]any{"user": nil})
		return
	}
	// Re-read so role/verification changes made by an admin show up immediately.
	user, err := a.users.ByID(r.Context(), p.UserID)
	if errors.Is(err, repo.ErrNotFound) {
		a.clearSessionCookie(w)
		WriteJSON(w, http.StatusOK, map[string]any{"user": nil})
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"user": user})
}

// handleDevInbox exposes the simulated mailbox so the verification code can be
// read without SMTP. Disabled when SHOW_DEV_CODES=false.
//
//	GET /api/dev/inbox?email=...
func (a *App) handleDevInbox(w http.ResponseWriter, r *http.Request) {
	if !a.cfg.ShowDevCodes {
		WriteError(w, ErrNotFound)
		return
	}
	email := normalizeEmail(r.URL.Query().Get("email"))
	if email == "" {
		WriteError(w, Errorf(http.StatusBadRequest, "invalid_query", "email is required"))
		return
	}
	msg, err := a.users.LatestMailFor(r.Context(), email)
	if errors.Is(err, repo.ErrNotFound) {
		WriteJSON(w, http.StatusOK, map[string]any{"mail": nil})
		return
	}
	if err != nil {
		WriteError(w, err)
		return
	}
	WriteJSON(w, http.StatusOK, map[string]any{"mail": msg})
}
