package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"time"
)

// Roles of a chat message, as the model provider names them.
const (
	RoleSystem    = "system"
	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleTool      = "tool"
)

// Message is one entry of the transcript sent to the model.
type Message struct {
	Role      string
	Content   string
	ToolCalls []ToolCall
	// ToolName and ToolCallID tie a tool result to the call that asked for it.
	ToolName   string
	ToolCallID string
}

// ToolCall is the model asking to run one tool with JSON arguments.
type ToolCall struct {
	ID        string
	Name      string
	Arguments json.RawMessage
}

// Tool describes a function the model may call. Parameters is a JSON schema object.
type Tool struct {
	Name        string
	Description string
	Parameters  *Schema
}

// Usage counts the tokens of one or more model calls.
type Usage struct {
	PromptTokens     int `json:"promptTokens"`
	CompletionTokens int `json:"completionTokens"`
	TotalTokens      int `json:"totalTokens"`
}

func (u *Usage) add(o Usage) {
	u.PromptTokens += o.PromptTokens
	u.CompletionTokens += o.CompletionTokens
	u.TotalTokens += o.TotalTokens
}

// Reply is the model's answer to one Chat call.
type Reply struct {
	Message Message
	Usage   Usage
}

// LLM is the chat model port. An adapter turns it into a provider HTTP call.
type LLM interface {
	Chat(ctx context.Context, messages []Message, tools []Tool) (Reply, error)
}

// ErrLLMUnavailable wraps every provider failure, so the HTTP layer can answer 502.
var ErrLLMUnavailable = errors.New("the assistant model is unavailable")

// Turn is one visible line of a conversation: the member's text or Jessy's reply.
type Turn struct {
	Role        string            `json:"role"`
	Content     string            `json:"content"`
	At          time.Time         `json:"at"`
	ToolCalls   []ToolCallSummary `json:"toolCalls,omitempty"`
	ProposalIDs []string          `json:"proposalIds,omitempty"`
}

// ToolCallSummary tells the member which tool ran and what it found, in a few words.
type ToolCallSummary struct {
	Name string `json:"name"`
	// Args are the arguments the model sent, so the member can see what Jessy looked up.
	Args    json.RawMessage `json:"args,omitempty"`
	Summary string          `json:"summary"`
}

// Conversation belongs to the member who started it.
type Conversation struct {
	ID        string    `json:"id"`
	OwnerID   string    `json:"ownerId"`
	Turns     []Turn    `json:"turns"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ProposalStatus moves from pending to exactly one of the other states.
type ProposalStatus string

const (
	ProposalPending   ProposalStatus = "pending"
	ProposalConfirmed ProposalStatus = "confirmed"
	ProposalCancelled ProposalStatus = "cancelled"
	ProposalExpired   ProposalStatus = "expired"
	ProposalFailed    ProposalStatus = "failed"
)

// Proposal is a command Jessy suggested. It runs only when its owner confirms it.
type Proposal struct {
	ID             string          `json:"id"`
	ConversationID string          `json:"conversationId"`
	OwnerID        string          `json:"ownerId"`
	Command        string          `json:"command"`
	Args           json.RawMessage `json:"args"`
	Summary        string          `json:"summary"`
	Status         ProposalStatus  `json:"status"`
	CreatedAt      time.Time       `json:"createdAt"`
	ExpiresAt      time.Time       `json:"expiresAt"`
	DecidedAt      *time.Time      `json:"decidedAt,omitempty"`
	Error          string          `json:"error,omitempty"`
}

// Store keeps conversations and proposals. Lookups of a missing id return shared.ErrNotFound.
type Store interface {
	Conversation(ctx context.Context, id string) (Conversation, error)
	SaveConversation(ctx context.Context, c Conversation) error
	AddProposal(ctx context.Context, p Proposal) error
	Proposal(ctx context.Context, id string) (Proposal, error)
	// UpdateProposal applies fn to the stored proposal atomically and saves the result,
	// unless fn returns an error.
	UpdateProposal(ctx context.Context, id string, fn func(*Proposal) error) (Proposal, error)
}
