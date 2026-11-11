package assistant

import (
	"context"
	"slices"
	"sync"

	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// MemoryStore keeps conversations and proposals in process memory. They vanish on restart,
// which only costs members their chat history and any unconfirmed proposals.
type MemoryStore struct {
	mu            sync.Mutex
	conversations map[string]Conversation
	proposals     map[string]Proposal
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{conversations: map[string]Conversation{}, proposals: map[string]Proposal{}}
}

func (m *MemoryStore) Conversation(_ context.Context, id string) (Conversation, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.conversations[id]
	if !ok {
		return Conversation{}, shared.NotFound("conversation " + id)
	}
	c.Turns = slices.Clone(c.Turns)
	return c, nil
}

func (m *MemoryStore) SaveConversation(_ context.Context, c Conversation) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	c.Turns = slices.Clone(c.Turns)
	m.conversations[c.ID] = c
	return nil
}

func (m *MemoryStore) AddProposal(_ context.Context, p Proposal) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.proposals[p.ID] = p
	return nil
}

func (m *MemoryStore) Proposal(_ context.Context, id string) (Proposal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.proposals[id]
	if !ok {
		return Proposal{}, shared.NotFound("proposal " + id)
	}
	return p, nil
}

func (m *MemoryStore) UpdateProposal(_ context.Context, id string, fn func(*Proposal) error) (Proposal, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	p, ok := m.proposals[id]
	if !ok {
		return Proposal{}, shared.NotFound("proposal " + id)
	}
	if err := fn(&p); err != nil {
		return Proposal{}, err
	}
	m.proposals[id] = p
	return p, nil
}
