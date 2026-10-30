import { cn } from '@artha/ui'
import { useState, type ReactNode } from 'react'

/*
 * The client's own logo files, unchanged, in apps/web/public/brand/:
 *   logo-light.png  navy wordmark for white and grey grounds
 *   logo-dark.png   white wordmark for ink grounds
 *   mark.png        the wave mark alone (console rail, splash, favicon)
 * Until a file is there, the wordmark falls back to plain text.
 */

/** The full logo; `onInk` picks the white version. */
export function BrandLogo({ onInk, className }: { onInk?: boolean; className?: string }) {
  const [missing, setMissing] = useState(false)
  if (missing) {
    return (
      <span className={cn('flex flex-col leading-none', onInk ? 'text-white' : 'text-foreground', className)}>
        <span className="whitespace-nowrap text-[15px] font-extrabold uppercase tracking-[0.04em]">Artha Samoedra</span>
        <span className={cn('mt-1 whitespace-nowrap text-[8.5px] font-medium uppercase tracking-[0.42em]', onInk ? 'text-on-ink-muted' : 'text-muted')}>Asset Management</span>
      </span>
    )
  }
  return (
    <img
      src={onInk ? '/brand/logo-dark.png' : '/brand/logo-light.png'}
      alt="Artha Samoedra Asset Management"
      onError={() => setMissing(true)}
      className={cn('h-9 w-auto max-w-none', className)}
    />
  )
}

/** The wave mark alone; shows `fallback` until mark.png exists. */
export function BrandMark({ className, fallback = null }: { className?: string; fallback?: ReactNode }) {
  const [missing, setMissing] = useState(false)
  return missing ? fallback : <img src="/brand/mark.png" alt="" onError={() => setMissing(true)} className={cn('object-contain', className)} />
}
