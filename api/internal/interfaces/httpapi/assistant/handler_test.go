package assistant_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	app "github.com/syabanf/artha-samoedra/api/internal/application/assistant"
	"github.com/syabanf/artha-samoedra/api/internal/application/assistant/assistanttest"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/infrastructure/llm/fake"
	assistanthttp "github.com/syabanf/artha-samoedra/api/internal/interfaces/httpapi/assistant"
)

// withActor stands in for the auth middleware.
func withActor(a iam.Actor, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(iam.WithActor(r.Context(), a)))
	})
}

func do(t *testing.T, h http.Handler, method, path, body string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, strings.NewReader(body)))
	var out map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("%s %s: body %q is not JSON", method, path, rec.Body.String())
	}
	return rec.Code, out
}

func TestHandler(t *testing.T) {
	kit := assistanttest.New()
	llm := fake.New(
		fake.Use("propose_command", map[string]any{"name": "listings.approve", "args": map[string]string{"id": "lst-1"}, "summary": "Approve lst-1"}),
		fake.Say("Press Confirm to approve lst-1."),
		fake.Use("propose_command", map[string]any{"name": "listings.approve", "args": map[string]string{"id": "lst-2"}, "summary": "Approve lst-2"}),
		fake.Say("Press Confirm to approve lst-2."))
	svc, err := app.New(app.Config{LLM: llm, Queries: kit.Queries, Commands: kit.Commands,
		Clock: &assistanttest.Clock{T: time.Date(2026, 11, 11, 3, 0, 0, 0, time.UTC)}})
	if err != nil {
		t.Fatal(err)
	}
	h := assistanthttp.New(svc)
	member := withActor(assistanttest.Actor("usr-1", assistanttest.PermRead, assistanttest.PermApprove), h)
	other := withActor(assistanttest.Actor("usr-9", assistanttest.PermRead, assistanttest.PermApprove), h)

	if code, _ := do(t, h, "POST", "/messages", `{"text":"hi"}`); code != http.StatusUnauthorized {
		t.Fatalf("anonymous: %d", code)
	}
	if code, _ := do(t, member, "POST", "/messages", `{"text":"  "}`); code != http.StatusUnprocessableEntity {
		t.Fatalf("empty text: %d", code)
	}

	code, ans := do(t, member, "POST", "/messages", `{"text":"Approve lst-1"}`)
	if code != http.StatusOK || ans["reply"] != "Press Confirm to approve lst-1." {
		t.Fatalf("send: %d %v", code, ans)
	}
	conv := ans["conversationId"].(string)
	proposals := ans["proposals"].([]any)
	id := proposals[0].(map[string]any)["id"].(string)
	if calls := ans["toolCalls"].([]any); calls[0].(map[string]any)["name"] != "propose_command" {
		t.Fatalf("toolCalls = %v", calls)
	}
	if _, ok := ans["usage"].(map[string]any)["totalTokens"]; !ok {
		t.Fatalf("usage = %v", ans["usage"])
	}

	if code, _ := do(t, other, "POST", "/proposals/"+id+"/confirm", ""); code != http.StatusForbidden {
		t.Fatalf("confirm by another member: %d", code)
	}
	code, res := do(t, member, "POST", "/proposals/"+id+"/confirm", "")
	if code != http.StatusOK || res["result"].(map[string]any)["status"] != "done" {
		t.Fatalf("confirm: %d %v", code, res)
	}
	if code, _ := do(t, member, "POST", "/proposals/"+id+"/confirm", ""); code != http.StatusUnprocessableEntity {
		t.Fatalf("second confirm: %d", code)
	}

	_, ans = do(t, member, "POST", "/messages", `{"conversationId":"`+conv+`","text":"Approve lst-2 too"}`)
	id2 := ans["proposals"].([]any)[0].(map[string]any)["id"].(string)
	if code, p := do(t, member, "POST", "/proposals/"+id2+"/cancel", ""); code != http.StatusOK || p["status"] != "cancelled" {
		t.Fatalf("cancel: %d %v", code, p)
	}

	code, view := do(t, member, "GET", "/conversations/"+conv, "")
	if code != http.StatusOK || len(view["turns"].([]any)) != 6 || len(view["proposals"].([]any)) != 2 {
		t.Fatalf("conversation: %d %v", code, view)
	}
	if code, _ := do(t, other, "GET", "/conversations/"+conv, ""); code != http.StatusNotFound {
		t.Fatalf("another member's conversation: %d", code)
	}
	if len(kit.Dispatched) != 1 || kit.Dispatched[0].ActorID != "usr-1" {
		t.Fatalf("dispatched = %+v", kit.Dispatched)
	}
}
