import {
  approveBlocker,
  delistBlocker,
  fmtAgo,
  fmtArea,
  fmtDate,
  fmtIdrShort,
  soldBlocker,
} from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, KeyValue } from '@artha/ui'
import { ASSET_TYPE_LABEL, DEAL_TYPE_LABEL, LISTING_SOURCE_LABEL, PUBLIC_LISTING_STATUSES } from '@artha/types'
import { BookmarkCheck, CircleCheck, ExternalLink, Pencil, Sparkles, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { ContentStatusBadge, InquiryStatusBadge, ListingStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { ListingVisual } from '../../components/ListingVisual'
import { useScoped } from '../../state/store'
import { DocumentsCard } from '../dataroom/DocumentsCard'
import { DelistDialog, ListingDialog, SoldDialog, useAct } from '../dialogs'
import { ExclusiveCard } from '../listing/ExclusiveParts'
import { ShareCard } from '../listing/ShareParts'

type Open = 'edit' | 'sold' | 'delist' | null

export function ListingDetailPage() {
  const { id } = useParams()
  const { state, maps, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const [open, setOpen] = useState<Open>(null)
  const l = id ? maps.listings.get(id) : undefined

  if (!l) {
    return (
      <Card>
        <EmptyState pageTitle title="Listing not found" description="This listing may have been deleted." action={<BackButton fallback={paths.listings} />} />
      </Card>
    )
  }

  const partner = maps.partners.get(l.partnerId)
  const inquiries = state.inquiries.filter((i) => i.listingId === l.id)
  const posts = state.socialPosts.filter((p) => p.listingId === l.id)
  const history = state.history.filter((h) => h.ref === l.id)
  const delistReason = delistBlocker(l)
  const live = PUBLIC_LISTING_STATUSES.includes(l.status)
  const closeTo = (v: boolean) => !v && setOpen(null)

  const primary =
    l.status === 'review' && can('listing.approve') ? (
      <Button
        disabled={!!approveBlocker(l)}
        onClick={() => act({ type: 'listings/approve', id: l.id }, 'Listing approved', `${l.code} is live on the website`)}
      >
        <CircleCheck />
        Approve and publish
      </Button>
    ) : !soldBlocker(l) && can('listing.sell') ? (
      <Button onClick={() => setOpen('sold')}>
        <CircleCheck />
        Mark as sold
      </Button>
    ) : null

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.listings} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{l.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">{l.title}</h1>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 print:hidden">
          {live && (
            <Button variant="outline" asChild>
              <a href={paths.asset(l.slug)} target="_blank" rel="noreferrer">
                <ExternalLink />
                View on website
              </a>
            </Button>
          )}
          {can('listing.edit') && (l.status === 'active' || l.status === 'reserved') && (
            <Button
              variant="outline"
              onClick={() =>
                act(
                  { type: 'listings/setStatus', id: l.id, status: l.status === 'active' ? 'reserved' : 'active' },
                  l.status === 'active' ? 'Listing reserved' : 'Reservation cancelled',
                  l.code,
                )
              }
            >
              <BookmarkCheck />
              {l.status === 'active' ? 'Mark reserved' : 'Cancel reservation'}
            </Button>
          )}
          {can('listing.edit') && l.status !== 'sold' && l.status !== 'delisted' && (
            <>
              <Button variant="outline" onClick={() => setOpen('edit')}>
                <Pencil />
                Edit
              </Button>
              <Button variant="danger" disabled={!!delistReason} title={delistReason ?? undefined} onClick={() => setOpen('delist')}>
                <Undo2 />
                Delist
              </Button>
            </>
          )}
          {primary}
        </div>
      </div>
      {l.status === 'reserved' && delistReason && (
        <Card className="p-4 text-sm">
          <span className="font-semibold">Cannot delist yet:</span> {delistReason}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-[180px_minmax(0,1fr)]">
          <ListingVisual listing={l} ink className="aspect-square w-full rounded-2xl sm:w-[180px]" />
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              <ListingStatusBadge status={l.status} />
              <Badge className="bg-white/10 text-white">{DEAL_TYPE_LABEL[l.deal]}</Badge>
              {l.source === 'jessy' && (
                <Badge className="bg-white/10 text-white">
                  <Sparkles />
                  From Jessy chat
                </Badge>
              )}
            </div>
            <div className="mt-4 flex items-end gap-1">
              <span className="text-3xl font-bold tracking-tight tabular-nums">{fmtIdrShort(l.soldPrice ?? l.price)}</span>
              {l.deal === 'sewa' && <span className="pb-0.5 text-sm font-semibold text-on-ink-muted">/year</span>}
            </div>
            <div className="text-xs text-on-ink-muted">{l.soldPrice ? `Sold ${fmtDate(l.soldAt!)}, asking price ${fmtIdrShort(l.price)}` : 'Asking price'}</div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-on-ink-muted">Partner</div>
                <Link to={paths.partner(l.partnerId)} className="font-semibold hover:underline">
                  {partner?.name}
                </Link>
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-on-ink-muted">Inquiry</div>
                <div className="font-semibold tabular-nums">{inquiries.length}</div>
              </div>
            </div>
            {l.delistReason && <p className="mt-3 rounded-2xl bg-accent/20 px-3 py-2 text-sm">Delisted: {l.delistReason}</p>}
          </div>
        </Card>

        <ExclusiveCard listing={l} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Specifications</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              items={[
                { label: 'Type', value: ASSET_TYPE_LABEL[l.type] },
                { label: 'Location', value: l.address },
                { label: 'Land area', value: fmtArea(l.landArea) },
                { label: 'Building area', value: l.buildingArea ? fmtArea(l.buildingArea) : '–' },
                { label: 'Bedrooms', value: l.bedrooms ?? '–' },
                { label: 'Certificate', value: l.certificate },
                { label: 'Highlights', value: l.highlights.join(', ') || '–' },
                { label: 'Source', value: LISTING_SOURCE_LABEL[l.source] },
                { label: 'Created', value: fmtDate(l.createdAt) },
              ]}
            />
          </CardContent>
        </Card>

        <ShareCard listing={l} />
      </div>

      <DocumentsCard listingId={l.id} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Inquiries ({inquiries.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inquiries.length === 0 && <EmptyState compact title="No inquiries yet" description="Questions from Jessy chat on the asset page are logged here." />}
            {inquiries.map((i) => (
              <Link key={i.id} to={paths.inquiry(i.id)} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{i.name}</span>
                  <span className="block truncate text-xs text-muted">{i.message}</span>
                </span>
                <InquiryStatusBadge status={i.status} />
              </Link>
            ))}
            {posts.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{p.account}</span>
                  <span className="block truncate text-xs text-muted">{p.hook}</span>
                </span>
                <ContentStatusBadge status={p.status} />
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent>
            {history.length ? (
              <ol className="space-y-3">
                {history.map((h) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-silver" />
                    <span>
                      {h.text}
                      <span className="block text-xs text-muted">
                        {actorName(h.by)} · {fmtAgo(h.at)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState compact title="No changes yet" description="Every action on this listing is logged with who did it and when." />
            )}
          </CardContent>
        </Card>
      </div>

      <ListingDialog open={open === 'edit'} onOpenChange={closeTo} editing={l} />
      <SoldDialog open={open === 'sold'} onOpenChange={closeTo} listing={l} />
      <DelistDialog open={open === 'delist'} onOpenChange={closeTo} listing={l} />
    </div>
  )
}
