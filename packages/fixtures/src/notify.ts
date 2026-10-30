import { PAYMENT_METHOD_LABEL } from '@artha/types'
import type { MessageLog, NotifyChannel, NotifyEvent, OutboxItem, OutboxStatus, User } from '@artha/types'
import { exclusiveStatus } from './exclusives'
import { fmtDate, fmtIdr, fmtIdrShort, newId } from './format'
import type { AppState, Envelope } from './store'

export type NotifyAction =
  | { type: 'outbox/setStatus'; id: string; status: OutboxStatus }
  /** Sends failed items again on their channel. `at` stamps the attempt. */
  | { type: 'outbox/retry'; ids: string[]; at: string }
  /** The recipient opened in-app items from the bell. */
  | { type: 'outbox/read'; ids: string[]; at: string }

export const OUTBOX_STATUS_LABEL: Record<OutboxStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  delivered: 'Delivered',
  failed: 'Failed',
}

export const NOTIFY_EVENT_LABEL: Record<NotifyEvent, string> = {
  inquiry_new: 'New inquiry',
  listing_review: 'Listing needs review',
  exclusive_milestone: 'Exclusive reminder',
  exclusive_expired: 'Exclusive expired',
  quotation_approval: 'Quotation needs approval',
  listing_sold: 'Listing sold',
  content_scheduled: 'Content scheduled',
  payment_received: 'Payment received',
}

/** The notification rule that governs each event. Both exclusive events share one rule. */
export const RULE_FOR_EVENT: Record<NotifyEvent, string> = {
  inquiry_new: 'ntf-1',
  listing_review: 'ntf-2',
  exclusive_milestone: 'ntf-3',
  exclusive_expired: 'ntf-3',
  listing_sold: 'ntf-4',
  content_scheduled: 'ntf-5',
  quotation_approval: 'ntf-6',
  payment_received: 'ntf-7',
}

/** Keeps the browser copy small; the oldest items drop off first. */
const OUTBOX_LIMIT = 500

interface NotifyEventDraft {
  event: NotifyEvent
  title: string
  body: string
  ref: OutboxItem['ref']
}

const listingCode = (s: AppState, id: string | null) => (id ? (s.listings.find((l) => l.id === id)?.code ?? id) : null)

/** Rows of `next` that are new or whose key changed to `value` since `prev`. */
function becameValue<T extends { id: string }>(prev: T[], next: T[], key: (row: T) => string, value: string) {
  if (prev === next) return []
  const before = new Map(prev.map((r) => [r.id, key(r)]))
  return next.filter((r) => key(r) === value && before.get(r.id) !== value)
}

function addedRows<T extends { id: string }>(prev: T[], next: T[]) {
  if (prev === next) return []
  const before = new Set(prev.map((r) => r.id))
  return next.filter((r) => !before.has(r.id))
}

/** Every notifiable event the action caused, found by comparing the state before and after. */
export function detectEvents(prev: AppState, next: AppState): NotifyEventDraft[] {
  const out: NotifyEventDraft[] = []

  for (const i of addedRows(prev.inquiries, next.inquiries)) {
    const code = listingCode(next, i.listingId)
    out.push({
      event: 'inquiry_new',
      title: `New inquiry from ${i.name}`,
      body: code ? `${code}: ${i.message}` : i.message,
      ref: { type: 'inquiry', id: i.id },
    })
  }

  for (const l of becameValue(prev.listings, next.listings, (x) => x.status, 'review')) {
    out.push({ event: 'listing_review', title: `${l.code} awaiting review`, body: `${l.title}, sent by a partner.`, ref: { type: 'listing', id: l.id } })
  }
  for (const l of becameValue(prev.listings, next.listings, (x) => x.status, 'sold')) {
    out.push({
      event: 'listing_sold',
      title: `${l.code} sold`,
      body: l.soldPrice ? `${l.title} sold for ${fmtIdr(l.soldPrice)}.` : `${l.title} is marked as sold.`,
      ref: { type: 'listing', id: l.id },
    })
  }

  if (prev.exclusives !== next.exclusives) {
    const before = new Map(prev.exclusives.map((e) => [e.id, e]))
    for (const e of next.exclusives) {
      const old = before.get(e.id)
      const code = listingCode(next, e.listingId) ?? e.listingId
      const sentBefore = new Set((old?.reminders ?? []).filter((r) => !r.skipped).map((r) => r.days))
      for (const r of (e.reminders ?? []).filter((x) => !x.skipped && !sentBefore.has(x.days))) {
        out.push({
          event: 'exclusive_milestone',
          title: r.days === 1 ? `Exclusive on ${code} ends tomorrow` : `Exclusive on ${code} ends in ${r.days} days`,
          body: `The exclusive period ends on ${fmtDate(e.endsAt)}. Extend it with the owner or let it end.`,
          ref: { type: 'listing', id: e.listingId },
        })
      }
      if (exclusiveStatus(e) === 'expired' && (!old || exclusiveStatus(old) !== 'expired')) {
        out.push({
          event: 'exclusive_expired',
          title: `Exclusive on ${code} has expired`,
          body: `The exclusive period ended on ${fmtDate(e.endsAt)}. Extend it or record that it ended.`,
          ref: { type: 'listing', id: e.listingId },
        })
      }
    }
  }

  for (const q of becameValue(prev.quotations, next.quotations, (x) => x.status, 'pending_approval')) {
    out.push({
      event: 'quotation_approval',
      title: `${q.code} needs approval`,
      body: `${q.discountPct}% discount on ${fmtIdrShort(q.listPrice)}. Approve or reject it in Approvals.`,
      ref: { type: 'quotation', id: q.id },
    })
  }

  // Content statuses are compared as strings so new workflow states elsewhere do not break this check.
  for (const p of becameValue(prev.socialPosts, next.socialPosts, (x) => String(x.status), 'scheduled')) {
    out.push({
      event: 'content_scheduled',
      title: `${p.account} post scheduled`,
      body: p.scheduledAt ? `${p.hook} Goes out ${fmtDate(p.scheduledAt)}.` : p.hook,
      ref: { type: 'social', id: p.id },
    })
  }
  for (const b of becameValue(prev.blogPosts, next.blogPosts, (x) => String(x.status), 'scheduled')) {
    out.push({ event: 'content_scheduled', title: 'Article scheduled', body: b.title, ref: { type: 'blog', id: b.id } })
  }

  for (const p of becameValue(prev.payments, next.payments, (x) => x.status, 'paid')) {
    out.push({ event: 'payment_received', title: `Payment ${p.code} received`, body: `${PAYMENT_METHOD_LABEL[p.method]} payment of ${fmtIdr(p.amount)}.`, ref: { type: 'payment', id: p.id } })
  }

  return out
}

const integrationUp = (s: AppState, kind: 'whatsapp' | 'email') => s.integrations.some((i) => i.kind === kind && i.status === 'connected')

/** Why a channel cannot send right now, or null when it can. In-app and push never fail in the store. */
export const channelBlocker = (s: AppState, channel: NotifyChannel): string | null => {
  if (channel === 'whatsapp' && !integrationUp(s, 'whatsapp')) return 'The WhatsApp gateway is not connected. Connect it in Integrations first.'
  if (channel === 'email' && !integrationUp(s, 'email')) return 'Email is not connected. Connect it in Integrations first.'
  return null
}

const addressFor = (u: User, channel: NotifyChannel) => (channel === 'whatsapp' ? u.phone : channel === 'email' ? u.email : u.id)

/** First delivery attempt: in-app lands at once, push waits for the browser, WhatsApp and email need their integration. */
const attempt = (s: AppState, channel: NotifyChannel): Pick<OutboxItem, 'status' | 'error'> => {
  if (channel === 'in_app') return { status: 'delivered', error: null }
  if (channel === 'push') return { status: 'queued', error: null }
  const error = channelBlocker(s, channel)
  return error ? { status: 'failed', error } : { status: 'sent', error: null }
}

const messageFor = (o: OutboxItem, at: string): MessageLog => ({
  id: newId('msg'),
  at,
  to: o.to,
  templateId: null,
  body: `${o.title}. ${o.body}`,
  status: o.status === 'failed' ? 'failed' : 'sent',
})

/**
 * Runs after every action: turns events that match an enabled notification rule into outbox items,
 * one per channel and active user holding one of the rule's roles. WhatsApp items also land in the message log.
 */
export function dispatchNotifications(prev: AppState, next: AppState, env: Envelope): AppState {
  if (env.action.type.startsWith('outbox/')) return next
  const events = detectEvents(prev, next)
  if (!events.length) return next
  const at = env.meta.at
  const items: OutboxItem[] = []
  for (const ev of events) {
    const rule = next.notificationRules.find((r) => r.id === RULE_FOR_EVENT[ev.event])
    if (!rule?.enabled) continue
    const users = next.users.filter((u) => u.status === 'active' && rule.roleIds.includes(u.roleId))
    for (const channel of rule.channels) {
      for (const u of users) {
        items.push({
          id: newId('out'),
          at,
          event: ev.event,
          ruleId: rule.id,
          channel,
          to: addressFor(u, channel),
          userId: u.id,
          title: ev.title,
          body: ev.body,
          ref: ev.ref,
          attempts: 1,
          readAt: null,
          ...attempt(next, channel),
        })
      }
    }
  }
  if (!items.length) return next
  const messages = items.filter((o) => o.channel === 'whatsapp').map((o) => messageFor(o, at))
  // Messages the action itself sent (a buyer welcome, say) stay on top; team alerts go right below them.
  const own = Math.max(0, next.messages.length - prev.messages.length)
  return {
    ...next,
    outbox: [...items, ...next.outbox].slice(0, OUTBOX_LIMIT),
    messages: messages.length ? [...next.messages.slice(0, own), ...messages, ...next.messages.slice(own)] : next.messages,
  }
}

/** Why a retry is refused, as the sentence the outbox page shows. */
export const retryBlocker = (s: AppState, ids: string[]): string | null => {
  const items = s.outbox.filter((o) => ids.includes(o.id))
  if (!items.length || items.some((o) => o.status !== 'failed')) return 'Only failed items can be retried.'
  for (const o of items) {
    const reason = channelBlocker(s, o.channel)
    if (reason) return reason
  }
  return null
}

export const notifyBlocker = (s: AppState, a: NotifyAction): string | null => (a.type === 'outbox/retry' ? retryBlocker(s, a.ids) : null)

export function notifyApply(s: AppState, a: NotifyAction): AppState {
  switch (a.type) {
    case 'outbox/setStatus':
      return { ...s, outbox: s.outbox.map((o) => (o.id === a.id ? { ...o, status: a.status } : o)) }
    case 'outbox/read':
      return { ...s, outbox: s.outbox.map((o) => (a.ids.includes(o.id) && !o.readAt ? { ...o, readAt: a.at } : o)) }
    case 'outbox/retry': {
      const retried: OutboxItem[] = []
      const outbox = s.outbox.map((o) => {
        if (!a.ids.includes(o.id) || o.status !== 'failed') return o
        const next: OutboxItem = { ...o, ...attempt(s, o.channel), attempts: o.attempts + 1 }
        if (next.channel === 'whatsapp') retried.push(next)
        return next
      })
      const messages = retried.map((o) => messageFor(o, a.at))
      return { ...s, outbox, messages: messages.length ? [...messages, ...s.messages] : s.messages }
    }
  }
}
