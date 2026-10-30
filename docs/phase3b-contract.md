# Phase 3B contract: closing the client's 8-module gaps

`docs/roadmap.md` → "Phase 3B" lists each gap. Read `docs/frontend-conventions.md` and the "Hooks and helpers", "Copy these pages for shape" and "Rules every page follows" sections of `docs/phase2-contract.md`; they apply unchanged.

## What exists for this phase

- **Store split:** the store is split into module files under `packages/fixtures/src/`: `exclusives.ts`, `sharing.ts`, `content.ts`, `gateway.ts` (AI gateway), `notify.ts` (outbox), plus `crm.ts`, `ops.ts`, `iam.ts`, `jessy.ts`. Each owns its actions, blockers and reducer cases; `store.ts` routes by action prefix (`exclusives/`, `profitShares/` and `settlements/`, `social/` and `blog/`, `ai/`, `outbox/`).
- **Hooks that run after every action** (`store.ts` → `reduce`): `settleOnClose(prev, next, action, at)` in `sharing.ts`, then `dispatchNotifications(prev, next, env)` in `notify.ts`. Both return `next` unchanged today; fill them in.
- **New state keys, already in `AppState` and seeded empty:** `aiAgents, aiPrompts, aiTools, aiCalls, aiMemory, aiSettings, outbox, settlements`. Types: `packages/types/src/ai.ts`, `notify.ts`, `settlement.ts`.
- **AI gateway API:**
  - `aiCall(state, agentId, purpose, input, output, at, extra)` builds an `AiCall` usage record (tokens, cost from `MODEL_PRICES`, latency).
  - Dispatching `{ type: 'ai/logCall', call }` stores it. The store refuses the call when the agent is switched off.
  - Every agent (Jessy buyer and partner chats, the content agent, the inbox suggester) logs each model turn through it.
- **Listing detail page cards:**
  - The exclusive card and its dialog live in `apps/web/src/console/listing/ExclusiveParts.tsx`.
  - The profit-share card and its dialog live in `apps/web/src/console/listing/ShareParts.tsx`.
  - `ListingDetailPage.tsx` only renders them.
- **Routes already registered (files to create):**
  - `console/ai/AiGatewayPage.tsx` (`AiGatewayPage`, `/console/ai`)
  - `console/pages/ContentCalendarPage.tsx` (`ContentCalendarPage`, `/console/content/calendar`)
  - `console/settings/OutboxPage.tsx` (`OutboxPage`, `/console/settings/outbox`)
  - `console/sharing/SettlementPages.tsx` (`SettlementsPage` at `/console/profit-sharing/settlements` and `SharingReportsPage` at `/console/profit-sharing/reports`)
  - Paths: `paths.ai`, `paths.contentCalendar`, `paths.outbox`, `paths.settlements`, `paths.sharingReports`.
- **Persisted demo data:** the storage version is already bumped (v7), so a type change does not need another bump. If you change a seeded shape again, tell the integrator.

## Shared-file rules (four agents run at once)

- `packages/types/src/entities.ts`, `packages/fixtures/src/seed.ts` and `packages/fixtures/src/store.ts` are shared. Change them only with small exact-string Edit calls on your own block, never by rewriting the file. Your blocks:
  - Agent 1: `Inquiry`, `Listing`.
  - Agent 2: `SocialPost`, `BlogPost`.
  - Agent 3: `ExclusiveRight`.
  - Agent 4: `ProfitShare`.
- In `store.ts`, only the `seedState` line for your own state keys may change. Put larger seed data in your own new `seed-<module>.ts` file.
- Do not edit the router, `nav.ts`, `links.tsx`, the kit, or another agent's files. Tell the integrator in your report if you need something there.
- Add `node:test` cases for your rules in a new `packages/fixtures/src/<module>.test.ts`. Keep every existing test green: run `pnpm test` from the repo root, and update an existing assertion only when your change makes it obsolete, and say so.

## Agent 1: AI gateway and Jessy (modules 2, 4, 5)

Own: `gateway.ts`, a new `seed-ai.ts` (wire it into `seedState`), `jessy.ts`, `apps/web/src/components/JessyChat.tsx`, `apps/web/src/site/PartnerPage.tsx`, `apps/web/src/site/SiteLayout.tsx` (the Jessy panel only), `apps/web/src/console/crm/InboxPage.tsx` (the "Jessy suggests" path only), `apps/web/src/console/pages/JessyPage.tsx`, new `console/ai/AiGatewayPage.tsx`.

- **Gateway seed:** the four agents, their prompt version 1 (a short system prompt each), a tool registry, a few days of sample calls, and settings. Tools map to store actions:
  - `search_listings` (read)
  - `create_inquiry` (`inquiries/create`)
  - `create_listing` (`listings/create`)
  - `delist_listing` (`listings/delist`)
  - `draft_social_post`
  - `draft_blog_post`
  - `assign_agent`
- **AI gateway page** (view needs `jessy.view`, edit needs `jessy.manage`), with tabs:
  - **Agents:** enable, model, temperature, tools.
  - **Prompts:** version history, edit and publish a new version, diff against the previous version.
  - **Tools:** the registry, plus which agents use each tool.
  - **Memory:** facts per buyer or partner, searchable, clearable.
  - **Usage:** calls, tokens, cost per day and per agent, budget used against `monthlyBudgetUsd` with a warning at 80%, the latest calls table with filters.
  - **Settings:** provider (`mock` today, `anthropic` later), default model, budget.
- **Logging:** route every Jessy turn through the gateway. `useJessyChat` logs an `ai/logCall` per turn (purpose, subject phone when known, tool calls such as `create_inquiry`), and stores remembered facts with `ai/setMemory` (for example budget, preferred city).
- **Buyer qualification (module 4):**
  - After interest, Jessy asks budget, timeline (now, 3 months, 6 months or later), financing (cash, mortgage, installment) and purpose (live in, invest, business), with quick replies.
  - Store the answers on the inquiry: add optional `qualification` fields to `Inquiry`.
  - Mark hot, warm or cold.
  - The handoff message names the assigned agent once the round-robin automation has run. Read the owner after dispatch, or say "our team" when nobody is assigned.
  - Show the qualification on the inquiry detail page. You may add a card to `console/pages/InquiryPages.tsx`.
- **Partner portal (module 5):**
  - Add a photo upload step: an attach button in the chat when Jessy asks for photos. Accept up to 4 images, downscale each in the browser to at most 800 px on the long side, JPEG quality 0.7, store as data URLs on `Listing.photos`, and set `photo` to the first.
  - Before submitting, show a structured review card (all extracted fields, editable inline) the partner confirms.
  - `ListingVisual` should show `listing.photo` when present. You may edit `components/ListingVisual.tsx`.

## Agent 2: Content agent (module 6)

Own: `content.ts`, `apps/web/src/console/pages/SocialPage.tsx`, `apps/web/src/console/pages/BlogPages.tsx`, new `console/pages/ContentCalendarPage.tsx`, the `SocialPost` and `BlogPost` blocks.

- **Formats:** Instagram post, Instagram carousel (3 to 6 slides, each with a headline and line built from listing data), reel or TikTok script (hook, 3 to 5 scenes with a shot, on-screen text and voice-over line, call to action, suggested audio), Facebook post. Extend `SocialPost` with `format`, `slides` and `scenes`.
- **Approval flow:** draft, in review, approved, scheduled, published, failed. Only `content.manage` can approve. Publishing needs the matching integration connected (Instagram and Facebook through `int-ig`, TikTok as a new integration you add to the content seed). Otherwise the store refuses with the reason. A published post records a platform post ID and a permalink.
- **Posting calendar** (`/console/content/calendar`): month view of scheduled and published posts and blog posts by day, colour by platform, drag or a "Move to date" control to reschedule, and a list view on phones.
- **Usage logging:** every draft and rewrite logs `ai/logCall` with agent `content`.
- **Blog:** keep the SEO and GEO checklist. Add the same approval step before publishing.

## Agent 3: Exclusive rights and notification outbox (modules 3, 7)

Own: `exclusives.ts`, `notify.ts`, a new `seed-notify.ts`, `apps/web/src/state/store.tsx` (the minute job only), `apps/web/src/console/pages/ExclusivesPage.tsx`, `apps/web/src/console/listing/ExclusiveParts.tsx`, new `console/settings/OutboxPage.tsx`, `apps/web/src/console/settings/ServicePages.tsx` (`NotificationsPage` only), the `ExclusiveRight` block.

- **Contract fields (module 7):** contract number, signed date and a contract document (file name and a data URL for a PDF or image up to 1 MB).
- **Reminders and expiry:** fixed reminder milestones at 30, 7 and 1 day before the end. Record which milestones were sent, so each goes out once; this replaces the single `remindDaysBefore` window, so keep the old field readable or migrate it in the seed. At the end date the status changes to expired automatically: add a stored `status` (active, expired, ended) set by the minute job through an `exclusives/sweep` action, so lists can filter on it. Show the milestone timeline on the card.
- **Outbox (module 3):** `dispatchNotifications` turns events into `outbox` items for each enabled notification rule, its channels and the users holding its roles.
  - Events:
    - new inquiry
    - listing needs review
    - exclusive milestone and expiry
    - quotation needs approval
    - listing sold
    - content scheduled
    - payment received
  - The rules already exist in `state.notificationRules`. Add rules for the new events.
  - **Channel sending:**
    - WhatsApp items also land in `messages` (sent, or failed when the gateway is down).
    - Email items need the email integration connected.
    - Push items call the browser Notification API only when permission is granted, and otherwise stay queued.
    - In-app items feed the bell, so the console bell reads unread in-app outbox items plus today's derived notices.
- **Outbox page:** the outbox log with channel, event, status and recipient filters, and a retry action for failed items. The notifications settings page links to it.

## Agent 4: Profit sharing mini ERP (module 8)

Own: `sharing.ts`, a new `seed-sharing.ts`, `apps/web/src/console/listing/ShareParts.tsx`, `apps/web/src/console/pages/ProfitSharingPage.tsx`, new `console/sharing/SettlementPages.tsx`, `apps/web/src/site/PartnerDashboardPage.tsx` (earnings section only), `packages/fixtures/src/ops.ts` (`statementLines` only), the `ProfitShare` block, and the profit-share assertions in `store.test.ts`.

- **Schemes:** multi-party, per listing:
  - The commission is a percent of the deal price or a fixed nominal fee.
  - Parties are company, agent (a user), partner (a partner) or another named party such as a co-broker or notary. Each takes a percent or a fixed rupiah amount.
  - Fixed amounts come off first; percentages split the rest and must total 100.
  - Blockers explain any mismatch.
  - Migrate the existing three-way split.
- **Settlements:** `settleOnClose` creates a settlement when a listing is marked sold or a deal moves to won (use the deal value or the sold price). There is one settlement per listing and deal, with a line per party. Statuses are open and paid (mark paid per settlement).
- **Reports:**
  - **Settlements page:** filters, a detail sheet and printable lines through `components/Letter.tsx`.
  - **Reports page:** totals per period (month and quarter) and per partner, agent and company, with Export CSV.
- **Consumers:**
  - Agent commission statements take agent lines from settlements.
  - The partner dashboard shows partner lines.
  - The profit-sharing page shows schemes with the new party editor and links to settlements and reports.
