import { addDays, contactByPhone, countBy, filterInquiries, FINANCING_LABEL, fmtAgo, fmtDateTime, fmtIdrShort, newId, nowIso, PURPOSE_LABEL, TIMELINE_LABEL } from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Chip, ChipRow, DataTable, EmptyState, Input, KeyValue, PageHeader, type BadgeVariant, type Column } from '@artha/ui'
import {
  INQUIRY_CHANNEL_LABEL,
  INQUIRY_STATUS_FLOW,
  INQUIRY_STATUS_LABEL,
  INQUIRY_STATUSES,
  TEMPERATURE_LABEL,
  type Contact,
  type Deal,
  type Inquiry,
  type InquiryQualification,
  type InquiryStatus,
  type Temperature,
} from '@artha/types'
import { Handshake, MessageCircle, Search, UserCheck, X } from 'lucide-react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { InquiryStatusBadge } from '../../components/badges'
import { CodeLink, paths } from '../../components/links'
import { useScoped } from '../../state/store'
import { useAct } from '../dialogs'

export function InquiriesPage() {
  const { state, listingCode } = useScoped()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as InquiryStatus | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const rows = filterInquiries(state.inquiries, { query: q, status })
  const counts = countBy(filterInquiries(state.inquiries, { query: q }), (i) => i.status)
  const filters = [q, status].filter(Boolean).length

  const columns: Column<Inquiry>[] = [
    {
      id: 'name',
      header: 'Prospect',
      sortValue: (i) => i.name,
      cell: (i) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{i.code}</div>
          <div className="truncate text-sm">{i.name}</div>
          <div className="mt-1.5 sm:hidden">
            <InquiryStatusBadge status={i.status} />
          </div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (i) => INQUIRY_STATUSES.indexOf(i.status), cell: (i) => <InquiryStatusBadge status={i.status} /> },
    { id: 'listing', header: 'Listing', hideBelow: 'md', cell: (i) => (i.listingId ? <CodeLink to={paths.listing(i.listingId)} code={listingCode(i.listingId)} /> : <span className="text-xs text-muted">General search</span>) },
    { id: 'message', header: 'Message', hideBelow: 'lg', cell: (i) => <span className="line-clamp-1 text-sm text-muted">{i.message}</span> },
    { id: 'channel', header: 'Channel', hideBelow: 'xl', cell: (i) => INQUIRY_CHANNEL_LABEL[i.channel] },
    { id: 'at', header: 'Received', align: 'right', sortValue: (i) => i.createdAt, cell: (i) => <span className="whitespace-nowrap text-xs text-muted">{fmtAgo(i.createdAt)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Inquiries"
        description="Prospective buyers and tenants from Jessy chat, WhatsApp and Instagram. Handle new ones the same day."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search inquiries"
            placeholder="Code, name, number or message"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={Object.values(counts).reduce((a, b) => a + b, 0)} onClick={() => set('status', null)}>
            All
          </Chip>
          {INQUIRY_STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {INQUIRY_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.inquiries.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} filter{filters === 1 ? '' : 's'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(i) => i.id}
          rowLabel={(i) => i.code}
          onRowClick={(i) => navigate(paths.inquiry(i.id))}
          initialSort={{ id: 'at', desc: true }}
          resetPageKey={`${q}|${status}`}
          rowClassName={(i) => (i.status === 'new' ? 'bg-accent-soft/40' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching inquiries" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No inquiries yet" description="Inquiries arrive when visitors leave their contact details in Jessy chat." />
            )
          }
        />
      </div>
    </div>
  )
}

export function InquiryDetailPage() {
  const { id } = useParams()
  const { state, maps } = useScoped()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const inq = state.inquiries.find((i) => i.id === id)
  if (!inq) {
    return (
      <Card>
        <EmptyState title="Inquiry not found" description="This inquiry may have been deleted." action={<BackButton fallback={paths.inquiries} />} />
      </Card>
    )
  }
  const listing = inq.listingId ? maps.listings.get(inq.listingId) : undefined
  const owner = state.users.find((u) => u.id === inq.ownerId)
  const step = INQUIRY_STATUS_FLOW.indexOf(inq.status)
  const next = step >= 0 && step < INQUIRY_STATUS_FLOW.length - 1 ? INQUIRY_STATUS_FLOW[step + 1] : null
  const closed = inq.status === 'won' || inq.status === 'lost'
  const wa = `https://wa.me/62${inq.phone.replace(/^0/, '')}`

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.inquiries} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs font-semibold text-muted">{inq.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">{inq.name}</h1>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap gap-2">
          {can('inquiry.manage') && !closed && (
            <>
              <Button variant="outline" asChild>
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  WhatsApp
                </a>
              </Button>
              {!owner && (
                <Button variant="outline" onClick={() => act({ type: 'inquiries/assign', id: inq.id, ownerId: user.id }, 'Inquiry taken', `${inq.code} handled by ${user.name}`)}>
                  <UserCheck />
                  Take
                </Button>
              )}
              <Button variant="ghost" onClick={() => act({ type: 'inquiries/setStatus', id: inq.id, status: 'lost' }, 'Inquiry closed as lost', inq.code)}>
                Mark lost
              </Button>
              {next && (
                <Button onClick={() => act({ type: 'inquiries/setStatus', id: inq.id, status: next }, `Status moved to ${INQUIRY_STATUS_LABEL[next]}`, inq.code)}>
                  Move to {INQUIRY_STATUS_LABEL[next]}
                </Button>
              )}
            </>
          )}
          <InquiryDealButton inquiry={inq} />
        </div>
      </div>

      <Card className="p-5">
        <ol className="grid grid-cols-5 gap-2" aria-label="Inquiry stages">
          {INQUIRY_STATUS_FLOW.map((s, i) => {
            const done = inq.status !== 'lost' && i <= step
            return (
              <li key={s} aria-current={s === inq.status ? 'step' : undefined} className="min-w-0">
                <div className={`h-1.5 rounded-full ${done ? 'bg-ink' : 'bg-surface'}`} />
                <div className={`mt-2 truncate text-xs ${s === inq.status ? 'font-semibold text-foreground' : 'text-muted'}`}>{INQUIRY_STATUS_LABEL[s]}</div>
              </li>
            )
          })}
        </ol>
        {inq.status === 'lost' && <p className="mt-3 text-sm text-muted">This inquiry was closed as lost.</p>}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              items={[
                { label: 'Status', value: <InquiryStatusBadge status={inq.status} /> },
                { label: 'Number', value: <span className="font-mono text-xs">{inq.phone}</span> },
                { label: 'Channel', value: INQUIRY_CHANNEL_LABEL[inq.channel] },
                { label: 'Budget', value: inq.budget ? fmtIdrShort(inq.budget) : '–' },
                { label: 'Handled by', value: owner?.name ?? <span className="text-muted">Nobody yet</span> },
                { label: 'Received', value: fmtDateTime(inq.createdAt) },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Message</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="rounded-2xl bg-surface-2 p-4 text-sm">{inq.message || 'No message.'}</p>
            {listing ? (
              <Link to={paths.listing(listing.id)} className="block rounded-2xl border border-border p-4 hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                <div className="font-mono text-xs font-semibold text-muted">{listing.code}</div>
                <div className="font-semibold">{listing.title}</div>
                <div className="text-sm text-muted">{fmtIdrShort(listing.price)} · {listing.city}</div>
              </Link>
            ) : (
              <p className="text-sm text-muted">General search, no listing chosen yet.</p>
            )}
          </CardContent>
        </Card>
        {inq.qualification && <QualificationCard qualification={inq.qualification} budget={inq.budget} />}
      </div>
    </div>
  )
}

const TEMPERATURE_VARIANT: Record<Temperature, BadgeVariant> = { hot: 'accent', warm: 'warning', cold: 'info' }

/** The answers Jessy collected in the chat before handing the buyer over. */
function QualificationCard({ qualification: q, budget }: { qualification: InquiryQualification; budget: number | null }) {
  const answer = (v: string | null) => v ?? <span className="text-muted">Skipped</span>
  return (
    <Card>
      <CardHeader action={<Badge variant={TEMPERATURE_VARIANT[q.temperature]}>{TEMPERATURE_LABEL[q.temperature]}</Badge>}>
        <CardTitle>Qualification</CardTitle>
      </CardHeader>
      <CardContent>
        <KeyValue
          bare
          items={[
            { label: 'Budget', value: answer(budget ? fmtIdrShort(budget) : null) },
            { label: 'Timeline', value: answer(q.timeline && TIMELINE_LABEL[q.timeline]) },
            { label: 'Financing', value: answer(q.financing && FINANCING_LABEL[q.financing]) },
            { label: 'Purpose', value: answer(q.purpose && PURPOSE_LABEL[q.purpose]) },
          ]}
        />
        <p className="mt-2 text-xs text-muted">Collected by Jessy in the website chat. Hot leads plan to buy soon and can pay.</p>
      </CardContent>
    </Card>
  )
}

/** Opens the deal made from this inquiry, or creates one in Qualified with the buyer matched by phone. */
function InquiryDealButton({ inquiry }: { inquiry: Inquiry }) {
  const { state } = useScoped()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const existing = state.deals.find((d) => d.inquiryId === inquiry.id)
  if (existing) {
    return (
      <Button variant="outline" onClick={() => navigate(paths.deal(existing.id))}>
        <Handshake />
        Open deal
      </Button>
    )
  }
  if (!can('deal.manage')) return null
  const create = () => {
    const at = nowIso()
    const listing = state.listings.find((l) => l.id === inquiry.listingId)
    let contact = contactByPhone(state, inquiry.phone)
    if (!contact) {
      const fresh: Contact = {
        id: newId('con'),
        name: inquiry.name,
        phone: inquiry.phone,
        email: '',
        kind: 'buyer',
        accountId: null,
        source: inquiry.channel,
        city: listing?.city ?? '',
        tags: [],
        optOut: false,
        ownerId: inquiry.ownerId,
        custom: {},
        createdAt: at,
      }
      if (!act({ type: 'contacts/upsert', contact: fresh }, 'Contact created', fresh.name)) return
      contact = fresh
    }
    const deal: Deal = {
      id: newId('del'),
      code: '',
      title: `${inquiry.name}, ${listing?.title ?? 'general search'}`,
      contactId: contact.id,
      listingId: inquiry.listingId,
      inquiryId: inquiry.id,
      ownerId: inquiry.ownerId ?? user.id,
      memberIds: [],
      stageId: 'stg-qualified',
      value: inquiry.budget ?? listing?.price ?? 0,
      expectedCloseAt: addDays(at, 30),
      lostReason: null,
      closedAt: null,
      createdAt: at,
      updatedAt: at,
    }
    if (act({ type: 'deals/create', deal }, 'Deal created', `${inquiry.code} is now in Qualified`)) navigate(paths.deal(deal.id))
  }
  return (
    <Button variant="outline" onClick={create}>
      <Handshake />
      Create deal
    </Button>
  )
}
