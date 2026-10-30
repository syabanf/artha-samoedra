import { cn } from '@artha/ui'
import type { AssetType, Listing } from '@artha/types'
import { ASSET_TYPE_LABEL } from '@artha/types'
import { Building2, House, LandPlot, Store, TreePalm, Warehouse, type LucideIcon } from 'lucide-react'

export const ASSET_ICON: Record<AssetType, LucideIcon> = {
  tanah: LandPlot,
  rumah: House,
  ruko: Store,
  gudang: Warehouse,
  villa: TreePalm,
  apartemen: Building2,
}

/** The listing's cover photo when it has one; otherwise the type icon on a soft panel. */
export function ListingVisual({ listing, className, ink }: { listing: Listing; className?: string; ink?: boolean }) {
  const Icon = ASSET_ICON[listing.type]
  return (
    <div
      role="img"
      aria-label={`${ASSET_TYPE_LABEL[listing.type]} ${listing.code}`}
      className={cn(
        'relative isolate flex items-center justify-center overflow-hidden',
        ink ? 'bg-ink-2 text-on-ink' : 'bg-surface-2 text-silver',
        className,
      )}
    >
      {listing.photo ? (
        <img src={listing.photo} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
      ) : (
        <>
          <div
            aria-hidden
            className={cn('absolute -bottom-10 -right-10 -z-10 size-40 rounded-full blur-2xl', ink ? 'bg-accent/30' : 'bg-accent/10')}
          />
          <Icon className={cn('size-14 stroke-[1.5]', ink ? 'text-white/70' : 'text-muted/60')} />
        </>
      )}
      <span
        className={cn(
          'absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
          ink ? 'bg-white/10 text-white' : 'bg-card text-body shadow-card',
        )}
      >
        {ASSET_TYPE_LABEL[listing.type]}
      </span>
    </div>
  )
}
