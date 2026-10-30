import { attendanceState, currentEmployees, currentStep, DAY, dayStart, directReports, fmtTime, holidayOn, shiftOn, ymd } from '@artha/fixtures'
import type { Employee } from '@artha/types'
import { Card, CardContent, CardHeader, CardTitle, Chip, ChipRow, cn, EmptyState, PageHeader } from '@artha/ui'
import { ChevronRight, UsersRound } from 'lucide-react'
import { Link } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { SearchBox } from '../../components/SearchBox'
import { useSetParam } from '../../lib/useSetParam'
import { useAppState, useNow } from '../../state/store'
import { AttendanceBadge, Avatar, RequestStatusBadge } from '../people/parts'
import { WithMe, positionOf, requestDetail, requestTitle } from './shared'

/** Monday to Sunday of the week holding `date`. */
const weekOf = (date: string) => {
  const monday = dayStart(date) - ((new Date(`${date}T12:00:00`).getDay() + 6) % 7) * DAY
  return Array.from({ length: 7 }, (_, i) => ymd(monday + i * DAY + 12 * 3_600_000))
}
const weekdayShort = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' })

export function MyTeamPage() {
  return <WithMe title="My team">{(me) => <Team me={me} />}</WithMe>
}

function Team({ me }: { me: Employee }) {
  const { state } = useAppState()
  const now = useNow()
  const { params, set, clear } = useSetParam()
  const today = ymd(now)
  const week = weekOf(today)
  const reports = directReports(state, me.id)
  const reportIds = new Set(reports.map((e) => e.id))
  const department = state.departments.find((d) => d.id === me.departmentId)?.name ?? 'My department'
  const colleagues = currentEmployees(state)
    .filter((e) => e.departmentId === me.departmentId || reportIds.has(e.id))
    .sort((a, b) => Number(b.id === me.id) - Number(a.id === me.id) || a.name.localeCompare(b.name))

  const q = params.get('q') ?? ''
  const who = reports.length && params.get('who') === 'reports' ? 'reports' : 'all'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = colleagues.filter((e) => terms.every((w) => `${e.name} ${positionOf(state, e)}`.toLowerCase().includes(w)))
  const rows = who === 'reports' ? searched.filter((e) => reportIds.has(e.id)) : searched
  const filters = [q, who === 'reports'].filter(Boolean).length

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader className="mb-0" title="My team" description={`${department}: who works when this week.${reports.length ? ' As a manager you also see your direct reports today and the requests they sent.' : ''}`} />

      {reports.length > 0 && <ManagerCards reports={reports} today={today} now={now} />}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>This week's shifts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search the team" placeholder="Name or position" />
            {reports.length > 0 && (
              <ChipRow>
                <Chip active={who === 'all'} count={searched.length} onClick={() => set('who', null)}>
                  Everyone
                </Chip>
                <Chip active={who === 'reports'} count={searched.filter((e) => reportIds.has(e.id)).length} onClick={() => set('who', 'reports')}>
                  My reports
                </Chip>
              </ChipRow>
            )}
          </div>
          {filters > 0 && (
            <p className="text-xs text-muted tabular-nums">
              {rows.length} of {colleagues.length} people.{' '}
              <button type="button" className="font-semibold text-foreground underline-offset-4 hover:underline" onClick={() => clear()}>
                Clear filters
              </button>
            </p>
          )}

          <div className="hidden grid-cols-[minmax(0,1fr)_repeat(7,3.5rem)] gap-1 text-center text-[11px] font-semibold text-muted lg:grid">
            <span />
            {week.map((d) => (
              <span key={d} className={cn(d === today && 'text-accent')}>
                {weekdayShort(d)} {Number(d.slice(8))}
              </span>
            ))}
          </div>
          <ul className="divide-y divide-border">
            {rows.map((e) => (
              <li key={e.id} className="grid grid-cols-1 gap-2 py-3 lg:grid-cols-[minmax(0,1fr)_repeat(7,3.5rem)] lg:items-center lg:gap-1">
                <span className="flex min-w-0 items-center gap-3">
                  <Avatar name={e.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">
                      {e.name}
                      {e.id === me.id && <span className="font-normal text-muted"> (you)</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">{positionOf(state, e)}</span>
                  </span>
                </span>
                <span className="grid grid-cols-7 gap-1 lg:contents">
                  {week.map((d) => {
                    const shift = shiftOn(state, e.id, d)
                    const holiday = holidayOn(state, d)
                    return (
                      <span
                        key={d}
                        title={shift ? `${shift.name}, ${shift.start} to ${shift.end}` : holiday ? holiday.name : 'Day off'}
                        className={cn(
                          'flex min-h-11 min-w-0 flex-col items-center justify-center rounded-xl text-[11px] leading-tight tabular-nums',
                          shift ? 'bg-surface-2 font-semibold' : 'bg-surface text-muted',
                          d === today && 'ring-2 ring-ink',
                        )}
                      >
                        <span className="text-[10px] font-normal text-muted lg:hidden">{weekdayShort(d).slice(0, 2)}</span>
                        {shift ? shift.start : 'Off'}
                      </span>
                    )
                  })}
                </span>
              </li>
            ))}
          </ul>
          {!rows.length && <EmptyState compact icon={<UsersRound />} title="No matching people" description="Change the search or clear the filters." />}
        </CardContent>
      </Card>
    </div>
  )
}

function ManagerCards({ reports, today, now }: { reports: Employee[]; today: string; now: number }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const ids = new Set(reports.map((e) => e.id))
  const pending = state.hrRequests.filter((r) => ids.has(r.employeeId) && r.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const nameOf = (id: string) => state.employees.find((e) => e.id === id)?.name ?? 'Unknown employee'

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>My reports today</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {reports.map((e) => {
              const record = state.attendance.find((a) => a.employeeId === e.id && a.date === today)
              return (
                <li key={e.id} className="flex min-h-14 items-center gap-3 py-2">
                  <Avatar name={e.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{e.name}</span>
                    <span className="block truncate text-xs text-muted tabular-nums">
                      {record?.checkIn ? `In ${fmtTime(record.checkIn)}${record.checkOut ? `, out ${fmtTime(record.checkOut)}` : ''}` : 'No check-in yet'}
                    </span>
                  </span>
                  <AttendanceBadge state={attendanceState(state, e.id, today, now)} />
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Their pending requests</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length ? (
            <ul className="divide-y divide-border">
              {pending.map((r) => {
                const step = currentStep(r)
                const body = (
                  <>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">
                        {nameOf(r.employeeId)} · {requestTitle(r)}
                      </span>
                      <span className="block truncate text-xs text-muted tabular-nums">{requestDetail(r)}</span>
                      {step && (
                        <span className={cn('block text-xs', step.approverId === user.id ? 'font-semibold text-accent' : 'text-muted')}>
                          {step.approverId === user.id ? 'Waiting for you' : `Waiting for ${step.label}`}
                        </span>
                      )}
                    </span>
                    <RequestStatusBadge status={r.status} />
                  </>
                )
                return (
                  <li key={r.id}>
                    {can('hr.view') ? (
                      <Link to={paths.hrRequest(r.id)} className="flex min-h-14 items-center gap-3 py-2 hover:text-accent">
                        {body}
                        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                      </Link>
                    ) : (
                      <div className="flex min-h-14 items-center gap-3 py-2">{body}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState compact title="Nothing pending" description="Leave, overtime and loan requests from your reports show up here." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
