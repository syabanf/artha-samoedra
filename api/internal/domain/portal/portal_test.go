package portal

import "testing"

func TestRemoveOnlyOnce(t *testing.T) {
	s := &Sync{ID: "syn-1", Status: "live"}
	if !s.Remove() || s.Status != Removed {
		t.Fatalf("%+v", s)
	}
	if s.Remove() {
		t.Fatal("second remove must report no change")
	}
}
