import type { Permission } from '@artha/types'
import {
  ASSET_TYPE_LABEL,
  BILL_STATUS_LABEL,
  CANDIDATE_STAGE_LABEL,
  CONTACT_KIND_LABEL,
  CONTENT_STATUS_LABEL,
  INQUIRY_STATUS_LABEL,
  INVOICE_STATUS_LABEL,
  JOURNAL_SOURCE_LABEL,
  JOURNAL_STATUS_LABEL,
  LISTING_STATUS_LABEL,
  PARTNER_KIND_LABEL,
  PO_STATUS_LABEL,
  PR_STATUS_LABEL,
  QUOTATION_STATUS_LABEL,
} from '@artha/types'
import { canSeeFolder } from './dataroom'
import { fmtDate } from './format'
import type { AppState } from './store'

export type SearchKind =
  | 'listing'
  | 'partner'
  | 'inquiry'
  | 'contact'
  | 'account'
  | 'deal'
  | 'quotation'
  | 'employee'
  | 'candidate'
  | 'opening'
  | 'vendor'
  | 'bill'
  | 'invoice'
  | 'journal'
  | 'item'
  | 'pr'
  | 'po'
  | 'folder'
  | 'file'
  | 'post'

export interface SearchHit {
  kind: SearchKind
  id: string
  title: string
  subtitle: string
  code?: string
}

/** Group heading per kind, in the order groups appear. */
export const SEARCH_KIND_LABEL: Record<SearchKind, string> = {
  listing: 'Listings',
  partner: 'Partners',
  inquiry: 'Inquiries',
  contact: 'Contacts',
  account: 'Accounts',
  deal: 'Deals',
  quotation: 'Quotations',
  employee: 'Employees',
  candidate: 'Candidates',
  opening: 'Job openings',
  vendor: 'Vendors',
  bill: 'Bills',
  invoice: 'Invoices',
  journal: 'Journals',
  item: 'Items',
  pr: 'Purchase requests',
  po: 'Purchase orders',
  folder: 'Folders',
  file: 'Files',
  post: 'Blog posts',
}

export const SEARCH_KINDS = Object.keys(SEARCH_KIND_LABEL) as SearchKind[]

/** The view permission a role needs to see hits of each kind. */
export const SEARCH_KIND_NEEDS: Record<SearchKind, Permission> = {
  listing: 'listing.view',
  partner: 'partner.view',
  inquiry: 'inquiry.view',
  contact: 'crm.view',
  account: 'crm.view',
  deal: 'deal.view',
  quotation: 'deal.view',
  employee: 'hr.view',
  candidate: 'hr.view',
  opening: 'hr.view',
  vendor: 'finance.view',
  bill: 'finance.view',
  invoice: 'finance.view',
  journal: 'finance.view',
  item: 'purchase.view',
  pr: 'purchase.view',
  po: 'purchase.view',
  folder: 'dataroom.view',
  file: 'dataroom.view',
  post: 'content.view',
}

/** Lower case without accents, so "Bálí" finds "bali". */
export const foldText = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export const queryWords = (query: string) => foldText(query).split(/\s+/).filter(Boolean)

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

/** Start offsets where `word` begins a word in `hay`; both already folded. */
function wordStarts(hay: string, word: string): number[] {
  const out: number[] = []
  for (let i = hay.indexOf(word); i !== -1; i = hay.indexOf(word, i + 1)) {
    if (!isWordChar(hay[i - 1]) || !isWordChar(word[0])) out.push(i)
  }
  return out
}

const hasWord = (hay: string, word: string) => wordStarts(hay, word).length > 0

/** Character ranges `[start, end)` in `text` that the query's words match, merged and sorted, for highlighting. */
export function matchRanges(text: string, query: string): [number, number][] {
  const words = queryWords(query)
  if (!words.length) return []
  // Fold one character at a time so folded offsets map back to the original text.
  let folded = ''
  const at: number[] = []
  for (let i = 0; i < text.length; i++) {
    const f = foldText(text[i]!)
    for (const ch of f) {
      folded += ch
      at.push(i)
    }
  }
  at.push(text.length)
  const ranges: [number, number][] = words
    .flatMap((w) => wordStarts(folded, w).map((s) => [at[s]!, at[s + w.length]!] as [number, number]))
    .sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const r of ranges) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  return merged
}

interface Doc extends SearchHit {
  /** Extra text that matches but is not shown: phone, email, tags, memo. */
  keywords: string[]
}

function docs(s: AppState, kinds: Set<SearchKind>): Doc[] {
  const out: Doc[] = []
  const want = (k: SearchKind) => kinds.has(k)
  const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]))
  const listings = byId(s.listings)
  const partners = byId(s.partners)
  const contacts = byId(s.contacts)
  const accounts = byId(s.accounts)
  const deals = byId(s.deals)
  const vendors = byId(s.vendors)
  const employees = byId(s.employees)
  const departments = byId(s.departments)
  const items = byId(s.items)
  const folders = byId(s.dataFolders)
  const name = (m: Map<string, { name: string }>, id: string | null | undefined) =>
    id ? (m.get(id)?.name ?? '') : ''
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ')

  if (want('listing'))
    for (const l of s.listings)
      out.push({
        kind: 'listing',
        id: l.id,
        code: l.code,
        title: l.title,
        subtitle: join(ASSET_TYPE_LABEL[l.type], `${l.district}, ${l.city}`, LISTING_STATUS_LABEL[l.status]),
        keywords: [l.address, l.certificate, name(partners, l.partnerId)],
      })
  if (want('partner'))
    for (const p of s.partners)
      out.push({
        kind: 'partner',
        id: p.id,
        code: p.code,
        title: p.name,
        subtitle: join(PARTNER_KIND_LABEL[p.kind], p.city),
        keywords: [p.phone, p.email],
      })
  if (want('inquiry'))
    for (const q of s.inquiries) {
      const l = q.listingId ? listings.get(q.listingId) : undefined
      out.push({
        kind: 'inquiry',
        id: q.id,
        code: q.code,
        title: q.name,
        subtitle: join(l ? `${l.code} ${l.title}` : 'General inquiry', INQUIRY_STATUS_LABEL[q.status]),
        keywords: [q.phone, q.message],
      })
    }
  if (want('contact'))
    for (const c of s.contacts)
      out.push({
        kind: 'contact',
        id: c.id,
        title: c.name,
        subtitle: join(CONTACT_KIND_LABEL[c.kind], name(accounts, c.accountId), c.city),
        keywords: [c.phone, c.email, ...c.tags],
      })
  if (want('account'))
    for (const a of s.accounts)
      out.push({
        kind: 'account',
        id: a.id,
        title: a.name,
        subtitle: join(a.industry, a.city),
        keywords: [a.phone],
      })
  if (want('deal')) {
    const stages = byId(s.stages)
    for (const d of s.deals)
      out.push({
        kind: 'deal',
        id: d.id,
        code: d.code,
        title: d.title,
        subtitle: join(name(contacts, d.contactId), name(stages, d.stageId)),
        keywords: [listings.get(d.listingId ?? '')?.code ?? ''],
      })
  }
  if (want('quotation'))
    for (const q of s.quotations) {
      const d = deals.get(q.dealId)
      out.push({
        kind: 'quotation',
        id: q.id,
        code: q.code,
        title: `${d?.title ?? 'Quotation'}, version ${q.version}`,
        subtitle: join(name(contacts, d?.contactId), QUOTATION_STATUS_LABEL[q.status]),
        keywords: [d?.code ?? '', q.notes],
      })
    }
  if (want('employee')) {
    const positions = byId(s.positions)
    for (const e of s.employees)
      out.push({
        kind: 'employee',
        id: e.id,
        code: e.code,
        title: e.name,
        subtitle: join(name(positions, e.positionId), name(departments, e.departmentId)),
        keywords: [e.email, e.phone],
      })
  }
  if (want('candidate')) {
    const openings = byId(s.jobOpenings)
    for (const c of s.candidates)
      out.push({
        kind: 'candidate',
        id: c.id,
        title: c.name,
        subtitle: join(
          c.openingId ? openings.get(c.openingId)?.title : 'Talent pool',
          CANDIDATE_STAGE_LABEL[c.stage],
        ),
        keywords: [c.email, c.phone, ...c.tags],
      })
  }
  if (want('opening'))
    for (const o of s.jobOpenings)
      out.push({
        kind: 'opening',
        id: o.id,
        code: o.code,
        title: o.title,
        subtitle: join(
          name(departments, o.departmentId),
          o.status === 'open' ? 'Open' : o.status === 'draft' ? 'Draft' : 'Closed',
        ),
        keywords: [],
      })
  if (want('vendor'))
    for (const v of s.vendors)
      out.push({
        kind: 'vendor',
        id: v.id,
        code: v.code,
        title: v.name,
        subtitle: join(v.email, v.active ? null : 'Inactive'),
        keywords: [v.taxId, v.phone],
      })
  if (want('bill'))
    for (const b of s.bills)
      out.push({
        kind: 'bill',
        id: b.id,
        code: b.code,
        title: name(vendors, b.vendorId) || 'Vendor bill',
        subtitle: join(BILL_STATUS_LABEL[b.status], `Due ${fmtDate(b.dueDate)}`),
        keywords: [b.vendorRef, b.memo],
      })
  if (want('invoice'))
    for (const i of s.invoices) {
      const customer =
        i.customerKind === 'contact' ? contacts : i.customerKind === 'account' ? accounts : partners
      out.push({
        kind: 'invoice',
        id: i.id,
        code: i.code,
        title: name(customer, i.customerId) || 'Sales invoice',
        subtitle: join(INVOICE_STATUS_LABEL[i.status], `Due ${fmtDate(i.dueDate)}`),
        keywords: [i.memo, i.taxInvoice?.number ?? ''],
      })
    }
  if (want('journal'))
    for (const j of s.journals)
      out.push({
        kind: 'journal',
        id: j.id,
        code: j.code,
        title: j.memo || 'Journal entry',
        subtitle: join(JOURNAL_SOURCE_LABEL[j.source], fmtDate(j.date), JOURNAL_STATUS_LABEL[j.status]),
        keywords: [j.ref?.label ?? ''],
      })
  if (want('item')) {
    const categories = byId(s.itemCategories)
    for (const i of s.items)
      out.push({
        kind: 'item',
        id: i.id,
        code: i.sku,
        title: i.name,
        subtitle: join(name(categories, i.categoryId), i.active ? null : 'Inactive'),
        keywords: [i.description],
      })
  }
  if (want('pr'))
    for (const r of s.purchaseRequests)
      out.push({
        kind: 'pr',
        id: r.id,
        code: r.code,
        title: r.reason || 'Purchase request',
        subtitle: join(name(employees, r.requesterId), PR_STATUS_LABEL[r.status]),
        keywords: r.lines.map((l) => name(items, l.itemId)),
      })
  if (want('po'))
    for (const o of s.purchaseOrders)
      out.push({
        kind: 'po',
        id: o.id,
        code: o.code,
        title: name(vendors, o.vendorId) || 'Purchase order',
        subtitle: join(PO_STATUS_LABEL[o.status], fmtDate(o.orderDate)),
        keywords: [o.note, ...o.lines.map((l) => name(items, l.itemId))],
      })
  if (want('folder'))
    for (const f of s.dataFolders)
      out.push({
        kind: 'folder',
        id: f.id,
        title: f.name,
        subtitle: name(folders, f.parentId) || 'Dataroom',
        keywords: [f.description],
      })
  if (want('file'))
    for (const f of s.dataFiles)
      if (!f.replacedBy)
        out.push({
          kind: 'file',
          id: f.id,
          title: f.name,
          subtitle: join(name(folders, f.folderId), `Version ${f.version}`),
          keywords: [f.note],
        })
  if (want('post'))
    for (const p of s.blogPosts)
      out.push({
        kind: 'post',
        id: p.id,
        title: p.title,
        subtitle: join(CONTENT_STATUS_LABEL[p.status], p.excerpt),
        keywords: [p.metaTitle, ...p.keywords],
      })
  return out
}

export interface SearchOptions {
  /** Only these kinds. */
  kinds?: SearchKind[]
  /** The viewer's permission check; drops kinds the role cannot open. */
  can?: (p: Permission) => boolean
  /** With `can`, folders and files follow the viewer's department access. */
  userId?: string
  limit?: number
}

/**
 * Hits ranked by: exact code match, then title (or code) starting with the query, then every word in the title,
 * then words spread over the title, subtitle and keywords. Case and accents are ignored, and every word must match.
 */
export function searchAll(s: AppState, query: string, opts: SearchOptions = {}): SearchHit[] {
  const words = queryWords(query)
  if (!words.length) return []
  const whole = words.join(' ')
  const { can, userId } = opts
  const kinds = new Set((opts.kinds ?? SEARCH_KINDS).filter((k) => !can || can(SEARCH_KIND_NEEDS[k])))
  const manage = !!can?.('dataroom.manage')
  const visibleFolder = (id: string) => !can || !userId || canSeeFolder(s, userId, id, manage)
  const fileFolder = new Map(s.dataFiles.map((f) => [f.id, f.folderId]))

  const ranked: { hit: SearchHit; rank: number }[] = []
  for (const d of docs(s, kinds)) {
    const code = foldText(d.code ?? '')
    const title = foldText(d.title)
    const hay = foldText([d.code, d.title, d.subtitle, ...d.keywords].join(' '))
    if (!words.every((w) => hasWord(hay, w))) continue
    if (d.kind === 'folder' && !visibleFolder(d.id)) continue
    if (d.kind === 'file' && !visibleFolder(fileFolder.get(d.id) ?? '')) continue
    const rank =
      code && code === whole
        ? 0
        : title.startsWith(whole) || (code && code.startsWith(whole))
          ? 1
          : words.every((w) => hasWord(title, w))
            ? 2
            : 3
    const { keywords: _, ...hit } = d
    ranked.push({ hit, rank })
  }
  ranked.sort((a, b) => a.rank - b.rank || a.hit.title.localeCompare(b.hit.title))
  const hits = ranked.map((r) => r.hit)
  return opts.limit ? hits.slice(0, opts.limit) : hits
}
