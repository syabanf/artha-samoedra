import { countBy, currentExclusive, daysLeft, exclusiveState, filterListings, fmtIdrShort } from '@artha/fixtures'
import { Badge, Button, Chip, ChipRow, DataTable, EmptyState, Input, NativeSelect, PageHeader, StatCard, type Column } from '@artha/ui'
import {
  ASSET_TYPE_LABEL,
  ASSET_TYPES,
  LISTING_SOURCE_LABEL,
  LISTING_STATUS_LABEL,
  LISTING_STATUSES,
  type AssetType,
  type Listing,
  type ListingStatus,
} from '@artha/types'
import { Building2, ClipboardCheck, Plus, Search, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { ExclusiveBadge, ListingStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useNow, useScoped } from '../../state/store'
import { ListingDialog } from '../dialogs'

export function ListingsPage() {
  const { state, partnerName } = useScoped()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(params.get('new') === '1')
  const q = params.get('q') ?? ''
  const status = (params.get('status') as ListingStatus | null) || null
  const type = (params.get('type') as AssetType | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const rows = filterListings(state.listings, { query: q, status, type })
  const statusCounts = countBy(filterListings(state.listings, { query: q, type }), (l) => l.status)
  const filters = [q, status, type].filter(Boolean).length
  const fromJessy = state.listings.filter((l) => l.source === 'jessy').length

  const columns: Column<Listing>[] = [
    {
      id: 'code',
      header: 'Listing',
      sortValue: (l) => l.code,
      cell: (l) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{l.code}</div>
          <div className="truncate text-sm">{l.title}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
            <ListingStatusBadge status={l.status} />
          </div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (l) => LISTING_STATUSES.indexOf(l.status), cell: (l) => <ListingStatusBadge status={l.status} /> },
    { id: 'type', header: 'Type', hideBelow: 'lg', cell: (l) => ASSET_TYPE_LABEL[l.type] },
    { id: 'city', header: 'Location', hideBelow: 'md', sortValue: (l) => l.city, cell: (l) => <span className="text-sm">{l.city}</span> },
    { id: 'partner', header: 'Partner', hideBelow: 'xl', cell: (l) => <span className="text-sm">{partnerName(l.partnerId)}</span> },
    {
      id: 'exclusive',
      header: 'Exclusive',
      hideBelow: 'lg',
      sortValue: (l) => {
        const e = currentExclusive(state, l.id)
        return e && !e.endedAt ? daysLeft(e, now) : null
      },
      cell: (l) => {
        const e = currentExclusive(state, l.id)
        return e && !e.endedAt ? <ExclusiveBadge state={exclusiveState(e, now)} days={daysLeft(e, now)} /> : <span className="text-muted">–</span>
      },
    },
    {
      id: 'source',
      header: 'Source',
      hideBelow: 'xl',
      cell: (l) => (l.source === 'jessy' ? <Badge variant="info"><Sparkles />Jessy</Badge> : <span className="text-xs text-muted">{LISTING_SOURCE_LABEL[l.source]}</span>),
    },
    { id: 'price', header: 'Price', align: 'right', sortValue: (l) => l.price, cell: (l) => <span className="font-semibold">{fmtIdrShort(l.price)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Listings"
        description="Every asset on the market, including partner submissions from Jessy chat that await review."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search listings"
              placeholder="Code, title or city"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('listing.edit') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New listing
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Live" value={(statusCounts.active ?? 0) + (statusCounts.reserved ?? 0)} icon={<Building2 />} tone="ink" active={status === 'active'} onClick={() => set('status', status === 'active' ? null : 'active')} />
        <StatCard label="Needs review" value={statusCounts.review ?? 0} icon={<ClipboardCheck />} tone={statusCounts.review ? 'warning' : 'default'} active={status === 'review'} onClick={() => set('status', status === 'review' ? null : 'review')} />
        <StatCard label="Sold" value={statusCounts.sold ?? 0} icon={<Building2 />} tone="success" active={status === 'sold'} onClick={() => set('status', status === 'sold' ? null : 'sold')} />
        <StatCard label="From Jessy chat" value={fromJessy} icon={<Sparkles />} tone="info" hint="Submitted by partners themselves" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} onClick={() => set('status', null)}>
            All
          </Chip>
          {LISTING_STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {LISTING_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by asset type" value={type ?? ''} onChange={(e) => set('type', e.target.value)}>
          <option value="">All types</option>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>
              {ASSET_TYPE_LABEL[t]}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.listings.length}
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
          getRowKey={(l) => l.id}
          rowLabel={(l) => l.code}
          onRowClick={(l) => navigate(paths.listing(l.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${status}|${type}`}
          rowClassName={(l) => (l.status === 'review' ? 'bg-warning-soft/40' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching listings" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No listings yet" description="Create a listing or ask a partner to submit one through Jessy chat." />
            )
          }
        />
      </div>
      <ListingDialog open={creating} onOpenChange={setCreating} editing={null} onSaved={(l) => navigate(paths.listing(l.id))} />
    </div>
  )
}
