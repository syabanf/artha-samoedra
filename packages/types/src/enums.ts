export type AssetType = 'tanah' | 'rumah' | 'ruko' | 'gudang' | 'villa' | 'apartemen'
export const ASSET_TYPES: AssetType[] = ['tanah', 'rumah', 'ruko', 'gudang', 'villa', 'apartemen']
export const ASSET_TYPE_LABEL: Record<AssetType, string> = {
  tanah: 'Land',
  rumah: 'House',
  ruko: 'Shophouse',
  gudang: 'Warehouse',
  villa: 'Villa',
  apartemen: 'Apartment',
}

export type DealType = 'jual' | 'sewa'
export const DEAL_TYPE_LABEL: Record<DealType, string> = { jual: 'For sale', sewa: 'For rent' }

/** review: submitted by a partner through Jessy, waiting for the team to check it. */
export type ListingStatus = 'review' | 'active' | 'reserved' | 'sold' | 'delisted'
export const LISTING_STATUSES: ListingStatus[] = ['review', 'active', 'reserved', 'sold', 'delisted']
export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  review: 'Needs review',
  active: 'Live',
  reserved: 'Reserved',
  sold: 'Sold',
  delisted: 'Delisted',
}
export const PUBLIC_LISTING_STATUSES: ListingStatus[] = ['active', 'reserved']

export type ListingSource = 'internal' | 'jessy'
export const LISTING_SOURCE_LABEL: Record<ListingSource, string> = { internal: 'Internal team', jessy: 'Jessy chat' }

export type PartnerKind = 'owner' | 'agent' | 'developer'
export const PARTNER_KIND_LABEL: Record<PartnerKind, string> = {
  owner: 'Owner',
  agent: 'Agent',
  developer: 'Developer',
}

export type InquiryStatus = 'new' | 'contacted' | 'survey' | 'negotiation' | 'won' | 'lost'
export const INQUIRY_STATUSES: InquiryStatus[] = ['new', 'contacted', 'survey', 'negotiation', 'won', 'lost']
export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  survey: 'Site visit',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
}
export const INQUIRY_STATUS_FLOW: InquiryStatus[] = ['new', 'contacted', 'survey', 'negotiation', 'won']
export const OPEN_INQUIRY_STATUSES: InquiryStatus[] = ['new', 'contacted', 'survey', 'negotiation']

export type InquiryChannel = 'web_chat' | 'whatsapp' | 'instagram'
export const INQUIRY_CHANNEL_LABEL: Record<InquiryChannel, string> = {
  web_chat: 'Web chat',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
}

/** Derived from the exclusive right's dates and the app clock, never stored. */
export type ExclusiveState = 'active' | 'due' | 'expired' | 'ended'
export const EXCLUSIVE_STATE_LABEL: Record<ExclusiveState, string> = {
  active: 'Active',
  due: 'Due soon',
  expired: 'Overdue',
  ended: 'Ended',
}

export type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'x'
export const SOCIAL_PLATFORMS: SocialPlatform[] = ['instagram', 'tiktok', 'facebook', 'x']
export const SOCIAL_PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
}

/** Approval flow for social and blog content: draft, review, approval, then scheduled or published. */
export type ContentStatus = 'draft' | 'in_review' | 'approved' | 'scheduled' | 'published' | 'failed'
export const CONTENT_STATUSES: ContentStatus[] = ['draft', 'in_review', 'approved', 'scheduled', 'published', 'failed']
export const CONTENT_STATUS_LABEL: Record<ContentStatus, string> = {
  draft: 'Draft',
  in_review: 'In review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  published: 'Published',
  failed: 'Failed',
}

export type AgentEventKind = 'inquiry' | 'listing' | 'delisting' | 'reminder' | 'content'
export const AGENT_EVENT_KIND_LABEL: Record<AgentEventKind, string> = {
  inquiry: 'Inquiry',
  listing: 'New listing',
  delisting: 'Delisting',
  reminder: 'Reminder',
  content: 'Content',
}
