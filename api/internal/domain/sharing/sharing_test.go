package sharing

import "testing"

func TestDefaultSplitsSeventyThirty(t *testing.T) {
	s := Default("psh-x", "lst-13")
	if s.CommissionPct != 2.5 || s.CommissionMode != "percent" || len(s.Parties) != 2 {
		t.Fatalf("%+v", s)
	}
	total := 0.0
	for _, p := range s.Parties {
		total += p.Value
	}
	if total != 100 || s.Parties[0].Kind != "company" || s.Parties[1].Kind != "agent" {
		t.Fatalf("%+v", s.Parties)
	}
}
