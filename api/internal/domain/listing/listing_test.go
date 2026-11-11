package listing

import (
	"errors"
	"testing"

	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

const now = "2026-11-11T02:00:00.000Z"

func valid() Details {
	return Details{Title: "Modern house", Type: "rumah", Deal: "jual", PartnerID: "ptn-1", City: "Jakarta Selatan", Price: 2_000_000_000, LandArea: 120}
}

func ruleMsg(t *testing.T, err error) string {
	t.Helper()
	var r *shared.RuleError
	if !errors.As(err, &r) {
		t.Fatalf("want a rule error, got %v", err)
	}
	return r.Msg
}

func TestNewListingStartsInReviewAndRaisesCreated(t *testing.T) {
	l, err := New("lst-x", "AS-0099", valid(), now)
	if err != nil {
		t.Fatal(err)
	}
	if l.Status != Review || l.Slug != "modern-house-as-0099" {
		t.Fatalf("status %s slug %s", l.Status, l.Slug)
	}
	if ev := l.PullEvents(); len(ev) != 1 || ev[0].EventName() != "listing.created" {
		t.Fatalf("events %v", ev)
	}
	d := valid()
	d.Price = 0
	if _, err := New("lst-y", "AS-0100", d, now); ruleMsg(t, err) != "Enter a price above zero." {
		t.Fatal(err)
	}
}

func TestLifecycleRulesMatchTheFrontend(t *testing.T) {
	l, _ := New("lst-x", "AS-0099", valid(), now)
	l.PullEvents()
	if got := ruleMsg(t, l.MarkSold(1, now)); got != "The listing is in review." {
		t.Fatalf("sold from review: %q", got)
	}
	if err := l.Approve(now); err != nil {
		t.Fatal(err)
	}
	if got := ruleMsg(t, l.Approve(now)); got != "This listing has already been reviewed." {
		t.Fatalf("approve twice: %q", got)
	}
	if got := ruleMsg(t, l.Delist(" ", now)); got != "Say why the listing comes off the market." {
		t.Fatalf("empty reason: %q", got)
	}
	if err := l.MarkSold(1_900_000_000, now); err != nil {
		t.Fatal(err)
	}
	if got := ruleMsg(t, l.Delist("owner changed mind", now)); got != "The property is sold and cannot be delisted." {
		t.Fatalf("delist sold: %q", got)
	}
	ev := l.PullEvents()
	if len(ev) != 2 || ev[1].(Closed).Reason != "sold" {
		t.Fatalf("events %v", ev)
	}
}
