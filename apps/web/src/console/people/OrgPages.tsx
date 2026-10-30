import { blockerFor, countBy, expiringContracts, newId, orgTree, type AppAction, type OrgNode } from '@artha/fixtures'
import {
  CHECKLIST_KIND_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  type ChecklistKind,
  type ChecklistTemplate,
  type Department,
  type EmploymentContract,
  type EmploymentType,
  type HrSettings,
  type Position,
  type Section,
} from '@artha/types'
import {
  Banner,
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
  type Column,
} from '@artha/ui'
import { ArrowDown, ArrowUp, FileSignature, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { SubTabs } from '../../components/SubTabs'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from '../finance/parts'
import { ChecklistCard, ContractStatusBadge, CONTRACT_STATUS_LABEL, deptName, digits, fmtDay, OWNER_LABEL, PEOPLE_TABS, RenewDialog } from './EmployeePages'
import { useSetParam } from '../../lib/useSetParam'
import { Avatar, EmployeeSelect, PersonCell } from './parts'

/** Asks before a remove; the button explains why it is refused. */
function RemoveButton({ label, action, toast }: { label: string; action: AppAction; toast: string }) {
  const { state } = useAppState()
  const act = useAct()
  const [open, setOpen] = useState(false)
  const blocker = blockerFor(state, action)
  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${label}`} disabled={!!blocker} title={blocker ?? `Remove ${label}`} onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={setOpen} title={`Remove ${label}?`} description="It no longer shows in pickers or on the org pages.">
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (act(action, toast, label)) setOpen(false)
            }}
          >
            Remove
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  )
}

const EditButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${label}`} onClick={onClick}>
    <Pencil />
  </Button>
)

/** Form shell: submit checks the blocker, shows it after the first try, and closes on success. */
function EntityForm({ blocker, onSubmit, onDone, submit, children }: { blocker: string | null; onSubmit: () => boolean; onDone: () => void; submit: string; children: ReactNode }) {
  const [tried, setTried] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && onSubmit()) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{submit}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- organisation

type Editing = { kind: 'department'; row: Department | null } | { kind: 'section'; row: Section | null } | { kind: 'position'; row: Position | null } | null

export function OrgPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<Editing>(null)
  const manage = can('employee.manage')
  const q = params.get('q') ?? ''
  const dept = params.get('dept') ?? ''
  const headcount = countBy(
    state.employees.filter((e) => e.status !== 'left'),
    (e) => e.departmentId,
  )
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const match = (r: { name: string; departmentId: string }) => (!dept || r.departmentId === dept) && terms.every((w) => `${r.name} ${deptName(state, r.departmentId)}`.toLowerCase().includes(w))
  const sections = state.sections.filter(match)
  const positions = state.positions.filter(match).sort((a, b) => b.grade - a.grade || a.name.localeCompare(b.name))
  const filters = [q, dept].filter(Boolean).length
  const held = countBy(
    state.employees.filter((e) => e.status !== 'left'),
    (e) => e.positionId,
  )
  const close = () => setEditing(null)

  return (
    <div>
      <PageHeader title="Organisation" description="Departments, their sections and positions, and who reports to whom." />
      <SubTabs items={PEOPLE_TABS} />
      <div className="space-y-4">
        <Card>
          <CardHeader
            action={
              manage && (
                <Button size="sm" onClick={() => setEditing({ kind: 'department', row: null })}>
                  <Plus />
                  Department
                </Button>
              )
            }
          >
            <CardTitle>Departments ({state.departments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {state.departments.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                  <div className="min-w-0 flex-1 basis-48">
                    <div className="font-mono text-xs text-muted">{d.code}</div>
                    <Link to={`${paths.employees}?dept=${d.id}`} className="block truncate font-semibold hover:text-accent">
                      {d.name}
                    </Link>
                    <div className="truncate text-xs text-muted">{d.parentId ? `Under ${deptName(state, d.parentId)}` : 'Top level'}</div>
                  </div>
                  <div className="min-w-0 flex-1 basis-48">{d.headId ? <PersonCell id={d.headId} sub="Head" /> : <span className="text-xs text-muted">No head</span>}</div>
                  <span className="w-24 text-xs text-muted tabular-nums">{headcount[d.id] ?? 0} people</span>
                  {manage && (
                    <span className="flex">
                      <EditButton label={d.name} onClick={() => setEditing({ kind: 'department', row: d })} />
                      <RemoveButton label={d.name} action={{ type: 'departments/remove', id: d.id }} toast="Department removed" />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search sections and positions"
            placeholder="Section or position"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
          <NativeSelect aria-label="Filter by department" value={dept} onChange={(e) => set('dept', e.target.value || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none">
            <option value="">All departments</option>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
          {filters > 0 && (
            <span className="text-xs text-muted tabular-nums">
              {sections.length + positions.length} of {state.sections.length + state.positions.length}
              <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
                Clear {filters} {filters === 1 ? 'filter' : 'filters'}
              </Button>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              action={
                manage && (
                  <Button size="sm" variant="outline" onClick={() => setEditing({ kind: 'section', row: null })}>
                    <Plus />
                    Section
                  </Button>
                )
              }
            >
              <CardTitle>Sections ({sections.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {sections.length === 0 ? (
                <EmptyState compact title={filters ? 'No matching sections' : 'No sections yet'} description={filters ? 'Change the search or clear the filters.' : 'Split a department into teams.'} />
              ) : (
                <ul className="divide-y divide-border">
                  {sections.map((x) => (
                    <li key={x.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{x.name}</div>
                        <div className="truncate text-xs text-muted">{deptName(state, x.departmentId)}</div>
                      </div>
                      {manage && (
                        <span className="flex">
                          <EditButton label={x.name} onClick={() => setEditing({ kind: 'section', row: x })} />
                          <RemoveButton label={x.name} action={{ type: 'sections/remove', id: x.id }} toast="Section removed" />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader
              action={
                manage && (
                  <Button size="sm" variant="outline" onClick={() => setEditing({ kind: 'position', row: null })}>
                    <Plus />
                    Position
                  </Button>
                )
              }
            >
              <CardTitle>Positions ({positions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {positions.length === 0 ? (
                <EmptyState compact title={filters ? 'No matching positions' : 'No positions yet'} description={filters ? 'Change the search or clear the filters.' : 'Add the jobs people hold.'} />
              ) : (
                <ul className="divide-y divide-border">
                  {positions.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold">{p.name}</div>
                        <div className="truncate text-xs text-muted">
                          {deptName(state, p.departmentId)} · grade {p.grade} · {held[p.id] ?? 0} held
                        </div>
                      </div>
                      {manage && (
                        <span className="flex">
                          <EditButton label={p.name} onClick={() => setEditing({ kind: 'position', row: p })} />
                          <RemoveButton label={p.name} action={{ type: 'positions/remove', id: p.id }} toast="Position removed" />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <OrgChart />
      </div>

      <Dialog open={editing?.kind === 'department'} onOpenChange={(o) => !o && close()} title={editing?.row ? `Edit ${editing.row.name}` : 'New department'}>
        {editing?.kind === 'department' && <DepartmentForm editing={editing.row} onDone={close} />}
      </Dialog>
      <Dialog open={editing?.kind === 'section'} onOpenChange={(o) => !o && close()} title={editing?.row ? `Edit ${editing.row.name}` : 'New section'}>
        {editing?.kind === 'section' && <SectionForm editing={editing.row} dept={dept} onDone={close} />}
      </Dialog>
      <Dialog open={editing?.kind === 'position'} onOpenChange={(o) => !o && close()} title={editing?.row ? `Edit ${editing.row.name}` : 'New position'} description="Grades run from 1 (staff) to 6 (director).">
        {editing?.kind === 'position' && <PositionForm editing={editing.row} dept={dept} onDone={close} />}
      </Dialog>
    </div>
  )
}

const DeptSelect = ({ value, onChange, exclude, placeholder = 'Pick a department' }: { value: string; onChange: (id: string) => void; exclude?: string; placeholder?: string }) => {
  const { state } = useAppState()
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {state.departments
        .filter((d) => d.id !== exclude)
        .map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
    </NativeSelect>
  )
}

function DepartmentForm({ editing, onDone }: { editing: Department | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [f, setF] = useState({ code: editing?.code ?? '', name: editing?.name ?? '', parentId: editing?.parentId ?? '', headId: editing?.headId ?? '' })
  const department: Department = { id: editing?.id ?? newId('dep'), code: f.code.trim().toUpperCase(), name: f.name.trim(), parentId: f.parentId || null, headId: f.headId || null }
  const action = { type: 'departments/upsert', department } as const
  return (
    <EntityForm blocker={blockerFor(state, action)} onSubmit={() => act(action, editing ? 'Department saved' : 'Department added', department.name)} onDone={onDone} submit={editing ? 'Save department' : 'Add department'}>
      <FormField label="Code" required hint="Short, such as OPS">
        <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} inputClassName="font-mono uppercase" />
      </FormField>
      <FormField label="Name" required>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </FormField>
      <FormField label="Parent department">
        <DeptSelect value={f.parentId} onChange={(parentId) => setF({ ...f, parentId })} exclude={editing?.id} placeholder="Top level" />
      </FormField>
      <FormField label="Head">
        <EmployeeSelect value={f.headId} onChange={(headId) => setF({ ...f, headId })} placeholder="No head yet" />
      </FormField>
    </EntityForm>
  )
}

function SectionForm({ editing, dept, onDone }: { editing: Section | null; dept: string; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [f, setF] = useState({ departmentId: editing?.departmentId ?? dept, name: editing?.name ?? '' })
  const section: Section = { id: editing?.id ?? newId('sec'), departmentId: f.departmentId, name: f.name.trim() }
  const action = { type: 'sections/upsert', section } as const
  const blocker = f.departmentId ? blockerFor(state, action) : 'Pick a department.'
  return (
    <EntityForm blocker={blocker} onSubmit={() => act(action, editing ? 'Section saved' : 'Section added', section.name)} onDone={onDone} submit={editing ? 'Save section' : 'Add section'}>
      <FormField label="Department" required>
        <DeptSelect value={f.departmentId} onChange={(departmentId) => setF({ ...f, departmentId })} />
      </FormField>
      <FormField label="Name" required>
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </FormField>
    </EntityForm>
  )
}

function PositionForm({ editing, dept, onDone }: { editing: Position | null; dept: string; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [f, setF] = useState({ departmentId: editing?.departmentId ?? dept, name: editing?.name ?? '', grade: String(editing?.grade ?? 1) })
  const position: Position = { id: editing?.id ?? newId('pos'), departmentId: f.departmentId, name: f.name.trim(), grade: Number(f.grade) }
  const action = { type: 'positions/upsert', position } as const
  const blocker = f.departmentId ? blockerFor(state, action) : 'Pick a department.'
  const holders = editing ? state.employees.filter((e) => e.positionId === editing.id && e.status !== 'left').length : 0
  return (
    <EntityForm blocker={blocker} onSubmit={() => act(action, editing ? 'Position saved' : 'Position added', position.name)} onDone={onDone} submit={editing ? 'Save position' : 'Add position'}>
      <FormField label="Department" required hint={holders ? `${holders} people hold it, so the department stays.` : undefined}>
        {holders ? <Input value={deptName(state, f.departmentId)} disabled /> : <DeptSelect value={f.departmentId} onChange={(departmentId) => setF({ ...f, departmentId })} />}
      </FormField>
      <FormField label="Grade" required>
        <NativeSelect value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })}>
          {[1, 2, 3, 4, 5, 6].map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Name" required className="sm:col-span-2">
        <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </FormField>
    </EntityForm>
  )
}

// ---------------------------------------------------------------- org chart

function OrgPerson({ node }: { node: OrgNode }) {
  const { state } = useAppState()
  const e = node.employee
  return (
    <Link to={paths.employee(e.id)} className="flex min-w-0 items-center gap-2.5 rounded-2xl bg-surface-2 p-2.5 text-left transition-colors hover:bg-surface lg:w-44">
      <Avatar name={e.name} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{e.name}</span>
        <span className="block truncate text-xs text-muted">{state.positions.find((p) => p.id === e.positionId)?.name}</span>
      </span>
    </Link>
  )
}

/** Phones: an indented list. */
const OrgListNode = ({ node }: { node: OrgNode }) => (
  <li>
    <OrgPerson node={node} />
    {node.reports.length > 0 && (
      <ul className="mt-2 ml-4 space-y-2 border-l border-border pl-3">
        {node.reports.map((r) => (
          <OrgListNode key={r.employee.id} node={r} />
        ))}
      </ul>
    )}
  </li>
)

/** From lg: a horizontal tree with connector lines; a manager whose reports lead nobody stacks them in a column to save width. */
const OrgTreeNode = ({ node, root }: { node: OrgNode; root?: boolean }) => (
  <li
    className={
      root
        ? 'flex flex-col items-center'
        : 'relative flex flex-col items-center px-1 pt-5 before:absolute before:inset-x-0 before:top-0 before:border-t before:border-border first:before:left-1/2 last:before:right-1/2 only:before:hidden after:absolute after:top-0 after:left-1/2 after:h-5 after:border-l after:border-border'
    }
  >
    <OrgPerson node={node} />
    {node.reports.length > 0 && (
      <>
        <span className="h-5 w-px bg-border" aria-hidden />
        {node.reports.every((r) => !r.reports.length) ? (
          <ul className="space-y-2">
            {node.reports.map((r) => (
              <li key={r.employee.id}>
                <OrgPerson node={r} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex">
            {node.reports.map((r) => (
              <OrgTreeNode key={r.employee.id} node={r} />
            ))}
          </ul>
        )}
      </>
    )}
  </li>
)

function OrgChart() {
  const { state } = useAppState()
  const roots = orgTree(state)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Org chart</CardTitle>
        <p className="text-sm text-muted">Reporting lines of everyone still on the books. Set the manager on the employee.</p>
      </CardHeader>
      <CardContent>
        {roots.length === 0 ? (
          <EmptyState compact title="No employees yet" />
        ) : (
          <>
            <ul className="space-y-2 lg:hidden">
              {roots.map((n) => (
                <OrgListNode key={n.employee.id} node={n} />
              ))}
            </ul>
            <div className="hidden overflow-x-auto pb-2 lg:block">
              <ul className="mx-auto flex w-max gap-8">
                {roots.map((n) => (
                  <OrgTreeNode key={n.employee.id} node={n} root />
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- contracts

const CONTRACT_STATUSES: EmploymentContract['status'][] = ['active', 'ended', 'expired']
const TYPES = Object.keys(EMPLOYMENT_TYPE_LABEL) as EmploymentType[]

export function ContractsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const [renewing, setRenewing] = useState<EmploymentContract | null>(null)
  const manage = can('employee.manage')
  const seesPay = manage || can('payroll.manage')
  const q = params.get('q') ?? ''
  const status = (params.get('status') as EmploymentContract['status'] | null) || null
  const type = (params.get('type') as EmploymentType | null) || null
  const ending = Number(params.get('ending')) || 0
  const alertDays = state.hrSettings.contractAlertDays
  const soon = expiringContracts(state, now, alertDays)
  const endingIds = new Set(ending ? expiringContracts(state, now, ending).map((c) => c.id) : [])
  const employee = (id: string) => state.employees.find((e) => e.id === id)
  const canRenew = (c: EmploymentContract) => manage && c.status !== 'ended' && employee(c.employeeId)?.status !== 'left'

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.contracts.filter((c) => (!ending || endingIds.has(c.id)) && terms.every((w) => `${c.code} ${employee(c.employeeId)?.name ?? ''} ${c.note}`.toLowerCase().includes(w)))
  const statusCounts = countBy(searched.filter((c) => !type || c.type === type), (c) => c.status)
  const typeCounts = countBy(searched.filter((c) => !status || c.status === status), (c) => c.type)
  const rows = searched.filter((c) => (!status || c.status === status) && (!type || c.type === type))
  const filters = [q, status, type, ending].filter(Boolean).length
  const endingOptions = [...new Set([30, 60, 90, alertDays])].sort((a, b) => a - b)

  const columns: Column<EmploymentContract>[] = [
    {
      id: 'code',
      header: 'Contract',
      sortValue: (c) => c.code,
      cell: (c) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{c.code}</div>
          <div className="truncate text-sm">{employee(c.employeeId)?.name ?? 'Unknown employee'}</div>
          <div className="mt-1.5 sm:hidden">
            <ContractStatusBadge status={c.status} />
          </div>
        </div>
      ),
    },
    { id: 'type', header: 'Type', hideBelow: 'lg', cell: (c) => <span className="text-xs text-muted">{EMPLOYMENT_TYPE_LABEL[c.type]}</span> },
    { id: 'starts', header: 'Starts', hideBelow: 'md', sortValue: (c) => c.startsOn, cell: (c) => <span className="text-xs text-muted">{fmtDay(c.startsOn)}</span> },
    {
      id: 'ends',
      header: 'Ends',
      sortValue: (c) => c.endsOn ?? '9999',
      cell: (c) => <span className={`text-xs ${soon.some((x) => x.id === c.id) ? 'font-semibold text-accent' : 'text-muted'}`}>{c.endsOn ? fmtDay(c.endsOn) : 'Open-ended'}</span>,
    },
    ...(seesPay ? [{ id: 'salary', header: 'Salary', align: 'right' as const, hideBelow: 'lg' as const, sortValue: (c: EmploymentContract) => c.salary, cell: (c: EmploymentContract) => <Money value={c.salary} /> }] : []),
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (c) => c.status, cell: (c) => <ContractStatusBadge status={c.status} /> },
    ...(manage
      ? [
          {
            id: 'renew',
            header: <span className="sr-only">Renew</span>,
            cell: (c: EmploymentContract) =>
              canRenew(c) ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Renew ${c.code}`}
                  title="Renew"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRenewing(c)
                  }}
                >
                  <FileSignature />
                </Button>
              ) : null,
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Contracts"
        description="Employment contracts, permanent and fixed term. Jessy marks fixed-term contracts expired after their end date."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search contracts"
            placeholder="Code, employee or note"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
        }
      />
      <SubTabs items={PEOPLE_TABS} />
      {soon.length > 0 && (
        <Banner tone="warning" title={`${soon.length} ${soon.length === 1 ? 'contract ends' : 'contracts end'} within ${alertDays} days`} className="mb-4">
          <ul className="mt-2 space-y-2">
            {soon.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1">
                  <Link to={`${paths.employee(c.employeeId)}?tab=contracts`} className="font-semibold hover:underline">
                    {employee(c.employeeId)?.name ?? 'Unknown employee'}
                  </Link>
                  <span className="text-muted">
                    {' '}
                    · <span className="whitespace-nowrap font-mono text-xs">{c.code}</span> ends <span className="whitespace-nowrap">{fmtDay(c.endsOn!)}</span>
                  </span>
                </span>
                {canRenew(c) && (
                  <Button size="sm" variant="outline" onClick={() => setRenewing(c)}>
                    <FileSignature />
                    Renew
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Banner>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!status} count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} onClick={() => set('status', null)}>
            All
          </Chip>
          {CONTRACT_STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {CONTRACT_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect aria-label="Filter by end date" value={String(ending || '')} onChange={(e) => set('ending', e.target.value || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none">
          <option value="">Any end date</option>
          {endingOptions.map((d) => (
            <option key={d} value={d}>
              Ending within {d} days
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          {TYPES.map((t) => (
            <Chip key={t} active={type === t} count={typeCounts[t] ?? 0} onClick={() => set('type', type === t ? null : t)}>
              {EMPLOYMENT_TYPE_LABEL[t]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.contracts.length}
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
          getRowKey={(c) => c.id}
          rowLabel={(c) => c.code}
          onRowClick={(c) => navigate(`${paths.employee(c.employeeId)}?tab=contracts`)}
          initialSort={{ id: 'ends', desc: false }}
          resetPageKey={`${q}|${status}|${type}|${ending}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching contracts" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No contracts yet" description="Add a first contract when you add an employee." />
            )
          }
        />
      </div>
      <RenewDialog contract={renewing} onClose={() => setRenewing(null)} />
    </div>
  )
}

// ---------------------------------------------------------------- checklists

const KINDS: ChecklistKind[] = ['onboarding', 'offboarding']
const OWNERS = Object.keys(OWNER_LABEL) as ChecklistTemplate['items'][number]['ownerRole'][]

export function ChecklistsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const { params, set } = useSetParam()
  const manage = can('employee.manage')
  const kind = (params.get('kind') as ChecklistKind | null) || null
  const open = state.checklists.filter((c) => !c.completedAt)
  const counts = countBy(open, (c) => c.kind)
  const rows = open.filter((c) => !kind || c.kind === kind)

  return (
    <div>
      <PageHeader title="Checklists" description="Onboarding and offboarding steps per person. Activating or releasing an employee waits for their checklist." />
      <SubTabs items={PEOPLE_TABS} />
      <div className="space-y-4">
        <ChipRow>
          <Chip active={!kind} count={open.length} onClick={() => set('kind', null)}>
            All open
          </Chip>
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} count={counts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
              {CHECKLIST_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        {rows.length === 0 ? (
          <Card>
            <EmptyState compact title="No open checklists" description={kind ? 'Clear the filter to see the other kind.' : 'Adding an employee or starting offboarding opens one.'} />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {rows.map((c) => (
              <ChecklistCard key={c.id} checklist={c} manage={manage} showEmployee />
            ))}
          </div>
        )}
        <h2 className="pt-2 text-lg font-bold tracking-tight">Templates</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {KINDS.map((k) => {
            const t = state.checklistTemplates.find((x) => x.kind === k)
            return <TemplateCard key={`${k}-${t ? JSON.stringify(t.items) : ''}`} kind={k} template={t ?? null} manage={manage} />
          })}
        </div>
      </div>
    </div>
  )
}

function TemplateCard({ kind, template, manage }: { kind: ChecklistKind; template: ChecklistTemplate | null; manage: boolean }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [items, setItems] = useState(template?.items ?? [])
  const next: ChecklistTemplate = { id: template?.id ?? `tpl-${kind}`, kind, items: items.map((i) => ({ ...i, label: i.label.trim() })) }
  const action = { type: 'checklistTemplates/update', template: next } as const
  const blocker = blockerFor(state, action)
  const dirty = JSON.stringify(next.items) !== JSON.stringify(template?.items ?? [])
  const patch = (i: number, p: Partial<(typeof items)[number]>) => setItems(items.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, by: number) => {
    const out = [...items]
    ;[out[i], out[i + by]] = [out[i + by], out[i]]
    setItems(out)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{CHECKLIST_KIND_LABEL[kind]} template</CardTitle>
        <p className="text-sm text-muted">New {kind} checklists copy these items. Open checklists keep theirs.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {!manage ? (
          <ol className="list-decimal space-y-1.5 pl-5 text-sm">
            {items.map((i) => (
              <li key={i.id}>
                {i.label} <span className="text-xs text-muted">· {OWNER_LABEL[i.ownerRole]}</span>
              </li>
            ))}
          </ol>
        ) : (
          <>
            <ul className="space-y-2">
              {items.map((i, n) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-surface-2 p-2">
                  <Input aria-label={`Item ${n + 1}`} value={i.label} onChange={(e) => patch(n, { label: e.target.value })} className="min-w-0 flex-1 basis-48" />
                  <NativeSelect aria-label={`Owner of item ${n + 1}`} value={i.ownerRole} onChange={(e) => patch(n, { ownerRole: e.target.value as typeof i.ownerRole })} className="w-32">
                    {OWNERS.map((o) => (
                      <option key={o} value={o}>
                        {OWNER_LABEL[o]}
                      </option>
                    ))}
                  </NativeSelect>
                  <span className="flex">
                    <Button variant="ghost" size="icon-sm" aria-label={`Move item ${n + 1} up`} disabled={n === 0} onClick={() => move(n, -1)}>
                      <ArrowUp />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Move item ${n + 1} down`} disabled={n === items.length - 1} onClick={() => move(n, 1)}>
                      <ArrowDown />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove item ${n + 1}`} onClick={() => setItems(items.filter((_, j) => j !== n))}>
                      <Trash2 />
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setItems([...items, { id: newId('cti'), label: '', ownerRole: 'hr' }])}>
                <Plus />
                Add item
              </Button>
              <Button
                size="sm"
                disabled={!dirty}
                title={dirty ? undefined : 'No changes to save.'}
                onClick={() => {
                  setTried(true)
                  if (!blocker) act(action, 'Template saved', `${CHECKLIST_KIND_LABEL[kind]} · ${next.items.length} items`)
                }}
              >
                Save template
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------- HR settings

export function HrSettingsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  if (!can('employee.manage')) return <NoAccess description="HR settings need the employee permission." />
  return <HrSettingsForm key={JSON.stringify(state.hrSettings)} settings={state.hrSettings} />
}

const coord = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? null : Number(v))

function HrSettingsForm({ settings }: { settings: HrSettings }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    lateGraceMinutes: String(settings.lateGraceMinutes),
    checkInRadiusM: String(settings.checkInRadiusM),
    contractAlertDays: String(settings.contractAlertDays),
    offices: Object.fromEntries(state.branches.map((b) => {
      const o = settings.offices.find((x) => x.branchId === b.id)
      return [b.id, { lat: o ? String(o.lat) : '', lng: o ? String(o.lng) : '' }]
    })) as Record<string, { lat: string; lng: string }>,
  })
  const at = (branchId: string) => f.offices[branchId] ?? { lat: '', lng: '' }
  const offices = state.branches.flatMap((b) => {
    const lat = coord(at(b.id).lat)
    const lng = coord(at(b.id).lng)
    return lat === null || lng === null ? [] : [{ branchId: b.id, lat, lng }]
  })
  const patch: Partial<HrSettings> = {
    lateGraceMinutes: Number(f.lateGraceMinutes),
    checkInRadiusM: Number(f.checkInRadiusM),
    contractAlertDays: Number(f.contractAlertDays),
    offices,
  }
  const half = state.branches.find((b) => (coord(at(b.id).lat) === null) !== (coord(at(b.id).lng) === null))
  const blocker =
    [f.lateGraceMinutes, f.checkInRadiusM, f.contractAlertDays].some((v) => v === '') ? 'Fill in every number.'
    : patch.contractAlertDays! < 1 ? 'Alert at least one day before a contract ends.'
    : half ? `Enter both latitude and longitude for ${half.name}.`
    : offices.some((o) => Math.abs(o.lat) > 90 || Math.abs(o.lng) > 180) ? 'Latitude runs from -90 to 90 and longitude from -180 to 180.'
    : blockerFor(state, { type: 'hrSettings/update', patch })
  const setOffice = (branchId: string, key: 'lat' | 'lng', value: string) => setF({ ...f, offices: { ...f.offices, [branchId]: { ...at(branchId), [key]: value } } })
  const num = (key: 'lateGraceMinutes' | 'checkInRadiusM' | 'contractAlertDays') => (e: { target: { value: string } }) => setF({ ...f, [key]: digits(e.target.value) })

  return (
    <div>
      <PageHeader title="HR settings" description="Rules for check-in and contract alerts. Changes apply from the next check-in." />
      <SubTabs items={PEOPLE_TABS} />
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (!blocker) act({ type: 'hrSettings/update', patch }, 'HR settings saved')
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Attendance and contracts</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Late grace" hint="Minutes after the shift starts before a check-in counts as late">
              <Input inputMode="numeric" value={f.lateGraceMinutes} onChange={num('lateGraceMinutes')} />
            </FormField>
            <FormField label="Check-in radius" hint={Number(f.checkInRadiusM) ? 'Metres from the office' : 'Metres from the office; 0 turns the check off'}>
              <Input inputMode="numeric" value={f.checkInRadiusM} onChange={num('checkInRadiusM')} />
            </FormField>
            <FormField label="Contract alert" hint="Days before a fixed-term contract ends">
              <Input inputMode="numeric" value={f.contractAlertDays} onChange={num('contractAlertDays')} />
            </FormField>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Office locations</CardTitle>
            <p className="text-sm text-muted">Check-ins measure the distance to the office of the employee's branch. Leave a branch empty to skip the check there.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {state.branches.map((b) => (
                <li key={b.id} className="grid grid-cols-2 items-end gap-3 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_10rem]">
                  <div className="col-span-2 min-w-0 sm:col-span-1 sm:self-center">
                    <div className="truncate font-semibold">{b.name}</div>
                    <div className="truncate text-xs text-muted">{b.city}</div>
                  </div>
                  <FormField label="Latitude">
                    <Input inputMode="decimal" value={at(b.id).lat} onChange={(e) => setOffice(b.id, 'lat', e.target.value)} inputClassName="font-mono" />
                  </FormField>
                  <FormField label="Longitude">
                    <Input inputMode="decimal" value={at(b.id).lng} onChange={(e) => setOffice(b.id, 'lng', e.target.value)} inputClassName="font-mono" />
                  </FormField>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
        <div className="flex justify-end">
          <Button type="submit">Save settings</Button>
        </div>
      </form>
    </div>
  )
}
