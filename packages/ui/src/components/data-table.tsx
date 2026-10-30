import { ArrowUpRight, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, ChevronUp } from 'lucide-react'
import { useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import { cn } from '../lib/cn'
import { Button } from './button'
import { EmptyState } from './display'

export interface Column<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null
  align?: 'left' | 'right'
  hideBelow?: 'sm' | 'md' | 'lg' | 'xl'
  width?: string
}

const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell', xl: 'hidden xl:table-cell' }

type Sort = { id: string; desc: boolean } | null

const compare = (a: string | number | null, b: string | number | null) => {
  if (a === null) return 1
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'id', { numeric: true })
}

/** A click that starts on a nested control or inside a portal never opens the row. */
const fromNestedControl = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!e.currentTarget.contains(target)) return true
  return !!target.closest('button, a, input, select, textarea, [role=menuitem]')
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  onRowClick,
  rowLabel,
  pageSize = 12,
  empty,
  initialSort = null,
  resetPageKey = '',
  rowClassName,
}: {
  rows: T[]
  columns: Column<T>[]
  getRowKey: (row: T) => string
  onRowClick?: (row: T) => void
  rowLabel?: (row: T) => string
  pageSize?: number
  empty?: ReactNode
  initialSort?: Sort
  resetPageKey?: string
  rowClassName?: (row: T) => string | undefined
}) {
  const [sort, setSort] = useState<Sort>(initialSort)
  const [page, setPage] = useState(0)
  const [pageKey, setPageKey] = useState(resetPageKey)
  if (pageKey !== resetPageKey) {
    setPageKey(resetPageKey)
    setPage(0)
  }

  const sorted = useMemo(() => {
    if (!sort) return rows
    const get = columns.find((c) => c.id === sort.id)?.sortValue
    if (!get) return rows
    // Nulls sort last in both directions.
    return [...rows].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      if (va === null || vb === null) return compare(va, vb)
      return sort.desc ? compare(vb, va) : compare(va, vb)
    })
  }, [rows, columns, sort])

  const pages = pageSize ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1
  const current = Math.min(page, pages - 1)
  const visible = pageSize ? sorted.slice(current * pageSize, current * pageSize + pageSize) : sorted

  return (
    <div>
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Tabel data. Geser ke samping untuk kolom lain.">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => {
                const active = sort?.id === c.id
                return (
                  <th
                    key={c.id}
                    style={c.width ? { width: c.width } : undefined}
                    aria-sort={active ? (sort.desc ? 'descending' : 'ascending') : undefined}
                    className={cn(
                      'h-10 whitespace-nowrap px-4 text-xs font-semibold uppercase tracking-wide text-muted',
                      c.align === 'right' ? 'text-right' : 'text-left',
                      c.hideBelow && HIDE[c.hideBelow],
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => setSort(active ? (sort.desc ? null : { id: c.id, desc: true }) : { id: c.id, desc: false })}
                        className="-mx-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-1 uppercase hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      >
                        {c.header}
                        {!active ? (
                          <ChevronsUpDown className="size-3.5 opacity-40" />
                        ) : sort.desc ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronUp className="size-3.5" />
                        )}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>{empty ?? <EmptyState compact title="Belum ada data" />}</td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr
                  key={getRowKey(row)}
                  data-clickable={!!onRowClick}
                  onClick={onRowClick ? (e) => !fromNestedControl(e) && onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-border transition-colors last:border-b-0 hover:bg-surface-2 data-[clickable=true]:cursor-pointer',
                    rowClassName?.(row),
                  )}
                >
                  {columns.map((c, i) => (
                    <td
                      key={c.id}
                      className={cn('px-4 py-3 align-middle', c.align === 'right' && 'text-right tabular-nums', c.hideBelow && HIDE[c.hideBelow])}
                    >
                      {i === 0 && onRowClick ? (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`Buka ${rowLabel?.(row) ?? ''}`.trim()}
                            onClick={() => onRowClick(row)}
                            className="-ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 [&_svg]:size-4"
                          >
                            <ArrowUpRight />
                          </button>
                          <div className="min-w-0 flex-1">{c.cell(row)}</div>
                        </div>
                      ) : (
                        c.cell(row)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageSize > 0 && sorted.length > pageSize && (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
          <span className="tabular-nums">
            {current * pageSize + 1}-{Math.min(sorted.length, (current + 1) * pageSize)} dari {sorted.length}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="icon-sm" aria-label="Halaman sebelumnya" disabled={current === 0} onClick={() => setPage(current - 1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Halaman berikutnya" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
