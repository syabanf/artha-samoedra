// Package sharing is the profit-share scheme of a listing: the commission and how it splits
// between the company, the agent and the partner. It ports defaultShare from
// packages/fixtures/src/sharing.ts.
package sharing

import "context"

// Party is one side of the split. Mode is "percent" or "fixed".
type Party struct {
	ID, Kind string
	RefID    *string
	Name     string
	Mode     string
	Value    float64
}

type ProfitShare struct {
	ID, ListingID   string
	CommissionMode  string
	CommissionPct   float64
	CommissionFixed int64
	Parties         []Party
	Note            string
}

// Default is the scheme an approved listing starts with: 2.5% commission, company 70, agent 30.
func Default(id, listingID string) ProfitShare {
	return ProfitShare{
		ID: id, ListingID: listingID, CommissionMode: "percent", CommissionPct: 2.5,
		Parties: []Party{
			{ID: id + "-company", Kind: "company", Mode: "percent", Value: 70},
			{ID: id + "-agent", Kind: "agent", Mode: "percent", Value: 30},
		},
	}
}

type Repository interface {
	ExistsForListing(ctx context.Context, listingID string) (bool, error)
	Add(ctx context.Context, s ProfitShare) error
}
