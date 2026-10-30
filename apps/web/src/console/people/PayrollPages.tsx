import {
  blockerFor,
  calcPayslip,
  currentEmployees,
  fmtDate,
  fmtDateTime,
  fmtIdr,
  fmtIdrShort,
  journalFor,
  monthLabel,
  newId,
  payrollTotals,
  ymd,
  type AppState,
} from '@artha/fixtures'
import { PAYROLL_STATUS_LABEL, type Employee, type PayComponent, type PayLine, type PayrollRun, type PayrollSettings, type PayrollStatus, type Payslip } from '@artha/types'
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
  StatCard,
  Switch,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { Banknote, Calculator, CircleCheck, Download, FileText, Landmark, Pencil, Plus, Printer, Users, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { LetterBlock, LetterHead, LetterRow, Signature } from '../../components/Letter'
import { CodeLink, paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { SubTabs } from '../../components/SubTabs'
import { downloadCsv } from '../../lib/csv'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'
import { Money } from '../finance/parts'
import { PersonCell } from './parts'
import { useSetParam } from '../../lib/useSetParam'
import { SearchBox } from '../../components/SearchBox'

const TABS = [
  { to: paths.payroll, label: 'Runs' },
  { to: paths.paySettings, label: 'Salary settings' },
]

const STATUSES: PayrollStatus[] = ['draft', 'approved', 'paid']
const STATUS_VARIANT: Record<PayrollStatus, BadgeVariant> = { draft: 'warning', approved: 'info', paid: 'success' }
const PayrollBadge = ({ status }: { status: PayrollStatus }) => <Badge variant={STATUS_VARIANT[status]}>{PAYROLL_STATUS_LABEL[status]}</Badge>

const NO_ACCESS = 'Payroll needs the payroll management permission.'

const monthOfMs = (ms: number) => ymd(ms).slice(0, 7)
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })
const sumLines = (lines: PayLine[]) => lines.reduce((n, l) => n + l.amount, 0)
const departmentOf = (s: AppState, e: Employee | undefined) => s.departments.find((d) => d.id === e?.departmentId)?.name ?? '–'

function FilterCount({ shown, total, filters, onClear }: { shown: number; total: number; filters: number; onClear: () => void }) {
  if (!filters) return null
  return (
    <span className="text-xs text-muted tabular-nums">
      {shown} of {total}
      <Button variant="ghost" size="sm" className="ml-1" onClick={onClear}>
        Clear {filters} {filters === 1 ? 'filter' : 'filters'}
      </Button>
    </span>
  )
}

const DepartmentSelect = ({ value, onChange }: { value: string; onChange: (v: string | null) => void }) => {
  const { state } = useAppState()
  return (
    <NativeSelect aria-label="Filter by department" value={value} onChange={(e) => onChange(e.target.value || null)} className="min-w-0 flex-1 sm:w-56 sm:flex-none">
      <option value="">All departments</option>
      {state.departments.map((d) => (
        <option key={d.id} value={d.id}>
          {d.name}
        </option>
      ))}
    </NativeSelect>
  )
}

// ---------------------------------------------------------------- runs

export function PayrollPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const now = useNow()
  const { params, set, clear } = useSetParam()
  const [month, setMonth] = useState(() => monthOfMs(now))
  const [opening, setOpening] = useState<string | null>(null)

  // The store assigns the run id, so open the run once it shows up in state.
  const opened = opening ? state.payrollRuns.find((r) => r.month === opening) : undefined
  useEffect(() => {
    if (opened) navigate(paths.payrollRun(opened.id))
  }, [opened, navigate])

  if (!can('payroll.manage')) return <NoAccess description={NO_ACCESS} />

  const q = params.get('q') ?? ''
  const status = (params.get('status') as PayrollStatus | null) || null
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const runs = [...state.payrollRuns].sort((a, b) => b.month.localeCompare(a.month))
  const searched = runs.filter((r) => terms.every((w) => `${r.code} ${monthLabel(r.month)}`.toLowerCase().includes(w)))
  const rows = searched.filter((r) => !status || r.status === status)
  const filters = [q, status].filter(Boolean).length

  const calculate = { type: 'payroll/calculate', month } as const
  const calcBlocker = month ? blockerFor(state, calculate) : 'Pick a month.'
  const latestPaid = runs.find((r) => r.status === 'paid')
  const latestPaidTotals = latestPaid && payrollTotals(latestPaid.slips)
  const waiting = runs.filter((r) => r.status !== 'paid')
  const trend = runs.slice(0, 12).reverse().map((r) => ({ run: r, net: payrollTotals(r.slips).net }))
  const peak = Math.max(1, ...trend.map((t) => t.net))

  const columns: Column<PayrollRun>[] = [
    {
      id: 'month',
      header: 'Month',
      sortValue: (r) => r.month,
      cell: (r) => (
        <div className="min-w-0">
          <div className="font-mono text-xs text-muted">{r.code}</div>
          <div className="truncate font-semibold">{monthLabel(r.month)}</div>
        </div>
      ),
    },
    { id: 'people', header: 'Headcount', align: 'right', hideBelow: 'md', sortValue: (r) => r.slips.length, cell: (r) => <span className="tabular-nums">{r.slips.length}</span> },
    { id: 'gross', header: 'Gross', align: 'right', hideBelow: 'lg', sortValue: (r) => payrollTotals(r.slips).gross, cell: (r) => <Money value={payrollTotals(r.slips).gross} /> },
    { id: 'net', header: 'Net', align: 'right', sortValue: (r) => payrollTotals(r.slips).net, cell: (r) => <Money value={payrollTotals(r.slips).net} className="font-semibold" /> },
    { id: 'cost', header: 'Employer cost', align: 'right', hideBelow: 'lg', sortValue: (r) => payrollTotals(r.slips).cost, cell: (r) => <Money value={payrollTotals(r.slips).cost} /> },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (r) => STATUSES.indexOf(r.status), cell: (r) => <PayrollBadge status={r.status} /> },
  ]

  return (
    <div>
      <PageHeader
        title="Payroll"
        description="Monthly runs: calculate, approve, then pay. Paying posts the salary journal in Finance."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input type="month" aria-label="Payroll month" value={month} max={monthOfMs(now)} onChange={(e) => setMonth(e.target.value)} className="min-w-0 flex-1 sm:w-44 sm:flex-none" />
            <Button
              disabled={!!calcBlocker}
              title={calcBlocker ?? undefined}
              onClick={() => {
                if (act(calculate, 'Payroll calculated', monthLabel(month))) setOpening(month)
              }}
            >
              <Calculator />
              Calculate payroll
            </Button>
          </>
        }
      />
      <SubTabs items={TABS} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Last net pay" value={latestPaidTotals ? fmtIdrShort(latestPaidTotals.net).replace('Rp ', '') : '–'} unit={latestPaidTotals ? 'Rp' : undefined} icon={<Wallet />} tone="ink" hint={latestPaid ? monthLabel(latestPaid.month) : 'No paid run yet'} />
        <StatCard label="Last employer cost" value={latestPaidTotals ? fmtIdrShort(latestPaidTotals.cost).replace('Rp ', '') : '–'} unit={latestPaidTotals ? 'Rp' : undefined} icon={<Landmark />} hint="Gross plus company BPJS" />
        <StatCard label="Headcount" value={latestPaid?.slips.length ?? 0} icon={<Users />} hint="On the last paid run" />
        <StatCard
          label="Waiting"
          value={waiting.length}
          icon={<CircleCheck />}
          tone={waiting.length ? 'warning' : 'success'}
          hint={waiting.length ? 'Draft or approved, not yet paid' : 'Every run is paid'}
          onClick={waiting.length ? () => navigate(paths.payrollRun(waiting[waiting.length - 1].id)) : undefined}
        />
      </div>

      {trend.length > 0 && (
        <Card className="mt-4 min-w-0">
          <CardHeader>
            <CardTitle>Net pay per month</CardTitle>
            <p className="text-sm text-muted">Every run, draft ones included. The latest month is in red.</p>
          </CardHeader>
          <CardContent>
            <ol className="flex h-40 items-end gap-1 sm:gap-2" aria-label="Net pay per month">
              {trend.map(({ run, net }, i) => {
                const tip = `${monthLabel(run.month)}: ${fmtIdr(net)}, ${PAYROLL_STATUS_LABEL[run.status].toLowerCase()}`
                return (
                  <li key={run.id} className="flex h-full min-w-0 flex-1 items-end justify-center" title={tip}>
                    <span className="sr-only">{tip}</span>
                    <span className={`w-full max-w-10 rounded-t-md ${i === trend.length - 1 ? 'bg-accent' : 'bg-chart-muted'}`} style={{ height: `${Math.max(2, (net / peak) * 100)}%` }} />
                  </li>
                )
              })}
            </ol>
            <div className="mt-2 flex gap-1 text-[11px] text-muted sm:gap-2" aria-hidden>
              {trend.map(({ run }) => (
                <span key={run.id} className="min-w-0 flex-1 truncate text-center">
                  {shortMonth(run.month)}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={(v) => set('q', v)} label="Search runs" placeholder="Code or month" />
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={searched.filter((r) => r.status === s).length} onClick={() => set('status', status === s ? null : s)}>
              {PAYROLL_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <FilterCount shown={rows.length} total={runs.length} filters={filters} onClear={clear} />
      </div>
      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(r) => r.id}
          rowLabel={(r) => `${r.code} ${monthLabel(r.month)}`}
          onRowClick={(r) => navigate(paths.payrollRun(r.id))}
          initialSort={{ id: 'month', desc: true }}
          resetPageKey={`${q}|${status}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching runs" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No payroll yet" description="Pick a month and calculate the first run." />
            )
          }
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- run detail

export function PayrollRunPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const { params, set, clear } = useSetParam()
  const [paying, setPaying] = useState(false)

  if (!can('payroll.manage')) return <NoAccess description={NO_ACCESS} action={<BackButton fallback={paths.payroll} />} />
  const run = state.payrollRuns.find((r) => r.id === id)
  if (!run) {
    return (
      <Card>
        <EmptyState title="Payroll run not found" description="This run may have been removed." action={<BackButton fallback={paths.payroll} />} />
      </Card>
    )
  }

  const totals = payrollTotals(run.slips)
  const journal = journalFor(state, 'payroll', run.id)
  const approver = state.users.find((u) => u.id === run.approvedBy)?.name
  const employee = (p: Payslip) => state.employees.find((e) => e.id === p.employeeId)
  const recalc = { type: 'payroll/calculate', month: run.month } as const
  const recalcBlocker = blockerFor(state, recalc)
  const approveBlocker = blockerFor(state, { type: 'payroll/approve', id: run.id })
  const payBlocker = blockerFor(state, { type: 'payroll/pay', id: run.id })
  const period = monthLabel(run.month)

  const q = params.get('q') ?? ''
  const dept = params.get('dept') ?? ''
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = run.slips.filter((p) => {
    const e = employee(p)
    return (!dept || e?.departmentId === dept) && terms.every((w) => `${e?.name ?? ''} ${e?.code ?? ''}`.toLowerCase().includes(w))
  })
  const filters = [q, dept].filter(Boolean).length

  const exportSlips = () =>
    downloadCsv(`payroll-${run.month}`, [
      ['Code', 'Name', 'Department', 'Base', 'Earnings', 'Overtime hours', 'Deductions', 'Gross', 'BPJS employee', 'BPJS company', 'PPh 21', 'Net'],
      ...run.slips.map((p) => {
        const e = employee(p)
        return [e?.code ?? '', e?.name ?? '', departmentOf(state, e), p.base, sumLines(p.earnings), p.overtimeHours, sumLines(p.deductions), p.gross, p.bpjsEmployee, p.bpjsCompany, p.tax, p.net]
      }),
    ])
  const exportBank = () =>
    downloadCsv(`payroll-${run.month}-bank-transfer`, [
      ['Name', 'Bank account', 'Net'],
      ...run.slips.map((p) => {
        const e = employee(p)
        return [e?.name ?? '', e?.bankAccount ?? '', p.net]
      }),
    ])

  const columns: Column<Payslip>[] = [
    { id: 'person', header: 'Employee', sortValue: (p) => employee(p)?.name ?? '', cell: (p) => <PersonCell id={p.employeeId} sub={departmentOf(state, employee(p))} link={false} /> },
    { id: 'base', header: 'Base', align: 'right', hideBelow: 'lg', sortValue: (p) => p.base, cell: (p) => <Money value={p.base} /> },
    { id: 'earnings', header: 'Earnings', align: 'right', hideBelow: 'md', sortValue: (p) => sumLines(p.earnings), cell: (p) => <Money value={sumLines(p.earnings)} dash /> },
    { id: 'ot', header: 'OT hours', align: 'right', hideBelow: 'xl', sortValue: (p) => p.overtimeHours, cell: (p) => <span className="tabular-nums">{p.overtimeHours || '–'}</span> },
    { id: 'deductions', header: 'Deductions', align: 'right', hideBelow: 'xl', sortValue: (p) => sumLines(p.deductions), cell: (p) => <Money value={sumLines(p.deductions)} dash /> },
    { id: 'bpjs', header: 'BPJS', align: 'right', hideBelow: 'lg', sortValue: (p) => p.bpjsEmployee, cell: (p) => <Money value={p.bpjsEmployee} /> },
    { id: 'tax', header: 'PPh 21', align: 'right', hideBelow: 'md', sortValue: (p) => p.tax, cell: (p) => <Money value={p.tax} dash /> },
    { id: 'net', header: 'Net', align: 'right', sortValue: (p) => p.net, cell: (p) => <Money value={p.net} className="font-semibold" /> },
  ]

  const figures = [
    { label: 'Gross', value: totals.gross },
    { label: 'PPh 21', value: totals.tax },
    { label: 'BPJS employee', value: totals.bpjsEmployee },
    { label: 'BPJS company', value: totals.bpjsCompany },
    { label: 'Employer cost', value: totals.cost },
  ]

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.payroll} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{run.code}</div>
          <h1 className="truncate text-2xl font-bold tracking-tight">Payroll for {period}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PayrollBadge status={run.status} />
            {journal && <CodeLink to={paths.journal(journal.id)} code={journal.code} />}
          </div>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <Button variant="outline" onClick={exportSlips}>
            <Download />
            Export CSV
          </Button>
          <Button variant="outline" onClick={exportBank}>
            <Banknote />
            Bank transfer CSV
          </Button>
          {run.status === 'draft' && (
            <>
              <Button variant="outline" disabled={!!recalcBlocker} title={recalcBlocker ?? undefined} onClick={() => act(recalc, 'Payroll recalculated', period)}>
                <Calculator />
                Recalculate
              </Button>
              <Button variant="outline" disabled={!!approveBlocker} title={approveBlocker ?? undefined} onClick={() => act({ type: 'payroll/approve', id: run.id }, 'Payroll approved', period)}>
                <CircleCheck />
                Approve
              </Button>
            </>
          )}
          {run.status !== 'paid' && (
            <Button disabled={!!payBlocker} title={payBlocker ?? undefined} onClick={() => setPaying(true)}>
              <Wallet />
              Pay
            </Button>
          )}
        </div>
      </div>

      <Card variant="ink" className="p-6">
        <div className="text-xs text-on-ink-muted">Net pay to {run.slips.length} people</div>
        <Money value={totals.net} className="mt-1 block text-3xl font-bold tracking-tight" />
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3 xl:grid-cols-5">
          {figures.map((f) => (
            <div key={f.label} className="min-w-0 rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-on-ink-muted">{f.label}</div>
              <Money value={f.value} className="font-semibold" />
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm text-on-ink-muted">
          Calculated {fmtDateTime(run.calculatedAt)}
          {approver && ` · approved by ${approver}`}
          {run.paidAt && ` · paid ${fmtDate(run.paidAt)}`}
          {run.status === 'paid' && !journal && ' · no journal found'}
        </p>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payslips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search payslips" placeholder="Name or employee code" />
            <DepartmentSelect value={dept} onChange={(v) => set('dept', v)} />
            <FilterCount shown={rows.length} total={run.slips.length} filters={filters} onClear={clear} />
          </div>
          <div className="mt-2">
            <DataTable
              rows={rows}
              columns={columns}
              getRowKey={(p) => p.employeeId}
              rowLabel={(p) => `Payslip for ${employee(p)?.name ?? 'unknown employee'}`}
              onRowClick={(p) => navigate(paths.payslip(run.id, p.employeeId))}
              initialSort={{ id: 'person', desc: false }}
              resetPageKey={`${q}|${dept}`}
              empty={
                filters ? (
                  <EmptyState compact title="No matching payslips" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
                ) : (
                  <EmptyState compact icon={<FileText />} title="No payslips" description="Nobody was on the books this month." />
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={paying} onOpenChange={setPaying} title={`Pay ${run.code}?`} description={`${fmtIdr(totals.net)} goes to ${run.slips.length} people. Finance gets a salary journal and loan installments are taken.`}>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaying(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (act({ type: 'payroll/pay', id: run.id }, 'Payroll paid', `${run.code} · ${fmtIdr(totals.net)}`)) setPaying(false)
            }}
          >
            Pay payroll
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------- payslip

export function PayslipPage() {
  const { id, employeeId } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const back = id ? paths.payrollRun(id) : paths.payroll

  if (!can('payroll.manage')) return <NoAccess description={NO_ACCESS} action={<BackButton fallback={back} />} />
  const run = state.payrollRuns.find((r) => r.id === id)
  const slip = run?.slips.find((p) => p.employeeId === employeeId)
  const e = state.employees.find((x) => x.id === employeeId)
  if (!run || !slip || !e) {
    return (
      <Card>
        <EmptyState title="Payslip not found" description="This person has no slip on that run." action={<BackButton fallback={back} />} />
      </Card>
    )
  }

  const period = monthLabel(run.month)
  const position = state.positions.find((p) => p.id === e.positionId)?.name ?? '–'
  const earned = slip.base + sumLines(slip.earnings)
  const deducted = sumLines(slip.deductions) + slip.bpjsEmployee + slip.tax
  const approver = state.users.find((u) => u.id === run.approvedBy)?.name ?? ''

  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <BackButton fallback={back} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">
            {run.code} · {e.code}
          </div>
          <h1 className="truncate text-2xl font-bold tracking-tight">Payslip for {e.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <PayrollBadge status={run.status} />
            <span className="text-sm text-muted">{period}</span>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer />
          Print
        </Button>
      </div>

      <Card className="min-w-0 p-6 sm:p-10 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <LetterHead company={state.company} />
        <div className="mt-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-lg font-bold">Payslip</div>
            <div className="font-mono text-xs text-muted">{run.code}</div>
            <div className="mt-1 text-sm text-muted">Period {period}</div>
          </div>
          {run.status !== 'paid' && (
            <div className="-rotate-6 rounded-lg border-2 border-warning px-3 py-1 text-sm font-extrabold uppercase tracking-widest text-warning">{PAYROLL_STATUS_LABEL[run.status]}</div>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
          <LetterBlock title="Employee">
            <div className="font-semibold">{e.name}</div>
            <div>
              {e.code} · {position}
            </div>
            <div>{departmentOf(state, e)}</div>
          </LetterBlock>
          <LetterBlock title="Tax and BPJS">
            <div>NPWP {e.npwp || '–'}</div>
            <div>PTKP {e.ptkp}</div>
            <div>BPJS Ketenagakerjaan {e.bpjsTk || '–'}</div>
            <div>BPJS Kesehatan {e.bpjsKes || '–'}</div>
          </LetterBlock>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 print:grid-cols-2">
          <div className="min-w-0">
            <div className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-wider text-muted">Earnings</div>
            <dl className="divide-y divide-border text-sm">
              <LetterRow label="Base salary" value={fmtIdr(slip.base)} />
              {slip.earnings.map((l) => (
                <LetterRow key={l.label} label={l.label} value={fmtIdr(l.amount)} />
              ))}
              <LetterRow label="Total earnings" value={fmtIdr(earned)} strong />
            </dl>
          </div>
          <div className="min-w-0">
            <div className="border-b border-border pb-2 text-xs font-semibold uppercase tracking-wider text-muted">Deductions</div>
            <dl className="divide-y divide-border text-sm">
              {slip.deductions.map((l) => (
                <LetterRow key={l.label} label={l.label} value={fmtIdr(l.amount)} />
              ))}
              <LetterRow label="BPJS, employee share" value={fmtIdr(slip.bpjsEmployee)} />
              <LetterRow label="PPh 21" value={fmtIdr(slip.tax)} />
              <LetterRow label="Total deductions" value={fmtIdr(deducted)} strong />
            </dl>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink p-4 text-on-ink print:border-2 print:border-ink print:bg-transparent print:text-foreground">
          <span className="font-semibold">Net pay</span>
          <span className="text-2xl font-bold tabular-nums">{fmtIdr(slip.net)}</span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
          <LetterBlock title="Paid by the company">
            <div className="flex justify-between gap-3">
              <span>BPJS, company share</span>
              <span className="tabular-nums">{fmtIdr(slip.bpjsCompany)}</span>
            </div>
            <div className="mt-1 text-xs text-muted">Not deducted from your pay.</div>
          </LetterBlock>
          <LetterBlock title="Details">
            <div>Gross for tax {fmtIdr(slip.gross)}</div>
            {slip.overtimeHours > 0 && <div>Overtime {slip.overtimeHours} hours</div>}
            {slip.unpaidLeaveDays > 0 && <div>Unpaid leave {slip.unpaidLeaveDays} days</div>}
            <div className="break-words">Paid to {e.bankAccount || 'no bank account on file'}</div>
            {run.paidAt && <div>Paid on {fmtDate(run.paidAt)}</div>}
          </LetterBlock>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
          <Signature role={`For ${state.company.name}`} name={approver} />
          <Signature role="Received by" name={e.name} />
        </div>
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- salary settings

export function PaySettingsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const now = useNow()
  const { params, set, clear } = useSetParam()
  const [editing, setEditing] = useState<PayComponent | 'new' | null>(null)

  if (!can('payroll.manage')) return <NoAccess description={NO_ACCESS} />

  const month = monthOfMs(now)
  const components = new Map(state.payComponents.map((c) => [c.id, c]))
  const allowances = (e: Employee) => e.allowances.filter((a) => components.get(a.componentId)?.kind === 'earning').reduce((n, a) => n + a.amount, 0)
  const estimates = new Map(currentEmployees(state).map((e) => [e.id, calcPayslip(state, e, month).net]))
  const estimate = (e: Employee) => estimates.get(e.id) ?? 0

  const q = params.get('q') ?? ''
  const dept = params.get('dept') ?? ''
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const people = currentEmployees(state)
  const rows = people.filter((e) => (!dept || e.departmentId === dept) && terms.every((w) => `${e.name} ${e.code}`.toLowerCase().includes(w)))
  const filters = [q, dept].filter(Boolean).length

  const columns: Column<Employee>[] = [
    { id: 'person', header: 'Employee', sortValue: (e) => e.name, cell: (e) => <PersonCell id={e.id} link={false} /> },
    { id: 'dept', header: 'Department', hideBelow: 'lg', sortValue: (e) => departmentOf(state, e), cell: (e) => <span className="text-sm">{departmentOf(state, e)}</span> },
    { id: 'ptkp', header: 'PTKP', hideBelow: 'xl', sortValue: (e) => e.ptkp, cell: (e) => <span className="font-mono text-xs">{e.ptkp}</span> },
    { id: 'base', header: 'Base', align: 'right', hideBelow: 'sm', sortValue: (e) => e.baseSalary, cell: (e) => <Money value={e.baseSalary} /> },
    { id: 'allowances', header: 'Allowances', align: 'right', hideBelow: 'md', sortValue: allowances, cell: (e) => <Money value={allowances(e)} dash /> },
    { id: 'net', header: 'Est. net', align: 'right', sortValue: estimate, cell: (e) => <Money value={estimate(e)} className="font-semibold" /> },
  ]

  return (
    <div className="space-y-4">
      <div>
        <PageHeader title="Salary settings" description="Pay components, BPJS rates and overtime rules, plus what everyone earns today." />
        <SubTabs items={TABS} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="min-w-0">
          <CardHeader
            action={
              <Button size="sm" onClick={() => setEditing('new')}>
                <Plus />
                New component
              </Button>
            }
          >
            <CardTitle>Pay components</CardTitle>
            <p className="text-sm text-muted">Fixed monthly amounts set per employee on top of the base salary.</p>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {state.payComponents.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{c.name}</div>
                    <div className="font-mono text-xs text-muted">{c.code}</div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    <Badge variant={c.kind === 'earning' ? 'success' : 'warning'}>{c.kind === 'earning' ? 'Earning' : 'Deduction'}</Badge>
                    {c.kind === 'earning' && <Badge variant={c.taxable ? 'outline' : 'muted'}>{c.taxable ? 'Taxable' : 'Tax free'}</Badge>}
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                    <Pencil />
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <SettingsForm />
      </div>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>Salary table</CardTitle>
          <p className="text-sm text-muted">Estimated net for {monthLabel(month)} from today's salary, allowances, approved overtime and loans. Open a row to edit the employee.</p>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <SearchBox value={q} onChange={(v) => set('q', v)} label="Search employees" placeholder="Name or employee code" />
            <DepartmentSelect value={dept} onChange={(v) => set('dept', v)} />
            <FilterCount shown={rows.length} total={people.length} filters={filters} onClear={clear} />
          </div>
          <div className="mt-2">
            <DataTable
              rows={rows}
              columns={columns}
              getRowKey={(e) => e.id}
              rowLabel={(e) => `Edit ${e.name}`}
              onRowClick={(e) => navigate(paths.employeeEdit(e.id))}
              initialSort={{ id: 'person', desc: false }}
              resetPageKey={`${q}|${dept}`}
              empty={
                filters ? (
                  <EmptyState compact title="No matching employees" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={() => clear()}>Clear filters</Button>} />
                ) : (
                  <EmptyState compact title="No employees yet" description="Add employees to see their salaries here." />
                )
              }
            />
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing && editing !== 'new' ? `Edit ${editing.name}` : 'New pay component'} description="Taxable earnings count toward gross pay for PPh 21.">
        {editing && <ComponentForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  )
}

function ComponentForm({ editing, onDone }: { editing: PayComponent | null; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ code: editing?.code ?? '', name: editing?.name ?? '', kind: editing?.kind ?? 'earning', taxable: editing?.taxable ?? true })
  const component: PayComponent = { id: editing?.id ?? newId('pc'), code: f.code.trim().toUpperCase(), name: f.name.trim(), kind: f.kind, taxable: f.kind === 'earning' && f.taxable }
  const action = { type: 'payComponents/upsert', component } as const
  const blocker = blockerFor(state, action)
  const removeBlocker = editing ? blockerFor(state, { type: 'payComponents/remove', id: editing.id }) : null

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, editing ? 'Component saved' : 'Component added', component.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <FormField label="Code" required>
          <Input value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="TRN" inputClassName="font-mono uppercase" />
        </FormField>
        <FormField label="Name" required>
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Transport allowance" />
        </FormField>
        <FormField label="Kind" className="sm:col-span-2">
          <NativeSelect value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PayComponent['kind'] })}>
            <option value="earning">Earning, added to pay</option>
            <option value="deduction">Deduction, taken from pay</option>
          </NativeSelect>
        </FormField>
      </div>
      {f.kind === 'earning' && (
        <label className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3 text-sm">
          <span>
            <span className="block font-semibold">Taxable</span>
            <span className="text-xs text-muted">Counts toward gross pay and BPJS Kesehatan.</span>
          </span>
          <Switch label="Taxable" checked={f.taxable} onCheckedChange={(taxable) => setF({ ...f, taxable })} />
        </label>
      )}
      {tried && blocker && <p className="mt-4 text-sm text-danger">{blocker}</p>}
      <DialogFooter>
        {editing && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-danger"
            disabled={!!removeBlocker}
            title={removeBlocker ?? undefined}
            onClick={() => act({ type: 'payComponents/remove', id: editing.id }, 'Component removed', editing.name) && onDone()}
          >
            Remove
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save component' : 'Add component'}</Button>
      </DialogFooter>
    </form>
  )
}

type SettingKey = keyof PayrollSettings
const SETTING_GROUPS: { title: string; fields: { key: SettingKey; label: string; unit?: '%' | 'Rp' }[] }[] = [
  {
    title: 'BPJS Kesehatan',
    fields: [
      { key: 'bpjsKesEmployeePct', label: 'Employee', unit: '%' },
      { key: 'bpjsKesCompanyPct', label: 'Company', unit: '%' },
      { key: 'bpjsKesCap', label: 'Salary cap', unit: 'Rp' },
    ],
  },
  {
    title: 'BPJS Ketenagakerjaan',
    fields: [
      { key: 'jhtEmployeePct', label: 'JHT employee', unit: '%' },
      { key: 'jhtCompanyPct', label: 'JHT company', unit: '%' },
      { key: 'jpEmployeePct', label: 'JP employee', unit: '%' },
      { key: 'jpCompanyPct', label: 'JP company', unit: '%' },
      { key: 'jpCap', label: 'JP salary cap', unit: 'Rp' },
      { key: 'jkkPct', label: 'JKK company', unit: '%' },
      { key: 'jkmPct', label: 'JKM company', unit: '%' },
    ],
  },
  {
    title: 'Overtime and schedule',
    fields: [
      { key: 'overtimeDivisor', label: 'Overtime divisor' },
      { key: 'workDaysPerMonth', label: 'Work days per month' },
      { key: 'payDay', label: 'Pay day' },
      { key: 'cutoffDay', label: 'Cut-off day' },
    ],
  },
]

function SettingsForm() {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState(() => Object.fromEntries(Object.entries(state.payrollSettings).map(([k, v]) => [k, String(v)])) as Record<SettingKey, string>)
  const patch = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, Number(v)])) as unknown as PayrollSettings
  const empty = Object.values(f).some((v) => v.trim() === '' || Number.isNaN(Number(v)))
  const action = { type: 'payrollSettings/update', patch } as const
  const blocker = empty ? 'Fill in every field with a number.' : blockerFor(state, action)

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>BPJS and overtime</CardTitle>
        <p className="text-sm text-muted">Hourly overtime is base salary over the divisor, times 1.5. New and recalculated runs use these rates.</p>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (blocker) return
            act(action, 'Salary settings saved')
          }}
          className="space-y-5"
        >
          {SETTING_GROUPS.map((g) => (
            <fieldset key={g.title}>
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">{g.title}</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {g.fields.map((x) => (
                  <FormField key={x.key} label={x.unit ? `${x.label} (${x.unit})` : x.label}>
                    <Input inputMode="decimal" value={f[x.key]} onChange={(e) => setF({ ...f, [x.key]: e.target.value.replace(',', '.') })} inputClassName="tabular-nums" />
                  </FormField>
                ))}
              </div>
            </fieldset>
          ))}
          {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
          <div className="flex justify-end">
            <Button type="submit" title={tried ? (blocker ?? undefined) : undefined}>
              Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
