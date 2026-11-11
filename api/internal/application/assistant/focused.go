package assistant

import (
	"cmp"
	"context"
	"fmt"
	"math"
	"slices"
	"strconv"
	"strings"
	"time"
)

// The focused tools answer common console questions in one call. They read raw records through
// records.list and apply the same rules as the frontend fixtures (hr.ts, purchasing.ts,
// finance.ts), so Jessy and the console agree on who is late or what is overdue.

type leaveRow struct {
	EmployeeID string `json:"employeeId"`
	Name       string `json:"name"`
	Type       string `json:"type"`
	From       string `json:"from"`
	To         string `json:"to"`
}

type lateRow struct {
	EmployeeID  string `json:"employeeId"`
	Name        string `json:"name"`
	CheckIn     string `json:"checkIn"`
	ShiftStart  string `json:"shiftStart"`
	MinutesLate int    `json:"minutesLate"`
}

type attendanceReport struct {
	Date    string     `json:"date"`
	OnLeave []leaveRow `json:"onLeave"`
	Late    []lateRow  `json:"late"`
}

// attendanceOn lists approved leave covering date and check-ins later than the shift start
// plus the grace minutes in hrSettings.
func (s *Service) attendanceOn(ctx context.Context, date string) (attendanceReport, error) {
	rep := attendanceReport{Date: date, OnLeave: []leaveRow{}, Late: []lateRow{}}
	day, err := time.ParseInLocation(time.DateOnly, date, s.loc)
	if err != nil {
		return rep, fmt.Errorf("date must look like 2026-11-11")
	}
	employees, err := s.listAll(ctx, "employees", nil)
	if err != nil {
		return rep, err
	}
	names := map[string]string{}
	shiftOf := map[string]string{}
	for _, e := range employees {
		names[strField(e, "id")] = strField(e, "name")
		shiftOf[strField(e, "id")] = strField(e, "shiftId")
	}

	leaves, err := s.listAll(ctx, "hrRequests", map[string]string{"kind": "leave", "status": "approved"})
	if err != nil {
		return rep, err
	}
	onLeave := map[string]bool{}
	for _, r := range leaves {
		lv, _ := r["leave"].(map[string]any)
		from, _ := lv["from"].(string)
		to, _ := lv["to"].(string)
		if from == "" || from > date || to < date {
			continue
		}
		id := strField(r, "employeeId")
		onLeave[id] = true
		typ, _ := lv["type"].(string)
		rep.OnLeave = append(rep.OnLeave, leaveRow{EmployeeID: id, Name: names[id], Type: typ, From: from, To: to})
	}

	rows, err := s.listAll(ctx, "attendance", map[string]string{"date": date})
	if err != nil {
		return rep, err
	}
	if len(rows) == 0 {
		return rep, nil
	}
	shiftList, err := s.listAll(ctx, "shifts", nil)
	if err != nil {
		return rep, err
	}
	shifts := map[string]record{}
	for _, sh := range shiftList {
		shifts[strField(sh, "id")] = sh
	}
	overrides, err := s.listAll(ctx, "scheduleOverrides", map[string]string{"date": date})
	if err != nil {
		return rep, err
	}
	for _, o := range overrides {
		shiftOf[strField(o, "employeeId")] = strField(o, "shiftId")
	}
	holidays, err := s.listAll(ctx, "holidays", map[string]string{"date": date})
	if err != nil {
		return rep, err
	}
	var hr record
	if err := s.askInto(ctx, qSettingsGet, map[string]string{"name": "hrSettings"}, &hr); err != nil {
		return rep, err
	}
	grace := int(numField(hr, "lateGraceMinutes"))
	overridden := map[string]bool{}
	for _, o := range overrides {
		overridden[strField(o, "employeeId")] = true
	}

	for _, a := range rows {
		id := strField(a, "employeeId")
		in, err := time.Parse(time.RFC3339, strField(a, "checkIn"))
		if err != nil || onLeave[id] {
			continue
		}
		sh, ok := shifts[shiftOf[id]]
		if !ok || (!overridden[id] && (len(holidays) > 0 || !worksOn(sh, day.Weekday()))) {
			continue
		}
		start := clockMinutes(strField(sh, "start"))
		local := in.In(s.loc)
		late := local.Hour()*60 + local.Minute() - start - grace
		if start < 0 || late <= 0 {
			continue
		}
		rep.Late = append(rep.Late, lateRow{EmployeeID: id, Name: names[id], CheckIn: local.Format("15:04"), ShiftStart: strField(sh, "start"), MinutesLate: late})
	}
	slices.SortFunc(rep.Late, func(a, b lateRow) int { return b.MinutesLate - a.MinutesLate })
	return rep, nil
}

func worksOn(shift record, wd time.Weekday) bool {
	days, _ := shift["days"].([]any)
	for _, d := range days {
		if f, ok := d.(float64); ok && int(f) == int(wd) {
			return true
		}
	}
	return false
}

// clockMinutes turns "08:30" into 510, or -1 when the text is not a clock time.
func clockMinutes(hhmm string) int {
	h, m, ok := strings.Cut(hhmm, ":")
	hi, err1 := strconv.Atoi(h)
	mi, err2 := strconv.Atoi(m)
	if !ok || err1 != nil || err2 != nil {
		return -1
	}
	return hi*60 + mi
}

type lowStockRow struct {
	ItemID   string  `json:"itemId"`
	SKU      string  `json:"sku"`
	Name     string  `json:"name"`
	OnHand   float64 `json:"onHand"`
	MinStock float64 `json:"minStock"`
	Short    float64 `json:"short"`
	Reorder  float64 `json:"reorderQty"`
}

// lowStock lists active items whose quantity on hand, summed over every warehouse, is below
// their minimum. Transfers between warehouses cancel out in that sum.
func (s *Service) lowStock(ctx context.Context) ([]lowStockRow, error) {
	items, err := s.listAll(ctx, "items", nil)
	if err != nil {
		return nil, err
	}
	moves, err := s.listAll(ctx, "stockMoves", nil)
	if err != nil {
		return nil, err
	}
	onHand := map[string]float64{}
	for _, m := range moves {
		onHand[strField(m, "itemId")] += numField(m, "qty")
	}
	out := []lowStockRow{}
	for _, it := range items {
		id := strField(it, "id")
		minimum := numField(it, "minStock")
		if !boolField(it, "active") || onHand[id] >= minimum {
			continue
		}
		out = append(out, lowStockRow{ItemID: id, SKU: strField(it, "sku"), Name: strField(it, "name"),
			OnHand: onHand[id], MinStock: minimum, Short: minimum - onHand[id], Reorder: numField(it, "reorderQty")})
	}
	// Worst first, by the share of the minimum that is missing.
	slices.SortFunc(out, func(a, b lowStockRow) int {
		return cmp.Compare(b.Short/math.Max(1, b.MinStock), a.Short/math.Max(1, a.MinStock))
	})
	return out, nil
}

type overdueRow struct {
	InvoiceID   string  `json:"invoiceId"`
	Code        string  `json:"code"`
	CustomerID  string  `json:"customerId"`
	DueDate     string  `json:"dueDate"`
	DaysOverdue int     `json:"daysOverdue"`
	Total       float64 `json:"total"`
	Paid        float64 `json:"paid"`
	Balance     float64 `json:"balance"`
}

type overdueReport struct {
	Count        int          `json:"count"`
	TotalBalance float64      `json:"totalBalance"`
	Invoices     []overdueRow `json:"invoices"`
}

// overdueInvoices lists issued invoices with a balance left after their due date.
func (s *Service) overdueInvoices(ctx context.Context) (overdueReport, error) {
	rep := overdueReport{Invoices: []overdueRow{}}
	invoices, err := s.listAll(ctx, "invoices", map[string]string{"status": "issued"})
	if err != nil {
		return rep, err
	}
	now := s.now()
	for _, inv := range invoices {
		due, err := time.Parse(time.RFC3339, strField(inv, "dueDate"))
		if err != nil || !due.Before(now) {
			continue
		}
		total, paid := invoiceTotals(inv)
		if total-paid <= 0 {
			continue
		}
		rep.Invoices = append(rep.Invoices, overdueRow{InvoiceID: strField(inv, "id"), Code: strField(inv, "code"),
			CustomerID: strField(inv, "customerId"), DueDate: due.In(s.loc).Format(time.DateOnly),
			DaysOverdue: int(now.Sub(due).Hours() / 24), Total: total, Paid: paid, Balance: total - paid})
		rep.TotalBalance += total - paid
	}
	slices.SortFunc(rep.Invoices, func(a, b overdueRow) int { return b.DaysOverdue - a.DaysOverdue })
	rep.Count = len(rep.Invoices)
	return rep, nil
}

// invoiceTotals follows documentTotals in finance.ts: tax rounds on the subtotal.
func invoiceTotals(inv record) (total, paid float64) {
	var subtotal float64
	lines, _ := inv["lines"].([]any)
	for _, l := range lines {
		if m, ok := l.(map[string]any); ok {
			subtotal += numField(m, "qty") * numField(m, "unitPrice")
		}
	}
	receipts, _ := inv["receipts"].([]any)
	for _, r := range receipts {
		if m, ok := r.(map[string]any); ok {
			paid += numField(m, "amount")
		}
	}
	return subtotal + math.Round(subtotal*numField(inv, "taxPct")/100), paid
}
