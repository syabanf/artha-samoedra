import {
  addDays,
  blockerFor,
  countBy,
  DAY,
  fmtAgo,
  fmtDate,
  fmtDateLong,
  fmtDateTime,
  fmtTime,
  initials,
  isOpenDeal,
  newId,
  nowIso,
  startOfDay,
  toDateInput,
  toMs,
  type AppState,
} from '@artha/fixtures'
import {
  Badge,
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
  PillTabs,
  StatCard,
  Textarea,
  useIsPhone,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { PUBLIC_LISTING_STATUSES, VISIT_STATUS_LABEL, type Visit, type VisitStatus } from '@artha/types'
import { CalendarCheck, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, CircleX, DoorOpen, MessageSquareText, Plus, Search, Star, UserX, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'

// ---------------------------------------------------------------- shared bits

const STATUSES: VisitStatus[] = ['scheduled', 'checked_in', 'done', 'no_show', 'cancelled']
const STATUS_VARIANT: Record<VisitStatus, BadgeVariant> = { scheduled: 'info', checked_in: 'warning', done: 'success', no_show: 'danger', cancelled: 'muted' }
const STATUS_TINT: Record<VisitStatus, string> = {
  scheduled: 'bg-info-soft',
  checked_in: 'bg-warning-soft',
  done: 'bg-success-soft',
  no_show: 'bg-accent-soft',
  cancelled: 'bg-surface text-muted line-through',
}
const VisitStatusBadge = ({ status }: { status: VisitStatus }) => <Badge variant={STATUS_VARIANT[status]}>{VISIT_STATUS_LABEL[status]}</Badge>

const pad = (n: number) => String(n).padStart(2, '0')
export const toTimeInput = (iso: string) => {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
/** Value for a datetime-local input, in the browser's time zone. */
export const toLocalInput = (iso: string) => `${toDateInput(iso)}T${toTimeInput(iso)}`
/** Reads a datetime-local value (or a date plus time) as local time. */
export const fromLocalInput = (value: string) => new Date(value).toISOString()

const live = (v: Visit) => v.status === 'scheduled' || v.status === 'checked_in'
const endOf = (v: Visit) => new Date(toMs(v.startAt) + v.durationMin * 60_000).toISOString()

/** The listing or unit a visit goes to, with a console link. */
function placeOf(s: AppState, v: Pick<Visit, 'listingId' | 'unitId'>) {
  const listing = s.listings.find((l) => l.id === v.listingId)
  if (listing) return { label: `${listing.code} · ${listing.title}`, to: paths.listing(listing.id) }
  const unit = s.units.find((u) => u.id === v.unitId)
  const project = unit && s.projects.find((p) => p.id === unit.projectId)
  if (unit && project) return { label: `${unit.code}, ${project.name}`, to: paths.project(project.id) }
  return { label: 'No property set', to: null }
}

const Initials = ({ name, className }: { name: string; className?: string }) => (
  <span title={name} className={cn('flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-[9px] font-bold text-on-ink', className)}>
    {initials(name)}
  </span>
)

// ---------------------------------------------------------------- new visit

export interface VisitPreset {
  contactId?: string
  listingId?: string | null
  unitId?: string | null
  dealId?: string | null
}

export function VisitDialog({
  open,
  onOpenChange,
  preset,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset?: VisitPreset
  onSaved?: (v: Visit) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="New site visit" description="One agent takes one buyer to one property. The agent cannot have two visits at the same time.">
      <VisitForm
        preset={preset ?? {}}
        onDone={(v) => {
          onOpenChange(false)
          if (v) onSaved?.(v)
        }}
      />
    </Dialog>
  )
}

const DURATIONS = [30, 45, 60, 90, 120]

function VisitForm({ preset, onDone }: { preset: VisitPreset; onDone: (v: Visit | null) => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const presetDeal = state.deals.find((d) => d.id === preset.dealId)
  const [f, setF] = useState({
    contactId: preset.contactId ?? presetDeal?.contactId ?? '',
    place: preset.unitId ? `u:${preset.unitId}` : preset.listingId ? `l:${preset.listingId}` : '',
    dealId: preset.dealId ?? '',
    agentId: user.id,
    date: toDateInput(addDays(nowIso(), 1)),
    time: '10:00',
    duration: '60',
    notes: '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const deals = state.deals.filter((d) => isOpenDeal(state, d) && (!f.contactId || d.contactId === f.contactId))
  const listings = state.listings.filter((l) => PUBLIC_LISTING_STATUSES.includes(l.status) || `l:${l.id}` === f.place)
  const agents = state.users.filter((u) => u.status === 'active')

  const visit: Visit | null =
    f.date && f.time
      ? {
          id: newId('vis'),
          code: '',
          listingId: f.place.startsWith('l:') ? f.place.slice(2) : null,
          unitId: f.place.startsWith('u:') ? f.place.slice(2) : null,
          contactId: f.contactId,
          dealId: f.dealId || null,
          agentId: f.agentId,
          startAt: fromLocalInput(`${f.date}T${f.time}`),
          durationMin: Number(f.duration),
          status: 'scheduled',
          notes: f.notes.trim(),
          rating: null,
          feedback: '',
          createdAt: '',
        }
      : null
  const blocker = visit ? blockerFor(state, { type: 'visits/create', visit }) : null
  const errors = {
    contactId: f.contactId ? null : 'Choose the buyer.',
    place: f.place ? null : 'Choose the listing or unit to visit.',
    date: f.date ? null : 'Pick the date.',
    time: f.time ? null : 'Pick the time.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean) || !visit) return
        const contact = state.contacts.find((c) => c.id === visit.contactId)
        if (act({ type: 'visits/create', visit }, 'Site visit booked', `${contact?.name ?? 'Buyer'}, ${fmtDateTime(visit.startAt)}`)) onDone(visit)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Buyer" required error={show(errors.contactId)}>
          <NativeSelect
            value={f.contactId}
            onChange={(e) => {
              const keep = state.deals.find((d) => d.id === f.dealId)?.contactId === e.target.value
              setF({ ...f, contactId: e.target.value, dealId: keep ? f.dealId : '' })
            }}
            className={f.contactId ? '' : '[&_select]:text-muted'}
          >
            <option value="">Choose contact</option>
            {state.contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.phone}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Deal" hint="Optional">
          <NativeSelect
            value={f.dealId}
            onChange={(e) => {
              const d = state.deals.find((x) => x.id === e.target.value)
              setF({ ...f, dealId: e.target.value, contactId: d?.contactId ?? f.contactId, place: f.place || (d?.listingId ? `l:${d.listingId}` : '') })
            }}
          >
            <option value="">No deal</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Property" required error={show(errors.place)} className="sm:col-span-2">
          <NativeSelect value={f.place} onChange={set('place')} className={f.place ? '' : '[&_select]:text-muted'}>
            <option value="">Choose a listing or unit</option>
            <optgroup label="Listings">
              {listings.map((l) => (
                <option key={l.id} value={`l:${l.id}`}>
                  {l.code} · {l.title}
                </option>
              ))}
            </optgroup>
            {state.projects.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {state.units
                  .filter((u) => u.projectId === p.id && (u.status !== 'sold' || `u:${u.id}` === f.place))
                  .map((u) => (
                    <option key={u.id} value={`u:${u.id}`}>
                      Unit {u.code} · {u.type}
                    </option>
                  ))}
              </optgroup>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Agent" required>
          <NativeSelect value={f.agentId} onChange={set('agentId')}>
            {agents.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Duration" required>
          <NativeSelect value={f.duration} onChange={set('duration')}>
            {DURATIONS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Date" required error={show(errors.date)}>
          <Input type="date" value={f.date} onChange={set('date')} />
        </FormField>
        <FormField label="Time" required error={show(errors.time)}>
          <Input type="time" step={900} value={f.time} onChange={set('time')} />
        </FormField>
        <FormField label="Notes" hint="Optional, for the agent" className="sm:col-span-2">
          <Textarea value={f.notes} onChange={set('notes')} className="min-h-20" placeholder="Bring the floor plan" />
        </FormField>
      </div>
      {blocker && (
        <p role="status" className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-foreground">
          {blocker}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">Book visit</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- list and calendar

const HOURS = Array.from({ length: 12 }, (_, i) => 8 + i)
const HOUR_PX = 52
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const mondayOf = (ms: number) => {
  const d = new Date(startOfDay(ms))
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}
const plusDays = (ms: number, n: number) => {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}
const dayLabel = (ms: number, i: number) => `${WEEKDAYS[i]} ${new Date(ms).getDate()}`

type View = 'calendar' | 'list'

export function VisitsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const view: View = params.get('view') === 'list' ? 'list' : 'calendar'
  const q = params.get('q') ?? ''
  const status = (params.get('status') as VisitStatus | null) || null
  const agentId = params.get('agent') || null
  const weekParam = params.get('week')
  const thisWeek = mondayOf(now)
  const weekStart = weekParam ? mondayOf(new Date(`${weekParam}T00:00:00`).getTime()) : thisWeek
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clear = () => {
    const next = new URLSearchParams()
    for (const k of ['view', 'week']) if (params.get(k)) next.set(k, params.get(k)!)
    setParams(next, { replace: true })
  }
  const contactName = (v: Visit) => state.contacts.find((c) => c.id === v.contactId)?.name ?? '–'
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '–'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (v: Visit) =>
    terms.every((t) => `${v.code} ${contactName(v)} ${placeOf(state, v).label}`.toLowerCase().includes(t)) && (!agentId || v.agentId === agentId)
  const base = state.visits.filter(matches)
  const rows = base.filter((v) => !status || v.status === status)
  const counts = countBy(base, (v) => v.status)
  const filters = [q, status, agentId].filter(Boolean).length
  const agents = state.users.filter((u) => state.visits.some((v) => v.agentId === u.id))

  const today = startOfDay(now)
  const upcoming = state.visits.filter(live)
  const todayCount = upcoming.filter((v) => startOfDay(toMs(v.startAt)) === today).length
  const weekCount = upcoming.filter((v) => toMs(v.startAt) >= now && toMs(v.startAt) < now + 7 * DAY).length
  const checkedIn = state.visits.filter((v) => v.status === 'checked_in').length
  const awaiting = state.visits.filter((v) => v.status === 'done' && v.rating === null).length

  const columns: Column<Visit>[] = [
    {
      id: 'code',
      header: 'Visit',
      sortValue: (v) => v.code,
      cell: (v) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{v.code}</div>
          <div className="truncate text-sm">{contactName(v)}</div>
          <div className="mt-1 text-xs text-muted md:hidden">{fmtDateTime(v.startAt)}</div>
          <div className="mt-1.5 sm:hidden">
            <VisitStatusBadge status={v.status} />
          </div>
        </div>
      ),
    },
    { id: 'when', header: 'When', hideBelow: 'md', sortValue: (v) => v.startAt, cell: (v) => <span className="whitespace-nowrap text-sm">{fmtDateTime(v.startAt)}</span> },
    { id: 'place', header: 'Property', hideBelow: 'lg', cell: (v) => <span className="block max-w-64 truncate text-sm">{placeOf(state, v).label}</span> },
    {
      id: 'agent',
      header: 'Agent',
      hideBelow: 'xl',
      sortValue: (v) => userName(v.agentId),
      cell: (v) => (
        <span className="flex items-center gap-2 text-sm">
          <Initials name={userName(v.agentId)} />
          <span className="truncate">{userName(v.agentId)}</span>
        </span>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', align: 'right', sortValue: (v) => STATUSES.indexOf(v.status), cell: (v) => <VisitStatusBadge status={v.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Site visits"
        description="Every viewing booked with a buyer. Check buyers in on arrival and record their feedback after."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search visits"
              placeholder="Code, buyer or property"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('visit.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New visit
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Today" value={todayCount} icon={<CalendarClock />} tone="ink" />
        <StatCard label="Next 7 days" value={weekCount} icon={<CalendarDays />} />
        <StatCard
          label="Checked in"
          value={checkedIn}
          icon={<DoorOpen />}
          tone={checkedIn ? 'warning' : 'default'}
          active={status === 'checked_in'}
          onClick={() => set('status', status === 'checked_in' ? null : 'checked_in')}
        />
        <StatCard label="Awaiting feedback" value={awaiting} icon={<MessageSquareText />} tone={awaiting ? 'info' : 'default'} hint="Done visits without a rating" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <PillTabs<View>
          label="Visit view"
          size="sm"
          value={view}
          onChange={(v) => set('view', v === 'list' ? 'list' : null)}
          items={[
            { value: 'calendar', label: 'Calendar' },
            { value: 'list', label: 'List', count: rows.length },
          ]}
        />
        <ChipRow className="flex-1">
          <Chip active={!status} count={base.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {VISIT_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by agent" value={agentId ?? ''} onChange={(e) => set('agent', e.target.value)}>
          <option value="">All agents</option>
          {agents.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.visits.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      <div className="mt-2">
        {view === 'calendar' ? (
          <WeekCalendar
            visits={rows}
            weekStart={weekStart}
            now={now}
            onWeek={(ms) => set('week', ms === thisWeek ? null : toDateInput(new Date(ms).toISOString()))}
            isThisWeek={weekStart === thisWeek}
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(v) => v.id}
            rowLabel={(v) => v.code}
            onRowClick={(v) => navigate(paths.visit(v.id))}
            initialSort={{ id: 'when', desc: true }}
            resetPageKey={`${q}|${status}|${agentId}`}
            rowClassName={(v) => (live(v) ? undefined : 'opacity-70')}
            empty={
              filters ? (
                <EmptyState compact title="No matching visits" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
              ) : (
                <EmptyState compact title="No site visits yet" description="Book a visit when a buyer wants to see a property." />
              )
            }
          />
        )}
      </div>
      <VisitDialog open={creating} onOpenChange={setCreating} onSaved={(v) => navigate(paths.visit(v.id))} />
    </div>
  )
}

function WeekCalendar({
  visits,
  weekStart,
  now,
  onWeek,
  isThisWeek,
}: {
  visits: Visit[]
  weekStart: number
  now: number
  onWeek: (ms: number) => void
  isThisWeek: boolean
}) {
  const { state } = useAppState()
  const phone = useIsPhone()
  const days = WEEKDAYS.map((_, i) => plusDays(weekStart, i))
  const weekEnd = plusDays(weekStart, 7)
  const today = startOfDay(now)
  const inDay = (day: number) =>
    visits.filter((v) => startOfDay(toMs(v.startAt)) === day).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const inWeek = visits.filter((v) => toMs(v.startAt) >= weekStart && toMs(v.startAt) < weekEnd).length
  const contactName = (v: Visit) => state.contacts.find((c) => c.id === v.contactId)?.name ?? 'Buyer'
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '–'

  const nav = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">
          {fmtDate(new Date(weekStart).toISOString())} to {fmtDate(new Date(plusDays(weekStart, 6)).toISOString())}
        </h2>
        <p className="text-xs text-muted">
          {inWeek} {inWeek === 1 ? 'visit' : 'visits'} this week
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="card" size="icon-sm" aria-label="Previous week" onClick={() => onWeek(plusDays(weekStart, -7))}>
          <ChevronLeft />
        </Button>
        <Button variant="card" size="sm" disabled={isThisWeek} onClick={() => onWeek(mondayOf(now))}>
          This week
        </Button>
        <Button variant="card" size="icon-sm" aria-label="Next week" onClick={() => onWeek(plusDays(weekStart, 7))}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  )

  if (phone) {
    return (
      <div className="space-y-3">
        {nav}
        {days.map((day, i) => {
          const list = inDay(day)
          return (
            <Card key={day} className="p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className={cn('text-sm font-semibold', day === today && 'text-accent')}>
                  {dayLabel(day, i)}
                  {day === today && <span className="ml-1.5 text-xs font-medium">Today</span>}
                </h3>
                <span className="text-xs text-muted tabular-nums">{list.length || 'No visits'}</span>
              </div>
              {list.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {list.map((v) => (
                    <li key={v.id}>
                      <Link to={paths.visit(v.id)} className={cn('flex items-center gap-3 rounded-2xl p-3', STATUS_TINT[v.status])}>
                        <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{fmtTime(v.startAt)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{contactName(v)}</span>
                          <span className="block truncate text-xs text-muted">{placeOf(state, v).label}</span>
                        </span>
                        <Initials name={userName(v.agentId)} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
    )
  }

  return (
    <Card className="p-4 sm:p-5">
      {nav}
      <div className="mt-4 grid grid-cols-[44px_repeat(7,minmax(0,1fr))]">
        <div />
        {days.map((day, i) => (
          <div key={day} className={cn('truncate pb-2 text-center text-xs font-semibold', day === today ? 'text-accent' : 'text-muted')}>
            {dayLabel(day, i)}
          </div>
        ))}
        <div className="relative" style={{ height: HOURS.length * HOUR_PX }}>
          {HOURS.map((h, i) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted tabular-nums" style={{ top: i * HOUR_PX }}>
              {pad(h)}:00
            </span>
          ))}
        </div>
        {days.map((day) => (
          <DayColumn key={day} today={day === today} visits={inDay(day)} contactName={contactName} userName={userName} />
        ))}
      </div>
    </Card>
  )
}

function DayColumn({
  today,
  visits,
  contactName,
  userName,
}: {
  today: boolean
  visits: Visit[]
  contactName: (v: Visit) => string
  userName: (id: string) => string
}) {
  const height = HOURS.length * HOUR_PX
  // Greedy lanes so visits of different agents at the same hour sit side by side.
  const laneEnds: number[] = []
  const placed = visits.map((v) => {
    const start = toMs(v.startAt)
    let lane = laneEnds.findIndex((end) => end <= start)
    if (lane < 0) lane = laneEnds.push(0) - 1
    laneEnds[lane] = toMs(endOf(v))
    return { v, lane }
  })
  const lanes = Math.max(1, laneEnds.length)
  return (
    <div className={cn('relative border-l border-border', today && 'bg-surface-2')} style={{ height }}>
      {HOURS.map((h, i) => (
        <div key={h} className="absolute inset-x-0 border-t border-border" style={{ top: i * HOUR_PX }} />
      ))}
      {placed.map(({ v, lane }) => {
        const start = new Date(v.startAt)
        const hours = start.getHours() + start.getMinutes() / 60 - HOURS[0]
        const top = Math.min(Math.max(0, hours * HOUR_PX), height - 24)
        const blockHeight = Math.max(24, Math.min((v.durationMin / 60) * HOUR_PX, height - top))
        const agent = userName(v.agentId)
        return (
          <Link
            key={v.id}
            to={paths.visit(v.id)}
            title={`${v.code}, ${fmtTime(v.startAt)}, ${contactName(v)} with ${agent} (${VISIT_STATUS_LABEL[v.status]})`}
            className={cn('absolute overflow-hidden rounded-xl p-1.5 text-[11px] leading-tight transition-shadow hover:shadow-card', STATUS_TINT[v.status])}
            style={{ top, height: blockHeight, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
          >
            <span className="flex items-center justify-between gap-1">
              <span className="font-semibold tabular-nums">{fmtTime(v.startAt)}</span>
              <span className="hidden text-[9px] font-bold lg:inline">{initials(agent)}</span>
            </span>
            <span className="block truncate">{contactName(v)}</span>
          </Link>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------- detail

type Open = 'reschedule' | 'cancel' | null

export function VisitDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const [open, setOpen] = useState<Open>(null)
  const v = state.visits.find((x) => x.id === id)
  if (!v) {
    return (
      <Card>
        <EmptyState pageTitle title="Visit not found" description="This visit may have been removed." action={<BackButton fallback={paths.visits} />} />
      </Card>
    )
  }
  const contact = state.contacts.find((c) => c.id === v.contactId)
  const agent = state.users.find((u) => u.id === v.agentId)
  const deal = state.deals.find((d) => d.id === v.dealId)
  const place = placeOf(state, v)
  const manage = can('visit.manage')
  const move = (status: VisitStatus, done: string) => act({ type: 'visits/setStatus', id: v.id, status }, done, v.code)
  const closeTo = (o: boolean) => !o && setOpen(null)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.visits} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{v.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">Site visit with {contact?.name ?? 'a buyer'}</h1>
        </div>
        {manage && live(v) && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {v.status === 'scheduled' && (
              <>
                <Button variant="outline" onClick={() => setOpen('reschedule')}>
                  <CalendarClock />
                  Reschedule
                </Button>
                <Button variant="danger" onClick={() => setOpen('cancel')}>
                  <CircleX />
                  Cancel
                </Button>
                <Button variant="outline" onClick={() => move('no_show', 'Marked as no-show')}>
                  <UserX />
                  No-show
                </Button>
                <Button onClick={() => move('checked_in', 'Buyer checked in')}>
                  <DoorOpen />
                  Check in
                </Button>
              </>
            )}
            {v.status === 'checked_in' && (
              <Button onClick={() => move('done', 'Visit done')}>
                <CircleCheck />
                Done
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="flex flex-wrap gap-1.5">
            <VisitStatusBadge status={v.status} />
            <Badge className="bg-white/10 text-white">{v.durationMin} minutes</Badge>
          </div>
          <div className="mt-5 text-3xl font-bold tracking-tight tabular-nums">
            {fmtTime(v.startAt)} to {fmtTime(endOf(v))}
          </div>
          <div className="text-sm text-on-ink-muted">{fmtDateLong(v.startAt)}</div>
          <div className="mt-5 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Property</div>
              {place.to ? (
                <Link to={place.to} className="block truncate font-semibold hover:underline">
                  {place.label}
                </Link>
              ) : (
                <span className="font-semibold">{place.label}</span>
              )}
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Buyer</div>
              {contact ? (
                <Link to={paths.contact(contact.id)} className="block truncate font-semibold hover:underline">
                  {contact.name}
                </Link>
              ) : (
                <span className="font-semibold">–</span>
              )}
              {contact && <div className="truncate text-xs text-on-ink-muted">{contact.phone}</div>}
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Agent</div>
              <div className="truncate font-semibold">{agent?.name ?? '–'}</div>
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              items={[
                { label: 'Deal', value: deal ? <CodeLink to={paths.deal(deal.id)} code={deal.code} /> : 'No deal' },
                { label: 'Buyer', value: contact ? <Link to={paths.contact(contact.id)} className="hover:text-accent">{contact.name}</Link> : '–' },
                { label: 'Notes', value: v.notes || <span className="text-muted">None</span> },
                { label: 'Booked', value: v.createdAt ? fmtAgo(v.createdAt) : '–' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <FeedbackCard visit={v} manage={manage} />

      <RescheduleDialog visit={open === 'reschedule' ? v : null} onOpenChange={closeTo} />
      <Dialog open={open === 'cancel'} onOpenChange={closeTo} size="sm" title={`Cancel ${v.code}?`} description="The slot frees up for the agent. Let the buyer know on WhatsApp.">
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(null)}>
            Keep visit
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (move('cancelled', 'Visit cancelled')) setOpen(null)
            }}
          >
            Cancel visit
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

function FeedbackCard({ visit: v, manage }: { visit: Visit; manage: boolean }) {
  const act = useAct()
  const [editing, setEditing] = useState(false)
  const [rating, setRating] = useState(v.rating ?? 0)
  const [text, setText] = useState(v.feedback)
  const [tried, setTried] = useState(false)
  const recorded = v.rating !== null
  const showForm = manage && v.status === 'done' && (!recorded || editing)

  return (
    <Card>
      <CardHeader
        action={
          manage &&
          recorded &&
          !editing && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )
        }
      >
        <CardTitle>Buyer feedback</CardTitle>
      </CardHeader>
      <CardContent>
        {showForm ? (
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault()
              setTried(true)
              if (!rating) return
              if (act({ type: 'visits/feedback', id: v.id, rating, feedback: text.trim() }, 'Feedback saved', `${rating} of 5`)) setEditing(false)
            }}
          >
            <FormField label="Rating" required error={tried && !rating ? 'Pick a rating from 1 to 5.' : undefined}>
              <ChipRow role="radiogroup">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Chip key={n} role="radio" aria-checked={rating === n} active={rating === n} onClick={() => setRating(n)}>
                    <Star className="size-3.5" />
                    {n}
                  </Chip>
                ))}
              </ChipRow>
            </FormField>
            <FormField label="What the buyer said" hint="Optional" className="mt-4">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Liked the layout, worried about parking" />
            </FormField>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {editing && (
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button type="submit">Save feedback</Button>
            </div>
          </form>
        ) : recorded ? (
          <div>
            <div className="flex items-center gap-1" aria-label={`${v.rating} of 5`}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} className={cn('size-5', n <= (v.rating ?? 0) ? 'fill-accent text-accent' : 'text-silver')} />
              ))}
            </div>
            <p className="mt-2 text-sm">{v.feedback || <span className="text-muted">No comment.</span>}</p>
          </div>
        ) : (
          <EmptyState
            compact
            icon={<CalendarCheck />}
            title={v.status === 'done' ? 'No feedback yet' : 'Feedback opens after the visit'}
            description={v.status === 'done' ? 'Ask the buyer how the visit went.' : 'Mark the visit done to record a rating and comments.'}
          />
        )}
      </CardContent>
    </Card>
  )
}

function RescheduleDialog({ visit, onOpenChange }: { visit: Visit | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!visit} onOpenChange={onOpenChange} title={visit ? `Reschedule ${visit.code}` : 'Reschedule'} description="Pick a new time or hand the visit to another agent.">
      {visit && <RescheduleForm visit={visit} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function RescheduleForm({ visit, onDone }: { visit: Visit; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [f, setF] = useState({ date: toDateInput(visit.startAt), time: toTimeInput(visit.startAt), agentId: visit.agentId })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const startAt = f.date && f.time ? fromLocalInput(`${f.date}T${f.time}`) : null
  const blocker = startAt ? blockerFor(state, { type: 'visits/reschedule', id: visit.id, startAt, agentId: f.agentId }) : 'Pick the date and time.'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!startAt) return
        if (act({ type: 'visits/reschedule', id: visit.id, startAt, agentId: f.agentId }, 'Visit rescheduled', fmtDateTime(startAt))) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date" required>
          <Input type="date" value={f.date} onChange={set('date')} />
        </FormField>
        <FormField label="Time" required>
          <Input type="time" step={900} value={f.time} onChange={set('time')} />
        </FormField>
        <FormField label="Agent" required className="sm:col-span-2">
          <NativeSelect value={f.agentId} onChange={set('agentId')}>
            {state.users
              .filter((u) => u.status === 'active' || u.id === visit.agentId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </NativeSelect>
        </FormField>
      </div>
      {blocker && (
        <p role="status" className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-foreground">
          {blocker}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!blocker} title={blocker ?? undefined}>
          Save new time
        </Button>
      </DialogFooter>
    </form>
  )
}
