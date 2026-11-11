// Package cqrs is the command and query side split. Commands change state through a bus that
// authorizes, opens a transaction, audits and publishes domain events; queries read through a
// separate bus that only authorizes. Each message names itself and the permission it needs.
package cqrs

import (
	"context"
	"encoding/json"
	"fmt"
	"reflect"
	"sort"
	"strings"

	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Message is a command or a query. Name is stable and public, e.g. "listings.approve".
type Message interface {
	MessageName() string
	Permission() iam.Permission
}

// Handler runs one message and returns its result (an id, a record, a page of records).
type Handler func(ctx context.Context, m Message) (any, error)

// Middleware wraps every handler on a bus.
type Middleware func(next Handler) Handler

type entry struct {
	describe Descriptor
	decode   func(json.RawMessage) (Message, error)
	handle   Handler
}

// Descriptor documents a registered message for GET /commands and for the AI agent's tool list.
type Descriptor struct {
	Name        string         `json:"name"`
	Permission  iam.Permission `json:"permission"`
	Description string         `json:"description"`
	// Fields are the JSON argument names the message takes, read from its struct tags.
	Fields []string `json:"fields"`
}

// fieldsOf lists the JSON field names of a message struct, skipping "-" tags.
func fieldsOf(m any) []string {
	t := reflect.TypeOf(m)
	if t == nil || t.Kind() != reflect.Struct {
		return nil
	}
	var out []string
	for i := range t.NumField() {
		f := t.Field(i)
		if !f.IsExported() {
			continue
		}
		name, _, _ := strings.Cut(f.Tag.Get("json"), ",")
		if name == "-" {
			continue
		}
		if name == "" {
			name = f.Name
		}
		out = append(out, name)
	}
	return out
}

// Bus routes messages to their handler through the middleware chain.
type Bus struct {
	entries map[string]entry
	chain   []Middleware
}

func NewBus(mw ...Middleware) *Bus { return &Bus{entries: map[string]entry{}, chain: mw} }

// Register binds a handler to the message type M. The zero value of M supplies the name.
func Register[M Message](b *Bus, description string, h func(ctx context.Context, m M) (any, error)) {
	var zero M
	name := zero.MessageName()
	if _, dup := b.entries[name]; dup {
		panic("cqrs: " + name + " registered twice")
	}
	b.entries[name] = entry{
		describe: Descriptor{Name: name, Permission: zero.Permission(), Description: description, Fields: fieldsOf(zero)},
		decode: func(raw json.RawMessage) (Message, error) {
			var m M
			if len(raw) > 0 {
				if err := json.Unmarshal(raw, &m); err != nil {
					return nil, shared.Rule("The request body does not fit %s: %v", name, err)
				}
			}
			return m, nil
		},
		handle: func(ctx context.Context, m Message) (any, error) { return h(ctx, m.(M)) },
	}
}

// Decode turns a name and a JSON body into the registered message.
func (b *Bus) Decode(name string, raw json.RawMessage) (Message, error) {
	e, ok := b.entries[name]
	if !ok {
		return nil, shared.NotFound(fmt.Sprintf("message %q", name))
	}
	return e.decode(raw)
}

// Dispatch runs the message through the middleware chain, outermost first.
func (b *Bus) Dispatch(ctx context.Context, m Message) (any, error) {
	e, ok := b.entries[m.MessageName()]
	if !ok {
		return nil, shared.NotFound(fmt.Sprintf("message %q", m.MessageName()))
	}
	h := e.handle
	for i := len(b.chain) - 1; i >= 0; i-- {
		h = b.chain[i](h)
	}
	return h(ctx, m)
}

// Catalog lists the registered messages by name.
func (b *Bus) Catalog() []Descriptor {
	out := make([]Descriptor, 0, len(b.entries))
	for _, e := range b.entries {
		out = append(out, e.describe)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out
}

// Authorize refuses messages the actor's role may not run.
func Authorize(next Handler) Handler {
	return func(ctx context.Context, m Message) (any, error) {
		p := m.Permission()
		actor := iam.ActorFrom(ctx)
		if p != iam.Public && actor.IsAnonymous() {
			return nil, shared.ErrUnauthenticated
		}
		if !actor.Can(p) {
			return nil, shared.ErrForbidden
		}
		return next(ctx, m)
	}
}

// CatalogFor lists the messages the actor may run.
func (b *Bus) CatalogFor(a iam.Actor) []Descriptor {
	all := b.Catalog()
	out := all[:0]
	for _, d := range all {
		if a.Can(d.Permission) {
			out = append(out, d)
		}
	}
	return out
}
