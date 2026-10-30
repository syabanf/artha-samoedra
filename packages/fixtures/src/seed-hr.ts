import type {
  Announcement,
  Attendance,
  Candidate,
  Checklist,
  ChecklistTemplate,
  Department,
  Employee,
  EmploymentContract,
  EmploymentType,
  Holiday,
  HrRequest,
  HrSettings,
  JobOpening,
  KpiDefinition,
  LogbookEntry,
  PayComponent,
  PayrollRun,
  PayrollSettings,
  Position,
  PsychTest,
  Ptkp,
  RecurringTask,
  Review,
  ReviewCycle,
  Scorecard,
  Section,
  Shift,
} from '@artha/types'
import { FIXTURE_NOW } from './clock'
import { calcPayroll, datesBetween, distanceM, requestSteps, reviewPairs, shiftOn, ymd } from './hr'
import { at } from './seed'

/** Deterministic 0..1 noise so the seed is the same on every load. */
const noise = (...keys: (string | number)[]) => {
  let h = 2166136261
  for (const ch of keys.join('|')) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return ((h >>> 0) % 10_000) / 10_000
}

// ---------------------------------------------------------------- organisation

export const DEPARTMENTS: Department[] = [
  { id: 'dep-mgt', code: 'MGT', name: 'Management', parentId: null, headId: 'emp-1' },
  { id: 'dep-sls', code: 'SLS', name: 'Sales', parentId: 'dep-mgt', headId: 'emp-2' },
  { id: 'dep-mkt', code: 'MKT', name: 'Marketing', parentId: 'dep-mgt', headId: 'emp-8' },
  { id: 'dep-fin', code: 'FIN', name: 'Finance', parentId: 'dep-mgt', headId: 'emp-9' },
  { id: 'dep-hrg', code: 'HRG', name: 'HR and General Affairs', parentId: 'dep-mgt', headId: 'emp-10' },
  { id: 'dep-ops', code: 'OPS', name: 'Operations', parentId: 'dep-mgt', headId: 'emp-16' },
]

export const SECTIONS: Section[] = [
  { id: 'sec-jkt', departmentId: 'dep-sls', name: 'Sales Jakarta' },
  { id: 'sec-bdg', departmentId: 'dep-sls', name: 'Sales Bandung' },
  { id: 'sec-sby', departmentId: 'dep-sls', name: 'Sales Surabaya' },
  { id: 'sec-dps', departmentId: 'dep-sls', name: 'Sales Bali' },
  { id: 'sec-digital', departmentId: 'dep-mkt', name: 'Digital marketing' },
  { id: 'sec-creative', departmentId: 'dep-mkt', name: 'Creative' },
]

export const POSITIONS: Position[] = [
  { id: 'pos-dir', name: 'Director', departmentId: 'dep-mgt', grade: 6 },
  { id: 'pos-slsmgr', name: 'Sales manager', departmentId: 'dep-sls', grade: 5 },
  { id: 'pos-sr', name: 'Senior sales agent', departmentId: 'dep-sls', grade: 3 },
  { id: 'pos-agent', name: 'Sales agent', departmentId: 'dep-sls', grade: 2 },
  { id: 'pos-mktlead', name: 'Marketing lead', departmentId: 'dep-mkt', grade: 4 },
  { id: 'pos-content', name: 'Content specialist', departmentId: 'dep-mkt', grade: 2 },
  { id: 'pos-photo', name: 'Photographer', departmentId: 'dep-mkt', grade: 2 },
  { id: 'pos-intern', name: 'Marketing intern', departmentId: 'dep-mkt', grade: 1 },
  { id: 'pos-finmgr', name: 'Finance manager', departmentId: 'dep-fin', grade: 5 },
  { id: 'pos-acct', name: 'Accountant', departmentId: 'dep-fin', grade: 3 },
  { id: 'pos-hrmgr', name: 'HR manager', departmentId: 'dep-hrg', grade: 5 },
  { id: 'pos-hro', name: 'HR officer', departmentId: 'dep-hrg', grade: 3 },
  { id: 'pos-ga', name: 'Admin and GA', departmentId: 'dep-hrg', grade: 2 },
  { id: 'pos-ops', name: 'Operations coordinator', departmentId: 'dep-ops', grade: 3 },
]

export const SHIFTS: Shift[] = [
  { id: 'shf-office', code: 'OFC', name: 'Office hours', start: '08:30', end: '17:30', breakMinutes: 60, days: [1, 2, 3, 4, 5] },
  { id: 'shf-sales', code: 'SLS', name: 'Sales floor', start: '10:00', end: '19:00', breakMinutes: 60, days: [0, 2, 3, 4, 5, 6] },
  { id: 'shf-weekend', code: 'OHW', name: 'Weekend open house', start: '09:00', end: '15:00', breakMinutes: 30, days: [0, 6] },
]

export const HOLIDAYS: Holiday[] = [
  ['2026-01-01', "New Year's Day"],
  ['2026-01-16', "Isra Mi'raj"],
  ['2026-02-17', 'Chinese New Year'],
  ['2026-03-19', 'Nyepi'],
  ['2026-03-20', 'Idul Fitri'],
  ['2026-03-21', 'Idul Fitri'],
  ['2026-04-03', 'Good Friday'],
  ['2026-05-01', 'Labour Day'],
  ['2026-05-14', 'Ascension of Jesus'],
  ['2026-05-27', 'Idul Adha'],
  ['2026-05-31', 'Vesak'],
  ['2026-06-01', 'Pancasila Day'],
  ['2026-06-16', 'Islamic New Year'],
  ['2026-08-17', 'Independence Day'],
  ['2026-08-25', "Prophet's Birthday"],
  ['2026-12-25', 'Christmas Day'],
].map(([date, name], i) => ({ id: `hol-${i + 1}`, date, name }))

export const PAY_COMPONENTS: PayComponent[] = [
  { id: 'pc-transport', code: 'TRN', name: 'Transport allowance', kind: 'earning', taxable: true },
  { id: 'pc-meal', code: 'MEAL', name: 'Meal allowance', kind: 'earning', taxable: true },
  { id: 'pc-position', code: 'POS', name: 'Position allowance', kind: 'earning', taxable: true },
  { id: 'pc-phone', code: 'COMM', name: 'Communication allowance', kind: 'earning', taxable: false },
  { id: 'pc-coop', code: 'COOP', name: 'Cooperative dues', kind: 'deduction', taxable: false },
]

export const PAYROLL_SETTINGS: PayrollSettings = {
  bpjsKesEmployeePct: 1,
  bpjsKesCompanyPct: 4,
  bpjsKesCap: 12_000_000,
  jhtEmployeePct: 2,
  jhtCompanyPct: 3.7,
  jpEmployeePct: 1,
  jpCompanyPct: 2,
  jpCap: 10_547_400,
  jkkPct: 0.24,
  jkmPct: 0.3,
  overtimeDivisor: 173,
  workDaysPerMonth: 21,
  payDay: 25,
  cutoffDay: 20,
}

export const HR_SETTINGS: HrSettings = {
  lateGraceMinutes: 10,
  checkInRadiusM: 0,
  offices: [
    { branchId: 'brn-jkt', lat: -6.2924, lng: 106.8126 },
    { branchId: 'brn-bdg', lat: -6.9039, lng: 107.6186 },
    { branchId: 'brn-sby', lat: -7.2895, lng: 112.7344 },
    { branchId: 'brn-dps', lat: -8.6838, lng: 115.1707 },
  ],
  contractAlertDays: 30,
}

// ---------------------------------------------------------------- employees

type Row = [name: string, user: string | null, dep: string, sec: string | null, pos: string, mgr: string | null, branch: string, type: EmploymentType, salary: number, joined: string, gender: 'female' | 'male', ptkp: Ptkp, shift: string]

const rows: Row[] = [
  ['Ayu Pramesti', 'usr-1', 'dep-mgt', null, 'pos-dir', null, 'brn-jkt', 'permanent', 45_000_000, '2019-02-01', 'female', 'K/2', 'shf-office'],
  ['Hana Wirawan', 'usr-6', 'dep-sls', null, 'pos-slsmgr', 'emp-1', 'brn-jkt', 'permanent', 28_000_000, '2020-06-15', 'female', 'K/1', 'shf-office'],
  ['Dimas Wicaksono', 'usr-2', 'dep-sls', 'sec-jkt', 'pos-sr', 'emp-2', 'brn-jkt', 'permanent', 12_000_000, '2021-03-01', 'male', 'K/0', 'shf-sales'],
  ['Rina Kartika', 'usr-4', 'dep-sls', 'sec-bdg', 'pos-agent', 'emp-2', 'brn-bdg', 'contract', 8_500_000, '2025-05-20', 'female', 'TK/0', 'shf-sales'],
  ['Bayu Saputra', 'usr-5', 'dep-sls', 'sec-dps', 'pos-agent', 'emp-2', 'brn-dps', 'contract', 8_500_000, '2025-04-01', 'male', 'TK/0', 'shf-sales'],
  ['Sinta Maharani', 'usr-8', 'dep-sls', 'sec-sby', 'pos-agent', 'emp-2', 'brn-sby', 'probation', 8_000_000, '2026-10-26', 'female', 'TK/0', 'shf-sales'],
  ['Agus Prabowo', 'usr-9', 'dep-sls', 'sec-sby', 'pos-agent', 'emp-2', 'brn-sby', 'contract', 8_000_000, '2024-09-02', 'male', 'K/1', 'shf-sales'],
  ['Nadia Halim', 'usr-3', 'dep-mkt', null, 'pos-mktlead', 'emp-1', 'brn-jkt', 'permanent', 18_000_000, '2021-08-09', 'female', 'TK/0', 'shf-office'],
  ['Teguh Santoso', 'usr-7', 'dep-fin', null, 'pos-finmgr', 'emp-1', 'brn-jkt', 'permanent', 24_000_000, '2020-01-06', 'male', 'K/3', 'shf-office'],
  ['Lestari Wulandari', 'usr-10', 'dep-hrg', null, 'pos-hrmgr', 'emp-1', 'brn-jkt', 'permanent', 20_000_000, '2020-11-02', 'female', 'K/1', 'shf-office'],
  ['Fajar Nugroho', null, 'dep-fin', null, 'pos-acct', 'emp-9', 'brn-jkt', 'permanent', 10_000_000, '2022-02-14', 'male', 'K/0', 'shf-office'],
  ['Putri Ayuningtyas', null, 'dep-mkt', 'sec-digital', 'pos-content', 'emp-8', 'brn-jkt', 'contract', 8_000_000, '2025-11-12', 'female', 'TK/0', 'shf-office'],
  ['Reza Mahendra', null, 'dep-mkt', 'sec-creative', 'pos-photo', 'emp-8', 'brn-jkt', 'contract', 7_500_000, '2025-07-01', 'male', 'TK/0', 'shf-weekend'],
  ['Wulan Sari', null, 'dep-hrg', null, 'pos-hro', 'emp-10', 'brn-jkt', 'permanent', 8_000_000, '2023-04-03', 'female', 'K/0', 'shf-office'],
  ['Yoga Pratama', null, 'dep-hrg', null, 'pos-ga', 'emp-10', 'brn-jkt', 'permanent', 6_200_000, '2022-09-19', 'male', 'K/2', 'shf-office'],
  ['Dewi Lestari', null, 'dep-ops', null, 'pos-ops', 'emp-1', 'brn-jkt', 'permanent', 11_000_000, '2022-05-23', 'female', 'TK/1', 'shf-office'],
  ['Arif Hidayat', null, 'dep-sls', 'sec-jkt', 'pos-sr', 'emp-2', 'brn-jkt', 'permanent', 12_500_000, '2021-10-11', 'male', 'K/1', 'shf-sales'],
  ['Maya Anggraini', null, 'dep-sls', 'sec-jkt', 'pos-agent', 'emp-2', 'brn-jkt', 'probation', 8_000_000, '2026-08-03', 'female', 'TK/0', 'shf-sales'],
  ['Kevin Halim', null, 'dep-mkt', 'sec-digital', 'pos-intern', 'emp-8', 'brn-jkt', 'intern', 3_500_000, '2026-07-01', 'male', 'TK/0', 'shf-office'],
  ['Siti Rahmawati', null, 'dep-sls', 'sec-bdg', 'pos-agent', 'emp-2', 'brn-bdg', 'contract', 8_000_000, '2024-03-04', 'female', 'K/0', 'shf-sales'],
]

const grade = (pos: string) => POSITIONS.find((p) => p.id === pos)!.grade
const allowances = (pos: string, type: EmploymentType): Employee['allowances'] => [
  { componentId: 'pc-transport', amount: 600_000 },
  { componentId: 'pc-meal', amount: 750_000 },
  ...(grade(pos) >= 5 ? [{ componentId: 'pc-position', amount: 3_000_000 }, { componentId: 'pc-phone', amount: 500_000 }] : []),
  ...(pos === 'pos-agent' || pos === 'pos-sr' ? [{ componentId: 'pc-phone', amount: 300_000 }] : []),
  ...(type === 'permanent' ? [{ componentId: 'pc-coop', amount: 100_000 }] : []),
]

const STATUS: Record<string, Employee['status']> = { 'emp-6': 'onboarding', 'emp-7': 'left', 'emp-20': 'offboarding' }
const LEFT: Record<string, [string, string]> = {
  'emp-7': ['2026-08-31T17:00:00+07:00', 'Moved to a developer in-house sales team'],
  'emp-20': ['2026-11-15T17:00:00+07:00', 'Relocating to Yogyakarta with family'],
}

export const EMPLOYEES: Employee[] = rows.map(([name, userId, departmentId, sectionId, positionId, managerId, branchId, type, baseSalary, joined, gender, ptkp, shiftId], i) => {
  const id = `emp-${i + 1}`
  const first = name.split(' ')[0].toLowerCase()
  const n = String(i + 1).padStart(3, '0')
  return {
    id,
    code: `EMP-${n}`,
    name,
    email: `${first}@arthasamoedra.id`,
    phone: `0812-${3000 + i * 37}-${String(1000 + i * 91).slice(0, 4)}`,
    gender,
    birthDate: `${1978 + ((i * 7) % 24)}-${String(1 + (i % 12)).padStart(2, '0')}-${String(3 + ((i * 5) % 25)).padStart(2, '0')}`,
    userId,
    departmentId,
    sectionId,
    positionId,
    managerId,
    branchId,
    type,
    status: STATUS[id] ?? 'active',
    joinedAt: new Date(`${joined}T09:00:00+07:00`).toISOString(),
    leftAt: LEFT[id] ? new Date(LEFT[id][0]).toISOString() : null,
    leftReason: LEFT[id]?.[1] ?? '',
    nik: `3171${String(40_000_000_000 + i * 7_919_311).slice(0, 12)}`,
    npwp: type === 'intern' ? '' : `09${String(1_234_567_890_123 + i * 3_571).slice(0, 13)}`,
    bpjsTk: `2600${String(1_100_000 + i * 731)}`,
    bpjsKes: `000${String(1_234_560_000 + i * 977)}`,
    bankAccount: `BCA ${String(5_270_000_000 + i * 104_729).replace(/(\d{4})(\d{3})(\d{3})/, '$1 $2 $3')}`,
    ptkp,
    baseSalary,
    allowances: allowances(positionId, type),
    shiftId,
    annualLeave: type === 'intern' ? 0 : 12,
  }
})

const contractRows: [string, EmploymentType, string, string | null, EmploymentContract['status']][] = [
  ['emp-4', 'contract', '2025-05-20', '2026-11-19', 'active'],
  ['emp-5', 'contract', '2025-04-01', '2027-03-31', 'active'],
  ['emp-6', 'probation', '2026-10-26', '2027-01-25', 'active'],
  ['emp-7', 'contract', '2024-09-02', '2026-08-31', 'ended'],
  ['emp-12', 'contract', '2025-11-12', '2026-11-11', 'active'],
  ['emp-13', 'contract', '2025-07-01', '2026-12-31', 'active'],
  ['emp-18', 'probation', '2026-08-03', '2026-11-02', 'active'],
  ['emp-19', 'intern', '2026-07-01', '2026-12-31', 'active'],
  ['emp-20', 'contract', '2024-03-04', '2026-11-15', 'active'],
]

export const CONTRACTS: EmploymentContract[] = [
  ...EMPLOYEES.filter((e) => e.type === 'permanent').map((e) => [e.id, 'permanent', ymd(e.joinedAt), null, 'active'] as (typeof contractRows)[number]),
  ...contractRows,
].map(([employeeId, type, startsOn, endsOn, status], i) => ({
  id: `ctr-${i + 1}`,
  code: `PKWT-${startsOn.slice(2, 4)}-${String(i + 1).padStart(4, '0')}`,
  employeeId,
  type,
  startsOn,
  endsOn,
  salary: EMPLOYEES.find((e) => e.id === employeeId)!.baseSalary,
  status,
  note: '',
}))

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [
  {
    id: 'clt-on',
    kind: 'onboarding',
    items: [
      { id: 'on-1', label: 'Sign the employment contract', ownerRole: 'hr' },
      { id: 'on-2', label: 'Create the email and console account', ownerRole: 'it' },
      { id: 'on-3', label: 'Hand over laptop, phone and ID card', ownerRole: 'it' },
      { id: 'on-4', label: 'Register with BPJS Ketenagakerjaan and Kesehatan', ownerRole: 'hr' },
      { id: 'on-5', label: 'Collect the payroll bank account and NPWP', ownerRole: 'finance' },
      { id: 'on-6', label: 'Train on listings, the CRM and Jessy', ownerRole: 'manager' },
      { id: 'on-7', label: 'Shadow two site visits', ownerRole: 'manager' },
    ],
  },
  {
    id: 'clt-off',
    kind: 'offboarding',
    items: [
      { id: 'off-1', label: 'Hold the exit interview', ownerRole: 'hr' },
      { id: 'off-2', label: 'Hand over listings, buyers and open deals', ownerRole: 'manager' },
      { id: 'off-3', label: 'Return laptop, phone and ID card', ownerRole: 'it' },
      { id: 'off-4', label: 'Revoke the console and email access', ownerRole: 'it' },
      { id: 'off-5', label: 'Settle final pay, leave balance and BPJS', ownerRole: 'finance' },
      { id: 'off-6', label: 'Issue the experience letter', ownerRole: 'hr' },
    ],
  },
]

const checklist = (id: string, employeeId: string, kind: 'onboarding' | 'offboarding', done: number, startedAt: string): Checklist => ({
  id,
  employeeId,
  kind,
  items: CHECKLIST_TEMPLATES.find((t) => t.kind === kind)!.items.map((it, i) => ({ ...it, doneAt: i < done ? at(-3 + i * 0.3) : null, doneBy: i < done ? 'usr-10' : null })),
  startedAt,
  completedAt: null,
})

export const CHECKLISTS: Checklist[] = [checklist('chk-1', 'emp-6', 'onboarding', 3, at(-5)), checklist('chk-2', 'emp-20', 'offboarding', 2, at(-10))]

// ---------------------------------------------------------------- requests

const req = (
  id: string,
  code: string,
  employeeId: string,
  reason: string,
  decisions: ('approved' | 'rejected')[],
  createdDaysAgo: number,
  detail: Pick<HrRequest, 'kind' | 'leave' | 'overtime' | 'loan'>,
): HrRequest => {
  const steps = requestSteps({ employees: EMPLOYEES }, employeeId, detail.kind).map((st, i) =>
    decisions[i] ? { ...st, decision: decisions[i], by: st.approverId ?? (st.label === 'Finance' ? 'usr-7' : 'usr-10'), at: at(-createdDaysAgo + 1 + i), note: decisions[i] === 'rejected' ? 'Two agents are already off that week.' : '' } : st,
  )
  const status = decisions.includes('rejected') ? 'rejected' : steps.every((st) => st.decision === 'approved') ? 'approved' : 'pending'
  return { id, code, employeeId, reason, status, steps, createdBy: 'usr-10', createdAt: at(-createdDaysAgo), ...detail }
}

export const HR_REQUESTS: HrRequest[] = [
  req('hrq-1', 'LV-26-0001', 'emp-3', 'Family wedding in Solo', [], 2, { kind: 'leave', leave: { type: 'annual', from: '2026-11-09', to: '2026-11-11', days: 3 } }),
  req('hrq-2', 'LV-26-0002', 'emp-8', 'Holiday in Labuan Bajo', ['approved', 'approved'], 30, { kind: 'leave', leave: { type: 'annual', from: '2026-10-19', to: '2026-10-23', days: 5 } }),
  req('hrq-3', 'LV-26-0003', 'emp-11', 'Fever, doctor letter attached', ['approved', 'approved'], 3, { kind: 'leave', leave: { type: 'sick', from: '2026-10-27', to: '2026-10-27', days: 1 } }),
  req('hrq-4', 'LV-26-0004', 'emp-5', 'Christmas with family in Kupang', ['approved'], 6, { kind: 'leave', leave: { type: 'annual', from: '2026-12-21', to: '2026-12-24', days: 4 } }),
  req('hrq-5', 'LV-26-0005', 'emp-12', 'Moving house', ['approved', 'approved'], 25, { kind: 'leave', leave: { type: 'unpaid', from: '2026-10-14', to: '2026-10-15', days: 2 } }),
  req('hrq-6', 'LV-26-0006', 'emp-13', 'Photography workshop in Bali', ['rejected'], 12, { kind: 'leave', leave: { type: 'annual', from: '2026-11-02', to: '2026-11-06', days: 5 } }),
  req('hrq-7', 'OT-26-0001', 'emp-11', 'September month-end close', ['approved', 'approved'], 4, { kind: 'overtime', overtime: { date: '2026-10-26', hours: 3 } }),
  req('hrq-8', 'OT-26-0002', 'emp-13', 'Drone shoot at Serpong Green after sunset', [], 4, { kind: 'overtime', overtime: { date: '2026-10-25', hours: 2.5 } }),
  req('hrq-9', 'OT-26-0003', 'emp-17', 'Late signing at the notary in Kemang', ['approved', 'approved'], 6, { kind: 'overtime', overtime: { date: '2026-10-24', hours: 2 } }),
  req('hrq-10', 'LN-26-0001', 'emp-15', "Children's school fees", ['approved', 'approved', 'approved'], 95, { kind: 'loan', loan: { amount: 6_000_000, installments: 6, paidInstallments: 0 } }),
  req('hrq-11', 'LN-26-0002', 'emp-18', 'Motorbike down payment for site visits', ['approved'], 3, { kind: 'loan', loan: { amount: 10_000_000, installments: 10, paidInstallments: 0 } }),
]

// ---------------------------------------------------------------- payroll: August and September are paid

const payrollRuns: PayrollRun[] = []
for (const [month, paidDay] of [['2026-08', '2026-08-25'], ['2026-09', '2026-09-25']] as const) {
  const slips = calcPayroll({ employees: EMPLOYEES, hrRequests: HR_REQUESTS, payComponents: PAY_COMPONENTS, payrollSettings: PAYROLL_SETTINGS, holidays: HOLIDAYS }, month)
  const paidAt = new Date(`${paidDay}T10:00:00+07:00`).toISOString()
  payrollRuns.unshift({ id: `pr-${month}`, code: `PR-${month}`, month, status: 'paid', slips, calculatedAt: paidAt, approvedBy: 'usr-7', paidAt })
  // Each paid run takes one loan installment.
  for (const r of HR_REQUESTS) if (r.loan && slips.some((p) => p.loanIds.includes(r.id))) r.loan.paidInstallments++
}
export const PAYROLL_RUNS = payrollRuns

// ---------------------------------------------------------------- attendance: the last three weeks and this morning

const OFFICE = Object.fromEntries(HR_SETTINGS.offices.map((o) => [o.branchId, o]))
const time = (date: string, minutesOfDay: number) => new Date(`${date}T${String(Math.floor(minutesOfDay / 60)).padStart(2, '0')}:${String(Math.floor(minutesOfDay % 60)).padStart(2, '0')}:00+07:00`).toISOString()
const today = ymd(FIXTURE_NOW)
const timeData = { employees: EMPLOYEES, shifts: SHIFTS, scheduleOverrides: [], holidays: HOLIDAYS }
const onLeave = (employeeId: string, date: string) => HR_REQUESTS.some((r) => r.status === 'approved' && r.employeeId === employeeId && r.leave && r.leave.from <= date && r.leave.to >= date)

export const ATTENDANCE: Attendance[] = []
for (const e of EMPLOYEES.filter((x) => x.status !== 'left')) {
  for (const date of datesBetween(ymd(at(-21)), today)) {
    if (date < ymd(e.joinedAt) || onLeave(e.id, date)) continue
    const shift = shiftOn(timeData, e.id, date)
    if (!shift) continue
    const [h, m] = shift.start.split(':').map(Number)
    const start = h * 60 + m
    const r = noise(e.id, date)
    if (date === today && start > 9 * 60) continue
    if (r > 0.95) continue
    const arrive = start + (r > 0.88 ? 15 + Math.round(r * 40) : -12 + Math.round(r * 20))
    const office = OFFICE[e.branchId]
    const location = { lat: office.lat + (noise(e.id, date, 'lat') - 0.5) * 0.001, lng: office.lng + (noise(e.id, date, 'lng') - 0.5) * 0.001, accuracyM: 12 + Math.round(r * 20) }
    ATTENDANCE.push({
      id: `att-${e.id}-${date}`,
      employeeId: e.id,
      date,
      checkIn: time(date, arrive),
      checkOut: date === today ? null : time(date, start + 9 * 60 + Math.round(noise(e.id, date, 'out') * 40)),
      photo: null,
      location,
      distanceM: distanceM(location, office),
      note: '',
    })
  }
}
ATTENDANCE.reverse()

// ---------------------------------------------------------------- performance

export const KPIS: KpiDefinition[] = [
  { id: 'kpi-deals', name: 'Deals closed', unit: 'deals', direction: 'higher', positionIds: ['pos-agent', 'pos-sr'], target: 3, weight: 40 },
  { id: 'kpi-value', name: 'Sales value', unit: 'Rp', direction: 'higher', positionIds: ['pos-agent', 'pos-sr'], target: 8_000_000_000, weight: 40 },
  { id: 'kpi-response', name: 'First response time', unit: 'hours', direction: 'lower', positionIds: ['pos-agent', 'pos-sr'], target: 2, weight: 20 },
  { id: 'kpi-leads', name: 'Qualified leads', unit: 'leads', direction: 'higher', positionIds: ['pos-mktlead', 'pos-content'], target: 120, weight: 50 },
  { id: 'kpi-cpl', name: 'Cost per lead', unit: 'Rp', direction: 'lower', positionIds: ['pos-mktlead', 'pos-content'], target: 350_000, weight: 30 },
  { id: 'kpi-posts', name: 'Posts published', unit: 'posts', direction: 'higher', positionIds: ['pos-mktlead', 'pos-content'], target: 60, weight: 20 },
  { id: 'kpi-close', name: 'Days to close the books', unit: 'days', direction: 'lower', positionIds: ['pos-acct', 'pos-finmgr'], target: 5, weight: 60 },
  { id: 'kpi-recon', name: 'Bank accounts reconciled on time', unit: '%', direction: 'higher', positionIds: ['pos-acct', 'pos-finmgr'], target: 100, weight: 40 },
]

const kpisFor = (employeeId: string) => KPIS.filter((k) => k.positionIds.includes(EMPLOYEES.find((e) => e.id === employeeId)!.positionId))
const scorecard = (employeeId: string, period: string, status: Scorecard['status'], fill: number): Scorecard => ({
  id: `sc-${employeeId}-${period}`,
  employeeId,
  period,
  status,
  note: status === 'final' ? 'Reviewed with the manager.' : '',
  entries: kpisFor(employeeId).map((k, i) => {
    const swing = 0.7 + noise(employeeId, period, k.id) * 0.6
    const actual = k.direction === 'higher' ? k.target * swing : k.target / swing
    return { kpiId: k.id, target: k.target, actual: i < fill ? (k.unit === 'Rp' ? Math.round(actual / 1_000_000) * 1_000_000 : Math.round(actual * 10) / 10) : null }
  }),
})

export const SCORECARDS: Scorecard[] = [
  ...['emp-3', 'emp-4', 'emp-5', 'emp-17', 'emp-8', 'emp-12', 'emp-11', 'emp-9'].map((id) => scorecard(id, '2026-Q3', 'final', 3)),
  scorecard('emp-3', '2026-Q4', 'draft', 2),
  scorecard('emp-17', '2026-Q4', 'draft', 1),
  scorecard('emp-12', '2026-Q4', 'submitted', 3),
]

const QUESTIONS = [
  { id: 'q-1', text: 'Delivers on commitments and deadlines' },
  { id: 'q-2', text: 'Communicates clearly with buyers, partners and colleagues' },
  { id: 'q-3', text: 'Knows the property market and our listings' },
  { id: 'q-4', text: 'Helps the team succeed' },
]

export const REVIEW_CYCLES: ReviewCycle[] = [
  { id: 'cyc-1', name: 'H1 2026 review', status: 'closed', questions: QUESTIONS, opensAt: '2026-06-15T09:00:00+07:00', dueAt: '2026-07-10T17:00:00+07:00' },
  { id: 'cyc-2', name: 'H2 2026 360 review', status: 'open', questions: QUESTIONS, opensAt: at(-9), dueAt: at(12) },
]

const COMMENTS = ['Reliable with buyers.', 'Could share listing updates sooner.', 'Strong on follow-ups.', 'Great at open houses.', 'Keeps the team informed.', '']
export const REVIEWS: Review[] = REVIEW_CYCLES.flatMap((cycle) =>
  reviewPairs({ employees: EMPLOYEES.filter((e) => cycle.id === 'cyc-2' || ymd(e.joinedAt) < '2026-06-15') }).map((p, i) => {
    const done = cycle.status === 'closed' || noise(cycle.id, i) < 0.45
    return {
      id: `rvw-${cycle.id}-${i + 1}`,
      cycleId: cycle.id,
      ...p,
      answers: done ? QUESTIONS.map((q) => ({ questionId: q.id, score: 3 + Math.round(noise(cycle.id, i, q.id) * 2), comment: q.id === 'q-4' ? COMMENTS[i % COMMENTS.length] : '' })) : [],
      submittedAt: done ? (cycle.status === 'closed' ? '2026-07-08T10:00:00+07:00' : at(-8 + (i % 7))) : null,
    }
  }),
)

// ---------------------------------------------------------------- recruitment

export const PSYCH_TESTS: PsychTest[] = [
  {
    id: 'tst-disc', name: 'DISC personality profile', minutes: 20, passMark: 50,
    questions: [
      { q: 'A buyer goes quiet after a site visit. What do you do first?', options: ['Wait for them to call', 'Send a short note with one new fact about the home', 'Lower the price', 'Pass the lead to a colleague'], answer: 1 },
      { q: 'Two teammates disagree on who owns a lead. You', options: ['Pick the louder one', 'Check the CRM record and ask the manager to decide', 'Split the commission yourself', 'Ignore it'], answer: 1 },
      { q: 'Which describes how you plan a week?', options: ['I react to whatever comes', 'I block visits first, then admin around them', 'I plan only Mondays', 'Someone else plans it'], answer: 1 },
    ],
  },
  {
    id: 'tst-num', name: 'Numerical reasoning', minutes: 25, passMark: 60,
    questions: [
      { q: 'A house lists at Rp 2 B with a 2.5% fee. What is the fee?', options: ['Rp 25 M', 'Rp 50 M', 'Rp 5 M', 'Rp 250 M'], answer: 1 },
      { q: 'Land of 240 m² sells for Rp 6 B. Price per m²?', options: ['Rp 2.5 M', 'Rp 25 M', 'Rp 250 M', 'Rp 4 M'], answer: 1 },
      { q: 'Rent of Rp 120 M a year, paid monthly, is how much a month?', options: ['Rp 12 M', 'Rp 10 M', 'Rp 1.2 M', 'Rp 8 M'], answer: 1 },
      { q: 'A price drops from Rp 4 B to Rp 3.6 B. By what percent?', options: ['4%', '10%', '12%', '40%'], answer: 1 },
    ],
  },
  {
    id: 'tst-sales', name: 'Sales aptitude', minutes: 30, passMark: 65,
    questions: [
      { q: 'A buyer says the price is too high. The best first reply is', options: ['Agree and drop it', 'Ask what they compare it with', 'Say the owner will not move', 'End the call'], answer: 1 },
      { q: 'Before a site visit you should', options: ['Check the certificate and access road', 'Only send the address', 'Bring the contract to sign', 'Skip preparation'], answer: 0 },
      { q: 'A seller grants a 90-day exclusive. Near day 80 you', options: ['Let it lapse', 'Report activity and propose an extension', 'Raise the price', 'Remove the listing'], answer: 1 },
    ],
  },
]

export const JOB_OPENINGS: JobOpening[] = [
  {
    id: 'op-1', code: 'JOB-26-001', title: 'Senior sales agent, Jakarta', departmentId: 'dep-sls', positionId: 'pos-sr', type: 'permanent', branchId: 'brn-jkt', headcount: 2, status: 'open', openedAt: at(-24),
    description: 'Sell landed houses and apartments in South Jakarta and Serpong. You run site visits, negotiate with owners and close deals with the notary. Three years in property sales and your own buyer network required.',
  },
  {
    id: 'op-2', code: 'JOB-26-002', title: 'Content specialist', departmentId: 'dep-mkt', positionId: 'pos-content', type: 'contract', branchId: 'brn-jkt', headcount: 1, status: 'open', openedAt: at(-12),
    description: 'Write Instagram posts, reel scripts and SEO articles about our listings and neighbourhoods, and work with Jessy, our AI agent, on drafts. Bahasa Indonesia and English.',
  },
  {
    id: 'op-3', code: 'JOB-26-003', title: 'Accountant', departmentId: 'dep-fin', positionId: 'pos-acct', type: 'permanent', branchId: 'brn-jkt', headcount: 1, status: 'draft', openedAt: null,
    description: 'Own the ledger, bank reconciliations, VAT and faktur pajak. Brevet A and B preferred.',
  },
  {
    id: 'op-4', code: 'JOB-25-004', title: 'Property photographer', departmentId: 'dep-mkt', positionId: 'pos-photo', type: 'contract', branchId: 'brn-jkt', headcount: 1, status: 'closed', openedAt: '2025-05-12T09:00:00+07:00',
    description: 'Shoot listings, drone footage and open houses across Jabodetabek. Own gear and a drone licence.',
  },
]

const cand = (
  id: string, name: string, openingId: string | null, stage: Candidate['stage'], source: Candidate['source'], rating: number, appliedDaysAgo: number, extra: Partial<Candidate> = {},
): Candidate => ({
  id, name, email: `${name.split(' ')[0].toLowerCase()}.${name.split(' ')[1]?.toLowerCase() ?? 'cv'}@gmail.com`, phone: `0813-${4000 + appliedDaysAgo * 13}-${2000 + rating * 111}`,
  openingId, stage, source, rating, tags: [], cvName: `CV ${name}.pdf`, notes: '', tests: [], interviews: [], offer: null, employeeId: null, rejectReason: '', appliedAt: at(-appliedDaysAgo), ...extra,
})

export const CANDIDATES: Candidate[] = [
  cand('cnd-1', 'Andi Kurniawan', 'op-1', 'applied', 'jobstreet', 3, 2),
  cand('cnd-2', 'Melati Susanti', 'op-1', 'screening', 'linkedin', 4, 6, { tags: ['Serpong network'] }),
  cand('cnd-3', 'Bram Setiadi', 'op-1', 'test', 'referral', 4, 11, { tests: [{ testId: 'tst-sales', score: 78, takenAt: at(-2) }], notes: 'Referred by Dimas.', token: 'cnd-bram-7q4x', assignedTestIds: ['tst-sales', 'tst-num'] }),
  cand('cnd-4', 'Clara Wijaya', 'op-1', 'interview', 'website', 5, 18, {
    token: 'cnd-clara-2m8k',
    assignedTestIds: ['tst-sales', 'tst-disc'],
    tags: ['Luxury homes'],
    tests: [{ testId: 'tst-sales', score: 86, takenAt: at(-12) }],
    interviews: [
      { id: 'int-1', at: at(-6), mode: 'video', link: 'https://meet.google.com/abc-defg-hij', interviewerIds: ['emp-2'], score: 5, feedback: 'Sold 14 units in Pondok Indah last year. Strong.' },
      { id: 'int-2', at: at(2, 14), mode: 'onsite', link: '', interviewerIds: ['emp-1', 'emp-2'], score: null, feedback: '' },
    ],
  }),
  cand('cnd-5', 'Hendro Gunadi', 'op-1', 'offer', 'jobstreet', 4, 22, {
    tests: [{ testId: 'tst-sales', score: 74, takenAt: at(-18) }],
    interviews: [{ id: 'int-3', at: at(-12), mode: 'onsite', link: '', interviewerIds: ['emp-2'], score: 4, feedback: 'Good with developer projects.' }],
    offer: { salary: 12_000_000, startsOn: '2026-11-16', type: 'permanent', status: 'accepted', sentAt: at(-4), answeredAt: at(-3), answerNote: '' },
    token: 'cnd-hendro-9d3p',
  }),
  cand('cnd-6', 'Lukas Pratama', 'op-1', 'rejected', 'website', 2, 20, { tests: [{ testId: 'tst-sales', score: 48, takenAt: at(-15) }], rejectReason: 'Below the sales aptitude pass mark.' }),
  cand('cnd-7', 'Nabila Rahma', 'op-2', 'applied', 'website', 3, 1),
  cand('cnd-8', 'Gita Permata', 'op-2', 'interview', 'linkedin', 4, 9, {
    token: 'cnd-gita-5w1n',
    assignedTestIds: ['tst-disc'],
    tests: [{ testId: 'tst-disc', score: 66, takenAt: at(-5) }],
    interviews: [{ id: 'int-4', at: at(1, 10), mode: 'video', link: 'https://zoom.us/j/8812345678', interviewerIds: ['emp-8'], score: null, feedback: '' }],
  }),
  cand('cnd-9', 'Tomi Saragih', 'op-2', 'screening', 'jobstreet', 3, 7),
  cand('cnd-10', 'Reza Mahendra', 'op-4', 'hired', 'referral', 5, 480, { employeeId: 'emp-13', offer: { salary: 7_500_000, startsOn: '2025-07-01', type: 'contract', status: 'accepted', sentAt: '2025-06-10T09:00:00+07:00' } }),
  cand('cnd-11', 'Irene Tanoto', null, 'applied', 'walk_in', 4, 40, { tags: ['Accounting', 'Brevet B'], notes: 'Talent pool for the accountant opening.' }),
  cand('cnd-12', 'Yusuf Maulana', null, 'applied', 'linkedin', 3, 65, { tags: ['Sales', 'Bali'], notes: 'Keep in mind for the Bali office.' }),
  cand('cnd-13', 'Siska Amelia', 'op-2', 'offer', 'website', 4, 16, {
    token: 'cnd-siska-4h6t',
    assignedTestIds: ['tst-disc'],
    tests: [{ testId: 'tst-disc', score: 67, takenAt: at(-13) }],
    interviews: [{ id: 'int-5', at: at(-7), mode: 'video', link: 'https://meet.google.com/qrs-tuvw-xyz', interviewerIds: ['emp-8'], score: 4, feedback: 'Strong portfolio of property reels.', response: { kind: 'confirmed', note: '', at: at(-9) } }],
    offer: { salary: 8_500_000, startsOn: '2026-12-01', type: 'contract', status: 'sent', sentAt: at(-1), answeredAt: null, answerNote: '' },
  }),
]

// ---------------------------------------------------------------- engagement

export const ANNOUNCEMENTS: Announcement[] = [
  { id: 'ann-1', title: 'H2 360 review is open', body: 'Rate yourself, your manager and two peers by 11 November. It takes about 15 minutes. Ask HR if a reviewer is missing.', departmentId: null, pinned: true, authorId: 'usr-10', publishedAt: at(-9), readBy: ['usr-1', 'usr-6', 'usr-7'] },
  { id: 'ann-2', title: 'October payroll on 25 November cycle', body: 'October overtime and leave close on 20 October. Payroll pays on the 25th. Submit overtime through HR before the cut-off.', departmentId: null, pinned: false, authorId: 'usr-7', publishedAt: at(-14), readBy: ['usr-1', 'usr-2', 'usr-6'] },
  { id: 'ann-3', title: 'Serpong Green open house weekend', body: 'All Jakarta agents rotate on the weekend shift on 7 and 8 November. Hana posts the roster on Monday.', departmentId: 'dep-sls', pinned: false, authorId: 'usr-6', publishedAt: at(-3), readBy: ['usr-2'] },
  { id: 'ann-4', title: 'Welcome Sinta to the Surabaya team', body: 'Sinta Maharani joins as a sales agent in Surabaya. Say hello on the team chat.', departmentId: null, pinned: false, authorId: 'usr-10', publishedAt: at(-4), readBy: [] },
]

export const LOGBOOK: LogbookEntry[] = [
  ['emp-11', -1, 7.5, 'Reconciled BCA and Mandiri for October, chased two unmatched transfers.'],
  ['emp-11', -2, 8, 'Posted vendor bills and prepared the faktur pajak list.'],
  ['emp-12', -1, 6, 'Drafted five Instagram carousels for Simatupang Sky Suites with Jessy.'],
  ['emp-12', -2, 7, 'Wrote the Serpong area guide and fixed the SEO checklist items.'],
  ['emp-13', -2, 5, 'Drone shoot at Serpong Green, edited 40 photos.'],
  ['emp-14', -1, 8, 'Ran BPJS registration for Sinta, updated contract tracker.'],
  ['emp-15', -1, 6.5, 'Renewed office internet, ordered banners for the open house.'],
  ['emp-16', -1, 8, 'Planned the weekend open house logistics with the developer.'],
  ['emp-19', -1, 8, 'Scheduled TikTok posts and compiled the lead report.'],
  ['emp-14', -3, 7, 'Screened 12 applications for the senior sales agent opening.'],
].map(([employeeId, days, hours, text], i) => ({ id: `log-${i + 1}`, employeeId: employeeId as string, date: ymd(at(days as number)), hours: hours as number, text: text as string }))

export const RECURRING_TASKS: RecurringTask[] = [
  { id: 'rt-1', departmentId: 'dep-fin', title: 'Reconcile bank accounts', every: 'weekly', assigneeId: 'emp-11', nextDue: at(1), lastDoneAt: at(-6), lastDoneBy: 'usr-7', active: true },
  { id: 'rt-2', departmentId: 'dep-fin', title: 'Close the month in the ledger', every: 'monthly', assigneeId: 'emp-9', nextDue: at(5), lastDoneAt: at(-25), lastDoneBy: 'usr-7', active: true },
  { id: 'rt-3', departmentId: 'dep-hrg', title: 'Check contracts expiring within 30 days', every: 'weekly', assigneeId: 'emp-14', nextDue: at(-1), lastDoneAt: at(-8), lastDoneBy: 'usr-10', active: true },
  { id: 'rt-4', departmentId: 'dep-sls', title: 'Refresh portal listings and prices', every: 'weekly', assigneeId: 'emp-3', nextDue: at(2), lastDoneAt: at(-5), lastDoneBy: 'usr-2', active: true },
  { id: 'rt-5', departmentId: 'dep-mkt', title: 'Publish the weekly market update', every: 'weekly', assigneeId: 'emp-12', nextDue: at(0, 15), lastDoneAt: at(-7), lastDoneBy: null, active: true },
  { id: 'rt-6', departmentId: 'dep-hrg', title: 'Restock the pantry and office supplies', every: 'monthly', assigneeId: 'emp-15', nextDue: at(-3), lastDoneAt: at(-33), lastDoneBy: null, active: true },
]
