package postgres

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// The helpers below store aggregates as documents in records. Writes merge the mapped fields
// over the stored document (data || patch), so fields the domain does not model survive.

func (d db) getDoc(ctx context.Context, collection, id string, out any) (version int, err error) {
	var raw []byte
	err = d.q(ctx).QueryRow(ctx, `SELECT data, version FROM records WHERE collection = $1 AND id = $2`, collection, id).Scan(&raw, &version)
	if err != nil {
		return 0, mapErr(err, fmt.Sprintf("%s %s", singular(collection), id))
	}
	return version, json.Unmarshal(raw, out)
}

// findDocs returns the documents whose top-level field equals value, in seed order.
func findDocs[T any](ctx context.Context, d db, collection, field, value string) ([]T, []int, error) {
	rows, err := d.q(ctx).Query(ctx,
		`SELECT data, version FROM records WHERE collection = $1 AND data ->> $2 = $3 ORDER BY seq`, collection, field, value)
	if err != nil {
		return nil, nil, err
	}
	defer rows.Close()
	var docs []T
	var versions []int
	for rows.Next() {
		var raw []byte
		var v int
		if err := rows.Scan(&raw, &v); err != nil {
			return nil, nil, err
		}
		var doc T
		if err := json.Unmarshal(raw, &doc); err != nil {
			return nil, nil, err
		}
		docs, versions = append(docs, doc), append(versions, v)
	}
	return docs, versions, rows.Err()
}

func (d db) insertDoc(ctx context.Context, collection, id string, doc any) error {
	raw, err := json.Marshal(doc)
	if err != nil {
		return err
	}
	_, err = d.q(ctx).Exec(ctx, `INSERT INTO records (collection, id, data) VALUES ($1, $2, $3)`, collection, id, raw)
	return mapErr(err, id)
}

// patchDoc merges doc into the stored document if its version is still the one read.
// It returns the new version, or shared.ErrConflict when someone saved first.
func (d db) patchDoc(ctx context.Context, collection, id string, version int, doc any) (int, error) {
	raw, err := json.Marshal(doc)
	if err != nil {
		return 0, err
	}
	tag, err := d.q(ctx).Exec(ctx, `UPDATE records SET data = data || $4::jsonb, version = version + 1, updated_at = now()
		WHERE collection = $1 AND id = $2 AND version = $3`, collection, id, version, raw)
	if err != nil {
		return 0, mapErr(err, id)
	}
	if tag.RowsAffected() == 0 {
		return 0, shared.ErrConflict
	}
	return version + 1, nil
}

// nextCode reads the codes with the prefix and returns the next one.
func (d db) nextCode(ctx context.Context, collection, prefix string, width int) (string, error) {
	rows, err := d.q(ctx).Query(ctx,
		`SELECT data ->> 'code' FROM records WHERE collection = $1 AND starts_with(data ->> 'code', $2)`, collection, prefix)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	var codes []string
	for rows.Next() {
		var c string
		if err := rows.Scan(&c); err != nil {
			return "", err
		}
		codes = append(codes, c)
	}
	return shared.NextCode(codes, prefix, width), rows.Err()
}

// singular turns "listings" into "listing" for not-found messages.
func singular(collection string) string {
	if n := len(collection); n > 1 && collection[n-1] == 's' {
		return collection[:n-1]
	}
	return collection
}
