import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIXTURE_NOW, addDays } from './clock'
import { sweepTargets } from './exclusives'
import { retryBlocker } from './notify'
import { buildInquiry, JESSY, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, action: AppAction, by = 'usr-1') => reduce(s, { action, meta: { by, at: AT } })
const fresh = (s: AppState, before: AppState) => s.outbox.slice(0, s.outbox.length - before.outbox.length)

const newInquiry = (s: AppState) =>
  run(s, { type: 'inquiries/create', inquiry: buildInquiry(s, { listingId: 'lst-1', name: 'Yoga Prasetyo', phone: '0813 7777 1212', channel: 'web_chat', message: 'Visit?', budget: null }, AT) }, JESSY)

test('a new inquiry fans out per channel to every active user holding the rule roles', () => {
  const s0 = seedState()
  const s1 = newInquiry(s0)
  const items = fresh(s1, s0)
  // ntf-1: in-app, WhatsApp and push to the active sales agents and the sales manager.
  const users = ['usr-2', 'usr-4', 'usr-5', 'usr-6']
  assert.equal(items.length, users.length * 3)
  assert.deepEqual([...new Set(items.map((o) => o.userId))].sort(), users)
  assert.ok(items.every((o) => o.event === 'inquiry_new' && o.ruleId === 'ntf-1'))
  assert.ok(!items.some((o) => o.userId === 'usr-8' || o.userId === 'usr-9'), 'invited and disabled users get nothing')

  const inApp = items.filter((o) => o.channel === 'in_app')
  assert.ok(inApp.every((o) => o.status === 'delivered' && o.readAt === null && o.to === o.userId))
  assert.ok(items.filter((o) => o.channel === 'push').every((o) => o.status === 'queued'), 'push waits for browser permission')

  const wa = items.filter((o) => o.channel === 'whatsapp')
  assert.ok(wa.every((o) => o.status === 'sent'))
  const alerts = s1.messages.filter((m) => m.body.startsWith('New inquiry from Yoga Prasetyo'))
  assert.equal(alerts.length, wa.length, 'WhatsApp items land in the message log')
  assert.ok(alerts.every((m) => m.status === 'sent'))
})

test('a switched-off rule sends nothing', () => {
  const s0 = run(seedState(), { type: 'notificationRules/update', id: 'ntf-1', patch: { enabled: false } })
  const s1 = newInquiry(s0)
  assert.equal(s1.outbox.length, s0.outbox.length)
})

test('WhatsApp fails while the gateway is down, and a retry after reconnecting sends it', () => {
  const s0 = run(seedState(), { type: 'integrations/disconnect', id: 'int-wa' })
  const s1 = newInquiry(s0)
  const failed = fresh(s1, s0).filter((o) => o.channel === 'whatsapp')
  assert.ok(failed.length > 0 && failed.every((o) => o.status === 'failed' && /WhatsApp gateway/.test(o.error ?? '')))
  assert.ok(s1.messages.filter((m) => m.body.startsWith('New inquiry from')).every((m) => m.status === 'failed'))

  const ids = failed.map((o) => o.id)
  assert.match(retryBlocker(s1, ids)!, /not connected/)
  const s2 = run(s1, { type: 'integrations/connect', id: 'int-wa', account: '+62 811-1000-900' })
  assert.equal(retryBlocker(s2, ids), null)
  const s3 = run(s2, { type: 'outbox/retry', ids, at: AT })
  const retried = s3.outbox.filter((o) => ids.includes(o.id))
  assert.ok(retried.every((o) => o.status === 'sent' && o.attempts === 2 && o.error === null))
  assert.equal(s3.messages.length - s2.messages.length, ids.length)
  assert.match(retryBlocker(s3, ids)!, /Only failed items/)
})

test('email needs the email integration', () => {
  const s0 = run(seedState(), { type: 'integrations/disconnect', id: 'int-mail' })
  const s1 = run(s0, { type: 'listings/markSold', id: 'lst-1', soldPrice: 4_000_000_000 })
  const items = fresh(s1, s0)
  assert.ok(items.length > 0 && items.every((o) => o.event === 'listing_sold'))
  const email = items.filter((o) => o.channel === 'email')
  assert.ok(email.length > 0 && email.every((o) => o.status === 'failed' && o.to.includes('@')))
})

test('the exclusive sweep notifies milestones and expiry once', () => {
  const s0 = seedState()
  const s1 = run(s0, { type: 'exclusives/sweep', ids: sweepTargets(s0, FIXTURE_NOW).map((e) => e.id) }, JESSY)
  const items = fresh(s1, s0)
  assert.ok(items.some((o) => o.event === 'exclusive_expired' && o.title.includes('has expired')))
  // A second sweep finds nothing new and sends nothing.
  const s2 = run(s1, { type: 'exclusives/sweep', ids: sweepTargets(s1, FIXTURE_NOW).map((e) => e.id) }, JESSY)
  assert.equal(s2.outbox.length, s1.outbox.length)

  // Three weeks later exc-1 (50 days left at the seed) reaches its 30-day milestone.
  const later = Date.parse(addDays(AT, 21))
  const s3 = reduce(s2, { action: { type: 'exclusives/sweep', ids: sweepTargets(s2, later).map((e) => e.id) }, meta: { by: JESSY, at: new Date(later).toISOString() } })
  const milestone = fresh(s3, s2).filter((o) => o.event === 'exclusive_milestone')
  assert.ok(milestone.some((o) => o.title === 'Exclusive on AS-0001 ends in 30 days'))
})

test('quotations awaiting approval and paid payments notify their rules', () => {
  let s = seedState()
  const before = s
  s = run(s, { type: 'quotations/create', quotation: { id: 'quo-x', code: '', dealId: 'del-6', version: 0, listPrice: 5_400_000_000, discountPct: 7, bookingFee: 25_000_000, paymentPlan: 'cash', validUntil: AT, notes: '', status: 'draft', approvedBy: null, createdBy: '', createdAt: AT, sentAt: null } }, 'usr-4')
  s = run(s, { type: 'quotations/submit', id: 'quo-x' }, 'usr-4')
  const approval = fresh(s, before).filter((o) => o.event === 'quotation_approval')
  assert.deepEqual([...new Set(approval.map((o) => o.userId))].sort(), ['usr-1', 'usr-6'])

  const mid = s
  s = run(s, { type: 'payments/create', payment: { id: 'pay-x', code: '', kind: 'booking_fee', dealId: 'del-5', contactId: 'con-6', unitId: 'unt-A3', amount: 20_000_000, method: 'qris', status: 'pending', reference: 'QR', expiresAt: addDays(AT, 1), paidAt: null, refundOf: null, createdBy: '', createdAt: '' } }, 'usr-4')
  s = run(s, { type: 'payments/markPaid', id: 'pay-x', reference: 'QR-OK' }, 'usr-7')
  const paid = fresh(s, mid)
  assert.ok(paid.length > 0 && paid.every((o) => o.event === 'payment_received' && o.ref?.id === 'pay-x'))
})

test('reading in-app items stamps them and creates nothing new', () => {
  const s0 = newInquiry(seedState())
  const mine = s0.outbox.filter((o) => o.channel === 'in_app' && o.userId === 'usr-6' && !o.readAt).map((o) => o.id)
  assert.ok(mine.length > 0)
  const s1 = run(s0, { type: 'outbox/read', ids: mine, at: AT }, 'usr-6')
  assert.equal(s1.outbox.length, s0.outbox.length)
  assert.ok(s1.outbox.filter((o) => mine.includes(o.id)).every((o) => o.readAt === AT))
})
