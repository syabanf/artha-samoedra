import {
  announcementsFor,
  blockerFor,
  countBy,
  currentEmployees,
  datesBetween,
  DAY,
  dayStart,
  employeeOfUser,
  fmtAgo,
  fmtDate,
  fmtDateLong,
  fromDateInput,
  newId,
  nowIso,
  toDateInput,
  toMs,
  ymd,
  type AppState,
} from '@artha/fixtures'
import { RECURRENCE_LABEL, type Announcement, type LogbookEntry, type Recurrence, type RecurringTask } from '@artha/types'
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
  NativeSelect,
  PageHeader,
  ProgressBar,
  Switch,
  Textarea,
  type Column,
} from '@artha/ui'
import { ChevronLeft, ChevronRight, CircleCheck, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { SubTabs } from '../../components/SubTabs'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { EmployeeSelect, PersonCell } from './parts'
import { useSetParam } from '../../lib/useSetParam'

const TABS = [
  { to: paths.announcements, label: 'Announcements' },
  { to: paths.logbook, label: 'Logbook' },
  { to: paths.recurringTasks, label: 'Department tasks' },
]

function SearchInput({ value, onChange, label, placeholder }: { value: string; onChange: (v: string | null) => void; label: string; placeholder: string }) {
  return (
    <Input
      variant="pill"
      icon={<Search />}
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="min-w-0 flex-1 sm:w-64 sm:flex-none"
      right={value ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => onChange(null)}><X /></Button> : undefined}
    />
  )
}

function FilterCaption({ shown, total, filters, onClear }: { shown: number; total: number; filters: number; onClear: () => void }) {
  if (!filters) return null
  return (
    <span className="text-xs text-muted tabular-nums">
      {shown} of {total}
      <Button variant="ghost" size="sm" className="ml-1" onClick={onClear}>
        Clear {filters} {filters === 1 ? 'filter' : 'filters'}
      </Button>
    </span>
  )
}

const deptName = (s: AppState, id: string | null) => (id ? (s.departments.find((d) => d.id === id)?.name ?? 'Unknown department') : 'Everyone')

// ---------------------------------------------------------------- announcements

/** Console users who are current employees in the audience. */
const audienceUsers = (s: AppState, a: Announcement) =>
  currentEmployees(s)
    .filter((e) => e.userId && (!a.departmentId || e.departmentId === a.departmentId))
    .map((e) => e.userId!)

type AnnShow = 'unread' | 'pinned'

export function AnnouncementsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<Announcement | 'new' | null>(null)
  const [reading, setReading] = useState<string | null>(null)
  const q = params.get('q') ?? ''
  const show = (params.get('show') as AnnShow | null) || null
  const audience = params.get('aud') || null
  const manage = can('employee.manage')

  // HR sees every announcement; everyone else sees their own audience.
  const visible = manage
    ? [...state.announcements].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt))
    : announcementsFor(state, user.id)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = visible.filter((a) => (!audience || (a.departmentId ?? 'all') === audience) && terms.every((t) => `${a.title} ${a.body}`.toLowerCase().includes(t)))
  const unread = (a: Announcement) => !a.readBy.includes(user.id)
  const rows = searched.filter((a) => !show || (show === 'unread' ? unread(a) : a.pinned))
  const filters = [q, show, audience].filter(Boolean).length
  const audiences = [...new Set(visible.map((a) => a.departmentId ?? 'all'))]
  const open = state.announcements.find((a) => a.id === reading)

  const read = (a: Announcement) => {
    setReading(a.id)
    if (unread(a)) act({ type: 'announcements/read', id: a.id, userId: user.id }, 'Marked as read', a.title)
  }

  return (
    <div>
      <PageHeader
        title="Announcements"
        description="Announcements for the whole company or one department. Opening one marks it read."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchInput value={q} onChange={(v) => set('q', v)} label="Search announcements" placeholder="Title or message" />
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus />
                New announcement
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('show', null)}>
            All
          </Chip>
          <Chip active={show === 'unread'} count={searched.filter(unread).length} onClick={() => set('show', show === 'unread' ? null : 'unread')}>
            Unread
          </Chip>
          <Chip active={show === 'pinned'} count={searched.filter((a) => a.pinned).length} onClick={() => set('show', show === 'pinned' ? null : 'pinned')}>
            Pinned
          </Chip>
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by audience" value={audience ?? ''} onChange={(e) => set('aud', e.target.value)}>
          <option value="">Every audience</option>
          {audiences.map((id) => (
            <option key={id} value={id}>
              {id === 'all' ? 'Everyone' : deptName(state, id)}
            </option>
          ))}
        </NativeSelect>
        <FilterCaption shown={rows.length} total={visible.length} filters={filters} onClear={() => clear()} />
      </div>

      {rows.length === 0 ? (
        <Card className="mt-3">
          {filters ? (
            <EmptyState compact title="No matching announcements" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
          ) : (
            <EmptyState compact title="No announcements yet" description="HR posts company news and reminders here." />
          )}
        </Card>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((a) => {
            const users = audienceUsers(state, a)
            const readCount = a.readBy.filter((u) => users.includes(u)).length
            return (
              <li key={a.id}>
                <Card className="flex min-w-0 flex-col gap-3 p-5 sm:flex-row sm:items-start">
                  <button type="button" onClick={() => read(a)} className="min-w-0 flex-1 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                    <div className="flex flex-wrap items-center gap-2">
                      {a.pinned && <Pin className="size-4 shrink-0 text-accent" aria-label="Pinned" />}
                      <span className="min-w-0 font-semibold hover:text-accent">{a.title}</span>
                      {unread(a) && <Badge variant="accent">New</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-body">{a.body}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <Badge variant={a.departmentId ? 'info' : 'default'}>{deptName(state, a.departmentId)}</Badge>
                      <span>
                        {state.users.find((u) => u.id === a.authorId)?.name ?? 'Someone'} · {fmtAgo(a.publishedAt)}
                      </span>
                      <span className="tabular-nums">
                        Read by {readCount} of {users.length}
                      </span>
                    </div>
                  </button>
                  {manage && (
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)}>
                      <Pencil />
                    </Button>
                  )}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setReading(null)} size="lg" title={open?.title ?? ''} description={open ? `${deptName(state, open.departmentId)} · ${fmtDateLong(open.publishedAt)}` : undefined}>
        {open && (
          <>
            <p className="whitespace-pre-line text-sm">{open.body}</p>
            <ReadProgress announcement={open} />
          </>
        )}
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} size="lg" title={editing && editing !== 'new' ? 'Edit announcement' : 'New announcement'} description="Pinned announcements stay at the top.">
        {editing && <AnnouncementForm old={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function ReadProgress({ announcement }: { announcement: Announcement }) {
  const { state } = useAppState()
  const users = audienceUsers(state, announcement)
  const read = announcement.readBy.filter((u) => users.includes(u)).length
  return (
    <div className="mt-5">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-muted">Read</span>
        <span className="font-semibold tabular-nums">
          {read} of {users.length}
        </span>
      </div>
      <ProgressBar value={users.length ? (read / users.length) * 100 : 0} />
    </div>
  )
}

function AnnouncementForm({ old, onDone }: { old: Announcement | null; onDone: () => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ title: old?.title ?? '', body: old?.body ?? '', departmentId: old?.departmentId ?? '', pinned: old?.pinned ?? false })
  const announcement: Announcement = {
    id: old?.id ?? newId('ann'),
    authorId: old?.authorId ?? user.id,
    publishedAt: old?.publishedAt ?? nowIso(),
    readBy: old?.readBy ?? [user.id],
    title: f.title.trim(),
    body: f.body.trim(),
    departmentId: f.departmentId || null,
    pinned: f.pinned,
  }
  const blocker = blockerFor(state, { type: 'announcements/upsert', announcement })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && act({ type: 'announcements/upsert', announcement }, old ? 'Announcement saved' : 'Announcement posted', announcement.title)) onDone()
      }}
    >
      <div className="space-y-4">
        <FormField label="Title" required>
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        </FormField>
        <FormField label="Message" required>
          <Textarea rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </FormField>
        <FormField label="Audience">
          <NativeSelect value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            <option value="">Everyone</option>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <label className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <span>
            <span className="block font-semibold">Pin to the top</span>
            <span className="text-xs text-muted">Use for deadlines everyone must see.</span>
          </span>
          <Switch label="Pinned" checked={f.pinned} onCheckedChange={(pinned) => setF({ ...f, pinned })} />
        </label>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        {old && (
          <Button
            type="button"
            variant="outline"
            className="sm:mr-auto"
            onClick={() => act({ type: 'announcements/remove', id: old.id }, 'Announcement removed', old.title) && onDone()}
          >
            <Trash2 />
            Remove
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{old ? 'Save' : 'Post'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- logbook

/** Monday of the week holding `date`, as YYYY-MM-DD. */
const weekOf = (date: string) => ymd(dayStart(date) - ((new Date(dayStart(date)).getDay() + 6) % 7) * DAY + 3_600_000)
const shiftWeek = (monday: string, weeks: number) => ymd(dayStart(monday) + weeks * 7 * DAY + 3_600_000)

export function LogbookPage() {
  const { state } = useAppState()
  const user = useUser()
  const { can } = useAuth()
  const now = useNow()
  const { params, set, clear } = useSetParam()
  const [adding, setAdding] = useState(false)
  const thisWeek = weekOf(ymd(now))
  const week = params.get('week') || thisWeek
  const q = params.get('q') ?? ''
  const employeeId = params.get('emp') || ''
  const dept = params.get('dept') || null
  const days = datesBetween(week, shiftWeek(week, 1)).slice(0, 7)
  const me = employeeOfUser(state, user.id)
  const manage = can('employee.manage')

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const deptOf = (id: string) => state.employees.find((e) => e.id === id)?.departmentId
  const inWeek = state.logbook.filter((l) => days.includes(l.date))
  const searched = inWeek.filter((l) => (!employeeId || l.employeeId === employeeId) && terms.every((t) => l.text.toLowerCase().includes(t)))
  const deptCounts = countBy(searched, (l) => deptOf(l.employeeId) ?? '')
  const rows = searched.filter((l) => !dept || deptOf(l.employeeId) === dept)
  const filters = [q, employeeId, dept].filter(Boolean).length
  const byDate = [...days].reverse().map((d) => ({ date: d, entries: rows.filter((l) => l.date === d) })).filter((g) => g.entries.length)
  const perPerson = Object.entries(
    rows.reduce<Record<string, number>>((acc, l) => ({ ...acc, [l.employeeId]: (acc[l.employeeId] ?? 0) + l.hours }), {}),
  ).sort(([, a], [, b]) => b - a)

  return (
    <div>
      <PageHeader
        title="Logbook"
        description="What people worked on each day, with hours. Pick a week and a person to narrow it down."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchInput value={q} onChange={(v) => set('q', v)} label="Search the logbook" placeholder="What was done" />
            {(manage || me) && (
              <Button onClick={() => setAdding(true)}>
                <Plus />
                Add entry
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-card p-1 shadow-card">
          <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => set('week', shiftWeek(week, -1))}>
            <ChevronLeft />
          </Button>
          <span className="px-1 text-sm font-semibold tabular-nums">
            {fmtDate(fromDateInput(days[0]))} to {fmtDate(fromDateInput(days[6]))}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label="Next week" disabled={week >= thisWeek} title={week >= thisWeek ? 'This is the current week.' : undefined} onClick={() => set('week', shiftWeek(week, 1))}>
            <ChevronRight />
          </Button>
        </div>
        {week !== thisWeek && (
          <Button variant="outline" size="sm" onClick={() => set('week', null)}>
            This week
          </Button>
        )}
        <EmployeeSelect variant="inline" aria-label="Filter by employee" placeholder="Everyone" value={employeeId} onChange={(id) => set('emp', id)} />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!dept} count={searched.length} onClick={() => set('dept', null)}>
            All departments
          </Chip>
          {state.departments
            .filter((d) => deptCounts[d.id])
            .map((d) => (
              <Chip key={d.id} active={dept === d.id} count={deptCounts[d.id]} onClick={() => set('dept', dept === d.id ? null : d.id)}>
                {d.name}
              </Chip>
            ))}
        </ChipRow>
        <FilterCaption shown={rows.length} total={inWeek.length} filters={filters} onClear={() => clear(['week'])} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-3">
          {byDate.length === 0 ? (
            <Card>
              {filters ? (
                <EmptyState compact title="No matching entries" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear(['week'])}>Clear filters</Button>} />
              ) : (
                <EmptyState compact title="Nothing logged this week" description="Entries show here once people log their work." />
              )}
            </Card>
          ) : (
            byDate.map((g) => (
              <Card key={g.date}>
                <CardHeader action={<span className="text-xs text-muted tabular-nums">{g.entries.reduce((n, l) => n + l.hours, 0)} h</span>}>
                  <CardTitle>{fmtDateLong(fromDateInput(g.date))}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {g.entries.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                        <div className="w-full min-w-0 sm:w-48 sm:shrink-0">
                          <PersonCell id={l.employeeId} />
                        </div>
                        <p className="min-w-0 flex-1 text-sm">{l.text}</p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{l.hours} h</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Hours this week</CardTitle>
          </CardHeader>
          <CardContent>
            {perPerson.length === 0 ? (
              <p className="text-sm text-muted">No hours logged.</p>
            ) : (
              <ul className="space-y-3">
                {perPerson.map(([id, hours]) => (
                  <li key={id} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <PersonCell id={id} />
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{hours} h</span>
                    </div>
                    <ProgressBar value={Math.min(100, (hours / 40) * 100)} />
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs text-muted">Bars run against a 40-hour week.</p>
          </CardContent>
        </Card>
      </div>

      <Dialog open={adding} onOpenChange={setAdding} title="Add logbook entry" description="Log what you worked on and for how long.">
        {adding && <LogbookForm defaultEmployeeId={me?.id ?? ''} pickAnyone={manage} onDone={() => setAdding(false)} />}
      </Dialog>
    </div>
  )
}

function LogbookForm({ defaultEmployeeId, pickAnyone, onDone }: { defaultEmployeeId: string; pickAnyone: boolean; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const now = useNow()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ employeeId: defaultEmployeeId, date: ymd(now), hours: '8', text: '' })
  const entry: LogbookEntry = { id: newId('log'), employeeId: f.employeeId, date: f.date, hours: Number(f.hours) || 0, text: f.text.trim() }
  const blocker = (!f.employeeId && 'Pick an employee.') || blockerFor(state, { type: 'logbook/add', entry })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && act({ type: 'logbook/add', entry }, 'Entry added', `${entry.hours} h on ${fmtDate(fromDateInput(entry.date))}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {pickAnyone && (
          <FormField label="Employee" required className="sm:col-span-2">
            <EmployeeSelect value={f.employeeId} onChange={(employeeId) => setF({ ...f, employeeId })} />
          </FormField>
        )}
        <FormField label="Date" required>
          <Input type="date" max={ymd(now)} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </FormField>
        <FormField label="Hours" required hint="0.5 to 24">
          <Input inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value.replace(/[^\d.]/g, '') })} />
        </FormField>
        <FormField label="What you worked on" required className="sm:col-span-2">
          <Textarea rows={4} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Add entry</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- department tasks

type TaskShow = 'overdue' | 'paused'

export function RecurringTasksPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const now = useNow()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<RecurringTask | 'new' | null>(null)
  const q = params.get('q') ?? ''
  const show = (params.get('show') as TaskShow | null) || null
  const dept = params.get('dept') || null
  const manage = can('employee.manage')
  const me = employeeOfUser(state, user.id)

  const overdue = (t: RecurringTask) => t.active && toMs(t.nextDue) < now
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.recurringTasks.filter((t) => (!dept || t.departmentId === dept) && terms.every((w) => `${t.title} ${deptName(state, t.departmentId)}`.toLowerCase().includes(w)))
  const rows = searched.filter((t) => !show || (show === 'overdue' ? overdue(t) : !t.active))
  const filters = [q, show, dept].filter(Boolean).length
  const departments = state.departments.filter((d) => state.recurringTasks.some((t) => t.departmentId === d.id))

  const columns: Column<RecurringTask>[] = [
    {
      id: 'title',
      header: 'Task',
      sortValue: (t) => t.title,
      cell: (t) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{t.title}</div>
          <div className="truncate text-xs text-muted">
            {deptName(state, t.departmentId)} · {RECURRENCE_LABEL[t.every]}
          </div>
          {!t.active && <Badge variant="muted" className="mt-1">Paused</Badge>}
        </div>
      ),
    },
    { id: 'assignee', header: 'Assignee', hideBelow: 'md', sortValue: (t) => state.employees.find((e) => e.id === t.assigneeId)?.name ?? '', cell: (t) => <PersonCell id={t.assigneeId} /> },
    {
      id: 'due',
      header: 'Next due',
      sortValue: (t) => t.nextDue,
      cell: (t) => (
        <span className={cn('whitespace-nowrap text-sm tabular-nums', overdue(t) && 'font-semibold text-danger')} title={overdue(t) ? 'Overdue' : undefined}>
          {fmtDate(t.nextDue)}
          {overdue(t) && <span className="sr-only"> (overdue)</span>}
        </span>
      ),
    },
    {
      id: 'last',
      header: 'Last done',
      hideBelow: 'lg',
      sortValue: (t) => t.lastDoneAt ?? '',
      cell: (t) =>
        t.lastDoneAt ? (
          <div className="text-sm">
            <div>{fmtAgo(t.lastDoneAt)}</div>
            <div className="text-xs text-muted">{state.users.find((u) => u.id === t.lastDoneBy)?.name ?? 'Unknown'}</div>
          </div>
        ) : (
          <span className="text-muted">Never</span>
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      cell: (t) => {
        const blocker = blockerFor(state, { type: 'recurring/complete', id: t.id })
        return (
          <div className="flex justify-end gap-1">
            {(manage || t.assigneeId === me?.id) && (
              <Button variant="outline" size="sm" disabled={!!blocker} title={blocker ?? undefined} onClick={() => act({ type: 'recurring/complete', id: t.id }, 'Task done', t.title)}>
                <CircleCheck />
                <span className="hidden sm:inline">Complete</span>
              </Button>
            )}
            {manage && (
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.title}`} onClick={() => setEditing(t)}>
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
        title="Department tasks"
        description="Recurring work per department. Completing a task moves its due date to the next cycle."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <SearchInput value={q} onChange={(v) => set('q', v)} label="Search tasks" placeholder="Task or department" />
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus />
                New task
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('show', null)}>
            All
          </Chip>
          <Chip active={show === 'overdue'} count={searched.filter(overdue).length} onClick={() => set('show', show === 'overdue' ? null : 'overdue')}>
            Overdue
          </Chip>
          <Chip active={show === 'paused'} count={searched.filter((t) => !t.active).length} onClick={() => set('show', show === 'paused' ? null : 'paused')}>
            Paused
          </Chip>
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by department" value={dept ?? ''} onChange={(e) => set('dept', e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
        <FilterCaption shown={rows.length} total={state.recurringTasks.length} filters={filters} onClear={() => clear()} />
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(t) => t.id}
          rowLabel={(t) => t.title}
          initialSort={{ id: 'due', desc: false }}
          resetPageKey={`${q}|${show}|${dept}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching tasks" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No department tasks yet" description="Add the work a department repeats every day, week or month." />
            )
          }
        />
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? 'Edit task' : 'New task'} description="Pause a task to stop it coming due.">
        {editing && <TaskForm old={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function TaskForm({ old, onDone }: { old: RecurringTask | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const now = useNow()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    title: old?.title ?? '',
    departmentId: old?.departmentId ?? state.departments[0]?.id ?? '',
    every: old?.every ?? ('weekly' as Recurrence),
    assigneeId: old?.assigneeId ?? '',
    nextDue: toDateInput(old?.nextDue ?? new Date(now + DAY).toISOString()),
    active: old?.active ?? true,
  })
  const task: RecurringTask = {
    id: old?.id ?? newId('rt'),
    lastDoneAt: old?.lastDoneAt ?? null,
    lastDoneBy: old?.lastDoneBy ?? null,
    title: f.title.trim(),
    departmentId: f.departmentId,
    every: f.every,
    assigneeId: f.assigneeId,
    nextDue: f.nextDue ? fromDateInput(f.nextDue) : '',
    active: f.active,
  }
  const blocker = (!f.nextDue && 'Pick the next due date.') || blockerFor(state, { type: 'recurring/upsert', task })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && act({ type: 'recurring/upsert', task }, old ? 'Task saved' : 'Task added', task.title)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Task" required className="sm:col-span-2">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Reconcile bank accounts" />
        </FormField>
        <FormField label="Department">
          <NativeSelect value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Repeats">
          <NativeSelect value={f.every} onChange={(e) => setF({ ...f, every: e.target.value as Recurrence })}>
            {Object.entries(RECURRENCE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Assignee" required hint="People in the department first">
          <EmployeeSelect value={f.assigneeId} onChange={(assigneeId) => setF({ ...f, assigneeId })} filter={(e) => e.departmentId === f.departmentId} />
        </FormField>
        <FormField label="Next due" required>
          <Input type="date" value={f.nextDue} onChange={(e) => setF({ ...f, nextDue: e.target.value })} />
        </FormField>
      </div>
      {old && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <span>
            <span className="block font-semibold">Active</span>
            <span className="text-xs text-muted">A paused task never comes due.</span>
          </span>
          <Switch label="Active" checked={f.active} onCheckedChange={(active) => setF({ ...f, active })} />
        </label>
      )}
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        {old && (
          <Button type="button" variant="ghost" className="mr-auto text-danger" onClick={() => act({ type: 'recurring/remove', id: old.id }, 'Task removed', old.title) && onDone()}>
            Remove
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{old ? 'Save task' : 'Add task'}</Button>
      </DialogFooter>
    </form>
  )
}
