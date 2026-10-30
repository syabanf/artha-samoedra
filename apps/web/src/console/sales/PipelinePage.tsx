import { fmtIdrShort, stageOf } from '@artha/fixtures'
import { Button, Card, EmptyState, Input, NativeSelect, PageHeader, cn } from '@artha/ui'
import type { Deal, DealStage } from '@artha/types'
import { Plus, Search, X } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Avatar, daysInStage, DealDialog, LostDialog, openStages } from './DealPages'

const DRAG_TYPE = 'text/plain'

export function PipelinePage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [losing, setLosing] = useState<Deal | null>(null)
  const q = params.get('q') ?? ''
  const ownerId = params.get('owner') || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const contactName = (d: Deal) => state.contacts.find((c) => c.id === d.contactId)?.name ?? '–'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = state.deals.filter((d) => (!ownerId || d.ownerId === ownerId) && terms.every((t) => `${d.code} ${d.title} ${contactName(d)}`.toLowerCase().includes(t)))
  const filters = [q, ownerId].filter(Boolean).length
  const columns = openStages(state)
  const closed = state.stages.filter((st) => st.kind !== 'open')
  const owners = state.users.filter((u) => state.deals.some((d) => d.ownerId === u.id))
  const openCount = (list: Deal[]) => list.filter((d) => stageOf(state, d)?.kind === 'open').length
  const manage = can('deal.manage')

  const move = (dealId: string, stageId: string) => {
    const deal = state.deals.find((d) => d.id === dealId)
    const to = state.stages.find((st) => st.id === stageId)
    if (!deal || !to || deal.stageId === stageId) return
    if (to.kind === 'lost') setLosing(deal)
    else act({ type: 'deals/move', id: deal.id, stageId }, to.kind === 'won' ? 'Deal won' : `Moved to ${to.name}`, deal.code)
  }

  return (
    <div>
      <PageHeader
        title="Pipeline"
        description="Drag a deal to its next stage, or use Move to on the card. Moving to Lost asks for a reason."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search deals"
              placeholder="Code, title or buyer"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {manage && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New deal
              </Button>
            )}
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <NativeSelect variant="inline" aria-label="Filter by owner" value={ownerId ?? ''} onChange={(e) => set('owner', e.target.value)}>
          <option value="">All owners</option>
          {owners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        <span className="text-xs text-muted tabular-nums">
          {openCount(rows)} of {openCount(state.deals)} open deals
          {filters > 0 && (
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:flex md:items-start md:overflow-x-auto md:pb-2">
        {columns.map((st) => (
          <StageColumn key={st.id} stage={st} deals={rows.filter((d) => d.stageId === st.id)} droppable={manage} onDrop={move}>
            {(d) => <DealCard key={d.id} deal={d} manage={manage} onMove={move} />}
          </StageColumn>
        ))}
        <div className="grid grid-cols-2 gap-3 md:w-56 md:shrink-0 md:grid-cols-1">
          {closed.map((st) => (
            <ClosedTile key={st.id} stage={st} deals={rows.filter((d) => d.stageId === st.id)} droppable={manage} onDrop={move} />
          ))}
        </div>
      </div>
      {filters > 0 && rows.length === 0 && (
        <Card className="mt-3">
          <EmptyState compact title="No matching deals" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
        </Card>
      )}

      <DealDialog open={creating} onOpenChange={setCreating} editing={null} onSaved={(d) => navigate(paths.deal(d.id))} />
      <LostDialog deal={losing} onOpenChange={(v) => !v && setLosing(null)} />
    </div>
  )
}

/** Drop target bookkeeping shared by columns and the Won and Lost tiles. */
function useDrop(stageId: string, enabled: boolean, onDrop: (dealId: string, stageId: string) => void) {
  const [over, setOver] = useState(false)
  if (!enabled) return { over: false, handlers: {} }
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        e.preventDefault()
        setOver(false)
        onDrop(e.dataTransfer.getData(DRAG_TYPE), stageId)
      },
    },
  }
}

function StageColumn({
  stage,
  deals,
  droppable,
  onDrop,
  children,
}: {
  stage: DealStage
  deals: Deal[]
  droppable: boolean
  onDrop: (dealId: string, stageId: string) => void
  children: (d: Deal) => ReactNode
}) {
  const { over, handlers } = useDrop(stage.id, droppable, onDrop)
  const total = deals.reduce((sum, d) => sum + d.value, 0)
  return (
    <section
      aria-label={`${stage.name}, ${deals.length} deals`}
      className={cn('flex min-w-0 flex-col rounded-card bg-surface-2 p-2 transition-colors md:w-72 md:shrink-0', over && 'ring-2 ring-accent/40')}
      {...handlers}
    >
      <header className="flex items-baseline justify-between gap-2 px-2 pb-2 pt-1">
        <h2 className="truncate text-sm font-semibold">
          {stage.name} <span className="font-normal text-muted tabular-nums">{deals.length}</span>
        </h2>
        <span className="shrink-0 text-xs font-semibold text-muted tabular-nums">{fmtIdrShort(total)}</span>
      </header>
      <ul className="flex min-h-16 flex-col gap-2">
        {deals.map(children)}
        {deals.length === 0 && <li className="rounded-2xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">No deals</li>}
      </ul>
    </section>
  )
}

function ClosedTile({ stage, deals, droppable, onDrop }: { stage: DealStage; deals: Deal[]; droppable: boolean; onDrop: (dealId: string, stageId: string) => void }) {
  const { over, handlers } = useDrop(stage.id, droppable, onDrop)
  const total = deals.reduce((sum, d) => sum + d.value, 0)
  return (
    <Link
      to={`${paths.deals}?stage=${stage.id}`}
      className={cn(
        'block min-w-0 rounded-card p-4 shadow-card transition-colors',
        stage.kind === 'won' ? 'bg-ink text-on-ink' : 'bg-card hover:bg-surface',
        over && 'ring-2 ring-accent/60',
      )}
      {...handlers}
    >
      <div className={cn('text-xs font-semibold', stage.kind === 'won' ? 'text-on-ink-muted' : 'text-muted')}>{stage.name}</div>
      <div className="mt-1 text-2xl font-extrabold tabular-nums">{deals.length}</div>
      <div className={cn('text-xs tabular-nums', stage.kind === 'won' ? 'text-on-ink-muted' : 'text-muted')}>{fmtIdrShort(total)}</div>
    </Link>
  )
}

function DealCard({ deal, manage, onMove }: { deal: Deal; manage: boolean; onMove: (dealId: string, stageId: string) => void }) {
  const { state } = useAppState()
  const now = useNow()
  const contact = state.contacts.find((c) => c.id === deal.contactId)
  const owner = state.users.find((u) => u.id === deal.ownerId)
  const days = daysInStage(state, deal, now)
  const late = Date.parse(deal.expectedCloseAt) < now
  return (
    <li
      draggable={manage}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, deal.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn('rounded-2xl bg-card p-3 shadow-card', manage && 'md:cursor-grab md:active:cursor-grabbing')}
    >
      <Link to={paths.deal(deal.id)} className="block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
        <div className="font-mono text-[11px] font-semibold text-muted">{deal.code}</div>
        <div className="line-clamp-2 text-sm font-semibold">{deal.title}</div>
        <div className="truncate text-xs text-muted">{contact?.name ?? '–'}</div>
      </Link>
      <div className="mt-2 flex items-center gap-2">
        <span className="font-bold tabular-nums">{fmtIdrShort(deal.value)}</span>
        <span className={cn('ml-auto text-[11px] tabular-nums', late ? 'font-semibold text-accent' : 'text-muted')} title={late ? 'Past the expected close date' : undefined}>
          {days} {days === 1 ? 'day' : 'days'}
        </span>
        {owner && <Avatar name={owner.name} />}
      </div>
      {manage && (
        <NativeSelect variant="inline" aria-label={`Move ${deal.code} to`} value="" onChange={(e) => onMove(deal.id, e.target.value)} className="-ml-1 mt-1 w-fit [&_select]:text-xs">
          <option value="">Move to</option>
          {state.stages
            .filter((st) => st.id !== deal.stageId)
            .map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
        </NativeSelect>
      )}
    </li>
  )
}
