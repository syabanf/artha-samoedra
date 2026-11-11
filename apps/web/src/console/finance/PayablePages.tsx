import {
  accountLabel,
  addDays,
  AGING_BUCKETS,
  billTotals,
  blankLine,
  blockerFor,
  countBy,
  dateBlocker,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  fromDateInput,
  isOverdue,
  lineAmount,
  monthOf,
  newId,
  nextBillCode,
  nextVendorCode,
  nowIso,
  payableAging,
  settleState,
  SETTLE_STATE_LABEL,
  toDateInput,
  toMs,
  type AppState,
  type SettleState,
} from '@artha/fixtures'
import { BILL_STATUS_LABEL, type Bill, type BillStatus, type DocumentLine, type Vendor } from '@artha/types'
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
  Switch,
  Textarea,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { AlarmClock, Ban, CalendarClock, CircleCheck, Download, FileText, Pencil, Plus, Search, Send, Wallet, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { downloadCsv } from '../../lib/csv'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { AccountSelect, DocumentLinesEditor, Money, SettleBadge, TotalsBlock } from './parts'
import { SubTabs } from '../../components/SubTabs'
import { useSetParam } from '../../lib/useSetParam'

const TABS = [
  { to: paths.bills, label: 'Bills' },
  { to: paths.vendors, label: 'Vendors' },
  { to: `${paths.bills}#aging`, label: 'Aging' },
]

const STATUSES: BillStatus[] = ['draft', 'posted', 'void']
const SETTLES: SettleState[] = ['unpaid', 'partial', 'paid']
const STATUS_VARIANT: Record<BillStatus, BadgeVariant> = { draft: 'warning', posted: 'success', void: 'muted' }

const BillStatusBadge = ({ status }: { status: BillStatus }) => <Badge variant={STATUS_VARIANT[status]}>{BILL_STATUS_LABEL[status]}</Badge>

const digits = (v: string) => v.replace(/\D/g, '')
const vendorName = (s: AppState, id: string) => s.vendors.find((v) => v.id === id)?.name ?? 'Unknown vendor'
const openBalance = (s: AppState, vendorId: string) =>
  s.bills.filter((b) => b.vendorId === vendorId && b.status === 'posted').reduce((n, b) => n + billTotals(b).balance, 0)

/** Posted bills show how far they are paid; drafts and void bills show their status. */
const BillBadge = ({ bill, now }: { bill: Bill; now: number }) => {
  if (bill.status !== 'posted') return <BillStatusBadge status={bill.status} />
  const t = billTotals(bill)
  return <SettleBadge totals={t} overdue={isOverdue(bill.dueDate, t, now)} />
}

// ---------------------------------------------------------------- vendors

type VendorShow = 'open' | 'active' | 'inactive'

export function VendorsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<Vendor | 'new' | null>(null)
  const q = params.get('q') ?? ''
  const show = (params.get('show') as VendorShow | null) || null

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.vendors.filter((v) => terms.every((w) => `${v.code} ${v.name} ${v.taxId} ${v.phone} ${v.email}`.toLowerCase().includes(w)))
  const balance = (v: Vendor) => openBalance(state, v.id)
  const matches = (v: Vendor, s: VendorShow) => (s === 'open' ? balance(v) > 0 : s === 'active' ? v.active : !v.active)
  const counts = { open: searched.filter((v) => matches(v, 'open')).length, active: searched.filter((v) => v.active).length, inactive: searched.filter((v) => !v.active).length }
  const rows = searched.filter((v) => !show || matches(v, show))
  const filters = [q, show].filter(Boolean).length
  const manage = can('billing.manage')

  const columns: Column<Vendor>[] = [
    {
      id: 'name',
      header: 'Vendor',
      sortValue: (v) => v.name,
      cell: (v) => (
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted">{v.code}</div>
          <div className="truncate font-semibold">{v.name}</div>
          {!v.active && <Badge variant="muted" className="mt-1">Inactive</Badge>}
        </div>
      ),
    },
    { id: 'npwp', header: 'NPWP', hideBelow: 'lg', cell: (v) => <span className="font-mono text-xs">{v.taxId || '–'}</span> },
    {
      id: 'contact',
      header: 'Contact',
      hideBelow: 'md',
      cell: (v) => (
        <div className="min-w-0 text-sm">
          <div className="truncate">{v.phone || '–'}</div>
          <div className="truncate text-xs text-muted">{v.email}</div>
        </div>
      ),
    },
    { id: 'terms', header: 'Terms', hideBelow: 'sm', sortValue: (v) => v.termsDays, cell: (v) => <span className="text-sm tabular-nums">{v.termsDays} days</span> },
    { id: 'balance', header: 'Open balance', align: 'right', sortValue: balance, cell: (v) => <Money value={balance(v)} dash className="font-semibold" /> },
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
        title="Vendors"
        description="Suppliers you receive bills from. Open the vendor to see its bills."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search vendors"
              placeholder="Name, code, NPWP or phone"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus />
                New vendor
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('show', null)}>
            All
          </Chip>
          <Chip active={show === 'open'} count={counts.open} onClick={() => set('show', show === 'open' ? null : 'open')}>
            Open balance
          </Chip>
          <Chip active={show === 'active'} count={counts.active} onClick={() => set('show', show === 'active' ? null : 'active')}>
            Active
          </Chip>
          <Chip active={show === 'inactive'} count={counts.inactive} onClick={() => set('show', show === 'inactive' ? null : 'inactive')}>
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
          onRowClick={(v) => navigate(`${paths.bills}?vendor=${v.id}`)}
          initialSort={{ id: 'name', desc: false }}
          resetPageKey={`${q}|${show}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching vendors" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No vendors yet" description="Add the suppliers you buy from." />
            )
          }
        />
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'New vendor'} description="Terms set the due date on new bills from this vendor.">
        {editing && <VendorForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function VendorForm({ editing, onDone }: { editing: Vendor | null; onDone: () => void }) {
  const { state } = useAppState()
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
        if (act({ type: 'vendors/upsert', vendor }, editing ? 'Vendor saved' : 'Vendor added', vendor.name)) onDone()
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
            <span className="text-xs text-muted">Inactive vendors drop out of the list on new bills.</span>
          </span>
          <Switch label="Active" checked={f.active} onCheckedChange={(active) => setF({ ...f, active })} />
        </label>
      )}
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save vendor' : 'Add vendor'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- bills

type Tile = 'open' | 'overdue' | 'week' | 'paid'

export function BillsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const { hash } = useLocation()
  const { params, set, clear } = useSetParam()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as BillStatus | null) || null
  const settle = (params.get('settle') as SettleState | null) || null
  const tile = (params.get('tile') as Tile | null) || null
  const vendor = params.get('vendor') ?? ''

  useEffect(() => {
    if (hash === '#aging') document.getElementById('aging')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  const month = monthOf(new Date(now).toISOString())
  const weekEnd = toMs(addDays(new Date(now).toISOString(), 7))
  const posted = (b: Bill) => b.status === 'posted'
  const balanceOf = (b: Bill) => billTotals(b).balance
  const inTile: Record<Tile, (b: Bill) => boolean> = {
    open: (b) => posted(b) && balanceOf(b) > 0,
    overdue: (b) => posted(b) && isOverdue(b.dueDate, billTotals(b), now),
    week: (b) => posted(b) && balanceOf(b) > 0 && toMs(b.dueDate) >= now && toMs(b.dueDate) <= weekEnd,
    paid: (b) => b.payments.some((p) => monthOf(p.date) === month),
  }
  const sumBalance = (rows: Bill[]) => rows.reduce((n, b) => n + balanceOf(b), 0)
  const open = state.bills.filter(inTile.open)
  const overdue = state.bills.filter(inTile.overdue)
  const week = state.bills.filter(inTile.week)
  const paidThisMonth = state.bills.flatMap((b) => b.payments).filter((p) => monthOf(p.date) === month).reduce((n, p) => n + p.amount, 0)

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.bills.filter(
    (b) => (!vendor || b.vendorId === vendor) && (!tile || inTile[tile](b)) && terms.every((w) => `${b.code} ${b.vendorRef} ${b.memo} ${vendorName(state, b.vendorId)}`.toLowerCase().includes(w)),
  )
  const settleOf = (b: Bill) => settleState(billTotals(b))
  const statusCounts = countBy(searched.filter((b) => !settle || (posted(b) && settleOf(b) === settle)), (b) => b.status)
  const settleCounts = countBy(searched.filter((b) => posted(b) && (!status || b.status === status)), settleOf)
  const rows = searched.filter((b) => (!status || b.status === status) && (!settle || (posted(b) && settleOf(b) === settle)))
  const filters = [q, status, settle, tile, vendor].filter(Boolean).length
  const toggleTile = (t: Tile) => set('tile', tile === t ? null : t)

  const columns: Column<Bill>[] = [
    {
      id: 'code',
      header: 'Bill',
      sortValue: (b) => b.code,
      cell: (b) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{b.code}</div>
          <div className="truncate text-sm">{vendorName(state, b.vendorId)}</div>
          <div className="mt-1.5 sm:hidden">
            <BillBadge bill={b} now={now} />
          </div>
        </div>
      ),
    },
    { id: 'ref', header: 'Vendor ref', hideBelow: 'xl', cell: (b) => <span className="font-mono text-xs">{b.vendorRef || '–'}</span> },
    { id: 'date', header: 'Date', hideBelow: 'lg', sortValue: (b) => b.date, cell: (b) => <span className="text-xs text-muted">{fmtDate(b.date)}</span> },
    {
      id: 'due',
      header: 'Due',
      hideBelow: 'md',
      sortValue: (b) => b.dueDate,
      cell: (b) => <span className={`text-xs ${inTile.overdue(b) ? 'font-semibold text-accent' : 'text-muted'}`}>{fmtDate(b.dueDate)}</span>,
    },
    { id: 'total', header: 'Total', align: 'right', hideBelow: 'lg', sortValue: (b) => billTotals(b).total, cell: (b) => <Money value={billTotals(b).total} /> },
    {
      id: 'balance',
      header: 'Balance',
      align: 'right',
      sortValue: (b) => (posted(b) ? balanceOf(b) : 0),
      cell: (b) => (posted(b) ? <Money value={balanceOf(b)} dash className="font-semibold" /> : <span className="text-muted">–</span>),
    },
    { id: 'badge', header: 'Status', hideBelow: 'sm', cell: (b) => <BillBadge bill={b} now={now} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Bills"
        description="Vendor bills you owe. Posting a bill books the expense and the payable; paying it moves cash out."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search bills"
              placeholder="Code, vendor or vendor ref"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('billing.manage') && (
              <Button asChild>
                <Link to={paths.billNew}>
                  <Plus />
                  New bill
                </Link>
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Open" value={fmtIdrShort(sumBalance(open)).replace('Rp ', '')} unit="Rp" icon={<Wallet />} tone="ink" hint={`${open.length} bills`} active={tile === 'open'} onClick={() => toggleTile('open')} />
        <StatCard label="Overdue" value={overdue.length} icon={<AlarmClock />} tone={overdue.length ? 'danger' : 'default'} hint={overdue.length ? fmtIdrShort(sumBalance(overdue)) : undefined} active={tile === 'overdue'} onClick={() => toggleTile('overdue')} />
        <StatCard label="Due this week" value={week.length} icon={<CalendarClock />} tone={week.length ? 'warning' : 'default'} hint={week.length ? fmtIdrShort(sumBalance(week)) : undefined} active={tile === 'week'} onClick={() => toggleTile('week')} />
        <StatCard label="Paid this month" value={fmtIdrShort(paidThisMonth).replace('Rp ', '')} unit="Rp" icon={<CircleCheck />} active={tile === 'paid'} onClick={() => toggleTile('paid')} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!status} count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {BILL_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect aria-label="Filter by vendor" value={vendor} onChange={(e) => set('vendor', e.target.value || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <option value="">All vendors</option>
          {state.vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          {SETTLES.map((s) => (
            <Chip key={s} active={settle === s} count={settleCounts[s] ?? 0} onClick={() => set('settle', settle === s ? null : s)}>
              {SETTLE_STATE_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.bills.length}
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
          getRowKey={(b) => b.id}
          rowLabel={(b) => b.code}
          onRowClick={(b) => navigate(paths.bill(b.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${status}|${settle}|${tile}|${vendor}`}
          rowClassName={(b) => (inTile.overdue(b) ? 'bg-accent-soft/40' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching bills" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No bills yet" description="Enter a vendor bill to track what you owe." />
            )
          }
        />
      </div>

      <AgingCard now={now} />
    </div>
  )
}

function AgingCard({ now }: { now: number }) {
  const { state } = useAppState()
  const report = payableAging(state, now)
  const exportCsv = () =>
    downloadCsv(`ap-aging-${toDateInput(new Date(now).toISOString())}`, [
      ['Vendor', ...AGING_BUCKETS, 'Total'],
      ...report.parties.map((p) => [p.party, ...p.buckets, p.total]),
      ['Total', ...report.totals, report.total],
    ])
  return (
    <Card id="aging" className="mt-6 scroll-mt-6">
      <CardHeader
        action={
          <Button variant="outline" size="sm" disabled={!report.parties.length} title={report.parties.length ? undefined : 'Nothing is open to export.'} onClick={exportCsv}>
            <Download />
            Export CSV
          </Button>
        }
      >
        <CardTitle>Payables aging</CardTitle>
        <p className="text-sm text-muted">Open balances on posted bills by days past due, as of {fmtDate(new Date(now).toISOString())}.</p>
      </CardHeader>
      <CardContent>
        {report.parties.length === 0 ? (
          <EmptyState compact title="Nothing owed" description="Every posted bill is paid." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="text-left text-xs text-muted">
                  <th className="py-2 pr-3 font-medium">Vendor</th>
                  {AGING_BUCKETS.map((b) => (
                    <th key={b} className="px-3 py-2 text-right font-medium">
                      {b}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.parties.map((p) => (
                  <tr key={p.party}>
                    <td className="py-2.5 pr-3 font-semibold">{p.party}</td>
                    {p.buckets.map((n, i) => (
                      <td key={i} className={`px-3 py-2.5 text-right ${i >= 2 && n ? 'text-accent' : ''}`}>
                        <Money value={n} dash />
                      </td>
                    ))}
                    <td className="py-2.5 pl-3 text-right font-semibold">
                      <Money value={p.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="py-2.5 pr-3">Total</td>
                  {report.totals.map((n, i) => (
                    <td key={i} className="px-3 py-2.5 text-right">
                      <Money value={n} dash />
                    </td>
                  ))}
                  <td className="py-2.5 pl-3 text-right">
                    <Money value={report.total} />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- bill editor

const dueFor = (dateInput: string, termsDays: number) => (dateInput ? toDateInput(addDays(fromDateInput(dateInput), termsDays)) : '')

export function BillEditorPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const old = id ? state.bills.find((b) => b.id === id) : undefined
  if (!can('billing.manage')) return <NoAccess description="Entering bills needs the billing permission." />
  if (id && !old) {
    return (
      <Card>
        <EmptyState pageTitle title="Bill not found" description="This bill may have been removed." action={<BackButton fallback={paths.bills} />} />
      </Card>
    )
  }
  if (old && old.status !== 'draft') {
    return (
      <Card>
        <EmptyState title="Only a draft bill can be edited" description={`${old.code} is ${BILL_STATUS_LABEL[old.status].toLowerCase()}.`} action={<Button variant="outline" asChild><Link to={paths.bill(old.id)}>Open bill</Link></Button>} />
      </Card>
    )
  }
  return <BillEditor key={old?.id ?? 'new'} old={old ?? null} />
}

function BillEditor({ old }: { old: Bill | null }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const today = toDateInput(nowIso())
  const [f, setF] = useState({
    vendorId: old?.vendorId ?? '',
    vendorRef: old?.vendorRef ?? '',
    date: old ? toDateInput(old.date) : today,
    dueDate: old ? toDateInput(old.dueDate) : today,
    vat: old ? old.taxPct > 0 : true,
    memo: old?.memo ?? '',
  })
  const [lines, setLines] = useState<DocumentLine[]>(old?.lines ?? [blankLine()])
  const vatPct = state.financeSettings.vatPct
  const taxPct = f.vat ? (old?.taxPct || vatPct) : 0
  const vendors = state.vendors.filter((v) => v.active || v.id === f.vendorId)
  const termsOf = (vendorId: string) => state.vendors.find((v) => v.id === vendorId)?.termsDays ?? 0

  const bill: Bill = {
    id: old?.id ?? newId('bill'),
    code: old?.code ?? nextBillCode(state),
    vendorId: f.vendorId,
    vendorRef: f.vendorRef.trim(),
    date: f.date ? fromDateInput(f.date) : '',
    dueDate: f.dueDate ? fromDateInput(f.dueDate) : '',
    lines,
    taxPct,
    memo: f.memo.trim(),
    status: 'draft',
    journalId: null,
    payments: [],
    createdBy: old?.createdBy ?? user.id,
    createdAt: old?.createdAt ?? nowIso(),
  }
  const blocker = !f.date || !f.dueDate ? 'Pick the bill date and the due date.' : blockerFor(state, { type: 'bills/save', bill })
  const postBlocker = f.date ? dateBlocker(state, bill.date) : null

  const save = (post: boolean) => {
    setTried(true)
    if (blocker) return
    if (!act({ type: 'bills/save', bill }, old ? 'Draft saved' : 'Bill saved as draft', bill.code)) return
    if (post) act({ type: 'bills/post', id: bill.id }, 'Bill posted', `${bill.code} · ${fmtIdr(billTotals(bill).total)}`)
    navigate(paths.bill(bill.id), { replace: !old })
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={old ? paths.bill(old.id) : paths.bills} />
      <PageHeader className="mb-0" eyebrow={<span className="font-mono">{bill.code}</span>} title={old ? 'Edit bill' : 'New bill'} description="A draft changes nothing in the ledger. Posting books the expense, input VAT and the payable." />
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <FormField label="Vendor" required className="sm:col-span-2">
            <NativeSelect
              value={f.vendorId}
              onChange={(e) => setF({ ...f, vendorId: e.target.value, dueDate: dueFor(f.date, termsOf(e.target.value)) || f.dueDate })}
            >
              <option value="">Pick a vendor</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {v.termsDays} days
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Vendor ref" hint="The number on the vendor's invoice" className="sm:col-span-2">
            <Input value={f.vendorRef} onChange={(e) => setF({ ...f, vendorRef: e.target.value })} inputClassName="font-mono" />
          </FormField>
          <FormField label="Bill date" required>
            <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value, dueDate: f.vendorId ? dueFor(e.target.value, termsOf(f.vendorId)) : f.dueDate })} />
          </FormField>
          <FormField label="Due date" required hint={f.vendorId ? `${termsOf(f.vendorId)} days from the bill date` : undefined}>
            <Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
          </FormField>
          <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm sm:col-span-2">
            <span>
              <span className="block font-semibold">Input VAT {vatPct}%</span>
              <span className="text-xs text-muted">Turn on when the vendor charges PPN.</span>
            </span>
            <Switch label="Input VAT" checked={f.vat} onCheckedChange={(vat) => setF({ ...f, vat })} />
          </label>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentLinesEditor lines={lines} onChange={setLines} taxPct={taxPct} accountTypes={['expense', 'asset']} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-5">
          <FormField label="Memo">
            <Textarea value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} rows={2} />
          </FormField>
        </CardContent>
      </Card>
      {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => save(false)}>
          Save draft
        </Button>
        <Button disabled={!!postBlocker} title={postBlocker ?? undefined} onClick={() => save(true)}>
          <Send />
          Save and post
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- bill detail

export function BillDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [paying, setPaying] = useState(false)
  const [voiding, setVoiding] = useState(false)
  const b = state.bills.find((x) => x.id === id)
  if (!b) {
    return (
      <Card>
        <EmptyState pageTitle title="Bill not found" description="This bill may have been removed." action={<BackButton fallback={paths.bills} />} />
      </Card>
    )
  }
  const vendor = state.vendors.find((v) => v.id === b.vendorId)
  const totals = billTotals(b)
  const journal = state.journals.find((j) => j.id === b.journalId)
  const manage = can('billing.manage')
  const postBlocker = blockerFor(state, { type: 'bills/post', id: b.id })
  const voidBlocker = blockerFor(state, { type: 'bills/void', id: b.id })
  const overdue = b.status === 'posted' && isOverdue(b.dueDate, totals, now)
  const journalCode = (jid: string) => state.journals.find((j) => j.id === jid)?.code

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.bills} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{b.code}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">Bill from {vendor?.name ?? 'unknown vendor'}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <BillBadge bill={b} now={now} />
            {b.vendorRef && <span className="font-mono text-xs text-muted">Ref {b.vendorRef}</span>}
            {journal && <CodeLink to={paths.journal(journal.id)} code={journal.code} />}
          </div>
        </div>
        {manage && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {b.status === 'draft' && (
              <Button variant="outline" asChild>
                <Link to={paths.billEdit(b.id)}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            )}
            {b.status !== 'void' && (
              <Button variant="outline" disabled={!!voidBlocker} title={voidBlocker ?? undefined} onClick={() => setVoiding(true)}>
                <Ban />
                Void
              </Button>
            )}
            {b.status === 'draft' && (
              <Button disabled={!!postBlocker} title={postBlocker ?? undefined} onClick={() => act({ type: 'bills/post', id: b.id }, 'Bill posted', `${b.code} · ${fmtIdr(totals.total)}`)}>
                <Send />
                Post
              </Button>
            )}
            {b.status === 'posted' && totals.balance > 0 && (
              <Button onClick={() => setPaying(true)}>
                <Wallet />
                Record payment
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="text-xs text-on-ink-muted">{b.status === 'posted' ? 'Balance due' : 'Total'}</div>
          <Money value={b.status === 'posted' ? totals.balance : totals.total} className="mt-1 block text-3xl font-bold tracking-tight" />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Bill date</div>
              <div className="font-semibold">{fmtDate(b.date)}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Due</div>
              <div className={`font-semibold ${overdue ? 'text-accent' : ''}`}>{fmtDate(b.dueDate)}</div>
            </div>
            <div className="col-span-2 rounded-2xl bg-white/5 p-3 sm:col-span-1">
              <div className="text-xs text-on-ink-muted">Paid</div>
              <Money value={totals.paid} className="font-semibold" />
            </div>
          </div>
          {b.memo && <p className="mt-4 text-sm text-on-ink-muted">{b.memo}</p>}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Vendor</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              size="sm"
              items={[
                { label: 'Name', value: vendor ? <Link to={`${paths.bills}?vendor=${vendor.id}`} className="font-semibold hover:text-accent">{vendor.name}</Link> : '–' },
                { label: 'NPWP', value: <span className="font-mono text-xs">{vendor?.taxId || '–'}</span> },
                { label: 'Bank', value: vendor?.bankAccount || '–' },
                { label: 'Terms', value: vendor ? `${vendor.termsDays} days` : '–' },
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
          <ul className="divide-y divide-border">
            {b.lines.map((l) => (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{l.description}</div>
                  <div className="truncate text-xs text-muted">{accountLabel(state, l.accountId)}</div>
                </div>
                <span className="text-xs text-muted tabular-nums">
                  {l.qty} × {fmtIdr(l.unitPrice)}
                </span>
                <Money value={lineAmount(l)} className="w-32 text-right font-semibold" />
              </li>
            ))}
          </ul>
          <TotalsBlock totals={totals} taxPct={b.taxPct} showPaid={b.status === 'posted'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments ({b.payments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {b.payments.length === 0 ? (
            <EmptyState compact icon={<FileText />} title="No payments yet" description={b.status === 'posted' ? 'Record a payment when the money leaves the bank.' : 'Post the bill before paying it.'} />
          ) : (
            <ul className="divide-y divide-border">
              {b.payments.map((p) => {
                const code = journalCode(p.journalId)
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{fmtDate(p.date)}</div>
                      <div className="truncate text-xs text-muted">
                        {accountLabel(state, p.cashAccountId)}
                        {p.reference && ` · ${p.reference}`}
                      </div>
                    </div>
                    {code && <CodeLink to={paths.journal(p.journalId)} code={code} />}
                    <Money value={p.amount} className="font-semibold" />
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={paying} onOpenChange={setPaying} title={`Pay ${b.code}`} description={`${fmtIdr(totals.balance)} is still open to ${vendor?.name ?? 'the vendor'}.`}>
        {paying && <PaymentForm bill={b} balance={totals.balance} onDone={() => setPaying(false)} />}
      </Dialog>
      <Dialog open={voiding} onOpenChange={setVoiding} title={`Void ${b.code}?`} description={b.status === 'posted' ? 'The bill journal is voided too, so the expense and the payable come off the ledger.' : 'The draft is kept for the record and can no longer be posted.'}>
        <DialogFooter>
          <Button variant="outline" onClick={() => setVoiding(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (act({ type: 'bills/void', id: b.id }, 'Bill voided', b.code)) setVoiding(false)
            }}
          >
            Void bill
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function PaymentForm({ bill, balance, onDone }: { bill: Bill; balance: number; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ date: toDateInput(nowIso()), cashAccountId: state.financeSettings.defaultCashAccountId, amount: String(balance), reference: '' })
  const payment = {
    id: newId('bpay'),
    date: f.date ? fromDateInput(f.date) : '',
    amount: Number(f.amount) || 0,
    cashAccountId: f.cashAccountId,
    reference: f.reference.trim(),
    journalId: newId('jnl'),
  }
  const blocker = f.date ? blockerFor(state, { type: 'bills/pay', id: bill.id, payment }) : 'Pick the payment date.'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'bills/pay', id: bill.id, payment }, 'Payment recorded', `${bill.code} · ${fmtIdr(payment.amount)}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date" required>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </FormField>
        <FormField label="Amount" required hint={payment.amount ? fmtIdr(payment.amount) : 'Digits only'}>
          <Input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: digits(e.target.value) })} />
        </FormField>
        <FormField label="Paid from" required className="sm:col-span-2">
          <AccountSelect cash value={f.cashAccountId} onChange={(cashAccountId) => setF({ ...f, cashAccountId })} placeholder="Pick a cash or bank account" />
        </FormField>
        <FormField label="Reference" hint="Bank transfer number" className="sm:col-span-2">
          <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} inputClassName="font-mono" />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Record payment</Button>
      </DialogFooter>
    </form>
  )
}
