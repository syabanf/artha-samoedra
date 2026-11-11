// Package records is the read side: it lists and fetches the camelCase documents every context
// stores, behind the permission each collection needs. The AI agent calls these queries by name.
package records

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

const (
	DefaultLimit = 50
	MaxLimit     = 200
)

// Filter is a validated records.list request the Reader turns into SQL.
type Filter struct {
	Collection string
	Q          string
	Where      map[string]string
	// SortField is a top-level JSON field, or empty for seed order. Desc reverses it.
	SortField     string
	Desc          bool
	Limit, Offset int
}

type Page struct {
	Items []json.RawMessage `json:"items"`
	Total int               `json:"total"`
}

// Reader is the read-model port.
type Reader interface {
	List(ctx context.Context, f Filter) (Page, error)
	Get(ctx context.Context, collection, id string) (json.RawMessage, error)
	Singleton(ctx context.Context, name string) (json.RawMessage, error)
	CountBy(ctx context.Context, collection, field string) (map[string]int, error)
}

// List is "records.list". Where matches top-level fields by equality ("null" matches null).
// Sort is "field" or "-field"; without it records come in seed order.
type List struct {
	Collection string            `json:"collection"`
	Q          string            `json:"q"`
	Where      map[string]string `json:"where"`
	Sort       string            `json:"sort"`
	Limit      int               `json:"limit"`
	Offset     int               `json:"offset"`
}

type Get struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
}

type Setting struct {
	Name string `json:"name"`
}

type ListingStats struct{}

// PublicListings feeds the website: live listings with the fields a visitor may see.
type PublicListings struct {
	Q      string `json:"q"`
	Limit  int    `json:"limit"`
	Offset int    `json:"offset"`
}

// An unknown collection asks for no permission so the handler can answer "not found".
func permissionOf(collection string) iam.Permission {
	p, _ := PermissionFor(collection)
	return p
}

func (List) MessageName() string                  { return "records.list" }
func (q List) Permission() iam.Permission         { return permissionOf(q.Collection) }
func (Get) MessageName() string                   { return "records.get" }
func (q Get) Permission() iam.Permission          { return permissionOf(q.Collection) }
func (Setting) MessageName() string               { return "settings.get" }
func (q Setting) Permission() iam.Permission      { return singletonPermission[q.Name] }
func (ListingStats) MessageName() string          { return "listings.stats" }
func (ListingStats) Permission() iam.Permission   { return "listing.view" }
func (PublicListings) MessageName() string        { return "listings.public" }
func (PublicListings) Permission() iam.Permission { return iam.Public }

func Register(bus *cqrs.Bus, r Reader) {
	cqrs.Register(bus, "List records of a collection: {collection, q, where, sort, limit, offset}. The permission depends on the collection.",
		func(ctx context.Context, q List) (any, error) { return list(ctx, r, q) })
	cqrs.Register(bus, "Fetch one record: {collection, id}. The permission depends on the collection.",
		func(ctx context.Context, q Get) (any, error) {
			if _, ok := PermissionFor(q.Collection); !ok {
				return nil, unknownCollection(q.Collection)
			}
			return r.Get(ctx, q.Collection, q.ID)
		})
	cqrs.Register(bus, "Read a settings object by name, e.g. company or financeSettings.",
		func(ctx context.Context, q Setting) (any, error) {
			if _, ok := singletonPermission[q.Name]; !ok {
				return nil, shared.NotFound(fmt.Sprintf("settings %q", q.Name))
			}
			return r.Singleton(ctx, q.Name)
		})
	cqrs.Register(bus, "Count listings by status.",
		func(ctx context.Context, _ ListingStats) (any, error) { return listingStats(ctx, r) })
	cqrs.Register(bus, "Live listings for the public website.",
		func(ctx context.Context, q PublicListings) (any, error) { return publicListings(ctx, r, q) })
}

var fieldName = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)

func unknownCollection(c string) error { return shared.NotFound(fmt.Sprintf("collection %q", c)) }

func list(ctx context.Context, r Reader, q List) (Page, error) {
	if _, ok := PermissionFor(q.Collection); !ok {
		return Page{}, unknownCollection(q.Collection)
	}
	f := Filter{Collection: q.Collection, Q: q.Q, Where: q.Where, Limit: q.Limit, Offset: q.Offset}
	if q.Sort != "" {
		f.SortField, f.Desc = q.Sort, q.Sort[0] == '-'
		if f.Desc {
			f.SortField = q.Sort[1:]
		}
		if !fieldName.MatchString(f.SortField) {
			return Page{}, shared.Rule("Sort by a field name, e.g. createdAt or -price.")
		}
	}
	for k := range q.Where {
		if !fieldName.MatchString(k) {
			return Page{}, shared.Rule("Filter on a field name, not %q.", k)
		}
	}
	switch {
	case f.Limit <= 0:
		f.Limit = DefaultLimit
	case f.Limit > MaxLimit:
		f.Limit = MaxLimit
	}
	if f.Offset < 0 {
		f.Offset = 0
	}
	return r.List(ctx, f)
}

// ListingStatuses is every listing status, so stats report zeros too.
var ListingStatuses = []string{"review", "active", "reserved", "sold", "delisted"}

type Stats struct {
	Total    int            `json:"total"`
	ByStatus map[string]int `json:"byStatus"`
}

func listingStats(ctx context.Context, r Reader) (Stats, error) {
	counts, err := r.CountBy(ctx, "listings", "status")
	if err != nil {
		return Stats{}, err
	}
	s := Stats{ByStatus: map[string]int{}}
	for _, st := range ListingStatuses {
		s.ByStatus[st] = 0
	}
	for st, n := range counts {
		s.ByStatus[st] = n
		s.Total += n
	}
	return s, nil
}

// publicFields are the listing fields the website shows. Partner, source and sale data stay inside.
var publicFields = []string{
	"id", "code", "slug", "title", "type", "deal", "city", "district", "address", "price", "landArea",
	"buildingArea", "bedrooms", "certificate", "description", "highlights", "photo", "photos", "status",
}

func publicListings(ctx context.Context, r Reader, q PublicListings) (Page, error) {
	page, err := list(ctx, r, List{Collection: "listings", Q: q.Q, Where: map[string]string{"status": "active"}, Limit: q.Limit, Offset: q.Offset})
	if err != nil {
		return Page{}, err
	}
	for i, raw := range page.Items {
		var full map[string]json.RawMessage
		if err := json.Unmarshal(raw, &full); err != nil {
			return Page{}, err
		}
		pub := make(map[string]json.RawMessage, len(publicFields))
		for _, k := range publicFields {
			if v, ok := full[k]; ok {
				pub[k] = v
			}
		}
		if page.Items[i], err = json.Marshal(pub); err != nil {
			return Page{}, err
		}
	}
	return page, nil
}
