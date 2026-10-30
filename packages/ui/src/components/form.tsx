import { Check, ChevronDown } from 'lucide-react'
import { createContext, use, useId, type ComponentProps, type ReactNode } from 'react'
import { cn, FOCUS } from '../lib/cn'

interface FieldCtx {
  id: string
  describedBy?: string
  invalid: boolean
}
const FieldContext = createContext<FieldCtx | null>(null)

const useField = (id?: string, invalid?: boolean) => {
  const ctx = use(FieldContext)
  return {
    id: id ?? ctx?.id,
    'aria-describedby': ctx?.describedBy,
    'aria-invalid': invalid ?? ctx?.invalid ?? undefined,
  }
}

export function FormField({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: ReactNode
  required?: boolean
  error?: string
  hint?: ReactNode
  className?: string
  children: ReactNode
}) {
  const id = useId()
  const msgId = `${id}-msg`
  const message = error ?? hint
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-accent">*</span>}
      </label>
      <FieldContext value={{ id, describedBy: message ? msgId : undefined, invalid: !!error }}>{children}</FieldContext>
      {message && (
        <p id={msgId} className={cn('mt-1 text-xs', error ? 'text-danger' : 'text-muted')}>
          {message}
        </p>
      )}
    </div>
  )
}

const TEXT = 'w-full min-w-0 text-base text-foreground md:text-sm transition-colors placeholder:text-muted focus:outline-none disabled:cursor-not-allowed disabled:opacity-60'
const FIELD = {
  default: 'rounded-2xl border border-border bg-card focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:bg-surface aria-[invalid=true]:border-danger',
  soft: 'rounded-2xl border-0 bg-surface focus:ring-2 focus:ring-accent/20 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-danger/25',
  pill: 'rounded-full border-0 bg-card shadow-card focus:ring-2 focus:ring-accent/20',
}

export function Input({
  variant = 'default',
  icon,
  right,
  className,
  inputClassName,
  id,
  invalid,
  ...props
}: Omit<ComponentProps<'input'>, 'className'> & {
  variant?: keyof typeof FIELD
  icon?: ReactNode
  right?: ReactNode
  className?: string
  inputClassName?: string
  invalid?: boolean
}) {
  const field = useField(id, invalid)
  return (
    <div className={cn('relative min-w-0', className)}>
      {icon && (
        <span className="pointer-events-none absolute left-3.5 top-1/2 flex -translate-y-1/2 text-muted [&_svg]:size-4">{icon}</span>
      )}
      <input
        {...field}
        {...props}
        className={cn('h-11 px-4', TEXT, FIELD[variant], icon && 'pl-10', right && 'pr-11', inputClassName)}
      />
      {right && <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center text-muted">{right}</span>}
    </div>
  )
}

export function Textarea({
  variant = 'default',
  className,
  id,
  ...props
}: ComponentProps<'textarea'> & { variant?: 'default' | 'soft' }) {
  const field = useField(id)
  return <textarea {...field} {...props} className={cn('min-h-28 px-4 py-3', TEXT, FIELD[variant], className)} />
}

export function NativeSelect({
  variant = 'default',
  className,
  id,
  children,
  ...props
}: ComponentProps<'select'> & { variant?: 'default' | 'soft' | 'inline' }) {
  const field = useField(id)
  const box = {
    default: 'h-11 w-full rounded-2xl border border-border bg-card pl-4 pr-10 focus:border-accent focus:ring-2 focus:ring-accent/20',
    soft: 'h-11 w-full rounded-2xl border-0 bg-surface pl-4 pr-10 focus:ring-2 focus:ring-accent/20',
    inline: 'h-8 rounded-full bg-transparent pl-3 pr-8 font-medium hover:bg-black/5 focus:ring-2 focus:ring-accent/20',
  }[variant]
  return (
    <div className={cn('relative', variant !== 'inline' && 'w-full', className)}>
      <select
        {...field}
        {...props}
        className={cn('cursor-pointer appearance-none text-base text-foreground outline-none md:text-sm', box)}
      >
        {children}
      </select>
      <ChevronDown
        className={cn(
          'pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 opacity-60',
          variant === 'inline' ? 'right-2.5' : 'right-3.5',
        )}
      />
    </div>
  )
}

export function Chip({
  active,
  variant = 'filter',
  count,
  className,
  children,
  ...props
}: ComponentProps<'button'> & { active?: boolean; variant?: 'default' | 'filter'; count?: number }) {
  const look =
    variant === 'filter'
      ? 'bg-card px-4 text-sm text-body shadow-card data-[active=false]:hover:bg-surface data-[active=true]:bg-ink data-[active=true]:text-on-ink'
      : 'border border-border bg-card px-3.5 text-xs text-body data-[active=false]:hover:bg-surface data-[active=true]:border-accent-strong data-[active=true]:bg-accent-strong data-[active=true]:text-white'
  return (
    <button
      type="button"
      aria-pressed={!!active}
      data-active={!!active}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 [&_svg]:size-4',
        FOCUS,
        look,
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-full px-1.5 py-px text-[10px] font-bold leading-4 tabular-nums',
            active ? 'bg-white/20' : 'bg-surface text-body',
          )}
        >
          {count}
        </span>
      )}
    </button>
  )
}

export const ChipRow = ({ className, ...props }: ComponentProps<'div'>) => (
  <div className={cn('no-scrollbar flex max-w-full gap-2 overflow-x-auto pb-1', className)} {...props} />
)

export function Switch({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
        checked ? 'bg-accent-strong' : 'bg-silver',
        FOCUS,
      )}
    >
      <span className={cn('size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  )
}

export function Checkbox({ checked, onCheckedChange, label, disabled }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors disabled:opacity-50 [&_svg]:size-3.5',
        checked ? 'border-accent-strong bg-accent-strong text-white' : 'border-border bg-card',
        FOCUS,
      )}
    >
      {checked && <Check strokeWidth={3} />}
    </button>
  )
}
