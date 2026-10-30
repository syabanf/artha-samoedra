import type { Company } from '@artha/types'
import type { ReactNode } from 'react'

/** Letterhead and blocks shared by the printable quotation, receipt and commission statement. */
export function LetterHead({ company }: { company: Company }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ink pb-4">
      <div className="min-w-0">
        <div className="text-xl font-extrabold tracking-tight">{company.name}</div>
        <div className="text-xs text-muted">{company.legalName}</div>
      </div>
      <div className="min-w-0 text-xs text-muted sm:text-right">
        <div>{company.address}</div>
        <div>
          {company.phone} · {company.email}
        </div>
        <div>
          {company.website}
          {company.taxId && ` · NPWP ${company.taxId}`}
        </div>
      </div>
    </div>
  )
}

export const LetterBlock = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="rounded-2xl bg-surface-2 p-4 text-sm print:bg-transparent print:p-0">
    <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{title}</div>
    {children}
  </div>
)

export const LetterRow = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className={`flex justify-between gap-3 py-2.5 ${strong ? 'font-bold' : ''}`}>
    <dt className={strong ? '' : 'text-muted'}>{label}</dt>
    <dd className="min-w-0 break-words text-right tabular-nums">{value}</dd>
  </div>
)

export const Signature = ({ role, name }: { role: string; name: string }) => (
  <div>
    <div className="text-muted">{role}</div>
    <div className="mt-16 border-t border-foreground pt-1 font-semibold">{name || ' '}</div>
  </div>
)
