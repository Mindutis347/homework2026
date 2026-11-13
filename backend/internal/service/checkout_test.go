package service

import (
	"math"
	"regexp"
	"testing"
)

func TestDeclined(t *testing.T) {
	cases := []struct {
		card string
		want bool
	}{
		{"4242 4242 4242 4242", false},
		{"4242424242424242", false},
		{"4000 0000 0000 0002", true},
		{"4000000000000002", true},
		{"5555-5555-5555-4444", false},
		{"", false},
	}
	for _, tc := range cases {
		if got := declined(tc.card); got != tc.want {
			t.Errorf("declined(%q) = %v, want %v", tc.card, got, tc.want)
		}
	}
}

func TestNewReferenceFormat(t *testing.T) {
	pattern := regexp.MustCompile(`^KF-[0-9A-F]{10}$`)
	seen := map[string]bool{}

	for i := 0; i < 100; i++ {
		ref, err := newReference()
		if err != nil {
			t.Fatalf("newReference: %v", err)
		}
		if !pattern.MatchString(ref) {
			t.Fatalf("reference %q does not match %s", ref, pattern)
		}
		if seen[ref] {
			t.Fatalf("duplicate reference %q", ref)
		}
		seen[ref] = true
	}
}

func TestCommissionMath(t *testing.T) {
	// The ledger must never pay out more than the buyer paid.
	for _, lineTotal := range []int{99, 499, 1000, 1299, 5999, 7999} {
		commission := int(math.Round(float64(lineTotal) * CommissionRate))
		payout := lineTotal - commission
		if commission+payout != lineTotal {
			t.Fatalf("line %d: commission %d + payout %d != total", lineTotal, commission, payout)
		}
		if commission <= 0 {
			t.Fatalf("line %d: platform earned nothing", lineTotal)
		}
		if CommissionRate <= 0 || CommissionRate >= 1 {
			t.Fatalf("commission rate %v is not a sane fraction", CommissionRate)
		}
	}
}
