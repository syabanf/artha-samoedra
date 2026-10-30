import type {
  AutoJournalEvent,
  AutoJournalMapping,
  Bill,
  Budget,
  CashFlowGroup,
  CashTransaction,
  DocumentLine,
  DocumentPayment,
  FinanceSettings,
  FiscalPeriod,
  FiscalYear,
  GlAccount,
  GlAccountType,
  Invoice,
  JournalEntry,
  JournalLine,
  JournalSource,
  Reconciliation,
  Vendor,
} from '@artha/types'
import { PAYMENT_KIND_LABEL } from '@artha/types'
import { DAY, toMs } from './clock'
import { fmtIdr, newId, nextCode } from './format'
import { payrollTotals } from './hr'
import { statementTotal } from './ops'
import { patchById, upsert } from './rows'
import type { AppAction, AppState } from './store'

export type FinanceAction =
  | { type: 'gl/upsert'; account: GlAccount }
  /** CSV import: rows match existing accounts by code, the rest are added. */
  | { type: 'gl/import'; accounts: GlAccount[] }
  | { type: 'gl/remove'; id: string }
  | { type: 'gl/setOpening'; balances: Record<string, number> }
  | { type: 'journals/save'; journal: JournalEntry }
  | { type: 'journals/post'; id: string }
  | { type: 'journals/void'; id: string; reason: string }
  | { type: 'journals/reverse'; id: string; date: string }
  | { type: 'autoJournals/update'; id: string; patch: Partial<Omit<AutoJournalMapping, 'id' | 'event'>> }
  | { type: 'years/open'; year: number }
  | { type: 'years/close'; id: string }
  | { type: 'periods/close'; id: string }
  | { type: 'periods/reopen'; id: string }
  | { type: 'cash/record'; tx: CashTransaction }
  | { type: 'cash/reconcile'; reconciliation: Reconciliation }
  | { type: 'vendors/upsert'; vendor: Vendor }
  | { type: 'bills/save'; bill: Bill }
  | { type: 'bills/post'; id: string }
  | { type: 'bills/void'; id: string }
  | { type: 'bills/pay'; id: string; payment: DocumentPayment }
  | { type: 'invoices/save'; invoice: Invoice }
  | { type: 'invoices/issue'; id: string }
  | { type: 'invoices/void'; id: string }
  | { type: 'invoices/receive'; id: string; receipt: DocumentPayment }
  | { type: 'invoices/taxInvoice'; id: string; buyerTaxId: string }
  | { type: 'budgets/set'; budget: Budget }
  | { type: 'financeSettings/update'; patch: Partial<FinanceSettings> }

const FINANCE_PREFIXES = ['gl/', 'journals/', 'autoJournals/', 'years/', 'periods/', 'cash/', 'vendors/', 'bills/', 'invoices/', 'budgets/', 'financeSettings/']

// ---------------------------------------------------------------- amounts

/** Assets and expenses grow on the debit side; liabilities, equity and revenue on the credit side. */
export const debitNormal = (type: GlAccountType) => type === 'asset' || type === 'expense'

/** A movement in the account's normal direction is positive. */
export const signed = (type: GlAccountType, debit: number, credit: number) => (debitNormal(type) ? debit - credit : credit - debit)

export const journalTotals = (lines: JournalLine[]) => ({
  debit: lines.reduce((n, l) => n + l.debit, 0),
  credit: lines.reduce((n, l) => n + l.credit, 0),
})

export const lineAmount = (l: DocumentLine) => l.qty * l.unitPrice

export interface DocumentTotals {
  subtotal: number
  tax: number
  total: number
  paid: number
  balance: number
}

export const documentTotals = (d: Pick<Bill, 'lines' | 'taxPct'> & { paid: DocumentPayment[] }): DocumentTotals => {
  const subtotal = d.lines.reduce((n, l) => n + lineAmount(l), 0)
  const tax = Math.round((subtotal * d.taxPct) / 100)
  const paid = d.paid.reduce((n, p) => n + p.amount, 0)
  return { subtotal, tax, total: subtotal + tax, paid, balance: subtotal + tax - paid }
}
export const billTotals = (b: Bill) => documentTotals({ ...b, paid: b.payments })
export const invoiceTotals = (i: Invoice) => documentTotals({ ...i, paid: i.receipts })

/** Unpaid, part paid or paid, for posted bills and issued invoices. */
export type SettleState = 'unpaid' | 'partial' | 'paid'
export const SETTLE_STATE_LABEL: Record<SettleState, string> = { unpaid: 'Unpaid', partial: 'Part paid', paid: 'Paid' }
export const settleState = (t: DocumentTotals): SettleState => (t.balance <= 0 ? 'paid' : t.paid > 0 ? 'partial' : 'unpaid')

export const isOverdue = (dueDate: string, t: DocumentTotals, nowMs: number) => t.balance > 0 && toMs(dueDate) < nowMs

// ---------------------------------------------------------------- periods

export const monthOf = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const periodFor = (s: AppState, iso: string): FiscalPeriod | undefined => s.periods.find((p) => p.month === monthOf(iso))

/** Why nothing can post on this date, or null. */
export const dateBlocker = (s: AppState, iso: string): string | null => {
  const p = periodFor(s, iso)
  if (!p) return `Fiscal year ${new Date(iso).getFullYear()} is not open. Open it under Fiscal periods first.`
  return p.status === 'closed' ? `The ${monthLabel(p.month)} period is closed. Pick a date in an open period or reopen it.` : null
}

export const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export const yearRange = (year: number) => ({ from: new Date(`${year}-01-01T00:00:00`).toISOString(), to: new Date(`${year}-12-31T23:59:59`).toISOString() })

export const monthRange = (month: string) => {
  const from = new Date(`${month}-01T00:00:00`)
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 1)
  return { from: from.toISOString(), to: new Date(to.getTime() - 1000).toISOString() }
}

// ---------------------------------------------------------------- ledger

const accountOf = (s: AppState, id: string) => s.glAccounts.find((a) => a.id === id)

export const accountLabel = (s: AppState, id: string) => {
  const a = accountOf(s, id)
  return a ? `${a.code} · ${a.name}` : 'Unknown account'
}

export const cashAccounts = (s: AppState) => s.glAccounts.filter((a) => a.isCash && a.active)

export interface PostedLine extends JournalLine {
  journal: JournalEntry
}

/** Posted lines dated inside [from, to]; either end may be left open. */
export const postedLines = (s: AppState, from?: string, to?: string): PostedLine[] => {
  const lo = from ? toMs(from) : -Infinity
  const hi = to ? toMs(to) : Infinity
  return s.journals
    .filter((j) => j.status === 'posted' && toMs(j.date) >= lo && toMs(j.date) <= hi)
    .flatMap((j) => j.lines.map((l) => ({ ...l, journal: j })))
}

/** Balance in the account's normal direction at the end of `asOf` (or today's ledger when left out). */
export const accountBalance = (s: AppState, id: string, asOf?: string) => {
  const a = accountOf(s, id)
  if (!a) return 0
  return postedLines(s, undefined, asOf)
    .filter((l) => l.accountId === id)
    .reduce((n, l) => n + signed(a.type, l.debit, l.credit), a.opening)
}

const dayBefore = (iso: string) => new Date(toMs(iso) - 1).toISOString()

export interface TrialRow {
  account: GlAccount
  /** Balance before the range, in the normal direction. */
  opening: number
  debit: number
  credit: number
  closing: number
}

export const trialBalance = (s: AppState, from: string, to: string): TrialRow[] => {
  const range = postedLines(s, from, to)
  return [...s.glAccounts]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((account) => {
      const mine = range.filter((l) => l.accountId === account.id)
      const { debit, credit } = journalTotals(mine)
      const opening = accountBalance(s, account.id, dayBefore(from))
      return { account, opening, debit, credit, closing: opening + signed(account.type, debit, credit) }
    })
    .filter((r) => r.opening || r.debit || r.credit)
}

export interface StatementRow {
  account: GlAccount
  amount: number
}

const movement = (s: AppState, type: GlAccountType, from: string, to: string): StatementRow[] =>
  s.glAccounts
    .filter((a) => a.type === type)
    .map((account) => {
      const lines = postedLines(s, from, to).filter((l) => l.accountId === account.id && l.journal.source !== 'closing')
      const { debit, credit } = journalTotals(lines)
      return { account, amount: signed(type, debit, credit) }
    })
    .filter((r) => r.amount)
    .sort((a, b) => a.account.code.localeCompare(b.account.code))

const sum = (rows: StatementRow[]) => rows.reduce((n, r) => n + r.amount, 0)

export const incomeStatement = (s: AppState, from: string, to: string) => {
  const revenue = movement(s, 'revenue', from, to)
  const expense = movement(s, 'expense', from, to)
  return { revenue, expense, totalRevenue: sum(revenue), totalExpense: sum(expense), netIncome: sum(revenue) - sum(expense) }
}

const balances = (s: AppState, type: GlAccountType, asOf: string): StatementRow[] =>
  s.glAccounts
    .filter((a) => a.type === type)
    .map((account) => ({ account, amount: accountBalance(s, account.id, asOf) }))
    .filter((r) => r.amount)
    .sort((a, b) => a.account.code.localeCompare(b.account.code))

/** Profit not yet moved to retained earnings: what revenue and expense accounts still hold. */
const unclosedEarnings = (s: AppState, asOf: string) => sum(balances(s, 'revenue', asOf)) - sum(balances(s, 'expense', asOf))

export const balanceSheet = (s: AppState, asOf: string) => {
  const assets = balances(s, 'asset', asOf)
  const liabilities = balances(s, 'liability', asOf)
  const equity = balances(s, 'equity', asOf)
  const earnings = unclosedEarnings(s, asOf)
  const totalEquity = sum(equity) + earnings
  return {
    assets,
    liabilities,
    equity,
    earnings,
    totalAssets: sum(assets),
    totalLiabilities: sum(liabilities),
    totalEquity,
    /** Zero when the books balance. */
    difference: sum(assets) - sum(liabilities) - totalEquity,
  }
}

export interface CashFlowRow {
  account: GlAccount
  amount: number
}

/** Direct method: every non-cash line in a journal that moves cash, grouped by that account's cash flow group. */
export const cashFlow = (s: AppState, from: string, to: string) => {
  const cashIds = new Set(s.glAccounts.filter((a) => a.isCash).map((a) => a.id))
  const totals = new Map<string, number>()
  for (const j of s.journals) {
    if (j.status !== 'posted' || toMs(j.date) < toMs(from) || toMs(j.date) > toMs(to)) continue
    if (!j.lines.some((l) => cashIds.has(l.accountId))) continue
    for (const l of j.lines) if (!cashIds.has(l.accountId)) totals.set(l.accountId, (totals.get(l.accountId) ?? 0) + l.credit - l.debit)
  }
  const rows = [...totals].flatMap(([id, amount]) => {
    const account = accountOf(s, id)
    return account && amount ? [{ account, amount }] : []
  })
  const groups = (['operating', 'investing', 'financing'] as CashFlowGroup[]).map((group) => {
    const items = rows.filter((r) => r.account.cashFlow === group).sort((a, b) => a.account.code.localeCompare(b.account.code))
    return { group, rows: items, total: items.reduce((n, r) => n + r.amount, 0) }
  })
  const opening = [...cashIds].reduce((n, id) => n + accountBalance(s, id, dayBefore(from)), 0)
  const net = groups.reduce((n, g) => n + g.total, 0)
  return { groups, opening, net, closing: opening + net }
}

export interface LedgerRow {
  journal: JournalEntry
  memo: string
  debit: number
  credit: number
  balance: number
}

export const generalLedger = (s: AppState, accountId: string, from: string, to: string) => {
  const a = accountOf(s, accountId)
  const opening = accountBalance(s, accountId, dayBefore(from))
  let balance = opening
  const rows: LedgerRow[] = postedLines(s, from, to)
    .filter((l) => l.accountId === accountId)
    .sort((x, y) => x.journal.date.localeCompare(y.journal.date) || x.journal.code.localeCompare(y.journal.code))
    .map((l) => {
      balance += a ? signed(a.type, l.debit, l.credit) : 0
      return { journal: l.journal, memo: l.memo || l.journal.memo, debit: l.debit, credit: l.credit, balance }
    })
  return { opening, rows, closing: balance }
}

export const changesInEquity = (s: AppState, year: number) => {
  const { from, to } = yearRange(year)
  const rows = s.glAccounts
    .filter((a) => a.type === 'equity')
    .map((account) => {
      const opening = accountBalance(s, account.id, dayBefore(from))
      const lines = postedLines(s, from, to).filter((l) => l.accountId === account.id)
      const closingEntry = lines.filter((l) => l.journal.source === 'closing')
      const other = lines.filter((l) => l.journal.source !== 'closing')
      const profit = closingEntry.reduce((n, l) => n + signed('equity', l.debit, l.credit), 0)
      const movements = other.reduce((n, l) => n + signed('equity', l.debit, l.credit), 0)
      return { account, opening, profit, movements, closing: opening + profit + movements }
    })
    .filter((r) => r.opening || r.profit || r.movements)
  const netIncome = incomeStatement(s, from, to).netIncome
  const closedProfit = rows.reduce((n, r) => n + r.profit, 0)
  return { rows, netIncome, unclosed: netIncome - closedProfit }
}

export const budgetVsActual = (s: AppState, year: number) =>
  s.budgets
    .filter((b) => b.year === year)
    .flatMap((b) => {
      const account = accountOf(s, b.accountId)
      if (!account) return []
      const actual = b.months.map((_, m) => {
        const { from, to } = monthRange(`${year}-${String(m + 1).padStart(2, '0')}`)
        return movement(s, account.type, from, to).find((r) => r.account.id === account.id)?.amount ?? 0
      })
      const budget = b.months.reduce((n, x) => n + x, 0)
      const spent = actual.reduce((n, x) => n + x, 0)
      return [{ budget: b, account, actual, total: budget, totalActual: spent, variance: spent - budget }]
    })
    .sort((a, b) => a.account.code.localeCompare(b.account.code))

export const AGING_BUCKETS = ['Current', '1-30 days', '31-60 days', '61-90 days', 'Over 90 days'] as const

export const agingBucket = (dueDate: string, nowMs: number) => {
  const late = Math.floor((nowMs - toMs(dueDate)) / DAY)
  return late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : late <= 90 ? 3 : 4
}

/** Open balances by party and bucket. */
export const aging = <T>(rows: { party: string; dueDate: string; balance: number; row: T }[], nowMs: number) => {
  const byParty = new Map<string, number[]>()
  for (const r of rows) {
    if (r.balance <= 0) continue
    const buckets = byParty.get(r.party) ?? [0, 0, 0, 0, 0]
    buckets[agingBucket(r.dueDate, nowMs)] += r.balance
    byParty.set(r.party, buckets)
  }
  const parties = [...byParty].map(([party, buckets]) => ({ party, buckets, total: buckets.reduce((n, x) => n + x, 0) })).sort((a, b) => b.total - a.total)
  const totals = AGING_BUCKETS.map((_, i) => parties.reduce((n, p) => n + p.buckets[i], 0))
  return { parties, totals, total: totals.reduce((n, x) => n + x, 0) }
}

export const receivableAging = (s: AppState, nowMs: number) =>
  aging(
    s.invoices.filter((i) => i.status === 'issued').map((i) => ({ party: customerName(s, i), dueDate: i.dueDate, balance: invoiceTotals(i).balance, row: i })),
    nowMs,
  )

export const payableAging = (s: AppState, nowMs: number) =>
  aging(
    s.bills.filter((b) => b.status === 'posted').map((b) => ({ party: s.vendors.find((v) => v.id === b.vendorId)?.name ?? 'Unknown vendor', dueDate: b.dueDate, balance: billTotals(b).balance, row: b })),
    nowMs,
  )

export const customerName = (s: AppState, i: Pick<Invoice, 'customerKind' | 'customerId'>) => {
  const list = i.customerKind === 'contact' ? s.contacts : i.customerKind === 'account' ? s.accounts : s.partners
  return list.find((x) => x.id === i.customerId)?.name ?? 'Unknown customer'
}

/** The live journal a payment, statement, settlement, bill or invoice posted, for a link back to the ledger. */
export const journalFor = (s: AppState, kind: string, id: string) => s.journals.find((j) => j.ref?.kind === kind && j.ref.id === id && j.status !== 'void')

/** Journal ids ticked on a reconciliation of this account. */
export const reconciledIds = (s: AppState, accountId: string) =>
  new Set(s.reconciliations.filter((r) => r.accountId === accountId).flatMap((r) => r.journalIds))

/** Posted journals touching the account that no reconciliation has ticked yet. */
export const unreconciledJournals = (s: AppState, accountId: string) => {
  const done = reconciledIds(s, accountId)
  return s.journals.filter((j) => j.status === 'posted' && !done.has(j.id) && j.lines.some((l) => l.accountId === accountId))
}

export const lastReconciliation = (s: AppState, accountId: string) =>
  s.reconciliations.filter((r) => r.accountId === accountId).sort((a, b) => b.statementDate.localeCompare(a.statementDate))[0]

// ---------------------------------------------------------------- journal builders

const dr = (accountId: string, amount: number, memo = ''): JournalLine => ({ accountId, debit: amount, credit: 0, memo })
const cr = (accountId: string, amount: number, memo = ''): JournalLine => ({ accountId, debit: 0, credit: amount, memo })

export const nextJournalCode = (journals: JournalEntry[], date: string) =>
  nextCode(
    journals.map((j) => j.code),
    `JV-${String(new Date(date).getFullYear()).slice(2)}-`,
    4,
  )

export interface JournalDraft {
  id?: string
  date: string
  memo: string
  source: JournalSource
  ref: JournalEntry['ref']
  lines: JournalLine[]
  events?: AutoJournalEvent[]
}

/** A posted entry, or a draft when the date's period is closed or not open, so a later post can catch it up. */
export const buildJournal = (s: AppState, d: JournalDraft, at: string, by: string): JournalEntry => {
  const open = !dateBlocker(s, d.date)
  return {
    id: d.id ?? newId('jnl'),
    code: nextJournalCode(s.journals, d.date),
    date: d.date,
    memo: d.memo,
    source: d.source,
    ref: d.ref,
    ...(d.events && { events: d.events }),
    lines: d.lines.filter((l) => l.debit || l.credit),
    status: open ? 'posted' : 'draft',
    reversalOf: null,
    voidReason: '',
    postedAt: open ? at : null,
    createdBy: by,
    createdAt: at,
  }
}

export const cashLines = (tx: CashTransaction): JournalLine[] =>
  tx.kind === 'in' ? [dr(tx.accountId, tx.amount), cr(tx.counterAccountId, tx.amount)] : [dr(tx.counterAccountId, tx.amount), cr(tx.accountId, tx.amount)]

export const billLines = (b: Bill, f: FinanceSettings): JournalLine[] => {
  const t = billTotals(b)
  return [...b.lines.map((l) => dr(l.accountId, lineAmount(l), l.description)), dr(f.vatInAccountId, t.tax, 'Input VAT'), cr(f.payableAccountId, t.total)]
}

export const invoiceLines = (i: Invoice, f: FinanceSettings): JournalLine[] => {
  const t = invoiceTotals(i)
  return [dr(f.receivableAccountId, t.total), ...i.lines.map((l) => cr(l.accountId, lineAmount(l), l.description)), cr(f.vatOutAccountId, t.tax, 'Output VAT')]
}

const append = (s: AppState, j: JournalEntry): AppState => ({ ...s, journals: [j, ...s.journals] })

// ---------------------------------------------------------------- auto-journals

const mappingFor = (s: AppState, event: AutoJournalEvent) => s.autoJournals.find((m) => m.event === event && m.enabled)

const PAYMENT_EVENT: Record<string, AutoJournalEvent> = {
  booking_fee: 'booking_fee_paid',
  down_payment: 'down_payment_paid',
  deposit: 'deposit_paid',
  refund: 'refund_paid',
}

/** Journals that payments, commission statements and settlements turned paid by this action call for. */
export const autoJournalDrafts = (prev: AppState, next: AppState, at: string): JournalDraft[] => {
  const drafts: JournalDraft[] = []
  const draft = (date: string, memo: string, ref: NonNullable<JournalEntry['ref']>, parts: [AutoJournalEvent, number, string][]) => {
    const lines: JournalLine[] = []
    const events: AutoJournalEvent[] = []
    for (const [event, amount, lineMemo] of parts) {
      const m = mappingFor(next, event)
      if (!m || amount <= 0) continue
      lines.push(dr(m.debitAccountId, amount, lineMemo), cr(m.creditAccountId, amount, lineMemo))
      events.push(event)
    }
    if (lines.length) drafts.push({ date, memo, source: 'auto', ref, lines, events })
  }
  for (const p of next.payments) {
    if (p.status !== 'paid' || prev.payments.find((x) => x.id === p.id)?.status === 'paid') continue
    const label = `${PAYMENT_KIND_LABEL[p.kind]} ${p.code}`
    draft(p.paidAt ?? at, label, { kind: 'payment', id: p.id, label: p.code }, [[PAYMENT_EVENT[p.kind], p.amount, label]])
  }
  for (const st of next.statements) {
    if (st.status !== 'paid' || prev.statements.find((x) => x.id === st.id)?.status === 'paid') continue
    const label = `Commission statement ${st.code}`
    draft(st.paidAt ?? at, label, { kind: 'statement', id: st.id, label: st.code }, [['commission_statement_paid', statementTotal(st), label]])
  }
  for (const run of next.payrollRuns) {
    if (run.status !== 'paid' || prev.payrollRuns.find((x) => x.id === run.id)?.status === 'paid') continue
    const label = `Payroll ${run.month}, net pay`
    draft(run.paidAt ?? at, `Payroll ${run.code}`, { kind: 'payroll', id: run.id, label: run.code }, [['payroll_paid', payrollTotals(run.slips).net, label]])
  }
  for (const st of next.settlements) {
    if (st.status !== 'paid' || prev.settlements.find((x) => x.id === st.id)?.status === 'paid') continue
    const shares = st.lines.filter((l) => l.kind === 'partner' || l.kind === 'other').reduce((n, l) => n + l.amount, 0)
    draft(st.paidAt ?? at, `Settlement ${st.code}`, { kind: 'settlement', id: st.id, label: st.code }, [
      ['settlement_collected', st.commission, `Commission ${st.code}`],
      ['partner_share_paid', shares, `Partner and other shares ${st.code}`],
    ])
  }
  return drafts
}

/** Runs after every action: money that turned paid elsewhere lands in the ledger. */
export const postAutoJournals = (prev: AppState, next: AppState, at: string, by: string): AppState =>
  autoJournalDrafts(prev, next, at).reduce((s, d) => append(s, buildJournal(s, d, at, by)), next)

// ---------------------------------------------------------------- blockers

export const journalBlocker = (s: AppState, j: Pick<JournalEntry, 'date' | 'lines' | 'memo'>): string | null => {
  if (!j.memo.trim()) return 'Describe the entry in the memo.'
  const lines = j.lines.filter((l) => l.debit || l.credit)
  if (lines.length < 2) return 'A journal needs at least two lines.'
  if (lines.some((l) => !l.accountId)) return 'Pick an account on every line.'
  if (lines.some((l) => l.debit < 0 || l.credit < 0)) return 'Amounts cannot be negative.'
  if (lines.some((l) => l.debit && l.credit)) return 'A line takes a debit or a credit, not both.'
  if (lines.some((l) => !accountOf(s, l.accountId)?.active)) return 'One of the accounts is inactive.'
  const { debit, credit } = journalTotals(lines)
  if (debit !== credit) return `Debits (${fmtIdr(debit)}) and credits (${fmtIdr(credit)}) must be equal.`
  return dateBlocker(s, j.date)
}

const accountBlocker = (s: AppState, a: GlAccount): string | null => {
  if (!/^\d-\d{4}$/.test(a.code)) return 'Use a code like 1-1200: the type digit, a dash and four digits.'
  if (!a.name.trim()) return 'Name the account.'
  if (s.glAccounts.some((x) => x.id !== a.id && x.code === a.code)) return `Account code ${a.code} is already in use.`
  const old = accountOf(s, a.id)
  if (old?.system && (!a.active || old.type !== a.type)) return 'The ledger posts to this control account on its own. It stays active with its type.'
  if (a.isCash && a.type !== 'asset') return 'Only an asset account can be a cash or bank account.'
  return null
}

const IMPORT_TYPE_DIGIT: Record<GlAccountType, string> = { asset: '1', liability: '2', equity: '3', revenue: '4', expense: '5' }

const documentBlocker = (s: AppState, d: Pick<Bill, 'lines' | 'date' | 'dueDate' | 'taxPct'>) => {
  if (!d.lines.length) return 'Add at least one line.'
  if (d.lines.some((l) => !l.description.trim())) return 'Describe every line.'
  if (d.lines.some((l) => !accountOf(s, l.accountId))) return 'Pick an account on every line.'
  if (d.lines.some((l) => l.qty <= 0 || l.unitPrice <= 0)) return 'Quantity and price must be above zero.'
  if (toMs(d.dueDate) < toMs(d.date)) return 'The due date cannot come before the document date.'
  if (d.taxPct < 0) return 'The tax rate cannot be negative.'
  return null
}

const paymentBlocker = (s: AppState, p: DocumentPayment, balance: number) => {
  if (p.amount <= 0) return 'Enter an amount above Rp 0.'
  if (p.amount > balance) return `The amount is more than the ${fmtIdr(balance)} still open.`
  if (!accountOf(s, p.cashAccountId)?.isCash) return 'Pick a cash or bank account.'
  return dateBlocker(s, p.date)
}

export const financeBlocker = (s: AppState, a: FinanceAction): string | null => {
  switch (a.type) {
    case 'gl/upsert':
      return accountBlocker(s, a.account)
    case 'gl/import': {
      if (!a.accounts.length) return 'The file has no account rows.'
      const codes = a.accounts.map((x) => x.code)
      if (new Set(codes).size !== codes.length) return 'The file lists the same account code twice.'
      const bad = a.accounts.find((x) => !/^\d-\d{4}$/.test(x.code) || x.code[0] !== IMPORT_TYPE_DIGIT[x.type] || !x.name.trim())
      return bad ? `Row ${bad.code || '(no code)'}: the code must look like ${IMPORT_TYPE_DIGIT[bad.type]}-1200 for a ${bad.type} account, with a name.` : null
    }
    case 'gl/remove': {
      const acc = accountOf(s, a.id)
      if (!acc) return 'Account not found.'
      if (acc.system) return 'The ledger posts to this control account on its own, so it cannot be deleted.'
      if (acc.opening) return 'The account has an opening balance. Set it to zero first.'
      if (s.journals.some((j) => j.status !== 'void' && j.lines.some((l) => l.accountId === a.id))) return 'Journals use this account. Make it inactive instead.'
      return null
    }
    case 'gl/setOpening': {
      const merged = s.glAccounts.map((x) => ({ ...x, opening: a.balances[x.id] ?? x.opening }))
      const side = (t: GlAccountType[]) => merged.filter((x) => t.includes(x.type)).reduce((n, x) => n + x.opening, 0)
      const gap = side(['asset', 'expense']) - side(['liability', 'equity', 'revenue'])
      if (gap) return `Opening balances are off by ${fmtIdr(Math.abs(gap))}: assets must equal liabilities plus equity.`
      return s.periods.some((p) => p.status === 'closed') ? 'A period is closed already. Opening balances can only change before the first close.' : null
    }
    case 'journals/save': {
      const old = s.journals.find((j) => j.id === a.journal.id)
      if (old && old.status !== 'draft') return 'Only a draft can be edited. Reverse a posted entry instead.'
      if (a.journal.source !== 'manual' && !old) return 'Only manual journals are entered by hand.'
      return a.journal.memo.trim() ? null : 'Describe the entry in the memo.'
    }
    case 'journals/post': {
      const j = s.journals.find((x) => x.id === a.id)
      if (!j) return 'Journal not found.'
      return j.status === 'draft' ? journalBlocker(s, j) : 'Only a draft can be posted.'
    }
    case 'journals/void': {
      const j = s.journals.find((x) => x.id === a.id)
      if (!j) return 'Journal not found.'
      if (j.status === 'void') return 'The journal is already void.'
      if (j.source !== 'manual') return 'This entry came from another module. Correct it there, or post a reversing entry.'
      if (j.status === 'posted' && periodFor(s, j.date)?.status !== 'open') return 'The period is closed. Post a reversing entry in an open period instead.'
      return a.reason.trim() ? null : 'Give a reason for voiding.'
    }
    case 'journals/reverse': {
      const j = s.journals.find((x) => x.id === a.id)
      if (!j || j.status !== 'posted') return 'Only a posted journal can be reversed.'
      if (j.source === 'closing') return 'Reopen the fiscal year instead of reversing its closing entry.'
      if (s.journals.some((x) => x.reversalOf === j.id && x.status !== 'void')) return 'This journal is already reversed.'
      return dateBlocker(s, a.date)
    }
    case 'autoJournals/update': {
      const m = s.autoJournals.find((x) => x.id === a.id)
      if (!m) return 'Mapping not found.'
      const next = { ...m, ...a.patch }
      if (!accountOf(s, next.debitAccountId) || !accountOf(s, next.creditAccountId)) return 'Pick a debit and a credit account.'
      return next.debitAccountId === next.creditAccountId ? 'The debit and credit accounts must differ.' : null
    }
    case 'years/open': {
      if (s.fiscalYears.some((y) => y.year === a.year)) return `Fiscal year ${a.year} is already open.`
      const last = Math.max(...s.fiscalYears.map((y) => y.year))
      return a.year === last + 1 ? null : `Open fiscal year ${last + 1} next.`
    }
    case 'years/close': {
      const y = s.fiscalYears.find((x) => x.id === a.id)
      if (!y || y.status === 'closed') return 'The year is already closed.'
      const open = s.periods.filter((p) => p.year === y.year && p.status === 'open').length
      if (open) return `Close all twelve periods first; ${open} ${open === 1 ? 'is' : 'are'} still open.`
      const earlier = s.fiscalYears.find((x) => x.year < y.year && x.status === 'open')
      if (earlier) return `Close fiscal year ${earlier.year} first.`
      return s.fiscalYears.some((x) => x.year === y.year + 1) ? null : `Open fiscal year ${y.year + 1} first, so the next year's entries have somewhere to go.`
    }
    case 'periods/close': {
      const p = s.periods.find((x) => x.id === a.id)
      if (!p || p.status === 'closed') return 'The period is already closed.'
      const earlier = s.periods.find((x) => x.month < p.month && x.status === 'open')
      if (earlier) return `Close ${monthLabel(earlier.month)} first. Periods close in order.`
      const drafts = s.journals.filter((j) => j.status === 'draft' && monthOf(j.date) === p.month).length
      return drafts ? `${drafts} draft ${drafts === 1 ? 'journal is' : 'journals are'} dated in this period. Post or void ${drafts === 1 ? 'it' : 'them'} first.` : null
    }
    case 'periods/reopen': {
      const p = s.periods.find((x) => x.id === a.id)
      if (!p || p.status === 'open') return 'The period is already open.'
      if (s.fiscalYears.find((y) => y.year === p.year)?.status === 'closed') return `Fiscal year ${p.year} is closed, so its periods stay closed.`
      const later = s.periods.find((x) => x.month > p.month && x.status === 'closed')
      return later ? `Reopen ${monthLabel(later.month)} first. Periods reopen from the latest.` : null
    }
    case 'cash/record': {
      const t = a.tx
      if (t.amount <= 0) return 'Enter an amount above Rp 0.'
      if (!accountOf(s, t.accountId)?.isCash) return 'Pick a cash or bank account.'
      const counter = accountOf(s, t.counterAccountId)
      if (!counter) return t.kind === 'transfer' ? 'Pick the account the money goes to.' : 'Pick the account on the other side.'
      if (t.kind === 'transfer' && !counter.isCash) return 'A transfer goes to another cash or bank account.'
      if (t.kind !== 'transfer' && counter.isCash) return 'Use a transfer to move money between cash and bank accounts.'
      if (t.accountId === t.counterAccountId) return 'Pick two different accounts.'
      if (!t.memo.trim()) return 'Describe the transaction.'
      return dateBlocker(s, t.date)
    }
    case 'cash/reconcile': {
      const r = a.reconciliation
      if (!accountOf(s, r.accountId)?.isCash) return 'Pick a cash or bank account.'
      if (!r.journalIds.length) return 'Tick at least one transaction the statement shows.'
      const done = reconciledIds(s, r.accountId)
      return r.journalIds.some((id) => done.has(id)) ? 'Some ticked transactions are already reconciled.' : null
    }
    case 'vendors/upsert': {
      const v = a.vendor
      if (!v.name.trim()) return 'Name the vendor.'
      if (v.taxId && !/^\d{15,16}$/.test(v.taxId.replace(/\D/g, ''))) return 'An NPWP has 15 or 16 digits.'
      if (v.termsDays < 0) return 'Payment terms cannot be negative.'
      return s.vendors.some((x) => x.id !== v.id && x.name.trim().toLowerCase() === v.name.trim().toLowerCase()) ? 'A vendor with this name already exists.' : null
    }
    case 'bills/save': {
      const old = s.bills.find((b) => b.id === a.bill.id)
      if (old && old.status !== 'draft') return 'Only a draft bill can be edited.'
      if (!s.vendors.some((v) => v.id === a.bill.vendorId)) return 'Pick a vendor.'
      if (s.bills.some((b) => b.id !== a.bill.id && b.vendorId === a.bill.vendorId && a.bill.vendorRef && b.vendorRef === a.bill.vendorRef && b.status !== 'void'))
        return `This vendor's invoice ${a.bill.vendorRef} is already entered.`
      return documentBlocker(s, a.bill)
    }
    case 'bills/post': {
      const b = s.bills.find((x) => x.id === a.id)
      if (!b || b.status !== 'draft') return 'Only a draft bill can be posted.'
      return documentBlocker(s, b) ?? dateBlocker(s, b.date)
    }
    case 'bills/void': {
      const b = s.bills.find((x) => x.id === a.id)
      if (!b || b.status === 'void') return 'The bill is already void.'
      if (b.payments.length) return 'The bill has payments. It cannot be voided.'
      return b.status === 'posted' ? dateBlocker(s, b.date) : null
    }
    case 'bills/pay': {
      const b = s.bills.find((x) => x.id === a.id)
      if (!b || b.status !== 'posted') return 'Post the bill before paying it.'
      return paymentBlocker(s, a.payment, billTotals(b).balance)
    }
    case 'invoices/save': {
      const old = s.invoices.find((i) => i.id === a.invoice.id)
      if (old && old.status !== 'draft') return 'Only a draft invoice can be edited.'
      if (customerName(s, a.invoice) === 'Unknown customer') return 'Pick a customer.'
      return documentBlocker(s, a.invoice)
    }
    case 'invoices/issue': {
      const i = s.invoices.find((x) => x.id === a.id)
      if (!i || i.status !== 'draft') return 'Only a draft invoice can be issued.'
      return documentBlocker(s, i) ?? dateBlocker(s, i.date)
    }
    case 'invoices/void': {
      const i = s.invoices.find((x) => x.id === a.id)
      if (!i || i.status === 'void') return 'The invoice is already void.'
      if (i.receipts.length) return 'The invoice has receipts. It cannot be voided.'
      if (i.taxInvoice) return 'A faktur pajak was issued. Replace it with a credit note at the tax office first.'
      return i.status === 'issued' ? dateBlocker(s, i.date) : null
    }
    case 'invoices/receive': {
      const i = s.invoices.find((x) => x.id === a.id)
      if (!i || i.status !== 'issued') return 'Issue the invoice before recording a receipt.'
      return paymentBlocker(s, a.receipt, invoiceTotals(i).balance)
    }
    case 'invoices/taxInvoice': {
      const i = s.invoices.find((x) => x.id === a.id)
      if (!i || i.status !== 'issued') return 'Issue the invoice before the faktur pajak.'
      if (i.taxInvoice) return 'A faktur pajak is already issued for this invoice.'
      if (!i.taxPct) return 'The invoice carries no VAT, so it needs no faktur pajak.'
      if (!/^\d{15,16}$/.test(a.buyerTaxId.replace(/\D/g, ''))) return "Enter the buyer's NPWP: 15 or 16 digits."
      const f = s.financeSettings
      return f.taxInvoiceNext > f.taxInvoiceLast ? 'The faktur pajak number range is used up. Enter the new range in Finance settings.' : null
    }
    case 'budgets/set': {
      const acc = accountOf(s, a.budget.accountId)
      if (!acc || (acc.type !== 'revenue' && acc.type !== 'expense')) return 'Budgets apply to revenue and expense accounts.'
      if (a.budget.months.length !== 12 || a.budget.months.some((m) => m < 0)) return 'Enter twelve monthly amounts, none negative.'
      return s.budgets.some((b) => b.id !== a.budget.id && b.year === a.budget.year && b.accountId === a.budget.accountId) ? 'This account already has a budget for that year.' : null
    }
    case 'financeSettings/update': {
      const f = { ...s.financeSettings, ...a.patch }
      if (f.vatPct < 0 || f.vatPct > 100) return 'The VAT rate must be between 0% and 100%.'
      if (f.taxInvoiceNext > f.taxInvoiceLast + 1) return 'The next faktur serial lies past the end of the range.'
      return null
    }
  }
}

// ---------------------------------------------------------------- reducer

export const taxInvoiceNumber = (f: FinanceSettings) => `${f.taxInvoicePrefix}${String(f.taxInvoiceNext).padStart(8, '0')}`

export const financeApply = (s: AppState, a: FinanceAction, at: string, by: string): AppState => {
  const f = s.financeSettings
  switch (a.type) {
    case 'gl/upsert':
      return { ...s, glAccounts: upsert(s.glAccounts, a.account) }
    case 'gl/import':
      return {
        ...s,
        glAccounts: a.accounts.reduce((rows, row) => {
          const old = rows.find((x) => x.code === row.code)
          return old ? patchById(rows, old.id, (x) => ({ ...x, name: row.name, type: x.system ? x.type : row.type, opening: row.opening })) : [...rows, row]
        }, s.glAccounts),
      }
    case 'gl/remove':
      return { ...s, glAccounts: s.glAccounts.filter((x) => x.id !== a.id) }
    case 'gl/setOpening':
      return { ...s, glAccounts: s.glAccounts.map((x) => ({ ...x, opening: a.balances[x.id] ?? x.opening })) }
    case 'journals/save': {
      const old = s.journals.find((j) => j.id === a.journal.id)
      const journal = old ? a.journal : { ...a.journal, code: nextJournalCode(s.journals, a.journal.date), status: 'draft' as const, createdBy: by, createdAt: at }
      return { ...s, journals: upsert(s.journals, journal, true) }
    }
    case 'journals/post':
      return { ...s, journals: patchById(s.journals, a.id, (j) => ({ ...j, status: 'posted', postedAt: at })) }
    case 'journals/void':
      return { ...s, journals: patchById(s.journals, a.id, (j) => ({ ...j, status: 'void', voidReason: a.reason })) }
    case 'journals/reverse': {
      const j = s.journals.find((x) => x.id === a.id)!
      const rev = buildJournal(
        s,
        { date: a.date, memo: `Reversal of ${j.code}: ${j.memo}`, source: 'manual', ref: { kind: 'journal', id: j.id, label: j.code }, lines: j.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })) },
        at,
        by,
      )
      return append(s, { ...rev, reversalOf: j.id })
    }
    case 'autoJournals/update':
      return { ...s, autoJournals: patchById(s.autoJournals, a.id, (m) => ({ ...m, ...a.patch })) }
    case 'years/open': {
      const year: FiscalYear = { id: `fy-${a.year}`, year: a.year, status: 'open', closingJournalId: null, closedAt: null, closedBy: null }
      return { ...s, fiscalYears: [...s.fiscalYears, year], periods: [...s.periods, ...yearPeriods(a.year)] }
    }
    case 'years/close': {
      const y = s.fiscalYears.find((x) => x.id === a.id)!
      const { from, to } = yearRange(y.year)
      const { revenue, expense, netIncome } = incomeStatement(s, from, to)
      const lines = [
        ...revenue.map((r) => (r.amount > 0 ? dr(r.account.id, r.amount) : cr(r.account.id, -r.amount))),
        ...expense.map((r) => (r.amount > 0 ? cr(r.account.id, r.amount) : dr(r.account.id, -r.amount))),
        netIncome >= 0 ? cr(f.retainedEarningsAccountId, netIncome, 'Net income') : dr(f.retainedEarningsAccountId, -netIncome, 'Net loss'),
      ]
      // The closing entry lands on the last day of the year, inside a closed period on purpose.
      const j: JournalEntry = { ...buildJournal(s, { date: to, memo: `Close fiscal year ${y.year}`, source: 'closing', ref: null, lines }, at, by), status: 'posted', postedAt: at }
      return {
        ...append(s, j),
        fiscalYears: patchById(s.fiscalYears, y.id, (x) => ({ ...x, status: 'closed', closingJournalId: j.id, closedAt: at, closedBy: by })),
      }
    }
    case 'periods/close':
      return { ...s, periods: patchById(s.periods, a.id, (p) => ({ ...p, status: 'closed', closedAt: at, closedBy: by })) }
    case 'periods/reopen':
      return { ...s, periods: patchById(s.periods, a.id, (p) => ({ ...p, status: 'open', closedAt: null, closedBy: null })) }
    case 'cash/record': {
      const tx = a.tx
      const label = s.glAccounts.find((x) => x.id === tx.accountId)?.name ?? ''
      const j = buildJournal(s, { id: tx.journalId, date: tx.date, memo: tx.memo, source: 'cash', ref: { kind: 'cash', id: tx.id, label: `${tx.code} · ${label}` }, lines: cashLines(tx) }, at, by)
      return { ...append(s, j), cashTransactions: [tx, ...s.cashTransactions] }
    }
    case 'cash/reconcile':
      return { ...s, reconciliations: [a.reconciliation, ...s.reconciliations] }
    case 'vendors/upsert':
      return { ...s, vendors: upsert(s.vendors, a.vendor) }
    case 'bills/save':
      return { ...s, bills: upsert(s.bills, a.bill, true) }
    case 'bills/post': {
      const b = s.bills.find((x) => x.id === a.id)!
      const j = buildJournal(s, { date: b.date, memo: `Bill ${b.code} · ${b.vendorRef || 'no vendor ref'}`, source: 'payable', ref: { kind: 'bill', id: b.id, label: b.code }, lines: billLines(b, f) }, at, by)
      return { ...append(s, j), bills: patchById(s.bills, b.id, (x) => ({ ...x, status: 'posted', journalId: j.id })) }
    }
    case 'bills/void':
      return {
        ...s,
        bills: patchById(s.bills, a.id, (b) => ({ ...b, status: 'void' })),
        journals: voidSourceJournal(s.journals, s.bills.find((b) => b.id === a.id)?.journalId),
      }
    case 'bills/pay': {
      const b = s.bills.find((x) => x.id === a.id)!
      const p = a.payment
      const j = buildJournal(s, { id: p.journalId, date: p.date, memo: `Payment for bill ${b.code}`, source: 'payable', ref: { kind: 'bill', id: b.id, label: b.code }, lines: [dr(f.payableAccountId, p.amount), cr(p.cashAccountId, p.amount)] }, at, by)
      return { ...append(s, j), bills: patchById(s.bills, b.id, (x) => ({ ...x, payments: [...x.payments, p] })) }
    }
    case 'invoices/save':
      return { ...s, invoices: upsert(s.invoices, a.invoice, true) }
    case 'invoices/issue': {
      const i = s.invoices.find((x) => x.id === a.id)!
      const j = buildJournal(s, { date: i.date, memo: `Invoice ${i.code} · ${customerName(s, i)}`, source: 'receivable', ref: { kind: 'invoice', id: i.id, label: i.code }, lines: invoiceLines(i, f) }, at, by)
      return { ...append(s, j), invoices: patchById(s.invoices, i.id, (x) => ({ ...x, status: 'issued', journalId: j.id })) }
    }
    case 'invoices/void':
      return {
        ...s,
        invoices: patchById(s.invoices, a.id, (i) => ({ ...i, status: 'void' })),
        journals: voidSourceJournal(s.journals, s.invoices.find((i) => i.id === a.id)?.journalId),
      }
    case 'invoices/receive': {
      const i = s.invoices.find((x) => x.id === a.id)!
      const r = a.receipt
      const j = buildJournal(s, { id: r.journalId, date: r.date, memo: `Receipt for invoice ${i.code}`, source: 'receivable', ref: { kind: 'invoice', id: i.id, label: i.code }, lines: [dr(r.cashAccountId, r.amount), cr(f.receivableAccountId, r.amount)] }, at, by)
      return { ...append(s, j), invoices: patchById(s.invoices, i.id, (x) => ({ ...x, receipts: [...x.receipts, r] })) }
    }
    case 'invoices/taxInvoice':
      return {
        ...s,
        invoices: patchById(s.invoices, a.id, (i) => ({ ...i, taxInvoice: { number: taxInvoiceNumber(f), issuedAt: at, buyerTaxId: a.buyerTaxId.replace(/\D/g, '') } })),
        financeSettings: { ...f, taxInvoiceNext: f.taxInvoiceNext + 1 },
      }
    case 'budgets/set':
      return { ...s, budgets: upsert(s.budgets, a.budget) }
    case 'financeSettings/update':
      return { ...s, financeSettings: { ...f, ...a.patch } }
  }
}

const voidSourceJournal = (journals: JournalEntry[], id: string | null | undefined) =>
  id ? patchById(journals, id, (j) => ({ ...j, status: 'void' as const, voidReason: 'Source document voided.' })) : journals

export const yearPeriods = (year: number, closedThrough = 0): FiscalPeriod[] =>
  Array.from({ length: 12 }, (_, m) => {
    const closed = m + 1 <= closedThrough
    return {
      id: `per-${year}-${String(m + 1).padStart(2, '0')}`,
      month: `${year}-${String(m + 1).padStart(2, '0')}`,
      year,
      status: closed ? 'closed' : 'open',
      closedAt: closed ? new Date(year, m + 1, 5, 9).toISOString() : null,
      closedBy: closed ? 'usr-7' : null,
    }
  })

// ---------------------------------------------------------------- builders the dialogs share

const CASH_PREFIX = { in: 'CI', out: 'CO', transfer: 'TR' } as const

export const buildCashTx = (s: AppState, d: Pick<CashTransaction, 'kind' | 'date' | 'accountId' | 'counterAccountId' | 'amount' | 'memo' | 'reference'>, at: string, by: string): CashTransaction => ({
  ...d,
  id: newId('cash'),
  code: nextCode(
    s.cashTransactions.filter((t) => t.kind === d.kind).map((t) => t.code),
    `${CASH_PREFIX[d.kind]}-${String(new Date(d.date).getFullYear()).slice(2)}-`,
    4,
  ),
  journalId: newId('jnl'),
  createdBy: by,
  createdAt: at,
})

export const nextBillCode = (s: AppState) => nextCode(s.bills.map((b) => b.code), 'BILL-26-', 4)
export const nextInvoiceCode = (s: AppState) => nextCode(s.invoices.map((i) => i.code), 'INV-26-', 4)
export const nextVendorCode = (s: AppState) => nextCode(s.vendors.map((v) => v.code), 'VND-', 3)

export const blankLine = (accountId = ''): DocumentLine => ({ id: newId('ln'), description: '', accountId, qty: 1, unitPrice: 0 })

/** Routes the store's finance actions here by prefix. */
export const isFinanceAction = (a: AppAction): a is FinanceAction => FINANCE_PREFIXES.some((p) => a.type.startsWith(p))
