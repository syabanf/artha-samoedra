import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ProfitShare, ShareParty } from '@artha/types'
import { FIXTURE_NOW } from './clock'
import { statementLines } from './ops'
import { blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'
import { migrateShare, shareAmounts, shareBlocker, splitCommission, totalsByParty, totalsByPeriod } from './sharing'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, actions: AppAction[], by = 'usr-1') => actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at: AT } }), s)

const party = (p: Partial<ShareParty> & Pick<ShareParty, 'kind' | 'mode' | 'value'>): ShareParty => ({ id: `p-${p.kind}-${p.name ?? ''}`, refId: null, name: '', ...p })
const scheme = (parties: ShareParty[], extra: Partial<ProfitShare> = {}): ProfitShare => ({
  id: 'psh-t',
  listingId: 'lst-1',
  commissionMode: 'percent',
  commissionPct: 2.5,
  commissionFixed: 0,
  parties,
  note: '',
  ...extra,
})

test('fixed amounts come off first and percentages split the rest', () => {
  const parts = splitCommission(
    [party({ kind: 'other', name: 'Notary', mode: 'fixed', value: 10_000_000 }), party({ kind: 'company', mode: 'percent', value: 60 }), party({ kind: 'agent', mode: 'percent', value: 40 })],
    110_000_000,
  )
  assert.deepEqual(parts.map((p) => p.amount), [10_000_000, 60_000_000, 40_000_000])
  // A fixed amount never takes more than what is left.
  const capped = splitCommission([party({ kind: 'other', name: 'Notary', mode: 'fixed', value: 50 }), party({ kind: 'company', mode: 'percent', value: 100 })], 30)
  assert.deepEqual(capped.map((p) => p.amount), [30, 0])
})

test('scheme blockers explain each mismatch', () => {
  const company = party({ kind: 'company', mode: 'percent', value: 70 })
  const agent = party({ kind: 'agent', mode: 'percent', value: 30 })
  assert.equal(shareBlocker(scheme([company, agent])), null)
  assert.match(shareBlocker(scheme([company]))!, /total 100%, they total 70%/)
  assert.match(shareBlocker(scheme([company, agent], { commissionPct: 12 }))!, /at most 10%/)
  assert.match(shareBlocker(scheme([company, agent], { commissionMode: 'fixed', commissionFixed: 0 }))!, /above Rp 0/)
  assert.equal(shareBlocker(scheme([company, agent], { commissionMode: 'fixed', commissionFixed: 50_000_000 })), null)
  assert.match(shareBlocker(scheme([]))!, /at least one party/)
  assert.match(shareBlocker(scheme([party({ kind: 'company', mode: 'fixed', value: 1_000 })]))!, /percentage party/)
  assert.match(shareBlocker(scheme([company, agent, party({ kind: 'other', mode: 'fixed', value: 5 })]))!, /Name every other party/)
  assert.match(shareBlocker(scheme([company, { ...company, id: 'dup', value: 30 }]))!, /only once/)
  assert.match(shareBlocker(scheme([company, agent, party({ kind: 'other', name: 'Notary', mode: 'fixed', value: 2e9 })]), 4e9)!, /more than the/)
})

test('the old three-way split migrates to parties', () => {
  const migrated = migrateShare(
    { id: 'psh-9', listingId: 'lst-1', commissionPct: 3, partnerPct: 10, companyPct: 60, agentPct: 30, agentName: 'Rina Kartika', note: '' },
    seedState().users,
  )
  assert.deepEqual(
    migrated.parties.map((p) => [p.kind, p.value, p.refId]),
    [
      ['company', 60, null],
      ['agent', 30, 'usr-4'],
      ['partner', 10, null],
    ],
  )
  assert.equal(shareBlocker(migrated), null)
  assert.equal(migrateShare(migrated), migrated)
  // Every seeded scheme is valid on its listing.
  const s = seedState()
  for (const share of s.profitShares) {
    const l = s.listings.find((x) => x.id === share.listingId)!
    assert.equal(shareBlocker(share, l.soldPrice ?? l.price), null, l.code)
  }
})

test('the store refuses an invalid scheme with the blocker sentence', () => {
  const s = seedState()
  const share = scheme([party({ kind: 'company', mode: 'percent', value: 50 })])
  assert.match(blockerFor(s, { type: 'profitShares/upsert', share })!, /50%/)
})

test('marking a listing sold creates one settlement with a line per party', () => {
  const s = run(seedState(), [{ type: 'listings/markSold', id: 'lst-14', soldPrice: 36_000_000_000 }])
  const st = s.settlements.find((x) => x.listingId === 'lst-14')!
  assert.equal(st.basis, 36_000_000_000)
  assert.equal(st.dealId, null)
  assert.equal(st.status, 'open')
  assert.equal(st.commission, 1_080_000_000)
  assert.equal(st.lines[0].label, 'Notary Hendra Wijaya, S.H.')
  assert.equal(st.lines[0].amount, 25_000_000)
  assert.equal(Math.round(st.lines.reduce((n, l) => n + l.amount, 0)), st.commission)
  // The scheme names Dimas as the agent.
  assert.ok(st.lines.some((l) => l.party === 'agent:usr-2'))
  // Another unrelated action does not add a second settlement.
  const again = run(s, [{ type: 'settings/update', patch: {} }])
  assert.equal(again.settlements.filter((x) => x.listingId === 'lst-14').length, 1)
})

test('a deal moving to won creates a settlement on the deal value, and the sale reuses it', () => {
  let s = seedState()
  // Booking deal DL-26-0044 has an accepted quotation, so it can be won.
  s = run(s, [{ type: 'deals/move', id: 'del-4', stageId: 'stg-won' }])
  const st = s.settlements.find((x) => x.dealId === 'del-4')
  assert.ok(st, 'settlement for the won deal')
  assert.equal(st.basis, 1_200_000_000)
  assert.equal(st.listingId, 'lst-4')
  s = run(s, [{ type: 'listings/markSold', id: 'lst-4', soldPrice: 1_200_000_000 }])
  assert.equal(s.settlements.filter((x) => x.listingId === 'lst-4').length, 1)
})

test('settlements are marked paid once and feed reports and commission statements', () => {
  let s = seedState()
  const seeded = s.settlements[0]
  assert.equal(seeded.status, 'open')
  s = run(s, [{ type: 'settlements/markPaid', id: seeded.id }], 'usr-7')
  assert.equal(s.settlements[0].status, 'paid')
  assert.equal(s.settlements[0].paidAt, AT)
  assert.equal(blockerFor(s, { type: 'settlements/markPaid', id: seeded.id }), 'This settlement is already paid.')

  const lines = statementLines(s, 'usr-2', '2026-10')
  assert.equal(lines.length, 1)
  assert.equal(Math.round(lines[0].amount), 16_380_000)
  assert.equal(Math.round(lines[0].agentPct), 30)

  const byMonth = totalsByPeriod(s.settlements, 'month')
  assert.equal(byMonth[0].period, '2026-10')
  assert.equal(Math.round(byMonth[0].commission), 54_600_000)
  assert.equal(totalsByPeriod(s.settlements, 'quarter')[0].period, '2026-Q4')
  const byParty = totalsByParty(s.settlements)
  const company = byParty.find((r) => r.kind === 'company')!
  assert.equal(Math.round(company.paid), 38_220_000)
  assert.equal(company.open, 0)
})

test('shareAmounts totals each kind of party', () => {
  const s = seedState()
  const l = s.listings.find((x) => x.id === 'lst-6')!
  const amt = shareAmounts(s.profitShares.find((p) => p.listingId === l.id)!, l)
  assert.equal(amt.other, 40_000_000)
  assert.equal(Math.round(amt.company + amt.agent + amt.partner + amt.other), Math.round(amt.commission))
})
