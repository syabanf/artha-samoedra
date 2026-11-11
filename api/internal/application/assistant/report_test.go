package assistant

import (
	"strings"
	"testing"
	"time"
)

func TestPeriodsCoverTheRightDays(t *testing.T) {
	now := time.Date(2026, 11, 11, 9, 0, 0, 0, time.UTC)
	cases := map[string][2]string{
		"this_month":   {"2026-11-01", "2026-12-01"},
		"last_month":   {"2026-10-01", "2026-11-01"},
		"this_quarter": {"2026-10-01", "2027-01-01"},
		"":             {"2026-11-01", "2026-12-01"},
	}
	for name, want := range cases {
		p := periodFor(name, now)
		if p.From.Format(time.DateOnly) != want[0] || p.To.Format(time.DateOnly) != want[1] {
			t.Errorf("%q: %s to %s", name, p.From.Format(time.DateOnly), p.To.Format(time.DateOnly))
		}
	}
	last := periodFor("last_month", now)
	if !last.has("2026-10-30T02:00:00.000Z") || !last.has("2026-10-01") || last.has("2026-11-01T00:00:00Z") {
		t.Fatal("last month should hold 30 October and 1 October, not 1 November")
	}
}

func TestGuardSendsAdviceToAReport(t *testing.T) {
	for _, text := range []string{"kasih tips jualan rumah dong", "bagaimana cara meningkatkan penjualan?", "what strategy should we use next quarter"} {
		if got := guard(text); !strings.Contains(got, "report") && !strings.Contains(got, "laporan") {
			t.Errorf("%q: got %q", text, got)
		}
	}
	if got := guard("laporan penjualan bulan lalu"); got != "" {
		t.Errorf("a report request must pass, got %q", got)
	}
}
