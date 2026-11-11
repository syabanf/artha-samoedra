package inquiry

import (
	"errors"
	"strings"
	"testing"

	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

const now = "2026-11-11T02:00:00.000Z"

func ruleMsg(t *testing.T, err error) string {
	t.Helper()
	var r *shared.RuleError
	if !errors.As(err, &r) {
		t.Fatalf("want a rule error, got %v", err)
	}
	return r.Msg
}

func TestSubmitValidatesLikeTheLeadForm(t *testing.T) {
	cases := map[string]Lead{
		"Enter your name.":                         {Name: " A ", Phone: "081234567890"},
		"Enter a full WhatsApp number.":            {Name: "Rizky", Phone: "0812-34"},
		"Keep the message under 2,000 characters.": {Name: "Rizky", Phone: "081234567890", Message: strings.Repeat("x", MaxMessage+1)},
	}
	for want, lead := range cases {
		if _, err := Submit("inq-x", "INQ-26-0013", lead, now); ruleMsg(t, err) != want {
			t.Errorf("want %q, got %v", want, err)
		}
	}
	zero := int64(0)
	if _, err := Submit("inq-x", "INQ-26-0013", Lead{Name: "Rizky", Phone: "081234567890", Budget: &zero}, now); err == nil {
		t.Fatal("a zero budget must be refused")
	}
}

func TestSubmitStartsNewAndUnassigned(t *testing.T) {
	i, err := Submit("inq-x", "INQ-26-0013", Lead{Name: "  Rizky Ananda ", Phone: "+62 812 3456 7890"}, now)
	if err != nil {
		t.Fatal(err)
	}
	if i.Status != New || i.OwnerID != nil || i.Channel != WebChat || i.Name != "Rizky Ananda" || i.Message != "Sent from the website." {
		t.Fatalf("%+v", i)
	}
	if ev := i.PullEvents(); len(ev) != 1 || ev[0].EventName() != "inquiry.submitted" {
		t.Fatalf("events %v", ev)
	}
}

func TestAssignAndSetStatus(t *testing.T) {
	i, _ := Submit("inq-x", "INQ-26-0013", Lead{Name: "Rizky", Phone: "081234567890"}, now)
	i.PullEvents()
	if got := ruleMsg(t, i.Assign(" ", now)); got != "Pick who takes the inquiry." {
		t.Fatal(got)
	}
	if err := i.Assign("usr-2", now); err != nil || *i.OwnerID != "usr-2" {
		t.Fatal(err)
	}
	if got := ruleMsg(t, i.SetStatus("archived", now)); got != "Pick a valid status." {
		t.Fatal(got)
	}
	if err := i.SetStatus(Survey, now); err != nil || i.Status != Survey {
		t.Fatal(err)
	}
	if ev := i.PullEvents(); len(ev) != 2 || ev[1].EventName() != "inquiry.status_changed" {
		t.Fatalf("events %v", ev)
	}
}

func TestNormalizePhone(t *testing.T) {
	if got := NormalizePhone("+62 812-3456"); got != "08123456" {
		t.Fatal(got)
	}
}
