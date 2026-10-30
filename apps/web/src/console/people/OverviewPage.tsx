import {
  announcementsFor,
  attendanceState,
  checklistProgress,
  currentEmployees,
  requestsAwaiting,
  DAY,
  expiringContracts,
  fmtAgo,
  fmtDate,
  headcountBy,
  hiredCount,
  lateMinutes,
  turnover,
  ymd,
} from '@artha/fixtures'
import { LEAVE_TYPE_LABEL } from '@artha/types'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn, CountBadge, EmptyState, Kicker, StatCard } from '@artha/ui'
import { Briefcase, CalendarCheck, ClipboardList, FileClock, Inbox } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { useNow, useScoped } from '../../state/store'
import { AttendanceBadge, Avatar, RequestStatusBadge } from './parts'

const ROW = 'flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40'

export interface Bar {
  label: string
  value: number
  /** Shown instead of the raw value. */
  display?: string
  to?: string
}

/** Horizontal bars on a grey track; the largest gets the accent, the rest stay grey. */
export function BarList({ rows, label }: { rows: Bar[]; label: string }) {
  const peak = Math.max(1, ...rows.map((r) => r.value))
  const top = rows.findIndex((r) => r.value === peak)
  return (
    <ol className="space-y-3" aria-label={label}>
      {rows.map((r, i) => {
        const name = r.to ? (
          <Link to={r.to} className="truncate hover:text-accent">
            {r.label}
          </Link>
        ) : (
          <span className="truncate">{r.label}</span>
        )
        return (
          <li key={r.label} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              {name}
              <span className="shrink-0 font-semibold tabular-nums">{r.display ?? r.value}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
              <div className={cn('h-full rounded-full', i === top ? 'bg-accent' : 'bg-chart-muted')} style={{ width: `${(r.value / peak) * 100}%` }} />
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function PeopleOverviewPage() {
  const { state } = useScoped()
  const { can } = useAuth()
  const user = useUser()
  const now = useNow()
  const navigate = useNavigate()
  const today = ymd(now)
  const year = new Date(now).getFullYear()

  const people = currentEmployees(state)
  const flow = turnover(state, year)

  const waiting = requestsAwaiting(state, user.id, can('request.approve'))

  const todayRows = people.map((e) => ({ e, st: attendanceState(state, e.id, today, now) }))
  const inToday = todayRows.filter((r) => r.st === 'present' || r.st === 'late').length
  const expected = inToday + todayRows.filter((r) => r.st === 'absent' || r.st === 'upcoming').length
  const notIn = todayRows.filter((r) => r.st === 'absent' || r.st === 'late').sort((a, b) => a.st.localeCompare(b.st))
  const record = (id: string) => state.attendance.find((a) => a.employeeId === id && a.date === today)

  const ending = expiringContracts(state, now, 30)
  const onboarding = state.checklists.filter((c) => c.kind === 'onboarding' && !checklistProgress(c).complete)
  const openings = state.jobOpenings.filter((o) => o.status === 'open')
  const seats = openings.reduce((n, o) => n + Math.max(0, o.headcount - hiredCount(state, o.id)), 0)

  const departments = headcountBy(state, 'departmentId').map((d) => ({ label: state.departments.find((x) => x.id === d.value)?.name ?? 'No department', value: d.count }))

  const horizon = ymd(now + 14 * DAY)
  const leave = state.hrRequests
    .filter((r) => r.leave && (r.status === 'approved' || r.status === 'pending') && r.leave.from <= horizon && r.leave.to >= today)
    .sort((a, b) => a.leave!.from.localeCompare(b.leave!.from))
  const month = today.slice(5, 7)
  const birthdays = people.filter((e) => e.birthDate.slice(5, 7) === month).sort((a, b) => a.birthDate.slice(8).localeCompare(b.birthDate.slice(8)))
  const news = announcementsFor(state, user.id).slice(0, 4)
  const name = (id: string) => state.employees.find((e) => e.id === id)?.name ?? 'Unknown employee'

  const viewAll = (to: string) => (
    <Button variant="outline" size="sm" asChild>
      <Link to={to}>View all</Link>
    </Button>
  )

  return (
    <div className="space-y-4">
      <h1 className="sr-only">People overview</h1>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <Kicker className="text-on-ink-muted">Headcount</Kicker>
          <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">{people.length}</span>
            <span className="pb-1 text-sm font-semibold text-on-ink-muted">current employees</span>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: `Joined in ${year}`, value: flow.joined },
              { label: `Left in ${year}`, value: flow.left },
              { label: 'Turnover', value: `${flow.rate.toFixed(1)}%` },
            ].map((x) => (
              <div key={x.label} className="min-w-0 rounded-2xl bg-white/10 p-3">
                <div className="truncate text-xs text-on-ink-muted">{x.label}</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{x.value}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="onInk" size="sm" asChild>
              <Link to={paths.employees}>All employees</Link>
            </Button>
            <Button variant="onInk" size="sm" asChild>
              <Link to={paths.org}>Organisation</Link>
            </Button>
            <Button variant="onInk" size="sm" asChild>
              <Link to={`${paths.hrReports}?report=turnover`}>Turnover report</Link>
            </Button>
          </div>
        </Card>

        {waiting.length ? (
          <Card variant="accent" className="flex flex-col p-6">
            <div className="text-[13px] font-semibold text-white/80">Waiting for you</div>
            <div className="mt-2 text-4xl font-bold leading-none tracking-tight tabular-nums sm:text-5xl">{waiting.length}</div>
            <div className="mt-3 text-sm text-white/80">
              {waiting.length === 1 ? 'request needs' : 'requests need'} your decision. The oldest is {waiting[0].code} from {name(waiting[0].employeeId)}.
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Button variant="onInk" size="sm" asChild>
                <Link to={paths.hrRequest(waiting[0].id)}>Open {waiting[0].code}</Link>
              </Button>
              <Button variant="onInk" size="sm" asChild>
                <Link to={paths.hrRequests}>
                  All requests <CountBadge count={waiting.length} onInk className="ring-0" />
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <EmptyState
              compact
              icon={<Inbox />}
              title="Nothing waiting for you"
              description="Leave, overtime and loan requests you can decide show up here."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to={paths.hrRequests}>All requests</Link>
                </Button>
              }
            />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Attendance today"
          value={expected ? Math.round((inToday / expected) * 100) : 100}
          unit="%"
          icon={<CalendarCheck />}
          hint={`${inToday} of ${expected} checked in`}
          onClick={() => navigate(paths.attendance)}
        />
        <StatCard
          label="Contracts ending soon"
          value={ending.length}
          icon={<FileClock />}
          tone={ending.length ? 'warning' : 'default'}
          hint="In the next 30 days"
          onClick={() => navigate(paths.contracts)}
        />
        <StatCard label="Open onboarding" value={onboarding.length} icon={<ClipboardList />} hint="Checklists not finished" onClick={() => navigate(paths.checklists)} />
        <StatCard
          label="Open positions"
          value={seats}
          icon={<Briefcase />}
          hint={`Across ${openings.length} opening${openings.length === 1 ? '' : 's'}`}
          onClick={() => navigate(paths.openings)}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader action={viewAll(paths.org)}>
            <CardTitle>Headcount by department</CardTitle>
          </CardHeader>
          <CardContent>
            {departments.length ? <BarList rows={departments} label="Current employees per department" /> : <EmptyState compact title="No employees yet" />}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader action={viewAll(paths.attendance)}>
            <CardTitle className="flex items-center gap-2">
              Absent or late today <CountBadge count={notIn.length} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {notIn.length === 0 && <EmptyState compact title="Everyone is on time" description="Absences and late check-ins for today show up here." />}
            {notIn.slice(0, 6).map(({ e, st }) => {
              const r = record(e.id)
              return (
                <Link key={e.id} to={paths.attendanceEmployee(e.id)} className={ROW}>
                  <Avatar name={e.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.name}</span>
                    <span className="block text-xs text-muted">{st === 'late' && r ? `${lateMinutes(state, r)} minutes late` : 'No check-in'}</span>
                  </span>
                  <AttendanceBadge state={st} />
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="min-w-0">
          <CardHeader action={viewAll(paths.hrRequests)}>
            <CardTitle>Leave in the next 14 days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {leave.length === 0 && <EmptyState compact title="Nobody is on leave" description="Approved and pending leave shows up here." />}
            {leave.slice(0, 5).map((r) => (
              <Link key={r.id} to={paths.hrRequest(r.id)} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{name(r.employeeId)}</span>
                  <span className="block truncate text-xs text-muted">
                    {LEAVE_TYPE_LABEL[r.leave!.type]} · {fmtDate(r.leave!.from)}
                    {r.leave!.to !== r.leave!.from && ` to ${fmtDate(r.leave!.to)}`}
                  </span>
                </span>
                {r.status === 'pending' && <RequestStatusBadge status={r.status} />}
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader action={viewAll(paths.employees)}>
            <CardTitle>Birthdays this month</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {birthdays.length === 0 && <EmptyState compact title="No birthdays this month" />}
            {birthdays.slice(0, 5).map((e) => {
              const isToday = e.birthDate.slice(5) === today.slice(5)
              return (
                <Link key={e.id} to={paths.employee(e.id)} className={ROW}>
                  <Avatar name={e.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.name}</span>
                    <span className="block text-xs text-muted">{new Date(`${today.slice(0, 4)}${e.birthDate.slice(4)}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</span>
                  </span>
                  {isToday && <Badge variant="accent">Today</Badge>}
                </Link>
              )
            })}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader action={viewAll(paths.announcements)}>
            <CardTitle>Latest announcements</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {news.length === 0 && <EmptyState compact title="No announcements yet" />}
            {news.map((a) => (
              <Link key={a.id} to={paths.announcements} className={ROW}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{a.title}</span>
                  <span className="block text-xs text-muted">{fmtAgo(a.publishedAt)}</span>
                </span>
                {a.pinned ? <Badge variant="ink">Pinned</Badge> : !a.readBy.includes(user.id) && <Badge variant="info">New</Badge>}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
