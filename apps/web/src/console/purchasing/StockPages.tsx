import {
  addDays,
  averageCost,
  blockerFor,
  countBy,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  fmtIdrShort,
  fmtQty,
  fromDateInput,
  itemName,
  lowStock,
  monthOf,
  newId,
  nextCountCode,
  nowIso,
  onHand,
  toMs,
  uomOf,
  valuation,
  type AppAction,
  type AppState,
} from '@artha/fixtures'
import { STOCK_MOVE_KIND_LABEL, type Item, type StockCount, type StockCountStatus, type StockMove, type StockMoveKind } from '@artha/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  PillTabs,
  StatCard,
  Textarea,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { ArrowLeftRight, Boxes, ClipboardCheck, Download, Plus, Printer, ShoppingCart, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { LetterHead, Signature } from '../../components/Letter'
import { SubTabs } from '../../components/SubTabs'
import { downloadCsv } from '../../lib/csv'
import { useSetParam } from '../../lib/useSetParam'
import { useAppState, useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from '../finance/parts'
import { ItemSelect, Qty, WarehouseSelect } from './parts'
import { SearchBox } from '../../components/SearchBox'
import { FilterCaption, filteredEmpty } from '../../components/FilterCaption'

export const INVENTORY_TABS = [
  { to: paths.stock, label: 'Stock' },
  { to: paths.stockMoves, label: 'Movements' },
  { to: paths.items, label: 'Items' },
  { to: paths.stockCounts, label: 'Counts' },
  { to: paths.purchasingSettings, label: 'Settings' },
]

/** ISO bounds for a from and to date input, the end inclusive of its whole day. */
export const rangeIso = (from: string, to: string) => ({
  from: from ? fromDateInput(from) : undefined,
  to: to ? new Date(toMs(addDays(fromDateInput(to), 1)) - 1).toISOString() : undefined,
})

const searchTerms = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)
const warehouseName = (s: AppState, id: string) => s.warehouses.find((w) => w.id === id)?.name ?? 'Unknown warehouse'
const qtyNumber = (v: string) => Number(v.replace(',', '.')) || 0
const decimal = (v: string) => v.replace(/[^\d.,]/g, '')

/** Search box shared by the inventory lists. */
// ---------------------------------------------------------------- stock

export function StockPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const { params, set, clear } = useSetParam()
  const [moving, setMoving] = useState<Item | null>(null)
  const q = params.get('q') ?? ''
  const category = params.get('category') ?? ''
  const warehouse = params.get('warehouse') ?? ''
  const lowOnly = params.get('low') === '1'

  const warehouses = state.warehouses.filter((w) => w.active && (!warehouse || w.id === warehouse))
  const low = lowStock(state)
  const isLow = (i: Item) => low.some((l) => l.item.id === i.id)
  const terms = searchTerms(q)
  const searched = state.items.filter((i) => i.active && terms.every((w) => `${i.sku} ${i.name}`.toLowerCase().includes(w)))
  const scoped = searched.filter((i) => !lowOnly || isLow(i))
  const catCounts = countBy(scoped, (i) => i.categoryId)
  const rows = scoped.filter((i) => !category || i.categoryId === category)
  const filters = [q, category, warehouse, lowOnly].filter(Boolean).length
  const manage = can('inventory.manage')
  const month = monthOf(new Date(now).toISOString())
  const stockTotal = valuation(state).reduce((n, r) => n + r.value, 0)
  const drafts = state.stockCounts.filter((c) => c.status === 'draft').length
  const movesThisMonth = state.stockMoves.filter((m) => monthOf(m.at) === month).length
  const total = (i: Item) => (warehouse ? onHand(state, i.id, warehouse) : onHand(state, i.id))

  const columns: Column<Item>[] = [
    {
      id: 'item',
      header: 'Item',
      sortValue: (i) => i.name,
      cell: (i) => (
        <div className="min-w-0 max-w-56">
          <Link to={paths.item(i.id)} className="block truncate font-semibold hover:text-accent">
            {i.name}
          </Link>
          <div className="font-mono text-xs text-muted">{i.sku}</div>
        </div>
      ),
    },
    ...warehouses.map(
      (w): Column<Item> => ({
        id: w.id,
        header: w.code,
        align: 'right',
        hideBelow: 'sm',
        sortValue: (i) => onHand(state, i.id, w.id),
        cell: (i) => {
          const qty = onHand(state, i.id, w.id)
          return <span className={`tabular-nums ${qty ? '' : 'text-muted'}`}>{qty ? qty.toLocaleString('id-ID') : '–'}</span>
        },
      }),
    ),
    {
      id: 'total',
      header: warehouse ? 'On hand' : 'Total',
      align: 'right',
      sortValue: total,
      cell: (i) => (
        <div className="flex flex-col items-end gap-1">
          <Qty itemId={i.id} qty={total(i)} className={`font-semibold ${isLow(i) ? 'text-danger' : ''}`} />
          {isLow(i) && <Badge variant="danger">Below {i.minStock}</Badge>}
        </div>
      ),
    },
    { id: 'value', header: 'Value', align: 'right', hideBelow: 'md', sortValue: (i) => total(i) * averageCost(state, i.id), cell: (i) => <Money value={total(i) * averageCost(state, i.id)} dash /> },
    ...(manage
      ? [
          {
            id: 'move',
            header: <span className="sr-only">Move stock</span>,
            cell: (i: Item) => (
              <Button variant="outline" size="sm" aria-label={`Move stock of ${i.name}`} onClick={() => setMoving(i)}>
                <ArrowLeftRight />
                Move
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Stock"
        description="What every store room holds, valued at moving average cost. Issue, adjust, transfer or scrap from a row."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={<SearchBox value={q} onChange={(v) => set('q', v)} label="Search stock" placeholder="Item name or SKU" />}
      />
      <SubTabs items={INVENTORY_TABS} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Stock value" value={fmtIdrShort(stockTotal).replace('Rp ', '')} tone="ink" hint={`Rupiah · ${state.items.filter((i) => i.active).length} items`} />
        <StatCard label="Below minimum" value={low.length} icon={<TriangleAlert />} tone={low.length ? 'danger' : 'default'} active={lowOnly} onClick={() => set('low', lowOnly ? null : '1')} />
        <Link to={paths.stockCounts} className="contents">
          <StatCard label="Counts in progress" value={drafts} icon={<ClipboardCheck />} tone={drafts ? 'warning' : 'default'} />
        </Link>
        <Link to={paths.stockMoves} className="contents">
          <StatCard label="Moves this month" value={movesThisMonth} icon={<ArrowLeftRight />} />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ChipRow className="min-w-0 flex-1">
              <Chip active={!category} count={scoped.length} onClick={() => set('category', null)}>
                All
              </Chip>
              {state.itemCategories.map((c) => (
                <Chip key={c.id} active={category === c.id} count={catCounts[c.id] ?? 0} onClick={() => set('category', category === c.id ? null : c.id)}>
                  {c.name}
                </Chip>
              ))}
            </ChipRow>
            <NativeSelect aria-label="Filter by warehouse" value={warehouse} onChange={(e) => set('warehouse', e.target.value || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none">
              <option value="">All warehouses</option>
              {state.warehouses
                .filter((w) => w.active)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div className="mt-1 flex justify-end">
            <FilterCaption shown={rows.length} total={state.items.filter((i) => i.active).length} filters={filters} onClear={() => clear()} />
          </div>
          <div className="mt-2">
            <DataTable
              rows={rows}
              columns={columns}
              getRowKey={(i) => i.id}
              rowLabel={(i) => i.name}
              rowClassName={(i) => (isLow(i) ? 'bg-danger-soft/40' : undefined)}
              initialSort={{ id: 'item', desc: false }}
              resetPageKey={`${q}|${category}|${warehouse}|${lowOnly}`}
              pageSize={20}
              empty={filteredEmpty(filters, () => clear(), 'items', <EmptyState compact title="No items yet" description="Add items on the Items page." />)}
            />
          </div>
        </div>
        <LowStockCard />
      </div>

      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)} title={moving ? `Move ${moving.name}` : 'Move stock'} description="Stock leaves at moving average cost and posts an inventory journal.">
        {moving && <MoveForm item={moving} initialWarehouse={warehouse} onDone={() => setMoving(null)} />}
      </Dialog>
    </div>
  )
}

function LowStockCard() {
  const { state } = useAppState()
  const { can } = useAuth()
  const low = lowStock(state).sort((a, b) => b.short / (b.item.minStock || 1) - a.short / (a.item.minStock || 1))
  const raise = can('purchase.request')
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Low stock ({low.length})</CardTitle>
        <p className="text-xs text-muted">Items whose total on hand is under their minimum.</p>
      </CardHeader>
      <CardContent>
        {low.length === 0 ? (
          <EmptyState compact icon={<Boxes />} title="Nothing is low" description="Every item is at or above its minimum." />
        ) : (
          <ul className="divide-y divide-border">
            {low.map(({ item, qty }) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <Link to={paths.item(item.id)} className="block truncate font-semibold hover:text-accent">
                    {item.name}
                  </Link>
                  <div className="text-xs text-muted tabular-nums">
                    {fmtQty(state, item.id, qty)} of {item.minStock} minimum
                  </div>
                </div>
                {raise && item.reorderQty > 0 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`${paths.prNew}?item=${item.id}&qty=${item.reorderQty}`}>
                      <ShoppingCart />
                      Raise request
                    </Link>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

type MoveKind = 'issue' | 'adjust' | 'transfer' | 'scrap'
const MOVE_LABEL: Record<MoveKind, string> = { issue: 'Issue', adjust: 'Adjust', transfer: 'Transfer', scrap: 'Scrap' }
const MOVE_DONE: Record<MoveKind, string> = { issue: 'Stock issued', adjust: 'Stock adjusted', transfer: 'Stock transferred', scrap: 'Stock scrapped' }

/** One dialog for the four ways stock leaves or changes, with the amount available in the picked warehouse. */
export function MoveForm({ item, initialWarehouse, onDone }: { item: Item; initialWarehouse?: string; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const fullest = state.warehouses.filter((w) => w.active).sort((a, b) => onHand(state, item.id, b.id) - onHand(state, item.id, a.id))[0]?.id ?? ''
  const [f, setF] = useState({ kind: 'issue' as MoveKind, warehouseId: initialWarehouse || fullest, toId: '', qty: '', remove: false, departmentId: '', note: '' })
  const qty = qtyNumber(f.qty)
  const available = f.warehouseId ? onHand(state, item.id, f.warehouseId) : 0
  const cost = averageCost(state, item.id)
  const base = { itemId: item.id, note: f.note.trim() }
  const action: AppAction =
    f.kind === 'issue'
      ? { type: 'stock/issue', ...base, warehouseId: f.warehouseId, qty, departmentId: f.departmentId }
      : f.kind === 'adjust'
        ? { type: 'stock/adjust', ...base, warehouseId: f.warehouseId, qty: f.remove ? -qty : qty }
        : f.kind === 'transfer'
          ? { type: 'stock/transfer', ...base, fromId: f.warehouseId, toId: f.toId, qty }
          : { type: 'stock/scrap', ...base, warehouseId: f.warehouseId, qty }
  const blocker = !f.warehouseId
    ? 'Pick a warehouse.'
    : qty <= 0
      ? 'Enter a quantity above 0.'
      : f.kind === 'transfer' && !f.toId
        ? 'Pick the warehouse to move it to.'
        : blockerFor(state, action)
  const noteRequired = f.kind === 'adjust' || f.kind === 'scrap'

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, MOVE_DONE[f.kind], `${fmtQty(state, item.id, qty)} ${item.name}`)) onDone()
      }}
    >
      <PillTabs label="Kind of move" value={f.kind} onChange={(kind) => setF({ ...f, kind })} items={(Object.keys(MOVE_LABEL) as MoveKind[]).map((k) => ({ value: k, label: MOVE_LABEL[k] }))} className="mb-4" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={f.kind === 'transfer' ? 'From' : 'Warehouse'} required hint={f.warehouseId ? `${fmtQty(state, item.id, available)} available` : undefined}>
          <WarehouseSelect value={f.warehouseId} onChange={(warehouseId) => setF({ ...f, warehouseId })} />
        </FormField>
        {f.kind === 'transfer' && (
          <FormField label="To" required>
            <WarehouseSelect value={f.toId} onChange={(toId) => setF({ ...f, toId })} />
          </FormField>
        )}
        {f.kind === 'issue' && (
          <FormField label="Department" required>
            <NativeSelect value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
              <option value="">Pick a department</option>
              {state.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
        {f.kind === 'adjust' && (
          <FormField label="Direction">
            <PillTabs label="Direction" size="sm" value={f.remove ? 'remove' : 'add'} onChange={(v) => setF({ ...f, remove: v === 'remove' })} items={[{ value: 'add', label: 'Add' }, { value: 'remove', label: 'Remove' }]} />
          </FormField>
        )}
        <FormField label={`Quantity (${uomOf(state, item.id)})`} required hint={qty > 0 && f.kind !== 'transfer' ? `${fmtIdr(qty * cost)} at ${fmtIdr(cost)} each` : undefined}>
          <Input inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: decimal(e.target.value) })} />
        </FormField>
        <FormField label="Note" required={noteRequired} className="sm:col-span-2">
          <Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={noteRequired ? 'Say why the stock changes' : 'Optional'} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{MOVE_LABEL[f.kind]}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- movements

const KINDS = Object.keys(STOCK_MOVE_KIND_LABEL) as StockMoveKind[]

/** Where a move's reference opens: receipts and counts have pages, returns have a list. */
export function MoveRef({ move }: { move: StockMove }) {
  const r = move.ref
  if (!r) return <span className="text-muted">–</span>
  const to = r.kind === 'receipt' ? paths.goodsReceipt(r.id) : r.kind === 'count' ? paths.stockCount(r.id) : r.kind === 'return' ? paths.purchaseReturns : null
  return to ? <CodeLink to={to} code={r.label} /> : <span className="font-mono text-xs">{r.label}</span>
}

export function StockMovesPage() {
  const { state, actorName } = useScoped()
  const { params, set, clear } = useSetParam()
  const q = params.get('q') ?? ''
  const kind = (params.get('kind') as StockMoveKind | null) || null
  const item = params.get('item') ?? ''
  const warehouse = params.get('warehouse') ?? ''
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const range = rangeIso(from, to)
  const terms = searchTerms(q)
  const dept = (id: string | null) => state.departments.find((d) => d.id === id)?.name ?? ''

  const scoped = state.stockMoves.filter(
    (m) =>
      (!item || m.itemId === item) &&
      (!warehouse || m.warehouseId === warehouse) &&
      (!range.from || m.at >= range.from) &&
      (!range.to || m.at <= range.to) &&
      terms.every((w) => `${itemName(state, m.itemId)} ${m.ref?.label ?? ''} ${m.note}`.toLowerCase().includes(w)),
  )
  const kindCounts = countBy(scoped, (m) => m.kind)
  const rows = scoped.filter((m) => !kind || m.kind === kind)
  const filters = [q, kind, item, warehouse, from, to].filter(Boolean).length

  const columns: Column<StockMove>[] = [
    { id: 'at', header: 'Date', hideBelow: 'sm', sortValue: (m) => m.at, cell: (m) => <span className="whitespace-nowrap text-sm">{fmtDate(m.at)}</span> },
    {
      id: 'item',
      header: 'Item',
      sortValue: (m) => itemName(state, m.itemId),
      cell: (m) => (
        <div className="min-w-0 max-w-56">
          <Link to={paths.item(m.itemId)} className="block truncate font-semibold hover:text-accent">
            {itemName(state, m.itemId)}
          </Link>
          <div className="truncate text-xs text-muted">
            <span className="sm:hidden">{fmtDate(m.at)} · </span>
            {warehouseName(state, m.warehouseId)}
          </div>
        </div>
      ),
    },
    { id: 'kind', header: 'Kind', hideBelow: 'sm', sortValue: (m) => m.kind, cell: (m) => <Badge variant={MOVE_VARIANT[m.kind]}>{STOCK_MOVE_KIND_LABEL[m.kind]}</Badge> },
    { id: 'qty', header: 'Qty', align: 'right', sortValue: (m) => m.qty, cell: (m) => <Qty itemId={m.itemId} qty={m.qty} className={m.qty < 0 ? 'text-danger' : 'font-semibold'} /> },
    { id: 'cost', header: 'Unit cost', align: 'right', hideBelow: 'lg', sortValue: (m) => m.unitCost, cell: (m) => <Money value={m.unitCost} /> },
    { id: 'value', header: 'Value', align: 'right', hideBelow: 'md', sortValue: (m) => m.qty * m.unitCost, cell: (m) => <Money value={m.qty * m.unitCost} /> },
    { id: 'ref', header: 'Reference', hideBelow: 'md', cell: (m) => <MoveRef move={m} /> },
    { id: 'dept', header: 'Department', hideBelow: 'xl', cell: (m) => <span className="text-sm">{dept(m.departmentId) || '–'}</span> },
    { id: 'by', header: 'By', hideBelow: 'xl', cell: (m) => <span className="text-sm">{actorName(m.by)}</span> },
  ]

  const exportCsv = () =>
    downloadCsv('stock-movements', [
      ['Date', 'Item', 'SKU', 'Warehouse', 'Kind', 'Qty', 'Unit', 'Unit cost', 'Value', 'Reference', 'Department', 'Note', 'By'],
      ...rows.map((m) => [
        fmtDateTime(m.at),
        itemName(state, m.itemId),
        state.items.find((i) => i.id === m.itemId)?.sku ?? '',
        warehouseName(state, m.warehouseId),
        STOCK_MOVE_KIND_LABEL[m.kind],
        m.qty,
        uomOf(state, m.itemId),
        m.unitCost,
        Math.round(m.qty * m.unitCost),
        m.ref?.label ?? '',
        dept(m.departmentId),
        m.note,
        actorName(m.by),
      ]),
    ])

  return (
    <div>
      <PageHeader
        title="Stock movements"
        description="Every move in and out of the store rooms, newest first. Moves with value post an inventory journal."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search movements" placeholder="Item, reference or note" />
            <Button variant="outline" disabled={!rows.length} title={rows.length ? undefined : 'Nothing to export.'} onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
          </>
        }
      />
      <SubTabs items={INVENTORY_TABS} />
      <ChipRow>
        <Chip active={!kind} count={scoped.length} onClick={() => set('kind', null)}>
          All
        </Chip>
        {KINDS.filter((k) => kindCounts[k]).map((k) => (
          <Chip key={k} active={kind === k} count={kindCounts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
            {STOCK_MOVE_KIND_LABEL[k]}
          </Chip>
        ))}
      </ChipRow>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <ItemSelect value={item} onChange={(v) => set('item', v || null)} placeholder="All items" aria-label="Filter by item" className="col-span-2 sm:w-64" />
        <WarehouseSelect value={warehouse} onChange={(v) => set('warehouse', v || null)} placeholder="All warehouses" aria-label="Filter by warehouse" className="col-span-2 sm:w-56" />
        <Input type="date" aria-label="From" value={from} onChange={(e) => set('from', e.target.value || null)} className="min-w-0 sm:w-44" />
        <Input type="date" aria-label="To" value={to} onChange={(e) => set('to', e.target.value || null)} className="min-w-0 sm:w-44" />
        <FilterCaption shown={rows.length} total={state.stockMoves.length} filters={filters} onClear={() => clear()} />
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(m) => m.id}
          rowLabel={(m) => `${itemName(state, m.itemId)} ${STOCK_MOVE_KIND_LABEL[m.kind]}`}
          initialSort={{ id: 'at', desc: true }}
          resetPageKey={`${q}|${kind}|${item}|${warehouse}|${from}|${to}`}
          pageSize={20}
          empty={filteredEmpty(filters, () => clear(), 'movements', <EmptyState compact title="No movements yet" description="Receipts, issues and counts show up here." />)}
        />
      </div>
    </div>
  )
}

export const MOVE_VARIANT: Record<StockMoveKind, BadgeVariant> = {
  opening: 'muted',
  receipt: 'success',
  issue: 'default',
  adjustment: 'warning',
  transfer_in: 'info',
  transfer_out: 'info',
  count: 'ink',
  scrap: 'danger',
  return: 'danger',
}

// ---------------------------------------------------------------- counts

const COUNT_STATUSES: StockCountStatus[] = ['draft', 'posted']
const COUNT_LABEL: Record<StockCountStatus, string> = { draft: 'In progress', posted: 'Posted' }
const COUNT_VARIANT: Record<StockCountStatus, BadgeVariant> = { draft: 'warning', posted: 'success' }
const CountBadge = ({ status }: { status: StockCountStatus }) => <Badge variant={COUNT_VARIANT[status]}>{COUNT_LABEL[status]}</Badge>

const diffValue = (s: AppState, c: StockCount) => c.lines.reduce((n, l) => n + (l.countedQty === null ? 0 : (l.countedQty - l.systemQty) * averageCost(s, l.itemId)), 0)

export function StockCountsPage() {
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const [starting, setStarting] = useState(false)
  const q = params.get('q') ?? ''
  const status = (params.get('status') as StockCountStatus | null) || null
  const terms = searchTerms(q)
  const searched = state.stockCounts.filter((c) => terms.every((w) => `${c.code} ${warehouseName(state, c.warehouseId)} ${c.note}`.toLowerCase().includes(w)))
  const statusCounts = countBy(searched, (c) => c.status)
  const rows = searched.filter((c) => !status || c.status === status)
  const filters = [q, status].filter(Boolean).length

  const columns: Column<StockCount>[] = [
    {
      id: 'code',
      header: 'Count',
      sortValue: (c) => c.code,
      cell: (c) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{c.code}</div>
          <div className="truncate text-sm">{warehouseName(state, c.warehouseId)}</div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', sortValue: (c) => c.status, cell: (c) => <CountBadge status={c.status} /> },
    {
      id: 'progress',
      header: 'Counted',
      hideBelow: 'sm',
      align: 'right',
      cell: (c) => (
        <span className="text-sm tabular-nums">
          {c.lines.filter((l) => l.countedQty !== null).length} of {c.lines.length}
        </span>
      ),
    },
    { id: 'diff', header: 'Difference', align: 'right', hideBelow: 'md', sortValue: (c) => diffValue(state, c), cell: (c) => <Money value={diffValue(state, c)} dash /> },
    { id: 'created', header: 'Started', hideBelow: 'lg', sortValue: (c) => c.createdAt, cell: (c) => <span className="text-sm">{fmtDate(c.createdAt)} · {actorName(c.by)}</span> },
    { id: 'posted', header: 'Posted', hideBelow: 'lg', sortValue: (c) => c.postedAt, cell: (c) => <span className="text-sm">{c.postedAt ? fmtDate(c.postedAt) : '–'}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Stock counts"
        description="Count a store room, then post the differences as count moves against the item expense accounts."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search counts" placeholder="Code, warehouse or note" />
            {can('inventory.manage') && (
              <Button onClick={() => setStarting(true)}>
                <Plus />
                Start count
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={INVENTORY_TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {COUNT_STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {COUNT_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <FilterCaption shown={rows.length} total={state.stockCounts.length} filters={filters} onClear={() => clear()} />
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(c) => c.id}
          rowLabel={(c) => c.code}
          onRowClick={(c) => navigate(paths.stockCount(c.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${status}`}
          empty={filteredEmpty(filters, () => clear(), 'counts', <EmptyState compact title="No counts yet" description="Start a count to check a store room against the books." />)}
        />
      </div>
      <Dialog open={starting} onOpenChange={setStarting} title="Start a stock count" description="The count takes a snapshot of what the books say each item holds in the warehouse.">
        {starting && (
          <StartCountForm
            onDone={(id) => {
              setStarting(false)
              if (id) navigate(paths.stockCount(id))
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

function StartCountForm({ onDone }: { onDone: (id?: string) => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [warehouseId, setWarehouseId] = useState('')
  const [note, setNote] = useState('')
  const at = nowIso()
  const count: StockCount = {
    id: newId('opn'),
    code: nextCountCode(state),
    warehouseId,
    status: 'draft',
    lines: state.items
      .filter((i) => i.active || onHand(state, i.id, warehouseId) !== 0)
      .map((i) => ({ itemId: i.id, systemQty: onHand(state, i.id, warehouseId), countedQty: null })),
    note: note.trim(),
    createdAt: at,
    postedAt: null,
    by: user.id,
  }
  const blocker = warehouseId ? blockerFor(state, { type: 'counts/create', count }) : 'Pick the warehouse to count.'

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'counts/create', count }, 'Count started', `${count.code} · ${warehouseName(state, warehouseId)}`)) onDone(count.id)
      }}
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField label="Warehouse" required hint={warehouseId ? `${count.lines.length} items to count` : undefined}>
          <WarehouseSelect value={warehouseId} onChange={setWarehouseId} />
        </FormField>
        <FormField label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Quarter end count" />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit">Start count</Button>
      </DialogFooter>
    </form>
  )
}

export function StockCountDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const c = state.stockCounts.find((x) => x.id === id)
  if (!c) {
    return (
      <Card>
        <EmptyState title="Count not found" description="This count may have been removed." action={<BackButton fallback={paths.stockCounts} />} />
      </Card>
    )
  }
  return <CountSheet key={c.id} count={c} />
}

function CountSheet({ count: c }: { count: StockCount }) {
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const manage = can('inventory.manage')
  const editable = manage && c.status === 'draft'
  const [counted, setCounted] = useState<Record<string, string>>(() => Object.fromEntries(c.lines.map((l) => [l.itemId, l.countedQty === null ? '' : String(l.countedQty)])))
  const lines: StockCount['lines'] = c.lines.map((l) => ({ ...l, countedQty: counted[l.itemId]?.trim() ? qtyNumber(counted[l.itemId]) : null }))
  const dirty = lines.some((l, i) => l.countedQty !== c.lines[i].countedQty)
  const draft = { ...c, lines }
  const saveBlocker = blockerFor(state, { type: 'counts/save', id: c.id, lines })
  const left = lines.filter((l) => l.countedQty === null).length
  const postBlocker = saveBlocker ?? (left ? `Count ${left} more ${left === 1 ? 'item' : 'items'} first.` : dirty ? null : blockerFor(state, { type: 'counts/post', id: c.id }))
  const net = diffValue(state, draft)
  const differing = lines.filter((l) => l.countedQty !== null && l.countedQty !== l.systemQty).length
  const wh = warehouseName(state, c.warehouseId)

  const save = () => act({ type: 'counts/save', id: c.id, lines }, 'Count saved', `${c.code} · ${lines.length - left} of ${lines.length} counted`)
  const post = () => {
    if (dirty && !save()) return
    act({ type: 'counts/post', id: c.id }, 'Count posted', `${c.code} · ${differing} ${differing === 1 ? 'difference' : 'differences'} booked`)
  }

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <BackButton fallback={paths.stockCounts} />
      </div>
      <div className="hidden print:block">
        <LetterHead company={state.company} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{c.code}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">Count of {wh}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
            <CountBadge status={c.status} />
            <span>
              Started {fmtDate(c.createdAt)} by {actorName(c.by)}
            </span>
            {c.postedAt && <span>· Posted {fmtDate(c.postedAt)}</span>}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print sheet
          </Button>
          {editable && (
            <>
              <Button variant="outline" disabled={!dirty || !!saveBlocker} title={saveBlocker ?? (dirty ? undefined : 'Nothing has changed since the last save.')} onClick={save}>
                Save
              </Button>
              <Button disabled={!!postBlocker} title={postBlocker ?? undefined} onClick={post}>
                <ClipboardCheck />
                Post count
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 print:hidden">
        <StatCard label="Items" value={lines.length} icon={<Boxes />} />
        <StatCard label="Counted" value={lines.length - left} icon={<ClipboardCheck />} tone={left ? 'warning' : 'success'} hint={left ? `${left} to go` : 'All counted'} />
        <StatCard label="Differences" value={differing} icon={<TriangleAlert />} tone={differing ? 'danger' : 'default'} />
        <StatCard label="Net value" value={fmtIdrShort(net).replace('Rp ', '')} tone="ink" hint="Rupiah at average cost" />
      </div>
      {c.note && <p className="text-sm text-muted">{c.note}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <p className="text-xs text-muted print:hidden">{editable ? 'Enter what is on the shelf. Leave a line blank until it is counted.' : 'System quantities as of the start of the count.'}</p>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {lines.map((l) => {
              const diff = l.countedQty === null ? null : l.countedQty - l.systemQty
              const name = itemName(state, l.itemId)
              return (
                <li key={l.itemId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_96px_128px_96px_120px] print:grid-cols-[minmax(0,1fr)_120px_160px]">
                  <div className="min-w-0">
                    <Link to={paths.item(l.itemId)} className="block truncate font-semibold hover:text-accent">
                      {name}
                    </Link>
                    <div className="font-mono text-xs text-muted">{state.items.find((i) => i.id === l.itemId)?.sku}</div>
                  </div>
                  <div className="text-right text-xs text-muted sm:text-sm sm:text-body">
                    <span className="sm:hidden">System </span>
                    <Qty itemId={l.itemId} qty={l.systemQty} />
                  </div>
                  {editable ? (
                    <Input
                      inputMode="decimal"
                      aria-label={`Counted ${name}`}
                      placeholder="Counted"
                      value={counted[l.itemId] ?? ''}
                      onChange={(e) => setCounted({ ...counted, [l.itemId]: decimal(e.target.value) })}
                      inputClassName="text-right tabular-nums"
                      className="print:hidden"
                    />
                  ) : (
                    <div className="text-right tabular-nums print:hidden">{l.countedQty === null ? '–' : fmtQty(state, l.itemId, l.countedQty)}</div>
                  )}
                  <div className="hidden h-8 border-b border-foreground print:block" aria-hidden />
                  <div className={`text-right tabular-nums print:hidden ${diff ? (diff < 0 ? 'text-danger' : 'text-success') : 'text-muted'}`}>
                    {diff === null ? '–' : `${diff > 0 ? '+' : ''}${diff.toLocaleString('id-ID')}`}
                  </div>
                  <Money value={diff ? diff * averageCost(state, l.itemId) : 0} dash className="text-right print:hidden" />
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>
      <div className="hidden grid-cols-2 gap-8 pt-8 text-sm print:grid">
        <Signature role="Counted by" name="" />
        <Signature role="Checked by" name="" />
      </div>
    </div>
  )
}
