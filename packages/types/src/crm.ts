/** CRM and sales funnel: contacts, deals, quotations, follow-ups, inbox, campaigns, automation. */

export type ContactKind = 'buyer' | 'investor' | 'tenant' | 'corporate'
export const CONTACT_KIND_LABEL: Record<ContactKind, string> = {
  buyer: 'Buyer',
  investor: 'Investor',
  tenant: 'Tenant',
  corporate: 'Corporate',
}

export type LeadSource = 'web_chat' | 'whatsapp' | 'instagram' | 'form' | 'referral' | 'walk_in' | 'portal'
export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  web_chat: 'Jessy web chat',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  form: 'Lead form',
  referral: 'Referral',
  walk_in: 'Walk-in',
  portal: 'Property portal',
}

export type Temperature = 'hot' | 'warm' | 'cold'
export const TEMPERATURE_LABEL: Record<Temperature, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' }

export interface CustomFieldDef {
  id: string
  label: string
  type: 'text' | 'number' | 'select'
  options: string[]
}

export interface Contact {
  id: string
  name: string
  phone: string
  email: string
  kind: ContactKind
  accountId: string | null
  source: LeadSource
  city: string
  tags: string[]
  /** Opted out of marketing messages; transactional messages still go. */
  optOut: boolean
  ownerId: string | null
  custom: Record<string, string>
  createdAt: string
}

export interface Account {
  id: string
  name: string
  industry: string
  city: string
  phone: string
  ownerId: string | null
  createdAt: string
}

export type StageKind = 'open' | 'won' | 'lost'

export interface DealStage {
  id: string
  name: string
  /** 0 to 100; weights the forecast. */
  probability: number
  kind: StageKind
}

export interface Deal {
  id: string
  code: string
  title: string
  contactId: string
  listingId: string | null
  inquiryId: string | null
  ownerId: string
  memberIds: string[]
  stageId: string
  value: number
  expectedCloseAt: string
  lostReason: string | null
  closedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PaymentPlan = 'cash' | 'mortgage' | 'installment'
export const PAYMENT_PLAN_LABEL: Record<PaymentPlan, string> = {
  cash: 'Cash',
  mortgage: 'Mortgage (KPR)',
  installment: 'Developer installment',
}

export type QuotationStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'accepted' | 'rejected' | 'superseded'
export const QUOTATION_STATUS_LABEL: Record<QuotationStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Needs approval',
  approved: 'Approved',
  sent: 'Sent',
  accepted: 'Accepted',
  rejected: 'Rejected',
  superseded: 'Superseded',
}

/** A price offer and booking letter for a deal; a revision supersedes the previous version. */
export interface Quotation {
  id: string
  code: string
  dealId: string
  version: number
  listPrice: number
  discountPct: number
  bookingFee: number
  paymentPlan: PaymentPlan
  validUntil: string
  notes: string
  status: QuotationStatus
  approvedBy: string | null
  createdBy: string
  createdAt: string
  sentAt: string | null
}

export type TaskKind = 'call' | 'whatsapp' | 'visit' | 'email' | 'todo'
export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  call: 'Call',
  whatsapp: 'WhatsApp',
  visit: 'Site visit',
  email: 'Email',
  todo: 'To do',
}

export type RefType = 'deal' | 'contact' | 'inquiry' | 'account'

export interface Ref {
  type: RefType
  id: string
}

export interface CrmTask {
  id: string
  title: string
  kind: TaskKind
  dueAt: string
  ownerId: string
  ref: Ref | null
  doneAt: string | null
  /** Set when the overdue automation has run for this task. */
  overdueFlaggedAt?: string | null
  createdAt: string
}

export type ActivityKind = 'note' | 'call' | 'whatsapp' | 'visit' | 'email' | 'stage' | 'quotation'
export const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  note: 'Note',
  call: 'Call',
  whatsapp: 'WhatsApp',
  visit: 'Site visit',
  email: 'Email',
  stage: 'Stage change',
  quotation: 'Quotation',
}

export interface Activity {
  id: string
  at: string
  by: string
  kind: ActivityKind
  ref: Ref
  text: string
}

export interface SalesTarget {
  id: string
  userId: string
  /** YYYY-MM */
  month: string
  amount: number
}

export type Channel = 'whatsapp' | 'instagram'
export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: 'WhatsApp', instagram: 'Instagram' }

export interface ChatMessage {
  id: string
  at: string
  /** 'contact', a user id, or 'jessy' */
  from: string
  text: string
}

export interface Conversation {
  id: string
  channel: Channel
  contactId: string
  assigneeId: string | null
  status: 'open' | 'closed'
  /** Messages after this time count as unread. */
  readAt: string | null
  messages: ChatMessage[]
}

/** Every rule that is set must match; an empty segment matches every contact. */
export interface SegmentRules {
  kind: ContactKind | null
  source: LeadSource | null
  city: string | null
  tag: string | null
  minScore: number | null
  excludeOptOut: boolean
}

export interface Segment {
  id: string
  name: string
  rules: SegmentRules
  createdAt: string
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'done' | 'cancelled'
export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  done: 'Done',
  cancelled: 'Cancelled',
}

export interface CampaignStats {
  sent: number
  delivered: number
  read: number
  replied: number
  optedOut: number
  failed: number
}

export interface Campaign {
  id: string
  name: string
  segmentId: string
  templateId: string
  listingId: string | null
  status: CampaignStatus
  scheduledAt: string | null
  stats: CampaignStats
  /** Contacts the campaign messaged, set when it is sent. */
  recipientIds: string[]
  createdBy: string
  createdAt: string
}

export interface LeadForm {
  id: string
  name: string
  slug: string
  headline: string
  listingId: string | null
  askBudget: boolean
  askVisitDate: boolean
  active: boolean
  createdAt: string
}

export type WorkflowTrigger = 'inquiry.created' | 'deal.stage_changed' | 'task.overdue' | 'quotation.sent' | 'contact.created'
export const WORKFLOW_TRIGGER_LABEL: Record<WorkflowTrigger, string> = {
  'inquiry.created': 'A new inquiry arrives',
  'deal.stage_changed': 'A deal changes stage',
  'task.overdue': 'A task becomes overdue',
  'quotation.sent': 'A quotation is sent',
  'contact.created': 'A contact is created',
}

export type WorkflowAction = 'assign_round_robin' | 'create_task' | 'send_template' | 'notify_owner'
export const WORKFLOW_ACTION_LABEL: Record<WorkflowAction, string> = {
  assign_round_robin: 'Assign to the next sales agent',
  create_task: 'Create a follow-up task',
  send_template: 'Send a WhatsApp template',
  notify_owner: 'Notify the owner',
}

export interface WorkflowRun {
  id: string
  at: string
  ok: boolean
  note: string
}

export interface WorkflowRule {
  id: string
  name: string
  trigger: WorkflowTrigger
  action: WorkflowAction
  /** Template for send_template, stage id for deal.stage_changed filters. */
  param: string
  enabled: boolean
  runs: WorkflowRun[]
}

export type ReportDataset = 'deals' | 'inquiries' | 'contacts' | 'tasks'
export type ReportMetric = 'count' | 'value'
export type ReportSchedule = 'none' | 'weekly' | 'monthly'

export interface SavedReport {
  id: string
  name: string
  dataset: ReportDataset
  groupBy: string
  metric: ReportMetric
  schedule: ReportSchedule
  recipients: string[]
  createdBy: string
  createdAt: string
}

export type ReferralStatus = 'pending' | 'approved' | 'paid' | 'rejected'
export const REFERRAL_STATUS_LABEL: Record<ReferralStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  paid: 'Paid',
  rejected: 'Rejected',
}

export interface Referral {
  id: string
  /** A contact or a partner who brought the lead. */
  referrer: { type: 'contact' | 'partner'; id: string }
  contactId: string
  dealId: string | null
  reward: number
  status: ReferralStatus
  createdAt: string
}
