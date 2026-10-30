import type {
  Announcement,
  ApprovalStep,
  Attendance,
  AttendanceState,
  Candidate,
  CandidateStage,
  Checklist,
  ChecklistKind,
  ChecklistTemplate,
  Department,
  Employee,
  EmploymentContract,
  GeoPoint,
  Holiday,
  HrRequest,
  HrRequestKind,
  HrSettings,
  Interview,
  JobOpening,
  KpiDefinition,
  LogbookEntry,
  Offer,
  PayComponent,
  PayLine,
  Payslip,
  PayrollRun,
  PayrollSettings,
  PsychTest,
  Position,
  Ptkp,
  RecurringTask,
  Review,
  ReviewCycle,
  ReviewRelation,
  ScheduleOverride,
  Scorecard,
  Section,
  Shift,
} from '@artha/types'
import { CANDIDATE_STAGE_LABEL, PTKP_AMOUNT } from '@artha/types'
import { DAY, toMs } from './clock'
import { fmtIdr, newId, nextCode } from './format'
import { patchById, upsert } from './rows'
import type { AppAction, AppState } from './store'

export type HrAction =
  | { type: 'departments/upsert'; department: Department }
  | { type: 'departments/remove'; id: string }
  | { type: 'sections/upsert'; section: Section }
  | { type: 'sections/remove'; id: string }
  | { type: 'positions/upsert'; position: Position }
  | { type: 'positions/remove'; id: string }
  /** A new hire starts in onboarding with a checklist and, when given, a contract. */
  | { type: 'employees/create'; employee: Employee; contract: EmploymentContract | null }
  | { type: 'employees/update'; id: string; patch: Partial<Omit<Employee, 'id' | 'code' | 'status'>> }
  | { type: 'employees/activate'; id: string }
  | { type: 'employees/offboard'; id: string; lastDay: string; reason: string }
  | { type: 'employees/release'; id: string }
  | { type: 'contracts/upsert'; contract: EmploymentContract }
  | { type: 'contracts/renew'; id: string; contract: EmploymentContract }
  | { type: 'checklists/toggle'; id: string; itemId: string }
  | { type: 'checklistTemplates/update'; template: ChecklistTemplate }
  | { type: 'shifts/upsert'; shift: Shift }
  | { type: 'shifts/remove'; id: string }
  /** `shiftId` null is a day off; 'default' removes the override. */
  | { type: 'schedule/set'; employeeId: string; date: string; shiftId: string | null | 'default' }
  | { type: 'holidays/upsert'; holiday: Holiday }
  | { type: 'holidays/remove'; id: string }
  | { type: 'attendance/checkIn'; attendance: Attendance }
  | { type: 'attendance/checkOut'; id: string; at: string }
  /** HR fixes or adds a day's record; the note says why. */
  | { type: 'attendance/correct'; attendance: Attendance }
  | { type: 'hrRequests/create'; request: HrRequest }
  | { type: 'hrRequests/decide'; id: string; decision: 'approved' | 'rejected'; note: string; by: string }
  | { type: 'hrRequests/cancel'; id: string }
  | { type: 'payComponents/upsert'; component: PayComponent }
  | { type: 'payComponents/remove'; id: string }
  | { type: 'payrollSettings/update'; patch: Partial<PayrollSettings> }
  | { type: 'payroll/calculate'; month: string }
  | { type: 'payroll/approve'; id: string }
  | { type: 'payroll/pay'; id: string }
  | { type: 'kpis/upsert'; kpi: KpiDefinition }
  | { type: 'kpis/remove'; id: string }
  | { type: 'scorecards/upsert'; scorecard: Scorecard }
  | { type: 'scorecards/submit'; id: string }
  | { type: 'scorecards/finalize'; id: string }
  | { type: 'cycles/upsert'; cycle: ReviewCycle }
  | { type: 'cycles/open'; id: string }
  | { type: 'cycles/close'; id: string }
  | { type: 'reviews/submit'; id: string; answers: Review['answers']; by: string }
  | { type: 'openings/upsert'; opening: JobOpening }
  | { type: 'candidates/upsert'; candidate: Candidate }
  | { type: 'candidates/move'; id: string; stage: Exclude<CandidateStage, 'hired'>; reason?: string }
  | { type: 'candidates/addTest'; id: string; result: Candidate['tests'][number] }
  | { type: 'candidates/schedule'; id: string; interview: Interview }
  | { type: 'candidates/feedback'; id: string; interviewId: string; score: number; feedback: string }
  | { type: 'candidates/offer'; id: string; offer: Offer }
  /** Turns an accepted offer into an employee in onboarding. */
  | { type: 'candidates/hire'; id: string; employee: Employee; contract: EmploymentContract }
  /** Public: an application from the careers page. The page supplies the id and the portal token. */
  | { type: 'candidates/apply'; candidate: Candidate }
  /** HR gives a console-added candidate a portal token and the tests to take there. */
  | { type: 'candidates/portal'; id: string; token: string; testIds: string[] }
  /** Portal: the candidate's answers, scored by the store against the test's key. */
  | { type: 'candidates/takeTest'; id: string; testId: string; answers: number[] }
  | { type: 'candidates/respondInterview'; id: string; interviewId: string; kind: 'confirmed' | 'reschedule'; note: string }
  | { type: 'candidates/respondOffer'; id: string; accept: boolean; note: string }
  | { type: 'announcements/upsert'; announcement: Announcement }
  | { type: 'announcements/remove'; id: string }
  | { type: 'announcements/read'; id: string; userId: string }
  | { type: 'logbook/add'; entry: LogbookEntry }
  | { type: 'recurring/upsert'; task: RecurringTask }
  | { type: 'recurring/remove'; id: string }
  | { type: 'recurring/complete'; id: string }
  | { type: 'hrSettings/update'; patch: Partial<HrSettings> }
  /** Jessy's minute job: fixed-term contracts past their end date expire. */
  | { type: 'hr/sweep' }

const HR_PREFIXES = [
  'departments/', 'sections/', 'positions/', 'employees/', 'contracts/', 'checklists/', 'checklistTemplates/', 'shifts/', 'schedule/',
  'holidays/', 'attendance/', 'hrRequests/', 'payComponents/', 'payrollSettings/', 'payroll/', 'kpis/', 'scorecards/', 'cycles/',
  'reviews/', 'openings/', 'candidates/', 'announcements/', 'logbook/', 'recurring/', 'hrSettings/', 'hr/',
]
export const isHrAction = (a: AppAction): a is HrAction => HR_PREFIXES.some((p) => a.type.startsWith(p))

// ---------------------------------------------------------------- dates

/** Local YYYY-MM-DD. */
export const ymd = (iso: string | number) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const dayStart = (date: string) => new Date(`${date}T00:00:00`).getTime()
const addDay = (date: string, n: number) => ymd(dayStart(date) + n * DAY + 3_600_000)
const weekday = (date: string) => new Date(`${date}T00:00:00`).getDay()

/** Every date from `from` to `to`, both included. */
export const datesBetween = (from: string, to: string) => {
  const out: string[] = []
  for (let d = from; d <= to; d = addDay(d, 1)) out.push(d)
  return out
}

export const monthDates = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return datesBetween(`${month}-01`, ymd(new Date(y, m, 0, 12).getTime()))
}

export const holidayOn = (s: Pick<AppState, 'holidays'>, date: string) => s.holidays.find((h) => h.date === date)

/** Monday to Friday that are not public holidays. */
export const workingDays = (s: Pick<AppState, 'holidays'>, from: string, to: string) =>
  from > to ? 0 : datesBetween(from, to).filter((d) => weekday(d) % 6 !== 0 && !holidayOn(s, d)).length

// ---------------------------------------------------------------- people

export const employeeName = (s: Pick<AppState, 'employees'>, id: string | null) => s.employees.find((e) => e.id === id)?.name ?? 'Unknown employee'

/** Employees still on the books: onboarding, active or serving notice. */
export const currentEmployees = (s: Pick<AppState, 'employees'>) => s.employees.filter((e) => e.status !== 'left')

export const employeeOfUser = (s: Pick<AppState, 'employees'>, userId: string) => s.employees.find((e) => e.userId === userId && e.status !== 'left')

/** Reviews the employee still has to write in open cycles. */
export const reviewsOwed = (s: Pick<AppState, 'reviews' | 'reviewCycles'>, employeeId: string) => {
  const open = new Set(s.reviewCycles.filter((c) => c.status === 'open').map((c) => c.id))
  return s.reviews.filter((r) => r.reviewerId === employeeId && !r.submittedAt && open.has(r.cycleId))
}

export const candidateByToken = (s: Pick<AppState, 'candidates'>, token: string) => (token ? s.candidates.find((c) => c.token === token) : undefined)

/** Score out of 100: the share of questions answered right. */
export const scoreTest = (test: PsychTest, answers: number[]) =>
  test.questions.length ? Math.round((test.questions.filter((q, i) => answers[i] === q.answer).length / test.questions.length) * 100) : 0

/** Tests the candidate still has to take on the portal. */
export const testsDue = (s: Pick<AppState, 'psychTests'>, c: Candidate) =>
  (c.assignedTestIds ?? []).filter((id) => !c.tests.some((t) => t.testId === id)).flatMap((id) => s.psychTests.filter((t) => t.id === id))

export const directReports = (s: Pick<AppState, 'employees'>, id: string) => s.employees.filter((e) => e.managerId === id && e.status !== 'left')

export interface OrgNode {
  employee: Employee
  reports: OrgNode[]
}

/** The reporting tree from employees without a manager down. */
export const orgTree = (s: Pick<AppState, 'employees'>): OrgNode[] => {
  const people = currentEmployees(s)
  const node = (e: Employee, seen: Set<string>): OrgNode => ({
    employee: e,
    reports: seen.has(e.id) ? [] : people.filter((r) => r.managerId === e.id).map((r) => node(r, new Set([...seen, e.id]))),
  })
  return people.filter((e) => !e.managerId || !people.some((m) => m.id === e.managerId)).map((e) => node(e, new Set()))
}

export const checklistProgress = (c: Pick<Checklist, 'items'>) => {
  const done = c.items.filter((i) => i.doneAt).length
  return { done, total: c.items.length, complete: done === c.items.length }
}

const openChecklist = (s: Pick<AppState, 'checklists'>, employeeId: string, kind: ChecklistKind) =>
  s.checklists.find((c) => c.employeeId === employeeId && c.kind === kind && !c.completedAt)

const startChecklist = (s: AppState, employeeId: string, kind: ChecklistKind, at: string): Checklist => ({
  id: newId('chk'),
  employeeId,
  kind,
  items: (s.checklistTemplates.find((t) => t.kind === kind)?.items ?? []).map((i) => ({ ...i, doneAt: null, doneBy: null })),
  startedAt: at,
  completedAt: null,
})

/** Active fixed-term contracts that end within `days`. */
export const expiringContracts = (s: Pick<AppState, 'contracts'>, nowMs: number, days: number) =>
  s.contracts
    .filter((c) => c.status === 'active' && c.endsOn && toMs(c.endsOn) >= nowMs - DAY && toMs(c.endsOn) <= nowMs + days * DAY)
    .sort((a, b) => a.endsOn!.localeCompare(b.endsOn!))

export const currentContract = (s: Pick<AppState, 'contracts'>, employeeId: string) =>
  s.contracts.filter((c) => c.employeeId === employeeId && c.status !== 'ended').sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]

// ---------------------------------------------------------------- time

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** The shift the employee works on a date, or null for a day off or a holiday. */
export const shiftOn = (s: Pick<AppState, 'employees' | 'shifts' | 'scheduleOverrides' | 'holidays'>, employeeId: string, date: string): Shift | null => {
  const override = s.scheduleOverrides.find((o) => o.employeeId === employeeId && o.date === date)
  if (override) return s.shifts.find((x) => x.id === override.shiftId) ?? null
  if (holidayOn(s, date)) return null
  const e = s.employees.find((x) => x.id === employeeId)
  const shift = s.shifts.find((x) => x.id === e?.shiftId)
  return shift && shift.days.includes(weekday(date)) ? shift : null
}

const approvedLeaveOn = (s: Pick<AppState, 'hrRequests'>, employeeId: string, date: string) =>
  s.hrRequests.find((r) => r.kind === 'leave' && r.status === 'approved' && r.employeeId === employeeId && r.leave && r.leave.from <= date && r.leave.to >= date)

export const lateMinutes = (s: Pick<AppState, 'employees' | 'shifts' | 'scheduleOverrides' | 'holidays' | 'hrSettings'>, a: Pick<Attendance, 'employeeId' | 'date' | 'checkIn'>) => {
  const shift = shiftOn(s, a.employeeId, a.date)
  if (!shift || !a.checkIn) return 0
  const d = new Date(a.checkIn)
  const late = d.getHours() * 60 + d.getMinutes() - minutes(shift.start) - s.hrSettings.lateGraceMinutes
  return Math.max(late, 0)
}

export const attendanceState = (s: AppState, employeeId: string, date: string, nowMs: number): AttendanceState => {
  const record = s.attendance.find((a) => a.employeeId === employeeId && a.date === date)
  if (approvedLeaveOn(s, employeeId, date)) return 'leave'
  if (holidayOn(s, date) && !record) return 'holiday'
  const shift = shiftOn(s, employeeId, date)
  if (record?.checkIn) return lateMinutes(s, record) > 0 ? 'late' : 'present'
  if (!shift) return 'off'
  // A shift that has not ended yet is not an absence.
  return dayStart(date) + minutes(shift.end) * 60_000 > nowMs ? 'upcoming' : 'absent'
}

export const attendanceSummary = (s: AppState, employeeId: string, dates: string[], nowMs: number) => {
  const counts: Record<AttendanceState, number> = { present: 0, late: 0, absent: 0, leave: 0, holiday: 0, off: 0, upcoming: 0 }
  for (const d of dates) counts[attendanceState(s, employeeId, d, nowMs)]++
  const due = counts.present + counts.late + counts.absent
  return { counts, rate: due ? (counts.present + counts.late) / due : 1 }
}

/** Great-circle distance in metres. */
export const distanceM = (a: Pick<GeoPoint, 'lat' | 'lng'>, b: Pick<GeoPoint, 'lat' | 'lng'>) => {
  const rad = (x: number) => (x * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)))
}

export const officeOf = (s: Pick<AppState, 'employees' | 'hrSettings'>, employeeId: string) => {
  const e = s.employees.find((x) => x.id === employeeId)
  return s.hrSettings.offices.find((o) => o.branchId === e?.branchId)
}

/** A check-in record with the distance to the employee's office filled in. */
export const buildCheckIn = (s: AppState, employeeId: string, at: string, photo: string | null, location: GeoPoint | null): Attendance => {
  const office = officeOf(s, employeeId)
  return {
    id: newId('att'),
    employeeId,
    date: ymd(at),
    checkIn: at,
    checkOut: null,
    photo,
    location,
    distanceM: location && office ? distanceM(location, office) : null,
    note: '',
  }
}

// ---------------------------------------------------------------- leave and requests

/** Annual leave for a calendar year: quota, days approved, days waiting, days left. */
export const leaveBalance = (s: Pick<AppState, 'employees' | 'hrRequests'>, employeeId: string, year: number) => {
  const quota = s.employees.find((e) => e.id === employeeId)?.annualLeave ?? 0
  const annual = s.hrRequests.filter((r) => r.employeeId === employeeId && r.leave?.type === 'annual' && r.leave.from.startsWith(String(year)))
  const used = annual.filter((r) => r.status === 'approved').reduce((n, r) => n + r.leave!.days, 0)
  const pending = annual.filter((r) => r.status === 'pending').reduce((n, r) => n + r.leave!.days, 0)
  return { quota, used, pending, left: quota - used - pending }
}

/** Manager first when the employee has one, then HR; loans also need Finance. */
export const requestSteps = (s: Pick<AppState, 'employees'>, employeeId: string, kind: HrRequestKind): ApprovalStep[] => {
  const e = s.employees.find((x) => x.id === employeeId)
  const manager = s.employees.find((x) => x.id === e?.managerId)
  const step = (label: ApprovalStep['label'], approverId: string | null): ApprovalStep => ({ label, approverId, decision: 'pending', by: null, at: null, note: '' })
  return [...(manager ? [step('Manager', manager.userId)] : []), step('HR', null), ...(kind === 'loan' ? [step('Finance', null)] : [])]
}

export const currentStep = (r: { steps: ApprovalStep[]; status: string }) => (r.status === 'pending' ? r.steps.find((st) => st.decision === 'pending') : undefined)

/** Requests whose current level waits on this user: a named manager, or any HR or Finance level for holders of request.approve. Never their own. */
export const requestsAwaiting = (s: Pick<AppState, 'hrRequests' | 'employees'>, userId: string, canApprove: boolean) =>
  s.hrRequests
    .filter((r) => {
      const step = currentStep(r)
      if (!step || s.employees.find((e) => e.id === r.employeeId)?.userId === userId) return false
      return step.approverId ? step.approverId === userId : canApprove
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

const REQUEST_PREFIX: Record<HrRequestKind, string> = { leave: 'LV', overtime: 'OT', loan: 'LN' }
export const nextRequestCode = (s: Pick<AppState, 'hrRequests'>, kind: HrRequestKind) =>
  nextCode(
    s.hrRequests.filter((r) => r.kind === kind).map((r) => r.code),
    `${REQUEST_PREFIX[kind]}-26-`,
    4,
  )

export const loanInstallment = (r: HrRequest) => (r.loan ? Math.round(r.loan.amount / r.loan.installments) : 0)
export const loanOutstanding = (r: HrRequest) => (r.loan ? r.loan.amount - loanInstallment(r) * r.loan.paidInstallments : 0)

const activeLoans = (s: Pick<AppState, 'hrRequests'>, employeeId: string) =>
  s.hrRequests.filter((r) => r.kind === 'loan' && r.employeeId === employeeId && r.status === 'approved' && r.loan && r.loan.paidInstallments < r.loan.installments)

// ---------------------------------------------------------------- payroll

const BRACKETS: [number, number][] = [
  [60_000_000, 0.05],
  [250_000_000, 0.15],
  [500_000_000, 0.25],
  [5_000_000_000, 0.3],
  [Infinity, 0.35],
]

/** PPh 21 on a year's net income after PTKP, by the progressive brackets. */
export const pph21Annual = (taxable: number) => {
  let tax = 0
  let lower = 0
  for (const [upper, rate] of BRACKETS) {
    if (taxable <= lower) break
    tax += (Math.min(taxable, upper) - lower) * rate
    lower = upper
  }
  return Math.round(tax)
}

/** Monthly PPh 21 estimate: annualised gross less job cost (5%, capped at Rp 6 million), pension contributions and PTKP. */
const pph21Monthly = (gross: number, pension: number, ptkp: Ptkp) => {
  const annual = gross * 12
  const taxable = annual - Math.min(annual * 0.05, 6_000_000) - pension * 12 - PTKP_AMOUNT[ptkp]
  return Math.round(pph21Annual(Math.floor(Math.max(taxable, 0) / 1000) * 1000) / 12)
}

export type PayrollData = Pick<AppState, 'employees' | 'hrRequests' | 'payComponents' | 'payrollSettings' | 'holidays'>

export const calcPayslip = (s: PayrollData, e: Employee, month: string): Payslip => {
  const p = s.payrollSettings
  const pct = (amount: number, rate: number) => Math.round((amount * rate) / 100)
  const component = (id: string) => s.payComponents.find((c) => c.id === id)
  const fixed = e.allowances.map((a) => ({ c: component(a.componentId), amount: a.amount })).filter((x) => x.c)
  const overtimeHours = s.hrRequests
    .filter((r) => r.kind === 'overtime' && r.status === 'approved' && r.employeeId === e.id && r.overtime?.date.startsWith(month))
    .reduce((n, r) => n + r.overtime!.hours, 0)
  const unpaidLeaveDays = s.hrRequests
    .filter((r) => r.kind === 'leave' && r.leave?.type === 'unpaid' && r.status === 'approved' && r.employeeId === e.id)
    .reduce((n, r) => n + workingDays(s, r.leave!.from > `${month}-01` ? r.leave!.from : `${month}-01`, r.leave!.to < `${month}-31` ? r.leave!.to : `${month}-31`), 0)
  const loans = activeLoans(s, e.id)

  const overtime = Math.round((e.baseSalary / p.overtimeDivisor) * 1.5 * overtimeHours)
  const unpaid = Math.round((e.baseSalary / p.workDaysPerMonth) * unpaidLeaveDays)
  const earnings: PayLine[] = [...fixed.filter((x) => x.c!.kind === 'earning').map((x) => ({ label: x.c!.name, amount: x.amount })), ...(overtime ? [{ label: `Overtime, ${overtimeHours} h`, amount: overtime }] : [])]
  const deductions: PayLine[] = [
    ...fixed.filter((x) => x.c!.kind === 'deduction').map((x) => ({ label: x.c!.name, amount: x.amount })),
    ...(unpaid ? [{ label: `Unpaid leave, ${unpaidLeaveDays} days`, amount: unpaid }] : []),
    ...loans.map((r) => ({ label: `Loan ${r.code}, installment ${r.loan!.paidInstallments + 1} of ${r.loan!.installments}`, amount: loanInstallment(r) })),
  ]
  const taxableExtras = fixed.filter((x) => x.c!.kind === 'earning' && x.c!.taxable).reduce((n, x) => n + x.amount, 0)
  const gross = e.baseSalary + taxableExtras + overtime - unpaid
  const health = Math.min(e.baseSalary + taxableExtras, p.bpjsKesCap)
  const pension = pct(e.baseSalary, p.jhtEmployeePct) + pct(Math.min(e.baseSalary, p.jpCap), p.jpEmployeePct)
  const bpjsEmployee = pct(health, p.bpjsKesEmployeePct) + pension
  const bpjsCompany =
    pct(health, p.bpjsKesCompanyPct) + pct(e.baseSalary, p.jhtCompanyPct) + pct(Math.min(e.baseSalary, p.jpCap), p.jpCompanyPct) + pct(e.baseSalary, p.jkkPct) + pct(e.baseSalary, p.jkmPct)
  const tax = pph21Monthly(gross + pct(e.baseSalary, p.jkkPct) + pct(e.baseSalary, p.jkmPct), pension, e.ptkp)
  const earned = e.baseSalary + earnings.reduce((n, l) => n + l.amount, 0)
  const net = earned - deductions.reduce((n, l) => n + l.amount, 0) - bpjsEmployee - tax
  return { employeeId: e.id, base: e.baseSalary, earnings, deductions, overtimeHours, unpaidLeaveDays, loanIds: loans.map((r) => r.id), gross, bpjsEmployee, bpjsCompany, tax, net }
}

/** Everyone on the books for the month: joined by its last day and not gone before its first. */
const payrollEmployees = (s: Pick<AppState, 'employees'>, month: string) =>
  s.employees.filter((e) => ymd(e.joinedAt) <= `${month}-31` && (!e.leftAt || ymd(e.leftAt) >= `${month}-01`))

export const calcPayroll = (s: PayrollData, month: string) => payrollEmployees(s, month).map((e) => calcPayslip(s, e, month))

export const payrollTotals = (slips: Payslip[]) => {
  const sum = (f: (p: Payslip) => number) => slips.reduce((n, p) => n + f(p), 0)
  return { gross: sum((p) => p.gross), tax: sum((p) => p.tax), bpjsEmployee: sum((p) => p.bpjsEmployee), bpjsCompany: sum((p) => p.bpjsCompany), net: sum((p) => p.net), cost: sum((p) => p.gross + p.bpjsCompany) }
}

// ---------------------------------------------------------------- performance

/** 0 to 120: actual against target, inverted for lower-is-better KPIs. */
export const kpiAchievement = (kpi: Pick<KpiDefinition, 'direction'>, target: number, actual: number | null) => {
  if (actual === null || target <= 0) return null
  const ratio = kpi.direction === 'higher' ? actual / target : actual <= 0 ? 1.2 : target / actual
  return Math.min(Math.round(ratio * 100), 120)
}

export const scorecardScore = (s: Pick<AppState, 'kpis'>, sc: Scorecard) => {
  let weighted = 0
  let weights = 0
  for (const entry of sc.entries) {
    const kpi = s.kpis.find((k) => k.id === entry.kpiId)
    const ach = kpi && kpiAchievement(kpi, entry.target, entry.actual)
    if (kpi && ach !== null && ach !== undefined) {
      weighted += ach * kpi.weight
      weights += kpi.weight
    }
  }
  return weights ? Math.round(weighted / weights) : null
}

export const SCORE_BANDS: [number, string][] = [
  [110, 'Outstanding'],
  [95, 'Exceeds'],
  [80, 'Meets'],
  [60, 'Needs improvement'],
  [0, 'Below expectations'],
]
export const scoreBand = (score: number) => SCORE_BANDS.find(([min]) => score >= min)![1]

/** Self, manager, two peers from the same department, and each direct report rating their manager. */
export const reviewPairs = (s: Pick<AppState, 'employees'>): { subjectId: string; reviewerId: string; relation: ReviewRelation }[] => {
  const people = s.employees.filter((e) => e.status === 'active')
  return people.flatMap((e) => {
    const peers = people.filter((p) => p.id !== e.id && p.departmentId === e.departmentId && p.id !== e.managerId).slice(0, 2)
    return [
      { subjectId: e.id, reviewerId: e.id, relation: 'self' as const },
      ...(e.managerId && people.some((m) => m.id === e.managerId) ? [{ subjectId: e.id, reviewerId: e.managerId, relation: 'manager' as const }] : []),
      ...peers.map((p) => ({ subjectId: e.id, reviewerId: p.id, relation: 'peer' as const })),
      ...people.filter((r) => r.managerId === e.id).map((r) => ({ subjectId: e.id, reviewerId: r.id, relation: 'report' as const })),
    ]
  })
}

/** Average score per relation and overall for one person in a cycle; only submitted reviews count. */
export const reviewSummary = (s: Pick<AppState, 'reviews'>, cycleId: string, subjectId: string) => {
  const done = s.reviews.filter((r) => r.cycleId === cycleId && r.subjectId === subjectId && r.submittedAt)
  const avg = (rs: Review[]) => {
    const scores = rs.flatMap((r) => r.answers.map((a) => a.score))
    return scores.length ? Math.round((scores.reduce((n, x) => n + x, 0) / scores.length) * 10) / 10 : null
  }
  const total = s.reviews.filter((r) => r.cycleId === cycleId && r.subjectId === subjectId).length
  return {
    submitted: done.length,
    total,
    overall: avg(done),
    byRelation: (['self', 'manager', 'peer', 'report'] as ReviewRelation[]).map((relation) => ({ relation, score: avg(done.filter((r) => r.relation === relation)) })),
  }
}

// ---------------------------------------------------------------- recruitment and engagement

export const PIPELINE: CandidateStage[] = ['applied', 'screening', 'test', 'interview', 'offer', 'hired']

export const hiredCount = (s: Pick<AppState, 'candidates'>, openingId: string) => s.candidates.filter((c) => c.openingId === openingId && c.stage === 'hired').length

export const nextEmployeeCode = (s: Pick<AppState, 'employees'>) => nextCode(s.employees.map((e) => e.code), 'EMP-', 3)
export const nextOpeningCode = (s: Pick<AppState, 'jobOpenings'>, at: string) => nextCode(s.jobOpenings.map((o) => o.code), `JOB-${at.slice(2, 4)}-`, 3)
export const nextContractCode = (s: Pick<AppState, 'contracts'>) => nextCode(s.contracts.map((c) => c.code), 'PKWT-26-', 4)

/** The next due date after completing a recurring task now. */
const nextDueAfter = (t: Pick<RecurringTask, 'every' | 'nextDue'>, nowMs: number) => {
  const step = (iso: string) => {
    const d = new Date(iso)
    if (t.every === 'daily') d.setDate(d.getDate() + 1)
    else if (t.every === 'weekly') d.setDate(d.getDate() + 7)
    else d.setMonth(d.getMonth() + 1)
    return d.toISOString()
  }
  let next = step(t.nextDue)
  while (toMs(next) <= nowMs) next = step(next)
  return next
}

/** Announcements a user can see, pinned first, newest next. */
export const announcementsFor = (s: Pick<AppState, 'announcements' | 'employees'>, userId: string) => {
  const dept = employeeOfUser(s, userId)?.departmentId
  return s.announcements
    .filter((a) => !a.departmentId || a.departmentId === dept)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt))
}

// ---------------------------------------------------------------- analytics

export const headcountBy = <K extends 'departmentId' | 'branchId' | 'type' | 'gender'>(s: Pick<AppState, 'employees'>, key: K) => {
  const counts = new Map<string, number>()
  for (const e of currentEmployees(s)) counts.set(e[key], (counts.get(e[key]) ?? 0) + 1)
  return [...counts].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
}

/** Leavers in the year divided by average headcount, as a percentage. */
export const turnover = (s: Pick<AppState, 'employees'>, year: number) => {
  const y = String(year)
  const left = s.employees.filter((e) => e.leftAt?.startsWith(y)).length
  const start = s.employees.filter((e) => ymd(e.joinedAt) < `${y}-01-01` && (!e.leftAt || ymd(e.leftAt) >= `${y}-01-01`)).length
  const now = currentEmployees(s).length
  const avg = (start + now) / 2
  return { left, joined: s.employees.filter((e) => e.joinedAt.startsWith(y)).length, rate: avg ? (left / avg) * 100 : 0 }
}

// ---------------------------------------------------------------- blockers

const DIGITS = (v: string) => v.replace(/\D/g, '')

const employeeBlocker = (s: AppState, e: Employee): string | null => {
  if (!e.name.trim()) return 'Enter the employee name.'
  if (!/^\S+@\S+\.\S+$/.test(e.email)) return 'Enter a valid work email.'
  if (s.employees.some((x) => x.id !== e.id && x.email.toLowerCase() === e.email.toLowerCase())) return 'Another employee uses this email.'
  if (e.nik && DIGITS(e.nik).length !== 16) return 'A KTP number (NIK) has 16 digits.'
  if (e.npwp && !/^\d{15,16}$/.test(DIGITS(e.npwp))) return 'An NPWP has 15 or 16 digits.'
  if (!s.departments.some((d) => d.id === e.departmentId)) return 'Pick a department.'
  const position = s.positions.find((p) => p.id === e.positionId)
  if (!position) return 'Pick a position.'
  if (position.departmentId !== e.departmentId) return 'The position belongs to another department.'
  if (e.sectionId && s.sections.find((x) => x.id === e.sectionId)?.departmentId !== e.departmentId) return 'The section belongs to another department.'
  if (e.managerId === e.id) return 'An employee cannot report to themselves.'
  if (e.managerId && !s.employees.some((x) => x.id === e.managerId && x.status !== 'left')) return 'Pick a current employee as the manager.'
  if (!s.shifts.some((x) => x.id === e.shiftId)) return 'Pick a shift.'
  if (e.baseSalary <= 0) return 'Enter a base salary above Rp 0.'
  if (e.annualLeave < 0) return 'Annual leave cannot be negative.'
  if (e.userId && s.employees.some((x) => x.id !== e.id && x.userId === e.userId && x.status !== 'left')) return 'This console user is linked to another employee.'
  return null
}

const contractBlocker = (s: AppState, c: EmploymentContract): string | null => {
  if (!s.employees.some((e) => e.id === c.employeeId)) return 'Pick an employee.'
  if (c.salary <= 0) return 'Enter the contract salary.'
  if (c.type === 'permanent' && c.endsOn) return 'A permanent contract has no end date.'
  if (c.type !== 'permanent' && !c.endsOn) return 'A fixed-term contract needs an end date.'
  if (c.endsOn && c.endsOn <= c.startsOn) return 'The contract must end after it starts.'
  // PKWT runs at most five years in total under PP 35/2021.
  if (c.type === 'contract' && c.endsOn && toMs(c.endsOn) - toMs(c.startsOn) > 5 * 366 * DAY) return 'A fixed-term contract can run at most five years.'
  return null
}

const requestBlocker = (s: AppState, r: HrRequest): string | null => {
  const e = s.employees.find((x) => x.id === r.employeeId)
  if (!e || e.status === 'left') return 'Pick a current employee.'
  if (!r.reason.trim()) return 'Give a reason.'
  if (r.kind === 'leave') {
    const l = r.leave
    if (!l || l.to < l.from) return 'The leave must end on or after its first day.'
    if (l.days <= 0) return 'The dates cover no working days.'
    const clash = s.hrRequests.find((x) => x.id !== r.id && x.employeeId === r.employeeId && x.kind === 'leave' && (x.status === 'pending' || x.status === 'approved') && x.leave!.from <= l.to && x.leave!.to >= l.from)
    if (clash) return `${clash.code} already covers some of these days.`
    if (l.type === 'annual') {
      const left = leaveBalance(s, r.employeeId, Number(l.from.slice(0, 4))).left
      if (l.days > left) return `Only ${left} ${left === 1 ? 'day' : 'days'} of annual leave left this year.`
    }
    if (l.type === 'maternity' && e.gender !== 'female') return 'Maternity leave applies to female employees.'
  }
  if (r.kind === 'overtime') {
    const o = r.overtime
    if (!o || o.hours < 0.5 || o.hours > 4) return 'Overtime runs from half an hour to 4 hours a day.'
    if (s.hrRequests.some((x) => x.id !== r.id && x.kind === 'overtime' && x.employeeId === r.employeeId && x.overtime?.date === o.date && x.status !== 'rejected' && x.status !== 'cancelled'))
      return 'An overtime request for this day already exists.'
  }
  if (r.kind === 'loan') {
    const l = r.loan
    if (!l || l.amount <= 0) return 'Enter the loan amount.'
    if (l.amount > e.baseSalary * 3) return `A loan can be at most three months of base salary, ${fmtIdr(e.baseSalary * 3)}.`
    if (l.installments < 1 || l.installments > 12) return 'Repay in 1 to 12 monthly installments.'
    if (activeLoans(s, e.id).length || s.hrRequests.some((x) => x.id !== r.id && x.kind === 'loan' && x.employeeId === e.id && x.status === 'pending'))
      return 'The employee already has a loan open or waiting.'
  }
  return null
}

const kpiBlocker = (s: AppState, k: KpiDefinition): string | null => {
  if (!k.name.trim()) return 'Name the KPI.'
  if (k.target <= 0) return 'Set a target above zero.'
  if (k.weight <= 0 || k.weight > 100) return 'The weight is a percentage from 1 to 100.'
  if (!k.positionIds.length) return 'Pick at least one position.'
  for (const pid of k.positionIds) {
    const total = s.kpis.filter((x) => x.id !== k.id && x.positionIds.includes(pid)).reduce((n, x) => n + x.weight, 0) + k.weight
    if (total > 100) return `KPI weights for ${s.positions.find((p) => p.id === pid)?.name ?? 'a position'} would total ${total}%.`
  }
  return null
}

export const hrBlocker = (s: AppState, a: HrAction, nowMs: number): string | null => {
  switch (a.type) {
    case 'departments/upsert':
      if (!a.department.name.trim() || !a.department.code.trim()) return 'Enter a code and a name.'
      if (s.departments.some((d) => d.id !== a.department.id && d.code.toLowerCase() === a.department.code.toLowerCase())) return 'Another department uses this code.'
      return a.department.parentId === a.department.id ? 'A department cannot sit under itself.' : null
    case 'departments/remove':
      if (s.employees.some((e) => e.departmentId === a.id && e.status !== 'left')) return 'Employees still belong to this department.'
      return s.positions.some((p) => p.departmentId === a.id) ? 'Move or remove its positions first.' : null
    case 'sections/upsert':
      return a.section.name.trim() ? null : 'Name the section.'
    case 'sections/remove':
      return s.employees.some((e) => e.sectionId === a.id && e.status !== 'left') ? 'Employees still belong to this section.' : null
    case 'positions/upsert':
      if (!a.position.name.trim()) return 'Name the position.'
      return a.position.grade < 1 || a.position.grade > 6 ? 'Grades run from 1 to 6.' : null
    case 'positions/remove':
      return s.employees.some((e) => e.positionId === a.id && e.status !== 'left') ? 'Employees still hold this position.' : null
    case 'employees/create':
      return employeeBlocker(s, a.employee) ?? (a.contract ? contractBlocker({ ...s, employees: [...s.employees, a.employee] }, a.contract) : null)
    case 'employees/update': {
      const e = s.employees.find((x) => x.id === a.id)
      return e ? employeeBlocker(s, { ...e, ...a.patch }) : 'Employee not found.'
    }
    case 'employees/activate': {
      const e = s.employees.find((x) => x.id === a.id)
      if (e?.status !== 'onboarding') return 'Only an employee in onboarding can be activated.'
      const c = openChecklist(s, a.id, 'onboarding')
      const left = c ? c.items.length - checklistProgress(c).done : 0
      return left ? `${left} onboarding ${left === 1 ? 'item is' : 'items are'} still open.` : null
    }
    case 'employees/offboard': {
      const e = s.employees.find((x) => x.id === a.id)
      if (e?.status !== 'active') return 'Only an active employee can start offboarding.'
      if (!a.reason.trim()) return 'Give the reason the employee leaves.'
      return a.lastDay < ymd(e.joinedAt) ? 'The last day comes before the join date.' : null
    }
    case 'employees/release': {
      const e = s.employees.find((x) => x.id === a.id)
      if (e?.status !== 'offboarding') return 'Start offboarding first.'
      const c = openChecklist(s, a.id, 'offboarding')
      const left = c ? c.items.length - checklistProgress(c).done : 0
      if (left) return `${left} offboarding ${left === 1 ? 'item is' : 'items are'} still open.`
      return directReports(s, a.id).length ? 'Move this employee\'s direct reports to another manager first.' : null
    }
    case 'contracts/upsert':
      return contractBlocker(s, a.contract)
    case 'contracts/renew': {
      const old = s.contracts.find((c) => c.id === a.id)
      if (!old || old.status === 'ended') return 'Only a current contract can be renewed.'
      return contractBlocker(s, a.contract) ?? (a.contract.startsOn <= old.startsOn ? 'The new contract must start after the current one.' : null)
    }
    case 'checklists/toggle': {
      const c = s.checklists.find((x) => x.id === a.id)
      if (!c) return 'Checklist not found.'
      return c.completedAt ? 'The checklist is complete.' : c.items.some((i) => i.id === a.itemId) ? null : 'Item not found.'
    }
    case 'checklistTemplates/update':
      return a.template.items.some((i) => !i.label.trim()) ? 'Describe every item.' : a.template.items.length ? null : 'Add at least one item.'
    case 'shifts/upsert': {
      const sh = a.shift
      if (!sh.name.trim() || !sh.code.trim()) return 'Enter a code and a name.'
      if (!/^\d{2}:\d{2}$/.test(sh.start) || !/^\d{2}:\d{2}$/.test(sh.end)) return 'Enter start and end as HH:MM.'
      if (minutes(sh.end) <= minutes(sh.start)) return 'The shift must end after it starts. Overnight shifts are not supported yet.'
      if (sh.breakMinutes < 0 || sh.breakMinutes >= minutes(sh.end) - minutes(sh.start)) return 'The break must be shorter than the shift.'
      return sh.days.length ? null : 'Pick the days the shift runs.'
    }
    case 'shifts/remove':
      if (s.employees.some((e) => e.shiftId === a.id && e.status !== 'left')) return 'Employees work this shift. Move them to another shift first.'
      return s.scheduleOverrides.some((o) => o.shiftId === a.id) ? 'The roster uses this shift on some days.' : null
    case 'schedule/set':
      return s.employees.some((e) => e.id === a.employeeId) ? null : 'Employee not found.'
    case 'holidays/upsert':
      if (!a.holiday.name.trim()) return 'Name the holiday.'
      return s.holidays.some((h) => h.id !== a.holiday.id && h.date === a.holiday.date) ? 'Another holiday falls on this date.' : null
    case 'holidays/remove':
      return null
    case 'attendance/checkIn': {
      const at = a.attendance
      const e = s.employees.find((x) => x.id === at.employeeId)
      if (!e || e.status === 'left') return 'Pick a current employee.'
      if (s.attendance.some((x) => x.employeeId === at.employeeId && x.date === at.date && x.checkIn)) return `${e.name} already checked in today.`
      const radius = s.hrSettings.checkInRadiusM
      if (radius && !at.location) return 'Allow location access to check in.'
      if (radius && at.distanceM !== null && at.distanceM > radius) return `The check-in is ${fmtDistance(at.distanceM)} from the office. Check in within ${fmtDistance(radius)}.`
      return null
    }
    case 'attendance/checkOut': {
      const r = s.attendance.find((x) => x.id === a.id)
      if (!r?.checkIn) return 'Check in first.'
      if (r.checkOut) return 'Already checked out.'
      return toMs(a.at) <= toMs(r.checkIn) ? 'Check-out must come after check-in.' : null
    }
    case 'attendance/correct': {
      const r = a.attendance
      if (!r.note.trim()) return 'Say why the record changes.'
      if (r.checkIn && r.checkOut && toMs(r.checkOut) <= toMs(r.checkIn)) return 'Check-out must come after check-in.'
      return s.attendance.some((x) => x.id !== r.id && x.employeeId === r.employeeId && x.date === r.date) ? 'This day already has a record. Edit that one.' : null
    }
    case 'hrRequests/create':
      return requestBlocker(s, a.request)
    case 'hrRequests/decide': {
      const r = s.hrRequests.find((x) => x.id === a.id)
      const step = r && currentStep(r)
      if (!r || !step) return 'This request is not waiting for a decision.'
      if (s.employees.find((e) => e.id === r.employeeId)?.userId === a.by) return 'You cannot approve your own request.'
      if (step.approverId && step.approverId !== a.by) return `Waiting for ${s.users.find((u) => u.id === step.approverId)?.name ?? 'the manager'} to decide.`
      if (a.decision === 'rejected' && !a.note.trim()) return 'Say why the request is rejected.'
      // A leave approval re-checks the balance, since other leave may have been approved meanwhile.
      if (a.decision === 'approved' && r.leave?.type === 'annual' && r.steps.filter((x) => x.decision === 'pending').length === 1) {
        const b = leaveBalance(s, r.employeeId, Number(r.leave.from.slice(0, 4)))
        if (b.quota - b.used < r.leave.days) return `Only ${b.quota - b.used} days of annual leave left.`
      }
      return null
    }
    case 'hrRequests/cancel': {
      const r = s.hrRequests.find((x) => x.id === a.id)
      if (!r) return 'Request not found.'
      if (r.status === 'pending') return null
      if (r.status === 'approved' && r.kind === 'leave' && r.leave!.from > ymd(nowMs)) return null
      return r.status === 'approved' ? 'Only leave that has not started can be cancelled after approval.' : 'The request is already closed.'
    }
    case 'payComponents/upsert':
      if (!a.component.name.trim() || !a.component.code.trim()) return 'Enter a code and a name.'
      return s.payComponents.some((c) => c.id !== a.component.id && c.code === a.component.code) ? 'Another component uses this code.' : null
    case 'payComponents/remove': {
      const used = s.employees.filter((e) => e.status !== 'left' && e.allowances.some((x) => x.componentId === a.id)).length
      return used ? `${used} ${used === 1 ? 'employee has' : 'employees have'} this component. Remove it from them first.` : null
    }
    case 'payrollSettings/update': {
      const p = { ...s.payrollSettings, ...a.patch }
      const rates = [p.bpjsKesEmployeePct, p.bpjsKesCompanyPct, p.jhtEmployeePct, p.jhtCompanyPct, p.jpEmployeePct, p.jpCompanyPct, p.jkkPct, p.jkmPct]
      if (rates.some((r) => r < 0 || r > 20)) return 'Contribution rates run from 0% to 20%.'
      if (p.payDay < 1 || p.payDay > 28 || p.cutoffDay < 1 || p.cutoffDay > 28) return 'Pay day and cut-off fall on day 1 to 28.'
      return p.overtimeDivisor <= 0 || p.workDaysPerMonth <= 0 ? 'Divisors must be above zero.' : null
    }
    case 'payroll/calculate': {
      const run = s.payrollRuns.find((r) => r.month === a.month)
      if (run && run.status !== 'draft') return `Payroll for ${a.month} is ${run.status}. It can no longer be recalculated.`
      if (a.month > ymd(nowMs).slice(0, 7)) return 'Payroll can only run for this month or earlier.'
      const earlier = s.payrollRuns.filter((r) => r.month < a.month && r.status !== 'paid')
      if (earlier.length) return `Pay ${earlier[0].code} first.`
      return payrollEmployees(s, a.month).length ? null : 'Nobody was employed that month.'
    }
    case 'payroll/approve':
      return s.payrollRuns.find((r) => r.id === a.id)?.status === 'draft' ? null : 'Only a draft payroll can be approved.'
    case 'payroll/pay':
      return s.payrollRuns.find((r) => r.id === a.id)?.status === 'approved' ? null : 'Approve the payroll before paying it.'
    case 'kpis/upsert':
      return kpiBlocker(s, a.kpi)
    case 'kpis/remove':
      return s.scorecards.some((sc) => sc.status !== 'final' && sc.entries.some((e) => e.kpiId === a.id)) ? 'Open scorecards use this KPI.' : null
    case 'scorecards/upsert': {
      const old = s.scorecards.find((x) => x.id === a.scorecard.id)
      if (old?.status === 'final') return 'A final scorecard cannot change.'
      if (!a.scorecard.entries.length) return 'The employee\'s position has no KPIs yet.'
      return s.scorecards.some((x) => x.id !== a.scorecard.id && x.employeeId === a.scorecard.employeeId && x.period === a.scorecard.period) ? 'This employee already has a scorecard for the period.' : null
    }
    case 'scorecards/submit': {
      const sc = s.scorecards.find((x) => x.id === a.id)
      if (sc?.status !== 'draft') return 'Only a draft can be submitted.'
      const missing = sc.entries.filter((e) => e.actual === null).length
      return missing ? `Enter the actual for ${missing} more ${missing === 1 ? 'KPI' : 'KPIs'}.` : null
    }
    case 'scorecards/finalize':
      return s.scorecards.find((x) => x.id === a.id)?.status === 'submitted' ? null : 'Submit the scorecard first.'
    case 'cycles/upsert': {
      const old = s.reviewCycles.find((c) => c.id === a.cycle.id)
      if (old && old.status !== 'draft') return 'Only a draft cycle can be edited.'
      if (!a.cycle.name.trim()) return 'Name the cycle.'
      if (!a.cycle.questions.length || a.cycle.questions.some((q) => !q.text.trim())) return 'Add at least one question, and fill in every question.'
      return a.cycle.dueAt <= a.cycle.opensAt ? 'The due date must come after the open date.' : null
    }
    case 'cycles/open':
      if (s.reviewCycles.find((c) => c.id === a.id)?.status !== 'draft') return 'Only a draft cycle can open.'
      return s.reviewCycles.some((c) => c.status === 'open') ? 'Close the open cycle first.' : null
    case 'cycles/close':
      return s.reviewCycles.find((c) => c.id === a.id)?.status === 'open' ? null : 'Only an open cycle can close.'
    case 'reviews/submit': {
      const r = s.reviews.find((x) => x.id === a.id)
      if (!r) return 'Review not found.'
      if (r.submittedAt) return 'This review is already submitted.'
      const cycle = s.reviewCycles.find((c) => c.id === r.cycleId)
      if (cycle?.status !== 'open') return 'The cycle is closed.'
      if (s.employees.find((e) => e.id === r.reviewerId)?.userId !== a.by) return 'Only the reviewer can submit this review.'
      if (cycle.questions.some((q) => !a.answers.some((x) => x.questionId === q.id))) return 'Score every question.'
      return a.answers.some((x) => x.score < 1 || x.score > 5) ? 'Scores run from 1 to 5.' : null
    }
    case 'openings/upsert': {
      const o = a.opening
      if (!o.title.trim()) return 'Give the opening a title.'
      if (o.headcount < 1) return 'Hire at least one person.'
      return o.status === 'open' && o.description.trim().length < 40 ? 'Write a job description of at least 40 characters before opening.' : null
    }
    case 'candidates/upsert': {
      const c = a.candidate
      if (!c.name.trim()) return 'Enter the candidate name.'
      if (!/^\S+@\S+\.\S+$/.test(c.email)) return 'Enter a valid email.'
      return s.candidates.some((x) => x.id !== c.id && x.email.toLowerCase() === c.email.toLowerCase() && x.openingId === c.openingId) ? 'This candidate already applied for the opening.' : null
    }
    case 'candidates/move': {
      const c = s.candidates.find((x) => x.id === a.id)
      if (!c) return 'Candidate not found.'
      if (c.stage === 'hired') return 'The candidate is hired.'
      if (c.stage === a.stage) return `The candidate is already at ${CANDIDATE_STAGE_LABEL[a.stage]}.`
      if (a.stage === 'rejected' && !a.reason?.trim()) return 'Say why the candidate is rejected.'
      if (a.stage !== 'rejected' && !c.openingId) return 'Attach the candidate to an opening first.'
      return null
    }
    case 'candidates/addTest':
      return a.result.score < 0 || a.result.score > 100 ? 'Scores run from 0 to 100.' : null
    case 'candidates/schedule':
      if (!a.interview.interviewerIds.length) return 'Pick at least one interviewer.'
      if (toMs(a.interview.at) < nowMs) return 'Schedule the interview in the future.'
      return a.interview.mode === 'video' && !/^https?:\/\//.test(a.interview.link) ? 'Add the video call link.' : null
    case 'candidates/feedback':
      return a.score < 1 || a.score > 5 ? 'Scores run from 1 to 5.' : a.feedback.trim() ? null : 'Write the feedback.'
    case 'candidates/offer': {
      const c = s.candidates.find((x) => x.id === a.id)
      if (!c || c.stage !== 'offer') return 'Move the candidate to the offer stage first.'
      return a.offer.salary <= 0 ? 'Enter the offered salary.' : null
    }
    case 'candidates/hire': {
      const c = s.candidates.find((x) => x.id === a.id)
      if (c?.offer?.status !== 'accepted') return 'The candidate must accept the offer first.'
      if (c.employeeId) return 'The candidate is already hired.'
      return employeeBlocker(s, a.employee) ?? contractBlocker({ ...s, employees: [...s.employees, a.employee] }, a.contract)
    }
    case 'candidates/apply': {
      const c = a.candidate
      const opening = s.jobOpenings.find((o) => o.id === c.openingId)
      if (!opening || opening.status !== 'open') return 'This opening is no longer taking applications.'
      if (!c.phone.replace(/\D/g, '').match(/^\d{9,14}$/)) return 'Enter a phone number we can call.'
      if (!c.cvName) return 'Attach your CV.'
      return hrBlocker(s, { type: 'candidates/upsert', candidate: c }, nowMs)
    }
    case 'candidates/portal': {
      const c = s.candidates.find((x) => x.id === a.id)
      if (!c) return 'Candidate not found.'
      if (c.stage === 'hired' || c.stage === 'rejected') return `The candidate is ${CANDIDATE_STAGE_LABEL[c.stage].toLowerCase()}.`
      return a.testIds.every((id) => s.psychTests.some((x) => x.id === id)) ? null : 'Pick tests from the list.'
    }
    case 'candidates/takeTest': {
      const c = s.candidates.find((x) => x.id === a.id)
      const test = s.psychTests.find((x) => x.id === a.testId)
      if (!c || !test) return 'This test link is not valid.'
      if (!c.assignedTestIds?.includes(test.id)) return 'This test was not assigned to you.'
      if (c.tests.some((x) => x.testId === test.id)) return 'You already took this test.'
      return a.answers.length === test.questions.length && a.answers.every((x) => x >= 0) ? null : 'Answer every question.'
    }
    case 'candidates/respondInterview': {
      const i = s.candidates.find((x) => x.id === a.id)?.interviews.find((x) => x.id === a.interviewId)
      if (!i) return 'Interview not found.'
      if (toMs(i.at) < nowMs) return 'This interview has passed.'
      return a.kind === 'reschedule' && !a.note.trim() ? 'Suggest a time that works for you.' : null
    }
    case 'candidates/respondOffer': {
      const offer = s.candidates.find((x) => x.id === a.id)?.offer
      if (!offer || offer.status === 'draft') return 'There is no offer to answer.'
      return offer.status === 'sent' ? null : `You already ${offer.status} this offer.`
    }
    case 'announcements/upsert':
      return a.announcement.title.trim() && a.announcement.body.trim() ? null : 'Write a title and a message.'
    case 'announcements/remove':
    case 'announcements/read':
      return null
    case 'logbook/add':
      if (!a.entry.text.trim()) return 'Describe what you worked on.'
      if (a.entry.hours <= 0 || a.entry.hours > 24) return 'Hours run from 0.5 to 24.'
      return a.entry.date > ymd(nowMs) ? 'Log work for today or earlier.' : null
    case 'recurring/upsert':
      if (!a.task.title.trim()) return 'Name the task.'
      return s.employees.some((e) => e.id === a.task.assigneeId && e.status !== 'left') ? null : 'Assign the task to a current employee.'
    case 'recurring/remove':
      return null
    case 'recurring/complete':
      return s.recurringTasks.find((t) => t.id === a.id)?.active ? null : 'The task is paused.'
    case 'hrSettings/update': {
      const h = { ...s.hrSettings, ...a.patch }
      if (h.lateGraceMinutes < 0 || h.lateGraceMinutes > 120) return 'Grace runs from 0 to 120 minutes.'
      if (h.checkInRadiusM < 0) return 'The radius cannot be negative.'
      if (h.contractAlertDays < 1) return 'Alert at least 1 day before a contract ends.'
      return h.offices.some((o) => !Number.isFinite(o.lat) || !Number.isFinite(o.lng) || Math.abs(o.lat) > 90 || Math.abs(o.lng) > 180)
        ? 'Enter office coordinates as latitude -90 to 90 and longitude -180 to 180.'
        : null
    }
    case 'hr/sweep':
      return null
  }
}

export const fmtDistance = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`)

// ---------------------------------------------------------------- reducer

const hire = (s: AppState, e: Employee, contract: EmploymentContract | null, at: string): AppState => ({
  ...s,
  employees: [...s.employees, { ...e, status: 'onboarding' }],
  contracts: contract ? [contract, ...s.contracts] : s.contracts,
  checklists: [startChecklist(s, e.id, 'onboarding', at), ...s.checklists],
})

const patchCandidate = (s: AppState, id: string, fn: (c: Candidate) => Candidate) => ({ ...s, candidates: patchById(s.candidates, id, fn) })

export const hrApply = (s: AppState, a: HrAction, at: string, by: string, nowMs: number): AppState => {
  switch (a.type) {
    case 'departments/upsert':
      return { ...s, departments: upsert(s.departments, a.department) }
    case 'departments/remove':
      return { ...s, departments: s.departments.filter((d) => d.id !== a.id), sections: s.sections.filter((x) => x.departmentId !== a.id) }
    case 'sections/upsert':
      return { ...s, sections: upsert(s.sections, a.section) }
    case 'sections/remove':
      return { ...s, sections: s.sections.filter((x) => x.id !== a.id) }
    case 'positions/upsert':
      return { ...s, positions: upsert(s.positions, a.position) }
    case 'positions/remove':
      return { ...s, positions: s.positions.filter((p) => p.id !== a.id) }
    case 'employees/create':
      return hire(s, a.employee, a.contract, at)
    case 'employees/update':
      return { ...s, employees: patchById(s.employees, a.id, (e) => ({ ...e, ...a.patch })) }
    case 'employees/activate':
      return { ...s, employees: patchById(s.employees, a.id, (e) => ({ ...e, status: 'active' })) }
    case 'employees/offboard':
      return {
        ...s,
        employees: patchById(s.employees, a.id, (e) => ({ ...e, status: 'offboarding', leftAt: new Date(`${a.lastDay}T17:00:00`).toISOString(), leftReason: a.reason })),
        checklists: [startChecklist(s, a.id, 'offboarding', at), ...s.checklists],
      }
    case 'employees/release':
      return {
        ...s,
        employees: patchById(s.employees, a.id, (e) => ({ ...e, status: 'left' })),
        contracts: s.contracts.map((c) => (c.employeeId === a.id && c.status === 'active' ? { ...c, status: 'ended' } : c)),
      }
    case 'contracts/upsert':
      return { ...s, contracts: upsert(s.contracts, a.contract, true) }
    case 'contracts/renew':
      return {
        ...s,
        contracts: [a.contract, ...patchById(s.contracts, a.id, (c) => ({ ...c, status: 'ended' as const }))],
        employees: patchById(s.employees, a.contract.employeeId, (e) => ({ ...e, type: a.contract.type, baseSalary: a.contract.salary })),
      }
    case 'checklists/toggle':
      return {
        ...s,
        checklists: patchById(s.checklists, a.id, (c) => {
          const items = c.items.map((i) => (i.id === a.itemId ? { ...i, doneAt: i.doneAt ? null : at, doneBy: i.doneAt ? null : by } : i))
          return { ...c, items, completedAt: items.every((i) => i.doneAt) ? at : null }
        }),
      }
    case 'checklistTemplates/update':
      return { ...s, checklistTemplates: upsert(s.checklistTemplates, a.template) }
    case 'shifts/upsert':
      return { ...s, shifts: upsert(s.shifts, a.shift) }
    case 'shifts/remove':
      return { ...s, shifts: s.shifts.filter((x) => x.id !== a.id) }
    case 'schedule/set': {
      const rest = s.scheduleOverrides.filter((o) => !(o.employeeId === a.employeeId && o.date === a.date))
      if (a.shiftId === 'default') return { ...s, scheduleOverrides: rest }
      const row: ScheduleOverride = { id: newId('sch'), employeeId: a.employeeId, date: a.date, shiftId: a.shiftId }
      return { ...s, scheduleOverrides: [...rest, row] }
    }
    case 'holidays/upsert':
      return { ...s, holidays: upsert(s.holidays, a.holiday).sort((x, y) => x.date.localeCompare(y.date)) }
    case 'holidays/remove':
      return { ...s, holidays: s.holidays.filter((h) => h.id !== a.id) }
    case 'attendance/checkIn':
      return { ...s, attendance: [a.attendance, ...s.attendance] }
    case 'attendance/checkOut':
      return { ...s, attendance: patchById(s.attendance, a.id, (r) => ({ ...r, checkOut: a.at })) }
    case 'attendance/correct':
      return { ...s, attendance: upsert(s.attendance, a.attendance, true) }
    case 'hrRequests/create':
      return { ...s, hrRequests: [{ ...a.request, status: 'pending', createdBy: by, createdAt: at }, ...s.hrRequests] }
    case 'hrRequests/decide':
      return {
        ...s,
        hrRequests: patchById(s.hrRequests, a.id, (r) => {
          const i = r.steps.findIndex((st) => st.decision === 'pending')
          const steps = r.steps.map((st, j) => (j === i ? { ...st, decision: a.decision, by: a.by, at, note: a.note } : st))
          const status = a.decision === 'rejected' ? 'rejected' : steps.every((st) => st.decision === 'approved') ? 'approved' : 'pending'
          return { ...r, steps, status }
        }),
      }
    case 'hrRequests/cancel':
      return { ...s, hrRequests: patchById(s.hrRequests, a.id, (r) => ({ ...r, status: 'cancelled' })) }
    case 'payComponents/upsert':
      return { ...s, payComponents: upsert(s.payComponents, a.component) }
    case 'payComponents/remove':
      return { ...s, payComponents: s.payComponents.filter((c) => c.id !== a.id) }
    case 'payrollSettings/update':
      return { ...s, payrollSettings: { ...s.payrollSettings, ...a.patch } }
    case 'payroll/calculate': {
      const old = s.payrollRuns.find((r) => r.month === a.month)
      const run: PayrollRun = { id: old?.id ?? newId('pr'), code: `PR-${a.month}`, month: a.month, status: 'draft', slips: calcPayroll(s, a.month), calculatedAt: at, approvedBy: null, paidAt: null }
      return { ...s, payrollRuns: upsert(s.payrollRuns, run, true) }
    }
    case 'payroll/approve':
      return { ...s, payrollRuns: patchById(s.payrollRuns, a.id, (r) => ({ ...r, status: 'approved', approvedBy: by })) }
    case 'payroll/pay': {
      const run = s.payrollRuns.find((r) => r.id === a.id)!
      const loanIds = new Set(run.slips.flatMap((p) => p.loanIds))
      return {
        ...s,
        payrollRuns: patchById(s.payrollRuns, a.id, (r) => ({ ...r, status: 'paid', paidAt: at })),
        hrRequests: s.hrRequests.map((r) => (loanIds.has(r.id) && r.loan ? { ...r, loan: { ...r.loan, paidInstallments: r.loan.paidInstallments + 1 } } : r)),
      }
    }
    case 'kpis/upsert':
      return { ...s, kpis: upsert(s.kpis, a.kpi) }
    case 'kpis/remove':
      return { ...s, kpis: s.kpis.filter((k) => k.id !== a.id) }
    case 'scorecards/upsert':
      return { ...s, scorecards: upsert(s.scorecards, a.scorecard, true) }
    case 'scorecards/submit':
      return { ...s, scorecards: patchById(s.scorecards, a.id, (x) => ({ ...x, status: 'submitted' })) }
    case 'scorecards/finalize':
      return { ...s, scorecards: patchById(s.scorecards, a.id, (x) => ({ ...x, status: 'final' })) }
    case 'cycles/upsert':
      return { ...s, reviewCycles: upsert(s.reviewCycles, a.cycle, true) }
    case 'cycles/open': {
      const reviews: Review[] = reviewPairs(s).map((p) => ({ id: newId('rvw'), cycleId: a.id, ...p, answers: [], submittedAt: null }))
      return { ...s, reviewCycles: patchById(s.reviewCycles, a.id, (c) => ({ ...c, status: 'open', opensAt: at })), reviews: [...reviews, ...s.reviews] }
    }
    case 'cycles/close':
      return { ...s, reviewCycles: patchById(s.reviewCycles, a.id, (c) => ({ ...c, status: 'closed' })) }
    case 'reviews/submit':
      return { ...s, reviews: patchById(s.reviews, a.id, (r) => ({ ...r, answers: a.answers, submittedAt: at })) }
    case 'openings/upsert': {
      const old = s.jobOpenings.find((o) => o.id === a.opening.id)
      const openedAt = a.opening.status === 'open' && old?.status !== 'open' ? at : a.opening.openedAt
      return { ...s, jobOpenings: upsert(s.jobOpenings, { ...a.opening, openedAt }, true) }
    }
    case 'candidates/upsert':
      return { ...s, candidates: upsert(s.candidates, a.candidate, true) }
    case 'candidates/move':
      return patchCandidate(s, a.id, (c) => ({ ...c, stage: a.stage, rejectReason: a.stage === 'rejected' ? (a.reason ?? '') : '' }))
    case 'candidates/addTest':
      return patchCandidate(s, a.id, (c) => ({ ...c, tests: [...c.tests.filter((t) => t.testId !== a.result.testId), a.result] }))
    case 'candidates/schedule':
      return patchCandidate(s, a.id, (c) => ({ ...c, stage: c.stage === 'hired' || c.stage === 'offer' ? c.stage : 'interview', interviews: [...c.interviews, a.interview] }))
    case 'candidates/feedback':
      return patchCandidate(s, a.id, (c) => ({ ...c, interviews: c.interviews.map((i) => (i.id === a.interviewId ? { ...i, score: a.score, feedback: a.feedback } : i)) }))
    case 'candidates/offer':
      return patchCandidate(s, a.id, (c) => ({ ...c, offer: { ...a.offer, sentAt: a.offer.status === 'sent' && !c.offer?.sentAt ? at : (c.offer?.sentAt ?? a.offer.sentAt) } }))
    case 'candidates/hire': {
      const c = s.candidates.find((x) => x.id === a.id)!
      let next = patchCandidate(hire(s, a.employee, a.contract, at), a.id, (x) => ({ ...x, stage: 'hired', employeeId: a.employee.id }))
      const opening = next.jobOpenings.find((o) => o.id === c.openingId)
      // The opening closes once it has hired its headcount.
      if (opening && hiredCount(next, opening.id) >= opening.headcount) next = { ...next, jobOpenings: patchById(next.jobOpenings, opening.id, (o) => ({ ...o, status: 'closed' })) }
      return next
    }
    case 'candidates/apply':
      return { ...s, candidates: upsert(s.candidates, { ...a.candidate, stage: 'applied', source: 'website', appliedAt: at }, true) }
    case 'candidates/portal':
      return patchCandidate(s, a.id, (c) => ({ ...c, token: c.token || a.token, assignedTestIds: a.testIds }))
    case 'candidates/takeTest': {
      const test = s.psychTests.find((x) => x.id === a.testId)!
      return patchCandidate(s, a.id, (c) => ({ ...c, tests: [...c.tests, { testId: test.id, score: scoreTest(test, a.answers), takenAt: at }] }))
    }
    case 'candidates/respondInterview':
      return patchCandidate(s, a.id, (c) => ({ ...c, interviews: c.interviews.map((i) => (i.id === a.interviewId ? { ...i, response: { kind: a.kind, note: a.note.trim(), at } } : i)) }))
    case 'candidates/respondOffer':
      return patchCandidate(s, a.id, (c) => ({ ...c, offer: { ...c.offer!, status: a.accept ? 'accepted' : 'declined', answeredAt: at, answerNote: a.note.trim() } }))
    case 'announcements/upsert':
      return { ...s, announcements: upsert(s.announcements, a.announcement, true) }
    case 'announcements/remove':
      return { ...s, announcements: s.announcements.filter((x) => x.id !== a.id) }
    case 'announcements/read':
      return { ...s, announcements: patchById(s.announcements, a.id, (x) => (x.readBy.includes(a.userId) ? x : { ...x, readBy: [...x.readBy, a.userId] })) }
    case 'logbook/add':
      return { ...s, logbook: [a.entry, ...s.logbook] }
    case 'recurring/upsert':
      return { ...s, recurringTasks: upsert(s.recurringTasks, a.task) }
    case 'recurring/remove':
      return { ...s, recurringTasks: s.recurringTasks.filter((t) => t.id !== a.id) }
    case 'recurring/complete':
      return { ...s, recurringTasks: patchById(s.recurringTasks, a.id, (t) => ({ ...t, lastDoneAt: at, lastDoneBy: by, nextDue: nextDueAfter(t, nowMs) })) }
    case 'hrSettings/update':
      return { ...s, hrSettings: { ...s.hrSettings, ...a.patch } }
    case 'hr/sweep':
      return { ...s, contracts: s.contracts.map((c) => (c.status === 'active' && c.endsOn && toMs(c.endsOn) < nowMs ? { ...c, status: 'expired' } : c)) }
  }
}

/** Does the minute job need to expire any contract? */
export const contractsDue = (s: Pick<AppState, 'contracts'>, nowMs: number) => s.contracts.some((c) => c.status === 'active' && c.endsOn && toMs(c.endsOn) < nowMs)
