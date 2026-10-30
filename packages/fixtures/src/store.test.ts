import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DAY, FIXTURE_NOW, addDays } from './clock'
import { draftBlogPost, seoChecks } from './content'
import { filterListings } from './derive'
import { exclusiveState, sweepTargets } from './exclusives'
import { fromThreeWay, shareAmounts, shareBlocker } from './sharing'
import { buyerStart, buyerTurn, parseBudget, partnerStart, partnerTurn } from './jessy'
import type { BuyerConvo, PartnerConvo, Turn } from './jessy'
import { JESSY, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, actions: AppAction[], by = JESSY) =>
  actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at: AT } }), s)

/** Feed a script of user lines through a chat engine, applying each turn's actions. */
const chat = <C>(
  state: AppState,
  start: Turn<C>,
  turn: (s: AppState, c: C, text: string, at: string) => Turn<C>,
  lines: string[],
) => {
  let s = state
  let convo = start.convo
  let last = start
  for (const line of lines) {
    last = turn(s, convo, line, AT)
    s = run(s, last.actions)
    convo = last.convo
  }
  return { state: s, convo, last }
}

test('parseBudget reads English and Indonesian price shorthand', () => {
  assert.equal(parseBudget('under Rp 2.5 B'), 2_500_000_000)
  assert.equal(parseBudget('Rp 850 M'), 850_000_000)
  assert.equal(parseBudget('3 billion'), 3_000_000_000)
  assert.equal(parseBudget('budget 2,5 M'), 2_500_000_000)
  assert.equal(parseBudget('maks 850 juta'), 850_000_000)
  assert.equal(parseBudget('no numbers'), null)
})

test('buyer chat finds listings and records an inquiry as Jessy', () => {
  const s0 = seedState()
  const { state, last } = chat<BuyerConvo>(s0, buyerStart(s0), buyerTurn, [
    'house in Bogor under Rp 2.5 B',
    'I would like to book a site visit',
    'Within 3 months',
    'Mortgage',
    'To live in',
    'Rina',
    '0812 9999 1234',
  ])
  assert.equal(state.inquiries.length, s0.inquiries.length + 1)
  const inq = state.inquiries[0]
  assert.equal(inq.name, 'Rina')
  assert.equal(inq.listingId, 'lst-7')
  assert.equal(inq.status, 'new')
  assert.match(last.replies[0].text, /INQ-26-0113/)
  assert.equal(state.agentEvents[0].kind, 'inquiry')
})

test('buyer chat still understands Indonesian', () => {
  const s0 = seedState()
  const { state } = chat<BuyerConvo>(s0, buyerStart(s0), buyerTurn, ['rumah di Bogor budget 2,5 M', 'saya mau jadwal survei', 'sekarang', 'tunai', 'tinggal', 'Rina', '0812 9999 1234'])
  assert.equal(state.inquiries[0].listingId, 'lst-7')
})

test('partner registers a listing through chat, team approves it', () => {
  const s0 = seedState()
  const { state } = chat<PartnerConvo>(s0, partnerStart(s0), partnerTurn, [
    '0812-1100-2231',
    'Register a property',
    'House',
    'For sale',
    'Corner house near Pondok Ranji station',
    'Tangerang Selatan, Ciputat Timur',
    'Rp 1.75 B',
    '120',
    '90',
    '3',
    'SHM',
    'near the station, flood-free',
    'Skip',
    'Yes, 60 days',
    'Yes, send',
  ])
  const created = state.listings[0]
  assert.equal(created.code, 'AS-0017')
  assert.equal(created.status, 'review')
  assert.equal(created.source, 'jessy')
  assert.equal(created.price, 1_750_000_000)
  assert.equal(created.partnerId, 'ptn-1')
  const exclusive = state.exclusives.find((e) => e.listingId === created.id)
  assert.ok(exclusive)
  assert.equal((Date.parse(exclusive.endsAt) - Date.parse(exclusive.startsAt)) / DAY, 60)

  const approved = run(state, [{ type: 'listings/approve', id: created.id }], 'usr-1')
  assert.equal(approved.listings[0].status, 'active')
  assert.ok(approved.profitShares.some((p) => p.listingId === created.id))
  assert.equal(approved.history[0].text, 'Listing approved and published on the website')
})

test('unknown phone registers a new partner first', () => {
  const s0 = seedState()
  const { state, convo } = chat<PartnerConvo>(s0, partnerStart(s0), partnerTurn, ['0899 1234 5678', 'PT Tanah Air'])
  assert.equal(state.partners.length, s0.partners.length + 1)
  assert.equal(state.partners.at(-1)!.code, 'MT-009')
  assert.equal(state.partners.at(-1)!.kind, 'developer')
  assert.equal(convo.stage, 'menu')
})

test('partner delists through chat; the exclusive right ends with it', () => {
  const s0 = seedState()
  const { state } = chat<PartnerConvo>(s0, partnerStart(s0), partnerTurn, [
    '0812-1100-2231',
    'Withdraw a listing',
    'AS-0001',
    'Sold it myself',
    'Yes, withdraw',
  ])
  const l = state.listings.find((x) => x.code === 'AS-0001')!
  assert.equal(l.status, 'delisted')
  assert.equal(l.delistReason, 'Sold it myself')
  assert.ok(state.exclusives.find((e) => e.listingId === l.id)!.endedAt)
})

test('reducer refuses a delist on a reserved listing', () => {
  const s0 = seedState()
  const s1 = run(s0, [{ type: 'listings/delist', id: 'lst-4', reason: 'x' }])
  assert.equal(s1, s0)
})

test('exclusive state follows the reminder milestones', () => {
  const s = seedState()
  const states = Object.fromEntries(s.exclusives.map((e) => [e.id, exclusiveState(e, FIXTURE_NOW)]))
  assert.equal(states['exc-1'], 'active')
  assert.equal(states['exc-5'], 'due')
  assert.equal(states['exc-7'], 'expired')
  assert.equal(states['exc-8'], 'ended')
  const due = sweepTargets(s, FIXTURE_NOW).map((e) => e.id)
  assert.ok(due.includes('exc-6'), 'a right at its end date waits for the sweep to expire it')
  assert.ok(!due.includes('exc-7'), 'an expired right is already stored as expired')
  assert.ok(!due.includes('exc-5'), 'the 7-day reminder from two days ago goes out once')
  assert.ok(!due.includes('exc-1'))
})

test('sweeping and extending clear the due list', () => {
  const s0 = seedState()
  const ids = sweepTargets(s0, FIXTURE_NOW).map((e) => e.id)
  const s1 = run(s0, [{ type: 'exclusives/sweep', ids }])
  assert.equal(sweepTargets(s1, FIXTURE_NOW).length, 0)
  assert.equal(s1.exclusives.find((x) => x.id === 'exc-6')!.status, 'expired')
  const s2 = run(s1, [{ type: 'exclusives/extend', id: 'exc-7', days: 90 }], 'usr-1')
  const e = s2.exclusives.find((x) => x.id === 'exc-7')!
  assert.equal(e.endsAt, addDays(AT, 90))
  assert.equal(exclusiveState(e, FIXTURE_NOW), 'active')
})

test('profit share must add up to 100 and pays from the sold price', () => {
  const split = (partner: number, company: number, agent: number) =>
    fromThreeWay({ id: 'psh-x', listingId: 'lst-1', commissionPct: 2.5, partnerPct: partner, companyPct: company, agentPct: agent, agentId: null, note: '' })
  assert.match(shareBlocker(split(10, 50, 30))!, /90%/)
  assert.equal(shareBlocker(split(10, 60, 30)), null)
  const s = seedState()
  const sold = s.listings.find((l) => l.status === 'sold')!
  const share = s.profitShares.find((p) => p.listingId === sold.id)!
  const amt = shareAmounts(share, sold)
  assert.equal(amt.basis, sold.soldPrice)
  assert.equal(Math.round(amt.partner + amt.company + amt.agent + amt.other), Math.round(amt.commission))
})

test('marking sold ends the exclusive right', () => {
  const s = run(seedState(), [{ type: 'listings/markSold', id: 'lst-1', soldPrice: 6_500_000_000 }], 'usr-1')
  assert.equal(s.listings.find((l) => l.id === 'lst-1')!.soldPrice, 6_500_000_000)
  assert.ok(s.exclusives.find((e) => e.listingId === 'lst-1')!.endedAt)
})

test('filterListings combines search and filters with AND', () => {
  const rows = seedState().listings
  assert.deepEqual(
    filterListings(rows, { type: 'gudang', deal: 'sewa' }).map((l) => l.code),
    ['AS-0004', 'AS-0015'],
  )
  assert.equal(filterListings(rows, { query: 'bandung ruko' }).length, 1)
})

test('drafted blog post passes most SEO and GEO checks', () => {
  const s = seedState()
  const post = draftBlogPost('Tips for buying a family house in Bogor', 'family house in bogor', s.listings.slice(6, 7), AT)
  const failed = seoChecks(post).filter((c) => !c.ok).map((c) => c.label)
  assert.ok(failed.length <= 1, failed.join(', '))
})
