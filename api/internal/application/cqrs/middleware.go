package cqrs

import (
	"context"
	"fmt"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// TxManager runs fn inside one database transaction, committing when fn returns nil.
// The implementation carries the transaction in the context it hands to fn.
type TxManager interface {
	WithinTx(ctx context.Context, fn func(ctx context.Context) error) error
}

// Transactional runs each command in its own transaction.
func Transactional(tx TxManager) Middleware {
	return func(next Handler) Handler {
		return func(ctx context.Context, m Message) (any, error) {
			var out any
			err := tx.WithinTx(ctx, func(ctx context.Context) error {
				var err error
				out, err = next(ctx, m)
				return err
			})
			return out, err
		}
	}
}

// AuditEntry is one row of the audit log. Outcome is "ok" or a shared.Kind such as "rule".
type AuditEntry struct {
	At      time.Time
	ActorID string
	Command string
	Payload Message
	Outcome string
	Detail  string
}

// AuditLog stores audit entries. A refused entry must outlive the rolled-back transaction.
type AuditLog interface {
	Record(ctx context.Context, e AuditEntry) error
}

// Audit writes one audit entry per command, whether it succeeded or was refused.
func Audit(log AuditLog, clock shared.Clock) Middleware {
	return func(next Handler) Handler {
		return func(ctx context.Context, m Message) (any, error) {
			out, err := next(ctx, m)
			e := AuditEntry{At: clock.Now(), ActorID: iam.ActorFrom(ctx).UserID, Command: m.MessageName(), Payload: m, Outcome: "ok"}
			if err != nil {
				e.Outcome, e.Detail = shared.Kind(err), err.Error()
			}
			if aerr := log.Record(ctx, e); aerr != nil && err == nil {
				return nil, fmt.Errorf("audit %s: %w", e.Command, aerr)
			}
			return out, err
		}
	}
}

// Subscriber reacts to a domain event inside the command's transaction.
type Subscriber func(ctx context.Context, e shared.Event) error

// Subscribers maps event names to the subscribers that react to them, in registration order.
type Subscribers struct{ byName map[string][]Subscriber }

func NewSubscribers() *Subscribers { return &Subscribers{byName: map[string][]Subscriber{}} }

func (s *Subscribers) On(eventName string, fn Subscriber) {
	s.byName[eventName] = append(s.byName[eventName], fn)
}

// Outbox stores published events so processes outside this one can pick them up later.
type Outbox interface {
	Append(ctx context.Context, actorID string, events []shared.Event) error
}

type recorderKey struct{}

type recorder struct{ events []shared.Event }

// Record collects events a handler or subscriber raised. The Events middleware publishes them.
// Outside a command (no recorder in the context) it panics, since the events would be lost.
func Record(ctx context.Context, events ...shared.Event) {
	r, ok := ctx.Value(recorderKey{}).(*recorder)
	if !ok {
		panic("cqrs: Record called outside the Events middleware")
	}
	r.events = append(r.events, events...)
}

// maxEvents stops a subscriber loop where two events keep raising each other.
const maxEvents = 100

// Events gives the handler a recorder, then runs subscribers for each recorded event (including
// events the subscribers raise) and appends them all to the outbox, in the same transaction.
func Events(subs *Subscribers, out Outbox) Middleware {
	return func(next Handler) Handler {
		return func(ctx context.Context, m Message) (any, error) {
			rec := &recorder{}
			ctx = context.WithValue(ctx, recorderKey{}, rec)
			result, err := next(ctx, m)
			if err != nil {
				return nil, err
			}
			for i := 0; i < len(rec.events); i++ {
				if i == maxEvents {
					return nil, fmt.Errorf("%s raised more than %d events", m.MessageName(), maxEvents)
				}
				e := rec.events[i]
				for _, sub := range subs.byName[e.EventName()] {
					if err := sub(ctx, e); err != nil {
						return nil, fmt.Errorf("on %s: %w", e.EventName(), err)
					}
				}
			}
			if len(rec.events) > 0 {
				if err := out.Append(ctx, iam.ActorFrom(ctx).UserID, rec.events); err != nil {
					return nil, fmt.Errorf("outbox: %w", err)
				}
			}
			return result, nil
		}
	}
}
