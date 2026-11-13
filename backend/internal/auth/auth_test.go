package auth

import (
	"strings"
	"testing"
	"time"
)

func TestPasswordHashing(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == "correct horse battery staple" {
		t.Fatal("password was not hashed")
	}
	if !CheckPassword(hash, "correct horse battery staple") {
		t.Fatal("correct password rejected")
	}
	if CheckPassword(hash, "wrong password") {
		t.Fatal("wrong password accepted")
	}
}

func TestGenerateCode(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 200; i++ {
		code, err := GenerateCode()
		if err != nil {
			t.Fatalf("generate: %v", err)
		}
		if len(code) != 6 {
			t.Fatalf("code %q is not 6 digits", code)
		}
		for _, r := range code {
			if r < '0' || r > '9' {
				t.Fatalf("code %q contains a non-digit", code)
			}
		}
		seen[code] = true
	}
	if len(seen) < 100 {
		t.Fatalf("codes look non-random: only %d distinct values in 200 draws", len(seen))
	}
}

func TestCodeHashing(t *testing.T) {
	secret := []byte("test-secret")
	hash := HashCode(secret, "123456")

	if hash == "123456" {
		t.Fatal("code stored in plaintext")
	}
	if !CodeMatches(secret, hash, "123456") {
		t.Fatal("correct code rejected")
	}
	if CodeMatches(secret, hash, "654321") {
		t.Fatal("wrong code accepted")
	}
	// A different server secret must not validate the same code.
	if CodeMatches([]byte("other-secret"), hash, "123456") {
		t.Fatal("hash is not keyed by the server secret")
	}
	// Trailing whitespace from a paste should not lock the user out.
	if !CodeMatches(secret, hash, " 123456 ") {
		t.Fatal("whitespace should be trimmed")
	}
}

func TestIssueAndParse(t *testing.T) {
	issuer := NewIssuer([]byte("a-sufficiently-long-secret"), time.Hour)
	token, err := issuer.Issue(42, "buyer@example.com", "customer", true)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	claims, err := issuer.Parse(token)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if claims.Subject != "42" || claims.Email != "buyer@example.com" ||
		claims.Role != "customer" || !claims.IsVerified {
		t.Fatalf("claims did not round-trip: %+v", claims)
	}
}

func TestParseRejectsBadTokens(t *testing.T) {
	secret := []byte("a-sufficiently-long-secret")
	issuer := NewIssuer(secret, time.Hour)

	otherIssuer := NewIssuer([]byte("a-different-long-secret-value"), time.Hour)
	foreign, err := otherIssuer.Issue(1, "x@y.z", "customer", true)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	expired := NewIssuer(secret, -time.Minute)
	expiredToken, err := expired.Issue(1, "x@y.z", "customer", true)
	if err != nil {
		t.Fatalf("issue expired: %v", err)
	}

	cases := map[string]string{
		"signed by another key": foreign,
		"expired":               expiredToken,
		"not a jwt":             "hello.world.three",
		"empty":                 "",
	}
	for name, token := range cases {
		if _, err := issuer.Parse(token); err == nil {
			t.Errorf("%s: token was accepted", name)
		}
	}
}

func TestIssueRejectsNoneAlgorithm(t *testing.T) {
	// A classic JWT attack: alg=none must never verify.
	unsigned := "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxIiwiaXNzIjoia2V5Zm9yZ2UifQ."
	issuer := NewIssuer([]byte("a-sufficiently-long-secret"), time.Hour)
	if _, err := issuer.Parse(unsigned); err == nil {
		t.Fatal("alg=none token was accepted")
	}
	if !strings.Contains(strings.ToLower(unsigned), "none") {
		t.Skip("test fixture changed")
	}
}
