/**
 * Jessy in the console: a rule-based assistant for the signed-in member. Reads answer from the store and log the
 * gateway tool they used; changes are proposed first and only "Confirm" returns the store actions, which the chat
 * dispatches as the member. Same Turn and Engine shape as the buyer and partner chats in `jessy.ts`.
 */
import type { AttendanceState, Permission, TaskKind } from '@artha/types'
import { CANDIDATE_STAGE_LABEL, PERMISSION_GROUPS, TASK_KIND_LABEL } from '@artha/types'
import { DAY, toMs } from './clock'
import { stageOf } from './crm'
import { daysLeft, exclusiveState } from './exclusives'
import { agingBucket, customerName, invoiceTotals, receivableAging } from './finance'
import { fmtDate, fmtDateTime, fmtIdrShort, fmtTime, newId } from './format'
import { attendanceState, buildCheckIn, currentEmployees, currentStep, employeeName, employeeOfUser, leaveBalance, requestsAwaiting, shiftOn, ymd } from './hr'
import type { Engine, Reply, Turn } from './jessy'
import { bestPrice, fmtQty, lowStock, nextPrCode, onHand, prsAwaiting, prTotal, stockByWarehouse } from './purchasing'
import type { AppAction, AppState } from './store'
import { blockerFor, reduce } from './store'

export interface ConsoleCtx {
  userId: string
  permissions: Permission[]
}

/** A record an answer points at; the web maps the kind to a console path. */
export type RecordLinkKind = 'attendance' | 'item' | 'stock' | 'deal' | 'pipeline' | 'candidate' | 'hrRequest' | 'pr' | 'quotation' | 'invoice' | 'listing' | 'exclusives' | 'announcements' | 'followUps' | 'approvals' | 'meRequests' | 'me'

export interface RecordLink {
  kind: RecordLinkKind
  id?: string
  label: string
}

export interface ConsoleReply extends Reply {
  links?: RecordLink[]
}

/** A change waiting for Confirm. Actions are rebuilt on Confirm, so they run against the state at that moment. */
export type ConsoleIntent =
  | { kind: 'pr'; itemId: string; qty: number; reason: string }
  | { kind: 'decide'; target: 'hr' | 'pr' | 'quotation'; id: string; decision: 'approved' | 'rejected'; note: string }
  | { kind: 'checkIn' }
  | { kind: 'announce'; title: string; body: string }
  | { kind: 'task'; dealId: string; title: string; taskKind: TaskKind; dueAt: string }

export interface ConsoleConvo {
  ctx: ConsoleCtx
  pending: ConsoleIntent | null
}

type ConsoleTurn = Turn<ConsoleConvo> & { replies: ConsoleReply[] }

const CONFIRM = /^(confirm|yes|ya|ok|oke|okay|lanjut|setuju|do it|go ahead)\b/
const CANCEL = /^(cancel|no|tidak|batal|jangan|stop)\b/
const CODE = /\b([a-z]{2,3}-\d{2}-\d{4})\b/i

const has = (t: string, pattern: RegExp) => pattern.test(t)
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const firstName = (name: string) => name.split(' ')[0]

const PERMISSION_LABEL = new Map<string, string>(PERMISSION_GROUPS.flatMap((g) => g.items.map(([key, label]) => [key, label] as [string, string])))

const can = (ctx: ConsoleCtx, p: Permission) => ctx.permissions.includes(p)

const refuse = (convo: ConsoleConvo, p: Permission, what: string, purpose: string): ConsoleTurn => ({
  convo,
  actions: [],
  replies: [{ text: `Sorry, your role cannot see ${what}. It needs the "${PERMISSION_LABEL.get(p) ?? p}" permission. An admin can add it to your role.` }],
  log: { purpose, tools: [] },
})

const say = (convo: ConsoleConvo, purpose: string, tools: string[], ...replies: ConsoleReply[]): ConsoleTurn => ({ convo, actions: [], replies, log: { purpose, tools } })

/** Lowercase words of 2+ letters or digits, without filler. */
const STOP = new Set(['of', 'and', 'the', 'for', 'box', 'pack', 'set', 'pcs', 'to', 'in', 'on', 'a', 'an', 'ml', 'kg', 'gb', 'x', 'm'])
const words = (text: string) => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 2 && !STOP.has(w))

/** The row whose name shares the most words with the text; null when nothing matches. */
const bestMatch = <T>(rows: T[], name: (r: T) => string, text: string): T | null => {
  const said = new Set(words(text))
  let best: T | null = null
  let score = 0
  for (const r of rows) {
    const w = words(name(r))
    const hit = w.filter((x) => said.has(x)).length
    const value = hit + (w.length ? hit / w.length : 0)
    if (hit && value > score) {
      best = r
      score = value
    }
  }
  return best
}

// ---------------------------------------------------------------- start and help

interface Ability {
  needs: Permission | null
  line: string
  starter: string
}

const ABILITIES: Ability[] = [
  { needs: 'hr.view', line: 'Who is in, late or on leave today, by department', starter: 'Who is late today?' },
  { needs: 'purchase.view', line: 'Low stock, and the stock of a named item', starter: 'What is low on stock?' },
  { needs: 'deal.view', line: 'Won deals this month, last month or this quarter, and the pipeline by stage', starter: 'Sales this month' },
  { needs: 'hr.view', line: 'A candidate\'s status by name', starter: 'Candidates in interview' },
  { needs: null, line: 'What waits for your approval', starter: 'What waits for my approval?' },
  { needs: 'finance.view', line: 'Overdue invoices', starter: 'Overdue invoices' },
  { needs: 'exclusive.view', line: 'Exclusive rights that end soon', starter: 'Exclusive rights expiring soon' },
  { needs: null, line: 'Your leave balance', starter: 'My leave balance' },
  { needs: 'purchase.request', line: 'Raise a purchase request, such as "raise a PR for 10 A4 paper"', starter: 'Raise a PR for 10 A4 paper' },
  { needs: null, line: 'Approve or reject a request that waits for you, by code or name', starter: '' },
  { needs: null, line: 'Check you in for today', starter: 'Check me in' },
  { needs: 'employee.manage', line: 'Post an announcement, such as "announce Office closed Friday: The office closes at noon."', starter: '' },
  { needs: 'deal.manage', line: 'Add a follow-up task on a deal, such as "follow up DL-26-0041 tomorrow by call"', starter: '' },
]

const abilitiesFor = (ctx: ConsoleCtx) => ABILITIES.filter((a) => !a.needs || can(ctx, a.needs))
const starters = (ctx: ConsoleCtx) => abilitiesFor(ctx).map((a) => a.starter).filter(Boolean).slice(0, 5)

export const consoleStart = (s: AppState, ctx: ConsoleCtx): Turn<ConsoleConvo> => {
  const name = s.users.find((u) => u.id === ctx.userId)?.name ?? 'there'
  return {
    convo: { ctx, pending: null },
    actions: [],
    replies: [
      {
        text: `Hi ${firstName(name)}, I am ${s.settings.agentName}. I answer from live data and make changes for you after you confirm them. Ask me something, or type "help" to see what I can do.`,
        quick: starters(ctx),
      },
    ],
  }
}

const help = (convo: ConsoleConvo): ConsoleTurn => {
  const mine = abilitiesFor(convo.ctx)
  const text = ['Here is what I can do for your role:', ...mine.map((a) => `• ${a.line}`), 'I always show a change first and run it only after you tap Confirm.'].join('\n')
  return say(convo, 'Help', [], { text, quick: starters(convo.ctx) })
}

// ---------------------------------------------------------------- reads

const ATTENDANCE_ORDER: AttendanceState[] = ['present', 'late', 'leave', 'absent', 'upcoming']
const ATTENDANCE_WORD: Partial<Record<AttendanceState, string>> = { present: 'In on time', late: 'Late', leave: 'On leave', absent: 'Absent', upcoming: 'Not in yet' }

const readAttendance = (s: AppState, convo: ConsoleConvo, t: string, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'hr.view')) return refuse(convo, 'hr.view', 'attendance', 'Read attendance')
  const now = toMs(at)
  const today = ymd(at)
  const dept = s.departments.find((d) => {
    const name = d.name.toLowerCase()
    return t.includes(name) || new RegExp(`\\b${name.split(' ')[0]}\\b`).test(t)
  })
  const people = currentEmployees(s).filter((e) => !dept || e.departmentId === dept.id)
  const groups = new Map<AttendanceState, string[]>()
  for (const e of people) {
    const st = attendanceState(s, e.id, today, now)
    groups.set(st, [...(groups.get(st) ?? []), e.name])
  }
  const only: AttendanceState | null = has(t, /\b(late|telat|terlambat)\b/) ? 'late' : has(t, /\b(leave|cuti)\b/) ? 'leave' : has(t, /\b(absent|bolos|tidak hadir)\b/) ? 'absent' : null
  const scope = dept ? ` in ${dept.name}` : ''
  const lines = (only ? [only] : ATTENDANCE_ORDER).flatMap((st) => {
    const names = groups.get(st) ?? []
    if (only) return [names.length ? `${ATTENDANCE_WORD[st]}: ${names.join(', ')}` : `Nobody is ${ATTENDANCE_WORD[st]!.toLowerCase()}${scope} today.`]
    return names.length ? [`${ATTENDANCE_WORD[st]} (${names.length}): ${names.join(', ')}`] : []
  })
  const head = `Attendance on ${fmtDate(at)} for ${plural(people.length, 'person', 'people')}${scope}:`
  return say(convo, 'Read attendance', ['read_attendance'], { text: [head, ...lines].join('\n'), links: [{ kind: 'attendance', label: 'Open attendance' }] })
}

const readStock = (s: AppState, convo: ConsoleConvo, t: string): ConsoleTurn => {
  if (!can(convo.ctx, 'purchase.view')) return refuse(convo, 'purchase.view', 'stock', 'Read stock')
  const item = has(t, /\b(low|rendah|habis|menipis|minimum)\b/) ? null : bestMatch(s.items.filter((i) => i.active), (i) => i.name, t.replace(/\b(stock|stok|of|how much|how many|on hand|persediaan)\b/g, ' '))
  if (item) {
    const total = onHand(s, item.id)
    const by = stockByWarehouse(s, item.id).filter((w) => w.qty !== 0)
    const lines = by.map((w) => `• ${w.warehouse.name}: ${fmtQty(s, item.id, w.qty)}`)
    const low = total < item.minStock ? ` That is below the minimum of ${fmtQty(s, item.id, item.minStock)}.` : ''
    return say(convo, 'Read stock', ['read_stock'], {
      text: [`${item.name}: ${fmtQty(s, item.id, total)} on hand.${low}`, ...lines].join('\n'),
      links: [{ kind: 'item', id: item.id, label: item.name }],
    })
  }
  const low = lowStock(s)
  if (!low.length) return say(convo, 'Read stock', ['read_stock'], { text: 'Every active item is at or above its minimum stock.', links: [{ kind: 'stock', label: 'Open stock' }] })
  const lines = low.map((r) => `• ${r.item.name}: ${fmtQty(s, r.item.id, r.qty)}, ${fmtQty(s, r.item.id, r.short)} short`)
  return say(convo, 'Read stock', ['read_stock'], {
    text: [`${plural(low.length, 'item is', 'items are')} below minimum stock:`, ...lines].join('\n'),
    links: low.slice(0, 4).map((r) => ({ kind: 'item', id: r.item.id, label: r.item.name })),
    quick: can(convo.ctx, 'purchase.request') ? [`Raise a PR for ${Math.ceil(low[0].short)} ${low[0].item.name}`] : undefined,
  })
}

const periodOf = (t: string, at: string) => {
  const d = new Date(at)
  const y = d.getFullYear()
  const m = d.getMonth()
  if (has(t, /\b(last month|bulan lalu|previous month)\b/)) return { label: 'last month', from: new Date(y, m - 1, 1), to: new Date(y, m, 1) }
  if (has(t, /\b(quarter|kuartal|triwulan|q[1-4])\b/)) {
    const q = Math.floor(m / 3) * 3
    return { label: 'this quarter', from: new Date(y, q, 1), to: new Date(y, q + 3, 1) }
  }
  return { label: 'this month', from: new Date(y, m, 1), to: new Date(y, m + 1, 1) }
}

const readSales = (s: AppState, convo: ConsoleConvo, t: string, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'deal.view')) return refuse(convo, 'deal.view', 'sales', 'Read sales')
  if (has(t, /\b(pipeline|stage|stages|tahap|funnel)\b/)) {
    const open = s.stages.filter((st) => st.kind === 'open')
    const lines = open.map((st) => {
      const deals = s.deals.filter((d) => d.stageId === st.id)
      return `• ${st.name}: ${plural(deals.length, 'deal')}, ${fmtIdrShort(deals.reduce((n, d) => n + d.value, 0))}`
    })
    const all = s.deals.filter((d) => stageOf(s, d)?.kind === 'open')
    return say(convo, 'Read sales', ['read_sales'], {
      text: [`The open pipeline holds ${plural(all.length, 'deal')} worth ${fmtIdrShort(all.reduce((n, d) => n + d.value, 0))}.`, ...lines].join('\n'),
      links: [{ kind: 'pipeline', label: 'Open the pipeline' }],
    })
  }
  const p = periodOf(t, at)
  const won = s.deals.filter((d) => stageOf(s, d)?.kind === 'won' && d.closedAt && toMs(d.closedAt) >= p.from.getTime() && toMs(d.closedAt) < p.to.getTime())
  if (!won.length) return say(convo, 'Read sales', ['read_sales'], { text: `No deals were won ${p.label}.`, quick: ['Pipeline by stage'] })
  const value = won.reduce((n, d) => n + d.value, 0)
  return say(convo, 'Read sales', ['read_sales'], {
    text: [`${plural(won.length, 'deal')} won ${p.label}, worth ${fmtIdrShort(value)}:`, ...won.map((d) => `• ${d.code} ${d.title}, ${fmtIdrShort(d.value)}`)].join('\n'),
    links: won.slice(0, 4).map((d) => ({ kind: 'deal', id: d.id, label: d.code })),
    quick: ['Pipeline by stage'],
  })
}

const readCandidate = (s: AppState, convo: ConsoleConvo, t: string, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'hr.view')) return refuse(convo, 'hr.view', 'candidates', 'Read candidates')
  const stage = (Object.keys(CANDIDATE_STAGE_LABEL) as (keyof typeof CANDIDATE_STAGE_LABEL)[]).find((k) => t.includes(CANDIDATE_STAGE_LABEL[k].toLowerCase()))
  const c = bestMatch(s.candidates, (x) => x.name, t)
  if (!c) {
    const rows = stage ? s.candidates.filter((x) => x.stage === stage) : []
    if (!rows.length) return say(convo, 'Read candidates', ['read_candidates'], { text: 'Which candidate? Give me a name, for example "status of Clara Wijaya".' })
    return say(convo, 'Read candidates', ['read_candidates'], {
      text: [`${plural(rows.length, 'candidate is', 'candidates are')} at ${CANDIDATE_STAGE_LABEL[stage!]}:`, ...rows.map((x) => `• ${x.name}`)].join('\n'),
      links: rows.slice(0, 4).map((x) => ({ kind: 'candidate', id: x.id, label: x.name })),
    })
  }
  const opening = s.jobOpenings.find((o) => o.id === c.openingId)
  const next = c.interviews.filter((i) => toMs(i.at) >= toMs(at)).sort((a, b) => a.at.localeCompare(b.at))[0]
  const lines = [
    `${c.name} is at ${CANDIDATE_STAGE_LABEL[c.stage]}${opening ? ` for ${opening.title} (${opening.code})` : ', in the talent pool'}.`,
    c.tests.length ? `Tests taken: ${c.tests.length}, best score ${Math.max(...c.tests.map((x) => x.score))}.` : '',
    next ? `Next interview: ${fmtDateTime(next.at)}, ${next.mode === 'video' ? 'video call' : 'on site'}.` : '',
    c.offer ? `Offer: ${fmtIdrShort(c.offer.salary)} a month, ${c.offer.status}.` : '',
    c.stage === 'rejected' && c.rejectReason ? `Reason: ${c.rejectReason}` : '',
  ].filter(Boolean)
  return say(convo, 'Read candidates', ['read_candidates'], { text: lines.join('\n'), links: [{ kind: 'candidate', id: c.id, label: c.name }] })
}

interface Awaiting {
  target: 'hr' | 'pr' | 'quotation'
  id: string
  code: string
  who: string
  line: string
}

/** Everything the member may decide now: HR requests, purchase requests and, with deal.approve, discounted quotations. */
const awaiting = (s: AppState, ctx: ConsoleCtx): Awaiting[] => [
  ...requestsAwaiting(s, ctx.userId, can(ctx, 'request.approve')).map((r): Awaiting => {
    const what = r.leave ? `${plural(r.leave.days, 'day')} of leave from ${fmtDate(r.leave.from)}` : r.overtime ? `${r.overtime.hours} h overtime` : `loan of ${fmtIdrShort(r.loan?.amount ?? 0)}`
    const who = employeeName(s, r.employeeId)
    return { target: 'hr', id: r.id, code: r.code, who, line: `${r.code} · ${who}, ${what}, ${currentStep(r)!.label} step` }
  }),
  ...prsAwaiting(s, ctx.userId, can(ctx, 'purchase.approve')).map((r): Awaiting => {
    const who = employeeName(s, r.requesterId)
    return { target: 'pr', id: r.id, code: r.code, who, line: `${r.code} · ${who}, ${plural(r.lines.length, 'item')}, about ${fmtIdrShort(prTotal(r))}` }
  }),
  ...(can(ctx, 'deal.approve') ? s.quotations.filter((q) => q.status === 'pending_approval') : []).map((q): Awaiting => {
    const deal = s.deals.find((d) => d.id === q.dealId)
    return { target: 'quotation', id: q.id, code: q.code, who: deal?.title ?? 'Deal', line: `${q.code} · ${deal?.title ?? 'Deal'}, ${q.discountPct}% discount` }
  }),
]

const LINK_FOR: Record<Awaiting['target'], RecordLinkKind> = { hr: 'hrRequest', pr: 'pr', quotation: 'quotation' }

const readApprovals = (s: AppState, convo: ConsoleConvo): ConsoleTurn => {
  const rows = awaiting(s, convo.ctx)
  if (!rows.length) return say(convo, 'Read approvals', ['read_approvals'], { text: 'Nothing waits for your approval right now.' })
  return say(convo, 'Read approvals', ['read_approvals'], {
    text: [`${plural(rows.length, 'request waits', 'requests wait')} for you:`, ...rows.map((r) => `• ${r.line}`), 'Say "approve" or "reject" with a code to decide one.'].join('\n'),
    links: [...rows.slice(0, 4).map((r) => ({ kind: LINK_FOR[r.target], id: r.id, label: r.code })), { kind: 'approvals', label: 'All approvals' }],
    quick: rows.slice(0, 2).map((r) => `Approve ${r.code}`),
  })
}

const readReceivables = (s: AppState, convo: ConsoleConvo, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'finance.view')) return refuse(convo, 'finance.view', 'invoices', 'Read receivables')
  const now = toMs(at)
  const overdue = s.invoices
    .filter((i) => i.status === 'issued' && agingBucket(i.dueDate, now) > 0)
    .map((i) => ({ i, balance: invoiceTotals(i).balance }))
    .filter((r) => r.balance > 0)
    .sort((a, b) => a.i.dueDate.localeCompare(b.i.dueDate))
  if (!overdue.length) return say(convo, 'Read receivables', ['read_receivables'], { text: 'No invoice is overdue.' })
  const total = receivableAging(s, now).totals.slice(1).reduce((n, x) => n + x, 0)
  const lines = overdue.map(({ i, balance }) => `• ${i.code} · ${customerName(s, i)}, ${fmtIdrShort(balance)}, ${plural(Math.floor((now - toMs(i.dueDate)) / DAY), 'day')} late`)
  return say(convo, 'Read receivables', ['read_receivables'], {
    text: [`${plural(overdue.length, 'invoice is', 'invoices are')} overdue, ${fmtIdrShort(total)} in all:`, ...lines].join('\n'),
    links: overdue.slice(0, 4).map(({ i }) => ({ kind: 'invoice', id: i.id, label: i.code })),
  })
}

const readExclusives = (s: AppState, convo: ConsoleConvo, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'exclusive.view')) return refuse(convo, 'exclusive.view', 'exclusive rights', 'Read exclusive rights')
  const now = toMs(at)
  const due = s.exclusives.filter((e) => exclusiveState(e, now) === 'due').sort((a, b) => a.endsAt.localeCompare(b.endsAt))
  if (!due.length) return say(convo, 'Read exclusive rights', ['read_exclusives'], { text: 'No exclusive right ends in the next 30 days.', links: [{ kind: 'exclusives', label: 'Open exclusive rights' }] })
  const lines = due.map((e) => {
    const l = s.listings.find((x) => x.id === e.listingId)
    return `• ${l?.code ?? 'Listing'} ${l?.title ?? ''}, ends ${fmtDate(e.endsAt)}, ${plural(daysLeft(e, now), 'day')} left`
  })
  return say(convo, 'Read exclusive rights', ['read_exclusives'], {
    text: [`${plural(due.length, 'exclusive right ends', 'exclusive rights end')} within 30 days:`, ...lines].join('\n'),
    links: [...due.slice(0, 3).map((e) => ({ kind: 'listing' as const, id: e.listingId, label: s.listings.find((x) => x.id === e.listingId)?.code ?? 'Listing' })), { kind: 'exclusives', label: 'All exclusive rights' }],
  })
}

const readLeave = (s: AppState, convo: ConsoleConvo, at: string): ConsoleTurn => {
  const me = employeeOfUser(s, convo.ctx.userId)
  if (!me) return say(convo, 'Read leave balance', [], { text: 'You have no employee record, so there is no leave balance to show.' })
  const year = new Date(at).getFullYear()
  const b = leaveBalance(s, me.id, year)
  const pending = b.pending ? `, and ${plural(b.pending, 'day')} wait${b.pending === 1 ? 's' : ''} for approval` : ''
  return say(convo, 'Read leave balance', ['read_leave'], {
    text: `You have ${plural(b.left, 'day')} of annual leave left in ${year}. Your quota is ${b.quota}, you have used ${b.used}${pending}.`,
    links: [{ kind: 'meRequests', label: 'My requests' }],
  })
}

// ---------------------------------------------------------------- writes

interface Built {
  actions: AppAction[]
  title: string
  lines: string[]
  /** What Jessy says once the change ran. */
  done: string
  links: RecordLink[]
}

/** The first store refusal across the actions, each checked against the state the earlier ones leave. */
const firstBlocker = (s: AppState, actions: AppAction[], by: string, at: string) => {
  let acc = s
  for (const action of actions) {
    const blocker = blockerFor(acc, action)
    if (blocker) return blocker
    acc = reduce(acc, { action, meta: { by, at } })
  }
  return null
}

const PROPOSE_PURPOSE: Record<ConsoleIntent['kind'], string> = {
  pr: 'Propose purchase request',
  decide: 'Propose decision',
  checkIn: 'Propose check-in',
  announce: 'Propose announcement',
  task: 'Propose follow-up',
}

const NEEDS: Record<ConsoleIntent['kind'], Permission | null> = { pr: 'purchase.request', decide: null, checkIn: null, announce: 'employee.manage', task: 'deal.manage' }

/** `days` from `at`, on the hour given, local time. */
const dayAt = (at: string, days: number, hour: number) => {
  const d = new Date(at)
  d.setDate(d.getDate() + days)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

/** Builds the store actions for an intent, or the sentence saying why it cannot run. */
const build = (s: AppState, ctx: ConsoleCtx, intent: ConsoleIntent, at: string): Built | string => {
  const me = employeeOfUser(s, ctx.userId)
  switch (intent.kind) {
    case 'pr': {
      if (!me) return 'You have no employee record, so I cannot raise a request in your name.'
      const item = s.items.find((i) => i.id === intent.itemId)!
      const estPrice = bestPrice(s, item.id, intent.qty, at)?.price ?? 0
      const pr = {
        id: newId('pr'),
        code: nextPrCode(s),
        requesterId: me.id,
        departmentId: me.departmentId,
        neededBy: dayAt(at, 7, 0),
        reason: intent.reason,
        lines: [{ id: newId('prl'), itemId: item.id, qty: intent.qty, estPrice, note: '' }],
        status: 'draft' as const,
        steps: [],
        poId: null,
        createdBy: ctx.userId,
        createdAt: at,
      }
      return {
        actions: [{ type: 'prs/save', pr }, { type: 'prs/submit', id: pr.id }],
        title: `Raise purchase request ${pr.code}`,
        lines: [`Item: ${item.name}`, `Quantity: ${fmtQty(s, item.id, intent.qty)}`, `Estimate: ${estPrice ? fmtIdrShort(estPrice * intent.qty) : 'no vendor price yet'}`, `Needed by: ${fmtDate(pr.neededBy)}`, `Reason: ${intent.reason}`, 'It goes for approval as soon as you confirm.'],
        done: `Done. ${pr.code} for ${fmtQty(s, item.id, intent.qty)} of ${item.name} is waiting for approval.`,
        links: [{ kind: 'pr', id: pr.id, label: pr.code }],
      }
    }
    case 'decide': {
      const verb = intent.decision === 'approved' ? 'Approve' : 'Reject'
      const action: AppAction =
        intent.target === 'hr'
          ? { type: 'hrRequests/decide', id: intent.id, decision: intent.decision, note: intent.note, by: ctx.userId }
          : intent.target === 'pr'
            ? { type: 'prs/decide', id: intent.id, decision: intent.decision, note: intent.note, by: ctx.userId }
            : { type: intent.decision === 'approved' ? 'quotations/approve' : 'quotations/reject', id: intent.id }
      const row = awaiting(s, ctx).find((r) => r.id === intent.id)
      const code = row?.code ?? intent.id
      return {
        actions: [action],
        title: `${verb} ${code}`,
        lines: [row?.line ?? code, ...(intent.note ? [`Note: ${intent.note}`] : [])],
        done: `Done. You ${intent.decision} ${code}.`,
        links: [{ kind: LINK_FOR[intent.target], id: intent.id, label: code }],
      }
    }
    case 'checkIn': {
      if (!me) return 'You have no employee record, so there is nothing to check in.'
      const attendance = buildCheckIn(s, me.id, at, null, null)
      const shift = shiftOn(s, me.id, attendance.date)
      return {
        actions: [{ type: 'attendance/checkIn', attendance }],
        title: `Check in at ${fmtTime(at)}`,
        lines: [`Employee: ${me.name}`, `Date: ${fmtDate(at)}`, shift ? `Shift: ${shift.name}, ${shift.start} to ${shift.end}` : 'No shift today', 'No photo or location is sent from the chat.'],
        done: `Done. You checked in at ${fmtTime(at)}.`,
        links: [{ kind: 'me', label: 'My day' }],
      }
    }
    case 'announce': {
      const announcement = { id: newId('ann'), title: intent.title, body: intent.body, departmentId: null, pinned: false, authorId: ctx.userId, publishedAt: at, readBy: [ctx.userId] }
      return {
        actions: [{ type: 'announcements/upsert', announcement }],
        title: 'Post an announcement',
        lines: [`Title: ${intent.title}`, `Message: ${intent.body}`, 'Audience: everyone'],
        done: `Done. "${intent.title}" is posted for everyone.`,
        links: [{ kind: 'announcements', label: 'Announcements' }],
      }
    }
    case 'task': {
      const deal = s.deals.find((d) => d.id === intent.dealId)!
      const task = { id: newId('tsk'), title: intent.title, kind: intent.taskKind, dueAt: intent.dueAt, ownerId: ctx.userId, ref: { type: 'deal' as const, id: deal.id }, doneAt: null, createdAt: at }
      return {
        actions: [{ type: 'tasks/create', task }],
        title: 'Add a follow-up',
        lines: [`Deal: ${deal.code} ${deal.title}`, `Task: ${intent.title}`, `Kind: ${TASK_KIND_LABEL[intent.taskKind]}`, `Due: ${fmtDateTime(intent.dueAt)}`, `Owner: you`],
        done: `Done. The follow-up on ${deal.code} is due ${fmtDateTime(intent.dueAt)}.`,
        links: [{ kind: 'deal', id: deal.id, label: deal.code }, { kind: 'followUps', label: 'Follow-ups' }],
      }
    }
  }
}

const propose = (s: AppState, convo: ConsoleConvo, intent: ConsoleIntent, at: string): ConsoleTurn => {
  const purpose = PROPOSE_PURPOSE[intent.kind]
  const needs = NEEDS[intent.kind]
  if (needs && !can(convo.ctx, needs)) {
    return say({ ...convo, pending: null }, purpose, [], { text: `Sorry, your role cannot do that. It needs the "${PERMISSION_LABEL.get(needs) ?? needs}" permission.` })
  }
  const built = build(s, convo.ctx, intent, at)
  if (typeof built === 'string') return say({ ...convo, pending: null }, purpose, [], { text: built })
  const blocker = firstBlocker(s, built.actions, convo.ctx.userId, at)
  if (blocker) return say({ ...convo, pending: null }, purpose, [], { text: `I cannot do that: ${blocker}` })
  return say({ ...convo, pending: intent }, purpose, [], {
    text: 'Here is the change. Nothing happens until you confirm.',
    proposal: { title: built.title, lines: built.lines },
    quick: ['Confirm', 'Cancel'],
  })
}

const confirm = (s: AppState, convo: ConsoleConvo, intent: ConsoleIntent, at: string): ConsoleTurn => {
  const cleared = { ...convo, pending: null }
  const built = build(s, convo.ctx, intent, at)
  if (typeof built === 'string') return say(cleared, 'Confirm change', [], { text: built })
  const blocker = firstBlocker(s, built.actions, convo.ctx.userId, at)
  if (blocker) return say(cleared, 'Confirm change', [], { text: `The change did not go through: ${blocker}` })
  return { convo: cleared, actions: built.actions, replies: [{ text: built.done, links: built.links }], log: { purpose: 'Confirm change', tools: [] } }
}

// ---------------------------------------------------------------- parsing writes

const parsePr = (s: AppState, convo: ConsoleConvo, raw: string, at: string): ConsoleTurn => {
  const [ask, why] = raw.split(/\b(?:because|karena|reason:|alasan:)\s*/i)
  const qty = Number(ask.match(/(?:^|\s)(\d+)(?=\s|$)/)?.[1] ?? 0)
  const cleaned = ask.toLowerCase().replace(/\b(raise|create|make|buat|ajukan|a|pr|purchase|request|permintaan|pembelian|for|of|order|buy|beli|pesan|units?|pcs)\b/g, ' ')
  const item = bestMatch(s.items.filter((i) => i.active), (i) => i.name, cleaned)
  if (!item) return say(convo, 'Propose purchase request', ['read_stock'], { text: 'Which item? Name it as it appears in the item list, for example "raise a PR for 10 A4 paper".' })
  if (!qty) return say(convo, 'Propose purchase request', ['read_stock'], { text: `How many ${item.name}? For example "raise a PR for 10 ${item.name}".` })
  return propose(s, convo, { kind: 'pr', itemId: item.id, qty, reason: why?.trim() || 'Raised from the Jessy chat.' }, at)
}

const parseDecision = (s: AppState, convo: ConsoleConvo, raw: string, t: string, at: string): ConsoleTurn => {
  const decision = /^(approve|setujui|acc)\b/.test(t) ? 'approved' : 'rejected'
  const note = raw.split(/\b(?:because|karena|reason:|alasan:)\s*/i)[1]?.trim() ?? ''
  const code = raw.match(CODE)?.[1]?.toUpperCase()
  const mine = awaiting(s, convo.ctx)
  const row = code ? mine.find((r) => r.code === code) : bestMatch(mine, (r) => r.who, t.replace(/^(approve|reject|setujui|tolak|acc)\b/, ''))
  if (row) return propose(s, convo, { kind: 'decide', target: row.target, id: row.id, decision, note }, at)
  if (code) {
    // Not in the member's queue: let the store explain why. The placeholder note keeps the reject-reason check out of the way.
    const hr = s.hrRequests.find((r) => r.code === code)
    const pr = s.purchaseRequests.find((r) => r.code === code)
    const action: AppAction | null = hr
      ? { type: 'hrRequests/decide', id: hr.id, decision, note: note || '-', by: convo.ctx.userId }
      : pr
        ? { type: 'prs/decide', id: pr.id, decision, note: note || '-', by: convo.ctx.userId }
        : null
    const blocker = action && blockerFor(s, action)
    const text = !action ? `I cannot find a pending request with the code ${code}.` : blocker ? `I cannot do that: ${blocker}` : `${code} does not wait for you, so I cannot decide it for you.`
    return say(convo, 'Propose decision', ['read_approvals'], { text })
  }
  if (!mine.length) return say(convo, 'Propose decision', ['read_approvals'], { text: 'Nothing waits for your approval right now.' })
  return say(convo, 'Propose decision', ['read_approvals'], {
    text: ['Which one? These wait for you:', ...mine.map((r) => `• ${r.line}`)].join('\n'),
    quick: mine.slice(0, 3).map((r) => `${decision === 'approved' ? 'Approve' : 'Reject'} ${r.code}`),
  })
}

const parseAnnouncement = (s: AppState, convo: ConsoleConvo, raw: string, at: string): ConsoleTurn => {
  const rest = raw.replace(/^.*?\b(announce(?:ment)?|pengumuman|umumkan)\b\s*(?:that|:)?\s*/i, '').trim()
  if (rest.length < 3) return say(convo, 'Propose announcement', [], { text: 'What should it say? For example: "announce Office closed Friday: The office closes at noon for maintenance."' })
  const split = rest.indexOf(':')
  const title = (split > 0 ? rest.slice(0, split) : rest.split(/[.!?]/)[0]).trim().slice(0, 80)
  const body = (split > 0 ? rest.slice(split + 1) : rest).trim()
  return propose(s, convo, { kind: 'announce', title: title.charAt(0).toUpperCase() + title.slice(1), body: body.charAt(0).toUpperCase() + body.slice(1) }, at)
}

const TASK_WORDS: [TaskKind, RegExp][] = [
  ['call', /\b(call|phone|telepon|telpon)\b/],
  ['whatsapp', /\b(whatsapp|wa)\b/],
  ['visit', /\b(visit|kunjungan|survey)\b/],
  ['email', /\b(email|e-mail)\b/],
]

const parseTask = (s: AppState, convo: ConsoleConvo, raw: string, t: string, at: string): ConsoleTurn => {
  const code = raw.match(CODE)?.[1]?.toUpperCase()
  const deal = code ? s.deals.find((d) => d.code === code) : bestMatch(s.deals.filter((d) => stageOf(s, d)?.kind === 'open'), (d) => d.title, t.replace(/\b(follow|up|task|tugas|deal|create|add|buat|tomorrow|today|besok|call|visit|whatsapp|email|on|for|with)\b/g, ' '))
  if (!deal) return say(convo, 'Propose follow-up', ['read_sales'], { text: 'Which deal? Give the code or the buyer\'s name, for example "follow up DL-26-0041 tomorrow by call".' })
  const taskKind = TASK_WORDS.find(([, re]) => re.test(t))?.[0] ?? 'todo'
  const days = Number(t.match(/\bin (\d+) days?\b|\b(\d+) hari lagi\b/)?.slice(1).find(Boolean) ?? (has(t, /\b(today|hari ini)\b/) ? 0 : 1))
  const dueAt = dayAt(at, days, days === 0 ? 16 : 10)
  const contact = s.contacts.find((c) => c.id === deal.contactId)?.name
  const title = `Follow up ${contact ? `with ${contact}` : `on ${deal.title}`}`
  return propose(s, convo, { kind: 'task', dealId: deal.id, title, taskKind, dueAt }, at)
}

// ---------------------------------------------------------------- turn

const READS: [RegExp, (s: AppState, convo: ConsoleConvo, t: string, at: string) => ConsoleTurn][] = [
  [/\b(leave balance|sisa cuti|cuti saya|my leave|leave left|leave days)\b/, (s, c, _t, at) => readLeave(s, c, at)],
  [/\b(approv\w*|persetujuan|waiting for me|waits for me|menunggu saya)\b/, (s, c) => readApprovals(s, c)],
  [/\b(who|siapa|attendance|absensi|kehadiran|hadir)\b.*|\b(late|telat|terlambat|on leave|cuti)\b.*\b(today|hari ini)\b/, readAttendance],
  [/\b(stock|stok|inventory|persediaan|on hand)\b/, (s, c, t) => readStock(s, c, t)],
  [/\b(sales|penjualan|won|deals?|pipeline|revenue|closing|omzet)\b/, readSales],
  [/\b(overdue|invoices?|receivables?|piutang|tagihan|jatuh tempo)\b/, (s, c, _t, at) => readReceivables(s, c, at)],
  [/\b(exclusives?|eksklusif|exclusive rights?)\b/, (s, c, _t, at) => readExclusives(s, c, at)],
  [/\b(candidates?|kandidat|pelamar|applicants?|interview)\b/, readCandidate],
]

const consoleStep = (s: AppState, convo: ConsoleConvo, raw: string, at: string): ConsoleTurn => {
  const text = raw.trim()
  const t = text.toLowerCase()

  if (convo.pending) {
    if (CONFIRM.test(t)) return confirm(s, convo, convo.pending, at)
    if (CANCEL.test(t)) return say({ ...convo, pending: null }, 'Cancel change', [], { text: 'Cancelled. Nothing changed.', quick: starters(convo.ctx) })
  }
  const c: ConsoleConvo = { ...convo, pending: null }
  if (CONFIRM.test(t) || CANCEL.test(t)) return say(c, 'Chat turn', [], { text: 'There is no change waiting. Ask me something, or type "help".' })
  if (has(t, /^(help|bantuan|menu|what can you do|apa yang bisa)/)) return help(c)

  if (has(t, /\b(check me in|clock me in|absen(?:kan)? saya|absen masuk)\b|^(please )?(check|clock) in\b/)) return propose(s, c, { kind: 'checkIn' }, at)
  if (has(t, /^(approve|reject|setujui|tolak|acc)\b/)) return parseDecision(s, c, text, t, at)
  if (has(t, /\b(raise|create|make|buat|ajukan|order|buy|beli|pesan)\b.*\b(pr|purchase request|permintaan pembelian)\b|^(buy|beli|order|pesan)\b/)) return parsePr(s, c, text, at)
  if (has(t, /\b(announce|announcement|pengumuman|umumkan)\b/)) return parseAnnouncement(s, c, text, at)
  if (has(t, /\b(follow[- ]?up|tindak lanjut)\b|\b(task|tugas)\b.*\bdeal\b/)) return parseTask(s, c, text, t, at)

  for (const [re, read] of READS) if (re.test(t)) return read(s, c, t, at)
  // A bare name may be a candidate.
  if (bestMatch(s.candidates, (x) => x.name, t)) return readCandidate(s, c, t, at)

  return say(c, 'Chat turn', [], { text: 'I did not catch that. Type "help" to see what I can do, or pick one of these.', quick: starters(c.ctx) })
}

export const consoleTurn: Engine<ConsoleConvo> = (s, convo, raw, at) => consoleStep(s, convo, raw, at)
