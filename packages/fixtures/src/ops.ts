import type {
  CommissionStatement,
  OpenHouse,
  OpenHouseRegistration,
  Payment,
  Portal,
  PortalSync,
  Project,
  Promotion,
  SitePage,
  StatementLine,
  Unit,
  UnitStatus,
  Visit,
  VisitStatus,
} from '@artha/types'
import { PAYMENT_KIND_LABEL, PORTAL_LABEL, PUBLIC_LISTING_STATUSES, VISIT_STATUS_LABEL } from '@artha/types'
import { toMs } from './clock'
import { normalizePhone } from './derive'
import { fmtTime, nextCode, newId } from './format'
import { patchById, upsert } from './rows'
import type { AppState } from './store'

export type OpsAction =
  | { type: 'projects/upsert'; project: Project }
  | { type: 'units/upsert'; unit: Unit }
  | { type: 'units/hold'; id: string; until: string; dealId: string | null }
  | { type: 'units/release'; id: string }
  | { type: 'units/markSold'; id: string }
  | { type: 'visits/create'; visit: Visit }
  | { type: 'visits/reschedule'; id: string; startAt: string; agentId: string }
  | { type: 'visits/setStatus'; id: string; status: VisitStatus }
  | { type: 'visits/feedback'; id: string; rating: number; feedback: string }
  | { type: 'openHouses/upsert'; openHouse: OpenHouse }
  | { type: 'openHouses/register'; id: string; registration: OpenHouseRegistration }
  | { type: 'openHouses/attend'; id: string; registrationId: string; attended: boolean }
  | { type: 'payments/create'; payment: Payment }
  | { type: 'payments/markPaid'; id: string; reference: string }
  | { type: 'payments/refund'; id: string; refundId: string }
  | { type: 'syncs/publish'; listingId: string; portal: Portal }
  | { type: 'syncs/remove'; id: string }
  | { type: 'statements/generate'; id: string; agentId: string; month: string }
  | { type: 'statements/adjust'; id: string; adjustment: number; note: string }
  | { type: 'statements/approve'; id: string }
  | { type: 'statements/pay'; id: string }
  | { type: 'promotions/upsert'; promotion: Promotion }
  | { type: 'promotions/remove'; id: string }
  | { type: 'pages/upsert'; page: SitePage }
  | { type: 'pages/remove'; id: string }
  | { type: 'saved/toggle'; phone: string; listingId: string }
  /** Jessy's minute job: lapsed holds go back to available, unpaid bills past their deadline expire. */
  | { type: 'ops/sweep' }

export const OPS_PREFIXES = ['projects/', 'units/', 'visits/', 'openHouses/', 'payments/', 'syncs/', 'statements/', 'promotions/', 'pages/', 'saved/', 'ops/']

// ---------------------------------------------------------------- derivations

export const unitCounts = (units: Unit[]) => {
  const out: Record<UnitStatus, number> = { available: 0, held: 0, booked: 0, sold: 0 }
  for (const u of units) out[u.status] += 1
  return out
}

const end = (v: Pick<Visit, 'startAt' | 'durationMin'>) => toMs(v.startAt) + v.durationMin * 60_000

/** Another live visit of the same agent that overlaps this time slot. */
export const visitClash = (s: AppState, v: Pick<Visit, 'id' | 'agentId' | 'startAt' | 'durationMin'>) =>
  s.visits.find(
    (o) =>
      o.id !== v.id &&
      o.agentId === v.agentId &&
      (o.status === 'scheduled' || o.status === 'checked_in') &&
      toMs(o.startAt) < end(v) &&
      toMs(v.startAt) < end(o),
  )

const VISIT_FLOW: Record<VisitStatus, VisitStatus[]> = {
  scheduled: ['checked_in', 'no_show', 'cancelled'],
  checked_in: ['done'],
  done: [],
  no_show: [],
  cancelled: [],
}

/** Promotions running at `now` for one listing. */
export const activePromotions = (s: AppState, listingId: string, now: number) =>
  s.promotions.filter((p) => p.listingId === listingId && toMs(p.startsAt) <= now && now < toMs(p.endsAt))

export const promoPrice = (s: AppState, listingId: string, now: number) =>
  activePromotions(s, listingId, now).find((p) => p.kind === 'price_drop')?.promoPrice ?? null

export const isFeatured = (s: AppState, listingId: string, now: number) =>
  activePromotions(s, listingId, now).some((p) => p.kind === 'featured')

/**
 * Lines for one agent from the settlements of deals closed in a month. The rates are effective ones,
 * so a fixed fee or a fixed agent amount still reads as basis × commission % × agent %.
 */
export const statementLines = (s: AppState, agentId: string, month: string): StatementLine[] =>
  s.settlements.flatMap((st) => {
    const amount = st.lines.filter((l) => l.party === `agent:${agentId}`).reduce((n, l) => n + l.amount, 0)
    if (!st.dealId || !st.closedAt.startsWith(month) || !amount) return []
    return [{ dealId: st.dealId, basis: st.basis, commissionPct: st.basis ? (st.commission / st.basis) * 100 : 0, agentPct: st.commission ? (amount / st.commission) * 100 : 0, amount }]
  })

export const statementTotal = (st: CommissionStatement) => st.lines.reduce((n, l) => n + l.amount, 0) + st.adjustment

export const savedFor = (s: AppState, phone: string) => s.savedProperties.filter((x) => x.phone === normalizePhone(phone))

// ---------------------------------------------------------------- blockers

export function opsBlocker(s: AppState, a: OpsAction, now: number): string | null {
  switch (a.type) {
    case 'projects/upsert':
      return s.projects.some((p) => p.id !== a.project.id && p.code === a.project.code) ? 'Another project uses this code.' : null
    case 'units/upsert':
      return s.units.some((u) => u.id !== a.unit.id && u.projectId === a.unit.projectId && u.code === a.unit.code) ? 'Another unit in this project uses this code.' : null
    case 'units/hold': {
      const u = s.units.find((x) => x.id === a.id)
      if (!u) return 'Unit not found.'
      if (u.status !== 'available') return `Unit ${u.code} is not available.`
      const deal = a.dealId ? s.deals.find((d) => d.id === a.dealId) : null
      if (a.dealId && (!deal || s.stages.find((st) => st.id === deal.stageId)?.kind !== 'open')) return 'Hold the unit for an open deal.'
      return toMs(a.until) > now ? null : 'The hold must end in the future.'
    }
    case 'units/release': {
      const u = s.units.find((x) => x.id === a.id)
      return u?.status === 'held' || u?.status === 'booked' ? null : 'Only a held or booked unit can be released.'
    }
    case 'units/markSold': {
      const u = s.units.find((x) => x.id === a.id)
      return u?.status === 'booked' ? null : 'Only a booked unit can be marked sold.'
    }
    case 'visits/create':
    case 'visits/reschedule': {
      const v = a.type === 'visits/create' ? a.visit : { ...s.visits.find((x) => x.id === a.id)!, startAt: a.startAt, agentId: a.agentId }
      if (toMs(v.startAt) < now) return 'Pick a time in the future.'
      const clash = visitClash(s, v)
      if (!clash) return null
      const agent = s.users.find((u) => u.id === v.agentId)?.name ?? 'The agent'
      return `${agent} already has ${clash.code} at ${fmtTime(clash.startAt)}.`
    }
    case 'visits/setStatus': {
      const v = s.visits.find((x) => x.id === a.id)
      if (!v) return 'Visit not found.'
      return VISIT_FLOW[v.status].includes(a.status) ? null : `A ${VISIT_STATUS_LABEL[v.status].toLowerCase()} visit cannot become ${VISIT_STATUS_LABEL[a.status].toLowerCase()}.`
    }
    case 'visits/feedback':
      return s.visits.find((x) => x.id === a.id)?.status === 'done' ? null : 'Record feedback after the visit is done.'
    case 'openHouses/upsert':
      if (toMs(a.openHouse.endAt) <= toMs(a.openHouse.startAt)) return 'The end time must come after the start.'
      if (s.openHouses.some((o) => o.id !== a.openHouse.id && o.slug === a.openHouse.slug)) return 'Another open house uses this link.'
      return a.openHouse.capacity < a.openHouse.registrations.length ? `Capacity cannot go below the ${a.openHouse.registrations.length} people already registered.` : null
    case 'openHouses/register': {
      const o = s.openHouses.find((x) => x.id === a.id)
      if (!o || !o.published) return 'This open house is not open for registration.'
      if (toMs(o.endAt) < now) return 'This open house has ended.'
      if (o.registrations.length >= o.capacity) return 'This open house is full.'
      if (normalizePhone(a.registration.phone).length < 9) return 'Enter a full WhatsApp number.'
      if (o.registrations.some((r) => normalizePhone(r.phone) === normalizePhone(a.registration.phone))) return 'This number is already registered.'
      return null
    }
    case 'payments/create':
      return a.payment.amount > 0 ? null : 'Enter the amount.'
    case 'payments/markPaid':
      return s.payments.find((p) => p.id === a.id)?.status === 'pending' ? null : 'Only a payment waiting for payment can be marked paid.'
    case 'payments/refund': {
      const p = s.payments.find((x) => x.id === a.id)
      if (!p || p.kind === 'refund') return 'Payment not found.'
      return p.status === 'paid' ? null : 'Only a paid payment can be refunded.'
    }
    case 'syncs/publish': {
      const l = s.listings.find((x) => x.id === a.listingId)
      if (!l || !PUBLIC_LISTING_STATUSES.includes(l.status)) return 'Only a live listing can go to a portal.'
      const live = s.portalSyncs.find((x) => x.listingId === a.listingId && x.portal === a.portal && (x.status === 'live' || x.status === 'queued'))
      return live ? `Already live on ${PORTAL_LABEL[a.portal]}.` : null
    }
    case 'statements/generate':
      if (s.statements.some((x) => x.agentId === a.agentId && x.month === a.month)) return 'A statement for this agent and month already exists.'
      return statementLines(s, a.agentId, a.month).length ? null : 'This agent won no deals in that month.'
    case 'statements/approve':
      return s.statements.find((x) => x.id === a.id)?.status === 'draft' ? null : 'Only a draft statement can be approved.'
    case 'statements/adjust':
      return s.statements.find((x) => x.id === a.id)?.status === 'draft' ? null : 'Only a draft statement can be adjusted.'
    case 'statements/pay':
      return s.statements.find((x) => x.id === a.id)?.status === 'approved' ? null : 'Approve the statement before paying it.'
    case 'promotions/upsert': {
      const p = a.promotion
      if (toMs(p.endsAt) <= toMs(p.startsAt)) return 'The end date must come after the start date.'
      const l = s.listings.find((x) => x.id === p.listingId)
      if (p.kind === 'price_drop' && (!p.promoPrice || !l || p.promoPrice >= l.price)) return 'The promotion price must be below the listing price.'
      const overlap = s.promotions.some((o) => o.id !== p.id && o.listingId === p.listingId && o.kind === p.kind && toMs(o.startsAt) < toMs(p.endsAt) && toMs(p.startsAt) < toMs(o.endsAt))
      return overlap ? 'This listing already has a promotion of this kind in that period.' : null
    }
    case 'pages/upsert':
      return s.sitePages.some((p) => p.id !== a.page.id && p.slug === a.page.slug) ? 'Another page uses this link.' : null
    default:
      return null
  }
}

// ---------------------------------------------------------------- reducer slice

const note = (s: AppState, by: string, at: string, dealId: string | null, contactId: string, text: string): AppState => ({
  ...s,
  activities: [{ id: newId('act'), at, by, kind: 'visit', ref: dealId ? { type: 'deal', id: dealId } : { type: 'contact', id: contactId }, text }, ...s.activities],
})

/** Listings that leave the market come off every portal. */
export const removeFromPortals = (s: AppState, listingId: string): AppState => ({
  ...s,
  portalSyncs: s.portalSyncs.map((x) => (x.listingId === listingId && x.status !== 'removed' ? { ...x, status: 'removed' } : x)),
})

export function opsApply(s: AppState, a: OpsAction, at: string, by: string): AppState {
  switch (a.type) {
    case 'projects/upsert':
      return { ...s, projects: upsert(s.projects, a.project) }
    case 'units/upsert':
      return { ...s, units: upsert(s.units, a.unit) }
    case 'units/hold':
      return { ...s, units: patchById(s.units, a.id, (u) => ({ ...u, status: 'held', holdUntil: a.until, dealId: a.dealId })) }
    case 'units/release':
      return { ...s, units: patchById(s.units, a.id, (u) => ({ ...u, status: 'available', holdUntil: null, dealId: null })) }
    case 'units/markSold':
      return { ...s, units: patchById(s.units, a.id, (u) => ({ ...u, status: 'sold', holdUntil: null })) }
    case 'visits/create': {
      const visit = { ...a.visit, code: nextCode(s.visits.map((v) => v.code), 'VS-26-', 4), createdAt: at }
      return { ...s, visits: [visit, ...s.visits] }
    }
    case 'visits/reschedule':
      return { ...s, visits: patchById(s.visits, a.id, (v) => ({ ...v, startAt: a.startAt, agentId: a.agentId })) }
    case 'visits/setStatus': {
      const next = { ...s, visits: patchById(s.visits, a.id, (v) => ({ ...v, status: a.status })) }
      const v = next.visits.find((x) => x.id === a.id)!
      const place = s.listings.find((l) => l.id === v.listingId)?.code ?? s.units.find((u) => u.id === v.unitId)?.code ?? 'the property'
      if (a.status === 'done') return note(next, by, at, v.dealId, v.contactId, `${v.code}: site visit at ${place} done.`)
      if (a.status === 'no_show') return note(next, by, at, v.dealId, v.contactId, `${v.code}: buyer did not come to ${place}.`)
      return next
    }
    case 'visits/feedback':
      return { ...s, visits: patchById(s.visits, a.id, (v) => ({ ...v, rating: a.rating, feedback: a.feedback })) }
    case 'openHouses/upsert':
      return { ...s, openHouses: upsert(s.openHouses, a.openHouse, true) }
    case 'openHouses/register':
      return { ...s, openHouses: patchById(s.openHouses, a.id, (o) => ({ ...o, registrations: [...o.registrations, a.registration] })) }
    case 'openHouses/attend':
      return {
        ...s,
        openHouses: patchById(s.openHouses, a.id, (o) => ({ ...o, registrations: o.registrations.map((r) => (r.id === a.registrationId ? { ...r, attended: a.attended } : r)) })),
      }
    case 'payments/create': {
      const payment = { ...a.payment, code: nextCode(s.payments.map((p) => p.code), 'PAY-26-', 4), createdBy: by, createdAt: at }
      return { ...s, payments: [payment, ...s.payments] }
    }
    case 'payments/markPaid': {
      let next: AppState = { ...s, payments: patchById(s.payments, a.id, (p) => ({ ...p, status: 'paid', paidAt: at, reference: a.reference || p.reference })) }
      const p = next.payments.find((x) => x.id === a.id)!
      if (p.kind !== 'booking_fee' && p.kind !== 'down_payment') return next
      // A booking fee books the unit and moves an earlier-stage deal to the booking stage.
      if (p.unitId) next = { ...next, units: patchById(next.units, p.unitId, (u) => ({ ...u, status: 'booked', holdUntil: null, dealId: p.dealId })) }
      const deal = next.deals.find((d) => d.id === p.dealId)
      const stage = deal && next.stages.find((st) => st.id === deal.stageId)
      const booking = next.stages.find((st) => st.id === 'stg-booking')
      if (deal && stage?.kind === 'open' && booking && stage.probability < booking.probability) {
        next = { ...next, deals: patchById(next.deals, deal.id, (d) => ({ ...d, stageId: booking.id, updatedAt: at })) }
      }
      return {
        ...next,
        activities: [{ id: newId('act'), at, by, kind: 'note', ref: { type: 'deal', id: p.dealId }, text: `${p.code}: ${PAYMENT_KIND_LABEL[p.kind].toLowerCase()} received.` }, ...next.activities],
      }
    }
    case 'payments/refund': {
      const p = s.payments.find((x) => x.id === a.id)!
      const refund: Payment = {
        ...p,
        id: a.refundId,
        code: nextCode(s.payments.map((x) => x.code), 'PAY-26-', 4),
        kind: 'refund',
        status: 'paid',
        method: 'transfer',
        reference: '',
        expiresAt: null,
        paidAt: at,
        refundOf: p.id,
        createdBy: by,
        createdAt: at,
      }
      let next: AppState = { ...s, payments: [refund, ...s.payments.map((x) => (x.id === p.id ? { ...x, status: 'refunded' as const } : x))] }
      if (p.unitId) next = { ...next, units: patchById(next.units, p.unitId, (u) => (u.status === 'booked' && u.dealId === p.dealId ? { ...u, status: 'available', dealId: null } : u)) }
      return next
    }
    case 'syncs/publish': {
      const l = s.listings.find((x) => x.id === a.listingId)!
      // Lamudi and Pinhome refuse listings without photos; the mock answers at once.
      const refused = (a.portal === 'lamudi' || a.portal === 'pinhome') && !l.photo
      const existing = s.portalSyncs.find((x) => x.listingId === a.listingId && x.portal === a.portal)
      const sync: PortalSync = {
        id: existing?.id ?? newId('syn'),
        listingId: a.listingId,
        portal: a.portal,
        status: refused ? 'error' : 'live',
        externalId: refused ? null : `${a.portal.slice(0, 3).toUpperCase()}-${l.code.slice(3)}`,
        lastSyncAt: at,
        error: refused ? `${PORTAL_LABEL[a.portal]} rejected the listing: photos are required.` : null,
        views: existing?.views ?? 0,
        leads: existing?.leads ?? 0,
      }
      return { ...s, portalSyncs: upsert(s.portalSyncs, sync) }
    }
    case 'syncs/remove':
      return { ...s, portalSyncs: patchById(s.portalSyncs, a.id, (x) => ({ ...x, status: 'removed', lastSyncAt: at })) }
    case 'statements/generate': {
      const statement: CommissionStatement = {
        id: a.id,
        code: nextCode(s.statements.map((x) => x.code), 'CS-26-', 4),
        agentId: a.agentId,
        month: a.month,
        lines: statementLines(s, a.agentId, a.month),
        adjustment: 0,
        note: '',
        status: 'draft',
        approvedBy: null,
        paidAt: null,
        createdAt: at,
      }
      return { ...s, statements: [statement, ...s.statements] }
    }
    case 'statements/adjust':
      return { ...s, statements: patchById(s.statements, a.id, (x) => ({ ...x, adjustment: a.adjustment, note: a.note })) }
    case 'statements/approve':
      return { ...s, statements: patchById(s.statements, a.id, (x) => ({ ...x, status: 'approved', approvedBy: by })) }
    case 'statements/pay':
      return { ...s, statements: patchById(s.statements, a.id, (x) => ({ ...x, status: 'paid', paidAt: at })) }
    case 'promotions/upsert':
      return { ...s, promotions: upsert(s.promotions, a.promotion, true) }
    case 'promotions/remove':
      return { ...s, promotions: s.promotions.filter((p) => p.id !== a.id) }
    case 'pages/upsert':
      return { ...s, sitePages: upsert(s.sitePages, { ...a.page, updatedAt: at }) }
    case 'pages/remove':
      return { ...s, sitePages: s.sitePages.filter((p) => p.id !== a.id) }
    case 'saved/toggle': {
      const phone = normalizePhone(a.phone)
      const found = s.savedProperties.find((x) => x.phone === phone && x.listingId === a.listingId)
      return {
        ...s,
        savedProperties: found ? s.savedProperties.filter((x) => x !== found) : [{ id: newId('sav'), phone, listingId: a.listingId, at }, ...s.savedProperties],
      }
    }
    case 'ops/sweep': {
      const now = toMs(at)
      return {
        ...s,
        units: s.units.map((u) => (u.status === 'held' && u.holdUntil && toMs(u.holdUntil) < now ? { ...u, status: 'available', holdUntil: null, dealId: null } : u)),
        payments: s.payments.map((p) => (p.status === 'pending' && p.expiresAt && toMs(p.expiresAt) < now ? { ...p, status: 'expired' } : p)),
      }
    }
  }
}

/** True when the sweep would change something, so the job only dispatches when needed. */
export const sweepDue = (s: AppState, now: number) =>
  s.units.some((u) => u.status === 'held' && u.holdUntil && toMs(u.holdUntil) < now) ||
  s.payments.some((p) => p.status === 'pending' && p.expiresAt && toMs(p.expiresAt) < now)
