import { currentExclusive, daysLeft, exclusiveState, nowIso, startOfDay, type AppState } from '@artha/fixtures'
import type { NotifyEvent, OutboxItem } from '@artha/types'
import type { Tone } from '@artha/ui'
import { useEffect } from 'react'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import type { BadgeKey } from './nav'

export interface Notice {
  id: string
  tone: Tone
  title: string
  body: string
  at: string
  to: string
  /** Set when the notice is an in-app outbox item; reading it is stored on the item. */
  outboxId?: string
}

const EVENT_TONE: Record<NotifyEvent, Tone> = {
  inquiry_new: 'accent',
  listing_review: 'warning',
  exclusive_milestone: 'warning',
  exclusive_expired: 'danger',
  quotation_approval: 'warning',
  listing_sold: 'success',
  content_scheduled: 'info',
  payment_received: 'success',
}

export const refPath = (ref: OutboxItem['ref']) => {
  if (!ref) return paths.outbox
  switch (ref.type) {
    case 'listing':
      return paths.listing(ref.id)
    case 'inquiry':
      return paths.inquiry(ref.id)
    case 'quotation':
      return paths.quotation(ref.id)
    case 'payment':
      return paths.payment(ref.id)
    case 'social':
      return paths.social
    case 'blog':
      return paths.blogEdit(ref.id)
  }
}

/** Derived on every render, never stored, so a notice clears itself once its condition ends. */
export function deriveNotices(s: AppState, now: number): Notice[] {
  const out: Notice[] = []
  for (const l of s.listings.filter((x) => x.status === 'review')) {
    out.push({
      id: `review-${l.id}`,
      tone: 'warning',
      title: `${l.code} awaiting review`,
      body: `${l.title}, sent by a partner through Jessy chat.`,
      at: l.createdAt,
      to: paths.listing(l.id),
    })
  }
  for (const i of s.inquiries.filter((x) => x.status === 'new')) {
    out.push({
      id: `inq-${i.id}`,
      tone: 'accent',
      title: `New inquiry from ${i.name}`,
      body: i.message,
      at: i.createdAt,
      to: paths.inquiry(i.id),
    })
  }
  for (const e of s.exclusives) {
    const st = exclusiveState(e, now)
    if (st !== 'due' && st !== 'expired') continue
    if (currentExclusive(s, e.listingId)?.id !== e.id) continue
    const l = s.listings.find((x) => x.id === e.listingId)
    const left = daysLeft(e, now)
    out.push({
      id: `exc-${e.id}-${st}`,
      tone: st === 'expired' ? 'danger' : 'warning',
      title: st === 'expired' ? `Exclusive on ${l?.code} has expired` : `Exclusive on ${l?.code} ends in ${left} days`,
      body: 'Jessy reminder: extend or end the exclusive rights.',
      at: e.lastRemindedAt ?? e.endsAt,
      to: paths.listing(e.listingId),
    })
  }
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

const outboxNotice = (o: OutboxItem): Notice => ({
  id: `out-${o.id}`,
  tone: EVENT_TONE[o.event],
  title: o.title,
  body: o.body,
  at: o.at,
  to: refPath(o.ref),
  outboxId: o.id,
})

/**
 * What the bell lists for one user: their unread in-app outbox items, plus today's derived notices
 * for records the outbox has not already told them about.
 */
export function bellNotices(s: AppState, userId: string, now: number): Notice[] {
  const mine = s.outbox.filter((o) => o.channel === 'in_app' && o.userId === userId)
  const covered = new Set(mine.map((o) => refPath(o.ref)))
  const today = startOfDay(now)
  const derived = deriveNotices(s, now).filter((n) => Date.parse(n.at) >= today && !covered.has(n.to))
  return [...mine.filter((o) => !o.readAt).map(outboxNotice), ...derived].sort((a, b) => b.at.localeCompare(a.at))
}

/**
 * Hands the signed-in user's queued push items to the browser Notification API once permission is granted.
 * Items stay queued until then, and items for other users wait for their own device.
 */
export function usePushDelivery(userId: string) {
  const { state, dispatch } = useAppState()
  const granted = typeof Notification !== 'undefined' && Notification.permission === 'granted'
  const queued = state.outbox.filter((o) => o.channel === 'push' && o.status === 'queued' && o.userId === userId)
  const key = queued.map((o) => o.id).join(',')
  useEffect(() => {
    if (!granted || !queued.length) return
    for (const o of queued) {
      try {
        new Notification(o.title, { body: o.body, tag: o.id })
        dispatch({ type: 'outbox/setStatus', id: o.id, status: 'sent' }, userId)
      } catch {
        // Some browsers only allow notifications from a service worker; the item stays queued.
      }
    }
    // `key` stands for the queued list, so the effect reruns only when it changes.
  }, [granted, key, userId])
}

/** Stamps the given in-app outbox items as read. */
export const readOutbox = (dispatch: ReturnType<typeof useAppState>['dispatch'], ids: string[], userId: string) => {
  if (ids.length) dispatch({ type: 'outbox/read', ids, at: nowIso() }, userId)
}

export function navCounts(s: AppState, now: number): Record<BadgeKey, number> {
  return {
    review: s.listings.filter((l) => l.status === 'review').length,
    newInquiries: s.inquiries.filter((i) => i.status === 'new').length,
    exclusiveDue: s.exclusives.filter((e) => ['due', 'expired'].includes(exclusiveState(e, now))).length,
  }
}
