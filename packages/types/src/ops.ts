/**
 * Property operations, adapted from Mizu's wellness modules: projects and unit availability (resort rooms),
 * site visits (reservations and class bookings), open houses (events), booking fees and deposits (POS payments),
 * portal syndication (channel manager), agent commission statements (coach incentives), promotions,
 * and the public pages CMS (site content).
 */

export type ProjectKind = 'cluster' | 'tower' | 'shophouse_row' | 'warehouse_park'
export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  cluster: 'Housing cluster',
  tower: 'Apartment tower',
  shophouse_row: 'Shophouse row',
  warehouse_park: 'Warehouse park',
}

export interface Project {
  id: string
  code: string
  name: string
  kind: ProjectKind
  partnerId: string
  city: string
  district: string
  description: string
  createdAt: string
}

export type UnitStatus = 'available' | 'held' | 'booked' | 'sold'
export const UNIT_STATUS_LABEL: Record<UnitStatus, string> = {
  available: 'Available',
  held: 'On hold',
  booked: 'Booked',
  sold: 'Sold',
}

export interface Unit {
  id: string
  projectId: string
  /** Block and number or tower floor and unit, e.g. "A-07" or "18-03". */
  code: string
  /** Groups units on the availability board: a block letter or a floor number. */
  group: string
  type: string
  landArea: number | null
  buildingArea: number
  bedrooms: number | null
  price: number
  status: UnitStatus
  dealId: string | null
  /** A hold lapses back to available at this time. */
  holdUntil: string | null
}

export type VisitStatus = 'scheduled' | 'checked_in' | 'done' | 'no_show' | 'cancelled'
export const VISIT_STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: 'Scheduled',
  checked_in: 'Checked in',
  done: 'Done',
  no_show: 'No-show',
  cancelled: 'Cancelled',
}

export interface Visit {
  id: string
  code: string
  listingId: string | null
  unitId: string | null
  contactId: string
  dealId: string | null
  agentId: string
  startAt: string
  durationMin: number
  status: VisitStatus
  notes: string
  /** 1 to 5, from the buyer after the visit. */
  rating: number | null
  feedback: string
  createdAt: string
}

export interface OpenHouseRegistration {
  id: string
  name: string
  phone: string
  at: string
  attended: boolean
}

export interface OpenHouse {
  id: string
  slug: string
  title: string
  listingId: string | null
  projectId: string | null
  startAt: string
  endAt: string
  capacity: number
  hostId: string
  published: boolean
  registrations: OpenHouseRegistration[]
  createdAt: string
}

export type PaymentKind = 'booking_fee' | 'deposit' | 'down_payment' | 'refund'
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = {
  booking_fee: 'Booking fee',
  deposit: 'Rental deposit',
  down_payment: 'Down payment',
  refund: 'Refund',
}

export type PaymentMethod = 'virtual_account' | 'qris' | 'transfer' | 'cash'
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  virtual_account: 'Virtual account',
  qris: 'QRIS',
  transfer: 'Bank transfer',
  cash: 'Cash',
}

export type PaymentStatus = 'pending' | 'paid' | 'expired' | 'refunded'
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Waiting for payment',
  paid: 'Paid',
  expired: 'Expired',
  refunded: 'Refunded',
}

export interface Payment {
  id: string
  code: string
  kind: PaymentKind
  dealId: string
  contactId: string
  unitId: string | null
  amount: number
  method: PaymentMethod
  status: PaymentStatus
  /** Virtual account number or transfer reference. */
  reference: string
  expiresAt: string | null
  paidAt: string | null
  /** For a refund: the payment it returns. */
  refundOf: string | null
  createdBy: string
  createdAt: string
}

export type Portal = 'rumah123' | 'lamudi' | 'olx' | 'pinhome'
export const PORTAL_LABEL: Record<Portal, string> = {
  rumah123: 'Rumah123',
  lamudi: 'Lamudi',
  olx: 'OLX Properti',
  pinhome: 'Pinhome',
}

export type SyncStatus = 'queued' | 'live' | 'error' | 'removed'
export const SYNC_STATUS_LABEL: Record<SyncStatus, string> = {
  queued: 'Queued',
  live: 'Live',
  error: 'Error',
  removed: 'Removed',
}

export interface PortalSync {
  id: string
  listingId: string
  portal: Portal
  status: SyncStatus
  externalId: string | null
  lastSyncAt: string | null
  error: string | null
  views: number
  leads: number
}

export type StatementStatus = 'draft' | 'approved' | 'paid'
export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  draft: 'Draft',
  approved: 'Approved',
  paid: 'Paid',
}

export interface StatementLine {
  dealId: string
  basis: number
  commissionPct: number
  agentPct: number
  amount: number
}

/** One agent's commission for one month of won deals. */
export interface CommissionStatement {
  id: string
  code: string
  agentId: string
  /** YYYY-MM */
  month: string
  lines: StatementLine[]
  adjustment: number
  note: string
  status: StatementStatus
  approvedBy: string | null
  paidAt: string | null
  createdAt: string
}

export type PromotionKind = 'featured' | 'price_drop'
export const PROMOTION_KIND_LABEL: Record<PromotionKind, string> = { featured: 'Featured', price_drop: 'Price drop' }

export interface Promotion {
  id: string
  listingId: string
  kind: PromotionKind
  startsAt: string
  endsAt: string
  /** Price drop only: the price shown during the promotion. */
  promoPrice: number | null
  label: string
  createdAt: string
}

export type PageKind = 'about' | 'contact' | 'area_guide' | 'legal'
export const PAGE_KIND_LABEL: Record<PageKind, string> = {
  about: 'About',
  contact: 'Contact',
  area_guide: 'Area guide',
  legal: 'Legal',
}

export interface SitePage {
  id: string
  slug: string
  kind: PageKind
  title: string
  summary: string
  /** Same small markdown subset as the blog: ## headings, - and 1. lists, paragraphs. */
  body: string
  /** Area guides: the city whose live listings appear under the guide. */
  city: string | null
  published: boolean
  updatedAt: string
}

/** A buyer's saved properties in the buyer portal, keyed by normalised phone. */
export interface SavedProperty {
  id: string
  phone: string
  listingId: string
  at: string
}
