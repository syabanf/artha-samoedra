import {
  blockerFor,
  employeeName,
  employeeOfUser,
  fmtDate,
  fmtIdrShort,
  fmtNumber,
  fromDateInput,
  kpiAchievement,
  newId,
  reviewSummary,
  scoreBand,
  scorecardScore,
  toDateInput,
} from '@artha/fixtures'
import { REVIEW_RELATION_LABEL, SCORECARD_STATUS_LABEL, type KpiDefinition, type Review, type ReviewCycle, type Scorecard, type ScorecardStatus } from '@artha/types'
import {
  Badge,
  Banner,
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
  Kicker,
  NativeSelect,
  PageHeader,
  ProgressBar,
  StatCard,
  Textarea,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { CheckCheck, ClipboardCheck, Lock, Pencil, Play, Plus, Search, Send, Trash2, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { SubTabs } from '../../components/SubTabs'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { EmployeeSelect, PersonCell } from './parts'

export const PERFORMANCE_TABS = [
  { to: paths.kpis, label: 'KPIs' },
  { to: paths.reviews, label: '360 reviews' },
  { to: paths.hrReports, label: 'Reports' },
]

const STATUS_VARIANT: Record<ScorecardStatus, BadgeVariant> = { draft: 'warning', submitted: 'info', final: 'success' }
const ScorecardStatusBadge = ({ status }: { status: ScorecardStatus }) => <Badge variant={STATUS_VARIANT[status]}>{SCORECARD_STATUS_LABEL[status]}</Badge>

const BAND_VARIANT: Record<string, BadgeVariant> = { Outstanding: 'success', Exceeds: 'success', Meets: 'info', 'Needs improvement': 'warning', 'Below expectations': 'danger' }
const ScoreBadge = ({ score }: { score: number | null }) =>
  score === null ? <span className="text-muted">–</span> : <Badge variant={BAND_VARIANT[scoreBand(score)]}>{scoreBand(score)}</Badge>

const CYCLE_VARIANT: Record<ReviewCycle['status'], BadgeVariant> = { draft: 'warning', open: 'success', closed: 'muted' }
const CYCLE_LABEL: Record<ReviewCycle['status'], string> = { draft: 'Draft', open: 'Open', closed: 'Closed' }

const fmtValue = (v: number, unit: string) => (unit === 'Rp' ? fmtIdrShort(v) : unit === '%' ? `${fmtNumber(v, v % 1 ? 1 : 0)}%` : `${fmtNumber(v, v % 1 ? 1 : 0)} ${unit}`)
/** Empty or unreadable input is null. */
const parseNum = (v: string) => {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'))
  return v.trim() === '' || Number.isNaN(n) ? null : n
}

const quarterOf = (ms: number) => {
  const d = new Date(ms)
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`
}
const shiftQuarter = (period: string, by: number) => {
  const [y, q] = period.split('-Q').map(Number)
  const i = y * 4 + q - 1 + by
  return `${Math.floor(i / 4)}-Q${(i % 4) + 1}`
}
const periodLabel = (p: string) => p.replace(/^(\d{4})-Q(\d)$/, 'Q$2 $1')

const useParam = () => {
  const [params, setParams] = useSearchParams()
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  return { params, set, clear: () => setParams({}, { replace: true }) }
}

const Missing = ({ what, back, label }: { what: string; back: string; label: string }) => (
  <div>
    <BackButton fallback={back} />
    <PageHeader title={`${what[0].toUpperCase()}${what.slice(1)} not found`} />
    <Card>
      <EmptyState
        title={`There is no ${what} with this link`}
        action={
          <Button asChild variant="outline">
            <Link to={back}>{label}</Link>
          </Button>
        }
      />
    </Card>
  </div>
)

// ---------------------------------------------------------------- KPIs and scorecards

export function KpisPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const { params, set, clear } = useParam()
  const [editing, setEditing] = useState<KpiDefinition | 'new' | null>(null)
  const [creating, setCreating] = useState(false)
  const manage = can('performance.manage')

  const groups = state.positions
    .map((p) => ({ position: p, kpis: state.kpis.filter((k) => k.positionIds.includes(p.id)) }))
    .filter((g) => g.kpis.length)
  const uncovered = state.positions.length - groups.length

  const q = params.get('q') ?? ''
  const period = params.get('period') ?? ''
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.scorecards.filter((sc) => terms.every((w) => employeeName(state, sc.employeeId).toLowerCase().includes(w)))
  const periods = [...new Set(state.scorecards.map((sc) => sc.period))].sort().reverse()
  const rows = searched.filter((sc) => !period || sc.period === period)
  const filters = [q, period].filter(Boolean).length
  const score = (sc: Scorecard) => scorecardScore(state, sc)

  const columns: Column<Scorecard>[] = [
    { id: 'person', header: 'Person', sortValue: (sc) => employeeName(state, sc.employeeId), cell: (sc) => <PersonCell id={sc.employeeId} link={false} /> },
    { id: 'period', header: 'Period', sortValue: (sc) => sc.period, hideBelow: 'sm', cell: (sc) => <span className="text-sm">{periodLabel(sc.period)}</span> },
    {
      id: 'score',
      header: 'Score',
      align: 'right',
      sortValue: score,
      cell: (sc) => {
        const s = score(sc)
        return (
          <span className="inline-flex flex-wrap items-center justify-end gap-2">
            <span className="font-semibold tabular-nums">{s ?? '–'}</span>
            <span className="hidden md:inline-flex">
              <ScoreBadge score={s} />
            </span>
          </span>
        )
      },
    },
    { id: 'status', header: 'Status', sortValue: (sc) => sc.status, cell: (sc) => <ScorecardStatusBadge status={sc.status} /> },
  ]

  return (
    <div>
      <SubTabs items={PERFORMANCE_TABS} />
      <PageHeader title="KPIs and scorecards" description="KPIs set what each position is measured on. A scorecard scores one person for a quarter against those KPIs." />

      <Card className="mb-6 min-w-0">
        <CardHeader
          action={
            manage && (
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus />
                New KPI
              </Button>
            )
          }
        >
          <CardTitle>KPI definitions</CardTitle>
          <p className="text-sm text-muted">
            Weights per position should total 100%.{uncovered > 0 && ` ${uncovered} position${uncovered === 1 ? ' has' : 's have'} no KPIs yet.`}
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {groups.length === 0 && <EmptyState compact title="No KPIs yet" description="Add a KPI and pick the positions it scores." />}
          {groups.map(({ position, kpis }) => {
            const total = kpis.reduce((n, k) => n + k.weight, 0)
            return (
              <div key={position.id} className="min-w-0 rounded-2xl bg-surface-2 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{position.name}</div>
                    <div className="truncate text-xs text-muted">{state.departments.find((d) => d.id === position.departmentId)?.name}</div>
                  </div>
                  <Badge variant={total < 100 ? 'warning' : 'success'} title={total < 100 ? `Add ${100 - total}% more weight` : undefined}>
                    {total}%
                  </Badge>
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {kpis.map((k) => (
                    <li key={k.id} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{k.name}</span>
                        <span className="block truncate text-xs text-muted">
                          Target {fmtValue(k.target, k.unit)} · {k.direction === 'higher' ? 'higher is better' : 'lower is better'}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{k.weight}%</span>
                      {manage && (
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${k.name}`} onClick={() => setEditing(k)}>
                          <Pencil />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Scorecards</h2>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search scorecards"
            placeholder="Employee name"
            value={q}
            onChange={(e) => set('q', e.target.value || null)}
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
          {manage && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              New scorecard
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!period} count={searched.length} onClick={() => set('period', null)}>
            All periods
          </Chip>
          {periods.map((p) => (
            <Chip key={p} active={period === p} count={searched.filter((sc) => sc.period === p).length} onClick={() => set('period', period === p ? null : p)}>
              {periodLabel(p)}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.scorecards.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
              Clear filters
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(sc) => sc.id}
          rowLabel={(sc) => `${employeeName(state, sc.employeeId)}, ${periodLabel(sc.period)}`}
          onRowClick={(sc) => navigate(paths.scorecard(sc.id))}
          initialSort={{ id: 'period', desc: true }}
          resetPageKey={`${q}|${period}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching scorecards" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No scorecards yet" description="Start one for an employee whose position has KPIs." />
            )
          }
        />
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'New KPI'} description="Open scorecards keep the targets they were created with.">
        {editing && <KpiForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={creating} onOpenChange={setCreating} title="New scorecard" description="The scorecard takes the KPIs and targets of the employee's position.">
        {creating && <NewScorecardForm onDone={() => setCreating(false)} />}
      </Dialog>
    </div>
  )
}

function KpiForm({ editing, onDone }: { editing: KpiDefinition | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    name: editing?.name ?? '',
    unit: editing?.unit ?? '',
    direction: editing?.direction ?? 'higher',
    target: editing ? String(editing.target) : '',
    weight: editing ? String(editing.weight) : '',
    positionIds: editing?.positionIds ?? [],
  })
  const kpi: KpiDefinition = {
    id: editing?.id ?? newId('kpi'),
    name: f.name.trim(),
    unit: f.unit.trim(),
    direction: f.direction,
    target: parseNum(f.target) ?? 0,
    weight: parseNum(f.weight) ?? 0,
    positionIds: f.positionIds,
  }
  const blocker = blockerFor(state, { type: 'kpis/upsert', kpi })
  const removeBlocker = editing && blockerFor(state, { type: 'kpis/remove', id: editing.id })
  const toggle = (id: string) => setF({ ...f, positionIds: f.positionIds.includes(id) ? f.positionIds.filter((x) => x !== id) : [...f.positionIds, id] })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'kpis/upsert', kpi }, editing ? 'KPI saved' : 'KPI added', kpi.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Deals closed" />
        </FormField>
        <FormField label="Unit" hint="Rp, %, deals, hours">
          <Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} />
        </FormField>
        <FormField label="Better when">
          <NativeSelect value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value as KpiDefinition['direction'] })}>
            <option value="higher">Higher</option>
            <option value="lower">Lower</option>
          </NativeSelect>
        </FormField>
        <FormField label="Target" required>
          <Input inputMode="decimal" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} />
        </FormField>
        <FormField label="Weight" required hint="Percent of the scorecard">
          <Input inputMode="numeric" value={f.weight} onChange={(e) => setF({ ...f, weight: e.target.value })} right={<span className="pr-3 text-sm text-muted">%</span>} />
        </FormField>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-semibold">Positions it scores</legend>
        <div className="grid max-h-56 grid-cols-1 gap-1 overflow-y-auto rounded-2xl bg-surface-2 p-2 sm:grid-cols-2">
          {state.positions.map((p) => (
            <label key={p.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl p-2 text-sm hover:bg-surface">
              <Checkbox checked={f.positionIds.includes(p.id)} onCheckedChange={() => toggle(p.id)} label={p.name} />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            className="sm:mr-auto"
            disabled={!!removeBlocker}
            title={removeBlocker ?? undefined}
            onClick={() => act({ type: 'kpis/remove', id: editing.id }, 'KPI removed', editing.name) && onDone()}
          >
            <Trash2 />
            Remove
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save KPI' : 'Add KPI'}</Button>
      </DialogFooter>
    </form>
  )
}

function NewScorecardForm({ onDone }: { onDone: () => void }) {
  const { state } = useAppState()
  const now = useNow()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const current = quarterOf(now)
  const [employeeId, setEmployeeId] = useState('')
  const [period, setPeriod] = useState(current)
  const positionId = state.employees.find((e) => e.id === employeeId)?.positionId
  const scorecard: Scorecard = {
    id: newId('sc'),
    employeeId,
    period,
    status: 'draft',
    note: '',
    entries: state.kpis.filter((k) => positionId && k.positionIds.includes(positionId)).map((k) => ({ kpiId: k.id, target: k.target, actual: null })),
  }
  const blocker = employeeId ? blockerFor(state, { type: 'scorecards/upsert', scorecard }) : 'Pick an employee.'

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'scorecards/upsert', scorecard }, 'Scorecard started', `${employeeName(state, employeeId)}, ${periodLabel(period)}`)) {
          onDone()
          navigate(paths.scorecard(scorecard.id))
        }
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Employee" required className="sm:col-span-2">
          <EmployeeSelect value={employeeId} onChange={setEmployeeId} filter={(e) => state.kpis.some((k) => k.positionIds.includes(e.positionId))} />
        </FormField>
        <FormField label="Period" required>
          <NativeSelect value={period} onChange={(e) => setPeriod(e.target.value)}>
            {[shiftQuarter(current, -1), current, shiftQuarter(current, 1)].map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="KPIs">
          <div className="flex h-11 items-center text-sm text-muted">{employeeId ? `${scorecard.entries.length} from the position` : 'Pick an employee first'}</div>
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Start scorecard</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- scorecard

export function ScorecardPage() {
  const { id = '' } = useParams()
  const { state } = useAppState()
  const sc = state.scorecards.find((x) => x.id === id)
  if (!sc) {
    return <Missing what="scorecard" back={paths.kpis} label="All scorecards" />
  }
  return <ScorecardView key={sc.id} sc={sc} />
}

function ScorecardView({ sc }: { sc: Scorecard }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const editable = can('performance.manage') && sc.status === 'draft'
  const [actuals, setActuals] = useState(() => sc.entries.map((e) => (e.actual === null ? '' : String(e.actual))))
  const [note, setNote] = useState(sc.note)

  const edited: Scorecard = { ...sc, note: note.trim(), entries: sc.entries.map((e, i) => ({ ...e, actual: parseNum(actuals[i]) })) }
  const dirty = edited.note !== sc.note || edited.entries.some((e, i) => e.actual !== sc.entries[i].actual)
  const score = scorecardScore(state, edited)
  // Check the submit against the edited scorecard, since Submit saves first.
  const submitBlocker = blockerFor({ ...state, scorecards: state.scorecards.map((x) => (x.id === sc.id ? edited : x)) }, { type: 'scorecards/submit', id: sc.id })
  const finalizeBlocker = blockerFor(state, { type: 'scorecards/finalize', id: sc.id })
  const employee = state.employees.find((e) => e.id === sc.employeeId)
  const who = employee?.name ?? 'Unknown employee'
  const save = () => act({ type: 'scorecards/upsert', scorecard: edited }, 'Scorecard saved', `${who}, ${periodLabel(sc.period)}`)

  return (
    <div>
      <BackButton fallback={paths.kpis} />
      <PageHeader
        eyebrow={`Scorecard · ${periodLabel(sc.period)}`}
        title={who}
        description={state.positions.find((p) => p.id === employee?.positionId)?.name}
        actions={
          can('performance.manage') && (
            <>
              {editable && (
                <>
                  <Button variant="outline" disabled={!dirty} title={dirty ? undefined : 'Nothing has changed.'} onClick={save}>
                    Save
                  </Button>
                  <Button
                    disabled={!!submitBlocker}
                    title={submitBlocker ?? undefined}
                    onClick={() => (!dirty || save()) && act({ type: 'scorecards/submit', id: sc.id }, 'Scorecard submitted', who)}
                  >
                    <Send />
                    Submit
                  </Button>
                </>
              )}
              {sc.status === 'submitted' && (
                <Button disabled={!!finalizeBlocker} title={finalizeBlocker ?? undefined} onClick={() => act({ type: 'scorecards/finalize', id: sc.id }, 'Scorecard final', who)}>
                  <CheckCheck />
                  Finalize
                </Button>
              )}
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Card variant="ink" className="p-6">
            <Kicker className="text-on-ink-muted">Weighted score</Kicker>
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <span className="text-5xl font-bold tracking-tight tabular-nums">{score ?? '–'}</span>
              <span className="pb-1 text-sm font-semibold text-on-ink-muted">{score === null ? 'No actuals yet' : scoreBand(score)}</span>
            </div>
            <ProgressBar value={((score ?? 0) / 120) * 100} tone="accent" className="mt-4 bg-white/10" />
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-on-ink-muted">
              <ScorecardStatusBadge status={sc.status} />
              {sc.status === 'final' && (
                <span className="inline-flex items-center gap-1">
                  <Lock className="size-3.5" aria-hidden />
                  Locked
                </span>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Note</CardTitle>
            </CardHeader>
            <CardContent>
              {editable ? (
                <Textarea aria-label="Note" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What the manager discussed with the employee" />
              ) : (
                <p className="text-sm text-body">{sc.note || 'No note.'}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>KPIs</CardTitle>
            <p className="text-sm text-muted">Achievement caps at 120%. Lower-is-better KPIs score target over actual.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {edited.entries.map((e, i) => {
                const kpi = state.kpis.find((k) => k.id === e.kpiId)
                const ach = kpi ? kpiAchievement(kpi, e.target, e.actual) : null
                return (
                  <li key={e.kpiId} className="grid grid-cols-2 items-center gap-3 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_6rem]">
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <div className="truncate font-semibold">{kpi?.name ?? 'Removed KPI'}</div>
                      <div className="text-xs text-muted">
                        Weight {kpi?.weight ?? 0}% · {kpi?.direction === 'lower' ? 'lower is better' : 'higher is better'}
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="block text-xs text-muted">Target</span>
                      <span className="tabular-nums">{fmtValue(e.target, kpi?.unit ?? '')}</span>
                    </div>
                    <div className="text-sm">
                      {editable ? (
                        <Input
                          aria-label={`Actual for ${kpi?.name ?? 'KPI'}`}
                          inputMode="decimal"
                          placeholder="Actual"
                          value={actuals[i]}
                          onChange={(ev) => setActuals(actuals.map((a, j) => (j === i ? ev.target.value : a)))}
                        />
                      ) : (
                        <>
                          <span className="block text-xs text-muted">Actual</span>
                          <span className="tabular-nums">{e.actual === null ? '–' : fmtValue(e.actual, kpi?.unit ?? '')}</span>
                        </>
                      )}
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm sm:justify-end">
                        <span className="text-xs text-muted sm:hidden">Achievement</span>
                        <span className="font-semibold tabular-nums">{ach === null ? '–' : `${ach}%`}</span>
                      </div>
                      <ProgressBar value={((ach ?? 0) / 120) * 100} className="mt-1" />
                    </div>
                  </li>
                )
              })}
            </ul>
            {editable && submitBlocker && <p className="mt-3 text-sm text-muted">{submitBlocker}</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 360 cycles

const cycleProgress = (reviews: Review[], cycleId: string) => {
  const mine = reviews.filter((r) => r.cycleId === cycleId)
  return { submitted: mine.filter((r) => r.submittedAt).length, total: mine.length }
}

export function ReviewsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const [editing, setEditing] = useState<ReviewCycle | 'new' | null>(null)
  const manage = can('performance.manage')
  const me = employeeOfUser(state, user.id)
  const cycles = [...state.reviewCycles].sort((a, b) => b.opensAt.localeCompare(a.opensAt))
  const open = cycles.find((c) => c.status === 'open')
  const toWrite = open && me ? state.reviews.filter((r) => r.cycleId === open.id && r.reviewerId === me.id && !r.submittedAt).length : 0

  return (
    <div>
      <SubTabs items={PERFORMANCE_TABS} />
      <PageHeader
        title="360 reviews"
        description="Each cycle asks people to rate themselves, their manager, two peers and their direct reports on the same questions."
        actions={
          manage && (
            <Button onClick={() => setEditing('new')}>
              <Plus />
              New cycle
            </Button>
          )
        }
      />
      {open && toWrite > 0 && (
        <Banner tone="info" title={`You have ${toWrite} review${toWrite === 1 ? '' : 's'} to write`}>
          <Link to={paths.reviewCycle(open.id)} className="font-semibold underline-offset-4 hover:underline">
            Open {open.name}
          </Link>{' '}
          before {fmtDate(open.dueAt)}.
        </Banner>
      )}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
        {cycles.length === 0 && (
          <Card className="lg:col-span-2">
            <EmptyState title="No review cycles yet" description="Create a cycle with its questions, then open it to send the forms." />
          </Card>
        )}
        {cycles.map((c) => {
          const p = cycleProgress(state.reviews, c.id)
          return (
            <Card key={c.id} className="min-w-0 p-5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link to={paths.reviewCycle(c.id)} className="block truncate text-base font-semibold hover:text-accent">
                    {c.name}
                  </Link>
                  <div className="mt-0.5 text-xs text-muted">
                    {fmtDate(c.opensAt)} to {fmtDate(c.dueAt)} · {c.questions.length} question{c.questions.length === 1 ? '' : 's'}
                  </div>
                </div>
                <Badge variant={CYCLE_VARIANT[c.status]} dot={c.status === 'open'}>
                  {CYCLE_LABEL[c.status]}
                </Badge>
                {manage && c.status === 'draft' && (
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                    <Pencil />
                  </Button>
                )}
              </div>
              {c.status === 'draft' ? (
                <p className="mt-4 text-sm text-muted">Not open yet. Opening creates the review forms.</p>
              ) : (
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-muted">Submitted</span>
                    <span className="font-semibold tabular-nums">
                      {p.submitted} of {p.total}
                    </span>
                  </div>
                  <ProgressBar value={p.total ? (p.submitted / p.total) * 100 : 0} tone={c.status === 'open' ? 'accent' : 'ink'} />
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} size="lg" title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'New review cycle'} description="Everyone answers the same questions on a 1 to 5 scale.">
        {editing && <CycleForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function CycleForm({ editing, onDone }: { editing: ReviewCycle | null; onDone: () => void }) {
  const { state } = useAppState()
  const now = useNow()
  const act = useAct()
  const [tried, setTried] = useState(false)
  // A new cycle starts from the latest cycle's questions.
  const latest = [...state.reviewCycles].sort((a, b) => b.opensAt.localeCompare(a.opensAt))[0]
  const [f, setF] = useState({
    name: editing?.name ?? '',
    opensAt: toDateInput(editing?.opensAt ?? new Date(now).toISOString()),
    dueAt: toDateInput(editing?.dueAt ?? new Date(now + 21 * 86_400_000).toISOString()),
    questions: editing?.questions ?? (latest?.questions ?? []).map((q) => ({ id: newId('q'), text: q.text })),
  })
  const cycle: ReviewCycle = {
    id: editing?.id ?? newId('cyc'),
    name: f.name.trim(),
    status: 'draft',
    questions: f.questions.map((q) => ({ ...q, text: q.text.trim() })),
    opensAt: f.opensAt ? fromDateInput(f.opensAt) : '',
    dueAt: f.dueAt ? new Date(`${f.dueAt}T17:00:00`).toISOString() : '',
  }
  const blocker = blockerFor(state, { type: 'cycles/upsert', cycle })
  const setQuestion = (id: string, text: string) => setF({ ...f, questions: f.questions.map((q) => (q.id === id ? { ...q, text } : q)) })

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'cycles/upsert', cycle }, editing ? 'Cycle saved' : 'Cycle created', cycle.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="H1 2027 review" />
        </FormField>
        <FormField label="Opens" hint="Replaced by the day you open it">
          <Input type="date" value={f.opensAt} onChange={(e) => setF({ ...f, opensAt: e.target.value })} />
        </FormField>
        <FormField label="Due" required>
          <Input type="date" value={f.dueAt} onChange={(e) => setF({ ...f, dueAt: e.target.value })} />
        </FormField>
      </div>
      <fieldset className="mt-4">
        <legend className="mb-2 text-sm font-semibold">Questions</legend>
        <ol className="space-y-2">
          {f.questions.map((q, i) => (
            <li key={q.id} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-sm text-muted tabular-nums">{i + 1}</span>
              <Input aria-label={`Question ${i + 1}`} value={q.text} onChange={(e) => setQuestion(q.id, e.target.value)} className="min-w-0 flex-1" />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove question ${i + 1}`} onClick={() => setF({ ...f, questions: f.questions.filter((x) => x.id !== q.id) })}>
                <X />
              </Button>
            </li>
          ))}
        </ol>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setF({ ...f, questions: [...f.questions, { id: newId('q'), text: '' }] })}>
          <Plus />
          Add question
        </Button>
      </fieldset>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save cycle' : 'Create cycle'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- cycle detail

type Summary = ReturnType<typeof reviewSummary> & { subjectId: string }

export function ReviewCyclePage() {
  const { id = '' } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const { params, set, clear } = useParam()
  const [editing, setEditing] = useState(false)
  const cycle = state.reviewCycles.find((c) => c.id === id)

  if (!cycle) {
    return <Missing what="review cycle" back={paths.reviews} label="All cycles" />
  }

  const manage = can('performance.manage')
  const me = employeeOfUser(state, user.id)
  const reviews = state.reviews.filter((r) => r.cycleId === cycle.id)
  const mine = me ? reviews.filter((r) => r.reviewerId === me.id).sort((a, b) => Number(!!a.submittedAt) - Number(!!b.submittedAt)) : []
  const progress = cycleProgress(state.reviews, cycle.id)
  const openBlocker = blockerFor(state, { type: 'cycles/open', id: cycle.id })
  const closeBlocker = blockerFor(state, { type: 'cycles/close', id: cycle.id })

  const summaries: Summary[] = [...new Set(reviews.map((r) => r.subjectId))].map((subjectId) => ({ subjectId, ...reviewSummary(state, cycle.id, subjectId) }))
  const q = params.get('q') ?? ''
  const show = params.get('show')
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = summaries.filter((s) => terms.every((w) => employeeName(state, s.subjectId).toLowerCase().includes(w)))
  const complete = (s: Summary) => s.submitted === s.total
  const rows = searched.filter((s) => !show || (show === 'complete' ? complete(s) : !complete(s)))
  const filters = [q, show].filter(Boolean).length

  const columns: Column<Summary>[] = [
    { id: 'person', header: 'Person', sortValue: (s) => employeeName(state, s.subjectId), cell: (s) => <PersonCell id={s.subjectId} /> },
    { id: 'overall', header: 'Overall', align: 'right', sortValue: (s) => s.overall, cell: (s) => <span className="font-semibold tabular-nums">{s.overall ?? '–'}</span> },
    { id: 'relations', header: 'By relation', hideBelow: 'md', cell: (s) => <RelationBars summary={s} /> },
    { id: 'done', header: 'Submitted', align: 'right', sortValue: (s) => s.submitted / Math.max(1, s.total), cell: (s) => <span className="text-sm tabular-nums">{s.submitted} of {s.total}</span> },
  ]

  return (
    <div>
      <BackButton fallback={paths.reviews} />
      <PageHeader
        eyebrow="360 review"
        title={cycle.name}
        description={`${fmtDate(cycle.opensAt)} to ${fmtDate(cycle.dueAt)}`}
        actions={
          manage && (
            <>
              {cycle.status === 'draft' && (
                <>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil />
                    Edit
                  </Button>
                  <Button disabled={!!openBlocker} title={openBlocker ?? undefined} onClick={() => act({ type: 'cycles/open', id: cycle.id }, 'Cycle open', 'Review forms went out to everyone active.')}>
                    <Play />
                    Open cycle
                  </Button>
                </>
              )}
              {cycle.status === 'open' && (
                <Button variant="outline" disabled={!!closeBlocker} title={closeBlocker ?? undefined} onClick={() => act({ type: 'cycles/close', id: cycle.id }, 'Cycle closed', 'Reviews not yet submitted stay unsubmitted.')}>
                  <Lock />
                  Close cycle
                </Button>
              )}
            </>
          )
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Status" value={CYCLE_LABEL[cycle.status]} icon={<ClipboardCheck />} tone={cycle.status === 'open' ? 'success' : 'default'} hint={`${cycle.questions.length} questions`} />
        <StatCard label="Submitted" value={progress.submitted} unit={`of ${progress.total}`} icon={<Send />} hint={progress.total ? `${Math.round((progress.submitted / progress.total) * 100)}% done` : 'No forms yet'} />
        <StatCard label="People reviewed" value={summaries.length} icon={<Users />} hint={`${summaries.filter(complete).length} with every review in`} />
        <StatCard label="Due" value={new Date(cycle.dueAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} icon={<CheckCheck />} hint={new Date(cycle.dueAt).getFullYear()} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>My reviews to write</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!me && <EmptyState compact title="No employee record" description="Your user is not linked to an employee, so you have no reviews to write." />}
            {me && mine.length === 0 && <EmptyState compact title="No reviews for you" description={cycle.status === 'draft' ? 'Forms go out when the cycle opens.' : 'Nobody asked you to review them in this cycle.'} />}
            {mine.map((r) => (
              <Link key={r.id} to={paths.reviewForm(r.id)} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{r.relation === 'self' ? 'Yourself' : employeeName(state, r.subjectId)}</span>
                  <span className="block text-xs text-muted">{REVIEW_RELATION_LABEL[r.relation]} review</span>
                </span>
                {r.submittedAt ? <Badge variant="success">Submitted</Badge> : cycle.status === 'open' ? <Badge variant="accent">To write</Badge> : <Badge variant="muted">Not submitted</Badge>}
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Questions</CardTitle>
            <p className="text-sm text-muted">Each scored 1 to 5, with an optional comment.</p>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              {cycle.questions.map((qq) => (
                <li key={qq.id}>{qq.text}</li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      <div className="mb-3 mt-6 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Results by person</h2>
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search people"
          placeholder="Name"
          value={q}
          onChange={(e) => set('q', e.target.value || null)}
          className="w-full sm:w-64"
          right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('show', null)}>
            Everyone
          </Chip>
          <Chip active={show === 'complete'} count={searched.filter(complete).length} onClick={() => set('show', show === 'complete' ? null : 'complete')}>
            All reviews in
          </Chip>
          <Chip active={show === 'waiting'} count={searched.filter((s) => !complete(s)).length} onClick={() => set('show', show === 'waiting' ? null : 'waiting')}>
            Waiting
          </Chip>
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {summaries.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => clear()}>
              Clear filters
            </Button>
          </span>
        )}
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(s) => s.subjectId}
          rowLabel={(s) => employeeName(state, s.subjectId)}
          initialSort={{ id: 'overall', desc: true }}
          resetPageKey={`${q}|${show}`}
          empty={
            filters ? (
              <EmptyState compact title="Nobody matches" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No results yet" description={cycle.status === 'draft' ? 'Open the cycle to send review forms to everyone active.' : 'Submitted reviews show up here.'} />
            )
          }
        />
      </div>

      <Dialog open={editing} onOpenChange={setEditing} size="lg" title={`Edit ${cycle.name}`} description="Everyone answers the same questions on a 1 to 5 scale.">
        {editing && <CycleForm editing={cycle} onDone={() => setEditing(false)} />}
      </Dialog>
    </div>
  )
}

/** Average score per relation out of 5; a single strongest relation gets the accent, ties stay grey. */
function RelationBars({ summary }: { summary: Summary }) {
  const scores = summary.byRelation.map((r) => r.score ?? 0)
  const best = Math.max(0, ...scores)
  const unique = scores.filter((x) => x === best).length === 1
  return (
    <div className="grid w-56 grid-cols-[4.5rem_minmax(0,1fr)_1.75rem] items-center gap-x-2 gap-y-1 text-[11px]">
      {summary.byRelation.map(({ relation, score }) => (
        <div key={relation} className="contents">
          <span className="truncate text-muted">{REVIEW_RELATION_LABEL[relation]}</span>
          <span className="h-1.5 overflow-hidden rounded-full bg-surface">
            <span className={cn('block h-full rounded-full', unique && score === best ? 'bg-accent' : 'bg-chart-muted')} style={{ width: `${((score ?? 0) / 5) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums">{score ?? '–'}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- review form

export function ReviewFormPage() {
  const { id = '' } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const review = state.reviews.find((r) => r.id === id)
  const cycle = state.reviewCycles.find((c) => c.id === review?.cycleId)

  if (!review || !cycle) {
    return <Missing what="review" back={paths.reviews} label="All cycles" />
  }
  const mineToWrite = employeeOfUser(state, user.id)?.id === review.reviewerId
  if (!mineToWrite && !can('performance.manage')) {
    return (
      <div>
        <BackButton fallback={paths.reviewCycle(cycle.id)} />
        <PageHeader title="Review" />
        <NoAccess description="Only the reviewer and people who manage performance can see this review." />
      </div>
    )
  }
  return <ReviewForm key={review.id} review={review} cycle={cycle} canWrite={mineToWrite && !review.submittedAt && cycle.status === 'open'} />
}

function ReviewForm({ review, cycle, canWrite }: { review: Review; cycle: ReviewCycle; canWrite: boolean }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const [answers, setAnswers] = useState<Review['answers']>(review.answers)
  const answer = (questionId: string) => answers.find((a) => a.questionId === questionId)
  const put = (questionId: string, patch: Partial<Review['answers'][number]>) => {
    const old = answer(questionId) ?? { questionId, score: 0, comment: '' }
    setAnswers([...answers.filter((a) => a.questionId !== questionId), { ...old, ...patch }])
  }
  const scored = answers.filter((a) => a.score > 0).map((a) => ({ ...a, comment: a.comment.trim() }))
  const blocker = blockerFor(state, { type: 'reviews/submit', id: review.id, answers: scored, by: user.id })
  const subject = employeeName(state, review.subjectId)
  const status = review.submittedAt ? `Submitted ${fmtDate(review.submittedAt)}` : cycle.status === 'open' ? `Due ${fmtDate(cycle.dueAt)}` : 'Not submitted. The cycle is closed.'

  return (
    <div>
      <BackButton fallback={paths.reviewCycle(cycle.id)} />
      <PageHeader
        eyebrow={`${cycle.name} · ${REVIEW_RELATION_LABEL[review.relation]} review`}
        title={review.relation === 'self' ? `Self review: ${subject}` : `Review of ${subject}`}
        description={`By ${employeeName(state, review.reviewerId)}. ${status}`}
      />
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (blocker) return
          if (act({ type: 'reviews/submit', id: review.id, answers: scored, by: user.id }, 'Review submitted', `${REVIEW_RELATION_LABEL[review.relation]} review of ${subject}`)) navigate(paths.reviewCycle(cycle.id))
        }}
      >
        {cycle.questions.map((q, i) => {
          const a = answer(q.id)
          return (
            <Card key={q.id} className="min-w-0 p-5">
              <div className="text-xs font-semibold text-muted">Question {i + 1}</div>
              <div className="mt-1 font-semibold">{q.text}</div>
              <div role="group" aria-label={`Score for question ${i + 1}`} className="mt-3 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Chip key={n} variant="default" active={a?.score === n} disabled={!canWrite} onClick={() => put(q.id, { score: n })} className="w-11 justify-center">
                    {n}
                  </Chip>
                ))}
                <span className="self-center text-xs text-muted">1 is poor, 5 is excellent</span>
              </div>
              {canWrite ? (
                <Textarea aria-label={`Comment for question ${i + 1}`} rows={2} className="mt-3" placeholder="Comment (optional)" value={a?.comment ?? ''} onChange={(e) => put(q.id, { comment: e.target.value })} />
              ) : (
                a?.comment && <p className="mt-3 text-sm text-body">{a.comment}</p>
              )}
            </Card>
          )
        })}
        {canWrite && (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
            <Button type="submit">
              <Send />
              Submit review
            </Button>
          </div>
        )}
      </form>
    </div>
  )
}
