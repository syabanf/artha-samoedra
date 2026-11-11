package assistant

import (
	"context"
	"errors"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// Report topics Jessy can summarise; "overview" is the dashboard: one line per topic the role sees.
var reportTopics = []string{"overview", "sales", "finance", "purchasing", "stock", "people", "listings", "leads"}

var reportPeriods = []string{"this_month", "last_month", "this_quarter"}

type period struct {
	Label    string `json:"label"`
	From, To time.Time
}

func periodFor(name string, now time.Time) period {
	y, m := now.Year(), now.Month()
	switch name {
	case "last_month":
		return period{"last month", time.Date(y, m-1, 1, 0, 0, 0, 0, now.Location()), time.Date(y, m, 1, 0, 0, 0, 0, now.Location())}
	case "this_quarter":
		q := time.Month((int(m)-1)/3*3 + 1)
		return period{"this quarter", time.Date(y, q, 1, 0, 0, 0, 0, now.Location()), time.Date(y, q+3, 1, 0, 0, 0, 0, now.Location())}
	}
	return period{"this month", time.Date(y, m, 1, 0, 0, 0, 0, now.Location()), time.Date(y, m+1, 1, 0, 0, 0, 0, now.Location())}
}

// has reports whether a timestamp or a plain date falls inside the period.
func (p period) has(iso string) bool {
	t, err := time.Parse(time.RFC3339, iso)
	if err != nil {
		if t, err = time.Parse(time.DateOnly, iso); err != nil {
			return false
		}
	}
	return !t.Before(p.From) && t.Before(p.To)
}

// dashboardReport builds the figures for one topic, or for every topic on "overview". A topic the
// member's role cannot read comes back as a note, so the model can say so instead of guessing.
func (s *Service) dashboardReport(ctx context.Context, topic, periodName string) (map[string]any, error) {
	p := periodFor(periodName, s.now())
	topics := []string{topic}
	if topic == "overview" {
		topics = reportTopics[1:]
	}
	out := map[string]any{"period": p.Label}
	for _, t := range topics {
		section, err := s.reportSection(ctx, t, p)
		if errors.Is(err, shared.ErrForbidden) {
			out[t] = "not visible to this member's role"
			continue
		}
		if err != nil {
			return nil, err
		}
		out[t] = section
	}
	return out, nil
}

func (s *Service) reportSection(ctx context.Context, topic string, p period) (map[string]any, error) {
	switch topic {
	case "sales":
		stages, err := s.listAll(ctx, "stages", nil)
		if err != nil {
			return nil, err
		}
		kind := map[string]string{}
		for _, st := range stages {
			kind[strField(st, "id")] = strField(st, "kind")
		}
		deals, err := s.listAll(ctx, "deals", nil)
		if err != nil {
			return nil, err
		}
		var won, wonValue, open, openValue float64
		for _, d := range deals {
			switch kind[strField(d, "stageId")] {
			case "won":
				if p.has(strField(d, "closedAt")) {
					won, wonValue = won+1, wonValue+numField(d, "value")
				}
			case "open":
				open, openValue = open+1, openValue+numField(d, "value")
			}
		}
		return map[string]any{"dealsWon": won, "wonValue": wonValue, "openDeals": open, "pipelineValue": openValue}, nil
	case "finance":
		rep, err := s.overdueInvoices(ctx)
		if err != nil {
			return nil, err
		}
		invoices, err := s.listAll(ctx, "invoices", map[string]string{"status": "issued"})
		if err != nil {
			return nil, err
		}
		var billed float64
		for _, inv := range invoices {
			if p.has(strField(inv, "date")) {
				total, _ := invoiceTotals(inv)
				billed += total
			}
		}
		return map[string]any{"invoicedInPeriod": billed, "overdueInvoices": rep.Count, "overdueBalance": rep.TotalBalance}, nil
	case "purchasing":
		orders, err := s.listAll(ctx, "purchaseOrders", nil)
		if err != nil {
			return nil, err
		}
		open, late := 0, 0
		today := s.now().Format(time.DateOnly)
		for _, o := range orders {
			if st := strField(o, "status"); st == "sent" || st == "partial" {
				open++
				if exp := strField(o, "expectedDate"); exp != "" && exp[:min(10, len(exp))] < today {
					late++
				}
			}
		}
		prs, err := s.listAll(ctx, "purchaseRequests", map[string]string{"status": "pending"})
		if err != nil {
			return nil, err
		}
		return map[string]any{"openOrders": open, "lateOrders": late, "requestsWaitingApproval": len(prs)}, nil
	case "stock":
		low, err := s.lowStock(ctx)
		if err != nil {
			return nil, err
		}
		names := []string{}
		for _, r := range low[:min(5, len(low))] {
			names = append(names, r.Name)
		}
		return map[string]any{"itemsBelowMinimum": len(low), "worst": names}, nil
	case "people":
		staff, err := s.listAll(ctx, "employees", nil)
		if err != nil {
			return nil, err
		}
		headcount := 0
		for _, e := range staff {
			if strField(e, "status") != "left" {
				headcount++
			}
		}
		pending, err := s.listAll(ctx, "hrRequests", map[string]string{"status": "pending"})
		if err != nil {
			return nil, err
		}
		return map[string]any{"headcount": headcount, "requestsWaitingApproval": len(pending)}, nil
	case "listings":
		var stats map[string]any
		if err := s.askInto(ctx, qListingsStats, struct{}{}, &stats); err != nil {
			return nil, err
		}
		return stats, nil
	case "leads":
		inq, err := s.listAll(ctx, "inquiries", nil)
		if err != nil {
			return nil, err
		}
		fresh, byStatus := 0, map[string]int{}
		for _, i := range inq {
			byStatus[strField(i, "status")]++
			if p.has(strField(i, "createdAt")) {
				fresh++
			}
		}
		return map[string]any{"newInPeriod": fresh, "byStatus": byStatus}, nil
	}
	return nil, shared.Rule("Pick a report topic from the list.")
}

func (s *Service) reportTool(ctx context.Context, _ *turn, a map[string]any) (any, string, error) {
	topic, _ := a["topic"].(string)
	per, _ := a["period"].(string)
	rep, err := s.dashboardReport(ctx, topic, per)
	return rep, topic + " report", err
}
