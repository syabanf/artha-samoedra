// Package deepseek implements the assistant's LLM port against the DeepSeek API, which speaks
// the OpenAI chat-completions format. The API key comes from the environment and never appears
// in errors or logs.
package deepseek

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
	DefaultHost  = "https://api.deepseek.com"
	DefaultModel = "deepseek-chat"
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

// ConfigFromEnv reads DEEPSEEK_HOST, DEEPSEEK_API_KEY, DEEPSEEK_MODEL and DEEPSEEK_TIMEOUT (a Go
// duration such as 90s).
func ConfigFromEnv() Config {
	c := Config{Host: os.Getenv("DEEPSEEK_HOST"), APIKey: os.Getenv("DEEPSEEK_API_KEY"), Model: os.Getenv("DEEPSEEK_MODEL")}
	if d, err := time.ParseDuration(os.Getenv("DEEPSEEK_TIMEOUT")); err == nil {
		c.Timeout = d
	}
	return c
}

// Client calls POST {host}/chat/completions.
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
	return &Client{url: strings.TrimRight(c.Host, "/") + "/chat/completions", key: c.APIKey, model: c.Model, http: h}
}

// Wire types of the chat-completions API. Tool arguments travel as a JSON string.

type wireCall struct {
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type wireMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []wireCall `json:"tool_calls,omitempty"`
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
	Model       string        `json:"model"`
	Messages    []wireMessage `json:"messages"`
	Tools       []wireTool    `json:"tools,omitempty"`
	Temperature float64       `json:"temperature"`
	Stream      bool          `json:"stream"`
}

type chatResponse struct {
	Choices []struct {
		Message wireMessage `json:"message"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
}

// Chat sends one non-streaming request. It retries once when the provider answers 5xx.
func (c *Client) Chat(ctx context.Context, messages []assistant.Message, tools []assistant.Tool) (assistant.Reply, error) {
	if c.key == "" {
		return assistant.Reply{}, fmt.Errorf("%w: DEEPSEEK_API_KEY is not set", assistant.ErrLLMUnavailable)
	}
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
	if len(res.Choices) == 0 {
		return assistant.Reply{}, fmt.Errorf("%w: the answer has no choices", assistant.ErrLLMUnavailable)
	}
	return toReply(res), nil
}

func (c *Client) request(messages []assistant.Message, tools []assistant.Tool) chatRequest {
	req := chatRequest{Model: c.model, Temperature: 0.2}
	for _, m := range messages {
		wm := wireMessage{Role: m.Role, Content: m.Content, ToolCallID: m.ToolCallID}
		for _, tc := range m.ToolCalls {
			w := wireCall{ID: tc.ID, Type: "function"}
			w.Function.Name, w.Function.Arguments = tc.Name, string(tc.Arguments)
			if w.Function.Arguments == "" {
				w.Function.Arguments = "{}"
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
	req.Header.Set("Authorization", "Bearer "+c.key)
	resp, err := c.http.Do(req)
	if err != nil {
		var te interface{ Timeout() bool }
		if errors.As(err, &te) && te.Timeout() {
			return 0, fmt.Errorf("%w: the model took too long to answer", assistant.ErrLLMUnavailable)
		}
		if ctx.Err() != nil {
			err = ctx.Err()
		}
		return 0, fmt.Errorf("%w: %v", assistant.ErrLLMUnavailable, err)
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
	return resp.StatusCode, nil
}

func statusText(code int, body []byte) string {
	switch code {
	case http.StatusUnauthorized, http.StatusForbidden:
		return fmt.Sprintf("the provider refused the API key (HTTP %d)", code)
	case http.StatusPaymentRequired:
		return "the DeepSeek account has no balance left (HTTP 402)"
	case http.StatusTooManyRequests:
		return "the provider rate limit was reached (HTTP 429)"
	}
	var e struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	msg := http.StatusText(code)
	if json.Unmarshal(body, &e) == nil && e.Error.Message != "" {
		msg = e.Error.Message
	}
	if len(msg) > 200 {
		msg = msg[:200]
	}
	return fmt.Sprintf("HTTP %d: %s", code, msg)
}

func toReply(res chatResponse) assistant.Reply {
	m := res.Choices[0].Message
	msg := assistant.Message{Role: assistant.RoleAssistant, Content: m.Content}
	for i, tc := range m.ToolCalls {
		args := strings.TrimSpace(tc.Function.Arguments)
		if args == "" {
			args = "{}"
		}
		id := tc.ID
		if id == "" {
			id = fmt.Sprintf("call_%d", i)
		}
		msg.ToolCalls = append(msg.ToolCalls, assistant.ToolCall{ID: id, Name: tc.Function.Name, Arguments: json.RawMessage(args)})
	}
	u := assistant.Usage{PromptTokens: res.Usage.PromptTokens, CompletionTokens: res.Usage.CompletionTokens, TotalTokens: res.Usage.TotalTokens}
	return assistant.Reply{Message: msg, Usage: u}
}
