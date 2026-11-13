import type {
  AgentEventKind,
  AssetType,
  RentBilling,
  ContentStatus,
  DealType,
  InquiryChannel,
  InquiryStatus,
  ListingSource,
  ListingStatus,
  PartnerKind,
  SocialPlatform,
} from './enums'

/** A supply partner: the owner, agent or developer who hands Artha Samoedra an asset to market. */
export interface Partner {
  id: string
  code: string
  name: string
  kind: PartnerKind
  phone: string
  email: string
  city: string
  joinedAt: string
}

export interface Listing {
  id: string
  code: string
  slug: string
  title: string
  type: AssetType
  deal: DealType
  partnerId: string
  city: string
  district: string
  address: string
  price: number
  landArea: number
  buildingArea: number | null
  bedrooms: number | null
  certificate: string
  description: string
  highlights: string[]
  /** Cover image: the first of `photos`, or null for the type icon stand-in. */
  photo: string | null
  /** Up to 4 images as data URLs, uploaded by the partner in the Jessy chat. */
  photos?: string[]
  status: ListingStatus
  source: ListingSource
  createdAt: string
  updatedAt: string
  soldPrice: number | null
  soldAt: string | null
  delistReason: string | null
}

/** The seller grants Artha Samoedra the sole right to market the asset until endsAt. */
/** Stored lifecycle of an exclusive right; `exclusives/sweep` moves active to expired at the end date. */
export type ExclusiveStatus = 'active' | 'expired' | 'ended'

/** Reminder milestones in days before the end date. Each goes out once per period. */
export type ExclusiveMilestone = 30 | 7 | 1

export interface ExclusiveReminder {
  days: ExclusiveMilestone
  at: string
  /** The milestone had already passed when a tighter one went out, so it was not sent. */
  skipped?: boolean
}

/** Signed contract scan: a PDF or an image of at most 1 MB, kept as a data URL. */
export interface ExclusiveDocument {
  name: string
  type: string
  size: number
  dataUrl: string
}

export interface ExclusiveRight {
  id: string
  listingId: string
  startsAt: string
  endsAt: string
  /** Legacy reminder window. Reminders now follow the 30, 7 and 1 day milestones; kept so older callers and saved data still read. */
  remindDaysBefore: number
  endedAt: string | null
  /** When the latest milestone reminder went out. */
  lastRemindedAt: string | null
  note: string
  /** Missing on rights saved before milestones existed; read it through `exclusiveStatus`. */
  status?: ExclusiveStatus
  reminders?: ExclusiveReminder[]
  contractNo?: string
  signedAt?: string | null
  document?: ExclusiveDocument | null
}

/** Who takes part of a commission: the company, a sales agent, a supply partner or another named party. */
export type SharePartyKind = 'company' | 'agent' | 'partner' | 'other'

export interface ShareParty {
  id: string
  kind: SharePartyKind
  /**
   * User id for an agent, partner id for a partner. Null means the deal owner at closing
   * for an agent and the listing's partner for a partner; always null for company and other.
   */
  refId: string | null
  /** Name of an 'other' party, such as a co-broker or notary. */
  name: string
  /** 'percent' takes a share of what is left after fixed amounts; 'fixed' takes rupiah. */
  mode: 'percent' | 'fixed'
  value: number
}

/**
 * Commission on the deal price, split between any number of parties.
 * Fixed amounts come off first; percentage parties split the rest and must total 100.
 */
export interface ProfitShare {
  id: string
  listingId: string
  /** 'percent' charges commissionPct of the deal price; 'fixed' charges commissionFixed rupiah. */
  commissionMode: 'percent' | 'fixed'
  commissionPct: number
  commissionFixed: number
  parties: ShareParty[]
  note: string
}

export interface Inquiry {
  id: string
  code: string
  listingId: string | null
  name: string
  phone: string
  channel: InquiryChannel
  message: string
  budget: number | null
  status: InquiryStatus
  ownerId: string | null
  /** Lead form that produced the inquiry, if any. */
  formId?: string
  /** Answers Jessy collects before the handoff; the budget stays on `budget`. */
  qualification?: InquiryQualification
  createdAt: string
  updatedAt: string
}

export type BuyerTimeline = 'now' | 'three_months' | 'six_months'
export type BuyerFinancing = 'cash' | 'mortgage' | 'installment'
export type BuyerPurpose = 'live_in' | 'invest' | 'business'

export interface InquiryQualification {
  timeline: BuyerTimeline | null
  financing: BuyerFinancing | null
  purpose: BuyerPurpose | null
  temperature: 'hot' | 'warm' | 'cold'
}

/** Post is a single image, carousel is 3 to 6 slides, reel is a short video script (Instagram reel or TikTok). */
export type SocialFormat = 'post' | 'carousel' | 'reel'

export interface CarouselSlide {
  headline: string
  line: string
}

export interface ReelScene {
  shot: string
  onScreen: string
  voiceOver: string
}

export interface SocialPost {
  id: string
  listingId: string | null
  platform: SocialPlatform
  account: string
  format: SocialFormat
  /** Opening line, and the first seconds of a reel. */
  hook: string
  caption: string
  hashtags: string[]
  slides?: CarouselSlide[]
  scenes?: ReelScene[]
  /** Reel call to action and suggested audio. */
  cta?: string
  audio?: string
  status: ContentStatus
  scheduledAt: string | null
  /** Why a reviewer sent it back, or why publishing failed. */
  reviewNote?: string | null
  approvedBy?: string | null
  publishedAt?: string | null
  platformPostId?: string | null
  permalink?: string | null
  createdAt: string
}

export interface Faq {
  q: string
  a: string
}

export interface BlogPost {
  id: string
  slug: string
  title: string
  metaTitle: string
  metaDescription: string
  keywords: string[]
  /** Answer-first summary that AI search engines can quote (GEO). */
  geoSummary: string
  excerpt: string
  body: string
  faq: Faq[]
  listingIds: string[]
  status: ContentStatus
  publishedAt: string | null
  scheduledAt?: string | null
  reviewNote?: string | null
  approvedBy?: string | null
  createdAt: string
}

export interface AgentEvent {
  id: string
  at: string
  kind: AgentEventKind
  text: string
  ref: string | null
}

export interface Settings {
  agentName: string
  socialAccounts: string[]
}

export interface HistoryEntry {
  id: string
  at: string
  by: string
  ref: string
  text: string
}

/**
 * A tenancy on a `sewa` listing that Artha Samoedra manages for the consigning partner. Artha
 * collects the rent, keeps `feePct` of each payment, and pays the rest to the owner. When an agent
 * consigned the listing, the agent earns `agentPct` of Artha's fee.
 */
export interface Lease {
  id: string
  code: string
  listingId: string
  tenant: string
  /** The owner an agent represents; null when the owner consigned the listing directly. */
  ownerName: string | null
  startDate: string
  endDate: string
  billing: RentBilling
  /** Rent for one billing period. */
  rent: number
  deposit: number
  feePct: number
  agentPct: number
}

/** One billing period of a lease: billed to the tenant, then paid out to the owner. */
export interface RentBill {
  id: string
  leaseId: string
  periodStart: string
  dueDate: string
  amount: number
  paidAt: string | null
  payoutAt: string | null
}
