/** Notification outbox: every rule-matched event, per channel and recipient, with delivery status. */

import type { NotifyChannel } from './iam'

// Labels live in @artha/fixtures (notify.ts): this module is re-exported as types only.

export type OutboxChannel = NotifyChannel
export type OutboxStatus = 'queued' | 'sent' | 'delivered' | 'failed'

export type NotifyEvent =
  | 'inquiry_new'
  | 'listing_review'
  | 'exclusive_milestone'
  | 'exclusive_expired'
  | 'quotation_approval'
  | 'listing_sold'
  | 'content_scheduled'
  | 'payment_received'

export interface OutboxItem {
  id: string
  at: string
  event: NotifyEvent
  ruleId: string
  channel: OutboxChannel
  /** User id for in-app and push, phone for WhatsApp, email address for email. */
  to: string
  /** The team member the item is for. */
  userId: string
  title: string
  body: string
  status: OutboxStatus
  ref: { type: 'listing' | 'inquiry' | 'quotation' | 'payment' | 'social' | 'blog'; id: string } | null
  /** Why the latest attempt failed. */
  error: string | null
  attempts: number
  /** In-app items only: when the recipient opened it from the bell. */
  readAt: string | null
}
