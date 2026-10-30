import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExclusiveRight } from '@artha/types'
import { DAY, FIXTURE_NOW, addDays } from './clock'
import { CONTRACT_MAX_BYTES, exclusiveBlocker, exclusiveStatus, milestoneTimeline, pendingMilestones, sweepTargets } from './exclusives'
import { JESSY, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const iso = (ms: number) => new Date(ms).toISOString()
const step = (s: AppState, action: AppAction, at: number, by = JESSY) => reduce(s, { action, meta: { by, at: iso(at) } })
const sweep = (s: AppState, at: number) => step(s, { type: 'exclusives/sweep', ids: sweepTargets(s, at).map((e) => e.id) }, at)
const find = (s: AppState, id: string) => s.exclusives.find((e) => e.id === id)!

/** A fresh right on lst-2 ending `days` after the fixture instant, with nothing sent. */
const withRight = (days: number, extra: Partial<ExclusiveRight> = {}) => {
  const right: ExclusiveRight = {
    id: 'exc-test',
    listingId: 'lst-2',
    startsAt: iso(FIXTURE_NOW - 60 * DAY),
    endsAt: iso(FIXTURE_NOW + days * DAY),
    remindDaysBefore: 14,
    endedAt: null,
    lastRemindedAt: null,
    note: '',
    ...extra,
  }
  return step(seedState(), { type: 'exclusives/upsert', exclusive: right }, FIXTURE_NOW, 'usr-1')
}

test('each milestone goes out once, on its day', () => {
  let s = withRight(31)
  assert.deepEqual(pendingMilestones(find(s, 'exc-test'), FIXTURE_NOW), [])

  const day30 = FIXTURE_NOW + DAY
  s = sweep(s, day30)
  assert.deepEqual(find(s, 'exc-test').reminders?.map((r) => r.days), [30])
  // A second sweep the same day sends nothing new.
  const again = sweep(s, day30 + 3_600_000)
  assert.deepEqual(find(again, 'exc-test').reminders, find(s, 'exc-test').reminders)

  s = sweep(s, FIXTURE_NOW + 24 * DAY)
  s = sweep(s, FIXTURE_NOW + 30 * DAY)
  const sent = find(s, 'exc-test').reminders!
  assert.deepEqual(sent.map((r) => r.days), [30, 7, 1])
  assert.ok(sent.every((r) => !r.skipped))
})

test('a right saved late sends only the tightest milestone and skips the others', () => {
  let s = withRight(5)
  s = sweep(s, FIXTURE_NOW)
  const reminders = find(s, 'exc-test').reminders!
  assert.deepEqual(
    reminders.map((r) => [r.days, !!r.skipped]),
    [
      [30, true],
      [7, false],
    ],
  )
  const timeline = milestoneTimeline(find(s, 'exc-test'))
  assert.equal(timeline.find((m) => m.days === 1)!.sent, null)
})

test('the sweep stores expired at the end date and ended after a sale', () => {
  let s = withRight(2)
  s = sweep(s, FIXTURE_NOW + 2 * DAY)
  assert.equal(find(s, 'exc-test').status, 'expired')
  assert.equal(sweepTargets(s, FIXTURE_NOW + 3 * DAY).length, 0)

  // Selling ends the right through the listing reducer; the next sweep stores the ended status.
  s = step(s, { type: 'listings/markSold', id: 'lst-1', soldPrice: 1_000 }, FIXTURE_NOW, 'usr-1')
  s = sweep(s, FIXTURE_NOW)
  assert.equal(find(s, 'exc-1').status, 'ended')
  assert.equal(exclusiveStatus(find(s, 'exc-1')), 'ended')
})

test('extending restarts the milestones and reactivates an expired right', () => {
  let s = sweep(withRight(1), FIXTURE_NOW + DAY)
  assert.equal(find(s, 'exc-test').status, 'expired')
  s = step(s, { type: 'exclusives/extend', id: 'exc-test', days: 60 }, FIXTURE_NOW + DAY, 'usr-1')
  const e = find(s, 'exc-test')
  assert.equal(e.status, 'active')
  assert.deepEqual(e.reminders, [])
  assert.equal(e.endsAt, addDays(iso(FIXTURE_NOW + DAY), 60))
})

test('editing without a new end date keeps the sent milestones', () => {
  let s = sweep(withRight(20), FIXTURE_NOW)
  const before = find(s, 'exc-test')
  s = step(s, { type: 'exclusives/upsert', exclusive: { ...before, note: 'Owner called', contractNo: 'EXC/9/AS/2026' } }, FIXTURE_NOW, 'usr-1')
  assert.deepEqual(find(s, 'exc-test').reminders, before.reminders)
  assert.equal(find(s, 'exc-test').contractNo, 'EXC/9/AS/2026')
})

test('the contract document must be a PDF or image of at most 1 MB', () => {
  const dates = { startsAt: iso(FIXTURE_NOW), endsAt: iso(FIXTURE_NOW + DAY) }
  const doc = (type: string, size: number) => ({ name: 'contract', type, size, dataUrl: 'data:,' })
  assert.equal(exclusiveBlocker({ ...dates, document: doc('application/pdf', CONTRACT_MAX_BYTES) }), null)
  assert.equal(exclusiveBlocker({ ...dates, document: doc('image/jpeg', 2_000) }), null)
  assert.match(exclusiveBlocker({ ...dates, document: doc('application/pdf', CONTRACT_MAX_BYTES + 1) })!, /1 MB/)
  assert.match(exclusiveBlocker({ ...dates, document: doc('application/zip', 10) })!, /PDF or an image/)
  const s0 = seedState()
  const refused = reduce(s0, {
    action: { type: 'exclusives/upsert', exclusive: { ...s0.exclusives[0], document: doc('application/zip', 10) } },
    meta: { by: 'usr-1', at: iso(FIXTURE_NOW) },
  })
  assert.equal(refused, s0)
})

test('ending twice is refused', () => {
  const s0 = seedState()
  const s1 = step(s0, { type: 'exclusives/end', id: 'exc-8' }, FIXTURE_NOW, 'usr-1')
  assert.equal(s1, s0)
})
