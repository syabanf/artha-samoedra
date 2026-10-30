import {
  blockerFor,
  countBy,
  DAY,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  fromDateInput,
  hiredCount,
  newId,
  nextOpeningCode,
  nextContractCode,
  nextEmployeeCode,
  nowIso,
  PIPELINE,
  toMs,
  ymd,
  type AppAction,
} from '@artha/fixtures'
import {
  CANDIDATE_STAGE_LABEL,
  EMPLOYMENT_TYPE_LABEL,
  type Candidate,
  type CandidateStage,
  type Employee,
  type EmploymentContract,
  type EmploymentType,
  type Interview,
  type JobOpening,
  type Offer,
} from '@artha/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
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
  ProgressBar,
  Textarea,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { Ban, CalendarPlus, CircleCheck, FileText, Link2, MessageSquare, Pencil, Plus, Search, Send, Star, UserCheck, X } from 'lucide-react'
import { useState, type DragEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { SubTabs } from '../../components/SubTabs'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from '../finance/parts'
import { Avatar, PersonCell } from './parts'
import { CandidatePortalCard } from './CandidatePortalCard'
import { useSetParam } from '../../lib/useSetParam'

const TABS = [
  { to: paths.openings, label: 'Openings' },
  { to: paths.talentPool, label: 'Talent pool' },
]

type OpeningStatus = JobOpening['status']
const OPENING_STATUSES: OpeningStatus[] = ['open', 'draft', 'closed']
const OPENING_LABEL: Record<OpeningStatus, string> = { draft: 'Draft', open: 'Open', closed: 'Closed' }
const OPENING_VARIANT: Record<OpeningStatus, BadgeVariant> = { draft: 'warning', open: 'success', closed: 'muted' }
const OpeningBadge = ({ status }: { status: OpeningStatus }) => <Badge variant={OPENING_VARIANT[status]}>{OPENING_LABEL[status]}</Badge>

const STAGE_VARIANT: Record<CandidateStage, BadgeVariant> = { applied: 'default', screening: 'info', test: 'info', interview: 'warning', offer: 'accent', hired: 'success', rejected: 'muted' }
const StageBadge = ({ stage }: { stage: CandidateStage }) => <Badge variant={STAGE_VARIANT[stage]}>{CANDIDATE_STAGE_LABEL[stage]}</Badge>
const COLUMNS: CandidateStage[] = [...PIPELINE, 'rejected']
/** Stages a candidate can be moved to by hand; hiring goes through the offer. */
const MOVABLE = COLUMNS.filter((s): s is Exclude<CandidateStage, 'hired'> => s !== 'hired')

const SOURCE_LABEL: Record<Candidate['source'], string> = { website: 'Website', jobstreet: 'JobStreet', linkedin: 'LinkedIn', referral: 'Referral', walk_in: 'Walk-in' }
const OFFER_LABEL: Record<Offer['status'], string> = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined' }
const OFFER_PROBE: Offer = { salary: 1, startsOn: '', type: 'permanent', status: 'draft', sentAt: null }
const OFFER_VARIANT: Record<Offer['status'], BadgeVariant> = { draft: 'warning', sent: 'info', accepted: 'success', declined: 'danger' }

const DRAG_TYPE = 'text/plain'
const digits = (v: string) => v.replace(/\D/g, '')

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`Rated ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden className={cn('size-3.5', n <= value ? 'fill-warning text-warning' : 'text-silver')} />
      ))}
    </span>
  )
}

function useRecruit() {
  const { state } = useAppState()
  const deptName = (id: string) => state.departments.find((d) => d.id === id)?.name ?? 'Unknown department'
  const branchName = (id: string) => state.branches.find((b) => b.id === id)?.name ?? 'Unknown branch'
  /** The highest test score, with whether it clears that test's pass mark. */
  const bestTest = (c: Candidate) => {
    const scored = c.tests.map((t) => ({ ...t, test: state.psychTests.find((p) => p.id === t.testId) }))
    const best = scored.sort((a, b) => b.score - a.score)[0]
    return best && { score: best.score, name: best.test?.name ?? 'Test', pass: best.score >= (best.test?.passMark ?? 0) }
  }
  return { state, deptName, branchName, bestTest }
}

const nextInterview = (c: Candidate, now: number) =>
  c.interviews.filter((i) => toMs(i.at) >= now).sort((a, b) => a.at.localeCompare(b.at))[0]

// ---------------------------------------------------------------- openings

export function OpeningsPage() {
  const { state, deptName, branchName } = useRecruit()
  const { can } = useAuth()
  const act = useAct()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<JobOpening | 'new' | null>(null)
  const q = params.get('q') ?? ''
  const status = (params.get('status') as OpeningStatus | null) || null
  const dept = params.get('dept') || null
  const manage = can('recruit.manage')

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.jobOpenings.filter(
    (o) => (!dept || o.departmentId === dept) && terms.every((t) => `${o.code} ${o.title} ${deptName(o.departmentId)} ${branchName(o.branchId)}`.toLowerCase().includes(t)),
  )
  const counts = countBy(searched, (o) => o.status)
  const rows = searched
    .filter((o) => !status || o.status === status)
    .sort((a, b) => OPENING_STATUSES.indexOf(a.status) - OPENING_STATUSES.indexOf(b.status) || b.code.localeCompare(a.code))
  const filters = [q, status, dept].filter(Boolean).length
  const departments = state.departments.filter((d) => state.jobOpenings.some((o) => o.departmentId === d.id))

  const toggle = (o: JobOpening) => {
    const next: JobOpening = { ...o, status: o.status === 'open' ? 'closed' : 'open' }
    act({ type: 'openings/upsert', opening: next }, next.status === 'open' ? 'Opening is open' : 'Opening closed', o.title)
  }

  return (
    <div>
      <PageHeader
        title="Recruitment"
        description="Openings with their pipeline. Open one to move candidates between stages."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search openings"
              placeholder="Title, code or department"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Plus />
                New opening
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {OPENING_STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {OPENING_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by department" value={dept ?? ''} onChange={(e) => set('dept', e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.jobOpenings.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <Card className="mt-3">
          {filters ? (
            <EmptyState compact title="No matching openings" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
          ) : (
            <EmptyState compact title="No openings yet" description="Create an opening to start collecting candidates." />
          )}
        </Card>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {rows.map((o) => {
            const blocker = blockerFor(state, { type: 'openings/upsert', opening: { ...o, status: o.status === 'open' ? 'closed' : 'open' } })
            return (
              <Card key={o.id} className="flex min-w-0 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <Link to={paths.opening(o.id)} className="min-w-0 hover:text-accent">
                    <div className="font-mono text-xs font-semibold text-muted">{o.code}</div>
                    <div className="truncate text-lg font-bold tracking-tight">{o.title}</div>
                    <div className="truncate text-sm text-muted">
                      {deptName(o.departmentId)} · {branchName(o.branchId)} · {EMPLOYMENT_TYPE_LABEL[o.type]}
                    </div>
                  </Link>
                  <OpeningBadge status={o.status} />
                </div>
                <OpeningFunnel opening={o} />
                {manage && (
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setEditing(o)}>
                      <Pencil />
                      Edit
                    </Button>
                    <Button variant="outline" size="sm" disabled={!!blocker} title={blocker ?? undefined} onClick={() => toggle(o)}>
                      {o.status === 'open' ? <Ban /> : <CircleCheck />}
                      {o.status === 'open' ? 'Close' : 'Open'}
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
      <OpeningDialog editing={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

/** Headcount filled, plus how many candidates sit at each stage. */
function OpeningFunnel({ opening }: { opening: JobOpening }) {
  const { state } = useAppState()
  const hired = hiredCount(state, opening.id)
  const byStage = countBy(
    state.candidates.filter((c) => c.openingId === opening.id),
    (c) => c.stage,
  )
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted">Hired</span>
          <span className="font-semibold tabular-nums">
            {hired} of {opening.headcount}
          </span>
        </div>
        <ProgressBar value={Math.min(100, (hired / opening.headcount) * 100)} />
      </div>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2 text-center">
        {COLUMNS.map((s) => (
          <li key={s} className="min-w-0 rounded-xl bg-surface-2 px-1 py-2">
            <div className="text-base font-bold tabular-nums">{byStage[s] ?? 0}</div>
            <div className="truncate text-[11px] text-muted">{CANDIDATE_STAGE_LABEL[s]}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function OpeningDialog({ editing, onClose }: { editing: JobOpening | 'new' | null; onClose: () => void }) {
  const old = editing === 'new' ? null : editing
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onClose()} size="lg" title={old ? `Edit ${old.code}` : 'New opening'} description="An opening needs a description of at least 40 characters before it opens.">
      {editing && <OpeningForm old={old} onDone={onClose} />}
    </Dialog>
  )
}

function OpeningForm({ old, onDone }: { old: JobOpening | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    title: old?.title ?? '',
    departmentId: old?.departmentId ?? state.departments[0]?.id ?? '',
    positionId: old?.positionId ?? '',
    branchId: old?.branchId ?? state.branches[0]?.id ?? '',
    type: old?.type ?? ('permanent' as EmploymentType),
    headcount: String(old?.headcount ?? 1),
    description: old?.description ?? '',
    status: old?.status ?? ('draft' as OpeningStatus),
  })
  const positions = state.positions.filter((p) => p.departmentId === f.departmentId)
  const opening: JobOpening = {
    id: old?.id ?? newId('op'),
    code: old?.code ?? nextOpeningCode(state, nowIso()),
    title: f.title.trim(),
    departmentId: f.departmentId,
    positionId: f.positionId,
    branchId: f.branchId,
    type: f.type,
    headcount: Number(f.headcount) || 0,
    description: f.description.trim(),
    status: f.status,
    openedAt: old?.openedAt ?? null,
  }
  const blocker = (!positions.some((p) => p.id === f.positionId) && 'Pick a position.') || blockerFor(state, { type: 'openings/upsert', opening })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'openings/upsert', opening }, old ? 'Opening saved' : 'Opening created', opening.title)) {
          onDone()
          if (!old) navigate(paths.opening(opening.id))
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Title" required className="sm:col-span-2">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Senior sales agent, Bandung" />
        </FormField>
        <FormField label="Department" required>
          <NativeSelect value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value, positionId: '' })}>
            {state.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Position" required>
          <NativeSelect value={f.positionId} onChange={(e) => setF({ ...f, positionId: e.target.value })}>
            <option value="">Pick a position</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Branch">
          <NativeSelect value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>
            {state.branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Employment type">
          <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as EmploymentType })}>
            {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Headcount" hint="People to hire">
          <Input inputMode="numeric" value={f.headcount} onChange={(e) => setF({ ...f, headcount: digits(e.target.value) })} />
        </FormField>
        <FormField label="Status">
          <NativeSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as OpeningStatus })}>
            {OPENING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {OPENING_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Job description" className="sm:col-span-2" hint={`${f.description.trim().length} characters`}>
          <Textarea rows={5} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{old ? 'Save opening' : 'Create opening'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- opening detail

export function OpeningDetailPage() {
  const { id } = useParams()
  const { state, deptName, branchName } = useRecruit()
  const { can } = useAuth()
  const act = useAct()
  const { params, set } = useSetParam()
  const [editing, setEditing] = useState<JobOpening | null>(null)
  const [adding, setAdding] = useState(false)
  const [rejecting, setRejecting] = useState<Candidate | null>(null)
  const o = state.jobOpenings.find((x) => x.id === id)
  if (!o) {
    return (
      <Card>
        <EmptyState title="Opening not found" description="This opening may have been removed." action={<BackButton fallback={paths.openings} />} />
      </Card>
    )
  }
  const manage = can('recruit.manage')
  const q = params.get('q') ?? ''
  const phoneCol = (params.get('col') as CandidateStage | null) || 'applied'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const all = state.candidates.filter((c) => c.openingId === o.id)
  const rows = all.filter((c) => terms.every((t) => `${c.name} ${c.email} ${c.tags.join(' ')}`.toLowerCase().includes(t)))
  const position = state.positions.find((p) => p.id === o.positionId)?.name
  const nextStatus = o.status === 'open' ? 'closed' : 'open'
  const toggleBlocker = blockerFor(state, { type: 'openings/upsert', opening: { ...o, status: nextStatus } })

  const move = (candidateId: string, stage: CandidateStage) => {
    const c = state.candidates.find((x) => x.id === candidateId)
    if (!c || c.stage === stage || stage === 'hired') return
    if (stage === 'rejected') setRejecting(c)
    else act({ type: 'candidates/move', id: c.id, stage }, `Moved to ${CANDIDATE_STAGE_LABEL[stage]}`, c.name)
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.openings} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{o.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">{o.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <OpeningBadge status={o.status} />
            <span>
              {position ?? 'No position'} · {deptName(o.departmentId)} · {branchName(o.branchId)} · {EMPLOYMENT_TYPE_LABEL[o.type]}
            </span>
          </div>
        </div>
        {manage && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setEditing(o)}>
              <Pencil />
              Edit
            </Button>
            <Button
              variant="outline"
              disabled={!!toggleBlocker}
              title={toggleBlocker ?? undefined}
              onClick={() => act({ type: 'openings/upsert', opening: { ...o, status: nextStatus } }, nextStatus === 'open' ? 'Opening is open' : 'Opening closed', o.title)}
            >
              {o.status === 'open' ? <Ban /> : <CircleCheck />}
              {o.status === 'open' ? 'Close' : 'Open'}
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus />
              Add candidate
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <Card className="p-5">
          <OpeningFunnel opening={o} />
        </Card>
        <Card className="p-5">
          <div className="text-xs font-semibold text-muted">Job description</div>
          <p className="mt-1 whitespace-pre-line text-sm">{o.description || 'No description yet.'}</p>
          {o.openedAt && <p className="mt-3 text-xs text-muted">Opened {fmtDate(o.openedAt)}</p>}
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search candidates"
          placeholder="Name, email or tag"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
          right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
        />
        <span className="text-xs text-muted tabular-nums">
          {rows.length} of {all.length} candidates
          {manage && <span className="hidden md:inline"> · drag a card, or use Move to</span>}
        </span>
      </div>

      <ChipRow className="md:hidden" aria-label="Pipeline stage">
        {COLUMNS.map((s) => (
          <Chip key={s} active={phoneCol === s} count={rows.filter((c) => c.stage === s).length} onClick={() => set('col', s === 'applied' ? null : s)}>
            {CANDIDATE_STAGE_LABEL[s]}
          </Chip>
        ))}
      </ChipRow>

      <div className="grid grid-cols-1 gap-3 md:flex md:items-start md:overflow-x-auto md:pb-2">
        {COLUMNS.map((s) => (
          <StageColumn key={s} stage={s} candidates={rows.filter((c) => c.stage === s)} droppable={manage && s !== 'hired'} onDrop={move} className={cn(s !== phoneCol && 'hidden md:flex')}>
            {(c) => <CandidateCard key={c.id} candidate={c} manage={manage} onMove={move} />}
          </StageColumn>
        ))}
      </div>

      <OpeningDialog editing={editing} onClose={() => setEditing(null)} />
      <Dialog open={adding} onOpenChange={setAdding} size="lg" title="Add candidate" description={`The candidate joins ${o.title} at Applied.`}>
        {adding && <CandidateForm old={null} openingId={o.id} onDone={() => setAdding(false)} />}
      </Dialog>
      <RejectDialog candidate={rejecting} onClose={() => setRejecting(null)} />
    </div>
  )
}

function StageColumn({
  stage,
  candidates,
  droppable,
  onDrop,
  className,
  children,
}: {
  stage: CandidateStage
  candidates: Candidate[]
  droppable: boolean
  onDrop: (candidateId: string, stage: CandidateStage) => void
  className?: string
  children: (c: Candidate) => ReactNode
}) {
  const [over, setOver] = useState(false)
  const handlers = droppable
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          setOver(true)
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          setOver(false)
          onDrop(e.dataTransfer.getData(DRAG_TYPE), stage)
        },
      }
    : {}
  return (
    <section
      aria-label={`${CANDIDATE_STAGE_LABEL[stage]}, ${candidates.length} candidates`}
      className={cn('flex min-w-0 flex-col rounded-card bg-surface-2 p-2 transition-colors md:w-64 md:shrink-0', over && 'ring-2 ring-accent/40', className)}
      {...handlers}
    >
      <header className="flex items-baseline justify-between gap-2 px-2 pb-2 pt-1">
        <h2 className="truncate text-sm font-semibold">
          {CANDIDATE_STAGE_LABEL[stage]} <span className="font-normal text-muted tabular-nums">{candidates.length}</span>
        </h2>
        {stage === 'hired' && <span className="text-[11px] text-muted">Hire from the offer</span>}
      </header>
      <ul className="flex min-h-16 flex-col gap-2">
        {candidates.map(children)}
        {candidates.length === 0 && <li className="rounded-2xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted">No candidates</li>}
      </ul>
    </section>
  )
}

function CandidateCard({ candidate: c, manage, onMove }: { candidate: Candidate; manage: boolean; onMove: (id: string, stage: CandidateStage) => void }) {
  const { bestTest } = useRecruit()
  const now = useNow()
  const best = bestTest(c)
  const next = nextInterview(c, now)
  const movable = manage && c.stage !== 'hired'
  return (
    <li
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, c.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      className={cn('rounded-2xl bg-card p-3 shadow-card', movable && 'md:cursor-grab md:active:cursor-grabbing')}
    >
      <Link to={paths.candidate(c.id)} className="block min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
        <div className="truncate text-sm font-semibold">{c.name}</div>
        <div className="mt-0.5 flex items-center gap-2">
          <Stars value={c.rating} />
          <span className="truncate text-[11px] text-muted">{SOURCE_LABEL[c.source]}</span>
        </div>
      </Link>
      {c.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {c.tags.map((t) => (
            <Badge key={t} variant="outline" className="max-w-full truncate">
              {t}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-2 space-y-0.5 text-[11px] text-muted">
        {best && (
          <div className={cn('tabular-nums', best.pass ? 'text-success' : 'text-accent')} title={best.name}>
            Best test {best.score} · {best.pass ? 'pass' : 'below pass mark'}
          </div>
        )}
        {next && <div className="tabular-nums">Interview {fmtDateTime(next.at)}</div>}
        {c.stage === 'rejected' && c.rejectReason && <div className="line-clamp-2">{c.rejectReason}</div>}
      </div>
      {movable && (
        <NativeSelect variant="inline" aria-label={`Move ${c.name} to`} value="" onChange={(e) => onMove(c.id, e.target.value as CandidateStage)} className="-ml-1 mt-1 w-fit [&_select]:text-xs">
          <option value="">Move to</option>
          {MOVABLE.filter((s) => s !== c.stage).map((s) => (
            <option key={s} value={s}>
              {CANDIDATE_STAGE_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      )}
    </li>
  )
}

// ---------------------------------------------------------------- candidate forms

function CandidateForm({ old, openingId, onDone }: { old: Candidate | null; openingId: string | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    name: old?.name ?? '',
    email: old?.email ?? '',
    phone: old?.phone ?? '',
    source: old?.source ?? ('website' as Candidate['source']),
    rating: String(old?.rating ?? 3),
    cvName: old?.cvName ?? '',
    tags: old?.tags.join(', ') ?? '',
    notes: old?.notes ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const candidate: Candidate = {
    ...(old ?? { id: newId('cnd'), openingId, stage: 'applied', tests: [], interviews: [], offer: null, employeeId: null, rejectReason: '', appliedAt: nowIso() }),
    name: f.name.trim(),
    email: f.email.trim(),
    phone: f.phone.trim(),
    source: f.source,
    rating: Number(f.rating),
    cvName: f.cvName.trim(),
    tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    notes: f.notes.trim(),
  }
  const blocker = blockerFor(state, { type: 'candidates/upsert', candidate })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'candidates/upsert', candidate }, old ? 'Candidate saved' : 'Candidate added', candidate.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required>
          <Input value={f.name} onChange={set('name')} />
        </FormField>
        <FormField label="Email" required>
          <Input type="email" value={f.email} onChange={set('email')} />
        </FormField>
        <FormField label="Phone">
          <Input type="tel" value={f.phone} onChange={set('phone')} />
        </FormField>
        <FormField label="Source">
          <NativeSelect value={f.source} onChange={set('source')}>
            {Object.entries(SOURCE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Rating">
          <NativeSelect value={f.rating} onChange={set('rating')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} of 5
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="CV file name">
          <Input value={f.cvName} onChange={set('cvName')} placeholder="CV Andi Kurniawan.pdf" />
        </FormField>
        <FormField label="Tags" hint="Separate with commas" className="sm:col-span-2">
          <Input value={f.tags} onChange={set('tags')} placeholder="Sales, Bali" />
        </FormField>
        <FormField label="Notes" className="sm:col-span-2">
          <Textarea rows={3} value={f.notes} onChange={set('notes')} />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{old ? 'Save candidate' : 'Add candidate'}</Button>
      </DialogFooter>
    </form>
  )
}

/** A small dialog form: runs `action` through useAct, shows the blocker after the first submit. */
function ActionForm({ action, success, description, submit, onDone, children }: { action: AppAction; success: string; description?: string; submit: ReactNode; onDone: () => void; children: ReactNode }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const blocker = blockerFor(state, action)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && act(action, success, description)) onDone()
      }}
    >
      <div className="space-y-4">{children}</div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{submit}</Button>
      </DialogFooter>
    </form>
  )
}

function RejectDialog({ candidate, onClose }: { candidate: Candidate | null; onClose: () => void }) {
  return (
    <Dialog open={!!candidate} onOpenChange={(o) => !o && onClose()} title={`Reject ${candidate?.name ?? ''}`} description="The reason stays on the record and shows in the talent pool.">
      {candidate && <RejectForm candidate={candidate} onDone={onClose} />}
    </Dialog>
  )
}

function RejectForm({ candidate, onDone }: { candidate: Candidate; onDone: () => void }) {
  const [reason, setReason] = useState('')
  return (
    <ActionForm action={{ type: 'candidates/move', id: candidate.id, stage: 'rejected', reason }} success="Candidate rejected" description={candidate.name} submit="Reject" onDone={onDone}>
      <FormField label="Reason" required>
        <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Below the pass mark on the sales aptitude test." />
      </FormField>
    </ActionForm>
  )
}

function AttachDialog({ candidate, onClose }: { candidate: Candidate | null; onClose: () => void }) {
  return (
    <Dialog open={!!candidate} onOpenChange={(o) => !o && onClose()} title={`Attach ${candidate?.name ?? ''}`} description="The candidate starts at Applied on the opening you pick.">
      {candidate && <AttachForm candidate={candidate} onDone={onClose} />}
    </Dialog>
  )
}

function AttachForm({ candidate, onDone }: { candidate: Candidate; onDone: () => void }) {
  const { state } = useAppState()
  const open = state.jobOpenings.filter((o) => o.status === 'open' && o.id !== candidate.openingId)
  const [openingId, setOpeningId] = useState(open[0]?.id ?? '')
  const action: AppAction = { type: 'candidates/upsert', candidate: { ...candidate, openingId, stage: 'applied', rejectReason: '', offer: null } }
  if (!open.length) return <EmptyState compact title="No open openings" description="Open an opening first, then attach the candidate." />
  return (
    <ActionForm action={action} success="Candidate attached" description={state.jobOpenings.find((o) => o.id === openingId)?.title} submit="Attach" onDone={onDone}>
      <FormField label="Opening" required>
        <NativeSelect value={openingId} onChange={(e) => setOpeningId(e.target.value)}>
          {open.map((o) => (
            <option key={o.id} value={o.id}>
              {o.code} · {o.title}
            </option>
          ))}
        </NativeSelect>
      </FormField>
    </ActionForm>
  )
}

// ---------------------------------------------------------------- candidate

type CandidateDialog = 'edit' | 'reject' | 'attach' | 'schedule' | 'offer' | 'hire' | { test: string } | { feedback: Interview }

export function CandidatePage() {
  const { id } = useParams()
  const { state, bestTest } = useRecruit()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [dialog, setDialog] = useState<CandidateDialog | null>(null)
  const c = state.candidates.find((x) => x.id === id)
  if (!c) {
    return (
      <Card>
        <EmptyState title="Candidate not found" description="This candidate may have been removed." action={<BackButton fallback={paths.openings} />} />
      </Card>
    )
  }
  const opening = state.jobOpenings.find((o) => o.id === c.openingId)
  const manage = can('recruit.manage')
  const close = () => setDialog(null)
  const best = bestTest(c)
  const next = nextInterview(c, now)
  const employee = state.employees.find((e) => e.id === c.employeeId)
  // A placeholder salary asks the store only whether the candidate may get an offer at all.
  const offerBlocker = (status: Offer['status']) => blockerFor(state, { type: 'candidates/offer', id: c.id, offer: { ...(c.offer ?? OFFER_PROBE), status } })
  const setOffer = (status: Offer['status'], success: string) => c.offer && act({ type: 'candidates/offer', id: c.id, offer: { ...c.offer, status } }, success, c.name)
  const draftBlocker = offerBlocker('draft')
  const hireBlocker = c.offer?.status !== 'accepted' ? 'The candidate must accept the offer first.' : null

  return (
    <div className="space-y-4">
      <BackButton fallback={opening ? paths.opening(opening.id) : paths.talentPool} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={c.name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold tracking-tight">{c.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StageBadge stage={c.stage} />
              <Stars value={c.rating} />
            </div>
          </div>
        </div>
        {manage && c.stage !== 'hired' && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setDialog('edit')}>
              <Pencil />
              Edit
            </Button>
            {c.stage !== 'rejected' && (
              <Button variant="outline" onClick={() => setDialog('reject')}>
                <Ban />
                Reject
              </Button>
            )}
            {!opening || c.stage === 'rejected' ? (
              <Button onClick={() => setDialog('attach')}>
                <Link2 />
                Attach to opening
              </Button>
            ) : (
              <NativeSelect
                aria-label="Move to stage"
                value=""
                onChange={(e) => {
                  const stage = e.target.value as Exclude<CandidateStage, 'hired'>
                  if (stage === 'rejected') setDialog('reject')
                  else if (stage) act({ type: 'candidates/move', id: c.id, stage }, `Moved to ${CANDIDATE_STAGE_LABEL[stage]}`, c.name)
                }}
                className="w-40"
              >
                <option value="">Move to</option>
                {MOVABLE.filter((s) => s !== c.stage).map((s) => (
                  <option key={s} value={s}>
                    {CANDIDATE_STAGE_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="text-xs text-on-ink-muted">{opening ? 'Applying for' : 'Talent pool'}</div>
          {opening ? (
            <Link to={paths.opening(opening.id)} className="mt-1 block truncate text-2xl font-bold tracking-tight hover:underline">
              {opening.title}
            </Link>
          ) : (
            <div className="mt-1 text-2xl font-bold tracking-tight">Not attached to an opening</div>
          )}
          <ol className="mt-4 flex flex-wrap gap-1.5" aria-label="Pipeline">
            {PIPELINE.map((s) => {
              const reached = c.stage !== 'rejected' && PIPELINE.indexOf(c.stage) >= PIPELINE.indexOf(s)
              return (
                <li key={s} aria-current={c.stage === s ? 'step' : undefined} className={cn('rounded-full px-3 py-1 text-xs font-semibold', c.stage === s ? 'bg-accent text-white' : reached ? 'bg-white/15' : 'bg-white/5 text-on-ink-muted')}>
                  {CANDIDATE_STAGE_LABEL[s]}
                </li>
              )
            })}
          </ol>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Applied</div>
              <div className="font-semibold">{fmtDate(c.appliedAt)}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Best test</div>
              <div className="font-semibold tabular-nums">{best ? `${best.score} · ${best.pass ? 'pass' : 'fail'}` : '–'}</div>
            </div>
            <div className="col-span-2 rounded-2xl bg-white/5 p-3 sm:col-span-1">
              <div className="text-xs text-on-ink-muted">Next interview</div>
              <div className="font-semibold">{next ? fmtDateTime(next.at) : '–'}</div>
            </div>
          </div>
          {c.stage === 'rejected' && c.rejectReason && <p className="mt-4 text-sm text-on-ink-muted">Rejected: {c.rejectReason}</p>}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent>
            <KeyValue
              bare
              size="sm"
              items={[
                { label: 'Email', value: <a href={`mailto:${c.email}`} className="hover:text-accent">{c.email}</a> },
                { label: 'Phone', value: c.phone || '–' },
                { label: 'Source', value: SOURCE_LABEL[c.source] },
                { label: 'CV', value: c.cvName ? <span className="inline-flex items-center gap-1.5"><FileText className="size-4 text-muted" aria-hidden />{c.cvName}</span> : '–' },
                { label: 'Tags', value: c.tags.length ? <span className="flex flex-wrap gap-1">{c.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>)}</span> : '–' },
                { label: 'Notes', value: c.notes || '–' },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Tests</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {state.psychTests.map((t) => {
                const r = c.tests.find((x) => x.testId === t.id)
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-xs text-muted">
                        {t.minutes} min · pass mark {t.passMark}
                        {r && ` · taken ${fmtDate(r.takenAt)}`}
                      </div>
                    </div>
                    {r && (
                      <span className="flex items-center gap-2">
                        <span className="font-bold tabular-nums">{r.score}</span>
                        <Badge variant={r.score >= t.passMark ? 'success' : 'danger'}>{r.score >= t.passMark ? 'Pass' : 'Fail'}</Badge>
                      </span>
                    )}
                    {manage && c.stage !== 'hired' && (
                      <Button variant="outline" size="sm" onClick={() => setDialog({ test: t.id })}>
                        {r ? 'Update' : 'Record result'}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            action={
              manage &&
              opening &&
              !['hired', 'rejected'].includes(c.stage) && (
                <Button variant="outline" size="sm" onClick={() => setDialog('schedule')}>
                  <CalendarPlus />
                  Schedule
                </Button>
              )
            }
          >
            <CardTitle>Interviews ({c.interviews.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {c.interviews.length === 0 ? (
              <EmptyState compact title="No interviews yet" description="Schedule a video or onsite interview with one or more interviewers." />
            ) : (
              <ul className="divide-y divide-border">
                {[...c.interviews]
                  .sort((a, b) => b.at.localeCompare(a.at))
                  .map((i) => (
                    <li key={i.id} className="space-y-2 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold">
                            {fmtDateTime(i.at)} · {i.mode === 'video' ? 'Video' : 'Onsite'}
                          </div>
                          {i.link && (
                            <div className="truncate text-xs text-muted">
                              {i.mode === 'video' ? (
                                <a href={i.link} target="_blank" rel="noreferrer" className="hover:text-accent">
                                  {i.link}
                                </a>
                              ) : (
                                i.link
                              )}
                            </div>
                          )}
                        </div>
                        {i.score !== null ? (
                          <Stars value={i.score} />
                        ) : (
                          manage && (
                            <Button variant="outline" size="sm" onClick={() => setDialog({ feedback: i })}>
                              <MessageSquare />
                              Add feedback
                            </Button>
                          )
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {i.interviewerIds.map((eid) => (
                          <PersonCell key={eid} id={eid} />
                        ))}
                      </div>
                      {i.feedback && <p className="text-body">{i.feedback}</p>}
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader action={c.offer && <Badge variant={OFFER_VARIANT[c.offer.status]}>{OFFER_LABEL[c.offer.status]}</Badge>}>
            <CardTitle>Offer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {c.offer ? (
              <KeyValue
                bare
                size="sm"
                items={[
                  { label: 'Salary', value: <Money value={c.offer.salary} className="font-semibold" /> },
                  { label: 'Starts', value: fmtDate(c.offer.startsOn) },
                  { label: 'Type', value: EMPLOYMENT_TYPE_LABEL[c.offer.type] },
                  { label: 'Sent', value: c.offer.sentAt ? fmtDateTime(c.offer.sentAt) : '–' },
                ]}
              />
            ) : (
              <EmptyState compact title="No offer yet" description={draftBlocker ?? 'Draft the salary, start date and contract type.'} />
            )}
            {manage && c.stage !== 'hired' && (
              <div className="flex flex-wrap gap-2">
                {(!c.offer || c.offer.status === 'draft') && (
                  <Button variant="outline" size="sm" disabled={!!draftBlocker} title={draftBlocker ?? undefined} onClick={() => setDialog('offer')}>
                    <Pencil />
                    {c.offer ? 'Edit draft' : 'Draft offer'}
                  </Button>
                )}
                {c.offer?.status === 'draft' && (
                  <Button size="sm" disabled={!!offerBlocker('sent')} title={offerBlocker('sent') ?? undefined} onClick={() => setOffer('sent', 'Offer sent')}>
                    <Send />
                    Send
                  </Button>
                )}
                {c.offer?.status === 'sent' && (
                  <>
                    <Button size="sm" disabled={!!offerBlocker('accepted')} title={offerBlocker('accepted') ?? undefined} onClick={() => setOffer('accepted', 'Offer accepted')}>
                      <CircleCheck />
                      Mark accepted
                    </Button>
                    <Button variant="outline" size="sm" disabled={!!offerBlocker('declined')} title={offerBlocker('declined') ?? undefined} onClick={() => setOffer('declined', 'Offer declined')}>
                      <X />
                      Mark declined
                    </Button>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Hire</CardTitle>
          </CardHeader>
          <CardContent>
            {employee ? (
              <div className="space-y-3">
                <p className="text-sm text-muted">Hired as {employee.code}. The employee record holds the contract and onboarding checklist.</p>
                <PersonCell id={employee.id} />
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted">Hiring creates the employee in onboarding from the accepted offer and the opening, with a contract and an onboarding checklist.</p>
                {manage && (
                  <Button disabled={!!hireBlocker} title={hireBlocker ?? undefined} onClick={() => setDialog('hire')}>
                    <UserCheck />
                    Hire {c.name.split(' ')[0]}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <CandidatePortalCard candidate={c} manage={manage} key={c.id} />
      </div>

      <Dialog open={dialog === 'edit'} onOpenChange={(o) => !o && close()} size="lg" title={`Edit ${c.name}`}>
        {dialog === 'edit' && <CandidateForm old={c} openingId={c.openingId} onDone={close} />}
      </Dialog>
      <RejectDialog candidate={dialog === 'reject' ? c : null} onClose={close} />
      <AttachDialog candidate={dialog === 'attach' ? c : null} onClose={close} />
      <Dialog open={typeof dialog === 'object' && dialog !== null && 'test' in dialog} onOpenChange={(o) => !o && close()} title="Record test result" description="Scores run from 0 to 100.">
        {typeof dialog === 'object' && dialog && 'test' in dialog && <TestForm candidate={c} testId={dialog.test} onDone={close} />}
      </Dialog>
      <Dialog open={dialog === 'schedule'} onOpenChange={(o) => !o && close()} size="lg" title="Schedule interview" description="The candidate moves to Interview when it is scheduled.">
        {dialog === 'schedule' && <ScheduleForm candidate={c} onDone={close} />}
      </Dialog>
      <Dialog open={typeof dialog === 'object' && dialog !== null && 'feedback' in dialog} onOpenChange={(o) => !o && close()} title="Interview feedback">
        {typeof dialog === 'object' && dialog && 'feedback' in dialog && <FeedbackForm candidate={c} interview={dialog.feedback} onDone={close} />}
      </Dialog>
      <Dialog open={dialog === 'offer'} onOpenChange={(o) => !o && close()} title={c.offer ? 'Edit offer' : 'Draft offer'} description="Save as a draft, then send it from the offer card.">
        {dialog === 'offer' && <OfferForm candidate={c} defaultType={opening?.type ?? 'permanent'} onDone={close} />}
      </Dialog>
      <Dialog open={dialog === 'hire'} onOpenChange={(o) => !o && close()} size="lg" title={`Hire ${c.name}`} description="Check the details. The employee starts in onboarding.">
        {dialog === 'hire' && opening && c.offer && <HireForm candidate={c} opening={opening} offer={c.offer} onDone={close} />}
      </Dialog>
    </div>
  )
}

function TestForm({ candidate, testId, onDone }: { candidate: Candidate; testId: string; onDone: () => void }) {
  const { state } = useAppState()
  const test = state.psychTests.find((t) => t.id === testId)
  const [score, setScore] = useState(String(candidate.tests.find((t) => t.testId === testId)?.score ?? ''))
  const n = Number(score)
  return (
    <ActionForm action={{ type: 'candidates/addTest', id: candidate.id, result: { testId, score: score === '' ? -1 : n, takenAt: nowIso() } }} success="Test result saved" description={test?.name} submit="Save result" onDone={onDone}>
      <FormField label={test?.name ?? 'Score'} hint={test ? `Pass mark ${test.passMark}` : undefined} required>
        <Input inputMode="numeric" value={score} onChange={(e) => setScore(digits(e.target.value).slice(0, 3))} />
      </FormField>
      {score !== '' && test && (
        <Badge variant={n >= test.passMark ? 'success' : 'danger'}>{n >= test.passMark ? 'Pass' : 'Below the pass mark'}</Badge>
      )}
    </ActionForm>
  )
}

const localDateTime = (ms: number) => {
  const d = new Date(ms)
  return `${ymd(ms)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function ScheduleForm({ candidate, onDone }: { candidate: Candidate; onDone: () => void }) {
  const { state } = useAppState()
  const now = useNow()
  const [at, setAt] = useState(() => `${ymd(now + DAY)}T10:00`)
  const [mode, setMode] = useState<Interview['mode']>('video')
  const [link, setLink] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const people = state.employees.filter((e) => e.status === 'active').sort((a, b) => a.name.localeCompare(b.name))
  const interview: Interview = { id: newId('itv'), at: at ? new Date(at).toISOString() : '', mode, link: link.trim(), interviewerIds: ids, score: null, feedback: '' }
  return (
    <ActionForm action={{ type: 'candidates/schedule', id: candidate.id, interview }} success="Interview scheduled" description={at ? fmtDateTime(interview.at) : undefined} submit="Schedule" onDone={onDone}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date and time" required>
          <Input type="datetime-local" min={localDateTime(now)} value={at} onChange={(e) => setAt(e.target.value)} />
        </FormField>
        <FormField label="Mode">
          <NativeSelect value={mode} onChange={(e) => setMode(e.target.value as Interview['mode'])}>
            <option value="video">Video call</option>
            <option value="onsite">Onsite</option>
          </NativeSelect>
        </FormField>
        <FormField label={mode === 'video' ? 'Video call link' : 'Room or address'} required={mode === 'video'} className="sm:col-span-2">
          <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder={mode === 'video' ? 'https://meet.google.com/abc-defg-hij' : 'Meeting room 2, Jakarta office'} />
        </FormField>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Interviewers</legend>
        <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-2xl bg-surface-2 px-3">
          {people.map((e: Employee) => (
            <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
              <Checkbox label={e.name} checked={ids.includes(e.id)} onCheckedChange={(on) => setIds(on ? [...ids, e.id] : ids.filter((x) => x !== e.id))} />
              <span className="min-w-0 truncate">{e.name}</span>
            </li>
          ))}
        </ul>
      </fieldset>
    </ActionForm>
  )
}

function FeedbackForm({ candidate, interview, onDone }: { candidate: Candidate; interview: Interview; onDone: () => void }) {
  const [score, setScore] = useState('')
  const [feedback, setFeedback] = useState('')
  return (
    <ActionForm action={{ type: 'candidates/feedback', id: candidate.id, interviewId: interview.id, score: Number(score), feedback }} success="Feedback saved" description={candidate.name} submit="Save feedback" onDone={onDone}>
      <FormField label="Score" required>
        <NativeSelect value={score} onChange={(e) => setScore(e.target.value)}>
          <option value="">Pick a score</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} of 5
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Feedback" required>
        <Textarea rows={4} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      </FormField>
    </ActionForm>
  )
}

function OfferForm({ candidate, defaultType, onDone }: { candidate: Candidate; defaultType: EmploymentType; onDone: () => void }) {
  const now = useNow()
  const [salary, setSalary] = useState(String(candidate.offer?.salary ?? ''))
  const [startsOn, setStartsOn] = useState(candidate.offer?.startsOn ?? ymd(now + 14 * DAY))
  const [type, setType] = useState<EmploymentType>(candidate.offer?.type ?? defaultType)
  const offer: Offer = { salary: Number(salary) || 0, startsOn, type, status: 'draft', sentAt: candidate.offer?.sentAt ?? null }
  return (
    <ActionForm action={{ type: 'candidates/offer', id: candidate.id, offer }} success="Offer saved as draft" description={fmtIdr(offer.salary)} submit="Save draft" onDone={onDone}>
      <FormField label="Monthly salary" hint={offer.salary ? fmtIdr(offer.salary) : 'Rupiah per month'} required>
        <Input inputMode="numeric" value={salary} onChange={(e) => setSalary(digits(e.target.value))} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Start date" required>
          <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </FormField>
        <FormField label="Employment type">
          <NativeSelect value={type} onChange={(e) => setType(e.target.value as EmploymentType)}>
            {Object.entries(EMPLOYMENT_TYPE_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
    </ActionForm>
  )
}

/** Builds the employee and contract from the accepted offer and the opening. */
function HireForm({ candidate, opening, offer, onDone }: { candidate: Candidate; opening: JobOpening; offer: Offer; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const permanent = offer.type === 'permanent'
  const oneYear = ymd(toMs(fromDateInput(offer.startsOn)) + 364 * DAY)
  const [f, setF] = useState({
    email: candidate.email,
    gender: 'female' as Employee['gender'],
    birthDate: '',
    managerId: state.departments.find((d) => d.id === opening.departmentId)?.headId ?? '',
    endsOn: permanent ? '' : oneYear,
  })
  // Fresh ids once per dialog, so the blocker check and the dispatch see the same records.
  const [ids] = useState(() => ({ employee: newId('emp'), contract: newId('ctr') }))
  const shift = state.shifts.find((s) => s.id === 'shf-office') ?? state.shifts[0]
  const employee: Employee = {
    id: ids.employee,
    code: nextEmployeeCode(state),
    name: candidate.name,
    email: f.email.trim(),
    phone: candidate.phone,
    gender: f.gender,
    birthDate: f.birthDate,
    userId: null,
    departmentId: opening.departmentId,
    sectionId: null,
    positionId: opening.positionId,
    managerId: f.managerId || null,
    branchId: opening.branchId,
    type: offer.type,
    status: 'onboarding',
    joinedAt: fromDateInput(offer.startsOn),
    leftAt: null,
    leftReason: '',
    nik: '',
    npwp: '',
    bpjsTk: '',
    bpjsKes: '',
    bankAccount: '',
    ptkp: 'TK/0',
    baseSalary: offer.salary,
    allowances: [],
    shiftId: shift?.id ?? '',
    annualLeave: offer.type === 'intern' ? 0 : 12,
  }
  const contract: EmploymentContract = {
    id: ids.contract,
    code: nextContractCode(state),
    employeeId: employee.id,
    type: offer.type,
    startsOn: offer.startsOn,
    endsOn: permanent ? null : f.endsOn || null,
    salary: offer.salary,
    status: 'active',
    note: `Hired through ${opening.code}`,
  }
  const action: AppAction = { type: 'candidates/hire', id: candidate.id, employee, contract }
  const blocker = blockerFor(state, action)
  const position = state.positions.find((p) => p.id === opening.positionId)?.name

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!blocker && act(action, 'Candidate hired', `${employee.code} · ${candidate.name}`)) onDone()
      }}
    >
      <KeyValue
        size="sm"
        items={[
          { label: 'Code', value: <span className="font-mono">{employee.code}</span> },
          { label: 'Position', value: `${position ?? 'Unknown position'}, ${state.departments.find((d) => d.id === opening.departmentId)?.name ?? ''}` },
          { label: 'Salary', value: <Money value={offer.salary} className="font-semibold" /> },
          { label: 'Starts', value: `${fmtDate(offer.startsOn)} · ${EMPLOYMENT_TYPE_LABEL[offer.type]}` },
          { label: 'Shift', value: shift?.name ?? '–' },
        ]}
      />
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Work email" required>
          <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </FormField>
        <FormField label="Gender">
          <NativeSelect value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as Employee['gender'] })}>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </NativeSelect>
        </FormField>
        <FormField label="Birth date">
          <Input type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} />
        </FormField>
        <FormField label="Reports to">
          <NativeSelect value={f.managerId} onChange={(e) => setF({ ...f, managerId: e.target.value })}>
            <option value="">Nobody</option>
            {state.employees
              .filter((e) => e.status !== 'left')
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
          </NativeSelect>
        </FormField>
        {!permanent && (
          <FormField label="Contract ends" required>
            <Input type="date" value={f.endsOn} onChange={(e) => setF({ ...f, endsOn: e.target.value })} />
          </FormField>
        )}
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Hire</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- talent pool

type PoolShow = 'pool' | 'rejected'

export function TalentPoolPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const [attaching, setAttaching] = useState<Candidate | null>(null)
  const [adding, setAdding] = useState(false)
  const q = params.get('q') ?? ''
  const show = (params.get('show') as PoolShow | null) || null
  const tag = params.get('tag') || null
  const manage = can('recruit.manage')

  const pool = state.candidates.filter((c) => !c.openingId || c.stage === 'rejected')
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = pool.filter((c) => terms.every((t) => `${c.name} ${c.email} ${c.tags.join(' ')} ${c.notes}`.toLowerCase().includes(t)))
  const kind = (c: Candidate): PoolShow => (c.openingId ? 'rejected' : 'pool')
  const byKind = searched.filter((c) => !show || kind(c) === show)
  const tagCounts = countBy(byKind.flatMap((c) => c.tags), (t) => t)
  const rows = byKind.filter((c) => !tag || c.tags.includes(tag))
  const filters = [q, show, tag].filter(Boolean).length
  const opening = (c: Candidate) => state.jobOpenings.find((o) => o.id === c.openingId)

  const columns: Column<Candidate>[] = [
    {
      id: 'name',
      header: 'Candidate',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate font-semibold">{c.name}</div>
          <div className="truncate text-xs text-muted">{c.email}</div>
        </div>
      ),
    },
    {
      id: 'tags',
      header: 'Tags',
      hideBelow: 'md',
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.tags.length ? c.tags.map((t) => <Badge key={t} variant="outline">{t}</Badge>) : <span className="text-muted">–</span>}
        </span>
      ),
    },
    { id: 'rating', header: 'Rating', hideBelow: 'sm', sortValue: (c) => c.rating, cell: (c) => <Stars value={c.rating} /> },
    {
      id: 'status',
      header: 'Status',
      hideBelow: 'lg',
      cell: (c) =>
        c.openingId ? (
          <div className="min-w-0 text-sm">
            <div>Rejected from {opening(c)?.code ?? 'an opening'}</div>
            <div className="line-clamp-1 text-xs text-muted">{c.rejectReason}</div>
          </div>
        ) : (
          <span className="text-sm">In the pool · {SOURCE_LABEL[c.source]}</span>
        ),
    },
    { id: 'applied', header: 'Since', hideBelow: 'lg', sortValue: (c) => c.appliedAt, cell: (c) => <span className="text-sm tabular-nums">{fmtDate(c.appliedAt)}</span> },
    ...(manage
      ? [
          {
            id: 'attach',
            header: <span className="sr-only">Attach</span>,
            cell: (c: Candidate) => (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setAttaching(c)
                }}
              >
                <Link2 />
                <span className="hidden sm:inline">Attach</span>
              </Button>
            ),
          },
        ]
      : []),
  ]

  return (
    <div>
      <PageHeader
        title="Talent pool"
        description="Candidates without an opening, and rejected ones worth keeping. Attach one to an open opening to start again at Applied."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search the talent pool"
              placeholder="Name, email, tag or note"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {manage && (
              <Button onClick={() => setAdding(true)}>
                <Plus />
                Add to pool
              </Button>
            )}
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('show', null)}>
            All
          </Chip>
          <Chip active={show === 'pool'} count={searched.filter((c) => kind(c) === 'pool').length} onClick={() => set('show', show === 'pool' ? null : 'pool')}>
            No opening
          </Chip>
          <Chip active={show === 'rejected'} count={searched.filter((c) => kind(c) === 'rejected').length} onClick={() => set('show', show === 'rejected' ? null : 'rejected')}>
            Rejected
          </Chip>
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {pool.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      {Object.keys(tagCounts).length > 0 && (
        <ChipRow className="mt-2" aria-label="Tags">
          {Object.entries(tagCounts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([t, n]) => (
              <Chip key={t} variant="default" active={tag === t} count={n} onClick={() => set('tag', tag === t ? null : t)}>
                {t}
              </Chip>
            ))}
        </ChipRow>
      )}
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(c) => c.id}
          rowLabel={(c) => c.name}
          onRowClick={(c) => navigate(paths.candidate(c.id))}
          initialSort={{ id: 'name', desc: false }}
          resetPageKey={`${q}|${show}|${tag}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching candidates" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="The pool is empty" description="Walk-ins and rejected candidates worth keeping land here." />
            )
          }
        />
      </div>
      <AttachDialog candidate={attaching} onClose={() => setAttaching(null)} />
      <Dialog open={adding} onOpenChange={setAdding} size="lg" title="Add to talent pool" description="Keep a candidate on file without an opening.">
        {adding && <CandidateForm old={null} openingId={null} onDone={() => setAdding(false)} />}
      </Dialog>
    </div>
  )
}
