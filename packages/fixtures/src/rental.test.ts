import assert from 'node:assert/strict'
import { test } from 'node:test'
import { FIXTURE_NOW } from './clock'
import { partnerRentals } from './rental'
import { seedState } from './store'

const s = seedState()
const owner = (name: string) => s.partners.find((p) => p.name === name)!.id

test('an owner sees a lease ending soon with its overdue month and net rent', () => {
  const [r] = partnerRentals(s, owner('Hendra Gunawan'), FIXTURE_NOW)
  assert.equal(r.listing.deal, 'sewa')
  assert.equal(r.state, 'ending')
  assert.equal(r.overdue.length, 1)
  assert.equal(r.fee, r.collected * 0.1)
  assert.equal(r.ownerNet, r.collected - r.fee)
  assert.equal(r.agentFee, 0)
  assert.ok(r.paidOut <= r.ownerNet)
})

test('an agent sees the client it represents and earns a part of the fee', () => {
  const [r] = partnerRentals(s, owner('Rumah Kita Realty'), FIXTURE_NOW)
  assert.equal(r.lease.ownerName, 'Bapak Darmawan Susilo')
  assert.equal(r.state, 'occupied')
  assert.equal(r.overdue.length, 0)
  assert.equal(r.agentFee, r.fee * 0.3)
  assert.ok(r.agentPaidOut > 0 && r.agentPaidOut <= r.agentFee)
  assert.ok(r.nextDue && r.nextDue > new Date(FIXTURE_NOW).toISOString())
})

test('an ended lease has no next bill', () => {
  const [r] = partnerRentals(s, owner('Made Arsana'), FIXTURE_NOW)
  assert.equal(r.state, 'ended')
  assert.ok(r.daysToEnd < 0)
  assert.equal(r.nextDue, null)
})

test('partners without managed rentals see none', () => {
  assert.deepEqual(partnerRentals(s, owner('Sri Wahyuni'), FIXTURE_NOW), [])
})
