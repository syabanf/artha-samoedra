// Package listings runs the listing commands and the reactions to listing events in other
// contexts: profit sharing on approval, exclusive rights and portals on close.
package listings

import (
	"context"
	"fmt"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/exclusive"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/listing"
	"github.com/syabanf/artha-samoedra/api/internal/domain/portal"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
	"github.com/syabanf/artha-samoedra/api/internal/domain/sharing"
)

// Directory answers whether a referenced record exists, e.g. the partner of a new listing.
type Directory interface {
	Exists(ctx context.Context, collection, id string) (bool, error)
}

type Create struct {
	Title        string   `json:"title"`
	Type         string   `json:"type"`
	Deal         string   `json:"deal"`
	PartnerID    string   `json:"partnerId"`
	City         string   `json:"city"`
	District     string   `json:"district"`
	Address      string   `json:"address"`
	Price        int64    `json:"price"`
	LandArea     float64  `json:"landArea"`
	BuildingArea *float64 `json:"buildingArea"`
	Bedrooms     *float64 `json:"bedrooms"`
	Certificate  string   `json:"certificate"`
	Description  string   `json:"description"`
	Highlights   []string `json:"highlights"`
}

// Update changes only the fields present in the body.
type Update struct {
	ID           string    `json:"id"`
	Title        *string   `json:"title"`
	Type         *string   `json:"type"`
	Deal         *string   `json:"deal"`
	PartnerID    *string   `json:"partnerId"`
	City         *string   `json:"city"`
	District     *string   `json:"district"`
	Address      *string   `json:"address"`
	Price        *int64    `json:"price"`
	LandArea     *float64  `json:"landArea"`
	BuildingArea *float64  `json:"buildingArea"`
	Bedrooms     *float64  `json:"bedrooms"`
	Certificate  *string   `json:"certificate"`
	Description  *string   `json:"description"`
	Highlights   *[]string `json:"highlights"`
}

type Approve struct {
	ID string `json:"id"`
}

type MarkSold struct {
	ID        string `json:"id"`
	SoldPrice int64  `json:"soldPrice"`
}

type Delist struct {
	ID     string `json:"id"`
	Reason string `json:"reason"`
}

func (Create) MessageName() string          { return "listings.create" }
func (Create) Permission() iam.Permission   { return "listing.edit" }
func (Update) MessageName() string          { return "listings.update" }
func (Update) Permission() iam.Permission   { return "listing.edit" }
func (Approve) MessageName() string         { return "listings.approve" }
func (Approve) Permission() iam.Permission  { return "listing.approve" }
func (MarkSold) MessageName() string        { return "listings.markSold" }
func (MarkSold) Permission() iam.Permission { return "listing.sell" }
func (Delist) MessageName() string          { return "listings.delist" }
func (Delist) Permission() iam.Permission   { return "listing.sell" }

// Handlers holds the ports the listing commands and subscribers use.
type Handlers struct {
	Listings   listing.Repository
	Shares     sharing.Repository
	Exclusives exclusive.Repository
	Portals    portal.Repository
	Directory  Directory
	Clock      shared.Clock
}

// Register adds the listing commands to the bus and the cross-context reactions to subs.
func Register(bus *cqrs.Bus, subs *cqrs.Subscribers, h Handlers) {
	cqrs.Register(bus, "Create a listing in review. Returns its id and AS-NNNN code.", h.create)
	cqrs.Register(bus, "Edit a listing's details; send only the fields that change.", h.update)
	cqrs.Register(bus, "Approve a listing in review so it goes live on the website.", h.approve)
	cqrs.Register(bus, "Mark a live or reserved listing as sold at a price.", h.markSold)
	cqrs.Register(bus, "Take a listing off the market with a reason.", h.delist)
	subs.On(listing.Approved{}.EventName(), h.onApproved)
	subs.On(listing.Closed{}.EventName(), h.onClosed)
}

// Result is what a listing command returns.
type Result struct {
	ID     string `json:"id"`
	Code   string `json:"code"`
	Status string `json:"status"`
}

func result(l *listing.Listing) Result {
	return Result{ID: l.ID, Code: l.Code, Status: string(l.Status)}
}

func (h Handlers) now() string { return shared.ISO(h.Clock.Now()) }

func (h Handlers) requirePartner(ctx context.Context, id string) error {
	if id == "" {
		return nil // the domain refuses an empty partner with its own sentence
	}
	ok, err := h.Directory.Exists(ctx, "partners", id)
	if err != nil {
		return err
	}
	if !ok {
		return shared.NotFound(fmt.Sprintf("partner %s", id))
	}
	return nil
}

func (h Handlers) create(ctx context.Context, c Create) (any, error) {
	if err := h.requirePartner(ctx, c.PartnerID); err != nil {
		return nil, err
	}
	code, err := h.Listings.NextCode(ctx)
	if err != nil {
		return nil, err
	}
	l, err := listing.New(shared.NewID("lst"), code, listing.Details{
		Title: c.Title, Type: c.Type, Deal: c.Deal, PartnerID: c.PartnerID, City: c.City, District: c.District,
		Address: c.Address, Price: c.Price, LandArea: c.LandArea, BuildingArea: c.BuildingArea, Bedrooms: c.Bedrooms,
		Certificate: c.Certificate, Description: c.Description, Highlights: c.Highlights,
	}, h.now())
	if err != nil {
		return nil, err
	}
	events := l.PullEvents()
	if err := h.Listings.Add(ctx, l); err != nil {
		return nil, err
	}
	cqrs.Record(ctx, events...)
	return result(l), nil
}

// change loads a listing, applies fn and saves it with its events.
func (h Handlers) change(ctx context.Context, id string, fn func(l *listing.Listing) error) (any, error) {
	l, err := h.Listings.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := fn(l); err != nil {
		return nil, err
	}
	events := l.PullEvents()
	if err := h.Listings.Save(ctx, l); err != nil {
		return nil, err
	}
	cqrs.Record(ctx, events...)
	return result(l), nil
}

func (h Handlers) update(ctx context.Context, c Update) (any, error) {
	if c.PartnerID != nil {
		if err := h.requirePartner(ctx, *c.PartnerID); err != nil {
			return nil, err
		}
	}
	return h.change(ctx, c.ID, func(l *listing.Listing) error {
		d := listing.Details{
			Title: l.Title, Type: l.Type, Deal: l.Deal, PartnerID: l.PartnerID, City: l.City, District: l.District,
			Address: l.Address, Price: l.Price, LandArea: l.LandArea, BuildingArea: l.BuildingArea, Bedrooms: l.Bedrooms,
			Certificate: l.Certificate, Description: l.Description, Highlights: l.Highlights,
		}
		set(&d.Title, c.Title)
		set(&d.Type, c.Type)
		set(&d.Deal, c.Deal)
		set(&d.PartnerID, c.PartnerID)
		set(&d.City, c.City)
		set(&d.District, c.District)
		set(&d.Address, c.Address)
		set(&d.Price, c.Price)
		set(&d.LandArea, c.LandArea)
		set(&d.Certificate, c.Certificate)
		set(&d.Description, c.Description)
		set(&d.Highlights, c.Highlights)
		if c.BuildingArea != nil {
			d.BuildingArea = c.BuildingArea
		}
		if c.Bedrooms != nil {
			d.Bedrooms = c.Bedrooms
		}
		return l.Edit(d, h.now())
	})
}

func set[T any](dst *T, v *T) {
	if v != nil {
		*dst = *v
	}
}

func (h Handlers) approve(ctx context.Context, c Approve) (any, error) {
	return h.change(ctx, c.ID, func(l *listing.Listing) error { return l.Approve(h.now()) })
}

func (h Handlers) markSold(ctx context.Context, c MarkSold) (any, error) {
	return h.change(ctx, c.ID, func(l *listing.Listing) error { return l.MarkSold(c.SoldPrice, h.now()) })
}

func (h Handlers) delist(ctx context.Context, c Delist) (any, error) {
	return h.change(ctx, c.ID, func(l *listing.Listing) error { return l.Delist(c.Reason, h.now()) })
}

// onApproved gives an approved listing the default profit-share scheme when it has none.
func (h Handlers) onApproved(ctx context.Context, e shared.Event) error {
	id := e.AggregateID()
	has, err := h.Shares.ExistsForListing(ctx, id)
	if err != nil || has {
		return err
	}
	return h.Shares.Add(ctx, sharing.Default(shared.NewID("psh"), id))
}

// onClosed ends the running exclusive rights and takes the listing off the portals.
func (h Handlers) onClosed(ctx context.Context, e shared.Event) error {
	closed := e.(listing.Closed)
	rights, err := h.Exclusives.ForListing(ctx, closed.ListingID)
	if err != nil {
		return err
	}
	for _, r := range rights {
		if !r.Running() {
			continue
		}
		r.End(closed.At)
		if err := h.Exclusives.Save(ctx, r); err != nil {
			return err
		}
	}
	syncs, err := h.Portals.ForListing(ctx, closed.ListingID)
	if err != nil {
		return err
	}
	for _, s := range syncs {
		if !s.Remove() {
			continue
		}
		if err := h.Portals.Save(ctx, s); err != nil {
			return err
		}
	}
	return nil
}
