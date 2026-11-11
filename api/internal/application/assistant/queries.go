package assistant

import (
	"context"
	"encoding/json"
	"fmt"
)

// Query names registered on the query bus by the records and listings packages.
const (
	qRecordsList   = "records.list"
	qRecordsGet    = "records.get"
	qSettingsGet   = "settings.get"
	qListingsStats = "listings.stats"
)

type record = map[string]any

type page struct {
	Items []record `json:"items"`
	Total int      `json:"total"`
}

type listArgs struct {
	Collection string            `json:"collection"`
	Q          string            `json:"q,omitempty"`
	Where      map[string]string `json:"where,omitempty"`
	Sort       string            `json:"sort,omitempty"`
	Limit      int               `json:"limit,omitempty"`
	Offset     int               `json:"offset,omitempty"`
}

// ask runs a query on the query bus as the actor in ctx, so the bus applies the actor's
// permissions. It decodes from JSON because the query types live in other packages.
func (s *Service) ask(ctx context.Context, name string, args any) (any, error) {
	var raw json.RawMessage
	if args != nil {
		b, err := json.Marshal(args)
		if err != nil {
			return nil, err
		}
		raw = b
	}
	m, err := s.queries.Decode(name, raw)
	if err != nil {
		return nil, err
	}
	return s.queries.Dispatch(ctx, m)
}

// askInto runs a query and re-decodes its result into out.
func (s *Service) askInto(ctx context.Context, name string, args, out any) error {
	res, err := s.ask(ctx, name, args)
	if err != nil {
		return err
	}
	b, err := json.Marshal(res)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}

func (s *Service) list(ctx context.Context, a listArgs) (page, error) {
	var p page
	err := s.askInto(ctx, qRecordsList, a, &p)
	return p, err
}

func (s *Service) get(ctx context.Context, collection, id string) (record, error) {
	var r record
	err := s.askInto(ctx, qRecordsGet, map[string]string{"collection": collection, "id": id}, &r)
	return r, err
}

// maxScan caps how many records a focused tool reads from one collection.
const maxScan = 5000

// listAll pages through a collection with an equality filter.
func (s *Service) listAll(ctx context.Context, collection string, where map[string]string) ([]record, error) {
	const size = 200 // records.list caps a page at 200
	var out []record
	for len(out) < maxScan {
		p, err := s.list(ctx, listArgs{Collection: collection, Where: where, Limit: size, Offset: len(out)})
		if err != nil {
			return nil, err
		}
		out = append(out, p.Items...)
		if len(p.Items) == 0 || len(out) >= p.Total {
			return out, nil
		}
	}
	return out, fmt.Errorf("%s has more than %d records; narrow the question", collection, maxScan)
}

// Helpers that read loosely typed record fields.

func strField(r record, k string) string {
	s, _ := r[k].(string)
	return s
}

func numField(r record, k string) float64 {
	f, _ := r[k].(float64)
	return f
}

func boolField(r record, k string) bool {
	b, _ := r[k].(bool)
	return b
}
