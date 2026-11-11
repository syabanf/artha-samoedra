package cqrs

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

type ping struct{ Fail bool }

func (ping) MessageName() string        { return "test.ping" }
func (ping) Permission() iam.Permission { return iam.Public }

type pinged struct{ ID string }

func (e pinged) EventName() string   { return "test.pinged" }
func (e pinged) AggregateID() string { return e.ID }

type ponged struct{ ID string }

func (e ponged) EventName() string   { return "test.ponged" }
func (e ponged) AggregateID() string { return e.ID }

type fakeTx struct{ commits, rollbacks int }

func (f *fakeTx) WithinTx(ctx context.Context, fn func(context.Context) error) error {
	if err := fn(ctx); err != nil {
		f.rollbacks++
		return err
	}
	f.commits++
	return nil
}

type memAudit struct{ entries []AuditEntry }

func (m *memAudit) Record(_ context.Context, e AuditEntry) error {
	m.entries = append(m.entries, e)
	return nil
}

type memOutbox struct{ names []string }

func (m *memOutbox) Append(_ context.Context, _ string, ev []shared.Event) error {
	for _, e := range ev {
		m.names = append(m.names, e.EventName())
	}
	return nil
}

type clock struct{}

func (clock) Now() time.Time { return time.Unix(0, 0) }

func TestCommandPipeline(t *testing.T) {
	tx, audit, out := &fakeTx{}, &memAudit{}, &memOutbox{}
	subs := NewSubscribers()
	subs.On("test.pinged", func(ctx context.Context, e shared.Event) error {
		Record(ctx, ponged{ID: e.AggregateID()}) // a subscriber's own events are published too
		return nil
	})
	bus := NewBus(Authorize, Transactional(tx), Audit(audit, clock{}), Events(subs, out))
	Register(bus, "test", func(ctx context.Context, m ping) (any, error) {
		if m.Fail {
			return nil, shared.Rule("No.")
		}
		Record(ctx, pinged{ID: "p1"})
		return "ok", nil
	})

	if _, err := bus.Dispatch(context.Background(), ping{}); err != nil {
		t.Fatal(err)
	}
	if len(out.names) != 2 || out.names[0] != "test.pinged" || out.names[1] != "test.ponged" {
		t.Fatalf("outbox %v", out.names)
	}
	_, err := bus.Dispatch(context.Background(), ping{Fail: true})
	var rule *shared.RuleError
	if !errors.As(err, &rule) {
		t.Fatalf("want rule, got %v", err)
	}
	if tx.commits != 1 || tx.rollbacks != 1 {
		t.Fatalf("commits %d rollbacks %d", tx.commits, tx.rollbacks)
	}
	if len(audit.entries) != 2 || audit.entries[0].Outcome != "ok" || audit.entries[1].Outcome != "rule" || audit.entries[1].Detail != "No." {
		t.Fatalf("audit %+v", audit.entries)
	}
	if len(out.names) != 2 {
		t.Fatalf("a refused command must not publish: %v", out.names)
	}
}
