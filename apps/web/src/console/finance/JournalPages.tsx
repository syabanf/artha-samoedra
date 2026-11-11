import {
  accountLabel,
  blockerFor,
  countBy,
  dateBlocker,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  fmtIdrShort,
  fromDateInput,
  journalBlocker,
  journalTotals,
  monthLabel,
  monthOf,
  newId,
  nowIso,
  toDateInput,
  type AppState,
} from '@artha/fixtures'
import {
  Banner,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  NativeSelect,
  PageHeader,
  StatCard,
  Textarea,
  cn,
  type Column,
} from '@artha/ui'
import { JOURNAL_SOURCE_LABEL, JOURNAL_STATUS_LABEL, type JournalEntry, type JournalLine, type JournalSource, type JournalStatus } from '@artha/types'
import { Ban, CircleCheck, FilePen, Pencil, Plus, Search, Undo2, Workflow, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { NoAccess } from '../../components/NoAccess'
import { CodeLink, paths } from '../../components/links'
import { useAppState, useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { AccountSelect, JournalStatusBadge, Money } from './parts'

const STATUSES: JournalStatus[] = ['draft', 'posted', 'void']
const SOURCES = Object.keys(JOURNAL_SOURCE_LABEL) as JournalSource[]

/** Where the record that produced a journal lives. */
function refPath(state: AppState, ref: NonNullable<JournalEntry['ref']>): string | null {
  switch (ref.kind) {
    case 'payment':
      return paths.payment(ref.id)
    case 'statement':
      return paths.commission(ref.id)
    case 'settlement':
      return paths.settlements
    case 'cash': {
      const tx = state.cashTransactions.find((t) => t.id === ref.id)
      return tx ? paths.cashAccount(tx.accountId) : paths.cash
    }
    case 'bill':
      return paths.bill(ref.id)
    case 'invoice':
      return paths.invoice(ref.id)
    case 'journal':
      return paths.journal(ref.id)
    default:
      return null
  }
}

// ---------------------------------------------------------------- list

export function JournalsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') as JournalStatus | null) || null
  const source = (params.get('source') as JournalSource | null) || null
  const period = params.get('period') || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.journals.filter((j) => (!period || monthOf(j.date) === period) && terms.every((t) => `${j.code} ${j.memo} ${j.ref?.label ?? ''}`.toLowerCase().includes(t)))
  const statusCounts = countBy(searched.filter((j) => !source || j.source === source), (j) => j.status)
  const sourceCounts = countBy(searched.filter((j) => !status || j.status === status), (j) => j.source)
  const rows = searched.filter((j) => (!status || j.status === status) && (!source || j.source === source))
  const filters = [q, status, source, period].filter(Boolean).length

  const month = monthOf(new Date(now).toISOString())
  const thisMonth = state.journals.filter((j) => monthOf(j.date) === month)
  const all = countBy(state.journals, (j) => j.status)
  const postedNow = thisMonth.filter((j) => j.status === 'posted')
  const autoNow = thisMonth.filter((j) => j.source === 'auto' && j.status !== 'void')
  const months = [...state.periods].sort((a, b) => b.month.localeCompare(a.month))
  const toggle = (s: JournalStatus) => set('status', status === s ? null : s)
  const showMonth = (patch: Record<string, string>) => setParams(new URLSearchParams({ period: month, ...patch }), { replace: true })

  const columns: Column<JournalEntry>[] = [
    {
      id: 'code',
      header: 'Journal',
      sortValue: (j) => j.code,
      cell: (j) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{j.code}</div>
          <div className="truncate text-sm md:hidden">{j.memo}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
            <JournalStatusBadge status={j.status} />
            <span className="text-xs text-muted">{fmtDate(j.date)}</span>
          </div>
        </div>
      ),
    },
    { id: 'date', header: 'Date', hideBelow: 'sm', sortValue: (j) => j.date, cell: (j) => <span className="text-xs text-muted">{fmtDate(j.date)}</span> },
    { id: 'memo', header: 'Memo', hideBelow: 'md', cell: (j) => <span className="line-clamp-2 text-sm">{j.memo}</span> },
    { id: 'source', header: 'Source', hideBelow: 'lg', sortValue: (j) => j.source, cell: (j) => <span className="text-xs text-muted">{JOURNAL_SOURCE_LABEL[j.source]}</span> },
    { id: 'debit', header: 'Debit total', align: 'right', sortValue: (j) => journalTotals(j.lines).debit, cell: (j) => <span className="font-semibold tabular-nums">{fmtIdrShort(journalTotals(j.lines).debit)}</span> },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (j) => STATUSES.indexOf(j.status), cell: (j) => <JournalStatusBadge status={j.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Journals"
        description="Every entry in the general ledger. Manual entries start as drafts; other modules post their own."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search journals"
              placeholder="Code or memo"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('ledger.manage') && (
              <Button asChild>
                <Link to={paths.journalNew}>
                  <Plus />
                  New journal
                </Link>
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Drafts" value={all.draft ?? 0} icon={<FilePen />} tone={all.draft ? 'warning' : 'default'} hint={all.draft ? 'Post or void before the period closes' : undefined} active={status === 'draft' && !period} onClick={() => setParams(status === 'draft' && !period ? {} : { status: 'draft' }, { replace: true })} />
        <StatCard label="Posted this month" value={postedNow.length} icon={<CircleCheck />} tone="ink" hint={fmtIdrShort(postedNow.reduce((n, j) => n + journalTotals(j.lines).debit, 0))} active={period === month && status === 'posted' && !source} onClick={() => showMonth({ status: 'posted' })} />
        <StatCard label="Auto-journals this month" value={autoNow.length} icon={<Workflow />} active={period === month && source === 'auto' && !status} onClick={() => showMonth({ source: 'auto' })} />
        <StatCard label="Void" value={all.void ?? 0} icon={<Ban />} active={status === 'void' && !period} onClick={() => setParams(status === 'void' && !period ? {} : { status: 'void' }, { replace: true })} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!status} count={Object.values(statusCounts).reduce((a, b) => a + b, 0)} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={statusCounts[s] ?? 0} onClick={() => toggle(s)}>
              {JOURNAL_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect aria-label="Period" value={period ?? ''} onChange={(e) => set('period', e.target.value || null)} className="w-full sm:w-48">
          <option value="">All periods</option>
          {months.map((p) => (
            <option key={p.id} value={p.month}>
              {monthLabel(p.month)}
              {p.status === 'closed' ? ' (closed)' : ''}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          {SOURCES.map((s) => (
            <Chip key={s} active={source === s} count={sourceCounts[s] ?? 0} onClick={() => set('source', source === s ? null : s)}>
              {JOURNAL_SOURCE_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.journals.length}
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
          getRowKey={(j) => j.id}
          rowLabel={(j) => j.code}
          onRowClick={(j) => navigate(paths.journal(j.id))}
          initialSort={{ id: 'date', desc: true }}
          resetPageKey={`${q}|${status}|${source}|${period}`}
          rowClassName={(j) => (j.status === 'draft' ? 'bg-warning-soft/40' : j.status === 'void' ? 'text-muted' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching journals" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No journals yet" description="Record a manual entry, or mark a payment paid to see an auto-journal." />
            )
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- editor

interface LineDraft {
  key: string
  accountId: string
  memo: string
  debit: string
  credit: string
}

const digits = (v: string) => v.replace(/\D/g, '')
const toDraft = (l: JournalLine): LineDraft => ({ key: newId('jl'), accountId: l.accountId, memo: l.memo, debit: l.debit ? String(l.debit) : '', credit: l.credit ? String(l.credit) : '' })
const blankDraft = (): LineDraft => ({ key: newId('jl'), accountId: '', memo: '', debit: '', credit: '' })
const toLine = (l: LineDraft): JournalLine => ({ accountId: l.accountId, memo: l.memo.trim(), debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })

export function JournalEditorPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const existing = id ? state.journals.find((j) => j.id === id) : undefined
  if (!can('ledger.manage')) return <NoAccess description="Entering journals needs the ledger.manage permission." action={<BackButton fallback={paths.journals} />} />
  if (id && !existing) {
    return (
      <Card>
        <EmptyState pageTitle title="Journal not found" description="This journal may have been removed." action={<BackButton fallback={paths.journals} />} />
      </Card>
    )
  }
  if (existing && existing.status !== 'draft') {
    return (
      <Card>
        <EmptyState title="Only a draft can be edited" description={`${existing.code} is ${JOURNAL_STATUS_LABEL[existing.status].toLowerCase()}. Reverse a posted entry instead.`} action={<BackButton fallback={paths.journal(existing.id)} />} />
      </Card>
    )
  }
  return <JournalEditor key={existing?.id ?? 'new'} existing={existing} />
}

function JournalEditor({ existing }: { existing?: JournalEntry }) {
  const { state } = useAppState()
  const act = useAct()
  const navigate = useNavigate()
  const [tried, setTried] = useState(false)
  const [date, setDate] = useState(toDateInput(existing?.date ?? nowIso()))
  const [memo, setMemo] = useState(existing?.memo ?? '')
  const [lines, setLines] = useState<LineDraft[]>(existing ? existing.lines.map(toDraft) : [blankDraft(), blankDraft()])

  const setLine = (key: string, patch: Partial<LineDraft>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const kept = lines.filter((l) => l.accountId || l.debit || l.credit || l.memo.trim()).map(toLine)
  const iso = date ? fromDateInput(date) : nowIso()
  const draft = { date: iso, memo: memo.trim(), lines: kept }
  const blocker = date ? journalBlocker(state, draft) : 'Pick the date the entry counts on.'
  const totals = journalTotals(kept)
  const difference = totals.debit - totals.credit
  const balanced = difference === 0 && totals.debit > 0

  const build = (): JournalEntry =>
    existing
      ? { ...existing, ...draft }
      : { id: newId('jnl'), code: '', source: 'manual', ref: null, status: 'draft', reversalOf: null, voidReason: '', postedAt: null, createdBy: '', createdAt: nowIso(), ...draft }

  const save = (post: boolean) => {
    setTried(true)
    if (!date || (post && blocker)) return
    const journal = build()
    if (!act({ type: 'journals/save', journal }, post ? 'Journal saved' : existing ? 'Draft updated' : 'Draft saved', memo.trim())) return
    if (post) act({ type: 'journals/post', id: journal.id }, 'Journal posted', `${memo.trim()} · ${fmtIdr(totals.debit)}`)
    navigate(paths.journal(journal.id))
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={existing ? paths.journal(existing.id) : paths.journals} />
      <PageHeader title={existing ? `Edit ${existing.code}` : 'New journal'} description="Debits and credits must match. A draft stays out of the ledger until you post it." />
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          save(false)
        }}
        className="space-y-4"
      >
        <Card className="p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <FormField label="Date" required error={tried && date ? (dateBlocker(state, iso) ?? undefined) : tried ? 'Pick a date.' : undefined}>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </FormField>
            <FormField label="Memo" required error={tried && !memo.trim() ? 'Describe the entry in the memo.' : undefined}>
              <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="For example, accrue October office rent" />
            </FormField>
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_9rem_9rem_2.5rem] gap-2 px-3 text-xs font-semibold text-muted sm:grid">
            <span>Account</span>
            <span>Line memo</span>
            <span className="text-right">Debit</span>
            <span className="text-right">Credit</span>
            <span />
          </div>
          <ul className="space-y-3">
            {lines.map((l, i) => (
              <li key={l.key} className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_9rem_9rem_2.5rem] sm:items-start">
                <AccountSelect aria-label={`Line ${i + 1} account`} value={l.accountId} onChange={(accountId) => setLine(l.key, { accountId })} className="col-span-2 sm:col-span-1" />
                <Input aria-label={`Line ${i + 1} memo`} placeholder="Line memo" value={l.memo} onChange={(e) => setLine(l.key, { memo: e.target.value })} className="col-span-2 sm:col-span-1" />
                <AmountInput label={`Line ${i + 1} debit`} placeholder="Debit" value={l.debit} onChange={(debit) => setLine(l.key, { debit, credit: debit ? '' : l.credit })} />
                <AmountInput label={`Line ${i + 1} credit`} placeholder="Credit" value={l.credit} onChange={(credit) => setLine(l.key, { credit, debit: credit ? '' : l.debit })} />
                <div className="col-span-2 flex justify-end sm:col-span-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${i + 1}`}
                    disabled={lines.length <= 2}
                    title={lines.length <= 2 ? 'A journal needs at least two lines.' : undefined}
                    onClick={() => setLines(lines.filter((x) => x.key !== l.key))}
                  >
                    <X />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, blankDraft()])}>
              <Plus />
              Add line
            </Button>
            <dl className="ml-auto grid min-w-[16rem] grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
              <dt className="text-muted">Debits</dt>
              <dd className="text-right"><Money value={totals.debit} /></dd>
              <dt className="text-muted">Credits</dt>
              <dd className="text-right"><Money value={totals.credit} /></dd>
              <dt className="font-semibold">Difference</dt>
              <dd className={cn('text-right font-semibold tabular-nums', balanced ? 'text-success' : 'text-danger')}>{fmtIdr(Math.abs(difference))}</dd>
            </dl>
          </div>
          {tried && blocker && <p className="mt-3 text-sm text-danger">{blocker}</p>}
        </Card>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(existing ? paths.journal(existing.id) : paths.journals)}>
            Cancel
          </Button>
          <Button type="submit" variant="secondary">
            Save draft
          </Button>
          <Button type="button" onClick={() => save(true)} title={tried && blocker ? blocker : undefined}>
            <CircleCheck />
            Save and post
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Plain digits in, the formatted figure underneath. */
function AmountInput({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="min-w-0">
      <Input aria-label={label} inputMode="numeric" placeholder={placeholder} value={value} onChange={(e) => onChange(digits(e.target.value))} inputClassName="text-right tabular-nums" />
      {value && <div className="mt-1 truncate px-1 text-right text-xs text-muted tabular-nums">{fmtIdr(Number(value))}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- detail

const HeroTile = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-2xl bg-white/10 px-3 py-2">
    <div className="text-xs text-on-ink-muted">{label}</div>
    <div className="truncate font-semibold">{value}</div>
  </div>
)

type LineRow = JournalLine & { n: number }

export function JournalDetailPage() {
  const { id } = useParams()
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const [voiding, setVoiding] = useState(false)
  const [reversing, setReversing] = useState(false)
  const j = state.journals.find((x) => x.id === id)
  if (!j) {
    return (
      <Card>
        <EmptyState pageTitle title="Journal not found" description="This journal may have been removed." action={<BackButton fallback={paths.journals} />} />
      </Card>
    )
  }
  const manage = can('ledger.manage')
  const totals = journalTotals(j.lines)
  const original = j.reversalOf ? state.journals.find((x) => x.id === j.reversalOf) : undefined
  const reversal = state.journals.find((x) => x.reversalOf === j.id && x.status !== 'void')
  const refTo = j.ref && j.ref.kind !== 'journal' ? refPath(state, j.ref) : null
  const postBlocker = blockerFor(state, { type: 'journals/post', id: j.id })
  const voidBlocker = blockerFor(state, { type: 'journals/void', id: j.id, reason: 'check' })
  const today = nowIso()
  const reverseCheck = blockerFor(state, { type: 'journals/reverse', id: j.id, date: today })
  // The dialog picks the date, so only blockers about the entry itself disable the button.
  const reverseBlocker = reverseCheck && reverseCheck !== dateBlocker(state, today) ? reverseCheck : null

  const columns: Column<LineRow>[] = [
    {
      id: 'account',
      header: 'Account',
      cell: (l) => (
        <div className="min-w-0">
          <Link to={paths.glAccount(l.accountId)} className="text-sm font-semibold hover:underline" onClick={(e) => e.stopPropagation()}>
            {accountLabel(state, l.accountId)}
          </Link>
          {l.memo && <div className="truncate text-xs text-muted md:hidden">{l.memo}</div>}
        </div>
      ),
    },
    { id: 'memo', header: 'Memo', hideBelow: 'md', cell: (l) => <span className="text-sm text-muted">{l.memo || '–'}</span> },
    { id: 'debit', header: 'Debit', align: 'right', cell: (l) => <Money value={l.debit} dash /> },
    { id: 'credit', header: 'Credit', align: 'right', cell: (l) => <Money value={l.credit} dash /> },
  ]

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.journals} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{j.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">{j.memo || 'Journal entry'}</h1>
        </div>
        {manage && (
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            {j.status === 'draft' && j.source === 'manual' && (
              <Button variant="outline" asChild>
                <Link to={paths.journalEdit(j.id)}>
                  <Pencil />
                  Edit
                </Link>
              </Button>
            )}
            {j.source === 'manual' && j.status !== 'void' && (
              <Button variant="danger" disabled={!!voidBlocker} title={voidBlocker ?? undefined} onClick={() => setVoiding(true)}>
                <Ban />
                Void
              </Button>
            )}
            {j.status === 'posted' && (
              <Button variant="outline" disabled={!!reverseBlocker} title={reverseBlocker ?? undefined} onClick={() => setReversing(true)}>
                <Undo2 />
                Reverse
              </Button>
            )}
            {j.status === 'draft' && (
              <Button disabled={!!postBlocker} title={postBlocker ?? undefined} onClick={() => act({ type: 'journals/post', id: j.id }, 'Journal posted', `${j.code} · ${fmtIdr(totals.debit)}`)}>
                <CircleCheck />
                Post
              </Button>
            )}
          </div>
        )}
      </div>

      {original && (
        <Banner tone="neutral" title={`Reversal of ${original.code}`} actions={<Button variant="outline" size="sm" asChild><Link to={paths.journal(original.id)}>Open original</Link></Button>}>
          {original.memo}, dated {fmtDate(original.date)}.
        </Banner>
      )}
      {reversal && (
        <Banner tone="warning" title={`Reversed in ${reversal.code}`} actions={<Button variant="outline" size="sm" asChild><Link to={paths.journal(reversal.id)}>Open reversal</Link></Button>}>
          The reversing entry is dated {fmtDate(reversal.date)} and is {JOURNAL_STATUS_LABEL[reversal.status].toLowerCase()}.
        </Banner>
      )}
      {j.status === 'void' && j.voidReason && (
        <Banner tone="neutral" title="Voided">
          {j.voidReason}
        </Banner>
      )}
      {j.status === 'draft' && postBlocker && manage && (
        <Banner tone="warning" title="Not ready to post">
          {postBlocker}
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="font-mono text-xs text-on-ink-muted">{j.code}</div>
          <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{fmtIdrShort(totals.debit)}</div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <HeroTile label="Date" value={fmtDate(j.date)} />
            <HeroTile label="Status" value={JOURNAL_STATUS_LABEL[j.status]} />
            <HeroTile label="Lines" value={String(j.lines.length)} />
          </div>
        </Card>
        <KeyValue
          items={[
            { label: 'Source', value: JOURNAL_SOURCE_LABEL[j.source] },
            {
              label: 'From',
              hidden: !j.ref || j.ref.kind === 'journal',
              value: j.ref && refTo ? <CodeLink to={refTo} code={j.ref.label} /> : (j.ref?.label ?? '–'),
            },
            { label: 'Status', value: <JournalStatusBadge status={j.status} /> },
            { label: 'Created', value: `${actorName(j.createdBy)}, ${fmtDateTime(j.createdAt)}` },
            { label: 'Posted', hidden: !j.postedAt, value: j.postedAt ? fmtDateTime(j.postedAt) : '–' },
          ]}
        />
      </div>

      <Card>
        <CardHeader action={<Badge variant="outline">{j.lines.length}</Badge>}>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable rows={j.lines.map((l, n) => ({ ...l, n }))} columns={columns} getRowKey={(l) => String(l.n)} pageSize={50} empty={<EmptyState compact title="No lines" description="Edit the draft to add lines." />} />
          <dl className="mt-3 ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted">Debits</dt>
            <dd className="text-right font-semibold"><Money value={totals.debit} /></dd>
            <dt className="text-muted">Credits</dt>
            <dd className="text-right font-semibold"><Money value={totals.credit} /></dd>
          </dl>
        </CardContent>
      </Card>

      <Dialog open={voiding} onOpenChange={setVoiding} title={`Void ${j.code}?`} description="A void entry stays on record but leaves the ledger. This cannot be undone.">
        {voiding && <VoidForm journal={j} onDone={() => setVoiding(false)} />}
      </Dialog>
      <Dialog open={reversing} onOpenChange={setReversing} title={`Reverse ${j.code}`} description="A new entry swaps every debit and credit. Pick a date in an open period.">
        {reversing && <ReverseForm journal={j} onDone={() => setReversing(false)} />}
      </Dialog>
    </div>
  )
}

function VoidForm({ journal, onDone }: { journal: JournalEntry; onDone: () => void }) {
  const act = useAct()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!reason.trim()) return
        if (act({ type: 'journals/void', id: journal.id, reason: reason.trim() }, 'Journal voided', journal.code)) onDone()
      }}
    >
      <FormField label="Reason" required error={tried && !reason.trim() ? 'Give a reason for voiding.' : undefined}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example, entered twice" />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="danger">
          Void journal
        </Button>
      </DialogFooter>
    </form>
  )
}

function ReverseForm({ journal, onDone }: { journal: JournalEntry; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [date, setDate] = useState(toDateInput(nowIso()))
  const iso = date ? fromDateInput(date) : ''
  const blocker = iso ? blockerFor(state, { type: 'journals/reverse', id: journal.id, date: iso }) : 'Pick a date.'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (iso && act({ type: 'journals/reverse', id: journal.id, date: iso }, 'Reversing entry posted', `Reverses ${journal.code}`)) onDone()
      }}
    >
      <FormField label="Date" required error={blocker ?? undefined}>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!blocker} title={blocker ?? undefined}>
          <Undo2 />
          Reverse
        </Button>
      </DialogFooter>
    </form>
  )
}
