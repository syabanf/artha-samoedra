import {
  bestPrice,
  billTotals,
  blockerFor,
  creditLeft,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  fmtNumber,
  fmtPercent,
  fromDateInput,
  isOverdue,
  itemName,
  newId,
  nextVendorCode,
  nowIso,
  poTotals,
  priceHistory,
  supplierPerformance,
  toDateInput,
  type AppState,
} from '@artha/fixtures'
import type { Vendor, VendorPrice } from '@artha/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  cn,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  PageHeader,
  StatCard,
  Switch,
  type Column,
} from '@artha/ui'
import { Clock, Download, FileUp, Pencil, Plus, ShoppingCart, Timer, Trash2, Wallet, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { SubTabs } from '../../components/SubTabs'
import { downloadCsv, parseCsvLine } from '../../lib/csv'
import { useSetParam } from '../../lib/useSetParam'
import { useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { Money, SettleBadge } from '../finance/parts'
import { ItemSelect, PoStatusBadge, Qty, VendorSelect } from './parts'
import { SearchBox } from '../../components/SearchBox'

const TABS = [
  { to: paths.suppliers, label: 'Suppliers' },
  { to: paths.priceList, label: 'Price list' },
]

const digits = (v: string) => v.replace(/\D/g, '')
const vendorName = (s: AppState, id: string) => s.vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor'
const openBalance = (s: AppState, vendorId: string) => s.bills.filter((b) => b.vendorId === vendorId && b.status === 'posted').reduce((n, b) => n + billTotals(b).balance, 0)
const rate = (r: number | null) => (r === null ? '–' : fmtPercent(r * 100, 0))
const isCurrent = (p: VendorPrice, at: string) => p.validFrom <= at && (!p.validTo || p.validTo >= at)

// ---------------------------------------------------------------- suppliers

type SupplierShow = 'active' | 'inactive'

export function SuppliersPage() {
  const { state } = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  const q = params.get('q') ?? ''
  const show = (params.get('show') as SupplierShow | null) || null
  const manage = can('purchase.order')

  const perf = new Map(state.vendors.map((v) => [v.id, supplierPerformance(state, v.id)]))
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.vendors.filter((v) => terms.every((w) => `${v.code} ${v.name} ${v.taxId} ${v.phone} ${v.email}`.toLowerCase().includes(w)))
  const active = searched.filter((v) => v.active).length
  const rows = searched.filter((v) => !show || (show === 'active') === v.active)
  const filters = [q, show].filter(Boolean).length
  const p = (v: Vendor) => perf.get(v.id)!

  const columns: Column<Vendor>[] = [
    {
      id: 'name',
      header: 'Supplier',
      sortValue: (v) => v.name,
      cell: (v) => (
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted">{v.code}</div>
          <div className="truncate font-semibold">{v.name}</div>
          {!v.active && <Badge variant="muted" className="mt-1">Inactive</Badge>}
        </div>
      ),
    },
    { id: 'orders', header: 'Orders', align: 'right', hideBelow: 'sm', sortValue: (v) => p(v).orders, cell: (v) => <span className="text-sm tabular-nums">{p(v).orders || '–'}</span> },
    { id: 'spend', header: 'Spend', align: 'right', hideBelow: 'md', sortValue: (v) => p(v).spend, cell: (v) => <Money value={p(v).spend} dash className="text-sm" /> },
    { id: 'ontime', header: 'On time', align: 'right', hideBelow: 'lg', sortValue: (v) => p(v).onTimeRate ?? -1, cell: (v) => <span className="text-sm tabular-nums">{rate(p(v).onTimeRate)}</span> },
    {
      id: 'reject',
      header: 'Rejected',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (v) => p(v).rejectRate ?? -1,
      cell: (v) => <span className={cn('text-sm tabular-nums', p(v).rejectRate ? 'text-danger' : '')}>{rate(p(v).rejectRate)}</span>,
    },
    {
      id: 'lead',
      header: 'Lead days',
      align: 'right',
      hideBelow: 'xl',
      sortValue: (v) => p(v).avgLeadDays ?? -1,
      cell: (v) => <span className="text-sm tabular-nums">{p(v).avgLeadDays === null ? '–' : fmtNumber(p(v).avgLeadDays!, 1)}</span>,
    },
    { id: 'balance', header: 'Open bills', align: 'right', sortValue: (v) => openBalance(state, v.id), cell: (v) => <Money value={openBalance(state, v.id)} dash className="font-semibold" /> },
    ...(manage
      ? [
          {
            id: 'edit',
            header: <span className="sr-only">Edit</span>,
            cell: (v: Vendor) => (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Edit ${v.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setEditing(v)
                }}
              >
                <Pencil />
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Vendors you buy from, with how they deliver. Finance bills them from the same list."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search suppliers" placeholder="Name, code, NPWP or phone" />
            {manage && (
              <>
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <FileUp />
                  Import CSV
                </Button>
                <Button onClick={() => setEditing('new')}>
                  <Plus />
                  New supplier
                </Button>
              </>
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
          <Chip active={show === 'active'} count={active} onClick={() => set('show', show === 'active' ? null : 'active')}>
            Active
          </Chip>
          <Chip active={show === 'inactive'} count={searched.length - active} onClick={() => set('show', show === 'inactive' ? null : 'inactive')}>
            Inactive
          </Chip>
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.vendors.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(v) => v.id}
          rowLabel={(v) => v.name}
          onRowClick={(v) => navigate(paths.supplier(v.id))}
          initialSort={{ id: 'name', desc: false }}
          resetPageKey={`${q}|${show}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching suppliers" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No suppliers yet" description="Add the vendors you buy supplies from." />
            )
          }
        />
      </div>
      <SupplierDialog editing={editing} onDone={() => setEditing(null)} />
      <Dialog open={importing} onOpenChange={setImporting} size="xl" title="Import suppliers from CSV" description="Columns: name, taxId, phone, email, bankAccount, termsDays. A row whose name matches a supplier updates it; the rest are added.">
        {importing && <ImportForm onDone={() => setImporting(false)} />}
      </Dialog>
    </div>
  )
}

function SupplierDialog({ editing, onDone }: { editing: Vendor | 'new' | null; onDone: () => void }) {
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onDone()} title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'New supplier'} description="Terms set the due date on bills from this supplier.">
      {editing && <SupplierForm editing={editing === 'new' ? null : editing} onDone={onDone} />}
    </Dialog>
  )
}

function SupplierForm({ editing, onDone }: { editing: Vendor | null; onDone: () => void }) {
  const { state } = useScoped()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    name: editing?.name ?? '',
    taxId: editing?.taxId ?? '',
    phone: editing?.phone ?? '',
    email: editing?.email ?? '',
    bankAccount: editing?.bankAccount ?? '',
    termsDays: String(editing?.termsDays ?? 30),
    active: editing?.active ?? true,
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const vendor: Vendor = {
    id: editing?.id ?? newId('vnd'),
    code: editing?.code ?? nextVendorCode(state),
    name: f.name.trim(),
    taxId: digits(f.taxId),
    phone: f.phone.trim(),
    email: f.email.trim(),
    bankAccount: f.bankAccount.trim(),
    termsDays: Number(f.termsDays) || 0,
    active: f.active,
  }
  const blocker = blockerFor(state, { type: 'vendors/upsert', vendor })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'vendors/upsert', vendor }, editing ? 'Supplier saved' : 'Supplier added', vendor.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required className="sm:col-span-2">
          <Input value={f.name} onChange={set('name')} placeholder="PT Contoh Abadi" />
        </FormField>
        <FormField label="NPWP" hint="15 or 16 digits">
          <Input inputMode="numeric" value={f.taxId} onChange={set('taxId')} inputClassName="font-mono" />
        </FormField>
        <FormField label="Payment terms" hint="Days from the bill date to the due date">
          <Input inputMode="numeric" value={f.termsDays} onChange={(e) => setF({ ...f, termsDays: digits(e.target.value) })} />
        </FormField>
        <FormField label="Phone">
          <Input type="tel" value={f.phone} onChange={set('phone')} />
        </FormField>
        <FormField label="Email">
          <Input type="email" value={f.email} onChange={set('email')} />
        </FormField>
        <FormField label="Bank account" hint="Bank, number and account name" className="sm:col-span-2">
          <Input value={f.bankAccount} onChange={set('bankAccount')} placeholder="BCA 123 456 7890 a.n. PT Contoh Abadi" />
        </FormField>
      </div>
      {editing && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <span>
            <span className="block font-semibold">Active</span>
            <span className="text-xs text-muted">Inactive suppliers drop out of the list on new orders and bills.</span>
          </span>
          <Switch label="Active" checked={f.active} onCheckedChange={(on) => setF({ ...f, active: on })} />
        </label>
      )}
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save supplier' : 'Add supplier'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- import

const TEMPLATE: (string | number)[][] = [
  ['name', 'taxId', 'phone', 'email', 'bankAccount', 'termsDays'],
  ['PT Kertas Nusantara', '012345678901234', '+62 21 555 0101', 'sales@kertasnusantara.co.id', 'BCA 123 456 7890 a.n. PT Kertas Nusantara', 30],
  ['CV Cetak Kilat', '', '+62 22 555 0202', 'order@cetakkilat.id', 'Mandiri 130 00 1234567 a.n. CV Cetak Kilat', 14],
]

/** Splits one CSV line, honouring quoted cells. */
/** New rows get fresh codes after the highest one in use; a name that exists keeps its record. */
function parseSuppliers(text: string, s: AppState): Vendor[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines[0]?.toLowerCase().startsWith('name')) lines.shift()
  let codes = s.vendors
  return lines.map((line) => {
    const [name = '', taxId = '', phone = '', email = '', bankAccount = '', termsDays = ''] = parseCsvLine(line)
    const old = s.vendors.find((v) => v.name.trim().toLowerCase() === name.toLowerCase())
    const code = old?.code ?? nextVendorCode({ ...s, vendors: codes })
    const v: Vendor = { id: old?.id ?? newId('vnd'), code, name, taxId: digits(taxId), phone, email, bankAccount, termsDays: Number(digits(termsDays)) || 30, active: old?.active ?? true }
    if (!old) codes = [...codes, v]
    return v
  })
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const { state } = useScoped()
  const act = useAct()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const vendors = parseSuppliers(text, state)
  const blocker = text.trim() ? blockerFor(state, { type: 'suppliers/import', vendors }) : 'Choose a CSV file first.'
  const isNew = (v: Vendor) => !state.vendors.some((x) => x.id === v.id)
  const added = vendors.filter(isNew).length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink hover:bg-ink-3">
          <FileUp className="size-4" />
          Choose file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setFileName(file.name)
              setText(await file.text())
            }}
          />
        </label>
        <Button variant="outline" onClick={() => downloadCsv('suppliers-template', TEMPLATE)}>
          <Download />
          Download template
        </Button>
        {fileName && <span className="min-w-0 truncate text-sm text-muted">{fileName}</span>}
      </div>
      {vendors.length > 0 && (
        <div className="max-h-80 overflow-y-auto rounded-2xl bg-surface-2 p-2">
          <ul className="divide-y divide-border text-sm">
            {vendors.map((v) => (
              <li key={v.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 sm:grid-cols-[minmax(0,1fr)_10rem_5rem_auto]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{v.name || '(no name)'}</span>
                  <span className="block truncate text-xs text-muted">{[v.phone, v.email].filter(Boolean).join(' · ') || '–'}</span>
                </span>
                <span className="hidden font-mono text-xs sm:block">{v.taxId || '–'}</span>
                <span className="hidden text-xs text-muted tabular-nums sm:block">{v.termsDays} days</span>
                <Badge variant={isNew(v) ? 'success' : 'outline'}>{isNew(v) ? 'New' : 'Update'}</Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
      {text.trim() && <p className={cn('text-sm', blocker ? 'text-danger' : 'text-muted')}>{blocker ?? `${vendors.length} rows: ${added} new, ${vendors.length - added} updated.`}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!!blocker}
          title={blocker ?? undefined}
          onClick={() => {
            if (act({ type: 'suppliers/import', vendors }, 'Suppliers imported', `${added} new, ${vendors.length - added} updated`)) onDone()
          }}
        >
          Import {vendors.length || ''} {vendors.length === 1 ? 'row' : 'rows'}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ---------------------------------------------------------------- supplier detail

export function SupplierDetailPage() {
  const { id } = useParams()
  const { state } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [editing, setEditing] = useState<Vendor | null>(null)
  const [pricing, setPricing] = useState<VendorPrice | 'new' | null>(null)
  const [removing, setRemoving] = useState<VendorPrice | null>(null)
  const v = state.vendors.find((x) => x.id === id)
  if (!v) {
    return (
      <Card>
        <EmptyState pageTitle title="Supplier not found" description="This supplier may have been removed." action={<BackButton fallback={paths.suppliers} />} />
      </Card>
    )
  }
  const manage = can('purchase.order')
  const perf = supplierPerformance(state, v.id)
  const at = nowIso()
  const prices = state.vendorPrices.filter((p) => p.vendorId === v.id).sort((a, b) => itemName(state, a.itemId).localeCompare(itemName(state, b.itemId)) || a.minQty - b.minQty)
  const orders = state.purchaseOrders.filter((p) => p.vendorId === v.id).sort((a, b) => b.orderDate.localeCompare(a.orderDate))
  const bills = state.bills.filter((b) => b.vendorId === v.id && b.status !== 'void').sort((a, b) => b.date.localeCompare(a.date))
  const payments = bills.flatMap((b) => b.payments.map((p) => ({ bill: b, p }))).sort((a, b) => b.p.date.localeCompare(a.p.date))
  const credits = state.vendorCredits.filter((c) => c.vendorId === v.id)
  const balance = openBalance(state, v.id)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.suppliers} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{v.code}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">{v.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {v.active ? <Badge variant="success">Active</Badge> : <Badge variant="muted">Inactive</Badge>}
            <span className="text-xs text-muted">Net {v.termsDays} days</span>
          </div>
        </div>
        {manage && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setEditing(v)}>
              <Pencil />
              Edit
            </Button>
            <Button onClick={() => setPricing('new')}>
              <Plus />
              Add price
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        <StatCard label="Spend" value={fmtIdrShort(perf.spend).replace('Rp ', '')} unit="Rp" icon={<ShoppingCart />} tone="ink" hint={`${perf.orders} orders`} />
        <StatCard label="On time" value={rate(perf.onTimeRate)} icon={<Clock />} tone={perf.onTimeRate !== null && perf.onTimeRate < 0.8 ? 'warning' : 'default'} hint="Receipts by the expected date" />
        <StatCard label="Rejected" value={rate(perf.rejectRate)} icon={<XCircle />} tone={perf.rejectRate ? 'danger' : 'default'} hint="Units failing the check" />
        <StatCard label="Lead days" value={perf.avgLeadDays === null ? '–' : fmtNumber(perf.avgLeadDays, 1)} icon={<Timer />} hint="Sent to received, on average" />
        <StatCard label="Open bills" value={fmtIdrShort(balance).replace('Rp ', '')} unit="Rp" icon={<Wallet />} tone={balance ? 'warning' : 'default'} className="col-span-2 xl:col-span-1" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              size="sm"
              items={[
                { label: 'NPWP', value: <span className="font-mono text-xs">{v.taxId || '–'}</span> },
                { label: 'Phone', value: v.phone || '–' },
                { label: 'Email', value: <span className="break-all">{v.email || '–'}</span> },
                { label: 'Bank', value: v.bankAccount || '–' },
                { label: 'Terms', value: `${v.termsDays} days` },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Price list ({prices.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {prices.length === 0 ? (
              <EmptyState compact title="No prices yet" description="Add the prices this supplier quotes so orders fill in the cheapest one." />
            ) : (
              <ul className="divide-y divide-border">
                {prices.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold">{itemName(state, p.itemId)}</span>
                        {!isCurrent(p, at) && <Badge variant="muted">{p.validFrom > at ? 'Not yet' : 'Ended'}</Badge>}
                      </div>
                      <div className="text-xs text-muted">
                        From <Qty itemId={p.itemId} qty={p.minQty} /> · {p.leadDays} days lead · {fmtDate(p.validFrom)}
                        {p.validTo ? ` to ${fmtDate(p.validTo)}` : ' onward'}
                      </div>
                    </div>
                    <Money value={p.price} className="font-semibold" />
                    {manage && (
                      <span className="flex gap-1">
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit price for ${itemName(state, p.itemId)}`} onClick={() => setPricing(p)}>
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Remove price for ${itemName(state, p.itemId)}`} onClick={() => setRemoving(p)}>
                          <Trash2 />
                        </Button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Orders ({orders.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <EmptyState compact title="No orders yet" description="Orders to this supplier show here." />
            ) : (
              <ul className="divide-y divide-border">
                {orders.map((po) => (
                  <li key={po.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <CodeLink to={paths.po(po.id)} code={po.code} />
                      <div className="text-xs text-muted">Ordered {fmtDate(po.orderDate)} · expected {fmtDate(po.expectedDate)}</div>
                    </div>
                    <PoStatusBadge po={po} />
                    <Money value={poTotals(po).total} className="w-32 text-right font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bills ({bills.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {bills.length === 0 ? (
              <EmptyState compact title="No bills yet" description="Bills from this supplier show here once Finance enters them." />
            ) : (
              <ul className="divide-y divide-border">
                {bills.map((b) => {
                  const t = billTotals(b)
                  return (
                    <li key={b.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <CodeLink to={paths.bill(b.id)} code={b.code} />
                        <div className="text-xs text-muted">
                          {fmtDate(b.date)} · due {fmtDate(b.dueDate)}
                        </div>
                      </div>
                      {b.status === 'posted' ? <SettleBadge totals={t} overdue={isOverdue(b.dueDate, t, now)} /> : <Badge variant="warning">Draft</Badge>}
                      <div className="w-32 text-right">
                        <Money value={t.balance} dash className="font-semibold" />
                        <div className="text-xs text-muted">of {fmtIdr(t.total)}</div>
                      </div>
                      {b.status === 'posted' && t.balance > 0 && can('billing.manage') && (
                        <Button variant="outline" size="sm" asChild>
                          <Link to={paths.bill(b.id)}>Pay</Link>
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Payments ({payments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <EmptyState compact title="No payments yet" description="Pay a bill from its page in Finance." />
            ) : (
              <ul className="divide-y divide-border">
                {payments.map(({ bill, p }) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{fmtDate(p.date)}</div>
                      <div className="truncate text-xs text-muted">
                        <CodeLink to={paths.bill(bill.id)} code={bill.code} />
                        {p.reference && ` · ${p.reference}`}
                      </div>
                    </div>
                    <Money value={p.amount} className="font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Credits ({credits.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {credits.length === 0 ? (
              <EmptyState compact title="No credits" description="Returning billed goods makes a credit." />
            ) : (
              <ul className="divide-y divide-border">
                {credits.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link to={paths.purchaseReturns} className="font-mono text-xs font-semibold hover:text-accent">
                        {c.code}
                      </Link>
                      <div className="text-xs text-muted">
                        {fmtDate(c.date)} · {c.applied.length} {c.applied.length === 1 ? 'use' : 'uses'}
                      </div>
                    </div>
                    <div className="text-right">
                      <Money value={creditLeft(c)} className="font-semibold" />
                      <div className="text-xs text-muted">left of {fmtIdr(c.amount)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <SupplierDialog editing={editing} onDone={() => setEditing(null)} />
      <PriceDialog editing={pricing} vendorId={v.id} onDone={() => setPricing(null)} />
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remove this price?" description={removing ? `${itemName(state, removing.itemId)} at ${fmtIdr(removing.price)} from ${v.name}. Orders already placed keep their prices.` : undefined}>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (removing && act({ type: 'vendorPrices/remove', id: removing.id }, 'Price removed', itemName(state, removing.itemId))) setRemoving(null)
            }}
          >
            Remove price
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function PriceDialog({ editing, vendorId, onDone }: { editing: VendorPrice | 'new' | null; vendorId?: string; onDone: () => void }) {
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onDone()} title={editing && editing !== 'new' ? 'Edit price' : 'Add price'} description="New orders use the cheapest valid price for the quantity.">
      {editing && <PriceForm editing={editing === 'new' ? null : editing} vendorId={vendorId} onDone={onDone} />}
    </Dialog>
  )
}

function PriceForm({ editing, vendorId, onDone }: { editing: VendorPrice | null; vendorId?: string; onDone: () => void }) {
  const { state } = useScoped()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    vendorId: editing?.vendorId ?? vendorId ?? '',
    itemId: editing?.itemId ?? '',
    price: String(editing?.price ?? ''),
    minQty: String(editing?.minQty ?? 1),
    leadDays: String(editing?.leadDays ?? 7),
    validFrom: toDateInput(editing?.validFrom ?? nowIso()),
    validTo: editing?.validTo ? toDateInput(editing.validTo) : '',
  })
  const price: VendorPrice = {
    id: editing?.id ?? newId('vp'),
    vendorId: f.vendorId,
    itemId: f.itemId,
    price: Number(digits(f.price)) || 0,
    minQty: Number(f.minQty) || 0,
    leadDays: Number(digits(f.leadDays)) || 0,
    validFrom: f.validFrom ? fromDateInput(f.validFrom) : '',
    validTo: f.validTo ? fromDateInput(f.validTo) : null,
  }
  const blocker = !price.vendorId ? 'Pick a supplier.' : !price.itemId ? 'Pick an item.' : !price.validFrom ? 'Pick the date the price starts.' : blockerFor(state, { type: 'vendorPrices/upsert', price })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'vendorPrices/upsert', price }, editing ? 'Price saved' : 'Price added', `${itemName(state, price.itemId)} · ${fmtIdr(price.price)}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!vendorId && (
          <FormField label="Supplier" required className="sm:col-span-2">
            <VendorSelect value={f.vendorId} onChange={(id) => setF({ ...f, vendorId: id })} />
          </FormField>
        )}
        <FormField label="Item" required className="sm:col-span-2">
          <ItemSelect value={f.itemId} onChange={(id) => setF({ ...f, itemId: id })} />
        </FormField>
        <FormField label="Price per unit" required>
          <Input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: digits(e.target.value) })} inputClassName="tabular-nums" />
        </FormField>
        <FormField label="From quantity" hint="The price applies at or above this">
          <Input inputMode="decimal" value={f.minQty} onChange={(e) => setF({ ...f, minQty: e.target.value })} inputClassName="tabular-nums" />
        </FormField>
        <FormField label="Lead days" hint="Days from order to delivery">
          <Input inputMode="numeric" value={f.leadDays} onChange={(e) => setF({ ...f, leadDays: digits(e.target.value) })} inputClassName="tabular-nums" />
        </FormField>
        <FormField label="Valid from" required>
          <Input type="date" value={f.validFrom} onChange={(e) => setF({ ...f, validFrom: e.target.value })} />
        </FormField>
        <FormField label="Valid to" hint="Leave empty for no end date">
          <Input type="date" value={f.validTo} onChange={(e) => setF({ ...f, validTo: e.target.value })} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save price' : 'Add price'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- price list

export function PriceListPage() {
  const { state } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const { params, set, clear } = useSetParam()
  const [pricing, setPricing] = useState<VendorPrice | 'new' | null>(null)
  const [removing, setRemoving] = useState<VendorPrice | null>(null)
  const q = params.get('q') ?? ''
  const item = params.get('item') ?? ''
  const vendor = params.get('vendor') ?? ''
  const all = params.get('show') === 'all'
  const manage = can('purchase.order')
  const at = nowIso()

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.vendorPrices.filter(
    (p) => (!item || p.itemId === item) && (!vendor || p.vendorId === vendor) && terms.every((w) => `${itemName(state, p.itemId)} ${vendorName(state, p.vendorId)}`.toLowerCase().includes(w)),
  )
  const current = searched.filter((p) => isCurrent(p, at))
  const rows = all ? searched : current
  const filters = [q, item, vendor, all ? 'all' : ''].filter(Boolean).length
  const itemIds = [...new Set(searched.map((p) => p.itemId))].sort((a, b) => itemName(state, a).localeCompare(itemName(state, b)))

  const columns: Column<VendorPrice>[] = [
    {
      id: 'item',
      header: 'Item',
      sortValue: (p) => itemName(state, p.itemId),
      cell: (p) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{itemName(state, p.itemId)}</div>
          <div className="truncate text-xs text-muted lg:hidden">{vendorName(state, p.vendorId)}</div>
        </div>
      ),
    },
    { id: 'vendor', header: 'Supplier', hideBelow: 'lg', sortValue: (p) => vendorName(state, p.vendorId), cell: (p) => <Link to={paths.supplier(p.vendorId)} onClick={(e) => e.stopPropagation()} className="text-sm font-semibold hover:text-accent">{vendorName(state, p.vendorId)}</Link> },
    { id: 'min', header: 'From qty', align: 'right', hideBelow: 'sm', sortValue: (p) => p.minQty, cell: (p) => <Qty itemId={p.itemId} qty={p.minQty} className="text-sm" /> },
    { id: 'lead', header: 'Lead', align: 'right', hideBelow: 'md', sortValue: (p) => p.leadDays, cell: (p) => <span className="text-sm tabular-nums">{p.leadDays} days</span> },
    {
      id: 'valid',
      header: 'Valid',
      hideBelow: 'md',
      sortValue: (p) => p.validFrom,
      cell: (p) => (
        <span className="text-sm">
          {fmtDate(p.validFrom)}
          {p.validTo ? ` to ${fmtDate(p.validTo)}` : ' onward'}
          {!isCurrent(p, at) && <Badge variant="muted" className="ml-2">{p.validFrom > at ? 'Not yet' : 'Ended'}</Badge>}
        </span>
      ),
    },
    { id: 'price', header: 'Price', align: 'right', sortValue: (p) => p.price, cell: (p) => <Money value={p.price} className="font-semibold" /> },
    ...(manage
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            cell: (p: VendorPrice) => (
              <span className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit price for ${itemName(state, p.itemId)}`} onClick={() => setPricing(p)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove price for ${itemName(state, p.itemId)}`} onClick={() => setRemoving(p)}>
                  <Trash2 />
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Price list"
        description="What each supplier charges per item. Orders built from requests take the cheapest valid price."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search prices" placeholder="Item or supplier" />
            {manage && (
              <Button onClick={() => setPricing('new')}>
                <Plus />
                Add price
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!all} count={current.length} onClick={() => set('show', null)}>
            Valid now
          </Chip>
          <Chip active={all} count={searched.length} onClick={() => set('show', all ? null : 'all')}>
            All prices
          </Chip>
        </ChipRow>
        <ItemSelect aria-label="Filter by item" placeholder="All items" value={item} onChange={(id) => set('item', id || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
        <VendorSelect aria-label="Filter by supplier" placeholder="All suppliers" value={vendor} onChange={(id) => set('vendor', id || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none" />
      </div>
      {filters > 0 && (
        <div className="mt-2 text-xs text-muted tabular-nums">
          {rows.length} of {state.vendorPrices.length}
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
            Clear {filters} {filters === 1 ? 'filter' : 'filters'}
          </Button>
        </div>
      )}
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(p) => p.id}
          rowLabel={(p) => `${itemName(state, p.itemId)} from ${vendorName(state, p.vendorId)}`}
          initialSort={{ id: 'item', desc: false }}
          resetPageKey={`${q}|${item}|${vendor}|${all}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching prices" description="Change the filters or show all prices." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No prices yet" description="Add the prices your suppliers quote." />
            )
          }
        />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>By item</CardTitle>
        </CardHeader>
        <CardContent>
          {itemIds.length === 0 ? (
            <EmptyState compact title="No items to compare" description="Items with a price show here." />
          ) : (
            <ul className="divide-y divide-border">
              {itemIds.map((itemId) => {
                const best = bestPrice(state, itemId, Number.MAX_SAFE_INTEGER, at, vendor || undefined)
                const history = priceHistory(state, itemId)
                return (
                  <li key={itemId} className="grid grid-cols-1 gap-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem] sm:items-center">
                    <div className="min-w-0">
                      <button type="button" className="truncate text-left font-semibold hover:text-accent" onClick={() => set('item', item === itemId ? null : itemId)}>
                        {itemName(state, itemId)}
                      </button>
                      <div className="text-xs text-muted">{history.length ? `Last paid ${fmtIdr(history[0].price)} on ${history[0].po.code}` : 'Not ordered yet'}</div>
                    </div>
                    <div className="min-w-0">
                      {best ? (
                        <>
                          <Money value={best.price} className="font-semibold" />
                          <div className="truncate text-xs text-muted">
                            Cheapest now · {vendorName(state, best.vendorId)}
                            {best.minQty > 1 && <> · from <Qty itemId={itemId} qty={best.minQty} /></>}
                          </div>
                        </>
                      ) : (
                        <span className="text-xs text-muted">No price valid today</span>
                      )}
                    </div>
                    <PriceBars history={history} label={`Price history for ${itemName(state, itemId)}`} />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <PriceDialog editing={pricing} vendorId={vendor || undefined} onDone={() => setPricing(null)} />
      <Dialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this price?"
        description={removing ? `${itemName(state, removing.itemId)} at ${fmtIdr(removing.price)} from ${vendorName(state, removing.vendorId)}. Orders already placed keep their prices.` : undefined}
      >
        <DialogFooter>
          <Button variant="outline" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (removing && act({ type: 'vendorPrices/remove', id: removing.id }, 'Price removed', itemName(state, removing.itemId))) setRemoving(null)
            }}
          >
            Remove price
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

/** Up to eight order prices, oldest on the left; the latest bar is the accent. */
function PriceBars({ history, label }: { history: ReturnType<typeof priceHistory>; label: string }) {
  const bars = history.slice(0, 8).reverse()
  if (!bars.length) return <span className="text-xs text-muted sm:text-right">No order history</span>
  const top = Math.max(...bars.map((b) => b.price))
  return (
    <div role="img" aria-label={`${label}: ${bars.map((b) => fmtIdr(b.price)).join(', ')}`} className="flex h-10 items-end gap-1 sm:justify-end">
      {bars.map((b, i) => (
        <span
          key={`${b.po.id}-${i}`}
          title={`${b.po.code} · ${fmtDate(b.at)} · ${fmtIdr(b.price)}`}
          className={cn('w-3 rounded-full', i === bars.length - 1 ? 'bg-accent' : 'bg-ink/25')}
          style={{ height: `${Math.max(15, (b.price / top) * 100)}%` }}
        />
      ))}
    </div>
  )
}
