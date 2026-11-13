package auth

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

// Claims is the JWT payload. Keeping the role and verification flag in the
// token means the hot path needs no database round-trip to authorise; a role
// change takes effect on the next sign-in, which is an accepted trade-off for
// this scale (and the alternative — a session table — was deliberately skipped).
type Claims struct {
	Email      string `json:"email"`
	Role       string `json:"role"`
	IsVerified bool   `json:"verified"`
	jwt.RegisteredClaims
}

type Issuer struct {
	secret []byte
	ttl    time.Duration
}

func NewIssuer(secret []byte, ttl time.Duration) *Issuer {
	return &Issuer{secret: secret, ttl: ttl}
}

func (i *Issuer) Issue(userID int64, email, role string, verified bool) (string, error) {
	now := time.Now()
	claims := Claims{
		Email:      email,
		Role:       role,
		IsVerified: verified,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   fmt.Sprint(userID),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(i.ttl)),
			Issuer:    "keyforge",
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(i.secret)
}

var ErrInvalidToken = errors.New("invalid token")

// Parse validates the signature, algorithm and expiry, returning the claims.
func (i *Issuer) Parse(tokenString string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return i.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}), jwt.WithIssuer("keyforge"))
	if err != nil {
		return nil, ErrInvalidToken
	}
	if !claims.ExpiresAt.After(time.Now()) {
		return nil, ErrInvalidToken
	}
	return claims, nil
}

func (i *Issuer) TTL() time.Duration { return i.ttl }

// HashPassword returns a bcrypt hash (cost 12 balances security and latency).
func HashPassword(plain string) (string, error) {
	b, err := bcrypt.GenerateFromPassword([]byte(plain), 12)
	return string(b), err
}

func CheckPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// GenerateCode returns a cryptographically random 6-digit verification code.
func GenerateCode() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

// HashCode is a keyed SHA-256 of the code. The code is low-entropy and
// short-lived, so a cheap keyed hash is enough; bcrypt would add latency to
// every verification attempt without meaningful benefit for 6 digits.
func HashCode(secret []byte, code string) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(mac.Sum(nil))
}

func CodeMatches(secret []byte, hash, code string) bool {
	return hmac.Equal([]byte(hash), []byte(HashCode(secret, code)))
}
