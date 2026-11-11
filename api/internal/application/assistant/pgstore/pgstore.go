// Package pgstore keeps Jessy's conversations and proposals in PostgreSQL, in the tables of
// migrations/0100_assistant.sql.
package pgstore

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/syabanf/artha-samoedra/api/internal/application/assistant"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Store implements assistant.Store.
type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

var _ assistant.Store = (*Store)(nil)

func notFound(err error, what string) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return shared.NotFound(what)
	}
	return err
}

func (s *Store) Conversation(ctx context.Context, id string) (assistant.Conversation, error) {
	c := assistant.Conversation{ID: id}
	var turns []byte
	err := s.pool.QueryRow(ctx, `SELECT owner_id, turns, created_at, updated_at FROM assistant_conversations WHERE id = $1`, id).
		Scan(&c.OwnerID, &turns, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return c, notFound(err, "conversation "+id)
	}
	return c, json.Unmarshal(turns, &c.Turns)
}

func (s *Store) SaveConversation(ctx context.Context, c assistant.Conversation) error {
	turns, err := json.Marshal(c.Turns)
	if err != nil {
		return err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO assistant_conversations (id, owner_id, turns, created_at, updated_at) VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (id) DO UPDATE SET turns = EXCLUDED.turns, updated_at = EXCLUDED.updated_at`,
		c.ID, c.OwnerID, turns, c.CreatedAt, c.UpdatedAt)
	return err
}

func (s *Store) AddProposal(ctx context.Context, p assistant.Proposal) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO assistant_proposals (id, conversation_id, owner_id, command, args, summary, status, error, created_at, expires_at, decided_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		p.ID, p.ConversationID, p.OwnerID, p.Command, []byte(p.Args), p.Summary, p.Status, p.Error, p.CreatedAt, p.ExpiresAt, p.DecidedAt)
	return err
}

const selectProposal = `SELECT id, conversation_id, owner_id, command, args, summary, status, error, created_at, expires_at, decided_at
	FROM assistant_proposals WHERE id = $1`

func scanProposal(row pgx.Row, id string) (assistant.Proposal, error) {
	var p assistant.Proposal
	var args []byte
	err := row.Scan(&p.ID, &p.ConversationID, &p.OwnerID, &p.Command, &args, &p.Summary, &p.Status, &p.Error, &p.CreatedAt, &p.ExpiresAt, &p.DecidedAt)
	p.Args = args
	return p, notFound(err, "proposal "+id)
}

func (s *Store) Proposal(ctx context.Context, id string) (assistant.Proposal, error) {
	return scanProposal(s.pool.QueryRow(ctx, selectProposal, id), id)
}

// UpdateProposal locks the row, so two confirms of one proposal run one after the other and
// the second sees the first one's status.
func (s *Store) UpdateProposal(ctx context.Context, id string, fn func(*assistant.Proposal) error) (assistant.Proposal, error) {
	var out assistant.Proposal
	err := pgx.BeginFunc(ctx, s.pool, func(tx pgx.Tx) error {
		p, err := scanProposal(tx.QueryRow(ctx, selectProposal+` FOR UPDATE`, id), id)
		if err != nil {
			return err
		}
		if err := fn(&p); err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `UPDATE assistant_proposals SET status = $2, error = $3, decided_at = $4 WHERE id = $1`,
			id, p.Status, p.Error, p.DecidedAt)
		out = p
		return err
	})
	return out, err
}
