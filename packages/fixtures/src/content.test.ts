import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { SocialPost } from '@artha/types'
import { addDays, FIXTURE_NOW } from './clock'
import { calendarItems, contentCall, contentDue, draftSocialPost, onDay, publishBlocker, rewriteSocialPost, socialText } from './content'
import { blockerFor, reduce, seedState } from './store'
import type { AppAction, AppState } from './store'

const AT = new Date(FIXTURE_NOW).toISOString()
const MARKETING = 'usr-3'
const SALES = 'usr-2'
const run = (s: AppState, actions: AppAction[], by = MARKETING) => actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at: AT } }), s)
const listing = (s: AppState, id = 'lst-1') => s.listings.find((l) => l.id === id)!
const post = (s: AppState, id: string) => s.socialPosts.find((p) => p.id === id)!
const connect = (s: AppState, id: string, status: 'connected' | 'error'): AppState => ({
  ...s,
  integrations: s.integrations.map((i) => (i.id === id ? { ...i, status } : i)),
})

test('carousel and reel drafts are built from listing data within the slide and scene limits', () => {
  const s = seedState()
  for (const l of s.listings) {
    const carousel = draftSocialPost(l, 'instagram', '@infopropertijkt', AT, 'carousel')
    assert.ok(carousel.slides!.length >= 3 && carousel.slides!.length <= 6, `${l.code} carousel`)
    assert.ok(carousel.slides!.some((x) => x.headline.includes(l.district)))
    assert.match(carousel.slides!.at(-1)!.headline, new RegExp(l.code))
    const reel = draftSocialPost(l, 'tiktok', '@gudang.indonesia', AT)
    assert.equal(reel.format, 'reel')
    assert.ok(reel.scenes!.length >= 3 && reel.scenes!.length <= 5, `${l.code} reel`)
    assert.ok(reel.scenes!.every((x) => x.shot && x.onScreen && x.voiceOver))
    assert.ok(reel.cta?.includes(l.code) && reel.audio)
  }
  assert.equal(draftSocialPost(listing(s), 'facebook', '@infopropertijkt', AT).format, 'post')
})

test('a rewrite keeps the post and changes the wording', () => {
  const s = seedState()
  const first = draftSocialPost(listing(s), 'instagram', '@infopropertijkt', AT, 'carousel')
  const second = rewriteSocialPost(first, listing(s), 1)
  assert.equal(second.id, first.id)
  assert.notEqual(second.hook, first.hook)
  assert.equal(second.slides![0].headline, second.hook)
})

test('every draft logs a content agent call, and the gateway refuses it when the agent is off', () => {
  const s = seedState()
  const draft = draftSocialPost(listing(s), 'instagram', '@infopropertijkt', AT)
  const call = contentCall(s, 'Draft social post', listing(s).code, socialText(draft), AT, 'draft_social_post')
  assert.equal(call.agentId, 'content')
  assert.deepEqual(call.toolCalls, ['draft_social_post'])
  const logged = run(s, [{ type: 'ai/logCall', call }])
  assert.equal(logged.aiCalls[0].id, call.id)
  const off = { ...s, aiAgents: s.aiAgents.map((a) => (a.id === 'content' ? { ...a, enabled: false } : a)) }
  assert.ok(blockerFor(off, { type: 'ai/logCall', call }))
})

test('content goes draft, review, approved, scheduled, and only content.manage approves', () => {
  let s = seedState()
  const draft = draftSocialPost(listing(s), 'tiktok', '@gudang.indonesia', AT)
  assert.ok(blockerFor(s, { type: 'social/upsert', post: { ...draft, status: 'approved' } }), 'new content cannot skip review')
  s = run(s, [{ type: 'social/upsert', post: draft }])
  assert.ok(blockerFor(s, { type: 'social/approve', id: draft.id, by: MARKETING }), 'a draft cannot be approved before review')
  assert.ok(blockerFor(s, { type: 'social/publish', id: draft.id }), 'a draft cannot be published')

  s = run(s, [{ type: 'social/submit', id: draft.id }])
  assert.equal(post(s, draft.id).status, 'in_review')
  assert.match(blockerFor(s, { type: 'social/approve', id: draft.id, by: SALES }) ?? '', /permission/)

  s = run(s, [{ type: 'social/reject', id: draft.id, by: MARKETING, note: 'Use the MRT angle' }])
  assert.equal(post(s, draft.id).status, 'draft')
  assert.equal(post(s, draft.id).reviewNote, 'Use the MRT angle')

  s = run(s, [{ type: 'social/submit', id: draft.id }, { type: 'social/approve', id: draft.id, by: MARKETING }])
  assert.equal(post(s, draft.id).status, 'approved')
  assert.equal(post(s, draft.id).approvedBy, MARKETING)
  assert.ok(blockerFor(s, { type: 'social/upsert', post: { ...post(s, draft.id), hook: 'changed' } }), 'approved content is locked')

  assert.ok(blockerFor(s, { type: 'social/schedule', id: draft.id, scheduledAt: addDays(AT, -1) }), 'past times are refused')
  const when = addDays(AT, 2)
  s = run(s, [{ type: 'social/schedule', id: draft.id, scheduledAt: when }])
  assert.equal(post(s, draft.id).status, 'scheduled')
  assert.equal(post(s, draft.id).scheduledAt, when)
})

test('publishing needs the platform integration connected and records the platform post', () => {
  let s = seedState()
  // soc-5 is an approved Instagram reel; the seeded Instagram token has expired.
  const blocker = publishBlocker(s, 'instagram')
  assert.match(blocker ?? '', /not connected/)
  assert.equal(blockerFor(s, { type: 'social/publish', id: 'soc-5' }), blocker)
  assert.match(publishBlocker(s, 'facebook') ?? '', /Facebook publishes through Instagram/)
  assert.match(publishBlocker(s, 'x') ?? '', /no publishing integration/)
  assert.equal(publishBlocker(s, 'tiktok'), null, 'TikTok is seeded as connected')

  s = run(connect(s, 'int-ig', 'connected'), [{ type: 'social/publish', id: 'soc-5' }])
  const p = post(s, 'soc-5')
  assert.equal(p.status, 'published')
  assert.equal(p.publishedAt, AT)
  assert.match(p.platformPostId ?? '', /^ig_/)
  assert.match(p.permalink ?? '', /^https:\/\/www\.instagram\.com\/p\//)
  assert.ok(blockerFor(s, { type: 'social/toDraft', id: 'soc-5' }), 'a published post stays published')
})

test('due scheduled posts publish, or fail with the reason when the integration is down', () => {
  const past = addDays(AT, -0.1)
  const base = seedState()
  const s0: AppState = {
    ...base,
    socialPosts: base.socialPosts.map((p): SocialPost => (p.id === 'soc-2' || p.id === 'soc-7' ? { ...p, status: 'scheduled', scheduledAt: past } : p)),
  }
  assert.ok(contentDue(s0, FIXTURE_NOW))
  const s = run(s0, [{ type: 'social/publishDue' }])
  assert.equal(post(s, 'soc-2').status, 'published', 'TikTok is connected')
  assert.equal(post(s, 'soc-2').publishedAt, past)
  assert.equal(post(s, 'soc-7').status, 'failed', 'Instagram is down')
  assert.match(post(s, 'soc-7').reviewNote ?? '', /not connected/)
  assert.equal(blockerFor(s, { type: 'social/publishDue' }), 'Nothing is due to publish.')

  // A failed post can be retried once the integration is back.
  const retried = run(connect(s, 'int-ig', 'connected'), [{ type: 'social/publish', id: 'soc-7' }])
  assert.equal(post(retried, 'soc-7').status, 'published')
})

test('blog articles need approval before publishing', () => {
  let s = seedState()
  assert.ok(blockerFor(s, { type: 'blog/publish', id: 'blg-3' }), 'the seeded draft cannot publish')
  s = run(s, [{ type: 'blog/submit', id: 'blg-3' }])
  assert.ok(blockerFor(s, { type: 'blog/approve', id: 'blg-3', by: SALES }))
  s = run(s, [{ type: 'blog/approve', id: 'blg-3', by: MARKETING }, { type: 'blog/publish', id: 'blg-3' }])
  const b = s.blogPosts.find((p) => p.id === 'blg-3')!
  assert.equal(b.status, 'published')
  assert.equal(b.publishedAt, AT)
  s = run(s, [{ type: 'blog/toDraft', id: 'blg-3' }])
  assert.equal(s.blogPosts.find((p) => p.id === 'blg-3')!.status, 'draft', 'an article can come off the website')
})

test('the calendar shows scheduled, failed and published content, and moving keeps the time of day', () => {
  const s = seedState()
  const items = calendarItems(s)
  assert.ok(items.some((i) => i.id === 'soc-2' && i.channel === 'tiktok' && i.movable))
  assert.ok(items.some((i) => i.id === 'soc-1' && !i.movable))
  assert.ok(items.some((i) => i.id === 'blg-4' && i.channel === 'blog' && i.movable))
  assert.ok(!items.some((i) => i.status === 'draft' || i.status === 'in_review' || i.status === 'approved'))

  const from = post(s, 'soc-2').scheduledAt!
  const moved = onDay(from, '2026-11-12')
  assert.equal(new Date(moved).getHours(), new Date(from).getHours())
  assert.equal(new Date(moved).getDate(), 12)
  const next = run(s, [{ type: 'social/schedule', id: 'soc-2', scheduledAt: moved }])
  assert.equal(post(next, 'soc-2').scheduledAt, moved)
})
