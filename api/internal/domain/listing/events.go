package listing

// Created: a new listing entered review.
type Created struct{ ListingID, Code string }

// Approved: the team published the listing on the website.
type Approved struct{ ListingID string }

// Closed: the listing left the market, sold or delisted. Exclusive rights end and portals drop it.
type Closed struct{ ListingID, Reason, At string }

func (e Created) EventName() string    { return "listing.created" }
func (e Created) AggregateID() string  { return e.ListingID }
func (e Approved) EventName() string   { return "listing.approved" }
func (e Approved) AggregateID() string { return e.ListingID }
func (e Closed) EventName() string     { return "listing.closed" }
func (e Closed) AggregateID() string   { return e.ListingID }
