import { fmtIdr, fmtIdrShort, fmtPercent, partyRule, shareAmounts, type ShareAmounts } from '@artha/fixtures'
import { Button, Chip, ChipRow, DataTable, EmptyState, Input, NativeSelect, PageHeader, StatCard, type Column } from '@artha/ui'
import type { Listing, ProfitShare } from '@artha/types'
import { Building2, CircleDollarSign, HandCoins, Search, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { ListingStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useScoped } from '../../state/store'
import { ShareDialog, SplitBar, usePartyName } from '../listing/ShareParts'
import { SharingNav } from '../sharing/SettlementPages'

type View = 'pipeline' | 'sold' | 'all'
type Shape = 'three' | 'fixed' | 'fee'
interface Row {
  share: ProfitShare
  listing: Listing
  amt: ShareAmounts
}

const VIEWS: [View, string][] = [
  ['pipeline', 'Pipeline (live)'],
  ['sold', 'Realized (sold)'],
  ['all', 'All'],
]

const inView = (v: View, r: Row) => v === 'all' || (v === 'sold' ? r.listing.status === 'sold' : r.listing.status === 'active' || r.listing.status === 'reserved')

/** Schemes with a fixed party, or charged as a fixed fee. */
const hasShape = (shape: Shape, s: ProfitShare) =>
  shape === 'fee' ? s.commissionMode === 'fixed' : shape === 'fixed' ? s.parties.some((p) => p.mode === 'fixed') : s.parties.length > 3

export function ProfitSharingPage() {
  const { state, maps } = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const nameOf = usePartyName()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<Row | null>(null)
  const view = (params.get('view') as View | null) || 'pipeline'
  const q = params.get('q') ?? ''
  const shape = (params.get('shape') as Shape | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const all: Row[] = state.profitShares.flatMap((share) => {
    const listing = maps.listings.get(share.listingId)
    return listing ? [{ share, listing, amt: shareAmounts(share, listing) }] : []
  })
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (r: Row) =>
    (!shape || hasShape(shape, r.share)) &&
    terms.every((t) => `${r.listing.code} ${r.listing.title} ${r.share.parties.map((p) => nameOf(p, r.listing)).join(' ')}`.toLowerCase().includes(t))
  const searched = all.filter(matches)
  const rows = searched.filter((r) => inView(view, r))
  const sum = (k: 'commission' | 'company' | 'partner' | 'agent' | 'other') => rows.reduce((s, r) => s + r.amt[k], 0)
  const filters = [q, shape, view !== 'pipeline' ? view : null].filter(Boolean).length
  const describe = (r: Row) => r.amt.parties.map((p) => `${nameOf(p.party, r.listing)} ${partyRule(p.party)}`).join(' · ')

  const columns: Column<Row>[] = [
    {
      id: 'listing',
      header: 'Listing',
      sortValue: (r) => r.listing.code,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{r.listing.code}</div>
          <div className="truncate text-sm">{r.listing.title}</div>
          <div className="mt-1 line-clamp-2 text-[11px] text-muted md:hidden">{describe(r)}</div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'lg', cell: (r) => <ListingStatusBadge status={r.listing.status} /> },
    { id: 'basis', header: 'Deal price', align: 'right', hideBelow: 'xl', sortValue: (r) => r.amt.basis, cell: (r) => fmtIdrShort(r.amt.basis) },
    {
      id: 'pct',
      header: 'Commission',
      align: 'right',
      hideBelow: 'sm',
      sortValue: (r) => r.amt.commission,
      cell: (r) => (r.share.commissionMode === 'fixed' ? <span title="Fixed fee">{fmtIdrShort(r.share.commissionFixed)}</span> : fmtPercent(r.share.commissionPct)),
    },
    {
      id: 'split',
      header: 'Parties',
      hideBelow: 'md',
      width: '15rem',
      cell: (r) => (
        <div className="min-w-0">
          <SplitBar parts={r.amt.parties} label={describe(r)} className="h-1.5" />
          <div className="mt-1 line-clamp-2 text-[11px] text-muted tabular-nums">{describe(r)}</div>
        </div>
      ),
    },
    { id: 'company', header: 'Company', align: 'right', sortValue: (r) => r.amt.company, cell: (r) => <span className="font-semibold">{fmtIdrShort(r.amt.company)}</span> },
    { id: 'partner', header: 'Partner', align: 'right', hideBelow: 'lg', sortValue: (r) => r.amt.partner, cell: (r) => (r.amt.partner ? fmtIdrShort(r.amt.partner) : <span className="text-muted">–</span>) },
    {
      id: 'actions',
      header: '',
      width: '6rem',
      align: 'right',
      cell: (r) =>
        can('share.manage') ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
            Edit
          </Button>
        ) : null,
    },
  ]

  return (
    <div className="space-y-4">
      <SharingNav />
      <PageHeader
        title="Profit sharing"
        description="The commission scheme for each listing and how it splits between the company, agents, partners and other parties. Sold listings use the sold price."
        className="mb-2 [&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search schemes"
            placeholder="Code, title or party"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Total commission" value={fmtIdrShort(sum('commission')).replace('Rp ', '')} unit="Rp" icon={<CircleDollarSign />} tone="ink" hint={`${rows.length} listing${rows.length === 1 ? '' : 's'}`} />
        <StatCard label="Company share" value={fmtIdrShort(sum('company')).replace('Rp ', '')} unit="Rp" icon={<Building2 />} tone="success" />
        <StatCard label="Partner share" value={fmtIdrShort(sum('partner')).replace('Rp ', '')} unit="Rp" icon={<HandCoins />} hint={sum('other') ? `Other parties ${fmtIdrShort(sum('other'))}` : undefined} />
        <StatCard label="Agent share" value={fmtIdrShort(sum('agent')).replace('Rp ', '')} unit="Rp" icon={<UserRound />} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          {VIEWS.map(([v, label]) => (
            <Chip key={v} active={view === v} count={searched.filter((r) => inView(v, r)).length} onClick={() => set('view', v === 'pipeline' ? null : v)}>
              {label}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by scheme shape" value={shape ?? ''} onChange={(e) => set('shape', e.target.value)}>
          <option value="">Any scheme</option>
          <option value="fixed">Has a fixed party</option>
          <option value="fee">Fixed commission fee</option>
          <option value="three">More than three parties</option>
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {all.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => r.share.id}
        rowLabel={(r) => r.listing.code}
        onRowClick={(r) => navigate(paths.listing(r.listing.id))}
        initialSort={{ id: 'company', desc: true }}
        resetPageKey={`${view}|${q}|${shape}`}
        empty={
          <EmptyState
            compact
            title="No schemes in this view"
            description="Switch the view or clear the filters."
            action={filters ? <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button> : undefined}
          />
        }
      />
      <p className="text-xs text-muted">
        Company total in this view: <span className="font-semibold tabular-nums">{fmtIdr(sum('company'))}</span>. Closed deals and sales are settled on the Settlements tab.
      </p>
      {editing && <ShareDialog open onOpenChange={(v) => !v && setEditing(null)} editing={editing.share} listing={editing.listing} />}
    </div>
  )
}
