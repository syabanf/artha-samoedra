import {
  accountBalance,
  billTotals,
  cashAccounts,
  DAY,
  fmtAgo,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  incomeStatement,
  invoiceTotals,
  isOverdue,
  monthLabel,
  monthOf,
  monthRange,
  unreconciledJournals,
  customerName,
  startOfDay,
} from '@artha/fixtures'
import { JOURNAL_SOURCE_LABEL } from '@artha/types'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, CountBadge, EmptyState, Kicker, StatCard } from '@artha/ui'
import { FilePenLine, Landmark, ReceiptText, Scale, TrendingUp, Zap } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router'
import { paths } from '../../components/links'
import { useNow, useScoped } from '../../state/store'
import { Money } from './parts'

const ROW = 'flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

/** The month `back` months before `month` (YYYY-MM). */
const shiftMonth = (month: string, back: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 - back, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function FinanceOverviewPage() {
  const { state } = useScoped()
  const now = useNow()
  const navigate = useNavigate()
  const today = startOfDay(now)
  const month = monthOf(new Date(now).toISOString())

  const cash = cashAccounts(state)
  // Daily cash on hand for the last 30 days, oldest first. Recomputed when the ledger or the day changes.
  const cashSeries = useMemo(() => {
    const end = today + DAY - 1
    return Array.from({ length: 30 }, (_, i) => {
      const asOf = new Date(end - (29 - i) * DAY).toISOString()
      return cashAccounts(state).reduce((n, a) => n + accountBalance(state, a.id, asOf), 0)
    })
  }, [state, today])
  const cashNow = cashSeries[cashSeries.length - 1]
  const cashChange = cashNow - cashSeries[0]

  const openInvoices = state.invoices.filter((i) => i.status === 'issued').map((i) => ({ i, t: invoiceTotals(i) }))
  const overdue = openInvoices.filter(({ i, t }) => isOverdue(i.dueDate, t, now)).sort((a, b) => b.t.balance - a.t.balance)
  const overdueTotal = overdue.reduce((n, x) => n + x.t.balance, 0)

  const openBills = state.bills
    .filter((b) => b.status === 'posted')
    .map((b) => ({ b, t: billTotals(b) }))
    .filter((x) => x.t.balance > 0)
    .sort((a, b) => a.b.dueDate.localeCompare(b.b.dueDate))
  const weekAhead = now + 7 * DAY
  const dueSoon = openBills.filter(({ b }) => Date.parse(b.dueDate) >= now && Date.parse(b.dueDate) <= weekAhead)
  const billsLate = openBills.filter(({ b }) => Date.parse(b.dueDate) < now).length

  const thisMonth = monthRange(month)
  const net = incomeStatement(state, thisMonth.from, thisMonth.to).netIncome
  const drafts = state.journals.filter((j) => j.status === 'draft').length
  const unreconciled = cash.map((a) => a.id).reduce((n, id) => n + unreconciledJournals(state, id).length, 0)

  const months = Array.from({ length: 10 }, (_, i) => {
    const m = shiftMonth(month, 9 - i)
    const r = monthRange(m)
    const s = incomeStatement(state, r.from, r.to)
    return { month: m, revenue: s.totalRevenue, expense: s.totalExpense }
  })
  const peak = Math.max(1, ...months.flatMap((m) => [m.revenue, m.expense]))

  const autoJournals = state.journals
    .filter((j) => j.source === 'auto')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5)
  const shortLabel = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Finance overview</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <Kicker className="text-on-ink-muted">Cash on hand</Kicker>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{fmtIdrShort(cashNow)}</span>
            <span className="pb-1 text-sm font-semibold text-on-ink-muted">
              {cashChange >= 0 ? 'Up' : 'Down'} {fmtIdrShort(Math.abs(cashChange))} in 30 days
            </span>
          </div>
          <Sparkline values={cashSeries} label={`Cash on hand over the last 30 days, now ${fmtIdr(cashNow)}`} />
          <div className="mt-4 flex flex-wrap gap-2">
            {cash.slice(0, 3).map((a) => (
              <Button key={a.id} variant="onInk" size="sm" asChild>
                <Link to={paths.cashAccount(a.id)}>
                  <span className="max-w-[10rem] truncate">{a.name}</span>
                  <span className="tabular-nums text-on-ink-muted">{fmtIdrShort(accountBalance(state, a.id))}</span>
                </Link>
              </Button>
            ))}
            <Button variant="onInk" size="sm" asChild>
              <Link to={paths.cash}>All cash and bank</Link>
            </Button>
          </div>
        </Card>

        {overdue.length ? (
          <Card variant="accent" className="flex flex-col p-6">
            <div className="text-[13px] font-semibold text-white/80">Overdue receivables</div>
            <div className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-5xl">{fmtIdrShort(overdueTotal)}</div>
            <div className="mt-3 text-sm text-white/80">
              {overdue.length} invoice{overdue.length === 1 ? '' : 's'} past due. The largest is {overdue[0].i.code} for {customerName(state, overdue[0].i)}.
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Button variant="onInk" size="sm" asChild>
                <Link to={paths.invoice(overdue[0].i.id)}>Open {overdue[0].i.code}</Link>
              </Button>
              <Button variant="onInk" size="sm" asChild>
                <Link to={paths.invoices}>
                  All invoices <CountBadge count={overdue.length} onInk className="ring-0" />
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <EmptyState compact icon={<ReceiptText />} title="No overdue receivables" description="Issued invoices past their due date show up here." />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Payables due in 7 days"
          value={fmtIdrShort(dueSoon.reduce((n, x) => n + x.t.balance, 0)).replace('Rp ', '')}
          unit="Rp"
          icon={<Landmark />}
          tone={billsLate ? 'danger' : 'default'}
          hint={`${dueSoon.length} bill${dueSoon.length === 1 ? '' : 's'}${billsLate ? `, ${billsLate} already late` : ''}`}
          onClick={() => navigate(paths.bills)}
        />
        <StatCard
          label="Net income this month"
          value={fmtIdrShort(net).replace('Rp ', '')}
          unit="Rp"
          icon={<TrendingUp />}
          tone={net < 0 ? 'danger' : 'success'}
          hint={monthLabel(month)}
          onClick={() => navigate(`${paths.financeReport('income-statement')}?grain=month&period=${month}`)}
        />
        <StatCard label="Draft journals" value={drafts} icon={<FilePenLine />} tone={drafts ? 'warning' : 'default'} hint="Waiting to post" onClick={() => navigate(paths.journals)} />
        <StatCard label="Unreconciled cash entries" value={unreconciled} icon={<Scale />} tone={unreconciled ? 'warning' : 'success'} hint="Not yet ticked on a statement" onClick={() => navigate(paths.cash)} />
      </div>

      <Card className="min-w-0">
        <CardHeader action={<Button variant="outline" size="sm" asChild><Link to={paths.financeReport('income-statement')}>Income statement</Link></Button>}>
          <CardTitle>Revenue and expense, last 10 months</CardTitle>
          <p className="text-sm text-muted">Posted journals only. {monthLabel(month)} runs to today.</p>
        </CardHeader>
        <CardContent>
          <ol className="flex h-44 items-end gap-1 sm:gap-2" aria-label="Revenue and expense per month">
            {months.map((m) => {
              const current = m.month === month
              const tip = `${monthLabel(m.month)}: revenue ${fmtIdr(m.revenue)}, expense ${fmtIdr(m.expense)}`
              return (
                <li key={m.month} className="flex h-full min-w-0 flex-1 items-end justify-center gap-0.5" title={tip}>
                  <span className="sr-only">{tip}</span>
                  <span className={`w-full max-w-6 rounded-t-md ${current ? 'bg-accent' : 'bg-chart-muted'}`} style={{ height: `${Math.max(2, (m.revenue / peak) * 100)}%` }} />
                  <span className="w-full max-w-6 rounded-t-md bg-info" style={{ height: `${Math.max(2, (m.expense / peak) * 100)}%` }} />
                </li>
              )
            })}
          </ol>
          <div className="mt-2 flex gap-1 text-[11px] text-muted sm:gap-2" aria-hidden>
            {months.map((m) => (
              <span key={m.month} className={`min-w-0 flex-1 truncate text-center ${m.month === month ? 'font-semibold text-foreground' : ''}`}>
                {shortLabel(m.month)}
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-chart-muted" />Revenue</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-accent" />Revenue this month</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-info" />Expense</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader action={<Button variant="outline" size="sm" asChild><Link to={paths.bills}>View all</Link></Button>}>
            <CardTitle>Next payables due</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {openBills.length === 0 && <EmptyState compact title="Nothing to pay" description="Posted bills with a balance show up here." />}
            {openBills.slice(0, 5).map(({ b, t }) => {
              const late = Date.parse(b.dueDate) < now
              return (
                <Link key={b.id} to={paths.bill(b.id)} className={ROW}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] font-semibold text-muted">{b.code}</span>
                    <span className="block truncate text-sm font-semibold">{state.vendors.find((v) => v.id === b.vendorId)?.name ?? 'Unknown vendor'}</span>
                    <span className={`block text-xs ${late ? 'text-danger' : 'text-muted'}`}>{late ? 'Late since' : 'Due'} {fmtDate(b.dueDate)}</span>
                  </span>
                  <Money value={t.balance} className="text-sm font-semibold" />
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader action={<Button variant="outline" size="sm" asChild><Link to={paths.invoices}>View all</Link></Button>}>
            <CardTitle className="flex items-center gap-2">
              Largest overdue invoices <CountBadge count={overdue.length} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdue.length === 0 && <EmptyState compact title="Nothing overdue" description="Every issued invoice is within its terms." />}
            {overdue.slice(0, 5).map(({ i, t }) => (
              <Link key={i.id} to={paths.invoice(i.id)} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] font-semibold text-muted">{i.code}</span>
                  <span className="block truncate text-sm font-semibold">{customerName(state, i)}</span>
                  <span className="block text-xs text-danger">Due {fmtDate(i.dueDate)}</span>
                </span>
                <Money value={t.balance} className="text-sm font-semibold" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader action={<Button variant="outline" size="sm" asChild><Link to={paths.autoJournals}>Mappings</Link></Button>}>
            <CardTitle>Latest auto-journals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {autoJournals.length === 0 && <EmptyState compact icon={<Zap />} title="No auto-journals yet" description="Paid payments, refunds, statements and settlements post here on their own." />}
            {autoJournals.map((j) => (
              <Link key={j.id} to={paths.journal(j.id)} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] font-semibold text-muted">{j.code}</span>
                  <span className="block truncate text-sm font-semibold">{j.ref?.label ?? j.memo}</span>
                  <span className="block text-xs text-muted">
                    {JOURNAL_SOURCE_LABEL[j.source]} · {fmtAgo(j.createdAt)}
                  </span>
                </span>
                {j.status === 'draft' ? <Badge variant="warning">Draft</Badge> : <Money value={j.lines.reduce((n, l) => n + l.debit, 0)} className="text-sm font-semibold" />}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Axis-free line for an ink card: white line, accent dot on today. */
function Sparkline({ values, label }: { values: number[]; label: string }) {
  const w = 300
  const h = 56
  const lo = Math.min(...values)
  const span = Math.max(1, Math.max(...values) - lo)
  const pts = values.map((v, i) => [(i / Math.max(1, values.length - 1)) * w, h - 4 - ((v - lo) / span) * (h - 8)] as const)
  const [lx, ly] = pts[pts.length - 1]
  return (
    <div className="relative mt-5 h-14">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label} className="size-full overflow-visible">
        <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" vectorEffect="non-scaling-stroke" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="stroke-white" />
      </svg>
      <span aria-hidden className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent ring-2 ring-ink" style={{ left: `${(lx / w) * 100}%`, top: `${(ly / h) * 100}%` }} />
    </div>
  )
}
