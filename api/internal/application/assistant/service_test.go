package assistant_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/application/assistant"
	"github.com/syabanf/artha-samoedra/api/internal/application/assistant/assistanttest"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/llm/fake"
)

// 03:00 UTC is 10:00 in Jakarta, a Wednesday.
var start = time.Date(2026, 11, 11, 3, 0, 0, 0, time.UTC)

type env struct {
	kit   *assistanttest.Kit
	llm   *fake.LLM
	clock *assistanttest.Clock
	svc   *assistant.Service
}

func setup(t *testing.T, steps ...fake.Step) *env {
	t.Helper()
	e := &env{kit: assistanttest.New(), llm: fake.New(steps...), clock: &assistanttest.Clock{T: start}}
	e.kit.Records["invoices"] = []map[string]any{
		{"id": "inv-1", "code": "INV-26-0001", "status": "issued", "customerId": "acc-1", "dueDate": "2026-10-31T03:00:00.000Z",
			"taxPct": 11.0, "lines": []any{map[string]any{"qty": 1.0, "unitPrice": 100.0}}, "receipts": []any{map[string]any{"amount": 11.0}}},
		{"id": "inv-2", "code": "INV-26-0002", "status": "issued", "customerId": "acc-2", "dueDate": "2026-12-01T03:00:00.000Z",
			"taxPct": 11.0, "lines": []any{map[string]any{"qty": 2.0, "unitPrice": 50.0}}, "receipts": []any{}},
		{"id": "inv-3", "code": "INV-26-0003", "status": "draft", "dueDate": "2026-10-01T03:00:00.000Z"},
	}
	svc, err := assistant.New(assistant.Config{LLM: e.llm, Queries: e.kit.Queries, Commands: e.kit.Commands, Clock: e.clock})
	if err != nil {
		t.Fatal(err)
	}
	e.svc = svc
	return e
}

func as(a iam.Actor) context.Context { return iam.WithActor(context.Background(), a) }

var (
	manager = assistanttest.Actor("usr-1", assistanttest.PermRead, assistanttest.PermHR, assistanttest.PermApprove)
	clerk   = assistanttest.Actor("usr-2", assistanttest.PermRead)
)

func TestReadToolRoundTrip(t *testing.T) {
	e := setup(t,
		fake.Use("search_records", map[string]any{"collection": "invoices", "where": map[string]string{"status": "issued"}, "limit": "5"}),
		fake.Say("You have 2 issued invoices."))

	ans, err := e.svc.Send(as(clerk), "", "How many invoices are issued?")
	if err != nil {
		t.Fatal(err)
	}
	if ans.Reply != "You have 2 issued invoices." || ans.ConversationID == "" {
		t.Fatalf("answer = %+v", ans)
	}
	if len(ans.ToolCalls) != 1 || ans.ToolCalls[0].Summary != "2 of 2 invoices" {
		t.Fatalf("tool calls = %+v", ans.ToolCalls)
	}
	if got := invoiceLists(e)[0]; got.Where["status"] != "issued" || got.Limit != 5 {
		t.Fatalf("records.list got %+v", got)
	}
	result := e.llm.Calls[1].LastToolResult()
	if !strings.Contains(result, "INV-26-0001") || strings.Contains(result, "INV-26-0003") {
		t.Fatalf("tool result = %s", result)
	}
	if ans.Usage.TotalTokens != 40 {
		t.Fatalf("usage = %+v", ans.Usage)
	}
	sys := e.llm.Calls[0].Messages[0]
	if sys.Role != assistant.RoleSystem || !strings.Contains(sys.Content, "You are Jessy") || !strings.Contains(sys.Content, "2026-11-11") {
		t.Fatalf("system prompt = %q", sys.Content)
	}

	view, err := e.svc.Conversation(as(clerk), ans.ConversationID)
	if err != nil || len(view.Turns) != 2 {
		t.Fatalf("conversation = %+v, %v", view, err)
	}
	if _, err := e.svc.Conversation(as(manager), ans.ConversationID); !errors.Is(err, shared.ErrNotFound) {
		t.Fatalf("another member read the conversation: %v", err)
	}
}

func TestPermissionRefusalGoesBackToTheModel(t *testing.T) {
	e := setup(t,
		fake.Use("search_records", map[string]any{"collection": "employees"}),
		fake.Say("Your role cannot see employees."))

	ans, err := e.svc.Send(as(clerk), "", "List the employees")
	if err != nil {
		t.Fatal(err)
	}
	if ans.ToolCalls[0].Summary != "forbidden" {
		t.Fatalf("tool calls = %+v", ans.ToolCalls)
	}
	if r := e.llm.Calls[1].LastToolResult(); !strings.HasPrefix(r, "Refused:") {
		t.Fatalf("tool result = %q", r)
	}
}

// invoiceLists skips the prompt lookup, which also calls records.list.
func invoiceLists(e *env) []assistanttest.ListQuery {
	var out []assistanttest.ListQuery
	for _, q := range e.kit.Lists {
		if q.Collection == "invoices" {
			out = append(out, q)
		}
	}
	return out
}

func propose(id string) fake.Step {
	return fake.Use("propose_command", map[string]any{"name": "listings.approve", "args": map[string]string{"id": id}, "summary": "Approve listing " + id})
}

func TestProposeThenConfirmRunsAsTheConfirmingMember(t *testing.T) {
	e := setup(t, propose("lst-7"), fake.Say("Press Confirm to approve lst-7."))

	ans, err := e.svc.Send(as(manager), "", "Approve lst-7")
	if err != nil {
		t.Fatal(err)
	}
	if len(ans.Proposals) != 1 || ans.Proposals[0].Status != assistant.ProposalPending {
		t.Fatalf("proposals = %+v", ans.Proposals)
	}
	if len(e.kit.Dispatched) != 0 {
		t.Fatal("the command ran before Confirm")
	}
	// propose_command offers only commands the member may run.
	for _, tl := range e.llm.Calls[0].Tools {
		if tl.Name == "propose_command" {
			if enum := tl.Parameters.Properties["name"].Enum; len(enum) != 1 || enum[0] != "listings.approve" {
				t.Fatalf("command enum = %v", enum)
			}
		}
	}

	id := ans.Proposals[0].ID
	res, err := e.svc.Confirm(as(manager), id)
	if err != nil {
		t.Fatal(err)
	}
	want := assistanttest.Dispatched{Name: "listings.approve", ID: "lst-7", ActorID: "usr-1"}
	if len(e.kit.Dispatched) != 1 || e.kit.Dispatched[0] != want {
		t.Fatalf("dispatched = %+v", e.kit.Dispatched)
	}
	if m, _ := res.(map[string]string); m["status"] != "done" {
		t.Fatalf("result = %#v", res)
	}
	var rule *shared.RuleError
	if _, err := e.svc.Confirm(as(manager), id); !errors.As(err, &rule) {
		t.Fatalf("second confirm: %v", err)
	}
	if len(e.kit.Dispatched) != 1 {
		t.Fatal("the command ran twice")
	}
	view, _ := e.svc.Conversation(as(manager), ans.ConversationID)
	if last := view.Turns[len(view.Turns)-1]; !strings.HasPrefix(last.Content, "Confirmed:") {
		t.Fatalf("last turn = %+v", last)
	}
}

func TestConfirmByAnotherMemberIsRefused(t *testing.T) {
	e := setup(t, propose("lst-8"), fake.Say("Press Confirm."))
	ans, err := e.svc.Send(as(manager), "", "Approve lst-8")
	if err != nil {
		t.Fatal(err)
	}
	other := assistanttest.Actor("usr-3", assistanttest.PermRead, assistanttest.PermApprove)
	if _, err := e.svc.Confirm(as(other), ans.Proposals[0].ID); !errors.Is(err, shared.ErrForbidden) {
		t.Fatalf("confirm by another member: %v", err)
	}
	if _, err := e.svc.Cancel(as(other), ans.Proposals[0].ID); !errors.Is(err, shared.ErrForbidden) {
		t.Fatalf("cancel by another member: %v", err)
	}
	if len(e.kit.Dispatched) != 0 {
		t.Fatal("the command ran")
	}
	// The owner can still cancel it.
	p, err := e.svc.Cancel(as(manager), ans.Proposals[0].ID)
	if err != nil || p.Status != assistant.ProposalCancelled {
		t.Fatalf("cancel = %+v, %v", p, err)
	}
}

func TestExpiredProposalDoesNotRun(t *testing.T) {
	e := setup(t, propose("lst-9"), fake.Say("Press Confirm."))
	ans, err := e.svc.Send(as(manager), "", "Approve lst-9")
	if err != nil {
		t.Fatal(err)
	}
	e.clock.Advance(16 * time.Minute)
	view, _ := e.svc.Conversation(as(manager), ans.ConversationID)
	if view.Proposals[0].Status != assistant.ProposalExpired {
		t.Fatalf("status = %s", view.Proposals[0].Status)
	}
	var rule *shared.RuleError
	if _, err := e.svc.Confirm(as(manager), ans.Proposals[0].ID); !errors.As(err, &rule) || !strings.Contains(rule.Msg, "expired") {
		t.Fatalf("confirm after expiry: %v", err)
	}
	if len(e.kit.Dispatched) != 0 {
		t.Fatal("an expired proposal ran")
	}
}

func TestToolArgumentsAreValidated(t *testing.T) {
	e := setup(t,
		fake.Use("search_records", map[string]any{"collection": "spaceships"}),
		// listings.delist exists, but this member lacks its permission, so it is not in the enum.
		fake.Use("propose_command", map[string]any{"name": "listings.delist", "args": map[string]string{"id": "lst-1"}, "summary": "Delist"}),
		fake.Use("search_records", map[string]any{"collection": "invoices", "limit": 500}),
		fake.Say("I could not do that."))

	ans, err := e.svc.Send(as(manager), "", "Find spaceships and delist lst-1")
	if err != nil {
		t.Fatal(err)
	}
	for i, want := range []string{`arguments.collection is "spaceships" but must be one of`, `arguments.name is "listings.delist" but must be one of`, "between 1 and 50"} {
		if r := e.llm.Calls[i+1].LastToolResult(); !strings.Contains(r, want) {
			t.Fatalf("call %d tool result = %q, want %q", i+1, r, want)
		}
		if ans.ToolCalls[i].Summary != "invalid arguments" {
			t.Fatalf("summary %d = %q", i, ans.ToolCalls[i].Summary)
		}
	}
	if len(invoiceLists(e)) != 0 || len(e.kit.Dispatched) != 0 || len(ans.Proposals) != 0 {
		t.Fatal("an invalid call reached a bus or stored a proposal")
	}
}

func TestLoopStopsAfterMaxRounds(t *testing.T) {
	steps := make([]fake.Step, 0, 6)
	for range 5 {
		steps = append(steps, fake.Use("listing_stats", nil))
	}
	steps = append(steps, fake.Say("3 live listings."))
	e := setup(t, steps...)
	ans, err := e.svc.Send(as(clerk), "", "Listing counts?")
	if err != nil {
		t.Fatal(err)
	}
	if len(e.llm.Calls) != 6 || e.llm.Calls[5].Tools != nil || ans.Reply != "3 live listings." {
		t.Fatalf("calls = %d, last tools = %v, reply = %q", len(e.llm.Calls), e.llm.Calls[5].Tools, ans.Reply)
	}
}

func TestStoredPromptVersionIsUsed(t *testing.T) {
	e := setup(t, fake.Say("Halo."))
	e.kit.Records["aiAgents"] = []map[string]any{{"id": "jessy_console", "promptId": "prm-jessy_console-2"}}
	e.kit.Records["aiPrompts"] = []map[string]any{
		{"id": "prm-jessy_console-1", "agentId": "jessy_console", "version": 1.0, "system": "Old prompt."},
		{"id": "prm-jessy_console-2", "agentId": "jessy_console", "version": 2.0, "system": "Stored console prompt v2."},
	}
	if _, err := e.svc.Send(as(clerk), "", "Halo"); err != nil {
		t.Fatal(err)
	}
	sys := e.llm.Calls[0].Messages[0].Content
	if !strings.HasPrefix(sys, "Stored console prompt v2.") || !strings.Contains(sys, "Indonesian") {
		t.Fatalf("system prompt = %q", sys)
	}
}

func TestFocusedTools(t *testing.T) {
	e := setup(t,
		fake.Use("attendance_today", nil),
		fake.Use("low_stock", nil),
		fake.Use("overdue_invoices", nil),
		fake.Say("Done."))
	k := e.kit
	k.Records["employees"] = []map[string]any{
		{"id": "emp-1", "name": "Ayu", "shiftId": "shf-office"},
		{"id": "emp-2", "name": "Budi", "shiftId": "shf-office"},
		{"id": "emp-3", "name": "Citra", "shiftId": "shf-office"},
	}
	k.Records["shifts"] = []map[string]any{{"id": "shf-office", "start": "08:30", "days": []any{1.0, 2.0, 3.0, 4.0, 5.0}}}
	k.Records["attendance"] = []map[string]any{
		{"id": "a1", "employeeId": "emp-1", "date": "2026-11-11", "checkIn": "2026-11-11T01:35:00.000Z"},
		{"id": "a2", "employeeId": "emp-2", "date": "2026-11-11", "checkIn": "2026-11-11T02:05:00.000Z"},
		{"id": "a3", "employeeId": "emp-2", "date": "2026-11-10", "checkIn": "2026-11-10T04:00:00.000Z"},
	}
	k.Records["hrRequests"] = []map[string]any{
		{"id": "h1", "kind": "leave", "status": "approved", "employeeId": "emp-3", "leave": map[string]any{"type": "annual", "from": "2026-11-09", "to": "2026-11-11"}},
		{"id": "h2", "kind": "leave", "status": "pending", "employeeId": "emp-1", "leave": map[string]any{"type": "sick", "from": "2026-11-11", "to": "2026-11-11"}},
	}
	k.Settings["hrSettings"] = map[string]any{"lateGraceMinutes": 10.0}
	k.Records["items"] = []map[string]any{
		{"id": "itm-1", "sku": "SKU-1", "name": "Site board", "minStock": 4.0, "reorderQty": 6.0, "active": true},
		{"id": "itm-2", "sku": "SKU-2", "name": "Brochure", "minStock": 1.0, "active": true},
		{"id": "itm-3", "sku": "SKU-3", "name": "Old flyer", "minStock": 9.0, "active": false},
	}
	k.Records["stockMoves"] = []map[string]any{
		{"id": "m1", "itemId": "itm-1", "qty": 5.0}, {"id": "m2", "itemId": "itm-1", "qty": -3.0},
		{"id": "m3", "itemId": "itm-2", "qty": 5.0},
	}

	ans, err := e.svc.Send(as(manager), "", "Who is late, what is low and what is overdue?")
	if err != nil {
		t.Fatal(err)
	}
	var att struct {
		Date    string
		OnLeave []struct{ Name string }
		Late    []struct {
			Name        string
			MinutesLate int
		}
	}
	mustDecode(t, e.llm.Calls[1].LastToolResult(), &att)
	if att.Date != "2026-11-11" || len(att.OnLeave) != 1 || att.OnLeave[0].Name != "Citra" ||
		len(att.Late) != 1 || att.Late[0].Name != "Budi" || att.Late[0].MinutesLate != 25 {
		t.Fatalf("attendance = %+v", att)
	}
	var low struct {
		Items []struct {
			ItemID string
			Short  float64
		}
	}
	mustDecode(t, e.llm.Calls[2].LastToolResult(), &low)
	if len(low.Items) != 1 || low.Items[0].ItemID != "itm-1" || low.Items[0].Short != 2 {
		t.Fatalf("low stock = %+v", low)
	}
	var due struct {
		Count    int
		Invoices []struct {
			Code    string
			Balance float64
		}
	}
	mustDecode(t, e.llm.Calls[3].LastToolResult(), &due)
	if due.Count != 1 || due.Invoices[0].Code != "INV-26-0001" || due.Invoices[0].Balance != 100 {
		t.Fatalf("overdue = %+v", due)
	}
	if ans.ToolCalls[0].Summary != "2026-11-11: 1 on leave, 1 late" {
		t.Fatalf("summary = %q", ans.ToolCalls[0].Summary)
	}
}

func mustDecode(t *testing.T, s string, v any) {
	t.Helper()
	if err := json.Unmarshal([]byte(s), v); err != nil {
		t.Fatalf("decode %q: %v", s, err)
	}
}

func TestAnonymousIsRefused(t *testing.T) {
	e := setup(t)
	if _, err := e.svc.Send(context.Background(), "", "hi"); !errors.Is(err, shared.ErrUnauthenticated) {
		t.Fatalf("err = %v", err)
	}
}
