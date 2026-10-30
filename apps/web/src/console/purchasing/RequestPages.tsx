import {
  bestPrice,
  blockerFor,
  countBy,
  currentStep,
  employeeName,
  employeeOfUser,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  fromDateInput,
  newId,
  nextPrCode,
  nowIso,
  prSteps,
  prsAwaiting,
  prTotal,
  toDateInput,
  toMs,
  type AppState,
} from '@artha/fixtures'
import { PR_STATUS_LABEL, type PrStatus, type PurchaseRequest } from '@artha/types'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
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
  PillTabs,
  Textarea,
  type Column,
} from '@artha/ui'
import { Ban, Check, Pencil, Plus, Search, Send, ShoppingCart, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { useSetParam } from '../../lib/useSetParam'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from '../finance/parts'
import { ApprovalTrail, EmployeeSelect, PersonCell } from '../people/parts'
import { ItemSelect, PrStatusBadge, Qty, VendorSelect } from './parts'

const STATUSES: PrStatus[] = ['draft', 'pending', 'approved', 'rejected', 'ordered', 'cancelled']
type Tab = 'all' | 'mine' | 'waiting'
type Line = PurchaseRequest['lines'][number]

const deptName = (s: AppState, id: string) => s.departments.find((d) => d.id === id)?.name ?? '–'
const digits = (v: string) => Number(v.replace(/\D/g, ''))
const blankLine = (): Line => ({ id: newId('prl'), itemId: '', qty: 1, estPrice: 0, note: '' })

/** Raised by the user, or for the user. */
const isMine = (s: AppState, r: PurchaseRequest, userId: string) => r.createdBy === userId || s.employees.find((e) => e.id === r.requesterId)?.userId === userId

/** The request's current level waits on this user; Finance levels need purchase.approve. */
const useDecider = () => {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const ids = new Set(prsAwaiting(state, user.id, can('purchase.approve')).map((r) => r.id))
  return (r: PurchaseRequest) => ids.has(r.id)
}

const WaitingOn = ({ r, mine }: { r: PurchaseRequest; mine: boolean }) => {
  const { state } = useAppState()
  const step = currentStep(r)
  if (!step) return null
  return (
    <span className={`block text-xs ${mine ? 'font-semibold text-accent' : ''}`}>
      {step.label}
      {step.approverId && <span className="text-muted"> · {state.users.find((u) => u.id === step.approverId)?.name}</span>}
    </span>
  )
}

// ---------------------------------------------------------------- list

export function PurchaseRequestsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const decides = useDecider()
  const [ordering, setOrdering] = useState(false)
  const q = params.get('q') ?? ''
  const tabParam = params.get('tab')
  const tab: Tab = tabParam === 'mine' || tabParam === 'waiting' ? tabParam : 'all'
  const status = (params.get('status') as PrStatus | null) || null
  const dept = params.get('department') ?? ''

  const mine = state.purchaseRequests.filter((r) => isMine(state, r, user.id))
  const waiting = state.purchaseRequests.filter(decides)
  const base = tab === 'mine' ? mine : tab === 'waiting' ? waiting : state.purchaseRequests
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const itemsOf = (r: PurchaseRequest) => r.lines.map((l) => state.items.find((i) => i.id === l.itemId)?.name ?? '').join(' ')
  const searched = base.filter(
    (r) => (!dept || r.departmentId === dept) && terms.every((w) => `${r.code} ${employeeName(state, r.requesterId)} ${r.reason} ${itemsOf(r)}`.toLowerCase().includes(w)),
  )
  const statusCounts = countBy(searched, (r) => r.status)
  const rows = searched.filter((r) => !status || r.status === status)
  const filters = [q, status, dept].filter(Boolean).length
  const approved = state.purchaseRequests.filter((r) => r.status === 'approved')

  const columns: Column<PurchaseRequest>[] = [
    {
      id: 'code',
      header: 'Request',
      sortValue: (r) => r.code,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{r.code}</div>
          <div className="truncate text-sm">{r.reason || 'No reason yet'}</div>
          <div className="mt-1.5 sm:hidden">
            <PrStatusBadge status={r.status} />
          </div>
        </div>
      ),
    },
    { id: 'person', header: 'Requester', hideBelow: 'md', sortValue: (r) => employeeName(state, r.requesterId), cell: (r) => <PersonCell id={r.requesterId} link={false} /> },
    { id: 'dept', header: 'Department', hideBelow: 'xl', sortValue: (r) => deptName(state, r.departmentId), cell: (r) => <span className="text-sm">{deptName(state, r.departmentId)}</span> },
    {
      id: 'items',
      header: 'Items',
      hideBelow: 'lg',
      sortValue: (r) => r.lines.length,
      cell: (r) => (
        <div className="min-w-0 text-sm">
          <div className="truncate">{state.items.find((i) => i.id === r.lines[0]?.itemId)?.name ?? '–'}</div>
          {r.lines.length > 1 && <div className="text-xs text-muted">and {r.lines.length - 1} more</div>}
        </div>
      ),
    },
    { id: 'total', header: 'Estimated', align: 'right', sortValue: prTotal, cell: (r) => <Money value={prTotal(r)} className="font-semibold" /> },
    {
      id: 'needed',
      header: 'Needed by',
      hideBelow: 'lg',
      sortValue: (r) => r.neededBy,
      cell: (r) => {
        const late = (r.status === 'pending' || r.status === 'approved') && toMs(r.neededBy) < now
        return <span className={`text-xs ${late ? 'font-semibold text-accent' : 'text-muted'}`}>{fmtDate(r.neededBy)}</span>
      },
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (r) => STATUSES.indexOf(r.status),
      cell: (r) => (
        <div className="space-y-1">
          <PrStatusBadge status={r.status} />
          {r.status === 'pending' && <WaitingOn r={r} mine={decides(r)} />}
        </div>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Purchase requests"
        description="Staff ask for supplies here. Each request goes to the manager, then Finance and the Director above their limits."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search requests"
              placeholder="Code, requester, reason or item"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('purchase.order') && (
              <Button variant="outline" disabled={!approved.length} title={approved.length ? undefined : 'No approved request is waiting for an order.'} onClick={() => setOrdering(true)}>
                <ShoppingCart />
                Order approved requests
              </Button>
            )}
            {can('purchase.request') && (
              <Button asChild>
                <Link to={paths.prNew}>
                  <Plus />
                  New request
                </Link>
              </Button>
            )}
          </>
        }
      />
      <PillTabs
        label="Which requests"
        value={tab}
        onChange={(v) => set('tab', v === 'all' ? null : v)}
        items={[
          { value: 'all', label: 'All', count: state.purchaseRequests.length },
          { value: 'mine', label: 'Mine', count: mine.length },
          { value: 'waiting', label: 'Waiting for me', count: waiting.length },
        ]}
        className="mb-4"
      />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {PR_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect aria-label="Filter by department" value={dept} onChange={(e) => set('department', e.target.value || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <option value="">All departments</option>
          {state.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      {filters > 0 && (
        <div className="mt-2 text-xs text-muted tabular-nums">
          {rows.length} of {base.length}
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear(['tab'])}>
            Clear {filters} {filters === 1 ? 'filter' : 'filters'}
          </Button>
        </div>
      )}
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          rowLabel={(r) => r.code}
          onRowClick={(r) => navigate(paths.pr(r.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${tab}|${q}|${status}|${dept}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching requests" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear(['tab'])}>Clear filters</Button>} />
            ) : tab === 'waiting' ? (
              <EmptyState compact title="Nothing waits for you" description="Requests at your approval level show up here." />
            ) : tab === 'mine' ? (
              <EmptyState compact title="You have no requests" description="Requests you raise, or someone raises for you, show up here." />
            ) : (
              <EmptyState compact title="No requests yet" description="Raise a request when your team needs supplies." />
            )
          }
        />
      </div>
      <Dialog open={ordering} onOpenChange={setOrdering} title="Order approved requests" description="Pick the requests one supplier will fill. The order opens as a draft with their lines merged by item.">
        {ordering && <OrderPicker requests={approved} onDone={() => setOrdering(false)} />}
      </Dialog>
    </div>
  )
}

function OrderPicker({ requests, onDone }: { requests: PurchaseRequest[]; onDone: () => void }) {
  const { state } = useAppState()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<string[]>([])
  const [vendorId, setVendorId] = useState('')
  const blocker = !picked.length ? 'Pick at least one request.' : !vendorId ? 'Pick the supplier.' : null
  return (
    <div>
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {requests.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
            <Checkbox label={`Order ${r.code}`} checked={picked.includes(r.id)} onCheckedChange={(on) => setPicked(on ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs font-semibold">{r.code}</div>
              <div className="truncate">
                {employeeName(state, r.requesterId)} · {r.lines.length} {r.lines.length === 1 ? 'item' : 'items'}
              </div>
            </div>
            <Money value={prTotal(r)} className="font-semibold" />
          </li>
        ))}
      </ul>
      <FormField label="Supplier" required className="mt-4">
        <VendorSelect value={vendorId} onChange={setVendorId} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button disabled={!!blocker} title={blocker ?? undefined} onClick={() => navigate(`${paths.poNew}?prs=${picked.join(',')}&vendor=${vendorId}`)}>
          Draft the order
        </Button>
      </DialogFooter>
    </div>
  )
}

// ---------------------------------------------------------------- editor

export function PurchaseRequestEditorPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const old = id ? state.purchaseRequests.find((r) => r.id === id) : undefined
  if (!can('purchase.request')) return <NoAccess description="Raising purchase requests needs the request permission." />
  if (id && !old) {
    return (
      <Card>
        <h1 className="sr-only">Request not found</h1>
        <EmptyState title="Request not found" description="This request may have been removed." action={<BackButton fallback={paths.prs} />} />
      </Card>
    )
  }
  if (old && old.status !== 'draft') {
    return (
      <Card>
        <h1 className="sr-only">Only a draft request can be edited</h1>
        <EmptyState title="Only a draft request can be edited" description={`${old.code} is ${PR_STATUS_LABEL[old.status].toLowerCase()}.`} action={<Button variant="outline" asChild><Link to={paths.pr(old.id)}>Open request</Link></Button>} />
      </Card>
    )
  }
  const pickAny = can('purchase.order')
  const me = employeeOfUser(state, user.id)
  if (!old && !pickAny && !me) {
    return (
      <Card>
        <h1 className="sr-only">No employee record</h1>
        <EmptyState title="No employee record" description="Your console user is not linked to an employee, so there is nobody to request for. Ask HR to link it." action={<BackButton fallback={paths.prs} />} />
      </Card>
    )
  }
  const itemId = params.get('item') ?? ''
  const prefill = !old && state.items.some((i) => i.id === itemId && i.active) ? { itemId, qty: Math.max(digits(params.get('qty') ?? ''), 1) } : null
  return <RequestEditor key={old?.id ?? 'new'} old={old ?? null} pickAny={pickAny} requesterId={old?.requesterId ?? me?.id ?? ''} prefill={prefill} />
}

function RequestEditor({ old, pickAny, requesterId, prefill }: { old: PurchaseRequest | null; pickAny: boolean; requesterId: string; prefill: { itemId: string; qty: number } | null }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const today = nowIso()
  const [f, setF] = useState({ requesterId, neededBy: old ? toDateInput(old.neededBy) : '', reason: old?.reason ?? '' })
  const [lines, setLines] = useState<Line[]>(() => {
    if (old) return old.lines
    if (!prefill) return [blankLine()]
    return [{ ...blankLine(), ...prefill, estPrice: bestPrice(state, prefill.itemId, prefill.qty, today)?.price ?? 0 }]
  })
  const setLine = (lineId: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)))
  const pickItem = (l: Line, itemId: string) => setLine(l.id, { itemId, estPrice: (itemId && bestPrice(state, itemId, l.qty || 1, today)?.price) || 0 })

  const requester = state.employees.find((e) => e.id === f.requesterId)
  const pr: PurchaseRequest = {
    id: old?.id ?? newId('pr'),
    code: old?.code ?? nextPrCode(state),
    requesterId: f.requesterId,
    departmentId: requester?.departmentId ?? '',
    neededBy: f.neededBy ? fromDateInput(f.neededBy) : '',
    reason: f.reason.trim(),
    lines,
    status: 'draft',
    steps: [],
    poId: null,
    createdBy: old?.createdBy ?? user.id,
    createdAt: old?.createdAt ?? today,
  }
  const total = prTotal(pr)
  const blocker = !f.neededBy ? 'Pick the date you need the goods by.' : blockerFor(state, { type: 'prs/save', pr })

  const save = (submit: boolean) => {
    setTried(true)
    if (blocker) return
    if (!act({ type: 'prs/save', pr }, old ? 'Draft saved' : 'Request saved as draft', pr.code)) return
    if (submit) act({ type: 'prs/submit', id: pr.id }, 'Request sent for approval', `${pr.code} · ${fmtIdr(total)}`)
    navigate(paths.pr(pr.id), { replace: !old })
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={old ? paths.pr(old.id) : paths.prs} />
      <PageHeader className="mb-0" eyebrow={<span className="font-mono">{pr.code}</span>} title={old ? 'Edit request' : 'New purchase request'} description="A draft waits until you send it. Approvers see the estimated total and the reason." />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2">
              <FormField label="Requester" required hint={requester ? deptName(state, requester.departmentId) : undefined}>
                {pickAny ? <EmployeeSelect value={f.requesterId} onChange={(id) => setF({ ...f, requesterId: id })} /> : <PersonCell id={f.requesterId} link={false} />}
              </FormField>
              <FormField label="Needed by" required>
                <Input type="date" value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} />
              </FormField>
              <FormField label="Reason" required className="sm:col-span-2">
                <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} placeholder="What the goods are for" />
              </FormField>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
              <p className="text-sm text-muted">The estimated price starts at the cheapest supplier list price.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-3">
                {lines.map((l, i) => (
                  <li key={l.id} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 sm:grid-cols-[minmax(0,2fr)_5rem_8rem_auto] sm:items-center">
                    <ItemSelect aria-label={`Line ${i + 1} item`} value={l.itemId} onChange={(itemId) => pickItem(l, itemId)} className="col-span-2 sm:col-span-1" />
                    <Input aria-label={`Line ${i + 1} quantity`} inputMode="numeric" value={l.qty || ''} onChange={(e) => setLine(l.id, { qty: digits(e.target.value) })} />
                    <Input aria-label={`Line ${i + 1} estimated price`} inputMode="numeric" placeholder="Est. price" value={l.estPrice || ''} onChange={(e) => setLine(l.id, { estPrice: digits(e.target.value) })} />
                    <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
                      <Money value={l.qty * l.estPrice} className="text-sm font-semibold sm:hidden" />
                      <Button variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} title={lines.length === 1 ? 'A request needs at least one item.' : undefined} onClick={() => setLines(lines.filter((x) => x.id !== l.id))}>
                        <Trash2 />
                      </Button>
                    </div>
                    <Input aria-label={`Line ${i + 1} note`} placeholder="Note, such as a colour or size" value={l.note} onChange={(e) => setLine(l.id, { note: e.target.value })} className="col-span-2 sm:col-span-4" />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="outline" size="sm" onClick={() => setLines([...lines, blankLine()])}>
                  <Plus />
                  Add item
                </Button>
                <div className="text-sm">
                  <span className="text-muted">Estimated total </span>
                  <Money value={total} className="font-semibold" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Approvals it will need</CardTitle>
            <p className="text-sm text-muted">From the requester's manager and the estimated total.</p>
          </CardHeader>
          <CardContent>{f.requesterId ? <ApprovalTrail steps={prSteps(state, f.requesterId, total)} /> : <p className="text-sm text-muted">Pick the requester to see the approvers.</p>}</CardContent>
        </Card>
      </div>
      {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => save(false)}>
          Save draft
        </Button>
        <Button onClick={() => save(true)}>
          <Send />
          Submit for approval
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- detail

export function PurchaseRequestDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const decides = useDecider()
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const r = state.purchaseRequests.find((x) => x.id === id)
  if (!r) {
    return (
      <Card>
        <h1 className="sr-only">Request not found</h1>
        <EmptyState title="Request not found" description="This request may have been removed." action={<BackButton fallback={paths.prs} />} />
      </Card>
    )
  }
  const total = prTotal(r)
  const mine = isMine(state, r, user.id)
  const decide = decides(r)
  const approveBlocker = blockerFor(state, { type: 'prs/decide', id: r.id, decision: 'approved', note: '', by: user.id })
  const submitBlocker = blockerFor(state, { type: 'prs/submit', id: r.id })
  const cancelBlocker = blockerFor(state, { type: 'prs/cancel', id: r.id })
  const canEdit = r.status === 'draft' && can('purchase.request') && (mine || can('purchase.order'))
  const showCancel = ['draft', 'pending', 'approved'].includes(r.status) && ((mine && can('purchase.request')) || can('purchase.order'))
  const po = r.poId ? state.purchaseOrders.find((p) => p.id === r.poId) : undefined
  const steps = r.steps.length ? r.steps : prSteps(state, r.requesterId, total)
  const creator = state.users.find((u) => u.id === r.createdBy)?.name ?? 'someone'

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.prs} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{r.code}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">Request from {employeeName(state, r.requesterId)}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PrStatusBadge status={r.status} />
            {po && <CodeLink to={paths.po(po.id)} code={po.code} />}
            <span className="text-xs text-muted">
              Raised by {creator} · {fmtDateTime(r.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {showCancel && (
            <Button variant="outline" disabled={!!cancelBlocker} title={cancelBlocker ?? undefined} onClick={() => setCancelling(true)}>
              <Ban />
              Cancel request
            </Button>
          )}
          {canEdit && (
            <>
              <Button variant="outline" asChild>
                <Link to={paths.prEdit(r.id)}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
              <Button disabled={!!submitBlocker} title={submitBlocker ?? undefined} onClick={() => act({ type: 'prs/submit', id: r.id }, 'Request sent for approval', `${r.code} · ${fmtIdr(total)}`)}>
                <Send />
                Submit for approval
              </Button>
            </>
          )}
          {decide && (
            <>
              <Button variant="outline" onClick={() => setDeciding('rejected')}>
                <X />
                Reject
              </Button>
              <Button disabled={!!approveBlocker} title={approveBlocker ?? undefined} onClick={() => setDeciding('approved')}>
                <Check />
                Approve
              </Button>
            </>
          )}
          {r.status === 'approved' && can('purchase.order') && (
            <Button asChild>
              <Link to={`${paths.poNew}?prs=${r.id}`}>
                <ShoppingCart />
                Order it
              </Link>
            </Button>
          )}
          {po && (
            <Button variant="outline" asChild>
              <Link to={paths.po(po.id)}>Open order {po.code}</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card variant="ink" className="p-6">
            <div className="text-xs text-on-ink-muted">Estimated total</div>
            <Money value={total} className="mt-1 block text-3xl font-bold tracking-tight" />
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-on-ink-muted">Needed by</div>
                <div className="font-semibold">{fmtDate(r.neededBy)}</div>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-on-ink-muted">Items</div>
                <div className="font-semibold tabular-nums">{r.lines.length}</div>
              </div>
              <div className="col-span-2 min-w-0 rounded-2xl bg-white/5 p-3 sm:col-span-1">
                <div className="text-xs text-on-ink-muted">Department</div>
                <div className="truncate font-semibold">{deptName(state, r.departmentId)}</div>
              </div>
            </div>
            <p className="mt-4 text-sm text-on-ink-muted">{r.reason}</p>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Items</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border">
                {r.lines.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <Link to={paths.item(l.itemId)} className="font-semibold hover:text-accent">
                        {state.items.find((i) => i.id === l.itemId)?.name ?? 'Unknown item'}
                      </Link>
                      {l.note && <div className="text-xs text-muted">{l.note}</div>}
                    </div>
                    <span className="text-xs text-muted">
                      <Qty itemId={l.itemId} qty={l.qty} /> × {fmtIdr(l.estPrice)}
                    </span>
                    <Money value={l.qty * l.estPrice} className="w-32 text-right font-semibold" />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                bare
                size="sm"
                items={[
                  { label: 'Requester', value: <PersonCell id={r.requesterId} /> },
                  { label: 'Department', value: deptName(state, r.departmentId) },
                  { label: 'Order', value: po ? <CodeLink to={paths.po(po.id)} code={po.code} /> : 'Not ordered yet' },
                ]}
              />
            </CardContent>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
            {!r.steps.length && <p className="text-sm text-muted">The levels it will need once sent, from today's total.</p>}
          </CardHeader>
          <CardContent>
            <ApprovalTrail steps={steps} />
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        title={deciding === 'rejected' ? `Reject ${r.code}?` : `Approve ${r.code}?`}
        description={deciding === 'rejected' ? 'The requester sees your reason. The request closes.' : `You approve at the ${currentStep(r)?.label ?? ''} level.`}
      >
        {deciding && <DecideForm request={r} decision={deciding} onDone={() => setDeciding(null)} />}
      </Dialog>
      <Dialog open={cancelling} onOpenChange={setCancelling} title={`Cancel ${r.code}?`} description="The request closes and approvers no longer see it.">
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelling(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (act({ type: 'prs/cancel', id: r.id }, 'Request cancelled', r.code)) setCancelling(false)
            }}
          >
            Cancel request
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function DecideForm({ request, decision, onDone }: { request: PurchaseRequest; decision: 'approved' | 'rejected'; onDone: () => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [note, setNote] = useState('')
  const action = { type: 'prs/decide' as const, id: request.id, decision, note: note.trim(), by: user.id }
  const blocker = blockerFor(state, action)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, decision === 'approved' ? 'Request approved' : 'Request rejected', request.code)) onDone()
      }}
    >
      <FormField label={decision === 'rejected' ? 'Reason' : 'Note'} required={decision === 'rejected'}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={decision === 'rejected' ? 'Why the request cannot go ahead' : 'Optional'} />
      </FormField>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Back
        </Button>
        <Button type="submit" variant={decision === 'rejected' ? 'danger' : 'primary'}>
          {decision === 'rejected' ? 'Reject' : 'Approve'}
        </Button>
      </DialogFooter>
    </form>
  )
}
