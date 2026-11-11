package inquiries

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/inquiry"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

type fakeInquiries struct{ byID map[string]inquiry.Inquiry }

func (f *fakeInquiries) Get(_ context.Context, id string) (*inquiry.Inquiry, error) {
	i, ok := f.byID[id]
	if !ok {
		return nil, shared.NotFound("inquiry " + id)
	}
	return &i, nil
}
func (f *fakeInquiries) Add(_ context.Context, i *inquiry.Inquiry) error {
	i.Version = 1
	f.byID[i.ID] = *i
	return nil
}
func (f *fakeInquiries) Save(_ context.Context, i *inquiry.Inquiry) error {
	if f.byID[i.ID].Version != i.Version {
		return shared.ErrConflict
	}
	i.Version++
	f.byID[i.ID] = *i
	return nil
}
func (f *fakeInquiries) NextCode(_ context.Context, prefix string) (string, error) {
	var codes []string
	for _, i := range f.byID {
		codes = append(codes, i.Code)
	}
	return shared.NextCode(codes, prefix, 4), nil
}

type fakeDirectory map[string]bool

func (d fakeDirectory) Exists(_ context.Context, c, id string) (bool, error) { return d[c+"/"+id], nil }

type fixedClock struct{}

func (fixedClock) Now() time.Time { return time.Date(2026, 11, 11, 2, 0, 0, 0, time.UTC) }

type memOutbox struct{ names []string }

func (o *memOutbox) Append(_ context.Context, _ string, ev []shared.Event) error {
	for _, e := range ev {
		o.names = append(o.names, e.EventName())
	}
	return nil
}

func setup() (*cqrs.Bus, *fakeInquiries, *memOutbox) {
	repo := &fakeInquiries{byID: map[string]inquiry.Inquiry{
		"inq-1": {ID: "inq-1", Code: "INQ-26-0101", Name: "Rizky", Phone: "081122334455", Status: inquiry.New, Version: 1},
	}}
	out := &memOutbox{}
	bus := cqrs.NewBus(cqrs.Authorize, cqrs.Events(cqrs.NewSubscribers(), out))
	Register(bus, Handlers{Inquiries: repo, Directory: fakeDirectory{"listings/lst-1": true, "users/usr-2": true}, Clock: fixedClock{}})
	return bus, repo, out
}

func TestSubmitIsPublicAndNumbersTheCode(t *testing.T) {
	bus, repo, out := setup()
	lst := "lst-1"
	res, err := bus.Dispatch(context.Background(), Submit{Name: "Sari", Phone: "0812 3456 7890", ListingID: &lst, Message: "Can I visit?"})
	if err != nil {
		t.Fatal(err)
	}
	r := res.(Result)
	if r.Code != "INQ-26-0102" || r.Status != "new" || r.OwnerID != nil {
		t.Fatalf("%+v", r)
	}
	if got := repo.byID[r.ID]; got.Channel != inquiry.WebChat || *got.ListingID != "lst-1" {
		t.Fatalf("%+v", got)
	}
	if len(out.names) != 1 || out.names[0] != "inquiry.submitted" {
		t.Fatalf("%v", out.names)
	}
}

func TestSubmitRefusesBadInput(t *testing.T) {
	bus, _, _ := setup()
	missing := "lst-404"
	if _, err := bus.Dispatch(context.Background(), Submit{Name: "Sari", Phone: "081234567890", ListingID: &missing}); !errors.Is(err, shared.ErrNotFound) {
		t.Fatalf("unknown listing: %v", err)
	}
	var rule *shared.RuleError
	if _, err := bus.Dispatch(context.Background(), Submit{Name: "Sari", Phone: "0812"}); !errors.As(err, &rule) || rule.Msg != "Enter a full WhatsApp number." {
		t.Fatalf("short phone: %v", err)
	}
}

func TestAssignAndSetStatusNeedInquiryManage(t *testing.T) {
	bus, repo, _ := setup()
	viewer := iam.WithActor(context.Background(), iam.NewActor("usr-7", "Teguh", "rol-finance", []string{"inquiry.view"}))
	if _, err := bus.Dispatch(viewer, Assign{ID: "inq-1", OwnerID: "usr-2"}); !errors.Is(err, shared.ErrForbidden) {
		t.Fatalf("want forbidden, got %v", err)
	}
	mgr := iam.WithActor(context.Background(), iam.NewActor("usr-6", "Hana", "rol-manager", []string{"inquiry.manage"}))
	if _, err := bus.Dispatch(mgr, Assign{ID: "inq-1", OwnerID: "usr-404"}); !errors.Is(err, shared.ErrNotFound) {
		t.Fatalf("unknown user: %v", err)
	}
	if _, err := bus.Dispatch(mgr, Assign{ID: "inq-1", OwnerID: "usr-2"}); err != nil {
		t.Fatal(err)
	}
	if _, err := bus.Dispatch(mgr, SetStatus{ID: "inq-1", Status: "survey"}); err != nil {
		t.Fatal(err)
	}
	got := repo.byID["inq-1"]
	if *got.OwnerID != "usr-2" || got.Status != inquiry.Survey || got.Version != 3 {
		t.Fatalf("%+v", got)
	}
}
