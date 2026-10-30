import { Button, EmptyState } from '@artha/ui'
import type { ReactNode } from 'react'

/** "N of M" caption with a Clear filters button, shown once a filter is on. */
export function FilterCaption({ shown, total, filters, onClear }: { shown: number; total: number; filters: number; onClear: () => void }) {
  if (!filters) return null
  return (
    <span className="text-xs text-muted tabular-nums">
      {shown} of {total}
      <Button variant="ghost" size="sm" className="ml-1" onClick={onClear}>
        Clear {filters} {filters === 1 ? 'filter' : 'filters'}
      </Button>
    </span>
  )
}

export const filteredEmpty = (filters: number, onClear: () => void, noun: string, none: ReactNode) =>
  filters ? (
    <EmptyState compact title={`No matching ${noun}`} description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button>} />
  ) : (
    none
  )
