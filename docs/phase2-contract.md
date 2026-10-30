# Phase 2 page contract: CRM and sales funnel

The store, types, rules and routes exist. This file tells page builders what to build and what they can rely on. Read `docs/frontend-conventions.md` first.

## What exists

- Types: `packages/types/src/crm.ts` (Contact, Account, DealStage, Deal, Quotation, CrmTask, Activity, SalesTarget, Conversation, Segment, Campaign, LeadForm, WorkflowRule, SavedReport, Referral, and every `*_LABEL` map).
- Store slice and rules: `packages/fixtures/src/crm.ts`. Actions are the `CrmAction` union there. Read it before writing a page. Useful exports: `stageOf`, `isOpenDeal`, `netPrice`, `needsApproval`, `APPROVAL_DISCOUNT_PCT`, `contactByPhone`, `refLabel`, `leadScore`, `temperature`, `segmentMembers`, `followUpBucket`, `forecast`, `REPORT_GROUPS`, `runReport`, `dealMoveBlocker`, `stageRemoveBlocker`, `campaignSendBlocker`.
- State keys: `contacts, accounts, stages, deals, quotations, tasks, activities, targets, conversations, segments, campaigns, leadForms, workflows, reports, referrals, crmSettings` plus the earlier ones (`listings, inquiries, partners, users, templates, integrations, messages`, …).
- Journey tests in `packages/fixtures/src/crm.test.ts` show each flow end to end.
- Paths: `apps/web/src/components/links.tsx` (`paths.deal(id)`, `paths.contact(id)`, …). Build links only through `paths`.
- Routes are registered in `apps/web/src/router.tsx` with the file and export names below. Do not edit the router.

## Hooks and helpers

- `useAppState()` → `{ state, dispatch }`; `useScoped()` → `{ state, maps, partnerName, listingCode, actorName }` (`apps/web/src/state/store.tsx`).
- `useAuth().can('deal.manage')` and `useUser()` (`apps/web/src/auth/auth.tsx`). Permission keys: `deal.view, deal.manage, deal.approve, target.manage, crm.view, crm.manage, campaign.manage, automation.manage, report.view, referral.manage`.
- `useAct()` from `apps/web/src/console/dialogs.tsx`: `act(action, successToast, description)` dispatches as the user, shows the success toast, or a danger toast with the store's blocker sentence. Returns `true` on success.
- `useNow()` for the ticking app clock; `nowIso()`, `newId(prefix)`, `addDays`, `fmtIdr`, `fmtIdrShort`, `fmtDate`, `fmtDateTime`, `fmtAgo`, `fmtPercent`, `countBy`, `normalizePhone` from `@artha/fixtures`.
- Kit (`@artha/ui`): Button, Card/CardHeader/CardTitle/CardContent, Badge (+`BadgeVariant`), CountBadge, IconTile, StatCard, PageHeader, Kicker, KeyValue, EmptyState, Banner, ProgressBar, DataTable (+`Column`), Chip, ChipRow, Input, Textarea, NativeSelect, FormField, Switch, Checkbox, PillTabs, Dialog, DialogFooter, Sheet, toast.
- `BackButton` (`components/BackButton.tsx`), `CodeLink` (`components/links.tsx`), `ListingVisual`.

## Copy these pages for shape

- List page with stat tiles, chips with counts, URL filters, search, DataTable: `console/pages/ListingsPage.tsx`, `console/settings/UsersPages.tsx`.
- Detail page with Back, primary next step, ink hero card, KeyValue, history: `console/pages/ListingDetailPage.tsx`.
- Entity dialog with a form mounted only while open, errors after the first submit: `console/dialogs.tsx` (ListingForm), `console/settings/UsersPages.tsx` (UserForm).
- Card-grid pages: `console/settings/ServicePages.tsx`.

## Rules every page follows

- English copy, plain words, no em dashes. Exactly one `h1` per page (PageHeader renders it).
- Every data table has filters: search plus chips with counts or an inline NativeSelect, a "N of M" caption with "Clear filters", and a filtered empty state. Small fixed tables of 8 rows or fewer are exempt.
- Every mutation goes through `useAct` and ends in a toast. A refused action shows the blocker sentence: beside a disabled button as `title`, in a Card note, or the danger toast.
- Hide actions the user's role lacks (`can(...)`). Never disable for a permission. A page that needs a permission beyond `deal.view`/`crm.view` renders a Card with an EmptyState "You don't have access to this page" when the user lacks it.
- Status badges: a `Record<Status, BadgeVariant>` map in your own file. Do not edit `components/badges.tsx`.
- Colours only through tokens (`bg-accent`, `text-muted`, `bg-success-soft` …). No hex in class names.
- Every record has a detail route where one is listed; Back returns to the list.
- Phone width 375 px must not scroll sideways: use `min-w-0`, `truncate`, `hideBelow` on table columns, `flex-wrap` on button rows.
- Only touch the files assigned to you. Run `cd /Users/syabanf/Documents/works/artha-samudera && ./node_modules/.bin/tsc --noEmit -p apps/web` and fix errors in your files. Errors that only say another group's module is missing come from parallel work; ignore them.

## Group A: sales (`apps/web/src/console/sales/`, plus one edit in `console/pages/InquiryPages.tsx`)

| File | Exports | Route |
|---|---|---|
| `PipelinePage.tsx` | `PipelinePage` | `/console/sales/pipeline` |
| `DealPages.tsx` | `DealsPage`, `DealDetailPage` | `/console/sales/deals`, `/deals/:id` |
| `QuotationPages.tsx` | `QuotationsPage`, `QuotationDetailPage`, `ApprovalsPage` | `/quotations`, `/quotations/:id`, `/approvals` |
| `FollowUpsPage.tsx` | `FollowUpsPage` | `/follow-ups` |
| `ForecastPage.tsx` | `ForecastPage` | `/forecast` |
| `SalesSettingsPage.tsx` | `SalesSettingsPage` | `/settings` |

- Pipeline: one column per open stage plus Won and Lost (collapsed counts), cards show code, title, contact, value, owner initials, days in stage. Move a card with HTML5 drag and drop on desktop and a "Move to" NativeSelect on each card for keyboard and phone. Moving to Lost opens a dialog asking for a lost reason from `crmSettings.lostReasons`. Column header shows count and total value. Filter by owner (NativeSelect) and search. "New deal" dialog (contact, listing, owner, value, expected close, stage).
- Deals list: table with stage badge, owner, value, expected close (late in accent), filters by stage chips and owner.
- Deal detail: Back; hero with stage stepper over open stages, value, contact link, listing link; primary next action (move to next stage, or Mark won when an accepted quotation exists, using `dealMoveBlocker` text when blocked); Mark lost with reason; quotations card (create, revise, submit, send, record buyer answer; show the status lifecycle and net price; discount above `APPROVAL_DISCOUNT_PCT` shows "Needs approval"); tasks card (add, complete); activity timeline (log a note, call, WhatsApp or visit through `activities/add`); members (add team members); edit dialog.
- Quotation detail is a printable booking letter: company letterhead from `state.company`, buyer, property, list price, discount, net price, booking fee, payment plan, validity, notes, signature lines; a Print button (`window.print()`), and `print:` classes so the rail and buttons disappear on paper. Quotations list filters by status chips.
- Approvals: quotations in `pending_approval` with approve and reject actions; needs `deal.approve`.
- Follow-ups: tasks in Overdue, Today, Upcoming, Done buckets (PillTabs with counts, from `followUpBucket`), filter "Mine / Everyone", complete and reopen, create a task dialog linking to a deal or contact. This is Habitat's follow-up queue.
- Forecast: month picker (this month and next two), per-agent rows with target, won, weighted pipeline and attainment ProgressBar; totals in stat cards; "Set target" dialog needs `target.manage`.
- Pipeline settings (needs `target.manage`): stages table (name, probability, kind; add, edit, delete with `stageRemoveBlocker` title), lost reasons list (add, remove), contact custom fields (label, type, options).
- In `console/pages/InquiryPages.tsx` `InquiryDetailPage`, add a "Create deal" button (needs `deal.manage`) that creates a deal from the inquiry (contact matched by phone with `contactByPhone`, listing, budget or listing price as value, owner = inquiry owner or the user, stage `stg-qualified`) and navigates to it. If a deal already has `inquiryId` equal to this inquiry, show "Open deal" instead.

## Group B: CRM (`apps/web/src/console/crm/`)

| File | Exports | Route |
|---|---|---|
| `ContactPages.tsx` | `ContactsPage`, `ContactDetailPage` | `/console/crm/contacts`, `/contacts/:id` |
| `AccountPages.tsx` | `AccountsPage`, `AccountDetailPage` | `/accounts`, `/accounts/:id` |
| `InboxPage.tsx` | `InboxPage` | `/inbox` |
| `ReferralsPage.tsx` | `ReferralsPage` | `/referrals` |

- Contacts list: name and phone, type, source, score with a hot, warm or cold badge (`leadScore`, `temperature`), owner, tags; filters: search, type chips, source NativeSelect, temperature chips, "Opted out" chip. "New contact" dialog with duplicate-phone check through `contactByPhone`.
- Contact detail (customer 360): hero with score, temperature, type, source, owner; KeyValue with phone, email, city, account link; tags editor; custom fields from `crmSettings.customFields` editable inline; marketing consent Switch (`contacts/setOptOut`); deals, inquiries (matched by phone), conversations, tasks and activity timeline cards; log activity; edit dialog.
- Accounts: list with industry, city, contacts count, open deal value; detail with contacts, deals, owner; create and edit dialog.
- Inbox: two panes on desktop (conversation list, thread), one pane on phones with Back. List filters: Mine, Unassigned, All, channel chips, unread dot (messages after `readAt`). Thread: bubbles (contact left, team right, Jessy marked), reply box, "Insert template" menu filling `{{name}}` with the contact name, a "Jessy suggests" chip that drafts a reply from the last message, assign NativeSelect, close and reopen. Opening a thread dispatches `conversations/markRead`. Link to the contact.
- Referrals: table with referrer (contact or partner), referred contact, deal, reward, status; filters; approve, reject and mark paid need `referral.manage`; "New referral" dialog.

## Group C: marketing and automation (`apps/web/src/console/marketing/`, plus `apps/web/src/site/PublicFormPage.tsx`)

| File | Exports | Route |
|---|---|---|
| `SegmentsPage.tsx` | `SegmentsPage` | `/console/crm/segments` |
| `CampaignPages.tsx` | `CampaignsPage`, `CampaignDetailPage` | `/campaigns`, `/campaigns/:id` |
| `FormsPage.tsx` | `FormsPage` | `/forms` |
| `ReportsPage.tsx` | `ReportsPage` | `/reports` |
| `AutomationsPage.tsx` | `AutomationsPage` | `/automations` |
| `site/PublicFormPage.tsx` | `PublicFormPage` | `/form/:slug` (public site layout) |

- Segments (needs `campaign.manage`): cards or table with member count; editor dialog with rule fields (type, source, city, tag, minimum score, exclude opted-out) and a live member count plus the first names as a preview; delete with the store blocker.
- Campaigns (needs `campaign.manage`): list with status badge and stats; create dialog (name, segment with member count, template, listing) with a message preview filled for the first member; detail with stats (sent, delivered, read, replied as StatCards and read and reply rates), schedule (date and time), send now (shows `campaignSendBlocker` sentence when blocked), cancel, recipient list.
- Lead forms (needs `campaign.manage`): list with public link (copy), submissions count (inquiries whose contact source is `form`, matched by form listing), active Switch, create and edit dialog. Attribution card: inquiries and won deals by contact source as a bar list.
- Public form page: inside the public site layout (`useDocumentMeta`), headline, listing summary when set, name, WhatsApp, budget and preferred visit date when asked; submit dispatches `forms/submit` as `'public'` through `useAppState().dispatch(action, 'public')`, shows the blocker or a thank-you state. Closed or unknown form shows an EmptyState.
- Reports (needs `report.view`): builder with dataset, group by (`REPORT_GROUPS`), metric (count, or value for deals); result as a horizontal bar list (div bars with `bg-accent` for the top row and `bg-chart-muted` for the rest, labelled values) and a table; Export CSV of the rows; saved reports list with schedule (none, weekly, monthly) and recipients; save, open and delete.
- Automations (needs `automation.manage`): rule cards with trigger and action labels, enabled Switch, editable param (template for send_template, days for create_task), run log with ok or failed per run; "New rule" dialog.
