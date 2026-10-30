import type { Deal, Listing, ProfitShare, Settlement, SettlementLine, ShareParty, SharePartyKind } from '@artha/types'
import { fmtIdr, fmtNumber, newId, nextCode } from './format'
import { patchById, upsert } from './rows'
import type { AppAction, AppState } from './store'

export type ShareAction =
  | { type: 'profitShares/upsert'; share: ProfitShare }
  | { type: 'settlements/markPaid'; id: string }

export const SHARE_PARTY_LABEL: Record<SharePartyKind, string> = {
  company: 'Company',
  agent: 'Agent',
  partner: 'Partner',
  other: 'Other party',
}

export const SETTLEMENT_STATUS_LABEL: Record<Settlement['status'], string> = { open: 'Open', paid: 'Paid' }

export const MAX_COMMISSION_PCT = 10

// ---------------------------------------------------------------- amounts

export const commissionOf = (share: Pick<ProfitShare, 'commissionMode' | 'commissionPct' | 'commissionFixed'>, basis: number) =>
  share.commissionMode === 'fixed' ? share.commissionFixed : (basis * share.commissionPct) / 100

export interface PartyAmount {
  party: ShareParty
  amount: number
}

/** Fixed amounts come off first, in order, never more than what is left; percentage parties split the rest. */
export const splitCommission = (parties: ShareParty[], commission: number): PartyAmount[] => {
  let left = commission
  const fixed = new Map<string, number>()
  for (const p of parties) {
    if (p.mode !== 'fixed') continue
    const amount = Math.min(p.value, Math.max(left, 0))
    fixed.set(p.id, amount)
    left -= amount
  }
  return parties.map((party) => ({ party, amount: party.mode === 'fixed' ? (fixed.get(party.id) ?? 0) : (Math.max(left, 0) * party.value) / 100 }))
}

export interface ShareAmounts {
  basis: number
  commission: number
  company: number
  agent: number
  partner: number
  other: number
  parties: PartyAmount[]
}

/** The deal value is the sold price once sold, the asking price before that. */
export const shareAmounts = (share: ProfitShare, listing: Listing, basis = listing.soldPrice ?? listing.price): ShareAmounts => {
  const commission = commissionOf(share, basis)
  const parties = splitCommission(share.parties, commission)
  const total = (kind: SharePartyKind) => parties.filter((p) => p.party.kind === kind).reduce((n, p) => n + p.amount, 0)
  return { basis, commission, company: total('company'), agent: total('agent'), partner: total('partner'), other: total('other'), parties }
}

/** "30%" or "Rp 25.000.000", the rule a party takes. */
export const partyRule = (p: Pick<ShareParty, 'mode' | 'value'>) => (p.mode === 'fixed' ? fmtIdr(p.value) : `${fmtNumber(p.value, 2)}%`)

// ---------------------------------------------------------------- blockers

const partyKey = (p: ShareParty) => `${p.kind}:${p.kind === 'other' ? p.name.trim().toLowerCase() : (p.refId ?? '')}`

/** `basis` is the price the commission is simulated on; without it the fixed-amount check is skipped. */
export const shareBlocker = (s: ProfitShare, basis?: number): string | null => {
  if (s.commissionMode === 'percent' && (s.commissionPct <= 0 || s.commissionPct > MAX_COMMISSION_PCT))
    return `Commission must be above 0% and at most ${MAX_COMMISSION_PCT}%.`
  if (s.commissionMode === 'fixed' && s.commissionFixed <= 0) return 'Enter a commission fee above Rp 0.'
  if (!s.parties.length) return 'Add at least one party.'
  if (s.parties.some((p) => p.value < 0)) return 'Shares cannot be negative.'
  if (s.parties.some((p) => p.mode === 'fixed' && p.value === 0)) return 'A fixed share must be above Rp 0.'
  if (s.parties.some((p) => p.kind === 'other' && !p.name.trim())) return 'Name every other party, for example the notary.'
  const keys = s.parties.map(partyKey)
  if (new Set(keys).size !== keys.length) return 'Each party can appear only once.'
  const pct = s.parties.filter((p) => p.mode === 'percent')
  if (!pct.length) return 'Add a percentage party to take what is left after fixed amounts.'
  const total = pct.reduce((n, p) => n + p.value, 0)
  if (Math.abs(total - 100) > 0.001) return `Percentages must total 100%, they total ${fmtNumber(total, 2)}% now.`
  if (basis !== undefined) {
    const fixed = s.parties.filter((p) => p.mode === 'fixed').reduce((n, p) => n + p.value, 0)
    const commission = commissionOf(s, basis)
    if (fixed > commission) return `Fixed amounts total ${fmtIdr(fixed)}, more than the ${fmtIdr(commission)} commission.`
  }
  return null
}

export const settlementBlocker = (s: AppState, id: string) => {
  const st = s.settlements.find((x) => x.id === id)
  if (!st) return 'Settlement not found.'
  return st.status === 'paid' ? 'This settlement is already paid.' : null
}

export const shareActionBlocker = (s: AppState, a: ShareAction): string | null => {
  switch (a.type) {
    case 'profitShares/upsert': {
      const listing = s.listings.find((l) => l.id === a.share.listingId)
      return listing ? shareBlocker(a.share, listing.soldPrice ?? listing.price) : 'Listing not found.'
    }
    case 'settlements/markPaid':
      return settlementBlocker(s, a.id)
  }
}

// ---------------------------------------------------------------- schemes

export const newParty = (kind: SharePartyKind, mode: ShareParty['mode'] = 'percent', value = 0): ShareParty => ({
  id: newId('shp'),
  kind,
  refId: null,
  name: '',
  mode,
  value,
})

/** Company 70% and the deal owner 30% of a 2.5% commission. */
export const defaultShare = (listingId: string): ProfitShare => ({
  id: newId('psh'),
  listingId,
  commissionMode: 'percent',
  commissionPct: 2.5,
  commissionFixed: 0,
  parties: [newParty('company', 'percent', 70), newParty('agent', 'percent', 30)],
  note: '',
})

/** The scheme before Phase 3B: one percentage each for partner, company and agent. */
export interface ThreeWaySplit {
  id: string
  listingId: string
  commissionPct: number
  partnerPct: number
  companyPct: number
  agentPct: number
  /** The agent's user id, or null for the deal owner. */
  agentId: string | null
  note: string
}

export const fromThreeWay = (o: ThreeWaySplit): ProfitShare => {
  const party = (kind: SharePartyKind, value: number, refId: string | null = null): ShareParty => ({ id: `${o.id}-${kind}`, kind, refId, name: '', mode: 'percent', value })
  return {
    id: o.id,
    listingId: o.listingId,
    commissionMode: 'percent',
    commissionPct: o.commissionPct,
    commissionFixed: 0,
    parties: [
      party('company', o.companyPct),
      ...(o.agentPct > 0 ? [party('agent', o.agentPct, o.agentId)] : []),
      ...(o.partnerPct > 0 ? [party('partner', o.partnerPct)] : []),
    ],
    note: o.note,
  }
}

type LegacyShare = Omit<ThreeWaySplit, 'agentId'> & { agentName: string }

/** Reads a stored scheme of either shape; an old agent name maps to the user with that name. */
export const migrateShare = (raw: ProfitShare | LegacyShare, users: { id: string; name: string }[] = []): ProfitShare =>
  'parties' in raw ? raw : fromThreeWay({ ...raw, agentId: users.find((u) => u.name === raw.agentName)?.id ?? null })

// ---------------------------------------------------------------- settlements

type SettleState = Pick<AppState, 'profitShares' | 'settlements' | 'company' | 'users' | 'partners'>

const settlementLine = (s: SettleState, { party, amount }: PartyAmount, listing: Listing, deal: Deal | null): SettlementLine => {
  const base = { kind: party.kind, mode: party.mode, value: party.value, amount }
  switch (party.kind) {
    case 'company':
      return { ...base, party: 'company', label: s.company.name }
    case 'agent': {
      const id = party.refId ?? deal?.ownerId ?? null
      return id
        ? { ...base, party: `agent:${id}`, label: s.users.find((u) => u.id === id)?.name ?? id }
        : { ...base, party: 'agent', label: 'Agent (not assigned)' }
    }
    case 'partner': {
      const id = party.refId ?? listing.partnerId
      return { ...base, party: `partner:${id}`, label: s.partners.find((p) => p.id === id)?.name ?? id }
    }
    case 'other':
      return { ...base, party: `other:${party.name.trim()}`, label: party.name.trim() }
  }
}

/** One settlement for a closed listing, on the listing's scheme or the default one. */
export const buildSettlement = (s: SettleState, listing: Listing, deal: Deal | null, basis: number, closedAt: string, at: string): Settlement => {
  const share = s.profitShares.find((p) => p.listingId === listing.id) ?? defaultShare(listing.id)
  const commission = commissionOf(share, basis)
  return {
    id: newId('stl'),
    code: nextCode(s.settlements.map((x) => x.code), 'ST-26-', 4),
    listingId: listing.id,
    dealId: deal?.id ?? null,
    closedAt,
    basis,
    commission,
    lines: splitCommission(share.parties, commission).map((p) => settlementLine(s, p, listing, deal)),
    status: 'open',
    paidAt: null,
    createdAt: at,
  }
}

export const settlementFor = (s: Pick<AppState, 'settlements'>, listingId: string) =>
  s.settlements.filter((x) => x.listingId === listingId).sort((a, b) => b.closedAt.localeCompare(a.closedAt))[0]

const isWon = (s: AppState, d: Deal) => s.stages.find((st) => st.id === d.stageId)?.kind === 'won'

export function shareApply(s: AppState, a: ShareAction): AppState {
  switch (a.type) {
    case 'profitShares/upsert':
      return { ...s, profitShares: upsert(s.profitShares, a.share, true) }
    case 'settlements/markPaid':
      // settleOnClose stamps paidAt with the action time.
      return { ...s, settlements: patchById(s.settlements, a.id, (x) => ({ ...x, status: 'paid' })) }
  }
}

/**
 * Runs after every action. A deal moving to won or a listing marked sold creates one settlement per
 * listing and deal, on the deal value or the sold price. A won deal adopts an open settlement its
 * listing got from a sale without a deal. It also stamps paidAt on a settlement just marked paid.
 */
export function settleOnClose(prev: AppState, next: AppState, action: AppAction, at: string): AppState {
  if (action.type === 'settlements/markPaid') {
    return { ...next, settlements: patchById(next.settlements, action.id, (x) => ({ ...x, paidAt: x.paidAt ?? at })) }
  }
  if (prev.deals === next.deals && prev.listings === next.listings) return next
  let out = next
  const add = (listing: Listing, deal: Deal | null, basis: number, closedAt: string) => {
    out = { ...out, settlements: [buildSettlement(out, listing, deal, basis, closedAt, at), ...out.settlements] }
  }

  const before = new Map(prev.deals.map((d) => [d.id, d]))
  for (const deal of next.deals) {
    const was = before.get(deal.id)
    if (!deal.listingId || !isWon(next, deal) || (was && isWon(prev, was))) continue
    const listing = next.listings.find((l) => l.id === deal.listingId)
    if (!listing || out.settlements.some((x) => x.listingId === listing.id && x.dealId === deal.id)) continue
    const orphan = out.settlements.find((x) => x.listingId === listing.id && x.dealId === null)
    if (orphan) {
      const rebuilt = orphan.status === 'open' ? buildSettlement(out, listing, deal, orphan.basis, orphan.closedAt, at) : orphan
      out = { ...out, settlements: patchById(out.settlements, orphan.id, () => ({ ...rebuilt, id: orphan.id, code: orphan.code, createdAt: orphan.createdAt, dealId: deal.id })) }
    } else add(listing, deal, deal.value, deal.closedAt ?? at)
  }

  const wasSold = new Set(prev.listings.filter((l) => l.status === 'sold').map((l) => l.id))
  for (const listing of next.listings) {
    if (listing.status !== 'sold' || wasSold.has(listing.id)) continue
    const deal =
      next.deals
        .filter((d) => d.listingId === listing.id && isWon(next, d))
        .sort((a, b) => (b.closedAt ?? '').localeCompare(a.closedAt ?? ''))[0] ?? null
    if (out.settlements.some((x) => x.listingId === listing.id && x.dealId === (deal?.id ?? null))) continue
    add(listing, deal, listing.soldPrice ?? listing.price, listing.soldAt ?? at)
  }
  return out
}

// ---------------------------------------------------------------- reports

export type ReportGrain = 'month' | 'quarter'

/** '2026-10' for a month, '2026-Q4' for a quarter. */
export const periodOf = (iso: string, grain: ReportGrain) => {
  const [y, m] = iso.slice(0, 7).split('-')
  return grain === 'month' ? `${y}-${m}` : `${y}-Q${Math.ceil(Number(m) / 3)}`
}

export const periodLabel = (period: string) => {
  const [y, rest] = period.split('-')
  if (rest.startsWith('Q')) return `${rest} ${y}`
  return new Date(Number(y), Number(rest) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export interface PeriodRow {
  period: string
  settlements: number
  commission: number
  company: number
  agent: number
  partner: number
  other: number
}

export const totalsByPeriod = (settlements: Settlement[], grain: ReportGrain): PeriodRow[] => {
  const rows = new Map<string, PeriodRow>()
  for (const st of settlements) {
    const period = periodOf(st.closedAt, grain)
    const row = rows.get(period) ?? { period, settlements: 0, commission: 0, company: 0, agent: 0, partner: 0, other: 0 }
    row.settlements += 1
    row.commission += st.commission
    for (const l of st.lines) row[l.kind] += l.amount
    rows.set(period, row)
  }
  return [...rows.values()].sort((a, b) => b.period.localeCompare(a.period))
}

export interface PartyRow {
  party: string
  kind: SharePartyKind
  label: string
  settlements: number
  open: number
  paid: number
  total: number
}

export const totalsByParty = (settlements: Settlement[]): PartyRow[] => {
  const rows = new Map<string, PartyRow>()
  for (const st of settlements) {
    for (const l of st.lines) {
      const row = rows.get(l.party) ?? { party: l.party, kind: l.kind, label: l.label, settlements: 0, open: 0, paid: 0, total: 0 }
      row.settlements += 1
      row[st.status] += l.amount
      row.total += l.amount
      rows.set(l.party, row)
    }
  }
  return [...rows.values()].sort((a, b) => b.total - a.total)
}
