import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIXTURE_NOW } from './clock'
import { contactByPhone, forecast, leadScore, runReport, segmentMembers } from './crm'
import { buildInquiry, blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, action: AppAction, by = 'usr-6') => {
  assert.equal(blockerFor(s, action), null, `${action.type} should be allowed`)
  return reduce(s, { action, meta: { by, at: AT } })
}

test('a new inquiry creates a contact, gets an agent and a welcome message', () => {
  const s0 = seedState()
  const inquiry = buildInquiry(s0, { listingId: 'lst-1', name: 'Yoga Prasetyo', phone: '0813 7777 1212', channel: 'web_chat', message: 'Visit?', budget: null }, AT)
  const s1 = run(s0, { type: 'inquiries/create', inquiry }, 'jessy')
  const contact = contactByPhone(s1, '081377771212')
  assert.ok(contact)
  assert.equal(contact.source, 'web_chat')
  const owner = s1.inquiries[0].ownerId
  assert.ok(owner && s1.users.find((u) => u.id === owner)?.roleId === 'rol-sales')
  assert.match(s1.messages[0].body, /Hi Yoga Prasetyo, thanks for asking about AS-0001/)
  assert.equal(s1.workflows.find((w) => w.id === 'wf-1')!.runs.length, 2)
})

test('a discounted quotation needs approval, acceptance books the deal, won needs it', () => {
  let s = seedState()
  const deal = s.deals.find((d) => d.id === 'del-6')!
  assert.match(blockerFor(s, { type: 'deals/move', id: deal.id, stageId: 'stg-won' })!, /accept a quotation/)
  assert.equal(blockerFor(s, { type: 'deals/move', id: deal.id, stageId: 'stg-lost' }), 'Pick a lost reason.')

  s = run(s, { type: 'quotations/create', quotation: { id: 'quo-x', code: '', dealId: deal.id, version: 0, listPrice: 5_400_000_000, discountPct: 7, bookingFee: 25_000_000, paymentPlan: 'cash', validUntil: AT, notes: '', status: 'draft', approvedBy: null, createdBy: '', createdAt: AT, sentAt: null } }, 'usr-4')
  assert.equal(s.quotations[0].code, 'QT-26-0106')
  s = run(s, { type: 'quotations/submit', id: 'quo-x' }, 'usr-4')
  assert.equal(s.quotations[0].status, 'pending_approval')
  assert.match(blockerFor(s, { type: 'quotations/send', id: 'quo-x' })!, /needs approval, so it cannot be sent/)
  s = run(s, { type: 'quotations/approve', id: 'quo-x' })
  assert.equal(s.quotations[0].approvedBy, 'usr-6')
  const tasksBefore = s.tasks.length
  s = run(s, { type: 'quotations/send', id: 'quo-x' }, 'usr-4')
  assert.equal(s.tasks.length, tasksBefore + 1, 'the "chase stalled quotations" rule adds a task')
  s = run(s, { type: 'quotations/respond', id: 'quo-x', accepted: true }, 'usr-4')
  const booked = s.deals.find((d) => d.id === deal.id)!
  assert.equal(booked.stageId, 'stg-booking')
  assert.equal(booked.value, 5_022_000_000)
  s = run(s, { type: 'deals/move', id: deal.id, stageId: 'stg-won' }, 'usr-4')
  assert.ok(s.deals.find((d) => d.id === deal.id)!.closedAt)
})

test('a revision supersedes the open quotation of the same deal', () => {
  let s = seedState()
  const base = s.quotations.find((q) => q.id === 'quo-2')!
  s = run(s, { type: 'quotations/create', quotation: { ...base, id: 'quo-rev', discountPct: 4 } }, 'usr-2')
  assert.equal(s.quotations.find((q) => q.id === 'quo-2')!.status, 'superseded')
  assert.equal(s.quotations[0].version, 3)
})

test('campaigns skip opted-out contacts and need the WhatsApp gateway', () => {
  let s = seedState()
  const now = FIXTURE_NOW
  const investors = segmentMembers(s, s.segments[0].rules, now)
  assert.ok(investors.every((c) => c.kind === 'investor' && !c.optOut))
  s = run(s, { type: 'integrations/disconnect', id: 'int-wa' }, 'usr-1')
  assert.equal(blockerFor(s, { type: 'campaigns/send', id: 'cmp-3' }), 'Connect the WhatsApp gateway first.')
  s = run(s, { type: 'integrations/connect', id: 'int-wa', account: '+62 811' }, 'usr-1')
  s = run(s, { type: 'campaigns/send', id: 'cmp-2' }, 'usr-3')
  const c = s.campaigns.find((x) => x.id === 'cmp-2')!
  assert.equal(c.status, 'done')
  assert.equal(c.stats.sent, segmentMembers(s, { ...s.segments[1].rules, excludeOptOut: true }, now).length)
})

test('a lead form submission becomes an inquiry and a contact from the form', () => {
  const s = run(seedState(), { type: 'forms/submit', formId: 'frm-1', name: 'Tari', phone: '0819 2020 3030', budget: 2e9, message: '' }, 'public')
  assert.equal(s.inquiries[0].listingId, 'lst-7')
  assert.equal(contactByPhone(s, '0819 2020 3030')?.source, 'form')
  assert.match(blockerFor(s, { type: 'forms/submit', formId: 'frm-1', name: 'X', phone: '0812', budget: null, message: '' })!, /full WhatsApp/)
})

test('stages in use cannot be removed; forecast weights open deals', () => {
  const s = seedState()
  assert.match(blockerFor(s, { type: 'stages/remove', id: 'stg-negotiation' })!, /2 deals sit/)
  assert.equal(blockerFor(s, { type: 'stages/remove', id: 'stg-won' }), 'Won and Lost stages are fixed.')
  const oct = forecast(s, '2026-10').get('usr-2')!
  assert.equal(oct.won, 1_820_000_000)
  const nov = forecast(s, '2026-11').get('usr-2')!
  assert.ok(nov.weighted > 0 && nov.weighted < nov.open)
})

test('lead score rises with deal stage and the report builder groups data', () => {
  const s = seedState()
  const fajar = s.contacts.find((c) => c.id === 'con-9')!
  const dewi = s.contacts.find((c) => c.id === 'con-10')!
  assert.ok(leadScore(s, fajar, FIXTURE_NOW) > leadScore(s, dewi, FIXTURE_NOW))
  const rows = runReport(s, { dataset: 'deals', groupBy: 'stage' }, FIXTURE_NOW, (_k, key) => key)
  assert.equal(rows.reduce((n, r) => n + r.count, 0), s.deals.length)
  assert.equal(rows.find((r) => r.key === 'Negotiation')!.count, 2)
})

test('contacts keep unique phones, referrals follow their lifecycle, overdue tasks run automations', () => {
  let s = seedState()
  const dup = { ...s.contacts[1], id: 'con-new' }
  assert.match(blockerFor(s, { type: 'contacts/upsert', contact: dup })!, /already uses this phone/)
  assert.match(blockerFor(s, { type: 'referrals/setStatus', id: 'ref-1', status: 'paid' })!, /pending referral cannot become paid/)
  s = run(s, { type: 'workflows/upsert', rule: { ...s.workflows.find((w) => w.id === 'wf-4')!, enabled: true } }, 'usr-1')
  s = run(s, { type: 'tasks/flagOverdue', ids: ['tsk-2'] }, 'jessy')
  assert.ok(s.tasks.find((t) => t.id === 'tsk-2')!.overdueFlaggedAt)
  assert.match(s.workflows.find((w) => w.id === 'wf-4')!.runs[0].note, /Dimas Wicaksono that "Send revised quotation follow-up" is overdue/)
  s = run(s, { type: 'campaigns/send', id: 'cmp-3' }, 'usr-3')
  const c = s.campaigns.find((x) => x.id === 'cmp-3')!
  assert.equal(c.recipientIds.length, c.stats.sent)
})
