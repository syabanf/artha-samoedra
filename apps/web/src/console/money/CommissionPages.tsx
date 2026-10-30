import { blockerFor, countBy, fmtDateLong, fmtIdr, fmtIdrShort, fmtPercent, journalFor, newId, nowIso, statementLines, statementTotal } from '@artha/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
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
  NativeSelect,
  PageHeader,
  StatCard,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { STATEMENT_STATUS_LABEL, type CommissionStatement, type StatementStatus } from '@artha/types'
import { Banknote, CircleCheck, FilePen, Plus, Printer, Search, ShieldCheck, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { readPrice } from '../../lib/price'
import { useAppState, useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { LetterBlock, LetterHead, LetterRow, Signature } from '../../components/Letter'

const STATUSES: StatementStatus[] = ['draft', 'approved', 'paid']
const STATUS_VARIANT: Record<StatementStatus, BadgeVariant> = { draft: 'muted', approved: 'info', paid: 'success' }

const StatementStatusBadge = ({ status }: { status: StatementStatus }) => <Badge variant={STATUS_VARIANT[status]}>{STATEMENT_STATUS_LABEL[status]}</Badge>

const monthLabel = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

/** This month and the five before it, newest first, as YYYY-MM. */
const recentMonths = () => {
  const d = new Date(nowIso())
  return Array.from({ length: 6 }, (_, i) => new Date(d.getFullYear(), d.getMonth() - i, 1)).map((m) => `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
}

// ---------------------------------------------------------------- list

export function CommissionsPage() {
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [generating, setGenerating] = useState(false)
  const q = params.get('q') ?? ''
  const status = (params.get('status') as StatementStatus | null) || null
  const agent = params.get('agent') || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.statements.filter(
    (x) => (!agent || x.agentId === agent) && terms.every((t) => `${x.code} ${actorName(x.agentId)} ${monthLabel(x.month)}`.toLowerCase().includes(t)),
  )
  const counts = countBy(searched, (x) => x.status)
  const rows = searched.filter((x) => !status || x.status === status)
  const filters = [q, status, agent].filter(Boolean).length
  const agents = state.users.filter((u) => state.statements.some((x) => x.agentId === u.id))
  const sumOf = (s: StatementStatus) => state.statements.filter((x) => x.status === s).reduce((n, x) => n + statementTotal(x), 0)
  const all = countBy(state.statements, (x) => x.status)
  const toggle = (s: StatementStatus) => set('status', status === s ? null : s)

  const columns: Column<CommissionStatement>[] = [
    {
      id: 'code',
      header: 'Statement',
      sortValue: (x) => x.code,
      cell: (x) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{x.code}</div>
          <div className="truncate text-sm">{actorName(x.agentId)}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
            <StatementStatusBadge status={x.status} />
            <span className="text-xs text-muted">{monthLabel(x.month)}</span>
          </div>
        </div>
      ),
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (x) => STATUSES.indexOf(x.status), cell: (x) => <StatementStatusBadge status={x.status} /> },
    { id: 'month', header: 'Month', hideBelow: 'sm', sortValue: (x) => x.month, cell: (x) => <span className="text-sm">{monthLabel(x.month)}</span> },
    { id: 'deals', header: 'Deals', hideBelow: 'md', align: 'right', sortValue: (x) => x.lines.length, cell: (x) => <span className="text-sm tabular-nums">{x.lines.length}</span> },
    { id: 'total', header: 'Total', align: 'right', sortValue: statementTotal, cell: (x) => <span className="font-semibold tabular-nums">{fmtIdrShort(statementTotal(x))}</span> },
  ]

  return (
    <div>
      <PageHeader
        title="Commissions"
        description="Monthly statements of each agent's share on won deals. Finance approves a draft, then pays it out."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search statements"
              placeholder="Code, agent or month"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('commission.manage') && (
              <Button onClick={() => setGenerating(true)}>
                <Plus />
                Generate statement
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Drafts" value={all.draft ?? 0} icon={<FilePen />} tone={all.draft ? 'warning' : 'default'} active={status === 'draft'} onClick={() => toggle('draft')} />
        <StatCard label="Approved" value={all.approved ?? 0} icon={<ShieldCheck />} tone="info" active={status === 'approved'} onClick={() => toggle('approved')} />
        <StatCard label="To pay out" value={fmtIdrShort(sumOf('approved')).replace('Rp ', '')} unit="Rp" icon={<Banknote />} tone="ink" hint="Approved, not paid yet" />
        <StatCard label="Paid out" value={fmtIdrShort(sumOf('paid')).replace('Rp ', '')} unit="Rp" icon={<CircleCheck />} tone="success" active={status === 'paid'} onClick={() => toggle('paid')} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => toggle(s)}>
              {STATEMENT_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by agent" value={agent ?? ''} onChange={(e) => set('agent', e.target.value)}>
          <option value="">All agents</option>
          {agents.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.statements.length}
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
          getRowKey={(x) => x.id}
          rowLabel={(x) => x.code}
          onRowClick={(x) => navigate(paths.commission(x.id))}
          initialSort={{ id: 'code', desc: true }}
          resetPageKey={`${q}|${status}|${agent}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching statements" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No statements yet" description="Generate one for an agent who won deals in a month." />
            )
          }
        />
      </div>
      <Dialog open={generating} onOpenChange={setGenerating} size="lg" title="Generate statement" description="Lines come from the agent's won deals closed in the month, at the rate of each listing's profit-share scheme.">
        {generating && (
          <GenerateForm
            onDone={(id) => {
              setGenerating(false)
              if (id) navigate(paths.commission(id))
            }}
          />
        )}
      </Dialog>
    </div>
  )
}

function GenerateForm({ onDone }: { onDone: (id: string | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const months = recentMonths()
  const agents = state.users.filter((u) => u.status === 'active')
  const [month, setMonth] = useState(months[0])
  const [agentId, setAgentId] = useState(() => agents.find((u) => statementLines(state, u.id, months[0]).length)?.id ?? agents[0]?.id ?? '')
  const [id] = useState(() => newId('cs'))
  const lines = statementLines(state, agentId, month)
  const action = { type: 'statements/generate', id, agentId, month } as const
  const blocker = blockerFor(state, action)
  const total = lines.reduce((n, l) => n + l.amount, 0)
  const dealOf = (id: string) => state.deals.find((d) => d.id === id)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const agent = agents.find((u) => u.id === agentId)
        if (act(action, 'Statement generated', `${agent?.name ?? 'Agent'}, ${monthLabel(month)}`)) onDone(action.id)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Agent" required>
          <NativeSelect value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Month" required>
          <NativeSelect value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
      </div>
      <div className="mt-4 rounded-2xl bg-surface-2 p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Preview</div>
        {lines.length ? (
          <ul className="divide-y divide-border text-sm">
            {lines.map((l) => (
              <li key={l.dealId} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs font-semibold">{dealOf(l.dealId)?.code}</div>
                  <div className="truncate">{dealOf(l.dealId)?.title}</div>
                  <div className="text-xs text-muted">
                    {fmtIdrShort(l.basis)} × {fmtPercent(l.commissionPct)} × agent {fmtPercent(l.agentPct, 0)}
                  </div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums">{fmtIdr(l.amount)}</div>
              </li>
            ))}
            <li className="flex justify-between gap-3 pt-2 font-bold">
              <span>Total</span>
              <span className="tabular-nums">{fmtIdr(total)}</span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-muted">No won deals for this agent in {monthLabel(month)}.</p>
        )}
      </div>
      {blocker && (
        <Banner tone="warning" title="Cannot generate yet" className="mt-4">
          {blocker}
        </Banner>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit" disabled={!!blocker} title={blocker ?? undefined}>
          Generate
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- detail: printable statement

export function CommissionDetailPage() {
  const { id } = useParams()
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const st = state.statements.find((x) => x.id === id)
  if (!st) {
    return (
      <Card>
        <EmptyState title="Statement not found" description="This statement may have been removed." action={<BackButton fallback={paths.commissions} />} />
      </Card>
    )
  }
  const agent = state.users.find((u) => u.id === st.agentId)
  const manage = can('commission.manage')
  const journal = journalFor(state, 'statement', st.id)
  const subtotal = st.lines.reduce((n, l) => n + l.amount, 0)
  const dealOf = (dealId: string) => state.deals.find((d) => d.id === dealId)
  const at = STATUSES.indexOf(st.status)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.commissions} />
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{st.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">Commission statement</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatementStatusBadge status={st.status} />
            <span className="text-sm text-muted">
              {agent?.name ?? st.agentId} · {monthLabel(st.month)}
            </span>
            {journal && can('finance.view') && <CodeLink to={paths.journal(journal.id)} code={journal.code} />}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {manage && st.status === 'draft' && (
            <Button onClick={() => act({ type: 'statements/approve', id: st.id }, 'Statement approved', `${st.code} is ready to pay`)}>
              <ShieldCheck />
              Approve
            </Button>
          )}
          {manage && st.status === 'approved' && (
            <Button onClick={() => act({ type: 'statements/pay', id: st.id }, 'Statement paid', `${fmtIdr(statementTotal(st))} to ${agent?.name ?? 'the agent'}`)}>
              <Banknote />
              Mark paid
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}>
            <Printer />
            Print
          </Button>
        </div>
      </div>
      <Card className="p-4 print:hidden">
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" aria-label="Statement progress">
          {STATUSES.map((s, i) => (
            <li key={s} aria-current={s === st.status ? 'step' : undefined} className="flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${i <= at ? 'bg-ink' : 'bg-silver'}`} />
              <span className={s === st.status ? 'font-semibold text-foreground' : 'text-muted'}>{STATEMENT_STATUS_LABEL[s]}</span>
            </li>
          ))}
        </ol>
      </Card>
      {manage && st.status === 'draft' && <AdjustCard statement={st} />}

      <Card className="mx-auto max-w-3xl p-6 sm:p-10 print:max-w-none print:border-0 print:p-0">
        <LetterHead company={state.company} />
        <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-bold">Commission statement, {monthLabel(st.month)}</div>
            <div className="font-mono text-xs text-muted">{st.code}</div>
          </div>
          <div className="text-sm text-muted">{fmtDateLong(st.createdAt)}</div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <LetterBlock title="Agent">
            <div className="font-semibold">{agent?.name ?? st.agentId}</div>
            {agent?.phone && <div>{agent.phone}</div>}
            {agent?.email && <div>{agent.email}</div>}
          </LetterBlock>
          <LetterBlock title="Status">
            <div className="font-semibold">{STATEMENT_STATUS_LABEL[st.status]}</div>
            {st.approvedBy && <div>Approved by {actorName(st.approvedBy)}</div>}
            {st.paidAt && <div>Paid {fmtDateLong(st.paidAt)}</div>}
          </LetterBlock>
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
              <th className="py-2 pr-3 font-semibold">Deal</th>
              <th className="hidden py-2 pr-3 text-right font-semibold sm:table-cell">Basis</th>
              <th className="hidden py-2 pr-3 text-right font-semibold sm:table-cell">Commission</th>
              <th className="hidden py-2 pr-3 text-right font-semibold sm:table-cell">Agent share</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {st.lines.map((l) => {
              const d = dealOf(l.dealId)
              return (
                <tr key={l.dealId} className="align-top">
                  <td className="min-w-0 py-2.5 pr-3">
                    {d ? <CodeLink to={paths.deal(d.id)} code={d.code} /> : <span className="font-mono text-xs">{l.dealId}</span>}
                    <div className="break-words">{d?.title}</div>
                    <div className="text-xs text-muted sm:hidden">
                      {fmtIdrShort(l.basis)} × {fmtPercent(l.commissionPct)} × {fmtPercent(l.agentPct, 0)}
                    </div>
                  </td>
                  <td className="hidden py-2.5 pr-3 text-right tabular-nums sm:table-cell">{fmtIdr(l.basis)}</td>
                  <td className="hidden py-2.5 pr-3 text-right tabular-nums sm:table-cell">{fmtPercent(l.commissionPct)}</td>
                  <td className="hidden py-2.5 pr-3 text-right tabular-nums sm:table-cell">{fmtPercent(l.agentPct, 0)}</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{fmtIdr(l.amount)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <dl className="mt-2 divide-y divide-border border-y border-border text-sm">
          <LetterRow label="Subtotal" value={fmtIdr(subtotal)} />
          <LetterRow label={st.note ? `Adjustment: ${st.note}` : 'Adjustment'} value={st.adjustment < 0 ? `- ${fmtIdr(-st.adjustment)}` : fmtIdr(st.adjustment)} />
          <LetterRow label="Total payable" value={fmtIdr(statementTotal(st))} strong />
        </dl>
        <p className="mt-4 text-xs text-muted">Each line is the deal value times the listing's commission rate times the agent's share of that commission. Payment goes to the agent's payroll account.</p>

        <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
          <Signature role="Agent" name={agent?.name ?? ''} />
          <Signature role={`For ${state.company.name}`} name={st.approvedBy ? actorName(st.approvedBy) : ''} />
        </div>
      </Card>
    </div>
  )
}

/** Reads "1.5 M" or "-500000" into signed rupiah. */
const readSigned = (v: string) => {
  const n = readPrice(v.replace('-', '')) ?? 0
  return v.trim().startsWith('-') ? -n : n
}

function AdjustCard({ statement }: { statement: CommissionStatement }) {
  const act = useAct()
  const [amount, setAmount] = useState(statement.adjustment ? String(statement.adjustment) : '')
  const [note, setNote] = useState(statement.note)
  const [tried, setTried] = useState(false)
  const adjustment = readSigned(amount)
  const noteError = adjustment !== 0 && !note.trim() ? 'Say why the amount changes.' : null
  const changed = adjustment !== statement.adjustment || note.trim() !== statement.note
  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>Adjustment</CardTitle>
      </CardHeader>
      <form
        noValidate
        className="grid grid-cols-1 gap-4 px-5 pb-5 sm:grid-cols-[200px_minmax(0,1fr)_auto] sm:items-start"
        onSubmit={(e) => {
          e.preventDefault()
          setTried(true)
          if (noteError) return
          act({ type: 'statements/adjust', id: statement.id, adjustment, note: note.trim() }, 'Adjustment saved', adjustment ? fmtIdr(adjustment) : 'Cleared')
        }}
      >
        <FormField label="Amount" hint={adjustment ? fmtIdr(adjustment) : 'For example 1 M, or -500000 to deduct'}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </FormField>
        <FormField label="Note" error={tried ? (noteError ?? undefined) : undefined} hint="Printed on the statement">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Weekend bonus" />
        </FormField>
        <Button type="submit" variant="outline" className="sm:mt-6" disabled={!changed}>
          Save
        </Button>
      </form>
    </Card>
  )
}
