import { DAY, fmtAgo, fmtDateTime, JESSY } from '@artha/fixtures'
import { Badge, Button, Chip, ChipRow, DataTable, EmptyState, Input, KeyValue, NativeSelect, PageHeader, Sheet, type BadgeVariant, type Column } from '@artha/ui'
import type { AuditEntry } from '@artha/types'
import { Search, ScrollText, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useNow, useScoped } from '../../state/store'

const KIND_VARIANT: Record<AuditEntry['kind'], BadgeVariant> = { created: 'success', updated: 'info', deleted: 'accent' }
const PERIODS = { today: ['Today', 1], week: ['7 days', 7], month: ['30 days', 30] } as const
type Period = keyof typeof PERIODS

export function AuditPage() {
  const { state, actorName } = useScoped()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<AuditEntry | null>(null)
  const q = params.get('q') ?? ''
  const by = params.get('by') || null
  const entity = params.get('entity') || null
  const period = (params.get('period') as Period | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const base = state.audit.filter(
    (a) =>
      (!by || a.by === by) &&
      (!entity || a.entity === entity) &&
      terms.every((t) => `${a.label} ${a.entity} ${a.action} ${a.changes.map((c) => c.field).join(' ')}`.toLowerCase().includes(t)),
  )
  const inPeriod = (a: AuditEntry, p: Period) => now - Date.parse(a.at) <= PERIODS[p][1] * DAY
  const rows = base.filter((a) => !period || inPeriod(a, period))
  const actors = [...new Set(state.audit.map((a) => a.by))]
  const entities = [...new Set(state.audit.map((a) => a.entity))].sort()
  const filters = [q, by, entity, period].filter(Boolean).length

  const columns: Column<AuditEntry>[] = [
    {
      id: 'what',
      header: 'Change',
      cell: (a) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={KIND_VARIANT[a.kind]}>{a.kind}</Badge>
            <span className="truncate text-sm font-semibold">
              {a.entity} {a.label}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted">
            {a.changes.length ? a.changes.map((c) => c.field).join(', ') : a.action}
          </div>
        </div>
      ),
    },
    { id: 'by', header: 'By', hideBelow: 'sm', cell: (a) => <span className="text-sm">{actorName(a.by)}</span> },
    { id: 'action', header: 'Action', hideBelow: 'lg', cell: (a) => <span className="font-mono text-xs text-muted">{a.action}</span> },
    { id: 'at', header: 'When', align: 'right', sortValue: (a) => a.at, cell: (a) => <span className="whitespace-nowrap text-xs text-muted">{fmtAgo(a.at)}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every change to a record, who made it and what each field was before. Jessy's own actions are logged under her name."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search audit log"
            placeholder="Record, field or action"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow>
          <Chip active={!period} count={base.length} onClick={() => set('period', null)}>
            All time
          </Chip>
          {(Object.keys(PERIODS) as Period[]).map((p) => (
            <Chip key={p} active={period === p} count={base.filter((a) => inPeriod(a, p)).length} onClick={() => set('period', period === p ? null : p)}>
              {PERIODS[p][0]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by user" value={by ?? ''} onChange={(e) => set('by', e.target.value)}>
          <option value="">Everyone</option>
          {actors.map((id) => (
            <option key={id} value={id}>
              {id === JESSY ? state.settings.agentName : actorName(id)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect variant="inline" aria-label="Filter by record type" value={entity ?? ''} onChange={(e) => set('entity', e.target.value)}>
          <option value="">All records</option>
          {entities.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.audit.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(a) => a.id}
          rowLabel={(a) => `${a.entity} ${a.label}`}
          onRowClick={setOpen}
          initialSort={{ id: 'at', desc: true }}
          resetPageKey={`${q}|${by}|${entity}|${period}`}
          empty={
            state.audit.length ? (
              <EmptyState compact title="No changes match" action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact icon={<ScrollText />} title="No changes yet" description="Edits, approvals and settings changes appear here as people and Jessy make them." />
            )
          }
        />
      </div>
      <Sheet open={!!open} onOpenChange={(v) => !v && setOpen(null)} title={open ? `${open.entity} ${open.label}` : ''} description={open ? `${open.kind} by ${actorName(open.by)} · ${fmtDateTime(open.at)}` : undefined}>
        {open && (
          <div className="space-y-4">
            <KeyValue
              bare
              size="sm"
              items={[
                { label: 'Action', value: <span className="font-mono text-xs">{open.action}</span> },
                { label: 'Record ID', value: <span className="font-mono text-xs">{open.entityId}</span> },
              ]}
            />
            {open.changes.length ? (
              <ul className="space-y-2">
                {open.changes.map((c) => (
                  <li key={c.field} className="rounded-2xl bg-surface-2 p-3 text-sm">
                    <div className="font-mono text-xs font-semibold">{c.field}</div>
                    <div className="mt-1.5 break-words text-accent-strong line-through decoration-1">{c.from}</div>
                    <div className="break-words text-success">{c.to}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">The whole record was {open.kind}.</p>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
