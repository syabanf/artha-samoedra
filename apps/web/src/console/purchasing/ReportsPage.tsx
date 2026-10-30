import {
  accountBalance,
  bestPrice,
  billable,
  fmtDate,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  isPoLate,
  itemName,
  lowStock,
  monthLabel,
  monthRange,
  nowIso,
  outstanding,
  poTotals,
  stockCard,
  supplierPerformance,
  uomOf,
  valuation,
  ymd,
} from '@artha/fixtures'
import { PO_STATUS_LABEL, STOCK_MOVE_KIND_LABEL, type PoStatus, type StockMove } from '@artha/types'
import { Button, Card, CardContent, CardHeader, CardTitle, Chip, ChipRow, cn, EmptyState, Input, PageHeader } from '@artha/ui'
import { Download, Printer } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { downloadCsv } from '../../lib/csv'
import { useNow, useScoped } from '../../state/store'
import { Money } from '../finance/parts'
import { BarList } from '../people/OverviewPage'
import { ItemSelect, WarehouseSelect } from './parts'

type Kind = 'po-summary' | 'po-detail' | 'suppliers' | 'stock-card' | 'valuation' | 'low-stock'

const REPORTS: { kind: Kind; label: string; description: string; ranged: boolean }[] = [
  { kind: 'po-summary', label: 'Order summary', description: 'Orders placed in the range by supplier and status. Totals include VAT; received and billed values do not.', ranged: true },
  { kind: 'po-detail', label: 'Order lines', description: 'Every line on orders placed in the range, with what came in, went back, was billed and is still to come.', ranged: true },
  { kind: 'suppliers', label: 'Supplier performance', description: 'On-time deliveries, rejected units, lead time and spend for orders placed in the range.', ranged: true },
  { kind: 'stock-card', label: 'Stock card', description: 'Every move of one item in the range with the running balance.', ranged: true },
  { kind: 'valuation', label: 'Inventory valuation', description: 'Stock on hand today at moving average cost, against the ledger balance of the inventory account. The range does not apply.', ranged: false },
  { kind: 'low-stock', label: 'Low stock', description: 'Active items below their minimum today, with units already on order and a suggested reorder. The range does not apply.', ranged: false },
]

type Cell = string | number | null | { label: string; to: string }
interface Col {
  label: string
  format?: 'number' | 'money' | 'percent'
}
interface Table {
  title?: string
  columns: Col[]
  rows: Cell[][]
}
interface Built {
  chart?: ReactNode
  tables: Table[]
  empty?: string
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const OPEN: PoStatus[] = ['sent', 'partial']
const pct = (x: number | null) => (x === null ? null : x * 100)

/** A row of figure tiles; the one at `accent` carries the accent. */
const Tiles = ({ items, accent }: { items: { label: string; value: ReactNode }[]; accent: number }) => (
  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
    {items.map((x, i) => (
      <div key={x.label} className={cn('min-w-0 rounded-2xl p-4', i === accent ? 'bg-accent text-white' : 'bg-surface-2')}>
        <div className={cn('truncate text-xs', i === accent ? 'text-white/80' : 'text-muted')}>{x.label}</div>
        <div className="mt-1 truncate text-xl font-bold tabular-nums sm:text-2xl">{x.value}</div>
      </div>
    ))}
  </div>
)

const moveLink = (m: StockMove): Cell => {
  if (!m.ref) return m.note || null
  if (m.ref.kind === 'receipt') return { label: m.ref.label, to: paths.goodsReceipt(m.ref.id) }
  if (m.ref.kind === 'count') return { label: m.ref.label, to: paths.stockCount(m.ref.id) }
  if (m.ref.kind === 'return') return { label: m.ref.label, to: paths.purchaseReturns }
  return m.ref.label
}

export function PurchasingReportsPage() {
  const { state } = useScoped()
  const raise = useAuth().can('purchase.request')
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const today = ymd(now)
  const thisMonth = today.slice(0, 7)
  const yearStart = `${today.slice(0, 4)}-01`
  const kind = REPORTS.find((r) => r.kind === params.get('report'))?.kind ?? 'po-summary'
  const report = REPORTS.find((r) => r.kind === kind)!
  const clamp = (m: string | null, fallback: string) => (m && MONTH.test(m) ? (m > thisMonth ? thisMonth : m) : fallback)
  const rawFrom = clamp(params.get('from'), yearStart)
  const rawTo = clamp(params.get('to'), thisMonth)
  const [from, to] = rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom]
  const scope = report.ranged ? (from === to ? monthLabel(from) : `${monthLabel(from)} to ${monthLabel(to)}`) : `As of ${fmtDate(new Date(now).toISOString())}`

  const itemParam = params.get('item')
  const itemId = state.items.some((i) => i.id === itemParam) ? itemParam! : (state.items.find((i) => i.active)?.id ?? '')
  const whParam = params.get('wh')
  const warehouseId = state.warehouses.some((w) => w.id === whParam) ? whParam! : ''
  const cardSubject = `${itemId ? itemName(state, itemId) : 'No item'}, ${state.warehouses.find((w) => w.id === warehouseId)?.name ?? 'all warehouses'}`

  const built = useMemo((): Built => {
    const start = monthRange(from).from
    const end = monthRange(to).to
    const vendorName = (id: string) => state.vendors.find((v) => v.id === id)?.name ?? 'Unknown supplier'
    const orders = state.purchaseOrders.filter((po) => po.orderDate >= start && po.orderDate <= end).sort((a, b) => a.orderDate.localeCompare(b.orderDate))
    const placed = orders.filter((po) => po.status !== 'draft' && po.status !== 'cancelled')
    const billed = (po: (typeof orders)[number]) => po.lines.reduce((n, l) => n + l.billedQty * l.unitPrice, 0)

    switch (kind) {
      case 'po-summary': {
        const vendors = [...new Set(orders.map((po) => po.vendorId))].map((id) => {
          const rows = orders.filter((po) => po.vendorId === id)
          const live = rows.filter((po) => po.status !== 'draft' && po.status !== 'cancelled')
          return {
            id,
            orders: rows.length,
            open: rows.filter((po) => OPEN.includes(po.status)).length,
            late: rows.filter((po) => isPoLate(po, now)).length,
            total: live.reduce((n, po) => n + poTotals(po).total, 0),
            received: live.reduce((n, po) => n + poTotals(po).received, 0),
            billed: live.reduce((n, po) => n + billed(po), 0),
          }
        })
        vendors.sort((a, b) => b.total - a.total)
        const statuses = (Object.keys(PO_STATUS_LABEL) as PoStatus[]).map((st) => {
          const rows = orders.filter((po) => po.status === st)
          return { st, count: rows.length, total: rows.reduce((n, po) => n + poTotals(po).total, 0) }
        })
        const sum = (f: (v: (typeof vendors)[number]) => number) => vendors.reduce((n, v) => n + f(v), 0)
        return {
          chart: <BarList rows={vendors.filter((v) => v.total > 0).map((v) => ({ label: vendorName(v.id), value: v.total, display: fmtIdrShort(v.total), to: paths.supplier(v.id) }))} label="Order value per supplier" />,
          tables: [
            {
              title: 'By supplier',
              columns: [{ label: 'Supplier' }, { label: 'Orders', format: 'number' }, { label: 'Open', format: 'number' }, { label: 'Late', format: 'number' }, { label: 'Total', format: 'money' }, { label: 'Received', format: 'money' }, { label: 'Billed', format: 'money' }],
              rows: [
                ...vendors.map((v) => [{ label: vendorName(v.id), to: paths.supplier(v.id) }, v.orders, v.open, v.late, v.total, v.received, v.billed]),
                ['Total', sum((v) => v.orders), sum((v) => v.open), sum((v) => v.late), sum((v) => v.total), sum((v) => v.received), sum((v) => v.billed)],
              ],
            },
            {
              title: 'By status',
              columns: [{ label: 'Status' }, { label: 'Orders', format: 'number' }, { label: 'Total', format: 'money' }],
              rows: statuses.filter((s) => s.count).map((s) => [PO_STATUS_LABEL[s.st], s.count, s.total]),
            },
            {
              title: 'Orders',
              columns: [{ label: 'Order' }, { label: 'Supplier' }, { label: 'Ordered' }, { label: 'Expected' }, { label: 'Status' }, { label: 'Total', format: 'money' }],
              rows: orders.map((po) => [{ label: po.code, to: paths.po(po.id) }, vendorName(po.vendorId), fmtDate(po.orderDate), fmtDate(po.expectedDate), isPoLate(po, now) ? 'Late' : PO_STATUS_LABEL[po.status], poTotals(po).total]),
            },
          ],
          empty: orders.length ? undefined : 'No orders placed in this range.',
        }
      }
      case 'po-detail': {
        const lines = placed.flatMap((po) => po.lines.map((l) => ({ po, l })))
        const value = (f: (l: (typeof lines)[number]['l']) => number) => lines.reduce((n, x) => n + f(x.l) * x.l.unitPrice, 0)
        return {
          chart: (
            <Tiles
              accent={3}
              items={[
                { label: 'Ordered', value: fmtIdrShort(value((l) => l.qty)) },
                { label: 'Received', value: fmtIdrShort(value((l) => l.receivedQty)) },
                { label: 'Billed', value: fmtIdrShort(value((l) => l.billedQty)) },
                { label: 'Still to come', value: fmtIdrShort(value(outstanding)) },
              ]}
            />
          ),
          tables: [
            {
              columns: [
                { label: 'Order' },
                { label: 'Item' },
                { label: 'Unit' },
                { label: 'Ordered', format: 'number' },
                { label: 'Received', format: 'number' },
                { label: 'Rejected', format: 'number' },
                { label: 'Returned', format: 'number' },
                { label: 'Billed', format: 'number' },
                { label: 'To bill', format: 'number' },
                { label: 'Outstanding', format: 'number' },
                { label: 'Unit price', format: 'money' },
                { label: 'Outstanding value', format: 'money' },
              ],
              rows: lines.map(({ po, l }) => [
                { label: po.code, to: paths.po(po.id) },
                { label: itemName(state, l.itemId), to: paths.item(l.itemId) },
                uomOf(state, l.itemId),
                l.qty,
                l.receivedQty,
                l.rejectedQty,
                l.returnedQty,
                l.billedQty,
                billable(l),
                outstanding(l),
                l.unitPrice,
                outstanding(l) * l.unitPrice,
              ]),
            },
          ],
          empty: lines.length ? undefined : 'No sent orders in this range.',
        }
      }
      case 'suppliers': {
        const scoped = { purchaseOrders: placed, goodsReceipts: state.goodsReceipts }
        const rows = [...new Set(placed.map((po) => po.vendorId))].map((id) => ({ id, ...supplierPerformance(scoped, id) })).sort((a, b) => b.spend - a.spend)
        return {
          chart: <BarList rows={rows.map((r) => ({ label: vendorName(r.id), value: r.spend, display: fmtIdrShort(r.spend), to: paths.supplier(r.id) }))} label="Spend per supplier" />,
          tables: [
            {
              columns: [{ label: 'Supplier' }, { label: 'Orders', format: 'number' }, { label: 'On time', format: 'percent' }, { label: 'Rejected units', format: 'percent' }, { label: 'Lead days', format: 'number' }, { label: 'Spend', format: 'money' }],
              rows: rows.map((r) => [{ label: vendorName(r.id), to: paths.supplier(r.id) }, r.orders, pct(r.onTimeRate), pct(r.rejectRate), r.avgLeadDays, r.spend]),
            },
          ],
          empty: rows.length ? undefined : 'No sent orders in this range.',
        }
      }
      case 'stock-card': {
        if (!itemId) return { tables: [], empty: 'Add an item first.' }
        const card = stockCard(state, itemId, warehouseId || undefined, start, end)
        const qIn = card.rows.reduce((n, r) => n + Math.max(0, r.move.qty), 0)
        const qOut = card.rows.reduce((n, r) => n + Math.max(0, -r.move.qty), 0)
        const unit = uomOf(state, itemId)
        const wh = (id: string) => state.warehouses.find((w) => w.id === id)?.name ?? 'Unknown warehouse'
        return {
          chart: (
            <Tiles
              accent={3}
              items={[
                { label: 'Opening', value: `${fmtNumber(card.opening, 2)} ${unit}` },
                { label: 'In', value: `${fmtNumber(qIn, 2)} ${unit}` },
                { label: 'Out', value: `${fmtNumber(qOut, 2)} ${unit}` },
                { label: 'Closing', value: `${fmtNumber(card.closing, 2)} ${unit}` },
              ]}
            />
          ),
          tables: [
            {
              columns: [{ label: 'Date' }, { label: 'Move' }, { label: 'Reference' }, { label: 'Warehouse' }, { label: 'In', format: 'number' }, { label: 'Out', format: 'number' }, { label: 'Balance', format: 'number' }, { label: 'Unit cost', format: 'money' }],
              rows: [
                ['Opening balance', null, null, null, null, null, card.opening, null],
                ...card.rows.map(({ move: m, balance }) => [fmtDate(m.at), STOCK_MOVE_KIND_LABEL[m.kind], moveLink(m), wh(m.warehouseId), m.qty > 0 ? m.qty : null, m.qty < 0 ? -m.qty : null, balance, m.unitCost]),
                ['Total', null, null, null, qIn, qOut, card.closing, null],
              ],
            },
          ],
        }
      }
      case 'valuation': {
        const all = valuation(state)
        const total = all.reduce((n, r) => n + r.value, 0)
        const account = state.glAccounts.find((a) => a.id === state.purchasingSettings.inventoryAccountId)
        const ledger = accountBalance(state, state.purchasingSettings.inventoryAccountId)
        const byWarehouse = state.warehouses.map((w) => ({ w, value: valuation(state, w.id).reduce((n, r) => n + r.value, 0) })).filter((x) => x.value)
        const byCategory = state.itemCategories.map((c) => {
          const rows = all.filter((r) => r.item.categoryId === c.id)
          return { c, items: rows.length, value: rows.reduce((n, r) => n + r.value, 0) }
        })
        const category = (id: string) => state.itemCategories.find((c) => c.id === id)?.name ?? 'No category'
        return {
          chart: (
            <div className="space-y-6">
              <Tiles
                accent={0}
                items={[
                  { label: 'Stock value', value: fmtIdrShort(total) },
                  { label: account ? `Ledger ${account.code}` : 'Ledger balance', value: fmtIdrShort(ledger) },
                  { label: 'Difference', value: fmtIdrShort(total - ledger) },
                  { label: 'Items in stock', value: all.length },
                ]}
              />
              <BarList rows={byWarehouse.map((x) => ({ label: x.w.name, value: x.value, display: fmtIdrShort(x.value) }))} label="Stock value per warehouse" />
            </div>
          ),
          tables: [
            {
              title: 'By warehouse',
              columns: [{ label: 'Warehouse' }, { label: 'Value', format: 'money' }, { label: 'Share', format: 'percent' }],
              rows: [...byWarehouse.map((x) => [x.w.name, x.value, total ? (x.value / total) * 100 : 0]), ['Total', total, 100]],
            },
            {
              title: 'By category',
              columns: [{ label: 'Category' }, { label: 'Items', format: 'number' }, { label: 'Value', format: 'money' }, { label: 'Share', format: 'percent' }],
              rows: [...byCategory.filter((x) => x.items).map((x) => [x.c.name, x.items, x.value, total ? (x.value / total) * 100 : 0]), ['Total', all.length, total, 100]],
            },
            {
              title: 'Against the ledger',
              columns: [{ label: 'Source' }, { label: 'Value', format: 'money' }],
              rows: [
                ['Stock at average cost', total],
                [account ? `${account.code} ${account.name}` : 'Inventory account', ledger],
                ['Difference', total - ledger],
              ],
            },
            {
              title: 'By item',
              columns: [{ label: 'Item' }, { label: 'Category' }, { label: 'Unit' }, { label: 'On hand', format: 'number' }, { label: 'Average cost', format: 'money' }, { label: 'Value', format: 'money' }],
              rows: [...all]
                .sort((a, b) => b.value - a.value)
                .map((r) => [{ label: r.item.name, to: paths.item(r.item.id) }, category(r.item.categoryId), uomOf(state, r.item.id), r.qty, r.cost, r.value]),
            },
          ],
          empty: all.length ? undefined : 'Nothing in stock.',
        }
      }
      case 'low-stock': {
        const at = nowIso()
        const rows = lowStock(state).map(({ item: it, qty, short }) => {
          const onOrder = state.purchaseOrders.filter((po) => OPEN.includes(po.status)).flatMap((po) => po.lines.filter((l) => l.itemId === it.id)).reduce((n, l) => n + outstanding(l), 0)
          const suggest = short > onOrder ? Math.max(it.reorderQty, short - onOrder) : 0
          const price = bestPrice(state, it.id, Math.max(1, suggest), at)
          return { it, qty, short, onOrder, suggest, price }
        })
        rows.sort((a, b) => b.short / Math.max(1, b.it.minStock) - a.short / Math.max(1, a.it.minStock))
        return {
          chart: <BarList rows={rows.map((r) => ({ label: r.it.name, value: r.short / Math.max(1, r.it.minStock), display: `${fmtNumber(r.qty, 2)} of ${fmtNumber(r.it.minStock, 2)} ${uomOf(state, r.it.id)}`, to: paths.item(r.it.id) }))} label="How far each item is below its minimum" />,
          tables: [
            {
              columns: [
                { label: 'Item' },
                { label: 'Unit' },
                { label: 'Minimum', format: 'number' },
                { label: 'On hand', format: 'number' },
                { label: 'Short', format: 'number' },
                { label: 'On order', format: 'number' },
                { label: 'Suggested reorder', format: 'number' },
                { label: 'Best price', format: 'money' },
                { label: 'Supplier' },
                ...(raise ? [{ label: 'Action' }] : []),
              ],
              rows: rows.map((r) => [
                { label: r.it.name, to: paths.item(r.it.id) },
                uomOf(state, r.it.id),
                r.it.minStock,
                r.qty,
                r.short,
                r.onOrder,
                r.suggest,
                r.price?.price ?? null,
                r.price ? vendorName(r.price.vendorId) : null,
                ...(raise ? [r.suggest ? { label: 'Raise request', to: `${paths.prNew}?item=${r.it.id}&qty=${r.suggest}` } : 'Covered by orders'] : []),
              ]),
            },
          ],
          empty: rows.length ? undefined : 'Every active item is at or above its minimum.',
        }
      }
    }
  }, [kind, state, from, to, now, itemId, warehouseId, raise])

  const exportCsv = () => {
    const text = (c: Cell, col: Col) => (c === null ? '' : typeof c === 'object' ? c.label : typeof c === 'number' ? (col.format === 'money' ? Math.round(c) : Number(c.toFixed(2))) : c)
    downloadCsv(`purchasing-${kind}-${report.ranged ? `${from}-to-${to}` : today}`, [
      [`${report.label} report`],
      [scope],
      ...(kind === 'stock-card' ? [[cardSubject]] : []),
      ...built.tables.flatMap((t) => [[], ...(t.title ? [[t.title]] : []), t.columns.map((c) => c.label), ...t.rows.map((r) => r.map((c, i) => text(c, t.columns[i])))]),
    ])
  }

  return (
    <div>
      <PageHeader
        title="Purchasing reports"
        description="Pick a report and a range, then export it as CSV or print it."
        actions={
          <>
            <Button variant="outline" size="sm" className="print:hidden" disabled={!!built.empty} title={built.empty} onClick={exportCsv}>
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

      <div className="space-y-3 print:hidden">
        <ChipRow role="group" aria-label="Report">
          {REPORTS.map((r) => (
            <Chip key={r.kind} active={kind === r.kind} onClick={() => set({ report: r.kind === 'po-summary' ? null : r.kind })}>
              {r.label}
            </Chip>
          ))}
        </ChipRow>
        {report.ranged && (
          <div className="flex flex-wrap items-center gap-2">
            <Input variant="pill" type="month" aria-label="From month" value={from} max={thisMonth} onChange={(e) => set({ from: e.target.value || null })} className="w-[calc(50%-0.25rem)] sm:w-44" inputClassName="h-10" />
            <Input variant="pill" type="month" aria-label="To month" value={to} max={thisMonth} onChange={(e) => set({ to: e.target.value || null })} className="w-[calc(50%-0.25rem)] sm:w-44" inputClassName="h-10" />
            <Chip active={from === yearStart && to === thisMonth} onClick={() => set({ from: null, to: null })}>
              This year
            </Chip>
            <Chip active={from === thisMonth && to === thisMonth} onClick={() => set({ from: thisMonth, to: null })}>
              This month
            </Chip>
          </div>
        )}
        {kind === 'stock-card' && (
          <div className="flex flex-wrap items-center gap-2">
            <ItemSelect aria-label="Item" value={itemId} onChange={(id) => set({ item: id || null })} className="w-full sm:w-72" />
            <WarehouseSelect aria-label="Warehouse" placeholder="All warehouses" value={warehouseId} onChange={(id) => set({ wh: id || null })} className="w-full sm:w-56" />
          </div>
        )}
      </div>

      <Card className="mt-4 min-w-0">
        <CardHeader>
          <CardTitle>{report.label}</CardTitle>
          <p className="text-sm text-muted">
            {scope}
            {kind === 'stock-card' && ` for ${cardSubject}`}. {report.description}
          </p>
        </CardHeader>
        <CardContent>{built.empty ? <EmptyState compact title={built.empty} description={report.ranged ? 'Widen the range or pick another report.' : undefined} /> : built.chart}</CardContent>
      </Card>

      {!built.empty &&
        built.tables.map((t, i) => (
          <Card key={i} className="mt-4 min-w-0">
            {t.title && (
              <CardHeader className="pb-0">
                <CardTitle>{t.title}</CardTitle>
              </CardHeader>
            )}
            <div className="overflow-x-auto px-5 pb-4 pt-2">
              {t.rows.length ? <ReportTable caption={t.title ?? report.label} table={t} /> : <EmptyState compact title="Nothing in this range" />}
            </div>
          </Card>
        ))}
    </div>
  )
}

function ReportTable({ caption, table }: { caption: string; table: Table }) {
  const cell = (c: Cell, col: Col) => {
    if (c === null) return col.format ? '–' : null
    if (typeof c === 'object')
      return (
        <Link to={c.to} className="font-semibold hover:text-accent">
          {c.label}
        </Link>
      )
    if (typeof c === 'string') return c
    if (col.format === 'money') return <Money value={c} dash />
    if (col.format === 'percent') return fmtPercent(c)
    return fmtNumber(c, c % 1 ? 1 : 0)
  }
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border">
          {table.columns.map((c) => (
            <th key={c.label} scope="col" className={cn('h-9 px-2 text-xs font-semibold uppercase tracking-wide text-muted first:pl-0 last:pr-0', c.format ? 'whitespace-nowrap text-right' : 'text-left')}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r, n) => (
          <tr key={n} className={cn('border-b border-border last:border-0', (r[0] === 'Total' || r[0] === 'Opening balance') && 'font-semibold')}>
            {r.map((c, i) => (
              <td key={i} className={cn('h-10 px-2 first:pl-0 last:pr-0', table.columns[i].format ? 'whitespace-nowrap text-right tabular-nums' : 'min-w-[8rem]')}>
                {cell(c, table.columns[i])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
