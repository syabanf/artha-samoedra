import {
  billable,
  creditLeft,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  fmtQty,
  isPoLate,
  lowStock,
  monthLabel,
  monthOf,
  poTotals,
  prsAwaiting,
  prTotal,
  supplierPerformance,
  valuation,
} from '@artha/fixtures'
import { Button, Card, CardContent, CardHeader, CardTitle, cn, CountBadge, EmptyState, Kicker, StatCard } from '@artha/ui'
import { AlertTriangle, Inbox, PackageCheck, ReceiptText, Truck } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { useNow, useScoped } from '../../state/store'
import { BarList } from '../people/OverviewPage'
import { PoStatusBadge, QcBadge, qcResult } from './parts'

const ROW = 'flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

/** The month `back` months before `month` (YYYY-MM). */
const shiftMonth = (month: string, back: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 - back, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })

export function PurchasingOverviewPage() {
  const { state } = useScoped()
  const { can } = useAuth()
  const user = useUser()
  const now = useNow()
  const navigate = useNavigate()
  const month = monthOf(new Date(now).toISOString())
  const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? 'Unknown supplier'

  const stockValue = valuation(state).reduce((n, r) => n + r.value, 0)
  const sent = state.purchaseOrders.filter((po) => po.sentAt && po.status !== 'cancelled')
  const spendIn = (m: string) => sent.filter((po) => monthOf(po.sentAt!) === m).reduce((n, po) => n + poTotals(po).total, 0)
  const months = Array.from({ length: 6 }, (_, i) => {
    const m = shiftMonth(month, 5 - i)
    return { month: m, spend: spendIn(m) }
  })
  const spendNow = months[months.length - 1].spend
  const peak = Math.max(1, ...months.map((m) => m.spend))

  const waiting = prsAwaiting(state, user.id, can('purchase.approve'))
  const requester = (id: string) => state.employees.find((e) => e.id === id)?.name ?? 'Unknown employee'

  const open = state.purchaseOrders.filter((po) => po.status === 'sent' || po.status === 'partial')
  const late = open.filter((po) => isPoLate(po, now)).sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
  const toBill = state.purchaseOrders.flatMap((po) => po.lines.map((l) => ({ units: billable(l), value: billable(l) * l.unitPrice })))
  const unitsToBill = toBill.reduce((n, x) => n + x.units, 0)
  const low = lowStock(state).sort((a, b) => b.short / Math.max(1, b.item.minStock) - a.short / Math.max(1, a.item.minStock))
  const credits = state.vendorCredits.map((c) => creditLeft(c)).filter((x) => x > 0)

  const receipts = [...state.goodsReceipts].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, 5)
  const suppliers = state.vendors
    .map((v) => ({ v, spend: supplierPerformance(state, v.id).spend }))
    .filter((x) => x.spend > 0)
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 5)

  const viewAll = (to: string) => (
    <Button variant="outline" size="sm" asChild>
      <Link to={to}>View all</Link>
    </Button>
  )

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Purchasing overview</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <Kicker className="text-on-ink-muted">Stock value</Kicker>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{fmtIdrShort(stockValue)}</span>
            <span className="pb-1 text-sm font-semibold text-on-ink-muted">at average cost</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { label: `${shortMonth(month)} spend`, value: fmtIdrShort(spendNow) },
              { label: 'Open orders', value: open.length },
              { label: 'Items', value: state.items.filter((i) => i.active).length },
            ].map((x) => (
              <div key={x.label} className="min-w-0 rounded-2xl bg-white/10 p-3">
                <div className="truncate text-xs text-on-ink-muted">{x.label}</div>
                <div className="mt-1 truncate text-lg font-bold tabular-nums sm:text-xl">{x.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="onInk" size="sm" asChild>
              <Link to={paths.stock}>Stock on hand</Link>
            </Button>
            <Button variant="onInk" size="sm" asChild>
              <Link to={paths.pos}>All orders</Link>
            </Button>
            <Button variant="onInk" size="sm" asChild>
              <Link to={`${paths.purchasingReports}?report=valuation`}>Valuation report</Link>
            </Button>
          </div>
        </Card>

        {waiting.length ? (
          <Card variant="accent" className="flex flex-col p-6">
            <div className="text-[13px] font-semibold text-white/80">Waiting for you</div>
            <div className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-5xl">{waiting.length}</div>
            <div className="mt-3 text-sm text-white/80">
              {waiting.length === 1 ? 'purchase request needs' : 'purchase requests need'} your decision. The oldest is {waiting[0].code} from {requester(waiting[0].requesterId)} for {fmtIdr(prTotal(waiting[0]))}.
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Button variant="onInk" size="sm" asChild>
                <Link to={paths.pr(waiting[0].id)}>Open {waiting[0].code}</Link>
              </Button>
              <Button variant="onInk" size="sm" asChild>
                <Link to={paths.prs}>
                  All requests <CountBadge count={waiting.length} onInk className="ring-0" />
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <EmptyState
              compact
              icon={<Inbox />}
              title="Nothing waiting for you"
              description="Purchase requests at your approval level show up here."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to={paths.prs}>All requests</Link>
                </Button>
              }
            />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Orders to receive"
          value={open.length}
          icon={<Truck />}
          tone={late.length ? 'danger' : 'default'}
          hint={late.length ? `${late.length} late` : 'None late'}
          onClick={() => navigate(paths.pos)}
        />
        <StatCard
          label="Received units to bill"
          value={unitsToBill}
          icon={<PackageCheck />}
          tone={unitsToBill ? 'warning' : 'default'}
          hint={`${fmtIdrShort(toBill.reduce((n, x) => n + x.value, 0))} before VAT`}
          onClick={() => navigate(paths.pos)}
        />
        <StatCard
          label="Low stock items"
          value={low.length}
          icon={<AlertTriangle />}
          tone={low.length ? 'warning' : 'success'}
          hint="Below their minimum"
          onClick={() => navigate(`${paths.purchasingReports}?report=low-stock`)}
        />
        <StatCard
          label="Open vendor credits"
          value={fmtIdrShort(credits.reduce((n, x) => n + x, 0)).replace('Rp ', '')}
          unit="Rp"
          icon={<ReceiptText />}
          hint={`${credits.length} credit${credits.length === 1 ? '' : 's'} not yet used`}
          onClick={() => navigate(paths.purchaseReturns)}
        />
      </div>

      <Card className="min-w-0">
        <CardHeader action={<Button variant="outline" size="sm" asChild><Link to={`${paths.purchasingReports}?report=po-summary`}>Order summary</Link></Button>}>
          <CardTitle>Spend by month</CardTitle>
          <p className="text-sm text-muted">Orders sent to suppliers, including VAT. {monthLabel(month)} runs to today.</p>
        </CardHeader>
        <CardContent>
          <ol className="flex h-44 items-end gap-1 sm:gap-2" aria-label="Order spend per month">
            {months.map((m) => {
              const tip = `${monthLabel(m.month)}: ${fmtIdr(m.spend)}`
              return (
                <li key={m.month} className="flex h-full min-w-0 flex-1 items-end justify-center" title={tip}>
                  <span className="sr-only">{tip}</span>
                  <span className={cn('w-full max-w-10 rounded-t-md', m.month === month ? 'bg-accent' : 'bg-chart-muted')} style={{ height: `${Math.max(2, (m.spend / peak) * 100)}%` }} />
                </li>
              )
            })}
          </ol>
          <div className="mt-2 flex gap-1 text-[11px] text-muted sm:gap-2" aria-hidden>
            {months.map((m) => (
              <span key={m.month} className={cn('min-w-0 flex-1 truncate text-center', m.month === month && 'font-semibold text-foreground')}>
                {shortMonth(m.month)}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader action={viewAll(paths.pos)}>
            <CardTitle className="flex items-center gap-2">
              Late orders <CountBadge count={late.length} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {late.length === 0 && <EmptyState compact title="Nothing late" description="Sent orders past their expected date show up here." />}
            {late.slice(0, 5).map((po) => (
              <Link key={po.id} to={paths.po(po.id)} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] font-semibold text-muted">{po.code}</span>
                  <span className="block truncate text-sm font-semibold">{vendorName(po.vendorId)}</span>
                  <span className="block text-xs text-danger">Expected {fmtDate(po.expectedDate)}</span>
                </span>
                <PoStatusBadge po={po} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader action={viewAll(`${paths.purchasingReports}?report=low-stock`)}>
            <CardTitle className="flex items-center gap-2">
              Low stock <CountBadge count={low.length} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {low.length === 0 && <EmptyState compact title="Stock is healthy" description="Items below their minimum show up here." />}
            {low.slice(0, 5).map(({ item, qty }) => (
              <Link key={item.id} to={paths.item(item.id)} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] font-semibold text-muted">{item.sku}</span>
                  <span className="block truncate text-sm font-semibold">{item.name}</span>
                  <span className="block text-xs text-muted">Minimum {fmtQty(state, item.id, item.minStock)}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-danger">{fmtQty(state, item.id, qty)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader action={viewAll(paths.goodsReceipts)}>
            <CardTitle>Latest receipts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {receipts.length === 0 && <EmptyState compact title="No goods received yet" description="Receipts against orders show up here." />}
            {receipts.map((r) => {
              const po = state.purchaseOrders.find((p) => p.id === r.poId)
              return (
                <Link key={r.id} to={paths.goodsReceipt(r.id)} className={ROW}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] font-semibold text-muted">
                      {r.code} · {po?.code ?? 'Unknown order'}
                    </span>
                    <span className="block truncate text-sm font-semibold">{po ? vendorName(po.vendorId) : 'Unknown supplier'}</span>
                    <span className="block text-xs text-muted">Received {fmtDate(r.receivedAt)}</span>
                  </span>
                  <QcBadge result={qcResult(r.lines)} />
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader action={viewAll(`${paths.purchasingReports}?report=suppliers`)}>
            <CardTitle>Top suppliers by spend</CardTitle>
          </CardHeader>
          <CardContent>
            {suppliers.length ? (
              <BarList rows={suppliers.map(({ v, spend }) => ({ label: v.name, value: spend, display: fmtIdrShort(spend), to: paths.supplier(v.id) }))} label="Order spend per supplier" />
            ) : (
              <EmptyState compact title="No orders sent yet" description="Spend per supplier shows up once orders go out." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
