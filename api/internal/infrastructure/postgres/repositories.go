package postgres

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/syabanf/artha-samoedra/api/internal/domain/exclusive"
	"github.com/syabanf/artha-samoedra/api/internal/domain/inquiry"
	"github.com/syabanf/artha-samoedra/api/internal/domain/listing"
	"github.com/syabanf/artha-samoedra/api/internal/domain/portal"
	"github.com/syabanf/artha-samoedra/api/internal/domain/sharing"
)

// The *Doc types are the camelCase document shapes in packages/types/src. They map aggregates
// to JSON here so the domain carries no JSON tags.

// ---- listings ----

type listingDoc struct {
	ID           string   `json:"id"`
	Code         string   `json:"code"`
	Slug         string   `json:"slug"`
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
	Photo        *string  `json:"photo"`
	Photos       []string `json:"photos,omitempty"`
	Status       string   `json:"status"`
	Source       string   `json:"source"`
	CreatedAt    string   `json:"createdAt"`
	UpdatedAt    string   `json:"updatedAt"`
	SoldPrice    *int64   `json:"soldPrice"`
	SoldAt       *string  `json:"soldAt"`
	DelistReason *string  `json:"delistReason"`
}

func toListingDoc(l *listing.Listing) listingDoc {
	highlights := l.Highlights
	if highlights == nil {
		highlights = []string{}
	}
	return listingDoc{
		ID: l.ID, Code: l.Code, Slug: l.Slug, Title: l.Title, Type: l.Type, Deal: l.Deal, PartnerID: l.PartnerID,
		City: l.City, District: l.District, Address: l.Address, Price: l.Price, LandArea: l.LandArea,
		BuildingArea: l.BuildingArea, Bedrooms: l.Bedrooms, Certificate: l.Certificate, Description: l.Description,
		Highlights: highlights, Photo: l.Photo, Photos: l.Photos, Status: string(l.Status), Source: l.Source,
		CreatedAt: l.CreatedAt, UpdatedAt: l.UpdatedAt, SoldPrice: l.SoldPrice, SoldAt: l.SoldAt, DelistReason: l.DelistReason,
	}
}

func (d listingDoc) toDomain(version int) *listing.Listing {
	return &listing.Listing{
		ID: d.ID, Code: d.Code, Slug: d.Slug, Title: d.Title, Type: d.Type, Deal: d.Deal, PartnerID: d.PartnerID,
		City: d.City, District: d.District, Address: d.Address, Price: d.Price, LandArea: d.LandArea,
		BuildingArea: d.BuildingArea, Bedrooms: d.Bedrooms, Certificate: d.Certificate, Description: d.Description,
		Highlights: d.Highlights, Photo: d.Photo, Photos: d.Photos, Status: listing.Status(d.Status), Source: d.Source,
		CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt, SoldPrice: d.SoldPrice, SoldAt: d.SoldAt, DelistReason: d.DelistReason,
		Version: version,
	}
}

// Listings implements listing.Repository.
type Listings struct{ db }

func NewListings(p *pgxpool.Pool) Listings { return Listings{db{p}} }

func (r Listings) Get(ctx context.Context, id string) (*listing.Listing, error) {
	var d listingDoc
	v, err := r.getDoc(ctx, "listings", id, &d)
	if err != nil {
		return nil, err
	}
	return d.toDomain(v), nil
}

func (r Listings) Add(ctx context.Context, l *listing.Listing) error {
	if err := r.insertDoc(ctx, "listings", l.ID, toListingDoc(l)); err != nil {
		return err
	}
	l.Version = 1
	return nil
}

func (r Listings) Save(ctx context.Context, l *listing.Listing) error {
	v, err := r.patchDoc(ctx, "listings", l.ID, l.Version, toListingDoc(l))
	l.Version = v
	return err
}

func (r Listings) NextCode(ctx context.Context) (string, error) {
	return r.nextCode(ctx, "listings", "AS-", 4)
}

// ---- inquiries ----

type inquiryDoc struct {
	ID        string  `json:"id"`
	Code      string  `json:"code"`
	ListingID *string `json:"listingId"`
	Name      string  `json:"name"`
	Phone     string  `json:"phone"`
	Channel   string  `json:"channel"`
	Message   string  `json:"message"`
	Budget    *int64  `json:"budget"`
	Status    string  `json:"status"`
	OwnerID   *string `json:"ownerId"`
	CreatedAt string  `json:"createdAt"`
	UpdatedAt string  `json:"updatedAt"`
}

func toInquiryDoc(i *inquiry.Inquiry) inquiryDoc {
	return inquiryDoc{
		ID: i.ID, Code: i.Code, ListingID: i.ListingID, Name: i.Name, Phone: i.Phone, Channel: string(i.Channel),
		Message: i.Message, Budget: i.Budget, Status: string(i.Status), OwnerID: i.OwnerID, CreatedAt: i.CreatedAt, UpdatedAt: i.UpdatedAt,
	}
}

// Inquiries implements inquiry.Repository.
type Inquiries struct{ db }

func NewInquiries(p *pgxpool.Pool) Inquiries { return Inquiries{db{p}} }

func (r Inquiries) Get(ctx context.Context, id string) (*inquiry.Inquiry, error) {
	var d inquiryDoc
	v, err := r.getDoc(ctx, "inquiries", id, &d)
	if err != nil {
		return nil, err
	}
	return &inquiry.Inquiry{
		ID: d.ID, Code: d.Code, ListingID: d.ListingID, Name: d.Name, Phone: d.Phone, Channel: inquiry.Channel(d.Channel),
		Message: d.Message, Budget: d.Budget, Status: inquiry.Status(d.Status), OwnerID: d.OwnerID,
		CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt, Version: v,
	}, nil
}

func (r Inquiries) Add(ctx context.Context, i *inquiry.Inquiry) error {
	if err := r.insertDoc(ctx, "inquiries", i.ID, toInquiryDoc(i)); err != nil {
		return err
	}
	i.Version = 1
	return nil
}

func (r Inquiries) Save(ctx context.Context, i *inquiry.Inquiry) error {
	v, err := r.patchDoc(ctx, "inquiries", i.ID, i.Version, toInquiryDoc(i))
	i.Version = v
	return err
}

func (r Inquiries) NextCode(ctx context.Context, prefix string) (string, error) {
	return r.nextCode(ctx, "inquiries", prefix, 4)
}

// ---- profit shares ----

type partyDoc struct {
	ID    string  `json:"id"`
	Kind  string  `json:"kind"`
	RefID *string `json:"refId"`
	Name  string  `json:"name"`
	Mode  string  `json:"mode"`
	Value float64 `json:"value"`
}

type shareDoc struct {
	ID              string     `json:"id"`
	ListingID       string     `json:"listingId"`
	CommissionMode  string     `json:"commissionMode"`
	CommissionPct   float64    `json:"commissionPct"`
	CommissionFixed int64      `json:"commissionFixed"`
	Parties         []partyDoc `json:"parties"`
	Note            string     `json:"note"`
}

// Shares implements sharing.Repository.
type Shares struct{ db }

func NewShares(p *pgxpool.Pool) Shares { return Shares{db{p}} }

func (r Shares) ExistsForListing(ctx context.Context, listingID string) (bool, error) {
	var ok bool
	err := r.q(ctx).QueryRow(ctx,
		`SELECT EXISTS (SELECT 1 FROM records WHERE collection = 'profitShares' AND data ->> 'listingId' = $1)`, listingID).Scan(&ok)
	return ok, err
}

func (r Shares) Add(ctx context.Context, s sharing.ProfitShare) error {
	doc := shareDoc{ID: s.ID, ListingID: s.ListingID, CommissionMode: s.CommissionMode, CommissionPct: s.CommissionPct,
		CommissionFixed: s.CommissionFixed, Note: s.Note, Parties: make([]partyDoc, len(s.Parties))}
	for i, p := range s.Parties {
		doc.Parties[i] = partyDoc{ID: p.ID, Kind: p.Kind, RefID: p.RefID, Name: p.Name, Mode: p.Mode, Value: p.Value}
	}
	return r.insertDoc(ctx, "profitShares", s.ID, doc)
}

// ---- exclusive rights ----

type exclusiveDoc struct {
	ID        string  `json:"id"`
	ListingID string  `json:"listingId"`
	EndedAt   *string `json:"endedAt"`
	Status    string  `json:"status"`
}

// Exclusives implements exclusive.Repository over the fields the listing lifecycle touches.
type Exclusives struct{ db }

func NewExclusives(p *pgxpool.Pool) Exclusives { return Exclusives{db{p}} }

func (r Exclusives) ForListing(ctx context.Context, listingID string) ([]*exclusive.Right, error) {
	docs, versions, err := findDocs[exclusiveDoc](ctx, r.db, "exclusives", "listingId", listingID)
	out := make([]*exclusive.Right, len(docs))
	for i, d := range docs {
		out[i] = &exclusive.Right{ID: d.ID, ListingID: d.ListingID, EndedAt: d.EndedAt, Status: d.Status, Version: versions[i]}
	}
	return out, err
}

func (r Exclusives) Save(ctx context.Context, e *exclusive.Right) error {
	v, err := r.patchDoc(ctx, "exclusives", e.ID, e.Version, map[string]any{"endedAt": e.EndedAt, "status": e.Status})
	e.Version = v
	return err
}

// ---- portal syncs ----

type syncDoc struct {
	ID        string `json:"id"`
	ListingID string `json:"listingId"`
	Status    string `json:"status"`
}

// Portals implements portal.Repository.
type Portals struct{ db }

func NewPortals(p *pgxpool.Pool) Portals { return Portals{db{p}} }

func (r Portals) ForListing(ctx context.Context, listingID string) ([]*portal.Sync, error) {
	docs, versions, err := findDocs[syncDoc](ctx, r.db, "portalSyncs", "listingId", listingID)
	out := make([]*portal.Sync, len(docs))
	for i, d := range docs {
		out[i] = &portal.Sync{ID: d.ID, ListingID: d.ListingID, Status: d.Status, Version: versions[i]}
	}
	return out, err
}

func (r Portals) Save(ctx context.Context, s *portal.Sync) error {
	v, err := r.patchDoc(ctx, "portalSyncs", s.ID, s.Version, map[string]any{"status": s.Status})
	s.Version = v
	return err
}
