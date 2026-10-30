/** HRIS: people, time, requests, payroll, performance, recruitment and engagement. Amounts are rupiah. */

// ---------------------------------------------------------------- organisation

export interface Department {
  id: string
  code: string
  name: string
  parentId: string | null
  /** Employee who heads the department. */
  headId: string | null
}

export interface Section {
  id: string
  departmentId: string
  name: string
}

export interface Position {
  id: string
  name: string
  departmentId: string
  /** 1 (staff) to 6 (director); salary bands key off it. */
  grade: number
}

export type EmploymentType = 'permanent' | 'contract' | 'probation' | 'intern'
export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  permanent: 'Permanent (PKWTT)',
  contract: 'Fixed term (PKWT)',
  probation: 'Probation',
  intern: 'Intern',
}

export type EmployeeStatus = 'onboarding' | 'active' | 'offboarding' | 'left'
export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = {
  onboarding: 'Onboarding',
  active: 'Active',
  offboarding: 'Offboarding',
  left: 'Left',
}

/** PTKP status for PPh 21: TK (single) or K (married), with 0 to 3 dependants. */
export type Ptkp = 'TK/0' | 'TK/1' | 'TK/2' | 'TK/3' | 'K/0' | 'K/1' | 'K/2' | 'K/3'
export const PTKP_AMOUNT: Record<Ptkp, number> = {
  'TK/0': 54_000_000,
  'TK/1': 58_500_000,
  'TK/2': 63_000_000,
  'TK/3': 67_500_000,
  'K/0': 58_500_000,
  'K/1': 63_000_000,
  'K/2': 67_500_000,
  'K/3': 72_000_000,
}

export interface Employee {
  id: string
  /** EMP-001 */
  code: string
  name: string
  email: string
  phone: string
  gender: 'female' | 'male'
  birthDate: string
  /** Console user, when the employee has one. */
  userId: string | null
  departmentId: string
  sectionId: string | null
  positionId: string
  managerId: string | null
  branchId: string
  type: EmploymentType
  status: EmployeeStatus
  joinedAt: string
  leftAt: string | null
  leftReason: string
  /** KTP number. */
  nik: string
  npwp: string
  bpjsTk: string
  bpjsKes: string
  bankAccount: string
  ptkp: Ptkp
  baseSalary: number
  /** Fixed monthly amounts per pay component, on top of the base salary. */
  allowances: { componentId: string; amount: number }[]
  shiftId: string
  annualLeave: number
}

export interface EmploymentContract {
  id: string
  /** PKWT-26-0001 */
  code: string
  employeeId: string
  type: EmploymentType
  startsOn: string
  /** Null for a permanent contract. */
  endsOn: string | null
  salary: number
  status: 'active' | 'ended' | 'expired'
  note: string
}

export type ChecklistKind = 'onboarding' | 'offboarding'
export const CHECKLIST_KIND_LABEL: Record<ChecklistKind, string> = { onboarding: 'Onboarding', offboarding: 'Offboarding' }

export interface ChecklistTemplate {
  id: string
  kind: ChecklistKind
  items: { id: string; label: string; ownerRole: 'hr' | 'it' | 'finance' | 'manager' }[]
}

export interface Checklist {
  id: string
  employeeId: string
  kind: ChecklistKind
  items: { id: string; label: string; ownerRole: ChecklistTemplate['items'][number]['ownerRole']; doneAt: string | null; doneBy: string | null }[]
  startedAt: string
  completedAt: string | null
}

// ---------------------------------------------------------------- time

export interface Shift {
  id: string
  code: string
  name: string
  /** HH:MM, local time. */
  start: string
  end: string
  breakMinutes: number
  /** Weekdays the shift runs by default, 0 = Sunday. */
  days: number[]
}

/** A roster change for one employee on one day; without one, the employee's shift applies. */
export interface ScheduleOverride {
  id: string
  employeeId: string
  /** YYYY-MM-DD */
  date: string
  /** A shift id, or null for a day off. */
  shiftId: string | null
}

export interface Holiday {
  id: string
  /** YYYY-MM-DD */
  date: string
  name: string
}

export interface GeoPoint {
  lat: number
  lng: number
  accuracyM: number
}

export interface Attendance {
  id: string
  employeeId: string
  /** YYYY-MM-DD */
  date: string
  checkIn: string | null
  checkOut: string | null
  /** Data URL of the check-in selfie. */
  photo: string | null
  location: GeoPoint | null
  /** Metres from the employee's office when a location was given. */
  distanceM: number | null
  note: string
}

export type AttendanceState = 'present' | 'late' | 'absent' | 'leave' | 'holiday' | 'off' | 'upcoming'
export const ATTENDANCE_STATE_LABEL: Record<AttendanceState, string> = {
  present: 'Present',
  late: 'Late',
  absent: 'Absent',
  leave: 'On leave',
  holiday: 'Holiday',
  off: 'Day off',
  upcoming: 'Upcoming',
}

// ---------------------------------------------------------------- requests

export type HrRequestKind = 'leave' | 'overtime' | 'loan'
export const HR_REQUEST_KIND_LABEL: Record<HrRequestKind, string> = { leave: 'Leave', overtime: 'Overtime', loan: 'Loan' }

export type LeaveType = 'annual' | 'sick' | 'important' | 'maternity' | 'unpaid'
export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  annual: 'Annual leave',
  sick: 'Sick leave',
  important: 'Important reason',
  maternity: 'Maternity leave',
  unpaid: 'Unpaid leave',
}

export type HrRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export const HR_REQUEST_STATUS_LABEL: Record<HrRequestStatus, string> = {
  pending: 'Waiting for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

/** One approval level. The manager level names its approver; the HR level takes anyone holding request.approve. */
export interface ApprovalStep {
  label: 'Manager' | 'HR' | 'Finance' | 'Director'
  approverId: string | null
  decision: 'pending' | 'approved' | 'rejected'
  by: string | null
  at: string | null
  note: string
}

export interface HrRequest {
  id: string
  /** LV-26-0001, OT-26-0001, LN-26-0001 */
  code: string
  kind: HrRequestKind
  employeeId: string
  reason: string
  status: HrRequestStatus
  steps: ApprovalStep[]
  createdBy: string
  createdAt: string
  leave?: { type: LeaveType; from: string; to: string; days: number }
  overtime?: { date: string; hours: number }
  /** Repaid through payroll deductions, one installment per paid run. */
  loan?: { amount: number; installments: number; paidInstallments: number }
}

// ---------------------------------------------------------------- payroll

export interface PayComponent {
  id: string
  code: string
  name: string
  kind: 'earning' | 'deduction'
  /** Earnings counted in gross pay for PPh 21. */
  taxable: boolean
}

export interface PayrollSettings {
  bpjsKesEmployeePct: number
  bpjsKesCompanyPct: number
  /** Salary cap for BPJS Kesehatan contributions. */
  bpjsKesCap: number
  jhtEmployeePct: number
  jhtCompanyPct: number
  jpEmployeePct: number
  jpCompanyPct: number
  jpCap: number
  jkkPct: number
  jkmPct: number
  /** Hourly overtime pay is base salary divided by this, times 1.5. */
  overtimeDivisor: number
  /** Unpaid leave deducts base salary divided by this per day. */
  workDaysPerMonth: number
  payDay: number
  /** Attendance and overtime count up to this day of the month. */
  cutoffDay: number
}

export interface PayLine {
  label: string
  amount: number
}

export interface Payslip {
  employeeId: string
  base: number
  earnings: PayLine[]
  deductions: PayLine[]
  overtimeHours: number
  /** Loans this slip deducts an installment for. */
  loanIds: string[]
  unpaidLeaveDays: number
  gross: number
  bpjsEmployee: number
  bpjsCompany: number
  tax: number
  net: number
}

export type PayrollStatus = 'draft' | 'approved' | 'paid'
export const PAYROLL_STATUS_LABEL: Record<PayrollStatus, string> = { draft: 'Draft', approved: 'Approved', paid: 'Paid' }

export interface PayrollRun {
  id: string
  /** PR-2026-10 */
  code: string
  /** YYYY-MM */
  month: string
  status: PayrollStatus
  slips: Payslip[]
  calculatedAt: string
  approvedBy: string | null
  paidAt: string | null
}

// ---------------------------------------------------------------- performance

export interface KpiDefinition {
  id: string
  name: string
  unit: string
  /** Higher actuals are better, or lower (for example days to close). */
  direction: 'higher' | 'lower'
  /** Positions the KPI scores. */
  positionIds: string[]
  target: number
  /** Percent of the scorecard; a position's weights total 100. */
  weight: number
}

export type ScorecardStatus = 'draft' | 'submitted' | 'final'
export const SCORECARD_STATUS_LABEL: Record<ScorecardStatus, string> = { draft: 'Draft', submitted: 'Submitted', final: 'Final' }

export interface Scorecard {
  id: string
  employeeId: string
  /** 2026-Q3 */
  period: string
  entries: { kpiId: string; target: number; actual: number | null }[]
  status: ScorecardStatus
  note: string
}

export type ReviewRelation = 'self' | 'manager' | 'peer' | 'report'
export const REVIEW_RELATION_LABEL: Record<ReviewRelation, string> = { self: 'Self', manager: 'Manager', peer: 'Peer', report: 'Direct report' }

export interface ReviewCycle {
  id: string
  name: string
  status: 'draft' | 'open' | 'closed'
  questions: { id: string; text: string }[]
  opensAt: string
  dueAt: string
}

export interface Review {
  id: string
  cycleId: string
  subjectId: string
  reviewerId: string
  relation: ReviewRelation
  answers: { questionId: string; score: number; comment: string }[]
  submittedAt: string | null
}

// ---------------------------------------------------------------- recruitment

export interface JobOpening {
  id: string
  code: string
  title: string
  departmentId: string
  positionId: string
  type: EmploymentType
  branchId: string
  headcount: number
  description: string
  status: 'draft' | 'open' | 'closed'
  openedAt: string | null
}

export type CandidateStage = 'applied' | 'screening' | 'test' | 'interview' | 'offer' | 'hired' | 'rejected'
export const CANDIDATE_STAGE_LABEL: Record<CandidateStage, string> = {
  applied: 'Applied',
  screening: 'Screening',
  test: 'Test',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
  rejected: 'Rejected',
}

export interface PsychTest {
  id: string
  name: string
  minutes: number
  /** Pass mark out of 100. */
  passMark: number
  /** Multiple choice; the candidate takes it on their portal and the score is the share answered right. */
  questions: { q: string; options: string[]; answer: number }[]
}

export interface Interview {
  id: string
  at: string
  mode: 'video' | 'onsite'
  link: string
  interviewerIds: string[]
  score: number | null
  feedback: string
  /** The candidate's answer on their portal; a reschedule request carries a note. */
  response?: { kind: 'confirmed' | 'reschedule'; note: string; at: string }
}

export interface Offer {
  salary: number
  startsOn: string
  type: EmploymentType
  status: 'draft' | 'sent' | 'accepted' | 'declined'
  sentAt: string | null
  /** When and why the candidate answered on their portal. */
  answeredAt?: string | null
  answerNote?: string
}

export interface Candidate {
  id: string
  name: string
  email: string
  phone: string
  /** Null keeps the candidate in the talent pool. */
  openingId: string | null
  stage: CandidateStage
  source: 'website' | 'jobstreet' | 'linkedin' | 'referral' | 'walk_in'
  rating: number
  tags: string[]
  cvName: string
  notes: string
  tests: { testId: string; score: number; takenAt: string }[]
  interviews: Interview[]
  offer: Offer | null
  /** Set when hired. */
  employeeId: string | null
  rejectReason: string
  appliedAt: string
  /** Opens the candidate portal at /careers/c/:token. Candidates added in the console get one on first share. */
  token?: string
  /** Tests HR assigned for the candidate to take on the portal. */
  assignedTestIds?: string[]
}

// ---------------------------------------------------------------- engagement

export interface Announcement {
  id: string
  title: string
  body: string
  /** A department id, or null for everyone. */
  departmentId: string | null
  pinned: boolean
  authorId: string
  publishedAt: string
  readBy: string[]
}

export interface LogbookEntry {
  id: string
  employeeId: string
  /** YYYY-MM-DD */
  date: string
  hours: number
  text: string
}

export type Recurrence = 'daily' | 'weekly' | 'monthly'
export const RECURRENCE_LABEL: Record<Recurrence, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' }

export interface RecurringTask {
  id: string
  departmentId: string
  title: string
  every: Recurrence
  assigneeId: string
  nextDue: string
  lastDoneAt: string | null
  lastDoneBy: string | null
  active: boolean
}

export interface HrSettings {
  lateGraceMinutes: number
  /** Refuse check-ins farther than this from the office; 0 turns the check off. */
  checkInRadiusM: number
  /** Office coordinates per branch, for the check-in distance. */
  offices: { branchId: string; lat: number; lng: number }[]
  contractAlertDays: number
}
