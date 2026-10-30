import type {
  ApiToken,
  Appearance,
  Branch,
  Company,
  Integration,
  MessageLog,
  MessageTemplate,
  NotificationRule,
  Permission,
  RoleDef,
  User,
} from '@artha/types'
import { PERMISSIONS } from '@artha/types'
import { at } from './seed'

const views: Permission[] = ['dashboard.view', 'listing.view', 'inquiry.view', 'partner.view', 'exclusive.view']

export const ROLES: RoleDef[] = [
  { id: 'rol-admin', name: 'Admin', description: 'Full access, including settings and the audit log.', permissions: [...PERMISSIONS], system: true },
  {
    id: 'rol-manager',
    name: 'Sales manager',
    description: 'Runs the sales team, approves partner listings and sets profit sharing.',
    permissions: [...views, 'listing.edit', 'listing.approve', 'listing.sell', 'inquiry.manage', 'exclusive.manage', 'share.view', 'share.manage', 'jessy.view', 'settings.view', 'audit.view', 'deal.view', 'deal.manage', 'deal.approve', 'target.manage', 'crm.view', 'crm.manage', 'automation.manage', 'report.view', 'referral.manage', 'ops.view', 'project.manage', 'visit.manage', 'payment.manage', 'commission.manage', 'syndication.manage', 'finance.view', 'hr.view', 'request.approve', 'performance.manage', 'recruit.manage', 'purchase.view', 'purchase.request', 'dataroom.view', 'dataroom.share'],
    system: false,
  },
  {
    id: 'rol-sales',
    name: 'Sales agent',
    description: 'Works listings, inquiries and exclusive rights.',
    permissions: [...views, 'listing.edit', 'listing.sell', 'inquiry.manage', 'exclusive.manage', 'deal.view', 'deal.manage', 'crm.view', 'crm.manage', 'ops.view', 'visit.manage', 'purchase.view', 'purchase.request', 'dataroom.view', 'dataroom.share'],
    system: true,
  },
  {
    id: 'rol-marketing',
    name: 'Marketing',
    description: 'Social media content and the SEO blog.',
    permissions: ['dashboard.view', 'listing.view', 'content.view', 'content.manage', 'jessy.view', 'crm.view', 'campaign.manage', 'report.view', 'ops.view', 'syndication.manage', 'cms.manage', 'purchase.view', 'purchase.request', 'dataroom.view'],
    system: true,
  },
  {
    id: 'rol-finance',
    name: 'Finance',
    description: 'Owns the ledger, cash, payables, receivables and profit sharing.',
    permissions: ['dashboard.view', 'listing.view', 'partner.view', 'share.view', 'share.manage', 'audit.view', 'deal.view', 'report.view', 'referral.manage', 'ops.view', 'payment.manage', 'commission.manage', 'finance.view', 'ledger.manage', 'cash.manage', 'billing.manage', 'period.close', 'hr.view', 'payroll.manage', 'purchase.view', 'purchase.approve', 'purchase.order', 'dataroom.view', 'dataroom.share'],
    system: false,
  },
  {
    id: 'rol-hr',
    name: 'HR',
    description: 'Runs people, attendance, requests, payroll, performance and hiring.',
    permissions: ['dashboard.view', 'audit.view', 'settings.view', 'hr.view', 'employee.manage', 'attendance.manage', 'request.approve', 'payroll.manage', 'performance.manage', 'recruit.manage', 'purchase.view', 'purchase.request', 'purchase.order', 'inventory.manage', 'dataroom.view', 'dataroom.manage'],
    system: false,
  },
]

export const BRANCHES: Branch[] = [
  { id: 'brn-jkt', code: 'JKT', name: 'Jakarta head office', city: 'Jakarta Selatan', address: 'Jl. TB Simatupang Kav. 18', phone: '021-7880-1200', isHead: true },
  { id: 'brn-bdg', code: 'BDG', name: 'Bandung office', city: 'Bandung', address: 'Jl. Ir. H. Juanda 112', phone: '022-2501-330', isHead: false },
  { id: 'brn-sby', code: 'SBY', name: 'Surabaya office', city: 'Surabaya', address: 'Jl. Raya Darmo 45', phone: '031-5678-210', isHead: false },
  { id: 'brn-dps', code: 'DPS', name: 'Bali office', city: 'Badung', address: 'Jl. Sunset Road 88', phone: '0361-475-990', isHead: false },
]

const userRows: [string, string, string, string, User['status'], number | null][] = [
  ['Ayu Pramesti', 'rol-admin', 'brn-jkt', '0811-1000-001', 'active', 0],
  ['Dimas Wicaksono', 'rol-sales', 'brn-jkt', '0811-1000-002', 'active', 0.2],
  ['Nadia Halim', 'rol-marketing', 'brn-jkt', '0811-1000-003', 'active', 1],
  ['Rina Kartika', 'rol-sales', 'brn-bdg', '0811-1000-004', 'active', 0.5],
  ['Bayu Saputra', 'rol-sales', 'brn-dps', '0811-1000-005', 'active', 2],
  ['Hana Wirawan', 'rol-manager', 'brn-jkt', '0811-1000-006', 'active', 0.1],
  ['Teguh Santoso', 'rol-finance', 'brn-jkt', '0811-1000-007', 'active', 3],
  ['Sinta Maharani', 'rol-sales', 'brn-sby', '0811-1000-008', 'invited', null],
  ['Agus Prabowo', 'rol-sales', 'brn-sby', '0811-1000-009', 'disabled', 60],
  ['Lestari Wulandari', 'rol-hr', 'brn-jkt', '0811-1000-010', 'active', 0.3],
]

export const USERS: User[] = userRows.map(([name, roleId, branchId, phone, status, lastDays], i) => ({
  id: `usr-${i + 1}`,
  name,
  email: `${name.split(' ')[0].toLowerCase()}@arthasamoedra.id`,
  phone,
  roleId,
  branchId,
  status,
  createdAt: at(-400 + i * 30),
  lastActiveAt: lastDays === null ? null : at(-lastDays),
}))

export const COMPANY: Company = {
  name: 'Artha Samoedra',
  legalName: 'PT Artha Samoedra Properti',
  taxId: '01.234.567.8-012.000',
  email: 'hello@arthasamoedra.id',
  phone: '021-7880-1200',
  address: 'Jl. TB Simatupang Kav. 18, Jakarta Selatan 12430',
  website: 'https://arthasamoedra.id',
}

export const APPEARANCE: Appearance = { accent: 'artha', logoText: 'AS' }

export const INTEGRATIONS: Integration[] = [
  { id: 'int-wa', kind: 'whatsapp', name: 'WhatsApp gateway', provider: 'Fonnte', description: 'Jessy replies, inquiry alerts and partner reminders.', status: 'connected', account: '+62 811-1000-900', connectedAt: at(-120), lastError: null },
  { id: 'int-ig', kind: 'instagram', name: 'Instagram', provider: 'Meta Graph API', description: 'Inbox and post publishing for the media accounts.', status: 'error', account: '@arthasamoedra', connectedAt: at(-90), lastError: 'Access token expired on 27 Oct 2026. Reconnect to keep publishing.' },
  { id: 'int-pay', kind: 'payment', name: 'Payment gateway', provider: 'Xendit', description: 'Booking fees and deposits by virtual account and QRIS.', status: 'disconnected', account: '', connectedAt: null, lastError: null },
  { id: 'int-mail', kind: 'email', name: 'Email', provider: 'SMTP', description: 'Invites, password resets and dataroom codes.', status: 'connected', account: 'noreply@arthasamoedra.id', connectedAt: at(-200), lastError: null },
  { id: 'int-portal', kind: 'portal', name: 'Property portals', provider: 'Rumah123 · Lamudi', description: 'Syndicates live listings to property portals.', status: 'disconnected', account: '', connectedAt: null, lastError: null },
]

export const TEMPLATES: MessageTemplate[] = [
  { id: 'tpl-1', name: 'Inquiry received', category: 'inquiry', body: 'Hi {{name}}, thanks for asking about {{listing}}. {{agent}} from Artha Samoedra will contact you today.' },
  { id: 'tpl-2', name: 'Site visit confirmed', category: 'inquiry', body: 'Hi {{name}}, your visit to {{listing}} is set for {{date}}. Reply RESCHEDULE to change it.' },
  { id: 'tpl-3', name: 'Listing approved', category: 'partner', body: 'Good news, {{partner}}: {{listing}} is now live on arthasamoedra.id.' },
  { id: 'tpl-4', name: 'Exclusive ending', category: 'reminder', body: 'Hi {{partner}}, the exclusive marketing period for {{listing}} ends on {{date}}. Shall we extend it?' },
  { id: 'tpl-5', name: 'New listing blast', category: 'marketing', body: 'New on Artha Samoedra: {{listing}} at {{price}}. Reply INFO for details.' },
]

export const MESSAGES: MessageLog[] = [
  { id: 'msg-1', at: at(-0.1), to: '0812-3344-5566', templateId: 'tpl-1', body: 'Hi Rizky Ananda, thanks for asking about AS-0001. Dimas Wicaksono from Artha Samoedra will contact you today.', status: 'read' },
  { id: 'msg-2', at: at(-1), to: '0818-0431-5520', templateId: 'tpl-3', body: 'Good news, Prima Agung Properti: AS-0016 is now live on arthasamoedra.id.', status: 'delivered' },
  { id: 'msg-3', at: at(-2), to: '0811-8890-1200', templateId: 'tpl-4', body: 'Hi PT Bumi Lestari Properti, the exclusive marketing period for AS-0002 ends on 14 Nov 2026. Shall we extend it?', status: 'read' },
  { id: 'msg-4', at: at(-2.2), to: '0812-7770-3321', templateId: 'tpl-4', body: 'Hi CV Gudang Nusantara, the exclusive marketing period for AS-0006 ends on 4 Nov 2026. Shall we extend it?', status: 'failed' },
  { id: 'msg-5', at: at(-3), to: '0813-5521-7781', templateId: null, body: 'Hi Bu Sri, the photographer comes on Thursday at 10:00.', status: 'delivered' },
]

export const API_TOKENS: ApiToken[] = [
  { id: 'tok-1', name: 'Website build', prefix: 'as_live_7Hq2', scopes: ['read'], createdAt: at(-180), lastUsedAt: at(-0.05), revokedAt: null },
  { id: 'tok-2', name: 'Old portal sync', prefix: 'as_live_K91z', scopes: ['read', 'write'], createdAt: at(-300), lastUsedAt: at(-95), revokedAt: at(-90) },
]

export const NOTIFICATION_RULES: NotificationRule[] = [
  { id: 'ntf-1', event: 'New inquiry', description: 'A buyer leaves contact details in the Jessy chat.', channels: ['in_app', 'whatsapp'], roleIds: ['rol-sales', 'rol-manager'], enabled: true },
  { id: 'ntf-2', event: 'Listing needs review', description: 'A partner submits a listing through Jessy.', channels: ['in_app'], roleIds: ['rol-manager', 'rol-admin'], enabled: true },
  { id: 'ntf-3', event: 'Exclusive due', description: 'An exclusive right enters its reminder window or passes its end date.', channels: ['in_app', 'whatsapp', 'email'], roleIds: ['rol-sales', 'rol-manager'], enabled: true },
  { id: 'ntf-4', event: 'Listing sold', description: 'A listing is marked as sold.', channels: ['in_app', 'email'], roleIds: ['rol-finance', 'rol-manager'], enabled: true },
  { id: 'ntf-5', event: 'Content scheduled', description: 'A social post gets a publish time.', channels: ['in_app'], roleIds: ['rol-marketing'], enabled: false },
]
