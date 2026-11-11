import {
  accountBalance,
  blockerFor,
  buildCashTx,
  cashAccounts,
  countBy,
  fmtDate,
  fmtIdr,
  fromDateInput,
  generalLedger,
  newId,
  nowIso,
  lastReconciliation,
  reconciledIds,
  unreconciledJournals,
  toDateInput,
  toMs,
  yearRange,
  type LedgerRow,
} from '@artha/fixtures'
import { CASH_KIND_LABEL, type CashKind, type CashTransaction, type GlAccount, type JournalEntry } from '@artha/types'
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
  FOCUS,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  PillTabs,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CircleCheck, Landmark, Scale, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { CodeLink, paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { AccountSelect, Money } from './parts'

const KINDS: CashKind[] = ['in', 'out', 'transfer']
const KIND_VARIANT: Record<CashKind, BadgeVariant> = { in: 'success', out: 'default', transfer: 'info' }

const digits = (v: string) => v.replace(/\D/g, '')
const endOfDay = (dateInput: string) => toMs(fromDateInput(dateInput)) + 86_400_000 - 1

/** The account's net movement in a journal, debit minus credit (cash accounts are assets). */
const movement = (j: JournalEntry, accountId: string) => j.lines.filter((l) => l.accountId === accountId).reduce((n, l) => n + l.debit - l.credit, 0)

function NotFound() {
  return (
    <Card>
      <EmptyState pageTitle title="Account not found" description="This is not an active cash or bank account." action={<BackButton fallback={paths.cash} />} />
    </Card>
  )
}

// ---------------------------------------------------------------- cash and bank

export function CashPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [recording, setRecording] = useState<CashKind | null>(null)
  const q = params.get('q') ?? ''
  const kind = (params.get('kind') as CashKind | null) || null
  const account = params.get('account') ?? ''
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const accounts = cashAccounts(state)
  const total = accounts.reduce((n, a) => n + accountBalance(state, a.id), 0)
  const name = (id: string) => state.glAccounts.find((a) => a.id === id)?.name ?? 'Unknown account'
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.cashTransactions.filter((t) => terms.every((w) => `${t.code} ${t.memo} ${t.reference} ${name(t.accountId)} ${name(t.counterAccountId)}`.toLowerCase().includes(w)))
  const inAccount = (t: CashTransaction) => !account || t.accountId === account || t.counterAccountId === account
  const kindCounts = countBy(searched.filter(inAccount), (t) => t.kind)
  const rows = searched.filter((t) => inAccount(t) && (!kind || t.kind === kind))
  const filters = [q, kind, account].filter(Boolean).length

  const columns: Column<CashTransaction>[] = [
    {
      id: 'code',
      header: 'Transaction',
      sortValue: (t) => t.code,
      cell: (t) => (
        <div className="min-w-0">
          <CodeLink to={paths.journal(t.journalId)} code={t.code} />
          <div className="truncate text-sm">{t.memo}</div>
          <div className="mt-1 text-xs text-muted md:hidden">{fmtDate(t.date)}</div>
        </div>
      ),
    },
    { id: 'date', header: 'Date', hideBelow: 'md', sortValue: (t) => t.date, cell: (t) => <span className="text-xs text-muted">{fmtDate(t.date)}</span> },
    { id: 'kind', header: 'Kind', hideBelow: 'sm', sortValue: (t) => t.kind, cell: (t) => <Badge variant={KIND_VARIANT[t.kind]}>{CASH_KIND_LABEL[t.kind]}</Badge> },
    {
      id: 'accounts',
      header: 'Accounts',
      hideBelow: 'lg',
      cell: (t) => {
        const [from, to] = t.kind === 'in' ? [t.counterAccountId, t.accountId] : [t.accountId, t.counterAccountId]
        return (
          <span className="text-sm">
            {name(from)} <span className="text-muted">to</span> {name(to)}
          </span>
        )
      },
    },
    { id: 'amount', header: 'Amount', align: 'right', sortValue: (t) => t.amount, cell: (t) => <Money value={t.amount} className="font-semibold" /> },
  ]

  return (
    <div>
      <PageHeader
        title="Cash and bank"
        description="Balances of every cash and bank account, with money in, money out and transfers between them."
        actions={
          can('cash.manage') && (
            <>
              <Button variant="outline" onClick={() => setRecording('in')}>
                <ArrowDownLeft />
                Cash in
              </Button>
              <Button variant="outline" onClick={() => setRecording('out')}>
                <ArrowUpRight />
                Cash out
              </Button>
              <Button onClick={() => setRecording('transfer')}>
                <ArrowLeftRight />
                Transfer
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <Card variant="ink" className="p-5">
          <div className="text-xs text-on-ink-muted">Total cash and bank</div>
          <Money value={total} className="mt-2 block text-2xl font-bold tracking-tight" />
          <div className="mt-1 text-xs text-on-ink-muted">
            {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          </div>
        </Card>
        {accounts.map((a) => {
          const open = unreconciledJournals(state, a.id).length
          return (
            <Link key={a.id} to={paths.cashAccount(a.id)} className={cn('block rounded-card bg-card p-5 shadow-card transition-colors hover:bg-surface-2', FOCUS)}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-mono text-xs text-muted">{a.code}</div>
                  <div className="truncate font-semibold">{a.name}</div>
                </div>
                <Landmark className="size-4 shrink-0 text-muted" />
              </div>
              <Money value={accountBalance(state, a.id)} className="mt-3 block text-xl font-bold tracking-tight" />
              <div className="mt-1 truncate text-xs text-muted">{a.bank || 'Cash on hand'}</div>
              <div className="mt-3">{open ? <Badge variant="warning">{open} not reconciled</Badge> : <Badge variant="success">All reconciled</Badge>}</div>
            </Link>
          )
        })}
      </div>

      <h2 className="mt-8 text-lg font-bold tracking-tight">Transactions</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search transactions"
          placeholder="Code, memo, reference or account"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="min-w-0 flex-1 sm:w-72 sm:flex-none"
          right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
        />
        <NativeSelect aria-label="Filter by account" value={account} onChange={(e) => set('account', e.target.value || null)} className="min-w-0 flex-1 sm:w-64 sm:flex-none">
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!kind} count={Object.values(kindCounts).reduce((a, b) => a + b, 0)} onClick={() => set('kind', null)}>
            All
          </Chip>
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} count={kindCounts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
              {CASH_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.cashTransactions.length}
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
          getRowKey={(t) => t.id}
          rowLabel={(t) => t.code}
          onRowClick={(t) => navigate(paths.journal(t.journalId))}
          initialSort={{ id: 'date', desc: true }}
          resetPageKey={`${q}|${kind}|${account}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching transactions" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No cash transactions yet" description="Record cash in, cash out or a transfer to start." />
            )
          }
        />
      </div>

      <Dialog open={!!recording} onOpenChange={(o) => !o && setRecording(null)} size="lg" title="Record a cash transaction" description="Each transaction posts a journal on its date.">
        {recording && <CashForm initialKind={recording} onDone={() => setRecording(null)} />}
      </Dialog>
    </div>
  )
}

function CashForm({ initialKind, onDone }: { initialKind: CashKind; onDone: () => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    kind: initialKind,
    date: toDateInput(nowIso()),
    accountId: state.financeSettings.defaultCashAccountId,
    counterAccountId: '',
    amount: '',
    memo: '',
    reference: '',
  })
  const draft = {
    kind: f.kind,
    date: f.date ? fromDateInput(f.date) : '',
    accountId: f.accountId,
    counterAccountId: f.counterAccountId,
    amount: Number(f.amount) || 0,
    memo: f.memo.trim(),
    reference: f.reference.trim(),
  }
  const blocker = f.date ? blockerFor(state, { type: 'cash/record', tx: buildCashTx(state, draft, nowIso(), user.id) }) : 'Pick a date.'
  const accountLabelFor = f.kind === 'in' ? 'Into' : 'From'
  const counterLabel = f.kind === 'transfer' ? 'To' : f.kind === 'in' ? 'Received for' : 'Paid for'

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        const tx = buildCashTx(state, draft, nowIso(), user.id)
        if (act({ type: 'cash/record', tx }, `${CASH_KIND_LABEL[tx.kind]} recorded`, `${tx.code} · ${fmtIdr(tx.amount)}`)) onDone()
      }}
    >
      <PillTabs
        label="Kind of transaction"
        value={f.kind}
        onChange={(kind) => setF({ ...f, kind, counterAccountId: '' })}
        items={KINDS.map((k) => ({ value: k, label: CASH_KIND_LABEL[k] }))}
        className="mb-4"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Date" required>
          <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </FormField>
        <FormField label="Amount" required hint={draft.amount ? fmtIdr(draft.amount) : 'Digits only'}>
          <Input inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: digits(e.target.value) })} placeholder="1500000" />
        </FormField>
        <FormField label={`${accountLabelFor} account`} required>
          <AccountSelect cash value={f.accountId} onChange={(accountId) => setF({ ...f, accountId })} placeholder="Pick a cash or bank account" />
        </FormField>
        <FormField label={`${counterLabel} account`} required hint={f.kind === 'transfer' ? 'Another cash or bank account' : 'The income, expense or balance account on the other side'}>
          <AccountSelect cash={f.kind === 'transfer'} value={f.counterAccountId} onChange={(counterAccountId) => setF({ ...f, counterAccountId })} />
        </FormField>
        <FormField label="Memo" required className="sm:col-span-2">
          <Input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder="What the money is for" />
        </FormField>
        <FormField label="Reference" hint="Bank transfer number or slip" className="sm:col-span-2">
          <Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} inputClassName="font-mono" />
        </FormField>
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Record {CASH_KIND_LABEL[f.kind].toLowerCase()}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- one account

const useCashAccount = (): GlAccount | undefined => {
  const { id } = useParams()
  const { state } = useAppState()
  return state.glAccounts.find((a) => a.id === id && a.isCash)
}

export function CashAccountPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const a = useCashAccount()
  if (!a) return <NotFound />

  const q = params.get('q') ?? ''
  const show = (params.get('show') as 'open' | 'done' | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const year = new Date(now).getFullYear()
  const { from, to } = yearRange(year)
  const ledger = generalLedger(state, a.id, from, to)
  const done = reconciledIds(state, a.id)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = ledger.rows.filter((r) => terms.every((w) => `${r.journal.code} ${r.memo} ${r.journal.ref?.label ?? ''}`.toLowerCase().includes(w)))
  const counts = countBy(searched, (r) => (done.has(r.journal.id) ? 'done' : 'open'))
  const rows = searched.filter((r) => !show || (show === 'done') === done.has(r.journal.id))
  const filters = [q, show].filter(Boolean).length
  const last = lastReconciliation(state, a.id)
  const open = unreconciledJournals(state, a.id).length

  const columns: Column<LedgerRow>[] = [
    {
      id: 'journal',
      header: 'Journal',
      sortValue: (r) => r.journal.date + r.journal.code,
      cell: (r) => (
        <div className="min-w-0">
          <CodeLink to={paths.journal(r.journal.id)} code={r.journal.code} />
          <div className="truncate text-sm">{r.memo}</div>
          <div className="mt-1 text-xs text-muted sm:hidden">{fmtDate(r.journal.date)}</div>
        </div>
      ),
    },
    { id: 'date', header: 'Date', hideBelow: 'sm', sortValue: (r) => r.journal.date, cell: (r) => <span className="text-xs text-muted">{fmtDate(r.journal.date)}</span> },
    { id: 'in', header: 'In', align: 'right', hideBelow: 'md', cell: (r) => <Money value={r.debit} dash /> },
    { id: 'out', header: 'Out', align: 'right', hideBelow: 'md', cell: (r) => <Money value={r.credit} dash /> },
    {
      id: 'move',
      header: 'Amount',
      align: 'right',
      hideBelow: 'sm',
      cell: (r) => <Money value={r.debit - r.credit} />,
    },
    { id: 'balance', header: 'Balance', align: 'right', cell: (r) => <Money value={r.balance} className="font-semibold" /> },
    {
      id: 'rec',
      header: <span className="sr-only">Reconciled</span>,
      cell: (r) =>
        done.has(r.journal.id) ? (
          <CircleCheck className="size-4 text-success" aria-label="Reconciled" />
        ) : (
          <span className="block size-4 rounded-full border border-border" aria-label="Not reconciled" />
        ),
    },
  ]

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.cash} />
      <PageHeader
        className="mb-0"
        eyebrow={<span className="font-mono">{a.code}</span>}
        title={a.name}
        description={a.bank || 'Cash on hand'}
        actions={
          can('cash.manage') && (
            <Button asChild>
              <Link to={paths.reconcile(a.id)}>
                <Scale />
                Reconcile
              </Link>
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Card variant="ink" className="p-5">
          <div className="text-xs text-on-ink-muted">Balance today</div>
          <Money value={accountBalance(state, a.id)} className="mt-2 block text-2xl font-bold tracking-tight" />
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted">Last reconciled</div>
          <div className="mt-2 text-lg font-bold">{last ? fmtDate(last.statementDate) : 'Never'}</div>
          {last && <Money value={last.statementBalance} className="text-xs text-muted" />}
        </Card>
        <Card className="p-5">
          <div className="text-xs text-muted">Not reconciled</div>
          <div className="mt-2 text-lg font-bold tabular-nums">{open}</div>
          <div className="text-xs text-muted">{open === 1 ? 'journal' : 'journals'} touching this account</div>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-bold tracking-tight">Ledger for {year}</h2>
        <p className="text-sm text-muted">
          Opening balance <Money value={ledger.opening} />, closing balance <Money value={ledger.closing} />.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search the ledger"
          placeholder="Journal code or memo"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="min-w-0 flex-1 sm:w-72 sm:flex-none"
          right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
        />
        <ChipRow className="flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('show', null)}>
            All
          </Chip>
          <Chip active={show === 'open'} count={counts.open ?? 0} onClick={() => set('show', show === 'open' ? null : 'open')}>
            Not reconciled
          </Chip>
          <Chip active={show === 'done'} count={counts.done ?? 0} onClick={() => set('show', show === 'done' ? null : 'done')}>
            Reconciled
          </Chip>
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {ledger.rows.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(r) => `${r.journal.id}-${r.balance}`}
        rowLabel={(r) => r.journal.code}
        onRowClick={(r) => navigate(paths.journal(r.journal.id))}
        resetPageKey={`${q}|${show}`}
        empty={
          filters ? (
            <EmptyState compact title="No matching journals" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
          ) : (
            <EmptyState compact title="No movements this year" description="Posted journals that touch this account show here." />
          )
        }
      />
    </div>
  )
}

// ---------------------------------------------------------------- reconcile

export function ReconcilePage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const navigate = useNavigate()
  const a = useCashAccount()
  const [date, setDate] = useState(toDateInput(nowIso()))
  const [ending, setEnding] = useState('')
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)
  if (!can('cash.manage')) return <NoAccess description="Reconciling a bank account needs the cash and bank permission." />
  if (!a) return <NotFound />

  const last = lastReconciliation(state, a.id)
  const base = last ? last.statementBalance : a.opening
  const cutoff = date ? endOfDay(date) : -Infinity
  const candidates = unreconciledJournals(state, a.id)
    .filter((j) => toMs(j.date) <= cutoff)
    .sort((x, y) => x.date.localeCompare(y.date) || x.code.localeCompare(y.code))
  const picked = candidates.filter((j) => ticked.has(j.id))
  const cleared = base + picked.reduce((n, j) => n + movement(j, a.id), 0)
  const statement = Number(ending) || 0
  const difference = statement - cleared
  const allTicked = candidates.length > 0 && picked.length === candidates.length
  const toggle = (id: string) => {
    const next = new Set(ticked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setTicked(next)
  }
  const reconciliation = {
    id: newId('rcn'),
    accountId: a.id,
    statementDate: date ? fromDateInput(date) : '',
    statementBalance: statement,
    journalIds: picked.map((j) => j.id),
    createdBy: user.id,
    createdAt: nowIso(),
  }
  const blocker = !date ? 'Pick the statement date.' : !ending ? 'Enter the statement ending balance.' : blockerFor(state, { type: 'cash/reconcile', reconciliation })
  const finish = () => {
    if (act({ type: 'cash/reconcile', reconciliation }, 'Account reconciled', `${a.name} to ${fmtDate(reconciliation.statementDate)}`)) navigate(paths.cashAccount(a.id))
  }
  const history = state.reconciliations.filter((r) => r.accountId === a.id).sort((x, y) => y.statementDate.localeCompare(x.statementDate))

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.cashAccount(a.id)} />
      <PageHeader className="mb-0" eyebrow={<span className="font-mono">{a.code}</span>} title={`Reconcile ${a.name}`} description="Tick the journals the bank statement shows. The cleared balance must match the statement." />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Statement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Statement date" required>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </FormField>
              <FormField label="Ending balance" required hint={ending ? fmtIdr(statement) : 'Digits only'}>
                <Input inputMode="numeric" value={ending} onChange={(e) => setEnding(digits(e.target.value))} placeholder="2400000000" />
              </FormField>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-muted">
                {picked.length} of {candidates.length} ticked
              </span>
              {candidates.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setTicked(allTicked ? new Set() : new Set(candidates.map((j) => j.id)))}>
                  {allTicked ? 'Untick all' : 'Tick all'}
                </Button>
              )}
            </div>
            {candidates.length === 0 ? (
              <EmptyState compact title="Nothing to reconcile" description="Every posted journal up to this date is already reconciled." />
            ) : (
              <ul className="divide-y divide-border">
                {candidates.map((j) => (
                  <li key={j.id} className="flex items-center gap-3 py-2.5">
                    <Checkbox checked={ticked.has(j.id)} onCheckedChange={() => toggle(j.id)} label={`Cleared ${j.code}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <CodeLink to={paths.journal(j.id)} code={j.code} />
                        <span className="text-xs text-muted">{fmtDate(j.date)}</span>
                      </div>
                      <div className="truncate text-sm">{j.memo}</div>
                    </div>
                    <Money value={movement(j, a.id)} className="text-sm font-semibold" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card variant="ink" className="p-5">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
              <dt className="text-on-ink-muted">{last ? `Reconciled to ${fmtDate(last.statementDate)}` : 'Opening balance'}</dt>
              <dd className="text-right"><Money value={base} /></dd>
              <dt className="text-on-ink-muted">Ticked movements</dt>
              <dd className="text-right"><Money value={cleared - base} /></dd>
              <dt className="font-semibold">Cleared balance</dt>
              <dd className="text-right font-semibold"><Money value={cleared} /></dd>
              <dt className="text-on-ink-muted">Statement balance</dt>
              <dd className="text-right"><Money value={statement} /></dd>
            </dl>
            <div className="mt-4 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">Difference</div>
              <Money value={difference} className={cn('text-2xl font-bold tracking-tight', difference === 0 ? 'text-success' : 'text-accent')} />
            </div>
          </Card>
          <div className="flex flex-wrap gap-2">
            <Button className="flex-1" disabled={!!blocker || difference !== 0} title={blocker ?? (difference !== 0 ? `The cleared balance is ${fmtIdr(Math.abs(difference))} away from the statement.` : undefined)} onClick={finish}>
              <CircleCheck />
              Finish
            </Button>
            {!blocker && difference !== 0 && (
              <Button variant="outline" className="flex-1" onClick={() => setConfirming(true)}>
                Finish with difference
              </Button>
            )}
          </div>
          {blocker && ending && <p className="text-sm text-muted">{blocker}</p>}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Past reconciliations</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState compact title="No reconciliations yet" description="Finished reconciliations of this account show here." />
          ) : (
            <ul className="divide-y divide-border">
              {history.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="font-semibold">{fmtDate(r.statementDate)}</span>
                  <span className="text-muted">{r.journalIds.length} journals</span>
                  <Money value={r.statementBalance} className="font-semibold" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirming} onOpenChange={setConfirming} title="Finish with a difference?" description={`The cleared balance is ${fmtIdr(Math.abs(difference))} ${difference > 0 ? 'below' : 'above'} the statement. Finish only if you will book the difference with a journal.`}>
        <Banner tone="warning" title={`Difference ${fmtIdr(difference)}`}>
          Check bank charges, interest and transfers in transit first.
        </Banner>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setConfirming(false)
              finish()
            }}
          >
            Finish with {fmtIdr(Math.abs(difference))} difference
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}
