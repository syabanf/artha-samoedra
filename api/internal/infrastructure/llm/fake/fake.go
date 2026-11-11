// Package fake is a scripted LLM for tests. Each Chat call runs the next step of the script
// and records what the service sent.
package fake

import (
	"context"
	"encoding/json"
	"errors"
	"sync"

	"github.com/syabanf/artha-samoedra/api/internal/application/assistant"
)

// Step answers one Chat call. It sees the messages and tools of that call.
type Step func(messages []assistant.Message, tools []assistant.Tool) assistant.Reply

// Call is one recorded Chat call.
type Call struct {
	Messages []assistant.Message
	Tools    []assistant.Tool
}

type LLM struct {
	mu    sync.Mutex
	steps []Step
	Calls []Call
}

func New(steps ...Step) *LLM { return &LLM{steps: steps} }

func (f *LLM) Chat(_ context.Context, messages []assistant.Message, tools []assistant.Tool) (assistant.Reply, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.Calls = append(f.Calls, Call{Messages: append([]assistant.Message(nil), messages...), Tools: tools})
	if len(f.steps) == 0 {
		return assistant.Reply{}, errors.New("fake llm: script ran out")
	}
	step := f.steps[0]
	f.steps = f.steps[1:]
	return step(messages, tools), nil
}

// Say replies with text and no tool calls.
func Say(text string) Step {
	return func([]assistant.Message, []assistant.Tool) assistant.Reply {
		return assistant.Reply{Message: assistant.Message{Role: assistant.RoleAssistant, Content: text}, Usage: assistant.Usage{PromptTokens: 10, CompletionTokens: 5, TotalTokens: 15}}
	}
}

// Use asks for one tool call with the given arguments.
func Use(name string, args any) Step {
	return func([]assistant.Message, []assistant.Tool) assistant.Reply {
		raw, _ := json.Marshal(args)
		return assistant.Reply{
			Message: assistant.Message{Role: assistant.RoleAssistant, ToolCalls: []assistant.ToolCall{{ID: "call_" + name, Name: name, Arguments: raw}}},
			Usage:   assistant.Usage{PromptTokens: 20, CompletionTokens: 5, TotalTokens: 25},
		}
	}
}

// LastToolResult returns the content of the newest tool message in a call, or "".
func (c Call) LastToolResult() string {
	for i := len(c.Messages) - 1; i >= 0; i-- {
		if c.Messages[i].Role == assistant.RoleTool {
			return c.Messages[i].Content
		}
	}
	return ""
}
