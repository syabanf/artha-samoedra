import type {
  AssetType,
  DealType,
  Inquiry,
  InquiryStatus,
  Listing,
  ListingStatus,
} from '@artha/types'
import { PUBLIC_LISTING_STATUSES } from '@artha/types'
import type { AppState } from './store'

// ---- filters (one pure function per table) ----

export interface ListingCriteria {
  query?: string
  status?: ListingStatus | null
  type?: AssetType | null
  deal?: DealType | null
  city?: string | null
  maxPrice?: number | null
  minBedrooms?: number | null
}

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

export const filterListings = (rows: Listing[], c: ListingCriteria) => {
  const terms = words(c.query ?? '')
  return rows.filter((l) => {
    if (c.status && l.status !== c.status) return false
    if (c.type && l.type !== c.type) return false
    if (c.deal && l.deal !== c.deal) return false
    if (c.city && l.city !== c.city) return false
    if (c.maxPrice && l.price > c.maxPrice) return false
    if (c.minBedrooms && (l.bedrooms ?? 0) < c.minBedrooms) return false
    if (!terms.length) return true
    const hay = `${l.code} ${l.title} ${l.city} ${l.district} ${l.type}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

export const publicListings = (s: AppState) => s.listings.filter((l) => PUBLIC_LISTING_STATUSES.includes(l.status))

export interface InquiryCriteria {
  query?: string
  status?: InquiryStatus | null
}

export const filterInquiries = (rows: Inquiry[], c: InquiryCriteria) => {
  const terms = words(c.query ?? '')
  return rows.filter((i) => {
    if (c.status && i.status !== c.status) return false
    const hay = `${i.code} ${i.name} ${i.phone} ${i.message}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

/** Count each value after every other filter applies, so a chip never promises rows that are not there. */
export const countBy = <T, K extends string>(rows: T[], key: (r: T) => K) => {
  const out = {} as Record<K, number>
  for (const r of rows) out[key(r)] = (out[key(r)] ?? 0) + 1
  return out
}

/** Digits only, so 0812-1100-2231 and 081211002231 match. */
export const normalizePhone = (phone: string) => phone.replace(/\D/g, '').replace(/^62/, '0')
