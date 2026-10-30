import { currentEmployees, fmtDateTime, initials } from '@artha/fixtures'
import {
  ATTENDANCE_STATE_LABEL,
  EMPLOYEE_STATUS_LABEL,
  HR_REQUEST_STATUS_LABEL,
  type ApprovalStep,
  type AttendanceState,
  type Employee,
  type EmployeeStatus,
  type HrRequestStatus,
} from '@artha/types'
import { Badge, cn, NativeSelect, type BadgeVariant } from '@artha/ui'
import { CircleCheck, CircleDashed, CircleX } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import { useScoped } from '../../state/store'

/** Current employees by name; `filter` narrows, `includeId` keeps a past pick visible. */
export function EmployeeSelect({
  value,
  onChange,
  filter,
  placeholder = 'Pick an employee',
  ...props
}: Omit<ComponentProps<typeof NativeSelect>, 'value' | 'onChange' | 'filter'> & {
  value: string
  onChange: (id: string) => void
  filter?: (e: Employee) => boolean
  placeholder?: string
}) {
  const { state } = useScoped()
  const rows = currentEmployees(state)
    .filter((e) => e.id === value || !filter || filter(e))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {rows.map((e) => (
        <option key={e.id} value={e.id}>
          {e.name} · {e.code}
        </option>
      ))}
    </NativeSelect>
  )
}

export const Avatar = ({ name, size = 'sm' }: { name: string; size?: 'sm' | 'lg' }) => (
  <span
    aria-hidden
    className={cn('flex shrink-0 items-center justify-center rounded-full bg-ink font-bold text-on-ink', size === 'sm' ? 'size-8 text-[11px]' : 'size-12 text-sm')}
  >
    {initials(name)}
  </span>
)

/** Avatar, name linking to the employee, and the position underneath. */
export function PersonCell({ id, sub, link = true }: { id: string; sub?: string; link?: boolean }) {
  const { state } = useScoped()
  const e = state.employees.find((x) => x.id === id)
  if (!e) return <span className="text-muted">Unknown employee</span>
  const position = state.positions.find((p) => p.id === e.positionId)?.name
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={e.name} />
      <span className="min-w-0">
        {link ? (
          <Link to={paths.employee(e.id)} className="block truncate font-semibold hover:text-accent">
            {e.name}
          </Link>
        ) : (
          <span className="block truncate font-semibold">{e.name}</span>
        )}
        <span className="block truncate text-xs text-muted">{sub ?? position}</span>
      </span>
    </span>
  )
}

const EMPLOYEE: Record<EmployeeStatus, BadgeVariant> = { onboarding: 'info', active: 'success', offboarding: 'warning', left: 'muted' }
export const EmployeeStatusBadge = ({ status }: { status: EmployeeStatus }) => <Badge variant={EMPLOYEE[status]}>{EMPLOYEE_STATUS_LABEL[status]}</Badge>

const REQUEST: Record<HrRequestStatus, BadgeVariant> = { pending: 'warning', approved: 'success', rejected: 'danger', cancelled: 'muted' }
export const RequestStatusBadge = ({ status }: { status: HrRequestStatus }) => (
  <Badge variant={REQUEST[status]} dot={status === 'pending'}>
    {HR_REQUEST_STATUS_LABEL[status]}
  </Badge>
)

const ATTENDANCE: Record<AttendanceState, BadgeVariant> = { present: 'success', late: 'warning', absent: 'danger', leave: 'info', holiday: 'muted', off: 'muted', upcoming: 'outline' }
export const AttendanceBadge = ({ state }: { state: AttendanceState }) => <Badge variant={ATTENDANCE[state]}>{ATTENDANCE_STATE_LABEL[state]}</Badge>

/** The approval levels of a request, with who decided and when. */
export function ApprovalTrail({ steps }: { steps: ApprovalStep[] }) {
  const { state } = useScoped()
  const userName = (id: string | null) => state.users.find((u) => u.id === id)?.name
  return (
    <ol className="space-y-3">
      {steps.map((st, i) => {
        const Icon = st.decision === 'approved' ? CircleCheck : st.decision === 'rejected' ? CircleX : CircleDashed
        return (
          <li key={i} className="flex gap-3">
            <Icon className={cn('mt-0.5 size-5 shrink-0', st.decision === 'approved' ? 'text-success' : st.decision === 'rejected' ? 'text-danger' : 'text-silver')} aria-hidden />
            <div className="min-w-0 text-sm">
              <div className="font-semibold">
                {st.label}
                {st.approverId && st.decision === 'pending' && <span className="font-normal text-muted"> · {userName(st.approverId) ?? 'manager'}</span>}
              </div>
              <div className="text-xs text-muted">
                {st.decision === 'pending' ? 'Waiting' : `${st.decision === 'approved' ? 'Approved' : 'Rejected'} by ${userName(st.by) ?? 'someone'} · ${st.at ? fmtDateTime(st.at) : ''}`}
              </div>
              {st.note && <p className="mt-1 text-body">{st.note}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** Calendar cell colours per attendance state. */
export const DAY_TONE: Record<AttendanceState, string> = {
  present: 'bg-success-soft',
  late: 'bg-warning-soft',
  absent: 'bg-danger-soft',
  leave: 'bg-info-soft',
  holiday: 'bg-surface-2 text-muted',
  off: 'bg-surface text-muted',
  upcoming: 'bg-card ring-1 ring-border',
}
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const isMonth = (v: string | null): v is string => !!v && /^\d{4}-\d{2}$/.test(v)
/** 'YYYY-MM' moved by n months. */
export const addMonth = (month: string, n: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
