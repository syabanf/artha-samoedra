import type {
  Account,
  Activity,
  Campaign,
  ChatMessage,
  Contact,
  CrmTask,
  CustomFieldDef,
  Deal,
  DealStage,
  Inquiry,
  LeadForm,
  LeadSource,
  Quotation,
  Ref,
  Referral,
  ReferralStatus,
  SalesTarget,
  SavedReport,
  Segment,
  SegmentRules,
  WorkflowRule,
  WorkflowTrigger,
} from '@artha/types'
import { QUOTATION_STATUS_LABEL, REFERRAL_STATUS_LABEL } from '@artha/types'
import { addDays, DAY, toMs } from './clock'
import { normalizePhone } from './derive'
import { nextCode, newId } from './format'
import { fillTemplate } from './iam'
import { patchById, upsert } from './rows'
import type { AppState } from './store'

/** Quotations above this discount need someone with deal.approve. */
export const APPROVAL_DISCOUNT_PCT = 5

export interface CrmSettings {
  lostReasons: string[]
  customFields: CustomFieldDef[]
}

export type CrmAction =
  | { type: 'contacts/upsert'; contact: Contact }
  | { type: 'contacts/setOptOut'; id: string; optOut: boolean }
  | { type: 'accounts/upsert'; account: Account }
  | { type: 'deals/create'; deal: Deal }
  | { type: 'deals/update'; id: string; patch: Partial<Pick<Deal, 'title' | 'value' | 'expectedCloseAt' | 'ownerId' | 'memberIds' | 'listingId'>> }
  | { type: 'deals/move'; id: string; stageId: string; lostReason?: string }
  | { type: 'quotations/create'; quotation: Quotation }
  | { type: 'quotations/submit'; id: string }
  | { type: 'quotations/approve'; id: string }
  | { type: 'quotations/reject'; id: string }
  | { type: 'quotations/send'; id: string }
  | { type: 'quotations/respond'; id: string; accepted: boolean }
  | { type: 'tasks/create'; task: CrmTask }
  | { type: 'tasks/complete'; id: string }
  | { type: 'tasks/reopen'; id: string }
  | { type: 'tasks/flagOverdue'; ids: string[] }
  | { type: 'activities/add'; activity: Activity }
  | { type: 'targets/set'; target: SalesTarget }
  | { type: 'stages/upsert'; stage: DealStage }
  | { type: 'stages/remove'; id: string }
  | { type: 'crmSettings/update'; patch: Partial<CrmSettings> }
  | { type: 'conversations/reply'; id: string; message: ChatMessage }
  | { type: 'conversations/assign'; id: string; assigneeId: string | null }
  | { type: 'conversations/markRead'; id: string }
  | { type: 'conversations/setStatus'; id: string; status: 'open' | 'closed' }
  | { type: 'segments/upsert'; segment: Segment }
  | { type: 'segments/remove'; id: string }
  | { type: 'campaigns/upsert'; campaign: Campaign }
  | { type: 'campaigns/schedule'; id: string; scheduledAt: string }
  | { type: 'campaigns/send'; id: string }
  | { type: 'campaigns/cancel'; id: string }
  | { type: 'forms/upsert'; form: LeadForm }
  | { type: 'forms/submit'; formId: string; name: string; phone: string; budget: number | null; message: string }
  | { type: 'workflows/upsert'; rule: WorkflowRule }
  | { type: 'reports/upsert'; report: SavedReport }
  | { type: 'reports/remove'; id: string }
  | { type: 'referrals/create'; referral: Referral }
  | { type: 'referrals/setStatus'; id: string; status: ReferralStatus }

// ---------------------------------------------------------------- derivations

export const stageOf = (s: AppState, d: Deal) => s.stages.find((st) => st.id === d.stageId)
export const isOpenDeal = (s: AppState, d: Deal) => stageOf(s, d)?.kind === 'open'
export const netPrice = (q: Pick<Quotation, 'listPrice' | 'discountPct'>) => q.listPrice * (1 - q.discountPct / 100)
export const needsApproval = (q: Pick<Quotation, 'discountPct'>) => q.discountPct > APPROVAL_DISCOUNT_PCT
/** The code the next saved quotation takes. */
export const nextQuotationCode = (s: Pick<AppState, 'quotations'>) => nextCode(s.quotations.map((q) => q.code), 'QT-26-', 4)

export const contactByPhone = (s: AppState, phone: string) => {
  const p = normalizePhone(phone)
  return s.contacts.find((c) => normalizePhone(c.phone) === p)
}

export const refLabel = (s: AppState, ref: Ref | null) => {
  if (!ref) return '–'
  if (ref.type === 'deal') return s.deals.find((d) => d.id === ref.id)?.code ?? '–'
  if (ref.type === 'contact') return s.contacts.find((c) => c.id === ref.id)?.name ?? '–'
  if (ref.type === 'account') return s.accounts.find((a) => a.id === ref.id)?.name ?? '–'
  return s.inquiries.find((i) => i.id === ref.id)?.code ?? '–'
}

/**
 * 0 to 100. Kind and source set a base; open inquiries, the furthest deal stage and
 * activity in the last 14 days add to it; an opt-out caps it.
 */
export const leadScore = (s: AppState, c: Contact, now: number) => {
  const base = { investor: 25, corporate: 25, buyer: 15, tenant: 10 }[c.kind] + (c.source === 'referral' ? 10 : 0)
  const inquiries = s.inquiries.filter((i) => normalizePhone(i.phone) === normalizePhone(c.phone)).length
  const deals = s.deals.filter((d) => d.contactId === c.id)
  const stage = Math.max(0, ...deals.map((d) => stageOf(s, d)?.probability ?? 0))
  const recent = s.activities.filter((a) => a.ref.type === 'contact' && a.ref.id === c.id && now - toMs(a.at) < 14 * DAY).length
  const score = Math.min(100, base + inquiries * 10 + Math.round(stage * 0.5) + recent * 5)
  return c.optOut ? Math.min(score, 40) : score
}

export const temperature = (score: number) => (score >= 60 ? 'hot' : score >= 30 ? 'warm' : 'cold')

export const segmentMembers = (s: AppState, r: SegmentRules, now: number) =>
  s.contacts.filter(
    (c) =>
      (!r.kind || c.kind === r.kind) &&
      (!r.source || c.source === r.source) &&
      (!r.city || c.city === r.city) &&
      (!r.tag || c.tags.includes(r.tag)) &&
      (!r.minScore || leadScore(s, c, now) >= r.minScore) &&
      (!r.excludeOptOut || !c.optOut),
  )

export type FollowUpBucket = 'overdue' | 'today' | 'upcoming' | 'done'
export const followUpBucket = (t: CrmTask, now: number): FollowUpBucket => {
  if (t.doneAt) return 'done'
  const due = toMs(t.dueAt)
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  if (due < now) return 'overdue'
  return due <= end.getTime() ? 'today' : 'upcoming'
}

/** Open tasks past due that the overdue automation has not handled yet. */
export const overdueToFlag = (s: AppState, now: number) =>
  s.tasks.filter((t) => !t.doneAt && !t.overdueFlaggedAt && toMs(t.dueAt) < now)

/** Won value and probability-weighted open value per owner for one month (YYYY-MM). */
export const forecast = (s: AppState, month: string) => {
  const rows = new Map<string, { won: number; weighted: number; open: number }>()
  for (const d of s.deals) {
    const st = stageOf(s, d)
    const when = (st?.kind === 'won' ? d.closedAt : d.expectedCloseAt) ?? d.expectedCloseAt
    if (!st || st.kind === 'lost' || !when.startsWith(month)) continue
    const row = rows.get(d.ownerId) ?? { won: 0, weighted: 0, open: 0 }
    if (st.kind === 'won') row.won += d.value
    else {
      row.weighted += (d.value * st.probability) / 100
      row.open += d.value
    }
    rows.set(d.ownerId, row)
  }
  return rows
}

// ---------------------------------------------------------------- report builder

export const REPORT_GROUPS = {
  deals: { stage: 'Stage', owner: 'Owner', source: 'Lead source' },
  inquiries: { status: 'Status', channel: 'Channel', listing: 'Listing' },
  contacts: { kind: 'Type', source: 'Source', city: 'City' },
  tasks: { kind: 'Task type', owner: 'Owner', state: 'Due state' },
} as const

export interface ReportRow {
  key: string
  count: number
  value: number
}

/** Groups a dataset for the report builder; `value` sums deal values and is 0 for other datasets. */
export function runReport(s: AppState, r: Pick<SavedReport, 'dataset' | 'groupBy'>, now: number, label: (kind: string, key: string) => string): ReportRow[] {
  const rows = new Map<string, ReportRow>()
  const add = (key: string, value = 0) => {
    const row = rows.get(key) ?? { key, count: 0, value: 0 }
    row.count += 1
    row.value += value
    rows.set(key, row)
  }
  if (r.dataset === 'deals') {
    for (const d of s.deals) {
      const contact = s.contacts.find((c) => c.id === d.contactId)
      const key = r.groupBy === 'stage' ? (stageOf(s, d)?.name ?? '–') : r.groupBy === 'owner' ? label('user', d.ownerId) : label('source', contact?.source ?? '–')
      add(key, d.value)
    }
  } else if (r.dataset === 'inquiries') {
    for (const i of s.inquiries)
      add(r.groupBy === 'status' ? label('status', i.status) : r.groupBy === 'channel' ? label('channel', i.channel) : (s.listings.find((l) => l.id === i.listingId)?.code ?? 'General'))
  } else if (r.dataset === 'contacts') {
    for (const c of s.contacts) add(r.groupBy === 'kind' ? label('kind', c.kind) : r.groupBy === 'source' ? label('source', c.source) : c.city || '–')
  } else {
    for (const t of s.tasks) add(r.groupBy === 'kind' ? label('task', t.kind) : r.groupBy === 'owner' ? label('user', t.ownerId) : label('due', followUpBucket(t, now)))
  }
  return [...rows.values()].sort((a, b) => b.count - a.count)
}

// ---------------------------------------------------------------- blockers

export const dealMoveBlocker = (s: AppState, d: Deal, stageId: string, lostReason?: string) => {
  const to = s.stages.find((st) => st.id === stageId)
  if (!to) return 'Stage not found.'
  if (to.id === d.stageId) return 'The deal is already in this stage.'
  if (to.kind === 'lost' && !lostReason?.trim()) return 'Pick a lost reason.'
  if (to.kind === 'won' && !s.quotations.some((q) => q.dealId === d.id && q.status === 'accepted'))
    return 'The buyer must accept a quotation before the deal is won.'
  return null
}

const quotationBlocker = (s: AppState, id: string, from: Quotation['status'], verb: string) => {
  const q = s.quotations.find((x) => x.id === id)
  if (!q) return 'Quotation not found.'
  return q.status === from ? null : `This quotation is ${QUOTATION_STATUS_LABEL[q.status].toLowerCase()}, so it cannot be ${verb}.`
}

export const stageRemoveBlocker = (s: AppState, st: DealStage) => {
  if (st.kind !== 'open') return 'Won and Lost stages are fixed.'
  const n = s.deals.filter((d) => d.stageId === st.id).length
  return n ? `${n} ${n === 1 ? 'deal sits' : 'deals sit'} in this stage. Move them first.` : null
}

export const campaignSendBlocker = (s: AppState, c: Campaign, now: number) => {
  if (c.status !== 'draft' && c.status !== 'scheduled') return 'This campaign has already been sent or cancelled.'
  if (s.integrations.find((i) => i.kind === 'whatsapp')?.status !== 'connected') return 'Connect the WhatsApp gateway first.'
  const seg = s.segments.find((x) => x.id === c.segmentId)
  if (!seg || !segmentMembers(s, { ...seg.rules, excludeOptOut: true }, now).length) return 'The segment has no contacts who accept marketing.'
  return null
}

export function crmBlocker(s: AppState, a: CrmAction, now: number): string | null {
  switch (a.type) {
    case 'deals/move': {
      const d = s.deals.find((x) => x.id === a.id)
      return d ? dealMoveBlocker(s, d, a.stageId, a.lostReason) : 'Deal not found.'
    }
    case 'quotations/create':
      if (a.quotation.discountPct < 0 || a.quotation.discountPct > 30) return 'Discount must be between 0% and 30%.'
      return a.quotation.listPrice > 0 ? null : 'Enter the list price.'
    case 'quotations/submit':
      return quotationBlocker(s, a.id, 'draft', 'submitted')
    case 'quotations/approve':
    case 'quotations/reject':
      return quotationBlocker(s, a.id, 'pending_approval', a.type === 'quotations/approve' ? 'approved' : 'rejected')
    case 'quotations/send':
      return quotationBlocker(s, a.id, 'approved', 'sent')
    case 'quotations/respond':
      return quotationBlocker(s, a.id, 'sent', 'answered')
    case 'stages/remove': {
      const st = s.stages.find((x) => x.id === a.id)
      return st ? stageRemoveBlocker(s, st) : 'Stage not found.'
    }
    case 'segments/remove': {
      const n = s.campaigns.filter((c) => c.segmentId === a.id && c.status !== 'cancelled').length
      return n ? `${n} ${n === 1 ? 'campaign uses' : 'campaigns use'} this segment.` : null
    }
    case 'campaigns/send': {
      const c = s.campaigns.find((x) => x.id === a.id)
      return c ? campaignSendBlocker(s, c, now) : 'Campaign not found.'
    }
    case 'crmSettings/update':
      return a.patch.lostReasons && !a.patch.lostReasons.length ? 'Keep at least one lost reason.' : null
    case 'contacts/upsert': {
      const dup = contactByPhone(s, a.contact.phone)
      return dup && dup.id !== a.contact.id ? `${dup.name} already uses this phone number.` : null
    }
    case 'referrals/setStatus': {
      const r = s.referrals.find((x) => x.id === a.id)
      if (!r) return 'Referral not found.'
      const allowed: Record<ReferralStatus, ReferralStatus[]> = { pending: ['approved', 'rejected'], approved: ['paid', 'rejected'], paid: [], rejected: [] }
      return allowed[r.status].includes(a.status) ? null : `A ${REFERRAL_STATUS_LABEL[r.status].toLowerCase()} referral cannot become ${REFERRAL_STATUS_LABEL[a.status].toLowerCase()}.`
    }
    case 'forms/submit':
      if (!s.leadForms.find((f) => f.id === a.formId)?.active) return 'This form is closed.'
      return normalizePhone(a.phone).length < 9 ? 'Enter a full WhatsApp number.' : null
    default:
      return null
  }
}

// ---------------------------------------------------------------- automations

const salesAgents = (s: AppState) => s.users.filter((u) => u.status === 'active' && u.roleId === 'rol-sales')

/** Runs enabled rules for a trigger; returns the next state with each rule's run appended. */
export function runWorkflows(
  s: AppState,
  trigger: WorkflowTrigger,
  ctx: { inquiry?: Inquiry; contact?: Contact; deal?: Deal; quotation?: Quotation; task?: CrmTask },
  at: string,
): AppState {
  let next = s
  for (const rule of s.workflows.filter((w) => w.enabled && w.trigger === trigger)) {
    let note = ''
    let ok = true
    if (rule.action === 'assign_round_robin' && ctx.inquiry && !ctx.inquiry.ownerId) {
      const open = (id: string) => next.inquiries.filter((i) => i.ownerId === id && i.status !== 'won' && i.status !== 'lost').length
      const agent = [...salesAgents(next)].sort((a, b) => open(a.id) - open(b.id) || a.name.localeCompare(b.name))[0]
      if (agent) {
        next = { ...next, inquiries: patchById(next.inquiries, ctx.inquiry.id, (i) => ({ ...i, ownerId: agent.id })) }
        note = `Assigned ${ctx.inquiry.code} to ${agent.name}.`
      } else {
        ok = false
        note = 'No active sales agent to assign.'
      }
    } else if (rule.action === 'send_template' && (ctx.inquiry || ctx.contact)) {
      const to = (ctx.inquiry ?? ctx.contact)!
      const tpl = next.templates.find((t) => t.id === rule.param)
      const connected = next.integrations.find((i) => i.kind === 'whatsapp')?.status === 'connected'
      ok = !!tpl && connected
      const listing = next.listings.find((l) => l.id === ctx.inquiry?.listingId)
      const owner = next.users.find((u) => u.id === (ctx.inquiry ? next.inquiries.find((i) => i.id === ctx.inquiry!.id)?.ownerId : ctx.contact!.ownerId))
      if (tpl) {
        const body = fillTemplate(tpl.body, { name: to.name, listing: listing?.code ?? 'your search', agent: owner?.name ?? 'our team' })
        next = { ...next, messages: [{ id: newId('msg'), at, to: to.phone, templateId: tpl.id, body, status: connected ? 'sent' : 'failed' }, ...next.messages] }
      }
      note = ok ? `Sent "${tpl!.name}" to ${to.phone}.` : tpl ? 'WhatsApp gateway is not connected.' : 'Template no longer exists.'
    } else if (rule.action === 'create_task' && (ctx.deal || ctx.quotation)) {
      const deal = ctx.deal ?? next.deals.find((d) => d.id === ctx.quotation!.dealId)
      if (deal) {
        const days = Number(rule.param) || 3
        const task: CrmTask = { id: newId('tsk'), title: `Follow up ${deal.code}`, kind: 'whatsapp', dueAt: addDays(at, days), ownerId: deal.ownerId, ref: { type: 'deal', id: deal.id }, doneAt: null, createdAt: at }
        next = { ...next, tasks: [task, ...next.tasks] }
        note = `Created a follow-up task on ${deal.code}, due in ${days} days.`
      }
    } else if (rule.action === 'notify_owner') {
      const owner = next.users.find((u) => u.id === (ctx.task?.ownerId ?? ctx.deal?.ownerId ?? ctx.contact?.ownerId))
      note = ctx.task ? `Reminded ${owner?.name ?? 'the owner'} that "${ctx.task.title}" is overdue.` : `Notified ${owner?.name ?? 'the owner'} in the app.`
    }
    if (!note) continue
    next = { ...next, workflows: patchById(next.workflows, rule.id, (w) => ({ ...w, runs: [{ id: newId('wr'), at, ok, note }, ...w.runs].slice(0, 50) })) }
  }
  return next
}

/** Every new inquiry gets a contact (matched by phone) and runs the inquiry automations. */
export function onInquiryCreated(s: AppState, inquiry: Inquiry, source: LeadSource, at: string): AppState {
  let next = s
  if (!contactByPhone(s, inquiry.phone)) {
    const contact: Contact = {
      id: newId('con'),
      name: inquiry.name,
      phone: inquiry.phone,
      email: '',
      kind: 'buyer',
      accountId: null,
      source,
      city: '',
      tags: [],
      optOut: false,
      ownerId: inquiry.ownerId,
      custom: {},
      createdAt: at,
    }
    next = runWorkflows({ ...next, contacts: [contact, ...next.contacts] }, 'contact.created', { contact }, at)
  }
  return runWorkflows(next, 'inquiry.created', { inquiry }, at)
}

// ---------------------------------------------------------------- reducer slice

const activity = (s: AppState, by: string, at: string, ref: Ref, kind: Activity['kind'], text: string): AppState => ({
  ...s,
  activities: [{ id: newId('act'), at, by, kind, ref, text }, ...s.activities],
})

export function crmApply(s: AppState, a: CrmAction, at: string, by: string): AppState {
  switch (a.type) {
    case 'contacts/upsert': {
      const next = { ...s, contacts: upsert(s.contacts, a.contact, true) }
      return s.contacts.some((c) => c.id === a.contact.id) ? next : runWorkflows(next, 'contact.created', { contact: a.contact }, at)
    }
    case 'contacts/setOptOut':
      return { ...s, contacts: patchById(s.contacts, a.id, (c) => ({ ...c, optOut: a.optOut })) }
    case 'accounts/upsert':
      return { ...s, accounts: upsert(s.accounts, a.account, true) }
    case 'deals/create': {
      const code = nextCode(s.deals.map((d) => d.code), 'DL-26-', 4)
      const deal = { ...a.deal, code }
      return activity({ ...s, deals: [deal, ...s.deals] }, by, at, { type: 'deal', id: deal.id }, 'stage', `Deal created in ${s.stages.find((st) => st.id === deal.stageId)?.name}.`)
    }
    case 'deals/update':
      return { ...s, deals: patchById(s.deals, a.id, (d) => ({ ...d, ...a.patch, updatedAt: at })) }
    case 'deals/move': {
      const to = s.stages.find((st) => st.id === a.stageId)!
      const closing = to.kind !== 'open'
      let next: AppState = {
        ...s,
        deals: patchById(s.deals, a.id, (d) => ({ ...d, stageId: a.stageId, lostReason: to.kind === 'lost' ? a.lostReason!.trim() : null, closedAt: closing ? at : null, updatedAt: at })),
      }
      next = activity(next, by, at, { type: 'deal', id: a.id }, 'stage', to.kind === 'lost' ? `Lost: ${a.lostReason}.` : `Moved to ${to.name}.`)
      return runWorkflows(next, 'deal.stage_changed', { deal: next.deals.find((d) => d.id === a.id) }, at)
    }
    case 'quotations/create': {
      const previous = s.quotations.filter((q) => q.dealId === a.quotation.dealId && q.status !== 'superseded' && q.status !== 'accepted' && q.status !== 'rejected')
      const version = 1 + Math.max(0, ...s.quotations.filter((q) => q.dealId === a.quotation.dealId).map((q) => q.version))
      const quotation = { ...a.quotation, code: nextQuotationCode(s), version, status: 'draft' as const, createdBy: by, createdAt: at }
      return {
        ...s,
        // A revision replaces every open version of the same deal.
        quotations: [quotation, ...s.quotations.map((q) => (previous.includes(q) ? { ...q, status: 'superseded' as const } : q))],
      }
    }
    case 'quotations/submit':
      return {
        ...s,
        quotations: patchById(s.quotations, a.id, (q) => ({ ...q, status: needsApproval(q) ? 'pending_approval' : 'approved' })),
      }
    case 'quotations/approve':
      return { ...s, quotations: patchById(s.quotations, a.id, (q) => ({ ...q, status: 'approved', approvedBy: by })) }
    case 'quotations/reject':
      return { ...s, quotations: patchById(s.quotations, a.id, (q) => ({ ...q, status: 'rejected' })) }
    case 'quotations/send': {
      const next = { ...s, quotations: patchById(s.quotations, a.id, (q) => ({ ...q, status: 'sent' as const, sentAt: at })) }
      const q = next.quotations.find((x) => x.id === a.id)!
      return runWorkflows(activity(next, by, at, { type: 'deal', id: q.dealId }, 'quotation', `Sent ${q.code}.`), 'quotation.sent', { quotation: q }, at)
    }
    case 'quotations/respond': {
      const q = s.quotations.find((x) => x.id === a.id)!
      let next: AppState = { ...s, quotations: patchById(s.quotations, a.id, (x) => ({ ...x, status: a.accepted ? 'accepted' : 'rejected' })) }
      next = activity(next, by, at, { type: 'deal', id: q.dealId }, 'quotation', `${q.code} ${a.accepted ? 'accepted' : 'declined'} by the buyer.`)
      // An accepted offer moves an earlier-stage deal to the booking stage.
      const deal = next.deals.find((d) => d.id === q.dealId)
      const booking = next.stages.find((st) => st.id === 'stg-booking')
      const current = deal && stageOf(next, deal)
      if (a.accepted && deal && booking && current?.kind === 'open' && current.probability < booking.probability) {
        next = { ...next, deals: patchById(next.deals, deal.id, (d) => ({ ...d, stageId: booking.id, value: netPrice(q), updatedAt: at })) }
      }
      return next
    }
    case 'tasks/create':
      return { ...s, tasks: [a.task, ...s.tasks] }
    case 'tasks/complete':
      return { ...s, tasks: patchById(s.tasks, a.id, (t) => ({ ...t, doneAt: at })) }
    case 'tasks/reopen':
      return { ...s, tasks: patchById(s.tasks, a.id, (t) => ({ ...t, doneAt: null })) }
    case 'tasks/flagOverdue':
      return a.ids.reduce((next, id) => {
        const flagged = { ...next, tasks: patchById(next.tasks, id, (t) => ({ ...t, overdueFlaggedAt: at })) }
        return runWorkflows(flagged, 'task.overdue', { task: flagged.tasks.find((t) => t.id === id) }, at)
      }, s)
    case 'activities/add':
      return { ...s, activities: [a.activity, ...s.activities] }
    case 'targets/set':
      return { ...s, targets: upsert(s.targets.filter((t) => !(t.userId === a.target.userId && t.month === a.target.month) || t.id === a.target.id), a.target) }
    case 'stages/upsert':
      return { ...s, stages: upsert(s.stages, a.stage) }
    case 'stages/remove':
      return { ...s, stages: s.stages.filter((st) => st.id !== a.id) }
    case 'crmSettings/update':
      return { ...s, crmSettings: { ...s.crmSettings, ...a.patch } }
    case 'conversations/reply':
      return { ...s, conversations: patchById(s.conversations, a.id, (c) => ({ ...c, messages: [...c.messages, a.message], readAt: at, status: 'open' })) }
    case 'conversations/assign':
      return { ...s, conversations: patchById(s.conversations, a.id, (c) => ({ ...c, assigneeId: a.assigneeId })) }
    case 'conversations/markRead':
      return { ...s, conversations: patchById(s.conversations, a.id, (c) => ({ ...c, readAt: at })) }
    case 'conversations/setStatus':
      return { ...s, conversations: patchById(s.conversations, a.id, (c) => ({ ...c, status: a.status })) }
    case 'segments/upsert':
      return { ...s, segments: upsert(s.segments, a.segment, true) }
    case 'segments/remove':
      return { ...s, segments: s.segments.filter((x) => x.id !== a.id) }
    case 'campaigns/upsert':
      return { ...s, campaigns: upsert(s.campaigns, a.campaign, true) }
    case 'campaigns/schedule':
      return { ...s, campaigns: patchById(s.campaigns, a.id, (c) => ({ ...c, status: 'scheduled', scheduledAt: a.scheduledAt })) }
    case 'campaigns/cancel':
      return { ...s, campaigns: patchById(s.campaigns, a.id, (c) => ({ ...c, status: 'cancelled' })) }
    case 'campaigns/send': {
      const c = s.campaigns.find((x) => x.id === a.id)!
      const seg = s.segments.find((x) => x.id === c.segmentId)!
      const recipients = segmentMembers(s, { ...seg.rules, excludeOptOut: true }, toMs(at))
      const tpl = s.templates.find((t) => t.id === c.templateId)
      const listing = s.listings.find((l) => l.id === c.listingId)
      const messages = recipients.map((r) => ({
        id: newId('msg'),
        at,
        to: r.phone,
        templateId: c.templateId,
        body: fillTemplate(tpl?.body ?? '', { name: r.name, listing: listing?.title ?? '', price: listing ? `Rp ${(listing.price / 1e9).toFixed(2)} B` : '' }),
        status: 'sent' as const,
      }))
      const n = recipients.length
      // Delivery figures arrive from the gateway later; the mock settles them at send time.
      const stats = { sent: n, delivered: n, read: Math.round(n * 0.7), replied: Math.round(n * 0.2), optedOut: 0, failed: 0 }
      return {
        ...s,
        messages: [...messages, ...s.messages],
        campaigns: patchById(s.campaigns, a.id, (x) => ({ ...x, status: 'done', scheduledAt: x.scheduledAt ?? at, stats, recipientIds: recipients.map((r) => r.id) })),
      }
    }
    case 'forms/upsert':
      return { ...s, leadForms: upsert(s.leadForms, a.form, true) }
    case 'forms/submit': {
      const form = s.leadForms.find((f) => f.id === a.formId)!
      const inquiry: Inquiry = {
        id: newId('inq'),
        code: nextCode(s.inquiries.map((i) => i.code), 'INQ-26-', 4),
        listingId: form.listingId,
        name: a.name.trim(),
        phone: a.phone.trim(),
        channel: 'web_chat',
        message: a.message.trim() || `Submitted "${form.name}".`,
        budget: a.budget,
        formId: form.id,
        status: 'new',
        ownerId: null,
        createdAt: at,
        updatedAt: at,
      }
      return onInquiryCreated({ ...s, inquiries: [inquiry, ...s.inquiries] }, inquiry, 'form', at)
    }
    case 'workflows/upsert':
      return { ...s, workflows: upsert(s.workflows, a.rule) }
    case 'reports/upsert':
      return { ...s, reports: upsert(s.reports, a.report, true) }
    case 'reports/remove':
      return { ...s, reports: s.reports.filter((r) => r.id !== a.id) }
    case 'referrals/create':
      return { ...s, referrals: [a.referral, ...s.referrals] }
    case 'referrals/setStatus':
      return { ...s, referrals: patchById(s.referrals, a.id, (r) => ({ ...r, status: a.status })) }
  }
}
