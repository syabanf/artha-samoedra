import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AiAgentId } from '@artha/types'
import { FIXTURE_NOW } from './clock'
import { budgetState, currentPrompt, lineDiff, memoryId, mergeFacts, promptHistory, toolUsers } from './gateway'
import { buyerStart, buyerTurn, jessyStep, leadTemperature, partnerDraftErrors, partnerStart, partnerTurn } from './jessy'
import type { Engine, Reply, TurnInput } from './jessy'
import { blockerFor, JESSY, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const run = (s: AppState, actions: AppAction[], by = JESSY) =>
  actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at: AT } }), s)

/** Feeds lines through jessyStep, the path the chat UI takes, so gateway logging is part of the script. */
const talk = <C>(state: AppState, agentId: AiAgentId, start: { convo: C }, engine: Engine<C>, lines: (string | [string, TurnInput])[]) => {
  let s = state
  let convo = start.convo
  let replies: Reply[] = []
  for (const line of lines) {
    const [text, input] = typeof line === 'string' ? [line, undefined] : line
    const step = jessyStep(s, agentId, engine, convo, text, AT, input)
    s = run(s, step.actions)
    convo = step.convo
    replies = step.replies
  }
  return { state: s, convo, replies }
}

const BUYER_LINES = ['house in Bogor under Rp 2.5 B', 'Book a site visit', 'Now', 'Cash', 'To live in', 'Rina', '0812 9999 1234']

test('the gateway seed has five agents on version 1 prompts and tools from the registry', () => {
  const s = seedState()
  assert.deepEqual(s.aiAgents.map((a) => a.id), ['jessy_buyer', 'jessy_partner', 'content', 'jessy_console', 'inbox_assist'])
  for (const a of s.aiAgents) {
    assert.equal(currentPrompt(s, a.id)?.version, 1)
    for (const id of a.toolIds) assert.ok(s.aiTools.some((t) => t.id === id), id)
  }
  assert.deepEqual(
    s.aiTools.map((t) => t.id),
    ['search_listings', 'create_inquiry', 'create_listing', 'delist_listing', 'draft_social_post', 'draft_blog_post', 'read_attendance', 'read_stock', 'read_sales', 'read_candidates', 'read_approvals', 'read_leave', 'read_exclusives', 'read_receivables', 'assign_agent'],
  )
  assert.equal(s.aiTools.find((t) => t.id === 'create_inquiry')!.action, 'inquiries/create')
  assert.ok(s.aiCalls.length > 100)
  assert.ok(s.aiCalls.every((c) => Date.parse(c.at) <= FIXTURE_NOW))
  assert.deepEqual(toolUsers(s, 'create_listing').map((a) => a.id), ['jessy_partner'])
})

test('every buyer turn logs a call; the lead carries qualification and the handoff names the agent', () => {
  const s0 = seedState()
  const { state, replies } = talk(s0, 'jessy_buyer', buyerStart(s0), buyerTurn, BUYER_LINES)
  const calls = state.aiCalls.slice(0, BUYER_LINES.length)
  assert.equal(state.aiCalls.length, s0.aiCalls.length + BUYER_LINES.length)
  assert.ok(calls.every((c) => c.agentId === 'jessy_buyer'))
  assert.deepEqual(calls[0].toolCalls, ['create_inquiry'])
  assert.equal(calls[0].purpose, 'Capture lead')
  assert.equal(calls[0].subject, '081299991234')
  assert.ok(calls.at(-1)!.toolCalls.includes('search_listings'))

  const inq = state.inquiries[0]
  assert.equal(inq.budget, 2_500_000_000)
  assert.deepEqual(inq.qualification, { timeline: 'now', financing: 'cash', purpose: 'live_in', temperature: 'hot' })
  const owner = state.users.find((u) => u.id === inq.ownerId)
  assert.ok(owner)
  assert.match(replies[0].text, new RegExp(inq.code))
  assert.equal(replies[1].text, `${owner.name} from our sales team will message you on WhatsApp today about AS-0007.`)

  const memory = state.aiMemory.find((m) => m.id === memoryId('jessy_buyer', '0812 9999 1234'))
  assert.ok(memory)
  assert.ok(memory.facts.includes('Budget: Rp 2.5 B'), memory.facts.join(' | '))
  assert.ok(memory.facts.includes('Preferred city: Bogor'))
  assert.ok(memory.facts.includes('Financing: cash'))
})

test('the handoff says our team when the round-robin rule is off', () => {
  const s0 = seedState()
  const s1 = { ...s0, workflows: s0.workflows.map((w) => (w.action === 'assign_round_robin' ? { ...w, enabled: false } : w)) }
  const { state, replies } = talk(s1, 'jessy_buyer', buyerStart(s1), buyerTurn, BUYER_LINES)
  assert.equal(state.inquiries[0].ownerId, null)
  assert.match(replies[1].text, /^Our team will message you/)
})

test('skipped questions stay empty and score the lead cold', () => {
  const s0 = seedState()
  const { state } = talk(s0, 'jessy_buyer', buyerStart(s0), buyerTurn, ['Contact me', 'Skip', 'Skip', 'Skip', 'Skip', 'Budi', '0813 1111 2222'])
  assert.deepEqual(state.inquiries[0].qualification, { timeline: null, financing: null, purpose: null, temperature: 'cold' })
  assert.equal(leadTemperature({ timeline: 'three_months', financing: 'mortgage', purpose: null }, null), 'warm')
})

test('a switched-off agent answers offline and logs nothing', () => {
  const s0 = seedState()
  const agent = s0.aiAgents.find((a) => a.id === 'jessy_buyer')!
  const s1 = run(s0, [{ type: 'ai/upsertAgent', agent: { ...agent, enabled: false } }], 'usr-1')
  const step = jessyStep(s1, 'jessy_buyer', buyerTurn, buyerStart(s1).convo, 'house in Bogor', AT)
  assert.deepEqual(step.actions, [])
  assert.match(step.replies[0].text, /offline/)
  const call = s1.aiCalls[0]
  assert.equal(blockerFor(s1, { type: 'ai/logCall', call: { ...call, agentId: 'jessy_buyer' } }), 'This agent is switched off in the AI gateway.')
})

test('partner photos land on the listing and the review card edits reach the submission', () => {
  const s0 = seedState()
  const photos = ['data:image/jpeg;base64,AAA', 'data:image/jpeg;base64,BBB', 'data:image/jpeg;base64,CCC', 'data:image/jpeg;base64,DDD', 'data:image/jpeg;base64,EEE']
  const lines: (string | [string, TurnInput])[] = [
    '0812-1100-2231',
    'Register a property',
    'House',
    'For sale',
    'Corner house near the station',
    'Tangerang Selatan, Ciputat Timur',
    'Rp 1.75 B',
    '120',
    '90',
    '3',
    'SHM',
    'near the station',
    ['5 photos attached', { photos }],
    'No',
  ]
  const before = talk(s0, 'jessy_partner', partnerStart(s0), partnerTurn, lines)
  assert.equal(before.convo.stage, 'confirm')
  assert.equal(before.convo.draft.photos?.length, 4)
  assert.ok(before.replies.at(-1)!.review)

  const bad = jessyStep(before.state, 'jessy_partner', partnerTurn, before.convo, 'Send for review', AT, { draft: { ...before.convo.draft, title: 'Short' } })
  assert.equal(bad.convo.stage, 'confirm')
  assert.match(bad.replies[0].text, /at least 10 characters/)

  const edited = { ...before.convo.draft, title: 'Corner house five minutes from Pondok Ranji station', photos: photos.slice(1, 3) }
  const step = jessyStep(before.state, 'jessy_partner', partnerTurn, before.convo, 'Send for review', AT, { draft: edited })
  const state = run(before.state, step.actions)
  const listing = state.listings[0]
  assert.equal(listing.title, 'Corner house five minutes from Pondok Ranji station')
  assert.deepEqual(listing.photos, photos.slice(1, 3))
  assert.equal(listing.photo, photos[1])
  assert.equal(listing.status, 'review')
  assert.deepEqual(state.aiCalls[0].toolCalls, ['create_listing'])
  const memory = state.aiMemory.find((m) => m.id === memoryId('jessy_partner', '0812-1100-2231'))!
  assert.ok(memory.facts.includes(`Last listing: ${listing.code}, in review`))
})

test('partner draft errors follow the property type', () => {
  const land = partnerDraftErrors({ type: 'tanah', deal: 'jual', title: 'Flat land by the toll gate', city: 'Bogor', district: 'Cibinong', price: 900_000_000, landArea: 500, certificate: 'SHM' })
  assert.deepEqual(land, {})
  const house = partnerDraftErrors({ type: 'rumah', deal: 'jual', title: 'Family house', city: 'Bogor', district: 'Cibinong', price: 900_000_000, landArea: 120, certificate: 'SHM' })
  assert.deepEqual(Object.keys(house).sort(), ['bedrooms', 'buildingArea'])
})

test('publishing a prompt adds a version and moves the agent to it', () => {
  const s0 = seedState()
  const v1 = currentPrompt(s0, 'inbox_assist')!
  const unchanged = { ...v1, id: 'prm-x', version: 2 }
  assert.equal(blockerFor(s0, { type: 'ai/publishPrompt', prompt: unchanged }), 'Nothing changed since the current version.')
  const system = `${v1.system}\nNever promise a discount.`
  const s1 = run(s0, [{ type: 'ai/publishPrompt', prompt: { ...unchanged, system } }], 'usr-1')
  assert.equal(currentPrompt(s1, 'inbox_assist')!.version, 2)
  assert.deepEqual(promptHistory(s1, 'inbox_assist').map((p) => p.version), [2, 1])
  const diff = lineDiff(v1.system, system)
  assert.deepEqual(diff.filter((d) => d.kind !== 'same'), [{ kind: 'added', text: 'Never promise a discount.' }])
  assert.deepEqual(lineDiff('a\nb', 'a\nc').map((d) => d.kind), ['same', 'removed', 'added'])
})

test('the budget warns at 80% of the monthly limit', () => {
  const s0 = seedState()
  const spent = budgetState(s0, FIXTURE_NOW).spentUsd
  assert.ok(spent > 0)
  const s1 = run(s0, [{ type: 'ai/settings', patch: { monthlyBudgetUsd: spent / 0.81 } }], 'usr-1')
  assert.equal(budgetState(s1, FIXTURE_NOW).warn, true)
  const s2 = run(s0, [{ type: 'ai/settings', patch: { monthlyBudgetUsd: spent / 0.79 } }], 'usr-1')
  assert.equal(budgetState(s2, FIXTURE_NOW).warn, false)
  assert.match(blockerFor(s0, { type: 'ai/settings', patch: { provider: 'anthropic' } })!, /API key/)
  assert.equal(blockerFor(s0, { type: 'ai/settings', patch: { monthlyBudgetUsd: 0 } }), 'The monthly budget must be above 0.')
})

test('agent edits are checked and memory merges by label and can be cleared', () => {
  const s0 = seedState()
  const agent = s0.aiAgents[0]
  assert.equal(blockerFor(s0, { type: 'ai/upsertAgent', agent: { ...agent, temperature: 1.4 } }), 'Temperature must be between 0 and 1.')
  assert.match(blockerFor(s0, { type: 'ai/upsertAgent', agent: { ...agent, toolIds: ['send_money'] } })!, /send_money/)
  assert.deepEqual(mergeFacts(['Budget: Rp 2 B', 'City: Bogor'], ['Budget: Rp 3 B']), ['City: Bogor', 'Budget: Rp 3 B'])
  const id = s0.aiMemory[0].id
  const s1 = run(s0, [{ type: 'ai/clearMemory', id }], 'usr-1')
  assert.equal(s1.aiMemory.length, s0.aiMemory.length - 1)
  assert.equal(blockerFor(s1, { type: 'ai/clearMemory', id }), 'This memory was already cleared.')
})
