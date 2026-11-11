// Package assistanttest registers stand-ins for the records, settings and listings queries and
// two listing commands on fresh buses, so assistant tests run without Postgres.
package assistanttest

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Permission keys the stand-ins check.
const (
	PermRead    iam.Permission = "records.read"
	PermHR      iam.Permission = "hr.read"
	PermApprove iam.Permission = "listing.approve"
	PermDelist  iam.Permission = "listing.delist"
)

// hrCollections need PermHR on top of PermRead.
var hrCollections = map[string]bool{"employees": true, "attendance": true, "hrRequests": true}

type ListQuery struct {
	Collection string            `json:"collection"`
	Q          string            `json:"q"`
	Where      map[string]string `json:"where"`
	Sort       string            `json:"sort"`
	Limit      int               `json:"limit"`
	Offset     int               `json:"offset"`
}

func (ListQuery) MessageName() string        { return "records.list" }
func (ListQuery) Permission() iam.Permission { return PermRead }

type GetQuery struct {
	Collection string `json:"collection"`
	ID         string `json:"id"`
}

func (GetQuery) MessageName() string        { return "records.get" }
func (GetQuery) Permission() iam.Permission { return PermRead }

type SettingsQuery struct {
	Name string `json:"name"`
}

func (SettingsQuery) MessageName() string        { return "settings.get" }
func (SettingsQuery) Permission() iam.Permission { return PermRead }

type StatsQuery struct{}

func (StatsQuery) MessageName() string        { return "listings.stats" }
func (StatsQuery) Permission() iam.Permission { return PermRead }

type ApproveCommand struct {
	ID string `json:"id"`
}

func (ApproveCommand) MessageName() string        { return "listings.approve" }
func (ApproveCommand) Permission() iam.Permission { return PermApprove }

type DelistCommand struct {
	ID string `json:"id"`
}

func (DelistCommand) MessageName() string        { return "listings.delist" }
func (DelistCommand) Permission() iam.Permission { return PermDelist }

// Dispatched is one command the command bus ran, with the actor it ran as.
type Dispatched struct {
	Name    string
	ID      string
	ActorID string
}

// Kit holds the buses, the records behind them and what ran.
type Kit struct {
	Queries  *cqrs.Bus
	Commands *cqrs.Bus
	Records  map[string][]map[string]any
	Settings map[string]map[string]any

	mu         sync.Mutex
	Lists      []ListQuery
	Dispatched []Dispatched
}

// New registers the stand-ins on two buses that both run cqrs.Authorize.
func New() *Kit {
	k := &Kit{
		Queries: cqrs.NewBus(cqrs.Authorize), Commands: cqrs.NewBus(cqrs.Authorize),
		Records: map[string][]map[string]any{}, Settings: map[string]map[string]any{},
	}
	cqrs.Register(k.Queries, "List records", k.list)
	cqrs.Register(k.Queries, "Get a record", k.get)
	cqrs.Register(k.Queries, "Get settings", func(_ context.Context, q SettingsQuery) (any, error) {
		s, ok := k.Settings[q.Name]
		if !ok {
			return nil, shared.NotFound("settings " + q.Name)
		}
		return s, nil
	})
	cqrs.Register(k.Queries, "Listing counts", func(context.Context, StatsQuery) (any, error) {
		return map[string]int{"live": 3, "pending": 1}, nil
	})
	cqrs.Register(k.Commands, "Approve a listing", func(ctx context.Context, c ApproveCommand) (any, error) {
		return k.record(ctx, "listings.approve", c.ID)
	})
	cqrs.Register(k.Commands, "Delist a listing", func(ctx context.Context, c DelistCommand) (any, error) {
		return k.record(ctx, "listings.delist", c.ID)
	})
	return k
}

func (k *Kit) record(ctx context.Context, name, id string) (any, error) {
	if id == "" {
		return nil, shared.Rule("Pick a listing.")
	}
	k.mu.Lock()
	defer k.mu.Unlock()
	k.Dispatched = append(k.Dispatched, Dispatched{Name: name, ID: id, ActorID: iam.ActorFrom(ctx).UserID})
	return map[string]string{"id": id, "status": "done"}, nil
}

func (k *Kit) list(ctx context.Context, q ListQuery) (any, error) {
	if hrCollections[q.Collection] && !iam.ActorFrom(ctx).Can(PermHR) {
		return nil, shared.ErrForbidden
	}
	k.mu.Lock()
	k.Lists = append(k.Lists, q)
	k.mu.Unlock()
	var hits []map[string]any
	for _, r := range k.Records[q.Collection] {
		if matches(r, q) {
			hits = append(hits, r)
		}
	}
	total := len(hits)
	lo := min(q.Offset, total)
	hi := total
	if q.Limit > 0 {
		hi = min(lo+q.Limit, total)
	}
	return map[string]any{"items": hits[lo:hi], "total": total}, nil
}

func matches(r map[string]any, q ListQuery) bool {
	for k, v := range q.Where {
		if fmt.Sprint(r[k]) != v {
			return false
		}
	}
	return q.Q == "" || strings.Contains(strings.ToLower(fmt.Sprint(r)), strings.ToLower(q.Q))
}

func (k *Kit) get(ctx context.Context, q GetQuery) (any, error) {
	if hrCollections[q.Collection] && !iam.ActorFrom(ctx).Can(PermHR) {
		return nil, shared.ErrForbidden
	}
	for _, r := range k.Records[q.Collection] {
		if r["id"] == q.ID {
			return r, nil
		}
	}
	return nil, shared.NotFound(q.Collection + " " + q.ID)
}

// Actor returns a signed-in actor with the given permissions.
func Actor(id string, perms ...iam.Permission) iam.Actor {
	ps := make([]string, len(perms))
	for i, p := range perms {
		ps[i] = string(p)
	}
	return iam.NewActor(id, "Member "+id, "role-test", ps)
}

// Clock is a settable clock.
type Clock struct {
	mu sync.Mutex
	T  time.Time
}

func (c *Clock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.T
}

func (c *Clock) Advance(d time.Duration) {
	c.mu.Lock()
	c.T = c.T.Add(d)
	c.mu.Unlock()
}
