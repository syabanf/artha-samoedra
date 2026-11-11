package exclusive

import "testing"

func TestEndStopsARunningRight(t *testing.T) {
	r := &Right{ID: "exc-1", ListingID: "lst-1", Status: "active"}
	if !r.Running() {
		t.Fatal("a right without endedAt runs")
	}
	r.End("2026-11-11T02:00:00.000Z")
	if r.Running() || r.Status != "ended" {
		t.Fatalf("%+v", r)
	}
}
