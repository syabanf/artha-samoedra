import { fmtQty, isPoLate, nowMs } from '@artha/fixtures'
import { PO_STATUS_LABEL, PR_STATUS_LABEL, QC_RESULT_LABEL, type Item, type PoStatus, type PrStatus, type PurchaseOrder, type QcResult } from '@artha/types'
import { Badge, NativeSelect, type BadgeVariant } from '@artha/ui'
import type { ComponentProps } from 'react'
import { useScoped } from '../../state/store'

type SelectProps<T = never> = Omit<ComponentProps<typeof NativeSelect>, 'value' | 'onChange' | 'filter'> & {
  value: string
  onChange: (id: string) => void
  placeholder?: string
  filter?: (row: T) => boolean
}

/** Active items by category; a past pick stays visible. */
export function ItemSelect({ value, onChange, placeholder = 'Pick an item', filter, ...props }: SelectProps<Item>) {
  const { state } = useScoped()
  const rows = state.items.filter((i) => i.id === value || (i.active && (!filter || filter(i))))
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {state.itemCategories.map((c) => {
        const group = rows.filter((i) => i.categoryId === c.id).sort((a, b) => a.name.localeCompare(b.name))
        return group.length ? (
          <optgroup key={c.id} label={c.name}>
            {group.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} · {i.sku}
              </option>
            ))}
          </optgroup>
        ) : null
      })}
    </NativeSelect>
  )
}

export function WarehouseSelect({ value, onChange, placeholder = 'Pick a warehouse', ...props }: SelectProps) {
  const { state } = useScoped()
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {state.warehouses
        .filter((w) => w.active || w.id === value)
        .map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
    </NativeSelect>
  )
}

export function VendorSelect({ value, onChange, placeholder = 'Pick a supplier', ...props }: SelectProps) {
  const { state } = useScoped()
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      <option value="">{placeholder}</option>
      {state.vendors
        .filter((v) => v.active || v.id === value)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
    </NativeSelect>
  )
}

/** A quantity with the item's unit, in tabular figures. */
export function Qty({ itemId, qty, className }: { itemId: string; qty: number; className?: string }) {
  const { state } = useScoped()
  return <span className={`whitespace-nowrap tabular-nums ${className ?? ''}`}>{fmtQty(state, itemId, qty)}</span>
}

const PR: Record<PrStatus, BadgeVariant> = { draft: 'muted', pending: 'warning', approved: 'success', rejected: 'danger', ordered: 'info', cancelled: 'muted' }
export const PrStatusBadge = ({ status }: { status: PrStatus }) => (
  <Badge variant={PR[status]} dot={status === 'pending'}>
    {PR_STATUS_LABEL[status]}
  </Badge>
)

const PO: Record<PoStatus, BadgeVariant> = { draft: 'muted', sent: 'info', partial: 'warning', received: 'success', closed: 'ink', cancelled: 'muted' }
/** Order status; a late order shows Late instead. */
export const PoStatusBadge = ({ po }: { po: PurchaseOrder }) =>
  isPoLate(po, nowMs()) ? (
    <Badge variant="danger" dot>
      Late
    </Badge>
  ) : (
    <Badge variant={PO[po.status]}>{PO_STATUS_LABEL[po.status]}</Badge>
  )

const QC: Record<QcResult, BadgeVariant> = { passed: 'success', partial: 'warning', failed: 'danger' }
export const QcBadge = ({ result }: { result: QcResult }) => <Badge variant={QC[result]}>{QC_RESULT_LABEL[result]}</Badge>

/** Passed when nothing was rejected, failed when nothing was accepted. */
export const qcResult = (lines: { accepted: number; rejected: number }[]): QcResult => {
  const rejected = lines.reduce((n, l) => n + l.rejected, 0)
  const accepted = lines.reduce((n, l) => n + l.accepted, 0)
  return !rejected ? 'passed' : accepted ? 'partial' : 'failed'
}
