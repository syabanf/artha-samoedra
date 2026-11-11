package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/syabanf/artha-samoedra/api/internal/application/cqrs"
	"github.com/syabanf/artha-samoedra/api/internal/domain/iam"
	"github.com/syabanf/artha-samoedra/api/internal/domain/shared"
)

// collections the model may name. The query bus still checks the member's permission on each.
var collections = []string{
	"listings", "partners", "exclusives", "profitShares", "inquiries", "socialPosts", "blogPosts",
	"users", "roles", "branches", "contacts", "accounts", "stages", "deals", "quotations", "tasks",
	"activities", "targets", "campaigns", "referrals", "projects", "units", "visits", "openHouses",
	"payments", "statements", "promotions", "glAccounts", "journals", "cashTransactions", "vendors",
	"bills", "invoices", "budgets", "departments", "positions", "employees", "contracts", "shifts",
	"holidays", "attendance", "hrRequests", "payrollRuns", "kpis", "reviews", "jobOpenings",
	"candidates", "announcements", "logbook", "items", "warehouses", "stockMoves", "stockCounts",
	"purchaseRequests", "purchaseOrders", "goodsReceipts", "vendorPrices", "aiAgents", "aiPrompts", "audit",
	"itemCategories", "uoms", "scheduleOverrides", "sections", "fiscalYears", "periods", "purchaseReturns",
	"vendorCredits", "messages", "conversations", "segments", "leadForms", "templates", "scorecards",
	"reviewCycles", "recurringTasks", "checklists", "settlements",
}

var settingNames = []string{
	"settings", "company", "appearance", "crmSettings", "aiSettings", "financeSettings",
	"payrollSettings", "hrSettings", "purchasingSettings",
}

// turn is the state of one member message while the tool loop runs.
type turn struct {
	actor     iam.Actor
	convID    string
	proposals []Proposal
}

type toolRun func(ctx context.Context, t *turn, args map[string]any) (result any, summary string, err error)

type tool struct {
	spec Tool
	run  toolRun
}

// argError is a tool argument the schema refused; the model gets the reason and may retry.
type argError struct{ msg string }

func (e argError) Error() string { return e.msg }

// tools returns the tool set for one actor. propose_command lists only the commands the actor
// may run, so its name enum doubles as a permission filter.
func (s *Service) tools(actor iam.Actor) []tool {
	ts := []tool{
		{Tool{"search_records", "Search one collection of the console store. Returns {total, items}. Use where for exact field matches and q for free text.",
			object([]string{"collection"}, map[string]*Schema{
				"collection": str("Collection to search.", collections...),
				"q":          str("Free text to match."),
				"where":      {Type: "object", Description: "Exact matches on top-level fields, e.g. {\"status\":\"issued\"}.", AdditionalProperties: str("")},
				"sort":       str("Field to sort by; prefix with - for descending, e.g. -createdAt."),
				"limit":      integer("Records to return, 10 by default.", 1, 50),
				"offset":     integer("Records to skip, for paging.", 0, maxScan),
				"fields":     {Type: "array", Description: "Only return these fields of each record, to keep the answer small.", Items: str("")},
			})}, s.searchRecords},
		{Tool{"get_record", "Read one record by id.",
			object([]string{"collection", "id"}, map[string]*Schema{
				"collection": str("Collection of the record.", collections...),
				"id":         str("Record id, e.g. inv-4."),
			})}, s.getRecord},
		{Tool{"get_settings", "Read one settings document, such as company details or HR rules.",
			object([]string{"name"}, map[string]*Schema{"name": str("Settings document.", settingNames...)})}, s.getSettings},
		{Tool{"listing_stats", "Counts of property listings by status, for the listings overview.", object(nil, nil)}, s.listingStats},
		{Tool{"attendance_today", "Who is on approved leave and who checked in late on a day, today by default.",
			object(nil, map[string]*Schema{"date": str("Day as YYYY-MM-DD. Leave empty for today.")})}, s.attendanceTool},
		{Tool{"low_stock", "Active inventory items below their minimum stock, summed over every warehouse, worst first.", object(nil, nil)}, s.lowStockTool},
		{Tool{"overdue_invoices", "Issued invoices past their due date with a balance left, oldest first.", object(nil, nil)}, s.overdueTool},
		{Tool{"dashboard_report", "Figures for a report: one topic, or overview for the whole dashboard. Use it first for any report, summary or recap request.",
			object([]string{"topic"}, map[string]*Schema{
				"topic":  str("Report topic.", reportTopics...),
				"period": str("Period for sales, finance and leads. Defaults to this month.", reportPeriods...),
			})}, s.reportTool},
	}
	var names, usage []string
	for _, d := range s.commands.Catalog() {
		if actor.Can(d.Permission) {
			names = append(names, d.Name)
			usage = append(usage, fmt.Sprintf("%s {%s}", d.Name, strings.Join(d.Fields, ", ")))
		}
	}
	if len(names) > 0 {
		ts = append(ts, tool{Tool{"propose_command",
			"Propose a change for the member to confirm. Nothing runs until the member presses Confirm. Describe the change in summary, in the member's language. " +
				"Pass record ids (such as lst-13), never codes; look the id up with search_records first. Commands and their argument fields: " + strings.Join(usage, "; "),
			object([]string{"name", "summary"}, map[string]*Schema{
				"name":    str("Command to run.", names...),
				"args":    {Type: "object", Description: "Command arguments, e.g. {\"id\":\"lst-12\"}.", AdditionalProperties: &Schema{}},
				"summary": str("One sentence saying exactly what will happen."),
			})}, s.proposeCommand})
	}
	return ts
}

// runTool validates the arguments, runs the tool and returns the text for the model plus a
// short summary for the member. Errors become text, so the model can explain or retry.
func (s *Service) runTool(ctx context.Context, t *turn, ts []tool, call ToolCall) (content, summary string) {
	var found *tool
	for i := range ts {
		if ts[i].spec.Name == call.Name {
			found = &ts[i]
			break
		}
	}
	if found == nil {
		return fmt.Sprintf("Error: there is no tool named %q.", call.Name), "unknown tool"
	}
	args, err := parseArgs(found.spec.Parameters, call.Arguments)
	if err != nil {
		err = argError{err.Error()}
	} else {
		var res any
		res, summary, err = found.run(ctx, t, args)
		if err == nil {
			return encodeResult(res), summary
		}
	}
	return s.describeError(call.Name, err)
}

func (s *Service) describeError(name string, err error) (content, summary string) {
	var rule *shared.RuleError
	var bad argError
	switch {
	case errors.As(err, &bad):
		return "Invalid arguments: " + bad.msg + ". Fix them and call the tool again.", "invalid arguments"
	case errors.Is(err, shared.ErrForbidden):
		return "Refused: the member's role does not have permission for this. Tell the member; do not guess the data.", "forbidden"
	case errors.Is(err, shared.ErrUnauthenticated):
		return "Refused: nobody is signed in.", "unauthenticated"
	case errors.As(err, &rule):
		return "Refused: " + rule.Msg, "refused"
	case errors.Is(err, shared.ErrNotFound):
		return "Not found: " + err.Error(), "not found"
	}
	s.log.Error("assistant tool failed", "tool", name, "err", err)
	return "Error: the tool failed. Tell the member this data is unavailable right now.", "failed"
}

func (s *Service) searchRecords(ctx context.Context, _ *turn, a map[string]any) (any, string, error) {
	la := listArgs{Collection: a["collection"].(string), Limit: 10}
	la.Q, _ = a["q"].(string)
	la.Sort, _ = a["sort"].(string)
	if n, ok := a["limit"].(int); ok {
		la.Limit = n
	}
	la.Offset, _ = a["offset"].(int)
	if w, ok := a["where"].(map[string]any); ok && len(w) > 0 {
		la.Where = map[string]string{}
		for k, v := range w {
			la.Where[k] = v.(string)
		}
	}
	p, err := s.list(ctx, la)
	if err != nil {
		return nil, "", err
	}
	if fs, ok := a["fields"].([]any); ok && len(fs) > 0 {
		for i, it := range p.Items {
			kept := record{"id": it["id"]}
			for _, f := range fs {
				if v, ok := it[f.(string)]; ok {
					kept[f.(string)] = v
				}
			}
			p.Items[i] = kept
		}
	}
	res := map[string]any{"collection": la.Collection, "total": p.Total, "offset": la.Offset, "items": p.Items}
	if p.Total == 0 && len(la.Where) > 0 {
		// A filter that matches nothing is often a wrong value ("live" for "active"); show the real ones.
		if seen := s.valuesSeen(ctx, la); len(seen) > 0 {
			res["hint"] = "No record matched the where filter. Values that exist: " + strings.Join(seen, "; ")
		}
	}
	return res, fmt.Sprintf("%d of %d %s", len(p.Items), p.Total, la.Collection), nil
}

// valuesSeen lists, per filtered field, the distinct values the collection holds (up to 12 each).
func (s *Service) valuesSeen(ctx context.Context, la listArgs) []string {
	all, err := s.list(ctx, listArgs{Collection: la.Collection, Limit: 200})
	if err != nil {
		return nil
	}
	var out []string
	for field := range la.Where {
		set := map[string]bool{}
		var vals []string
		for _, it := range all.Items {
			v := fmt.Sprint(it[field])
			if it[field] != nil && !set[v] && len(vals) < 12 {
				set[v] = true
				vals = append(vals, v)
			}
		}
		if len(vals) > 0 {
			sort.Strings(vals)
			out = append(out, field+": "+strings.Join(vals, ", "))
		}
	}
	return out
}

// checkFields refuses arguments the command does not take, naming the ones it does, because
// JSON decoding would otherwise drop them silently and the command would fail only on Confirm.
func checkFields(bus interface{ Catalog() []cqrs.Descriptor }, name string, args any) error {
	given, _ := args.(map[string]any)
	for _, d := range bus.Catalog() {
		if d.Name != name {
			continue
		}
		known := map[string]bool{}
		for _, f := range d.Fields {
			known[f] = true
		}
		var unknown []string
		for k := range given {
			if !known[k] {
				unknown = append(unknown, k)
			}
		}
		if len(unknown) > 0 {
			sort.Strings(unknown)
			return argError{fmt.Sprintf("%s does not take %s. Its fields are: %s.", name, strings.Join(unknown, ", "), strings.Join(d.Fields, ", "))}
		}
		if known["id"] && given["id"] == nil {
			return argError{name + " needs id, the record id such as lst-13. Look it up with search_records."}
		}
		return nil
	}
	return nil
}

func (s *Service) getRecord(ctx context.Context, _ *turn, a map[string]any) (any, string, error) {
	c, id := a["collection"].(string), a["id"].(string)
	r, err := s.get(ctx, c, id)
	return r, c + " " + id, err
}

func (s *Service) getSettings(ctx context.Context, _ *turn, a map[string]any) (any, string, error) {
	name := a["name"].(string)
	res, err := s.ask(ctx, qSettingsGet, map[string]string{"name": name})
	return res, name, err
}

func (s *Service) listingStats(ctx context.Context, _ *turn, _ map[string]any) (any, string, error) {
	res, err := s.ask(ctx, qListingsStats, nil)
	return res, "listing counts", err
}

func (s *Service) attendanceTool(ctx context.Context, _ *turn, a map[string]any) (any, string, error) {
	date, _ := a["date"].(string)
	if date == "" {
		date = s.now().In(s.loc).Format(time.DateOnly)
	}
	if _, err := time.Parse(time.DateOnly, date); err != nil {
		return nil, "", argError{"date must look like 2026-11-11"}
	}
	rep, err := s.attendanceOn(ctx, date)
	return rep, fmt.Sprintf("%s: %d on leave, %d late", date, len(rep.OnLeave), len(rep.Late)), err
}

func (s *Service) lowStockTool(ctx context.Context, _ *turn, _ map[string]any) (any, string, error) {
	rows, err := s.lowStock(ctx)
	return map[string]any{"count": len(rows), "items": rows}, fmt.Sprintf("%d items below minimum", len(rows)), err
}

func (s *Service) overdueTool(ctx context.Context, _ *turn, _ map[string]any) (any, string, error) {
	rep, err := s.overdueInvoices(ctx)
	return rep, fmt.Sprintf("%d overdue invoices", rep.Count), err
}

// proposeCommand stores a pending proposal. It checks that the command exists, that its
// arguments decode and that the actor may run it, but it never dispatches.
func (s *Service) proposeCommand(ctx context.Context, t *turn, a map[string]any) (any, string, error) {
	name := a["name"].(string)
	args := a["args"]
	if args == nil {
		args = map[string]any{}
	}
	raw, err := json.Marshal(args)
	if err != nil {
		return nil, "", argError{err.Error()}
	}
	if err := checkFields(s.commands, name, args); err != nil {
		return nil, "", err
	}
	m, err := s.commands.Decode(name, raw)
	if err != nil {
		var rule *shared.RuleError
		if errors.As(err, &rule) || errors.Is(err, shared.ErrNotFound) {
			return nil, "", argError{err.Error()}
		}
		return nil, "", err
	}
	// Check the decoded message: a command's permission may depend on its arguments.
	if !t.actor.Can(m.Permission()) {
		return nil, "", shared.ErrForbidden
	}
	now := s.now()
	p := Proposal{
		ID: newID("prp"), ConversationID: t.convID, OwnerID: t.actor.UserID, Command: name, Args: raw,
		Summary: strings.TrimSpace(a["summary"].(string)), Status: ProposalPending, CreatedAt: now, ExpiresAt: now.Add(s.proposalTTL),
	}
	if err := s.store.AddProposal(ctx, p); err != nil {
		return nil, "", err
	}
	t.proposals = append(t.proposals, p)
	return map[string]any{
		"proposalId": p.ID, "status": "waiting for the member to press Confirm",
		"expiresInMinutes": int(s.proposalTTL.Minutes()),
	}, "proposed " + name, nil
}
