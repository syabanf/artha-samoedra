import {
  balanceSheet,
  blockerFor,
  budgetVsActual,
  cashFlow,
  changesInEquity,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  fmtPercent,
  generalLedger,
  incomeStatement,
  monthLabel,
  monthRange,
  newId,
  postedLines,
  toDateInput,
  trialBalance,
  yearRange,
  type StatementRow,
} from '@artha/fixtures'
import { CASH_FLOW_GROUP_LABEL, type Budget, type GlAccount } from '@artha/types'
import { Banner, Button, Card, CardHeader, CardTitle, Chip, cn, EmptyState, FOCUS, IconTile, Input, NativeSelect, PageHeader, PillTabs, StatCard } from '@artha/ui'
import { BookOpen, Download, FileSpreadsheet, Landmark, PiggyBank, Printer, Scale, TrendingUp, Wallet, Waves } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { downloadCsv } from '../../lib/csv'
import { useAppState, useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { AccountSelect, Money } from './parts'
import { SubTabs } from '../../components/SubTabs'

const REPORT_TABS = [
  { to: paths.financeReports, label: 'Reports' },
  { to: paths.budgets, label: 'Budgets' },
]

type Kind = 'balance-sheet' | 'income-statement' | 'cash-flow' | 'trial-balance' | 'general-ledger' | 'equity' | 'budget'

const REPORTS: { kind: Kind; title: string; description: string; icon: ReactNode }[] = [
  { kind: 'balance-sheet', title: 'Balance sheet', description: 'Assets, liabilities and equity on a date, with a check that the books balance.', icon: <Scale /> },
  { kind: 'income-statement', title: 'Income statement', description: 'Revenue less expenses for a month, quarter or year.', icon: <TrendingUp /> },
  { kind: 'cash-flow', title: 'Cash flow', description: 'Cash in and out by operating, investing and financing activity.', icon: <Waves /> },
  { kind: 'trial-balance', title: 'Trial balance', description: 'Opening, debits, credits and closing for every account with activity.', icon: <FileSpreadsheet /> },
  { kind: 'general-ledger', title: 'General ledger', description: 'Every posted line per account, with a running balance.', icon: <BookOpen /> },
  { kind: 'equity', title: 'Changes in equity', description: 'How each equity account moved over the year.', icon: <Landmark /> },
  { kind: 'budget', title: 'Budget against actual', description: 'Budgeted and actual revenue and expense by month, with the variance.', icon: <PiggyBank /> },
]

// ---------------------------------------------------------------- reports index

export function FinanceReportsPage() {
  return (
    <div>
      <SubTabs items={REPORT_TABS} />
      <PageHeader title="Financial reports" description="Statements built from posted journals. Pick a report, set the range, then export or print it." />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {REPORTS.map((r) => (
          <ReportCard key={r.kind} to={paths.financeReport(r.kind)} title={r.title} description={r.description} icon={r.icon} />
        ))}
        <ReportCard to={paths.budgets} title="Budgets" description="Set monthly budgets for revenue and expense accounts." icon={<Wallet />} />
      </div>
    </div>
  )
}

const ReportCard = ({ to, title, description, icon }: { to: string; title: string; description: string; icon: ReactNode }) => (
  <Link to={to} className={cn('flex items-start gap-3 rounded-card bg-card p-5 shadow-card transition-colors hover:bg-surface-2', FOCUS)}>
    <IconTile>{icon}</IconTile>
    <span className="min-w-0 flex-1">
      <span className="block text-base font-semibold">{title}</span>
      <span className="mt-1 block text-sm text-muted">{description}</span>
    </span>
  </Link>
)

// ---------------------------------------------------------------- ranges

type Grain = 'month' | 'quarter' | 'year'
const GRAINS: { value: Grain; label: string }[] = [
  { value: 'month', label: 'Month' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
]
const PATTERN: Record<Grain, RegExp> = { month: /^\d{4}-\d{2}$/, quarter: /^\d{4}-Q[1-4]$/, year: /^\d{4}$/ }
const pad = (n: number) => String(n).padStart(2, '0')

const currentPeriod = (grain: Grain, nowMs: number) => {
  const d = new Date(nowMs)
  const y = d.getFullYear()
  return grain === 'year' ? String(y) : grain === 'quarter' ? `${y}-Q${Math.floor(d.getMonth() / 3) + 1}` : `${y}-${pad(d.getMonth() + 1)}`
}

const periodRange = (grain: Grain, period: string) => {
  if (grain === 'year') return { ...yearRange(Number(period)), label: period }
  if (grain === 'month') return { ...monthRange(period), label: monthLabel(period) }
  const [y, q] = period.split('-Q').map(Number)
  return { from: monthRange(`${y}-${pad(q * 3 - 2)}`).from, to: monthRange(`${y}-${pad(q * 3)}`).to, label: `Q${q} ${y}` }
}

const previousPeriod = (grain: Grain, period: string) => {
  if (grain === 'year') return String(Number(period) - 1)
  if (grain === 'month') {
    const [y, m] = period.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`
  }
  const [y, q] = period.split('-Q').map(Number)
  return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`
}

/** Fiscal years plus the current year, newest first. */
const useYears = () => {
  const { state } = useScoped()
  const now = useNow()
  const thisYear = new Date(now).getFullYear()
  return [...new Set([thisYear, ...state.fiscalYears.map((y) => y.year), ...state.budgets.map((b) => b.year)])].sort((a, b) => b - a)
}

const periodOptions = (grain: Grain, years: number[], nowMs: number) => {
  const latest = currentPeriod(grain, nowMs)
  return years.flatMap((y) => {
    const all = grain === 'year' ? [String(y)] : grain === 'quarter' ? [4, 3, 2, 1].map((q) => `${y}-Q${q}`) : Array.from({ length: 12 }, (_, i) => `${y}-${pad(12 - i)}`)
    // Periods sort as strings within a grain, so this drops the ones still in the future.
    return all.filter((p) => p <= latest).map((p) => ({ value: p, label: periodRange(grain, p).label }))
  })
}

const endOfDate = (value: string) => new Date(`${value}T23:59:59`).toISOString()
/** Last day of the month before the one `value` falls in. */
const priorMonthEnd = (value: string) => {
  const [y, m] = value.split('-').map(Number)
  return toDateInput(new Date(y, m - 1, 0).toISOString())
}

// ---------------------------------------------------------------- statement model

type Cell = string | number | null | { text: string; to: string } | { pct: number | null }
interface Row {
  kind: 'head' | 'item' | 'total' | 'grand'
  cells: Cell[]
  danger?: boolean
}
interface Col {
  label: string
  numeric?: boolean
  /** Hidden below the sm breakpoint. */
  wide?: boolean
}
interface Block {
  title?: string
  titleTo?: string
  columns: Col[]
  rows: Row[]
}
interface Built {
  blocks: Block[]
  banner?: ReactNode
  empty?: { title: string; description: string }
}

const acct = (a: GlAccount): Cell => ({ text: `${a.code} · ${a.name}`, to: paths.glAccount(a.id) })
const byCode = (a: GlAccount, b: GlAccount) => a.code.localeCompare(b.code)
const sides = (rows: { debit: number; credit: number }[]) => ({ debit: rows.reduce((n, r) => n + r.debit, 0), credit: rows.reduce((n, r) => n + r.credit, 0) })

/** Statement rows for one section, merging the comparison period's accounts in. */
function section(title: string, cur: StatementRow[], prev: StatementRow[] | null, totalLabel: string, extra: Row[] = []): Row[] {
  const accounts = new Map<string, GlAccount>()
  for (const r of [...cur, ...(prev ?? [])]) accounts.set(r.account.id, r.account)
  const amount = (rows: StatementRow[] | null, id: string) => rows?.find((r) => r.account.id === id)?.amount ?? 0
  const values = (v: number, p: number) => (prev ? [v, p, v - p] : [v])
  const items: Row[] = [...accounts.values()].sort(byCode).map((a) => ({ kind: 'item', cells: [acct(a), ...values(amount(cur, a.id), amount(prev, a.id))] }))
  const sum = (rows: Row[], i: number) => rows.reduce((n, r) => n + (typeof r.cells[i] === 'number' ? (r.cells[i] as number) : 0), 0)
  const all = [...items, ...extra]
  const total: Cell[] = [totalLabel, sum(all, 1), ...(prev ? [sum(all, 2), sum(all, 3)] : [])]
  return [{ kind: 'head', cells: [title] }, ...all, { kind: 'total', cells: total }]
}

const compareCols = (current: string, previous: string | null): Col[] => [
  { label: 'Account' },
  { label: current, numeric: true },
  ...(previous ? [{ label: previous, numeric: true }, { label: 'Change', numeric: true, wide: true }] : []),
]

const numberAt = (rows: Row[], i: number) => rows.map((r) => r.cells[i]).find((c): c is number => typeof c === 'number') ?? 0
const lastTotal = (rows: Row[], i: number) => numberAt([...rows].reverse().filter((r) => r.kind === 'total'), i)

// ---------------------------------------------------------------- report page

export function FinanceReportPage() {
  const { kind = '' } = useParams()
  const { state } = useAppState()
  const now = useNow()
  const years = useYears()
  const [params, setParams] = useSearchParams()
  const report = REPORTS.find((r) => r.kind === kind)

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  if (!report) {
    return (
      <div>
        <BackButton fallback={paths.financeReports} />
        <PageHeader title="Report not found" />
        <Card>
          <EmptyState title="There is no report with this name" description="Pick one from the reports list." action={<Button asChild variant="outline"><Link to={paths.financeReports}>All reports</Link></Button>} />
        </Card>
      </div>
    )
  }

  const grainParam = params.get('grain') as Grain | null
  const grain: Grain = grainParam && grainParam in PATTERN ? grainParam : 'month'
  const periodParam = params.get('period') ?? ''
  const period = PATTERN[grain].test(periodParam) ? periodParam : currentPeriod(grain, now)
  const range = periodRange(grain, period)
  const compare = params.get('compare') === '1'
  const asOfParam = params.get('asOf') ?? ''
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(asOfParam) ? asOfParam : toDateInput(new Date(now).toISOString())
  const yearParam = Number(params.get('year'))
  const year = years.includes(yearParam) ? yearParam : new Date(now).getFullYear()
  const monthParam = Number(params.get('month'))
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : 0
  const accountId = params.get('account') ?? ''

  const uses = {
    range: kind === 'income-statement' || kind === 'cash-flow' || kind === 'trial-balance' || kind === 'general-ledger',
    asOf: kind === 'balance-sheet',
    year: kind === 'equity' || kind === 'budget',
    compare: kind === 'income-statement' || kind === 'balance-sheet',
  }
  const scope = uses.asOf
    ? `As of ${fmtDate(endOfDate(asOf))}`
    : uses.year
      ? kind === 'budget' && month
        ? monthLabel(`${year}-${pad(month)}`)
        : `Year ${year}`
      : range.label

  let built: Built
  switch (kind as Kind) {
    case 'balance-sheet': {
      const cur = balanceSheet(state, endOfDate(asOf))
      const prevDate = compare ? priorMonthEnd(asOf) : null
      const prev = prevDate ? balanceSheet(state, endOfDate(prevDate)) : null
      const earnings: Row = { kind: 'item', cells: ['Current year earnings', cur.earnings, ...(prev ? [prev.earnings, cur.earnings - prev.earnings] : [])] }
      const assets = section('Assets', cur.assets, prev?.assets ?? null, 'Total assets')
      const liabilities = section('Liabilities', cur.liabilities, prev?.liabilities ?? null, 'Total liabilities')
      const equity = section('Equity', cur.equity, prev?.equity ?? null, 'Total equity', [earnings])
      const grandAt = (i: number) => lastTotal(liabilities, i) + lastTotal(equity, i)
      const grand: Row = { kind: 'grand', cells: ['Total liabilities and equity', grandAt(1), ...(prev ? [grandAt(2), grandAt(3)] : [])] }
      const gap = Math.round(cur.difference)
      built = {
        blocks: [{ columns: compareCols(fmtDate(endOfDate(asOf)), prevDate ? fmtDate(endOfDate(prevDate)) : null), rows: [...assets, ...liabilities, ...equity, grand] }],
        banner:
          gap === 0 ? (
            <Banner tone="success" title="The books balance">
              Assets of {fmtIdr(cur.totalAssets)} equal liabilities plus equity.
            </Banner>
          ) : (
            <Banner tone="danger" title={`The books are out by ${fmtIdr(Math.abs(gap))}`}>
              Assets are {gap > 0 ? 'higher' : 'lower'} than liabilities plus equity. Check opening balances in the chart of accounts.
            </Banner>
          ),
      }
      break
    }
    case 'income-statement': {
      const cur = incomeStatement(state, range.from, range.to)
      const prevPeriod = compare ? previousPeriod(grain, period) : null
      const prevRange = prevPeriod ? periodRange(grain, prevPeriod) : null
      const prev = prevRange ? incomeStatement(state, prevRange.from, prevRange.to) : null
      const revenue = section('Revenue', cur.revenue, prev?.revenue ?? null, 'Total revenue')
      const expense = section('Expenses', cur.expense, prev?.expense ?? null, 'Total expenses')
      const netAt = (i: number) => lastTotal(revenue, i) - lastTotal(expense, i)
      built = {
        blocks: [
          {
            columns: compareCols(range.label, prevRange?.label ?? null),
            rows: [...revenue, ...expense, { kind: 'grand', cells: ['Net income', netAt(1), ...(prev ? [netAt(2), netAt(3)] : [])] }],
          },
        ],
        empty: cur.revenue.length || cur.expense.length || prev ? undefined : { title: 'No revenue or expense in this range', description: 'Pick another period, or post journals for it.' },
      }
      break
    }
    case 'cash-flow': {
      const cf = cashFlow(state, range.from, range.to)
      const rows: Row[] = [{ kind: 'total', cells: ['Cash at the start', cf.opening] }]
      for (const g of cf.groups) {
        const label = CASH_FLOW_GROUP_LABEL[g.group]
        rows.push({ kind: 'head', cells: [`${label} activities`] })
        rows.push(...g.rows.map((r): Row => ({ kind: 'item', cells: [acct(r.account), r.amount] })))
        rows.push({ kind: 'total', cells: [`Net cash from ${label.toLowerCase()} activities`, g.total] })
      }
      rows.push({ kind: 'total', cells: ['Net change in cash', cf.net] }, { kind: 'grand', cells: ['Cash at the end', cf.closing] })
      built = { blocks: [{ columns: [{ label: 'Account' }, { label: range.label, numeric: true }], rows }] }
      break
    }
    case 'trial-balance': {
      const tb = trialBalance(state, range.from, range.to)
      const { debit, credit } = sides(tb)
      const rows: Row[] = tb.map((r) => ({ kind: 'item', cells: [acct(r.account), r.opening, r.debit, r.credit, r.closing] }))
      rows.push({ kind: 'grand', cells: ['Totals', null, debit, credit, null] })
      built = {
        blocks: [
          {
            columns: [{ label: 'Account' }, { label: 'Opening', numeric: true, wide: true }, { label: 'Debit', numeric: true }, { label: 'Credit', numeric: true }, { label: 'Closing', numeric: true, wide: true }],
            rows,
          },
        ],
        banner:
          Math.round(debit - credit) === 0 ? (
            <Banner tone="success" title="Debits equal credits">
              {fmtIdr(debit)} on each side for {range.label}.
            </Banner>
          ) : (
            <Banner tone="danger" title={`Debits and credits differ by ${fmtIdr(Math.abs(debit - credit))}`}>
              A posted journal is out of balance. Open the general ledger to find it.
            </Banner>
          ),
        empty: tb.length ? undefined : { title: 'No balances in this range', description: 'Pick another period, or post journals for it.' },
      }
      break
    }
    case 'general-ledger': {
      const moved = new Set(postedLines(state, range.from, range.to).map((l) => l.accountId))
      const accounts = accountId ? state.glAccounts.filter((a) => a.id === accountId) : state.glAccounts.filter((a) => moved.has(a.id)).sort(byCode)
      const columns: Col[] = [
        { label: 'Date', wide: true },
        { label: 'Journal' },
        { label: 'Memo', wide: true },
        { label: 'Debit', numeric: true },
        { label: 'Credit', numeric: true },
        { label: 'Balance', numeric: true },
      ]
      built = {
        blocks: accounts.map((a) => {
          const gl = generalLedger(state, a.id, range.from, range.to)
          const { debit, credit } = sides(gl.rows)
          return {
            title: `${a.code} · ${a.name}`,
            titleTo: paths.glAccount(a.id),
            columns,
            rows: [
              { kind: 'total', cells: [fmtDate(range.from), '', 'Opening balance', null, null, gl.opening] },
              ...gl.rows.map((r): Row => ({ kind: 'item', cells: [fmtDate(r.journal.date), { text: r.journal.code, to: paths.journal(r.journal.id) }, r.memo, r.debit, r.credit, r.balance] })),
              { kind: 'grand', cells: [fmtDate(range.to), '', 'Closing balance', debit, credit, gl.closing] },
            ],
          }
        }),
        empty: accounts.length ? undefined : { title: 'No postings in this range', description: 'Pick another period or account.' },
      }
      break
    }
    case 'equity': {
      const eq = changesInEquity(state, year)
      const total = (k: 'opening' | 'profit' | 'movements' | 'closing') => eq.rows.reduce((n, r) => n + r[k], 0)
      built = {
        blocks: [
          {
            columns: [{ label: 'Account' }, { label: 'Opening', numeric: true }, { label: 'Profit closed in', numeric: true, wide: true }, { label: 'Other movements', numeric: true, wide: true }, { label: 'Closing', numeric: true }],
            rows: [
              ...eq.rows.map((r): Row => ({ kind: 'item', cells: [acct(r.account), r.opening, r.profit, r.movements, r.closing] })),
              { kind: 'grand', cells: ['Total equity', total('opening'), total('profit'), total('movements'), total('closing')] },
            ],
          },
          {
            title: 'Profit for the year',
            columns: [{ label: 'Item' }, { label: String(year), numeric: true }],
            rows: [
              { kind: 'item', cells: ['Net income', eq.netIncome] },
              { kind: 'total', cells: ['Not yet closed to retained earnings', eq.unclosed] },
            ],
          },
        ],
      }
      break
    }
    case 'budget': {
      const data = budgetVsActual(state, year)
      const line = (r: (typeof data)[number]) => {
        const budget = month ? r.budget.months[month - 1] : r.total
        const actual = month ? r.actual[month - 1] : r.totalActual
        return { budget, actual, variance: actual - budget }
      }
      const pct = (variance: number, budget: number): Cell => ({ pct: budget ? (variance / budget) * 100 : null })
      const part = (type: 'revenue' | 'expense', title: string, totalLabel: string) => {
        const mine = data.filter((r) => r.account.type === type)
        const items = mine.map((r): Row => {
          const l = line(r)
          return { kind: 'item', cells: [acct(r.account), l.budget, l.actual, l.variance, pct(l.variance, l.budget)], danger: type === 'expense' ? l.actual > l.budget : l.actual < l.budget }
        })
        const b = mine.reduce((n, r) => n + line(r).budget, 0)
        const a = mine.reduce((n, r) => n + line(r).actual, 0)
        return { rows: [{ kind: 'head', cells: [title] } as Row, ...items, { kind: 'total', cells: [totalLabel, b, a, a - b, pct(a - b, b)] } as Row], b, a }
      }
      const rev = part('revenue', 'Revenue', 'Total revenue')
      const exp = part('expense', 'Expenses', 'Total expenses')
      const nb = rev.b - exp.b
      const na = rev.a - exp.a
      built = {
        blocks: [
          {
            columns: [{ label: 'Account' }, { label: 'Budget', numeric: true }, { label: 'Actual', numeric: true }, { label: 'Variance', numeric: true }, { label: 'Variance %', numeric: true, wide: true }],
            rows: [...rev.rows, ...exp.rows, { kind: 'grand', cells: ['Net income', nb, na, na - nb, pct(na - nb, Math.abs(nb))] }],
          },
        ],
        empty: data.length ? undefined : { title: `No budgets for ${year}`, description: 'Set monthly budgets under Budgets first.' },
      }
      break
    }
  }

  const exportCsv = () => {
    const text = (c: Cell): string | number =>
      c == null ? '' : typeof c === 'number' ? Math.round(c) : typeof c === 'string' ? c : 'to' in c ? c.text : c.pct == null ? '' : Number(c.pct.toFixed(1))
    downloadCsv(`${kind}-${scope.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, [
      [report.title],
      [scope, 'Amounts in IDR'],
      ...built.blocks.flatMap((b) => [[], ...(b.title ? [[b.title]] : []), b.columns.map((c) => c.label), ...b.rows.map((r) => r.cells.map(text))]),
    ])
  }

  const yearSelect = (
    <Pill>
      <NativeSelect variant="inline" aria-label="Year" value={String(year)} onChange={(e) => set({ year: e.target.value })}>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </NativeSelect>
    </Pill>
  )

  return (
    <div>
      <BackButton fallback={paths.financeReports} />
      <PageHeader
        eyebrow={state.company.name}
        title={report.title}
        description={scope}
        actions={
          <>
            <Button variant="outline" size="sm" className="print:hidden" disabled={!!built.empty} onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
              <Printer />
              Print
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        {uses.range && (
          <>
            <PillTabs label="Range" size="sm" value={grain} items={GRAINS} onChange={(g) => set({ grain: g === 'month' ? null : g, period: null })} />
            <Pill>
              <NativeSelect variant="inline" aria-label="Period" value={period} onChange={(e) => set({ period: e.target.value })}>
                {periodOptions(grain, years, now).map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </NativeSelect>
            </Pill>
          </>
        )}
        {uses.asOf && <Input variant="pill" type="date" aria-label="As of" value={asOf} onChange={(e) => set({ asOf: e.target.value || null })} inputClassName="h-10 w-auto" />}
        {uses.year && yearSelect}
        {kind === 'budget' && (
          <Pill>
            <NativeSelect variant="inline" aria-label="Month" value={String(month)} onChange={(e) => set({ month: e.target.value === '0' ? null : e.target.value })}>
              <option value="0">Whole year</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {new Date(year, i, 1).toLocaleDateString('en-GB', { month: 'long' })}
                </option>
              ))}
            </NativeSelect>
          </Pill>
        )}
        {kind === 'general-ledger' && (
          <AccountSelect value={accountId} onChange={(id) => set({ account: id || null })} placeholder="All accounts" aria-label="Account" className="w-full sm:w-72" />
        )}
        {uses.compare && (
          <Chip active={compare} onClick={() => set({ compare: compare ? null : '1' })}>
            {kind === 'balance-sheet' ? 'Compare with last month end' : 'Compare with the previous period'}
          </Chip>
        )}
      </div>

      {built.banner && <div className="mb-4">{built.banner}</div>}

      {built.empty ? (
        <Card>
          <EmptyState title={built.empty.title} description={built.empty.description} />
        </Card>
      ) : (
        <div className="space-y-4">
          {built.blocks.map((b, i) => (
            <Card key={i} className="min-w-0">
              {b.title && (
                <CardHeader className="pb-0">
                  <CardTitle>{b.titleTo ? <Link to={b.titleTo} className="hover:underline">{b.title}</Link> : b.title}</CardTitle>
                </CardHeader>
              )}
              <div className="overflow-x-auto px-5 pb-4 pt-2">
                <StatementTable caption={b.title ?? report.title} block={b} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

const Pill = ({ children }: { children: ReactNode }) => <div className="rounded-full bg-card p-1 shadow-card">{children}</div>

function StatementTable({ caption, block }: { caption: string; block: Block }) {
  const span = block.columns.length
  const hide = (i: number) => block.columns[i]?.wide && 'hidden sm:table-cell'
  // A budget row marked on track keeps its negative variance out of the danger colour.
  const cell = (c: Cell, onTrack = false) => {
    if (c == null) return null
    if (typeof c === 'number') return <Money value={c} dash className={onTrack ? 'text-body' : undefined} />
    if (typeof c === 'string') return c
    if ('to' in c) return <Link to={c.to} className="hover:underline">{c.text}</Link>
    return <span className="tabular-nums">{c.pct == null ? '–' : fmtPercent(c.pct)}</span>
  }
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border">
          {block.columns.map((c, i) => (
            <th key={i} scope="col" className={cn('h-9 px-2 text-xs font-semibold uppercase tracking-wide text-muted first:pl-0 last:pr-0', c.numeric ? 'whitespace-nowrap text-right' : 'text-left', hide(i))}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {block.rows.map((r, n) =>
          r.kind === 'head' ? (
            <tr key={n}>
              <th colSpan={span} scope="colgroup" className="px-0 pb-1 pt-4 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                {cell(r.cells[0])}
              </th>
            </tr>
          ) : (
            <tr key={n} className={cn('border-b border-border last:border-b-0', r.kind !== 'item' && 'font-semibold', r.kind === 'grand' && 'bg-surface-2', r.danger && 'bg-danger-soft')}>
              {r.cells.map((c, i) => (
                <td
                  key={i}
                  className={cn(
                    'px-2 py-2 first:pl-0 last:pr-0',
                    block.columns[i]?.numeric ? 'whitespace-nowrap text-right tabular-nums' : 'min-w-0',
                    i === 0 && r.kind === 'item' && block.columns[0].label === 'Account' && 'first:pl-4',
                    r.kind === 'grand' && 'first:pl-2 last:pr-2',
                    r.danger && block.columns[i]?.numeric && 'text-danger',
                    hide(i),
                  )}
                >
                  {cell(c, r.danger === false)}
                </td>
              ))}
            </tr>
          ),
        )}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------- budgets

const digits = (v: string) => v.replace(/\D/g, '')

export function BudgetsPage() {
  const { state } = useScoped()
  const now = useNow()
  const years = useYears()
  const [params, setParams] = useSearchParams()
  const thisYear = new Date(now).getFullYear()
  const choices = [...new Set([thisYear + 1, ...years])].sort((a, b) => b - a)
  const yearParam = Number(params.get('year'))
  const year = choices.includes(yearParam) ? yearParam : thisYear

  return (
    <div>
      <SubTabs items={REPORT_TABS} />
      <PageHeader
        title="Budgets"
        description="Monthly budgets for revenue and expense accounts. The budget report compares them with posted actuals."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to={`${paths.financeReport('budget')}?year=${year}`}>Budget report</Link>
            </Button>
            <Pill>
              <NativeSelect variant="inline" aria-label="Budget year" value={String(year)} onChange={(e) => setParams(e.target.value === String(thisYear) ? {} : { year: e.target.value }, { replace: true })}>
                {choices.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </NativeSelect>
            </Pill>
          </>
        }
      />
      <BudgetGrid key={year} year={year} accounts={state.glAccounts.filter((a) => a.active && (a.type === 'revenue' || a.type === 'expense')).sort(byCode)} />
    </div>
  )
}

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1).toLocaleDateString('en-GB', { month: 'short' }))

function BudgetGrid({ year, accounts }: { year: number; accounts: GlAccount[] }) {
  const { state } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const editable = can('ledger.manage')
  const saved = (id: string) => state.budgets.find((b) => b.year === year && b.accountId === id)
  const initial = () => Object.fromEntries(accounts.map((a) => [a.id, (saved(a.id)?.months ?? Array(12).fill(0)).map((n) => (n ? String(n) : ''))]))
  const [draft, setDraft] = useState<Record<string, string[]>>(initial)
  const [picked, setPicked] = useState(accounts[0]?.id ?? '')

  const last = yearRange(year - 1)
  const lastYear = incomeStatement(state, last.from, last.to)
  const lastActual = (id: string) => [...lastYear.revenue, ...lastYear.expense].find((r) => r.account.id === id)?.amount ?? 0
  const months = (id: string) => (draft[id] ?? Array(12).fill('')).map((v) => Number(v) || 0)
  const total = (id: string) => months(id).reduce((n, x) => n + x, 0)
  const changed = (id: string) => months(id).join() !== (saved(id)?.months ?? Array(12).fill(0)).join()

  const setMonth = (id: string, m: number, value: string) => setDraft((d) => ({ ...d, [id]: d[id].map((v, i) => (i === m ? digits(value) : v)) }))
  const fill = (id: string) => setDraft((d) => ({ ...d, [id]: Array(12).fill(d[id].find((v) => v) ?? '') }))
  const budgetFor = (a: GlAccount): Budget => ({ id: saved(a.id)?.id ?? newId('bdg'), year, accountId: a.id, months: months(a.id) })
  const save = (a: GlAccount) => act({ type: 'budgets/set', budget: budgetFor(a) }, 'Budget saved', `${a.code} · ${a.name}, ${year}`)
  const saveTitle = (a: GlAccount) => (changed(a.id) ? (blockerFor(state, { type: 'budgets/set', budget: budgetFor(a) }) ?? undefined) : 'No changes to save')

  const sumType = (type: 'revenue' | 'expense', f: (id: string) => number) => accounts.filter((a) => a.type === type).reduce((n, a) => n + f(a.id), 0)
  const groups = (['revenue', 'expense'] as const).map((type) => ({ type, label: type === 'revenue' ? 'Revenue' : 'Expenses', rows: accounts.filter((a) => a.type === type) }))
  const current = accounts.find((a) => a.id === picked)

  if (!accounts.length) {
    return (
      <Card>
        <EmptyState title="No revenue or expense accounts" description="Add them in the chart of accounts first." />
      </Card>
    )
  }

  const rowActions = (a: GlAccount) =>
    editable && (
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => fill(a.id)} title="Copy the first month with an amount into every month">
          Fill all months
        </Button>
        <span title={saveTitle(a)}>
          <Button size="sm" disabled={!changed(a.id) || !!blockerFor(state, { type: 'budgets/set', budget: budgetFor(a) })} onClick={() => save(a)}>
            Save
          </Button>
        </span>
      </div>
    )

  const monthField = (a: GlAccount, m: number, className?: string) =>
    editable ? (
      <Input
        inputMode="numeric"
        aria-label={`${a.name}, ${MONTHS[m]} ${year}`}
        value={draft[a.id]?.[m] ?? ''}
        onChange={(e) => setMonth(a.id, m, e.target.value)}
        placeholder="0"
        className={className}
        inputClassName="h-9 px-2 text-right tabular-nums"
      />
    ) : (
      <Money value={months(a.id)[m]} dash />
    )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard label={`Revenue budget ${year}`} value={fmtIdrShort(sumType('revenue', total)).replace('Rp ', '')} unit="Rp" icon={<TrendingUp />} tone="success" hint={`Last year actual ${fmtIdrShort(sumType('revenue', lastActual))}`} />
        <StatCard label={`Expense budget ${year}`} value={fmtIdrShort(sumType('expense', total)).replace('Rp ', '')} unit="Rp" icon={<Wallet />} hint={`Last year actual ${fmtIdrShort(sumType('expense', lastActual))}`} />
        <StatCard
          label="Budgeted net income"
          value={fmtIdrShort(sumType('revenue', total) - sumType('expense', total)).replace('Rp ', '')}
          unit="Rp"
          icon={<PiggyBank />}
          tone="ink"
          hint={`Last year ${fmtIdrShort(sumType('revenue', lastActual) - sumType('expense', lastActual))}`}
          className="col-span-2 xl:col-span-1"
        />
      </div>

      {!editable && <Banner tone="neutral" title="View only">Your role can read budgets. Ask an admin for ledger access to change them.</Banner>}

      {/* Phones: one account at a time with a month list. */}
      <Card className="md:hidden">
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <AccountSelect value={picked} onChange={setPicked} types={['revenue', 'expense']} aria-label="Account to budget" />
        </CardHeader>
        {current && (
          <div className="px-5 pb-5">
            <ul className="divide-y divide-border">
              {MONTHS.map((label, m) => (
                <li key={label} className="flex items-center gap-3 py-2">
                  <span className="w-10 shrink-0 text-sm font-medium">{label}</span>
                  <div className="min-w-0 flex-1">{monthField(current, m)}</div>
                  {editable && <span className="w-20 shrink-0 text-right text-xs text-muted tabular-nums">{fmtIdrShort(months(current.id)[m])}</span>}
                </li>
              ))}
            </ul>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-1 text-sm">
              <dt className="font-semibold">Year total</dt>
              <dd className="text-right font-semibold"><Money value={total(current.id)} /></dd>
              <dt className="text-muted">Last year actual</dt>
              <dd className="text-right"><Money value={lastActual(current.id)} /></dd>
            </dl>
            <div className="mt-3">{rowActions(current)}</div>
          </div>
        )}
      </Card>

      {/* Tablets and up: the full grid. */}
      {groups.map((g) => (
        <Card key={g.type} className="hidden min-w-0 md:block">
          <CardHeader>
            <CardTitle>{g.label}</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto px-5 pb-4">
            <table className="w-full text-sm">
              <caption className="sr-only">{g.label} budget for {year}</caption>
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="h-9 px-2 pl-0 text-left text-xs font-semibold uppercase tracking-wide text-muted">Account</th>
                  {MONTHS.map((m) => (
                    <th key={m} scope="col" className="h-9 px-1 text-right text-xs font-semibold uppercase tracking-wide text-muted">{m}</th>
                  ))}
                  <th scope="col" className="h-9 whitespace-nowrap px-2 text-right text-xs font-semibold uppercase tracking-wide text-muted">Year total</th>
                  <th scope="col" className="h-9 whitespace-nowrap px-2 pr-0 text-right text-xs font-semibold uppercase tracking-wide text-muted">Last year</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((a) => (
                  <tr key={a.id} className="border-b border-border align-top last:border-b-0">
                    <td className="min-w-44 py-2 pl-0 pr-2">
                      <Link to={paths.glAccount(a.id)} className="block font-medium hover:underline">{a.name}</Link>
                      <span className="block font-mono text-[11px] text-muted">{a.code}</span>
                      <div className="mt-1">{rowActions(a)}</div>
                    </td>
                    {MONTHS.map((label, m) => (
                      <td key={label} className="px-1 py-2 text-right">
                        {monthField(a, m, 'w-28')}
                        {editable && <span className="mt-0.5 block text-[11px] text-muted tabular-nums">{fmtIdrShort(months(a.id)[m])}</span>}
                      </td>
                    ))}
                    <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums"><Money value={total(a.id)} /></td>
                    <td className="whitespace-nowrap px-2 py-2 pr-0 text-right text-muted tabular-nums">
                      <Money value={lastActual(a.id)} dash />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}
    </div>
  )
}
