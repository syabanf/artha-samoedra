// Package exclusive is the seller's grant of the sole right to market a property.
// Only the part the listing lifecycle touches lives here: ending a running right.
package exclusive

import "context"

type Right struct {
	ID, ListingID string
	EndedAt       *string
	Status        string
	Version       int
}

// Running reports whether the right has not ended yet, the test endRunningExclusives uses.
func (r *Right) Running() bool { return r.EndedAt == nil }

// End closes the right because the listing left the market.
func (r *Right) End(at string) {
	r.EndedAt, r.Status = &at, "ended"
}

type Repository interface {
	ForListing(ctx context.Context, listingID string) ([]*Right, error)
	Save(ctx context.Context, r *Right) error
}
