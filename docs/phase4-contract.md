# Phase 4 contract: finance and accounting

`docs/roadmap.md` → "Phase 4" lists the scope. Read `docs/frontend-conventions.md` and the "Hooks and helpers", "Copy these pages for shape" and "Rules every page follows" sections of `docs/phase2-contract.md`; they apply unchanged. Copy page shape from `console/money/PaymentPages.tsx` (list plus detail) and `console/sharing/SettlementPages.tsx` (reports with CSV export and print).

## What exists for this phase

- **Types:** `packages/types/src/finance.ts`. `GlAccount`, `FiscalYear`, `FiscalPeriod`, `JournalEntry` with `JournalLine`, `AutoJournalMapping`, `CashTransaction`, `Reconciliation`, `Vendor`, `Bill`, `Invoice` with `TaxInvoice`, `DocumentLine`, `DocumentPayment`, `Budget`, `FinanceSettings`, plus label maps.
- **State keys** (seeded in `seed-finance.ts`): `glAccounts, journals, autoJournals, fiscalYears, periods, cashTransactions, reconciliations, vendors, bills, invoices, budgets, financeSettings`. CRM's `accounts` are customer companies; the ledger's accounts are `glAccounts`.
- **Store module** `packages/fixtures/src/finance.ts`. Every action, blocker and helper is done and covered by `finance.test.ts`. Pages only dispatch and read.
  - **Actions:** `gl/upsert`, `gl/import`, `gl/remove`, `gl/setOpening`, `journals/save` (draft), `journals/post`, `journals/void`, `journals/reverse`, `autoJournals/update`, `years/open`, `years/close`, `periods/close`, `periods/reopen`, `cash/record`, `cash/reconcile`, `vendors/upsert`, `bills/save`, `bills/post`, `bills/void`, `bills/pay`, `invoices/save`, `invoices/issue`, `invoices/void`, `invoices/receive`, `invoices/taxInvoice`, `budgets/set`, `financeSettings/update`.
  - **Builders:** `buildCashTx(state, draft, at, by)` for cash dialogs; `nextBillCode`, `nextInvoiceCode`, `nextVendorCode`, `blankLine()`; `newId('jnl')` for the `journalId` of a payment or receipt; `newId('jnl')` plus `nextJournalCode` are applied by `journals/save` for a new draft (send `code: ''`).
  - **Amounts:** `journalTotals`, `documentTotals`, `billTotals`, `invoiceTotals`, `settleState`, `isOverdue(dueDate, totals, nowMs)`, `signed`, `debitNormal`.
  - **Ledger reads:** `accountBalance(s, id, asOf?)`, `postedLines`, `trialBalance(s, from, to)`, `incomeStatement(s, from, to)`, `balanceSheet(s, asOf)` (with `difference`, zero when balanced), `cashFlow(s, from, to)`, `generalLedger(s, accountId, from, to)`, `changesInEquity(s, year)`, `budgetVsActual(s, year)`, `receivableAging(s, nowMs)`, `payableAging(s, nowMs)` with `AGING_BUCKETS`, `reconciledIds(s, accountId)`, `customerName`, `accountLabel`, `cashAccounts`.
  - **Periods:** `periodFor`, `dateBlocker`, `monthLabel`, `monthRange`, `yearRange`, `monthOf`.
  - **Auto-journals:** `postAutoJournals` runs after every action. Payments marked paid, refunds, paid commission statements and paid settlements each post a journal with `source: 'auto'` and a `ref` to the record. When the date's period is closed the journal lands as a draft.
- **Permissions:**
  - `finance.view`: every page.
  - `ledger.manage`: accounts, journals, mappings, budgets, finance settings.
  - `cash.manage`: cash and bank.
  - `billing.manage`: vendors, bills, invoices, faktur, payments, receipts.
  - `period.close`: periods and years.
  - Hide what a role cannot do.
- **Routes registered** in `router.tsx` under `/console/finance` with `FinanceLayout` (`console/sections.tsx`). The section tabs are Overview, Journals, Chart of accounts, Cash and bank, Payables, Receivables, Reports and Setup. Paths live in `components/links.tsx` (`paths.journals`, `paths.journal(id)`, `paths.bill(id)` and the rest).
- **Shared parts** in `console/finance/parts.tsx`:
  - `AccountSelect`: grouped by type, filterable by type or cash.
  - `Money`: rupiah, tabular figures.
  - `DocumentLinesEditor`: bill and invoice lines with totals.
  - `TotalsBlock`.
  - `JournalStatusBadge` and `SettleBadge` (unpaid, part paid, paid, overdue).
  - `SubTabs`: second-level links for a tab that spans pages.

  Use them and do not copy them. If a part needs a change, make the smallest edit and say so in your report.
- **Storage version** is 9. Changing a seeded shape needs another bump: tell the integrator.

## Shared-file rules (four agents run at once)

- Do not edit `packages/types`, `packages/fixtures`, the router, `nav.ts`, `links.tsx`, `sections.tsx`, the kit or another agent's files. If the store lacks something, say so in your report with the exact helper you wanted; do not work around a blocker in the page.
- `console/finance/parts.tsx` is shared: small exact-string edits only, and only for something two pages need.
- Dates on forms use `toDateInput` and `fromDateInput` from fixtures. Amount inputs take plain digits; show the formatted figure beside them.
- Every mutation goes through `useAct()` (toast on success, blocker text on refusal). A disabled button names its blocker in `title`, using `blockerFor`.
- Tables filter: search plus chips with counts on their key column. Every list keeps its filters in the URL (`useSearchParams`) like `PaymentPages`.
- Check your pages at 1280 and 375 wide, with no sideways scroll and one h1. Run `pnpm -r typecheck` and `pnpm test` before reporting.

## Agent A: Ledger (journals, chart of accounts, setup)

Own `console/finance/JournalPages.tsx`, `AccountPages.tsx` and `LedgerSetupPages.tsx`.

- **Journals** (`JournalsPage`):
  - Stat tiles: drafts, posted this month, auto-journals this month, void.
  - Filter chips by status and source, a period picker, search by code or memo.
  - Columns: code, date, memo, source, debit total, status.
  - "New journal" for `ledger.manage`.
- **Journal editor** (`JournalEditorPage`, new and `:id/edit` for drafts only):
  - Date, memo, a lines grid (account, line memo, debit, credit) with add and remove.
  - A running difference that turns green at zero.
  - "Save draft" and "Save and post" (save, then post).
  - Show `journalBlocker` text under the grid after the first submit.
- **Journal detail** (`JournalDetailPage`):
  - Ink hero with code, date and status.
  - A source link to the payment, statement, settlement, cash transaction, bill or invoice (`ref`).
  - Lines table with totals.
  - Actions: Post (draft), Edit (manual draft), Void with a reason (manual), Reverse with a date (posted).
  - Show the reversal and the original as links to each other.
- **Chart of accounts** (`GlAccountsPage`):
  - Grouped by type, with code, name, cash flag, opening balance and current balance (`accountBalance`).
  - Filter chips by type, an inactive toggle, search.
  - Add and edit dialog: code, name, type, cash account with bank details, cash flow group, active.
  - "Import CSV": columns `code,name,type,opening`. Preview the rows with the import blocker before confirming `gl/import`. Offer a template download through `lib/csv.ts`.
  - "Opening balances": a sheet listing every account with an amount input and a live difference. It saves through `gl/setOpening`.
  - Delete, for unused accounts.
- **Account ledger** (`GlAccountDetailPage`):
  - `generalLedger` for a date range (default this year): opening, rows with running balance, closing.
  - Rows link to journals.
  - Export CSV.
- **Setup, one file with three pages** (`LedgerSetupPages.tsx`; `SubTabs` across Fiscal periods, Auto-journals and Finance settings):
  - `PeriodsPage`:
    - Fiscal years with status.
    - Twelve period rows per year with Close and Reopen, which state their blocker.
    - "Open next year" and "Close year". Close year first shows a preview of the closing entry (net income moved to retained earnings) in a dialog.
  - `AutoJournalsPage`:
    - One row per `AUTO_JOURNAL_EVENT_LABEL`: enabled switch, debit and credit `AccountSelect`.
    - The count of auto-journals each event posted, linking to the journals list filtered by source `auto`.
  - `FinanceSettingsPage`:
    - VAT rate.
    - Control accounts: receivable, payable, VAT in, VAT out, retained earnings, default cash.
    - Faktur pajak range: prefix, next and last, with the count left.

## Agent B: Cash and bank, payables

Own `console/finance/CashPages.tsx` and `PayablePages.tsx`.

- **Cash and bank** (`CashPage`):
  - One card per cash account: balance, bank details, unreconciled count. The card opens `CashAccountPage`.
  - Actions "Cash in", "Cash out" and "Transfer" (`cash.manage`) open one dialog with a kind switch: date, from or to account, counter account (non-cash for in and out, cash for a transfer), amount, memo, reference. It dispatches `cash/record` with `buildCashTx`.
  - Below the cards, a transactions table: code, date, kind, accounts, amount. Filter by kind and account, with search.
- **Account page** (`CashAccountPage`):
  - The account's ledger rows (`generalLedger`) with a reconciled tick per journal.
  - A "Reconcile" button.
- **Reconcile** (`ReconcilePage`):
  - Inputs: statement date and statement ending balance.
  - The unreconciled journals touching the account up to that date, with checkboxes.
  - Live figures: cleared balance (last reconciliation's balance plus ticked movements) against the statement, and the difference.
  - "Finish" is enabled at a zero difference and dispatches `cash/reconcile`. A difference is allowed only after a confirm that names it.
  - History of past reconciliations.
- **Payables** (`SubTabs` across Bills, Vendors and Aging; aging is a section on the bills page with an anchor or a toggle, your call):
  - `VendorsPage`:
    - Table with search.
    - Add and edit dialog: name, NPWP, phone, email, bank account, terms.
    - Open balance per vendor.
  - `BillsPage`:
    - Stat tiles: open, overdue, due this week, paid this month. They act as filters.
    - Chips by status and settle state.
    - Columns: code, vendor, vendor ref, date, due, total, balance, badge.
    - The AP aging table from `payableAging` (vendor rows by bucket, totals), with Export CSV.
  - `BillEditorPage` (new and draft edit):
    - Vendor (sets the due date from terms), vendor ref, dates.
    - `DocumentLinesEditor` with `accountTypes={['expense', 'asset']}`.
    - VAT switch (0 or `financeSettings.vatPct`), memo.
    - "Save draft" and "Save and post".
  - `BillDetailPage`:
    - Hero, lines, `TotalsBlock showPaid`.
    - Journal link.
    - Payments list.
    - Actions: Post, Edit, Void, "Record payment". The payment dialog has date, cash account, amount (default balance) and reference, and dispatches `bills/pay` with `newId('jnl')`.

## Agent C: Receivables and faktur pajak

Own `console/finance/ReceivablePages.tsx`.

- **`InvoicesPage`:**
  - Stat tiles: outstanding, overdue, issued this month, collected this month.
  - Chips: status, settle state, customer kind (buyer, B2B company, partner), plus "needs faktur" (issued, VAT above 0, no faktur).
  - Columns: code, customer, date, due, total, balance, faktur number, badge.
  - The AR aging table from `receivableAging`, with Export CSV.
  - A receipts tab listing every receipt across invoices.
- **`InvoiceEditorPage`** (new and draft edit):
  - Customer kind, then a customer picker over `contacts`, `accounts` (B2B) or `partners`.
  - Optional deal and listing pickers.
  - Dates, due in 14 days by default.
  - `DocumentLinesEditor` with `accountTypes={['revenue']}`.
  - VAT switch, memo.
  - "Save draft" and "Save and issue".
  - Prefill from `?dealId=` (the deal's contact, the listing, a commission line at the deal value times the listing's profit-share commission) so a deal page can link here later.
- **`InvoiceDetailPage`:**
  - Hero, lines, `TotalsBlock showPaid`, journal link, receipts.
  - Actions: Issue, Edit, Void, "Record receipt" (`invoices/receive`).
  - "Issue faktur pajak": a dialog for the buyer's NPWP, which shows the number it will take (`taxInvoiceNumber(financeSettings)`).
  - **Print:** a printable invoice through `components/Letter.tsx`, with the company letterhead, bill-to, lines, VAT and total, bank details from the default cash account, and the faktur number when issued. Check print preview.

## Agent D: Overview, reports, budgets

Own `console/finance/OverviewPage.tsx` and `ReportPages.tsx`.

- **`FinanceOverviewPage`:**
  - Ink hero with cash on hand (all cash accounts) and a sparkline of the last 30 days.
  - An accent card for overdue receivables.
  - Stat cards: payables due in 7 days, this month's net income, draft journals, unreconciled cash lines.
  - A 10-month revenue against expense column chart (kit `charts` recipe: grey context, accent highlight on the current month).
  - Lists: next payables due, largest overdue invoices, latest auto-journals.
  - Every card links to its page.
- **`FinanceReportsPage`:** a card per report linking to `paths.financeReport(kind)`, plus a Budgets card. The kinds:
  - `balance-sheet`
  - `income-statement`
  - `cash-flow`
  - `trial-balance`
  - `general-ledger`
  - `equity`
  - `budget`
- **`FinanceReportPage`**, one component switching on `:kind`:
  - **Controls:** a range control (month, quarter or year, with an as-of date for the balance sheet) kept in the URL. Optional comparison with the previous period on the income statement and balance sheet.
  - **Output:** each report renders as a statement: grouped sections, indented accounts, totals, rupiah in tabular figures. Account rows link to the account ledger.
  - **Balance check:** the balance sheet shows a success banner when `difference` is 0, and a danger banner naming the gap otherwise.
  - **General ledger:** takes an account picker or "all accounts" (one block per account with movement).
  - **Budget:** `budgetVsActual` by month for the year, variance in rupiah and percent. Over-budget expense and under-budget revenue show in danger tint.
  - **Export:** CSV through `lib/csv.ts` and Print, with a print stylesheet that hides chrome.
- **`BudgetsPage`** (`SubTabs` with Reports): pick a year. The grid shows revenue and expense accounts with 12 monthly inputs (phones get one account at a time with a month list) and a "Fill all months" helper. Each row saves with `budgets/set`. Show the year total against last year's actual.
