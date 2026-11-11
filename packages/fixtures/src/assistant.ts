/**
 * Jessy in the console: a rule-based reporting assistant for the signed-in member. Reads answer from the store and log
 * the gateway tool they used; changes are proposed first and only "Confirm" returns the store actions, which the chat
 * dispatches as the member. She replies in the member's language and remembers the last report, so "bulan lalu?",
 * "dibanding bulan lalu?" or "rinci" follow on from it. Every sentence lives in console-copy.ts.
 */
import type { AttendanceState, Permission, TaskKind } from '@artha/types'
import { CANDIDATE_STAGE_LABEL, PERMISSION_GROUPS } from '@artha/types'
import { DAY, toMs } from './clock'
import type { Lang, Metric, Period, Seen, Topic } from './console-copy'
import {
  ABILITIES,
  amount,
  compareAsk,
  COPY,
  dateOf,
  dateTimeOf,
  detectLang,
  INTENT,
  listJoin,
  METRIC_TOPIC,
  METRIC_WORDS,
  money,
  percent,
  periodLabel,
  periodWhen,
  previousPeriod,
  quick,
  readPeriod,
  samePeriod,
  shortList,
  TASK_KIND,
  THIS_MONTH,
  TOPIC_NAME,
  TOPIC_WORDS,
  WHAT,
  withoutPeriod,
} from './console-copy'
import { stageOf } from './crm'
import { daysLeft, exclusiveState } from './exclusives'
import { agingBucket, customerName, incomeStatement, invoiceTotals, receivableAging } from './finance'
import { fmtQty } from './purchasing'
import { fmtTime, newId } from './format'
import { GUARD_PURPOSE, guardMessage, guardReply } from './guardrails'
import { attendanceState, buildCheckIn, currentEmployees, currentStep, employeeName, employeeOfUser, leaveBalance, requestsAwaiting, shiftOn, ymd } from './hr'
import type { Engine, Reply, Turn } from './jessy'
import { bestPrice, isPoLate, lowStock, nextPrCode, onHand, poTotals, prsAwaiting, prTotal, stockByWarehouse, valuation } from './purchasing'
import type { AppAction, AppState } from './store'
import { blockerFor, reduce } from './store'

export interface ConsoleCtx {
  userId: string
  permissions: Permission[]
}

/** A record an answer points at; the web maps the kind to a console path. */
/** `report` links take a report key as id: dashboard, sales, finance, purchasing, people, listings or leads. */
export type RecordLinkKind = 'report' | 'attendance' | 'item' | 'stock' | 'deal' | 'pipeline' | 'candidate' | 'hrRequest' | 'pr' | 'quotation' | 'invoice' | 'listing' | 'exclusives' | 'announcements' | 'followUps' | 'approvals' | 'meRequests' | 'me'

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

/** The last report answered: its topic, its period and the ids of the rows behind it. */
export interface ConsoleMemory {
  topic: Topic
  period: Period
  rows: string[]
}

export interface ConsoleConvo {
  ctx: ConsoleCtx
  pending: ConsoleIntent | null
  /** The member's language, from their last message that showed one. English until then. */
  lang?: Lang
  last?: ConsoleMemory | null
}

type ConsoleTurn = Turn<ConsoleConvo> & { replies: ConsoleReply[] }

const CODE = /\b([a-z]{2,3}-\d{2}-\d{4})\b/i

const has = (t: string, pattern: RegExp) => pattern.test(t)
const firstName = (name: string) => name.split(' ')[0]
const sum = <T>(rows: T[], value: (r: T) => number) => rows.reduce((n, r) => n + value(r), 0)
const langOf = (c: ConsoleConvo): Lang => c.lang ?? 'en'

const PERMISSION_LABEL = new Map<string, string>(PERMISSION_GROUPS.flatMap((g) => g.items.map(([key, label]) => [key, label] as [string, string])))
const permLabel = (p: Permission) => PERMISSION_LABEL.get(p) ?? p

const can = (ctx: ConsoleCtx, p: Permission) => ctx.permissions.includes(p)

const say = (convo: ConsoleConvo, purpose: string, tools: string[], ...replies: ConsoleReply[]): ConsoleTurn => ({ convo, actions: [], replies, log: { purpose, tools } })

const refuse = (convo: ConsoleConvo, p: Permission, what: Seen, purpose: string): ConsoleTurn => {
  const lang = langOf(convo)
  return say(convo, purpose, [], { text: COPY.refuseRead[lang](WHAT[lang][what], permLabel(p)) })
}

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

// ---------------------------------------------------------------- start, help and small talk

const abilitiesFor = (ctx: ConsoleCtx) => ABILITIES.filter((a) => !a.needs || can(ctx, a.needs))
const starters = (ctx: ConsoleCtx, lang: Lang) => abilitiesFor(ctx).flatMap((a) => (a.starter ? [a.starter[lang]] : [])).slice(0, 4)
const memberName = (s: AppState, ctx: ConsoleCtx) => firstName(s.users.find((u) => u.id === ctx.userId)?.name ?? 'there')

export const consoleStart = (s: AppState, ctx: ConsoleCtx): Turn<ConsoleConvo> => ({
  convo: { ctx, pending: null, lang: 'en', last: null },
  actions: [],
  replies: [{ text: COPY.start.en(memberName(s, ctx), s.settings.agentName), quick: starters(ctx, 'en') }],
})

const help = (convo: ConsoleConvo): ConsoleTurn => {
  const lang = langOf(convo)
  const lines = abilitiesFor(convo.ctx).map((a) => `• ${a.line[lang]}`)
  return say(convo, 'Help', [], { text: [COPY.help[lang].head, ...lines, COPY.help[lang].foot].join('\n'), quick: starters(convo.ctx, lang) })
}

/** Hello, thanks, ok, bye, "who are you" and "apa kabar". A greeting in front of a question lets the question through. */
const smallTalk = (s: AppState, c: ConsoleConvo, t: string, at: string): ConsoleTurn | { rest: string } => {
  const lang = langOf(c)
  const name = memberName(s, c.ctx)
  const chat = (reply: ConsoleReply) => say(c, 'Small talk', [], reply)
  if (INTENT.ok.test(t.replace(/[^a-z ]+/g, '').trim())) return chat({ text: COPY.ok[lang] })
  if (INTENT.who.test(t)) return chat({ text: COPY.who[lang](s.settings.agentName, s.company.name), quick: starters(c.ctx, lang).slice(0, 3) })
  if (INTENT.howAreYou.test(t)) return chat({ text: COPY.howAreYou[lang], quick: quick(lang, 'dashboard') })
  const polite = t.match(INTENT.greeting) ?? t.match(INTENT.thanks) ?? t.match(INTENT.bye)
  if (!polite) return { rest: t }
  const rest = t.slice(polite[0].length).replace(/^[\s,.!?]+/, '')
  if (rest.replace(INTENT.filler, '').replace(/[^a-z0-9]+/g, '')) return { rest }
  if (INTENT.bye.test(polite[0])) return chat({ text: COPY.bye[lang](name) })
  if (INTENT.thanks.test(polite[0])) return chat({ text: COPY.thanks[lang] })
  return chat({ text: COPY.greet[lang](at, name), quick: starters(c.ctx, lang).slice(0, 3) })
}

// ---------------------------------------------------------------- periods

const rangeOf = (p: Period, at: string) => {
  const d = new Date(at)
  const start = p.unit === 'month' ? d.getMonth() + p.offset : Math.floor(d.getMonth() / 3) * 3 + 3 * p.offset
  const length = p.unit === 'month' ? 1 : 3
  return { from: new Date(d.getFullYear(), start, 1), to: new Date(d.getFullYear(), start + length, 1) }
}

const labelOf = (p: Period, at: string, lang: Lang) => periodLabel(p, rangeOf(p, at).from, lang)
/** The period inside a sentence: "bulan lalu", "pada Agustus 2026". */
const whenOf = (p: Period, at: string, lang: Lang) => periodWhen(p, rangeOf(p, at).from, lang)
const within = (iso: string | null | undefined, r: { from: Date; to: Date }) => !!iso && toMs(iso) >= r.from.getTime() && toMs(iso) < r.to.getTime()

// ---------------------------------------------------------------- report topics

/** One row behind a report, as the drill-down lists it and the ranking weighs it. */
interface Row {
  id: string
  /** Code and name, as a ranking sentence names the row. */
  label: string
  line: string
  amount?: number
  /** Days late, for "paling lama telat". */
  days?: number
  owner?: string
  link?: RecordLink
}

type Measure = keyof (typeof COPY.measure)['en']

interface TopicDef {
  needs: Permission
  /** Reports for a month or quarter; the others show today's position. */
  periodic: boolean
  report: (s: AppState, p: Period, at: string, lang: Lang) => string[]
  rows: (s: AppState, p: Period, at: string, lang: Lang) => Row[]
  head: (s: AppState, rows: Row[], p: Period, at: string, lang: Lang) => string
  /** Figures a comparison sets side by side. */
  measures?: (s: AppState, p: Period, at: string) => [Measure, number][]
  /** The ranking question that fits this topic's rows. */
  rank?: 'topAgent' | 'longest' | 'largest'
}

const REPORT_ID: Record<Topic, string> = { sales: 'sales', finance: 'finance', inventory: 'purchasing', purchasing: 'purchasing', people: 'people', listings: 'listings', leads: 'leads' }
const reportLink = (topic: Topic, lang: Lang): RecordLink => ({ kind: 'report', id: REPORT_ID[topic], label: COPY.reportLink[lang][topic] })

const userName = (s: AppState, id: string) => s.users.find((u) => u.id === id)?.name ?? id
const wonDeals = (s: AppState, p: Period, at: string) => s.deals.filter((d) => stageOf(s, d)?.kind === 'won' && within(d.closedAt, rangeOf(p, at)))
const openDeals = (s: AppState) => s.deals.filter((d) => stageOf(s, d)?.kind === 'open')

/** Won value per agent, best first. */
const agentTotals = (rows: Row[]) => {
  const by = new Map<string, { value: number; n: number }>()
  for (const r of rows) {
    const cur = by.get(r.owner!) ?? { value: 0, n: 0 }
    by.set(r.owner!, { value: cur.value + (r.amount ?? 0), n: cur.n + 1 })
  }
  return [...by].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.value - a.value)
}

const salesRows = (s: AppState, p: Period, at: string, lang: Lang): Row[] =>
  wonDeals(s, p, at).map((d) => ({
    id: d.id,
    label: `${d.code} ${d.title}`,
    line: COPY.row[lang].deal(d.code, d.title, money(d.value, lang), userName(s, d.ownerId)),
    amount: d.value,
    owner: d.ownerId,
    link: { kind: 'deal', id: d.id, label: d.code },
  }))

/** Receivables past due as of `at`: everything after the first aging bucket ("not yet due"). */
const pastDue = (s: AppState, at: string) => {
  const aging = receivableAging(s, toMs(at))
  return aging.total - aging.totals[0]
}

const overdueRows = (s: AppState, _p: Period, at: string, lang: Lang): Row[] => {
  const now = toMs(at)
  return s.invoices
    .filter((i) => i.status === 'issued' && agingBucket(i.dueDate, now) > 0)
    .map((i) => ({ i, balance: invoiceTotals(i).balance, days: Math.floor((now - toMs(i.dueDate)) / DAY) }))
    .filter((r) => r.balance > 0)
    .sort((a, b) => a.i.dueDate.localeCompare(b.i.dueDate))
    .map(({ i, balance, days }) => ({
      id: i.id,
      label: `${i.code} · ${customerName(s, i)}`,
      line: COPY.row[lang].invoice(i.code, customerName(s, i), money(balance, lang), days),
      amount: balance,
      days,
      link: { kind: 'invoice', id: i.id, label: i.code },
    }))
}

const lowRows = (s: AppState, _p: Period, _at: string, lang: Lang): Row[] =>
  lowStock(s).map((r) => ({
    id: r.item.id,
    label: r.item.name,
    line: COPY.row[lang].lowItem(r.item.name, fmtQty(s, r.item.id, r.qty), fmtQty(s, r.item.id, r.short)),
    link: { kind: 'item', id: r.item.id, label: r.item.name },
  }))

const openOrders = (s: AppState) => s.purchaseOrders.filter((po) => po.status === 'sent' || po.status === 'partial')
const pendingPrs = (s: AppState) => s.purchaseRequests.filter((r) => r.status === 'pending')

const purchasingRows = (s: AppState, _p: Period, at: string, lang: Lang): Row[] => {
  const now = toMs(at)
  const orders = openOrders(s).map((po): Row => {
    const late = isPoLate(po, now)
    const vendor = s.vendors.find((v) => v.id === po.vendorId)?.name ?? '-'
    const total = poTotals(po).total
    return {
      id: po.id,
      label: `${po.code} · ${vendor}`,
      line: COPY.row[lang].po(po.code, vendor, money(total, lang), late, dateOf(po.expectedDate, lang)),
      amount: total,
      days: late ? Math.floor((now - toMs(po.expectedDate)) / DAY) : undefined,
    }
  })
  const requests = pendingPrs(s).map((r): Row => ({
    id: r.id,
    label: `${r.code} · ${employeeName(s, r.requesterId)}`,
    line: COPY.row[lang].pr(r.code, employeeName(s, r.requesterId), money(prTotal(r), lang)),
    amount: prTotal(r),
    link: { kind: 'pr', id: r.id, label: r.code },
  }))
  return [...orders, ...requests]
}

/** "cuti 2 hari mulai 3 Nov 2026", "4 h overtime" or "loan of Rp 5 M". */
const requestWhat = (r: AppState['hrRequests'][number], lang: Lang) =>
  r.leave ? COPY.row[lang].leave(r.leave.days, dateOf(r.leave.from, lang)) : r.overtime ? COPY.row[lang].overtime(r.overtime.hours) : COPY.row[lang].loan(money(r.loan?.amount ?? 0, lang))

const peopleRows = (s: AppState, _p: Period, _at: string, lang: Lang): Row[] =>
  s.hrRequests
    .filter((r) => r.status === 'pending')
    .map((r) => ({
      id: r.id,
      label: `${r.code} · ${employeeName(s, r.employeeId)}`,
      line: `${r.code} · ${employeeName(s, r.employeeId)}, ${requestWhat(r, lang)}`,
      amount: r.loan?.amount,
      link: { kind: 'hrRequest', id: r.id, label: r.code },
    }))

const activeListings = (s: AppState) => s.listings.filter((l) => l.status === 'active')

const listingRows = (s: AppState, _p: Period, _at: string, lang: Lang): Row[] =>
  activeListings(s).map((l) => ({
    id: l.id,
    label: `${l.code} ${l.title}`,
    line: COPY.row[lang].listing(l.code, l.title, money(l.price, lang)),
    amount: l.price,
    link: { kind: 'listing', id: l.id, label: l.code },
  }))

const freshInquiries = (s: AppState, p: Period, at: string) => s.inquiries.filter((i) => within(i.createdAt, rangeOf(p, at)))

const leadRows = (s: AppState, p: Period, at: string, lang: Lang): Row[] =>
  freshInquiries(s, p, at).map((i) => ({
    id: i.id,
    label: `${i.code} · ${i.name}`,
    line: COPY.row[lang].inquiry(i.code, i.name, COPY.inquiryStage[lang][i.status]),
    amount: i.budget ?? undefined,
  }))

const TOPICS: Record<Topic, TopicDef> = {
  sales: {
    needs: 'deal.view',
    periodic: true,
    report: (s, p, at, lang) => {
      const won = wonDeals(s, p, at)
      const open = openDeals(s)
      const top = agentTotals(salesRows(s, p, at, lang)).slice(0, 3).map((a) => `${userName(s, a.id)} ${money(a.value, lang)}`)
      const words = COPY.sales[lang]
      return [words.won(won.length, money(sum(won, (d) => d.value), lang)), words.open(open.length, money(sum(open, (d) => d.value), lang)), top.length ? words.top(top) : words.noTop]
    },
    rows: salesRows,
    head: (_s, rows, p, at, lang) => COPY.drill[lang].sales(rows.length, whenOf(p, at, lang), money(sum(rows, (r) => r.amount ?? 0), lang)),
    measures: (s, p, at) => [['wonValue', sum(wonDeals(s, p, at), (d) => d.value)]],
    rank: 'topAgent',
  },
  finance: {
    needs: 'finance.view',
    periodic: true,
    report: (s, p, at, lang) => {
      const r = rangeOf(p, at)
      const is = incomeStatement(s, r.from.toISOString(), r.to.toISOString())
      const words = COPY.finance[lang]
      return [`${words.revenue}: ${amount(is.totalRevenue, lang)}`, `${words.expense}: ${amount(is.totalExpense, lang)}`, `${words.net}: ${amount(is.netIncome, lang)}`, `${words.pastDue}: ${amount(pastDue(s, at), lang)}`]
    },
    rows: overdueRows,
    head: (s, rows, _p, at, lang) => COPY.drill[lang].finance(rows.length, amount(pastDue(s, at), lang)),
    measures: (s, p, at) => {
      const r = rangeOf(p, at)
      const is = incomeStatement(s, r.from.toISOString(), r.to.toISOString())
      return [['revenue', is.totalRevenue], ['netIncome', is.netIncome]]
    },
    rank: 'longest',
  },
  inventory: {
    needs: 'purchase.view',
    periodic: false,
    report: (s, _p, _at, lang) => {
      const stock = valuation(s)
      const low = lowStock(s).map((r) => r.item.name)
      const words = COPY.inventory[lang]
      return [words.value(amount(sum(stock, (r) => r.value), lang)), words.items(stock.length), low.length ? words.low(shortList(low, lang, 5)) : words.noLow]
    },
    rows: lowRows,
    head: (_s, rows, _p, _at, lang) => COPY.drill[lang].inventory(rows.length),
  },
  purchasing: {
    needs: 'purchase.view',
    periodic: true,
    report: (s, p, at, lang) => {
      const sent = s.purchaseOrders.filter((po) => within(po.sentAt, rangeOf(p, at)))
      const open = openOrders(s)
      const words = COPY.purchasing[lang]
      return [words.spend(amount(sum(sent, (po) => poTotals(po).total), lang), sent.length), words.open(open.length, open.filter((po) => isPoLate(po, toMs(at))).length), words.waiting(pendingPrs(s).length)]
    },
    rows: purchasingRows,
    head: (s, _rows, _p, at, lang) => {
      const open = openOrders(s)
      return COPY.drill[lang].purchasing(open.length, open.filter((po) => isPoLate(po, toMs(at))).length, pendingPrs(s).length)
    },
    measures: (s, p, at) => [['spend', sum(s.purchaseOrders.filter((po) => within(po.sentAt, rangeOf(p, at))), (po) => poTotals(po).total)]],
    rank: 'largest',
  },
  people: {
    needs: 'hr.view',
    periodic: false,
    report: (s, _p, at, lang) => {
      const staff = currentEmployees(s)
      const states = staff.map((e) => attendanceState(s, e.id, ymd(at), toMs(at)))
      const tally = (st: AttendanceState) => states.filter((x) => x === st).length
      const words = COPY.people[lang]
      return [
        words.headcount(staff.length, s.departments.length),
        words.today({ present: tally('present'), late: tally('late'), leave: tally('leave'), absent: tally('absent') }),
        words.open(s.hrRequests.filter((r) => r.status === 'pending').length),
      ]
    },
    rows: peopleRows,
    head: (_s, rows, _p, _at, lang) => COPY.drill[lang].people(rows.length),
  },
  listings: {
    needs: 'listing.view',
    periodic: false,
    report: (s, _p, _at, lang) => {
      const by = (st: string) => s.listings.filter((l) => l.status === st).length
      const words = COPY.listings[lang]
      return [words.live(by('active'), by('reserved'), by('review')), words.closed(by('sold'), by('delisted')), words.value(amount(sum(activeListings(s), (l) => l.price), lang))]
    },
    rows: listingRows,
    head: (_s, rows, _p, _at, lang) => COPY.drill[lang].listings(rows.length),
    rank: 'largest',
  },
  leads: {
    needs: 'inquiry.view',
    periodic: true,
    report: (s, p, at, lang) => {
      const stages = (['new', 'contacted', 'survey', 'negotiation', 'won', 'lost'] as const).map((st) => `${COPY.inquiryStage[lang][st]} ${s.inquiries.filter((i) => i.status === st).length}`)
      return [COPY.leads[lang].fresh(freshInquiries(s, p, at).length), COPY.leads[lang].stages(stages.join(', '))]
    },
    rows: leadRows,
    head: (_s, rows, p, at, lang) => COPY.drill[lang].leads(rows.length, whenOf(p, at, lang)),
    measures: (s, p, at) => [['newLeads', freshInquiries(s, p, at).length]],
  },
}

const TOPIC_ORDER = Object.keys(TOPICS) as Topic[]
const namedTopic = (t: string) => TOPIC_WORDS.find(([, re]) => re.test(t))?.[0] ?? null
const reportTitle = (topic: Topic, p: Period, at: string, lang: Lang) => COPY.reportTitle[lang](topic, TOPICS[topic].periodic ? labelOf(p, at, lang) : null)
const reportAsk = (topic: Topic, p: Period, at: string, lang: Lang) => COPY.reportAsk[lang](topic, TOPICS[topic].periodic ? labelOf(p, at, lang) : null)

const remember = (c: ConsoleConvo, topic: Topic, period: Period, rows: Row[]): ConsoleConvo => ({ ...c, last: { topic, period, rows: rows.map((r) => r.id) } })

/** Up to three next steps for the last report: the breakdown, a comparison and the other period. */
const nextSteps = (topic: Topic, p: Period, at: string, lang: Lang) => {
  if (!TOPICS[topic].periodic) return [...quick(lang, 'drill'), ...(TOPICS[topic].rank ? quick(lang, TOPICS[topic].rank!) : [])]
  const other = samePeriod(p, THIS_MONTH) ? quick(lang, 'lastMonth') : quick(lang, 'thisMonth')
  return [...quick(lang, 'drill'), compareAsk(labelOf(previousPeriod(p), at, lang), lang), ...other]
}

/** At most three quick replies when Jessy has nothing better: the last report's next steps, topped up with the role's starters. */
const contextQuick = (c: ConsoleConvo, at: string) => {
  const steps = c.last ? nextSteps(c.last.topic, c.last.period, at, langOf(c)) : []
  return [...new Set([...steps, ...starters(c.ctx, langOf(c))])].slice(0, 3)
}

// ---------------------------------------------------------------- reports

/** One reply per topic the role may see, for one period. Refuses when it may see none of them. */
const answerReports = (s: AppState, c: ConsoleConvo, asked: Topic[], p: Period, at: string): ConsoleTurn => {
  const lang = langOf(c)
  const allowed = asked.filter((topic) => can(c.ctx, TOPICS[topic].needs))
  if (!allowed.length) return refuse(c, TOPICS[asked[0]].needs, asked[0], 'Read report')
  const replies = allowed.map((topic): ConsoleReply => ({
    text: [`${reportTitle(topic, p, at, lang)}:`, ...TOPICS[topic].report(s, p, at, lang).map((l) => `• ${l}`)].join('\n'),
    links: [reportLink(topic, lang)],
  }))
  const topic = allowed[allowed.length - 1]
  replies[replies.length - 1].quick = nextSteps(topic, p, at, lang)
  return say(remember(c, topic, p, TOPICS[topic].rows(s, p, at, lang)), 'Read report', ['read_reports'], ...replies)
}

/** The dashboard summary: one figure line per module the role can see. */
const dashboard = (s: AppState, c: ConsoleConvo, p: Period, at: string): ConsoleTurn => {
  const lang = langOf(c)
  const mine = TOPIC_ORDER.filter((topic) => can(c.ctx, TOPICS[topic].needs))
  const lines = mine.filter((topic) => topic !== 'purchasing').map((topic) => `${COPY.reportTitle[lang](topic, null)}: ${TOPICS[topic].report(s, p, at, lang)[0]}`)
  const waiting = requestsAwaiting(s, c.ctx.userId, can(c.ctx, 'request.approve')).length + prsAwaiting(s, c.ctx.userId, can(c.ctx, 'purchase.approve')).length
  const words = COPY.dashboard[lang]
  return say(c, 'Read report', ['read_reports'], {
    text: [words.head, ...lines.map((l) => `• ${l}`), `• ${words.waiting(waiting)}`, words.foot].join('\n'),
    links: [{ kind: 'report', id: 'dashboard', label: words.link }],
    quick: mine.filter((topic) => ['sales', 'finance', 'inventory'].includes(topic)).map((topic) => reportAsk(topic, p, at, lang)),
  })
}

const readReport = (s: AppState, c: ConsoleConvo, t: string, at: string): ConsoleTurn => {
  const asked = TOPIC_WORDS.filter(([, re]) => re.test(t)).map(([topic]) => topic)
  const p = readPeriod(t) ?? THIS_MONTH
  return asked.length ? answerReports(s, c, asked, p, at) : dashboard(s, c, p, at)
}

/** Report starters for a period, when a follow-up has no report to follow. */
const askReport = (c: ConsoleConvo, p: Period, at: string): ConsoleTurn => {
  const lang = langOf(c)
  const topics = TOPIC_ORDER.filter((topic) => TOPICS[topic].periodic && can(c.ctx, TOPICS[topic].needs)).slice(0, 3)
  return say(c, 'Chat turn', [], { text: COPY.askReport[lang], quick: topics.length ? topics.map((topic) => reportAsk(topic, p, at, lang)) : starters(c.ctx, lang).slice(0, 3) })
}

const snapshot = (c: ConsoleConvo, topic: Topic) => {
  const lang = langOf(c)
  return say(c, 'Read report', [], { text: COPY.snapshot[lang](TOPIC_NAME[lang][topic]), quick: quick(lang, 'drill') })
}

/** The rows behind a topic for a period; when it is the report in memory, only the rows that report covered. */
const rowsOf = (s: AppState, c: ConsoleConvo, topic: Topic, p: Period, at: string) => {
  const rows = TOPICS[topic].rows(s, p, at, langOf(c))
  const last = c.last
  if (!last || last.topic !== topic || !samePeriod(last.period, p)) return rows
  const shown = new Set(last.rows)
  return rows.filter((r) => shown.has(r.id))
}

const MAX_ROWS = 8

/** "rinci": the rows behind the report, each with a record link where one exists. */
const drillDown = (s: AppState, c: ConsoleConvo, topic: Topic, p: Period, at: string): ConsoleTurn => {
  const lang = langOf(c)
  const def = TOPICS[topic]
  if (!can(c.ctx, def.needs)) return refuse(c, def.needs, topic, 'Read report')
  const rows = rowsOf(s, c, topic, p, at)
  const next = remember(c, topic, p, rows)
  const steps = nextSteps(topic, p, at, lang).slice(1)
  if (!rows.length) {
    const text = topic === 'sales' ? COPY.metric[lang].noRevenue(whenOf(p, at, lang)) : COPY.drill[lang].none
    return say(next, 'Read report', ['read_reports'], { text, quick: steps.length ? steps : contextQuick(c, at) })
  }
  const lines = rows.slice(0, MAX_ROWS).map((r) => `• ${r.line}`)
  if (rows.length > MAX_ROWS) lines.push(`• ${COPY.drill[lang].more(rows.length - MAX_ROWS)}`)
  const links = rows.flatMap((r) => (r.link ? [r.link] : [])).slice(0, 4)
  const low = topic === 'inventory' && can(c.ctx, 'purchase.request') ? lowStock(s)[0] : undefined
  const prAsk = low ? [COPY.pr[lang].ask(Math.ceil(low.short), low.item.name)] : []
  return say(next, 'Read report', ['read_reports'], {
    text: [def.head(s, rows, p, at, lang), ...lines].join('\n'),
    links: [...links, reportLink(topic, lang)],
    quick: [...prAsk, ...(def.rank ? quick(lang, def.rank) : []), ...steps].slice(0, 3),
  })
}

/** "dibanding bulan lalu?": the period in memory against the one before it, or against the period named. */
const compare = (s: AppState, c: ConsoleConvo, topic: Topic, named: Period | null, at: string): ConsoleTurn => {
  const lang = langOf(c)
  const def = TOPICS[topic]
  if (!can(c.ctx, def.needs)) return refuse(c, def.needs, topic, 'Read report')
  if (!def.measures) return snapshot(c, topic)
  const cur = c.last?.topic === topic ? c.last.period : (c.last?.period ?? THIS_MONTH)
  const other = named && !samePeriod(named, cur) ? named : previousPeriod(cur)
  const [labelA, labelB] = [whenOf(cur, at, lang), whenOf(other, at, lang)]
  const before = new Map(def.measures(s, other, at))
  const words = COPY.compare[lang]
  const lines = def.measures(s, cur, at).map(([key, a]) => {
    const b = before.get(key) ?? 0
    const show = (n: number) => (key === 'newLeads' ? String(n) : amount(n, lang))
    const diff = a - b
    const pct = b ? percent((Math.abs(diff) / Math.abs(b)) * 100, lang) : null
    const change = diff === 0 ? words.same : diff > 0 ? words.up(show(diff), pct) : words.down(show(-diff), pct)
    return `${words.line(COPY.measure[lang][key], show(a), labelA, show(b), labelB)} ${change}`
  })
  return say(remember(c, topic, cur, def.rows(s, cur, at, lang)), 'Read report', ['read_reports'], {
    text: lines.join('\n'),
    links: [reportLink(topic, lang)],
    quick: [...quick(lang, 'drill'), ...(def.rank ? quick(lang, def.rank) : [])],
  })
}

/** "siapa agen terbaik?": won value per agent in the period in memory, or this month. */
const rankAgents = (s: AppState, c: ConsoleConvo, p: Period, at: string): ConsoleTurn => {
  const lang = langOf(c)
  if (!can(c.ctx, 'deal.view')) return refuse(c, 'deal.view', 'sales', 'Read report')
  const rows = rowsOf(s, c, 'sales', p, at)
  const agents = agentTotals(rows)
  const label = whenOf(p, at, lang)
  const next = remember(c, 'sales', p, rows)
  if (!agents.length) return say(next, 'Read report', ['read_reports'], { text: COPY.rank[lang].noAgent(label), quick: nextSteps('sales', p, at, lang) })
  const [top, ...rest] = agents
  const text = [COPY.rank[lang].agent(label, userName(s, top.id), money(top.value, lang), top.n), ...rest.map((a, i) => `${i + 2}. ${userName(s, a.id)}, ${money(a.value, lang)}`)].join('\n')
  return say(next, 'Read report', ['read_reports'], { text, links: [reportLink('sales', lang)], quick: nextSteps('sales', p, at, lang) })
}

/** "yang terbesar?" or "yang paling lama telat?" within the rows of the report in memory. */
const rankRows = (s: AppState, c: ConsoleConvo, topic: Topic, p: Period, by: 'largest' | 'longest', at: string): ConsoleTurn => {
  const lang = langOf(c)
  const def = TOPICS[topic]
  if (!can(c.ctx, def.needs)) return refuse(c, def.needs, topic, 'Read report')
  const rows = rowsOf(s, c, topic, p, at)
  const weigh = (r: Row) => (by === 'largest' ? r.amount : r.days)
  const best = rows.filter((r) => weigh(r) !== undefined).sort((a, b) => weigh(b)! - weigh(a)!)[0]
  const next = remember(c, topic, p, rows)
  const steps = nextSteps(topic, p, at, lang).filter((q) => q !== quick(lang, by)[0])
  if (!best) return say(next, 'Read report', ['read_reports'], { text: COPY.noRank[lang], quick: steps })
  const text = by === 'largest' ? COPY.rank[lang].largest(best.label, money(best.amount!, lang)) : COPY.rank[lang].longest(best.label, best.days!)
  return say(next, 'Read report', ['read_reports'], { text, links: best.link ? [best.link] : [reportLink(topic, lang)], quick: steps })
}

/** What is left of a follow-up once its period, topic and filler words are gone; empty means it asks nothing new. */
const leftover = (t: string) =>
  TOPIC_WORDS.reduce((acc, [, re]) => acc.replace(new RegExp(re.source, 'g'), ' '), withoutPeriod(t))
    .replace(INTENT.followFiller, ' ')
    .replace(/[^a-z0-9]+/g, '')

/** Questions that build on the last report: compare, rank, drill down, another period, another topic. */
const followUp = (s: AppState, c: ConsoleConvo, t: string, at: string): ConsoleTurn | null => {
  const named = namedTopic(t)
  const period = readPeriod(t)
  const topic = named ?? c.last?.topic ?? null
  const p = period ?? c.last?.period ?? THIS_MONTH
  if (INTENT.rankAgent.test(t)) return rankAgents(s, c, p, at)
  if (INTENT.compare.test(t)) return topic ? compare(s, c, topic, period, at) : askReport(c, THIS_MONTH, at)
  const rank = INTENT.rankLongest.test(t) ? 'longest' : INTENT.rankLargest.test(t) ? 'largest' : null
  if (rank) return topic ? rankRows(s, c, topic, p, rank, at) : askReport(c, p, at)
  if (topic && INTENT.drill.test(t)) return drillDown(s, c, topic, p, at)
  if (leftover(t)) return null
  if (period && !named) {
    if (!c.last) return askReport(c, period, at)
    return TOPICS[c.last.topic].periodic ? answerReports(s, c, [c.last.topic], period, at) : snapshot(c, c.last.topic)
  }
  if (named && INTENT.refine.test(t)) return answerReports(s, c, [named], p, at)
  return null
}

// ---------------------------------------------------------------- short metric questions

/** "berapa omzet bulan ini?": one sentence from the store, then the full report as a quick reply. */
const metric = (s: AppState, c: ConsoleConvo, m: Metric, t: string, at: string): ConsoleTurn => {
  const lang = langOf(c)
  const topic = METRIC_TOPIC[m]
  const def = TOPICS[topic]
  if (!can(c.ctx, def.needs)) return refuse(c, def.needs, topic, 'Read report')
  const p = readPeriod(t) ?? THIS_MONTH
  const label = whenOf(p, at, lang)
  const rows = def.rows(s, p, at, lang)
  const words = COPY.metric[lang]
  const sentence = (): string => {
    switch (m) {
      case 'revenue':
        return rows.length ? words.revenue(label, money(sum(rows, (r) => r.amount ?? 0), lang), rows.length) : words.noRevenue(label)
      case 'netIncome': {
        const r = rangeOf(p, at)
        const is = incomeStatement(s, r.from.toISOString(), r.to.toISOString())
        return words.netIncome(label, amount(is.netIncome, lang), amount(is.totalRevenue, lang), amount(is.totalExpense, lang))
      }
      case 'overdue':
        return rows.length ? words.overdue(rows.length, amount(pastDue(s, at), lang)) : words.noOverdue
      case 'lowStock':
        return rows.length ? words.lowStock(rows.length, shortList(rows.map((r) => r.label), lang)) : words.noLowStock
      case 'activeListings':
        return words.activeListings(rows.length, amount(sum(rows, (r) => r.amount ?? 0), lang))
      case 'newLeads':
        return words.newLeads(label, rows.length)
    }
  }
  const compareStep = def.periodic ? [compareAsk(labelOf(previousPeriod(p), at, lang), lang)] : []
  return say(remember(c, topic, p, rows), 'Read report', ['read_reports'], {
    text: sentence(),
    links: [reportLink(topic, lang)],
    quick: [reportAsk(topic, p, at, lang), ...quick(lang, 'drill'), ...compareStep],
  })
}

const readMetric = (s: AppState, c: ConsoleConvo, t: string, at: string): ConsoleTurn | null => {
  const m = METRIC_WORDS.find(([, re]) => re.test(t))?.[0]
  return m ? metric(s, c, m, t, at) : null
}

// ---------------------------------------------------------------- reads

const ATTENDANCE_ORDER = ['present', 'late', 'leave', 'absent', 'upcoming'] as const

const readAttendance = (s: AppState, convo: ConsoleConvo, t: string, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'hr.view')) return refuse(convo, 'hr.view', 'attendance', 'Read attendance')
  const lang = langOf(convo)
  const words = COPY.attendance[lang]
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
  const scope = dept ? words.scope(dept.name) : ''
  const links: RecordLink[] = [{ kind: 'attendance', label: words.link }]
  const c = remember(convo, 'people', THIS_MONTH, TOPICS.people.rows(s, THIS_MONTH, at, lang))
  const only: 'late' | 'leave' | 'absent' | null = has(t, /\b(late|telat|terlambat)\b/) ? 'late' : has(t, /\b(leave|cuti)\b/) ? 'leave' : has(t, /\b(absent|bolos|tidak hadir)\b/) ? 'absent' : null
  if (only) {
    const names = groups.get(only) ?? []
    const text = names.length ? words.only(words.state[only], scope, listJoin(names, lang)) : words.nobody(words.state[only], scope)
    return say(c, 'Read attendance', ['read_attendance'], { text, links, quick: [reportAsk('people', THIS_MONTH, at, lang)] })
  }
  const lines = ATTENDANCE_ORDER.flatMap((st) => {
    const names = groups.get(st) ?? []
    return names.length ? [`${words.state[st]} (${names.length}): ${names.join(', ')}`] : []
  })
  return say(c, 'Read attendance', ['read_attendance'], { text: [words.head(dateOf(at, lang), people.length, scope), ...lines].join('\n'), links })
}

const readStock = (s: AppState, convo: ConsoleConvo, t: string, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'purchase.view')) return refuse(convo, 'purchase.view', 'inventory', 'Read stock')
  const lang = langOf(convo)
  const item = bestMatch(s.items.filter((i) => i.active), (i) => i.name, t.replace(/\b(stock|stok|of|how much|how many|on hand|persediaan|berapa)\b/g, ' '))
  if (!item) return drillDown(s, convo, 'inventory', THIS_MONTH, at)
  const words = COPY.stockItem[lang]
  const total = onHand(s, item.id)
  const lines = stockByWarehouse(s, item.id)
    .filter((w) => w.qty !== 0)
    .map((w) => `• ${w.warehouse.name}: ${fmtQty(s, item.id, w.qty)}`)
  const low = total < item.minStock ? words.below(fmtQty(s, item.id, item.minStock)) : ''
  return say(convo, 'Read stock', ['read_stock'], {
    text: [`${words.head(item.name, fmtQty(s, item.id, total))}${low}`, ...lines].join('\n'),
    links: [{ kind: 'item', id: item.id, label: item.name }],
  })
}

const readSales = (s: AppState, convo: ConsoleConvo, t: string, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'deal.view')) return refuse(convo, 'deal.view', 'sales', 'Read sales')
  if (!has(t, /\b(pipeline|stage|stages|tahap|funnel)\b/)) return drillDown(s, convo, 'sales', readPeriod(t) ?? THIS_MONTH, at)
  const lang = langOf(convo)
  const words = COPY.pipeline[lang]
  const lines = s.stages
    .filter((st) => st.kind === 'open')
    .map((st) => {
      const deals = s.deals.filter((d) => d.stageId === st.id)
      return `• ${words.stage(st.name, deals.length, money(sum(deals, (d) => d.value), lang))}`
    })
  const open = openDeals(s)
  return say(convo, 'Read sales', ['read_sales'], {
    text: [words.head(open.length, money(sum(open, (d) => d.value), lang)), ...lines].join('\n'),
    links: [{ kind: 'pipeline', label: words.link }],
  })
}

const readCandidate = (s: AppState, convo: ConsoleConvo, t: string, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'hr.view')) return refuse(convo, 'hr.view', 'candidates', 'Read candidates')
  const words = COPY.candidate[langOf(convo)]
  const stage = (Object.keys(CANDIDATE_STAGE_LABEL) as (keyof typeof CANDIDATE_STAGE_LABEL)[]).find((k) => t.includes(CANDIDATE_STAGE_LABEL[k].toLowerCase()))
  const c = bestMatch(s.candidates, (x) => x.name, t)
  if (!c) {
    const rows = stage ? s.candidates.filter((x) => x.stage === stage) : []
    if (!rows.length) return say(convo, 'Read candidates', ['read_candidates'], { text: words.which })
    return say(convo, 'Read candidates', ['read_candidates'], {
      text: [words.atStage(rows.length, CANDIDATE_STAGE_LABEL[stage!]), ...rows.map((x) => `• ${x.name}`)].join('\n'),
      links: rows.slice(0, 4).map((x) => ({ kind: 'candidate', id: x.id, label: x.name })),
    })
  }
  const opening = s.jobOpenings.find((o) => o.id === c.openingId)
  const next = c.interviews.filter((i) => toMs(i.at) >= toMs(at)).sort((a, b) => a.at.localeCompare(b.at))[0]
  const lang = langOf(convo)
  const lines = [
    words.status(c.name, CANDIDATE_STAGE_LABEL[c.stage], opening ? `${opening.title} (${opening.code})` : null),
    c.tests.length ? words.tests(c.tests.length, Math.max(...c.tests.map((x) => x.score))) : '',
    next ? words.next(dateTimeOf(next.at, lang), next.mode === 'video') : '',
    c.offer ? words.offer(money(c.offer.salary, lang), c.offer.status) : '',
    c.stage === 'rejected' && c.rejectReason ? words.reason(c.rejectReason) : '',
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
const awaiting = (s: AppState, ctx: ConsoleCtx, lang: Lang): Awaiting[] => [
  ...requestsAwaiting(s, ctx.userId, can(ctx, 'request.approve')).map((r): Awaiting => {
    const who = employeeName(s, r.employeeId)
    return { target: 'hr', id: r.id, code: r.code, who, line: COPY.decideStep[lang](r.code, who, requestWhat(r, lang), currentStep(r)!.label) }
  }),
  ...prsAwaiting(s, ctx.userId, can(ctx, 'purchase.approve')).map((r): Awaiting => {
    const who = employeeName(s, r.requesterId)
    return { target: 'pr', id: r.id, code: r.code, who, line: `${r.code} · ${who}, ${COPY.approvals[lang].items(r.lines.length)}, ${COPY.approvals[lang].about(money(prTotal(r), lang))}` }
  }),
  ...(can(ctx, 'deal.approve') ? s.quotations.filter((q) => q.status === 'pending_approval') : []).map((q): Awaiting => {
    const deal = s.deals.find((d) => d.id === q.dealId)
    return { target: 'quotation', id: q.id, code: q.code, who: deal?.title ?? 'Deal', line: `${q.code} · ${deal?.title ?? 'Deal'}, ${COPY.approvals[lang].discount(q.discountPct)}` }
  }),
]

const LINK_FOR: Record<Awaiting['target'], RecordLinkKind> = { hr: 'hrRequest', pr: 'pr', quotation: 'quotation' }

const readApprovals = (s: AppState, convo: ConsoleConvo): ConsoleTurn => {
  const lang = langOf(convo)
  const words = COPY.approvals[lang]
  const rows = awaiting(s, convo.ctx, lang)
  if (!rows.length) return say(convo, 'Read approvals', ['read_approvals'], { text: words.none })
  return say(convo, 'Read approvals', ['read_approvals'], {
    text: [words.head(rows.length), ...rows.map((r) => `• ${r.line}`), words.foot].join('\n'),
    links: [...rows.slice(0, 4).map((r) => ({ kind: LINK_FOR[r.target], id: r.id, label: r.code })), { kind: 'approvals', label: words.all }],
    quick: rows.slice(0, 2).map((r) => `${words.verb.approved} ${r.code}`),
  })
}

const readExclusives = (s: AppState, convo: ConsoleConvo, at: string): ConsoleTurn => {
  if (!can(convo.ctx, 'exclusive.view')) return refuse(convo, 'exclusive.view', 'exclusives', 'Read exclusive rights')
  const lang = langOf(convo)
  const words = COPY.exclusives[lang]
  const now = toMs(at)
  const due = s.exclusives.filter((e) => exclusiveState(e, now) === 'due').sort((a, b) => a.endsAt.localeCompare(b.endsAt))
  if (!due.length) return say(convo, 'Read exclusive rights', ['read_exclusives'], { text: words.none, links: [{ kind: 'exclusives', label: words.link }] })
  const listing = (id: string) => s.listings.find((x) => x.id === id)
  const lines = due.map((e) => `• ${words.row(listing(e.listingId)?.code ?? 'Listing', listing(e.listingId)?.title ?? '', dateOf(e.endsAt, lang), daysLeft(e, now))}`)
  return say(convo, 'Read exclusive rights', ['read_exclusives'], {
    text: [words.head(due.length), ...lines].join('\n'),
    links: [...due.slice(0, 3).map((e) => ({ kind: 'listing' as const, id: e.listingId, label: listing(e.listingId)?.code ?? 'Listing' })), { kind: 'exclusives', label: words.all }],
  })
}

const readLeave = (s: AppState, convo: ConsoleConvo, at: string): ConsoleTurn => {
  const words = COPY.leave[langOf(convo)]
  const me = employeeOfUser(s, convo.ctx.userId)
  if (!me) return say(convo, 'Read leave balance', [], { text: words.noEmployee })
  const year = new Date(at).getFullYear()
  const b = leaveBalance(s, me.id, year)
  return say(convo, 'Read leave balance', ['read_leave'], { text: words.balance(b.left, year, b.quota, b.used, b.pending), links: [{ kind: 'meRequests', label: words.link }] })
}

// ---------------------------------------------------------------- writes

interface Built {
  actions: AppAction[]
  title: string
  lines: string[]
  /** The change in one sentence, shown above the card. */
  summary: string
  /** What Jessy says once the change ran. */
  done: string
  links: RecordLink[]
  /** The related next step she offers after the change, when the role may take it. */
  next: { ask: string; quick: string } | null
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
const build = (s: AppState, ctx: ConsoleCtx, intent: ConsoleIntent, at: string, lang: Lang): Built | string => {
  const me = employeeOfUser(s, ctx.userId)
  const offer = (needs: Permission | null, ask: string, chip: string) => (!needs || can(ctx, needs) ? { ask, quick: chip } : null)
  const next = COPY.next[lang]
  switch (intent.kind) {
    case 'pr': {
      if (!me) return COPY.noEmployee[lang].pr
      const words = COPY.pr[lang]
      const item = s.items.find((i) => i.id === intent.itemId)!
      const estPrice = bestPrice(s, item.id, intent.qty, at)?.price ?? 0
      const est = estPrice ? money(estPrice * intent.qty, lang) : null
      const qty = fmtQty(s, item.id, intent.qty)
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
        title: words.title(pr.code),
        lines: words.lines(item.name, qty, est, dateOf(pr.neededBy, lang), intent.reason),
        summary: words.summary(pr.code, qty, item.name, est),
        done: words.done(pr.code, qty, item.name),
        links: [{ kind: 'pr', id: pr.id, label: pr.code }],
        next: offer('purchase.view', next.pr, reportAsk('purchasing', THIS_MONTH, at, lang)),
      }
    }
    case 'decide': {
      const words = COPY.decide[lang]
      const verb = COPY.approvals[lang].verb[intent.decision]
      const action: AppAction =
        intent.target === 'hr'
          ? { type: 'hrRequests/decide', id: intent.id, decision: intent.decision, note: intent.note, by: ctx.userId }
          : intent.target === 'pr'
            ? { type: 'prs/decide', id: intent.id, decision: intent.decision, note: intent.note, by: ctx.userId }
            : { type: intent.decision === 'approved' ? 'quotations/approve' : 'quotations/reject', id: intent.id }
      const row = awaiting(s, ctx, lang).find((r) => r.id === intent.id)
      const code = row?.code ?? intent.id
      return {
        actions: [action],
        title: words.title(verb, code),
        lines: [row?.line ?? code, ...(intent.note ? [words.note(intent.note)] : [])],
        summary: words.summary(intent.decision, code),
        done: words.done(words.decided[intent.decision], code),
        links: [{ kind: LINK_FOR[intent.target], id: intent.id, label: code }],
        next: offer(null, next.decide, quick(lang, 'approvals')[0]),
      }
    }
    case 'checkIn': {
      if (!me) return COPY.noEmployee[lang].checkIn
      const words = COPY.checkIn[lang]
      const attendance = buildCheckIn(s, me.id, at, null, null)
      const shift = shiftOn(s, me.id, attendance.date)
      return {
        actions: [{ type: 'attendance/checkIn', attendance }],
        title: words.title(fmtTime(at)),
        lines: words.lines(me.name, dateOf(at, lang), shift ? words.shift(shift.name, shift.start, shift.end) : null),
        summary: words.summary(fmtTime(at)),
        done: words.done(fmtTime(at)),
        links: [{ kind: 'me', label: words.link }],
        next: offer(null, next.checkIn, quick(lang, 'leave')[0]),
      }
    }
    case 'announce': {
      const words = COPY.announce[lang]
      const announcement = { id: newId('ann'), title: intent.title, body: intent.body, departmentId: null, pinned: false, authorId: ctx.userId, publishedAt: at, readBy: [ctx.userId] }
      return {
        actions: [{ type: 'announcements/upsert', announcement }],
        title: words.title,
        lines: words.lines(intent.title, intent.body),
        summary: words.summary(intent.title),
        done: words.done(intent.title),
        links: [{ kind: 'announcements', label: words.link }],
        next: offer(null, next.announce, quick(lang, 'dashboard')[0]),
      }
    }
    case 'task': {
      const words = COPY.task[lang]
      const deal = s.deals.find((d) => d.id === intent.dealId)!
      const task = { id: newId('tsk'), title: intent.title, kind: intent.taskKind, dueAt: intent.dueAt, ownerId: ctx.userId, ref: { type: 'deal' as const, id: deal.id }, doneAt: null, createdAt: at }
      const due = dateTimeOf(intent.dueAt, lang)
      return {
        actions: [{ type: 'tasks/create', task }],
        title: words.title,
        lines: words.lines(`${deal.code} ${deal.title}`, intent.title, TASK_KIND[lang][intent.taskKind], due),
        summary: words.summary(deal.code, due),
        done: words.done(deal.code, due),
        links: [{ kind: 'deal', id: deal.id, label: deal.code }, { kind: 'followUps', label: words.link }],
        next: offer('deal.view', next.task, COPY.pipeline[lang].ask),
      }
    }
  }
}

const propose = (s: AppState, convo: ConsoleConvo, intent: ConsoleIntent, at: string): ConsoleTurn => {
  const lang = langOf(convo)
  const purpose = PROPOSE_PURPOSE[intent.kind]
  const needs = NEEDS[intent.kind]
  const cleared = { ...convo, pending: null }
  if (needs && !can(convo.ctx, needs)) return say(cleared, purpose, [], { text: COPY.refuseWrite[lang](permLabel(needs)) })
  const built = build(s, convo.ctx, intent, at, lang)
  if (typeof built === 'string') return say(cleared, purpose, [], { text: built })
  const blocker = firstBlocker(s, built.actions, convo.ctx.userId, at)
  if (blocker) return say(cleared, purpose, [], { text: COPY.cannot[lang](blocker) })
  const words = COPY.propose[lang]
  return say({ ...convo, pending: intent }, purpose, [], {
    text: `${built.summary} ${words.note}`,
    proposal: { title: built.title, lines: built.lines, confirm: words.confirm, cancel: words.cancel },
    quick: [words.confirm, words.cancel],
  })
}

const confirm = (s: AppState, convo: ConsoleConvo, intent: ConsoleIntent, at: string): ConsoleTurn => {
  const lang = langOf(convo)
  const cleared = { ...convo, pending: null }
  const built = build(s, convo.ctx, intent, at, lang)
  if (typeof built === 'string') return say(cleared, 'Confirm change', [], { text: built })
  const blocker = firstBlocker(s, built.actions, convo.ctx.userId, at)
  if (blocker) return say(cleared, 'Confirm change', [], { text: COPY.failed[lang](blocker) })
  const text = built.next ? `${built.done} ${built.next.ask}` : built.done
  return { convo: cleared, actions: built.actions, replies: [{ text, links: built.links, quick: built.next ? [built.next.quick] : undefined }], log: { purpose: 'Confirm change', tools: [] } }
}

// ---------------------------------------------------------------- parsing writes

const REASON = /\b(?:because|karena|reason:|alasan:)\s*/i

const parsePr = (s: AppState, convo: ConsoleConvo, raw: string, at: string): ConsoleTurn => {
  const words = COPY.pr[langOf(convo)]
  const [ask, why] = raw.split(REASON)
  const qty = Number(ask.match(/(?:^|\s)(\d+)(?=\s|$)/)?.[1] ?? 0)
  const cleaned = ask.toLowerCase().replace(/\b(raise|create|make|buat|ajukan|a|pr|purchase|request|permintaan|pembelian|for|of|untuk|order|buy|beli|pesan|units?|pcs|buah)\b/g, ' ')
  const item = bestMatch(s.items.filter((i) => i.active), (i) => i.name, cleaned)
  if (!item) return say(convo, 'Propose purchase request', ['read_stock'], { text: words.which })
  if (!qty) return say(convo, 'Propose purchase request', ['read_stock'], { text: words.howMany(item.name) })
  return propose(s, convo, { kind: 'pr', itemId: item.id, qty, reason: why?.trim() || words.reason }, at)
}

const parseDecision = (s: AppState, convo: ConsoleConvo, raw: string, t: string, at: string): ConsoleTurn => {
  const lang = langOf(convo)
  const decision = /^(approve|setujui|acc)\b/.test(t) ? 'approved' : 'rejected'
  const note = raw.split(REASON)[1]?.trim() ?? ''
  const code = raw.match(CODE)?.[1]?.toUpperCase()
  const mine = awaiting(s, convo.ctx, lang)
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
    const words = COPY.decide[lang]
    const text = !action ? words.notFound(code) : blocker ? COPY.cannot[lang](blocker) : words.notYours(code)
    return say(convo, 'Propose decision', ['read_approvals'], { text })
  }
  const words = COPY.approvals[lang]
  if (!mine.length) return say(convo, 'Propose decision', ['read_approvals'], { text: words.none })
  return say(convo, 'Propose decision', ['read_approvals'], {
    text: [words.which, ...mine.map((r) => `• ${r.line}`)].join('\n'),
    quick: mine.slice(0, 3).map((r) => `${words.verb[decision]} ${r.code}`),
  })
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

const parseAnnouncement = (s: AppState, convo: ConsoleConvo, raw: string, at: string): ConsoleTurn => {
  const rest = raw.replace(/^.*?\b(announce(?:ment)?|pengumuman|umumkan)\b\s*(?:that|:)?\s*/i, '').trim()
  if (rest.length < 3) return say(convo, 'Propose announcement', [], { text: COPY.announce[langOf(convo)].ask })
  const split = rest.indexOf(':')
  const title = (split > 0 ? rest.slice(0, split) : rest.split(/[.!?]/)[0]).trim().slice(0, 80)
  const body = (split > 0 ? rest.slice(split + 1) : rest).trim()
  return propose(s, convo, { kind: 'announce', title: capitalise(title), body: capitalise(body) }, at)
}

const TASK_WORDS: [TaskKind, RegExp][] = [
  ['call', /\b(call|phone|telepon|telpon)\b/],
  ['whatsapp', /\b(whatsapp|wa)\b/],
  ['visit', /\b(visit|kunjungan|survey)\b/],
  ['email', /\b(email|e-mail)\b/],
]

const parseTask = (s: AppState, convo: ConsoleConvo, raw: string, t: string, at: string): ConsoleTurn => {
  const words = COPY.task[langOf(convo)]
  const code = raw.match(CODE)?.[1]?.toUpperCase()
  const deal = code ? s.deals.find((d) => d.code === code) : bestMatch(openDeals(s), (d) => d.title, t.replace(/\b(follow|up|task|tugas|deal|create|add|buat|tomorrow|today|besok|call|visit|whatsapp|email|on|for|with)\b/g, ' '))
  if (!deal) return say(convo, 'Propose follow-up', ['read_sales'], { text: words.which })
  const taskKind = TASK_WORDS.find(([, re]) => re.test(t))?.[0] ?? 'todo'
  const days = Number(t.match(/\bin (\d+) days?\b|\b(\d+) hari lagi\b/)?.slice(1).find(Boolean) ?? (has(t, /\b(today|hari ini)\b/) ? 0 : 1))
  const dueAt = dayAt(at, days, days === 0 ? 16 : 10)
  const contact = s.contacts.find((c) => c.id === deal.contactId)?.name
  return propose(s, convo, { kind: 'task', dealId: deal.id, title: contact ? words.name(contact) : words.onDeal(deal.title), taskKind, dueAt }, at)
}

/** Changes, matched before the reads so "beli 10 kertas" is a request rather than a stock question. */
const parseWrite = (s: AppState, c: ConsoleConvo, raw: string, t: string, at: string): ConsoleTurn | null => {
  if (has(t, /\b(check me in|clock me in|absen(?:kan)? saya|absen masuk)\b|^(please )?(check|clock) in\b/)) return propose(s, c, { kind: 'checkIn' }, at)
  if (has(t, /^(approve|reject|setujui|tolak|acc)\b/)) return parseDecision(s, c, raw, t, at)
  if (has(t, /\b(raise|create|make|buat|ajukan|order|buy|beli|pesan)\b.*\b(pr|purchase request|permintaan pembelian)\b|^(buy|beli|order|pesan)\b/)) return parsePr(s, c, raw, at)
  if (has(t, /\b(announce|announcement|pengumuman|umumkan)\b/)) return parseAnnouncement(s, c, raw, at)
  if (has(t, /\b(follow[- ]?up|tindak lanjut)\b|\b(task|tugas)\b.*\bdeal\b/)) return parseTask(s, c, raw, t, at)
  return null
}

// ---------------------------------------------------------------- turn

const READS: [RegExp, (s: AppState, convo: ConsoleConvo, t: string, at: string) => ConsoleTurn][] = [
  [/\b(leave balance|sisa cuti|cuti saya|my leave|leave left|leave days)\b/, (s, c, _t, at) => readLeave(s, c, at)],
  [/\b(approv\w*|persetujuan|waiting for me|waits for me|menunggu saya)\b/, (s, c) => readApprovals(s, c)],
  [/\b(who|siapa|attendance|absensi|kehadiran|hadir)\b.*|\b(late|telat|terlambat|on leave|cuti)\b.*\b(today|hari ini)\b/, readAttendance],
  [/\b(stock|stok|inventory|persediaan|on hand)\b/, readStock],
  [/\b(sales|penjualan|won|deals?|pipeline|revenue|closing)\b/, readSales],
  [/\b(invoices?|tagihan)\b/, (s, c, _t, at) => drillDown(s, c, 'finance', THIS_MONTH, at)],
  [/\b(exclusives?|eksklusif|exclusive rights?)\b/, (s, c, _t, at) => readExclusives(s, c, at)],
  [/\b(candidates?|kandidat|pelamar|applicants?|interview)\b/, readCandidate],
]

/** Everything after the guard and small talk, in order: follow-ups, reports, changes, metrics, reads. */
const route = (s: AppState, c: ConsoleConvo, raw: string, t: string, at: string): ConsoleTurn => {
  const lang = langOf(c)
  if ((INTENT.confirm.test(t) || INTENT.cancel.test(t)) && t.split(/\s+/).length <= 3) return say(c, 'Chat turn', [], { text: COPY.noChange[lang] })
  if (INTENT.help.test(t)) return help(c)
  const answer = followUp(s, c, t, at) ?? (INTENT.report.test(t) ? readReport(s, c, t, at) : null) ?? parseWrite(s, c, raw, t, at) ?? readMetric(s, c, t, at)
  if (answer) return answer
  for (const [re, read] of READS) if (re.test(t)) return read(s, c, t, at)
  // A bare name may be a candidate.
  if (bestMatch(s.candidates, (x) => x.name, t)) return readCandidate(s, c, t, at)
  return say(c, 'Chat turn', [], { text: COPY.fallback[lang], quick: contextQuick(c, at) })
}

const consoleStep = (s: AppState, convo: ConsoleConvo, raw: string, at: string): ConsoleTurn => {
  const text = raw.trim()
  const t = text.toLowerCase()
  const lang = detectLang(text, langOf(convo))
  const here: ConsoleConvo = { ...convo, lang }

  if (here.pending) {
    if (INTENT.cancel.test(t)) return say({ ...here, pending: null }, 'Cancel change', [], { text: COPY.cancelled[lang], quick: contextQuick(here, at) })
    if (INTENT.confirm.test(t)) return confirm(s, here, here.pending, at)
  }
  const c: ConsoleConvo = { ...here, pending: null }
  const guard = guardMessage(text, 'console')
  if (guard) return say(c, GUARD_PURPOSE, [], { text: guardReply(guard, 'console', text, lang), quick: starters(c.ctx, lang) })
  const talk = smallTalk(s, c, t, at)
  return 'rest' in talk ? route(s, c, text, talk.rest, at) : talk
}

export const consoleTurn: Engine<ConsoleConvo> = (s, convo, raw, at) => consoleStep(s, convo, raw, at)
