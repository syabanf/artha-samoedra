package listings

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/exclusive"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/listing"
	"github.com/syabanf/artha-samoedra/api/internal/domain/portal"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
	"github.com/syabanf/artha-samoedra/api/internal/domain/sharing"
)

// ---- in-memory fakes ----

type fakeListings struct{ byID map[string]listing.Listing }

func (f *fakeListings) Get(_ context.Context, id string) (*listing.Listing, error) {
	l, ok := f.byID[id]
	if !ok {
		return nil, shared.NotFound("listing " + id)
	}
	return &l, nil
}
func (f *fakeListings) Add(_ context.Context, l *listing.Listing) error {
	l.Version = 1
	f.byID[l.ID] = *l
	return nil
}
func (f *fakeListings) Save(_ context.Context, l *listing.Listing) error {
	if f.byID[l.ID].Version != l.Version {
		return shared.ErrConflict
	}
	l.Version++
	f.byID[l.ID] = *l
	return nil
}
func (f *fakeListings) NextCode(context.Context) (string, error) {
	var codes []string
	for _, l := range f.byID {
		codes = append(codes, l.Code)
	}
	return shared.NextCode(codes, "AS-", 4), nil
}

type fakeShares struct{ added []sharing.ProfitShare }

func (f *fakeShares) ExistsForListing(_ context.Context, id string) (bool, error) {
	for _, s := range f.added {
		if s.ListingID == id {
			return true, nil
		}
	}
	return false, nil
}
func (f *fakeShares) Add(_ context.Context, s sharing.ProfitShare) error {
	f.added = append(f.added, s)
	return nil
}

type fakeExclusives struct{ rights []*exclusive.Right }

func (f *fakeExclusives) ForListing(_ context.Context, id string) ([]*exclusive.Right, error) {
	var out []*exclusive.Right
	for _, r := range f.rights {
		if r.ListingID == id {
			out = append(out, r)
		}
	}
	return out, nil
}
func (f *fakeExclusives) Save(context.Context, *exclusive.Right) error { return nil }

type fakePortals struct {
	syncs []*portal.Sync
	saved int
}

func (f *fakePortals) ForListing(_ context.Context, id string) ([]*portal.Sync, error) {
	var out []*portal.Sync
	for _, s := range f.syncs {
		if s.ListingID == id {
			out = append(out, s)
		}
	}
	return out, nil
}
func (f *fakePortals) Save(context.Context, *portal.Sync) error { f.saved++; return nil }

type fakeDirectory map[string]bool

func (d fakeDirectory) Exists(_ context.Context, c, id string) (bool, error) { return d[c+"/"+id], nil }

type fixedClock struct{}

func (fixedClock) Now() time.Time { return time.Date(2026, 11, 11, 2, 0, 0, 0, time.UTC) }

type memOutbox struct{ events []shared.Event }

func (o *memOutbox) Append(_ context.Context, _ string, ev []shared.Event) error {
	o.events = append(o.events, ev...)
	return nil
}

type world struct {
	bus        *cqrs.Bus
	listings   *fakeListings
	shares     *fakeShares
	exclusives *fakeExclusives
	portals    *fakePortals
	outbox     *memOutbox
}

func newWorld() world {
	w := world{
		listings: &fakeListings{byID: map[string]listing.Listing{
			"lst-13": {ID: "lst-13", Code: "AS-0013", Title: "Corner plot", PartnerID: "ptn-3", City: "Bandung", Price: 2_700_000_000, LandArea: 420, Status: listing.Review, Version: 1},
			"lst-1":  {ID: "lst-1", Code: "AS-0001", Title: "House", PartnerID: "ptn-1", City: "Jakarta", Price: 1, LandArea: 1, Status: listing.Active, Version: 1},
		}},
		shares:     &fakeShares{},
		exclusives: &fakeExclusives{rights: []*exclusive.Right{{ID: "exc-1", ListingID: "lst-1", Status: "active"}}},
		portals:    &fakePortals{syncs: []*portal.Sync{{ID: "s1", ListingID: "lst-1", Status: "live"}, {ID: "s2", ListingID: "lst-1", Status: "removed"}}},
		outbox:     &memOutbox{},
	}
	subs := cqrs.NewSubscribers()
	w.bus = cqrs.NewBus(cqrs.Authorize, cqrs.Events(subs, w.outbox))
	Register(w.bus, subs, Handlers{
		Listings: w.listings, Shares: w.shares, Exclusives: w.exclusives, Portals: w.portals,
		Directory: fakeDirectory{"partners/ptn-1": true}, Clock: fixedClock{},
	})
	return w
}

var admin = iam.NewActor("usr-1", "Ayu", "rol-admin", []string{"listing.edit", "listing.approve", "listing.sell"})

func as(a iam.Actor) context.Context { return iam.WithActor(context.Background(), a) }

func TestApproveCreatesTheDefaultShareOnce(t *testing.T) {
	w := newWorld()
	if _, err := w.bus.Dispatch(as(admin), Approve{ID: "lst-13"}); err != nil {
		t.Fatal(err)
	}
	if got := w.listings.byID["lst-13"].Status; got != listing.Active {
		t.Fatalf("status %s", got)
	}
	if len(w.shares.added) != 1 || w.shares.added[0].CommissionPct != 2.5 {
		t.Fatalf("shares %+v", w.shares.added)
	}
	if len(w.outbox.events) != 1 || w.outbox.events[0].EventName() != "listing.approved" {
		t.Fatalf("outbox %v", w.outbox.events)
	}
	_, err := w.bus.Dispatch(as(admin), Approve{ID: "lst-13"})
	var rule *shared.RuleError
	if !errors.As(err, &rule) || rule.Msg != "This listing has already been reviewed." {
		t.Fatalf("second approve: %v", err)
	}
}

func TestSalesAgentCannotApprove(t *testing.T) {
	w := newWorld()
	agent := iam.NewActor("usr-2", "Dimas", "rol-sales", []string{"listing.view", "listing.edit"})
	if _, err := w.bus.Dispatch(as(agent), Approve{ID: "lst-13"}); !errors.Is(err, shared.ErrForbidden) {
		t.Fatalf("want forbidden, got %v", err)
	}
	if _, err := w.bus.Dispatch(context.Background(), Approve{ID: "lst-13"}); !errors.Is(err, shared.ErrUnauthenticated) {
		t.Fatalf("want unauthenticated, got %v", err)
	}
}

func TestDelistEndsExclusivesAndRemovesPortals(t *testing.T) {
	w := newWorld()
	if _, err := w.bus.Dispatch(as(admin), Delist{ID: "lst-1", Reason: "Owner withdrew"}); err != nil {
		t.Fatal(err)
	}
	if r := w.exclusives.rights[0]; r.Running() || r.Status != "ended" || *r.EndedAt != "2026-11-11T02:00:00.000Z" {
		t.Fatalf("exclusive %+v", r)
	}
	if w.portals.syncs[0].Status != portal.Removed || w.portals.saved != 1 {
		t.Fatalf("portals saved %d, first %s", w.portals.saved, w.portals.syncs[0].Status)
	}
}

func TestCreateChecksThePartnerAndNumbersTheCode(t *testing.T) {
	w := newWorld()
	c := Create{Title: "Villa", PartnerID: "ptn-9", City: "Bali", Price: 5, LandArea: 100}
	if _, err := w.bus.Dispatch(as(admin), c); !errors.Is(err, shared.ErrNotFound) {
		t.Fatalf("unknown partner: %v", err)
	}
	c.PartnerID = "ptn-1"
	out, err := w.bus.Dispatch(as(admin), c)
	if err != nil {
		t.Fatal(err)
	}
	if r := out.(Result); r.Code != "AS-0014" || r.Status != "review" {
		t.Fatalf("%+v", r)
	}
}

func TestUpdateChangesOnlyTheSentFields(t *testing.T) {
	w := newWorld()
	price := int64(3_000_000_000)
	if _, err := w.bus.Dispatch(as(admin), Update{ID: "lst-13", Price: &price}); err != nil {
		t.Fatal(err)
	}
	l := w.listings.byID["lst-13"]
	if l.Price != price || l.Title != "Corner plot" || l.Version != 2 {
		t.Fatalf("%+v", l)
	}
}
