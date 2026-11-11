// Package assistant is Jessy, the console assistant. A member's message runs a short tool loop
// against an LLM: read tools go through the query bus as the member, and changes come back as
// proposals that run on the command bus only after the same member confirms them.
package assistant

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Config wires the service. LLM, Queries and Commands are required.
type Config struct {
	LLM      LLM
	Queries  *cqrs.Bus
	Commands *cqrs.Bus
	// Store defaults to an in-memory store.
	Store Store
	// Clock defaults to the wall clock.
	Clock shared.Clock
	// Location is where "today" and shift times are read, Asia/Jakarta (UTC+7) by default.
	Location *time.Location
	// MaxRounds caps model calls per message, 6 by default. The last call gets no tools.
	MaxRounds int
	// ProposalTTL is how long a proposal waits for Confirm, 15 minutes by default.
	ProposalTTL time.Duration
	// History is how many earlier turns the model sees, 12 by default.
	History int
	Logger  *slog.Logger
}

// Service runs Jessy's turns, proposals and conversations.
type Service struct {
	llm         LLM
	queries     *cqrs.Bus
	commands    *cqrs.Bus
	store       Store
	clock       shared.Clock
	loc         *time.Location
	maxRounds   int
	proposalTTL time.Duration
	history     int
	log         *slog.Logger

	mu       sync.Mutex
	prompt   string
	promptAt time.Time
}

type wallClock struct{}

func (wallClock) Now() time.Time { return time.Now() }

// MaxTextLen caps a member message in characters.
const MaxTextLen = 4000

// New builds the service and fills defaults.
func New(c Config) (*Service, error) {
	if c.LLM == nil || c.Queries == nil || c.Commands == nil {
		return nil, errors.New("assistant: LLM, Queries and Commands are required")
	}
	s := &Service{
		llm: c.LLM, queries: c.Queries, commands: c.Commands, store: c.Store, clock: c.Clock, loc: c.Location,
		maxRounds: c.MaxRounds, proposalTTL: c.ProposalTTL, history: c.History, log: c.Logger,
	}
	if s.store == nil {
		s.store = NewMemoryStore()
	}
	if s.clock == nil {
		s.clock = wallClock{}
	}
	if s.loc == nil {
		s.loc = time.FixedZone("WIB", 7*3600)
	}
	if s.maxRounds <= 0 {
		s.maxRounds = 6
	}
	if s.proposalTTL <= 0 {
		s.proposalTTL = 15 * time.Minute
	}
	if s.history <= 0 {
		s.history = 12
	}
	if s.log == nil {
		s.log = slog.Default()
	}
	return s, nil
}

func (s *Service) now() time.Time { return s.clock.Now() }

// Answer is the result of one member message.
type Answer struct {
	ConversationID string            `json:"conversationId"`
	Reply          string            `json:"reply"`
	Proposals      []Proposal        `json:"proposals"`
	ToolCalls      []ToolCallSummary `json:"toolCalls"`
	Usage          Usage             `json:"usage"`
	// Guarded marks a reply from the guard, which never reached the model.
	Guarded bool `json:"guarded,omitempty"`
}

// Send runs one member message through the tool loop. An empty conversationID starts a new
// conversation; an existing one must belong to the actor.
func (s *Service) Send(ctx context.Context, conversationID, text string) (Answer, error) {
	actor := iam.ActorFrom(ctx)
	if actor.IsAnonymous() {
		return Answer{}, shared.ErrUnauthenticated
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return Answer{}, shared.Rule("Write a message first.")
	}
	if utf8.RuneCountInString(text) > MaxTextLen {
		return Answer{}, shared.Rule("Keep the message under %d characters.", MaxTextLen)
	}
	conv, err := s.ownConversation(ctx, actor, conversationID)
	if err != nil {
		return Answer{}, err
	}
	if refusal := guard(text); refusal != "" {
		ans := Answer{ConversationID: conv.ID, Reply: refusal, Proposals: []Proposal{}, ToolCalls: []ToolCallSummary{}, Guarded: true}
		return ans, s.saveTurn(ctx, conv, text, ans, nil)
	}

	msgs := []Message{{Role: RoleSystem, Content: s.systemPrompt(ctx, actor)}}
	for _, t := range conv.Turns[max(0, len(conv.Turns)-s.history):] {
		msgs = append(msgs, Message{Role: t.Role, Content: t.Content})
	}
	msgs = append(msgs, Message{Role: RoleUser, Content: text})

	t := &turn{actor: actor, convID: conv.ID}
	tools := s.tools(actor)
	specs := make([]Tool, len(tools))
	for i, tl := range tools {
		specs[i] = tl.spec
	}
	ans := Answer{ConversationID: conv.ID, Proposals: []Proposal{}, ToolCalls: []ToolCallSummary{}}
	for round := 1; ; round++ {
		offered := specs
		if round == s.maxRounds {
			offered = nil
		}
		reply, err := s.llm.Chat(ctx, msgs, offered)
		if err != nil {
			return Answer{}, err
		}
		ans.Usage.add(reply.Usage)
		msg := reply.Message
		msg.Role = RoleAssistant
		if len(msg.ToolCalls) == 0 || offered == nil {
			ans.Reply = strings.TrimSpace(msg.Content)
			break
		}
		msgs = append(msgs, msg)
		for _, call := range msg.ToolCalls {
			content, summary := s.runTool(ctx, t, tools, call)
			ans.ToolCalls = append(ans.ToolCalls, ToolCallSummary{Name: call.Name, Args: call.Arguments, Summary: summary})
			msgs = append(msgs, Message{Role: RoleTool, Content: content, ToolName: call.Name, ToolCallID: call.ID})
		}
	}
	if ans.Reply == "" {
		ans.Reply = "Maaf, saya belum bisa menjawab itu. Sorry, I could not answer that."
	}
	if t.proposals != nil {
		ans.Proposals = t.proposals
	}

	ids := make([]string, len(t.proposals))
	for i, p := range t.proposals {
		ids[i] = p.ID
	}
	if err := s.saveTurn(ctx, conv, text, ans, ids); err != nil {
		return Answer{}, err
	}
	return ans, nil
}

// saveTurn appends the member's message and Jessy's answer to the conversation.
func (s *Service) saveTurn(ctx context.Context, conv Conversation, text string, ans Answer, proposalIDs []string) error {
	now := s.now()
	conv.Turns = append(conv.Turns,
		Turn{Role: RoleUser, Content: text, At: now},
		Turn{Role: RoleAssistant, Content: ans.Reply, At: now, ToolCalls: ans.ToolCalls, ProposalIDs: proposalIDs})
	conv.UpdatedAt = now
	return s.store.SaveConversation(ctx, conv)
}

func (s *Service) ownConversation(ctx context.Context, actor iam.Actor, id string) (Conversation, error) {
	if id == "" {
		now := s.now()
		return Conversation{ID: newID("cnv"), OwnerID: actor.UserID, Turns: []Turn{}, CreatedAt: now, UpdatedAt: now}, nil
	}
	c, err := s.store.Conversation(ctx, id)
	if err != nil {
		return Conversation{}, err
	}
	if c.OwnerID != actor.UserID {
		// Another member's conversation looks the same as a missing one.
		return Conversation{}, shared.NotFound("conversation " + id)
	}
	return c, nil
}

// ConversationView is a conversation with the proposals its turns made.
type ConversationView struct {
	Conversation
	Proposals []Proposal `json:"proposals"`
}

// Conversation returns the actor's own conversation.
func (s *Service) Conversation(ctx context.Context, id string) (ConversationView, error) {
	actor := iam.ActorFrom(ctx)
	if actor.IsAnonymous() {
		return ConversationView{}, shared.ErrUnauthenticated
	}
	if id == "" {
		return ConversationView{}, shared.NotFound("conversation")
	}
	c, err := s.ownConversation(ctx, actor, id)
	if err != nil {
		return ConversationView{}, err
	}
	v := ConversationView{Conversation: c, Proposals: []Proposal{}}
	for _, t := range c.Turns {
		for _, pid := range t.ProposalIDs {
			if p, err := s.store.Proposal(ctx, pid); err == nil && !slices.ContainsFunc(v.Proposals, func(q Proposal) bool { return q.ID == pid }) {
				v.Proposals = append(v.Proposals, s.withExpiry(p))
			}
		}
	}
	return v, nil
}

// Confirm runs a pending proposal on the command bus as the confirming actor, so the audit
// log names that member. Only the proposal's owner may confirm it, before it expires.
func (s *Service) Confirm(ctx context.Context, id string) (any, error) {
	actor := iam.ActorFrom(ctx)
	if actor.IsAnonymous() {
		return nil, shared.ErrUnauthenticated
	}
	now := s.now()
	expired := false
	p, err := s.store.UpdateProposal(ctx, id, func(p *Proposal) error {
		if err := decidable(p, actor); err != nil {
			return err
		}
		if now.After(p.ExpiresAt) {
			p.Status, p.DecidedAt, expired = ProposalExpired, &now, true
			return nil
		}
		// Claim it before dispatching, so a second Confirm cannot run the command twice.
		p.Status, p.DecidedAt = ProposalConfirmed, &now
		return nil
	})
	if err != nil {
		return nil, err
	}
	if expired {
		return nil, shared.Rule("This proposal expired. Ask Jessy again.")
	}

	result, err := s.dispatch(ctx, p)
	if err != nil {
		_, _ = s.store.UpdateProposal(ctx, id, func(p *Proposal) error {
			p.Status, p.Error = ProposalFailed, err.Error()
			return nil
		})
		return nil, err
	}
	s.note(ctx, p, "Confirmed: "+p.Summary)
	return result, nil
}

func (s *Service) dispatch(ctx context.Context, p Proposal) (any, error) {
	m, err := s.commands.Decode(p.Command, p.Args)
	if err != nil {
		return nil, err
	}
	if !iam.ActorFrom(ctx).Can(m.Permission()) {
		return nil, shared.ErrForbidden
	}
	return s.commands.Dispatch(ctx, m)
}

// Cancel discards a pending proposal.
func (s *Service) Cancel(ctx context.Context, id string) (Proposal, error) {
	actor := iam.ActorFrom(ctx)
	if actor.IsAnonymous() {
		return Proposal{}, shared.ErrUnauthenticated
	}
	now := s.now()
	p, err := s.store.UpdateProposal(ctx, id, func(p *Proposal) error {
		if err := decidable(p, actor); err != nil {
			return err
		}
		p.Status, p.DecidedAt = ProposalCancelled, &now
		return nil
	})
	if err == nil {
		s.note(ctx, p, "Cancelled: "+p.Summary)
	}
	return p, err
}

// decidable says why the actor may not decide on p, or nil.
func decidable(p *Proposal, actor iam.Actor) error {
	if p.OwnerID != actor.UserID {
		return shared.ErrForbidden
	}
	if p.Status != ProposalPending {
		return shared.Rule("This proposal is already %s.", p.Status)
	}
	return nil
}

// withExpiry reports a pending proposal past its deadline as expired.
func (s *Service) withExpiry(p Proposal) Proposal {
	if p.Status == ProposalPending && s.now().After(p.ExpiresAt) {
		p.Status = ProposalExpired
	}
	return p
}

// note adds a line to the proposal's conversation, so the next turn knows what happened.
func (s *Service) note(ctx context.Context, p Proposal, text string) {
	c, err := s.store.Conversation(ctx, p.ConversationID)
	if err != nil {
		return
	}
	c.Turns = append(c.Turns, Turn{Role: RoleAssistant, Content: text, At: s.now(), ProposalIDs: []string{p.ID}})
	c.UpdatedAt = s.now()
	if err := s.store.SaveConversation(ctx, c); err != nil {
		s.log.Warn("assistant: could not note a proposal decision", "proposal", p.ID, "err", err)
	}
}

func newID(prefix string) string {
	b := make([]byte, 9)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%s-%s", prefix, hex.EncodeToString(b))
}
