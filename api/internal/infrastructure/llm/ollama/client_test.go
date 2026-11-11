package ollama

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/syabanf/artha-samoedra/api/internal/application/assistant"
)

const testKey = "test-key-not-real"

func TestChatSendsToolsAndParsesToolCalls(t *testing.T) {
	var got chatRequest
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if calls == 1 {
			http.Error(w, `{"error":"overloaded"}`, http.StatusServiceUnavailable)
			return
		}
		if r.URL.Path != "/api/chat" || r.Header.Get("Authorization") != "Bearer "+testKey {
			t.Errorf("path %s, auth header set: %v", r.URL.Path, r.Header.Get("Authorization") != "")
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"message":{"role":"assistant","content":"","tool_calls":[{"function":{"name":"low_stock","arguments":{}}},{"function":{"name":"get_record","arguments":"{\"collection\":\"items\",\"id\":\"itm-1\"}"}}]},"prompt_eval_count":120,"eval_count":30,"done":true}`))
	}))
	defer srv.Close()

	c := New(Config{Host: srv.URL + "/", APIKey: testKey})
	reply, err := c.Chat(context.Background(),
		[]assistant.Message{{Role: assistant.RoleSystem, Content: "sys"}, {Role: assistant.RoleUser, Content: "hi"}},
		[]assistant.Tool{{Name: "low_stock", Description: "Low stock", Parameters: &assistant.Schema{Type: "object"}}})
	if err != nil {
		t.Fatal(err)
	}
	if calls != 2 {
		t.Fatalf("calls = %d, want a retry after 503", calls)
	}
	if got.Model != DefaultModel || got.Stream || len(got.Tools) != 1 || got.Tools[0].Function.Name != "low_stock" {
		t.Fatalf("request = %+v", got)
	}
	tc := reply.Message.ToolCalls
	if len(tc) != 2 || tc[0].Name != "low_stock" || tc[1].ID != "call_1" || string(tc[1].Arguments) != `{"collection":"items","id":"itm-1"}` {
		t.Fatalf("tool calls = %+v", tc)
	}
	if reply.Usage.TotalTokens != 150 {
		t.Fatalf("usage = %+v", reply.Usage)
	}
}

func TestChatMapsErrorsWithoutTheKey(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusInternalServerError, http.StatusBadRequest} {
		calls := 0
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			calls++
			http.Error(w, `{"error":"model not found"}`, status)
		}))
		_, err := New(Config{Host: srv.URL, APIKey: testKey}).Chat(context.Background(), nil, nil)
		srv.Close()
		if !errors.Is(err, assistant.ErrLLMUnavailable) || strings.Contains(err.Error(), testKey) {
			t.Fatalf("status %d: err = %v", status, err)
		}
		if want := map[bool]int{true: 2, false: 1}[status >= 500]; calls != want {
			t.Fatalf("status %d: %d calls, want %d", status, calls, want)
		}
	}
}
