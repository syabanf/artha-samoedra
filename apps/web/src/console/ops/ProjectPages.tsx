import { addDays, blockerFor, countBy, fmtArea, fmtDateTime, fmtIdr, fmtIdrShort, isOpenDeal, newId, nowIso, unitCounts } from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  Chip,
  ChipRow,
  cn,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  NativeSelect,
  PageHeader,
  Sheet,
  StatCard,
  Textarea,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { PROJECT_KIND_LABEL, UNIT_STATUS_LABEL, type Project, type ProjectKind, type Unit, type UnitStatus } from '@artha/types'
import { Building2, CalendarPlus, CircleCheck, Hourglass, Lock, Pencil, Plus, Search, Unlock, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { priceInput, readPrice } from '../../lib/price'
import { useAppState, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { fromLocalInput, toLocalInput, VisitDialog } from './VisitPages'

// ---------------------------------------------------------------- shared bits

const UNIT_STATUSES: UnitStatus[] = ['available', 'held', 'booked', 'sold']
const KINDS = Object.keys(PROJECT_KIND_LABEL) as ProjectKind[]
const UNIT_VARIANT: Record<UnitStatus, BadgeVariant> = { available: 'success', held: 'warning', booked: 'info', sold: 'ink' }
const UNIT_TILE: Record<UnitStatus, string> = {
  available: 'bg-success-soft',
  held: 'bg-warning-soft',
  booked: 'bg-info-soft',
  sold: 'bg-ink text-on-ink',
}
const UNIT_BAR: Record<UnitStatus, string> = { available: 'bg-success', held: 'bg-warning', booked: 'bg-info', sold: 'bg-ink' }
const STAT_ICON: Record<UnitStatus, typeof CircleCheck> = { available: CircleCheck, held: Hourglass, booked: Lock, sold: Building2 }
const STAT_TONE = { available: 'success', held: 'warning', booked: 'info', sold: 'ink' } as const
const UnitStatusBadge = ({ status }: { status: UnitStatus }) => <Badge variant={UNIT_VARIANT[status]}>{UNIT_STATUS_LABEL[status]}</Badge>

/** Stacked bar of unit statuses with a legend. */
function AvailabilityBar({ units, onInk }: { units: Unit[]; onInk?: boolean }) {
  const counts = unitCounts(units)
  const total = units.length
  return (
    <div className="min-w-0">
      <div className={cn('flex h-2 w-full overflow-hidden rounded-full', onInk ? 'bg-white/15' : 'bg-surface')} role="img" aria-label={UNIT_STATUSES.map((s) => `${counts[s]} ${UNIT_STATUS_LABEL[s].toLowerCase()}`).join(', ')}>
        {total > 0 && UNIT_STATUSES.map((s) => counts[s] > 0 && <div key={s} className={cn('h-full', UNIT_BAR[s], onInk && s === 'sold' && 'bg-white/60')} style={{ width: `${(counts[s] / total) * 100}%` }} />)}
      </div>
      <div className={cn('mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]', onInk ? 'text-on-ink-muted' : 'text-muted')}>
        {UNIT_STATUSES.map((s) => (
          <span key={s} className="flex items-center gap-1 tabular-nums">
            <span className={cn('size-1.5 rounded-full', UNIT_BAR[s], onInk && s === 'sold' && 'bg-white/60')} />
            {counts[s]} {UNIT_STATUS_LABEL[s].toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- project dialog

function ProjectDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; editing: Project | null; onSaved?: (p: Project) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? `Edit ${editing.name}` : 'New project'}
      description="A project groups the units a developer partner sells: a cluster, a tower or a warehouse park."
    >
      <ProjectForm
        editing={editing}
        onDone={(p) => {
          onOpenChange(false)
          if (p) onSaved?.(p)
        }}
      />
    </Dialog>
  )
}

function ProjectForm({ editing, onDone }: { editing: Project | null; onDone: (p: Project | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    code: editing?.code ?? '',
    name: editing?.name ?? '',
    kind: editing?.kind ?? ('cluster' as ProjectKind),
    partnerId: editing?.partnerId ?? '',
    city: editing?.city ?? '',
    district: editing?.district ?? '',
    description: editing?.description ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const code = f.code.trim().toUpperCase()
  const errors = {
    code: !code ? 'Enter a short code, for example PRJ-SRP.' : state.projects.some((p) => p.code === code && p.id !== editing?.id) ? 'Another project uses this code.' : null,
    name: f.name.trim().length >= 3 ? null : 'Enter the project name.',
    partnerId: f.partnerId ? null : 'Choose the developer partner.',
    city: f.city.trim() ? null : 'Enter the city.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const project: Project = {
          id: editing?.id ?? newId('prj'),
          createdAt: editing?.createdAt ?? nowIso(),
          code,
          name: f.name.trim(),
          kind: f.kind,
          partnerId: f.partnerId,
          city: f.city.trim(),
          district: f.district.trim(),
          description: f.description.trim(),
        }
        if (act({ type: 'projects/upsert', project }, editing ? 'Project updated' : 'Project created', project.name)) onDone(project)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={show(errors.name)} className="sm:col-span-2">
          <Input value={f.name} onChange={set('name')} placeholder="Serpong Green Residence" />
        </FormField>
        <FormField label="Code" required error={show(errors.code)}>
          <Input value={f.code} onChange={set('code')} placeholder="PRJ-SRP" autoComplete="off" />
        </FormField>
        <FormField label="Kind" required>
          <NativeSelect value={f.kind} onChange={set('kind')}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {PROJECT_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Developer partner" required error={show(errors.partnerId)} className="sm:col-span-2">
          <NativeSelect value={f.partnerId} onChange={set('partnerId')} className={f.partnerId ? '' : '[&_select]:text-muted'}>
            <option value="">Choose partner</option>
            {state.partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="City" required error={show(errors.city)}>
          <Input value={f.city} onChange={set('city')} placeholder="Tangerang Selatan" />
        </FormField>
        <FormField label="District" hint="Optional">
          <Input value={f.district} onChange={set('district')} placeholder="Serpong" />
        </FormField>
        <FormField label="Description" hint="Optional" className="sm:col-span-2">
          <Textarea value={f.description} onChange={set('description')} className="min-h-20" />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Create project'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- list

export function ProjectsPage() {
  const { state, partnerName } = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const q = params.get('q') ?? ''
  const kind = (params.get('kind') as ProjectKind | null) || null
  const city = params.get('city') || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const unitsOf = (p: Project) => state.units.filter((u) => u.projectId === p.id)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (p: Project) =>
    terms.every((t) => `${p.code} ${p.name} ${p.city} ${p.district} ${partnerName(p.partnerId)}`.toLowerCase().includes(t)) && (!city || p.city === city)
  const base = state.projects.filter(matches)
  const rows = base.filter((p) => !kind || p.kind === kind)
  const counts = countBy(base, (p) => p.kind)
  const filters = [q, kind, city].filter(Boolean).length
  const cities = [...new Set(state.projects.map((p) => p.city))].sort()
  const all = unitCounts(state.units)

  const columns: Column<Project>[] = [
    {
      id: 'name',
      header: 'Project',
      sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{p.code}</div>
          <div className="truncate text-sm font-medium">{p.name}</div>
          <div className="truncate text-xs text-muted">
            {[p.district, p.city].filter(Boolean).join(', ')}
          </div>
          <div className="mt-2 sm:hidden">
            <AvailabilityBar units={unitsOf(p)} />
          </div>
        </div>
      ),
    },
    { id: 'kind', header: 'Kind', hideBelow: 'md', sortValue: (p) => PROJECT_KIND_LABEL[p.kind], cell: (p) => <span className="text-sm">{PROJECT_KIND_LABEL[p.kind]}</span> },
    { id: 'partner', header: 'Partner', hideBelow: 'lg', sortValue: (p) => partnerName(p.partnerId), cell: (p) => <span className="text-sm">{partnerName(p.partnerId)}</span> },
    { id: 'availability', header: 'Availability', hideBelow: 'sm', width: '34%', cell: (p) => <AvailabilityBar units={unitsOf(p)} /> },
    {
      id: 'available',
      header: 'Available',
      align: 'right',
      sortValue: (p) => unitCounts(unitsOf(p)).available,
      cell: (p) => (
        <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
          {unitCounts(unitsOf(p)).available}
          <span className="font-normal text-muted"> of {unitsOf(p).length}</span>
        </span>
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Projects"
        description="Developments with many units for sale. Open a project to see its unit board and hold, book or sell units."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search projects"
              placeholder="Name, code, city or partner"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('project.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New project
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Projects" value={state.projects.length} icon={<Building2 />} tone="ink" />
        <StatCard label="Available units" value={all.available} icon={<CircleCheck />} tone="success" />
        <StatCard label="On hold" value={all.held} icon={<Hourglass />} tone={all.held ? 'warning' : 'default'} hint="Lapses back to available at the deadline" />
        <StatCard label="Booked or sold" value={all.booked + all.sold} icon={<Lock />} tone="info" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!kind} count={base.length} onClick={() => set('kind', null)}>
            All
          </Chip>
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} count={counts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
              {PROJECT_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by city" value={city ?? ''} onChange={(e) => set('city', e.target.value)}>
          <option value="">All cities</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.projects.length}
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
          getRowKey={(p) => p.id}
          rowLabel={(p) => p.name}
          onRowClick={(p) => navigate(paths.project(p.id))}
          initialSort={{ id: 'name', desc: false }}
          resetPageKey={`${q}|${kind}|${city}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching projects" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No projects yet" description="Create a project when a developer partner hands over a block of units." />
            )
          }
        />
      </div>
      <ProjectDialog open={creating} onOpenChange={setCreating} editing={null} onSaved={(p) => navigate(paths.project(p.id))} />
    </div>
  )
}

// ---------------------------------------------------------------- detail: unit board

type Open = 'edit' | 'unit' | null

export function ProjectDetailPage() {
  const { id } = useParams()
  const { state, partnerName } = useScoped()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const [open, setOpen] = useState<Open>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const p = state.projects.find((x) => x.id === id)
  if (!p) {
    return (
      <Card>
        <EmptyState title="Project not found" description="This project may have been removed." action={<BackButton fallback={paths.projects} />} />
      </Card>
    )
  }
  const q = params.get('q') ?? ''
  const status = (params.get('status') as UnitStatus | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const units = state.units.filter((u) => u.projectId === p.id)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const base = units.filter((u) => terms.every((t) => `${u.code} ${u.type} ${u.group}`.toLowerCase().includes(t)))
  const shown = base.filter((u) => !status || u.status === status)
  const counts = unitCounts(base)
  const all = unitCounts(units)
  const groups = [...new Set(units.map((u) => u.group))]
  const filters = [q, status].filter(Boolean).length
  const stock = units.filter((u) => u.status === 'available').reduce((n, u) => n + u.price, 0)
  const manage = can('project.manage')
  const selected = units.find((u) => u.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.projects} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{p.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
        </div>
        {manage && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setOpen('edit')}>
              <Pencil />
              Edit
            </Button>
            <Button onClick={() => setOpen('unit')}>
              <Plus />
              Add unit
            </Button>
          </div>
        )}
      </div>

      <Card variant="ink" className="p-6">
        <div className="flex flex-wrap gap-1.5">
          <Badge className="bg-white/10 text-white">{PROJECT_KIND_LABEL[p.kind]}</Badge>
          <Badge className="bg-white/10 text-white">{units.length} units</Badge>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="min-w-0">
            <div className="text-3xl font-bold tracking-tight tabular-nums">{fmtIdrShort(stock)}</div>
            <div className="text-xs text-on-ink-muted">Asking price of the {all.available} available units</div>
            <div className="mt-4">
              <AvailabilityBar units={units} onInk />
            </div>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Developer</div>
              <Link to={paths.partner(p.partnerId)} className="block truncate font-semibold hover:underline">
                {partnerName(p.partnerId)}
              </Link>
            </div>
            <div className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Location</div>
              <div className="truncate font-semibold">{[p.district, p.city].filter(Boolean).join(', ')}</div>
            </div>
            {p.description && <p className="rounded-2xl bg-white/5 p-3 text-on-ink-muted sm:col-span-2">{p.description}</p>}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {UNIT_STATUSES.map((s) => {
          const Icon = STAT_ICON[s]
          return (
            <StatCard
              key={s}
              label={UNIT_STATUS_LABEL[s]}
              value={all[s]}
              icon={<Icon />}
              tone={STAT_TONE[s]}
              active={status === s}
              onClick={() => set('status', status === s ? null : s)}
            />
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={base.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {UNIT_STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s]} onClick={() => set('status', status === s ? null : s)}>
              {UNIT_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search units"
          placeholder="Unit code or type"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="w-full sm:w-60"
          right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
        />
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {shown.length} of {units.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      {shown.length === 0 ? (
        <Card>
          {filters ? (
            <EmptyState compact title="No matching units" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
          ) : (
            <EmptyState compact title="No units yet" description={manage ? 'Add the first unit to build the availability board.' : 'Units appear here once the team adds them.'} />
          )}
        </Card>
      ) : (
        groups.map((g) => {
          const tiles = shown.filter((u) => u.group === g)
          if (!tiles.length) return null
          return (
            <Card key={g} className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{g}</h2>
                <span className="text-xs text-muted tabular-nums">
                  {unitCounts(tiles).available} available of {tiles.length}
                </span>
              </div>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                {tiles.map((u) => (
                  <li key={u.id}>
                    <UnitTile unit={u} onOpen={() => setSelectedId(u.id)} />
                  </li>
                ))}
              </ul>
            </Card>
          )
        })
      )}

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)} title={selected ? `Unit ${selected.code}` : 'Unit'} description={selected ? `${selected.group}, ${selected.type}` : undefined}>
        {selected && <UnitPanel unit={selected} project={p} />}
      </Sheet>
      <ProjectDialog open={open === 'edit'} onOpenChange={(o) => !o && setOpen(null)} editing={p} />
      <UnitDialog open={open === 'unit'} onOpenChange={(o) => !o && setOpen(null)} project={p} editing={null} />
    </div>
  )
}

function UnitTile({ unit: u, onOpen }: { unit: Unit; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Unit ${u.code}, ${UNIT_STATUS_LABEL[u.status]}`}
      className={cn('flex h-full w-full flex-col items-start rounded-2xl p-3 text-left transition-shadow hover:shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40', UNIT_TILE[u.status])}
    >
      <span className="flex w-full items-center justify-between gap-1">
        <span className="font-mono text-sm font-bold">{u.code}</span>
        <span className={cn('text-[10px] font-semibold', u.status === 'sold' ? 'text-on-ink-muted' : 'text-muted')}>{UNIT_STATUS_LABEL[u.status]}</span>
      </span>
      <span className={cn('mt-1 truncate text-xs', u.status === 'sold' ? 'text-on-ink-muted' : 'text-muted')}>{u.type}</span>
      <span className="mt-1 text-sm font-semibold tabular-nums">{fmtIdrShort(u.price)}</span>
      {u.status === 'held' && u.holdUntil && <span className="mt-1 text-[11px] font-medium">Until {fmtDateTime(u.holdUntil)}</span>}
    </button>
  )
}

function UnitPanel({ unit: u, project }: { unit: Unit; project: Project }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const [dialog, setDialog] = useState<'hold' | 'edit' | 'visit' | null>(null)
  const deal = state.deals.find((d) => d.id === u.dealId)
  const contact = deal && state.contacts.find((c) => c.id === deal.contactId)
  const manage = can('project.manage')
  const soldBlocker = blockerFor(state, { type: 'units/markSold', id: u.id })
  const close = (o: boolean) => !o && setDialog(null)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <UnitStatusBadge status={u.status} />
        <span className="text-xl font-bold tracking-tight tabular-nums">{fmtIdrShort(u.price)}</span>
      </div>
      <KeyValue
        bare
        size="sm"
        items={[
          { label: 'Price', value: fmtIdr(u.price) },
          { label: 'Type', value: u.type },
          { label: 'Building', value: fmtArea(u.buildingArea) },
          { label: 'Land', value: u.landArea ? fmtArea(u.landArea) : '–', hidden: u.landArea === null },
          { label: 'Bedrooms', value: u.bedrooms ?? '–', hidden: u.bedrooms === null },
          { label: 'Hold until', value: u.holdUntil ? fmtDateTime(u.holdUntil) : '–', hidden: !u.holdUntil },
          {
            label: 'Deal',
            value: deal ? (
              <span className="flex flex-col">
                <CodeLink to={paths.deal(deal.id)} code={deal.code} />
                <span className="truncate text-xs text-muted">{contact?.name ?? deal.title}</span>
              </span>
            ) : (
              'No deal'
            ),
          },
        ]}
      />
      <div className="flex flex-wrap gap-2">
        {manage && u.status === 'available' && (
          <Button onClick={() => setDialog('hold')}>
            <Hourglass />
            Hold
          </Button>
        )}
        {manage && (u.status === 'held' || u.status === 'booked') && (
          <Button variant="outline" onClick={() => act({ type: 'units/release', id: u.id }, 'Unit released', `${u.code} is available again`)}>
            <Unlock />
            Release
          </Button>
        )}
        {manage && (u.status === 'held' || u.status === 'booked') && (
          <Button
            disabled={!!soldBlocker}
            title={soldBlocker ?? undefined}
            onClick={() => act({ type: 'units/markSold', id: u.id }, 'Unit marked sold', `${u.code}, ${project.name}`)}
          >
            <CircleCheck />
            Mark sold
          </Button>
        )}
        {can('visit.manage') && u.status !== 'sold' && (
          <Button variant="outline" onClick={() => setDialog('visit')}>
            <CalendarPlus />
            Book a site visit
          </Button>
        )}
        {manage && (
          <Button variant="outline" onClick={() => setDialog('edit')}>
            <Pencil />
            Edit
          </Button>
        )}
      </div>
      {manage && u.status === 'held' && soldBlocker && <p className="text-xs text-muted">{soldBlocker} A paid booking fee books the unit.</p>}

      <HoldDialog unit={dialog === 'hold' ? u : null} onOpenChange={close} />
      <UnitDialog open={dialog === 'edit'} onOpenChange={close} project={project} editing={u} />
      <VisitDialog
        open={dialog === 'visit'}
        onOpenChange={close}
        preset={{ unitId: u.id, dealId: u.dealId, contactId: deal?.contactId }}
        onSaved={(v) => navigate(paths.visit(v.id))}
      />
    </div>
  )
}

function HoldDialog({ unit, onOpenChange }: { unit: Unit | null; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={!!unit} onOpenChange={onOpenChange} title={unit ? `Hold ${unit.code}` : 'Hold unit'} description="A hold keeps the unit for one buyer until the deadline, then it goes back to available on its own.">
      {unit && <HoldForm unit={unit} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function HoldForm({ unit, onDone }: { unit: Unit; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [dealId, setDealId] = useState('')
  const [until, setUntil] = useState(() => {
    const d = new Date(addDays(nowIso(), 2))
    d.setHours(17, 0, 0, 0)
    return toLocalInput(d.toISOString())
  })
  const deals = state.deals.filter((d) => isOpenDeal(state, d))
  const action = until ? ({ type: 'units/hold', id: unit.id, until: fromLocalInput(until), dealId: dealId || null } as const) : null
  const blocker = action ? blockerFor(state, action) : 'Pick when the hold ends.'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (action && act(action, 'Unit on hold', `${unit.code} until ${fmtDateTime(action.until)}`)) onDone()
      }}
    >
      <div className="space-y-4">
        <FormField label="Deal" hint="Optional, links the hold to a buyer">
          <NativeSelect value={dealId} onChange={(e) => setDealId(e.target.value)}>
            <option value="">No deal yet</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Hold until" required>
          <Input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
        </FormField>
      </div>
      {blocker && (
        <p role="status" className="mt-4 rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-foreground">
          {blocker}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!blocker} title={blocker ?? undefined}>
          Hold unit
        </Button>
      </DialogFooter>
    </form>
  )
}

function UnitDialog({ open, onOpenChange, project, editing }: { open: boolean; onOpenChange: (open: boolean) => void; project: Project; editing: Unit | null }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? `Edit unit ${editing.code}` : `Add a unit to ${project.name}`}
      description={editing ? 'The status changes through hold, booking fee and sale, not here.' : 'New units start as available.'}
    >
      <UnitForm project={project} editing={editing} onDone={() => onOpenChange(false)} />
    </Dialog>
  )
}

function UnitForm({ project, editing, onDone }: { project: Project; editing: Unit | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const siblings = state.units.filter((u) => u.projectId === project.id)
  const groups = [...new Set(siblings.map((u) => u.group))]
  const [f, setF] = useState({
    code: editing?.code ?? '',
    group: editing?.group ?? groups[0] ?? '',
    type: editing?.type ?? '',
    landArea: editing?.landArea ? String(editing.landArea) : '',
    buildingArea: editing ? String(editing.buildingArea) : '',
    bedrooms: editing?.bedrooms ? String(editing.bedrooms) : '',
    price: priceInput(editing?.price ?? 0),
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const code = f.code.trim().toUpperCase()
  const price = readPrice(f.price)
  const num = (v: string) => (v.trim() ? Number(v) : null)
  const errors = {
    code: !code ? 'Enter the unit code, for example A-07.' : siblings.some((u) => u.code === code && u.id !== editing?.id) ? 'This project already has a unit with this code.' : null,
    group: f.group.trim() ? null : 'Enter the block or floor.',
    type: f.type.trim() ? null : 'Enter the unit type.',
    buildingArea: Number(f.buildingArea) > 0 ? null : 'Enter the building area in m².',
    price: price && price > 0 ? null : 'Enter the price, for example 1.89 B.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  const listId = `groups-${project.id}`
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const unit: Unit = {
          id: editing?.id ?? newId('unt'),
          projectId: project.id,
          status: editing?.status ?? 'available',
          dealId: editing?.dealId ?? null,
          holdUntil: editing?.holdUntil ?? null,
          code,
          group: f.group.trim(),
          type: f.type.trim(),
          landArea: num(f.landArea),
          buildingArea: Number(f.buildingArea),
          bedrooms: num(f.bedrooms),
          price: price!,
        }
        if (act({ type: 'units/upsert', unit }, editing ? 'Unit updated' : 'Unit added', `${unit.code}, ${project.name}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Unit code" required error={show(errors.code)}>
          <Input value={f.code} onChange={set('code')} placeholder="A-07" autoComplete="off" />
        </FormField>
        <FormField label="Block or floor" required error={show(errors.group)} hint="Groups units on the board">
          <Input value={f.group} onChange={set('group')} list={listId} placeholder="Block A" />
          <datalist id={listId}>
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </FormField>
        <FormField label="Type" required error={show(errors.type)}>
          <Input value={f.type} onChange={set('type')} placeholder="Type 90" />
        </FormField>
        <FormField label="Price" required error={show(errors.price)} hint={price ? fmtIdr(price) : 'For example 1.89 B or 950 M'}>
          <Input value={f.price} onChange={set('price')} placeholder="1.89 B" />
        </FormField>
        <FormField label="Building area (m²)" required error={show(errors.buildingArea)}>
          <Input type="number" inputMode="numeric" min={1} value={f.buildingArea} onChange={set('buildingArea')} />
        </FormField>
        <FormField label="Land area (m²)" hint="Leave empty for apartments">
          <Input type="number" inputMode="numeric" min={1} value={f.landArea} onChange={set('landArea')} />
        </FormField>
        <FormField label="Bedrooms" hint="Leave empty for warehouses and shops">
          <Input type="number" inputMode="numeric" min={0} value={f.bedrooms} onChange={set('bedrooms')} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Add unit'}</Button>
      </DialogFooter>
    </form>
  )
}
