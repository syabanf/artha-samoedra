import { fmtArea, fmtIdrShort, isFeatured, nowMs, promoPrice } from '@artha/fixtures'
import { Badge, Card, cn } from '@artha/ui'
import type { Listing } from '@artha/types'
import { DEAL_TYPE_LABEL } from '@artha/types'
import { BedDouble, MapPin, Ruler, Star } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '../components/links'
import { ListingVisual } from '../components/ListingVisual'
import { useAppState } from '../state/store'

/** Gallery card: the whole card opens the asset through its title link. `large` is the landing page's taller editorial variant. */
export function ListingCard({ listing: l, large, className }: { listing: Listing; large?: boolean; className?: string }) {
  const { state } = useAppState()
  const now = nowMs()
  const featured = isFeatured(state, l.id, now)
  const promo = promoPrice(state, l.id, now)
  return (
    <Card className={cn('relative flex flex-col overflow-hidden transition-colors hover:bg-surface-2', className)}>
      <ListingVisual listing={l} className={cn('w-full', large ? 'aspect-[4/5] sm:aspect-[5/4]' : 'aspect-[4/3]')} />
      <div className="flex flex-1 flex-col gap-2 p-5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={l.deal === 'sewa' ? 'info' : 'default'}>{DEAL_TYPE_LABEL[l.deal]}</Badge>
          {featured && (
            <Badge variant="accent">
              <Star />
              Featured
            </Badge>
          )}
          {promo !== null && <Badge variant="danger">Price drop</Badge>}
          {l.status === 'reserved' && <Badge variant="warning">Reserved</Badge>}
          <span className="ml-auto font-mono text-[11px] font-semibold text-muted">{l.code}</span>
        </div>
        <h3 className={cn('leading-snug', large ? 'font-display text-xl font-medium' : 'text-base font-semibold')}>
          <Link
            to={paths.asset(l.slug)}
            className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
          >
            {l.title}
          </Link>
        </h3>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <MapPin className="size-3.5" />
          {l.district}, {l.city}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-2">
          <div className="flex min-w-0 flex-wrap items-end gap-x-1.5">
            <span className={cn('text-xl font-bold tracking-tight tabular-nums', promo !== null && 'text-accent-strong')}>{fmtIdrShort(promo ?? l.price)}</span>
            {l.deal === 'sewa' && <span className="pb-0.5 text-xs font-semibold text-muted">/year</span>}
            {promo !== null && (
              <s className="pb-0.5 text-xs text-muted tabular-nums">
                <span className="sr-only">was </span>
                {fmtIdrShort(l.price)}
              </s>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Ruler className="size-3.5" />
              {fmtArea(l.buildingArea ?? l.landArea)}
            </span>
            {l.bedrooms && (
              <span className="flex items-center gap-1">
                <BedDouble className="size-3.5" />
                {l.bedrooms}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
