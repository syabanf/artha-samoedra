import {
  campaignSendBlocker,
  countBy,
  fillTemplate,
  fmtDate,
  fmtDateTime,
  fmtPercent,
  leadScore,
  newId,
  nowIso,
  segmentMembers,
  toDateInput,
  type AppState,
} from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  StatCard,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import {
  CAMPAIGN_STATUS_LABEL,
  CONTACT_KIND_LABEL,
  type Campaign,
  type CampaignStatus,
  type Contact,
  type Listing,
  type MessageTemplate,
} from '@artha/types'
import { CalendarClock, Eye, MessageCircleReply, Megaphone, Plus, Search, Send, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { NoAccess } from '../../components/NoAccess'

const STATUS_VARIANT: Record<CampaignStatus, BadgeVariant> = { draft: 'muted', scheduled: 'info', sending: 'warning', done: 'success', cancelled: 'outline' }
const STATUSES = Object.keys(CAMPAIGN_STATUS_LABEL) as CampaignStatus[]

const rate = (part: number, whole: number) => (whole ? (part / whole) * 100 : 0)

/** Contacts the campaign reaches: segment members who accept marketing. */
const recipientsOf = (s: AppState, segmentId: string, now: number) => {
  const seg = s.segments.find((x) => x.id === segmentId)
  return seg ? segmentMembers(s, { ...seg.rules, excludeOptOut: true }, now) : []
}

/** Fills the template the way the store does at send time. */
const preview = (tpl: MessageTemplate | undefined, contact: Contact | undefined, listing: Listing | undefined) =>
  tpl
    ? fillTemplate(tpl.body, {
        name: contact?.name ?? 'there',
        listing: listing?.title ?? '',
        price: listing ? `Rp ${(listing.price / 1e9).toFixed(2)} B` : '',
      })
    : 'Choose a template to see the message.'

// ---------------------------------------------------------------- list

export function CampaignsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<CampaignStatus | null>(null)
  if (!can('campaign.manage')) return <NoAccess />

  const segName = (id: string) => state.segments.find((s) => s.id === id)?.name ?? 'Deleted segment'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (c: Campaign) => terms.every((t) => `${c.name} ${segName(c.segmentId)}`.toLowerCase().includes(t))
  const searched = state.campaigns.filter(matches)
  const rows = searched.filter((c) => !status || c.status === status)
  const counts = countBy(searched, (c) => c.status)
  const filters = [q, status].filter(Boolean).length
  const clear = () => {
    setQ('')
    setStatus(null)
  }
  const total = state.campaigns.reduce(
    (a, c) => ({ sent: a.sent + c.stats.sent, delivered: a.delivered + c.stats.delivered, read: a.read + c.stats.read, replied: a.replied + c.stats.replied }),
    { sent: 0, delivered: 0, read: 0, replied: 0 },
  )

  const columns: Column<Campaign>[] = [
    {
      id: 'name',
      header: 'Campaign',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{c.name}</div>
          <div className="truncate text-xs text-muted">{segName(c.segmentId)}</div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', sortValue: (c) => STATUSES.indexOf(c.status), cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge> },
    {
      id: 'when',
      header: 'Send time',
      hideBelow: 'md',
      sortValue: (c) => c.scheduledAt,
      cell: (c) => <span className="whitespace-nowrap text-xs text-muted">{c.scheduledAt ? fmtDateTime(c.scheduledAt) : 'Not scheduled'}</span>,
    },
    { id: 'sent', header: 'Sent', align: 'right', hideBelow: 'sm', sortValue: (c) => c.stats.sent, cell: (c) => <span className="tabular-nums">{c.stats.sent}</span> },
    {
      id: 'read',
      header: 'Read rate',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (c) => rate(c.stats.read, c.stats.delivered),
      cell: (c) => <span className="tabular-nums">{c.stats.delivered ? fmtPercent(rate(c.stats.read, c.stats.delivered), 0) : '–'}</span>,
    },
    {
      id: 'replied',
      header: 'Replies',
      align: 'right',
      hideBelow: 'lg',
      sortValue: (c) => c.stats.replied,
      cell: (c) => <span className="tabular-nums">{c.stats.replied}</span>,
    },
  ]

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="WhatsApp broadcasts to a segment. Contacts who opted out are always skipped."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search campaigns"
              placeholder="Name or segment"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setQ('')}><X /></Button> : undefined}
            />
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New campaign
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Campaigns" value={state.campaigns.length} icon={<Megaphone />} tone="ink" />
        <StatCard
          label="Scheduled"
          value={counts.scheduled ?? 0}
          icon={<CalendarClock />}
          tone="info"
          active={status === 'scheduled'}
          onClick={() => setStatus(status === 'scheduled' ? null : 'scheduled')}
        />
        <StatCard label="Read rate" value={fmtPercent(rate(total.read, total.delivered), 0)} icon={<Eye />} tone="success" hint={`${total.read} of ${total.delivered} delivered`} />
        <StatCard label="Reply rate" value={fmtPercent(rate(total.replied, total.delivered), 0)} icon={<MessageCircleReply />} hint={`${total.replied} replies`} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={searched.length} onClick={() => setStatus(null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => setStatus(status === s ? null : s)}>
              {CAMPAIGN_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.campaigns.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear filters
            </Button>
          </span>
        )}
      </div>

      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(c) => c.id}
          rowLabel={(c) => c.name}
          onRowClick={(c) => navigate(paths.campaign(c.id))}
          initialSort={{ id: 'when', desc: true }}
          resetPageKey={`${q}|${status}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching campaigns" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No campaigns yet" description="Create a campaign to message a segment." />
            )
          }
        />
      </div>
      <Dialog open={creating} onOpenChange={setCreating} size="lg" title="New campaign" description="The campaign starts as a draft. Schedule it or send it from its page.">
        {creating && <CampaignForm onDone={(c) => { setCreating(false); if (c) navigate(paths.campaign(c.id)) }} />}
      </Dialog>
    </div>
  )
}

function CampaignForm({ onDone }: { onDone: (c: Campaign | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const user = useUser()
  const now = useNow()
  const marketing = state.templates.filter((t) => t.category === 'marketing')
  const [f, setF] = useState({ name: '', segmentId: state.segments[0]?.id ?? '', templateId: (marketing[0] ?? state.templates[0])?.id ?? '', listingId: '' })
  const [tried, setTried] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const recipients = recipientsOf(state, f.segmentId, now)
  const tpl = state.templates.find((t) => t.id === f.templateId)
  const listing = state.listings.find((l) => l.id === f.listingId)
  const errors = {
    name: f.name.trim() ? null : 'Name the campaign.',
    segmentId: f.segmentId ? null : 'Choose a segment.',
    templateId: tpl ? null : 'Choose a template.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const campaign: Campaign = {
          id: newId('cmp'),
          name: f.name.trim(),
          segmentId: f.segmentId,
          templateId: f.templateId,
          listingId: f.listingId || null,
          status: 'draft',
          recipientIds: [],
          scheduledAt: null,
          stats: { sent: 0, delivered: 0, read: 0, replied: 0, optedOut: 0, failed: 0 },
          createdBy: user.id,
          createdAt: nowIso(),
        }
        onDone(act({ type: 'campaigns/upsert', campaign }, 'Campaign created', `${campaign.name} is a draft`) ? campaign : null)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={show(errors.name)} className="sm:col-span-2">
          <Input value={f.name} onChange={set('name')} placeholder="November investor picks" />
        </FormField>
        <FormField label="Segment" required error={show(errors.segmentId)} hint={`${recipients.length} ${recipients.length === 1 ? 'contact accepts' : 'contacts accept'} marketing`}>
          <NativeSelect value={f.segmentId} onChange={set('segmentId')}>
            {!state.segments.length && <option value="">No segments yet</option>}
            {state.segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {recipientsOf(state, s.id, now).length}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Template" required error={show(errors.templateId)}>
          <NativeSelect value={f.templateId} onChange={set('templateId')}>
            {state.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Featured listing" hint="Fills {{listing}} and {{price}}" className="sm:col-span-2">
          <NativeSelect value={f.listingId} onChange={set('listingId')}>
            <option value="">No listing</option>
            {state.listings
              .filter((l) => l.status === 'active')
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.title}
                </option>
              ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="mt-4 rounded-2xl bg-surface-2 p-3">
        <div className="text-xs text-muted">{recipients[0] ? `Preview for ${recipients[0].name}` : 'Preview'}</div>
        <p className="mt-1 text-sm">{preview(tpl, recipients[0], listing)}</p>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">Create campaign</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- detail

export function CampaignDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [scheduling, setScheduling] = useState(false)
  const [q, setQ] = useState('')
  const c = state.campaigns.find((x) => x.id === id)
  if (!can('campaign.manage')) return <NoAccess />
  if (!c) {
    return (
      <Card>
        <EmptyState pageTitle title="Campaign not found" description="This campaign may have been deleted." action={<BackButton fallback={paths.campaigns} />} />
      </Card>
    )
  }

  const seg = state.segments.find((s) => s.id === c.segmentId)
  const tpl = state.templates.find((t) => t.id === c.templateId)
  const listing = state.listings.find((l) => l.id === c.listingId)
  // A sent campaign shows who it messaged; an open one shows who it would reach now.
  const recipients = c.status === 'done' ? state.contacts.filter((x) => c.recipientIds.includes(x.id)) : recipientsOf(state, c.segmentId, now)
  const skipped = seg ? segmentMembers(state, { ...seg.rules, excludeOptOut: false }, now).length - recipients.length : 0
  const blocker = campaignSendBlocker(state, c, now)
  const open = c.status === 'draft' || c.status === 'scheduled'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = recipients.filter((r) => terms.every((t) => `${r.name} ${r.phone} ${r.city}`.toLowerCase().includes(t)))
  const { stats } = c

  const columns: Column<Contact>[] = [
    {
      id: 'name',
      header: 'Contact',
      sortValue: (r) => r.name,
      cell: (r) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{r.name}</div>
          <div className="font-mono text-xs text-muted">{r.phone}</div>
        </div>
      ),
    },
    { id: 'kind', header: 'Type', hideBelow: 'sm', cell: (r) => <span className="text-sm">{CONTACT_KIND_LABEL[r.kind]}</span> },
    { id: 'city', header: 'City', hideBelow: 'md', sortValue: (r) => r.city, cell: (r) => <span className="text-sm">{r.city || '–'}</span> },
    { id: 'score', header: 'Score', align: 'right', sortValue: (r) => leadScore(state, r, now), cell: (r) => <span className="tabular-nums">{leadScore(state, r, now)}</span> },
  ]

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.campaigns} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant={STATUS_VARIANT[c.status]}>{CAMPAIGN_STATUS_LABEL[c.status]}</Badge>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{c.name}</h1>
        </div>
        {open && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => act({ type: 'campaigns/cancel', id: c.id }, 'Campaign cancelled', c.name)}>
              Cancel campaign
            </Button>
            <Button variant="outline" onClick={() => setScheduling(true)}>
              <CalendarClock />
              {c.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
            </Button>
            <Button disabled={!!blocker} title={blocker ?? undefined} onClick={() => act({ type: 'campaigns/send', id: c.id }, 'Campaign sent', `${recipients.length} messages queued`)}>
              <Send />
              Send now
            </Button>
          </div>
        )}
      </div>
      {open && blocker && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot send yet:</span> {blocker}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="text-xs text-on-ink-muted">{c.status === 'done' ? 'Sent' : c.status === 'scheduled' ? 'Goes out' : 'Send time'}</div>
          <div className="mt-1 text-2xl font-bold tracking-tight">{c.scheduledAt ? fmtDateTime(c.scheduledAt) : 'Not scheduled'}</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Segment</div>
              <div className="truncate font-semibold">{seg?.name ?? 'Deleted segment'}</div>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Recipients now</div>
              <div className="font-semibold tabular-nums">{recipients.length}</div>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Template</div>
              <div className="truncate font-semibold">{tpl?.name ?? 'Deleted template'}</div>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Listing</div>
              <div className="truncate font-semibold">{listing?.code ?? 'None'}</div>
            </div>
          </div>
          <p className="mt-4 rounded-2xl bg-white/10 p-3 text-sm">{preview(tpl, recipients[0], listing)}</p>
          {skipped > 0 && <p className="mt-2 text-xs text-on-ink-muted">{skipped} opted-out {skipped === 1 ? 'contact is' : 'contacts are'} skipped.</p>}
        </Card>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <StatCard label="Sent" value={stats.sent} icon={<Send />} tone="ink" hint={stats.failed ? `${stats.failed} failed` : undefined} />
          <StatCard label="Delivered" value={stats.delivered} hint={stats.sent ? fmtPercent(rate(stats.delivered, stats.sent), 0) : undefined} />
          <StatCard label="Read" value={stats.read} icon={<Eye />} tone="success" hint={`${fmtPercent(rate(stats.read, stats.delivered), 0)} read rate`} />
          <StatCard label="Replied" value={stats.replied} icon={<MessageCircleReply />} hint={`${fmtPercent(rate(stats.replied, stats.delivered), 0)} reply rate`} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recipients</CardTitle>
          <p className="text-xs text-muted">
            {c.status === 'done' ? `Messaged on ${fmtDate(c.scheduledAt ?? c.createdAt)}.` : 'Contacts in the segment who accept marketing.'}
          </p>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <Input variant="soft" inputClassName="rounded-full" aria-label="Search recipients" placeholder="Name, phone or city" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-64" />
          {q && (
            <span className="text-xs text-muted tabular-nums">
              {rows.length} of {recipients.length}
              <Button variant="ghost" size="sm" className="ml-1" onClick={() => setQ('')}>
                Clear filters
              </Button>
            </span>
          )}
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          initialSort={{ id: 'name', desc: false }}
          resetPageKey={q}
          empty={
            q ? (
              <EmptyState compact title="No matching recipients" action={<Button variant="outline" size="sm" onClick={() => setQ('')}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="Nobody to message" description="The segment has no contacts who accept marketing." />
            )
          }
        />
      </Card>
      <Dialog open={scheduling} onOpenChange={setScheduling} size="sm" title={`Schedule ${c.name}`} description="The campaign sends at this time to everyone in the segment who accepts marketing.">
        {scheduling && <ScheduleForm campaign={c} onDone={() => setScheduling(false)} />}
      </Dialog>
    </div>
  )
}

function ScheduleForm({ campaign, onDone }: { campaign: Campaign; onDone: () => void }) {
  const act = useAct()
  const now = useNow()
  const start = campaign.scheduledAt ?? new Date(now + 86_400_000).toISOString()
  const [date, setDate] = useState(toDateInput(start))
  const [time, setTime] = useState(campaign.scheduledAt ? new Date(start).toTimeString().slice(0, 5) : '19:00')
  const at = new Date(`${date}T${time || '00:00'}:00`)
  const error = Number.isNaN(at.getTime()) ? 'Pick a date and time.' : at.getTime() <= now ? 'Pick a time in the future.' : null
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (error) return
        if (act({ type: 'campaigns/schedule', id: campaign.id, scheduledAt: at.toISOString() }, 'Campaign scheduled', fmtDateTime(at.toISOString()))) onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Date" required>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Time" required>
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </FormField>
      </div>
      {error && <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!error}>
          Schedule
        </Button>
      </DialogFooter>
    </form>
  )
}
