import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addDays, FIXTURE_NOW } from './clock'
import { isFeatured, promoPrice, statementTotal, sweepDue, unitCounts } from './ops'
import { blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, action: AppAction, by = 'usr-6') => {
  assert.equal(blockerFor(s, action), null, `${action.type} should be allowed`)
  return reduce(s, { action, meta: { by, at: AT } })
}

test('a paid booking fee books the unit and the deal; a refund releases the unit', () => {
  let s = seedState()
  s = run(s, { type: 'units/hold', id: 'unt-A3', until: addDays(AT, 2), dealId: 'del-5' }, 'usr-4')
  assert.equal(s.units.find((u) => u.id === 'unt-A3')!.status, 'held')
  s = run(s, { type: 'payments/create', payment: { id: 'pay-x', code: '', kind: 'booking_fee', dealId: 'del-5', contactId: 'con-6', unitId: 'unt-A3', amount: 20_000_000, method: 'qris', status: 'pending', reference: 'QR', expiresAt: addDays(AT, 1), paidAt: null, refundOf: null, createdBy: '', createdAt: '' } }, 'usr-4')
  assert.equal(s.payments[0].code, 'PAY-26-0305')
  s = run(s, { type: 'payments/markPaid', id: 'pay-x', reference: 'QR-OK' }, 'usr-7')
  assert.equal(s.units.find((u) => u.id === 'unt-A3')!.status, 'booked')
  assert.equal(s.deals.find((d) => d.id === 'del-5')!.stageId, 'stg-booking')
  s = run(s, { type: 'payments/refund', id: 'pay-x', refundId: 'pay-r' }, 'usr-7')
  assert.equal(s.payments.find((p) => p.id === 'pay-x')!.status, 'refunded')
  assert.equal(s.payments[0].refundOf, 'pay-x')
  assert.equal(s.units.find((u) => u.id === 'unt-A3')!.status, 'available')
  assert.match(blockerFor(s, { type: 'payments/refund', id: 'pay-x', refundId: 'pay-r2' })!, /Only a paid payment/)
})

test('visits cannot double-book an agent and follow their lifecycle', () => {
  let s = seedState()
  const clash: AppAction = { type: 'visits/create', visit: { ...s.visits.find((v) => v.id === 'vis-3')!, id: 'vis-x', startAt: addDays(s.visits.find((v) => v.id === 'vis-3')!.startAt, 0) } }
  assert.match(blockerFor(s, clash)!, /Dimas Wicaksono already has VS-26-0203/)
  assert.equal(blockerFor(s, { type: 'visits/create', visit: { ...s.visits[0], id: 'vis-y', startAt: addDays(AT, -1) } }), 'Pick a time in the future.')
  assert.match(blockerFor(s, { type: 'visits/setStatus', id: 'vis-3', status: 'done' })!, /scheduled visit cannot become done/)
  s = run(s, { type: 'visits/setStatus', id: 'vis-6', status: 'done' }, 'usr-4')
  assert.match(s.activities[0].text, /VS-26-0206: site visit at A-03 done/)
  s = run(s, { type: 'visits/feedback', id: 'vis-6', rating: 5, feedback: 'Loved the corner.' }, 'usr-4')
  assert.equal(s.visits.find((v) => v.id === 'vis-6')!.rating, 5)
})

test('open house registration respects capacity, duplicates and publication', () => {
  let s = seedState()
  const reg = (phone: string): AppAction => ({ type: 'openHouses/register', id: 'oh-1', registration: { id: `r-${phone}`, name: 'Guest', phone, at: AT, attended: false } })
  assert.equal(blockerFor(s, reg('0812-4400-1188')), 'This number is already registered.')
  s = run(s, reg('0811 2222 3333'), 'public')
  assert.equal(s.openHouses.find((o) => o.id === 'oh-1')!.registrations.length, 4)
  assert.equal(blockerFor(s, { type: 'openHouses/register', id: 'oh-2', registration: { id: 'x', name: 'L', phone: '0811 9999 0000', at: AT, attended: false } }), 'This open house has ended.')
})

test('selling or delisting takes a listing off every portal; Lamudi needs photos', () => {
  const seed = seedState()
  const listing = seed.portalSyncs.find((x) => x.status === 'live')!.listingId
  let s = { ...seed, listings: seed.listings.map((l) => (l.id === listing ? { ...l, photo: null } : l)) }
  assert.match(blockerFor(s, { type: 'syncs/publish', listingId: listing, portal: 'rumah123' })!, /Already live on Rumah123/)
  s = run(s, { type: 'syncs/publish', listingId: listing, portal: 'pinhome' }, 'usr-3')
  assert.equal(s.portalSyncs.find((x) => x.listingId === listing && x.portal === 'pinhome')!.status, 'error')
  s = run(s, { type: 'listings/markSold', id: listing, soldPrice: 1e9 }, 'usr-6')
  assert.ok(s.portalSyncs.filter((x) => x.listingId === listing).every((x) => x.status === 'removed'))
  assert.equal(blockerFor(s, { type: 'syncs/publish', listingId: listing, portal: 'olx' }), 'Only a live listing can go to a portal.')
})

test('commission statements come from won deals and move draft, approved, paid', () => {
  let s = seedState()
  assert.equal(blockerFor(s, { type: 'statements/generate', id: 'cs-x', agentId: 'usr-4', month: '2026-10' }), 'This agent won no deals in that month.')
  s = run(s, { type: 'statements/generate', id: 'cs-1', agentId: 'usr-2', month: '2026-10' })
  const st = s.statements[0]
  assert.equal(st.lines.length, 1)
  assert.equal(Math.round(st.lines[0].amount), 16_380_000)
  assert.match(blockerFor(s, { type: 'statements/pay', id: 'cs-1' })!, /Approve the statement/)
  s = run(s, { type: 'statements/adjust', id: 'cs-1', adjustment: 1_000_000, note: 'Weekend bonus' })
  s = run(s, { type: 'statements/approve', id: 'cs-1' })
  s = run(s, { type: 'statements/pay', id: 'cs-1' }, 'usr-7')
  assert.equal(statementTotal(s.statements[0]), 17_380_000)
  assert.equal(s.statements[0].status, 'paid')
})

test('promotions drive the public price, and the sweep releases lapsed holds and bills', () => {
  let s = seedState()
  assert.equal(promoPrice(s, 'lst-14', FIXTURE_NOW), 35_500_000_000)
  assert.ok(isFeatured(s, 'lst-5', FIXTURE_NOW))
  assert.ok(!isFeatured(s, 'lst-2', FIXTURE_NOW), 'an ended promotion no longer features')
  assert.equal(blockerFor(s, { type: 'promotions/upsert', promotion: { ...s.promotions[1], id: 'p2', promoPrice: 40e9 } }), 'The promotion price must be below the listing price.')
  const held = unitCounts(s.units).held
  assert.ok(sweepDue(s, FIXTURE_NOW + 2 * 86_400_000))
  s = reduce(s, { action: { type: 'ops/sweep' }, meta: { by: 'jessy', at: addDays(AT, 2) } })
  assert.equal(unitCounts(s.units).held, 0)
  assert.ok(held > 0)
  assert.equal(s.payments.find((p) => p.id === 'pay-2')!.status, 'expired')
})

test('saved properties toggle per phone', () => {
  let s = seedState()
  s = run(s, { type: 'saved/toggle', phone: '0812 0000 1111', listingId: 'lst-3' }, 'public')
  assert.equal(s.savedProperties[0].phone, '081200001111')
  s = run(s, { type: 'saved/toggle', phone: '081200001111', listingId: 'lst-3' }, 'public')
  assert.ok(!s.savedProperties.some((x) => x.phone === '081200001111'))
})
