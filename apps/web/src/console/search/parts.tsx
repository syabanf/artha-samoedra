import { matchRanges, searchAll, type SearchHit, type SearchKind } from '@artha/fixtures'
import type { Permission } from '@artha/types'
import {
  Building,
  Building2,
  BriefcaseBusiness,
  ClipboardList,
  Columns3,
  Contact,
  FileInput,
  FileOutput,
  FileText,
  Folder,
  Handshake,
  MessagesSquare,
  Newspaper,
  NotebookPen,
  Package,
  ScrollText,
  ShoppingCart,
  Truck,
  UserPlus,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { NS, readJson, writeJson } from '../../lib/storage'
import { useAppState } from '../../state/store'

export const KIND_ICON: Record<SearchKind, LucideIcon> = {
  listing: Building2,
  partner: Handshake,
  inquiry: MessagesSquare,
  contact: Contact,
  account: Building,
  deal: Columns3,
  quotation: ScrollText,
  employee: UserRound,
  candidate: UserPlus,
  opening: BriefcaseBusiness,
  vendor: Truck,
  bill: FileInput,
  invoice: FileOutput,
  journal: NotebookPen,
  item: Package,
  pr: ClipboardList,
  po: ShoppingCart,
  folder: Folder,
  file: FileText,
  post: Newspaper,
}

export function hitPath(hit: SearchHit): string {
  switch (hit.kind) {
    case 'listing':
      return paths.listing(hit.id)
    case 'partner':
      return paths.partner(hit.id)
    case 'inquiry':
      return paths.inquiry(hit.id)
    case 'contact':
      return paths.contact(hit.id)
    case 'account':
      return paths.account(hit.id)
    case 'deal':
      return paths.deal(hit.id)
    case 'quotation':
      return paths.quotation(hit.id)
    case 'employee':
      return paths.employee(hit.id)
    case 'candidate':
      return paths.candidate(hit.id)
    case 'opening':
      return paths.opening(hit.id)
    // Vendors have no detail page; the list opens filtered to the one vendor.
    case 'vendor':
      return `${paths.vendors}?q=${encodeURIComponent(hit.code ?? hit.title)}`
    case 'bill':
      return paths.bill(hit.id)
    case 'invoice':
      return paths.invoice(hit.id)
    case 'journal':
      return paths.journal(hit.id)
    case 'item':
      return paths.item(hit.id)
    case 'pr':
      return paths.pr(hit.id)
    case 'po':
      return paths.po(hit.id)
    case 'folder':
      return paths.dataFolder(hit.id)
    case 'file':
      return paths.dataFile(hit.id)
    case 'post':
      return paths.blogEdit(hit.id)
  }
}

/** Hits the signed-in user may open: kinds by permission, dataroom items by department. */
export function useSearchHits(query: string) {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  // `can` reads the same state and user, so they are the real dependencies.
  return useMemo(() => searchAll(state, query, { can, userId: user.id }), [state, query, user.id])
}

export function groupHits(hits: SearchHit[]) {
  const byKind = new Map<SearchKind, SearchHit[]>()
  for (const h of hits) byKind.set(h.kind, [...(byKind.get(h.kind) ?? []), h])
  return byKind
}

/** Pages under each section that the palette can jump to. The section tabs live in `sections.tsx` and are not exported. */
export const SECTION_PAGES: { to: string; label: string; section: string; needs?: Permission }[] = [
  { to: paths.pipeline, label: 'Pipeline', section: 'Sales', needs: 'deal.view' },
  { to: paths.deals, label: 'Deals', section: 'Sales', needs: 'deal.view' },
  { to: paths.quotations, label: 'Quotations', section: 'Sales', needs: 'deal.view' },
  { to: paths.followUps, label: 'Follow-ups', section: 'Sales', needs: 'deal.view' },
  { to: paths.forecast, label: 'Forecast', section: 'Sales', needs: 'deal.view' },
  { to: paths.contacts, label: 'Contacts', section: 'CRM', needs: 'crm.view' },
  { to: paths.accounts, label: 'Accounts', section: 'CRM', needs: 'crm.view' },
  { to: paths.inbox, label: 'Inbox', section: 'CRM', needs: 'crm.view' },
  { to: paths.campaigns, label: 'Campaigns', section: 'CRM', needs: 'campaign.manage' },
  { to: paths.projects, label: 'Projects', section: 'Operations', needs: 'ops.view' },
  { to: paths.visits, label: 'Site visits', section: 'Operations', needs: 'ops.view' },
  { to: paths.payments, label: 'Payments', section: 'Operations', needs: 'ops.view' },
  { to: paths.commissions, label: 'Commissions', section: 'Operations', needs: 'ops.view' },
  { to: paths.journals, label: 'Journals', section: 'Finance', needs: 'finance.view' },
  { to: paths.glAccounts, label: 'Chart of accounts', section: 'Finance', needs: 'finance.view' },
  { to: paths.cash, label: 'Cash and bank', section: 'Finance', needs: 'finance.view' },
  { to: paths.bills, label: 'Payables', section: 'Finance', needs: 'finance.view' },
  { to: paths.vendors, label: 'Vendors', section: 'Finance', needs: 'finance.view' },
  { to: paths.invoices, label: 'Receivables', section: 'Finance', needs: 'finance.view' },
  { to: paths.financeReports, label: 'Reports', section: 'Finance', needs: 'finance.view' },
  { to: paths.employees, label: 'Employees', section: 'People', needs: 'hr.view' },
  { to: paths.attendance, label: 'Attendance', section: 'People', needs: 'hr.view' },
  { to: paths.hrRequests, label: 'Requests', section: 'People', needs: 'hr.view' },
  { to: paths.payroll, label: 'Payroll', section: 'People', needs: 'payroll.manage' },
  { to: paths.openings, label: 'Recruitment', section: 'People', needs: 'hr.view' },
  { to: paths.prs, label: 'Purchase requests', section: 'Purchasing', needs: 'purchase.view' },
  { to: paths.pos, label: 'Purchase orders', section: 'Purchasing', needs: 'purchase.view' },
  { to: paths.suppliers, label: 'Suppliers', section: 'Purchasing', needs: 'purchase.view' },
  { to: paths.stock, label: 'Stock', section: 'Purchasing', needs: 'purchase.view' },
  { to: paths.items, label: 'Items', section: 'Purchasing', needs: 'purchase.view' },
  { to: paths.meAttendance, label: 'My attendance', section: 'My space' },
  { to: paths.meRequests, label: 'My requests', section: 'My space' },
  { to: paths.mePayslips, label: 'My payslips', section: 'My space' },
  { to: paths.shareLinks, label: 'Share links', section: 'Dataroom', needs: 'dataroom.share' },
  { to: paths.guide, label: 'How to use', section: 'Help' },
]

const RECENT_MAX = 5
const recentKey = (userId: string) => `${NS}.search.recent.${userId}`

export const readRecent = (userId: string) => readJson<string[]>(recentKey(userId)) ?? []

export function rememberSearch(userId: string, query: string) {
  const q = query.trim()
  if (!q) return
  writeJson(
    recentKey(userId),
    [q, ...readRecent(userId).filter((r) => r.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX),
  )
}

export function clearRecent(userId: string) {
  writeJson(recentKey(userId), [])
}

/** The text with the query's words marked. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = matchRanges(text, query)
  if (!ranges.length) return <>{text}</>
  const out: ReactNode[] = []
  let from = 0
  for (const [start, end] of ranges) {
    if (start > from) out.push(text.slice(from, start))
    out.push(
      <mark key={start} className="rounded-sm bg-accent-soft px-px text-foreground">
        {text.slice(start, end)}
      </mark>,
    )
    from = end
  }
  if (from < text.length) out.push(text.slice(from))
  return <>{out}</>
}
