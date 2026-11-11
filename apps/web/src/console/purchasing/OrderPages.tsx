import {
  addDays,
  bestPrice,
  billable,
  blockerFor,
  buildPoFromRequests,
  countBy,
  fmtDate,
  fmtDateLong,
  fmtIdr,
  fmtIdrShort,
  fmtPercent,
  fromDateInput,
  isPoLate,
  newId,
  nextPoCode,
  nowIso,
  poTotals,
  toDateInput,
  type AppState,
} from '@artha/fixtures'
import { PO_STATUS_LABEL, type PoLine, type PoStatus, type PurchaseOrder } from '@artha/types'
import {
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
  KeyValue,
  NativeSelect,
  PageHeader,
  ProgressBar,
  StatCard,
  Switch,
  Textarea,
  type Column,
} from '@artha/ui'
import { AlarmClock, Ban, FilePen, Lock, PackageCheck, Pencil, Plus, Printer, Receipt, Search, Send, Truck, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { LetterBlock, LetterHead, Signature } from '../../components/Letter'
import { CodeLink, paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { useSetParam } from '../../lib/useSetParam'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Money, TotalsBlock } from '../finance/parts'
import { ItemSelect, PoStatusBadge, QcBadge, qcResult, Qty, VendorSelect, WarehouseSelect } from './parts'

const STATUSES: PoStatus[] = ['draft', 'sent', 'partial', 'received', 'closed', 'cancelled']
type StatusFilter = PoStatus | 'late'
type Tile = 'draft' | 'open' | 'late' | 'bill'

const vendorName = (s: AppState, id: string) => s.vendors.find((v) => v.id === id)?.name ?? 'Unknown supplier'
const warehouseName = (s: AppState, id: string) => s.warehouses.find((w) => w.id === id)?.name ?? '–'
const itemLabel = (s: AppState, id: string) => s.items.find((i) => i.id === id)?.name ?? 'Unknown item'
const digits = (v: string) => Number(v.replace(/\D/g, ''))
const blankLine = (): PoLine => ({ id: newId('pol'), itemId: '', qty: 1, unitPrice: 0, receivedQty: 0, rejectedQty: 0, returnedQty: 0, billedQty: 0, creditedQty: 0 })
/** Received value over ordered value, before VAT. */
const receivedPct = (po: PurchaseOrder) => {
  const t = poTotals(po)
  return t.subtotal ? (t.received / t.subtotal) * 100 : 0
}
const billableValue = (po: PurchaseOrder) => po.lines.reduce((n, l) => n + billable(l) * l.unitPrice, 0)
const asDocTotals = (po: Pick<PurchaseOrder, 'lines' | 'taxPct'>) => {
  const t = poTotals(po)
  return { subtotal: t.subtotal, tax: t.tax, total: t.total, paid: 0, balance: t.total }
}

// ---------------------------------------------------------------- list

export function PurchaseOrdersPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as StatusFilter | null) || null
  const tile = (params.get('tile') as Tile | null) || null
  const vendor = params.get('vendor') ?? ''

  const late = (po: PurchaseOrder) => isPoLate(po, now)
  const inTile: Record<Tile, (po: PurchaseOrder) => boolean> = {
    draft: (po) => po.status === 'draft',
    open: (po) => po.status === 'sent' || po.status === 'partial',
    late,
    bill: (po) => po.status !== 'draft' && po.status !== 'cancelled' && billableValue(po) > 0,
  }
  const all = state.purchaseOrders
  const tiles = { draft: all.filter(inTile.draft), open: all.filter(inTile.open), late: all.filter(late), bill: all.filter(inTile.bill) }
  const toggleTile = (t: Tile) => set('tile', tile === t ? null : t)

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = all.filter(
    (po) =>
      (!vendor || po.vendorId === vendor) &&
      (!tile || inTile[tile](po)) &&
      terms.every((w) => `${po.code} ${vendorName(state, po.vendorId)} ${po.note} ${po.lines.map((l) => itemLabel(state, l.itemId)).join(' ')}`.toLowerCase().includes(w)),
  )
  const statusCounts = countBy(searched, (po) => po.status)
  const matches = (po: PurchaseOrder) => !status || (status === 'late' ? late(po) : po.status === status)
  const rows = searched.filter(matches)
  const filters = [q, status, tile, vendor].filter(Boolean).length

  const columns: Column<PurchaseOrder>[] = [
    {
      id: 'code',
      header: 'Order',
      sortValue: (po) => po.code,
      cell: (po) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{po.code}</div>
          <div className="truncate text-sm md:hidden">{vendorName(state, po.vendorId)}</div>
          <div className="mt-1.5 sm:hidden">
            <PoStatusBadge po={po} />
          </div>
        </div>
      ),
    },
    { id: 'vendor', header: 'Supplier', hideBelow: 'md', sortValue: (po) => vendorName(state, po.vendorId), cell: (po) => <span className="block truncate text-sm font-semibold">{vendorName(state, po.vendorId)}</span> },
    { id: 'date', header: 'Ordered', hideBelow: 'xl', sortValue: (po) => po.orderDate, cell: (po) => <span className="text-xs text-muted">{fmtDate(po.orderDate)}</span> },
    {
      id: 'expected',
      header: 'Expected',
      hideBelow: 'lg',
      sortValue: (po) => po.expectedDate,
      cell: (po) => <span className={`text-xs ${late(po) ? 'font-semibold text-accent' : 'text-muted'}`}>{fmtDate(po.expectedDate)}</span>,
    },
    { id: 'total', header: 'Total', align: 'right', sortValue: (po) => poTotals(po).total, cell: (po) => <Money value={poTotals(po).total} className="font-semibold" /> },
    {
      id: 'received',
      header: 'Received',
      hideBelow: 'lg',
      sortValue: receivedPct,
      cell: (po) => (
        <div className="flex w-28 items-center gap-2">
          <ProgressBar value={receivedPct(po)} tone={receivedPct(po) >= 100 ? 'success' : 'ink'} className="flex-1" />
          <span className="w-10 text-right text-xs tabular-nums text-muted">{fmtPercent(receivedPct(po), 0)}</span>
        </div>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (po) => STATUSES.indexOf(po.status), cell: (po) => <PoStatusBadge po={po} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Orders sent to suppliers. Goods arrive on receipts; received units become a bill against goods received not invoiced."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search orders"
              placeholder="Code, supplier or item"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('purchase.order') && (
              <Button asChild>
                <Link to={paths.poNew}>
                  <Plus />
                  New order
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Draft" value={tiles.draft.length} icon={<FilePen />} hint="Not sent yet" active={tile === 'draft'} onClick={() => toggleTile('draft')} />
        <StatCard label="Open" value={tiles.open.length} icon={<Truck />} tone="ink" hint="Sent or part received" active={tile === 'open'} onClick={() => toggleTile('open')} />
        <StatCard label="Late" value={tiles.late.length} icon={<AlarmClock />} tone={tiles.late.length ? 'danger' : 'default'} hint="Past the expected date" active={tile === 'late'} onClick={() => toggleTile('late')} />
        <StatCard
          label="To bill"
          value={tiles.bill.length}
          icon={<Receipt />}
          tone={tiles.bill.length ? 'warning' : 'default'}
          hint={tiles.bill.length ? fmtIdrShort(tiles.bill.reduce((n, po) => n + billableValue(po), 0)) : 'Every received unit is billed'}
          active={tile === 'bill'}
          onClick={() => toggleTile('bill')}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {PO_STATUS_LABEL[s]}
            </Chip>
          ))}
          <Chip active={status === 'late'} count={searched.filter(late).length} onClick={() => set('status', status === 'late' ? null : 'late')}>
            Late
          </Chip>
        </ChipRow>
        <NativeSelect aria-label="Filter by supplier" value={vendor} onChange={(e) => set('vendor', e.target.value || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <option value="">All suppliers</option>
          {state.vendors
            .filter((v) => all.some((po) => po.vendorId === v.id))
            .map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
        </NativeSelect>
      </div>
      {filters > 0 && (
        <div className="mt-2 text-xs text-muted tabular-nums">
          {rows.length} of {all.length}
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
            Clear {filters} {filters === 1 ? 'filter' : 'filters'}
          </Button>
        </div>
      )}
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(po) => po.id}
          rowLabel={(po) => po.code}
          onRowClick={(po) => navigate(paths.po(po.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${status}|${tile}|${vendor}`}
          rowClassName={(po) => (late(po) ? 'bg-accent-soft/40' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching orders" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No orders yet" description="Order approved requests, or start an order from scratch." />
            )
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- editor

export function PurchaseOrderEditorPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const old = id ? state.purchaseOrders.find((po) => po.id === id) : undefined
  if (!can('purchase.order')) return <NoAccess description="Writing purchase orders needs the order permission." />
  if (id && !old) {
    return (
      <Card>
        <EmptyState pageTitle title="Order not found" description="This order may have been removed." action={<BackButton fallback={paths.pos} />} />
      </Card>
    )
  }
  if (old && old.status !== 'draft') {
    return (
      <Card>
        <h1 className="sr-only">Only a draft order can be edited</h1>
        <EmptyState title="Only a draft order can be edited" description={`${old.code} is ${PO_STATUS_LABEL[old.status].toLowerCase()}.`} action={<Button variant="outline" asChild><Link to={paths.po(old.id)}>Open order</Link></Button>} />
      </Card>
    )
  }
  return <OrderEditor key={old?.id ?? 'new'} old={old ?? null} />
}

function OrderEditor({ old }: { old: PurchaseOrder | null }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [tried, setTried] = useState(false)
  // A new order starts from the requests and supplier in the URL, or blank.
  const [start] = useState<PurchaseOrder>(() => {
    if (old) return old
    const at = nowIso()
    const prIds = (params.get('prs') ?? '').split(',').filter((x) => state.purchaseRequests.some((r) => r.id === x && r.status === 'approved'))
    const vendorId = params.get('vendor') ?? ''
    if (prIds.length) return buildPoFromRequests(state, prIds, vendorId, at, user.id)
    const vendor = state.vendors.find((v) => v.id === vendorId)
    return {
      id: newId('po'),
      code: nextPoCode(state),
      vendorId: vendor ? vendorId : '',
      warehouseId: state.purchasingSettings.defaultWarehouseId,
      prIds: [],
      orderDate: at,
      expectedDate: addDays(at, 7),
      lines: [blankLine()],
      taxPct: state.financeSettings.vatPct,
      terms: vendor ? `Net ${vendor.termsDays} days` : '',
      note: '',
      status: 'draft',
      shipping: null,
      sentAt: null,
      billIds: [],
      createdBy: user.id,
      createdAt: at,
    }
  })
  const [f, setF] = useState({
    vendorId: start.vendorId,
    warehouseId: start.warehouseId,
    orderDate: toDateInput(start.orderDate),
    expectedDate: toDateInput(start.expectedDate),
    terms: start.terms,
    note: start.note,
    vat: start.taxPct > 0,
  })
  const [lines, setLines] = useState<PoLine[]>(start.lines)
  const [prIds, setPrIds] = useState<string[]>(start.prIds)
  const at = f.orderDate ? fromDateInput(f.orderDate) : nowIso()
  const listPrice = (itemId: string, qty: number, vendorId = f.vendorId) => (itemId && vendorId ? bestPrice(state, itemId, qty || 1, at, vendorId) : undefined)
  const setLine = (lineId: string, patch: Partial<PoLine>) => setLines(lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
  const pickItem = (l: PoLine, itemId: string) => setLine(l.id, { itemId, unitPrice: listPrice(itemId, l.qty)?.price ?? (itemId ? (bestPrice(state, itemId, l.qty || 1, at)?.price ?? 0) : 0) })
  const pickVendor = (vendorId: string) => {
    const v = state.vendors.find((x) => x.id === vendorId)
    setF({ ...f, vendorId, terms: v ? `Net ${v.termsDays} days` : f.terms })
    setLines(lines.map((l) => ({ ...l, unitPrice: listPrice(l.itemId, l.qty, vendorId)?.price ?? l.unitPrice })))
  }
  // Adding a request merges its lines by item.
  const addRequest = (prId: string) => {
    const pr = state.purchaseRequests.find((r) => r.id === prId)
    if (!pr) return
    let next = lines.filter((l) => l.itemId)
    for (const pl of pr.lines) {
      const hit = next.find((l) => l.itemId === pl.itemId)
      next = hit
        ? next.map((l) => (l === hit ? { ...l, qty: l.qty + pl.qty } : l))
        : [...next, { ...blankLine(), itemId: pl.itemId, qty: pl.qty, unitPrice: listPrice(pl.itemId, pl.qty)?.price ?? pl.estPrice }]
    }
    setLines(next)
    setPrIds([...prIds, prId])
  }
  const addable = state.purchaseRequests.filter((r) => r.status === 'approved' && !prIds.includes(r.id))

  const po: PurchaseOrder = {
    ...start,
    code: old?.code ?? nextPoCode(state),
    vendorId: f.vendorId,
    warehouseId: f.warehouseId,
    prIds,
    orderDate: at,
    expectedDate: f.expectedDate ? fromDateInput(f.expectedDate) : '',
    lines,
    taxPct: f.vat ? start.taxPct || state.financeSettings.vatPct : 0,
    terms: f.terms.trim(),
    note: f.note.trim(),
  }
  const blocker = !f.orderDate || !f.expectedDate ? 'Pick the order date and the expected date.' : blockerFor(state, { type: 'pos/save', po })

  const save = (send: boolean) => {
    setTried(true)
    if (blocker) return
    if (!act({ type: 'pos/save', po }, old ? 'Draft saved' : 'Order saved as draft', po.code)) return
    if (send) act({ type: 'pos/send', id: po.id }, 'Order sent', `${po.code} to ${vendorName(state, po.vendorId)}`)
    navigate(paths.po(po.id), { replace: !old })
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={old ? paths.po(old.id) : paths.pos} />
      <PageHeader className="mb-0" eyebrow={<span className="font-mono">{po.code}</span>} title={old ? 'Edit order' : 'New purchase order'} description="A draft stays with you. Sending it fixes the lines and prices, and the order waits for goods." />
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Supplier" required className="sm:col-span-2">
            <VendorSelect value={f.vendorId} onChange={pickVendor} />
          </FormField>
          <FormField label="Ship to" required className="sm:col-span-2">
            <WarehouseSelect value={f.warehouseId} onChange={(warehouseId) => setF({ ...f, warehouseId })} />
          </FormField>
          <FormField label="Order date" required>
            <Input type="date" value={f.orderDate} onChange={(e) => setF({ ...f, orderDate: e.target.value })} />
          </FormField>
          <FormField label="Expected" required>
            <Input type="date" value={f.expectedDate} onChange={(e) => setF({ ...f, expectedDate: e.target.value })} />
          </FormField>
          <FormField label="Terms" className="sm:col-span-2">
            <Input value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} placeholder="Net 30 days" />
          </FormField>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm sm:col-span-2">
            <span>
              <span className="block font-semibold">VAT {start.taxPct || state.financeSettings.vatPct}%</span>
              <span className="text-xs text-muted">Turn on when the supplier charges PPN.</span>
            </span>
            <Switch label="VAT" checked={f.vat} onCheckedChange={(vat) => setF({ ...f, vat })} />
          </label>
          <FormField label="Note to the supplier" className="sm:col-span-2">
            <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Linked requests</CardTitle>
          <p className="text-sm text-muted">Linked requests turn to Ordered when you save. Removing one puts it back to Approved; its lines stay.</p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {prIds.map((rid) => {
            const pr = state.purchaseRequests.find((r) => r.id === rid)
            return (
              <span key={rid} className="inline-flex h-9 items-center gap-1 rounded-full bg-surface-2 pl-4 pr-1 text-sm">
                <span className="font-mono text-xs font-semibold">{pr?.code ?? rid}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Unlink ${pr?.code ?? 'request'}`} onClick={() => setPrIds(prIds.filter((x) => x !== rid))}>
                  <X />
                </Button>
              </span>
            )
          })}
          {!prIds.length && <span className="text-sm text-muted">None. This order is not tied to a request.</span>}
          {addable.length > 0 && (
            <NativeSelect aria-label="Link an approved request" value="" onChange={(e) => addRequest(e.target.value)} className="min-w-0 flex-1 sm:w-64 sm:flex-none">
              <option value="">Link an approved request</option>
              {addable.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} · {r.lines.length} {r.lines.length === 1 ? 'item' : 'items'}
                </option>
              ))}
            </NativeSelect>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
          <p className="text-sm text-muted">Picking an item fills the supplier's list price for the quantity.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ul className="space-y-3">
            {lines.map((l, i) => {
              const list = listPrice(l.itemId, l.qty)
              return (
                <li key={l.id} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 sm:grid-cols-[minmax(0,2fr)_5rem_8rem_auto] sm:items-center">
                  <ItemSelect aria-label={`Line ${i + 1} item`} value={l.itemId} onChange={(itemId) => pickItem(l, itemId)} className="col-span-2 sm:col-span-1" />
                  <Input aria-label={`Line ${i + 1} quantity`} inputMode="numeric" value={l.qty || ''} onChange={(e) => setLine(l.id, { qty: digits(e.target.value) })} />
                  <Input aria-label={`Line ${i + 1} unit price`} inputMode="numeric" placeholder="Unit price" value={l.unitPrice || ''} onChange={(e) => setLine(l.id, { unitPrice: digits(e.target.value) })} />
                  <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                    <Money value={l.qty * l.unitPrice} className="text-sm font-semibold sm:hidden" />
                    <Button variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} title={lines.length === 1 ? 'An order needs at least one line.' : undefined} onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>
                      <X />
                    </Button>
                  </div>
                  {l.itemId && f.vendorId && (
                    <p className={`col-span-2 text-xs sm:col-span-4 ${list && l.unitPrice > list.price ? 'font-semibold text-accent' : 'text-muted'}`}>
                      {!list
                        ? 'This supplier has no list price for the item at this quantity.'
                        : l.unitPrice > list.price
                          ? `Above the supplier's list price of ${fmtIdr(list.price)} by ${fmtIdr(l.unitPrice - list.price)} a unit.`
                          : `List price ${fmtIdr(list.price)}, ${list.leadDays} days to deliver.`}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, blankLine()])}>
              <Plus />
              Add line
            </Button>
            <TotalsBlock totals={asDocTotals(po)} taxPct={po.taxPct} />
          </div>
        </CardContent>
      </Card>

      {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => save(false)}>
          Save draft
        </Button>
        <Button onClick={() => save(true)}>
          <Send />
          Save and send
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- detail

export function PurchaseOrderDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [billing, setBilling] = useState(false)
  const [confirm, setConfirm] = useState<'close' | 'cancel' | null>(null)
  const po = state.purchaseOrders.find((x) => x.id === id)
  if (!po) {
    return (
      <Card>
        <EmptyState pageTitle title="Order not found" description="This order may have been removed." action={<BackButton fallback={paths.pos} />} />
      </Card>
    )
  }
  const vendor = state.vendors.find((v) => v.id === po.vendorId)
  const totals = poTotals(po)
  const pct = receivedPct(po)
  const late = isPoLate(po, now)
  const manage = can('purchase.order')
  const open = po.status === 'sent' || po.status === 'partial'
  const sendBlocker = blockerFor(state, { type: 'pos/send', id: po.id })
  const closeBlocker = blockerFor(state, { type: 'pos/close', id: po.id })
  const cancelBlocker = blockerFor(state, { type: 'pos/cancel', id: po.id })
  const toBill = billableValue(po)
  const billBlocker = po.status === 'draft' || po.status === 'cancelled' ? 'Send the order and receive goods first.' : toBill ? null : 'Every received unit is already billed.'

  const receipts = state.goodsReceipts.filter((r) => r.poId === po.id)
  const returns = state.purchaseReturns.filter((r) => r.poId === po.id)
  const bills = state.bills.filter((b) => po.billIds.includes(b.id))
  const journalIds = [...receipts.map((r) => r.journalId), ...returns.map((r) => r.journalId), ...bills.map((b) => b.journalId)].filter((x): x is string => !!x)
  const journals = state.journals.filter((j) => journalIds.includes(j.id))
  const requests = state.purchaseRequests.filter((r) => po.prIds.includes(r.id))

  return (
    <div className="space-y-4">
      <div className="space-y-4 print:hidden">
        <BackButton fallback={paths.pos} />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-xs font-semibold text-muted">{po.code}</div>
            <h1 className="truncate text-2xl font-bold tracking-tight">Order to {vendor?.name ?? 'unknown supplier'}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PoStatusBadge po={po} />
              {po.sentAt && <span className="text-xs text-muted">Sent {fmtDate(po.sentAt)}</span>}
            </div>
          </div>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer />
              Print
            </Button>
            {manage && (
              <>
                {po.status === 'draft' && (
                  <Button variant="outline" asChild>
                    <Link to={paths.poEdit(po.id)}>
                      <Pencil />
                      Edit
                    </Link>
                  </Button>
                )}
                {(po.status === 'draft' || po.status === 'sent') && (
                  <Button variant="outline" disabled={!!cancelBlocker} title={cancelBlocker ?? undefined} onClick={() => setConfirm('cancel')}>
                    <Ban />
                    Cancel order
                  </Button>
                )}
                {(po.status === 'partial' || po.status === 'received') && (
                  <Button variant="outline" disabled={!!closeBlocker} title={closeBlocker ?? undefined} onClick={() => setConfirm('close')}>
                    <Lock />
                    Close
                  </Button>
                )}
                {po.status !== 'draft' && po.status !== 'cancelled' && (
                  <Button variant={open ? 'outline' : 'primary'} disabled={!!billBlocker} title={billBlocker ?? undefined} onClick={() => setBilling(true)}>
                    <Receipt />
                    Bill received goods
                  </Button>
                )}
                {po.status === 'draft' && (
                  <Button disabled={!!sendBlocker} title={sendBlocker ?? undefined} onClick={() => act({ type: 'pos/send', id: po.id }, 'Order sent', `${po.code} to ${vendor?.name ?? 'the supplier'}`)}>
                    <Send />
                    Send
                  </Button>
                )}
                {open && (
                  <Button asChild>
                    <Link to={`${paths.goodsReceipts}?po=${po.id}`}>
                      <PackageCheck />
                      Receive goods
                    </Link>
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Card variant="ink" className="h-fit p-6">
            <div className="text-xs text-on-ink-muted">Order total</div>
            <Money value={totals.total} className="mt-1 block text-3xl font-bold tracking-tight" />
            <div className="mt-4 flex items-center gap-3">
              <ProgressBar value={pct} tone={pct >= 100 ? 'success' : 'accent'} className="flex-1" />
              <span className="text-sm font-semibold tabular-nums">{fmtPercent(pct, 0)} received</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-on-ink-muted">Ordered</div>
                <div className="font-semibold">{fmtDate(po.orderDate)}</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-on-ink-muted">Expected</div>
                <div className={`font-semibold ${late ? 'text-accent' : ''}`}>{fmtDate(po.expectedDate)}</div>
              </div>
              <div className="col-span-2 min-w-0 rounded-2xl bg-white/5 p-3 sm:col-span-1">
                <div className="text-xs text-on-ink-muted">To bill</div>
                <Money value={toBill} className="font-semibold" />
              </div>
            </div>
            {po.note && <p className="mt-4 text-sm text-on-ink-muted">{po.note}</p>}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Order</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                bare
                size="sm"
                items={[
                  { label: 'Supplier', value: vendor ? <Link to={paths.supplier(vendor.id)} className="font-semibold hover:text-accent">{vendor.name}</Link> : '–' },
                  { label: 'Ship to', value: warehouseName(state, po.warehouseId) },
                  { label: 'Terms', value: po.terms || '–' },
                  { label: 'VAT', value: po.taxPct ? `${po.taxPct}%` : 'None' },
                  {
                    label: 'Requests',
                    value: requests.length ? (
                      <span className="flex flex-wrap gap-2">
                        {requests.map((r) => (
                          <CodeLink key={r.id} to={paths.pr(r.id)} code={r.code} />
                        ))}
                      </span>
                    ) : (
                      'None'
                    ),
                  },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lines</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Ordered</th>
                    <th className="px-3 py-2 text-right font-medium">Received</th>
                    <th className="px-3 py-2 text-right font-medium">Rejected</th>
                    <th className="px-3 py-2 text-right font-medium">Returned</th>
                    <th className="px-3 py-2 text-right font-medium">Billed</th>
                    <th className="py-2 pl-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {po.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 pr-3">
                        <Link to={paths.item(l.itemId)} className="font-semibold hover:text-accent">
                          {itemLabel(state, l.itemId)}
                        </Link>
                        <div className="text-xs text-muted tabular-nums">{fmtIdr(l.unitPrice)} a unit</div>
                      </td>
                      <td className="px-3 py-2.5 text-right"><Qty itemId={l.itemId} qty={l.qty} /></td>
                      <td className="px-3 py-2.5 text-right"><Qty itemId={l.itemId} qty={l.receivedQty} /></td>
                      <td className={`px-3 py-2.5 text-right ${l.rejectedQty ? 'text-accent' : ''}`}><Qty itemId={l.itemId} qty={l.rejectedQty} /></td>
                      <td className="px-3 py-2.5 text-right"><Qty itemId={l.itemId} qty={l.returnedQty} /></td>
                      <td className="px-3 py-2.5 text-right"><Qty itemId={l.itemId} qty={l.billedQty} /></td>
                      <td className="py-2.5 pl-3 text-right"><Money value={l.qty * l.unitPrice} className="font-semibold" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end">
              <TotalsBlock totals={asDocTotals(po)} taxPct={po.taxPct} />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ShippingCard po={po} editable={manage && open} />
          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {receipts.length + returns.length + bills.length === 0 ? (
                <EmptyState compact icon={<Truck />} title="Nothing yet" description={open ? 'Receipts, returns and bills on this order show up here.' : 'Send the order to start receiving goods.'} />
              ) : (
                <ul className="divide-y divide-border">
                  {receipts.map((r) => (
                    <DocRow key={r.id} kind="Receipt" to={paths.goodsReceipt(r.id)} code={r.code} date={r.receivedAt} extra={<QcBadge result={qcResult(r.lines)} />} />
                  ))}
                  {returns.map((r) => {
                    const credit = state.vendorCredits.find((c) => c.id === r.creditId)
                    return <DocRow key={r.id} kind="Return" to={paths.purchaseReturns} code={r.code} date={r.at} extra={credit ? <span className="font-mono text-xs text-muted">{credit.code}</span> : undefined} />
                  })}
                  {bills.map((b) => (
                    <DocRow key={b.id} kind="Bill" to={paths.bill(b.id)} code={b.code} date={b.date} extra={b.vendorRef ? <span className="font-mono text-xs text-muted">Ref {b.vendorRef}</span> : undefined} />
                  ))}
                </ul>
              )}
              {journals.length > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted">
                  Journals
                  {journals.map((j) => (
                    <CodeLink key={j.id} to={paths.journal(j.id)} code={j.code} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <OrderLetter po={po} />

      <Dialog open={billing} onOpenChange={setBilling} title={`Bill ${po.code}`} description={`${fmtIdr(toBill)} of received goods is not billed yet, before VAT. The bill posts against goods received not invoiced.`}>
        {billing && <BillForm po={po} onDone={() => setBilling(false)} />}
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'close' ? `Close ${po.code}?` : `Cancel ${po.code}?`}
        description={confirm === 'close' ? 'No more goods are expected on it. Units still to come are dropped.' : 'The supplier should not ship it. Linked requests go back to Approved.'}
      >
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirm(null)}>
            Keep it open
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const ok = confirm === 'close' ? act({ type: 'pos/close', id: po.id }, 'Order closed', po.code) : act({ type: 'pos/cancel', id: po.id }, 'Order cancelled', po.code)
              if (ok) setConfirm(null)
            }}
          >
            {confirm === 'close' ? 'Close order' : 'Cancel order'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function DocRow({ kind, to, code, date, extra }: { kind: string; to: string; code: string; date: string; extra?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted">{kind}</div>
        <CodeLink to={to} code={code} />
      </div>
      {extra}
      <span className="text-xs text-muted">{fmtDate(date)}</span>
    </li>
  )
}

function ShippingCard({ po, editable }: { po: PurchaseOrder; editable: boolean }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ carrier: po.shipping?.carrier ?? '', tracking: po.shipping?.tracking ?? '', shippedAt: po.shipping?.shippedAt ? toDateInput(po.shipping.shippedAt) : '' })
  const shipping = { carrier: f.carrier.trim(), tracking: f.tracking.trim(), shippedAt: f.shippedAt ? fromDateInput(f.shippedAt) : null }
  const blocker = blockerFor(state, { type: 'pos/ship', id: po.id, shipping })
  return (
    <Card>
      <CardHeader>
        <CardTitle>Shipping</CardTitle>
      </CardHeader>
      <CardContent>
        {editable ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              setTried(true)
              if (blocker) return
              act({ type: 'pos/ship', id: po.id, shipping }, 'Shipping saved', `${po.code} · ${shipping.carrier}`)
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Carrier" required>
                <Input value={f.carrier} onChange={(e) => setF({ ...f, carrier: e.target.value })} placeholder="JNE, SiCepat, own truck" />
              </FormField>
              <FormField label="Shipped on">
                <Input type="date" value={f.shippedAt} onChange={(e) => setF({ ...f, shippedAt: e.target.value })} />
              </FormField>
              <FormField label="Tracking number" className="sm:col-span-2">
                <Input value={f.tracking} onChange={(e) => setF({ ...f, tracking: e.target.value })} inputClassName="font-mono" />
              </FormField>
            </div>
            {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
            <div className="mt-4 flex justify-end">
              <Button type="submit" variant="outline">
                <Truck />
                Save shipping
              </Button>
            </div>
          </form>
        ) : po.shipping ? (
          <KeyValue
            bare
            size="sm"
            items={[
              { label: 'Carrier', value: po.shipping.carrier },
              { label: 'Tracking', value: <span className="font-mono text-xs">{po.shipping.tracking || '–'}</span> },
              { label: 'Shipped', value: po.shipping.shippedAt ? fmtDate(po.shipping.shippedAt) : '–' },
            ]}
          />
        ) : (
          <EmptyState compact icon={<Truck />} title="No shipping details" description={po.status === 'draft' ? 'Send the order first. The supplier shares tracking once it ships.' : 'The supplier did not share tracking for this order.'} />
        )}
      </CardContent>
    </Card>
  )
}

function BillForm({ po, onDone }: { po: PurchaseOrder; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const [billId] = useState(() => newId('bil'))
  const [f, setF] = useState({ vendorRef: '', date: toDateInput(nowIso()) })
  const action = { type: 'pos/bill' as const, id: po.id, billId, vendorRef: f.vendorRef, date: f.date ? fromDateInput(f.date) : '' }
  const blocker = f.date ? blockerFor(state, action) : 'Pick the invoice date.'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, 'Bill posted', `${po.code} · invoice ${f.vendorRef.trim()}`)) {
          onDone()
          navigate(paths.bill(billId))
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Supplier invoice number" required>
          <Input value={f.vendorRef} onChange={(e) => setF({ ...f, vendorRef: e.target.value })} inputClassName="font-mono" />
        </FormField>
        <FormField label="Invoice date" required>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Post bill</Button>
      </DialogFooter>
    </form>
  )
}

/** The printable purchase order: hidden on screen, the only thing on paper. */
function OrderLetter({ po }: { po: PurchaseOrder }) {
  const { state } = useAppState()
  const vendor = state.vendors.find((v) => v.id === po.vendorId)
  const warehouse = state.warehouses.find((w) => w.id === po.warehouseId)
  const branch = state.branches.find((b) => b.id === warehouse?.branchId)
  const creator = state.users.find((u) => u.id === po.createdBy)?.name ?? ''
  return (
    <div className="hidden print:block">
      <LetterHead company={state.company} />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-bold">Purchase order</div>
          <div className="font-mono text-xs text-muted">{po.code}</div>
        </div>
        <div className="text-sm text-muted">{fmtDateLong(po.orderDate)}</div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <LetterBlock title="Supplier">
          <div className="font-semibold">{vendor?.name ?? 'Unknown supplier'}</div>
          {vendor?.taxId && <div>NPWP {vendor.taxId}</div>}
          {vendor?.phone && <div>{vendor.phone}</div>}
          {vendor?.email && <div>{vendor.email}</div>}
        </LetterBlock>
        <LetterBlock title="Ship to">
          <div className="font-semibold">{warehouse?.name ?? '–'}</div>
          {branch && <div>{branch.name}</div>}
          <div>Expected by {fmtDateLong(po.expectedDate)}</div>
        </LetterBlock>
      </div>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
            <th className="py-2 pr-3 font-semibold">Item</th>
            <th className="py-2 pr-3 text-right font-semibold">Qty</th>
            <th className="py-2 pr-3 text-right font-semibold">Unit price</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {po.lines.map((l) => (
            <tr key={l.id}>
              <td className="py-2.5 pr-3">
                <div className="font-medium">{itemLabel(state, l.itemId)}</div>
                <div className="font-mono text-xs text-muted">{state.items.find((i) => i.id === l.itemId)?.sku}</div>
              </td>
              <td className="py-2.5 pr-3 text-right"><Qty itemId={l.itemId} qty={l.qty} /></td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{fmtIdr(l.unitPrice)}</td>
              <td className="py-2.5 text-right font-semibold tabular-nums">{fmtIdr(l.qty * l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <TotalsBlock totals={asDocTotals(po)} taxPct={po.taxPct} />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <LetterBlock title="Terms">{po.terms || 'As agreed'}</LetterBlock>
        <LetterBlock title="Note">{po.note || 'Quote this order number on the delivery order and the invoice.'}</LetterBlock>
      </div>
      <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <Signature role="Ordered by" name={creator} />
        <Signature role={`Accepted for ${vendor?.name ?? 'the supplier'}`} name="" />
      </div>
    </div>
  )
}
