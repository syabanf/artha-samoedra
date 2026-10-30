import type {
  ItemCategory,
  Uom,
  Item,
  Warehouse,
  StockMove,
  StockCount,
  PurchaseRequest,
  PurchaseOrder,
  GoodsReceipt,
  PurchaseReturn,
  VendorCredit,
  VendorPrice,
  PurchasingSettings,
  DataFolder,
  DataFile,
  ShareLink,
  ShareEvent,
  Announcement,
  Attendance,
  Candidate,
  Checklist,
  ChecklistTemplate,
  Department,
  Employee,
  EmploymentContract,
  Holiday,
  HrRequest,
  HrSettings,
  JobOpening,
  KpiDefinition,
  LogbookEntry,
  PayComponent,
  PayrollRun,
  PayrollSettings,
  Position,
  PsychTest,
  RecurringTask,
  Review,
  ReviewCycle,
  ScheduleOverride,
  Scorecard,
  Section,
  Shift,
  AutoJournalMapping,
  Bill,
  Budget,
  CashTransaction,
  FinanceSettings,
  FiscalPeriod,
  FiscalYear,
  GlAccount,
  Invoice,
  JournalEntry,
  Reconciliation,
  Vendor,
  AiAgent,
  AiCall,
  AiMemory,
  AiSettings,
  AiTool,
  OutboxItem,
  PromptVersion,
  Settlement,
  CommissionStatement,
  OpenHouse,
  Payment,
  PortalSync,
  Project,
  Promotion,
  SavedProperty,
  SitePage,
  Unit,
  Visit,
  Account,
  Activity,
  Campaign,
  Contact,
  Conversation,
  CrmTask,
  Deal,
  DealStage,
  LeadForm,
  Quotation,
  Referral,
  SalesTarget,
  SavedReport,
  Segment,
  WorkflowRule,
  AgentEvent,
  ApiToken,
  Appearance,
  AuditEntry,
  Branch,
  Company,
  Integration,
  MessageLog,
  MessageTemplate,
  NotificationRule,
  RoleDef,
  User,
  AgentEventKind,
  BlogPost,
  ExclusiveRight,
  HistoryEntry,
  Inquiry,
  InquiryStatus,
  Listing,
  ListingStatus,
  Partner,
  ProfitShare,
  Settings,
  SocialPost,
} from '@artha/types'
import { LISTING_STATUS_LABEL, INQUIRY_STATUS_LABEL } from '@artha/types'
import { nowMs } from './clock'
import { crmApply, crmBlocker, onInquiryCreated, type CrmAction, type CrmSettings } from './crm'
import { nextCode, newId, slugify } from './format'
import { appendAudit, auditEntries } from './audit'
import { iamApply, iamBlocker, type IamAction } from './iam'
import { aiApply, aiBlocker, type AiAction } from './gateway'
import { dispatchNotifications, notifyApply, notifyBlocker, type NotifyAction } from './notify'
import { contentApply, contentBlocker, type ContentAction } from './content'
import { endRunningExclusives, exclusiveActionBlocker, exclusiveApply, type ExclusiveAction } from './exclusives'
import { defaultShare, settleOnClose, shareActionBlocker, shareApply, type ShareAction } from './sharing'
import { OPS_PREFIXES, opsApply, opsBlocker, removeFromPortals, type OpsAction } from './ops'
import { financeApply, financeBlocker, isFinanceAction, postAutoJournals, type FinanceAction } from './finance'
import { isPurchasingAction, purchasingApply, purchasingBlocker, type PurchasingAction } from './purchasing'
import { dataroomApply, dataroomBlocker, isDataroomAction, type DataroomAction } from './dataroom'
import { hrApply, hrBlocker, isHrAction, type HrAction } from './hr'
import { patchById } from './rows'
import * as seed from './seed'
import * as crmSeed from './seed-crm'
import * as opsSeed from './seed-ops'
import * as iamSeed from './seed-iam'
import * as sharingSeed from './seed-sharing'
import * as contentSeed from './seed-content'
import * as aiSeed from './seed-ai'
import * as notifySeed from './seed-notify'
import * as financeSeed from './seed-finance'
import * as hrSeed from './seed-hr'
import * as purchSeed from './seed-purchasing'
import * as roomSeed from './seed-dataroom'

export interface AppState {
  listings: Listing[]
  partners: Partner[]
  exclusives: ExclusiveRight[]
  profitShares: ProfitShare[]
  inquiries: Inquiry[]
  socialPosts: SocialPost[]
  blogPosts: BlogPost[]
  agentEvents: AgentEvent[]
  history: HistoryEntry[]
  settings: Settings
  users: User[]
  roles: RoleDef[]
  branches: Branch[]
  company: Company
  appearance: Appearance
  integrations: Integration[]
  templates: MessageTemplate[]
  messages: MessageLog[]
  apiTokens: ApiToken[]
  notificationRules: NotificationRule[]
  audit: AuditEntry[]
  contacts: Contact[]
  accounts: Account[]
  stages: DealStage[]
  deals: Deal[]
  quotations: Quotation[]
  tasks: CrmTask[]
  activities: Activity[]
  targets: SalesTarget[]
  conversations: Conversation[]
  segments: Segment[]
  campaigns: Campaign[]
  leadForms: LeadForm[]
  workflows: WorkflowRule[]
  reports: SavedReport[]
  referrals: Referral[]
  crmSettings: CrmSettings
  projects: Project[]
  units: Unit[]
  visits: Visit[]
  openHouses: OpenHouse[]
  payments: Payment[]
  portalSyncs: PortalSync[]
  statements: CommissionStatement[]
  promotions: Promotion[]
  sitePages: SitePage[]
  savedProperties: SavedProperty[]
  aiAgents: AiAgent[]
  aiPrompts: PromptVersion[]
  aiTools: AiTool[]
  aiCalls: AiCall[]
  aiMemory: AiMemory[]
  aiSettings: AiSettings
  outbox: OutboxItem[]
  settlements: Settlement[]
  glAccounts: GlAccount[]
  journals: JournalEntry[]
  autoJournals: AutoJournalMapping[]
  fiscalYears: FiscalYear[]
  periods: FiscalPeriod[]
  cashTransactions: CashTransaction[]
  reconciliations: Reconciliation[]
  vendors: Vendor[]
  bills: Bill[]
  invoices: Invoice[]
  budgets: Budget[]
  financeSettings: FinanceSettings
  departments: Department[]
  sections: Section[]
  positions: Position[]
  employees: Employee[]
  contracts: EmploymentContract[]
  checklistTemplates: ChecklistTemplate[]
  checklists: Checklist[]
  shifts: Shift[]
  scheduleOverrides: ScheduleOverride[]
  holidays: Holiday[]
  attendance: Attendance[]
  hrRequests: HrRequest[]
  payComponents: PayComponent[]
  payrollRuns: PayrollRun[]
  kpis: KpiDefinition[]
  scorecards: Scorecard[]
  reviewCycles: ReviewCycle[]
  reviews: Review[]
  psychTests: PsychTest[]
  jobOpenings: JobOpening[]
  candidates: Candidate[]
  announcements: Announcement[]
  logbook: LogbookEntry[]
  recurringTasks: RecurringTask[]
  payrollSettings: PayrollSettings
  hrSettings: HrSettings
  itemCategories: ItemCategory[]
  uoms: Uom[]
  items: Item[]
  warehouses: Warehouse[]
  stockMoves: StockMove[]
  stockCounts: StockCount[]
  purchaseRequests: PurchaseRequest[]
  purchaseOrders: PurchaseOrder[]
  goodsReceipts: GoodsReceipt[]
  purchaseReturns: PurchaseReturn[]
  vendorCredits: VendorCredit[]
  vendorPrices: VendorPrice[]
  purchasingSettings: PurchasingSettings
  dataFolders: DataFolder[]
  dataFiles: DataFile[]
  shareLinks: ShareLink[]
  shareEvents: ShareEvent[]
}

export const seedState = (): AppState =>
  structuredClone({
    listings: seed.LISTINGS,
    partners: seed.PARTNERS,
    exclusives: seed.EXCLUSIVES,
    profitShares: seed.PROFIT_SHARES,
    inquiries: seed.INQUIRIES,
    socialPosts: [...seed.SOCIAL_POSTS, ...contentSeed.SOCIAL_POSTS],
    blogPosts: [...seed.BLOG_POSTS, ...contentSeed.BLOG_POSTS],
    agentEvents: seed.AGENT_EVENTS,
    history: [],
    settings: seed.SETTINGS,
    users: iamSeed.USERS,
    roles: iamSeed.ROLES,
    branches: iamSeed.BRANCHES,
    company: iamSeed.COMPANY,
    appearance: iamSeed.APPEARANCE,
    integrations: [...iamSeed.INTEGRATIONS, contentSeed.TIKTOK_INTEGRATION],
    templates: iamSeed.TEMPLATES,
    messages: iamSeed.MESSAGES,
    apiTokens: iamSeed.API_TOKENS,
    notificationRules: notifySeed.NOTIFICATION_RULES,
    audit: [],
    contacts: crmSeed.CONTACTS,
    accounts: crmSeed.ACCOUNTS,
    stages: crmSeed.STAGES,
    deals: crmSeed.DEALS,
    quotations: crmSeed.QUOTATIONS,
    tasks: crmSeed.TASKS,
    activities: crmSeed.ACTIVITIES,
    targets: crmSeed.TARGETS,
    conversations: crmSeed.CONVERSATIONS,
    segments: crmSeed.SEGMENTS,
    campaigns: crmSeed.CAMPAIGNS,
    leadForms: crmSeed.LEAD_FORMS,
    workflows: crmSeed.WORKFLOWS,
    reports: crmSeed.REPORTS,
    referrals: crmSeed.REFERRALS,
    crmSettings: { lostReasons: crmSeed.LOST_REASONS, customFields: crmSeed.CUSTOM_FIELDS },
    projects: opsSeed.PROJECTS,
    units: opsSeed.UNITS,
    visits: opsSeed.VISITS,
    openHouses: opsSeed.OPEN_HOUSES,
    payments: opsSeed.PAYMENTS,
    portalSyncs: opsSeed.PORTAL_SYNCS,
    statements: [],
    promotions: opsSeed.PROMOTIONS,
    sitePages: opsSeed.SITE_PAGES,
    savedProperties: opsSeed.SAVED_PROPERTIES,
    aiAgents: aiSeed.AI_AGENTS,
    aiPrompts: aiSeed.AI_PROMPTS,
    aiTools: aiSeed.AI_TOOLS,
    aiCalls: aiSeed.AI_CALLS,
    aiMemory: aiSeed.AI_MEMORY,
    aiSettings: aiSeed.AI_SETTINGS,
    outbox: notifySeed.OUTBOX,
    settlements: sharingSeed.SETTLEMENTS,
    glAccounts: financeSeed.GL_ACCOUNTS,
    journals: financeSeed.JOURNALS,
    autoJournals: financeSeed.AUTO_JOURNALS,
    fiscalYears: financeSeed.FISCAL_YEARS,
    periods: financeSeed.PERIODS,
    cashTransactions: financeSeed.CASH_TRANSACTIONS,
    reconciliations: financeSeed.RECONCILIATIONS,
    vendors: [...financeSeed.VENDORS, ...purchSeed.SUPPLIERS],
    bills: financeSeed.BILLS,
    invoices: financeSeed.INVOICES,
    budgets: financeSeed.BUDGETS,
    financeSettings: financeSeed.FINANCE_SETTINGS,
    departments: hrSeed.DEPARTMENTS,
    sections: hrSeed.SECTIONS,
    positions: hrSeed.POSITIONS,
    employees: hrSeed.EMPLOYEES,
    contracts: hrSeed.CONTRACTS,
    checklistTemplates: hrSeed.CHECKLIST_TEMPLATES,
    checklists: hrSeed.CHECKLISTS,
    shifts: hrSeed.SHIFTS,
    scheduleOverrides: [],
    holidays: hrSeed.HOLIDAYS,
    attendance: hrSeed.ATTENDANCE,
    hrRequests: hrSeed.HR_REQUESTS,
    payComponents: hrSeed.PAY_COMPONENTS,
    payrollRuns: hrSeed.PAYROLL_RUNS,
    kpis: hrSeed.KPIS,
    scorecards: hrSeed.SCORECARDS,
    reviewCycles: hrSeed.REVIEW_CYCLES,
    reviews: hrSeed.REVIEWS,
    psychTests: hrSeed.PSYCH_TESTS,
    jobOpenings: hrSeed.JOB_OPENINGS,
    candidates: hrSeed.CANDIDATES,
    announcements: hrSeed.ANNOUNCEMENTS,
    logbook: hrSeed.LOGBOOK,
    recurringTasks: hrSeed.RECURRING_TASKS,
    payrollSettings: hrSeed.PAYROLL_SETTINGS,
    hrSettings: hrSeed.HR_SETTINGS,
    itemCategories: purchSeed.ITEM_CATEGORIES,
    uoms: purchSeed.UOMS,
    items: purchSeed.ITEMS,
    warehouses: purchSeed.WAREHOUSES,
    stockMoves: purchSeed.STOCK_MOVES,
    stockCounts: purchSeed.STOCK_COUNTS,
    purchaseRequests: purchSeed.PURCHASE_REQUESTS,
    purchaseOrders: purchSeed.PURCHASE_ORDERS,
    goodsReceipts: purchSeed.GOODS_RECEIPTS,
    purchaseReturns: purchSeed.PURCHASE_RETURNS,
    vendorCredits: purchSeed.VENDOR_CREDITS,
    vendorPrices: purchSeed.VENDOR_PRICES,
    purchasingSettings: purchSeed.PURCHASING_SETTINGS,
    dataFolders: roomSeed.DATA_FOLDERS,
    dataFiles: roomSeed.DATA_FILES,
    shareLinks: roomSeed.SHARE_LINKS,
    shareEvents: roomSeed.SHARE_EVENTS,
  })

export type AppAction =
  | { type: 'listings/create'; listing: Listing }
  | { type: 'listings/update'; id: string; patch: Partial<Omit<Listing, 'id' | 'code' | 'status'>> }
  | { type: 'listings/approve'; id: string }
  | { type: 'listings/setStatus'; id: string; status: Extract<ListingStatus, 'active' | 'reserved'> }
  | { type: 'listings/markSold'; id: string; soldPrice: number }
  | { type: 'listings/delist'; id: string; reason: string }
  | { type: 'partners/create'; partner: Partner }
  | { type: 'partners/update'; id: string; patch: Partial<Omit<Partner, 'id' | 'code'>> }
  | { type: 'inquiries/create'; inquiry: Inquiry }
  | { type: 'inquiries/setStatus'; id: string; status: InquiryStatus }
  | { type: 'inquiries/assign'; id: string; ownerId: string }
  | { type: 'settings/update'; patch: Partial<Settings> }
  | IamAction
  | CrmAction
  | OpsAction
  | ExclusiveAction
  | ShareAction
  | ContentAction
  | AiAction
  | NotifyAction
  | FinanceAction
  | HrAction
  | PurchasingAction
  | DataroomAction

const CRM_PREFIXES = ['contacts/', 'accounts/', 'deals/', 'quotations/', 'tasks/', 'activities/', 'targets/', 'stages/', 'crmSettings/', 'conversations/', 'segments/', 'campaigns/', 'forms/', 'workflows/', 'reports/', 'referrals/']
const isCrm = (a: AppAction): a is CrmAction => CRM_PREFIXES.some((p) => a.type.startsWith(p))
const isOps = (a: AppAction): a is OpsAction => OPS_PREFIXES.some((p) => a.type.startsWith(p))
const isExclusive = (a: AppAction): a is ExclusiveAction => a.type.startsWith('exclusives/')
const isShare = (a: AppAction): a is ShareAction => a.type.startsWith('profitShares/') || a.type.startsWith('settlements/')
const isAi = (a: AppAction): a is AiAction => a.type.startsWith('ai/')
const isNotify = (a: AppAction): a is NotifyAction => a.type.startsWith('outbox/')
const isContent = (a: AppAction): a is ContentAction => a.type.startsWith('social/') || a.type.startsWith('blog/')

/** `by` is a user id, or 'jessy' for work the agent does on its own. */
export interface Envelope {
  action: AppAction
  meta: { by: string; at: string }
}

export const JESSY = 'jessy'

// ---- blockers: one sentence the reducer refuses with and the UI shows beside the action ----

export const approveBlocker = (l: Listing) => (l.status === 'review' ? null : 'This listing has already been reviewed.')

export const soldBlocker = (l: Listing) =>
  l.status === 'active' || l.status === 'reserved' ? null : `The listing is ${LISTING_STATUS_LABEL[l.status].toLowerCase()}.`

export const delistBlocker = (l: Listing) => {
  if (l.status === 'sold') return 'The property is sold and cannot be delisted.'
  if (l.status === 'delisted') return 'The listing is already delisted.'
  if (l.status === 'reserved') return 'A buyer has reserved this property. Cancel the reservation first.'
  return null
}



// ---- builders shared by dialogs and Jessy ----

export type ListingDraft = Omit<
  Listing,
  'id' | 'code' | 'slug' | 'createdAt' | 'updatedAt' | 'soldPrice' | 'soldAt' | 'delistReason'
>

export const buildListing = (state: AppState, draft: ListingDraft, at: string): Listing => {
  const code = nextCode(
    state.listings.map((l) => l.code),
    'AS-',
    4,
  )
  return {
    ...draft,
    id: newId('lst'),
    code,
    slug: `${slugify(draft.title)}-${code.toLowerCase()}`,
    createdAt: at,
    updatedAt: at,
    soldPrice: null,
    soldAt: null,
    delistReason: null,
  }
}

export const buildPartner = (state: AppState, p: Omit<Partner, 'id' | 'code' | 'joinedAt'>, at: string): Partner => ({
  ...p,
  id: newId('ptn'),
  code: nextCode(
    state.partners.map((x) => x.code),
    'MT-',
    3,
  ),
  joinedAt: at,
})

export const buildInquiry = (
  state: AppState,
  i: Omit<Inquiry, 'id' | 'code' | 'createdAt' | 'updatedAt' | 'status' | 'ownerId'>,
  at: string,
): Inquiry => ({
  ...i,
  id: newId('inq'),
  code: nextCode(
    state.inquiries.map((x) => x.code),
    'INQ-26-',
    4,
  ),
  status: 'new',
  ownerId: null,
  createdAt: at,
  updatedAt: at,
})


// ---- reducer ----

const listingCode = (s: AppState, id: string) => s.listings.find((l) => l.id === id)?.code ?? id

/** What the reducer refuses, as the same sentence the UI shows. */
export const blockerFor = (s: AppState, a: AppAction): string | null => {
  const listing = 'id' in a && a.type.startsWith('listings/') ? s.listings.find((l) => l.id === a.id) : undefined
  switch (a.type) {
    case 'listings/approve':
      return listing ? approveBlocker(listing) : 'Listing not found.'
    case 'listings/markSold':
      return listing ? soldBlocker(listing) : 'Listing not found.'
    case 'listings/delist':
      return listing ? delistBlocker(listing) : 'Listing not found.'
    default:
      if (isFinanceAction(a)) return financeBlocker(s, a)
      if (isHrAction(a)) return hrBlocker(s, a, nowMs())
      if (isPurchasingAction(a)) return purchasingBlocker(s, a)
      if (isDataroomAction(a)) return dataroomBlocker(s, a, nowMs())
      if (isAi(a)) return aiBlocker(s, a)
      if (isNotify(a)) return notifyBlocker(s, a)
      if (isExclusive(a)) return exclusiveActionBlocker(s, a)
      if (isShare(a)) return shareActionBlocker(s, a)
      if (isContent(a)) return contentBlocker(s, a)
      return isCrm(a) ? crmBlocker(s, a, nowMs()) : isOps(a) ? opsBlocker(s, a, nowMs()) : iamBlocker(s, a as IamAction)
  }
}

const describe = (s: AppState, a: AppAction): { ref: string; text: string } | null => {
  switch (a.type) {
    case 'listings/create':
      return { ref: a.listing.id, text: `Listing ${a.listing.code} created` }
    case 'listings/approve':
      return { ref: a.id, text: 'Listing approved and published on the website' }
    case 'listings/setStatus':
      return { ref: a.id, text: `Status changed to ${LISTING_STATUS_LABEL[a.status]}` }
    case 'listings/markSold':
      return { ref: a.id, text: 'Marked as sold' }
    case 'listings/delist':
      return { ref: a.id, text: `Delisted: ${a.reason}` }
    case 'listings/update':
      return { ref: a.id, text: 'Listing details updated' }
    case 'inquiries/setStatus':
      return { ref: a.id, text: `Inquiry moved to ${INQUIRY_STATUS_LABEL[a.status]}` }
    case 'exclusives/upsert':
      return { ref: a.exclusive.listingId, text: 'Exclusive rights saved' }
    case 'exclusives/extend': {
      const e = s.exclusives.find((x) => x.id === a.id)
      return e ? { ref: e.listingId, text: `Exclusive rights extended by ${a.days} days` } : null
    }
    case 'exclusives/end': {
      const e = s.exclusives.find((x) => x.id === a.id)
      return e ? { ref: e.listingId, text: 'Exclusive rights ended' } : null
    }
    case 'profitShares/upsert':
      return { ref: a.share.listingId, text: 'Profit-sharing scheme saved' }
    default:
      return null
  }
}

/** Events Jessy records when it acts on its own (meta.by === JESSY). */
const agentEvent = (s: AppState, a: AppAction): [AgentEventKind, string, string | null] | null => {
  switch (a.type) {
    case 'inquiries/create':
      return [
        'inquiry',
        `Logged an inquiry from ${a.inquiry.name}${a.inquiry.listingId ? ` for ${listingCode(s, a.inquiry.listingId)}` : ''}.`,
        a.inquiry.id,
      ]
    case 'listings/create':
      return ['listing', `Received new listing ${a.listing.code} through the partner chat.`, a.listing.id]
    case 'listings/delist':
      return ['delisting', `Delisted ${listingCode(s, a.id)} at the partner's request: ${a.reason}`, a.id]
    case 'exclusives/sweep':
      return [
        'reminder',
        `Reminded the team about ${a.ids.length} exclusive rights coming due: ${a.ids
          .map((id) => listingCode(s, s.exclusives.find((e) => e.id === id)?.listingId ?? ''))
          .join(', ')}.`,
        null,
      ]
    case 'social/upsert':
      return ['content', `Drafted a ${a.post.platform} post for ${a.post.account}.`, a.post.id]
    case 'blog/upsert':
      return ['content', `Drafted the article "${a.post.title}".`, a.post.id]
    default:
      return null
  }
}

const apply = (s: AppState, a: AppAction, at: string, by: string): AppState => {
  const touch = (id: string, fn: (l: Listing) => Listing) => ({
    ...s,
    listings: patchById(s.listings, id, (l) => ({ ...fn(l), updatedAt: at })),
  })
  switch (a.type) {
    case 'listings/create':
      return { ...s, listings: [a.listing, ...s.listings] }
    case 'listings/update':
      return touch(a.id, (l) => ({ ...l, ...a.patch }))
    case 'listings/approve': {
      // An approved listing always has a profit-share scheme the team can tune.
      const next = touch(a.id, (l) => ({ ...l, status: 'active' }))
      return next.profitShares.some((p) => p.listingId === a.id)
        ? next
        : { ...next, profitShares: [...next.profitShares, defaultShare(a.id)] }
    }
    case 'listings/setStatus':
      return touch(a.id, (l) => ({ ...l, status: a.status }))
    case 'listings/markSold': {
      const next = touch(a.id, (l) => ({ ...l, status: 'sold', soldPrice: a.soldPrice, soldAt: at }))
      // A sale ends the exclusive right and takes the listing off the portals.
      return removeFromPortals(endRunningExclusives(next, a.id, at), a.id)
    }
    case 'listings/delist': {
      const next = touch(a.id, (l) => ({ ...l, status: 'delisted', delistReason: a.reason }))
      return removeFromPortals(endRunningExclusives(next, a.id, at), a.id)
    }
    case 'partners/create':
      return { ...s, partners: [...s.partners, a.partner] }
    case 'partners/update':
      return { ...s, partners: patchById(s.partners, a.id, (p) => ({ ...p, ...a.patch })) }
    case 'inquiries/create':
      return onInquiryCreated({ ...s, inquiries: [a.inquiry, ...s.inquiries] }, a.inquiry, a.inquiry.channel, at)
    case 'inquiries/setStatus':
      return { ...s, inquiries: patchById(s.inquiries, a.id, (i) => ({ ...i, status: a.status, updatedAt: at })) }
    case 'inquiries/assign':
      return { ...s, inquiries: patchById(s.inquiries, a.id, (i) => ({ ...i, ownerId: a.ownerId, updatedAt: at })) }
    case 'settings/update':
      return { ...s, settings: { ...s.settings, ...a.patch } }
    default:
      if (isFinanceAction(a)) return financeApply(s, a, at, by)
      if (isHrAction(a)) return hrApply(s, a, at, by, nowMs())
      if (isPurchasingAction(a)) return purchasingApply(s, a, at, by)
      if (isDataroomAction(a)) return dataroomApply(s, a, at)
      if (isAi(a)) return aiApply(s, a)
      if (isNotify(a)) return notifyApply(s, a)
      if (isExclusive(a)) return exclusiveApply(s, a, at)
      if (isShare(a)) return shareApply(s, a)
      if (isContent(a)) return contentApply(s, a, at)
      return isCrm(a) ? crmApply(s, a, at, by) : isOps(a) ? opsApply(s, a, at, by) : iamApply(s, a, at)
  }
}

export const reduce = (state: AppState, { action, meta }: Envelope): AppState => {
  if (blockerFor(state, action)) return state
  let next = apply(state, action, meta.at, meta.by)
  next = settleOnClose(state, next, action, meta.at)
  next = postAutoJournals(state, next, meta.at, meta.by)
  next = dispatchNotifications(state, next, { action, meta })
  next = { ...next, audit: appendAudit(next.audit, auditEntries(state, next, meta.by, action.type, meta.at)) }
  const entry = describe(state, action)
  if (entry) next = { ...next, history: [{ id: newId('his'), at: meta.at, by: meta.by, ...entry }, ...next.history] }
  if (meta.by === JESSY) {
    const event = agentEvent(state, action)
    if (event) {
      const [kind, text, ref] = event
      next = { ...next, agentEvents: [{ id: newId('evt'), at: meta.at, kind, text, ref }, ...next.agentEvents] }
    }
  }
  return next
}
