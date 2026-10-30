import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { cn, FOCUS } from '../lib/cn'

export interface TabItem<T extends string> {
  value: T
  label: ReactNode
  count?: number
}

export function PillTabs<T extends string>({
  items,
  value,
  onChange,
  size = 'md',
  label,
  className,
}: {
  items: TabItem<T>[]
  value: T
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  label: string
  className?: string
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  // Roving tabindex: arrows move and select, Home and End jump, the list wraps.
  const onKeyDown = (e: KeyboardEvent) => {
    const i = items.findIndex((t) => t.value === value)
    const next =
      e.key === 'ArrowRight' ? (i + 1) % items.length
      : e.key === 'ArrowLeft' ? (i - 1 + items.length) % items.length
      : e.key === 'Home' ? 0
      : e.key === 'End' ? items.length - 1
      : -1
    if (next < 0) return
    e.preventDefault()
    onChange(items[next].value)
    refs.current[next]?.focus()
  }
  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-card p-1 shadow-card', className)}
    >
      {items.map((t, i) => {
        const active = t.value === value
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-state={active ? 'active' : 'inactive'}
            onClick={() => onChange(t.value)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold text-muted transition-colors hover:text-foreground data-[state=active]:bg-ink data-[state=active]:text-on-ink [&_svg]:size-4',
              size === 'md' ? 'h-9 px-4 text-sm' : 'h-8 px-3 text-xs',
              FOCUS,
            )}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-px text-[10px] font-bold leading-4 tabular-nums',
                  active ? 'bg-white/20 text-current' : 'bg-surface text-body',
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
