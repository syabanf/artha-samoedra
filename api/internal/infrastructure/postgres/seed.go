package postgres

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SeedResult says what Seed loaded.
type SeedResult struct {
	Skipped     bool
	Records     int
	Collections int
	Singletons  int
	Users       int
}

// Seed loads the frontend's demo data: arrays become records (in array order), objects become
// singletons, and every user gets passwordHash as a credential. With reset it truncates first;
// without it, it leaves a database that already has records alone.
func Seed(ctx context.Context, pool *pgxpool.Pool, data []byte, passwordHash string, reset bool) (SeedResult, error) {
	var top map[string]json.RawMessage
	if err := json.Unmarshal(data, &top); err != nil {
		return SeedResult{}, fmt.Errorf("read seed: %w", err)
	}
	var res SeedResult
	err := pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if reset {
			if _, err := tx.Exec(ctx, `TRUNCATE records, singletons, credentials, events, audit_log RESTART IDENTITY`); err != nil {
				return err
			}
		} else {
			var has bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM records)`).Scan(&has); err != nil {
				return err
			}
			if has {
				res.Skipped = true
				return nil
			}
		}
		var rows [][]any
		var userIDs []string
		for name, raw := range top {
			if len(raw) > 0 && raw[0] == '{' {
				if _, err := tx.Exec(ctx, `INSERT INTO singletons (name, data) VALUES ($1, $2)`, name, []byte(raw)); err != nil {
					return fmt.Errorf("singleton %s: %w", name, err)
				}
				res.Singletons++
				continue
			}
			var items []json.RawMessage
			if err := json.Unmarshal(raw, &items); err != nil {
				return fmt.Errorf("collection %s: %w", name, err)
			}
			res.Collections++
			for _, item := range items {
				var head struct {
					ID string `json:"id"`
				}
				if err := json.Unmarshal(item, &head); err != nil || head.ID == "" {
					return fmt.Errorf("collection %s: a record without an id", name)
				}
				rows = append(rows, []any{name, head.ID, []byte(item)})
				if name == "users" {
					userIDs = append(userIDs, head.ID)
				}
			}
		}
		// COPY assigns seq in row order, so each collection keeps its array order.
		n, err := tx.CopyFrom(ctx, pgx.Identifier{"records"}, []string{"collection", "id", "data"}, pgx.CopyFromRows(rows))
		if err != nil {
			return fmt.Errorf("copy records: %w", err)
		}
		res.Records = int(n)
		for _, id := range userIDs {
			if _, err := tx.Exec(ctx, `INSERT INTO credentials (user_id, password_hash) VALUES ($1, $2)`, id, passwordHash); err != nil {
				return err
			}
		}
		res.Users = len(userIDs)
		return nil
	})
	return res, err
}
