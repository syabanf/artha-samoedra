// ---------------------------------------------------------------- dataroom

/** A folder sees the departments it names, or inherits its parent's list; an empty list at the root means everyone. */
export interface DataFolder {
  id: string
  name: string
  parentId: string | null
  departmentIds: string[]
  /** Property folders tie to a listing or a deal so agents find them from the record. */
  listingId: string | null
  dealId: string | null
  description: string
  createdBy: string
  createdAt: string
}

export interface DataFile {
  id: string
  folderId: string
  name: string
  mime: string
  size: number
  /** Uploaded content as a data URL of at most 1 MB; seeded files keep null and show a preview card. */
  dataUrl: string | null
  version: number
  /** Set when a newer version with the same name replaced this one. */
  replacedBy: string | null
  note: string
  uploadedBy: string
  uploadedAt: string
}

export type SharePurpose = 'buyer' | 'notary' | 'bank' | 'partner' | 'other'
export const SHARE_PURPOSE_LABEL: Record<SharePurpose, string> = { buyer: 'Buyer', notary: 'Notary', bank: 'Bank', partner: 'Partner', other: 'Other' }

/** An external link to a folder (with its subfolders) or to picked files; the recipient opens it with their email and a 6-digit code. */
export interface ShareLink {
  id: string
  token: string
  folderId: string | null
  fileIds: string[]
  recipientName: string
  email: string
  purpose: SharePurpose
  code: string
  message: string
  allowDownload: boolean
  expiresAt: string
  revokedAt: string | null
  createdBy: string
  createdAt: string
}

export type ShareStatus = 'active' | 'expired' | 'revoked'
export const SHARE_STATUS_LABEL: Record<ShareStatus, string> = { active: 'Active', expired: 'Expired', revoked: 'Revoked' }

export type ShareEventKind = 'sent' | 'code_failed' | 'opened' | 'viewed' | 'downloaded' | 'revoked'
export const SHARE_EVENT_LABEL: Record<ShareEventKind, string> = {
  sent: 'Link sent',
  code_failed: 'Wrong code',
  opened: 'Opened',
  viewed: 'Viewed a file',
  downloaded: 'Downloaded a file',
  revoked: 'Revoked',
}

export interface ShareEvent {
  id: string
  linkId: string
  kind: ShareEventKind
  fileId: string | null
  at: string
}
