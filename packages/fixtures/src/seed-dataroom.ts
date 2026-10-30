import type { DataFile, DataFolder, ShareEvent, ShareLink } from '@artha/types'
import { at } from './seed'

const folder = (id: string, name: string, parentId: string | null, departmentIds: string[], extra: Partial<DataFolder> = {}): DataFolder => ({
  id, name, parentId, departmentIds, listingId: null, dealId: null, description: '', createdBy: 'usr-1', createdAt: at(-120), ...extra,
})

export const DATA_FOLDERS: DataFolder[] = [
  folder('fld-prop', 'Property documents', null, ['dep-mgt', 'dep-sls', 'dep-fin'], { description: 'Certificates, tax receipts and permits per listing, and closing files per deal.' }),
  folder('fld-lst-1', 'AS-0001 Fatmawati house', 'fld-prop', [], { listingId: 'lst-1', createdBy: 'usr-2', createdAt: at(-40) }),
  folder('fld-lst-5', 'AS-0005 Uluwatu villa', 'fld-prop', [], { listingId: 'lst-5', createdBy: 'usr-5', createdAt: at(-12) }),
  folder('fld-lst-7', 'AS-0007 Sentul house', 'fld-prop', [], { listingId: 'lst-7', dealId: 'del-5', createdBy: 'usr-4', createdAt: at(-33) }),
  folder('fld-del-7', 'Laras, Gading Serpong closing', 'fld-prop', [], { listingId: 'lst-10', dealId: 'del-7', description: 'Signed PPJB, AJB draft and tax receipts for the notary.', createdBy: 'usr-2', createdAt: at(-20) }),
  folder('fld-legal', 'Templates and legal', null, [], { description: 'Agreements and receipts every team uses.' }),
  folder('fld-hr', 'HR policies', null, ['dep-hrg', 'dep-mgt'], { createdBy: 'usr-10' }),
  folder('fld-hr-contracts', 'Signed employment contracts', 'fld-hr', ['dep-hrg'], { createdBy: 'usr-10' }),
  folder('fld-fin', 'Finance', null, ['dep-fin', 'dep-mgt'], { createdBy: 'usr-7' }),
]

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const file = (id: string, folderId: string, name: string, kb: number, by: string, days: number, extra: Partial<DataFile> = {}): DataFile => ({
  id, folderId, name, mime: name.endsWith('.docx') ? DOCX : name.endsWith('.jpg') ? 'image/jpeg' : PDF, size: kb * 1024, dataUrl: null, version: 1, replacedBy: null, note: '', uploadedBy: by, uploadedAt: at(days), ...extra,
})

export const DATA_FILES: DataFile[] = [
  file('dfl-1', 'fld-lst-1', 'SHM certificate 1204.pdf', 820, 'usr-2', -40, { note: 'Scan of the original, checked at BPN on 21 September.' }),
  file('dfl-2', 'fld-lst-1', 'PBB 2026 receipt.pdf', 140, 'usr-2', -38),
  file('dfl-3', 'fld-lst-1', 'PBG building approval.pdf', 610, 'usr-2', -38),
  file('dfl-4', 'fld-lst-1', 'Floor plan.pdf', 380, 'usr-2', -36, { replacedBy: 'dfl-5' }),
  file('dfl-5', 'fld-lst-1', 'Floor plan.pdf', 402, 'usr-2', -9, { version: 2, note: 'Owner added the rooftop room.' }),
  file('dfl-6', 'fld-lst-5', 'SHM certificate 88.pdf', 760, 'usr-5', -12),
  file('dfl-7', 'fld-lst-5', 'Pondok wisata licence.pdf', 300, 'usr-5', -11),
  file('dfl-8', 'fld-lst-5', 'Site plan.pdf', 540, 'usr-5', -11),
  file('dfl-9', 'fld-lst-7', 'SHM certificate 3310.pdf', 700, 'usr-4', -33),
  file('dfl-10', 'fld-lst-7', 'PBB 2026 receipt.pdf', 120, 'usr-4', -33),
  file('dfl-11', 'fld-lst-7', 'BTN appraisal request.pdf', 210, 'usr-4', -3),
  file('dfl-12', 'fld-del-7', 'PPJB signed.pdf', 960, 'usr-2', -14),
  file('dfl-13', 'fld-del-7', 'AJB draft.docx', 88, 'usr-2', -8),
  file('dfl-14', 'fld-del-7', 'BPHTB receipt.pdf', 160, 'usr-2', -7),
  file('dfl-15', 'fld-del-7', 'KPR approval letter.pdf', 230, 'usr-2', -10),
  file('dfl-16', 'fld-legal', 'Exclusive agency agreement.docx', 64, 'usr-1', -90),
  file('dfl-17', 'fld-legal', 'PPJB template.docx', 72, 'usr-1', -90),
  file('dfl-18', 'fld-legal', 'Booking fee receipt.docx', 40, 'usr-1', -60),
  file('dfl-19', 'fld-hr', 'Employee handbook 2026.pdf', 990, 'usr-10', -70),
  file('dfl-20', 'fld-hr', 'Leave and overtime policy.pdf', 260, 'usr-10', -70),
  file('dfl-21', 'fld-hr-contracts', 'Contract Sinta Maharani.pdf', 330, 'usr-10', -4),
  file('dfl-22', 'fld-fin', 'Audit report 2025.pdf', 1010, 'usr-7', -150),
  file('dfl-23', 'fld-fin', 'Corporate tax return 2025.pdf', 680, 'usr-7', -180),
]

const link = (id: string, extra: Omit<ShareLink, 'id' | 'fileIds' | 'message' | 'allowDownload' | 'revokedAt'> & Partial<ShareLink>): ShareLink => ({
  id, fileIds: [], message: '', allowDownload: true, revokedAt: null, ...extra,
})

/** Demo codes are visible on each link's page in the console; in production they go by email. */
export const SHARE_LINKS: ShareLink[] = [
  link('shr-1', { token: 'k3v9notaris', folderId: 'fld-del-7', recipientName: 'Notaris Dewi Anggraini, S.H.', email: 'notaris.dewi@gmail.com', purpose: 'notary', code: '482913', message: 'Files for the AJB signing on 6 November.', expiresAt: at(10), createdBy: 'usr-2', createdAt: at(-7) }),
  link('shr-2', { token: 'p7m2sentul', folderId: 'fld-lst-7', recipientName: 'Siti Rahmawati', email: 'siti.rahma@gmail.com', purpose: 'buyer', code: '615204', allowDownload: false, expiresAt: at(20), createdBy: 'usr-4', createdAt: at(-3) }),
  link('shr-3', { token: 'b1q8btnappr', folderId: null, fileIds: ['dfl-9'], recipientName: 'BTN appraisal desk', email: 'appraisal.bsd@btn.co.id', purpose: 'bank', code: '903377', expiresAt: at(-2), createdBy: 'usr-4', createdAt: at(-16) }),
  link('shr-4', { token: 'r4x6fatmawa', folderId: 'fld-lst-1', recipientName: 'Rizky Pratama', email: 'rizky.p@gmail.com', purpose: 'buyer', code: '220871', expiresAt: at(25), revokedAt: at(-1), createdBy: 'usr-2', createdAt: at(-5) }),
]

const ev = (n: number, linkId: string, kind: ShareEvent['kind'], days: number, fileId: string | null = null): ShareEvent => ({ id: `she-${n}`, linkId, kind, fileId, at: at(days) })

export const SHARE_EVENTS: ShareEvent[] = [
  ev(1, 'shr-1', 'sent', -7),
  ev(2, 'shr-1', 'opened', -6.8),
  ev(3, 'shr-1', 'viewed', -6.8, 'dfl-12'),
  ev(4, 'shr-1', 'downloaded', -6.7, 'dfl-12'),
  ev(5, 'shr-1', 'viewed', -2, 'dfl-13'),
  ev(6, 'shr-1', 'downloaded', -2, 'dfl-14'),
  ev(7, 'shr-2', 'sent', -3),
  ev(8, 'shr-2', 'code_failed', -2.6),
  ev(9, 'shr-2', 'opened', -2.5),
  ev(10, 'shr-2', 'viewed', -2.5, 'dfl-9'),
  ev(11, 'shr-3', 'sent', -16),
  ev(12, 'shr-3', 'opened', -15),
  ev(13, 'shr-3', 'downloaded', -15, 'dfl-9'),
  ev(14, 'shr-4', 'sent', -5),
  ev(15, 'shr-4', 'revoked', -1),
].sort((a, b) => b.at.localeCompare(a.at))
