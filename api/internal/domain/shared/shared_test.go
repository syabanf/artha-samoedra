package shared

import (
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestNextCodeFollowsTheHighest(t *testing.T) {
	got := NextCode([]string{"AS-0009", "AS-0016", "MT-099", "AS-x"}, "AS-", 4)
	if got != "AS-0017" {
		t.Fatalf("got %s", got)
	}
	if got := NextCode(nil, "INQ-26-", 4); got != "INQ-26-0001" {
		t.Fatalf("empty: %s", got)
	}
}

func TestNewIDKeepsThePrefix(t *testing.T) {
	a, b := NewID("lst"), NewID("lst")
	if !strings.HasPrefix(a, "lst-") || a == b {
		t.Fatalf("%s %s", a, b)
	}
}

func TestKindClassifiesWrappedErrors(t *testing.T) {
	cases := map[string]error{
		"rule":            Rule("no"),
		"not_found":       NotFound("listing lst-x"),
		"unauthenticated": Unauthenticated("The email or password is wrong."),
		"forbidden":       fmt.Errorf("x: %w", ErrForbidden),
		"conflict":        ErrConflict,
		"error":           errors.New("boom"),
	}
	for want, err := range cases {
		if got := Kind(err); got != want {
			t.Errorf("%v: got %s want %s", err, got, want)
		}
	}
}
