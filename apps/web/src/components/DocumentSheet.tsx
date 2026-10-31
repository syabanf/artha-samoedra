import type { Company } from '@artha/types'
import { cn } from '@artha/ui'
import { ChevronDown } from 'lucide-react'
import { createContext, use, useId, type ComponentProps, type ReactNode } from 'react'
import { BrandLogo } from './BrandMark'

/*
 * The "document as the form" frame shared by the quotation and the invoice:
 * a picker strip above the paper, then the paper itself with the letterhead,
 * the title band, label : value rows, the lines and the notes with the summary.
 * Editable values are underlined inputs; on a view they are plain text.
 */

/** The accent-tinted strip of pickers above the paper. Never printed. */
export const DocumentPickers = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 rounded-card bg-accent-soft p-4 sm:grid-cols-3 sm:p-5 print:hidden">{children}</div>
)

/** The white paper. Sections inside it carry their own padding. */
export const DocumentSheet = ({ className, ...props }: ComponentProps<'div'>) => (
  <div
    className={cn('min-w-0 overflow-hidden rounded-card bg-card shadow-card print:overflow-visible print:rounded-none print:shadow-none', className)}
    {...props}
  />
)

/** Letterhead with the logo left and the company right, then the grey title band. */
export function DocumentHead({ company, title, number, stamp }: { company: Company; title: string; number: string; stamp?: ReactNode }) {
  return (
    <>
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-8">
        <BrandLogo className="h-9 max-w-full sm:h-11" />
        <div className="min-w-0 text-xs text-muted sm:max-w-sm sm:text-right">
          <div className="text-lg font-bold uppercase tracking-tight text-foreground sm:text-xl">{company.legalName || company.name}</div>
          <div className="mt-1 italic">{company.address}</div>
          <div className="mt-1 break-words text-accent">{company.email}</div>
          {company.taxId && <div className="mt-1">NPWP: {company.taxId}</div>}
        </div>
      </div>
      <div className="border-y border-border bg-surface-2 px-5 py-4 text-center print:bg-transparent">
        <div className="text-base font-bold uppercase tracking-wide">{title}</div>
        <div className="mt-1 text-xs text-muted">
          Number: <span className="font-mono font-semibold text-foreground">{number}</span>
        </div>
        {stamp && <div className="mt-2 flex justify-center">{stamp}</div>}
      </div>
    </>
  )
}

/** Two columns of label : value rows that stack on phones. */
export const DocFields = ({ left, right }: { left: ReactNode; right: ReactNode }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x md:divide-border print:grid-cols-2 print:divide-x">
    <dl className="min-w-0 space-y-1 px-5 py-4 sm:px-8 md:pr-6">{left}</dl>
    <dl className="min-w-0 space-y-1 border-t border-border px-5 py-4 sm:px-8 md:border-t-0 md:pl-6 print:border-t-0">{right}</dl>
  </div>
)

interface FieldCtx {
  id: string
  invalid: boolean
  describedBy?: string
}
const DocFieldContext = createContext<FieldCtx | null>(null)

/** One label : value row. Wrap a DocInput or DocSelect to edit, or plain text to show. */
export function DocField({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: ReactNode }) {
  const id = useId()
  return (
    <div className="grid grid-cols-[6.5rem_0.75rem_minmax(0,1fr)] items-baseline gap-x-1 py-1 sm:grid-cols-[8.5rem_1rem_minmax(0,1fr)]">
      <dt>
        <label htmlFor={id} className="text-[11px] font-semibold uppercase italic tracking-wide text-muted">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      </dt>
      <span aria-hidden className="text-xs text-muted">
        :
      </span>
      <dd className="min-w-0 break-words text-sm font-medium">
        <DocFieldContext value={{ id, invalid: !!error, describedBy: error ? `${id}-err` : undefined }}>{children}</DocFieldContext>
        {error && (
          <p id={`${id}-err`} className="mt-1 text-xs font-normal text-danger">
            {error}
          </p>
        )}
      </dd>
    </div>
  )
}

const useDocField = () => {
  const ctx = use(DocFieldContext)
  return { id: ctx?.id, 'aria-invalid': ctx?.invalid || undefined, 'aria-describedby': ctx?.describedBy }
}

const UNDERLINE =
  'h-8 w-full min-w-0 border-0 border-b border-border bg-transparent px-0 text-base font-normal text-foreground transition-colors placeholder:text-muted focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger md:text-sm'

export function DocInput({ className, ...props }: ComponentProps<'input'>) {
  return <input {...useDocField()} {...props} className={cn(UNDERLINE, className)} />
}

export function DocSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative min-w-0">
      <select {...useDocField()} {...props} className={cn(UNDERLINE, 'cursor-pointer appearance-none pr-6', className)}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-0 top-1/2 size-4 -translate-y-1/2 opacity-60" />
    </div>
  )
}

/** A padded block on the paper with an optional heading and right-aligned actions. */
export function DocSection({ title, actions, className, children }: { title?: string; actions?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={cn('border-t border-border px-5 py-5 sm:px-8', className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</h2>}
          {actions && <div className="ml-auto flex flex-wrap justify-end gap-2 print:hidden">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/** Notes on the left, the summary card on the right. */
export const DocBottom = ({ notes, summary }: { notes: ReactNode; summary: ReactNode }) => (
  <div className="grid grid-cols-1 gap-5 border-t border-border px-5 py-5 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] print:grid-cols-[minmax(0,1fr)_20rem]">
    <div className="min-w-0">{notes}</div>
    {summary}
  </div>
)

export interface SummaryRow {
  label: ReactNode
  value: ReactNode
  /** warning for a discount, info for tax; total closes the card. */
  tone?: 'warning' | 'info' | 'total'
}

const ROW_TONE = {
  warning: 'rounded-xl bg-warning-soft px-3 py-2 font-semibold text-warning',
  info: 'rounded-xl bg-info-soft px-3 py-2 font-semibold text-info',
  total: 'mt-1 border-t border-border px-3 pt-3 text-base font-bold text-foreground',
}

export const DocSummary = ({ rows }: { rows: SummaryRow[] }) => (
  <dl className="min-w-0 space-y-2 self-start rounded-2xl border border-border p-4 text-sm">
    {rows.map((r, i) => (
      <div key={i} className={cn('flex items-center justify-between gap-3', r.tone ? ROW_TONE[r.tone] : 'px-3')}>
        <dt className={cn('flex min-w-0 items-center gap-2 text-[11px] font-semibold uppercase tracking-wider', !r.tone && 'text-muted')}>{r.label}</dt>
        <dd className="whitespace-nowrap text-right tabular-nums">{r.value}</dd>
      </div>
    ))}
  </dl>
)

/** The notes block: a heading, then the textarea or the text. */
export const DocNotes = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
    {children}
  </div>
)
