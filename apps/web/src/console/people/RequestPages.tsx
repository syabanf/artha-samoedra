import {
  blockerFor,
  countBy,
  currentEmployees,
  currentStep,
  requestsAwaiting,
  employeeName,
  employeeOfUser,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  leaveBalance,
  loanInstallment,
  loanOutstanding,
  newId,
  nextRequestCode,
  nowIso,
  requestSteps,
  workingDays,
  ymd,
} from '@artha/fixtures'
import {
  HR_REQUEST_KIND_LABEL,
  HR_REQUEST_STATUS_LABEL,
  LEAVE_TYPE_LABEL,
  type Employee,
  type HrRequest,
  type HrRequestKind,
  type HrRequestStatus,
  type LeaveType,
} from '@artha/types'
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
  PillTabs,
  ProgressBar,
  Textarea,
  type Column,
} from '@artha/ui'
import { Ban, Check, Plus, Search, Send, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from '../finance/parts'
import { useSetParam } from '../../lib/useSetParam'
import { ApprovalTrail, EmployeeSelect, PersonCell, RequestStatusBadge } from './parts'

const KINDS: HrRequestKind[] = ['leave', 'overtime', 'loan']
const STATUSES: HrRequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled']
const LEAVE_TYPES = Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]

const day = (date: string) => fmtDate(`${date}T12:00:00`)
const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

const detailOf = (r: HrRequest) => {
  if (r.leave) return `${day(r.leave.from)}${r.leave.to !== r.leave.from ? ` to ${day(r.leave.to)}` : ''} · ${plural(r.leave.days, 'day')}`
  if (r.overtime) return `${day(r.overtime.date)} · ${r.overtime.hours} h`
  if (r.loan) return `${fmtIdr(r.loan.amount)} over ${plural(r.loan.installments, 'month')}`
  return ''
}
const titleOf = (r: HrRequest) => (r.leave ? LEAVE_TYPE_LABEL[r.leave.type] : HR_REQUEST_KIND_LABEL[r.kind])

/** The current step names this user, or it is an HR or Finance step and the user holds request.approve. Nobody decides their own request. */
const useDecider = () => {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const ids = new Set(requestsAwaiting(state, user.id, can('request.approve')).map((r) => r.id))
  return (r: HrRequest) => ids.has(r.id)
}

// ---------------------------------------------------------------- list

export function HrRequestsPage() {
  const { state } = useAppState()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const decides = useDecider()
  const q = params.get('q') ?? ''
  const tab = params.get('tab') === 'mine' ? 'mine' : 'all'
  const kind = (params.get('kind') as HrRequestKind | null) || null
  const status = (params.get('status') as HrRequestStatus | null) || null
  const emp = params.get('employee') ?? ''

  const waiting = state.hrRequests.filter(decides)
  const base = tab === 'mine' ? waiting : state.hrRequests
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = base.filter((r) => (!emp || r.employeeId === emp) && terms.every((w) => `${r.code} ${employeeName(state, r.employeeId)} ${r.reason}`.toLowerCase().includes(w)))
  const kindCounts = countBy(searched.filter((r) => !status || r.status === status), (r) => r.kind)
  const statusCounts = countBy(searched.filter((r) => !kind || r.kind === kind), (r) => r.status)
  const rows = searched.filter((r) => (!kind || r.kind === kind) && (!status || r.status === status))
  const filters = [q, kind, status, emp].filter(Boolean).length

  const columns: Column<HrRequest>[] = [
    {
      id: 'code',
      header: 'Request',
      sortValue: (r) => r.createdAt,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{r.code}</div>
          <div className="truncate text-sm">{titleOf(r)}</div>
          <div className="mt-1.5 sm:hidden">
            <RequestStatusBadge status={r.status} />
          </div>
        </div>
      ),
    },
    { id: 'person', header: 'Employee', sortValue: (r) => employeeName(state, r.employeeId), cell: (r) => <PersonCell id={r.employeeId} link={false} /> },
    { id: 'detail', header: 'Detail', hideBelow: 'md', cell: (r) => <span className="text-xs tabular-nums">{detailOf(r)}</span> },
    {
      id: 'step',
      header: 'Waiting on',
      hideBelow: 'lg',
      cell: (r) => {
        const step = currentStep(r)
        if (!step) return <span className="text-xs text-muted">–</span>
        return (
          <span className={`text-xs ${decides(r) ? 'font-semibold text-accent' : ''}`}>
            {step.label}
            {step.approverId && <span className="text-muted"> · {state.users.find((u) => u.id === step.approverId)?.name}</span>}
          </span>
        )
      },
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (r) => STATUSES.indexOf(r.status), cell: (r) => <RequestStatusBadge status={r.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Requests"
        description="Leave, overtime and loans. Each goes to the manager first, then HR; loans also need Finance."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search requests"
              placeholder="Code, name or reason"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            <Button asChild>
              <Link to={paths.hrRequestNew}>
                <Plus />
                New request
              </Link>
            </Button>
          </>
        }
      />
      <PillTabs
        label="Which requests"
        value={tab}
        onChange={(v) => set('tab', v === 'mine' ? 'mine' : null)}
        items={[
          { value: 'all', label: 'All', count: state.hrRequests.length },
          { value: 'mine', label: 'Waiting for me', count: waiting.length },
        ]}
        className="mb-4"
      />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!kind} count={Object.values(kindCounts).reduce((a, b) => a + b, 0)} onClick={() => set('kind', null)}>
            All kinds
          </Chip>
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} count={kindCounts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
              {HR_REQUEST_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        <EmployeeSelect value={emp} onChange={(id) => set('employee', id || null)} placeholder="All employees" aria-label="Filter by employee" className="min-w-0 flex-1 sm:w-60 sm:flex-none" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {HR_REQUEST_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {base.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear(['tab'])}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          rowLabel={(r) => r.code}
          onRowClick={(r) => navigate(paths.hrRequest(r.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${tab}|${q}|${kind}|${status}|${emp}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching requests" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear(['tab'])}>Clear filters</Button>} />
            ) : tab === 'mine' ? (
              <EmptyState compact title="Nothing waits for you" description="Requests you can approve show up here." />
            ) : (
              <EmptyState compact title="No requests yet" description="Leave, overtime and loan requests show up here." />
            )
          }
        />
      </div>

      <LeaveBalances year={Number(ymd(now).slice(0, 4))} emp={emp} terms={terms} />
    </div>
  )
}

type BalanceRow = Employee & ReturnType<typeof leaveBalance>

function LeaveBalances({ year, emp, terms }: { year: number; emp: string; terms: string[] }) {
  const { state } = useAppState()
  const people = currentEmployees(state)
  const rows: BalanceRow[] = people
    .filter((e) => (!emp || e.id === emp) && terms.every((w) => `${e.name} ${e.code}`.toLowerCase().includes(w)))
    .map((e) => ({ ...e, ...leaveBalance(state, e.id, year) }))
  const columns: Column<BalanceRow>[] = [
    { id: 'person', header: 'Employee', sortValue: (r) => r.name, cell: (r) => <PersonCell id={r.id} /> },
    { id: 'quota', header: 'Quota', align: 'right', hideBelow: 'sm', sortValue: (r) => r.quota, cell: (r) => <span className="tabular-nums">{r.quota}</span> },
    { id: 'used', header: 'Taken', align: 'right', hideBelow: 'md', sortValue: (r) => r.used, cell: (r) => <span className="tabular-nums">{r.used}</span> },
    { id: 'pending', header: 'Waiting', align: 'right', hideBelow: 'md', sortValue: (r) => r.pending, cell: (r) => <span className="tabular-nums">{r.pending || '–'}</span> },
    {
      id: 'left',
      header: 'Left',
      align: 'right',
      sortValue: (r) => r.left,
      cell: (r) => <span className={`font-semibold tabular-nums ${r.left <= 2 ? 'text-accent' : ''}`}>{plural(r.left, 'day')}</span>,
    },
  ]
  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Annual leave in {year}</CardTitle>
        <p className="text-sm text-muted">
          {rows.length === people.length ? `${people.length} employees.` : `${rows.length} of ${people.length} employees, by the search and employee filter above.`} Waiting days count against the balance until decided.
        </p>
      </CardHeader>
      <CardContent>
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          rowLabel={(r) => r.name}
          initialSort={{ id: 'person', desc: false }}
          resetPageKey={`${emp}|${terms.join(' ')}`}
          empty={<EmptyState compact title="No matching employees" description="Change the search or the employee filter." />}
        />
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- editor

export function HrRequestEditorPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const [params] = useSearchParams()
  const me = employeeOfUser(state, user.id)
  const pickAny = can('request.approve') || can('employee.manage')
  if (!pickAny && !me) {
    return (
      <Card>
        <EmptyState title="No employee record" description="Your console user is not linked to an employee, so there is nobody to request for. Ask HR to link it." action={<BackButton fallback={paths.hrRequests} />} />
      </Card>
    )
  }
  const asked = params.get('employee') ?? ''
  const kind = params.get('kind') as HrRequestKind | null
  return (
    <RequestEditor
      pickAny={pickAny}
      employeeId={pickAny && currentEmployees(state).some((e) => e.id === asked) ? asked : (me?.id ?? '')}
      kind={kind && KINDS.includes(kind) ? kind : 'leave'}
    />
  )
}

function RequestEditor({ pickAny, employeeId, kind }: { pickAny: boolean; employeeId: string; kind: HrRequestKind }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const [id] = useState(() => newId('hrq'))
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    employeeId,
    kind,
    leaveType: 'annual' as LeaveType,
    from: '',
    to: '',
    date: '',
    hours: '2',
    amount: '',
    installments: '6',
    reason: '',
  })
  const days = f.from && f.to ? workingDays(state, f.from, f.to) : 0
  const request: HrRequest = {
    id,
    code: nextRequestCode(state, f.kind),
    kind: f.kind,
    employeeId: f.employeeId,
    reason: f.reason.trim(),
    status: 'pending',
    steps: requestSteps(state, f.employeeId, f.kind),
    createdBy: user.id,
    createdAt: nowIso(),
    ...(f.kind === 'leave' && { leave: { type: f.leaveType, from: f.from, to: f.to, days } }),
    ...(f.kind === 'overtime' && { overtime: { date: f.date, hours: Number(f.hours) || 0 } }),
    ...(f.kind === 'loan' && { loan: { amount: Number(f.amount) || 0, installments: Number(f.installments) || 0, paidInstallments: 0 } }),
  }
  const blocker = !f.employeeId
    ? 'Pick the employee.'
    : f.kind === 'leave' && (!f.from || !f.to)
      ? 'Pick the first and last day of leave.'
      : f.kind === 'overtime' && !f.date
        ? 'Pick the overtime date.'
        : blockerFor(state, { type: 'hrRequests/create', request })
  const year = Number((f.from || ymd(nowIso())).slice(0, 4))
  const balance = f.employeeId ? leaveBalance(state, f.employeeId, year) : null

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.hrRequests} />
      <PageHeader className="mb-0" eyebrow={<span className="font-mono">{request.code}</span>} title="New request" description="The request goes to its first approver as soon as you send it." />
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-5 sm:grid-cols-2">
          <FormField label="Employee" required>
            {pickAny ? <EmployeeSelect value={f.employeeId} onChange={(employeeId) => setF({ ...f, employeeId })} /> : <PersonCell id={f.employeeId} link={false} />}
          </FormField>
          <FormField label="Kind" required>
            <PillTabs label="Request kind" value={f.kind} onChange={(k) => setF({ ...f, kind: k })} items={KINDS.map((k) => ({ value: k, label: HR_REQUEST_KIND_LABEL[k] }))} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{HR_REQUEST_KIND_LABEL[f.kind]}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {f.kind === 'leave' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField label="Type" required>
                  <NativeSelect value={f.leaveType} onChange={(e) => setF({ ...f, leaveType: e.target.value as LeaveType })}>
                    {LEAVE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {LEAVE_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <FormField label="First day" required>
                  <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to && f.to >= e.target.value ? f.to : e.target.value })} />
                </FormField>
                <FormField label="Last day" required hint={f.from && f.to ? `${plural(days, 'working day')}, weekends and holidays left out` : undefined}>
                  <Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} />
                </FormField>
              </div>
              {balance && (
                <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 text-sm sm:grid-cols-4">
                  <div>
                    <div className="text-xs text-muted">Annual quota {year}</div>
                    <div className="font-semibold tabular-nums">{plural(balance.quota, 'day')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Taken</div>
                    <div className="font-semibold tabular-nums">{plural(balance.used, 'day')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">Waiting</div>
                    <div className="font-semibold tabular-nums">{plural(balance.pending, 'day')}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted">{f.leaveType === 'annual' && days ? 'Left after this' : 'Left'}</div>
                    <div className={`font-semibold tabular-nums ${balance.left - (f.leaveType === 'annual' ? days : 0) < 0 ? 'text-danger' : ''}`}>
                      {plural(balance.left - (f.leaveType === 'annual' ? days : 0), 'day')}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {f.kind === 'overtime' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Date" required>
                <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
              </FormField>
              <FormField label="Hours" required hint="Half an hour to 4 hours">
                <Input type="number" inputMode="decimal" min={0.5} max={4} step={0.5} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
              </FormField>
            </div>
          )}
          {f.kind === 'loan' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Amount" required hint={request.loan?.amount ? fmtIdr(request.loan.amount) : 'Digits only'}>
                <Input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
              </FormField>
              <FormField label="Installments" required hint={request.loan?.amount && request.loan.installments ? `${fmtIdr(loanInstallment(request))} a month from payroll` : 'Monthly, 1 to 12'}>
                <NativeSelect value={f.installments} onChange={(e) => setF({ ...f, installments: e.target.value })}>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {plural(i + 1, 'month')}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            </div>
          )}
          <FormField label="Reason" required>
            <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} />
          </FormField>
        </CardContent>
      </Card>

      {f.employeeId && (
        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <ApprovalTrail steps={request.steps} />
          </CardContent>
        </Card>
      )}

      {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" asChild>
          <Link to={paths.hrRequests}>Cancel</Link>
        </Button>
        <Button
          onClick={() => {
            setTried(true)
            if (blocker) return
            if (act({ type: 'hrRequests/create', request }, 'Request sent', `${request.code} · ${employeeName(state, request.employeeId)}`)) navigate(paths.hrRequest(request.id), { replace: true })
          }}
        >
          <Send />
          Send request
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- detail

const heroFigure = (r: HrRequest) => {
  if (r.leave) return { label: 'Working days', value: plural(r.leave.days, 'day') }
  if (r.overtime) return { label: 'Overtime', value: `${r.overtime.hours} h` }
  return { label: 'Loan amount', value: fmtIdr(r.loan?.amount ?? 0) }
}

export function HrRequestDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const decides = useDecider()
  const [deciding, setDeciding] = useState<'approved' | 'rejected' | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const r = state.hrRequests.find((x) => x.id === id)
  if (!r) {
    return (
      <Card>
        <EmptyState title="Request not found" description="This request may have been removed." action={<BackButton fallback={paths.hrRequests} />} />
      </Card>
    )
  }
  const mine = decides(r)
  const approveBlocker = blockerFor(state, { type: 'hrRequests/decide', id: r.id, decision: 'approved', note: '', by: user.id })
  const cancelBlocker = blockerFor(state, { type: 'hrRequests/cancel', id: r.id })
  const ownsIt = r.createdBy === user.id || state.employees.find((e) => e.id === r.employeeId)?.userId === user.id
  const showCancel = (r.status === 'pending' || r.status === 'approved') && (ownsIt || can('request.approve'))
  const figure = heroFigure(r)
  const creator = state.users.find((u) => u.id === r.createdBy)?.name ?? 'someone'

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.hrRequests} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{r.code}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">
            {titleOf(r)} for {employeeName(state, r.employeeId)}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={r.status} />
            <span className="text-xs text-muted">
              Sent by {creator} · {fmtDateTime(r.createdAt)}
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
          {mine && (
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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card variant="ink" className="p-6">
            <div className="text-xs text-on-ink-muted">{figure.label}</div>
            <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{figure.value}</div>
            <p className="mt-2 text-sm text-on-ink-muted">{detailOf(r)}</p>
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
                  { label: 'Employee', value: <PersonCell id={r.employeeId} /> },
                  { label: 'Kind', value: titleOf(r) },
                  ...(r.leave
                    ? [
                        { label: 'Dates', value: `${day(r.leave.from)} to ${day(r.leave.to)}` },
                        { label: 'Working days', value: plural(r.leave.days, 'day') },
                      ]
                    : []),
                  ...(r.overtime ? [{ label: 'Date', value: day(r.overtime.date) }, { label: 'Hours', value: `${r.overtime.hours} h` }] : []),
                  ...(r.loan ? [{ label: 'Installment', value: `${fmtIdr(loanInstallment(r))} a month for ${plural(r.loan.installments, 'month')}` }] : []),
                  { label: 'Reason', value: r.reason },
                ]}
              />
            </CardContent>
          </Card>
          {r.loan && r.status === 'approved' && (
            <Card>
              <CardHeader>
                <CardTitle>Repayment</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    {r.loan.paidInstallments} of {plural(r.loan.installments, 'installment')} paid through payroll
                  </span>
                  <span className="text-muted">
                    Outstanding <Money value={loanOutstanding(r)} className="font-semibold text-foreground" />
                  </span>
                </div>
                <ProgressBar value={(r.loan.paidInstallments / r.loan.installments) * 100} tone="success" />
              </CardContent>
            </Card>
          )}
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <ApprovalTrail steps={r.steps} />
            {r.leave?.type === 'annual' && (
              <p className="mt-4 text-xs text-muted">
                {employeeName(state, r.employeeId)} has {plural(leaveBalance(state, r.employeeId, Number(r.leave.from.slice(0, 4))).left, 'day')} of annual leave left in {r.leave.from.slice(0, 4)}, after waiting requests.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={!!deciding}
        onOpenChange={(o) => !o && setDeciding(null)}
        title={deciding === 'rejected' ? `Reject ${r.code}?` : `Approve ${r.code}?`}
        description={deciding === 'rejected' ? 'The employee sees your reason. The request closes.' : `You approve at the ${currentStep(r)?.label ?? ''} level.`}
      >
        {deciding && <DecideForm request={r} decision={deciding} onDone={() => setDeciding(null)} />}
      </Dialog>
      <Dialog open={cancelling} onOpenChange={setCancelling} title={`Cancel ${r.code}?`} description={r.status === 'approved' ? 'The approved leave is withdrawn and the days go back to the balance.' : 'The approvers no longer see it.'}>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelling(false)}>
            Keep it
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (act({ type: 'hrRequests/cancel', id: r.id }, 'Request cancelled', r.code)) setCancelling(false)
            }}
          >
            Cancel request
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function DecideForm({ request, decision, onDone }: { request: HrRequest; decision: 'approved' | 'rejected'; onDone: () => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [note, setNote] = useState('')
  const action = { type: 'hrRequests/decide' as const, id: request.id, decision, note: note.trim(), by: user.id }
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
