// Package portal tracks a listing's copy on a property portal such as Rumah123.
// Only taking the listing down lives here; publishing stays in the frontend for now.
package portal

import "context"

type Sync struct {
	ID, ListingID, Status string
	Version               int
}

const Removed = "removed"

// Remove marks the portal copy for takedown. It reports false when it was already removed.
func (s *Sync) Remove() bool {
	if s.Status == Removed {
		return false
	}
	s.Status = Removed
	return true
}

type Repository interface {
	ForListing(ctx context.Context, listingID string) ([]*Sync, error)
	Save(ctx context.Context, s *Sync) error
}
