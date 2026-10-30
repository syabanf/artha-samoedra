import { countBy, fmtDate, fmtIdrShort, shareAmounts } from '@artha/fixtures'
import { Button, Card, CardContent, CardHeader, CardTitle, DataTable, EmptyState, Input, KeyValue, PageHeader, StatCard, type Column } from '@artha/ui'
import { PARTNER_KIND_LABEL, type Listing, type Partner } from '@artha/types'
import { Building2, HandCoins, Search, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { BackButton } from '../../components/BackButton'
import { ListingStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useScoped } from '../../state/store'

export function PartnersPage() {
  const { state } = useScoped()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const listingsBy = countBy(state.listings, (l) => l.partnerId)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = state.partners.filter((p) => terms.every((t) => `${p.code} ${p.name} ${p.city} ${p.phone}`.toLowerCase().includes(t)))

  const columns: Column<Partner>[] = [
    {
      id: 'name',
      header: 'Partner',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{p.code}</div>
          <div className="truncate text-sm">{p.name}</div>
        </div>
      ),
    },
    { id: 'kind', header: 'Type', hideBelow: 'sm', cell: (p) => PARTNER_KIND_LABEL[p.kind] },
    { id: 'phone', header: 'WhatsApp', hideBelow: 'md', cell: (p) => <span className="font-mono text-xs">{p.phone}</span> },
    { id: 'city', header: 'City', hideBelow: 'lg', cell: (p) => p.city || <span className="text-muted">–</span> },
    { id: 'listings', header: 'Listings', align: 'right', sortValue: (p) => listingsBy[p.id] ?? 0, cell: (p) => listingsBy[p.id] ?? 0 },
  ]

  return (
    <div>
      <PageHeader
        title="Partners"
        description="Owners, agents and developers who consign assets. New partners from Jessy chat are added automatically."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search partners"
            placeholder="Code, name, city or number"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setQ('')}><X /></Button> : undefined}
          />
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(p) => p.id}
        rowLabel={(p) => p.code}
        onRowClick={(p) => navigate(paths.partner(p.id))}
        initialSort={{ id: 'listings', desc: true }}
        resetPageKey={q}
        empty={
          q ? (
            <EmptyState compact title="No matching partners" action={<Button variant="outline" size="sm" onClick={() => setQ('')}>Clear search</Button>} />
          ) : (
            <EmptyState compact title="No partners yet" description="Partners are registered the first time they chat with Jessy on the partner portal." />
          )
        }
      />
    </div>
  )
}

export function PartnerDetailPage() {
  const { id } = useParams()
  const { state, maps } = useScoped()
  const navigate = useNavigate()
  const p = id ? maps.partners.get(id) : undefined
  if (!p) {
    return (
      <Card>
        <EmptyState title="Partner not found" action={<BackButton fallback={paths.partners} />} />
      </Card>
    )
  }
  const listings = state.listings.filter((l) => l.partnerId === p.id)
  const earned = listings.reduce((sum, l) => {
    const share = state.profitShares.find((s) => s.listingId === l.id)
    return l.status === 'sold' && share ? sum + shareAmounts(share, l).partner : sum
  }, 0)
  const columns: Column<Listing>[] = [
    { id: 'code', header: 'Listing', sortValue: (l) => l.code, cell: (l) => <div><div className="font-mono text-xs font-semibold">{l.code}</div><div className="truncate text-sm">{l.title}</div></div> },
    { id: 'status', header: 'Status', hideBelow: 'sm', cell: (l) => <ListingStatusBadge status={l.status} /> },
    { id: 'price', header: 'Price', align: 'right', sortValue: (l) => l.price, cell: (l) => fmtIdrShort(l.price) },
  ]
  return (
    <div className="space-y-4">
      <BackButton fallback={paths.partners} />
      <div>
        <div className="font-mono text-xs font-semibold text-muted">{p.code}</div>
        <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Listings" value={listings.length} icon={<Building2 />} tone="ink" />
        <StatCard label="Partner share received" value={fmtIdrShort(earned).replace('Rp ', '')} unit="Rp" icon={<HandCoins />} tone="success" hint="From sold listings" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <KeyValue
          items={[
            { label: 'Type', value: PARTNER_KIND_LABEL[p.kind] },
            { label: 'WhatsApp', value: <span className="font-mono text-xs">{p.phone}</span> },
            { label: 'Email', value: p.email || '–' },
            { label: 'City', value: p.city || '–' },
            { label: 'Joined', value: fmtDate(p.joinedAt) },
          ]}
        />
        <Card>
          <CardHeader>
            <CardTitle>Partner listings</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <DataTable rows={listings} columns={columns} getRowKey={(l) => l.id} rowLabel={(l) => l.code} onRowClick={(l) => navigate(paths.listing(l.id))} pageSize={0} empty={<EmptyState compact title="No listings yet" />} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
