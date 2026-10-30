import type { AuditEntry, FieldChange } from '@artha/types'
import { newId } from './format'
import type { AppState } from './store'

type Row = { id: string } & Record<string, unknown>

/** Collections the audit log watches, with the entity name it shows. Logs (history, messages, events) are not audited. */
const COLLECTIONS = {
  listings: 'Listing',
  partners: 'Partner',
  exclusives: 'Exclusive right',
  profitShares: 'Profit share',
  inquiries: 'Inquiry',
  socialPosts: 'Social post',
  blogPosts: 'Blog post',
  users: 'User',
  roles: 'Role',
  branches: 'Branch',
  integrations: 'Integration',
  templates: 'Message template',
  notificationRules: 'Notification rule',
  apiTokens: 'API token',
  contacts: 'Contact',
  accounts: 'Account',
  stages: 'Deal stage',
  deals: 'Deal',
  quotations: 'Quotation',
  tasks: 'Task',
  targets: 'Sales target',
  segments: 'Segment',
  campaigns: 'Campaign',
  leadForms: 'Lead form',
  reports: 'Report',
  referrals: 'Referral',
  projects: 'Project',
  units: 'Unit',
  visits: 'Site visit',
  openHouses: 'Open house',
  payments: 'Payment',
  portalSyncs: 'Portal listing',
  statements: 'Commission statement',
  promotions: 'Promotion',
  sitePages: 'Website page',
  settlements: 'Settlement',
  glAccounts: 'Ledger account',
  journals: 'Journal',
  autoJournals: 'Auto-journal mapping',
  fiscalYears: 'Fiscal year',
  periods: 'Fiscal period',
  cashTransactions: 'Cash transaction',
  vendors: 'Vendor',
  bills: 'Bill',
  invoices: 'Invoice',
  budgets: 'Budget',
  departments: 'Department',
  sections: 'Section',
  positions: 'Position',
  employees: 'Employee',
  contracts: 'Employment contract',
  checklists: 'Checklist',
  shifts: 'Shift',
  holidays: 'Holiday',
  hrRequests: 'HR request',
  payComponents: 'Pay component',
  payrollRuns: 'Payroll run',
  kpis: 'KPI',
  scorecards: 'Scorecard',
  reviewCycles: 'Review cycle',
  jobOpenings: 'Job opening',
  candidates: 'Candidate',
  announcements: 'Announcement',
  recurringTasks: 'Recurring task',
  itemCategories: 'Item category',
  uoms: 'Unit',
  items: 'Item',
  warehouses: 'Warehouse',
  stockCounts: 'Stock count',
  purchaseRequests: 'Purchase request',
  purchaseOrders: 'Purchase order',
  goodsReceipts: 'Goods receipt',
  purchaseReturns: 'Purchase return',
  dataFolders: 'Dataroom folder',
  dataFiles: 'Dataroom file',
  shareLinks: 'Share link',
  vendorCredits: 'Vendor credit',
  vendorPrices: 'Vendor price',
} as const satisfies Partial<Record<keyof AppState, string>>

const SINGLETONS = { company: 'Company', appearance: 'Appearance', settings: 'Agent settings', crmSettings: 'CRM settings', financeSettings: 'Finance settings', payrollSettings: 'Payroll settings', hrSettings: 'HR settings', purchasingSettings: 'Purchasing settings' } as const

const MAX_ENTRIES = 1000

const show = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '–'
  if (Array.isArray(v)) return v.length ? v.map(show).join(', ') : '–'
  if (typeof v === 'object') return JSON.stringify(v)
  const text = String(v)
  return text.length > 120 ? `${text.slice(0, 117)}...` : text
}

const labelOf = (r: Row) => String(r.code ?? r.name ?? r.title ?? r.event ?? r.hook ?? r.id)

const diff = (before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((field) => ({ field, from: show(before[field]), to: show(after[field]) }))

/** Field-level changes between two states, one entry per record that changed. */
export function auditEntries(prev: AppState, next: AppState, by: string, action: string, at: string): AuditEntry[] {
  const out: AuditEntry[] = []
  const entry = (entity: string, entityId: string, label: string, kind: AuditEntry['kind'], changes: FieldChange[]) =>
    out.push({ id: newId('aud'), at, by, action, entity, entityId, label, kind, changes })

  for (const [key, entity] of Object.entries(COLLECTIONS) as [keyof typeof COLLECTIONS, string][]) {
    if (prev[key] === next[key]) continue
    const before = new Map((prev[key] as unknown as Row[]).map((r) => [r.id, r]))
    const after = new Map((next[key] as unknown as Row[]).map((r) => [r.id, r]))
    for (const [id, row] of after) {
      const old = before.get(id)
      if (!old) entry(entity, id, labelOf(row), 'created', [])
      else if (old !== row) {
        const changes = diff(old, row)
        if (changes.length) entry(entity, id, labelOf(row), 'updated', changes)
      }
    }
    for (const [id, row] of before) if (!after.has(id)) entry(entity, id, labelOf(row), 'deleted', [])
  }
  for (const [key, entity] of Object.entries(SINGLETONS) as [keyof typeof SINGLETONS, string][]) {
    if (prev[key] === next[key]) continue
    const changes = diff(prev[key] as unknown as Record<string, unknown>, next[key] as unknown as Record<string, unknown>)
    if (changes.length) entry(entity, key, entity, 'updated', changes)
  }
  return out
}

export const appendAudit = (log: AuditEntry[], entries: AuditEntry[]) =>
  entries.length ? [...entries, ...log].slice(0, MAX_ENTRIES) : log
