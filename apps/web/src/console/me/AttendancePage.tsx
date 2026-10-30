import { attendanceState, attendanceSummary, fmtDateLong, fmtDistance, fmtPercent, fmtTime, holidayOn, lateMinutes, monthDates, monthLabel, shiftOn, ymd } from '@artha/fixtures'
import { ATTENDANCE_STATE_LABEL, type AttendanceState, type Employee } from '@artha/types'
import { Button, Card, CardContent, CardHeader, CardTitle, cn, KeyValue, PageHeader, StatCard } from '@artha/ui'
import { CalendarCheck, ChevronLeft, ChevronRight, CircleCheck, Clock, Plane, UserX } from 'lucide-react'
import { useAppState, useNow } from '../../state/store'
import { useSetParam } from '../../lib/useSetParam'
import { AttendanceBadge } from '../people/parts'
import { addMonth, DAY_TONE, WEEKDAYS } from '../people/parts'
import { WithMe, shiftHours } from './shared'

const STATES: AttendanceState[] = ['present', 'late', 'absent', 'leave', 'upcoming', 'off', 'holiday']
const isMonth = (v: string | null): v is string => !!v && /^\d{4}-\d{2}$/.test(v)
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export function MyAttendancePage() {
  return <WithMe title="My attendance">{(me) => <Attendance me={me} />}</WithMe>
}

function Attendance({ me }: { me: Employee }) {
  const { state } = useAppState()
  const now = useNow()
  const { params, set } = useSetParam()
  const today = ymd(now)
  const thisMonth = today.slice(0, 7)
  const month = isMonth(params.get('month')) && params.get('month')! <= thisMonth ? params.get('month')! : thisMonth
  const dates = monthDates(month)
  const asked = params.get('day')
  const picked = isDate(asked) && asked.startsWith(month) ? asked : dates.includes(today) ? today : dates[0]
  const { counts, rate } = attendanceSummary(state, me.id, dates, now)
  const record = state.attendance.find((a) => a.employeeId === me.id && a.date === picked)
  const shift = shiftOn(state, me.id, picked)
  const holiday = holidayOn(state, picked)
  const late = record ? lateMinutes(state, record) : 0
  const lead = (new Date(`${dates[0]}T12:00:00`).getDay() + 6) % 7
  const goMonth = (n: number) => {
    const next = addMonth(month, n)
    set('month', next === thisMonth ? null : next)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader
        className="mb-0"
        title="My attendance"
        description="Your days this month, coloured by what happened. Tap a day for its times."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-lg" aria-label="Previous month" onClick={() => goMonth(-1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold">{monthLabel(month)}</span>
            <Button
              variant="outline"
              size="icon-lg"
              aria-label="Next month"
              disabled={month >= thisMonth}
              title={month >= thisMonth ? 'This is the current month.' : undefined}
              onClick={() => goMonth(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Attendance rate" value={fmtPercent(rate * 100, 0)} icon={<CalendarCheck />} tone="ink" className="col-span-2 lg:col-span-1" />
        <StatCard label="Present" value={counts.present} icon={<CircleCheck />} tone="success" />
        <StatCard label="Late" value={counts.late} icon={<Clock />} tone={counts.late ? 'warning' : 'default'} />
        <StatCard label="Absent" value={counts.absent} icon={<UserX />} tone={counts.absent ? 'danger' : 'default'} />
        <StatCard label="On leave" value={counts.leave} icon={<Plane />} tone="info" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{monthLabel(month)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted sm:gap-1.5">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1 sm:gap-1.5">
              {Array.from({ length: lead }, (_, i) => (
                <div key={`lead-${i}`} />
              ))}
              {dates.map((d) => {
                const st = attendanceState(state, me.id, d, now)
                const rec = state.attendance.find((a) => a.employeeId === me.id && a.date === d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('day', d)}
                    aria-pressed={d === picked}
                    aria-label={`${fmtDateLong(`${d}T12:00:00`)}: ${ATTENDANCE_STATE_LABEL[st]}`}
                    className={cn(
                      'flex aspect-square min-w-0 flex-col items-start justify-between rounded-xl p-1 text-left text-xs transition-shadow sm:p-1.5',
                      DAY_TONE[st],
                      d === picked && 'ring-2 ring-ink',
                      d === today && 'font-bold',
                    )}
                  >
                    <span className="tabular-nums">{Number(d.slice(8))}</span>
                    {rec?.checkIn && <span className="hidden w-full truncate text-[10px] tabular-nums sm:block">{fmtTime(rec.checkIn)}</span>}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
              {STATES.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={cn('size-3 rounded', DAY_TONE[s])} aria-hidden />
                  {ATTENDANCE_STATE_LABEL[s]} {counts[s] ? `(${counts[s]})` : ''}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{fmtDateLong(`${picked}T12:00:00`)}</CardTitle>
            <div className="mt-1">
              <AttendanceBadge state={attendanceState(state, me.id, picked, now)} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <KeyValue
              bare
              size="sm"
              items={[
                { label: 'Shift', value: holiday && !shift ? holiday.name : shiftHours(shift) },
                { label: 'Check-in', value: record?.checkIn ? `${fmtTime(record.checkIn)}${late ? ` · ${late} min late` : ''}` : '–' },
                { label: 'Check-out', value: record?.checkOut ? fmtTime(record.checkOut) : '–' },
                { label: 'Distance', value: record?.distanceM != null ? `${fmtDistance(record.distanceM)} from the office` : '–' },
                ...(record?.note ? [{ label: 'HR note', value: record.note }] : []),
              ]}
            />
            {record?.photo && <img src={record.photo} alt="Your check-in selfie" className="w-full max-w-60 rounded-2xl object-cover" />}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
