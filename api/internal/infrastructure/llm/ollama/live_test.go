//go:build live

package ollama

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/application/assistant"
	"github.com/syabanf/artha-samoedra/api/internal/application/assistant/assistanttest"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
)

// TestLiveChat calls the real provider. Run it with the key in the environment:
//
//	set -a; . ./.env; set +a; go test -tags live -run TestLiveChat ./internal/infrastructure/llm/ollama/
func TestLiveChat(t *testing.T) {
	if os.Getenv("OLLAMA_API_KEY") == "" {
		t.Skip("OLLAMA_API_KEY is not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	tool := assistant.Tool{Name: "low_stock", Description: "Inventory items below their minimum stock.", Parameters: &assistant.Schema{Type: "object"}}
	reply, err := New(ConfigFromEnv()).Chat(ctx, []assistant.Message{
		{Role: assistant.RoleSystem, Content: "You answer inventory questions with the tools."},
		{Role: assistant.RoleUser, Content: "Which items are low on stock?"},
	}, []assistant.Tool{tool})
	if err != nil {
		t.Fatal(err)
	}
	if len(reply.Message.ToolCalls) == 0 && reply.Message.Content == "" {
		t.Fatal("no tool call and no reply")
	}
	t.Logf("tool calls: %d, reply chars: %d, tokens: %+v", len(reply.Message.ToolCalls), len(reply.Message.Content), reply.Usage)
	for _, c := range reply.Message.ToolCalls {
		t.Logf("tool call %s %s", c.Name, c.Arguments)
	}
}

// TestLiveTurn runs one full Jessy turn against the real model and the stand-in buses: the
// model must call a read tool and answer from its result.
func TestLiveTurn(t *testing.T) {
	if os.Getenv("OLLAMA_API_KEY") == "" {
		t.Skip("OLLAMA_API_KEY is not set")
	}
	kit := assistanttest.New()
	kit.Records["invoices"] = []map[string]any{{"id": "inv-4", "code": "INV-26-0004", "status": "issued", "customerId": "ptn-2",
		"dueDate": "2026-10-31T03:00:00.000Z", "taxPct": 11.0, "lines": []any{map[string]any{"qty": 1.0, "unitPrice": 150000000.0}},
		"receipts": []any{map[string]any{"amount": 80000000.0}}}}
	svc, err := assistant.New(assistant.Config{LLM: New(ConfigFromEnv()), Queries: kit.Queries, Commands: kit.Commands,
		Clock: &assistanttest.Clock{T: time.Date(2026, 11, 11, 3, 0, 0, 0, time.UTC)}})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	ctx = iam.WithActor(ctx, assistanttest.Actor("usr-1", assistanttest.PermRead))
	ans, err := svc.Send(ctx, "", "Invoice mana yang sudah lewat jatuh tempo?")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("tool calls %+v, tokens %+v", ans.ToolCalls, ans.Usage)
	t.Logf("reply: %s", ans.Reply)
	if len(ans.ToolCalls) == 0 || ans.Reply == "" {
		t.Fatal("expected a tool call and a reply")
	}
}
