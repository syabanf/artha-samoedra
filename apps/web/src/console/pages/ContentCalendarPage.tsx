import { calendarItems, countBy, fmtDateLong, fmtTime, onDay, startOfDay, toDateInput, toMs, type CalendarChannel, type CalendarItem } from '@artha/fixtures'
import { Button, Card, Chip, ChipRow, cn, Dialog, DialogFooter, EmptyState, FormField, Input, NativeSelect, PageHeader, useIsPhone } from '@artha/ui'
import { CONTENT_STATUS_LABEL, SOCIAL_PLATFORMS, type ContentStatus } from '@artha/types'
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { ContentStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { CHANNEL_DOT, CHANNEL_LABEL, CHANNEL_TONE, ChannelPill } from './SocialPage'

const CHANNELS: CalendarChannel[] = [...SOCIAL_PLATFORMS, 'blog']
const STATUSES: ContentStatus[] = ['scheduled', 'published', 'failed']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DRAG_TYPE = 'application/x-artha-content'

const monthStart = (ms: number) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}
const plusMonths = (ms: number, n: number) => {
  const d = new Date(ms)
  return new Date(d.getFullYear(), d.getMonth() + n, 1).getTime()
}
const plusDays = (ms: number, n: number) => {
  const d = new Date(ms)
  d.setDate(d.getDate() + n)
  return d.getTime()
}
const monthLabel = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
const dayKey = (ms: number) => toDateInput(new Date(ms).toISOString())

/** Full weeks, Monday first, covering the month. */
const monthGrid = (start: number) => {
  const first = plusDays(start, -((new Date(start).getDay() + 6) % 7))
  const next = plusMonths(start, 1)
  const days: number[] = []
  for (let d = first; d < next || days.length % 7 !== 0; d = plusDays(d, 1)) days.push(d)
  return days
}

/** Moves an item to another day at the same time of day, through the schedule action the store checks. */
function useMove() {
  const act = useAct()
  return (item: CalendarItem, day: string) => {
    const at = onDay(item.at, day)
    const action = item.kind === 'social' ? { type: 'social/schedule' as const, id: item.id, scheduledAt: at } : { type: 'blog/schedule' as const, id: item.id, scheduledAt: at }
    return act(action, 'Moved', `${item.title} · ${fmtDateLong(at)}`)
  }
}

export function ContentCalendarPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const phone = useIsPhone()
  const move = useMove()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<CalendarItem | null>(null)
  const manage = can('content.manage')

  const thisMonth = monthStart(now)
  const monthParam = params.get('month')
  const start = monthParam ? monthStart(new Date(`${monthParam}-01T00:00:00`).getTime()) : thisMonth
  const end = plusMonths(start, 1)
  const channel = (CHANNELS.find((c) => c === params.get('channel')) ?? null) as CalendarChannel | null
  const status = (STATUSES.find((s) => s === params.get('status')) ?? null) as ContentStatus | null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clear = () => setParams(monthParam ? new URLSearchParams({ month: monthParam }) : new URLSearchParams(), { replace: true })

  const inMonth = calendarItems(state).filter((i) => toMs(i.at) >= start && toMs(i.at) < end)
  const byStatus = inMonth.filter((i) => !status || i.status === status)
  const rows = byStatus.filter((i) => !channel || i.channel === channel)
  const channelCounts = countBy(byStatus, (i) => i.channel)
  const filters = [channel, status].filter(Boolean).length
  const today = startOfDay(now)
  const onDate = (day: number) => rows.filter((i) => startOfDay(toMs(i.at)) === day)

  const nav = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <h2 className="text-base font-semibold">{monthLabel(start)}</h2>
        <p className="text-xs text-muted">
          {rows.length} {rows.length === 1 ? 'item' : 'items'} this month
        </p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="card" size="icon-sm" aria-label="Previous month" onClick={() => set('month', dayKey(plusMonths(start, -1)).slice(0, 7))}>
          <ChevronLeft />
        </Button>
        <Button variant="card" size="sm" disabled={start === thisMonth} onClick={() => set('month', null)}>
          This month
        </Button>
        <Button variant="card" size="icon-sm" aria-label="Next month" onClick={() => set('month', dayKey(plusMonths(start, 1)).slice(0, 7))}>
          <ChevronRight />
        </Button>
      </div>
    </div>
  )

  return (
    <div>
      <PageHeader
        title="Content calendar"
        description={
          manage
            ? 'Scheduled and published social posts and blog articles by day. Drag a scheduled item to another day, or open it and use Move to date.'
            : 'Scheduled and published social posts and blog articles by day.'
        }
        actions={
          <Button variant="outline" asChild>
            <Link to={paths.social}>Social media</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!channel} count={byStatus.length} onClick={() => set('channel', null)}>
            All
          </Chip>
          {CHANNELS.map((c) => (
            <Chip key={c} active={channel === c} count={channelCounts[c] ?? 0} onClick={() => set('channel', channel === c ? null : c)}>
              <span className={cn('mr-1.5 inline-block size-2 rounded-full', CHANNEL_DOT[c])} aria-hidden />
              {CHANNEL_LABEL[c]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by status" value={status ?? ''} onChange={(e) => set('status', e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {CONTENT_STATUS_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {inMonth.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear filters
            </Button>
          </span>
        )}
      </div>

      <div className="mt-2">
        {phone ? (
          <div className="space-y-3">
            {nav}
            {rows.length === 0 ? (
              <Card>
                <EmptyState compact title={filters ? 'No matching content' : 'Nothing planned this month'} description={filters ? 'Change or clear the filters.' : 'Approved content shows here once it is scheduled.'} />
              </Card>
            ) : (
              monthGrid(start)
                .filter((d) => d >= start && d < end && onDate(d).length)
                .map((d) => (
                  <Card key={d} className="p-4">
                    <h3 className={cn('text-sm font-semibold', d === today && 'text-accent')}>
                      {fmtDateLong(new Date(d).toISOString())}
                      {d === today && <span className="ml-1.5 text-xs font-medium">Today</span>}
                    </h3>
                    <ul className="mt-3 space-y-2">
                      {onDate(d).map((i) => (
                        <li key={i.id}>
                          <button type="button" onClick={() => setOpen(i)} className="flex w-full min-w-0 items-center gap-3 rounded-2xl bg-surface-2 p-3 text-left">
                            <span className="w-12 shrink-0 text-sm font-semibold tabular-nums">{fmtTime(i.at)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{i.title}</span>
                              <span className="block truncate text-xs text-muted">{i.detail}</span>
                            </span>
                            <ChannelPill channel={i.channel} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))
            )}
          </div>
        ) : (
          <Card className="p-4 sm:p-5">
            {nav}
            <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-2xl bg-border">
              {WEEKDAYS.map((w) => (
                <div key={w} className="bg-card pb-2 pt-1 text-center text-xs font-semibold text-muted">
                  {w}
                </div>
              ))}
              {monthGrid(start).map((d) => (
                <DayCell key={d} day={d} inMonth={d >= start && d < end} today={d === today} items={onDate(d)} droppable={manage} onOpen={setOpen} onDrop={move} />
              ))}
            </div>
          </Card>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)} size="md" title={open?.title ?? ''} description={open?.detail}>
        {open && <ItemDetail item={open} manage={manage} onDone={() => setOpen(null)} />}
      </Dialog>
    </div>
  )
}

function DayCell({
  day,
  inMonth,
  today,
  items,
  droppable,
  onOpen,
  onDrop,
}: {
  day: number
  inMonth: boolean
  today: boolean
  items: CalendarItem[]
  droppable: boolean
  onOpen: (i: CalendarItem) => void
  onDrop: (item: CalendarItem, day: string) => boolean
}) {
  const { state } = useAppState()
  const [over, setOver] = useState(false)
  const handlers = droppable
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setOver(true)
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          setOver(false)
          const item = calendarItems(state).find((i) => i.id === e.dataTransfer.getData(DRAG_TYPE))
          if (item?.movable) onDrop(item, dayKey(day))
        },
      }
    : {}
  return (
    <div className={cn('min-h-28 min-w-0 bg-card p-1.5', !inMonth && 'bg-surface-2', over && 'ring-2 ring-inset ring-accent/40')} {...handlers}>
      <div className={cn('px-1 text-xs font-semibold tabular-nums', today ? 'text-accent' : inMonth ? 'text-foreground' : 'text-muted')}>{new Date(day).getDate()}</div>
      <ul className="mt-1 space-y-1">
        {items.map((i) => (
          <li
            key={i.id}
            draggable={droppable && i.movable}
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG_TYPE, i.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
          >
            <button
              type="button"
              onClick={() => onOpen(i)}
              title={`${CHANNEL_LABEL[i.channel]} · ${CONTENT_STATUS_LABEL[i.status]} · ${i.title}`}
              className={cn(
                'block w-full min-w-0 truncate rounded-lg px-1.5 py-1 text-left text-[11px] font-medium',
                CHANNEL_TONE[i.channel],
                i.status === 'failed' && 'ring-1 ring-inset ring-accent',
                i.status === 'published' && 'opacity-70',
                droppable && i.movable && 'cursor-grab active:cursor-grabbing',
              )}
            >
              <span className="tabular-nums">{fmtTime(i.at)}</span> {i.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ItemDetail({ item, manage, onDone }: { item: CalendarItem; manage: boolean; onDone: () => void }) {
  const move = useMove()
  const [day, setDay] = useState(toDateInput(item.at))
  const [tried, setTried] = useState(false)
  const to = item.kind === 'blog' ? paths.blogEdit(item.id) : `${paths.social}?status=${item.status}`
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (day && move(item, day)) onDone()
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ChannelPill channel={item.channel} />
        <ContentStatusBadge status={item.status} />
      </div>
      <p className="mt-4 text-sm">
        <span className="text-muted">{item.status === 'published' ? 'Published' : 'Planned for'} </span>
        <span className="font-semibold">
          {fmtDateLong(item.at)} {fmtTime(item.at)}
        </span>
      </p>
      {manage && item.movable && (
        <FormField label="Move to date" hint="Keeps the same time of day" required error={tried && !day ? 'Choose a date.' : undefined} className="mt-4">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        </FormField>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" asChild>
          <Link to={to}>
            <ExternalLink />
            Open
          </Link>
        </Button>
        {manage && item.movable && <Button type="submit">Move</Button>}
      </DialogFooter>
    </form>
  )
}
