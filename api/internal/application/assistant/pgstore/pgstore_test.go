package pgstore_test

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/syabanf/artha-samoedra/api/internal/application/assistant"
	"github.com/syabanf/artha-samoedra/api/internal/application/assistant/pgstore"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
	"github.com/syabanf/artha-samoedra/api/migrations"
)

// TestStore needs an empty scratch database in ASSISTANT_TEST_DATABASE_URL; it creates and
// drops its own schema there.
func TestStore(t *testing.T) {
	url := os.Getenv("ASSISTANT_TEST_DATABASE_URL")
	if url == "" {
		t.Skip("ASSISTANT_TEST_DATABASE_URL is not set")
	}
	ctx := context.Background()
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = "assistant_test"
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	sql, err := migrations.FS.ReadFile("0100_assistant.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, "DROP SCHEMA IF EXISTS assistant_test CASCADE; CREATE SCHEMA assistant_test; "+string(sql)); err != nil {
		t.Fatal(err)
	}
	defer pool.Exec(ctx, "DROP SCHEMA assistant_test CASCADE")

	s := pgstore.New(pool)
	now := time.Now().UTC().Truncate(time.Millisecond)
	p := assistant.Proposal{ID: "prp-1", ConversationID: "cnv-1", OwnerID: "usr-1", Command: "listings.approve",
		Args: json.RawMessage(`{"id":"lst-1"}`), Summary: "Approve lst-1", Status: assistant.ProposalPending, CreatedAt: now, ExpiresAt: now.Add(15 * time.Minute)}
	if err := s.AddProposal(ctx, p); err != nil {
		t.Fatal(err)
	}
	c := assistant.Conversation{ID: "cnv-1", OwnerID: "usr-1", CreatedAt: now, UpdatedAt: now,
		Turns: []assistant.Turn{{Role: "user", Content: "Approve lst-1", At: now}, {Role: "assistant", Content: "Press Confirm.", At: now, ProposalIDs: []string{"prp-1"}}}}
	if err := s.SaveConversation(ctx, c); err != nil {
		t.Fatal(err)
	}
	c.Turns = append(c.Turns, assistant.Turn{Role: "assistant", Content: "Confirmed.", At: now})
	if err := s.SaveConversation(ctx, c); err != nil {
		t.Fatal(err)
	}
	got, err := s.Conversation(ctx, "cnv-1")
	if err != nil || len(got.Turns) != 3 || got.Turns[1].ProposalIDs[0] != "prp-1" {
		t.Fatalf("conversation = %+v, %v", got, err)
	}

	refused := errors.New("refused")
	if _, err := s.UpdateProposal(ctx, "prp-1", func(*assistant.Proposal) error { return refused }); !errors.Is(err, refused) {
		t.Fatalf("update error = %v", err)
	}
	upd, err := s.UpdateProposal(ctx, "prp-1", func(p *assistant.Proposal) error {
		p.Status, p.DecidedAt = assistant.ProposalConfirmed, &now
		return nil
	})
	if err != nil || upd.Status != assistant.ProposalConfirmed {
		t.Fatalf("update = %+v, %v", upd, err)
	}
	back, err := s.Proposal(ctx, "prp-1")
	if err != nil || back.Status != assistant.ProposalConfirmed || string(back.Args) != `{"id": "lst-1"}` || back.DecidedAt == nil {
		t.Fatalf("proposal = %+v (args %s), %v", back, back.Args, err)
	}
	if _, err := s.Proposal(ctx, "prp-none"); !errors.Is(err, shared.ErrNotFound) {
		t.Fatalf("missing proposal: %v", err)
	}
	if _, err := s.Conversation(ctx, "cnv-none"); !errors.Is(err, shared.ErrNotFound) {
		t.Fatalf("missing conversation: %v", err)
	}
}
