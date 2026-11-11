package shared

import "time"

// Event is something that happened in the domain. Handlers in other contexts react to it in the
// same transaction, and the outbox keeps it for anything outside the process.
type Event interface {
	EventName() string
	AggregateID() string
}

// Aggregate collects the events its methods raise until the application layer pulls them.
type Aggregate struct{ events []Event }

func (a *Aggregate) Raise(e Event) { a.events = append(a.events, e) }

// PullEvents returns the raised events and clears them, so they are published once.
func (a *Aggregate) PullEvents() []Event {
	out := a.events
	a.events = nil
	return out
}

// Clock lets tests and the seed pin "now".
type Clock interface{ Now() time.Time }

// ISO formats a time the way the frontend stores it.
func ISO(t time.Time) string { return t.UTC().Format("2006-01-02T15:04:05.000Z") }
