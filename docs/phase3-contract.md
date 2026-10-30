# Phase 3 page contract: property operations

Store, types, rules, paths and routes exist. Read `docs/frontend-conventions.md` and the sections "Hooks and helpers", "Copy these pages for shape" and "Rules every page follows" in `docs/phase2-contract.md`; they apply here unchanged.

## What exists

- Types: `packages/types/src/ops.ts` (Project, Unit, Visit, OpenHouse, Payment, PortalSync, CommissionStatement, Promotion, SitePage, SavedProperty and their `*_LABEL` maps).
- Rules: `packages/fixtures/src/ops.ts`. Actions are the `OpsAction` union. Helpers: `unitCounts`, `visitClash`, `activePromotions`, `promoPrice`, `isFeatured`, `statementLines`, `statementTotal`, `savedFor`. Journeys in `ops.test.ts`.
- State keys: `projects, units, visits, openHouses, payments, portalSyncs, statements, promotions, sitePages, savedProperties`, plus everything earlier (`deals, contacts, listings, partners, profitShares, users, company, …`).
- Permissions: `ops.view` opens the section; `project.manage, visit.manage, payment.manage, commission.manage, syndication.manage, cms.manage` gate actions. A page whose whole purpose needs one of these shows `<NoAccess />` (`components/NoAccess.tsx`) without it.
- Shared pieces: `components/badges.tsx` (StageBadge), `lib/price.ts` (`readPrice`, `priceInput` for rupiah inputs), `components/Markdown.tsx` (renders page bodies), `components/JsonLd.tsx`, `lib/meta.ts` (`useDocumentMeta`), `site/SiteLayout.tsx` (`SiteContainer`, `Logo`), `site/ListingCard.tsx`.
- Public pages dispatch with `useAppState().dispatch(action, 'public')`, which returns the blocker sentence or null.
- The console shell hides itself on paper. A printable page only needs `print:hidden` on its own buttons.
- Do not edit the router, the store, types, the kit, `docs/` or another group's files. Describe a needed store change in your report.

## Group A: projects, visits, open houses (`apps/web/src/console/ops/`, `apps/web/src/site/OpenHousePublicPage.tsx`)

| File | Exports | Route |
|---|---|---|
| `ProjectPages.tsx` | `ProjectsPage`, `ProjectDetailPage` | `/console/ops/projects`, `/projects/:id` |
| `VisitPages.tsx` | `VisitsPage`, `VisitDetailPage` | `/visits`, `/visits/:id` |
| `OpenHousePages.tsx` | `OpenHousesPage`, `OpenHouseDetailPage` | `/open-houses`, `/open-houses/:id` |
| `site/OpenHousePublicPage.tsx` | `OpenHousePublicPage` | `/open-house/:slug` |

- Projects list: cards or table with kind, partner, city and an availability bar (available, held, booked, sold counts from `unitCounts`). Create and edit project dialog.
- Project detail (the unit availability board, Mizu's resort front office): units grouped by `group` as a grid of tiles coloured by status (soft tints: available success, held warning, booked info, sold ink), each tile showing code, type, price and the hold deadline. Status filter chips with counts and a search. Clicking a tile opens a Sheet: details, the linked deal, actions Hold (pick deal and until date), Release, Mark sold, Edit (unit dialog), Book a site visit. Add unit dialog. Stat cards per status.
- Site visits (Mizu's reservations and class schedule): a week calendar (7 day columns from Monday, hours 8 to 19, visit blocks positioned by time, agent initials, status tint) with previous, this week, next navigation, plus a list view (PillTabs Calendar / List) with filters by status chips, agent NativeSelect and search. On phones the calendar becomes a day list. New visit dialog (contact, listing or unit, deal optional, agent, date, time, duration, notes) showing the `visitClash` sentence live. Detail page: hero with time, place, buyer, agent; lifecycle actions (Check in, Done, No-show, Cancel, Reschedule dialog); feedback form after Done (1 to 5 rating and text); link to deal and contact.
- Open houses: list with date, place, registrations of capacity (ProgressBar), published state. Create and edit dialog (title, slug, listing or project, start, end, capacity, host, published). Detail: registrations table with an attended Checkbox per row (`openHouses/attend`), counts, copy public link, "Open public page".
- Public open house page: inside the site layout; title, date and time, place summary (listing card or project), seats left, register form (name, WhatsApp) through `openHouses/register` as 'public'; show the blocker or a confirmation. Unknown or unpublished slug shows an EmptyState.

## Group B: money and channels (`apps/web/src/console/money/`)

| File | Exports | Route |
|---|---|---|
| `PaymentPages.tsx` | `PaymentsPage`, `PaymentDetailPage` | `/console/ops/payments`, `/payments/:id` |
| `CommissionPages.tsx` | `CommissionsPage`, `CommissionDetailPage` | `/commissions`, `/commissions/:id` |
| `PortalsPage.tsx` | `PortalsPage` | `/portals` |
| `PromotionsPage.tsx` | `PromotionsPage` | `/promotions` |

- Payments (Mizu's POS payments and wallet): stat cards (collected this month, waiting, expired, refunded), table with code, kind, buyer, deal, amount, method, status, filters by status and kind chips and search. "Request payment" dialog (deal, kind, amount, method, unit optional, expires at) creating a pending payment with a generated virtual account or QRIS reference. Detail page as a printable receipt or payment request (company letterhead, buyer, deal, property, amount in figures, method and reference, status stamp, dates); actions Mark paid (reference input), Refund (confirm dialog), Print; refunds link back to the original.
- Commissions (Mizu's coach incentive statements and payouts): list with agent, month, deals, total (`statementTotal`), status; filters; "Generate statement" dialog (agent, month) showing a preview of `statementLines` and the blocker. Detail page as a printable statement: lines table (deal, basis, commission %, agent %, amount), adjustment with note (edit while draft), total, approve (needs `commission.manage`), mark paid, print.
- Portals (Mizu's ticketing channel manager): matrix of live listings (rows) by portal (columns: Rumah123, Lamudi, OLX Properti, Pinhome) with status chips per cell, views and leads; cell actions Publish, Retry (publish again after an error), Remove. Filters: search, status chips, portal NativeSelect. Totals per portal (views, leads). Errors list card. Needs `syndication.manage` for actions.
- Promotions: list with listing, kind, label, period, state (scheduled, running, ended) and for price drops the old and new price; filters; create and edit dialog (listing, kind, label, start, end, promo price for price drops) with the store blocker; remove.

## Group C: public portals and pages CMS (`apps/web/src/console/cms/`, `apps/web/src/site/`)

| File | Exports | Route |
|---|---|---|
| `console/cms/CmsPages.tsx` | `CmsPagesPage`, `CmsPageEditor` | `/console/ops/pages`, `/pages/:id` (`new` creates) |
| `site/SitePages.tsx` | `SitePagePublic`, `AreasPage`, `AreaGuidePage` | `/p/:slug`, `/areas`, `/areas/:slug` |
| `site/BuyerPortalPage.tsx` | `BuyerPortalPage` | `/my` |
| `site/PartnerDashboardPage.tsx` | `PartnerDashboardPage` | `/partners/dashboard` |

Also edit these existing site files: `site/ListingCard.tsx`, `site/AssetDetailPage.tsx`, `site/SiteLayout.tsx` (nav and footer links only).

- Pages CMS (Mizu's site content editor; needs `cms.manage` to edit): list with kind chips, published state, last update; editor with title, slug, kind, summary, city (area guides), body textarea with live Markdown preview, publish Switch, delete; view on site.
- Public pages: `/p/:slug` renders a published page (Markdown); `/areas` lists published area guides as cards; `/areas/:slug` renders a guide plus live listings in its city (ListingCard grid). Set the document title and description. Unpublished or unknown slugs show an EmptyState.
- Buyer portal `/my` (Mizu's member app, adapted): sign in with a WhatsApp number (mock: the number is remembered in localStorage through `usePersistentState` in `lib/storage.ts`; no password). Shows saved properties (`savedFor`, remove), inquiries matched by phone with status, upcoming and past site visits for the contact with that phone, payments for that contact with status and amount, and a sign-out. Empty states point to the property list.
- Partner dashboard `/partners/dashboard` (Habitat's member portal for partners): sign in with the partner's WhatsApp number (mock, matched to `partners`). Shows the partner's listings with status, exclusive rights with days left, portal views and leads per listing, profit-share earnings on sold listings (`shareAmounts` from `@artha/fixtures`), and a link to the partner chat at `/partners` to list or withdraw.
- Listing card and asset detail: a "Featured" badge when `isFeatured`, and for a running price drop show the promo price with the old price struck through (`promoPrice`). Add a Save heart button on the asset detail that toggles `saved/toggle` for the buyer number remembered by `/my`; when no number is remembered, link to `/my` to sign in.
- Site layout: add nav links "Areas" and "My account" (`/my`), footer links to About (`/p/about`), Contact (`/p/contact`), Privacy (`/p/privacy`), Area guides and Partner dashboard.
