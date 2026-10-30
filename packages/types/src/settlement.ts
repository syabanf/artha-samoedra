/** Profit-sharing settlement created when a listing is sold or a deal is won. */

import type { SharePartyKind } from './entities'

export interface SettlementLine {
  /** 'company', 'agent:<userId>', 'partner:<partnerId>', 'other:<name>', or 'agent' when no agent is known. */
  party: string
  kind: SharePartyKind
  label: string
  /** The scheme rule the line came from: a percent of the remainder or a fixed rupiah amount. */
  mode: 'percent' | 'fixed'
  value: number
  amount: number
}

export type SettlementStatus = 'open' | 'paid'

export interface Settlement {
  id: string
  code: string
  listingId: string
  dealId: string | null
  closedAt: string
  /** The deal value or sold price the commission is charged on. */
  basis: number
  commission: number
  lines: SettlementLine[]
  status: SettlementStatus
  paidAt: string | null
  createdAt: string
}
