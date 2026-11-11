package assistant

import (
	"strings"
	"testing"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
)

type catalog []cqrs.Descriptor

func (c catalog) Catalog() []cqrs.Descriptor { return c }

func TestCheckFieldsNamesTheFieldsACommandTakes(t *testing.T) {
	bus := catalog{{Name: "listings.approve", Fields: []string{"id"}}}
	err := checkFields(bus, "listings.approve", map[string]any{"code": "AS-0013"})
	if err == nil || !strings.Contains(err.Error(), "does not take code. Its fields are: id.") {
		t.Fatalf("unknown field: %v", err)
	}
	if err := checkFields(bus, "listings.approve", map[string]any{}); err == nil || !strings.Contains(err.Error(), "needs id") {
		t.Fatalf("missing id: %v", err)
	}
	if err := checkFields(bus, "listings.approve", map[string]any{"id": "lst-13"}); err != nil {
		t.Fatalf("valid args refused: %v", err)
	}
}
