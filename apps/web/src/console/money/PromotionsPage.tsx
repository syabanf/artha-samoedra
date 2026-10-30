import { addDays, blockerFor, countBy, fmtDate, fmtIdr, fmtIdrShort, fromDateInput, newId, nowIso, toDateInput, toMs } from '@artha/fixtures'
import {
  Badge,
  Banner,
  Button,
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
import { PROMOTION_KIND_LABEL, PUBLIC_LISTING_STATUSES, type Promotion, type PromotionKind } from '@artha/types'
import { CalendarClock, Plus, Search, Star, TrendingDown, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { CodeLink, paths } from '../../components/links'
import { priceInput, readPrice } from '../../lib/price'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'

type PromoState = 'scheduled' | 'running' | 'ended'
const STATES: PromoState[] = ['running', 'scheduled', 'ended']
const STATE_LABEL: Record<PromoState, string> = { scheduled: 'Scheduled', running: 'Running', ended: 'Ended' }
const STATE_VARIANT: Record<PromoState, BadgeVariant> = { scheduled: 'info', running: 'success', ended: 'muted' }
const KINDS = Object.keys(PROMOTION_KIND_LABEL) as PromotionKind[]

const stateOf = (p: Promotion, now: number): PromoState => (now < toMs(p.startsAt) ? 'scheduled' : now < toMs(p.endsAt) ? 'running' : 'ended')

export function PromotionsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null)
  const q = params.get('q') ?? ''
  const status = (params.get('state') as PromoState | null) || null
  const kind = (params.get('kind') as PromotionKind | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const manage = can('syndication.manage')

  const listingOf = (p: Promotion) => state.listings.find((l) => l.id === p.listingId)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.promotions.filter((p) => (!kind || p.kind === kind) && terms.every((t) => `${p.label} ${listingOf(p)?.code} ${listingOf(p)?.title}`.toLowerCase().includes(t)))
  const counts = countBy(searched, (p) => stateOf(p, now))
  const rows = searched.filter((p) => !status || stateOf(p, now) === status)
  const filters = [q, status, kind].filter(Boolean).length
  const running = state.promotions.filter((p) => stateOf(p, now) === 'running')
  const all = countBy(state.promotions, (p) => stateOf(p, now))
  const toggle = (s: PromoState) => set('state', status === s ? null : s)

  const columns: Column<Promotion>[] = [
    {
      id: 'listing',
      header: 'Listing',
      sortValue: (p) => listingOf(p)?.code ?? '',
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{listingOf(p)?.code ?? '–'}</div>
          <div className="truncate text-sm">{listingOf(p)?.title ?? 'Listing removed'}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
            <Badge variant={STATE_VARIANT[stateOf(p, now)]}>{STATE_LABEL[stateOf(p, now)]}</Badge>
            <span className="text-xs text-muted">{PROMOTION_KIND_LABEL[p.kind]}</span>
          </div>
        </div>
      ),
    },
    { id: 'state', header: 'State', hideBelow: 'sm', sortValue: (p) => STATES.indexOf(stateOf(p, now)), cell: (p) => <Badge variant={STATE_VARIANT[stateOf(p, now)]}>{STATE_LABEL[stateOf(p, now)]}</Badge> },
    { id: 'kind', header: 'Kind', hideBelow: 'md', sortValue: (p) => p.kind, cell: (p) => <span className="text-sm">{PROMOTION_KIND_LABEL[p.kind]}</span> },
    { id: 'label', header: 'Label', hideBelow: 'lg', cell: (p) => <span className="text-sm">{p.label || '–'}</span> },
    {
      id: 'period',
      header: 'Period',
      hideBelow: 'md',
      sortValue: (p) => p.startsAt,
      cell: (p) => (
        <span className="text-xs text-muted">
          {fmtDate(p.startsAt)} to {fmtDate(p.endsAt)}
        </span>
      ),
    },
    {
      id: 'price',
      header: 'Price',
      align: 'right',
      sortValue: (p) => p.promoPrice ?? listingOf(p)?.price ?? null,
      cell: (p) => {
        const l = listingOf(p)
        if (p.kind !== 'price_drop' || !p.promoPrice) return <span className="text-sm tabular-nums">{l ? fmtIdrShort(l.price) : '–'}</span>
        return (
          <div className="tabular-nums">
            <div className="font-semibold">{fmtIdrShort(p.promoPrice)}</div>
            {l && <div className="text-xs text-muted line-through">{fmtIdrShort(l.price)}</div>}
          </div>
        )
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Promotions"
        description="Featured spots and price drops on the website. A running price drop shows the old price struck through."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search promotions"
              placeholder="Listing or label"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus />
                New promotion
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Running" value={all.running ?? 0} icon={<Star />} tone="ink" active={status === 'running'} onClick={() => toggle('running')} />
        <StatCard label="Featured now" value={running.filter((p) => p.kind === 'featured').length} icon={<Star />} tone="info" />
        <StatCard label="Price drops now" value={running.filter((p) => p.kind === 'price_drop').length} icon={<TrendingDown />} tone="success" />
        <StatCard label="Scheduled" value={all.scheduled ?? 0} icon={<CalendarClock />} active={status === 'scheduled'} onClick={() => toggle('scheduled')} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('state', null)}>
            All
          </Chip>
          {STATES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => toggle(s)}>
              {STATE_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by kind" value={kind ?? ''} onChange={(e) => set('kind', e.target.value)}>
          <option value="">All kinds</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {PROMOTION_KIND_LABEL[k]}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.promotions.length}
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
          getRowKey={(p) => p.id}
          rowLabel={(p) => `${listingOf(p)?.code ?? ''} ${p.label}`}
          onRowClick={manage ? (p) => setEditing(p) : undefined}
          initialSort={{ id: 'period', desc: true }}
          resetPageKey={`${q}|${status}|${kind}`}
          rowClassName={(p) => (stateOf(p, now) === 'ended' ? 'opacity-60' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching promotions" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No promotions yet" description="Feature a listing or run a price drop to lift it on the website." />
            )
          }
        />
      </div>
      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        title={editing === 'new' ? 'New promotion' : 'Edit promotion'}
        description="Featured listings sort first on the website. A price drop shows its price instead of the asking price."
      >
        {editing && <PromotionForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function PromotionForm({ editing, onDone }: { editing: Promotion | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [id] = useState(() => editing?.id ?? newId('prm'))
  const listings = state.listings.filter((l) => PUBLIC_LISTING_STATUSES.includes(l.status) || l.id === editing?.listingId)
  const today = nowIso()
  const [f, setF] = useState({
    listingId: editing?.listingId ?? listings[0]?.id ?? '',
    kind: editing?.kind ?? ('featured' as PromotionKind),
    label: editing?.label ?? '',
    start: toDateInput(editing?.startsAt ?? today),
    end: toDateInput(editing?.endsAt ?? addDays(today, 30)),
    promoPrice: editing?.promoPrice ? priceInput(editing.promoPrice) : '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const listing = state.listings.find((l) => l.id === f.listingId)
  const promoPrice = f.kind === 'price_drop' ? readPrice(f.promoPrice) : null
  const errors = {
    listingId: listing ? null : 'Pick a live listing.',
    label: f.label.trim() ? null : 'Enter a short label, for example Price cut.',
    start: f.start ? null : 'Pick the start date.',
    end: f.end ? null : 'Pick the end date.',
    promoPrice: f.kind !== 'price_drop' || promoPrice ? null : 'Enter the promotion price, for example 1.2 B.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  const ready = !Object.values(errors).some(Boolean)
  const promotion: Promotion = {
    id,
    listingId: f.listingId,
    kind: f.kind,
    startsAt: f.start ? fromDateInput(f.start) : today,
    endsAt: f.end ? fromDateInput(f.end) : today,
    promoPrice,
    label: f.label.trim(),
    createdAt: editing?.createdAt ?? today,
  }
  const blocker = ready ? blockerFor(state, { type: 'promotions/upsert', promotion }) : null

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!ready) return
        if (act({ type: 'promotions/upsert', promotion }, editing ? 'Promotion saved' : 'Promotion created', `${listing?.code ?? ''} · ${promotion.label}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Listing" required error={show(errors.listingId)} className="sm:col-span-2">
          <NativeSelect value={f.listingId} onChange={set('listingId')}>
            {listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.code} · {l.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Kind" required>
          <NativeSelect value={f.kind} onChange={set('kind')}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {PROMOTION_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Label" required error={show(errors.label)} hint="Shown on the listing card">
          <Input value={f.label} onChange={set('label')} placeholder="Editor pick" />
        </FormField>
        <FormField label="Starts" required error={show(errors.start)}>
          <Input type="date" value={f.start} onChange={set('start')} />
        </FormField>
        <FormField label="Ends" required error={show(errors.end)}>
          <Input type="date" value={f.end} onChange={set('end')} />
        </FormField>
        {f.kind === 'price_drop' && (
          <FormField
            label="Promotion price"
            required
            error={show(errors.promoPrice)}
            hint={listing ? `Asking price ${fmtIdr(listing.price)}${promoPrice ? `, promotion ${fmtIdr(promoPrice)}` : ''}` : undefined}
            className="sm:col-span-2"
          >
            <Input value={f.promoPrice} onChange={set('promoPrice')} placeholder="1.2 B" />
          </FormField>
        )}
      </div>
      {listing && (
        <p className="mt-3 text-xs text-muted">
          <CodeLink to={paths.listing(listing.id)} code={listing.code} /> asks {fmtIdr(listing.price)}.
        </p>
      )}
      {blocker && (
        <Banner tone="warning" title="Cannot save yet" className="mt-4">
          {blocker}
        </Banner>
      )}
      <DialogFooter>
        {editing && (
          <Button
            type="button"
            variant="danger"
            className="sm:mr-auto"
            onClick={() => {
              if (!confirmRemove) return setConfirmRemove(true)
              if (act({ type: 'promotions/remove', id: editing.id }, 'Promotion removed', editing.label)) onDone()
            }}
          >
            {confirmRemove ? 'Confirm remove' : 'Remove'}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!blocker} title={blocker ?? undefined}>
          {editing ? 'Save' : 'Create promotion'}
        </Button>
      </DialogFooter>
    </form>
  )
}
