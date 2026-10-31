# Frontend conventions: Artha Samoedra

The app follows the WIT house style (`wit-code-agent`): grey canvas, borderless white cards, one ink surface, WIT red as the single accent, pill controls. All data is seeded mock data in a reducer store; there is no backend yet.

## Layout

| Path | Holds |
|---|---|
| `packages/types` | Domain model: `enums.ts` (unions plus `*_LABEL` maps) and `entities.ts` |
| `packages/fixtures` | Seed, reducer store (`entity/verb` actions in an envelope), blockers, derivations, permissions, formatters, and the Jessy engine (`jessy.ts`) |
| `packages/ui` | Kit components, no domain imports |
| `packages/tailwind-config/theme.css` | Semantic tokens |
| `apps/web/src/site` | Public website: home, asset list and detail, blog, partner portal |
| `apps/web/src/console` | Team console behind the demo login |

## Reference pages to copy

- Dashboard: `console/pages/DashboardPage.tsx`
- List page (stat tiles, chips with counts, URL filters, DataTable): `console/pages/ListingsPage.tsx`
- Detail page (Back, primary next step, ink hero, cards, history): `console/pages/ListingDetailPage.tsx`
- Entity dialogs (form mounted only while open, errors after first submit): `console/dialogs.tsx`

## Rules the store enforces

- A listing from a partner chat enters as `review`; only `listing.approve` can publish it, and approval creates a default profit-share scheme.
- Delisting is refused while a listing is reserved or sold. Delisting or selling ends the running exclusive right.
- A profit-share scheme must split 100% between partner, company and agent, with commission above 0% and at most 10%.
- Jessy's reminder job runs on load and every minute. It marks exclusive rights that are due or expired and logs one agent event per run.
- Actions Jessy takes carry `meta.by = 'jessy'` and land in the agent log on `/console/jessy`.
- Permissions live on role records (`packages/types/src/iam.ts` lists them). Gate UI with `useAuth().can('module.action')`; nav items and routes use the `*.view` keys, so a new module adds its keys to `PERMISSION_GROUPS` and a `needs` on its nav item.
- The reducer writes a field-level audit entry for every change to a watched collection (`packages/fixtures/src/audit.ts`). A new collection joins the audit by adding its key to `COLLECTIONS`.
- CRM and sales rules live in `packages/fixtures/src/crm.ts`: a quotation above 5% discount needs `deal.approve`; a deal is won only after the buyer accepts a quotation; accepting moves an earlier deal to the booking stage. Every new inquiry creates or links a contact by phone and runs the enabled automations.
- The public site may use the Fraunces display serif (`font-display`) for headings; the console stays DM Sans only. Landing photos load from `apps/web/public/landing/` with designed gradient fallbacks until real photos exist.
- Shared page pieces: `components/Letter.tsx` for printable letters (receipt, commission statement), `components/DocumentSheet.tsx` for the quotation and invoice paper that doubles as the form, `components/NoAccess.tsx` for pages that need a permission beyond the section's, `components/SectionNav.tsx` for section tabs, `components/badges.tsx` for status and stage badges, `lib/price.ts` for price inputs.
- The last active admin cannot be demoted or disabled; system roles, the head office and roles or branches still in use cannot be deleted.

## Swapping Jessy for an LLM

`buyerTurn` and `partnerTurn` take `(state, conversation, text, at)` and return `{ replies, convo, actions }`. An LLM-backed engine can return the same shape, so the chat UI and the store stay as they are.

## Checks before finishing a screen

- `main.scrollWidth === main.clientWidth` at 375 and 1280 wide.
- One `h1` per page.
- `pnpm typecheck`, `pnpm test`, `pnpm build` pass.

## Finance pages

- **Store logic:** ledger maths lives in `packages/fixtures/src/finance.ts`. Pages read `balanceSheet`, `generalLedger` and the other report helpers, and never sum journal lines themselves.
- **Shared parts:** `console/finance/parts.tsx` holds `AccountSelect`, `Money`, `DocumentLinesEditor`, `TotalsBlock`, the journal and settle badges, and `SubTabs` for a section tab that spans pages.
- **Linking:** a record that posts money links to its journal with `journalFor(state, kind, id)`.
- **Two actions in one click:** "save, then post" can dispatch twice in one handler. The store checks the second action against the result of the first.
