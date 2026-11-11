// Package ollama implements the assistant's LLM port against the Ollama chat API, local or
// Ollama Cloud (https://ollama.com). The API key comes from the environment and never appears
// in errors or logs.
package ollama

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/application/assistant"
)

const (
	DefaultHost  = "https://ollama.com"
	DefaultModel = "gpt-oss:120b"
)

// Config holds the connection settings. Host and Model fall back to the defaults above.
type Config struct {
	Host    string
	APIKey  string
	Model   string
	Timeout time.Duration
	// HTTP replaces the default client, for tests.
	HTTP *http.Client
}

// ConfigFromEnv reads OLLAMA_HOST, OLLAMA_API_KEY, OLLAMA_MODEL and OLLAMA_TIMEOUT (a Go
// duration such as 90s).
func ConfigFromEnv() Config {
	c := Config{Host: os.Getenv("OLLAMA_HOST"), APIKey: os.Getenv("OLLAMA_API_KEY"), Model: os.Getenv("OLLAMA_MODEL")}
	if d, err := time.ParseDuration(os.Getenv("OLLAMA_TIMEOUT")); err == nil {
		c.Timeout = d
	}
	return c
}

// Client calls POST {host}/api/chat.
type Client struct {
	url   string
	key   string
	model string
	http  *http.Client
}

func New(c Config) *Client {
	if c.Host == "" {
		c.Host = DefaultHost
	}
	if c.Model == "" {
		c.Model = DefaultModel
	}
	if c.Timeout <= 0 {
		c.Timeout = 90 * time.Second
	}
	h := c.HTTP
	if h == nil {
		h = &http.Client{Timeout: c.Timeout}
	}
	return &Client{url: strings.TrimRight(c.Host, "/") + "/api/chat", key: c.APIKey, model: c.Model, http: h}
}

// Wire types of the Ollama chat API.

type wireCall struct {
	ID       string `json:"id,omitempty"`
	Function struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	} `json:"function"`
}

type wireMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []wireCall `json:"tool_calls,omitempty"`
	ToolName   string     `json:"tool_name,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

type wireTool struct {
	Type     string `json:"type"`
	Function struct {
		Name        string            `json:"name"`
		Description string            `json:"description"`
		Parameters  *assistant.Schema `json:"parameters"`
	} `json:"function"`
}

type chatRequest struct {
	Model    string         `json:"model"`
	Messages []wireMessage  `json:"messages"`
	Tools    []wireTool     `json:"tools,omitempty"`
	Stream   bool           `json:"stream"`
	Options  map[string]any `json:"options,omitempty"`
}

type chatResponse struct {
	Message         wireMessage `json:"message"`
	PromptEvalCount int         `json:"prompt_eval_count"`
	EvalCount       int         `json:"eval_count"`
	Error           string      `json:"error"`
}

// Chat sends one non-streaming request. It retries once when the provider answers 5xx.
func (c *Client) Chat(ctx context.Context, messages []assistant.Message, tools []assistant.Tool) (assistant.Reply, error) {
	body, err := json.Marshal(c.request(messages, tools))
	if err != nil {
		return assistant.Reply{}, fmt.Errorf("%w: %v", assistant.ErrLLMUnavailable, err)
	}
	var res chatResponse
	for attempt := 1; ; attempt++ {
		status, err := c.post(ctx, body, &res)
		if err == nil {
			break
		}
		if status >= 500 && attempt == 1 && ctx.Err() == nil {
			continue
		}
		return assistant.Reply{}, err
	}
	return toReply(res), nil
}

func (c *Client) request(messages []assistant.Message, tools []assistant.Tool) chatRequest {
	req := chatRequest{Model: c.model, Stream: false, Options: map[string]any{"temperature": 0.2}}
	for _, m := range messages {
		wm := wireMessage{Role: m.Role, Content: m.Content, ToolName: m.ToolName, ToolCallID: m.ToolCallID}
		for _, tc := range m.ToolCalls {
			var w wireCall
			w.ID, w.Function.Name, w.Function.Arguments = tc.ID, tc.Name, tc.Arguments
			if len(w.Function.Arguments) == 0 {
				w.Function.Arguments = json.RawMessage("{}")
			}
			wm.ToolCalls = append(wm.ToolCalls, w)
		}
		req.Messages = append(req.Messages, wm)
	}
	for _, t := range tools {
		var w wireTool
		w.Type, w.Function.Name, w.Function.Description, w.Function.Parameters = "function", t.Name, t.Description, t.Parameters
		req.Tools = append(req.Tools, w)
	}
	return req
}

// post returns the HTTP status (0 when no response came back) and an error that never
// includes the API key.
func (c *Client) post(ctx context.Context, body []byte, out *chatResponse) (int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.url, bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("%w: %v", assistant.ErrLLMUnavailable, err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.key != "" {
		req.Header.Set("Authorization", "Bearer "+c.key)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		var ue interface{ Timeout() bool }
		if errors.As(err, &ue) && ue.Timeout() {
			return 0, fmt.Errorf("%w: the model took too long to answer", assistant.ErrLLMUnavailable)
		}
		return 0, fmt.Errorf("%w: %v", assistant.ErrLLMUnavailable, ctxOr(ctx, err))
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return resp.StatusCode, fmt.Errorf("%w: reading the answer: %v", assistant.ErrLLMUnavailable, err)
	}
	if resp.StatusCode != http.StatusOK {
		return resp.StatusCode, fmt.Errorf("%w: %s", assistant.ErrLLMUnavailable, statusText(resp.StatusCode, raw))
	}
	*out = chatResponse{}
	if err := json.Unmarshal(raw, out); err != nil {
		return resp.StatusCode, fmt.Errorf("%w: the answer is not JSON", assistant.ErrLLMUnavailable)
	}
	if out.Error != "" {
		return resp.StatusCode, fmt.Errorf("%w: %s", assistant.ErrLLMUnavailable, out.Error)
	}
	return resp.StatusCode, nil
}

func ctxOr(ctx context.Context, err error) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return err
}

func statusText(code int, body []byte) string {
	switch code {
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Sprintf("the provider refused the API key (HTTP %d)", code)
	case http.StatusTooManyRequests:
		return "the provider rate limit was reached (HTTP 429)"
	}
	var e struct {
		Error string `json:"error"`
	}
	msg := http.StatusText(code)
	if json.Unmarshal(body, &e) == nil && e.Error != "" {
		msg = e.Error
	}
	if len(msg) > 200 {
		msg = msg[:200]
	}
	return fmt.Sprintf("HTTP %d: %s", code, msg)
}

func toReply(res chatResponse) assistant.Reply {
	msg := assistant.Message{Role: assistant.RoleAssistant, Content: res.Message.Content}
	for i, tc := range res.Message.ToolCalls {
		args := tc.Function.Arguments
		// Some models send the arguments as a JSON string instead of an object.
		var s string
		if json.Unmarshal(args, &s) == nil {
			args = json.RawMessage(s)
		}
		id := tc.ID
		if id == "" {
			id = fmt.Sprintf("call_%d", i)
		}
		msg.ToolCalls = append(msg.ToolCalls, assistant.ToolCall{ID: id, Name: tc.Function.Name, Arguments: args})
	}
	u := assistant.Usage{PromptTokens: res.PromptEvalCount, CompletionTokens: res.EvalCount}
	u.TotalTokens = u.PromptTokens + u.CompletionTokens
	return assistant.Reply{Message: msg, Usage: u}
}
