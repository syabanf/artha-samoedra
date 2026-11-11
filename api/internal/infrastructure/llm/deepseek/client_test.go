package deepseek

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

const testKey = "sk-test-not-real"

func TestChatSendsTheOpenAIShapeAndParsesToolCalls(t *testing.T) {
	var got chatRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" || r.Header.Get("Authorization") != "Bearer "+testKey {
			t.Errorf("path %s auth %q", r.URL.Path, r.Header.Get("Authorization"))
		}
		_ = json.NewDecoder(r.Body).Decode(&got)
		_, _ = w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":"","tool_calls":[
			{"id":"call_1","type":"function","function":{"name":"listing_stats","arguments":"{\"status\":\"review\"}"}}]}}],
			"usage":{"prompt_tokens":40,"completion_tokens":8,"total_tokens":48}}`))
	}))
	defer srv.Close()

	c := New(Config{Host: srv.URL, APIKey: testKey})
	reply, err := c.Chat(context.Background(), []assistant.Message{
		{Role: assistant.RoleUser, Content: "How many listings?"},
		{Role: assistant.RoleAssistant, ToolCalls: []assistant.ToolCall{{ID: "call_0", Name: "x"}}},
		{Role: assistant.RoleTool, Content: "{}", ToolCallID: "call_0"},
	}, []assistant.Tool{{Name: "listing_stats", Description: "Counts"}})
	if err != nil {
		t.Fatal(err)
	}
	if got.Model != DefaultModel || got.Messages[1].ToolCalls[0].Function.Arguments != "{}" || got.Messages[2].ToolCallID != "call_0" {
		t.Fatalf("request %+v", got)
	}
	tc := reply.Message.ToolCalls
	if len(tc) != 1 || tc[0].Name != "listing_stats" || string(tc[0].Arguments) != `{"status":"review"}` {
		t.Fatalf("tool calls %+v", tc)
	}
	if reply.Usage.TotalTokens != 48 {
		t.Fatalf("usage %+v", reply.Usage)
	}
}

func TestChatRetriesOnceOn5xxAndHidesTheKey(t *testing.T) {
	calls := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	_, err := New(Config{Host: srv.URL, APIKey: testKey}).Chat(context.Background(), nil, nil)
	if calls != 2 || !errors.Is(err, assistant.ErrLLMUnavailable) || strings.Contains(err.Error(), testKey) {
		t.Fatalf("calls %d err %v", calls, err)
	}
}

func TestChatExplainsAMissingKeyAndAnEmptyBalance(t *testing.T) {
	if _, err := New(Config{}).Chat(context.Background(), nil, nil); err == nil || !strings.Contains(err.Error(), "DEEPSEEK_API_KEY") {
		t.Fatalf("no key: %v", err)
	}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusPaymentRequired) }))
	defer srv.Close()
	if _, err := New(Config{Host: srv.URL, APIKey: testKey}).Chat(context.Background(), nil, nil); err == nil || !strings.Contains(err.Error(), "no balance") {
		t.Fatalf("402: %v", err)
	}
}
