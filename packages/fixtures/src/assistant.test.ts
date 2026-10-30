import assert from 'node:assert/strict'
import { test } from 'node:test'
import { consoleStart, consoleTurn } from './assistant'
import type { ConsoleConvo, ConsoleReply } from './assistant'
import { FIXTURE_NOW } from './clock'
import { roleOf } from './iam'
import { jessyStep } from './jessy'
import { JESSY, reduce, seedState } from './store'
import type { AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()

/** Feeds lines through jessyStep as the chat UI does: actions run as the member, the AI call log as Jessy. */
const talk = (state: AppState, userId: string, lines: string[]) => {
  let s = state
  let convo: ConsoleConvo = consoleStart(s, { userId, permissions: roleOf(s, userId)!.permissions }).convo
  let replies: ConsoleReply[] = []
  let dispatched: string[] = []
  for (const line of lines) {
    const step = jessyStep(s, 'jessy_console', consoleTurn, convo, line, AT, undefined, userId)
    s = step.actions.reduce((acc, action) => reduce(acc, { action, meta: { by: action.type === 'ai/logCall' ? JESSY : userId, at: AT } }), s)
    convo = step.convo
    replies = step.replies
    dispatched = step.actions.map((a) => a.type)
  }
  return { state: s, convo, replies, dispatched }
}

test('a read answers from the store and logs its tool through the gateway', () => {
  const s0 = seedState()
  const { state, replies } = talk(s0, 'usr-1', ['what waits for my approval?'])
  assert.match(replies[0].text, /^4 requests wait for you:/)
  assert.match(replies[0].text, /PR-26-0006/)
  assert.ok(replies[0].links?.some((l) => l.kind === 'pr' && l.id === 'pr-6'))
  const call = state.aiCalls[0]
  assert.equal(state.aiCalls.length, s0.aiCalls.length + 1)
  assert.equal(call.agentId, 'jessy_console')
  assert.equal(call.purpose, 'Read approvals')
  assert.deepEqual(call.toolCalls, ['read_approvals'])
})

test('stock and sales answers use the store helpers, in English or Indonesian', () => {
  const s0 = seedState()
  assert.match(talk(s0, 'usr-1', ['stok printer toner']).replies[0].text, /^Printer toner: 5 pcs on hand\./)
  assert.match(talk(s0, 'usr-1', ['penjualan bulan ini']).replies[0].text, /^1 deal won this month, worth Rp 1\.82 B/)
})

test('a read without the permission is refused politely and touches no tool', () => {
  const s0 = seedState()
  const { state, replies } = talk(s0, 'usr-2', ['who is late today?'])
  assert.match(replies[0].text, /^Sorry, your role cannot see attendance\. It needs the "View employees, attendance, requests and HR reports" permission\./)
  assert.deepEqual(state.aiCalls[0].toolCalls, [])
  assert.match(talk(s0, 'usr-2', ['status of Clara Wijaya']).replies[0].text, /cannot see candidates/)
})

test('a change is proposed first, and only Confirm dispatches it as the member', () => {
  const s0 = seedState()
  const proposed = talk(s0, 'usr-2', ['raise a PR for 10 A4 paper because the open house needs flyers'])
  assert.deepEqual(proposed.dispatched, ['ai/logCall'])
  assert.equal(proposed.state.purchaseRequests.length, s0.purchaseRequests.length)
  assert.equal(proposed.replies[0].proposal?.title, 'Raise purchase request PR-26-0008')
  assert.ok(proposed.replies[0].proposal?.lines.includes('Reason: the open house needs flyers'))
  assert.deepEqual(proposed.replies[0].quick, ['Confirm', 'Cancel'])
  assert.equal(proposed.convo.pending?.kind, 'pr')

  const { state, replies, dispatched } = talk(s0, 'usr-2', ['raise a PR for 10 A4 paper because the open house needs flyers', 'Confirm'])
  assert.deepEqual(dispatched, ['prs/save', 'prs/submit', 'ai/logCall'])
  const pr = state.purchaseRequests.find((r) => r.code === 'PR-26-0008')!
  assert.equal(pr.status, 'pending')
  assert.equal(pr.requesterId, 'emp-3')
  assert.equal(pr.createdBy, 'usr-2')
  assert.match(replies[0].text, /^Done\. PR-26-0008/)
  const audit = state.audit.find((a) => a.entityId === pr.id)
  assert.equal(audit?.by, 'usr-2')
  assert.equal(state.aiCalls[0].purpose, 'Confirm change')
})

test('cancel drops the proposal without touching the store', () => {
  const s0 = seedState()
  const { state, convo, replies } = talk(s0, 'usr-2', ['check me in', 'cancel'])
  assert.equal(replies[0].text, 'Cancelled. Nothing changed.')
  assert.equal(convo.pending, null)
  assert.equal(state.attendance.length, s0.attendance.length)
})

test('a change the store would refuse is explained instead of proposed', () => {
  const s0 = seedState()
  assert.equal(talk(s0, 'usr-1', ['check me in']).replies[0].text, 'I cannot do that: Ayu Pramesti already checked in today.')
  assert.equal(talk(s0, 'usr-1', ['approve LV-26-0001']).replies[0].text, 'I cannot do that: Waiting for Hana Wirawan to decide.')
  assert.match(talk(s0, 'usr-1', ['reject LV-26-0004']).replies[0].text, /Say why the request is rejected\./)
  assert.match(talk(s0, 'usr-2', ['announce Office closed Friday: The office closes at noon.']).replies[0].text, /^Sorry, your role cannot do that\./)
})

test('approving a request in the queue records the member on the step', () => {
  const s0 = seedState()
  const { state } = talk(s0, 'usr-1', ['approve LV-26-0004', 'yes'])
  const r = state.hrRequests.find((x) => x.code === 'LV-26-0004')!
  assert.equal(r.steps.find((st) => st.by === 'usr-1')?.decision, 'approved')
  assert.equal(state.audit.find((a) => a.entityId === r.id)?.by, 'usr-1')
})

test('help lists only what the role may do', () => {
  const s0 = seedState()
  const admin = talk(s0, 'usr-1', ['help']).replies[0].text
  const agent = talk(s0, 'usr-2', ['help']).replies[0].text
  assert.match(admin, /Overdue invoices/)
  assert.doesNotMatch(agent, /Overdue invoices|Post an announcement/)
  assert.match(agent, /Raise a purchase request/)
})
