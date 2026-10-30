import type {
  Account,
  Activity,
  Campaign,
  Contact,
  ContactKind,
  Conversation,
  CrmTask,
  CustomFieldDef,
  Deal,
  DealStage,
  LeadForm,
  LeadSource,
  Quotation,
  Referral,
  SalesTarget,
  SavedReport,
  Segment,
  WorkflowRule,
} from '@artha/types'
import { at, INQUIRIES, LISTINGS } from './seed'

export const STAGES: DealStage[] = [
  { id: 'stg-new', name: 'New lead', probability: 10, kind: 'open' },
  { id: 'stg-qualified', name: 'Qualified', probability: 25, kind: 'open' },
  { id: 'stg-visit', name: 'Site visit', probability: 40, kind: 'open' },
  { id: 'stg-negotiation', name: 'Negotiation', probability: 60, kind: 'open' },
  { id: 'stg-booking', name: 'Booking fee paid', probability: 85, kind: 'open' },
  { id: 'stg-won', name: 'Won', probability: 100, kind: 'won' },
  { id: 'stg-lost', name: 'Lost', probability: 0, kind: 'lost' },
]

export const LOST_REASONS = ['Price too high', 'Bought elsewhere', 'Mortgage rejected', 'Location', 'No response', 'Postponed purchase']

export const CUSTOM_FIELDS: CustomFieldDef[] = [
  { id: 'cf-income', label: 'Monthly income band', type: 'select', options: ['< Rp 15 M', 'Rp 15-40 M', 'Rp 40-100 M', '> Rp 100 M'] },
  { id: 'cf-ktp', label: 'ID number (KTP)', type: 'text', options: [] },
]

export const ACCOUNTS: Account[] = [
  { id: 'acc-1', name: 'PT Logistik Prima Nusantara', industry: 'Logistics', city: 'Surabaya', phone: '031-8899-1200', ownerId: 'usr-6', createdAt: at(-60) },
  { id: 'acc-2', name: 'Kopi Senja Group', industry: 'Food and beverage', city: 'Bandung', phone: '022-4455-901', ownerId: 'usr-4', createdAt: at(-40) },
  { id: 'acc-3', name: 'Bali Stay Management', industry: 'Hospitality', city: 'Badung', phone: '0361-777-220', ownerId: 'usr-5', createdAt: at(-90) },
]

const CHANNEL_SOURCE: Record<string, LeadSource> = { web_chat: 'web_chat', whatsapp: 'whatsapp', instagram: 'instagram' }
const KIND_BY_INQUIRY: ContactKind[] = ['buyer', 'investor', 'corporate', 'buyer', 'corporate', 'buyer', 'corporate', 'buyer', 'investor', 'buyer', 'buyer', 'tenant']
const ACCOUNT_BY_INQUIRY: Record<number, string> = { 2: 'acc-1', 4: 'acc-1', 6: 'acc-2' }
const CITIES = ['Jakarta Selatan', 'Denpasar', 'Surabaya', 'Bogor', 'Bekasi', 'Bogor', 'Bandung', 'Tangerang', 'Jakarta Pusat', 'Bekasi', 'Bekasi', 'Gianyar']

/** One contact per seeded inquiry, matched by phone. */
export const CONTACTS: Contact[] = [
  ...INQUIRIES.map((inq, i) => ({
    id: `con-${i + 1}`,
    name: inq.name,
    phone: inq.phone,
    email: `${inq.name.split(' ')[0].toLowerCase()}@mail.id`,
    kind: KIND_BY_INQUIRY[i],
    accountId: ACCOUNT_BY_INQUIRY[i] ?? null,
    source: CHANNEL_SOURCE[inq.channel],
    city: CITIES[i],
    tags: i % 3 === 0 ? ['first-home'] : i % 3 === 1 ? ['investor-list'] : [],
    optOut: i === 9,
    ownerId: inq.ownerId,
    custom: (i === 0 ? { 'cf-income': 'Rp 40-100 M' } : {}) as Record<string, string>,
    createdAt: inq.createdAt,
  })),
  { id: 'con-13', name: 'Wayan Sudiarta', phone: '0812-3800-4411', email: 'wayan@mail.id', kind: 'corporate', accountId: 'acc-3', source: 'referral', city: 'Badung', tags: ['investor-list'], optOut: false, ownerId: 'usr-5', custom: {}, createdAt: at(-30) },
  { id: 'con-14', name: 'Grace Tanuwijaya', phone: '0817-6655-1020', email: 'grace@mail.id', kind: 'investor', accountId: null, source: 'portal', city: 'Jakarta Utara', tags: ['investor-list'], optOut: false, ownerId: 'usr-2', custom: {}, createdAt: at(-12) },
]

const deal = (
  n: number,
  title: string,
  contact: string,
  listing: number | null,
  inquiry: number | null,
  owner: string,
  stage: string,
  value: number,
  closeIn: number,
  age: number,
  extra: Partial<Deal> = {},
): Deal => ({
  id: `del-${n}`,
  code: `DL-26-${String(40 + n).padStart(4, '0')}`,
  title,
  contactId: contact,
  listingId: listing === null ? null : LISTINGS[listing].id,
  inquiryId: inquiry === null ? null : INQUIRIES[inquiry].id,
  ownerId: owner,
  memberIds: [],
  stageId: stage,
  value,
  expectedCloseAt: at(closeIn),
  lostReason: null,
  closedAt: null,
  createdAt: at(-age),
  updatedAt: at(-Math.min(age, 1)),
  ...extra,
})

export const DEALS: Deal[] = [
  deal(1, 'Rizky buys the Fatmawati house', 'con-1', 0, 0, 'usr-2', 'stg-qualified', 6_850_000_000, 30, 1),
  deal(2, 'Melati, Uluwatu villa for rental', 'con-2', 4, 1, 'usr-5', 'stg-visit', 14_500_000_000, 45, 2),
  deal(3, 'Logistik Prima, Waru warehouse', 'con-3', 5, 2, 'usr-2', 'stg-negotiation', 18_200_000_000, 20, 4, { memberIds: ['usr-6'] }),
  deal(4, 'Kevin, MM2100 warehouse lease', 'con-5', 3, 4, 'usr-2', 'stg-booking', 1_200_000_000, 7, 10),
  deal(5, 'Siti, Sentul family house', 'con-6', 6, 5, 'usr-4', 'stg-negotiation', 2_100_000_000, 25, 3),
  deal(6, 'Bima, Dago shophouse for a cafe', 'con-7', 2, 6, 'usr-4', 'stg-new', 5_400_000_000, 60, 1),
  deal(7, 'Laras, Gading Serpong cluster house', 'con-8', 9, 7, 'usr-2', 'stg-won', 1_820_000_000, -6, 25, { closedAt: at(-6) }),
  deal(8, 'Fajar, Menteng land value deal', 'con-9', 13, 8, 'usr-6', 'stg-visit', 36_000_000_000, 75, 5),
  deal(9, 'Dewi, Bekasi shophouse', 'con-10', 10, 9, 'usr-4', 'stg-lost', 4_100_000_000, -10, 16, { lostReason: 'Bought elsewhere', closedAt: at(-12) }),
  deal(10, 'Bali Stay, Ubud villa lease', 'con-13', 11, null, 'usr-5', 'stg-qualified', 450_000_000, 40, 6),
  deal(11, 'Grace, Semarang commercial land', 'con-14', 8, null, 'usr-2', 'stg-new', 9_900_000_000, 90, 2),
]

export const QUOTATIONS: Quotation[] = [
  { id: 'quo-1', code: 'QT-26-0101', dealId: 'del-3', version: 1, listPrice: 18_750_000_000, discountPct: 2, bookingFee: 100_000_000, paymentPlan: 'cash', validUntil: at(10), notes: 'Price includes the loading dock canopy.', status: 'superseded', approvedBy: null, createdBy: 'usr-2', createdAt: at(-6), sentAt: at(-6) },
  { id: 'quo-2', code: 'QT-26-0102', dealId: 'del-3', version: 2, listPrice: 18_750_000_000, discountPct: 3, bookingFee: 100_000_000, paymentPlan: 'cash', validUntil: at(14), notes: 'Revised after the site visit. Price includes the loading dock canopy.', status: 'sent', approvedBy: null, createdBy: 'usr-2', createdAt: at(-2), sentAt: at(-2) },
  { id: 'quo-3', code: 'QT-26-0103', dealId: 'del-4', version: 1, listPrice: 1_350_000_000, discountPct: 11, bookingFee: 50_000_000, paymentPlan: 'installment', validUntil: at(7), notes: '3-year lease, paid yearly in advance.', status: 'accepted', approvedBy: 'usr-6', createdBy: 'usr-2', createdAt: at(-9), sentAt: at(-8) },
  { id: 'quo-4', code: 'QT-26-0104', dealId: 'del-5', version: 1, listPrice: 2_150_000_000, discountPct: 7, bookingFee: 20_000_000, paymentPlan: 'mortgage', validUntil: at(12), notes: 'Mortgage pre-approval from BTN attached.', status: 'pending_approval', approvedBy: null, createdBy: 'usr-4', createdAt: at(-0.4), sentAt: null },
  { id: 'quo-5', code: 'QT-26-0105', dealId: 'del-7', version: 1, listPrice: 1_890_000_000, discountPct: 3.7, bookingFee: 15_000_000, paymentPlan: 'mortgage', validUntil: at(-10), notes: '', status: 'accepted', approvedBy: null, createdBy: 'usr-2', createdAt: at(-20), sentAt: at(-20) },
]

export const TASKS: CrmTask[] = [
  { id: 'tsk-1', title: 'Call Rizky to confirm Saturday visit', kind: 'call', dueAt: at(0, 14), ownerId: 'usr-2', ref: { type: 'deal', id: 'del-1' }, doneAt: null, createdAt: at(-0.2) },
  { id: 'tsk-2', title: 'Send revised quotation follow-up', kind: 'whatsapp', dueAt: at(-1, 10), ownerId: 'usr-2', ref: { type: 'deal', id: 'del-3' }, doneAt: null, createdAt: at(-2) },
  { id: 'tsk-3', title: 'Site visit Uluwatu villa with Melati', kind: 'visit', dueAt: at(2, 10), ownerId: 'usr-5', ref: { type: 'deal', id: 'del-2' }, doneAt: null, createdAt: at(-1) },
  { id: 'tsk-4', title: 'Collect KTP and NPWP for booking', kind: 'todo', dueAt: at(-2, 16), ownerId: 'usr-2', ref: { type: 'deal', id: 'del-4' }, doneAt: null, createdAt: at(-5) },
  { id: 'tsk-5', title: 'Ask BTN for the appraisal date', kind: 'call', dueAt: at(1, 11), ownerId: 'usr-4', ref: { type: 'deal', id: 'del-5' }, doneAt: null, createdAt: at(-1) },
  { id: 'tsk-6', title: 'Reply to Clara about lease length', kind: 'whatsapp', dueAt: at(0, 11), ownerId: 'usr-5', ref: { type: 'contact', id: 'con-12' }, doneAt: null, createdAt: at(-1) },
  { id: 'tsk-7', title: 'First call to Bima', kind: 'call', dueAt: at(-0.5, 9), ownerId: 'usr-4', ref: { type: 'deal', id: 'del-6' }, doneAt: null, createdAt: at(-1) },
  { id: 'tsk-8', title: 'Send handover checklist to Laras', kind: 'email', dueAt: at(-5, 10), ownerId: 'usr-2', ref: { type: 'deal', id: 'del-7' }, doneAt: at(-5), createdAt: at(-6) },
  { id: 'tsk-9', title: 'Prepare land tax documents for Fajar', kind: 'todo', dueAt: at(3, 10), ownerId: 'usr-6', ref: { type: 'deal', id: 'del-8' }, doneAt: null, createdAt: at(-3) },
]

export const ACTIVITIES: Activity[] = [
  { id: 'act-1', at: at(-2), by: 'usr-2', kind: 'quotation', ref: { type: 'deal', id: 'del-3' }, text: 'Sent QT-26-0102 with a 3% discount.' },
  { id: 'act-2', at: at(-3), by: 'usr-2', kind: 'visit', ref: { type: 'deal', id: 'del-3' }, text: 'Visited the Waru warehouse with the operations director. Asked about the ceiling height.' },
  { id: 'act-3', at: at(-1), by: 'usr-5', kind: 'call', ref: { type: 'deal', id: 'del-2' }, text: 'Melati wants the guesthouse licence copy before the visit.' },
  { id: 'act-4', at: at(-8), by: 'usr-2', kind: 'stage', ref: { type: 'deal', id: 'del-4' }, text: 'Moved to Booking fee paid.' },
  { id: 'act-5', at: at(-0.4), by: 'usr-4', kind: 'note', ref: { type: 'deal', id: 'del-5' }, text: 'Siti asks for 7% off; needs manager approval.' },
  { id: 'act-6', at: at(-12), by: 'usr-4', kind: 'stage', ref: { type: 'deal', id: 'del-9' }, text: 'Lost: bought elsewhere.' },
  { id: 'act-7', at: at(-0.1), by: 'jessy', kind: 'whatsapp', ref: { type: 'contact', id: 'con-1' }, text: 'Jessy logged the inquiry and sent the "Inquiry received" template.' },
]

export const TARGETS: SalesTarget[] = ['usr-2', 'usr-4', 'usr-5', 'usr-6'].flatMap((userId, i) => [
  { id: `tgt-${userId}-10`, userId, month: '2026-10', amount: [8, 4, 6, 12][i] * 1e9 },
  { id: `tgt-${userId}-11`, userId, month: '2026-11', amount: [10, 5, 8, 15][i] * 1e9 },
])

export const CONVERSATIONS: Conversation[] = [
  {
    id: 'cnv-1',
    channel: 'whatsapp',
    contactId: 'con-1',
    assigneeId: 'usr-2',
    status: 'open',
    readAt: at(-0.5),
    messages: [
      { id: 'cm-1', at: at(-0.1), from: 'contact', text: 'Still available? Can I visit this Saturday?' },
      { id: 'cm-2', at: at(-0.09), from: 'jessy', text: 'Hi Rizky, AS-0001 is available. Dimas from our team will confirm a time with you today.' },
      { id: 'cm-3', at: at(-0.05), from: 'contact', text: 'Morning would be best, around 10.' },
    ],
  },
  {
    id: 'cnv-2',
    channel: 'instagram',
    contactId: 'con-11',
    assigneeId: 'usr-4',
    status: 'open',
    readAt: at(-1),
    messages: [
      { id: 'cm-4', at: at(-5), from: 'contact', text: 'Can I buy just one of the twin shophouses?' },
      { id: 'cm-5', at: at(-4.9), from: 'usr-4', text: 'Hi Yusuf, the owner prefers to sell both. I can ask about one unit.' },
      { id: 'cm-6', at: at(-0.3), from: 'contact', text: 'Any update from the owner?' },
    ],
  },
  {
    id: 'cnv-3',
    channel: 'whatsapp',
    contactId: 'con-5',
    assigneeId: 'usr-2',
    status: 'open',
    readAt: at(0),
    messages: [
      { id: 'cm-7', at: at(-1), from: 'contact', text: 'Booking fee transferred. Proof attached.' },
      { id: 'cm-8', at: at(-0.9), from: 'usr-2', text: 'Received, thank you Kevin. The lease draft comes this week.' },
    ],
  },
  {
    id: 'cnv-4',
    channel: 'whatsapp',
    contactId: 'con-12',
    assigneeId: null,
    status: 'open',
    readAt: null,
    messages: [{ id: 'cm-9', at: at(-1.5), from: 'contact', text: 'What is the minimum lease for the Ubud villa?' }],
  },
]

export const SEGMENTS: Segment[] = [
  { id: 'seg-1', name: 'Investors', rules: { kind: 'investor', source: null, city: null, tag: null, minScore: null, excludeOptOut: true }, createdAt: at(-30) },
  { id: 'seg-2', name: 'First-home buyers', rules: { kind: 'buyer', source: null, city: null, tag: 'first-home', minScore: null, excludeOptOut: true }, createdAt: at(-20) },
  { id: 'seg-3', name: 'Hot leads, any type', rules: { kind: null, source: null, city: null, tag: null, minScore: 60, excludeOptOut: true }, createdAt: at(-5) },
]

export const CAMPAIGNS: Campaign[] = [
  { id: 'cmp-1', name: 'October investor picks', segmentId: 'seg-1', templateId: 'tpl-5', listingId: 'lst-6', status: 'done', scheduledAt: at(-10, 19), stats: { sent: 3, delivered: 3, read: 2, replied: 1, optedOut: 0, failed: 0 }, recipientIds: ['con-2', 'con-9', 'con-14'], createdBy: 'usr-3', createdAt: at(-12) },
  { id: 'cmp-2', name: 'Sentul family homes', segmentId: 'seg-2', templateId: 'tpl-5', listingId: 'lst-7', status: 'scheduled', scheduledAt: at(2, 19), stats: { sent: 0, delivered: 0, read: 0, replied: 0, optedOut: 0, failed: 0 }, recipientIds: [], createdBy: 'usr-3', createdAt: at(-1) },
  { id: 'cmp-3', name: 'Bali villa weekend', segmentId: 'seg-3', templateId: 'tpl-5', listingId: 'lst-5', status: 'draft', scheduledAt: null, stats: { sent: 0, delivered: 0, read: 0, replied: 0, optedOut: 0, failed: 0 }, recipientIds: [], createdBy: 'usr-3', createdAt: at(-0.3) },
]

export const LEAD_FORMS: LeadForm[] = [
  { id: 'frm-1', name: 'Sentul open house', slug: 'sentul-open-house', headline: 'Register for the Sentul open house', listingId: 'lst-7', askBudget: true, askVisitDate: true, active: true, createdAt: at(-14) },
  { id: 'frm-2', name: 'Warehouse brief', slug: 'warehouse-brief', headline: 'Tell us the warehouse you need', listingId: null, askBudget: true, askVisitDate: false, active: true, createdAt: at(-40) },
]

export const WORKFLOWS: WorkflowRule[] = [
  { id: 'wf-1', name: 'Round-robin new inquiries', trigger: 'inquiry.created', action: 'assign_round_robin', param: '', enabled: true, runs: [{ id: 'wr-1', at: at(-0.1), ok: true, note: 'Assigned INQ-26-0101 to Dimas Wicaksono.' }] },
  { id: 'wf-2', name: 'Welcome message', trigger: 'inquiry.created', action: 'send_template', param: 'tpl-1', enabled: true, runs: [{ id: 'wr-2', at: at(-0.1), ok: true, note: 'Sent "Inquiry received" to 0812-3344-5566.' }] },
  { id: 'wf-3', name: 'Chase stalled quotations', trigger: 'quotation.sent', action: 'create_task', param: '3', enabled: true, runs: [{ id: 'wr-3', at: at(-2), ok: true, note: 'Created a follow-up task on DL-26-0043.' }] },
  { id: 'wf-4', name: 'Overdue task alert', trigger: 'task.overdue', action: 'notify_owner', param: '', enabled: false, runs: [] },
]

export const REPORTS: SavedReport[] = [
  { id: 'rpt-1', name: 'Pipeline value by stage', dataset: 'deals', groupBy: 'stage', metric: 'value', schedule: 'weekly', recipients: ['usr-6', 'usr-1'], createdBy: 'usr-6', createdAt: at(-30) },
  { id: 'rpt-2', name: 'Inquiries by channel', dataset: 'inquiries', groupBy: 'channel', metric: 'count', schedule: 'monthly', recipients: ['usr-3'], createdBy: 'usr-3', createdAt: at(-20) },
  { id: 'rpt-3', name: 'Contacts by source', dataset: 'contacts', groupBy: 'source', metric: 'count', schedule: 'none', recipients: [], createdBy: 'usr-3', createdAt: at(-8) },
]

export const REFERRALS: Referral[] = [
  { id: 'ref-1', referrer: { type: 'contact', id: 'con-8' }, contactId: 'con-14', dealId: 'del-11', reward: 5_000_000, status: 'pending', createdAt: at(-12) },
  { id: 'ref-2', referrer: { type: 'partner', id: 'ptn-4' }, contactId: 'con-5', dealId: 'del-4', reward: 10_000_000, status: 'approved', createdAt: at(-10) },
  { id: 'ref-3', referrer: { type: 'contact', id: 'con-2' }, contactId: 'con-13', dealId: 'del-10', reward: 3_000_000, status: 'paid', createdAt: at(-25) },
]
