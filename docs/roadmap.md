# Roadmap: Mizu and Habitat parity

Goal: every general ERP feature from Mizu (489 pages) and Habitat (285 pages, 276 shared with Mizu) exists in the Artha Samoedra console. Wellness modules come across only where a property version makes sense. Each phase below is one build round: types and store actions first, then pages, then journey tests.

Source paths: Mizu `mizu/frontend/src/app/dashboard/(dashboard)/*`, Habitat `habitat-new-development/apps/web/src/app/dashboard/(dashboard)/*`.

## Done (round 1)

Public property site with Jessy chat, partner listing and delisting by chat, social posts and SEO/GEO blog, exclusive rights with reminders, profit sharing per listing, inquiries, partners, Jessy activity log.

## Phase 1: Settings, IAM and audit (done 2026-10-30)

Built: users, roles with a permission matrix, business and branches, appearance, integrations, messaging, notification rules, API tokens, audit log, view-as. Dev quick login stays on the sign-in page.
- Users: invite, edit, deactivate, reset password, impersonate.
- Roles with per-menu, per-action permissions; the menu tree drives the rail (replaces the fixed 3-role `BY_ROLE`).
- Business structure: company, branches (sales offices), warehouses.
- Appearance: theme tokens and logo, ready for the Artha brand swap.
- Audit log with field-level diffs over every store action.
- Integrations: WA gateway (templates, message log), Instagram, payment gateways, API tokens, notification rules.
- Habitat extras: dev quick login, API docs page.

## Phase 2: CRM and sales funnel (done 2026-10-30)

Built: pipeline board, deals, quotations with approval and a printable booking letter, follow-ups, forecast and targets, pipeline settings, contacts with lead scores and custom fields, accounts, omnichannel inbox, segments, WhatsApp campaigns, lead forms with a public page and attribution, report builder, automations that run on inquiries, stage changes, quotations, overdue tasks and new contacts, referrals.

Original scope:

- Leads (inquiries grow into leads), accounts, contacts, lead scoring, custom fields.
- Deal pipeline kanban with configurable stages, lost reasons, deal members.
- Quotations and booking letters (PDF, send by WA, revise, accept), approvals.
- Tasks, activities timeline, follow-up queue (Habitat).
- Forecast and sales targets per agent.
- Omnichannel inbox (WA, Instagram) with templates.
- Campaigns: WA blast with segments, preview, opt-outs and reports.
- Public lead forms, marketing attribution.
- Report builder with export and scheduled reports; workflow automation rules with run log.
- Adapted from loyalty: referral rewards for buyers and partners.

## Phase 3: Property operations (done 2026-10-30)

Built: projects with a unit availability board, site-visit calendar with clash checks, open houses with a public registration page, booking fee and deposit payments with printable receipts and refunds, agent commission statements, portal syndication matrix, promotions, pages CMS with area guides, buyer portal at /my, partner dashboard, and the new landing page after the Vertex and Elyse Dribbble shots (docs/landing-brief.md).

Original mapping:

| Mizu source | Artha version |
|---|---|
| resort rooms and front office | Unit availability board per project or building |
| resort reservations, gym schedule and bookings | Site-visit scheduler with calendar, agent assignment, check-in, no-show |
| gym and site events | Open house events with registration |
| POS checkout, wallet, receipts | Booking fee and deposit receipts, refunds |
| ticketing channel manager, shop marketplace | Listing syndication to property portals with sync status |
| gym coach incentives, spa commissions | Agent commission statements and payouts (draft, approved, paid) |
| promo campaigns | Featured listing boosts and price promotions |
| member app | Buyer portal (saved properties, inquiry and visit status) and partner dashboard (listings, exclusive expiry, payouts) |
| site CMS | Pages CMS: about, contact, area guides, open house pages |

## Phase 3B: Client module checklist (done 2026-10-30)

All 8 client modules now have their listed features: approval queue at /console/approvals, AI gateway at /console/ai, notification outbox at /console/settings/outbox, buyer qualification and handoff, partner photo upload and review, content formats with approval, calendar and publishing, exclusive contracts with 30/7/1-day reminders and auto-expiry, multi-party profit sharing with settlements and reports. Open items: qualification is stored on the inquiry and Jessy's memory, not yet on the contact; listing photos are data URLs in browser storage until a file store exists.


The client listed 8 modules (3 foundations, 5 core). This maps each to what exists and what Phase 3B adds.

| # | Module | Built so far | Phase 3B adds |
|---|---|---|---|
| 1 | Core data and admin | Listings, partners, buyers (contacts), exclusive contracts, profit sharing, dashboard, roles and auth, listing review, quotation approvals | One approval queue page across listings, quotations, referrals, commission statements and content |
| 2 | AI gateway | Jessy runs as rule engines per flow | One gateway layer all agents call: agent registry, versioned prompts, tool (function) registry mapped to store actions, conversation memory per contact, usage log with tokens, cost and latency, model and provider setting. The mock engine stays behind it until a real model is connected |
| 3 | Notification | In-app bell, WhatsApp templates and log, notification rules | An outbox that dispatches every rule-matched event to WhatsApp, email and push with delivery status, used by inquiries, approvals, exclusive reminders and content |
| 4 | Public website and inquiry agent | Catalogue, detail, filters, Jessy chat that finds listings and captures leads, round-robin assignment | Buyer qualification in the chat (budget, timeline, financing, purpose) saved on the lead and contact, and an explicit handoff message naming the assigned agent |
| 5 | Partner portal and listing agent | Registration and listing by chat, delisting, review queue | Photo upload in the chat, a structured form review step the partner can correct before submitting |
| 6 | Content agent (faceless media and blog) | Social captions, SEO and GEO blog | Reel scripts and carousel slides, a posting calendar, a content approval step, publishing to Instagram, TikTok and Facebook through the integrations |
| 7 | Exclusive rights manager | Contract per listing, period, reminder window, extend and end | Contract number, signed date and document; fixed reminders at 30, 7 and 1 day before expiry sent through the outbox; status changes to expired automatically at the end date |
| 8 | Profit sharing (mini ERP) | Fixed three-way percentage split per listing | Multi-party schemes with percent or fixed amounts, a settlement record created when a deal closes, reports per period and per partner |

## Phase 4: Finance and accounting (done 2026-10-30)

Built under /console/finance with 28 pages. Contract: `docs/phase4-contract.md`.
- **Ledger:** chart of accounts with CSV import and opening balances; journals with draft, post, void and reverse; fiscal years and periods that close in order; a year-end close that moves profit to retained earnings.
- **Auto-journals:** paid booking fees, down payments, deposits, refunds, commission statements and settlements post automatically through editable mappings, and those records link to their journal.
- **Cash and bank:** cash in, cash out, transfers and statement reconciliation.
- **Payables:** vendors, bills and aging. **Receivables:** invoices (buyer, B2B company or partner), receipts, aging, faktur pajak numbering and a printable invoice.
- **Reports:** balance sheet, income statement, cash flow, trial balance, general ledger, changes in equity and budget against actual, all with CSV export and print. Budgets are edited per account per month.

Open items:
- **Faktur pajak:** B2B companies have no NPWP field, so the faktur dialog asks for it each time. Nothing goes out to e-Faktur.
- **Invoice prefill:** prefill from a deal reads commission revenue from account 4-1100. No setting exists for it yet.
- **Print preview:** the invoice print preview has not been checked by hand.
- **Budget view:** in the whole-year budget view, revenue for months still ahead shows as under budget.


## Phase 5: HRIS (done 2026-10-30)

Built under /console/people with 32 routes. Contract: `docs/phase5-contract.md`.
- **People:** employees with profile, contracts and checklists; departments, sections, positions and an org chart; contracts with renewals and an ending-soon alert that Jessy expires on the end date; onboarding and offboarding checklists that gate activation and release.
- **Time:** a daily attendance board with selfie and location check-in, a monthly calendar per employee, a weekly roster, shifts and holidays.
- **Requests:** leave, overtime and loans pass through Manager and HR levels, plus Finance for loans. Leave balances apply. Pending requests also show on /console/approvals.
- **Payroll:** salary components and BPJS settings, monthly runs (calculate, approve, pay) with overtime, unpaid leave, loan installments, BPJS and a PPh 21 estimate. Payslips print, and paying a run posts its net pay to the Finance ledger.
- **Performance:** KPIs per position with weights, quarterly scorecards, and 360 review cycles with self, manager, peer and report reviews.
- **Recruitment:** openings with a pipeline kanban, candidates with tests, interviews and offers, a hire flow into onboarding, and a talent pool.
- **Engagement and reports:** announcements, logbook, recurring department tasks, and HR reports for headcount, turnover, attendance, leave, overtime, payroll cost and KPI scores.

Open items:
- **PPh 21:** it uses the annual progressive brackets as an estimate, not the TER monthly tables.
- **Payslip BPJS:** BPJS shows one employee line and one company line, not each programme.
- **Payroll journal:** it posts net pay only. Tax and BPJS payables are not split out.
- **Headcount report:** it shows today's headcount and does not follow the date range.
- **Browser checks:** a live camera check-in has not been tested, because the browser pane blocks the camera.

## Phase 6: Purchasing, items and inventory (done 2026-10-30)

Built under /console/purchasing with 24 routes. Contract: `docs/phase6-contract.md`. Production, recipes and BOM are left out, since a property business has no manufacturing.
- **Requests:** purchase requests go to the requester's manager, then Finance from Rp 10 million and the Director from Rp 50 million. They show on /console/approvals, and approved requests merge into one order per supplier.
- **Orders:** drafts priced from the supplier's list, sending, shipping and tracking, a late flag, billing received goods into a Finance bill, closing, and a printable purchase order.
- **Receiving:** goods receipts with QC rejections and notes, returns, and vendor credits for billed units sent back, which apply to that supplier's bills.
- **Suppliers:** Finance vendors with performance (on time, rejects, lead days, spend), CSV import, price lists and price history.
- **Inventory:** supply items in four store rooms, an on-hand matrix, issue, adjust, transfer and scrap, a movement log, stock counts with a print sheet, and moving average cost.
- **Ledger:** receipts debit Inventory and credit goods received not invoiced; issues, scrap and count losses go to the category's expense account. The inventory account matches stock at average cost.
- **Reports:** PO summary and detail, supplier performance, stock card, inventory valuation against the ledger, and low stock with suggested reorder.

Open items:
- **Receipt date:** a receipt records the time it is entered. It cannot be backdated.
- **Returns:** a return has no detail page; the order and the returns list show it.
- **Low stock:** the seed holds no item below minimum, so the low stock lists show their empty state in the demo.
- **Approvals in the browser:** the Manager and Finance levels were tested in the store tests, not by signing in as Nadia or Teguh.

## Phase 7: Self-service, public portals and dataroom (done 2026-10-30)

Contract: `docs/phase7-contract.md`.
- **My space** (/console/me, every user with an employee record):
  - Today: check in and out, an optional selfie, leave balances, and what waits for the user.
  - A month attendance calendar.
  - Leave, overtime and loan requests with the approval trail.
  - Payslips from paid runs with print.
  - Scorecards and the 360 reviews the user owes.
  - The team's week of shifts, plus attendance and pending requests for managers.
  - Company news.
- **Careers:**
  - /careers lists open roles. Candidates apply with a CV.
  - Each candidate gets a portal by token: a stage timeline, the tests HR assigned (scored by the store), interview confirmation or a reschedule request, and the offer to accept or decline.
  - HR creates the portal link and assigns tests from the candidate page.
- **Dataroom** (/console/dataroom):
  - A folder tree whose department access passes down to subfolders.
  - Uploads of up to 1 MB, where the same name adds a new version.
  - Moves and a file preview.
  - Folders tied to listings and deals, shown as a Documents card on those records.
- **Share links:**
  - The recipient opens a link at /share/:token with their email and a 6-digit code.
  - Five wrong codes lock it.
  - The link expires within 90 days and can be view only.
  - The log records sends, wrong codes, opens, views, downloads and revokes.

Open items:
- **Check-in location:** it uses the office as the location, so the radius check never blocks a check-in.
- **Seeded files:** they have no content. They show a stand-in preview and download as a text placeholder.
- **Clock:** each page load restarts the demo clock, so events from two tabs can sort out of order in a share log.
- **Dataroom:** folders move only through Edit (change the parent), and files cannot be renamed.
- **Test timer:** it only informs; answers are accepted after time runs out.

## Phase 8: Workspace and AI (done 2026-10-30)

Contract: `docs/phase8-contract.md`.
- **Global search:**
  - ⌘K or Ctrl K opens a palette from any console page. It shows recent searches, page shortcuts and quick commands, with full keyboard control.
  - `/console/search` shows results grouped by kind, with highlighted matches.
  - It ranks 20 kinds of records, from listings to dataroom files, by code, title and words. It ignores case and accents and respects permissions and folder access.
- **Jessy, console assistant:**
  - It opens from the header sheet or `/console/assistant`.
  - It answers from live data, in English or Indonesian: attendance, stock, sales, candidates, approvals, overdue invoices, exclusive rights and leave.
  - Changes come as a proposal the member confirms: a purchase request, an approval or rejection, a check-in, an announcement, or a deal follow-up. They run as the member, so the audit log names them, and every turn is logged in the AI gateway.
- **Desktop (`/console/os`):**
  - Module windows you can drag, resize, minimize, maximize and snap, plus a dock, a top bar and app menus.
  - Notes, a calculator, a calendar and Jessy built in.
  - The layout is saved per user.
  - Phones get a launcher grid. Framed pages use the console's `?embed=1` mode.

Open items:
- **Framed pages:** each runs its own copy of the app, so a change in one frame shows in another only after it reloads.
- **Windows:** one window per app, and no keyboard shortcuts to move or resize windows.
- **Jessy matching:** it uses rule-based word matching. An LLM engine can replace `consoleTurn` behind the same Turn shape.
- **Check-in from chat:** it sends no photo or location.

## Left out

Gym classes and HYROX, spa treatments, POS cashier, kitchen display and tables, ticketing gates and wristbands, retail shop and wholesale, photobooth, CRM gamification (XP, badges, avatars, wallpapers).
