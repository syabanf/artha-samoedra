import { channelBlocker, countBy, fmtDateTime, NOTIFY_EVENT_LABEL, nowIso, OUTBOX_STATUS_LABEL, retryBlocker } from '@artha/fixtures'
import { Badge, Banner, Button, DataTable, EmptyState, Input, KeyValue, NativeSelect, PageHeader, Sheet, StatCard, Chip, ChipRow, toast, type BadgeVariant, type Column } from '@artha/ui'
import { NOTIFY_CHANNEL_LABEL, type NotifyChannel, type NotifyEvent, type OutboxItem, type OutboxStatus } from '@artha/types'
import { Bell, CircleAlert, Clock, Mail, MessageCircle, RotateCcw, Search, Send, Smartphone, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { refPath } from '../layouts/notifications'
import { useAct } from '../dialogs'

const STATUS_VARIANT: Record<OutboxStatus, BadgeVariant> = { queued: 'warning', sent: 'info', delivered: 'success', failed: 'accent' }
const CHANNEL_ICON: Record<NotifyChannel, LucideIcon> = { in_app: Bell, whatsapp: MessageCircle, email: Mail, push: Smartphone }
const STATUSES = Object.keys(OUTBOX_STATUS_LABEL) as OutboxStatus[]
const CHANNELS = Object.keys(NOTIFY_CHANNEL_LABEL) as NotifyChannel[]
const EVENTS = Object.keys(NOTIFY_EVENT_LABEL) as NotifyEvent[]

const pushSupported = () => typeof Notification !== 'undefined'

/** Asks the browser for push permission; queued push items for this user go out once it is granted. */
function PushBanner() {
  const [permission, setPermission] = useState(() => (pushSupported() ? Notification.permission : 'denied'))
  if (permission === 'granted') return null
  if (!pushSupported() || permission === 'denied')
    return (
      <Banner tone="neutral" title="Push notifications are off in this browser">
        Push items stay queued. Allow notifications for this site in the browser settings to receive them here.
      </Banner>
    )
  const ask = async () => {
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') toast('Push notifications allowed', { tone: 'success', description: 'Queued push items for you go out now.' })
  }
  return (
    <Banner tone="info" title="Push items wait for browser permission" actions={<Button size="sm" variant="outline" onClick={() => void ask()}>Allow push</Button>}>
      Allow notifications to receive push items on this device.
    </Banner>
  )
}

export function OutboxPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const manage = can('integrations.manage')
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<OutboxItem | null>(null)
  const q = params.get('q') ?? ''
  const status = (params.get('status') as OutboxStatus | null) || null
  const channel = (params.get('channel') as NotifyChannel | null) || null
  const event = (params.get('event') as NotifyEvent | null) || null
  const userId = params.get('user') || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? id
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const base = state.outbox.filter((o) => {
    const text = `${o.title} ${o.body} ${o.to} ${userName(o.userId)}`.toLowerCase()
    return terms.every((t) => text.includes(t)) && (!channel || o.channel === channel) && (!event || o.event === event) && (!userId || o.userId === userId)
  })
  const rows = base.filter((o) => !status || o.status === status)
  const counts = countBy(base, (o) => o.status)
  const filters = [q, status, channel, event, userId].filter(Boolean).length
  const recipients = state.users.filter((u) => state.outbox.some((o) => o.userId === u.id))

  const failed = rows.filter((o) => o.status === 'failed')
  const retryable = failed.filter((o) => !channelBlocker(state, o.channel)).map((o) => o.id)
  const retry = (ids: string[], label: string) => act({ type: 'outbox/retry', ids, at: nowIso() }, ids.length === 1 ? 'Sent again' : `${ids.length} items sent again`, label)

  const columns: Column<OutboxItem>[] = [
    {
      id: 'event',
      header: 'Notification',
      sortValue: (o) => o.title,
      cell: (o) => (
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted">{NOTIFY_EVENT_LABEL[o.event]}</div>
          <div className="truncate text-sm font-medium">{o.title}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
            <Badge variant={STATUS_VARIANT[o.status]}>{OUTBOX_STATUS_LABEL[o.status]}</Badge>
            <Badge variant="outline">{NOTIFY_CHANNEL_LABEL[o.channel]}</Badge>
          </div>
        </div>
      ),
    },
    {
      id: 'channel',
      header: 'Channel',
      hideBelow: 'sm',
      sortValue: (o) => o.channel,
      cell: (o) => {
        const Icon = CHANNEL_ICON[o.channel]
        return (
          <span className="flex items-center gap-1.5 whitespace-nowrap text-sm">
            <Icon className="size-3.5 shrink-0 text-muted" />
            {NOTIFY_CHANNEL_LABEL[o.channel]}
          </span>
        )
      },
    },
    {
      id: 'to',
      header: 'Recipient',
      hideBelow: 'md',
      sortValue: (o) => userName(o.userId),
      cell: (o) => (
        <div className="min-w-0">
          <div className="truncate text-sm">{userName(o.userId)}</div>
          {o.to !== o.userId && <div className="truncate font-mono text-xs text-muted">{o.to}</div>}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'sm',
      sortValue: (o) => STATUSES.indexOf(o.status),
      cell: (o) => (
        <div className="min-w-0">
          <Badge variant={STATUS_VARIANT[o.status]}>{OUTBOX_STATUS_LABEL[o.status]}</Badge>
          {o.error && <div className="mt-1 line-clamp-2 text-xs text-accent-strong">{o.error}</div>}
        </div>
      ),
    },
    { id: 'at', header: 'Created', align: 'right', hideBelow: 'lg', sortValue: (o) => o.at, cell: (o) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(o.at)}</span> },
    {
      id: 'actions',
      header: '',
      width: '7rem',
      align: 'right',
      cell: (o) => {
        if (!manage || o.status !== 'failed') return null
        const blocker = channelBlocker(state, o.channel)
        return (
          <Button
            variant="outline"
            size="sm"
            disabled={!!blocker}
            title={blocker ?? undefined}
            onClick={(e) => {
              e.stopPropagation()
              retry([o.id], o.title)
            }}
          >
            <RotateCcw />
            Retry
          </Button>
        )
      },
    },
  ]

  const clear = () => setParams({}, { replace: true })
  const bulkBlocker = failed.length && !retryable.length ? retryBlocker(state, failed.map((o) => o.id)) : null

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notification outbox"
        description="Every notification the rules sent, per channel and recipient. Failed WhatsApp and email items can be sent again once their integration is connected."
        className="mb-2 [&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search the outbox"
              placeholder="Title, recipient or address"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {manage && failed.length > 0 && (
              <Button disabled={!retryable.length} title={bulkBlocker ?? undefined} onClick={() => retry(retryable, 'Failed items in this view')}>
                <RotateCcw />
                Retry {retryable.length || failed.length} failed
              </Button>
            )}
          </>
        }
      />
      <PushBanner />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Queued" value={counts.queued ?? 0} icon={<Clock />} tone={counts.queued ? 'warning' : 'default'} active={status === 'queued'} onClick={() => set('status', status === 'queued' ? null : 'queued')} />
        <StatCard label="Sent" value={counts.sent ?? 0} icon={<Send />} tone="ink" active={status === 'sent'} onClick={() => set('status', status === 'sent' ? null : 'sent')} />
        <StatCard label="Delivered in app" value={counts.delivered ?? 0} icon={<Bell />} active={status === 'delivered'} onClick={() => set('status', status === 'delivered' ? null : 'delivered')} />
        <StatCard label="Failed" value={counts.failed ?? 0} icon={<CircleAlert />} tone={counts.failed ? 'danger' : 'default'} active={status === 'failed'} onClick={() => set('status', status === 'failed' ? null : 'failed')} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="w-full lg:w-auto lg:flex-1">
          <Chip active={!status} count={base.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {OUTBOX_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by channel" value={channel ?? ''} onChange={(e) => set('channel', e.target.value)}>
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {NOTIFY_CHANNEL_LABEL[c]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect variant="inline" aria-label="Filter by event" value={event ?? ''} onChange={(e) => set('event', e.target.value)}>
          <option value="">All events</option>
          {EVENTS.map((ev) => (
            <option key={ev} value={ev}>
              {NOTIFY_EVENT_LABEL[ev]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect variant="inline" aria-label="Filter by recipient" value={userId ?? ''} onChange={(e) => set('user', e.target.value)}>
          <option value="">All recipients</option>
          {recipients.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.outbox.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(o) => o.id}
        rowLabel={(o) => o.title}
        onRowClick={setOpen}
        initialSort={{ id: 'at', desc: true }}
        resetPageKey={`${q}|${status}|${channel}|${event}|${userId}`}
        rowClassName={(o) => (o.status === 'failed' ? 'bg-accent-soft/40' : undefined)}
        empty={
          filters ? (
            <EmptyState compact title="No notifications match" description="Change the search or clear filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState compact icon={<Bell />} title="Nothing sent yet" description="Notifications appear here when a rule in Notifications matches an event." />
          )
        }
      />
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)} title={open?.title ?? 'Notification'} description={open ? NOTIFY_EVENT_LABEL[open.event] : undefined}>
        {open && <OutboxDetail item={state.outbox.find((o) => o.id === open.id) ?? open} userName={userName} />}
      </Sheet>
    </div>
  )
}

function OutboxDetail({ item: o, userName }: { item: OutboxItem; userName: (id: string) => string }) {
  const { state } = useAppState()
  const rule = state.notificationRules.find((r) => r.id === o.ruleId)
  return (
    <div className="space-y-4 p-4">
      <p className="rounded-2xl bg-surface-2 p-3 text-sm">{o.body}</p>
      <KeyValue
        bare
        size="sm"
        items={[
          { label: 'Status', value: <Badge variant={STATUS_VARIANT[o.status]}>{OUTBOX_STATUS_LABEL[o.status]}</Badge> },
          { label: 'Problem', value: <span className="text-accent-strong">{o.error}</span>, hidden: !o.error },
          { label: 'Channel', value: NOTIFY_CHANNEL_LABEL[o.channel] },
          { label: 'Recipient', value: userName(o.userId) },
          { label: 'Address', value: <span className="font-mono text-xs">{o.to}</span>, hidden: o.to === o.userId },
          { label: 'Rule', value: rule ? <Link to={paths.notifications} className="font-medium text-accent-strong hover:underline">{rule.event}</Link> : o.ruleId },
          { label: 'Created', value: fmtDateTime(o.at) },
          { label: 'Attempts', value: o.attempts },
          { label: 'Read', value: o.readAt ? fmtDateTime(o.readAt) : 'Not yet', hidden: o.channel !== 'in_app' },
        ]}
      />
      {o.ref && (
        <Button asChild variant="outline" size="sm">
          <Link to={refPath(o.ref)}>Open the record</Link>
        </Button>
      )}
    </div>
  )
}
