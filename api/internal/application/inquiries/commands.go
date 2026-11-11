// Package inquiries runs the inquiry commands: the public website lead and the team's
// assignment and status moves.
package inquiries

import (
	"context"
	"fmt"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/inquiry"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Directory answers whether a referenced record exists: the listing of a lead, the new owner.
type Directory interface {
	Exists(ctx context.Context, collection, id string) (bool, error)
}

// Submit is the website lead form. Anyone may send it.
type Submit struct {
	Name      string  `json:"name"`
	Phone     string  `json:"phone"`
	ListingID *string `json:"listingId"`
	Message   string  `json:"message"`
	Budget    *int64  `json:"budget"`
}

type Assign struct {
	ID      string `json:"id"`
	OwnerID string `json:"ownerId"`
}

type SetStatus struct {
	ID     string `json:"id"`
	Status string `json:"status"`
}

func (Submit) MessageName() string           { return "inquiries.submit" }
func (Submit) Permission() iam.Permission    { return iam.Public }
func (Assign) MessageName() string           { return "inquiries.assign" }
func (Assign) Permission() iam.Permission    { return "inquiry.manage" }
func (SetStatus) MessageName() string        { return "inquiries.setStatus" }
func (SetStatus) Permission() iam.Permission { return "inquiry.manage" }

type Handlers struct {
	Inquiries inquiry.Repository
	Directory Directory
	Clock     shared.Clock
}

func Register(bus *cqrs.Bus, h Handlers) {
	cqrs.Register(bus, "Leave a lead from the website: name, WhatsApp number, optional listing, message and budget. Public.", h.submit)
	cqrs.Register(bus, "Hand an inquiry to a team member.", h.assign)
	cqrs.Register(bus, "Move an inquiry to new, contacted, survey, negotiation, won or lost.", h.setStatus)
}

type Result struct {
	ID      string  `json:"id"`
	Code    string  `json:"code"`
	Status  string  `json:"status"`
	OwnerID *string `json:"ownerId"`
}

func result(i *inquiry.Inquiry) Result {
	return Result{ID: i.ID, Code: i.Code, Status: string(i.Status), OwnerID: i.OwnerID}
}

func (h Handlers) require(ctx context.Context, collection, id, what string) error {
	ok, err := h.Directory.Exists(ctx, collection, id)
	if err != nil {
		return err
	}
	if !ok {
		return shared.NotFound(fmt.Sprintf("%s %s", what, id))
	}
	return nil
}

func (h Handlers) submit(ctx context.Context, c Submit) (any, error) {
	if c.ListingID != nil && *c.ListingID == "" {
		c.ListingID = nil
	}
	if c.ListingID != nil {
		if err := h.require(ctx, "listings", *c.ListingID, "listing"); err != nil {
			return nil, err
		}
	}
	now := h.Clock.Now()
	code, err := h.Inquiries.NextCode(ctx, fmt.Sprintf("INQ-%02d-", now.Year()%100))
	if err != nil {
		return nil, err
	}
	i, err := inquiry.Submit(shared.NewID("inq"), code, inquiry.Lead{
		Name: c.Name, Phone: c.Phone, Message: c.Message, ListingID: c.ListingID, Budget: c.Budget,
	}, shared.ISO(now))
	if err != nil {
		return nil, err
	}
	events := i.PullEvents()
	if err := h.Inquiries.Add(ctx, i); err != nil {
		return nil, err
	}
	cqrs.Record(ctx, events...)
	return result(i), nil
}

func (h Handlers) change(ctx context.Context, id string, fn func(i *inquiry.Inquiry, now string) error) (any, error) {
	i, err := h.Inquiries.Get(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := fn(i, shared.ISO(h.Clock.Now())); err != nil {
		return nil, err
	}
	events := i.PullEvents()
	if err := h.Inquiries.Save(ctx, i); err != nil {
		return nil, err
	}
	cqrs.Record(ctx, events...)
	return result(i), nil
}

func (h Handlers) assign(ctx context.Context, c Assign) (any, error) {
	if c.OwnerID != "" {
		if err := h.require(ctx, "users", c.OwnerID, "user"); err != nil {
			return nil, err
		}
	}
	return h.change(ctx, c.ID, func(i *inquiry.Inquiry, now string) error { return i.Assign(c.OwnerID, now) })
}

func (h Handlers) setStatus(ctx context.Context, c SetStatus) (any, error) {
	return h.change(ctx, c.ID, func(i *inquiry.Inquiry, now string) error { return i.SetStatus(inquiry.Status(c.Status), now) })
}
