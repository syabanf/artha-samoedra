import { countBy, filterListings, parseBudget, publicListings } from '@artha/fixtures'
import { Button, Chip, ChipRow, EmptyState, Input, NativeSelect } from '@artha/ui'
import { ASSET_TYPE_LABEL, ASSET_TYPES, DEAL_TYPE_LABEL, type AssetType, type DealType } from '@artha/types'
import { Search, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useDocumentMeta } from '../lib/meta'
import { useAppState } from '../state/store'
import { ListingCard } from './ListingCard'
import { SiteContainer } from './SiteLayout'

const SORTS = { new: 'Newest', cheap: 'Lowest price', pricey: 'Highest price' } as const
type SortKey = keyof typeof SORTS

export function AssetsPage() {
  useDocumentMeta('Properties · Artha Samoedra', 'Search land, houses, shop houses, warehouses, villas and apartments for sale or for rent.')
  const { state } = useAppState()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const type = (params.get('type') as AssetType | null) || null
  const deal = (params.get('deal') as DealType | null) || null
  const city = params.get('city') || null
  const max = params.get('max') || ''
  const sort = (params.get('sort') as SortKey | null) ?? 'new'

  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const all = publicListings(state)
  const maxPrice = max ? parseBudget(`${max} m`) : null
  const base = { query: q, city, maxPrice }
  const rows = filterListings(all, { ...base, type, deal }).sort((a, b) =>
    sort === 'cheap' ? a.price - b.price : sort === 'pricey' ? b.price - a.price : b.createdAt.localeCompare(a.createdAt),
  )
  const typeCounts = countBy(filterListings(all, { ...base, deal }), (l) => l.type)
  const dealCounts = countBy(filterListings(all, { ...base, type }), (l) => l.deal)
  const cities = [...new Set(all.map((l) => l.city))].sort()
  const active = [q, type, deal, city, max].filter(Boolean).length

  return (
    <SiteContainer className="pt-8">
      <h1 className="text-3xl font-bold tracking-tight">
        Properties<span className="text-accent">.</span>
      </h1>
      <p className="mt-1 text-sm text-muted">All prices come from the owners. The Artha Samoedra team checks the paperwork.</p>

      <div className="mt-6 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search properties"
            placeholder="Code, title, city or district"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="flex-1"
            right={
              q ? (
                <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}>
                  <X />
                </Button>
              ) : undefined
            }
          />
          <div className="flex gap-2">
            <NativeSelect aria-label="Filter by city" value={city ?? ''} onChange={(e) => set('city', e.target.value)} className="min-w-0 flex-1 sm:w-44">
              <option value="">All cities</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Maximum price" value={max} onChange={(e) => set('max', e.target.value)} className="min-w-0 flex-1 sm:w-40">
              <option value="">Any price</option>
              {['1', '2', '5', '10', '20'].map((m) => (
                <option key={m} value={m}>
                  Up to Rp {m} B
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <ChipRow>
          <Chip active={!type} count={Object.values(typeCounts).reduce((a, b) => a + b, 0)} onClick={() => set('type', null)}>
            All
          </Chip>
          {ASSET_TYPES.map((t) => (
            <Chip key={t} active={type === t} count={typeCounts[t] ?? 0} onClick={() => set('type', type === t ? null : t)}>
              {ASSET_TYPE_LABEL[t]}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-border" aria-hidden />
          {(['jual', 'sewa'] as DealType[]).map((d) => (
            <Chip key={d} active={deal === d} count={dealCounts[d] ?? 0} onClick={() => set('deal', deal === d ? null : d)}>
              {DEAL_TYPE_LABEL[d]}
            </Chip>
          ))}
        </ChipRow>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted tabular-nums" aria-live="polite">
            {rows.length} of {all.length} properties
            {active > 0 && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={() => setParams({}, { replace: true })}>
                Clear {active} {active === 1 ? 'filter' : 'filters'}
              </Button>
            )}
          </p>
          <NativeSelect variant="inline" aria-label="Sort by" value={sort} onChange={(e) => set('sort', e.target.value === 'new' ? null : e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {rows.length ? (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No matching properties"
          description="Loosen the filters, or ask Jessy to search the partner network."
          action={
            <Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>
              Clear filters
            </Button>
          }
        />
      )}
    </SiteContainer>
  )
}
