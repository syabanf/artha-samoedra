import type { NotificationRule, NotifyChannel, NotifyEvent, OutboxItem } from '@artha/types'
import { at } from './seed'
import { NOTIFICATION_RULES as IAM_RULES, USERS } from './seed-iam'

const RULE_UPDATES: Record<string, Partial<NotificationRule>> = {
  'ntf-1': { channels: ['in_app', 'whatsapp', 'push'] },
  'ntf-3': {
    event: 'Exclusive reminders and expiry',
    description: 'An exclusive right reaches 30, 7 or 1 day before its end date, or expires.',
  },
}

export const NOTIFICATION_RULES: NotificationRule[] = [
  ...IAM_RULES.map((r) => ({ ...r, ...RULE_UPDATES[r.id] })),
  {
    id: 'ntf-6',
    event: 'Quotation needs approval',
    description: 'A quotation with a discount above 5% waits for a manager.',
    channels: ['in_app', 'email'],
    roleIds: ['rol-manager', 'rol-admin'],
    enabled: true,
  },
  {
    id: 'ntf-7',
    event: 'Payment received',
    description: 'A booking fee or deposit is paid.',
    channels: ['in_app', 'email', 'push'],
    roleIds: ['rol-finance', 'rol-manager'],
    enabled: true,
  },
]

interface SeedEvent {
  key: string
  event: NotifyEvent
  ruleId: string
  days: number
  title: string
  body: string
  ref: OutboxItem['ref']
}

const EVENTS: SeedEvent[] = [
  {
    key: 'a',
    event: 'exclusive_milestone',
    ruleId: 'ntf-3',
    days: -2,
    title: 'Exclusive on AS-0006 ends in 7 days',
    body: 'The exclusive period ends on 4 Nov 2026. Extend it with the owner or let it end.',
    ref: { type: 'listing', id: 'lst-6' },
  },
  {
    key: 'b',
    event: 'listing_sold',
    ruleId: 'ntf-4',
    days: -6,
    title: 'AS-0010 sold',
    body: 'Sold for Rp 1.820.000.000.',
    ref: { type: 'listing', id: 'lst-10' },
  },
]

/** Seeded deliveries that did not go through, so the outbox has failures to retry. */
const OVERRIDES: Record<string, Partial<OutboxItem>> = {
  'out-b-email-usr-7': { status: 'failed', error: 'The mail server timed out. Try again.' },
  'out-a-whatsapp-usr-5': { status: 'failed', error: 'The recipient number is not on WhatsApp.', attempts: 2 },
}

const statusFor = (channel: NotifyChannel): OutboxItem['status'] => (channel === 'in_app' ? 'delivered' : channel === 'push' ? 'queued' : 'sent')

export const OUTBOX: OutboxItem[] = EVENTS.flatMap((ev) => {
  const rule = NOTIFICATION_RULES.find((r) => r.id === ev.ruleId)!
  const users = USERS.filter((u) => u.status === 'active' && rule.roleIds.includes(u.roleId))
  return rule.channels.flatMap((channel) =>
    users.map((u): OutboxItem => {
      const id = `out-${ev.key}-${channel}-${u.id}`
      return {
        id,
        at: at(ev.days),
        event: ev.event,
        ruleId: rule.id,
        channel,
        to: channel === 'whatsapp' ? u.phone : channel === 'email' ? u.email : u.id,
        userId: u.id,
        title: ev.title,
        body: ev.body,
        status: statusFor(channel),
        ref: ev.ref,
        error: null,
        attempts: 1,
        // Older in-app items were read the same day.
        readAt: channel === 'in_app' ? at(ev.days + 0.2) : null,
        ...OVERRIDES[id],
      }
    }),
  )
}).sort((a, b) => b.at.localeCompare(a.at))
