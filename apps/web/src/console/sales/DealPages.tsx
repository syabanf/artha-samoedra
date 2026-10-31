import {
  addDays,
  countBy,
  DAY,
  dealMoveBlocker,
  fmtAgo,
  fmtDate,
  fmtIdr,
  fmtIdrShort,
  fmtPercent,
  fromDateInput,
  isOpenDeal,
  needsApproval,
  netPrice,
  newId,
  nowIso,
  stageOf,
  toDateInput,
  type AppState,
  initials,
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
import { ACTIVITY_KIND_LABEL, type Activity, type Deal, type DealStage } from '@artha/types'
import { CalendarClock, CircleCheck, CircleX, Handshake, Pencil, Plus, Search, TrendingUp, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { StageBadge } from '../../components/badges'
import { CodeLink, paths } from '../../components/links'
import { useAppState, useNow, useScoped } from '../../state/store'
import { DocumentsCard } from '../dataroom/DocumentsCard'
import { useAct } from '../dialogs'
import { priceInput, readPrice } from '../../lib/price'
import { TaskDialog, TaskRow } from './FollowUpsPage'
import { QuotationActions, QuotationLifecycle, QuotationStatusBadge } from './QuotationPages'

// ---------------------------------------------------------------- shared bits


export const Avatar = ({ name }: { name: string }) => (
  <span title={name} className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] font-bold text-on-ink">
    {initials(name)}
  </span>
)

/** Open stages in funnel order. */
export const openStages = (s: AppState) => s.stages.filter((st) => st.kind === 'open').sort((a, b) => a.probability - b.probability)

/** Days since the last stage change, or since the deal was created. */
export const daysInStage = (s: AppState, d: Deal, now: number) => {
  const moved = s.activities.find((a) => a.kind === 'stage' && a.ref.type === 'deal' && a.ref.id === d.id)
  return Math.max(0, Math.floor((now - Date.parse(moved?.at ?? d.createdAt)) / DAY))
}

export const isLate = (s: AppState, d: Deal, now: number) => isOpenDeal(s, d) && Date.parse(d.expectedCloseAt) < now


// ---------------------------------------------------------------- deal dialog

export function DealDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  editing: Deal | null
  onSaved?: (d: Deal) => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? `Edit ${editing.code}` : 'New deal'}
      description={editing ? 'The buyer and stage stay as they are. Move the stage from the pipeline or the deal page.' : 'A deal tracks one buyer and one property from first contact to booking.'}
    >
      <DealForm
        editing={editing}
        onDone={(saved) => {
          onOpenChange(false)
          if (saved) onSaved?.(saved)
        }}
      />
    </Dialog>
  )
}

function DealForm({ editing, onDone }: { editing: Deal | null; onDone: (d: Deal | null) => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    title: editing?.title ?? '',
    contactId: editing?.contactId ?? '',
    listingId: editing?.listingId ?? '',
    ownerId: editing?.ownerId ?? user.id,
    value: priceInput(editing?.value ?? 0),
    expectedCloseAt: toDateInput(editing?.expectedCloseAt ?? addDays(nowIso(), 30)),
    stageId: editing?.stageId ?? openStages(state)[0]?.id ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const listing = state.listings.find((l) => l.id === f.listingId)
  const contact = state.contacts.find((c) => c.id === f.contactId)
  const value = readPrice(f.value)
  const errors = {
    contactId: f.contactId ? null : 'Choose the buyer.',
    value: value && value > 0 ? null : 'Enter the deal value, for example 2.5 B.',
    expectedCloseAt: f.expectedCloseAt ? null : 'Pick the expected close date.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  const agents = state.users.filter((u) => u.status === 'active' || u.id === f.ownerId)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const title = f.title.trim() || `${contact?.name ?? 'Buyer'}, ${listing?.title ?? 'general search'}`
        const data = { title, listingId: f.listingId || null, ownerId: f.ownerId, value: value!, expectedCloseAt: fromDateInput(f.expectedCloseAt) }
        if (editing) {
          if (act({ type: 'deals/update', id: editing.id, patch: data }, 'Deal updated', editing.code)) onDone({ ...editing, ...data })
          return
        }
        const at = nowIso()
        const deal: Deal = {
          ...data,
          id: newId('del'),
          code: '',
          contactId: f.contactId,
          inquiryId: null,
          memberIds: [],
          stageId: f.stageId,
          lostReason: null,
          closedAt: null,
          createdAt: at,
          updatedAt: at,
        }
        if (act({ type: 'deals/create', deal }, 'Deal created', title)) onDone(deal)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Buyer" required error={show(errors.contactId)}>
          {editing ? (
            <Input readOnly value={contact?.name ?? ''} />
          ) : (
            <NativeSelect value={f.contactId} onChange={set('contactId')} className={f.contactId ? '' : '[&_select]:text-muted'}>
              <option value="">Choose contact</option>
              {state.contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.phone}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Property" hint="Optional while the buyer is still searching">
          <NativeSelect
            value={f.listingId}
            onChange={(e) => {
              const l = state.listings.find((x) => x.id === e.target.value)
              setF({ ...f, listingId: e.target.value, value: f.value || (l ? priceInput(l.price) : '') })
            }}
          >
            <option value="">No property yet</option>
            {state.listings
              .filter((l) => l.status !== 'delisted' || l.id === f.listingId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.title}
                </option>
              ))}
          </NativeSelect>
        </FormField>
        <FormField label="Title" hint="Leave empty to use the buyer and property" className="sm:col-span-2">
          <Input value={f.title} onChange={set('title')} placeholder="Rizky buys the Fatmawati house" />
        </FormField>
        <FormField label="Value" required error={show(errors.value)} hint={value ? fmtIdr(value) : 'For example 2.5 B or 850 M'}>
          <Input value={f.value} onChange={set('value')} placeholder="2.5 B" />
        </FormField>
        <FormField label="Expected close" required error={show(errors.expectedCloseAt)}>
          <Input type="date" value={f.expectedCloseAt} onChange={set('expectedCloseAt')} />
        </FormField>
        <FormField label="Owner" required>
          <NativeSelect value={f.ownerId} onChange={set('ownerId')}>
            {agents.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        {!editing && (
          <FormField label="Stage" required>
            <NativeSelect value={f.stageId} onChange={set('stageId')}>
              {openStages(state).map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Create deal'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- lost dialog

export function LostDialog({ deal, onOpenChange }: { deal: Deal | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!deal} onOpenChange={onOpenChange} title={deal ? `Mark ${deal.code} as lost` : 'Mark as lost'} description="The reason feeds the lost-deal report, so pick the closest one.">
      {deal && <LostForm deal={deal} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function LostForm({ deal, onDone }: { deal: Deal; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const lost = state.stages.find((st) => st.kind === 'lost')
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!reason || !lost) return
        if (act({ type: 'deals/move', id: deal.id, stageId: lost.id, lostReason: reason }, 'Deal marked lost', `${deal.code}: ${reason}`)) onDone()
      }}
    >
      <FormField label="Lost reason" required error={tried && !reason ? 'Pick a lost reason.' : undefined} hint="Edit the list in pipeline settings">
        <NativeSelect value={reason} onChange={(e) => setReason(e.target.value)} className={reason ? '' : '[&_select]:text-muted'}>
          <option value="">Choose a reason</option>
          {state.crmSettings.lostReasons.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="danger">
          Mark lost
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- list

export function DealsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const q = params.get('q') ?? ''
  const stageId = params.get('stage') || null
  const ownerId = params.get('owner') || null
  const late = params.get('late') === '1'
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const contactName = (d: Deal) => state.contacts.find((c) => c.id === d.contactId)?.name ?? '–'
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? '–'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (d: Deal) =>
    terms.every((t) => `${d.code} ${d.title} ${contactName(d)}`.toLowerCase().includes(t)) && (!ownerId || d.ownerId === ownerId) && (!late || isLate(state, d, now))
  const base = state.deals.filter(matches)
  const rows = base.filter((d) => !stageId || d.stageId === stageId)
  const counts = countBy(base, (d) => d.stageId)
  const filters = [q, stageId, ownerId, late].filter(Boolean).length
  const open = state.deals.filter((d) => isOpenDeal(state, d))
  const openValue = open.reduce((sum, d) => sum + d.value, 0)
  const weighted = open.reduce((sum, d) => sum + (d.value * (stageOf(state, d)?.probability ?? 0)) / 100, 0)
  const lateCount = open.filter((d) => isLate(state, d, now)).length
  const stageOrder = (d: Deal) => state.stages.indexOf(stageOf(state, d)!)
  const owners = state.users.filter((u) => state.deals.some((d) => d.ownerId === u.id))

  const columns: Column<Deal>[] = [
    {
      id: 'code',
      header: 'Deal',
      sortValue: (d) => d.code,
      cell: (d) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{d.code}</div>
          <div className="truncate text-sm">{d.title}</div>
          <div className="mt-1.5 sm:hidden">
            <StageBadge stage={stageOf(state, d)} />
          </div>
        </div>
      ),
    },
    { id: 'stage', header: 'Stage', hideBelow: 'sm', sortValue: stageOrder, cell: (d) => <StageBadge stage={stageOf(state, d)} /> },
    { id: 'contact', header: 'Buyer', hideBelow: 'lg', sortValue: contactName, cell: (d) => <span className="text-sm">{contactName(d)}</span> },
    {
      id: 'owner',
      header: 'Owner',
      hideBelow: 'md',
      sortValue: (d) => userName(d.ownerId),
      cell: (d) => (
        <span className="flex items-center gap-2 text-sm">
          <Avatar name={userName(d.ownerId)} />
          <span className="truncate">{userName(d.ownerId)}</span>
        </span>
      ),
    },
    {
      id: 'close',
      header: 'Expected close',
      hideBelow: 'xl',
      sortValue: (d) => d.expectedCloseAt,
      cell: (d) => (
        <span className={`whitespace-nowrap text-xs ${isLate(state, d, now) ? 'font-semibold text-accent' : 'text-muted'}`}>
          {d.closedAt ? `Closed ${fmtDate(d.closedAt)}` : fmtDate(d.expectedCloseAt)}
        </span>
      ),
    },
    { id: 'value', header: 'Value', align: 'right', sortValue: (d) => d.value, cell: (d) => <span className="font-semibold tabular-nums">{fmtIdrShort(d.value)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Deals"
        description="Every buyer in the funnel, one row per property they are working toward."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search deals"
              placeholder="Code, title or buyer"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('deal.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New deal
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Open deals" value={open.length} icon={<Handshake />} tone="ink" />
        <StatCard label="Pipeline value" value={fmtIdrShort(openValue)} icon={<Wallet />} />
        <StatCard label="Weighted" value={fmtIdrShort(weighted)} icon={<TrendingUp />} tone="info" hint="Value times stage probability" />
        <StatCard label="Past expected close" value={lateCount} icon={<CalendarClock />} tone={lateCount ? 'accent' : 'default'} active={late} onClick={() => set('late', late ? null : '1')} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!stageId} count={base.length} onClick={() => set('stage', null)}>
            All
          </Chip>
          {state.stages.map((st) => (
            <Chip key={st.id} active={stageId === st.id} count={counts[st.id] ?? 0} onClick={() => set('stage', stageId === st.id ? null : st.id)}>
              {st.name}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by owner" value={ownerId ?? ''} onChange={(e) => set('owner', e.target.value)}>
          <option value="">All owners</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.deals.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(d) => d.id}
          rowLabel={(d) => d.code}
          onRowClick={(d) => navigate(paths.deal(d.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${stageId}|${ownerId}|${late}`}
          rowClassName={(d) => (isOpenDeal(state, d) ? undefined : 'opacity-60')}
          empty={
            filters ? (
              <EmptyState compact title="No matching deals" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No deals yet" description="Create a deal here or from an inquiry." />
            )
          }
        />
      </div>
      <DealDialog open={creating} onOpenChange={setCreating} editing={null} onSaved={(d) => navigate(paths.deal(d.id))} />
    </div>
  )
}

// ---------------------------------------------------------------- detail

type Open = 'edit' | 'lost' | 'task' | null

export function DealDetailPage() {
  const { id } = useParams()
  const { state } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [open, setOpen] = useState<Open>(null)
  const d = state.deals.find((x) => x.id === id)
  if (!d) {
    return (
      <Card>
        <EmptyState title="Deal not found" description="This deal may have been removed." action={<BackButton fallback={paths.deals} />} />
      </Card>
    )
  }
  const stage = stageOf(state, d)
  const steps = openStages(state)
  const won = state.stages.find((st) => st.kind === 'won')
  const accepted = state.quotations.some((q) => q.dealId === d.id && q.status === 'accepted')
  const next = steps[steps.findIndex((st) => st.id === d.stageId) + 1]
  const target = stage?.kind !== 'open' ? null : accepted || !next ? won : next
  const blocker = target ? dealMoveBlocker(state, d, target.id) : null
  const closeTo = (v: boolean) => !v && setOpen(null)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.deals} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{d.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">{d.title}</h1>
        </div>
        {can('deal.manage') && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setOpen('edit')}>
              <Pencil />
              Edit
            </Button>
            {stage?.kind === 'open' && (
              <Button variant="danger" onClick={() => setOpen('lost')}>
                <CircleX />
                Mark lost
              </Button>
            )}
            {target && (
              <Button
                disabled={!!blocker}
                title={blocker ?? undefined}
                onClick={() => act({ type: 'deals/move', id: d.id, stageId: target.id }, target.kind === 'won' ? 'Deal won' : `Moved to ${target.name}`, d.code)}
              >
                <CircleCheck />
                {target.kind === 'won' ? 'Mark won' : `Move to ${target.name}`}
              </Button>
            )}
          </div>
        )}
      </div>
      {can('deal.manage') && blocker && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">{target?.kind === 'won' ? 'Cannot mark won yet:' : 'Cannot move yet:'}</span> {blocker}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <DealHero deal={d} stage={stage} steps={steps} />
        <DealFacts deal={d} now={now} />
      </div>
      <QuotationsCard deal={d} />
      <DocumentsCard dealId={d.id} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TasksCard deal={d} onAdd={() => setOpen('task')} />
        <MembersCard deal={d} />
      </div>
      <ActivityCard deal={d} />

      <DealDialog open={open === 'edit'} onOpenChange={closeTo} editing={d} />
      <LostDialog deal={open === 'lost' ? d : null} onOpenChange={closeTo} />
      <TaskDialog open={open === 'task'} onOpenChange={closeTo} presetRef={{ type: 'deal', id: d.id }} />
    </div>
  )
}

function DealHero({ deal, stage, steps }: { deal: Deal; stage: DealStage | undefined; steps: DealStage[] }) {
  const { state } = useAppState()
  const contact = state.contacts.find((c) => c.id === deal.contactId)
  const listing = state.listings.find((l) => l.id === deal.listingId)
  const at = steps.findIndex((st) => st.id === deal.stageId)
  return (
    <Card variant="ink" className="p-6">
      <div className="flex flex-wrap gap-1.5">
        <StageBadge stage={stage} />
        {stage && <Badge className="bg-white/10 text-white">{fmtPercent(stage.probability, 0)} likely</Badge>}
      </div>
      <ol className="mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Deal stages">
        {steps.map((st, i) => {
          const done = stage?.kind === 'won' || (stage?.kind === 'open' && i <= at)
          return (
            <li key={st.id} aria-current={st.id === deal.stageId ? 'step' : undefined} className="min-w-0">
              <div className={`h-1.5 rounded-full ${done ? 'bg-accent' : 'bg-white/15'}`} />
              <div className={`mt-2 truncate text-[11px] ${st.id === deal.stageId ? 'font-semibold text-white' : 'text-on-ink-muted'}`}>{st.name}</div>
            </li>
          )
        })}
      </ol>
      <div className="mt-5 text-3xl font-bold tracking-tight tabular-nums">{fmtIdrShort(deal.value)}</div>
      <div className="text-xs text-on-ink-muted">{fmtIdr(deal.value)}</div>
      <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="min-w-0 rounded-2xl bg-white/5 p-3">
          <div className="text-xs text-on-ink-muted">Buyer</div>
          {contact ? (
            <Link to={paths.contact(contact.id)} className="block truncate font-semibold hover:underline">
              {contact.name}
            </Link>
          ) : (
            <span className="font-semibold">–</span>
          )}
        </div>
        <div className="min-w-0 rounded-2xl bg-white/5 p-3">
          <div className="text-xs text-on-ink-muted">Property</div>
          {listing ? (
            <Link to={paths.listing(listing.id)} className="block truncate font-semibold hover:underline">
              {listing.code} · {listing.title}
            </Link>
          ) : (
            <span className="font-semibold">Still searching</span>
          )}
        </div>
      </div>
      {deal.lostReason && <p className="mt-3 rounded-2xl bg-accent/20 px-3 py-2 text-sm">Lost: {deal.lostReason}</p>}
    </Card>
  )
}

function DealFacts({ deal, now }: { deal: Deal; now: number }) {
  const { state } = useAppState()
  const owner = state.users.find((u) => u.id === deal.ownerId)
  const inquiry = state.inquiries.find((i) => i.id === deal.inquiryId)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <KeyValue
          bare
          items={[
            { label: 'Owner', value: owner?.name ?? '–' },
            {
              label: 'Expected close',
              value: <span className={isLate(state, deal, now) ? 'font-semibold text-accent' : undefined}>{fmtDate(deal.expectedCloseAt)}</span>,
            },
            { label: 'Closed', value: deal.closedAt ? fmtDate(deal.closedAt) : '–', hidden: !deal.closedAt },
            { label: 'In this stage', value: `${daysInStage(state, deal, now)} days` },
            { label: 'From inquiry', value: inquiry ? <CodeLink to={paths.inquiry(inquiry.id)} code={inquiry.code} /> : '–' },
            { label: 'Created', value: fmtDate(deal.createdAt) },
          ]}
        />
      </CardContent>
    </Card>
  )
}

function QuotationsCard({ deal }: { deal: Deal }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const rows = state.quotations.filter((q) => q.dealId === deal.id).sort((a, b) => b.version - a.version)
  const closed = !isOpenDeal(state, deal)
  return (
    <Card>
      <CardHeader
        action={
          can('deal.manage') &&
          !closed && (
            <Button variant="outline" size="sm" asChild>
              <Link to={paths.quotationNew(deal.id)}>
                <Plus />
                New quotation
              </Link>
            </Button>
          )
        }
      >
        <CardTitle>Quotations ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 && <EmptyState compact title="No quotations yet" description="Create one when the buyer asks for a price. The buyer must accept one before the deal is won." />}
        {rows.map((q) => (
          <div key={q.id} className={`rounded-2xl bg-surface-2 p-4 ${q.status === 'superseded' ? 'opacity-60' : ''}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CodeLink to={paths.quotation(q.id)} code={`${q.code} v${q.version}`} />
                  <QuotationStatusBadge status={q.status} />
                  {needsApproval(q) && q.status === 'draft' && <Badge variant="warning">Needs approval</Badge>}
                </div>
                <div className="mt-1 text-lg font-bold tabular-nums">{fmtIdr(netPrice(q))}</div>
                <div className="text-xs text-muted">
                  List {fmtIdrShort(q.listPrice)}, discount {fmtPercent(q.discountPct)}, valid until {fmtDate(q.validUntil)}
                </div>
              </div>
              <QuotationActions q={q} revise />
            </div>
            <div className="mt-3">
              <QuotationLifecycle q={q} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function TasksCard({ deal, onAdd }: { deal: Deal; onAdd: () => void }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const tasks = state.tasks
    .filter((t) => t.ref?.type === 'deal' && t.ref.id === deal.id)
    .sort((a, b) => Number(!!a.doneAt) - Number(!!b.doneAt) || a.dueAt.localeCompare(b.dueAt))
  return (
    <Card>
      <CardHeader
        action={
          can('deal.manage') && (
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus />
              Add
            </Button>
          )
        }
      >
        <CardTitle>Follow-ups ({tasks.filter((t) => !t.doneAt).length} open)</CardTitle>
      </CardHeader>
      <CardContent>
        {tasks.length ? (
          <ul className="space-y-2">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} showRef={false} />
            ))}
          </ul>
        ) : (
          <EmptyState compact title="No follow-ups" description="Plan the next call, message or site visit." />
        )}
      </CardContent>
    </Card>
  )
}

function MembersCard({ deal }: { deal: Deal }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const [pick, setPick] = useState('')
  const name = (id: string) => state.users.find((u) => u.id === id)?.name ?? id
  const candidates = state.users.filter((u) => u.status === 'active' && u.id !== deal.ownerId && !deal.memberIds.includes(u.id))
  const save = (memberIds: string[], message: string) => act({ type: 'deals/update', id: deal.id, patch: { memberIds } }, message, deal.code)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-2">
          {[deal.ownerId, ...deal.memberIds].map((uid, i) => (
            <li key={uid} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
              <Avatar name={name(uid)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{name(uid)}</span>
                <span className="block text-xs text-muted">{i === 0 ? 'Owner' : 'Team member'}</span>
              </span>
              {i > 0 && can('deal.manage') && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${name(uid)}`}
                  onClick={() => save(deal.memberIds.filter((m) => m !== uid), `${name(uid)} removed from the deal`)}
                >
                  <X />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {can('deal.manage') && candidates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <NativeSelect aria-label="Team member to add" value={pick} onChange={(e) => setPick(e.target.value)} className="min-w-0 flex-1">
              <option value="">Add a team member</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </NativeSelect>
            <Button
              variant="soft"
              disabled={!pick}
              onClick={() => {
                if (save([...deal.memberIds, pick], `${name(pick)} added to the deal`)) setPick('')
              }}
            >
              Add
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const LOG_KINDS: Activity['kind'][] = ['note', 'call', 'whatsapp', 'visit']

function ActivityCard({ deal }: { deal: Deal }) {
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const [kind, setKind] = useState<Activity['kind']>('note')
  const [text, setText] = useState('')
  const items = state.activities.filter((a) => a.ref.type === 'deal' && a.ref.id === deal.id)
  const log = () => {
    const activity: Activity = { id: newId('act'), at: nowIso(), by: user.id, kind, ref: { type: 'deal', id: deal.id }, text: text.trim() }
    if (act({ type: 'activities/add', activity }, `${ACTIVITY_KIND_LABEL[kind]} logged`, deal.code)) setText('')
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {can('deal.manage') && (
          <form
            noValidate
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) log()
            }}
          >
            <Textarea className="min-h-20" aria-label="What happened" placeholder="Called Rizky, he wants a second visit on Saturday." value={text} onChange={(e) => setText(e.target.value)} />
            <div className="flex flex-wrap items-center gap-2">
              <NativeSelect variant="inline" aria-label="Activity type" value={kind} onChange={(e) => setKind(e.target.value as Activity['kind'])}>
                {LOG_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ACTIVITY_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
              <Button type="submit" size="sm" disabled={!text.trim()} className="ml-auto">
                Log activity
              </Button>
            </div>
          </form>
        )}
        {items.length ? (
          <ol className="space-y-3">
            {items.map((a) => (
              <li key={a.id} className="flex gap-3 text-sm">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.kind === 'stage' || a.kind === 'quotation' ? 'bg-ink' : 'bg-silver'}`} />
                <span className="min-w-0">
                  <span className="font-semibold">{ACTIVITY_KIND_LABEL[a.kind]}</span> {a.text}
                  <span className="block text-xs text-muted">
                    {actorName(a.by)} · {fmtAgo(a.at)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState compact title="No activity yet" description="Calls, messages, visits and stage changes show up here." />
        )}
      </CardContent>
    </Card>
  )
}

