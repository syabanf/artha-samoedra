// Package listing is the property listing aggregate: review, publish, sell or delist.
// The rules and their wording match packages/fixtures/src/store.ts.
package listing

import (
	"context"
	"regexp"
	"strings"

	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

type Status string

const (
	Review   Status = "review"
	Active   Status = "active"
	Reserved Status = "reserved"
	Sold     Status = "sold"
	Delisted Status = "delisted"
)

var statusLabel = map[Status]string{Review: "In review", Active: "Live", Reserved: "Reserved", Sold: "Sold", Delisted: "Delisted"}

func (s Status) Label() string { return statusLabel[s] }

type Listing struct {
	shared.Aggregate
	ID, Code, Slug, Title    string
	Type, Deal, PartnerID    string
	City, District, Address  string
	Price                    int64
	LandArea                 float64
	BuildingArea, Bedrooms   *float64
	Certificate, Description string
	Highlights               []string
	Photo                    *string
	Photos                   []string
	Status                   Status
	Source                   string
	CreatedAt, UpdatedAt     string
	SoldPrice                *int64
	SoldAt, DelistReason     *string
	// Version guards against two writers saving over each other.
	Version int
}

// Details are the fields a team member fills in for a new listing or edits later.
type Details struct {
	Title, Type, Deal, PartnerID, City, District, Address string
	Price                                                 int64
	LandArea                                              float64
	BuildingArea, Bedrooms                                *float64
	Certificate, Description                              string
	Highlights                                            []string
}

func (d Details) validate() error {
	switch {
	case strings.TrimSpace(d.Title) == "":
		return shared.Rule("Give the listing a title.")
	case d.PartnerID == "":
		return shared.Rule("Pick the partner who owns the property.")
	case strings.TrimSpace(d.City) == "":
		return shared.Rule("Enter the city.")
	case d.Price <= 0:
		return shared.Rule("Enter a price above zero.")
	case d.LandArea <= 0:
		return shared.Rule("Enter the land area.")
	}
	return nil
}

// New starts a listing in review, as every listing waits for the team before going live.
func New(id, code string, d Details, now string) (*Listing, error) {
	if err := d.validate(); err != nil {
		return nil, err
	}
	l := &Listing{ID: id, Code: code, Status: Review, Source: "internal", CreatedAt: now, UpdatedAt: now}
	l.apply(d)
	l.Raise(Created{ListingID: id, Code: code})
	return l, nil
}

// Edit replaces the details. The slug follows the title so links stay readable.
func (l *Listing) Edit(d Details, now string) error {
	if err := d.validate(); err != nil {
		return err
	}
	l.apply(d)
	l.UpdatedAt = now
	return nil
}

func (l *Listing) apply(d Details) {
	l.Title, l.Type, l.Deal, l.PartnerID = strings.TrimSpace(d.Title), d.Type, d.Deal, d.PartnerID
	l.City, l.District, l.Address = d.City, d.District, d.Address
	l.Price, l.LandArea, l.BuildingArea, l.Bedrooms = d.Price, d.LandArea, d.BuildingArea, d.Bedrooms
	l.Certificate, l.Description, l.Highlights = d.Certificate, d.Description, d.Highlights
	l.Slug = slugify(l.Title) + "-" + strings.ToLower(l.Code)
}

func (l *Listing) Approve(now string) error {
	if l.Status != Review {
		return shared.Rule("This listing has already been reviewed.")
	}
	l.Status, l.UpdatedAt = Active, now
	l.Raise(Approved{ListingID: l.ID})
	return nil
}

func (l *Listing) MarkSold(price int64, now string) error {
	if l.Status != Active && l.Status != Reserved {
		return shared.Rule("The listing is %s.", strings.ToLower(l.Status.Label()))
	}
	if price <= 0 {
		return shared.Rule("Enter the price it sold for.")
	}
	l.Status, l.SoldPrice, l.SoldAt, l.UpdatedAt = Sold, &price, &now, now
	l.Raise(Closed{ListingID: l.ID, Reason: "sold", At: now})
	return nil
}

func (l *Listing) Delist(reason, now string) error {
	switch l.Status {
	case Sold:
		return shared.Rule("The property is sold and cannot be delisted.")
	case Delisted:
		return shared.Rule("The listing is already delisted.")
	case Reserved:
		return shared.Rule("A buyer has reserved this property. Cancel the reservation first.")
	}
	reason = strings.TrimSpace(reason)
	if reason == "" {
		return shared.Rule("Say why the listing comes off the market.")
	}
	l.Status, l.DelistReason, l.UpdatedAt = Delisted, &reason, now
	l.Raise(Closed{ListingID: l.ID, Reason: "delisted", At: now})
	return nil
}

var nonWord = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(s string) string {
	return strings.Trim(nonWord.ReplaceAllString(strings.ToLower(s), "-"), "-")
}

// Repository is the write-side port; infrastructure implements it.
type Repository interface {
	Get(ctx context.Context, id string) (*Listing, error)
	Add(ctx context.Context, l *Listing) error
	// Save writes the listing if nobody changed it since it was read (shared.ErrConflict otherwise).
	Save(ctx context.Context, l *Listing) error
	NextCode(ctx context.Context) (string, error)
}
