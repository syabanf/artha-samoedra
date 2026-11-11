package inquiry

// Submitted: a website visitor left their details.
type Submitted struct {
	InquiryID string
	ListingID *string
}

// Assigned: a team member took the inquiry.
type Assigned struct{ InquiryID, OwnerID string }

// StatusChanged: the inquiry moved along the funnel.
type StatusChanged struct {
	InquiryID string
	From, To  Status
}

func (e Submitted) EventName() string       { return "inquiry.submitted" }
func (e Submitted) AggregateID() string     { return e.InquiryID }
func (e Assigned) EventName() string        { return "inquiry.assigned" }
func (e Assigned) AggregateID() string      { return e.InquiryID }
func (e StatusChanged) EventName() string   { return "inquiry.status_changed" }
func (e StatusChanged) AggregateID() string { return e.InquiryID }
