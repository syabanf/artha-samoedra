import {
  blockerFor,
  countBy,
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
import { HR_REQUEST_KIND_LABEL, HR_REQUEST_STATUS_LABEL, LEAVE_TYPE_LABEL, type Employee, type HrRequest, type HrRequestKind, type HrRequestStatus, type LeaveType } from '@artha/types'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  cn,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  PillTabs,
  ProgressBar,
  Textarea,
} from '@artha/ui'
import { Ban, ChevronDown, Clock, HandCoins, Plane, Plus, Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { SearchBox } from '../../components/SearchBox'
import { useSetParam } from '../../lib/useSetParam'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { ApprovalTrail, RequestStatusBadge } from '../people/parts'
import { WithMe, plural, requestDetail, requestTitle } from './shared'

const KINDS: HrRequestKind[] = ['leave', 'overtime', 'loan']
const STATUSES: HrRequestStatus[] = ['pending', 'approved', 'rejected', 'cancelled']
const LEAVE_TYPES = Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]
const KIND_ICON = { leave: Plane, overtime: Clock, loan: HandCoins }

// ---------------------------------------------------------------- list

export function MyRequestsPage() {
  return <WithMe title="My requests">{(me) => <Requests me={me} />}</WithMe>
}

function Requests({ me }: { me: Employee }) {
  const { state } = useAppState()
  const act = useAct()
  const { params, set, clear } = useSetParam()
  const [cancelling, setCancelling] = useState<HrRequest | null>(null)
  const q = params.get('q') ?? ''
  const kind = (params.get('kind') as HrRequestKind | null) || null
  const status = (params.get('status') as HrRequestStatus | null) || null
  const open = params.get('open')

  const mine = state.hrRequests.filter((r) => r.employeeId === me.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = mine.filter((r) => terms.every((w) => `${r.code} ${requestTitle(r)} ${r.reason}`.toLowerCase().includes(w)))
  const kindCounts = countBy(searched.filter((r) => !status || r.status === status), (r) => r.kind)
  const statusCounts = countBy(searched.filter((r) => !kind || r.kind === kind), (r) => r.status)
  const rows = searched.filter((r) => (!kind || r.kind === kind) && (!status || r.status === status))
  const filters = [q, kind, status].filter(Boolean).length

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My requests" description="Leave, overtime and loans you asked for. Each goes to your manager first, then HR; loans also need Finance." />
      <div className="mb-4 grid grid-cols-3 gap-2">
        {KINDS.map((k) => {
          const Icon = KIND_ICON[k]
          return (
            <Link
              key={k}
              to={`${paths.meRequestNew}?kind=${k}`}
              className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-card bg-card p-3 text-center text-sm font-semibold shadow-card hover:bg-surface"
            >
              <Icon className="size-5 text-accent" aria-hidden />
              <span>
                <span className="sr-only">New </span>
                {HR_REQUEST_KIND_LABEL[k]}
              </span>
            </Link>
          )
        })}
      </div>

      <SearchBox value={q} onChange={(v) => set('q', v)} label="Search my requests" placeholder="Code or reason" />
      <ChipRow className="mt-3">
        <Chip active={!kind} count={Object.values(kindCounts).reduce((a, b) => a + b, 0)} onClick={() => set('kind', null)}>
          All kinds
        </Chip>
        {KINDS.map((k) => (
          <Chip key={k} active={kind === k} count={kindCounts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
            {HR_REQUEST_KIND_LABEL[k]}
          </Chip>
        ))}
      </ChipRow>
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
            {rows.length} of {mine.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {rows.map((r) => {
          const expanded = open === r.id
          const cancelBlocker = blockerFor(state, { type: 'hrRequests/cancel', id: r.id })
          return (
            <Card key={r.id} className="min-w-0">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => set('open', expanded ? null : r.id)}
                className="flex min-h-16 w-full items-center gap-3 rounded-card p-4 text-left hover:bg-surface/60"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2">
                    <span className="truncate font-semibold">{requestTitle(r)}</span>
                    <span className="font-mono text-xs text-muted">{r.code}</span>
                  </span>
                  <span className="block truncate text-xs text-muted tabular-nums">{requestDetail(r)}</span>
                </span>
                <RequestStatusBadge status={r.status} />
                <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} aria-hidden />
              </button>
              {expanded && (
                <div className="space-y-4 border-t border-border p-4">
                  <p className="text-sm text-body">{r.reason}</p>
                  {r.loan && r.status === 'approved' && (
                    <div className="space-y-2 text-sm">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span>
                          {r.loan.paidInstallments} of {plural(r.loan.installments, 'installment')} paid
                        </span>
                        <span className="text-muted">Outstanding {fmtIdr(loanOutstanding(r))}</span>
                      </div>
                      <ProgressBar value={(r.loan.paidInstallments / r.loan.installments) * 100} tone="success" />
                    </div>
                  )}
                  <ApprovalTrail steps={r.steps} />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-muted">Sent {fmtDateTime(r.createdAt)}</span>
                    {(r.status === 'pending' || r.status === 'approved') && (
                      <Button variant="outline" size="lg" disabled={!!cancelBlocker} title={cancelBlocker ?? undefined} onClick={() => setCancelling(r)}>
                        <Ban />
                        Cancel request
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </Card>
          )
        })}
        {!rows.length && (
          <Card>
            {filters ? (
              <EmptyState
                compact
                title="No matching requests"
                description="Change the search or clear the filters."
                action={
                  <Button variant="outline" size="sm" onClick={() => clear()}>
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No requests yet"
                description="Ask for leave, overtime or a loan and follow it here."
                action={
                  <Button asChild>
                    <Link to={`${paths.meRequestNew}?kind=leave`}>
                      <Plus />
                      New request
                    </Link>
                  </Button>
                }
              />
            )}
          </Card>
        )}
      </div>

      <Dialog
        open={!!cancelling}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={`Cancel ${cancelling?.code ?? ''}?`}
        description={cancelling?.status === 'approved' ? 'The approved leave is withdrawn and the days go back to your balance.' : 'Your approvers no longer see it.'}
      >
        <DialogFooter>
          <Button variant="outline" onClick={() => setCancelling(null)}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => cancelling && act({ type: 'hrRequests/cancel', id: cancelling.id }, 'Request cancelled', cancelling.code) && setCancelling(null)}>
            Cancel request
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------- new request

export function MyRequestNewPage() {
  return <WithMe title="New request">{(me) => <NewRequest me={me} />}</WithMe>
}

function NewRequest({ me }: { me: Employee }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set } = useSetParam()
  const asked = params.get('kind') as HrRequestKind | null
  const kind = asked && KINDS.includes(asked) ? asked : 'leave'
  const [id] = useState(() => newId('hrq'))
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ leaveType: 'annual' as LeaveType, from: '', to: '', date: '', hours: '2', amount: '', installments: '6', reason: '' })

  const days = f.from && f.to ? workingDays(state, f.from, f.to) : 0
  const request: HrRequest = {
    id,
    code: nextRequestCode(state, kind),
    kind,
    employeeId: me.id,
    reason: f.reason.trim(),
    status: 'pending',
    steps: requestSteps(state, me.id, kind),
    createdBy: user.id,
    createdAt: nowIso(),
    ...(kind === 'leave' && { leave: { type: f.leaveType, from: f.from, to: f.to, days } }),
    ...(kind === 'overtime' && { overtime: { date: f.date, hours: Number(f.hours) || 0 } }),
    ...(kind === 'loan' && { loan: { amount: Number(f.amount) || 0, installments: Number(f.installments) || 0, paidInstallments: 0 } }),
  }
  const blocker =
    kind === 'leave' && (!f.from || !f.to)
      ? 'Pick the first and last day of leave.'
      : kind === 'overtime' && !f.date
        ? 'Pick the overtime date.'
        : blockerFor(state, { type: 'hrRequests/create', request })
  const year = Number((f.from || ymd(now)).slice(0, 4))
  const balance = leaveBalance(state, me.id, year)
  const after = balance.left - (f.leaveType === 'annual' ? days : 0)

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackButton fallback={paths.meRequests} />
      <PageHeader className="mb-0" eyebrow={<span className="font-mono">{request.code}</span>} title="New request" description="It goes to your first approver as soon as you send it." />
      <PillTabs label="Request kind" value={kind} onChange={(k) => set('kind', k)} items={KINDS.map((k) => ({ value: k, label: HR_REQUEST_KIND_LABEL[k] }))} />

      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (blocker) return
          if (act({ type: 'hrRequests/create', request }, 'Request sent', `${request.code} · ${requestTitle(request)}`)) navigate(`${paths.meRequests}?open=${request.id}`, { replace: true })
        }}
      >
        {kind === 'leave' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: `Quota ${year}`, value: balance.quota },
              { label: 'Taken', value: balance.used },
              { label: 'Waiting', value: balance.pending },
              { label: f.leaveType === 'annual' && days ? 'Left after this' : 'Left', value: after },
            ].map((t) => (
              <div key={t.label} className="rounded-2xl bg-card p-3 shadow-card">
                <div className="text-xs text-muted">{t.label}</div>
                <div className={cn('text-lg font-bold tabular-nums', t.value < 0 && 'text-accent')}>{plural(t.value, 'day')}</div>
              </div>
            ))}
          </div>
        )}

        <Card>
          <CardContent className="space-y-4 pt-5">
            {kind === 'leave' && (
              <>
                <FormField label="Type" required hint={f.leaveType === 'annual' ? 'Annual leave comes out of your balance.' : 'This type does not use your annual balance.'}>
                  <NativeSelect value={f.leaveType} onChange={(e) => setF({ ...f, leaveType: e.target.value as LeaveType })}>
                    {LEAVE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {LEAVE_TYPE_LABEL[t]}
                      </option>
                    ))}
                  </NativeSelect>
                </FormField>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="First day" required>
                    <Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value, to: f.to && f.to >= e.target.value ? f.to : e.target.value })} />
                  </FormField>
                  <FormField label="Last day" required hint={f.from && f.to ? `${plural(days, 'working day')}, weekends and holidays left out` : undefined}>
                    <Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} />
                  </FormField>
                </div>
              </>
            )}
            {kind === 'overtime' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Date" required>
                  <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
                </FormField>
                <FormField label="Hours" required hint="Half an hour to 4 hours">
                  <Input type="number" inputMode="decimal" min={0.5} max={4} step={0.5} value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} />
                </FormField>
              </div>
            )}
            {kind === 'loan' && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label="Amount" required hint={request.loan?.amount ? fmtIdr(request.loan.amount) : `Up to ${fmtIdr(me.baseSalary * 3)}`}>
                  <Input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, '') })} />
                </FormField>
                <FormField label="Installments" required hint={request.loan?.amount ? `${fmtIdr(loanInstallment(request))} a month from payroll` : 'Monthly, 1 to 12'}>
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
              <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={3} />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who approves</CardTitle>
          </CardHeader>
          <CardContent>
            <ApprovalTrail steps={request.steps} />
          </CardContent>
        </Card>

        {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" size="lg" asChild>
            <Link to={paths.meRequests}>Cancel</Link>
          </Button>
          <Button type="submit" size="lg">
            <Send />
            Send request
          </Button>
        </div>
      </form>
    </div>
  )
}
