import { cva } from 'class-variance-authority'
import { CircleAlert, CircleCheck, Inbox, Info, SearchX, TriangleAlert, X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn, FOCUS } from '../lib/cn'

export type Tone = 'default' | 'danger' | 'success' | 'warning' | 'info' | 'ink' | 'accent'

const iconTile = cva('flex shrink-0 items-center justify-center [&_svg]:shrink-0', {
  variants: {
    tone: {
      default: 'bg-surface text-body',
      danger: 'bg-accent-soft text-accent',
      success: 'bg-success-soft text-success',
      warning: 'bg-warning-soft text-warning',
      info: 'bg-info-soft text-info',
      ink: 'bg-ink text-on-ink',
      accent: 'bg-accent text-white',
    },
    size: {
      sm: 'size-9 rounded-xl [&_svg]:size-4',
      md: 'size-[42px] rounded-[13px] [&_svg]:size-[18px]',
      lg: 'size-12 rounded-2xl [&_svg]:size-5',
    },
  },
  defaultVariants: { tone: 'default', size: 'md' },
})

export function IconTile({
  tone,
  size,
  round,
  className,
  ...props
}: ComponentProps<'div'> & { tone?: Tone; size?: 'sm' | 'md' | 'lg'; round?: boolean }) {
  return <div className={cn(iconTile({ tone, size }), round && 'rounded-full', className)} {...props} />
}

export type BadgeVariant = 'default' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'outline' | 'ink'

const BADGE: Record<BadgeVariant, string> = {
  default: 'bg-surface text-body',
  accent: 'bg-accent-strong text-white',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-accent-strong',
  info: 'bg-info-soft text-info',
  muted: 'bg-surface text-muted',
  outline: 'border border-border text-foreground',
  ink: 'bg-ink text-on-ink',
}

export function Badge({
  variant = 'default',
  dot,
  className,
  children,
  ...props
}: ComponentProps<'span'> & { variant?: BadgeVariant; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium [&_svg]:size-3 [&_svg]:shrink-0',
        BADGE[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  )
}

export function CountBadge({ count, onInk, className }: { count: number; onInk?: boolean; className?: string }) {
  if (!count) return null
  return (
    <span
      className={cn(
        'inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none tabular-nums ring-2',
        onInk ? 'bg-white text-ink ring-ink' : 'bg-accent-strong text-white ring-card',
        className,
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

const DOT: Record<Tone, string> = {
  default: 'bg-silver',
  danger: 'bg-accent',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  ink: 'bg-ink',
}


export function StatCard({
  label,
  value,
  unit,
  hint,
  icon,
  tone = 'default',
  active,
  onClick,
  className,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  icon?: ReactNode
  tone?: Tone
  active?: boolean
  onClick?: () => void
  className?: string
}) {
  const body = (
    <div className="flex w-full items-start gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-body/80">{label}</div>
        <div className="mt-1.5 flex items-start gap-1">
          <span className="truncate text-[28px] font-extrabold leading-[1.15] tracking-[-0.5px] tabular-nums">{value}</span>
          {unit && <span className="shrink-0 pt-1.5 text-sm font-semibold text-muted">{unit}</span>}
        </div>
        {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
      </div>
      {icon && <IconTile tone={tone}>{icon}</IconTile>}
    </div>
  )
  const base = 'flex flex-col rounded-card bg-card p-5 text-left shadow-card'
  if (!onClick) return <div className={cn(base, className)}>{body}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        base,
        'w-full transition-colors hover:bg-surface-2 active:scale-[0.98]',
        FOCUS,
        active && 'ring-2 ring-ink',
        className,
      )}
    >
      {body}
    </button>
  )
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <Kicker className="mb-1">{eyebrow}</Kicker>}
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export const Kicker = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('text-[11px] font-semibold uppercase tracking-wider text-muted', className)} {...props} />
)

export interface KeyValueItem {
  label: ReactNode
  value: ReactNode
  hidden?: boolean
}

export function KeyValue({ items, bare, size = 'md' }: { items: KeyValueItem[]; bare?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const cols = { sm: 'grid-cols-[96px_minmax(0,1fr)]', md: 'grid-cols-[120px_minmax(0,1fr)]', lg: 'grid-cols-[150px_minmax(0,1fr)]' }[size]
  return (
    <dl className={cn('divide-y divide-border', !bare && 'rounded-card bg-card px-5 py-1 shadow-card')}>
      {items
        .filter((i) => !i.hidden)
        .map((i, n) => (
          <div key={n} className={cn('grid gap-3 py-3 text-sm', cols)}>
            <dt className="text-muted">{i.label}</dt>
            <dd className="min-w-0 break-words">{i.value}</dd>
          </div>
        ))}
    </dl>
  )
}

/**
 * An empty list, or with `pageTitle` the whole page's "not found" state: the title becomes the
 * page's h1 and a missing description falls back to a sentence about old links.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  compact,
  pageTitle,
  className,
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  compact?: boolean
  pageTitle?: boolean
  className?: string
}) {
  const Title = pageTitle ? 'h1' : 'p'
  const shown = icon === undefined ? (pageTitle ? <SearchX /> : <Inbox />) : icon
  const text = description ?? (pageTitle ? 'The link may be old, or the record was removed.' : undefined)
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 text-center', compact ? 'px-4 py-8' : 'px-6 py-12', className)}>
      {shown && (
        <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-surface text-muted [&_svg]:size-6">{shown}</div>
      )}
      <Title className={cn('font-semibold text-foreground', pageTitle ? 'text-lg' : 'text-sm')}>{title}</Title>
      {text && <p className="max-w-xs text-sm text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

type BannerTone = 'info' | 'warning' | 'danger' | 'success' | 'neutral'
const BANNER: Record<BannerTone, [string, string, ReactNode]> = {
  info: ['bg-info-soft', 'bg-card text-info', <Info key="i" />],
  warning: ['bg-warning-soft', 'bg-card text-warning', <TriangleAlert key="w" />],
  danger: ['bg-danger-soft', 'bg-card text-danger', <CircleAlert key="d" />],
  success: ['bg-success-soft', 'bg-card text-success', <CircleCheck key="s" />],
  neutral: ['bg-card shadow-card', 'bg-surface text-body', <Info key="n" />],
}

export function Banner({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
  className,
}: {
  tone?: BannerTone
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  onDismiss?: () => void
  className?: string
}) {
  const [box, tile, icon] = BANNER[tone]
  return (
    <div className={cn('flex flex-wrap items-center gap-3 rounded-card px-4 py-3', box, className)}>
      <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-full [&_svg]:size-4', tile)}>{icon}</div>
      <div className="min-w-[12rem] flex-1 text-sm">
        <div className="font-semibold text-foreground">{title}</div>
        {children && <div className="text-body/70">{children}</div>}
      </div>
      {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
      {onDismiss && (
        <button
          type="button"
          aria-label="Close"
          onClick={onDismiss}
          className={cn('inline-flex size-8 items-center justify-center rounded-full hover:bg-black/5 [&_svg]:size-4', FOCUS)}
        >
          <X />
        </button>
      )}
    </div>
  )
}

export function ProgressBar({ value, tone = 'ink', className }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface', className)} role="img" aria-label={`${Math.round(pct)}%`}>
      <div className={cn('h-full rounded-full', DOT[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}
