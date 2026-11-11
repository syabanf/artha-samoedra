import {
  attendanceState,
  attendanceSummary,
  blockerFor,
  buildCheckIn,
  countBy,
  currentEmployees,
  DAY,
  dayStart,
  distanceM,
  employeeOfUser,
  fmtDateLong,
  fmtDistance,
  fmtPercent,
  fmtTime,
  lateMinutes,
  monthDates,
  newId,
  nowIso,
  officeOf,
  shiftOn,
  ymd,
} from '@artha/fixtures'
import { ATTENDANCE_STATE_LABEL, type Attendance, type AttendanceState, type Employee, type GeoPoint, type Shift } from '@artha/types'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  cn,
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
  Textarea,
  type Column,
} from '@artha/ui'
import { CalendarCheck, CalendarClock, Camera, ChevronLeft, ChevronRight, CircleCheck, Clock, LogIn, LogOut, MapPin, Pencil, Plane, RefreshCw, Search, Upload, UserX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { SubTabs } from '../../components/SubTabs'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { addMonth, AttendanceBadge, DAY_TONE, EmployeeSelect, isMonth, PersonCell, WEEKDAYS } from './parts'
import { useSetParam } from '../../lib/useSetParam'

export const TIME_TABS = [
  { to: paths.attendance, label: 'Attendance' },
  { to: paths.roster, label: 'Roster' },
  { to: paths.shifts, label: 'Shifts' },
  { to: paths.holidays, label: 'Holidays' },
]

/** URL search params as filters: an empty value removes the key. */
/** The date `n` days from a YYYY-MM-DD date. */
export const shiftDate = (date: string, n: number) => ymd(dayStart(date) + n * DAY + 12 * 3_600_000)

const STATES: AttendanceState[] = ['present', 'late', 'absent', 'leave', 'upcoming', 'off', 'holiday']
const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
const hhmm = (iso: string | null) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '')
const atTime = (date: string, time: string) => (time ? new Date(`${date}T${time}:00`).toISOString() : null)
const shiftHours = (shift: Shift | null) => (shift ? `${shift.code} · ${shift.start} to ${shift.end}` : 'No shift')

interface Row {
  e: Employee
  record: Attendance | undefined
  state: AttendanceState
  shift: Shift | null
  late: number
}

// ---------------------------------------------------------------- today board

export function AttendancePage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const now = useNow()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const [checkingIn, setCheckingIn] = useState(false)
  const [correcting, setCorrecting] = useState<Row | null>(null)
  const today = ymd(now)
  const date = isDate(params.get('date')) ? params.get('date')! : today
  const q = params.get('q') ?? ''
  const show = (params.get('state') as AttendanceState | null) || null
  const dept = params.get('dept') ?? ''
  const manage = can('attendance.manage')
  const me = employeeOfUser(state, user.id)

  const all: Row[] = currentEmployees(state).map((e) => {
    const record = state.attendance.find((a) => a.employeeId === e.id && a.date === date)
    return { e, record, state: attendanceState(state, e.id, date, now), shift: shiftOn(state, e.id, date), late: record ? lateMinutes(state, record) : 0 }
  })
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = all.filter((r) => (!dept || r.e.departmentId === dept) && terms.every((w) => `${r.e.name} ${r.e.code}`.toLowerCase().includes(w)))
  const counts = countBy(searched, (r) => r.state)
  const rows = searched.filter((r) => !show || r.state === show)
  const filters = [q, show, dept].filter(Boolean).length
  const toggle = (s: AttendanceState) => set('state', show === s ? null : s)
  const canCheckOut = (r: Row) => date === today && !!r.record?.checkIn && !r.record.checkOut && (manage || r.e.id === me?.id)

  const columns: Column<Row>[] = [
    { id: 'person', header: 'Employee', sortValue: (r) => r.e.name, cell: (r) => <PersonCell id={r.e.id} sub={shiftHours(r.shift)} link={false} /> },
    {
      id: 'in',
      header: 'In',
      sortValue: (r) => r.record?.checkIn ?? null,
      cell: (r) => (
        <div className="text-sm tabular-nums">
          {r.record?.checkIn ? fmtTime(r.record.checkIn) : <span className="text-muted">–</span>}
          {r.late > 0 && <div className="text-xs font-semibold text-accent">{r.late} min late</div>}
        </div>
      ),
    },
    { id: 'out', header: 'Out', hideBelow: 'sm', sortValue: (r) => r.record?.checkOut ?? null, cell: (r) => <span className="text-sm tabular-nums">{r.record?.checkOut ? fmtTime(r.record.checkOut) : <span className="text-muted">–</span>}</span> },
    {
      id: 'distance',
      header: 'Distance',
      hideBelow: 'lg',
      sortValue: (r) => r.record?.distanceM ?? null,
      cell: (r) => <span className="text-xs text-muted tabular-nums">{r.record?.distanceM != null ? fmtDistance(r.record.distanceM) : '–'}</span>,
    },
    {
      id: 'photo',
      header: 'Selfie',
      hideBelow: 'md',
      cell: (r) => (r.record?.photo ? <img src={r.record.photo} alt={`Check-in selfie of ${r.e.name}`} className="size-9 rounded-xl object-cover" /> : <span className="text-xs text-muted">–</span>),
    },
    { id: 'state', header: 'State', hideBelow: 'sm', sortValue: (r) => STATES.indexOf(r.state), cell: (r) => <AttendanceBadge state={r.state} /> },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (r) => {
        const checkOut = r.record && { type: 'attendance/checkOut' as const, id: r.record.id, at: nowIso() }
        const blocker = checkOut ? blockerFor(state, checkOut) : null
        return (
          <div className="flex justify-end gap-1">
            {checkOut && canCheckOut(r) && (
              <Button variant="outline" size="sm" disabled={!!blocker} title={blocker ?? undefined} onClick={() => act(checkOut, 'Checked out', `${r.e.name} · ${fmtTime(checkOut.at)}`)}>
                <LogOut />
                <span className="hidden sm:inline">Check out</span>
              </Button>
            )}
            {manage && (
              <Button variant="ghost" size="icon-sm" aria-label={`Correct the record of ${r.e.name}`} onClick={() => setCorrecting(r)}>
                <Pencil />
              </Button>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Attendance"
        description={`${fmtDateLong(`${date}T12:00:00`)}. Check-ins carry a selfie and the distance from the office.`}
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input type="date" aria-label="Date" value={date} max={today} onChange={(e) => set('date', isDate(e.target.value) && e.target.value !== today ? e.target.value : null)} className="min-w-0 flex-1 sm:w-44 sm:flex-none" />
            {date === today && (manage || me) && (
              <Button onClick={() => setCheckingIn(true)}>
                <LogIn />
                Check in
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TIME_TABS} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-5">
        <StatCard label="Present" value={counts.present ?? 0} icon={<CircleCheck />} tone="success" active={show === 'present'} onClick={() => toggle('present')} />
        <StatCard label="Late" value={counts.late ?? 0} icon={<Clock />} tone={counts.late ? 'warning' : 'default'} active={show === 'late'} onClick={() => toggle('late')} />
        <StatCard label="Absent" value={counts.absent ?? 0} icon={<UserX />} tone={counts.absent ? 'danger' : 'default'} active={show === 'absent'} onClick={() => toggle('absent')} />
        <StatCard label="On leave" value={counts.leave ?? 0} icon={<Plane />} tone="info" active={show === 'leave'} onClick={() => toggle('leave')} />
        <StatCard label="Upcoming" value={counts.upcoming ?? 0} icon={<CalendarClock />} className="col-span-2 sm:col-span-1" active={show === 'upcoming'} onClick={() => toggle('upcoming')} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search employees"
          placeholder="Name or code"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
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
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('state', null)}>
            All
          </Chip>
          {STATES.map((s) => (
            <Chip key={s} active={show === s} count={counts[s] ?? 0} onClick={() => toggle(s)}>
              {ATTENDANCE_STATE_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {all.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear(['date'])}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.e.id}
          rowLabel={(r) => r.e.name}
          onRowClick={(r) => navigate(`${paths.attendanceEmployee(r.e.id)}?month=${date.slice(0, 7)}&day=${date}`)}
          initialSort={{ id: 'person', desc: false }}
          resetPageKey={`${date}|${q}|${show}|${dept}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching employees" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear(['date'])}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="Nobody on the books" description="Add employees to track their attendance." />
            )
          }
        />
      </div>

      <Dialog open={checkingIn} onOpenChange={setCheckingIn} title="Check in" description="Take a selfie and share your location. The time is the clock now.">
        {checkingIn && <CheckInForm employeeId={me?.id ?? ''} pickAny={manage} onDone={() => setCheckingIn(false)} />}
      </Dialog>
      <Dialog open={!!correcting} onOpenChange={(o) => !o && setCorrecting(null)} title={correcting ? `Correct ${correcting.e.name}` : 'Correct record'} description={fmtDateLong(`${date}T12:00:00`)}>
        {correcting && <CorrectionForm employeeId={correcting.e.id} date={date} record={correcting.record} onDone={() => setCorrecting(null)} />}
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------- check-in

/** Longest side at most 480 px, as JPEG at 0.7. */
const toJpeg = (source: CanvasImageSource, w: number, h: number) => {
  const scale = Math.min(1, 480 / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')?.drawImage(source, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.7)
}

function SelfieCapture({ photo, onPhoto }: { photo: string | null; onPhoto: (photo: string | null) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
    setLive(false)
  }
  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), [])
  useEffect(() => {
    if (live && video.current && stream.current) {
      video.current.srcObject = stream.current
      video.current.play().catch(() => setError('The camera opened but did not play. Upload a photo instead.'))
    }
  }, [live])

  const start = async () => {
    setError(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot open the camera. Upload a photo instead.')
      return
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      setLive(true)
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      setError(denied ? 'Camera access is blocked. Allow it in the browser, or upload a photo instead.' : 'No camera could start. Upload a photo instead.')
    }
  }
  const capture = () => {
    const v = video.current
    if (!v?.videoWidth) return
    onPhoto(toJpeg(v, v.videoWidth, v.videoHeight))
    stop()
  }
  const upload = (f: File | undefined) => {
    if (!f) return
    const url = URL.createObjectURL(f)
    const img = new Image()
    img.onload = () => {
      onPhoto(toJpeg(img, img.naturalWidth, img.naturalHeight))
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      setError('That file is not a photo this browser can read.')
      URL.revokeObjectURL(url)
    }
    img.src = url
  }

  return (
    <div className="space-y-2">
      <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-2xl bg-surface-2">
        {live ? (
          <video ref={video} muted playsInline className="size-full -scale-x-100 object-cover" />
        ) : photo ? (
          <img src={photo} alt="Your check-in selfie" className="size-full object-cover" />
        ) : (
          <Camera className="size-8 text-silver" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {live ? (
          <>
            <Button type="button" onClick={capture}>
              <Camera />
              Take photo
            </Button>
            <Button type="button" variant="outline" onClick={stop}>
              Close camera
            </Button>
          </>
        ) : (
          <Button type="button" variant="outline" onClick={start}>
            <Camera />
            {photo ? 'Retake' : 'Open camera'}
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => file.current?.click()}>
          <Upload />
          Upload a photo
        </Button>
        <input ref={file} type="file" accept="image/*" capture="user" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => upload(e.target.files?.[0])} />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}

type Fix = { status: 'asking' } | { status: 'ok'; point: GeoPoint } | { status: 'error'; message: string }

const GEO_ERROR: Record<number, string> = {
  1: 'Location access is blocked. Allow it in the browser settings, then try again.',
  2: 'Your position is not available right now. Move near a window and try again.',
  3: 'Finding your position took too long. Try again.',
}

function useLocationFix() {
  const [fix, setFix] = useState<Fix>(() => (navigator.geolocation ? { status: 'asking' } : { status: 'error', message: 'This browser cannot share its location.' }))
  const locate = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setFix({ status: 'ok', point: { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: Math.round(p.coords.accuracy) } }),
      (err) => setFix({ status: 'error', message: GEO_ERROR[err.code] ?? 'Your position could not be found.' }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
    )
  // Ask once when the dialog opens.
  useEffect(locate, [])
  return {
    fix,
    retry: () => {
      setFix({ status: 'asking' })
      locate()
    },
  }
}

function CheckInForm({ employeeId, pickAny, onDone }: { employeeId: string; pickAny: boolean; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [picked, setPicked] = useState(employeeId)
  const [photo, setPhoto] = useState<string | null>(null)
  const { fix, retry } = useLocationFix()
  const location = fix.status === 'ok' ? fix.point : null
  const office = picked ? officeOf(state, picked) : undefined
  const radius = state.hrSettings.checkInRadiusM
  const blocker = picked ? blockerFor(state, { type: 'attendance/checkIn', attendance: buildCheckIn(state, picked, nowIso(), photo, location) }) : 'Pick the employee who checks in.'

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        const attendance = buildCheckIn(state, picked, nowIso(), photo, location)
        if (act({ type: 'attendance/checkIn', attendance }, 'Checked in', `${state.employees.find((x) => x.id === picked)?.name} · ${fmtTime(attendance.checkIn!)}`)) onDone()
      }}
    >
      <div className="space-y-4">
        {pickAny ? (
          <FormField label="Employee" required>
            <EmployeeSelect value={picked} onChange={setPicked} />
          </FormField>
        ) : (
          <div className="rounded-2xl bg-surface-2 p-3">
            <PersonCell id={picked} link={false} />
          </div>
        )}
        <FormField label="Selfie" hint="The camera opens only when you ask. Uploading a photo works too.">
          <SelfieCapture photo={photo} onPhoto={setPhoto} />
        </FormField>
        <div className="flex items-start gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            {fix.status === 'asking' && <span className="text-muted">Finding your location…</span>}
            {fix.status === 'ok' && (
              <>
                <div className="font-semibold">{office ? `${fmtDistance(distanceM(fix.point, office))} from the office` : 'Location found'}</div>
                <div className="text-xs text-muted">
                  Accurate to about {fmtDistance(fix.point.accuracyM)}
                  {radius ? `. Check-ins must be within ${fmtDistance(radius)}.` : '.'}
                </div>
              </>
            )}
            {fix.status === 'error' && (
              <>
                <div className="font-semibold text-danger">{fix.message}</div>
                <div className="text-xs text-muted">{radius ? `Check-ins need a location within ${fmtDistance(radius)} of the office.` : 'You can still check in. The record shows no distance.'}</div>
              </>
            )}
          </div>
          {fix.status === 'error' && (
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Try location again" onClick={retry}>
              <RefreshCw />
            </Button>
          )}
        </div>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={fix.status === 'asking'} title={fix.status === 'asking' ? 'Waiting for the location.' : undefined}>
          <LogIn />
          Check in now
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- correction

function CorrectionForm({ employeeId, date, record, onDone }: { employeeId: string; date: string; record: Attendance | undefined; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ checkIn: hhmm(record?.checkIn ?? null), checkOut: hhmm(record?.checkOut ?? null), note: '' })
  const attendance: Attendance = {
    ...(record ?? { id: newId('att'), employeeId, date, photo: null, location: null, distanceM: null }),
    checkIn: atTime(date, f.checkIn),
    checkOut: atTime(date, f.checkOut),
    note: f.note.trim(),
  }
  const blocker = !f.checkIn && f.checkOut ? 'Enter the check-in time too.' : blockerFor(state, { type: 'attendance/correct', attendance })
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'attendance/correct', attendance }, 'Record corrected', state.employees.find((x) => x.id === employeeId)?.name)) onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Check-in">
          <Input type="time" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} />
        </FormField>
        <FormField label="Check-out">
          <Input type="time" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} />
        </FormField>
        <FormField label="Why it changes" required className="col-span-2">
          <Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} rows={2} placeholder="Forgot to check out, confirmed by the manager" />
        </FormField>
      </div>
      {record?.note && <p className="mt-3 text-xs text-muted">Earlier note: {record.note}</p>}
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save correction</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- employee month

export function AttendanceEmployeePage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const { params, set } = useSetParam()
  const [correcting, setCorrecting] = useState(false)
  const e = state.employees.find((x) => x.id === id)
  if (!e) {
    return (
      <Card>
        <EmptyState pageTitle title="Employee not found" description="This employee may have been removed." action={<BackButton fallback={paths.attendance} />} />
      </Card>
    )
  }
  const today = ymd(now)
  const month = isMonth(params.get('month')) ? params.get('month')! : today.slice(0, 7)
  const dates = monthDates(month)
  const day = isDate(params.get('day')) && params.get('day')!.startsWith(month) ? params.get('day')! : dates.includes(today) ? today : dates[0]
  const { counts, rate } = attendanceSummary(state, e.id, dates, now)
  const record = state.attendance.find((a) => a.employeeId === e.id && a.date === day)
  const dayState = attendanceState(state, e.id, day, now)
  const shift = shiftOn(state, e.id, day)
  const late = record ? lateMinutes(state, record) : 0
  const lead = (new Date(`${dates[0]}T12:00:00`).getDay() + 6) % 7
  const monthLabel = new Date(`${month}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const goMonth = (n: number) => {
    const next = addMonth(month, n)
    set('month', next === today.slice(0, 7) ? null : next)
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={`${paths.attendance}?date=${day}`} />
      <PageHeader
        className="mb-0"
        eyebrow="Attendance"
        title={e.name}
        description={`${state.positions.find((p) => p.id === e.positionId)?.name ?? 'No position'} · ${state.shifts.find((s) => s.id === e.shiftId)?.name ?? 'No shift'}`}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => goMonth(-1)}>
              <ChevronLeft />
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold">{monthLabel}</span>
            <Button variant="outline" size="icon" aria-label="Next month" disabled={month >= today.slice(0, 7)} title={month >= today.slice(0, 7) ? 'This is the current month.' : undefined} onClick={() => goMonth(1)}>
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
        <StatCard label="On leave" value={counts.leave} icon={<Plane />} tone="info" className="col-span-2 sm:col-span-1" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{monthLabel}</CardTitle>
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
                const st = attendanceState(state, e.id, d, now)
                const rec = state.attendance.find((a) => a.employeeId === e.id && a.date === d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => set('day', d)}
                    aria-pressed={d === day}
                    aria-label={`${fmtDateLong(`${d}T12:00:00`)}: ${ATTENDANCE_STATE_LABEL[st]}`}
                    className={cn(
                      'flex aspect-square min-w-0 flex-col items-start justify-between rounded-xl p-1 text-left text-xs transition-shadow sm:p-1.5',
                      DAY_TONE[st],
                      d === day && 'ring-2 ring-ink',
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
          <CardHeader
            action={
              can('attendance.manage') && day <= today ? (
                <Button variant="outline" size="sm" onClick={() => setCorrecting(true)}>
                  <Pencil />
                  Correct
                </Button>
              ) : undefined
            }
          >
            <CardTitle>{fmtDateLong(`${day}T12:00:00`)}</CardTitle>
            <div className="mt-1">
              <AttendanceBadge state={dayState} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <KeyValue
              bare
              size="sm"
              items={[
                { label: 'Shift', value: shiftHours(shift) },
                { label: 'Check-in', value: record?.checkIn ? `${fmtTime(record.checkIn)}${late ? ` · ${late} min late` : ''}` : '–' },
                { label: 'Check-out', value: record?.checkOut ? fmtTime(record.checkOut) : '–' },
                { label: 'Distance', value: record?.distanceM != null ? `${fmtDistance(record.distanceM)} from the office` : '–' },
                ...(record?.note ? [{ label: 'Note', value: record.note }] : []),
              ]}
            />
            {record?.photo && <img src={record.photo} alt={`Check-in selfie of ${e.name}`} className="w-full max-w-60 rounded-2xl object-cover" />}
          </CardContent>
        </Card>
      </div>

      <Dialog open={correcting} onOpenChange={setCorrecting} title={`Correct ${e.name}`} description={fmtDateLong(`${day}T12:00:00`)}>
        {correcting && <CorrectionForm key={day} employeeId={e.id} date={day} record={record} onDone={() => setCorrecting(false)} />}
      </Dialog>
    </div>
  )
}
