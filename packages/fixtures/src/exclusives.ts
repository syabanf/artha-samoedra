import type { ExclusiveMilestone, ExclusiveReminder, ExclusiveRight, ExclusiveState, ExclusiveStatus } from '@artha/types'
import { addDays, DAY, toMs } from './clock'
import { patchById, upsert } from './rows'
import type { AppState } from './store'

export type ExclusiveAction =
  | { type: 'exclusives/upsert'; exclusive: ExclusiveRight }
  | { type: 'exclusives/extend'; id: string; days: number }
  | { type: 'exclusives/end'; id: string }
  /** The minute job: sends due milestones, expires rights past their end date and stores the ended status. */
  | { type: 'exclusives/sweep'; ids: string[] }
  /** Older name for `exclusives/sweep`, kept so saved action logs and the agent log still read. */
  | { type: 'exclusives/remind'; ids: string[] }

/** Reminders go out 30, 7 and 1 day before the end date, once each. */
export const EXCLUSIVE_MILESTONES: ExclusiveMilestone[] = [30, 7, 1]

export const CONTRACT_MAX_BYTES = 1_048_576

export const daysLeft = (e: ExclusiveRight, now: number) => Math.ceil((toMs(e.endsAt) - now) / DAY)

/** The stored status, falling back for rights saved before it existed. */
export const exclusiveStatus = (e: ExclusiveRight): ExclusiveStatus => (e.endedAt ? 'ended' : (e.status ?? 'active'))

/** Display state: the stored status plus "due" inside the first milestone. */
export const exclusiveState = (e: ExclusiveRight, now: number): ExclusiveState => {
  const status = exclusiveStatus(e)
  if (status !== 'active') return status
  if (toMs(e.endsAt) <= now) return 'expired'
  return daysLeft(e, now) <= EXCLUSIVE_MILESTONES[0] ? 'due' : 'active'
}

/** The running (not ended) right of a listing, if any. */
export const currentExclusive = (s: AppState, listingId: string) =>
  s.exclusives.find((e) => e.listingId === listingId && !e.endedAt) ??
  s.exclusives.find((e) => e.listingId === listingId)

/** Milestones whose date has passed and that have not gone out yet. */
export const pendingMilestones = (e: ExclusiveRight, now: number): ExclusiveMilestone[] => {
  const end = toMs(e.endsAt)
  if (exclusiveStatus(e) !== 'active' || end <= now) return []
  const done = new Set((e.reminders ?? []).map((r) => r.days))
  return EXCLUSIVE_MILESTONES.filter((m) => !done.has(m) && end - m * DAY <= now)
}

const needsSweep = (e: ExclusiveRight, now: number) =>
  (e.endedAt !== null && e.status !== 'ended') ||
  (exclusiveStatus(e) === 'active' && toMs(e.endsAt) <= now) ||
  pendingMilestones(e, now).length > 0

/** Rights the minute job has work for. */
export const sweepTargets = (s: AppState, now: number) => s.exclusives.filter((e) => needsSweep(e, now))

/** Each milestone with its date and whether it went out, for the timeline on the card. */
export const milestoneTimeline = (e: ExclusiveRight) =>
  EXCLUSIVE_MILESTONES.map((days) => ({
    days,
    due: addDays(e.endsAt, -days),
    sent: (e.reminders ?? []).find((r) => r.days === days) ?? null,
  }))

const sweepOne = (e: ExclusiveRight, now: number, at: string): ExclusiveRight => {
  if (e.endedAt) return e.status === 'ended' ? e : { ...e, status: 'ended' }
  if (exclusiveStatus(e) !== 'active') return e
  if (toMs(e.endsAt) <= now) return { ...e, status: 'expired' }
  const due = pendingMilestones(e, now)
  if (!due.length) return e
  // Only the tightest passed milestone goes out; earlier ones it overtook are marked skipped.
  const send = Math.min(...due)
  const added: ExclusiveReminder[] = due.map((days) => (days === send ? { days, at } : { days, at, skipped: true }))
  return { ...e, status: 'active', reminders: [...(e.reminders ?? []), ...added], lastRemindedAt: at }
}

/** Ends every running right of a listing, as a sale or a delisting does. */
export const endRunningExclusives = (s: AppState, listingId: string, at: string): AppState => ({
  ...s,
  exclusives: s.exclusives.map((e) => (e.listingId === listingId && !e.endedAt ? { ...e, endedAt: at, status: 'ended' } : e)),
})

export const exclusiveBlocker = (e: Pick<ExclusiveRight, 'startsAt' | 'endsAt' | 'document'>) => {
  if (Date.parse(e.endsAt) <= Date.parse(e.startsAt)) return 'The end date must come after the start date.'
  if (e.document) {
    if (e.document.type !== 'application/pdf' && !e.document.type.startsWith('image/')) return 'Attach the contract as a PDF or an image.'
    if (e.document.size > CONTRACT_MAX_BYTES) return 'The contract document must be 1 MB or smaller.'
  }
  return null
}

export const exclusiveActionBlocker = (s: AppState, a: ExclusiveAction): string | null => {
  switch (a.type) {
    case 'exclusives/upsert':
      return exclusiveBlocker(a.exclusive)
    case 'exclusives/extend':
    case 'exclusives/end': {
      const e = s.exclusives.find((x) => x.id === a.id)
      if (!e) return 'Exclusive right not found.'
      return e.endedAt ? 'These exclusive rights have already ended.' : null
    }
    default:
      return null
  }
}

export function exclusiveApply(s: AppState, a: ExclusiveAction, at: string): AppState {
  switch (a.type) {
    case 'exclusives/upsert': {
      const prev = s.exclusives.find((x) => x.id === a.exclusive.id)
      // Same end date keeps the sent milestones and the stored status; a new end date starts the reminders over.
      const same = prev !== undefined && prev.endsAt === a.exclusive.endsAt
      const exclusive: ExclusiveRight = {
        ...a.exclusive,
        status: a.exclusive.endedAt ? 'ended' : same ? exclusiveStatus(prev) : 'active',
        reminders: same ? (prev.reminders ?? []) : [],
        lastRemindedAt: same ? prev.lastRemindedAt : null,
      }
      return { ...s, exclusives: upsert(s.exclusives, exclusive, true) }
    }
    case 'exclusives/extend':
      return {
        ...s,
        exclusives: patchById(s.exclusives, a.id, (e) => ({
          ...e,
          endsAt: addDays(Date.parse(e.endsAt) > Date.parse(at) ? e.endsAt : at, a.days),
          status: 'active',
          reminders: [],
          lastRemindedAt: null,
        })),
      }
    case 'exclusives/end':
      return { ...s, exclusives: patchById(s.exclusives, a.id, (e) => ({ ...e, endedAt: at, status: 'ended' })) }
    case 'exclusives/sweep':
    case 'exclusives/remind': {
      const now = toMs(at)
      return { ...s, exclusives: s.exclusives.map((e) => (a.ids.includes(e.id) ? sweepOne(e, now, at) : e)) }
    }
  }
}
