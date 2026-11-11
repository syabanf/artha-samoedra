// Package postgres implements the application ports on PostgreSQL with pgx: the transaction
// manager, the repositories, the read model, the audit log, the outbox, migrations and the seed.
package postgres

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Connect opens a pool and checks the database answers.
func Connect(ctx context.Context, url string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("reach postgres: %w", err)
	}
	return pool, nil
}

// querier is what a pool and a transaction share.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

type txKey struct{}

// TxManager implements cqrs.TxManager. Repositories pick the transaction up from the context.
type TxManager struct{ Pool *pgxpool.Pool }

func (m TxManager) WithinTx(ctx context.Context, fn func(ctx context.Context) error) error {
	if _, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return fn(ctx) // already inside one
	}
	return pgx.BeginFunc(ctx, m.Pool, func(tx pgx.Tx) error {
		return fn(context.WithValue(ctx, txKey{}, tx))
	})
}

// db is the store every adapter embeds: it uses the context's transaction, or the pool.
type db struct{ pool *pgxpool.Pool }

func (d db) q(ctx context.Context) querier {
	if tx, ok := ctx.Value(txKey{}).(pgx.Tx); ok {
		return tx
	}
	return d.pool
}

// mapErr turns driver errors into the domain's: no rows is not found, a unique clash a conflict.
func mapErr(err error, what string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return shared.NotFound(what)
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) && pg.Code == "23505" {
		return shared.ErrConflict
	}
	return err
}

// Migrate applies every *.sql file in files that schema_migrations does not list yet, in
// file-name order, each in its own transaction. An advisory lock keeps two processes apart.
func Migrate(ctx context.Context, pool *pgxpool.Pool, files fs.FS) ([]string, error) {
	names, err := fs.Glob(files, "*.sql")
	if err != nil {
		return nil, err
	}
	slices.Sort(names)
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	const lock = 7_202_611 // any constant shared by every migrator of this schema
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, lock); err != nil {
		return nil, err
	}
	defer conn.Exec(context.WithoutCancel(ctx), `SELECT pg_advisory_unlock($1)`, lock) //nolint:errcheck
	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return nil, err
	}
	var applied []string
	for _, name := range names {
		var done bool
		if err := conn.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE name = $1)`, name).Scan(&done); err != nil {
			return applied, err
		}
		if done {
			continue
		}
		sql, err := fs.ReadFile(files, name)
		if err != nil {
			return applied, err
		}
		err = pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name) VALUES ($1)`, name)
			return err
		})
		if err != nil {
			return applied, fmt.Errorf("migration %s: %w", name, err)
		}
		applied = append(applied, strings.TrimSuffix(name, ".sql"))
	}
	return applied, nil
}
