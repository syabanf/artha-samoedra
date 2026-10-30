import { accountBalance, blockerFor, countBy, debitNormal, fmtDate, fmtIdr, fmtIdrShort, generalLedger, newId, nowIso, toDateInput, type LedgerRow } from '@artha/fixtures'
import {
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
  NativeSelect,
  PageHeader,
  Sheet,
  Switch,
  cn,
  type Column,
} from '@artha/ui'
import { CASH_FLOW_GROUP_LABEL, GL_ACCOUNT_TYPE_LABEL, type CashFlowGroup, type GlAccount, type GlAccountType } from '@artha/types'
import { Download, FileUp, Pencil, Plus, Scale, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { downloadCsv, parseCsvLine } from '../../lib/csv'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from './parts'

const TYPES = Object.keys(GL_ACCOUNT_TYPE_LABEL) as GlAccountType[]
const FLOWS = Object.keys(CASH_FLOW_GROUP_LABEL) as CashFlowGroup[]

// ---------------------------------------------------------------- chart of accounts

export function GlAccountsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<GlAccount | 'new' | null>(null)
  const [removing, setRemoving] = useState<GlAccount | null>(null)
  const [importing, setImporting] = useState(false)
  const [opening, setOpening] = useState(false)
  const q = params.get('q') ?? ''
  const type = (params.get('type') as GlAccountType | null) || null
  const inactive = params.get('inactive') === '1'
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const manage = can('ledger.manage')

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = state.glAccounts.filter((a) => (inactive || a.active) && terms.every((t) => `${a.code} ${a.name} ${a.bank}`.toLowerCase().includes(t)))
  const typeCounts = countBy(searched, (a) => a.type)
  const rows = searched.filter((a) => !type || a.type === type).sort((a, b) => a.code.localeCompare(b.code))
  const filters = [q, type, inactive].filter(Boolean).length
  const inactiveCount = state.glAccounts.filter((a) => !a.active).length

  const columns: Column<GlAccount>[] = [
    {
      id: 'code',
      header: 'Account',
      sortValue: (a) => a.code,
      cell: (a) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{a.code}</div>
          <div className="truncate text-sm font-medium">{a.name}</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {a.isCash && <Badge variant="info">{a.bank ? 'Bank' : 'Cash'}</Badge>}
            {a.system && <Badge variant="outline">Control</Badge>}
            {!a.active && <Badge variant="muted">Inactive</Badge>}
          </div>
        </div>
      ),
    },
    { id: 'flow', header: 'Cash flow', hideBelow: 'lg', cell: (a) => <span className="text-xs text-muted">{CASH_FLOW_GROUP_LABEL[a.cashFlow]}</span> },
    { id: 'opening', header: 'Opening', align: 'right', hideBelow: 'md', sortValue: (a) => a.opening, cell: (a) => <Money value={a.opening} dash className="text-sm text-muted" /> },
    { id: 'balance', header: 'Balance', align: 'right', sortValue: (a) => accountBalance(state, a.id), cell: (a) => <Money value={accountBalance(state, a.id)} dash className="font-semibold" /> },
    ...(manage
      ? [
          {
            id: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right' as const,
            cell: (a: GlAccount) => {
              const blocker = blockerFor(state, { type: 'gl/remove', id: a.id })
              return (
                <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.name}`} onClick={() => setEditing(a)}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${a.name}`} disabled={!!blocker} title={blocker ?? undefined} onClick={() => setRemoving(a)}>
                    <Trash2 />
                  </Button>
                </div>
              )
            },
          },
        ]
      : []),
  ]
  const groups = TYPES.filter((t) => !type || t === type).map((t) => ({ type: t, rows: rows.filter((a) => a.type === t) }))

  return (
    <div>
      <PageHeader
        title="Chart of accounts"
        description="Every ledger account by type, with the opening balance and where it stands today."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search accounts"
              placeholder="Code, name or bank"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-60 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {manage && (
              <>
                <Button variant="outline" onClick={() => setImporting(true)}>
                  <FileUp />
                  Import CSV
                </Button>
                <Button variant="outline" onClick={() => setOpening(true)}>
                  <Scale />
                  Opening balances
                </Button>
                <Button onClick={() => setEditing('new')}>
                  <Plus />
                  New account
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!type} count={searched.length} onClick={() => set('type', null)}>
            All
          </Chip>
          {TYPES.map((t) => (
            <Chip key={t} active={type === t} count={typeCounts[t] ?? 0} onClick={() => set('type', type === t ? null : t)}>
              {GL_ACCOUNT_TYPE_LABEL[t]}
            </Chip>
          ))}
        </ChipRow>
        <label className="flex items-center gap-2 text-sm text-muted">
          <Switch checked={inactive} onCheckedChange={(v) => set('inactive', v ? '1' : null)} label="Show inactive accounts" />
          Inactive ({inactiveCount})
        </label>
      </div>
      {filters > 0 && (
        <div className="mt-2 text-xs text-muted tabular-nums">
          {rows.length} of {state.glAccounts.length}
          <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
            Clear {filters} {filters === 1 ? 'filter' : 'filters'}
          </Button>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {rows.length === 0 && (
          <Card>
            <EmptyState
              compact
              title="No matching accounts"
              description="Change the search or clear the filters."
              action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
            />
          </Card>
        )}
        {groups
          .filter((g) => g.rows.length)
          .map((g) => (
            <section key={g.type} aria-label={GL_ACCOUNT_TYPE_LABEL[g.type]}>
              <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
                <h2 className="text-base font-semibold">{GL_ACCOUNT_TYPE_LABEL[g.type]}</h2>
                <Money value={g.rows.reduce((n, a) => n + accountBalance(state, a.id), 0)} className="text-sm font-semibold text-muted" />
              </div>
              <DataTable
                rows={g.rows}
                columns={columns}
                getRowKey={(a) => a.id}
                rowLabel={(a) => `${a.code} ${a.name}`}
                onRowClick={(a) => navigate(paths.glAccount(a.id))}
                pageSize={50}
                resetPageKey={`${q}|${type}|${inactive}`}
                rowClassName={(a) => (a.active ? undefined : 'text-muted')}
              />
            </section>
          ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} title={editing === 'new' ? 'New account' : `Edit ${editing ? editing.code : ''}`} size="lg">
        {editing && <AccountForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)} title={`Delete ${removing?.code ?? ''}?`} description={removing ? `${removing.name} leaves the chart of accounts. Nothing posts to it yet.` : undefined}>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (removing && act({ type: 'gl/remove', id: removing.id }, 'Account deleted', `${removing.code} · ${removing.name}`)) setRemoving(null)
            }}
          >
            Delete account
          </Button>
        </DialogFooter>
      </Dialog>
      <Dialog open={importing} onOpenChange={setImporting} size="xl" title="Import accounts from CSV" description="Columns: code, name, type, opening. Rows whose code exists update that account; the rest are added.">
        {importing && <ImportForm onDone={() => setImporting(false)} />}
      </Dialog>
      <Sheet open={opening} onOpenChange={setOpening} title="Opening balances" description="Balances on the first day of the first fiscal year, in each account's normal direction.">
        {opening && <OpeningForm onDone={() => setOpening(false)} />}
      </Sheet>
    </div>
  )
}

function AccountForm({ editing, onDone }: { editing: GlAccount | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState<GlAccount>(
    editing ?? { id: newId('gl'), code: '', name: '', type: 'expense', isCash: false, bank: '', cashFlow: 'operating', opening: 0, active: true, system: false },
  )
  const account = { ...f, code: f.code.trim(), name: f.name.trim(), bank: f.isCash ? f.bank.trim() : '' }
  const blocker = blockerFor(state, { type: 'gl/upsert', account })
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act({ type: 'gl/upsert', account }, editing ? 'Account updated' : 'Account added', `${account.code} · ${account.name}`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Code" required hint="The type digit, a dash and four digits, such as 5-2600">
          <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} inputClassName="font-mono" placeholder="5-2600" />
        </FormField>
        <FormField label="Type" required hint={f.system ? 'Control accounts keep their type' : undefined}>
          <NativeSelect value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as GlAccountType, isCash: e.target.value === 'asset' && f.isCash })} disabled={f.system}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {GL_ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Name" required className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="For example, Office supplies" />
        </FormField>
        <FormField label="Cash flow group" hint="Where cash moving against this account shows on the cash flow statement">
          <NativeSelect value={f.cashFlow} onChange={(e) => setF({ ...f, cashFlow: e.target.value as CashFlowGroup })}>
            {FLOWS.map((g) => (
              <option key={g} value={g}>
                {CASH_FLOW_GROUP_LABEL[g]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <div className="flex flex-col justify-center gap-3">
          {f.type === 'asset' && (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={f.isCash} onCheckedChange={(isCash) => setF({ ...f, isCash })} label="Cash or bank account" />
              Cash or bank account
            </label>
          )}
          {!f.system && (
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={f.active} onCheckedChange={(active) => setF({ ...f, active })} label="Active" />
              Active
            </label>
          )}
        </div>
        {f.isCash && (
          <FormField label="Bank details" hint="Bank name and account number; leave empty for cash on hand" className="sm:col-span-2">
            <Input value={f.bank} onChange={(e) => setF({ ...f, bank: e.target.value })} placeholder="BCA 0291 8877 01" />
          </FormField>
        )}
      </div>
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save account' : 'Add account'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- import

const TEMPLATE: (string | number)[][] = [
  ['code', 'name', 'type', 'opening'],
  ['1-1700', 'Office deposits', 'asset', 25000000],
  ['5-2600', 'Office supplies', 'expense', 0],
]

/** Splits one CSV line, honouring quoted cells. */
function parseAccounts(text: string, existing: GlAccount[]): { accounts: GlAccount[]; problem: string | null } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines[0]?.toLowerCase().startsWith('code')) lines.shift()
  const accounts: GlAccount[] = []
  for (const line of lines) {
    const [code = '', name = '', rawType = '', rawOpening = ''] = parseCsvLine(line)
    const type = rawType.toLowerCase() as GlAccountType
    if (!TYPES.includes(type)) return { accounts, problem: `Row ${code || '(no code)'}: the type must be one of ${TYPES.join(', ')}.` }
    const old = existing.find((a) => a.code === code)
    const opening = Number(rawOpening.replace(/[^\d-]/g, '')) || 0
    accounts.push(old ? { ...old, name, type, opening } : { id: newId('gl'), code, name, type, isCash: false, bank: '', cashFlow: 'operating', opening, active: true, system: false })
  }
  return { accounts, problem: null }
}

function ImportForm({ onDone }: { onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState('')
  const { accounts, problem } = parseAccounts(text, state.glAccounts)
  const blocker = text.trim() ? (problem ?? blockerFor(state, { type: 'gl/import', accounts })) : 'Choose a CSV file first.'
  const added = accounts.filter((a) => !state.glAccounts.some((x) => x.id === a.id)).length
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink hover:bg-ink-3">
          <FileUp className="size-4" />
          Choose file
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              setFileName(file.name)
              setText(await file.text())
            }}
          />
        </label>
        <Button variant="outline" onClick={() => downloadCsv('chart-of-accounts-template', TEMPLATE)}>
          <Download />
          Download template
        </Button>
        {fileName && <span className="min-w-0 truncate text-sm text-muted">{fileName}</span>}
      </div>
      {accounts.length > 0 && (
        <div className="max-h-80 overflow-y-auto rounded-2xl bg-surface-2 p-2">
          <ul className="divide-y divide-border text-sm">
            {accounts.map((a) => {
              const isNew = !state.glAccounts.some((x) => x.id === a.id)
              return (
                <li key={a.id} className="grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 px-2 py-2 sm:grid-cols-[5rem_minmax(0,1fr)_6rem_9rem_5rem]">
                  <span className="font-mono text-xs font-semibold">{a.code}</span>
                  <span className="truncate">{a.name || '–'}</span>
                  <span className="hidden text-xs text-muted sm:block">{GL_ACCOUNT_TYPE_LABEL[a.type]}</span>
                  <Money value={a.opening} dash className="hidden text-right sm:block" />
                  <Badge variant={isNew ? 'success' : 'outline'}>{isNew ? 'New' : 'Update'}</Badge>
                </li>
              )
            })}
          </ul>
        </div>
      )}
      {text.trim() && (
        <p className={cn('text-sm', blocker ? 'text-danger' : 'text-muted')}>
          {blocker ?? `${accounts.length} rows: ${added} new, ${accounts.length - added} updated.`}
        </p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={!!blocker}
          title={blocker ?? undefined}
          onClick={() => {
            if (act({ type: 'gl/import', accounts }, 'Accounts imported', `${added} new, ${accounts.length - added} updated`)) onDone()
          }}
        >
          Import {accounts.length || ''} {accounts.length === 1 ? 'row' : 'rows'}
        </Button>
      </DialogFooter>
    </div>
  )
}

// ---------------------------------------------------------------- opening balances

function OpeningForm({ onDone }: { onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const sorted = [...state.glAccounts].sort((a, b) => a.code.localeCompare(b.code))
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(sorted.map((a) => [a.id, a.opening ? String(a.opening) : ''])))
  const balances = Object.fromEntries(sorted.map((a) => [a.id, Number(values[a.id]) || 0]))
  const debits = sorted.filter((a) => debitNormal(a.type)).reduce((n, a) => n + balances[a.id], 0)
  const credits = sorted.filter((a) => !debitNormal(a.type)).reduce((n, a) => n + balances[a.id], 0)
  const blocker = blockerFor(state, { type: 'gl/setOpening', balances })
  return (
    <div className="space-y-4 p-4">
      {TYPES.map((t) => (
        <section key={t}>
          <h3 className="mb-2 text-sm font-semibold">{GL_ACCOUNT_TYPE_LABEL[t]}</h3>
          <ul className="space-y-2">
            {sorted
              .filter((a) => a.type === t)
              .map((a) => (
                <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_9rem] items-center gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{a.name}</div>
                    <div className="font-mono text-xs text-muted">{a.code}</div>
                  </div>
                  <div className="min-w-0">
                    <Input
                      aria-label={`Opening balance for ${a.code}`}
                      inputMode="numeric"
                      value={values[a.id] ?? ''}
                      onChange={(e) => setValues({ ...values, [a.id]: e.target.value.replace(/(?!^-)[^\d]/g, '') })}
                      inputClassName="text-right tabular-nums"
                      placeholder="0"
                    />
                    {values[a.id] && values[a.id] !== '-' && <div className="mt-0.5 truncate text-right text-xs text-muted tabular-nums">{fmtIdr(balances[a.id])}</div>}
                  </div>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <div className="sticky bottom-0 space-y-2 rounded-2xl bg-card p-3 shadow-card">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Assets and expenses</dt>
          <dd className="text-right"><Money value={debits} /></dd>
          <dt className="text-muted">Liabilities, equity and revenue</dt>
          <dd className="text-right"><Money value={credits} /></dd>
          <dt className="font-semibold">Difference</dt>
          <dd className={cn('text-right font-semibold tabular-nums', debits === credits ? 'text-success' : 'text-danger')}>{fmtIdr(Math.abs(debits - credits))}</dd>
        </dl>
        {blocker && <p className="text-xs text-danger">{blocker}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onDone}>
            Cancel
          </Button>
          <Button
            disabled={!!blocker}
            title={blocker ?? undefined}
            onClick={() => {
              if (act({ type: 'gl/setOpening', balances }, 'Opening balances saved', `${fmtIdr(debits)} on each side`)) onDone()
            }}
          >
            Save balances
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- account ledger

const endOfDay = (value: string) => new Date(`${value}T23:59:59`).toISOString()
const startOfDay = (value: string) => new Date(`${value}T00:00:00`).toISOString()

export function GlAccountDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const year = new Date(now).getFullYear()
  const from = params.get('from') || `${year}-01-01`
  const to = params.get('to') || toDateInput(nowIso())
  const q = params.get('q') ?? ''
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const a = state.glAccounts.find((x) => x.id === id)
  if (!a) {
    return (
      <Card>
        <EmptyState title="Account not found" description="This account may have been deleted." action={<BackButton fallback={paths.glAccounts} />} />
      </Card>
    )
  }
  const ledger = generalLedger(state, a.id, startOfDay(from), endOfDay(to))
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = ledger.rows.filter((r) => terms.every((t) => `${r.journal.code} ${r.memo}`.toLowerCase().includes(t)))
  const debit = ledger.rows.reduce((n, r) => n + r.debit, 0)
  const credit = ledger.rows.reduce((n, r) => n + r.credit, 0)
  const filters = [params.get('from'), params.get('to'), q].filter(Boolean).length

  const columns: Column<LedgerRow>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: (r) => (
        <div className="min-w-0">
          <div className="text-xs text-muted">{fmtDate(r.journal.date)}</div>
          <div className="font-mono text-xs font-semibold">{r.journal.code}</div>
          <div className="truncate text-sm md:hidden">{r.memo}</div>
        </div>
      ),
    },
    { id: 'memo', header: 'Memo', hideBelow: 'md', cell: (r) => <span className="line-clamp-2 text-sm">{r.memo}</span> },
    { id: 'debit', header: 'Debit', align: 'right', hideBelow: 'sm', cell: (r) => <Money value={r.debit} dash /> },
    { id: 'credit', header: 'Credit', align: 'right', hideBelow: 'sm', cell: (r) => <Money value={r.credit} dash /> },
    {
      id: 'balance',
      header: 'Balance',
      align: 'right',
      cell: (r) => (
        <div>
          <Money value={r.balance} className="font-semibold" />
          <div className="text-xs text-muted sm:hidden">{r.debit ? `Dr ${fmtIdrShort(r.debit)}` : `Cr ${fmtIdrShort(r.credit)}`}</div>
        </div>
      ),
    },
  ]

  const exportCsv = () =>
    downloadCsv(`ledger-${a.code}-${from}-to-${to}`, [
      ['date', 'journal', 'memo', 'debit', 'credit', 'balance'],
      [from, '', 'Opening balance', '', '', ledger.opening],
      ...ledger.rows.map((r) => [toDateInput(r.journal.date), r.journal.code, r.memo, r.debit, r.credit, r.balance]),
      [to, '', 'Closing balance', debit, credit, ledger.closing],
    ])

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.glAccounts} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{a.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">{a.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{GL_ACCOUNT_TYPE_LABEL[a.type]}</Badge>
            {a.isCash && <Badge variant="info">{a.bank || 'Cash'}</Badge>}
            {a.system && <Badge variant="outline">Control account</Badge>}
            {!a.active && <Badge variant="muted">Inactive</Badge>}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {a.isCash && (
            <Button variant="outline" onClick={() => navigate(paths.cashAccount(a.id))}>
              Cash and bank view
            </Button>
          )}
          <Button variant="outline" onClick={exportCsv}>
            <Download />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="text-xs text-on-ink-muted">Closing balance on {fmtDate(endOfDay(to))}</div>
          <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{fmtIdrShort(ledger.closing)}</div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            {[
              ['Opening', fmtIdrShort(ledger.opening)],
              ['Debits', fmtIdrShort(debit)],
              ['Credits', fmtIdrShort(credit)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-2xl bg-white/10 px-3 py-2">
                <div className="text-xs text-on-ink-muted">{label}</div>
                <div className="truncate font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="From">
              <Input type="date" value={from} max={to} onChange={(e) => set('from', e.target.value || null)} />
            </FormField>
            <FormField label="To">
              <Input type="date" value={to} min={from} onChange={(e) => set('to', e.target.value || null)} />
            </FormField>
          </div>
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search entries"
            placeholder="Journal code or memo"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="mt-3"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
          {filters > 0 && (
            <div className="mt-2 text-xs text-muted tabular-nums">
              {rows.length} of {ledger.rows.length} entries
              <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
                Reset to this year
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ledger</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <LedgerEdge label={`Opening balance, ${fmtDate(startOfDay(from))}`} value={ledger.opening} />
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(r) => `${r.journal.id}-${r.debit}-${r.credit}-${r.balance}`}
            rowLabel={(r) => r.journal.code}
            onRowClick={(r) => navigate(paths.journal(r.journal.id))}
            pageSize={25}
            resetPageKey={`${from}|${to}|${q}`}
            empty={
              q ? (
                <EmptyState compact title="No matching entries" description="Change the search." action={<Button variant="outline" size="sm" onClick={() => set('q', null)}>Clear search</Button>} />
              ) : (
                <EmptyState compact title="No posted entries in this range" description="Widen the dates, or post a journal to this account." />
              )
            }
          />
          <LedgerEdge label={`Closing balance, ${fmtDate(endOfDay(to))}`} value={ledger.closing} />
        </CardContent>
      </Card>
    </div>
  )
}

const LedgerEdge = ({ label, value }: { label: string; value: number }) => (
  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm">
    <span className="font-semibold">{label}</span>
    <Money value={value} className="font-semibold" />
  </div>
)
