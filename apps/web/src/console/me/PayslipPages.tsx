import { fmtDate, fmtIdr, monthLabel } from '@artha/fixtures'
import type { Employee, PayLine } from '@artha/types'
import { Button, Card, EmptyState, PageHeader, StatCard } from '@artha/ui'
import { ChevronRight, Printer, Wallet } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { BackButton } from '../../components/BackButton'
import { LetterBlock, LetterHead, LetterRow, Signature } from '../../components/Letter'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { WithMe, positionOf } from './shared'

const sumLines = (lines: PayLine[]) => lines.reduce((n, l) => n + l.amount, 0)

/** Paid runs that hold a slip for this employee, newest first. */
const usePaidSlips = (employeeId: string) => {
  const { state } = useAppState()
  return state.payrollRuns
    .filter((r) => r.status === 'paid')
    .flatMap((run) => {
      const slip = run.slips.find((p) => p.employeeId === employeeId)
      return slip ? [{ run, slip }] : []
    })
    .sort((a, b) => b.run.month.localeCompare(a.run.month))
}

// ---------------------------------------------------------------- list

export function MyPayslipsPage() {
  return <WithMe title="My payslips">{(me) => <Payslips me={me} />}</WithMe>
}

function Payslips({ me }: { me: Employee }) {
  const slips = usePaidSlips(me.id)
  const year = slips[0]?.run.month.slice(0, 4)
  const yearNet = slips.filter((s) => s.run.month.startsWith(year ?? '')).reduce((n, s) => n + s.slip.net, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My payslips" description="Your slips from paid payroll runs. Open one to see the full breakdown or print it." />
      {slips.length ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <StatCard label="Last net pay" value={fmtIdr(slips[0].slip.net)} hint={monthLabel(slips[0].run.month)} icon={<Wallet />} tone="ink" />
            <StatCard label={`Net pay in ${year}`} value={fmtIdr(yearNet)} hint={`${slips.filter((s) => s.run.month.startsWith(year ?? '')).length} paid slips`} />
          </div>
          <ul className="space-y-3">
            {slips.map(({ run, slip }) => (
              <li key={run.id}>
                <Link to={paths.mePayslip(run.id)} className="flex min-h-16 items-center gap-3 rounded-card bg-card p-4 shadow-card hover:bg-surface">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{monthLabel(run.month)}</span>
                    <span className="block truncate text-xs text-muted">
                      {run.code}
                      {run.paidAt && ` · paid ${fmtDate(run.paidAt)}`}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block font-bold tabular-nums">{fmtIdr(slip.net)}</span>
                    <span className="block text-xs text-muted">net</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <Card>
          <EmptyState icon={<Wallet />} title="No payslips yet" description="Your slip shows up here once a payroll run that includes you is paid." />
        </Card>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- detail

export function MyPayslipPage() {
  return <WithMe title="Payslip">{(me) => <Payslip me={me} />}</WithMe>
}

function Payslip({ me }: { me: Employee }) {
  const { id } = useParams()
  const { state } = useAppState()
  const found = usePaidSlips(me.id).find((s) => s.run.id === id)
  if (!found) {
    return (
      <div>
        <BackButton fallback={paths.mePayslips} />
        <PageHeader title="Payslip" />
        <Card>
          <EmptyState title="Payslip not found" description="This run has no paid slip for you." />
        </Card>
      </div>
    )
  }
  const { run, slip } = found
  const period = monthLabel(run.month)
  const earned = slip.base + sumLines(slip.earnings)
  const deducted = sumLines(slip.deductions) + slip.bpjsEmployee + slip.tax
  const approver = state.users.find((u) => u.id === run.approvedBy)?.name ?? ''
  const department = state.departments.find((d) => d.id === me.departmentId)?.name ?? '–'

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="print:hidden">
        <BackButton fallback={paths.mePayslips} />
      </div>
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{run.code}</div>
          <h1 className="text-2xl font-bold tracking-tight">Payslip for {period}</h1>
          <p className="mt-1 text-sm text-muted">Net pay {fmtIdr(slip.net)}</p>
        </div>
        <Button variant="outline" size="lg" onClick={() => window.print()}>
          <Printer />
          Print
        </Button>
      </div>

      <Card className="min-w-0 p-5 sm:p-10 print:max-w-none print:border-0 print:p-0 print:shadow-none">
        <LetterHead company={state.company} />
        <div className="mt-6">
          <div className="text-lg font-bold">Payslip</div>
          <div className="font-mono text-xs text-muted">{run.code}</div>
          <div className="mt-1 text-sm text-muted">Period {period}</div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 print:grid-cols-2">
          <LetterBlock title="Employee">
            <div className="font-semibold">{me.name}</div>
            <div>
              {me.code} · {positionOf(state, me)}
            </div>
            <div>{department}</div>
          </LetterBlock>
          <LetterBlock title="Tax and BPJS">
            <div>NPWP {me.npwp || '–'}</div>
            <div>PTKP {me.ptkp}</div>
            <div>BPJS Ketenagakerjaan {me.bpjsTk || '–'}</div>
            <div>BPJS Kesehatan {me.bpjsKes || '–'}</div>
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
            <div className="break-words">Paid to {me.bankAccount || 'no bank account on file'}</div>
            {run.paidAt && <div>Paid on {fmtDate(run.paidAt)}</div>}
          </LetterBlock>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-6 text-sm">
          <Signature role={`For ${state.company.name}`} name={approver} />
          <Signature role="Received by" name={me.name} />
        </div>
      </Card>
    </div>
  )
}
