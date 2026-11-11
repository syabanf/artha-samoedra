// Package inquiry is a buyer's question about a listing, from the website, WhatsApp or
// Instagram, as it moves from new to won or lost. The rules and wording match the lead form
// (apps/web/src/site/PublicFormPage.tsx) and the inquiries actions in packages/fixtures/src/store.ts.
package inquiry

import (
	"context"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

type Status string

const (
	New         Status = "new"
	Contacted   Status = "contacted"
	Survey      Status = "survey"
	Negotiation Status = "negotiation"
	Won         Status = "won"
	Lost        Status = "lost"
)

var statusLabel = map[Status]string{New: "New", Contacted: "Contacted", Survey: "Site visit", Negotiation: "Negotiation", Won: "Won", Lost: "Lost"}

func (s Status) Label() string { return statusLabel[s] }

// Channel is where the inquiry came in. The website writes web_chat.
type Channel string

const WebChat Channel = "web_chat"

// MaxMessage caps a public message so the open endpoint cannot store novels.
const MaxMessage = 2000

type Inquiry struct {
	shared.Aggregate
	ID, Code             string
	ListingID            *string
	Name, Phone, Message string
	Channel              Channel
	Budget               *int64
	Status               Status
	OwnerID              *string
	CreatedAt, UpdatedAt string
	Version              int
}

// Lead is what a visitor types into the website form.
type Lead struct {
	Name, Phone, Message string
	ListingID            *string
	Budget               *int64
}

var nonDigit = regexp.MustCompile(`\D`)

// NormalizePhone keeps digits and turns a leading 62 into 0, as normalizePhone in derive.ts does.
func NormalizePhone(phone string) string {
	d := nonDigit.ReplaceAllString(phone, "")
	if strings.HasPrefix(d, "62") {
		d = "0" + d[2:]
	}
	return d
}

func (l Lead) validate() error {
	switch {
	case utf8.RuneCountInString(strings.TrimSpace(l.Name)) < 2:
		return shared.Rule("Enter your name.")
	case len(NormalizePhone(l.Phone)) < 9:
		return shared.Rule("Enter a full WhatsApp number.")
	case l.Budget != nil && *l.Budget <= 0:
		return shared.Rule("Enter a budget, for example 1.5 B or 800 M.")
	case utf8.RuneCountInString(l.Message) > MaxMessage:
		return shared.Rule("Keep the message under 2,000 characters.")
	}
	return nil
}

// Submit records a website lead as a new, unassigned inquiry.
func Submit(id, code string, l Lead, now string) (*Inquiry, error) {
	if err := l.validate(); err != nil {
		return nil, err
	}
	msg := strings.TrimSpace(l.Message)
	if msg == "" {
		msg = "Sent from the website."
	}
	i := &Inquiry{
		ID: id, Code: code, ListingID: l.ListingID, Name: strings.TrimSpace(l.Name), Phone: strings.TrimSpace(l.Phone),
		Message: msg, Channel: WebChat, Budget: l.Budget, Status: New, CreatedAt: now, UpdatedAt: now,
	}
	i.Raise(Submitted{InquiryID: id, ListingID: l.ListingID})
	return i, nil
}

// Assign hands the inquiry to a team member.
func (i *Inquiry) Assign(ownerID, now string) error {
	if strings.TrimSpace(ownerID) == "" {
		return shared.Rule("Pick who takes the inquiry.")
	}
	i.OwnerID, i.UpdatedAt = &ownerID, now
	i.Raise(Assigned{InquiryID: i.ID, OwnerID: ownerID})
	return nil
}

// SetStatus moves the inquiry to any known status, as the frontend reducer allows.
func (i *Inquiry) SetStatus(s Status, now string) error {
	if s.Label() == "" {
		return shared.Rule("Pick a valid status.")
	}
	from := i.Status
	i.Status, i.UpdatedAt = s, now
	i.Raise(StatusChanged{InquiryID: i.ID, From: from, To: s})
	return nil
}

// Repository is the write-side port; infrastructure implements it.
type Repository interface {
	Get(ctx context.Context, id string) (*Inquiry, error)
	Add(ctx context.Context, i *Inquiry) error
	// Save writes the inquiry if nobody changed it since it was read (shared.ErrConflict otherwise).
	Save(ctx context.Context, i *Inquiry) error
	// NextCode returns the next code with the prefix, e.g. "INQ-26-0013".
	NextCode(ctx context.Context, prefix string) (string, error)
}
