import {
  attendanceSummary,
  fmtDate,
  fmtIdr,
  fmtNumber,
  fmtPercent,
  headcountBy,
  monthDates,
  monthLabel,
  payrollTotals,
  SCORE_BANDS,
  scoreBand,
  scorecardScore,
  turnover,
  ymd,
} from '@artha/fixtures'
import { EMPLOYMENT_TYPE_LABEL, LEAVE_TYPE_LABEL, PAYROLL_STATUS_LABEL, type EmploymentType, type LeaveType } from '@artha/types'
import { Button, Card, CardContent, CardHeader, CardTitle, Chip, ChipRow, cn, EmptyState, Input, Kicker, PageHeader } from '@artha/ui'
import { Download, Printer } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { paths } from '../../components/links'
import { SubTabs } from '../../components/SubTabs'
import { downloadCsv } from '../../lib/csv'
import { useAppState, useNow } from '../../state/store'
import { Money } from '../finance/parts'
import { BarList, type Bar } from './OverviewPage'
import { PERFORMANCE_TABS } from './PerformancePages'

type Kind = 'headcount' | 'turnover' | 'attendance' | 'leave' | 'overtime' | 'payroll' | 'kpi'

const REPORTS: { kind: Kind; label: string; description: string }[] = [
  { kind: 'headcount', label: 'Headcount', description: 'Current employees by department, branch, employment type and gender. The range does not apply.' },
  { kind: 'turnover', label: 'Turnover', description: 'Joiners, leavers and the turnover rate per year, with everyone who left in the range.' },
  { kind: 'attendance', label: 'Attendance', description: 'Share of scheduled working days with a check-in, per department and month.' },
  { kind: 'leave', label: 'Leave', description: 'Approved leave starting in the range, by type.' },
  { kind: 'overtime', label: 'Overtime', description: 'Approved overtime hours by month.' },
  { kind: 'payroll', label: 'Payroll cost', description: 'Payroll runs by month. Total cost is gross pay plus the company share of BPJS.' },
  { kind: 'kpi', label: 'KPI scores', description: 'Scorecards for quarters that overlap the range, grouped by score band.' },
]

type Cell = string | number | null
interface Col {
  label: string
  format?: 'number' | 'money' | 'percent'
}
interface Table {
  title?: string
  columns: Col[]
  rows: Cell[][]
}
interface Built {
  chart?: ReactNode
  tables: Table[]
  empty?: string
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const nextMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
}
const monthsBetween = (from: string, to: string) => {
  const out: string[] = []
  for (let m = from; m <= to; m = nextMonth(m)) out.push(m)
  return out
}
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })
/** Months a quarter such as 2026-Q3 covers, first and last. */
const quarterMonths = (period: string) => {
  const [y, q] = period.split('-Q').map(Number)
  return [`${y}-${String(q * 3 - 2).padStart(2, '0')}`, `${y}-${String(q * 3).padStart(2, '0')}`]
}

export function HrReportsPage() {
  const { state } = useAppState()
  const now = useNow()
  const [params, setParams] = useSearchParams()
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const today = ymd(now)
  const thisMonth = today.slice(0, 7)
  const yearStart = `${today.slice(0, 4)}-01`
  const lastYear = monthsBetween(`${Number(today.slice(0, 4)) - 1}-${today.slice(5, 7)}`, thisMonth)[1]
  const kind = (REPORTS.find((r) => r.kind === params.get('report'))?.kind ?? 'headcount') as Kind
  const report = REPORTS.find((r) => r.kind === kind)!
  const clamp = (m: string | null, fallback: string) => (m && MONTH.test(m) ? (m > thisMonth ? thisMonth : m) : fallback)
  const rawFrom = clamp(params.get('from'), yearStart)
  const rawTo = clamp(params.get('to'), thisMonth)
  const [from, to] = rawFrom <= rawTo ? [rawFrom, rawTo] : [rawTo, rawFrom]
  const scope = from === to ? monthLabel(from) : `${monthLabel(from)} to ${monthLabel(to)}`

  const built = useMemo((): Built => {
    const months = monthsBetween(from, to)
    const start = `${from}-01`
    const end = monthDates(to).at(-1)!
    switch (kind) {
      case 'headcount': {
        const total = state.employees.filter((e) => e.status !== 'left').length
        const dims: { title: string; rows: Bar[] }[] = [
          { title: 'Department', rows: headcountBy(state, 'departmentId').map((r) => ({ label: state.departments.find((d) => d.id === r.value)?.name ?? 'No department', value: r.count })) },
          { title: 'Branch', rows: headcountBy(state, 'branchId').map((r) => ({ label: state.branches.find((b) => b.id === r.value)?.name ?? 'No branch', value: r.count })) },
          { title: 'Employment type', rows: headcountBy(state, 'type').map((r) => ({ label: EMPLOYMENT_TYPE_LABEL[r.value as EmploymentType], value: r.count })) },
          { title: 'Gender', rows: headcountBy(state, 'gender').map((r) => ({ label: r.value === 'female' ? 'Female' : 'Male', value: r.count })) },
        ]
        return {
          chart: (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {dims.map((d) => (
                <div key={d.title} className="min-w-0">
                  <Kicker className="mb-3">{d.title}</Kicker>
                  <BarList rows={d.rows} label={`Employees by ${d.title.toLowerCase()}`} />
                </div>
              ))}
            </div>
          ),
          tables: [
            {
              columns: [{ label: 'Group' }, { label: 'Value' }, { label: 'Employees', format: 'number' }, { label: 'Share', format: 'percent' }],
              rows: dims.flatMap((d) => d.rows.map((r) => [d.title, r.label, r.value, total ? (r.value / total) * 100 : 0])),
            },
          ],
          empty: total ? undefined : 'No current employees.',
        }
      }
      case 'turnover': {
        const years = [...new Set(months.map((m) => Number(m.slice(0, 4))))]
        const byYear = years.map((y) => ({ y, ...turnover(state, y) }))
        const leavers = state.employees.filter((e) => e.leftAt && ymd(e.leftAt) >= start && ymd(e.leftAt) <= end).sort((a, b) => a.leftAt!.localeCompare(b.leftAt!))
        const latest = byYear.at(-1)!
        return {
          chart: (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: `Joined in ${latest.y}`, value: latest.joined },
                { label: `Left in ${latest.y}`, value: latest.left },
                { label: 'Turnover rate', value: fmtPercent(latest.rate) },
              ].map((x, i) => (
                <div key={x.label} className={cn('min-w-0 rounded-2xl p-4', i === 2 ? 'bg-accent text-white' : 'bg-surface-2')}>
                  <div className={cn('truncate text-xs', i === 2 ? 'text-white/80' : 'text-muted')}>{x.label}</div>
                  <div className="mt-1 text-2xl font-bold tabular-nums">{x.value}</div>
                </div>
              ))}
            </div>
          ),
          tables: [
            {
              title: 'By year',
              columns: [{ label: 'Year' }, { label: 'Joined', format: 'number' }, { label: 'Left', format: 'number' }, { label: 'Turnover rate', format: 'percent' }],
              rows: byYear.map((r) => [String(r.y), r.joined, r.left, r.rate]),
            },
            {
              title: 'Leavers in the range',
              columns: [{ label: 'Employee' }, { label: 'Department' }, { label: 'Last day' }, { label: 'Reason' }],
              rows: leavers.map((e) => [e.name, state.departments.find((d) => d.id === e.departmentId)?.name ?? '', fmtDate(e.leftAt!), e.leftReason || '']),
            },
          ],
        }
      }
      case 'attendance': {
        // Days before the first attendance record have no data, so they do not count as absences.
        const firstRecord = state.attendance.reduce((m, a) => (a.date < m ? a.date : m), today)
        const rate = (employees: typeof state.employees, month: string) => {
          let att = 0
          let due = 0
          for (const e of employees) {
            const dates = monthDates(month).filter((d) => d >= firstRecord && d <= today && d >= ymd(e.joinedAt) && (!e.leftAt || d <= ymd(e.leftAt)))
            const { counts } = attendanceSummary(state, e.id, dates, now)
            att += counts.present + counts.late
            due += counts.present + counts.late + counts.absent
          }
          return { att, due }
        }
        const rows = state.departments
          .map((d) => {
            const people = state.employees.filter((e) => e.departmentId === d.id)
            const cells = months.map((m) => rate(people, m))
            const att = cells.reduce((n, c) => n + c.att, 0)
            const due = cells.reduce((n, c) => n + c.due, 0)
            return { name: d.name, cells: cells.map((c) => (c.due ? (c.att / c.due) * 100 : null)), overall: due ? (att / due) * 100 : null }
          })
          .filter((r) => r.overall !== null)
        return {
          chart: <BarList rows={rows.map((r) => ({ label: r.name, value: r.overall!, display: fmtPercent(r.overall!) }))} label="Attendance rate per department over the range" />,
          tables: [
            {
              columns: [{ label: 'Department' }, ...months.map((m) => ({ label: shortMonth(m), format: 'percent' as const })), { label: 'Range', format: 'percent' }],
              rows: rows.map((r) => [r.name, ...r.cells, r.overall]),
            },
          ],
          empty: rows.length ? undefined : `No attendance records in this range. Records start on ${fmtDate(firstRecord)}.`,
        }
      }
      case 'leave': {
        const taken = state.hrRequests.filter((r) => r.leave && r.status === 'approved' && r.leave.from >= start && r.leave.from <= end)
        const types = (Object.keys(LEAVE_TYPE_LABEL) as LeaveType[]).map((t) => {
          const rs = taken.filter((r) => r.leave!.type === t)
          return { t, requests: rs.length, days: rs.reduce((n, r) => n + r.leave!.days, 0), people: new Set(rs.map((r) => r.employeeId)).size }
        })
        return {
          chart: <BarList rows={types.map((x) => ({ label: LEAVE_TYPE_LABEL[x.t], value: x.days, display: `${x.days} days` }))} label="Leave days by type" />,
          tables: [
            {
              columns: [{ label: 'Type' }, { label: 'Requests', format: 'number' }, { label: 'People', format: 'number' }, { label: 'Days', format: 'number' }],
              rows: [...types.map((x) => [LEAVE_TYPE_LABEL[x.t], x.requests, x.people, x.days]), ['Total', taken.length, new Set(taken.map((r) => r.employeeId)).size, types.reduce((n, x) => n + x.days, 0)]],
            },
          ],
          empty: taken.length ? undefined : 'No approved leave starts in this range.',
        }
      }
      case 'overtime': {
        const ot = state.hrRequests.filter((r) => r.overtime && r.status === 'approved')
        const series = months.map((m) => {
          const rs = ot.filter((r) => r.overtime!.date.startsWith(m))
          return { m, hours: rs.reduce((n, r) => n + r.overtime!.hours, 0), requests: rs.length, people: new Set(rs.map((r) => r.employeeId)).size }
        })
        const total = series.reduce((n, s) => n + s.hours, 0)
        return {
          chart: <MonthColumns values={series.map((s) => ({ month: s.m, value: s.hours, tip: `${fmtNumber(s.hours, 1)} hours` }))} label="Overtime hours per month" />,
          tables: [
            {
              columns: [{ label: 'Month' }, { label: 'Requests', format: 'number' }, { label: 'People', format: 'number' }, { label: 'Hours', format: 'number' }],
              rows: [...series.map((s) => [monthLabel(s.m), s.requests, s.people, s.hours]), ['Total', series.reduce((n, s) => n + s.requests, 0), null, total]],
            },
          ],
          empty: total ? undefined : 'No approved overtime in this range.',
        }
      }
      case 'payroll': {
        const runs = state.payrollRuns.filter((r) => r.month >= from && r.month <= to).sort((a, b) => a.month.localeCompare(b.month))
        const rows = runs.map((r) => ({ r, t: payrollTotals(r.slips) }))
        const sum = (f: (t: ReturnType<typeof payrollTotals>) => number) => rows.reduce((n, x) => n + f(x.t), 0)
        return {
          chart: <MonthColumns values={months.map((m) => ({ month: m, value: rows.find((x) => x.r.month === m)?.t.cost ?? 0 })).map((v) => ({ ...v, tip: fmtIdr(v.value) }))} label="Payroll cost per month" />,
          tables: [
            {
              columns: [
                { label: 'Month' },
                { label: 'Status' },
                { label: 'People', format: 'number' },
                { label: 'Gross pay', format: 'money' },
                { label: 'Company BPJS', format: 'money' },
                { label: 'PPh 21', format: 'money' },
                { label: 'Net pay', format: 'money' },
                { label: 'Total cost', format: 'money' },
              ],
              rows: [
                ...rows.map(({ r, t }) => [monthLabel(r.month), PAYROLL_STATUS_LABEL[r.status], r.slips.length, t.gross, t.bpjsCompany, t.tax, t.net, t.cost]),
                ['Total', null, null, sum((t) => t.gross), sum((t) => t.bpjsCompany), sum((t) => t.tax), sum((t) => t.net), sum((t) => t.cost)],
              ],
            },
          ],
          empty: rows.length ? undefined : 'No payroll runs in this range.',
        }
      }
      case 'kpi': {
        const cards = state.scorecards
          .filter((sc) => {
            const [a, b] = quarterMonths(sc.period)
            return a <= to && b >= from
          })
          .map((sc) => scorecardScore(state, sc))
        const scored = cards.filter((s): s is number => s !== null)
        const bands = SCORE_BANDS.map(([min, band]) => ({ band, min, count: scored.filter((s) => scoreBand(s) === band).length }))
        const avg = scored.length ? scored.reduce((n, s) => n + s, 0) / scored.length : 0
        return {
          chart: <BarList rows={bands.map((b) => ({ label: b.band, value: b.count }))} label="Scorecards per score band" />,
          tables: [
            {
              columns: [{ label: 'Band' }, { label: 'From score', format: 'number' }, { label: 'Scorecards', format: 'number' }, { label: 'Share', format: 'percent' }],
              rows: [
                ...bands.map((b) => [b.band, b.min, b.count, scored.length ? (b.count / scored.length) * 100 : 0]),
                [`Average score ${fmtNumber(avg, 1)}`, null, scored.length, 100],
                ...(cards.length > scored.length ? [['No actuals yet', null, cards.length - scored.length, null]] : []),
              ],
            },
          ],
          empty: cards.length ? undefined : 'No scorecards for quarters in this range.',
        }
      }
    }
  }, [kind, state, from, to, today, now])

  const exportCsv = () => {
    const text = (c: Cell, col: Col) => (c === null ? '' : typeof c === 'number' ? (col.format === 'money' ? Math.round(c) : Number(c.toFixed(1))) : c)
    downloadCsv(`hr-${kind}-${from}-to-${to}`, [
      [`${report.label} report`],
      [kind === 'headcount' ? `As of ${fmtDate(new Date(now).toISOString())}` : scope],
      ...built.tables.flatMap((t) => [[], ...(t.title ? [[t.title]] : []), t.columns.map((c) => c.label), ...t.rows.map((r) => r.map((c, i) => text(c, t.columns[i])))]),
    ])
  }

  return (
    <div>
      <div className="print:hidden">
        <SubTabs items={PERFORMANCE_TABS} />
      </div>
      <PageHeader
        title="HR reports"
        description="Pick a report and a range, then export it as CSV or print it."
        actions={
          <>
            <Button variant="outline" size="sm" className="print:hidden" disabled={!!built.empty} title={built.empty} onClick={exportCsv}>
              <Download />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
              <Printer />
              Print
            </Button>
          </>
        }
      />

      <div className="space-y-3 print:hidden">
        <ChipRow role="group" aria-label="Report">
          {REPORTS.map((r) => (
            <Chip key={r.kind} active={kind === r.kind} onClick={() => set({ report: r.kind === 'headcount' ? null : r.kind })}>
              {r.label}
            </Chip>
          ))}
        </ChipRow>
        <div className="flex flex-wrap items-center gap-2">
          <Input variant="pill" type="month" aria-label="From month" value={from} max={thisMonth} onChange={(e) => set({ from: e.target.value || null })} className="w-[calc(50%-0.25rem)] sm:w-44" inputClassName="h-10" />
          <Input variant="pill" type="month" aria-label="To month" value={to} max={thisMonth} onChange={(e) => set({ to: e.target.value || null })} className="w-[calc(50%-0.25rem)] sm:w-44" inputClassName="h-10" />
          <Chip active={from === yearStart && to === thisMonth} onClick={() => set({ from: null, to: null })}>
            This year
          </Chip>
          <Chip active={from === lastYear && to === thisMonth} onClick={() => set({ from: lastYear, to: null })}>
            Last 12 months
          </Chip>
        </div>
      </div>

      <Card className="mt-4 min-w-0">
        <CardHeader>
          <CardTitle>{report.label}</CardTitle>
          <p className="text-sm text-muted">
            {kind === 'headcount' ? `As of ${fmtDate(new Date(now).toISOString())}` : scope}. {report.description}
          </p>
        </CardHeader>
        <CardContent>
          {built.empty ? (
            <EmptyState
              compact
              title={built.empty}
              description="Widen the range or pick another report."
              action={
                kind === 'payroll' ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={paths.payroll}>Payroll</Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            built.chart
          )}
        </CardContent>
      </Card>

      {!built.empty &&
        built.tables.map((t, i) => (
          <Card key={i} className="mt-4 min-w-0">
            {t.title && (
              <CardHeader className="pb-0">
                <CardTitle>{t.title}</CardTitle>
              </CardHeader>
            )}
            <div className="overflow-x-auto px-5 pb-4 pt-2">
              {t.rows.length ? <ReportTable caption={t.title ?? report.label} table={t} /> : <EmptyState compact title="Nothing in this range" />}
            </div>
          </Card>
        ))}
    </div>
  )
}

function ReportTable({ caption, table }: { caption: string; table: Table }) {
  const cell = (c: Cell, col: Col) => {
    if (c === null) return null
    if (typeof c === 'string') return c
    if (col.format === 'money') return <Money value={c} dash />
    if (col.format === 'percent') return fmtPercent(c)
    return fmtNumber(c, c % 1 ? 1 : 0)
  }
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border">
          {table.columns.map((c) => (
            <th key={c.label} scope="col" className={cn('h-9 px-2 text-xs font-semibold uppercase tracking-wide text-muted first:pl-0 last:pr-0', c.format ? 'whitespace-nowrap text-right' : 'text-left')}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((r, n) => (
          <tr key={n} className={cn('border-b border-border last:border-0', r[0] === 'Total' && 'font-semibold')}>
            {r.map((c, i) => (
              <td key={i} className={cn('h-10 px-2 first:pl-0 last:pr-0', table.columns[i].format ? 'whitespace-nowrap text-right tabular-nums' : 'min-w-[8rem]')}>
                {cell(c, table.columns[i])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Monthly columns in grey with the latest month in the accent. */
function MonthColumns({ values, label }: { values: { month: string; value: number; tip: string }[]; label: string }) {
  const peak = Math.max(1, ...values.map((v) => v.value))
  const last = values.length - 1
  return (
    <>
      <ol className="flex h-44 items-end gap-1 sm:gap-2" aria-label={label}>
        {values.map((v, i) => {
          const tip = `${monthLabel(v.month)}: ${v.tip}`
          return (
            <li key={v.month} className="flex h-full min-w-0 flex-1 items-end justify-center" title={tip}>
              <span className="sr-only">{tip}</span>
              <span className={cn('w-full max-w-10 rounded-t-md', i === last ? 'bg-accent' : 'bg-chart-muted')} style={{ height: `${Math.max(2, (v.value / peak) * 100)}%` }} />
            </li>
          )
        })}
      </ol>
      <div className="mt-2 flex gap-1 text-[11px] text-muted sm:gap-2" aria-hidden>
        {values.map((v, i) => (
          <span key={v.month} className={cn('min-w-0 flex-1 truncate text-center', i === last && 'font-semibold text-foreground')}>
            {shortMonth(v.month)}
          </span>
        ))}
      </div>
    </>
  )
}
