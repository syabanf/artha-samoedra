package records

import (
	"context"
	"encoding/json"
	"errors"
	"maps"
	"slices"
	"strings"
	"testing"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
	"github.com/syabanf/artha-samoedra/api/seed"
)

func TestEverySeededCollectionHasAPermission(t *testing.T) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(seed.JSON, &top); err != nil {
		t.Fatal(err)
	}
	var lists, objects []string
	for k, v := range top {
		if v[0] == '[' {
			lists = append(lists, k)
		} else {
			objects = append(objects, k)
		}
	}
	slices.Sort(lists)
	slices.Sort(objects)
	got := slices.Sorted(maps.Keys(collectionPermission))
	gotSingletons := slices.Sorted(maps.Keys(singletonPermission))
	if !slices.Equal(lists, got) {
		t.Errorf("collections differ:\nseed %v\nmap  %v", lists, got)
	}
	if !slices.Equal(objects, gotSingletons) {
		t.Errorf("singletons differ:\nseed %v\nmap  %v", objects, gotSingletons)
	}
	if len(got) != 101 {
		t.Errorf("want 101 collections, got %d", len(got))
	}
}

type fakeReader struct{ last Filter }

func (f *fakeReader) List(_ context.Context, fl Filter) (Page, error) {
	f.last = fl
	return Page{Items: []json.RawMessage{json.RawMessage(`{"id":"lst-1","partnerId":"ptn-1","title":"House","status":"active"}`)}, Total: 1}, nil
}
func (f *fakeReader) Get(context.Context, string, string) (json.RawMessage, error) { return nil, nil }
func (f *fakeReader) Singleton(context.Context, string) (json.RawMessage, error) {
	return json.RawMessage(`{}`), nil
}
func (f *fakeReader) CountBy(context.Context, string, string) (map[string]int, error) {
	return map[string]int{"active": 3, "review": 2}, nil
}

func TestListChecksTheCollectionPermissionAndClampsTheLimit(t *testing.T) {
	r := &fakeReader{}
	bus := cqrs.NewBus(cqrs.Authorize)
	Register(bus, r)
	hr := iam.WithActor(context.Background(), iam.NewActor("usr-10", "Lestari", "rol-hr", []string{"hr.view"}))
	if _, err := bus.Dispatch(hr, List{Collection: "journals"}); !errors.Is(err, shared.ErrForbidden) {
		t.Fatalf("journals for HR: %v", err)
	}
	if _, err := bus.Dispatch(hr, List{Collection: "credentials"}); !errors.Is(err, shared.ErrNotFound) {
		t.Fatalf("credentials: %v", err)
	}
	if _, err := bus.Dispatch(hr, List{Collection: "employees", Sort: "-name", Limit: 999}); err != nil {
		t.Fatal(err)
	}
	if r.last.Limit != MaxLimit || r.last.SortField != "name" || !r.last.Desc {
		t.Fatalf("%+v", r.last)
	}
	if _, err := bus.Dispatch(hr, List{Collection: "employees", Sort: "name; drop table"}); err == nil {
		t.Fatal("a bad sort field must be refused")
	}
}

func TestStatsAndPublicListings(t *testing.T) {
	bus := cqrs.NewBus(cqrs.Authorize)
	Register(bus, &fakeReader{})
	viewer := iam.WithActor(context.Background(), iam.NewActor("usr-2", "Dimas", "rol-sales", []string{"listing.view"}))
	out, err := bus.Dispatch(viewer, ListingStats{})
	if err != nil {
		t.Fatal(err)
	}
	if s := out.(Stats); s.Total != 5 || s.ByStatus["sold"] != 0 || s.ByStatus["active"] != 3 {
		t.Fatalf("%+v", s)
	}
	out, err = bus.Dispatch(context.Background(), PublicListings{})
	if err != nil {
		t.Fatal(err)
	}
	item := string(out.(Page).Items[0])
	if strings.Contains(item, "partnerId") || !strings.Contains(item, `"title":"House"`) {
		t.Fatalf("public item %s", item)
	}
}
