# Phase 8 contract: workspace and AI

`docs/roadmap.md` → "Phase 8" lists the scope. Read these first:
- `docs/frontend-conventions.md`
- The "Hooks and helpers" and "Rules every page follows" sections of `docs/phase2-contract.md`
- The "Shared-file rules" of `docs/phase7-contract.md`, which still apply, with the exceptions named below.

## What exists for this phase

- **Paths** in `components/links.tsx`:
  - `paths.search`: `/console/search`, inside the console shell.
  - `paths.assistant`: `/console/assistant`, inside the shell, for phones.
  - `paths.os`: `/console/os`. It is a top-level route outside the console shell, so wrap the page in `RequireAuth` from `auth/auth.tsx`.
- **Router:** the routes are registered.
- **Rail:** the console rail has "Desktop", which links to `/console/os`.
- **Header stubs:** the console header renders `<SearchLauncher />` and `<AssistantLauncher />` from stub files. Agents A and B replace those stubs; nobody else edits the header.
- **Jessy:**
  - The console agent `jessy_console` is seeded in the AI gateway with its prompt and the read tools `read_attendance`, `read_stock`, `read_sales`, `read_candidates`, `read_approvals`, `read_receivables` and `search_listings`.
  - `Reply` has `proposal?: { title; lines }`.
  - `jessyStep(..., by)` and `useJessyChat(agentId, start, turn, by)` run a turn's actions as `by`. The console assistant passes the signed-in user id, so the audit log names the member; the AI call log still records Jessy.
- **Storage version** is 15.

## Agent A: Global search

Own these files:
- `packages/fixtures/src/search.ts` and `search.test.ts`. This is new. Add one line, `export * from './search'`, to `packages/fixtures/src/index.ts`.
- `console/search/SearchLauncher.tsx`: replace the stub.
- `console/search/SearchPage.tsx`: export `SearchPage`.

**Store (`search.ts`):**
- `searchAll(s, query, opts?)` returns ranked hits `{ kind, id, title, subtitle, code? }` across:
  - listings, partners and inquiries
  - CRM contacts, accounts and deals; quotations
  - employees, candidates and job openings
  - vendors, bills, invoices and journals
  - items, purchase requests and orders
  - dataroom folders and files
  - blog posts
- `SEARCH_KIND_LABEL`, plus the permission each kind needs, as `SEARCH_KIND_NEEDS: Record<kind, Permission>`. The web maps kinds to paths.
- Ranking: exact code match first, then title prefix, then words in the title, then words in the subtitle and keywords. It ignores case and accents, and every word of the query must match.
- Tests cover ranking, multi-word queries and kind filters.

**Palette (`SearchLauncher`):**
- A header button: a search pill with a ⌘K hint on desktop and an icon button on phones.
- ⌘K or Ctrl K opens a dialog. It is a bottom sheet on phones.
- With an empty query it shows:
  - Recent searches, kept in `localStorage` with try/catch.
  - Jump-to pages from `NAV` and the section pages the user may open.
  - Quick commands: New listing, New purchase request, New leave request, Ask Jessy.
- Typing filters across hits grouped by kind. Arrow keys, Enter and Escape work.
- The result list is `role="listbox"` with `aria-activedescendant`.
- Hits are filtered by `SEARCH_KIND_NEEDS`, plus `canSeeFolder` for dataroom items.
- "See all results" opens `/console/search?q=`.

**Search page:**
- The query in the URL, kind chips with counts, and grouped results with highlighted matches.
- An empty state that suggests other words.

## Agent B: Jessy, console assistant

Own these files:
- `packages/fixtures/src/assistant.ts` and `assistant.test.ts`. This is new. Add one line, `export * from './assistant'`, to `index.ts`.
- `console/assistant/AssistantLauncher.tsx`: replace the stub.
- `console/assistant/AssistantPage.tsx`: export `AssistantPage`.

You may make small exact-string edits to `components/JessyChat.tsx` to render a proposal card with Confirm and Cancel buttons; keep the buyer and partner chats unchanged.

**Engine (`assistant.ts`):** the same `Turn` and `Engine` shape as `jessy.ts`.
- `consoleStart(s, ctx)` where `ctx = { userId, permissions: Permission[] }`, kept in the convo.
- `consoleTurn` is rule-based intent matching over the text, in English with common Indonesian words such as `hari ini`, `stok` and `penjualan`.
- **Read tools.** Each answers from the store, logs the tool in `log.tools`, and refuses politely without the permission:
  - who is in, late or on leave today, by department
  - low stock and the stock of a named item
  - sales: won deals and value this month, last month or this quarter, and the pipeline by stage
  - a candidate's status by name
  - what waits for my approval: HR requests, purchase requests and quotations
  - overdue invoices
  - exclusive rights expiring soon
  - my leave balance
- **Write tools** propose first and return `proposal` plus quick replies Confirm and Cancel:
  - Raise a purchase request for N of an item.
  - Approve or reject a named pending request I may decide.
  - Check me in.
  - Draft an announcement.
  - Create a follow-up task on a deal.

  The engine checks `blockerFor` before proposing and says why when a change would be refused. Only "confirm" returns the actions.
- `help` lists what Jessy can do for this user's permissions.
- Tests cover a read answer, the permission refusal, and propose, confirm and dispatch, including the `by` user in the audit.

**UI:**
- **`AssistantLauncher`:** a header button with the Jessy mark. It opens a right sheet (bottom sheet on phones) with `useJessyChat('jessy_console', ..., user.id)`.
- **The sheet:** starter suggestions, proposal cards with Confirm and Cancel, and links in answers to the records.
- **`AssistantPage`:** the same chat full-page, for phones and for the "Ask Jessy" command.

## Agent C: OS desktop

Own `console/os/*`. `DesktopPage.tsx` exports `DesktopPage`, wrapped in `RequireAuth`.

**Desktop (from `md` up):**
- **Top bar:** brand, active app name, clock, search button (opens the global search page), and a user menu with Back to console and Sign out.
- **Wallpaper:** the token ink with the landing showcase photo. Theme tokens only, never hex.
- **Icons:** desktop icons for the modules the user may open, from `NAV` with the same `needs` filter.
- **Dock:** pinned apps and running apps marked with a dot.
- **Windows:** each module opens in a window that holds the console page in an `iframe` of the same origin with `?embed=1`.
  - Drag by the title bar and resize from the corner.
  - Focus raises the window.
  - Minimize to the dock, maximize, close.
  - Windows snap to the left or right half when dropped at an edge.
- **Saved state:** the layout lives in `localStorage` per user, with try/catch.
- **Built-in apps, rendered natively without an iframe:**
  - Notes: one text pad, kept in `localStorage`.
  - Calculator.
  - Clock and calendar: today's date, the month, and the user's events from attendance and leave.
  - Jessy: the chat once Agent B ships it. Until then it opens `paths.assistant` in a frame.

**Phone (below `md`):** a launcher grid of app icons. An app opens full-screen with a back bar; no windows.

**Embed mode:** in the console shell, `?embed=1` should hide the rail, header and phone bar. Agent C makes that one small edit in `console/layouts/ConsoleLayout.tsx`. It must not touch the header's launcher lines.

**Keyboard:** Escape closes the focused native app's menu. Each window has a labelled region with focusable title bar buttons.

## Checks for every agent

- `pnpm -r typecheck` and `pnpm test` from the repo root.
- Headless Playwright at 1280 and 375 px, from `/Users/syabanf/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core`, in your own context.
  - Sign in through an init script: `localStorage['artha.web.session'] = JSON.stringify({ userId: 'usr-1', realUserId: null })`.
  - Each page needs one h1, no sideways scroll and no console errors.
- Name scratch files with your agent letter.
- Run a cleanup pass on your own files.
- Report: files, what each piece does, the helpers you wanted (with exact signatures), and known gaps.
