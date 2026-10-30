import { blankLine, documentTotals, fmtIdr, lineAmount, SETTLE_STATE_LABEL, settleState, type DocumentTotals, type SettleState } from '@artha/fixtures'
import {
  GL_ACCOUNT_TYPE_LABEL,
  JOURNAL_STATUS_LABEL,
  type DocumentLine,
  type GlAccount,
  type GlAccountType,
  type JournalStatus,
} from '@artha/types'
import { Badge, Button, cn, Input, NativeSelect, type BadgeVariant } from '@artha/ui'
import { Plus, Trash2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useScoped } from '../../state/store'

const TYPES: GlAccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense']

/** Active ledger accounts grouped by type. `types` narrows the list; `cash` keeps only cash and bank accounts. */
export function AccountSelect({
  value,
  onChange,
  types = TYPES,
  cash,
  placeholder = 'Pick an account',
  ...props
}: Omit<ComponentProps<typeof NativeSelect>, 'value' | 'onChange'> & {
  value: string
  onChange: (id: string) => void
  types?: GlAccountType[]
  cash?: boolean
  placeholder?: string
}) {
  const { state } = useScoped()
  const rows = state.glAccounts.filter((a) => (a.active || a.id === value) && types.includes(a.type) && (cash === undefined || a.isCash === cash))
  const byCode = (a: GlAccount, b: GlAccount) => a.code.localeCompare(b.code)
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {types.map((t) => {
        const group = rows.filter((a) => a.type === t).sort(byCode)
        return group.length ? (
          <optgroup key={t} label={GL_ACCOUNT_TYPE_LABEL[t]}>
            {group.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} · {a.name}
              </option>
            ))}
          </optgroup>
        ) : null
      })}
    </NativeSelect>
  )
}

/** Rupiah, right-aligned with tabular figures; zero shows as a dash in ledgers. */
export const Money = ({ value, dash, className }: { value: number; dash?: boolean; className?: string }) => (
  <span className={cn('whitespace-nowrap tabular-nums', value < 0 && 'text-danger', className)}>{dash && !value ? '–' : fmtIdr(value)}</span>
)

/** Editable bill or invoice lines with subtotal, VAT and total underneath. */
export function DocumentLinesEditor({
  lines,
  onChange,
  taxPct,
  accountTypes,
  error,
}: {
  lines: DocumentLine[]
  onChange: (lines: DocumentLine[]) => void
  taxPct: number
  /** ['expense'] or ['asset', 'expense'] on bills, ['revenue'] on invoices. */
  accountTypes: GlAccountType[]
  error?: string
}) {
  const set = (id: string, patch: Partial<DocumentLine>) => onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const totals = documentTotals({ lines, taxPct, paid: [] })
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {lines.map((l, i) => (
          <li key={l.id} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_5rem_9rem_auto] sm:items-center">
            <Input aria-label={`Line ${i + 1} description`} placeholder="Description" value={l.description} onChange={(e) => set(l.id, { description: e.target.value })} className="col-span-2 sm:col-span-1" />
            <AccountSelect aria-label={`Line ${i + 1} account`} value={l.accountId} onChange={(accountId) => set(l.id, { accountId })} types={accountTypes} className="col-span-2 sm:col-span-1" />
            <Input aria-label={`Line ${i + 1} quantity`} inputMode="numeric" value={l.qty || ''} onChange={(e) => set(l.id, { qty: Number(e.target.value.replace(/\D/g, '')) })} />
            <Input aria-label={`Line ${i + 1} unit price`} inputMode="numeric" placeholder="Unit price" value={l.unitPrice || ''} onChange={(e) => set(l.id, { unitPrice: Number(e.target.value.replace(/\D/g, '')) })} />
            <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end">
              <Money value={lineAmount(l)} className="text-sm font-semibold sm:hidden" />
              <Button variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} disabled={lines.length === 1} title={lines.length === 1 ? 'A document needs at least one line.' : undefined} onClick={() => onChange(lines.filter((x) => x.id !== l.id))}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Button variant="outline" size="sm" onClick={() => onChange([...lines, blankLine()])}>
          <Plus />
          Add line
        </Button>
        <TotalsBlock totals={totals} taxPct={taxPct} />
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  )
}

export const TotalsBlock = ({ totals, taxPct, showPaid }: { totals: DocumentTotals; taxPct: number; showPaid?: boolean }) => (
  <dl className="ml-auto grid min-w-[16rem] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
    <dt className="text-muted">Subtotal</dt>
    <dd className="text-right"><Money value={totals.subtotal} /></dd>
    <dt className="text-muted">VAT {taxPct}%</dt>
    <dd className="text-right"><Money value={totals.tax} /></dd>
    <dt className="font-semibold">Total</dt>
    <dd className="text-right font-semibold"><Money value={totals.total} /></dd>
    {showPaid && (
      <>
        <dt className="text-muted">Paid</dt>
        <dd className="text-right"><Money value={totals.paid} /></dd>
        <dt className="font-semibold">Balance due</dt>
        <dd className="text-right font-semibold"><Money value={totals.balance} /></dd>
      </>
    )}
  </dl>
)

const JOURNAL: Record<JournalStatus, BadgeVariant> = { draft: 'warning', posted: 'success', void: 'muted' }
export const JournalStatusBadge = ({ status }: { status: JournalStatus }) => <Badge variant={JOURNAL[status]}>{JOURNAL_STATUS_LABEL[status]}</Badge>

const SETTLE: Record<SettleState, BadgeVariant> = { unpaid: 'default', partial: 'info', paid: 'success' }
/** Unpaid, part paid or paid; overdue wins when the balance is late. */
export const SettleBadge = ({ totals, overdue }: { totals: DocumentTotals; overdue?: boolean }) => {
  const st = settleState(totals)
  return overdue && st !== 'paid' ? (
    <Badge variant="danger" dot>
      Overdue
    </Badge>
  ) : (
    <Badge variant={SETTLE[st]}>{SETTLE_STATE_LABEL[st]}</Badge>
  )
}
