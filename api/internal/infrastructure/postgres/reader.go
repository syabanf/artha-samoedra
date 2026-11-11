package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/syabanf/artha-samoedra/api/internal/application/auth"
	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/application/records"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Reader implements records.Reader and the Directory ports of the command handlers.
type Reader struct{ db }

func NewReader(p *pgxpool.Pool) Reader { return Reader{db{p}} }

func (r Reader) List(ctx context.Context, f records.Filter) (records.Page, error) {
	args := []any{f.Collection}
	where := []string{"collection = $1"}
	arg := func(v any) string { args = append(args, v); return fmt.Sprintf("$%d", len(args)) }
	for k, v := range f.Where {
		if v == "null" {
			where = append(where, fmt.Sprintf("data -> %s = 'null'::jsonb", arg(k)))
			continue
		}
		where = append(where, fmt.Sprintf("data ->> %s = %s", arg(k), arg(v)))
	}
	if q := strings.TrimSpace(f.Q); q != "" {
		// Search the top-level values, not the key names every record shares.
		like := "%" + strings.NewReplacer(`\`, `\\`, "%", `\%`, "_", `\_`).Replace(q) + "%"
		where = append(where, fmt.Sprintf("EXISTS (SELECT 1 FROM jsonb_each_text(data) e WHERE e.value ILIKE %s)", arg(like)))
	}
	cond := strings.Join(where, " AND ")

	var page records.Page
	if err := r.q(ctx).QueryRow(ctx, "SELECT count(*) FROM records WHERE "+cond, args...).Scan(&page.Total); err != nil {
		return page, err
	}
	order := "seq"
	if f.SortField != "" {
		dir := "ASC"
		if f.Desc {
			dir = "DESC"
		}
		// jsonb ordering compares numbers as numbers and strings as text.
		order = fmt.Sprintf("data -> %s %s NULLS LAST, seq", arg(f.SortField), dir)
	}
	sql := fmt.Sprintf("SELECT data FROM records WHERE %s ORDER BY %s LIMIT %s OFFSET %s", cond, order, arg(f.Limit), arg(f.Offset))
	rows, err := r.q(ctx).Query(ctx, sql, args...)
	if err != nil {
		return page, err
	}
	defer rows.Close()
	page.Items = []json.RawMessage{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return page, err
		}
		page.Items = append(page.Items, raw)
	}
	return page, rows.Err()
}

func (r Reader) Get(ctx context.Context, collection, id string) (json.RawMessage, error) {
	var raw []byte
	err := r.q(ctx).QueryRow(ctx, `SELECT data FROM records WHERE collection = $1 AND id = $2`, collection, id).Scan(&raw)
	return raw, mapErr(err, fmt.Sprintf("%s %s", singular(collection), id))
}

func (r Reader) Singleton(ctx context.Context, name string) (json.RawMessage, error) {
	var raw []byte
	err := r.q(ctx).QueryRow(ctx, `SELECT data FROM singletons WHERE name = $1`, name).Scan(&raw)
	return raw, mapErr(err, "settings "+name)
}

func (r Reader) CountBy(ctx context.Context, collection, field string) (map[string]int, error) {
	rows, err := r.q(ctx).Query(ctx,
		`SELECT coalesce(data ->> $2, ''), count(*) FROM records WHERE collection = $1 GROUP BY 1`, collection, field)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]int{}
	for rows.Next() {
		var k string
		var n int
		if err := rows.Scan(&k, &n); err != nil {
			return nil, err
		}
		out[k] = n
	}
	return out, rows.Err()
}

func (r Reader) Exists(ctx context.Context, collection, id string) (bool, error) {
	var ok bool
	err := r.q(ctx).QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM records WHERE collection = $1 AND id = $2)`, collection, id).Scan(&ok)
	return ok, err
}

// ---- auth.Directory ----

type userDoc struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	RoleID string `json:"roleId"`
	Status string `json:"status"`
}

// Users implements auth.Directory.
type Users struct{ db }

func NewUsers(p *pgxpool.Pool) Users { return Users{db{p}} }

func (u Users) account(ctx context.Context, cond string, arg string) (auth.Account, error) {
	var raw []byte
	var hash *string
	err := u.q(ctx).QueryRow(ctx, `SELECT r.data, c.password_hash FROM records r
		LEFT JOIN credentials c ON c.user_id = r.id
		WHERE r.collection = 'users' AND `+cond, arg).Scan(&raw, &hash)
	if err != nil {
		return auth.Account{}, mapErr(err, "user")
	}
	var d userDoc
	if err := json.Unmarshal(raw, &d); err != nil {
		return auth.Account{}, err
	}
	acc := auth.Account{ID: d.ID, Name: d.Name, Email: d.Email, RoleID: d.RoleID, Status: d.Status, Doc: raw}
	if hash != nil {
		acc.PasswordHash = *hash
	}
	return acc, nil
}

func (u Users) AccountByEmail(ctx context.Context, email string) (auth.Account, error) {
	return u.account(ctx, "lower(r.data ->> 'email') = lower($1)", email)
}

func (u Users) Account(ctx context.Context, userID string) (auth.Account, error) {
	return u.account(ctx, "r.id = $1", userID)
}

func (u Users) Role(ctx context.Context, roleID string) (auth.Role, error) {
	var raw []byte
	if err := u.q(ctx).QueryRow(ctx, `SELECT data FROM records WHERE collection = 'roles' AND id = $1`, roleID).Scan(&raw); err != nil {
		return auth.Role{}, mapErr(err, "role "+roleID)
	}
	var d struct {
		ID          string   `json:"id"`
		Name        string   `json:"name"`
		Permissions []string `json:"permissions"`
	}
	err := json.Unmarshal(raw, &d)
	return auth.Role{ID: d.ID, Name: d.Name, Permissions: d.Permissions}, err
}

// ---- audit log and outbox ----

// AuditLog implements cqrs.AuditLog. A successful command's entry joins its transaction; a
// refused one goes through the pool so the rollback does not erase it.
type AuditLog struct{ db }

func NewAuditLog(p *pgxpool.Pool) AuditLog { return AuditLog{db{p}} }

func (a AuditLog) Record(ctx context.Context, e cqrs.AuditEntry) error {
	payload, err := json.Marshal(e.Payload)
	if err != nil {
		return err
	}
	var q querier = a.pool
	if e.Outcome == "ok" {
		q = a.q(ctx)
	}
	_, err = q.Exec(context.WithoutCancel(ctx),
		`INSERT INTO audit_log (at, actor_id, command, payload, outcome, detail) VALUES ($1, $2, $3, $4, $5, $6)`,
		e.At, e.ActorID, e.Command, payload, e.Outcome, e.Detail)
	return err
}

// Outbox implements cqrs.Outbox.
type Outbox struct{ db }

func NewOutbox(p *pgxpool.Pool) Outbox { return Outbox{db{p}} }

func (o Outbox) Append(ctx context.Context, actorID string, events []shared.Event) error {
	for _, e := range events {
		payload, err := eventPayload(e)
		if err != nil {
			return err
		}
		if _, err := o.q(ctx).Exec(ctx,
			`INSERT INTO events (name, aggregate_id, payload, actor_id) VALUES ($1, $2, $3, $4)`,
			e.EventName(), e.AggregateID(), payload, actorID); err != nil {
			return err
		}
	}
	return nil
}

// eventPayload marshals an event struct with camelCase keys: ListingID becomes listingId.
func eventPayload(e shared.Event) ([]byte, error) {
	raw, err := json.Marshal(e)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, err
	}
	out := make(map[string]json.RawMessage, len(fields))
	for k, v := range fields {
		k = strings.ToLower(k[:1]) + k[1:]
		if strings.HasSuffix(k, "ID") {
			k = strings.TrimSuffix(k, "ID") + "Id"
		}
		out[k] = v
	}
	return json.Marshal(out)
}
