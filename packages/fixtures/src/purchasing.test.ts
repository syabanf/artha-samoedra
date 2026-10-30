import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIXTURE_NOW } from './clock'
import { accountBalance, balanceSheet, billTotals } from './finance'
import { averageCost, buildPoFromRequests, creditLeft, lowStock, onHand, prsAwaiting, stockCard } from './purchasing'
import { blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, actions: AppAction[], by = 'usr-10') => actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at: AT } }), s)
const GRNI = 'gl-2-1700'
const INV = 'gl-1-1700'

test('the seeded stock, ledger and low-stock list agree', () => {
  const s = seedState()
  assert.equal(balanceSheet(s, AT).difference, 0)
  // Brochures: 13 opening + 20 received - 2 returned - 6 issued, with 4 moved to Bandung.
  assert.equal(onHand(s, 'itm-2'), 25)
  assert.equal(onHand(s, 'itm-2', 'wh-bdg'), 7)
  assert.equal(averageCost(s, 'itm-2'), 320_000)
  const value = s.items.reduce((n, i) => n + onHand(s, i.id) * averageCost(s, i.id), 0)
  assert.ok(Math.abs(value - accountBalance(s, INV, AT)) < 5_000, 'the inventory account matches stock at average cost')
  assert.ok(lowStock(s).every((r) => r.qty < r.item.minStock))
  const card = stockCard(s, 'itm-2', 'wh-jkt')
  assert.equal(card.closing, onHand(s, 'itm-2', 'wh-jkt'))
})

test('a request climbs its approval levels by amount', () => {
  let s = seedState()
  const decide = (id: string, by: string): AppAction => ({ type: 'prs/decide', id, decision: 'approved', note: '', by })
  assert.match(blockerFor(s, decide('pr-2', 'usr-7'))!, /Waiting for Nadia Halim/)
  s = run(s, [decide('pr-2', 'usr-3')])
  assert.equal(s.purchaseRequests.find((r) => r.id === 'pr-2')?.status, 'approved', 'under Rp 10 million needs only the manager')
  assert.ok(prsAwaiting(s, 'usr-7', true).some((r) => r.id === 'pr-6'), 'the Rp 36 million request waits for Finance')
  assert.match(blockerFor(s, decide('pr-6', 'usr-6'))!, /your own request/)
})

test('an order from requests is received, billed, and clears goods received not invoiced', () => {
  let s = seedState()
  const po = buildPoFromRequests(s, ['pr-1'], 'vnd-6', AT, 'usr-10')
  assert.deepEqual(po.lines.map((l) => [l.itemId, l.qty, l.unitPrice]), [['itm-6', 10, 95_000], ['itm-7', 20, 60_000]])
  s = run(s, [{ type: 'pos/save', po }, { type: 'pos/send', id: po.id }])
  assert.equal(s.purchaseRequests.find((r) => r.id === 'pr-1')?.status, 'ordered')
  const receipt = (accepted: number) => ({ id: 'gr-t', code: 'GR-26-0099', poId: po.id, deliveryNote: 'DO-1', receivedAt: AT, journalId: null, by: '', lines: po.lines.map((l) => ({ poLineId: l.id, accepted: Math.min(accepted, l.qty), rejected: 0, qcNote: '' })) })
  assert.match(blockerFor(s, { type: 'receipts/create', receipt: { ...receipt(10), lines: [{ poLineId: po.lines[0].id, accepted: 11, rejected: 0, qcNote: '' }] } })!, /still to come/)
  const grni = accountBalance(s, GRNI)
  const before = onHand(s, 'itm-7')
  s = run(s, [{ type: 'receipts/create', receipt: receipt(20) }])
  assert.equal(s.purchaseOrders.find((x) => x.id === po.id)?.status, 'received')
  assert.equal(onHand(s, 'itm-7') - before, 20)
  assert.equal(accountBalance(s, GRNI) - grni, 10 * 95_000 + 20 * 60_000)
  s = run(s, [{ type: 'pos/bill', id: po.id, billId: 'bil-t', vendorRef: 'MA-1', date: AT }])
  assert.equal(s.bills.find((b) => b.id === 'bil-t')?.status, 'posted')
  assert.equal(accountBalance(s, GRNI), grni)
  assert.match(blockerFor(s, { type: 'pos/bill', id: po.id, billId: 'bil-u', vendorRef: 'MA-2', date: AT })!, /already billed/)
  assert.equal(balanceSheet(s, AT).difference, 0)
})

test('a vendor credit from a return pays down the bill', () => {
  let s = seedState()
  const credit = s.vendorCredits[0]
  const bill = s.bills.find((b) => b.id === 'bil-7')!
  assert.match(blockerFor(s, { type: 'credits/apply', id: credit.id, billId: 'bil-2', amount: 1 })!, /same vendor/)
  s = run(s, [{ type: 'credits/apply', id: credit.id, billId: bill.id, amount: credit.amount }])
  assert.equal(billTotals(s.bills.find((b) => b.id === 'bil-7')!).balance, billTotals(bill).balance - credit.amount)
  assert.equal(creditLeft(s.vendorCredits[0]), 0)
  assert.equal(balanceSheet(s, AT).difference, 0)
})

test('stock cannot go below zero, transfers keep the total, and counts post their differences', () => {
  let s = seedState()
  assert.match(blockerFor(s, { type: 'stock/issue', itemId: 'itm-10', warehouseId: 'wh-sby', qty: 1, departmentId: 'dep-sls', note: '' })!, /Only 0 pcs/)
  const total = onHand(s, 'itm-12')
  s = run(s, [{ type: 'stock/transfer', itemId: 'itm-12', fromId: 'wh-jkt', toId: 'wh-dps', qty: 5, note: 'Bali launch' }])
  assert.equal(onHand(s, 'itm-12'), total)
  const count = s.stockCounts.find((c) => c.status === 'draft')!
  assert.match(blockerFor(s, { type: 'counts/post', id: count.id })!, /Count \d+ more/)
  const lines = count.lines.map((l) => ({ ...l, countedQty: l.itemId === 'itm-2' ? l.systemQty - 1 : l.systemQty }))
  const before = onHand(s, 'itm-2', 'wh-bdg')
  s = run(s, [{ type: 'counts/save', id: count.id, lines }, { type: 'counts/post', id: count.id }])
  assert.equal(onHand(s, 'itm-2', 'wh-bdg'), before - 1)
  assert.equal(balanceSheet(s, AT).difference, 0)
})
