import {
  announcementsFor,
  blockerFor,
  buildCheckIn,
  fmtDateLong,
  fmtTime,
  holidayOn,
  leaveBalance,
  lateMinutes,
  nowIso,
  officeOf,
  shiftOn,
  ymd, reviewsOwed } from '@artha/fixtures'
import type { Employee, GeoPoint } from '@artha/types'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, StatCard } from '@artha/ui'
import { Camera, ChevronRight, ClipboardList, LogIn, LogOut, MapPin, Megaphone, Plane, Star, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link } from 'react-router'
import { useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { RequestStatusBadge } from '../people/parts'
import { WithMe, day, plural, positionOf, requestDetail, requestTitle, shiftHours } from './shared'

const greeting = (hour: number) => (hour < 11 ? 'Good morning' : hour < 15 ? 'Good afternoon' : hour < 19 ? 'Good evening' : 'Good night')

/** Shrinks a photo to 480 px on the long side and returns it as a JPEG data URL. */
const readSelfie = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, 480 / Math.max(img.naturalWidth, img.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.naturalWidth * scale)
      canvas.height = Math.round(img.naturalHeight * scale)
      canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file is not a photo this browser can read.'))
    }
    img.src = url
  })

export function MyTodayPage() {
  return <WithMe title="Today">{(me) => <Today me={me} />}</WithMe>
}

function Today({ me }: { me: Employee }) {
  const { state } = useAppState()
  const user = useUser()
  const now = useNow()
  const today = ymd(now)
  const year = Number(today.slice(0, 4))
  const balance = leaveBalance(state, me.id, year)
  const pending = state.hrRequests.filter((r) => r.employeeId === me.id && r.status === 'pending').sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const unread = announcementsFor(state, user.id).filter((a) => !a.readBy.includes(user.id))
  const owed = reviewsOwed(state, me.id)
  const firstName = me.name.split(' ')[0]

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting(new Date(now).getHours())}, {firstName}
          <span className="text-accent">.</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          {fmtDateLong(new Date(now).toISOString())} · {positionOf(state, me)}
        </p>
      </div>

      <ShiftCard me={me} today={today} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Leave left" value={balance.left} unit="days" hint={`Annual leave in ${year}`} icon={<Plane />} tone={balance.left <= 2 ? 'danger' : 'info'} />
        <StatCard label="Quota" value={balance.quota} unit="days" />
        <StatCard label="Taken" value={balance.used} unit="days" />
        <StatCard label="Waiting" value={balance.pending} unit="days" />
      </div>

      <Card>
        <CardHeader
          action={
            <Button variant="soft" size="sm" asChild>
              <Link to={`${paths.meRequestNew}?kind=leave`}>Ask for leave</Link>
            </Button>
          }
        >
          <CardTitle>My pending requests</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length ? (
            <ul className="divide-y divide-border">
              {pending.map((r) => (
                <li key={r.id}>
                  <Link to={`${paths.meRequests}?open=${r.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:text-accent">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{requestTitle(r)}</span>
                      <span className="block truncate text-xs text-muted">{requestDetail(r)}</span>
                    </span>
                    <RequestStatusBadge status={r.status} />
                    <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact icon={<ClipboardList />} title="Nothing waiting" description="Leave, overtime and loan requests you send show up here until they are decided." />
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Unread news</CardTitle>
          </CardHeader>
          <CardContent>
            {unread.length ? (
              <ul className="divide-y divide-border">
                {unread.map((a) => (
                  <li key={a.id}>
                    <Link to={`${paths.meNews}?open=${a.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:text-accent">
                      <span aria-hidden className="size-2 shrink-0 rounded-full bg-accent" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{a.title}</span>
                        <span className="block text-xs text-muted">{day(ymd(a.publishedAt))}</span>
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState compact icon={<Megaphone />} title="All caught up" description="You have read every announcement." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reviews I owe</CardTitle>
          </CardHeader>
          <CardContent>
            {owed.length ? (
              <ul className="divide-y divide-border">
                {owed.map((r) => {
                  const cycle = state.reviewCycles.find((c) => c.id === r.cycleId)
                  const subject = state.employees.find((e) => e.id === r.subjectId)?.name ?? 'Unknown employee'
                  return (
                    <li key={r.id}>
                      <Link to={`${paths.mePerformance}?tab=reviews&review=${r.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:text-accent">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{r.relation === 'self' ? 'Self review' : subject}</span>
                          <span className="block truncate text-xs text-muted">
                            {cycle?.name} · due {cycle ? day(ymd(cycle.dueAt)) : ''}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <EmptyState compact icon={<Star />} title="No reviews to write" description="Reviews you owe in an open cycle show up here." />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function ShiftCard({ me, today }: { me: Employee; today: string }) {
  const { state } = useAppState()
  const act = useAct()
  const file = useRef<HTMLInputElement>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [photoError, setPhotoError] = useState('')
  const shift = shiftOn(state, me.id, today)
  const holiday = holidayOn(state, today)
  const record = state.attendance.find((a) => a.employeeId === me.id && a.date === today)
  const office = officeOf(state, me.id)
  // The demo has no GPS: the check-in stands at the employee's office.
  const location: GeoPoint | null = office ? { lat: office.lat, lng: office.lng, accuracyM: 15 } : null
  const late = record?.checkIn ? lateMinutes(state, record) : 0

  const checkIn = () => {
    const attendance = buildCheckIn(state, me.id, nowIso(), photo, location)
    if (act({ type: 'attendance/checkIn', attendance }, 'Checked in', fmtTime(attendance.checkIn!))) setPhoto(null)
  }
  const checkInBlocker = record?.checkIn ? null : blockerFor(state, { type: 'attendance/checkIn', attendance: buildCheckIn(state, me.id, nowIso(), photo, location) })
  const checkOutBlocker = record ? blockerFor(state, { type: 'attendance/checkOut', id: record.id, at: nowIso() }) : null
  const checkOut = (id: string) => {
    const at = nowIso()
    act({ type: 'attendance/checkOut', id, at }, 'Checked out', fmtTime(at))
  }

  return (
    <Card variant="ink" className="p-5 sm:p-6">
      <div className="text-xs font-semibold uppercase tracking-wider text-on-ink-muted">Today's shift</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{holiday && !shift ? holiday.name : shiftHours(shift)}</div>
      {shift && shift.breakMinutes > 0 && <div className="mt-1 text-sm text-on-ink-muted">{shift.breakMinutes} minute break</div>}

      <div className="mt-5 space-y-3">
        {!record?.checkIn && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {photo ? (
                <span className="relative">
                  <img src={photo} alt="Your check-in selfie" className="size-14 rounded-2xl object-cover" />
                  <button
                    type="button"
                    aria-label="Remove the selfie"
                    onClick={() => setPhoto(null)}
                    className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-white text-ink shadow-card"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </span>
              ) : (
                <Button variant="onInk" size="lg" onClick={() => file.current?.click()}>
                  <Camera />
                  Add a selfie
                </Button>
              )}
              <span className="inline-flex items-center gap-1.5 text-xs text-on-ink-muted">
                <MapPin className="size-3.5" aria-hidden />
                Demo location: your office
              </span>
              <input
                ref={file}
                type="file"
                accept="image/*"
                capture="user"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (!f) return
                  setPhotoError('')
                  readSelfie(f).then(setPhoto, (err: Error) => setPhotoError(err.message))
                }}
              />
            </div>
            {photoError && <p className="text-sm text-accent">{photoError}</p>}
            <Button size="lg" className="h-14 w-full text-base" disabled={!!checkInBlocker} title={checkInBlocker ?? undefined} onClick={checkIn}>
              <LogIn />
              Check in
            </Button>
            <p className="text-xs text-on-ink-muted">The selfie is optional.</p>
          </>
        )}
        {record?.checkIn && !record.checkOut && (
          <>
            <p className="text-sm text-on-ink-muted">
              Checked in at <span className="font-semibold text-on-ink">{fmtTime(record.checkIn)}</span>
              {late > 0 && `, ${late} min late`}.
            </p>
            <Button
              size="lg"
              className="h-14 w-full text-base"
              disabled={!!checkOutBlocker}
              title={checkOutBlocker ?? undefined}
              onClick={() => checkOut(record.id)}
            >
              <LogOut />
              Check out
            </Button>
          </>
        )}
        {record?.checkIn && record.checkOut && (
          <p className="rounded-2xl bg-white/10 p-4 text-sm">
            Done for today: in at <span className="font-semibold">{fmtTime(record.checkIn)}</span>, out at <span className="font-semibold">{fmtTime(record.checkOut)}</span>, {hoursBetween(record.checkIn, record.checkOut)}.
          </p>
        )}
      </div>
      <Link to={paths.meAttendance} className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-on-ink-muted hover:text-on-ink">
        My attendance this month
        <ChevronRight className="size-4" aria-hidden />
      </Link>
    </Card>
  )
}

const hoursBetween = (from: string, to: string) => {
  const mins = Math.round((Date.parse(to) - Date.parse(from)) / 60_000)
  return `${plural(Math.floor(mins / 60), 'hour')} ${mins % 60} min`
}
