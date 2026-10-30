import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Employee } from '@artha/types'
import { FIXTURE_NOW } from './clock'
import {
  attendanceState,
  buildCheckIn,
  calcPayroll,
  expiringContracts,
  leaveBalance,
  payrollTotals,
  pph21Annual,
  scorecardScore,
  workingDays,
} from './hr'
import { blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, actions: AppAction[], by = 'usr-10') => actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at: AT } }), s)

test('PPh 21 follows the progressive brackets', () => {
  assert.equal(pph21Annual(0), 0)
  assert.equal(pph21Annual(60_000_000), 3_000_000)
  assert.equal(pph21Annual(100_000_000), 9_000_000)
})

test('working days skip weekends and public holidays', () => {
  const s = seedState()
  // 17 August 2026 is a Monday and Independence Day.
  assert.equal(workingDays(s, '2026-08-17', '2026-08-23'), 4)
})

test('October payroll picks up overtime, unpaid leave and loan installments, and paying it posts a journal', () => {
  let s = seedState()
  const slips = calcPayroll(s, '2026-10')
  const slip = (id: string) => slips.find((p) => p.employeeId === id)!
  assert.equal(slip('emp-11').overtimeHours, 3)
  assert.equal(slip('emp-11').earnings.find((l) => l.label.startsWith('Overtime'))?.amount, Math.round((10_000_000 / 173) * 1.5 * 3))
  assert.equal(slip('emp-12').unpaidLeaveDays, 2)
  assert.equal(slip('emp-15').deductions.find((l) => l.label.startsWith('Loan'))?.amount, 1_000_000)
  assert.ok(!slips.some((p) => p.employeeId === 'emp-7'), 'someone who left in August is not paid in October')
  assert.ok(slips.every((p) => p.net > 0 && p.tax >= 0))

  s = run(s, [{ type: 'payroll/calculate', month: '2026-10' }])
  const id = s.payrollRuns[0].id
  assert.match(blockerFor(s, { type: 'payroll/pay', id })!, /Approve the payroll/)
  const before = s.journals.length
  s = run(s, [{ type: 'payroll/approve', id }, { type: 'payroll/pay', id }], 'usr-7')
  assert.equal(s.hrRequests.find((r) => r.id === 'hrq-10')?.loan?.paidInstallments, 3)
  assert.equal(s.journals.length, before + 1)
  assert.equal(s.journals[0].lines[0].debit, payrollTotals(s.payrollRuns[0].slips).net)
  assert.match(blockerFor(s, { type: 'payroll/calculate', month: '2026-10' })!, /paid/)
})

test('a leave request goes through the manager, then HR, and counts against the balance', () => {
  let s = seedState()
  const decide = (by: string, decision: 'approved' | 'rejected' = 'approved'): AppAction => ({ type: 'hrRequests/decide', id: 'hrq-1', decision, note: '', by })
  assert.match(blockerFor(s, decide('usr-10'))!, /Waiting for Hana Wirawan/)
  assert.match(blockerFor(s, decide('usr-2'))!, /your own request/)
  const before = leaveBalance(s, 'emp-3', 2026)
  s = run(s, [decide('usr-6')])
  assert.equal(s.hrRequests.find((r) => r.id === 'hrq-1')?.status, 'pending')
  s = run(s, [decide('usr-10')])
  assert.equal(s.hrRequests.find((r) => r.id === 'hrq-1')?.status, 'approved')
  const after = leaveBalance(s, 'emp-3', 2026)
  assert.equal(after.used - before.used, 3)
  assert.equal(after.left, before.left)
})

test('leave requests refuse overlaps and more days than are left', () => {
  const s = seedState()
  const base = { id: 'hrq-t', code: 'LV-26-0099', kind: 'leave' as const, employeeId: 'emp-3', reason: 'Trip', status: 'pending' as const, steps: [], createdBy: '', createdAt: AT }
  assert.match(blockerFor(s, { type: 'hrRequests/create', request: { ...base, leave: { type: 'annual', from: '2026-11-10', to: '2026-11-10', days: 1 } } })!, /LV-26-0001 already covers/)
  assert.match(blockerFor(s, { type: 'hrRequests/create', request: { ...base, leave: { type: 'annual', from: '2026-12-01', to: '2026-12-31', days: 22 } } })!, /days of annual leave left/)
  assert.match(blockerFor(s, { type: 'hrRequests/create', request: { ...base, leave: { type: 'maternity', from: '2026-12-01', to: '2026-12-02', days: 2 } } })!, /female/)
})

test('attendance knows leave, lateness and double check-ins', () => {
  const s = seedState()
  assert.equal(attendanceState(s, 'emp-8', '2026-10-21', FIXTURE_NOW), 'leave')
  assert.equal(attendanceState(s, 'emp-1', '2026-10-25', FIXTURE_NOW), 'off')
  const record = s.attendance.find((a) => a.employeeId === 'emp-1' && a.checkIn)!
  assert.match(blockerFor(s, { type: 'attendance/checkIn', attendance: { ...record, id: 'att-x' } })!, /already checked in/)
  const far = run(s, [{ type: 'hrSettings/update', patch: { checkInRadiusM: 200 } }])
  const away = buildCheckIn(far, 'emp-3', AT, null, { lat: -6.9, lng: 107.6, accuracyM: 10 })
  assert.match(blockerFor(far, { type: 'attendance/checkIn', attendance: away })!, /km from the office/)
})

test('onboarding and offboarding wait for their checklists', () => {
  let s = seedState()
  assert.match(blockerFor(s, { type: 'employees/activate', id: 'emp-6' })!, /4 onboarding items/)
  const chk = s.checklists.find((c) => c.employeeId === 'emp-6')!
  s = run(s, chk.items.filter((i) => !i.doneAt).map((i) => ({ type: 'checklists/toggle' as const, id: chk.id, itemId: i.id })))
  assert.equal(blockerFor(s, { type: 'employees/activate', id: 'emp-6' }), null)
  assert.match(blockerFor(s, { type: 'employees/release', id: 'emp-20' })!, /4 offboarding items/)
})

test('hiring an accepted candidate creates an employee in onboarding', () => {
  const s = seedState()
  const employee: Employee = { ...s.employees.find((e) => e.id === 'emp-17')!, id: 'emp-new', code: 'EMP-021', name: 'Hendro Gunadi', email: 'hendro@arthasamoedra.id', userId: null, nik: '' }
  const contract = { id: 'ctr-new', code: 'PKWT-26-0099', employeeId: 'emp-new', type: 'permanent' as const, startsOn: '2026-11-16', endsOn: null, salary: 12_000_000, status: 'active' as const, note: '' }
  assert.match(blockerFor(s, { type: 'candidates/hire', id: 'cnd-4', employee, contract })!, /accept the offer/)
  const next = run(s, [{ type: 'candidates/hire', id: 'cnd-5', employee, contract }])
  assert.equal(next.employees.find((e) => e.id === 'emp-new')?.status, 'onboarding')
  assert.ok(next.checklists.some((c) => c.employeeId === 'emp-new' && c.kind === 'onboarding'))
  assert.equal(next.jobOpenings.find((o) => o.id === 'op-1')?.status, 'open', 'one of two seats is filled')
})

test('KPI weights per position stay within 100 and scorecards weigh achievement', () => {
  const s = seedState()
  const extra = { id: 'kpi-x', name: 'Site visits', unit: 'visits', direction: 'higher' as const, positionIds: ['pos-agent'], target: 20, weight: 10 }
  assert.match(blockerFor(s, { type: 'kpis/upsert', kpi: extra })!, /Sales agent would total 110%/)
  const sc = s.scorecards.find((x) => x.status === 'final')!
  const score = scorecardScore(s, sc)
  assert.ok(score !== null && score > 0 && score <= 120)
})

test('only one review cycle is open at a time and contracts flag before they end', () => {
  const s = seedState()
  const draft = { ...s.reviewCycles[0], id: 'cyc-x', status: 'draft' as const }
  const next = run(s, [{ type: 'cycles/upsert', cycle: draft }])
  assert.match(blockerFor(next, { type: 'cycles/open', id: 'cyc-x' })!, /Close the open cycle/)
  const ending = expiringContracts(s, FIXTURE_NOW, 30).map((c) => c.employeeId)
  assert.deepEqual(ending, ['emp-18', 'emp-12', 'emp-20', 'emp-4'])
})
