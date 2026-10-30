import type { DataFile, DataFolder, ShareEvent, ShareEventKind, ShareLink, ShareStatus } from '@artha/types'
import { DAY, toMs } from './clock'
import { fmtNumber, newId } from './format'
import { employeeOfUser } from './hr'
import { patchById, upsert } from './rows'
import type { AppAction, AppState } from './store'

export type DataroomAction =
  | { type: 'folders/upsert'; folder: DataFolder }
  | { type: 'folders/remove'; id: string }
  /** A file with the same name in the folder becomes its next version; the old one stays in the history. */
  | { type: 'dataFiles/upload'; file: DataFile }
  | { type: 'dataFiles/move'; id: string; folderId: string }
  /** Removes the file and its older versions. */
  | { type: 'dataFiles/remove'; id: string }
  | { type: 'shareLinks/create'; link: ShareLink }
  | { type: 'shareLinks/revoke'; id: string }
  | { type: 'shareLinks/extend'; id: string; expiresAt: string }
  /** Public: the recipient enters their email and code. A wrong pair is logged as well. */
  | { type: 'shareLinks/open'; id: string; email: string; code: string }
  /** Public: a view or download inside an opened share. */
  | { type: 'shareLinks/track'; id: string; kind: 'viewed' | 'downloaded'; fileId: string }

const PREFIXES = ['folders/', 'dataFiles/', 'shareLinks/']
export const isDataroomAction = (a: AppAction): a is DataroomAction => PREFIXES.some((p) => a.type.startsWith(p))

export const DATAROOM_MAX_BYTES = 1_048_576
/** Five wrong codes in a row lock the link until the sender sends a new one. */
export const SHARE_MAX_TRIES = 5
export const SHARE_MAX_DAYS = 90

export const fmtFileSize = (bytes: number) => (bytes >= 1_048_576 ? `${fmtNumber(bytes / 1_048_576, 1)} MB` : `${fmtNumber(Math.max(1, Math.round(bytes / 1024)))} KB`)

// ---------------------------------------------------------------- folders

export const childFolders = (s: Pick<AppState, 'dataFolders'>, parentId: string | null) =>
  s.dataFolders.filter((f) => f.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))

/** Root first, the folder itself last. */
export const folderPath = (s: Pick<AppState, 'dataFolders'>, id: string | null): DataFolder[] => {
  const out: DataFolder[] = []
  for (let f = s.dataFolders.find((x) => x.id === id); f; f = s.dataFolders.find((x) => x.id === f!.parentId)) out.unshift(f)
  return out
}

/** The folder and every folder under it. */
export const folderTreeIds = (s: Pick<AppState, 'dataFolders'>, id: string): string[] => [id, ...childFolders(s, id).flatMap((c) => folderTreeIds(s, c.id))]

/** The nearest folder up the path that names departments decides who sees it; none means everyone. */
export const folderDepartments = (s: Pick<AppState, 'dataFolders'>, id: string) => [...folderPath(s, id)].reverse().find((f) => f.departmentIds.length)?.departmentIds ?? []

/** `manage` (dataroom.manage) sees every folder; anyone else needs their department on the folder's list. */
export const canSeeFolder = (s: Pick<AppState, 'dataFolders' | 'employees'>, userId: string, id: string, manage: boolean) => {
  if (manage) return true
  const deps = folderDepartments(s, id)
  if (!deps.length) return true
  const dep = employeeOfUser(s, userId)?.departmentId
  return !!dep && deps.includes(dep)
}

/** Current versions only. */
export const filesIn = (s: Pick<AppState, 'dataFiles'>, folderId: string) =>
  s.dataFiles.filter((f) => f.folderId === folderId && !f.replacedBy).sort((a, b) => a.name.localeCompare(b.name))

/** The file and the versions it replaced, newest first. */
export const fileVersions = (s: Pick<AppState, 'dataFiles'>, id: string): DataFile[] => {
  const out: DataFile[] = []
  for (let f = s.dataFiles.find((x) => x.id === id); f; f = s.dataFiles.find((x) => x.replacedBy === f!.id)) out.push(f)
  return out
}

/** The newest version in the file's chain. */
export const currentVersion = (s: Pick<AppState, 'dataFiles'>, id: string): DataFile | undefined => {
  let f = s.dataFiles.find((x) => x.id === id)
  while (f?.replacedBy) f = s.dataFiles.find((x) => x.id === f!.replacedBy) ?? f
  return f
}

export const folderStats = (s: Pick<AppState, 'dataFolders' | 'dataFiles'>, id: string) => {
  const ids = new Set(folderTreeIds(s, id))
  const files = s.dataFiles.filter((f) => ids.has(f.folderId) && !f.replacedBy)
  return { files: files.length, bytes: files.reduce((n, f) => n + f.size, 0), updatedAt: files.reduce<string | null>((m, f) => (!m || f.uploadedAt > m ? f.uploadedAt : m), null) }
}

export const foldersForListing = (s: Pick<AppState, 'dataFolders'>, listingId: string) => s.dataFolders.filter((f) => f.listingId === listingId)
export const foldersForDeal = (s: Pick<AppState, 'dataFolders'>, dealId: string) => s.dataFolders.filter((f) => f.dealId === dealId)

// ---------------------------------------------------------------- shares

export const shareStatus = (l: ShareLink, nowMs: number): ShareStatus => (l.revokedAt ? 'revoked' : toMs(l.expiresAt) <= nowMs ? 'expired' : 'active')

export const shareByToken = (s: Pick<AppState, 'shareLinks'>, token: string) => (token ? s.shareLinks.find((l) => l.token === token) : undefined)

export const shareEvents = (s: Pick<AppState, 'shareEvents'>, linkId: string) => s.shareEvents.filter((e) => e.linkId === linkId).sort((a, b) => b.at.localeCompare(a.at))

/** Files the recipient sees: the folder's whole tree, or the picked files. */
export const shareFiles = (s: Pick<AppState, 'dataFolders' | 'dataFiles'>, l: ShareLink) => {
  if (!l.folderId) return s.dataFiles.filter((f) => l.fileIds.includes(f.id))
  const ids = new Set(folderTreeIds(s, l.folderId))
  return s.dataFiles.filter((f) => ids.has(f.folderId) && !f.replacedBy)
}

export const shareCodeMatches = (l: ShareLink, email: string, code: string) => email.trim().toLowerCase() === l.email.toLowerCase() && code.trim() === l.code

/** Wrong codes since the last successful open. */
export const failedTries = (s: Pick<AppState, 'shareEvents'>, linkId: string) => {
  let n = 0
  for (const e of shareEvents(s, linkId)) {
    if (e.kind === 'opened') break
    if (e.kind === 'code_failed') n++
  }
  return n
}

/** Six digits for the recipient, sent apart from the link. */
export const newShareCode = () => String(Math.floor(100_000 + Math.random() * 900_000))
export const newShareToken = () => `${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`

export const shareSummary = (s: Pick<AppState, 'shareEvents'>, linkId: string) => {
  const ev = shareEvents(s, linkId)
  const count = (k: ShareEventKind) => ev.filter((e) => e.kind === k).length
  return { opens: count('opened'), views: count('viewed'), downloads: count('downloaded'), lastSeen: ev.find((e) => e.kind !== 'sent' && e.kind !== 'revoked')?.at ?? null }
}

// ---------------------------------------------------------------- store

const event = (linkId: string, kind: ShareEventKind, at: string, fileId: string | null = null): ShareEvent => ({ id: newId('she'), linkId, kind, fileId, at })

export const dataroomBlocker = (s: AppState, a: DataroomAction, nowMs: number): string | null => {
  switch (a.type) {
    case 'folders/upsert': {
      const f = a.folder
      if (!f.name.trim()) return 'Name the folder.'
      if (f.parentId && !s.dataFolders.some((x) => x.id === f.parentId)) return 'The parent folder is gone.'
      if (f.parentId && folderPath(s, f.parentId).some((x) => x.id === f.id)) return 'A folder cannot sit inside itself.'
      if (s.dataFolders.some((x) => x.id !== f.id && x.parentId === f.parentId && x.name.trim().toLowerCase() === f.name.trim().toLowerCase())) return `There is already a folder named ${f.name.trim()} here.`
      if (!f.departmentIds.every((d) => s.departments.some((x) => x.id === d))) return 'Pick departments from the list.'
      return null
    }
    case 'folders/remove': {
      if (childFolders(s, a.id).length) return 'Move or remove the subfolders first.'
      if (filesIn(s, a.id).length) return 'Move or remove the files first.'
      return s.shareLinks.some((l) => l.folderId === a.id && shareStatus(l, nowMs) === 'active') ? 'Revoke the active share links to this folder first.' : null
    }
    case 'dataFiles/upload': {
      const f = a.file
      if (!s.dataFolders.some((x) => x.id === f.folderId)) return 'Pick a folder.'
      if (!f.name.trim()) return 'Name the file.'
      if (!f.dataUrl) return 'Choose a file to upload.'
      return f.size > DATAROOM_MAX_BYTES ? 'Files must be 1 MB or smaller.' : null
    }
    case 'dataFiles/move': {
      const f = s.dataFiles.find((x) => x.id === a.id)
      if (!f) return 'File not found.'
      if (!s.dataFolders.some((x) => x.id === a.folderId)) return 'Pick a folder.'
      if (f.folderId === a.folderId) return 'The file is already in that folder.'
      return filesIn(s, a.folderId).some((x) => x.name === f.name) ? `That folder already has a file named ${f.name}.` : null
    }
    case 'dataFiles/remove':
      if (!s.dataFiles.some((x) => x.id === a.id)) return 'File not found.'
      return s.shareLinks.some((l) => l.fileIds.includes(a.id) && shareStatus(l, nowMs) === 'active') ? 'An active share link sends this file. Revoke it first.' : null
    case 'shareLinks/create': {
      const l = a.link
      if (!l.recipientName.trim()) return 'Enter who receives the link.'
      if (!/^\S+@\S+\.\S+$/.test(l.email)) return 'Enter a valid email.'
      if (!l.folderId && !l.fileIds.length) return 'Pick a folder or at least one file.'
      if (l.folderId && !s.dataFolders.some((x) => x.id === l.folderId)) return 'The folder is gone.'
      if (!/^\d{6}$/.test(l.code)) return 'The access code has 6 digits.'
      const days = (toMs(l.expiresAt) - nowMs) / DAY
      if (days <= 0) return 'Pick an expiry date in the future.'
      return days > SHARE_MAX_DAYS ? `A link can last ${SHARE_MAX_DAYS} days at most.` : null
    }
    case 'shareLinks/revoke': {
      const l = s.shareLinks.find((x) => x.id === a.id)
      if (!l) return 'Link not found.'
      const st = shareStatus(l, nowMs)
      return st === 'active' ? null : `The link is already ${st}.`
    }
    case 'shareLinks/extend': {
      const l = s.shareLinks.find((x) => x.id === a.id)
      if (!l) return 'Link not found.'
      if (l.revokedAt) return 'A revoked link cannot be extended. Send a new one.'
      const days = (toMs(a.expiresAt) - nowMs) / DAY
      if (days <= 0) return 'Pick an expiry date in the future.'
      return days > SHARE_MAX_DAYS ? `A link can last ${SHARE_MAX_DAYS} days at most.` : null
    }
    case 'shareLinks/open': {
      const l = s.shareLinks.find((x) => x.id === a.id)
      if (!l) return 'This link does not exist.'
      const st = shareStatus(l, nowMs)
      if (st === 'revoked') return 'The sender withdrew this link.'
      if (st === 'expired') return 'This link has expired. Ask the sender for a new one.'
      return failedTries(s, l.id) >= SHARE_MAX_TRIES ? 'Too many wrong codes. Ask the sender for a new link.' : null
    }
    case 'shareLinks/track': {
      const l = s.shareLinks.find((x) => x.id === a.id)
      if (!l || shareStatus(l, nowMs) !== 'active') return 'This link is no longer active.'
      if (!shareFiles(s, l).some((f) => f.id === a.fileId)) return 'This file is not part of the share.'
      return a.kind === 'downloaded' && !l.allowDownload ? 'The sender allowed viewing only.' : null
    }
  }
}

export const dataroomApply = (s: AppState, a: DataroomAction, at: string): AppState => {
  switch (a.type) {
    case 'folders/upsert':
      return { ...s, dataFolders: upsert(s.dataFolders, { ...a.folder, name: a.folder.name.trim() }) }
    case 'folders/remove':
      return { ...s, dataFolders: s.dataFolders.filter((f) => f.id !== a.id) }
    case 'dataFiles/upload': {
      const old = filesIn(s, a.file.folderId).find((f) => f.name.toLowerCase() === a.file.name.trim().toLowerCase())
      const file = { ...a.file, name: a.file.name.trim(), version: old ? old.version + 1 : 1, replacedBy: null, uploadedAt: at }
      const files = old ? patchById(s.dataFiles, old.id, (f) => ({ ...f, replacedBy: file.id })) : s.dataFiles
      return { ...s, dataFiles: [file, ...files] }
    }
    case 'dataFiles/move': {
      const ids = new Set(fileVersions(s, a.id).map((f) => f.id))
      return { ...s, dataFiles: s.dataFiles.map((f) => (ids.has(f.id) ? { ...f, folderId: a.folderId } : f)) }
    }
    case 'dataFiles/remove': {
      const ids = new Set(fileVersions(s, a.id).map((f) => f.id))
      return { ...s, dataFiles: s.dataFiles.filter((f) => !ids.has(f.id)) }
    }
    case 'shareLinks/create':
      return { ...s, shareLinks: [a.link, ...s.shareLinks], shareEvents: [event(a.link.id, 'sent', at), ...s.shareEvents] }
    case 'shareLinks/revoke':
      return { ...s, shareLinks: patchById(s.shareLinks, a.id, (l) => ({ ...l, revokedAt: at })), shareEvents: [event(a.id, 'revoked', at), ...s.shareEvents] }
    case 'shareLinks/extend':
      return { ...s, shareLinks: patchById(s.shareLinks, a.id, (l) => ({ ...l, expiresAt: a.expiresAt })) }
    case 'shareLinks/open': {
      const l = s.shareLinks.find((x) => x.id === a.id)!
      return { ...s, shareEvents: [event(a.id, shareCodeMatches(l, a.email, a.code) ? 'opened' : 'code_failed', at), ...s.shareEvents] }
    }
    case 'shareLinks/track':
      return { ...s, shareEvents: [event(a.id, a.kind, at, a.fileId), ...s.shareEvents] }
  }
}
