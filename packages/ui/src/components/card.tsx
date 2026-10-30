import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'

const cardVariants = cva('', {
  variants: {
    variant: {
      default:
        'rounded-card bg-card shadow-card print:break-inside-avoid print:border print:border-border print:shadow-none',
      ink: 'relative isolate overflow-hidden rounded-hero bg-ink text-on-ink shadow-float',
      accent: 'rounded-card bg-accent text-white shadow-glow',
      soft: 'rounded-2xl bg-surface-2',
    },
  },
  defaultVariants: { variant: 'default' },
})

export function Card({
  className,
  variant,
  children,
  ...props
}: ComponentProps<'div'> & VariantProps<typeof cardVariants>) {
  return (
    <div className={cn(cardVariants({ variant }), className)} {...props}>
      {variant === 'ink' && (
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 -z-10 size-72 rounded-full bg-accent/30 blur-3xl"
        />
      )}
      {children}
    </div>
  )
}

export function CardHeader({
  className,
  action,
  children,
  ...props
}: ComponentProps<'div'> & { action?: ReactNode }) {
  if (!action) {
    return (
      <div className={cn('flex flex-col gap-1 p-5', className)} {...props}>
        {children}
      </div>
    )
  }
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-2 p-5', className)} {...props}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 print:hidden">{action}</div>
    </div>
  )
}

export const CardTitle = ({ className, ...props }: ComponentProps<'h2'>) => (
  <h2 className={cn('text-base font-semibold leading-tight', className)} {...props} />
)
export const CardContent = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('p-5 pt-0', className)} {...props} />
)
