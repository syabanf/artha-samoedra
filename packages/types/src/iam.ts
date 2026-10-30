/** Every permission a role can hold. `*.view` keys also decide which menu items a user sees. */
export const PERMISSION_GROUPS = [
  { module: 'Dashboard', items: [['dashboard.view', 'View dashboard']] },
  {
    module: 'Listings',
    items: [
      ['listing.view', 'View listings'],
      ['listing.edit', 'Create, edit and delist'],
      ['listing.approve', 'Approve partner submissions'],
      ['listing.sell', 'Mark as sold'],
    ],
  },
  { module: 'Inquiries', items: [['inquiry.view', 'View inquiries'], ['inquiry.manage', 'Take and move inquiries']] },
  { module: 'Partners', items: [['partner.view', 'View partners']] },
  { module: 'Exclusive rights', items: [['exclusive.view', 'View exclusive rights'], ['exclusive.manage', 'Grant, extend and end']] },
  { module: 'Profit sharing', items: [['share.view', 'View profit sharing'], ['share.manage', 'Edit schemes']] },
  {
    module: 'Sales',
    items: [
      ['deal.view', 'View deals, pipeline and forecast'],
      ['deal.manage', 'Create deals, quotations and tasks'],
      ['deal.approve', 'Approve discounted quotations'],
      ['target.manage', 'Set sales targets and pipeline stages'],
    ],
  },
  {
    module: 'CRM',
    items: [
      ['crm.view', 'View contacts, accounts and inbox'],
      ['crm.manage', 'Edit contacts and reply in the inbox'],
      ['campaign.manage', 'Segments, campaigns and lead forms'],
      ['automation.manage', 'Workflow automations'],
      ['report.view', 'Reports and attribution'],
      ['referral.manage', 'Approve and pay referral rewards'],
    ],
  },
  {
    module: 'Operations',
    items: [
      ['ops.view', 'View projects, visits, payments and portals'],
      ['project.manage', 'Edit projects, units and holds'],
      ['visit.manage', 'Schedule visits and open houses'],
      ['payment.manage', 'Record payments and refunds'],
      ['commission.manage', 'Generate, approve and pay commission statements'],
      ['syndication.manage', 'Publish listings to portals and run promotions'],
      ['cms.manage', 'Edit website pages and area guides'],
    ],
  },
  {
    module: 'Finance',
    items: [
      ['finance.view', 'View ledger, cash, payables, receivables and reports'],
      ['ledger.manage', 'Chart of accounts, journals, auto-journal mappings and budgets'],
      ['cash.manage', 'Cash in, cash out, transfers and bank reconciliation'],
      ['billing.manage', 'Vendor bills, sales invoices, faktur pajak, payments and receipts'],
      ['period.close', 'Close fiscal periods and years'],
    ],
  },
  {
    module: 'People',
    items: [
      ['hr.view', 'View employees, attendance, requests and HR reports'],
      ['employee.manage', 'Add and edit employees, organisation, contracts and checklists'],
      ['attendance.manage', 'Shifts, rosters, holidays and attendance corrections'],
      ['request.approve', 'Approve leave, overtime and loans at the HR level'],
      ['payroll.manage', 'Salary settings, payroll runs and payslips'],
      ['performance.manage', 'KPIs, scorecards and 360 review cycles'],
      ['recruit.manage', 'Job openings, candidates, tests, interviews and offers'],
    ],
  },
  {
    module: 'Purchasing',
    items: [
      ['purchase.view', 'View requests, orders, suppliers, stock and reports'],
      ['purchase.request', 'Raise purchase requests'],
      ['purchase.approve', 'Approve purchase requests at the Finance level'],
      ['purchase.order', 'Create and send orders, receive goods, return them and bill them'],
      ['inventory.manage', 'Items, warehouses, stock moves and stock counts'],
    ],
  },
  {
    module: 'Dataroom',
    items: [
      ['dataroom.view', 'Open dataroom folders your department can see'],
      ['dataroom.manage', 'Create folders, upload files and set department access'],
      ['dataroom.share', 'Send external share links and read the share log'],
    ],
  },
  { module: 'Content', items: [['content.view', 'View social and blog'], ['content.manage', 'Draft, schedule and publish']] },
  { module: 'Jessy', items: [['jessy.view', 'View agent log'], ['jessy.manage', 'Manage Jessy and the AI gateway: prompts, models, tools, budget']] },
  {
    module: 'Settings',
    items: [
      ['settings.view', 'Open settings'],
      ['users.manage', 'Invite and manage users'],
      ['roles.manage', 'Edit roles and permissions'],
      ['business.manage', 'Edit company and branches'],
      ['integrations.manage', 'Connect integrations, templates and API tokens'],
      ['audit.view', 'View audit log'],
    ],
  },
] as const

export type Permission = (typeof PERMISSION_GROUPS)[number]['items'][number][0]
export const PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map(([key]) => key)) as Permission[]

export interface RoleDef {
  id: string
  name: string
  description: string
  permissions: Permission[]
  /** System roles cannot be deleted; the admin role also keeps every permission. */
  system: boolean
}

export type UserStatus = 'active' | 'invited' | 'disabled'
export const USER_STATUS_LABEL: Record<UserStatus, string> = { active: 'Active', invited: 'Invited', disabled: 'Disabled' }

export interface User {
  id: string
  name: string
  email: string
  phone: string
  roleId: string
  branchId: string
  status: UserStatus
  createdAt: string
  lastActiveAt: string | null
}

export interface Branch {
  id: string
  code: string
  name: string
  city: string
  address: string
  phone: string
  isHead: boolean
}

export interface Company {
  name: string
  legalName: string
  taxId: string
  email: string
  phone: string
  address: string
  website: string
}

export type AccentPreset = 'artha' | 'wit-red' | 'ocean' | 'emerald' | 'amber' | 'violet'
export interface Appearance {
  accent: AccentPreset
  logoText: string
}

export type IntegrationKind = 'whatsapp' | 'instagram' | 'tiktok' | 'payment' | 'email' | 'portal'
export type IntegrationStatus = 'connected' | 'disconnected' | 'error'
export const INTEGRATION_STATUS_LABEL: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  disconnected: 'Not connected',
  error: 'Error',
}

export interface Integration {
  id: string
  kind: IntegrationKind
  name: string
  provider: string
  description: string
  status: IntegrationStatus
  /** Public settings only; secrets are write-only and never stored in the browser. */
  account: string
  connectedAt: string | null
  lastError: string | null
}

export type TemplateCategory = 'inquiry' | 'partner' | 'reminder' | 'marketing'
export const TEMPLATE_CATEGORY_LABEL: Record<TemplateCategory, string> = {
  inquiry: 'Inquiry',
  partner: 'Partner',
  reminder: 'Reminder',
  marketing: 'Marketing',
}

export interface MessageTemplate {
  id: string
  name: string
  category: TemplateCategory
  body: string
}

export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed'
export const MESSAGE_STATUS_LABEL: Record<MessageStatus, string> = {
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
  failed: 'Failed',
}

export interface MessageLog {
  id: string
  at: string
  to: string
  templateId: string | null
  body: string
  status: MessageStatus
}

export interface ApiToken {
  id: string
  name: string
  prefix: string
  scopes: ('read' | 'write')[]
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

export type NotifyChannel = 'in_app' | 'whatsapp' | 'email' | 'push'
export const NOTIFY_CHANNEL_LABEL: Record<NotifyChannel, string> = { in_app: 'In app', whatsapp: 'WhatsApp', email: 'Email', push: 'Push' }

export interface NotificationRule {
  id: string
  event: string
  description: string
  channels: NotifyChannel[]
  roleIds: string[]
  enabled: boolean
}

export interface FieldChange {
  field: string
  from: string
  to: string
}

export interface AuditEntry {
  id: string
  at: string
  by: string
  action: string
  entity: string
  entityId: string
  label: string
  kind: 'created' | 'updated' | 'deleted'
  changes: FieldChange[]
}
