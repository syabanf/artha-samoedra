import {
  accountLabel,
  billTotals,
  blockerFor,
  countBy,
  creditLeft,
  fmtDate,
  fmtDateLong,
  fmtIdr,
  fmtNumber,
  fmtQty,
  isPoLate,
  itemName,
  newId,
  nextReceiptCode,
  nextReturnCode,
  outstanding,
  returnable,
  type AppState,
} from '@artha/fixtures'
import { QC_RESULT_LABEL, STOCK_MOVE_KIND_LABEL, type GoodsReceipt, type PurchaseOrder, type PurchaseReturn, type QcResult, type VendorCredit } from '@artha/types'
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
  KeyValue,
  NativeSelect,
  PageHeader,
  StatCard,
  Textarea,
  type Column,
} from '@artha/ui'
import { AlarmClock, PackageCheck, PackageX, Printer, Truck, Undo2, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { LetterBlock, LetterHead, Signature } from '../../components/Letter'
import { CodeLink, paths } from '../../components/links'
import { SubTabs } from '../../components/SubTabs'
import { useSetParam } from '../../lib/useSetParam'
import { useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from '../finance/parts'
import { PoStatusBadge, QcBadge, qcResult, Qty } from './parts'
import { SearchBox } from '../../components/SearchBox'

const TABS = [
  { to: paths.goodsReceipts, label: 'Receipts' },
  { to: paths.purchaseReturns, label: 'Returns' },
]
const QC_RESULTS: QcResult[] = ['passed', 'partial', 'failed']

const vendorName = (s: AppState, id: string) => s.vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor'
const units = (lines: { qty: number }[]) => lines.reduce((n, l) => n + l.qty, 0)
const lineOf = (po: PurchaseOrder | undefined, id: string) => po?.lines.find((l) => l.id === id)
/** Decimal quantity from an input, or 0. */
const toQty = (v: string) => Math.max(Number(v.replace(',', '.')) || 0, 0)

function FilterCount({ shown, total, filters, onClear }: { shown: number; total: number; filters: number; onClear: () => void }) {
  if (!filters) return null
  return (
    <span className="text-xs text-muted tabular-nums">
      {shown} of {total}
      <Button variant="ghost" size="sm" className="ml-1" onClick={onClear}>
        Clear {filters} {filters === 1 ? 'filter' : 'filters'}
      </Button>
    </span>
  )
}

// ---------------------------------------------------------------- receipts

export function GoodsReceiptsPage() {
  const { state } = useScoped()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const q = params.get('q') ?? ''
  const qc = (params.get('qc') as QcResult | null) || null
  const poParam = params.get('po')
  const manage = can('purchase.order')
  const [receiving, setReceiving] = useState(false)
  const open = manage && (receiving || !!poParam)
  const close = () => {
    setReceiving(false)
    if (poParam) set('po', null)
  }

  const poOf = (r: GoodsReceipt) => state.purchaseOrders.find((p) => p.id === r.poId)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.goodsReceipts.filter((r) => {
    const po = poOf(r)
    return terms.every((w) => `${r.code} ${r.deliveryNote} ${po?.code ?? ''} ${po ? vendorName(state, po.vendorId) : ''}`.toLowerCase().includes(w))
  })
  const qcCounts = countBy(searched, (r) => qcResult(r.lines))
  const rows = searched.filter((r) => !qc || qcResult(r.lines) === qc)
  const filters = [q, qc].filter(Boolean).length

  const waiting = state.purchaseOrders.filter((p) => p.status === 'sent' || p.status === 'partial')
  const late = waiting.filter((p) => isPoLate(p, now))
  const rejected = state.goodsReceipts.flatMap((r) => r.lines).reduce((n, l) => n + l.rejected, 0)

  const columns: Column<GoodsReceipt>[] = [
    { id: 'code', header: 'Receipt', sortValue: (r) => r.code, cell: (r) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{r.code}</span> },
    {
      id: 'order',
      header: 'Order',
      cell: (r) => {
        const po = poOf(r)
        return (
          <div className="min-w-0">
            {po ? <CodeLink to={paths.po(po.id)} code={po.code} /> : '–'}
            <div className="truncate text-sm">{po ? vendorName(state, po.vendorId) : '–'}</div>
          </div>
        )
      },
    },
    { id: 'note', header: 'Delivery note', hideBelow: 'md', cell: (r) => <span className="font-mono text-xs">{r.deliveryNote}</span> },
    { id: 'date', header: 'Received', hideBelow: 'sm', sortValue: (r) => r.receivedAt, cell: (r) => <span className="text-sm">{fmtDate(r.receivedAt)}</span> },
    {
      id: 'qty',
      header: 'Accepted · rejected',
      hideBelow: 'lg',
      align: 'right',
      cell: (r) => (
        <span className="text-sm tabular-nums">
          {fmtNumber(r.lines.reduce((n, l) => n + l.accepted, 0), 2)} · <span className={r.lines.some((l) => l.rejected) ? 'text-danger' : 'text-muted'}>{fmtNumber(r.lines.reduce((n, l) => n + l.rejected, 0), 2)}</span>
        </span>
      ),
    },
    { id: 'qc', header: 'QC', cell: (r) => <QcBadge result={qcResult(r.lines)} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Goods receipts"
        description="What arrived against each order. Accepted units go into stock; rejected units stay with the vendor."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search receipts" placeholder="Code, order, vendor or delivery note" />
            {manage && (
              <Button onClick={() => setReceiving(true)}>
                <PackageCheck />
                Receive goods
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Orders to receive" value={waiting.length} icon={<Truck />} tone="ink" hint="Sent or part received" />
        <StatCard label="Late orders" value={late.length} icon={<AlarmClock />} tone={late.length ? 'danger' : 'default'} hint={late.length ? late.map((p) => p.code).join(', ') : 'None past due'} />
        <StatCard label="Receipts" value={state.goodsReceipts.length} icon={<PackageCheck />} />
        <StatCard label="Units rejected" value={fmtNumber(rejected, 2)} icon={<PackageX />} tone={rejected ? 'warning' : 'default'} hint={`${qcCounts.partial ?? 0} part, ${qcCounts.failed ?? 0} fully rejected`} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!qc} count={searched.length} onClick={() => set('qc', null)}>
            All
          </Chip>
          {QC_RESULTS.map((k) => (
            <Chip key={k} active={qc === k} count={qcCounts[k] ?? 0} onClick={() => set('qc', qc === k ? null : k)}>
              {QC_RESULT_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        <FilterCount shown={rows.length} total={state.goodsReceipts.length} filters={filters} onClear={() => clear()} />
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          rowLabel={(r) => r.code}
          onRowClick={(r) => navigate(paths.goodsReceipt(r.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${qc}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching receipts" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No receipts yet" description="Receive goods when a sent order arrives." />
            )
          }
        />
      </div>
      <Dialog open={open} onOpenChange={(o) => !o && close()} size="xl" title="Receive goods" description="Count what arrived and check it. Rejected units need a note for the vendor.">
        {open && <ReceiveForm initialPo={poParam ?? ''} onDone={close} />}
      </Dialog>
    </div>
  )
}

type LineInput = { accepted: string; rejected: string; qcNote: string }

function ReceiveForm({ initialPo, onDone }: { initialPo: string; onDone: () => void }) {
  const { state } = useScoped()
  const act = useAct()
  const navigate = useNavigate()
  const openOrders = state.purchaseOrders.filter((p) => p.status === 'sent' || p.status === 'partial')
  const [poId, setPoId] = useState(openOrders.some((p) => p.id === initialPo) ? initialPo : '')
  const [deliveryNote, setDeliveryNote] = useState('')
  const [inputs, setInputs] = useState<Record<string, LineInput>>({})
  const [tried, setTried] = useState(false)
  const po = openOrders.find((p) => p.id === poId)
  const lines = po?.lines.filter((l) => outstanding(l) > 0) ?? []
  const input = (id: string): LineInput => inputs[id] ?? { accepted: String(outstanding(lineOf(po, id)!)), rejected: '0', qcNote: '' }
  const edit = (id: string, patch: Partial<LineInput>) => setInputs({ ...inputs, [id]: { ...input(id), ...patch } })

  const receipt: GoodsReceipt = {
    id: newId('gr'),
    code: nextReceiptCode(state),
    poId,
    deliveryNote: deliveryNote.trim(),
    receivedAt: '',
    lines: lines.map((l) => ({ poLineId: l.id, accepted: toQty(input(l.id).accepted), rejected: toQty(input(l.id).rejected), qcNote: input(l.id).qcNote.trim() })),
    journalId: null,
    by: '',
  }
  const blocker = po ? blockerFor(state, { type: 'receipts/create', receipt }) : 'Pick the order that arrived.'

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'receipts/create', receipt }, 'Goods received', `${receipt.code} for ${po!.code}`)) {
          onDone()
          navigate(paths.goodsReceipt(receipt.id))
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Order" required>
          <NativeSelect
            value={poId}
            onChange={(e) => {
              setPoId(e.target.value)
              setInputs({})
            }}
          >
            <option value="">{openOrders.length ? 'Pick an open order' : 'No orders waiting for goods'}</option>
            {openOrders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {vendorName(state, p.vendorId)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Delivery note" required hint="The vendor's delivery order number">
          <Input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="DO-2026-0001" inputClassName="font-mono" />
        </FormField>
      </div>
      {po && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted">
          <PoStatusBadge po={po} />
          <span>Into {state.warehouses.find((w) => w.id === po.warehouseId)?.name ?? 'the default warehouse'}</span>
          <span>· expected {fmtDate(po.expectedDate)}</span>
        </div>
      )}
      {lines.length > 0 && (
        <ul className="mt-4 space-y-3">
          {lines.map((l) => {
            const v = input(l.id)
            return (
              <li key={l.id} className="rounded-2xl bg-surface-2 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="min-w-0 truncate font-semibold">{itemName(state, l.itemId)}</span>
                  <span className="text-xs text-muted">
                    Ordered <Qty itemId={l.itemId} qty={l.qty} /> · still to come <Qty itemId={l.itemId} qty={outstanding(l)} className="font-semibold text-foreground" />
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3">
                  <FormField label="Accepted">
                    <Input inputMode="decimal" value={v.accepted} onChange={(e) => edit(l.id, { accepted: e.target.value })} inputClassName="tabular-nums" />
                  </FormField>
                  <FormField label="Rejected">
                    <Input inputMode="decimal" value={v.rejected} onChange={(e) => edit(l.id, { rejected: e.target.value })} inputClassName="tabular-nums" />
                  </FormField>
                  {toQty(v.rejected) > 0 && (
                    <FormField label="QC note" required className="col-span-2">
                      <Input value={v.qcNote} onChange={(e) => edit(l.id, { qcNote: e.target.value })} placeholder="What was wrong" />
                    </FormField>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">
          <PackageCheck />
          Receive
        </Button>
      </DialogFooter>
    </form>
  )
}

export function GoodsReceiptDetailPage() {
  const { id } = useParams()
  const { state, actorName } = useScoped()
  const r = state.goodsReceipts.find((x) => x.id === id)
  if (!r) {
    return (
      <Card>
        <EmptyState title="Receipt not found" description="This receipt may have been removed." action={<BackButton fallback={paths.goodsReceipts} />} />
      </Card>
    )
  }
  const po = state.purchaseOrders.find((p) => p.id === r.poId)
  const vendor = state.vendors.find((v) => v.id === po?.vendorId)
  const warehouse = state.warehouses.find((w) => w.id === po?.warehouseId)
  const journal = state.journals.find((j) => j.id === r.journalId)
  const moves = state.stockMoves.filter((m) => m.ref?.kind === 'receipt' && m.ref.id === r.id)
  const value = r.lines.reduce((n, l) => n + l.accepted * (lineOf(po, l.poLineId)?.unitPrice ?? 0), 0)
  const itemOf = (poLineId: string) => lineOf(po, poLineId)?.itemId ?? ''

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.goodsReceipts} />
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{r.code}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">Receipt from {vendor?.name ?? 'unknown vendor'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <QcBadge result={qcResult(r.lines)} />
            {po && <CodeLink to={paths.po(po.id)} code={po.code} />}
            {journal && <CodeLink to={paths.journal(journal.id)} code={journal.code} />}
          </div>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer />
          Print receiving report
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] print:hidden">
        <Card variant="ink" className="p-6">
          <div className="text-xs text-on-ink-muted">Value taken into stock</div>
          <Money value={value} className="mt-1 block text-3xl font-bold tracking-tight" />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Received</div>
              <div className="font-semibold">{fmtDate(r.receivedAt)}</div>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Delivery note</div>
              <div className="truncate font-mono text-sm font-semibold">{r.deliveryNote}</div>
            </div>
            <div className="col-span-2 min-w-0 rounded-2xl bg-white/5 p-3 sm:col-span-1">
              <div className="text-xs text-on-ink-muted">Checked by</div>
              <div className="truncate font-semibold">{actorName(r.by)}</div>
            </div>
          </div>
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
                { label: 'Order', value: po ? <CodeLink to={paths.po(po.id)} code={po.code} /> : '–' },
                { label: 'Vendor', value: vendor ? <Link to={paths.supplier(vendor.id)} className="font-semibold hover:text-accent">{vendor.name}</Link> : '–' },
                { label: 'Warehouse', value: warehouse?.name ?? '–' },
                { label: 'Status', value: po ? <PoStatusBadge po={po} /> : '–' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {r.lines.map((l) => (
              <li key={l.poLineId} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{itemName(state, itemOf(l.poLineId))}</div>
                  {l.qcNote && <div className="text-xs text-danger">{l.qcNote}</div>}
                </div>
                <span className="text-xs text-muted">
                  Accepted <Qty itemId={itemOf(l.poLineId)} qty={l.accepted} className="font-semibold text-foreground" />
                </span>
                <span className="text-xs text-muted">
                  Rejected <Qty itemId={itemOf(l.poLineId)} qty={l.rejected} className={l.rejected ? 'font-semibold text-danger' : ''} />
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 print:hidden">
        <Card>
          <CardHeader>
            <CardTitle>Stock moves ({moves.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {moves.length === 0 ? (
              <EmptyState compact title="No stock moves" description="Nothing was accepted, so stock did not change." />
            ) : (
              <ul className="divide-y divide-border">
                {moves.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{itemName(state, m.itemId)}</div>
                      <div className="truncate text-xs text-muted">
                        {STOCK_MOVE_KIND_LABEL[m.kind]} · {state.warehouses.find((w) => w.id === m.warehouseId)?.name} · {fmtIdr(m.unitCost)} each
                      </div>
                    </div>
                    <Qty itemId={m.itemId} qty={m.qty} className="font-semibold text-success" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Journal</CardTitle>
          </CardHeader>
          <CardContent>
            {journal ? (
              <>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <CodeLink to={paths.journal(journal.id)} code={journal.code} />
                  <span className="min-w-0 truncate text-xs text-muted">{journal.memo}</span>
                </div>
                <ul className="divide-y divide-border">
                  {journal.lines.map((l, i) => (
                    <li key={i} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-2.5 text-sm">
                      <span className="truncate">{accountLabel(state, l.accountId)}</span>
                      <span className="text-right">
                        {l.debit > 0 ? <Money value={l.debit} className="font-semibold" /> : <span className="text-muted">Cr <Money value={l.credit} /></span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyState compact title="No journal" description="Nothing was accepted, so nothing went to the ledger." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="hidden p-0 print:block print:border-0">
        <LetterHead company={state.company} />
        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-bold">Receiving report</div>
            <div className="font-mono text-xs text-muted">{r.code}</div>
          </div>
          <div className="text-sm text-muted">{fmtDateLong(r.receivedAt)}</div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <LetterBlock title="Vendor">
            <div className="font-semibold">{vendor?.name ?? '–'}</div>
            <div>Delivery note {r.deliveryNote}</div>
          </LetterBlock>
          <LetterBlock title="Order">
            <div className="font-semibold">{po?.code ?? '–'}</div>
            <div>Into {warehouse?.name ?? '–'}</div>
          </LetterBlock>
        </div>
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Accepted</th>
              <th className="py-2 text-right font-semibold">Rejected</th>
              <th className="py-2 pl-4 font-semibold">QC note</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {r.lines.map((l) => (
              <tr key={l.poLineId}>
                <td className="py-2">{itemName(state, itemOf(l.poLineId))}</td>
                <td className="py-2 text-right tabular-nums">{fmtQty(state, itemOf(l.poLineId), l.accepted)}</td>
                <td className="py-2 text-right tabular-nums">{fmtQty(state, itemOf(l.poLineId), l.rejected)}</td>
                <td className="py-2 pl-4">{l.qcNote || '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
          <Signature role="Delivered by" name="" />
          <Signature role="Received and checked by" name={actorName(r.by)} />
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- returns

type ReturnShow = 'credit' | 'none'

export function PurchaseReturnsPage() {
  const { state } = useScoped()
  const { can } = useAuth()
  const { params, set, clear } = useSetParam()
  const q = params.get('q') ?? ''
  const show = (params.get('show') as ReturnShow | null) || null
  const manage = can('purchase.order')
  const [returning, setReturning] = useState(false)
  const [applying, setApplying] = useState<VendorCredit | null>(null)

  const poOf = (r: PurchaseReturn) => state.purchaseOrders.find((p) => p.id === r.poId)
  const valueOf = (r: PurchaseReturn) => r.lines.reduce((n, l) => n + l.qty * (lineOf(poOf(r), l.poLineId)?.unitPrice ?? 0), 0)
  const creditOf = (r: PurchaseReturn) => state.vendorCredits.find((c) => c.id === r.creditId)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.purchaseReturns.filter((r) => {
    const po = poOf(r)
    return terms.every((w) => `${r.code} ${r.reason} ${po?.code ?? ''} ${po ? vendorName(state, po.vendorId) : ''} ${creditOf(r)?.code ?? ''}`.toLowerCase().includes(w))
  })
  const withCredit = searched.filter((r) => r.creditId).length
  const rows = searched.filter((r) => !show || (show === 'credit') === !!r.creditId)
  const filters = [q, show].filter(Boolean).length

  const columns: Column<PurchaseReturn>[] = [
    { id: 'code', header: 'Return', sortValue: (r) => r.code, cell: (r) => <span className="whitespace-nowrap font-mono text-xs font-semibold">{r.code}</span> },
    {
      id: 'order',
      header: 'Order',
      cell: (r) => {
        const po = poOf(r)
        return (
          <div className="min-w-0">
            {po ? <CodeLink to={paths.po(po.id)} code={po.code} /> : '–'}
            <div className="truncate text-sm">{po ? vendorName(state, po.vendorId) : '–'}</div>
          </div>
        )
      },
    },
    { id: 'reason', header: 'Reason', hideBelow: 'lg', cell: (r) => <span className="line-clamp-2 text-sm">{r.reason}</span> },
    { id: 'date', header: 'Date', hideBelow: 'sm', sortValue: (r) => r.at, cell: (r) => <span className="text-sm">{fmtDate(r.at)}</span> },
    { id: 'units', header: 'Units', hideBelow: 'md', align: 'right', sortValue: (r) => units(r.lines), cell: (r) => <span className="text-sm tabular-nums">{fmtNumber(units(r.lines), 2)}</span> },
    { id: 'value', header: 'Value', align: 'right', sortValue: valueOf, cell: (r) => <Money value={valueOf(r)} className="font-semibold" /> },
    {
      id: 'credit',
      header: 'Credit',
      hideBelow: 'md',
      cell: (r) => {
        const c = creditOf(r)
        return c ? <Badge variant="info">{c.code}</Badge> : <span className="text-xs text-muted">Not billed yet</span>
      },
    },
    {
      id: 'journal',
      header: 'Journal',
      hideBelow: 'xl',
      cell: (r) => {
        const j = state.journals.find((x) => x.id === r.journalId)
        return j ? <CodeLink to={paths.journal(j.id)} code={j.code} /> : '–'
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Purchase returns"
        description="Goods sent back to the vendor. Billed units sent back become a vendor credit you take off a later bill."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search returns" placeholder="Code, order, vendor or reason" />
            {manage && (
              <Button onClick={() => setReturning(true)}>
                <Undo2 />
                Return goods
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('show', null)}>
            All
          </Chip>
          <Chip active={show === 'credit'} count={withCredit} onClick={() => set('show', show === 'credit' ? null : 'credit')}>
            Made a credit
          </Chip>
          <Chip active={show === 'none'} count={searched.length - withCredit} onClick={() => set('show', show === 'none' ? null : 'none')}>
            No credit
          </Chip>
        </ChipRow>
        <FilterCount shown={rows.length} total={state.purchaseReturns.length} filters={filters} onClear={() => clear()} />
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          rowLabel={(r) => r.code}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${show}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching returns" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No returns yet" description="Return goods that came in damaged or wrong after you received them." />
            )
          }
        />
      </div>

      <CreditsCard manage={manage} onApply={setApplying} />

      <Dialog open={returning} onOpenChange={setReturning} size="xl" title="Return goods" description="Stock goes down at the order price. Units already billed become a vendor credit.">
        {returning && <ReturnForm onDone={() => setReturning(false)} />}
      </Dialog>
      <Dialog open={!!applying} onOpenChange={(o) => !o && setApplying(null)} title={applying ? `Apply ${applying.code}` : 'Apply credit'} description="The credit pays part of a posted bill from the same vendor.">
        {applying && <ApplyCreditForm credit={applying} onDone={() => setApplying(null)} />}
      </Dialog>
    </div>
  )
}

/** Posted bills of the vendor with money still open. */
const openBills = (s: AppState, vendorId: string) => s.bills.filter((b) => b.vendorId === vendorId && b.status === 'posted' && billTotals(b).balance > 0)

function CreditsCard({ manage, onApply }: { manage: boolean; onApply: (c: VendorCredit) => void }) {
  const { state } = useScoped()
  const credits = state.vendorCredits
  const left = credits.reduce((n, c) => n + creditLeft(c), 0)
  const billCode = (id: string) => state.bills.find((b) => b.id === id)?.code ?? 'Bill'
  return (
    <Card className="mt-4">
      <CardHeader
        action={
          <span className="text-sm text-muted">
            <Money value={left} className="font-semibold text-foreground" /> left
          </span>
        }
      >
        <CardTitle>Vendor credits ({credits.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {credits.length === 0 ? (
          <EmptyState compact icon={<Wallet />} title="No vendor credits" description="Returning units that were already billed makes a credit." />
        ) : (
          <ul className="divide-y divide-border">
            {credits.map((c) => {
              const rest = creditLeft(c)
              const bills = openBills(state, c.vendorId)
              const why = !rest ? 'The credit is used up.' : !bills.length ? 'The vendor has no posted bill with money open.' : null
              const ret = state.purchaseReturns.find((r) => r.id === c.returnId)
              return (
                <li key={c.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold">{c.code}</span>
                        {rest ? <Badge variant="info">Open</Badge> : <Badge variant="muted">Used</Badge>}
                      </div>
                      <div className="truncate">
                        <Link to={paths.supplier(c.vendorId)} className="font-semibold hover:text-accent">{vendorName(state, c.vendorId)}</Link>
                      </div>
                      <div className="text-xs text-muted">
                        {fmtDate(c.date)}
                        {ret && ` · from ${ret.code}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <Money value={rest} className="font-semibold" />
                      <div className="text-xs text-muted">of {fmtIdr(c.amount)}</div>
                    </div>
                    {manage && rest > 0 && (
                      <Button variant="outline" size="sm" disabled={!!why} title={why ?? undefined} onClick={() => onApply(c)}>
                        Apply to bill
                      </Button>
                    )}
                  </div>
                  {c.applied.length > 0 && (
                    <ul className="mt-2 space-y-1 rounded-2xl bg-surface-2 p-3 text-xs">
                      {c.applied.map((a) => (
                        <li key={a.journalId} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0">
                            <CodeLink to={paths.bill(a.billId)} code={billCode(a.billId)} /> <span className="text-muted">· {fmtDate(a.at)}</span>
                          </span>
                          <Money value={a.amount} className="font-semibold" />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ApplyCreditForm({ credit, onDone }: { credit: VendorCredit; onDone: () => void }) {
  const { state } = useScoped()
  const act = useAct()
  const bills = openBills(state, credit.vendorId)
  const [billId, setBillId] = useState(bills[0]?.id ?? '')
  const bill = bills.find((b) => b.id === billId)
  const [amount, setAmount] = useState(String(Math.min(creditLeft(credit), bill ? Math.round(billTotals(bill).balance) : 0)))
  const [tried, setTried] = useState(false)
  const value = Number(amount.replace(/\D/g, '')) || 0
  const action = { type: 'credits/apply' as const, id: credit.id, billId, amount: value }
  const blocker = blockerFor(state, action)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, 'Credit applied', `${fmtIdr(value)} of ${credit.code} to ${bill?.code}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField label="Bill" required>
          <NativeSelect
            value={billId}
            onChange={(e) => {
              setBillId(e.target.value)
              const b = bills.find((x) => x.id === e.target.value)
              if (b) setAmount(String(Math.min(creditLeft(credit), Math.round(billTotals(b).balance))))
            }}
          >
            <option value="">Pick a bill</option>
            {bills.map((b) => (
              <option key={b.id} value={b.id}>
                {b.code} · {fmtIdr(billTotals(b).balance)} open
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Amount" required hint={`${fmtIdr(creditLeft(credit))} of the credit is left`}>
          <Input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputClassName="tabular-nums" />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Apply credit</Button>
      </DialogFooter>
    </form>
  )
}

function ReturnForm({ onDone }: { onDone: () => void }) {
  const { state } = useScoped()
  const act = useAct()
  const orders = state.purchaseOrders.filter((p) => p.lines.some((l) => returnable(l) > 0))
  const [poId, setPoId] = useState('')
  const [qty, setQty] = useState<Record<string, string>>({})
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const po = orders.find((p) => p.id === poId)
  const lines = po?.lines.filter((l) => returnable(l) > 0) ?? []

  const ret: PurchaseReturn = {
    id: newId('ret'),
    code: nextReturnCode(state),
    poId,
    reason: reason.trim(),
    lines: lines.map((l) => ({ poLineId: l.id, qty: toQty(qty[l.id] ?? '') })),
    creditId: null,
    journalId: null,
    at: '',
    by: '',
  }
  const blocker = po ? blockerFor(state, { type: 'returns/create', ret }) : 'Pick the order the goods came on.'

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'returns/create', ret }, 'Goods returned', `${ret.code} for ${po!.code}`)) onDone()
      }}
    >
      <FormField label="Order" required>
        <NativeSelect
          value={poId}
          onChange={(e) => {
            setPoId(e.target.value)
            setQty({})
          }}
        >
          <option value="">{orders.length ? 'Pick a received order' : 'No received goods to return'}</option>
          {orders.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {vendorName(state, p.vendorId)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      {lines.length > 0 && (
        <ul className="mt-4 space-y-3">
          {lines.map((l) => (
            <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_7rem] items-end gap-3 rounded-2xl bg-surface-2 p-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{itemName(state, l.itemId)}</div>
                <div className="text-xs text-muted">
                  Up to <Qty itemId={l.itemId} qty={returnable(l)} /> · {fmtIdr(l.unitPrice)} each
                  {l.billedQty > 0 && ' · billed'}
                </div>
              </div>
              <FormField label="Return">
                <Input inputMode="decimal" value={qty[l.id] ?? ''} placeholder="0" onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} inputClassName="tabular-nums" />
              </FormField>
            </li>
          ))}
        </ul>
      )}
      <FormField label="Reason" required className="mt-4">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="Damaged in storage, wrong size, and so on" />
      </FormField>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">
          <Undo2 />
          Return goods
        </Button>
      </DialogFooter>
    </form>
  )
}
