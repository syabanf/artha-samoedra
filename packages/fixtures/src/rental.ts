import { RENT_BILLING_MONTHS, type Lease, type Listing, type RentBill } from '@artha/types'
import { DAY } from './clock'
import type { AppState } from './store'

/** Where a managed tenancy stands today; `ending` is the last 60 days, when the owner decides on renewal. */
export type LeaseState = 'upcoming' | 'occupied' | 'ending' | 'ended'
export const LEASE_STATE_LABEL: Record<LeaseState, string> = { upcoming: 'Starts soon', occupied: 'Occupied', ending: 'Ending soon', ended: 'Ended' }
export const LEASE_ENDING_DAYS = 60

export interface LeaseSummary {
  lease: Lease
  listing: Listing
  state: LeaseState
  /** Whole days until the end date; negative once it has passed. */
  daysToEnd: number
  bills: RentBill[]
  collected: number
  /** Unpaid bills whose due date has passed. */
  overdue: RentBill[]
  fee: number
  /** The consigning agent's part of Artha's fee. */
  agentFee: number
  ownerNet: number
  /** Net rent already paid out to the owner. */
  paidOut: number
  /** The agent's commission on the bills already paid out. */
  agentPaidOut: number
  /** Due date of the next bill, or null when the lease has no period left. */
  nextDue: string | null
}

const addMonths = (iso: string, months: number) => {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

export function leaseSummary(s: AppState, lease: Lease, nowMs: number): LeaseSummary | null {
  const listing = s.listings.find((l) => l.id === lease.listingId)
  if (!listing) return null
  const bills = s.rentBills.filter((b) => b.leaseId === lease.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const paid = bills.filter((b) => b.paidAt)
  const settled = paid.filter((b) => b.payoutAt).reduce((n, b) => n + b.amount, 0)
  const collected = paid.reduce((n, b) => n + b.amount, 0)
  const fee = (collected * lease.feePct) / 100
  const daysToEnd = Math.ceil((Date.parse(lease.endDate) - nowMs) / DAY)
  const state: LeaseState =
    nowMs < Date.parse(lease.startDate) ? 'upcoming' : daysToEnd <= 0 ? 'ended' : daysToEnd <= LEASE_ENDING_DAYS ? 'ending' : 'occupied'
  const last = bills.at(-1)
  const next = last ? addMonths(last.periodStart, RENT_BILLING_MONTHS[lease.billing]) : lease.startDate
  return {
    lease,
    listing,
    state,
    daysToEnd,
    bills,
    collected,
    overdue: bills.filter((b) => !b.paidAt && Date.parse(b.dueDate) < nowMs),
    fee,
    agentFee: (fee * lease.agentPct) / 100,
    ownerNet: collected - fee,
    paidOut: settled * (1 - lease.feePct / 100),
    agentPaidOut: (settled * lease.feePct * lease.agentPct) / 10_000,
    nextDue: next < lease.endDate ? next : null,
  }
}

const ORDER: Record<LeaseState, number> = { ending: 0, occupied: 1, upcoming: 2, ended: 3 }

/** Managed tenancies on the listings a partner consigned, the ones needing a decision first. */
export const partnerRentals = (s: AppState, partnerId: string, nowMs: number) =>
  s.leases
    .filter((l) => s.listings.some((x) => x.id === l.listingId && x.partnerId === partnerId))
    .flatMap((l) => leaseSummary(s, l, nowMs) ?? [])
    .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.daysToEnd - b.daysToEnd)
