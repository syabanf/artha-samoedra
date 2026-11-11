import {
  attendanceSummary,
  blockerFor,
  checklistProgress,
  countBy,
  currentContract,
  DAY,
  dayStart,
  directReports,
  expiringContracts,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  fromDateInput,
  leaveBalance,
  monthDates,
  newId,
  nextContractCode,
  nextEmployeeCode,
  nowIso,
  toDateInput,
  ymd,
  type AppState,
} from '@artha/fixtures'
import {
  CHECKLIST_KIND_LABEL,
  EMPLOYEE_STATUS_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  HR_REQUEST_KIND_LABEL,
  PAYROLL_STATUS_LABEL,
  PTKP_AMOUNT,
  type Checklist,
  type Employee,
  type EmployeeStatus,
  type EmploymentContract,
  type EmploymentType,
  type Ptkp,
} from '@artha/types'
import {
  Badge,
  Banner,
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
  ProgressBar,
  StatCard,
  Switch,
  Textarea,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { CalendarClock, CircleCheck, Download, FileSignature, LogOut, Pencil, Plus, Search, UserCheck, UserPlus, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { SubTabs } from '../../components/SubTabs'
import { downloadCsv } from '../../lib/csv'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from '../finance/parts'
import { Avatar, EmployeeSelect, EmployeeStatusBadge, PersonCell, RequestStatusBadge } from './parts'
import { useSetParam } from '../../lib/useSetParam'

// ---------------------------------------------------------------- shared with OrgPages

export const PEOPLE_TABS = [
  { to: paths.employees, label: 'Employees' },
  { to: paths.org, label: 'Organisation' },
  { to: paths.contracts, label: 'Contracts' },
  { to: paths.checklists, label: 'Checklists' },
  { to: paths.hrSettings, label: 'HR settings' },
]

/** A YYYY-MM-DD date read as local midnight, so it never shifts a day. */
export const fmtDay = (date: string) => fmtDate(`${date}T00:00:00`)
export const digits = (v: string) => v.replace(/\D/g, '')
const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
export const deptName = (s: AppState, id: string | null) => s.departments.find((d) => d.id === id)?.name ?? '–'
const branchName = (s: AppState, id: string) => s.branches.find((b) => b.id === id)?.name ?? '–'
const positionName = (s: AppState, id: string) => s.positions.find((p) => p.id === id)?.name ?? '–'

const CONTRACT_VARIANT: Record<EmploymentContract['status'], BadgeVariant> = { active: 'success', ended: 'muted', expired: 'danger' }
export const CONTRACT_STATUS_LABEL: Record<EmploymentContract['status'], string> = { active: 'Active', ended: 'Ended', expired: 'Expired' }
export const ContractStatusBadge = ({ status }: { status: EmploymentContract['status'] }) => <Badge variant={CONTRACT_VARIANT[status]}>{CONTRACT_STATUS_LABEL[status]}</Badge>

/** One day after a YYYY-MM-DD date, or a year later less a day. */
const nextDay = (date: string) => ymd(dayStart(date) + DAY + 3_600_000)
const yearLater = (date: string) => ymd(dayStart(`${Number(date.slice(0, 4)) + 1}${date.slice(4)}`) - 12 * 3_600_000)

/** Renews a current contract: the old one ends and the employee takes the new type and salary. */
export function RenewDialog({ contract, onClose }: { contract: EmploymentContract | null; onClose: () => void }) {
  const { state } = useAppState()
  const name = state.employees.find((e) => e.id === contract?.employeeId)?.name ?? 'the employee'
  return (
    <Dialog open={!!contract} onOpenChange={(o) => !o && onClose()} title={`Renew ${contract?.code ?? 'contract'}`} description={`A new contract for ${name}. The current one ends when you save.`}>
      {contract && <RenewForm old={contract} onDone={onClose} />}
    </Dialog>
  )
}

function RenewForm({ old, onDone }: { old: EmploymentContract; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const start = old.endsOn ? nextDay(old.endsOn) : ymd(Date.now())
  const [f, setF] = useState({ type: old.type, startsOn: start, endsOn: yearLater(start), salary: String(old.salary), note: '' })
  const contract: EmploymentContract = {
    id: newId('ctr'),
    code: nextContractCode(state),
    employeeId: old.employeeId,
    type: f.type,
    startsOn: f.startsOn,
    endsOn: f.type === 'permanent' ? null : f.endsOn || null,
    salary: Number(f.salary) || 0,
    status: 'active',
    note: f.note.trim(),
  }
  const blocker = f.startsOn ? blockerFor(state, { type: 'contracts/renew', id: old.id, contract }) : 'Pick the start date.'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'contracts/renew', id: old.id, contract }, 'Contract renewed', `${contract.code} · ${EMPLOYMENT_TYPE_LABEL[contract.type]}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Type" required className="sm:col-span-2">
          <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as EmploymentType })}>
            {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Starts" required>
          <Input type="date" value={f.startsOn} onChange={(e) => setF({ ...f, startsOn: e.target.value })} />
        </FormField>
        {f.type !== 'permanent' && (
          <FormField label="Ends" required>
            <Input type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} />
          </FormField>
        )}
        <FormField label="Monthly salary" required hint={contract.salary ? fmtIdr(contract.salary) : 'Digits only'} className="sm:col-span-2">
          <Input inputMode="numeric" value={f.salary} onChange={(e) => setF({ ...f, salary: digits(e.target.value) })} />
        </FormField>
        <FormField label="Note" className="sm:col-span-2">
          <Textarea rows={2} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Renew contract</Button>
      </DialogFooter>
    </form>
  )
}

/** Toggleable items of one checklist with its progress. */
export function ChecklistCard({ checklist, manage, showEmployee }: { checklist: Checklist; manage: boolean; showEmployee?: boolean }) {
  const { state } = useAppState()
  const act = useAct()
  const p = checklistProgress(checklist)
  const userName = (id: string | null) => state.users.find((u) => u.id === id)?.name ?? 'someone'
  return (
    <Card>
      <CardHeader action={<Badge variant={p.complete ? 'success' : 'warning'}>{p.complete ? 'Complete' : `${p.done} of ${p.total}`}</Badge>}>
        {showEmployee ? <PersonCell id={checklist.employeeId} sub={`${CHECKLIST_KIND_LABEL[checklist.kind]} · started ${fmtDate(checklist.startedAt)}`} /> : <CardTitle>{CHECKLIST_KIND_LABEL[checklist.kind]}</CardTitle>}
        {!showEmployee && <p className="text-sm text-muted">Started {fmtDate(checklist.startedAt)}{checklist.completedAt && `, completed ${fmtDate(checklist.completedAt)}`}</p>}
      </CardHeader>
      <CardContent className="space-y-3">
        <ProgressBar value={p.total ? (p.done / p.total) * 100 : 0} tone={p.complete ? 'success' : 'ink'} />
        <ul className="divide-y divide-border">
          {checklist.items.map((i) => (
            <li key={i.id} className="flex items-start gap-3 py-2.5 text-sm">
              {manage ? (
                <span title={checklist.completedAt ? 'The checklist is complete.' : undefined} className="mt-0.5">
                  <Checkbox
                    label={i.label}
                    checked={!!i.doneAt}
                    disabled={!!checklist.completedAt}
                    onCheckedChange={() => act({ type: 'checklists/toggle', id: checklist.id, itemId: i.id }, i.doneAt ? 'Item reopened' : 'Item done', i.label)}
                  />
                </span>
              ) : (
                <CircleCheck className={`mt-0.5 size-5 shrink-0 ${i.doneAt ? 'text-success' : 'text-silver'}`} aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <div className={i.doneAt ? 'text-muted line-through' : 'font-semibold'}>{i.label}</div>
                <div className="text-xs text-muted">
                  {OWNER_LABEL[i.ownerRole]}
                  {i.doneAt && ` · done by ${userName(i.doneBy)}, ${fmtDateTime(i.doneAt)}`}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export const OWNER_LABEL: Record<Checklist['items'][number]['ownerRole'], string> = { hr: 'HR', it: 'IT', finance: 'Finance', manager: 'Manager' }

// ---------------------------------------------------------------- list

const STATUSES: EmployeeStatus[] = ['onboarding', 'active', 'offboarding', 'left']
const TYPES = Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]

export function EmployeesPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as EmployeeStatus | null) || null
  const dept = params.get('dept') ?? ''
  const type = (params.get('type') as EmploymentType | null) || null
  const branch = params.get('branch') ?? ''

  const alertDays = state.hrSettings.contractAlertDays
  const ending = expiringContracts(state, now, alertDays)
  const all = state.employees
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = all.filter(
    (e) => (!branch || e.branchId === branch) && terms.every((w) => `${e.code} ${e.name} ${e.email} ${e.phone} ${positionName(state, e.positionId)}`.toLowerCase().includes(w)),
  )
  const by = { status: (e: Employee) => !status || e.status === status, dept: (e: Employee) => !dept || e.departmentId === dept, type: (e: Employee) => !type || e.type === type }
  const statusCounts = countBy(searched.filter((e) => by.dept(e) && by.type(e)), (e) => e.status)
  const deptCounts = countBy(searched.filter((e) => by.status(e) && by.type(e)), (e) => e.departmentId)
  const typeCounts = countBy(searched.filter((e) => by.status(e) && by.dept(e)), (e) => e.type)
  const rows = searched.filter((e) => by.status(e) && by.dept(e) && by.type(e))
  const filters = [q, status, dept, type, branch].filter(Boolean).length
  const toggle = (key: string, current: string | null, value: string) => set(key, current === value ? null : value)
  const byStatus = countBy(all, (e) => e.status)

  const exportCsv = () =>
    downloadCsv(`employees-${ymd(now)}`, [
      ['Code', 'Name', 'Email', 'Phone', 'Department', 'Position', 'Type', 'Branch', 'Joined', 'Status'],
      ...rows.map((e) => [e.code, e.name, e.email, e.phone, deptName(state, e.departmentId), positionName(state, e.positionId), EMPLOYMENT_TYPE_LABEL[e.type], branchName(state, e.branchId), ymd(e.joinedAt), EMPLOYEE_STATUS_LABEL[e.status]]),
    ])

  const columns: Column<Employee>[] = [
    {
      id: 'name',
      header: 'Employee',
      sortValue: (e) => e.name,
      cell: (e) => (
        <div className="min-w-0">
          <PersonCell id={e.id} />
          <div className="mt-1.5 sm:hidden">
            <EmployeeStatusBadge status={e.status} />
          </div>
        </div>
      ),
    },
    { id: 'code', header: 'Code', hideBelow: 'md', sortValue: (e) => e.code, cell: (e) => <span className="font-mono text-xs">{e.code}</span> },
    { id: 'dept', header: 'Department', hideBelow: 'lg', sortValue: (e) => deptName(state, e.departmentId), cell: (e) => <span className="text-sm">{deptName(state, e.departmentId)}</span> },
    { id: 'type', header: 'Type', hideBelow: 'xl', cell: (e) => <span className="text-xs text-muted">{EMPLOYMENT_TYPE_LABEL[e.type]}</span> },
    { id: 'branch', header: 'Branch', hideBelow: 'xl', cell: (e) => <span className="text-xs text-muted">{branchName(state, e.branchId)}</span> },
    { id: 'joined', header: 'Joined', hideBelow: 'md', sortValue: (e) => e.joinedAt, cell: (e) => <span className="text-xs text-muted">{fmtDate(e.joinedAt)}</span> },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (e) => STATUSES.indexOf(e.status), cell: (e) => <EmployeeStatusBadge status={e.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Employees"
        description="Everyone on the books, from onboarding to their last day. Open a person for contracts, checklists, time and pay."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search employees"
              placeholder="Name, code, email or position"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            <Button variant="outline" disabled={!rows.length} title={rows.length ? undefined : 'No employees match the filters.'} onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
            {can('employee.manage') && (
              <Button asChild>
                <Link to={paths.employeeNew}>
                  <Plus />
                  New employee
                </Link>
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={PEOPLE_TABS} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Active" value={byStatus.active ?? 0} icon={<Users />} tone="ink" active={status === 'active'} onClick={() => toggle('status', status, 'active')} />
        <StatCard label="Onboarding" value={byStatus.onboarding ?? 0} icon={<UserPlus />} tone={byStatus.onboarding ? 'info' : 'default'} active={status === 'onboarding'} onClick={() => toggle('status', status, 'onboarding')} />
        <StatCard label="Offboarding" value={byStatus.offboarding ?? 0} icon={<LogOut />} tone={byStatus.offboarding ? 'warning' : 'default'} active={status === 'offboarding'} onClick={() => toggle('status', status, 'offboarding')} />
        <StatCard
          label="Contracts ending"
          value={ending.length}
          icon={<CalendarClock />}
          tone={ending.length ? 'danger' : 'default'}
          hint={`Within ${alertDays} days`}
          onClick={() => navigate(`${paths.contracts}?ending=${alertDays}`)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!status} count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => toggle('status', status, s)}>
              {EMPLOYEE_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect aria-label="Filter by branch" value={branch} onChange={(e) => set('branch', e.target.value || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <option value="">All branches</option>
          {state.branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <ChipRow className="mt-2">
        {state.departments.map((d) => (
          <Chip key={d.id} active={dept === d.id} count={deptCounts[d.id] ?? 0} onClick={() => toggle('dept', dept, d.id)}>
            {d.name}
          </Chip>
        ))}
      </ChipRow>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          {TYPES.map((t) => (
            <Chip key={t} active={type === t} count={typeCounts[t] ?? 0} onClick={() => toggle('type', type, t)}>
              {EMPLOYMENT_TYPE_LABEL[t]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {all.length}
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
          getRowKey={(e) => e.id}
          rowLabel={(e) => e.name}
          onRowClick={(e) => navigate(paths.employee(e.id))}
          initialSort={{ id: 'name', desc: false }}
          resetPageKey={`${q}|${status}|${dept}|${type}|${branch}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching employees" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No employees yet" description="Add the first employee to start the HR records." />
            )
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- editor

export function EmployeeEditorPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const old = id ? state.employees.find((e) => e.id === id) : undefined
  if (!can('employee.manage')) return <NoAccess description="Adding and editing employees needs the employee permission." />
  if (id && !old) {
    return (
      <Card>
        <EmptyState pageTitle title="Employee not found" description="This employee may have been removed." action={<BackButton fallback={paths.employees} />} />
      </Card>
    )
  }
  return <EmployeeEditor key={old?.id ?? 'new'} old={old ?? null} />
}

const PTKPS = Object.keys(PTKP_AMOUNT) as Ptkp[]

function EmployeeEditor({ old }: { old: Employee | null }) {
  const { state } = useAppState()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const today = toDateInput(nowIso())
  const [f, setF] = useState({
    name: old?.name ?? '',
    email: old?.email ?? '',
    phone: old?.phone ?? '',
    gender: old?.gender ?? 'female',
    birthDate: old?.birthDate ?? '',
    nik: old?.nik ?? '',
    departmentId: old?.departmentId ?? '',
    sectionId: old?.sectionId ?? '',
    positionId: old?.positionId ?? '',
    managerId: old?.managerId ?? '',
    branchId: old?.branchId ?? state.branches.find((b) => b.isHead)?.id ?? '',
    type: old?.type ?? ('probation' as EmploymentType),
    shiftId: old?.shiftId ?? state.shifts[0]?.id ?? '',
    joined: old ? toDateInput(old.joinedAt) : today,
    baseSalary: old ? String(old.baseSalary) : '',
    ptkp: old?.ptkp ?? ('TK/0' as Ptkp),
    npwp: old?.npwp ?? '',
    bpjsTk: old?.bpjsTk ?? '',
    bpjsKes: old?.bpjsKes ?? '',
    bankAccount: old?.bankAccount ?? '',
    allowances: Object.fromEntries((old?.allowances ?? []).map((a) => [a.componentId, String(a.amount)])) as Record<string, string>,
    annualLeave: String(old?.annualLeave ?? 12),
    userId: old?.userId ?? '',
    withContract: true,
    contractEnds: '',
  })
  const set = (k: 'name' | 'email' | 'phone' | 'birthDate' | 'nik' | 'npwp' | 'bpjsTk' | 'bpjsKes' | 'bankAccount' | 'joined' | 'contractEnds') => (e: { target: { value: string } }) =>
    setF({ ...f, [k]: e.target.value })

  const employee: Employee = {
    id: old?.id ?? newId('emp'),
    code: old?.code ?? nextEmployeeCode(state),
    name: f.name.trim(),
    email: f.email.trim(),
    phone: f.phone.trim(),
    gender: f.gender,
    birthDate: f.birthDate,
    userId: f.userId || null,
    departmentId: f.departmentId,
    sectionId: f.sectionId || null,
    positionId: f.positionId,
    managerId: f.managerId || null,
    branchId: f.branchId,
    type: f.type,
    status: old?.status ?? 'onboarding',
    joinedAt: f.joined ? fromDateInput(f.joined) : '',
    leftAt: old?.leftAt ?? null,
    leftReason: old?.leftReason ?? '',
    nik: digits(f.nik),
    npwp: digits(f.npwp),
    bpjsTk: f.bpjsTk.trim(),
    bpjsKes: f.bpjsKes.trim(),
    bankAccount: f.bankAccount.trim(),
    ptkp: f.ptkp,
    baseSalary: Number(f.baseSalary) || 0,
    allowances: state.payComponents.filter((c) => Number(f.allowances[c.id]) > 0).map((c) => ({ componentId: c.id, amount: Number(f.allowances[c.id]) })),
    shiftId: f.shiftId,
    annualLeave: Number(f.annualLeave) || 0,
  }
  const contract: EmploymentContract | null =
    !old && f.withContract
      ? {
          id: newId('ctr'),
          code: nextContractCode(state),
          employeeId: employee.id,
          type: f.type,
          startsOn: f.joined,
          endsOn: f.type === 'permanent' ? null : f.contractEnds || null,
          salary: employee.baseSalary,
          status: 'active',
          note: '',
        }
      : null
  const { id: _id, code: _code, status: _status, ...patch } = employee
  const action = old ? ({ type: 'employees/update', id: old.id, patch } as const) : ({ type: 'employees/create', employee, contract } as const)
  const blocker = !f.joined ? 'Pick the join date.' : f.annualLeave === '' ? 'Enter the annual leave quota.' : blockerFor(state, action)

  const sections = state.sections.filter((x) => x.departmentId === f.departmentId)
  const positions = state.positions.filter((p) => p.departmentId === f.departmentId)
  const linked = new Set(state.employees.filter((e) => e.id !== old?.id && e.status !== 'left' && e.userId).map((e) => e.userId))
  const users = state.users.filter((u) => u.id === f.userId || (u.status === 'active' && !linked.has(u.id)))

  const save = () => {
    setTried(true)
    if (blocker) return
    if (act(action, old ? 'Employee saved' : 'Employee added', `${employee.code} · ${employee.name}`)) navigate(paths.employee(employee.id), { replace: !old })
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={old ? paths.employee(old.id) : paths.employees} />
      <PageHeader
        className="mb-0"
        eyebrow={<span className="font-mono">{employee.code}</span>}
        title={old ? `Edit ${old.name}` : 'New employee'}
        description={old ? 'Changes apply from the next payroll run. Contract changes go through Renew on the contract.' : 'A new hire starts in onboarding with the onboarding checklist. Activate them once it is done.'}
      />
      <Card>
        <CardHeader>
          <CardTitle>Identity</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Full name" required>
            <Input value={f.name} onChange={set('name')} />
          </FormField>
          <FormField label="Work email" required>
            <Input type="email" value={f.email} onChange={set('email')} />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" value={f.phone} onChange={set('phone')} />
          </FormField>
          <FormField label="Gender">
            <NativeSelect value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as Employee['gender'] })}>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </NativeSelect>
          </FormField>
          <FormField label="Birth date">
            <Input type="date" value={f.birthDate} onChange={set('birthDate')} />
          </FormField>
          <FormField label="NIK" hint="16-digit KTP number">
            <Input inputMode="numeric" value={f.nik} onChange={set('nik')} inputClassName="font-mono" />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Department" required>
            <NativeSelect value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value, sectionId: '', positionId: '' })}>
              <option value="">Pick a department</option>
              {state.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Section" hint={f.departmentId && !sections.length ? 'This department has no sections.' : undefined}>
            <NativeSelect value={f.sectionId} disabled={!f.departmentId} onChange={(e) => setF({ ...f, sectionId: e.target.value })}>
              <option value="">{f.departmentId ? 'No section' : 'Pick a department first'}</option>
              {sections.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Position" required>
            <NativeSelect value={f.positionId} disabled={!f.departmentId} onChange={(e) => setF({ ...f, positionId: e.target.value })}>
              <option value="">{f.departmentId ? 'Pick a position' : 'Pick a department first'}</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · grade {p.grade}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Manager">
            <EmployeeSelect value={f.managerId} onChange={(managerId) => setF({ ...f, managerId })} filter={(e) => e.id !== old?.id} placeholder="No manager" />
          </FormField>
          <FormField label="Branch" required>
            <NativeSelect value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>
              {state.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Employment type" required hint={old ? 'Renewing a contract also sets the type.' : undefined}>
            <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as EmploymentType })}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {EMPLOYMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Shift" required>
            <NativeSelect value={f.shiftId} onChange={(e) => setF({ ...f, shiftId: e.target.value })}>
              <option value="">Pick a shift</option>
              {state.shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.start} to {s.end}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Joined" required>
            <Input type="date" value={f.joined} onChange={set('joined')} />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payroll</CardTitle>
          <p className="text-sm text-muted">Base salary and fixed monthly components feed every payroll run.</p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FormField label="Base salary" required hint={employee.baseSalary ? fmtIdr(employee.baseSalary) : 'Digits only'}>
            <Input inputMode="numeric" value={f.baseSalary} onChange={(e) => setF({ ...f, baseSalary: digits(e.target.value) })} />
          </FormField>
          <FormField label="PTKP status" hint={`Tax-free income ${fmtIdr(PTKP_AMOUNT[f.ptkp])} a year`}>
            <NativeSelect value={f.ptkp} onChange={(e) => setF({ ...f, ptkp: e.target.value as Ptkp })}>
              {PTKPS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="NPWP" hint="15 or 16 digits">
            <Input inputMode="numeric" value={f.npwp} onChange={set('npwp')} inputClassName="font-mono" />
          </FormField>
          <FormField label="BPJS Ketenagakerjaan">
            <Input value={f.bpjsTk} onChange={set('bpjsTk')} inputClassName="font-mono" />
          </FormField>
          <FormField label="BPJS Kesehatan">
            <Input value={f.bpjsKes} onChange={set('bpjsKes')} inputClassName="font-mono" />
          </FormField>
          <FormField label="Bank account" hint="Bank, number and account name">
            <Input value={f.bankAccount} onChange={set('bankAccount')} placeholder="BCA 123 456 7890 a.n. Nama" />
          </FormField>
          {state.payComponents.map((c) => {
            const amount = Number(f.allowances[c.id]) || 0
            return (
              <FormField key={c.id} label={c.name} hint={amount ? `${fmtIdr(amount)} a month` : c.kind === 'deduction' ? 'Monthly deduction' : 'Monthly, leave empty for none'}>
                <Input inputMode="numeric" value={f.allowances[c.id] ?? ''} onChange={(e) => setF({ ...f, allowances: { ...f.allowances, [c.id]: digits(e.target.value) } })} />
              </FormField>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leave and console access</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Annual leave quota" hint="Days a year">
            <Input inputMode="numeric" value={f.annualLeave} onChange={(e) => setF({ ...f, annualLeave: digits(e.target.value) })} />
          </FormField>
          <FormField label="Console user" hint="Links self-service check-in, requests and payslips">
            <NativeSelect value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })}>
              <option value="">No console user</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.email}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </CardContent>
      </Card>

      {!old && (
        <Card>
          <CardContent className="space-y-4 pt-5">
            <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
              <span>
                <span className="block font-semibold">Add the first contract</span>
                <span className="text-xs text-muted">
                  {EMPLOYMENT_TYPE_LABEL[f.type]} from the join date at the base salary{contract && ` · ${contract.code}`}
                </span>
              </span>
              <Switch label="Add the first contract" checked={f.withContract} onCheckedChange={(withContract) => setF({ ...f, withContract })} />
            </label>
            {f.withContract && f.type !== 'permanent' && (
              <FormField label="Contract ends" required className="sm:max-w-xs">
                <Input type="date" value={f.contractEnds} onChange={set('contractEnds')} />
              </FormField>
            )}
          </CardContent>
        </Card>
      )}

      {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" asChild>
          <Link to={old ? paths.employee(old.id) : paths.employees}>Cancel</Link>
        </Button>
        <Button onClick={save}>{old ? 'Save employee' : 'Add employee'}</Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- detail

type DetailTab = 'profile' | 'contracts' | 'checklists' | 'time' | 'requests' | 'payslips' | 'team'

const tenure = (fromIso: string, untilMs: number) => {
  const a = new Date(fromIso)
  if (untilMs < a.getTime()) return `Starts ${fmtDate(fromIso)}`
  const b = new Date(untilMs)
  const months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0)
  if (months < 1) {
    const days = Math.floor((untilMs - a.getTime()) / DAY)
    return `${days} ${days === 1 ? 'day' : 'days'}`
  }
  const y = Math.floor(months / 12)
  const m = months % 12
  return [y && `${y} ${y === 1 ? 'year' : 'years'}`, m && `${m} ${m === 1 ? 'month' : 'months'}`].filter(Boolean).join(' ')
}

export function EmployeeDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const { params, set } = useSetParam()
  const [offboarding, setOffboarding] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [renewing, setRenewing] = useState<EmploymentContract | null>(null)
  const e = state.employees.find((x) => x.id === id)
  if (!e) {
    return (
      <Card>
        <EmptyState pageTitle title="Employee not found" description="This employee may have been removed." action={<BackButton fallback={paths.employees} />} />
      </Card>
    )
  }
  const manage = can('employee.manage')
  const seesPay = manage || can('payroll.manage')
  const tabs: { value: DetailTab; label: string; count?: number }[] = [
    { value: 'profile', label: 'Profile' },
    { value: 'contracts', label: 'Contracts', count: state.contracts.filter((c) => c.employeeId === e.id).length },
    { value: 'checklists', label: 'Checklists', count: state.checklists.filter((c) => c.employeeId === e.id && !c.completedAt).length || undefined },
    { value: 'time', label: 'Time' },
    { value: 'requests', label: 'Requests', count: state.hrRequests.filter((r) => r.employeeId === e.id).length },
    ...(can('payroll.manage') ? [{ value: 'payslips' as const, label: 'Payslips' }] : []),
    { value: 'team', label: 'Team', count: directReports(state, e.id).length || undefined },
  ]
  const asked = params.get('tab') as DetailTab | null
  const tab = tabs.some((t) => t.value === asked) ? asked! : 'profile'
  const activateBlocker = blockerFor(state, { type: 'employees/activate', id: e.id })
  const releaseBlocker = blockerFor(state, { type: 'employees/release', id: e.id })
  const contract = currentContract(state, e.id)
  const manager = state.employees.find((x) => x.id === e.managerId)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.employees} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{e.code}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">{e.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EmployeeStatusBadge status={e.status} />
            <span className="text-xs text-muted">{EMPLOYMENT_TYPE_LABEL[e.type]}</span>
          </div>
        </div>
        {manage && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {e.status !== 'left' && (
              <Button variant="outline" asChild>
                <Link to={paths.employeeEdit(e.id)}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            )}
            {e.status === 'active' && (
              <Button variant="outline" onClick={() => setOffboarding(true)}>
                <LogOut />
                Start offboarding
              </Button>
            )}
            {e.status === 'onboarding' && (
              <Button disabled={!!activateBlocker} title={activateBlocker ?? undefined} onClick={() => act({ type: 'employees/activate', id: e.id }, 'Employee activated', e.name)}>
                <UserCheck />
                Activate
              </Button>
            )}
            {e.status === 'offboarding' && (
              <Button variant="danger" disabled={!!releaseBlocker} title={releaseBlocker ?? undefined} onClick={() => setReleasing(true)}>
                <LogOut />
                Release
              </Button>
            )}
          </div>
        )}
      </div>

      <Card variant="ink" className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <Avatar name={e.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl font-bold tracking-tight">{positionName(state, e.positionId)}</div>
          <div className="truncate text-sm text-on-ink-muted">
            {deptName(state, e.departmentId)} · {branchName(state, e.branchId)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Status</div>
              <div className="font-semibold">{EMPLOYEE_STATUS_LABEL[e.status]}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Tenure</div>
              <div className="font-semibold">{tenure(e.joinedAt, e.leftAt && e.status === 'left' ? Date.parse(e.leftAt) : now)}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Joined</div>
              <div className="font-semibold">{fmtDate(e.joinedAt)}</div>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Reports to</div>
              {manager ? (
                <Link to={paths.employee(manager.id)} className="block truncate font-semibold hover:underline">
                  {manager.name}
                </Link>
              ) : (
                <div className="font-semibold">Nobody</div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {e.status === 'offboarding' && (
        <Banner tone="warning" title={`Last day ${e.leftAt ? fmtDate(e.leftAt) : 'not set'}`}>
          {e.leftReason}
          {releaseBlocker && <span className="mt-1 block">{releaseBlocker}</span>}
        </Banner>
      )}
      {e.status === 'onboarding' && activateBlocker && (
        <Banner tone="info" title="Onboarding in progress">
          {activateBlocker} Tick them off under Checklists to activate.
        </Banner>
      )}

      <PillTabs label="Employee sections" value={tab} onChange={(t) => set('tab', t === 'profile' ? null : t)} items={tabs} />

      {tab === 'profile' && <ProfileTab e={e} seesPay={seesPay} />}
      {tab === 'contracts' && <ContractsTab e={e} manage={manage} onRenew={setRenewing} current={contract} />}
      {tab === 'checklists' && <ChecklistsTab e={e} manage={manage} />}
      {tab === 'time' && <TimeTab e={e} now={now} />}
      {tab === 'requests' && <RequestsTab e={e} />}
      {tab === 'payslips' && <PayslipsTab e={e} />}
      {tab === 'team' && <TeamTab e={e} />}

      <Dialog open={offboarding} onOpenChange={setOffboarding} title={`Start offboarding ${e.name}`} description="The offboarding checklist opens. Release the employee once it is done.">
        {offboarding && <OffboardForm e={e} onDone={() => setOffboarding(false)} />}
      </Dialog>
      <Dialog open={releasing} onOpenChange={setReleasing} title={`Release ${e.name}?`} description="The employee leaves the books and their active contract ends. Their records stay.">
        <DialogFooter>
          <Button variant="outline" onClick={() => setReleasing(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (act({ type: 'employees/release', id: e.id }, 'Employee released', e.name)) setReleasing(false)
            }}
          >
            Release
          </Button>
        </DialogFooter>
      </Dialog>
      <RenewDialog contract={renewing} onClose={() => setRenewing(null)} />
    </div>
  )
}

function OffboardForm({ e, onDone }: { e: Employee; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ lastDay: ymd(Date.now() + 30 * DAY), reason: '' })
  const action = { type: 'employees/offboard', id: e.id, lastDay: f.lastDay, reason: f.reason.trim() } as const
  const blocker = f.lastDay ? blockerFor(state, action) : 'Pick the last day.'
  return (
    <form
      noValidate
      onSubmit={(ev) => {
        ev.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, 'Offboarding started', `${e.name} · last day ${fmtDay(f.lastDay)}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField label="Last day" required>
          <Input type="date" value={f.lastDay} onChange={(ev) => setF({ ...f, lastDay: ev.target.value })} />
        </FormField>
        <FormField label="Reason" required>
          <Textarea rows={3} value={f.reason} onChange={(ev) => setF({ ...f, reason: ev.target.value })} placeholder="Resigned, contract not renewed, retirement" />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Start offboarding</Button>
      </DialogFooter>
    </form>
  )
}

function ProfileTab({ e, seesPay }: { e: Employee; seesPay: boolean }) {
  const { state } = useAppState()
  const user = state.users.find((u) => u.id === e.userId)
  const shift = state.shifts.find((s) => s.id === e.shiftId)
  const section = state.sections.find((s) => s.id === e.sectionId)
  const mono = (v: string) => (v ? <span className="font-mono text-xs">{v}</span> : '–')
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Personal</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValue
            bare
            size="sm"
            items={[
              { label: 'Email', value: <span className="break-all">{e.email}</span> },
              { label: 'Phone', value: e.phone || '–' },
              { label: 'Gender', value: e.gender === 'female' ? 'Female' : 'Male' },
              { label: 'Birth date', value: e.birthDate ? fmtDay(e.birthDate) : '–' },
              { label: 'NIK', value: mono(e.nik) },
              { label: 'Console user', value: user ? `${user.name} · ${user.email}` : 'Not linked' },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Job</CardTitle>
        </CardHeader>
        <CardContent>
          <KeyValue
            bare
            size="sm"
            items={[
              { label: 'Department', value: deptName(state, e.departmentId) },
              { label: 'Section', value: section?.name ?? '–' },
              { label: 'Position', value: positionName(state, e.positionId) },
              { label: 'Branch', value: branchName(state, e.branchId) },
              { label: 'Shift', value: shift ? `${shift.name} · ${shift.start} to ${shift.end}` : '–' },
              { label: 'Annual leave', value: `${e.annualLeave} days a year` },
              { label: 'Left', value: e.leftAt ? `${fmtDate(e.leftAt)} · ${e.leftReason}` : '–', hidden: !e.leftAt },
            ]}
          />
        </CardContent>
      </Card>
      {seesPay && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Payroll</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-8 lg:grid-cols-2">
            <KeyValue
              bare
              size="sm"
              items={[
                { label: 'Base salary', value: <Money value={e.baseSalary} className="font-semibold" /> },
                { label: 'PTKP', value: e.ptkp },
                { label: 'NPWP', value: mono(e.npwp) },
                { label: 'BPJS TK', value: mono(e.bpjsTk) },
                { label: 'BPJS Kes', value: mono(e.bpjsKes) },
                { label: 'Bank', value: e.bankAccount || '–' },
              ]}
            />
            <KeyValue
              bare
              size="sm"
              items={
                e.allowances.length
                  ? e.allowances.map((a) => {
                      const c = state.payComponents.find((x) => x.id === a.componentId)
                      return { label: c?.name ?? 'Component', value: <Money value={c?.kind === 'deduction' ? -a.amount : a.amount} /> }
                    })
                  : [{ label: 'Fixed components', value: 'None' }]
              }
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ContractsTab({ e, manage, current, onRenew }: { e: Employee; manage: boolean; current: EmploymentContract | undefined; onRenew: (c: EmploymentContract) => void }) {
  const { state } = useAppState()
  const rows = state.contracts.filter((c) => c.employeeId === e.id).sort((a, b) => b.startsOn.localeCompare(a.startsOn))
  return (
    <Card>
      <CardHeader
        action={
          manage && current && e.status !== 'left' ? (
            <Button size="sm" onClick={() => onRenew(current)}>
              <FileSignature />
              Renew
            </Button>
          ) : undefined
        }
      >
        <CardTitle>Contract history</CardTitle>
        <p className="text-sm text-muted">{current ? `${current.code} is the current contract.` : 'No current contract.'}</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState compact icon={<FileSignature />} title="No contracts" description="Contracts appear here once one is added or renewed." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs font-semibold">{c.code}</div>
                  <div className="truncate">
                    {EMPLOYMENT_TYPE_LABEL[c.type]} · {fmtDay(c.startsOn)} to {c.endsOn ? fmtDay(c.endsOn) : 'open-ended'}
                  </div>
                  {c.note && <div className="truncate text-xs text-muted">{c.note}</div>}
                </div>
                <Money value={c.salary} className="font-semibold" />
                <ContractStatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ChecklistsTab({ e, manage }: { e: Employee; manage: boolean }) {
  const { state } = useAppState()
  const rows = state.checklists.filter((c) => c.employeeId === e.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  if (!rows.length) {
    return (
      <Card>
        <EmptyState compact title="No checklists" description="Onboarding starts a checklist for a new hire; offboarding starts another." />
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {rows.map((c) => (
        <ChecklistCard key={c.id} checklist={c} manage={manage} />
      ))}
    </div>
  )
}

function TimeTab({ e, now }: { e: Employee; now: number }) {
  const { state } = useAppState()
  const today = ymd(now)
  const month = today.slice(0, 7)
  const { counts, rate } = attendanceSummary(state, e.id, monthDates(month).filter((d) => d <= today), now)
  const leave = leaveBalance(state, e.id, Number(today.slice(0, 4)))
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Attendance rate" value={Math.round(rate * 100)} unit="%" tone="ink" hint={monthLabel(month)} />
        <StatCard label="Present" value={counts.present} hint={`${counts.late} late`} tone={counts.late ? 'warning' : 'default'} />
        <StatCard label="Absent" value={counts.absent} tone={counts.absent ? 'danger' : 'default'} />
        <StatCard label="On leave" value={counts.leave} hint={`${counts.holiday} holidays`} />
      </div>
      <Card>
        <CardHeader
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to={paths.attendanceEmployee(e.id)}>Open attendance</Link>
            </Button>
          }
        >
          <CardTitle>Annual leave {today.slice(0, 4)}</CardTitle>
          <p className="text-sm text-muted">
            {leave.left} of {leave.quota} days left
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ProgressBar value={leave.quota ? ((leave.used + leave.pending) / leave.quota) * 100 : 0} tone={leave.left < 0 ? 'danger' : 'ink'} />
          <KeyValue
            bare
            size="sm"
            items={[
              { label: 'Taken', value: `${leave.used} days` },
              { label: 'Waiting for approval', value: `${leave.pending} days` },
              { label: 'Left', value: `${leave.left} days` },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function RequestsTab({ e }: { e: Employee }) {
  const { state } = useAppState()
  const rows = state.hrRequests.filter((r) => r.employeeId === e.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const detail = (r: (typeof rows)[number]) =>
    r.leave ? `${r.leave.days} ${r.leave.days === 1 ? 'day' : 'days'} from ${fmtDay(r.leave.from)}` : r.overtime ? `${r.overtime.hours} hours on ${fmtDay(r.overtime.date)}` : r.loan ? fmtIdr(r.loan.amount) : ''
  return (
    <Card>
      <CardHeader>
        <CardTitle>Requests ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState compact title="No requests" description="Leave, overtime and loan requests show up here." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <Link to={paths.hrRequest(r.id)} className="font-mono text-xs font-semibold hover:text-accent">
                    {r.code}
                  </Link>
                  <div className="truncate">
                    {HR_REQUEST_KIND_LABEL[r.kind]} · {detail(r)}
                  </div>
                </div>
                <span className="text-xs text-muted">{fmtDate(r.createdAt)}</span>
                <RequestStatusBadge status={r.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function PayslipsTab({ e }: { e: Employee }) {
  const { state } = useAppState()
  const rows = state.payrollRuns.flatMap((run) => run.slips.filter((s) => s.employeeId === e.id).map((slip) => ({ run, slip }))).sort((a, b) => b.run.month.localeCompare(a.run.month))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Payslips ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState compact title="No payslips yet" description="A payslip appears once a payroll run includes this employee." />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map(({ run, slip }) => (
              <li key={run.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <Link to={paths.payslip(run.id, e.id)} className="font-semibold hover:text-accent">
                    {monthLabel(run.month)}
                  </Link>
                  <div className="font-mono text-xs text-muted">{run.code}</div>
                </div>
                <Badge variant={run.status === 'paid' ? 'success' : run.status === 'approved' ? 'info' : 'warning'}>{PAYROLL_STATUS_LABEL[run.status]}</Badge>
                <Money value={slip.net} className="w-32 text-right font-semibold" />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function TeamTab({ e }: { e: Employee }) {
  const { state } = useAppState()
  const reports = directReports(state, e.id)
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Reports to</CardTitle>
        </CardHeader>
        <CardContent>{e.managerId ? <PersonCell id={e.managerId} /> : <p className="text-sm text-muted">Nobody. {e.name} sits at the top of the org chart.</p>}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Direct reports ({reports.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {reports.length === 0 ? (
            <p className="text-sm text-muted">Nobody reports to {e.name}.</p>
          ) : (
            <ul className="space-y-3">
              {reports.map((r) => (
                <li key={r.id}>
                  <PersonCell id={r.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
