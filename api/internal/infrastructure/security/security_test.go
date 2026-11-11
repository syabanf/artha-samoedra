package security

import (
	"testing"
	"time"
)

func TestJWTRoundTripAndExpiry(t *testing.T) {
	now := time.Date(2026, 11, 11, 2, 0, 0, 0, time.UTC)
	j := JWT{Secret: []byte("test-secret"), TTL: time.Hour, Now: func() time.Time { return now }}
	tok, _, err := j.Issue("usr-1")
	if err != nil {
		t.Fatal(err)
	}
	if sub, err := j.Verify(tok); err != nil || sub != "usr-1" {
		t.Fatalf("%s %v", sub, err)
	}
	other := JWT{Secret: []byte("other"), TTL: time.Hour, Now: j.Now}
	if _, err := other.Verify(tok); err == nil {
		t.Fatal("a token signed with another secret must fail")
	}
	later := JWT{Secret: j.Secret, Now: func() time.Time { return now.Add(2 * time.Hour) }}
	if _, err := later.Verify(tok); err == nil {
		t.Fatal("an expired token must fail")
	}
}

func TestBcryptMatches(t *testing.T) {
	h, err := Hash("artha-demo")
	if err != nil {
		t.Fatal(err)
	}
	b := Bcrypt{}
	if !b.Matches(h, "artha-demo") || b.Matches(h, "wrong") || b.Matches("", "artha-demo") {
		t.Fatal("bcrypt comparison is off")
	}
}
