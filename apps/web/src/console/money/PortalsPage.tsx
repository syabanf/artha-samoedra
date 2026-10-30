import { fmtAgo, fmtNumber } from '@artha/fixtures'
import { Badge, Button, Card, CardHeader, CardTitle, Chip, ChipRow, EmptyState, Input, NativeSelect, PageHeader, StatCard, type BadgeVariant } from '@artha/ui'
import { PORTAL_LABEL, PUBLIC_LISTING_STATUSES, SYNC_STATUS_LABEL, type Listing, type Portal, type PortalSync, type SyncStatus } from '@artha/types'
import { Globe, Search, TriangleAlert, X } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { CodeLink, paths } from '../../components/links'
import { useScoped } from '../../state/store'
import { useAct } from '../dialogs'

const PORTALS = Object.keys(PORTAL_LABEL) as Portal[]
/** `none` is a listing that never went to the portal. */
type CellStatus = SyncStatus | 'none'
const CELL_STATUSES: CellStatus[] = ['live', 'queued', 'error', 'removed', 'none']
const CELL_LABEL: Record<CellStatus, string> = { ...SYNC_STATUS_LABEL, none: 'Not listed' }
const CELL_VARIANT: Record<CellStatus, BadgeVariant> = { live: 'success', queued: 'info', error: 'danger', removed: 'muted', none: 'outline' }

export function PortalsPage() {
  const { state } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as CellStatus | null) || null
  const portal = (params.get('portal') as Portal | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const manage = can('syndication.manage')

  const live = state.listings.filter((l) => PUBLIC_LISTING_STATUSES.includes(l.status))
  const syncOf = (listingId: string, p: Portal) => state.portalSyncs.find((x) => x.listingId === listingId && x.portal === p)
  const cellStatus = (listingId: string, p: Portal): CellStatus => syncOf(listingId, p)?.status ?? 'none'
  const portals = portal ? [portal] : PORTALS
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = live.filter((l) => terms.every((t) => `${l.code} ${l.title} ${l.city}`.toLowerCase().includes(t)))
  const has = (l: Listing, s: CellStatus) => portals.some((p) => cellStatus(l.id, p) === s)
  const rows = searched.filter((l) => !status || has(l, status))
  const filters = [q, status, portal].filter(Boolean).length
  const clear = () => setParams({}, { replace: true })

  const liveIds = new Set(live.map((l) => l.id))
  const totals = (p: Portal) => {
    const syncs = state.portalSyncs.filter((x) => x.portal === p)
    return {
      views: syncs.reduce((n, x) => n + x.views, 0),
      leads: syncs.reduce((n, x) => n + x.leads, 0),
      live: syncs.filter((x) => x.status === 'live').length,
    }
  }
  const errors = state.portalSyncs.filter((x) => x.status === 'error' && liveIds.has(x.listingId))

  const publish = (l: Listing, p: Portal, again: boolean) =>
    act({ type: 'syncs/publish', listingId: l.id, portal: p }, again ? `Sent to ${PORTAL_LABEL[p]} again` : `Sent to ${PORTAL_LABEL[p]}`, `${l.code}. The portal's answer shows in the matrix.`)
  const remove = (l: Listing, sync: PortalSync) => act({ type: 'syncs/remove', id: sync.id }, `Removed from ${PORTAL_LABEL[sync.portal]}`, l.code)

  const actions = (l: Listing, p: Portal, sync: PortalSync | undefined, s: CellStatus) =>
    manage && (
      <div className="flex flex-wrap gap-1">
        {(s === 'none' || s === 'removed') && (
          <Button size="sm" variant="soft" onClick={() => publish(l, p, false)}>
            Publish
          </Button>
        )}
        {s === 'error' && (
          <Button size="sm" variant="soft" onClick={() => publish(l, p, true)}>
            Retry
          </Button>
        )}
        {sync && s !== 'removed' && (
          <Button size="sm" variant="ghost" onClick={() => remove(l, sync)}>
            Remove
          </Button>
        )}
      </div>
    )

  const cell = (l: Listing, p: Portal, end = false) => {
    const sync = syncOf(l.id, p)
    const s = sync?.status ?? 'none'
    return (
      <div className={`flex min-w-0 flex-col gap-1.5 ${end ? 'items-end' : 'items-start'}`}>
        <Badge variant={CELL_VARIANT[s]} dot={s === 'error'}>
          {CELL_LABEL[s]}
        </Badge>
        {sync && (s === 'live' || sync.views > 0) && (
          <div className="text-xs text-muted tabular-nums">
            {fmtNumber(sync.views)} views · {fmtNumber(sync.leads)} leads
          </div>
        )}
        {actions(l, p, sync, s)}
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Portals"
        description="Where each live listing appears outside the website. A sold or delisted listing comes off every portal on its own."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
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
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {PORTALS.map((p) => {
          const t = totals(p)
          return (
            <StatCard
              key={p}
              label={PORTAL_LABEL[p]}
              value={fmtNumber(t.views)}
              unit="views"
              icon={<Globe />}
              tone={portal === p ? 'ink' : 'default'}
              hint={`${fmtNumber(t.leads)} leads · ${t.live} live`}
              active={portal === p}
              onClick={() => set('portal', portal === p ? null : p)}
            />
          )
        })}
      </div>

      {errors.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Portal errors</CardTitle>
            <p className="text-sm text-muted">The portal refused these listings. Fix the cause, then retry.</p>
          </CardHeader>
          <ul className="divide-y divide-border px-5 pb-3">
            {errors.map((x) => {
              const l = live.find((y) => y.id === x.listingId)!
              return (
                <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                  <TriangleAlert className="size-4 shrink-0 text-accent" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <CodeLink to={paths.listing(l.id)} code={l.code} />
                      <span className="font-semibold">{PORTAL_LABEL[x.portal]}</span>
                      {x.lastSyncAt && <span className="text-xs text-muted">{fmtAgo(x.lastSyncAt)}</span>}
                    </div>
                    <div className="text-sm text-body">{x.error}</div>
                  </div>
                  {manage && (
                    <Button size="sm" variant="outline" onClick={() => publish(l, x.portal, true)}>
                      Retry
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {CELL_STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={searched.filter((l) => has(l, s)).length} onClick={() => set('status', status === s ? null : s)}>
              {CELL_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by portal" value={portal ?? ''} onChange={(e) => set('portal', e.target.value)}>
          <option value="">All portals</option>
          {PORTALS.map((p) => (
            <option key={p} value={p}>
              {PORTAL_LABEL[p]}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {live.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="mt-2">
          {filters ? (
            <EmptyState compact title="No matching listings" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState compact title="No live listings" description="Publish a listing first, then send it to the portals." />
          )}
        </Card>
      ) : (
        <>
          <Card className="mt-2 hidden overflow-hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                    <th className="px-5 py-3 font-semibold">Listing</th>
                    {portals.map((p) => (
                      <th key={p} className="px-3 py-3 font-semibold">
                        {PORTAL_LABEL[p]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((l) => (
                    <tr key={l.id} className="align-top">
                      <td className="max-w-64 px-5 py-3">
                        <CodeLink to={paths.listing(l.id)} code={l.code} />
                        <div className="truncate">{l.title}</div>
                        <div className="text-xs text-muted">{l.city}</div>
                      </td>
                      {portals.map((p) => (
                        <td key={p} className="px-3 py-3">
                          {cell(l, p)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <div className="mt-2 space-y-3 md:hidden">
            {rows.map((l) => (
              <Card key={l.id} className="p-4">
                <CodeLink to={paths.listing(l.id)} code={l.code} />
                <div className="truncate text-sm font-semibold">{l.title}</div>
                <div className="text-xs text-muted">{l.city}</div>
                <ul className="mt-3 divide-y divide-border">
                  {portals.map((p) => (
                    <li key={p} className="flex items-start justify-between gap-3 py-2.5">
                      <span className="pt-0.5 text-sm font-medium">{PORTAL_LABEL[p]}</span>
                      {cell(l, p, true)}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
