import { blockerFor, countBy, currentEmployees, employeeName, holidayOn, newId, shiftOn, ymd } from '@artha/fixtures'
import type { Holiday, Shift } from '@artha/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Chip,
  ChipRow,
  cn,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  type Column,
} from '@artha/ui'
import { ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { SubTabs } from '../../components/SubTabs'
import { shiftDate, TIME_TABS } from './AttendancePages'
import { useSetParam } from '../../lib/useSetParam'
import { Avatar } from './parts'

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
/** Monday first, the way the roster reads. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]
const weekdayOf = (date: string) => new Date(`${date}T12:00:00`).getDay()
const mondayOf = (date: string) => shiftDate(date, -((weekdayOf(date) + 6) % 7))
const shortDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Confirm before removing a record; the button carries the store's blocker. */
function RemoveDialog({ what, open, onOpenChange, blocker, onConfirm }: { what: string; open: boolean; onOpenChange: (o: boolean) => void; blocker: string | null; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Remove ${what}?`} description={blocker ?? 'This cannot be undone.'}>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="danger" disabled={!!blocker} title={blocker ?? undefined} onClick={onConfirm}>
          <Trash2 />
          Remove
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

// ---------------------------------------------------------------- roster

interface Cell {
  employeeId: string
  date: string
}

export function RosterPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const { params, set, clear } = useSetParam()
  const [cell, setCell] = useState<Cell | null>(null)
  const thisWeek = mondayOf(ymd(now))
  const week = /^\d{4}-\d{2}-\d{2}$/.test(params.get('week') ?? '') ? mondayOf(params.get('week')!) : thisWeek
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(week, i))
  const q = params.get('q') ?? ''
  const dept = params.get('dept') ?? ''
  const manage = can('attendance.manage')
  const goWeek = (n: number) => {
    const next = shiftDate(week, n * 7)
    set('week', next === thisWeek ? null : next)
  }

  const people = currentEmployees(state)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = people.filter((e) => terms.every((w) => `${e.name} ${e.code}`.toLowerCase().includes(w)))
  const deptCounts = countBy(searched, (e) => e.departmentId)
  const rows = searched.filter((e) => !dept || e.departmentId === dept).sort((a, b) => a.name.localeCompare(b.name))
  const filters = [q, dept].filter(Boolean).length
  const overrideOn = (employeeId: string, date: string) => state.scheduleOverrides.find((o) => o.employeeId === employeeId && o.date === date)

  return (
    <div>
      <PageHeader
        title="Roster"
        description="Who works which shift this week. A changed day shows a dot; Default goes back to the employee's own shift."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
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
        }
      />
      <SubTabs items={TIME_TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!dept} count={searched.length} onClick={() => set('dept', null)}>
            All
          </Chip>
          {state.departments
            .filter((d) => deptCounts[d.id])
            .map((d) => (
              <Chip key={d.id} active={dept === d.id} count={deptCounts[d.id]} onClick={() => set('dept', dept === d.id ? null : d.id)}>
                {d.name}
              </Chip>
            ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {people.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear(['week'])}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      <Card className="mt-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-6">
          <div className="text-sm font-semibold">
            {shortDate(days[0])} to {shortDate(days[6])}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous week" onClick={() => goWeek(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" disabled={week === thisWeek} title={week === thisWeek ? 'You are on this week.' : undefined} onClick={() => set('week', null)}>
              This week
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next week" onClick={() => goWeek(1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
        <CardContent className="pt-3">
          {rows.length === 0 ? (
            <EmptyState compact title="No matching employees" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear(['week'])}>Clear filters</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[46rem] table-fixed text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="sticky left-0 z-10 w-48 bg-card py-2 pr-3 text-left font-medium">Employee</th>
                    {days.map((d) => {
                      const holiday = holidayOn(state, d)
                      return (
                        <th key={d} className={cn('px-1 py-2 text-center font-medium', d === ymd(now) && 'text-foreground')}>
                          <div>{DAY_NAMES[weekdayOf(d)]}</div>
                          <div className={cn('tabular-nums', holiday && 'text-accent')}>{shortDate(d)}</div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td className="sticky left-0 z-10 bg-card py-2 pr-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <Avatar name={e.name} />
                          <span className="truncate font-semibold">{e.name}</span>
                        </span>
                      </td>
                      {days.map((d) => {
                        const shift = shiftOn(state, e.id, d)
                        const holiday = holidayOn(state, d)
                        const changed = !!overrideOn(e.id, d)
                        const label = shift ? shift.code : holiday ? holiday.name : 'Off'
                        const body = (
                          <>
                            <span className="block truncate">{label}</span>
                            {changed && <span className="absolute right-1 top-1 size-1.5 rounded-full bg-accent" aria-label="Changed" />}
                          </>
                        )
                        const tone = shift ? 'bg-surface font-semibold' : holiday ? 'bg-accent-soft text-accent-strong' : 'text-muted'
                        return (
                          <td key={d} className="px-1 py-1.5">
                            {manage ? (
                              <button
                                type="button"
                                title={shift ? `${shift.name}, ${shift.start} to ${shift.end}` : label}
                                aria-label={`${e.name}, ${shortDate(d)}: ${label}. Change`}
                                onClick={() => setCell({ employeeId: e.id, date: d })}
                                className={cn('relative w-full rounded-xl px-1.5 py-2 text-center text-xs transition-colors hover:ring-2 hover:ring-ink/20', tone)}
                              >
                                {body}
                              </button>
                            ) : (
                              <div title={shift ? `${shift.name}, ${shift.start} to ${shift.end}` : label} className={cn('relative rounded-xl px-1.5 py-2 text-center text-xs', tone)}>
                                {body}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            {state.shifts.map((s) => (
              <span key={s.id}>
                <span className="font-semibold text-foreground">{s.code}</span> {s.name}, {s.start} to {s.end}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!cell} onOpenChange={(o) => !o && setCell(null)} title={cell ? employeeName(state, cell.employeeId) : 'Roster'} description={cell ? new Date(`${cell.date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) : undefined}>
        {cell && <CellMenu cell={cell} changed={!!overrideOn(cell.employeeId, cell.date)} onDone={() => setCell(null)} />}
      </Dialog>
    </div>
  )
}

function CellMenu({ cell, changed, onDone }: { cell: Cell; changed: boolean; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const current = shiftOn(state, cell.employeeId, cell.date)
  const own = state.shifts.find((s) => s.id === state.employees.find((e) => e.id === cell.employeeId)?.shiftId)
  const choose = (shiftId: string | null | 'default', label: string) => {
    if (act({ type: 'schedule/set', employeeId: cell.employeeId, date: cell.date, shiftId }, 'Roster updated', `${employeeName(state, cell.employeeId)} · ${label}`)) onDone()
  }
  return (
    <div className="space-y-2">
      {state.shifts.map((s) => (
        <Button key={s.id} variant={changed && current?.id === s.id ? 'secondary' : 'soft'} className="w-full justify-between" onClick={() => choose(s.id, s.name)}>
          <span className="truncate">
            {s.code} · {s.name}
          </span>
          <span className="text-xs tabular-nums opacity-70">
            {s.start} to {s.end}
          </span>
        </Button>
      ))}
      <Button variant={changed && !current ? 'secondary' : 'soft'} className="w-full justify-start" onClick={() => choose(null, 'Day off')}>
        Day off
      </Button>
      <Button variant="outline" className="w-full justify-start" disabled={!changed} title={changed ? undefined : 'This day already follows the default.'} onClick={() => choose('default', 'Default')}>
        Default: {own?.name ?? 'no shift'}
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------- shifts

const daysLabel = (days: number[]) => WEEK_ORDER.filter((d) => days.includes(d)).map((d) => DAY_NAMES[d]).join(', ')

export function ShiftsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const [editing, setEditing] = useState<Shift | 'new' | null>(null)
  const [removing, setRemoving] = useState<Shift | null>(null)
  const manage = can('attendance.manage')
  const staffOn = (id: string) => currentEmployees(state).filter((e) => e.shiftId === id).length
  const removeBlocker = removing ? blockerFor(state, { type: 'shifts/remove', id: removing.id }) : null

  const columns: Column<Shift>[] = [
    {
      id: 'name',
      header: 'Shift',
      sortValue: (s) => s.code,
      cell: (s) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{s.code}</div>
          <div className="truncate font-semibold">{s.name}</div>
        </div>
      ),
    },
    {
      id: 'hours',
      header: 'Hours',
      sortValue: (s) => s.start,
      cell: (s) => (
        <div className="text-sm tabular-nums">
          {s.start} to {s.end}
          <div className="text-xs text-muted">{s.breakMinutes} min break</div>
        </div>
      ),
    },
    { id: 'days', header: 'Days', hideBelow: 'md', cell: (s) => <span className="text-xs">{daysLabel(s.days)}</span> },
    { id: 'staff', header: 'Employees', align: 'right', hideBelow: 'sm', sortValue: (s) => staffOn(s.id), cell: (s) => <span className="tabular-nums">{staffOn(s.id)}</span> },
    ...(manage
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            cell: (s: Shift) => {
              const blocker = blockerFor(state, { type: 'shifts/remove', id: s.id })
              return (
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${s.name}`} disabled={!!blocker} title={blocker ?? undefined} onClick={() => setRemoving(s)}>
                    <Trash2 />
                  </Button>
                </div>
              )
            },
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Shifts"
        description="Working hours each employee follows by default. Late counts from the shift start plus the grace minutes in HR settings."
        actions={
          manage && (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              New shift
            </Button>
          )
        }
      />
      <SubTabs items={TIME_TABS} />
      <DataTable
        rows={state.shifts}
        columns={columns}
        getRowKey={(s) => s.id}
        rowLabel={(s) => s.name}
        initialSort={{ id: 'name', desc: false }}
        empty={<EmptyState compact title="No shifts yet" description="Add the working hours your team follows." />}
      />
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'New shift'} description="Overnight shifts are not supported yet.">
        {editing && <ShiftForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <RemoveDialog
        what={removing?.name ?? 'shift'}
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        blocker={removeBlocker}
        onConfirm={() => removing && act({ type: 'shifts/remove', id: removing.id }, 'Shift removed', removing.name) && setRemoving(null)}
      />
    </div>
  )
}

function ShiftForm({ editing, onDone }: { editing: Shift | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    code: editing?.code ?? '',
    name: editing?.name ?? '',
    start: editing?.start ?? '08:30',
    end: editing?.end ?? '17:30',
    breakMinutes: String(editing?.breakMinutes ?? 60),
    days: editing?.days ?? [1, 2, 3, 4, 5],
  })
  const shift: Shift = {
    id: editing?.id ?? newId('shf'),
    code: f.code.trim().toUpperCase(),
    name: f.name.trim(),
    start: f.start,
    end: f.end,
    breakMinutes: Number(f.breakMinutes) || 0,
    days: [...f.days].sort(),
  }
  const blocker = blockerFor(state, { type: 'shifts/upsert', shift })
  const toggleDay = (d: number) => setF({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] })
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'shifts/upsert', shift }, editing ? 'Shift saved' : 'Shift added', shift.name)) onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <FormField label="Code" required>
          <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="OFC" inputClassName="font-mono uppercase" />
        </FormField>
        <FormField label="Name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Office hours" />
        </FormField>
        <FormField label="Start" required>
          <Input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
        </FormField>
        <FormField label="End" required>
          <Input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
        </FormField>
        <FormField label="Break" hint="Minutes" className="col-span-2 sm:col-span-1">
          <Input inputMode="numeric" value={f.breakMinutes} onChange={(e) => setF({ ...f, breakMinutes: e.target.value.replace(/\D/g, '') })} />
        </FormField>
      </div>
      <FormField label="Runs on" required className="mt-4">
        <ChipRow className="flex-wrap">
          {WEEK_ORDER.map((d) => (
            <Chip key={d} active={f.days.includes(d)} aria-pressed={f.days.includes(d)} onClick={() => toggleDay(d)}>
              {DAY_NAMES[d]}
            </Chip>
          ))}
        </ChipRow>
      </FormField>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save shift' : 'Add shift'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- holidays

export function HolidaysPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<Holiday | 'new' | null>(null)
  const [removing, setRemoving] = useState<Holiday | null>(null)
  const thisYear = ymd(now).slice(0, 4)
  const year = params.get('year') ?? thisYear
  const q = params.get('q') ?? ''
  const manage = can('attendance.manage')

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.holidays.filter((h) => terms.every((w) => h.name.toLowerCase().includes(w)))
  const yearCounts = countBy(searched, (h) => h.date.slice(0, 4))
  const years = [...new Set([thisYear, ...state.holidays.map((h) => h.date.slice(0, 4))])].sort()
  const rows = searched.filter((h) => year === 'all' || h.date.startsWith(year))
  const filters = [q, year !== thisYear].filter(Boolean).length
  const longDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  const columns: Column<Holiday>[] = [
    {
      id: 'date',
      header: 'Date',
      sortValue: (h) => h.date,
      cell: (h) => (
        <div className="min-w-0">
          <div className="font-semibold tabular-nums">{longDate(h.date)}</div>
          {h.date < ymd(now) && <div className="text-xs text-muted">Passed</div>}
        </div>
      ),
    },
    { id: 'name', header: 'Holiday', sortValue: (h) => h.name, cell: (h) => <span className="truncate">{h.name}</span> },
    {
      id: 'weekend',
      header: 'Falls on',
      hideBelow: 'md',
      cell: (h) => (weekdayOf(h.date) % 6 === 0 ? <Badge variant="muted">Weekend</Badge> : <Badge variant="info">Working day</Badge>),
    },
    ...(manage
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            cell: (h: Holiday) => (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${h.name}`} onClick={() => setRemoving(h)}>
                  <Trash2 />
                </Button>
              </div>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Holidays"
        description="Public holidays and company days off. Nobody is rostered, and leave does not count them as working days."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search holidays"
              placeholder="Holiday name"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus />
                New holiday
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TIME_TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={year === 'all'} count={searched.length} onClick={() => set('year', 'all')}>
            All years
          </Chip>
          {years.map((y) => (
            <Chip key={y} active={year === y} count={yearCounts[y] ?? 0} onClick={() => set('year', y === thisYear ? null : y)}>
              {y}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.holidays.length}
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
          getRowKey={(h) => h.id}
          rowLabel={(h) => h.name}
          initialSort={{ id: 'date', desc: false }}
          resetPageKey={`${q}|${year}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching holidays" description="Change the search or pick another year." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title={`No holidays in ${year}`} description="Add the public holidays for the year." />
            )
          }
        />
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'New holiday'} description="Only one holiday can fall on a date.">
        {editing && <HolidayForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <RemoveDialog
        what={removing?.name ?? 'holiday'}
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        blocker={removing ? blockerFor(state, { type: 'holidays/remove', id: removing.id }) : null}
        onConfirm={() => removing && act({ type: 'holidays/remove', id: removing.id }, 'Holiday removed', removing.name) && setRemoving(null)}
      />
    </div>
  )
}

function HolidayForm({ editing, onDone }: { editing: Holiday | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ date: editing?.date ?? '', name: editing?.name ?? '' })
  const holiday: Holiday = { id: editing?.id ?? newId('hol'), date: f.date, name: f.name.trim() }
  const blocker = f.date ? blockerFor(state, { type: 'holidays/upsert', holiday }) : 'Pick the date.'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'holidays/upsert', holiday }, editing ? 'Holiday saved' : 'Holiday added', holiday.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <FormField label="Date" required>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </FormField>
        <FormField label="Name" required>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Hari Kemerdekaan" />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save holiday' : 'Add holiday'}</Button>
      </DialogFooter>
    </form>
  )
}
