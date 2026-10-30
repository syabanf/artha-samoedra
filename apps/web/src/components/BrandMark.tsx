import { cn } from '@artha/ui'

/*
 * The client's logo, cut from their HD files onto transparency, in apps/web/public/brand/:
 *   logo-light.png / mark.png       navy wordmark and wave for white and grey grounds
 *   logo-dark.png  / mark-dark.png  white wordmark and wave for ink grounds
 */

/** The full logo; `onInk` picks the white version. */
export function BrandLogo({ onInk, className }: { onInk?: boolean; className?: string }) {
  return (
    <img
      src={onInk ? '/brand/logo-dark.png' : '/brand/logo-light.png'}
      alt="Artha Samoedra Asset Management"
      width={1496}
      height={237}
      className={cn('h-9 w-auto max-w-none', className)}
    />
  )
}

/** The wave mark alone. */
export function BrandMark({ onInk, className }: { onInk?: boolean; className?: string }) {
  return <img src={onInk ? '/brand/mark-dark.png' : '/brand/mark.png'} alt="" width={296} height={296} className={cn('object-contain', className)} />
}
