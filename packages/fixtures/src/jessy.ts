/**
 * Jessy, the Artha Samoedra agent, as a rule-based engine over the store.
 * Every turn is pure: (state, conversation, text) → replies, the next conversation and the store actions to
 * dispatch with meta.by = JESSY. An LLM-backed engine can replace these functions behind the same Turn shape.
 */
import type { AiAgentId, AssetType, BuyerFinancing, BuyerPurpose, BuyerTimeline, DealType, InquiryQualification, Listing } from '@artha/types'
import { ASSET_TYPE_LABEL, ASSET_TYPES, DEAL_TYPE_LABEL } from '@artha/types'
import { addDays } from './clock'
import { normalizePhone, publicListings } from './derive'
import { fmtArea, fmtIdrShort, newId } from './format'
import { aiCall, rememberFacts, TOOL_FOR_ACTION } from './gateway'
import type { AppAction, AppState } from './store'
import { buildInquiry, buildListing, buildPartner, delistBlocker, JESSY, reduce } from './store'

export interface Reply {
  text: string
  listingIds?: string[]
  quick?: string[]
  /** Shows the photo attach button while this is the latest reply. */
  attach?: boolean
  /** Shows the listing review card while this is the latest reply. */
  review?: boolean
  /** Console assistant: a change waiting for the member's Confirm, listed line by line. */
  proposal?: { title: string; lines: string[] }
}

/** What the gateway logs for one turn: purpose, tools beyond the dispatched actions, the subject and facts to remember. */
export interface TurnLog {
  purpose: string
  subject?: string | null
  tools?: string[]
  facts?: string[]
}

export interface Turn<C> {
  replies: Reply[]
  convo: C
  actions: AppAction[]
  log?: TurnLog
  /** Replies that read the store after the actions ran, such as a handoff naming the assigned agent. */
  followUp?: (next: AppState) => Reply[]
}

/** Non-text input from the chat UI: photos from the attach button, or the edited review card. */
export interface TurnInput {
  photos?: string[]
  draft?: PartnerDraft
}

export type Engine<C> = (s: AppState, convo: C, text: string, at: string, input?: TurnInput) => Turn<C>

/**
 * Runs one turn through the AI gateway: refuses politely when the agent is switched off, appends replies that
 * need the post-dispatch state, and adds the `ai/logCall` and `ai/setMemory` actions for the turn.
 */
export function jessyStep<C>(
  s: AppState,
  agentId: AiAgentId,
  engine: Engine<C>,
  convo: C,
  text: string,
  at: string,
  input?: TurnInput,
  /** Who the actions run as: Jessy, or the console member who confirmed a proposal. */
  by: string = JESSY,
): Omit<Turn<C>, 'log' | 'followUp'> {
  const agent = s.aiAgents.find((a) => a.id === agentId)
  if (agent && !agent.enabled) {
    const wa = s.integrations.find((i) => i.kind === 'whatsapp' && i.status === 'connected')?.account
    return {
      convo,
      actions: [],
      replies: [{ text: `${s.settings.agentName} is offline right now.${wa ? ` Please message our team on WhatsApp at ${wa}.` : ' Please try again later.'}` }],
    }
  }
  const turn = engine(s, convo, text, at, input)
  const next = turn.actions.reduce((acc, action) => reduce(acc, { action, meta: { by, at } }), s)
  const replies = [...turn.replies, ...(turn.followUp?.(next) ?? [])]
  const log = turn.log ?? { purpose: 'Chat turn' }
  const toolCalls = [...new Set([...(log.tools ?? []), ...turn.actions.flatMap((a) => TOOL_FOR_ACTION[a.type] ?? [])])]
  const subject = log.subject ?? null
  const call = aiCall(s, agentId, log.purpose, text, replies.map((r) => r.text).join('\n'), at, { toolCalls, subject })
  const actions: AppAction[] = [...turn.actions, { type: 'ai/logCall', call }]
  const memory = subject ? rememberFacts(next, agentId, subject, log.facts ?? [], at) : null
  if (memory) actions.push({ type: 'ai/setMemory', memory })
  return { convo: turn.convo, replies, actions }
}

const has = (text: string, pattern: RegExp) => pattern.test(text.toLowerCase())
const CANCEL = /^(cancel|menu|restart|start over|batal|ulang)\b/

// ---------------------------------------------------------------- parsing

/**
 * Reads "2.5 B", "2,5 M" (Indonesian shorthand for miliar), "850 million" or "850 jt".
 * A bare "M" under 100 means billions, the way Indonesian buyers write it; "850 M" reads as millions.
 */
export const parseBudget = (text: string): number | null => {
  const m = text.toLowerCase().match(/(\d+(?:[.,]\d+)?)\s*(billion|bn\b|b\b|miliar|milyar|million|mn\b|m\b|juta|jt\b)/)
  if (!m) return null
  const n = Number(m[1].replace(',', '.'))
  const unit = m[2]
  if (/^(billion|bn|b|miliar|milyar)$/.test(unit)) return n * 1e9
  if (unit === 'm' && n < 100) return n * 1e9
  return n * 1e6
}

const TYPE_WORDS: Record<AssetType, RegExp> = {
  tanah: /\b(land|plot|lot|tanah|kavling|lahan)\b/,
  rumah: /\b(house|home|rumah)\b/,
  ruko: /\b(shophouse|shop ?house|shop|ruko|toko)\b/,
  gudang: /\b(warehouse|gudang)\b/,
  villa: /\b(villa|vila)\b/,
  apartemen: /\b(apartment|condo|apartemen|apart)\b/,
}

const placeOf = (l: Listing) =>
  `${l.city} ${l.district} ${['Badung', 'Gianyar'].includes(l.city) ? 'bali' : ''}`.toLowerCase()

interface BuyerQuery {
  type: AssetType | null
  deal: DealType | null
  maxPrice: number | null
  minBedrooms: number | null
  places: string[]
}

const parseBuyerQuery = (s: AppState, text: string): BuyerQuery => {
  const t = text.toLowerCase()
  const beds = t.match(/(\d)\s*(bedrooms?|beds?|br|kamar|kt)/)
  const places = publicListings(s).map(placeOf).join(' ')
  return {
    type: ASSET_TYPES.find((k) => TYPE_WORDS[k].test(t)) ?? null,
    deal: /\b(rent|rental|lease|sewa|kontrak|disewakan)\b/.test(t) ? 'sewa' : /\b(buy|sale|purchase|beli|dijual|jual)\b/.test(t) ? 'jual' : null,
    maxPrice: parseBudget(t),
    minBedrooms: beds ? Number(beds[1]) : null,
    places: t.split(/[^a-z]+/).filter((w) => w.length >= 4 && places.includes(w)),
  }
}

const searchListings = (s: AppState, q: BuyerQuery) =>
  publicListings(s)
    .filter(
      (l) =>
        (!q.type || l.type === q.type) &&
        (!q.deal || l.deal === q.deal) &&
        (!q.maxPrice || l.price <= q.maxPrice * 1.1) &&
        (!q.minBedrooms || (l.bedrooms ?? 0) >= q.minBedrooms) &&
        (!q.places.length || q.places.some((p) => placeOf(l).includes(p))),
    )
    .sort((a, b) => (q.maxPrice ? b.price - a.price : a.price - b.price))

const isEmptyQuery = (q: BuyerQuery) => !q.type && !q.deal && !q.maxPrice && !q.minBedrooms && !q.places.length

export const listingLine = (l: Listing) =>
  `${l.code} · ${l.title} · ${fmtIdrShort(l.price)}${l.deal === 'sewa' ? '/year' : ''}`

// ---------------------------------------------------------------- buyer chat (public website)

export const TIMELINE_LABEL: Record<BuyerTimeline, string> = { now: 'Now', three_months: 'Within 3 months', six_months: '6 months or later' }
export const FINANCING_LABEL: Record<BuyerFinancing, string> = { cash: 'Cash', mortgage: 'Mortgage', installment: 'Installment' }
export const PURPOSE_LABEL: Record<BuyerPurpose, string> = { live_in: 'To live in', invest: 'To invest', business: 'For business' }

type QualifyStage = 'budget' | 'timeline' | 'financing' | 'purpose'

export interface BuyerConvo {
  stage: 'idle' | QualifyStage | 'name' | 'phone'
  focus: string | null
  budget: number | null
  name: string
  note: string
  /** The place from the last search, remembered as the preferred city. */
  place?: string | null
  timeline?: BuyerTimeline | null
  financing?: BuyerFinancing | null
  purpose?: BuyerPurpose | null
}

/**
 * Hot, warm or cold from the answers: buying soon and paying cash or with a budget that covers the listing
 * scores high. Two points or more is warm, four or more is hot.
 */
export function leadTemperature(q: Omit<InquiryQualification, 'temperature'>, budget: number | null, listing?: Listing): InquiryQualification['temperature'] {
  let score = 0
  if (q.timeline === 'now') score += 2
  else if (q.timeline === 'three_months') score += 1
  if (q.financing === 'cash') score += 2
  else if (q.financing) score += 1
  if (budget && (!listing || budget >= listing.price * 0.9)) score += 1
  return score >= 4 ? 'hot' : score >= 2 ? 'warm' : 'cold'
}

const SKIP = /^(skip|later|lewati|nanti saja|-)\b/

const QUALIFY: Record<QualifyStage, Reply> = {
  budget: { text: 'What budget do you have in mind? For example: Rp 2.5 B.', quick: ['Under Rp 1 B', 'Rp 1 to 3 B', 'Rp 3 to 10 B', 'Above Rp 10 B', 'Skip'] },
  timeline: { text: 'When are you planning to buy or move in?', quick: ['Now', 'Within 3 months', '6 months or later', 'Skip'] },
  financing: { text: 'How will you pay?', quick: ['Cash', 'Mortgage', 'Installment', 'Skip'] },
  purpose: { text: 'What is the property for?', quick: ['To live in', 'To invest', 'For business', 'Skip'] },
}

const readTimeline = (t: string): BuyerTimeline | null =>
  /\b(now|asap|immediately|this month|sekarang|segera)\b/.test(t) ? 'now'
  : /\b(6|six|enam|later|next year|tahun depan)\b/.test(t) ? 'six_months'
  : /\b(3|three|tiga|soon|few months)\b/.test(t) ? 'three_months'
  : null

const readFinancing = (t: string): BuyerFinancing | null =>
  /\b(cash|tunai|keras)\b/.test(t) ? 'cash'
  : /\b(mortgage|kpr|bank|loan)\b/.test(t) ? 'mortgage'
  : /\b(install\w*|cicil\w*|bertahap)\b/.test(t) ? 'installment'
  : null

const readPurpose = (t: string): BuyerPurpose | null =>
  /\b(live|living|home|family|stay|tinggal|keluarga|huni)\b/.test(t) ? 'live_in'
  : /\b(invest\w*|rental income|passive)\b/.test(t) ? 'invest'
  : /\b(business|office|cafe|shop|store|usaha|bisnis|kantor|toko)\b/.test(t) ? 'business'
  : null

const QUALIFY_ORDER: QualifyStage[] = ['budget', 'timeline', 'financing', 'purpose']

/** The next unanswered question after `after`; a skipped question stays empty and is not asked again. */
const nextQualify = (c: BuyerConvo, after: QualifyStage | null): BuyerConvo['stage'] => {
  const from = after ? QUALIFY_ORDER.indexOf(after) + 1 : 0
  return QUALIFY_ORDER.slice(from).find((st) => !(st === 'budget' ? c.budget : c[st])) ?? 'name'
}

const askNext = (c: BuyerConvo, after: QualifyStage | null, prefix?: string): Turn<BuyerConvo> => {
  const stage = nextQualify(c, after)
  const q = stage === 'name' ? { text: 'Thanks. May I have your name?' } : QUALIFY[stage as QualifyStage]
  return { convo: { ...c, stage }, actions: [], replies: [prefix ? { ...q, text: `${prefix} ${q.text}` } : q], log: { purpose: 'Qualify buyer' } }
}

export const buyerStart = (s: AppState, focusId: string | null = null): Turn<BuyerConvo> => {
  const focus = focusId ? s.listings.find((l) => l.id === focusId) : undefined
  const name = s.settings.agentName
  return {
    convo: { stage: 'idle', focus: focus?.id ?? null, budget: null, name: '', note: '', place: null, timeline: null, financing: null, purpose: null },
    actions: [],
    replies: [
      {
        text: focus
          ? `Hi, I'm ${name} from Artha Samoedra. Questions about ${focus.code}, ${focus.title}? I can walk you through the details or book a site visit.`
          : `Hi, I'm ${name} from Artha Samoedra. Tell me what you're looking for: type, location and budget. For example: "house in Bogor under Rp 2 B".`,
        quick: focus
          ? ['Details of this property', 'Book a site visit', 'Find similar']
          : ['House in Jakarta', 'Warehouse for rent', 'Villa in Bali', 'Land under Rp 5 B'],
      },
    ],
  }
}

const detailReply = (l: Listing): Reply => ({
  text: [
    `${l.code}: ${l.title}.`,
    `${DEAL_TYPE_LABEL[l.deal]} at ${fmtIdrShort(l.price)}${l.deal === 'sewa' ? ' a year' : ''}, ${l.district}, ${l.city}.`,
    `Land ${fmtArea(l.landArea)}${l.buildingArea ? `, building ${fmtArea(l.buildingArea)}` : ''}${l.bedrooms ? `, ${l.bedrooms} bedrooms` : ''}, ${l.certificate} certificate.`,
    l.highlights.length ? `Highlights: ${l.highlights.join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' '),
  listingIds: [l.id],
  quick: ['Book a site visit', 'Find similar'],
})

const titleCase = (w: string) => w.charAt(0).toUpperCase() + w.slice(1)

/** What Jessy remembers about a buyer once the phone number is known. */
const buyerFacts = (s: AppState, c: BuyerConvo) => {
  const focus = s.listings.find((l) => l.id === c.focus)
  return [
    c.name && `Name: ${c.name}`,
    c.budget && `Budget: ${fmtIdrShort(c.budget)}`,
    c.place && `Preferred city: ${titleCase(c.place)}`,
    focus && `Interested in: ${focus.code}`,
    c.timeline && `Timeline: ${TIMELINE_LABEL[c.timeline].toLowerCase()}`,
    c.financing && `Financing: ${FINANCING_LABEL[c.financing].toLowerCase()}`,
    c.purpose && `Purpose: ${PURPOSE_LABEL[c.purpose].toLowerCase()}`,
  ].filter((f): f is string => !!f)
}

export const buyerTurn = (s: AppState, convo: BuyerConvo, raw: string, at: string): Turn<BuyerConvo> => {
  const text = raw.trim()
  const t = text.toLowerCase()
  const focus = convo.focus ? s.listings.find((l) => l.id === convo.focus) : undefined

  if (convo.stage !== 'idle' && CANCEL.test(t)) {
    return { convo: { ...convo, stage: 'idle' }, actions: [], replies: [{ text: 'Cancelled. Anything else I can help with?' }] }
  }

  switch (convo.stage) {
    case 'budget': {
      if (SKIP.test(t)) return askNext(convo, 'budget')
      const budget = parseBudget(t)
      return budget ? askNext({ ...convo, budget }, 'budget') : { convo, actions: [], replies: [{ ...QUALIFY.budget, text: 'I could not read that amount. For example: Rp 2.5 B or Rp 850 M.' }], log: { purpose: 'Qualify buyer' } }
    }
    case 'timeline':
    case 'financing':
    case 'purpose': {
      const stage = convo.stage
      if (SKIP.test(t)) return askNext(convo, stage)
      const value = stage === 'timeline' ? readTimeline(t) : stage === 'financing' ? readFinancing(t) : readPurpose(t)
      if (!value) return { convo, actions: [], replies: [{ ...QUALIFY[stage], text: `Pick one of the options, or tap Skip. ${QUALIFY[stage].text}` }], log: { purpose: 'Qualify buyer' } }
      return askNext({ ...convo, [stage]: value }, stage)
    }
    case 'name':
      if (text.length < 2) return { convo, actions: [], replies: [{ text: 'May I have your name?' }], log: { purpose: 'Capture lead' } }
      return {
        convo: { ...convo, stage: 'phone', name: text },
        actions: [],
        replies: [{ text: `Thanks, ${text}. Which WhatsApp number can our team reach you on?` }],
        log: { purpose: 'Capture lead' },
      }
    case 'phone': {
      const phone = normalizePhone(text)
      if (phone.length < 9) {
        return { convo, actions: [], replies: [{ text: 'That number looks incomplete. Please try again, for example 0812 3456 7890.' }], log: { purpose: 'Capture lead' } }
      }
      const answers = { timeline: convo.timeline ?? null, financing: convo.financing ?? null, purpose: convo.purpose ?? null }
      const qualification: InquiryQualification = { ...answers, temperature: leadTemperature(answers, convo.budget, focus) }
      const inquiry = buildInquiry(
        s,
        { listingId: convo.focus, name: convo.name, phone, channel: 'web_chat', message: convo.note, budget: convo.budget, qualification },
        at,
      )
      const done = { ...convo, stage: 'idle' as const }
      return {
        convo: done,
        actions: [{ type: 'inquiries/create', inquiry }],
        replies: [{ text: `Thanks, ${convo.name}. I logged your request as ${inquiry.code}.` }],
        log: { purpose: 'Capture lead', subject: phone, facts: buyerFacts(s, done) },
        // The round-robin automation assigns the lead during dispatch, so the handoff reads the next state.
        followUp: (next) => {
          const ownerId = next.inquiries.find((i) => i.id === inquiry.id)?.ownerId
          const owner = next.users.find((u) => u.id === ownerId)
          const about = focus ? ` about ${focus.code}` : ''
          return [
            {
              text: owner
                ? `${owner.name} from our sales team will message you on WhatsApp today${about}.`
                : `Our team will message you on WhatsApp today${about}.`,
              quick: ['Search other properties'],
            },
          ]
        },
      }
    }
  }

  const code = t.match(/as-?\s?(\d{1,4})/)
  if (code) {
    const wanted = `AS-${code[1].padStart(4, '0')}`
    const l = publicListings(s).find((x) => x.code === wanted)
    if (!l) return { convo, actions: [], replies: [{ text: `${wanted} is not available or no longer on the market.` }], log: { purpose: 'Answer listing question', tools: ['search_listings'] } }
    return { convo: { ...convo, focus: l.id }, actions: [], replies: [detailReply(l)], log: { purpose: 'Answer listing question', tools: ['search_listings'] } }
  }

  if (has(t, /details of this property|detail aset ini/) && focus) return { convo, actions: [], replies: [detailReply(focus)], log: { purpose: 'Answer listing question' } }

  if (has(t, /visit|viewing|book|schedule|contact|call me|interested|negotiat|offer|mortgage|survei|survey|jadwal|hubungi|kontak|tertarik|minat|nego|tawar|kpr|telepon|whatsapp|\bwa\b/)) {
    const next = { ...convo, note: text, budget: parseBudget(text) ?? convo.budget, financing: readFinancing(t) ?? convo.financing ?? null }
    return askNext(next, null, focus ? `Sure, I'll set that up for ${focus.code}. A few quick questions first so the right agent calls you.` : 'Sure, our team will help. A few quick questions first so the right agent calls you.')
  }

  let q = parseBuyerQuery(s, text)
  if (has(t, /similar|mirip|serupa/) && focus) {
    q = { type: focus.type, deal: focus.deal, maxPrice: null, minBedrooms: null, places: [] }
  }
  if (!isEmptyQuery(q)) {
    const hits = searchListings(s, q).filter((l) => l.id !== (has(t, /similar|mirip|serupa/) ? focus?.id : null))
    const place = q.places[0] ?? convo.place ?? null
    const log = { purpose: 'Search listings', tools: ['search_listings'] }
    if (!hits.length) {
      return {
        convo: { ...convo, place, budget: q.maxPrice ?? convo.budget, note: text },
        actions: [],
        replies: [
          {
            text: 'Nothing on our list matches yet. Leave your contact and I will ask the team to search our partner network.',
            quick: ['Contact me', 'Show all properties'],
          },
        ],
        log,
      }
    }
    const top = hits.slice(0, 3)
    return {
      convo: { ...convo, place, focus: top[0].id, budget: q.maxPrice ?? convo.budget, note: text },
      actions: [],
      replies: [
        {
          text:
            hits.length === 1
              ? 'I found 1 matching property:'
              : `I found ${hits.length} matching properties.${hits.length > top.length ? ` Here are the top ${top.length}:` : ''}`,
          listingIds: top.map((l) => l.id),
          quick: ['Book a site visit', 'Find similar'],
        },
      ],
      log,
    }
  }

  if (has(t, /all properties|other properties|semua aset|cari aset lain/)) {
    return { convo, actions: [], replies: [{ text: 'Tell me a type, location or budget, for example "shophouse in Bandung" or "warehouse for rent".' }] }
  }

  return {
    convo,
    actions: [],
    replies: [
      {
        text: `I'm ${s.settings.agentName}. I can find properties, explain a listing by its code (for example AS-0001), or book a site visit.`,
        quick: ['House in Jakarta', 'Warehouse for rent', 'Contact me'],
      },
    ],
  }
}

// ---------------------------------------------------------------- partner chat (listing and delisting)

type PartnerStage =
  | 'phone'
  | 'name'
  | 'menu'
  | 'type'
  | 'deal'
  | 'title'
  | 'location'
  | 'price'
  | 'land'
  | 'building'
  | 'bedrooms'
  | 'certificate'
  | 'highlights'
  | 'photos'
  | 'exclusive'
  | 'confirm'
  | 'delist_pick'
  | 'delist_reason'
  | 'delist_confirm'

export interface PartnerDraft {
  type?: AssetType
  deal?: DealType
  title?: string
  city?: string
  district?: string
  price?: number
  landArea?: number
  buildingArea?: number | null
  bedrooms?: number | null
  certificate?: string
  highlights?: string[]
  /** Data URLs, downscaled in the browser before they reach the chat. */
  photos?: string[]
  exclusiveDays?: number | null
}

export const MAX_LISTING_PHOTOS = 4

export interface PartnerConvo {
  stage: PartnerStage
  partnerId: string | null
  phone: string
  draft: PartnerDraft
  delistId: string | null
  delistReason: string
}

const MENU: Reply = {
  text: 'What would you like to do today?',
  quick: ['Register a property', 'Withdraw a listing', 'My listings'],
}

export const partnerStart = (s: AppState): Turn<PartnerConvo> => ({
  convo: { stage: 'phone', partnerId: null, phone: '', draft: {}, delistId: null, delistReason: '' },
  actions: [],
  replies: [
    {
      text: `Hello, Artha Samoedra partner. I'm ${s.settings.agentName}. I can register your property or withdraw a listing that has sold. To start, type your registered WhatsApp number.`,
    },
  ],
})

const partnerListings = (s: AppState, partnerId: string | null) =>
  s.listings.filter((l) => l.partnerId === partnerId)

export const needsBuilding = (t?: AssetType) => t !== 'tanah'
export const needsBedrooms = (t?: AssetType) => t === 'rumah' || t === 'villa' || t === 'apartemen'

const parseNumber = (text: string) => {
  const budget = parseBudget(text)
  if (budget) return budget
  const n = Number(text.replace(/[^\d,]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Field errors for the review card; the engine checks the same rules before it submits. */
export function partnerDraftErrors(d: PartnerDraft): Partial<Record<keyof PartnerDraft, string>> {
  const e: Partial<Record<keyof PartnerDraft, string>> = {}
  if (!d.type) e.type = 'Pick a property type.'
  if (!d.deal) e.deal = 'Pick sale or rent.'
  if ((d.title ?? '').trim().length < 10) e.title = 'Use at least 10 characters.'
  if (!d.city?.trim()) e.city = 'Enter the city.'
  if (!d.district?.trim()) e.district = 'Enter the district.'
  if (!d.price || d.price < 10_000_000) e.price = 'Enter a price of at least Rp 10 M.'
  if (!d.landArea || d.landArea <= 0) e.landArea = 'Enter the land area.'
  if (needsBuilding(d.type) && !(d.buildingArea && d.buildingArea > 0)) e.buildingArea = 'Enter the building area.'
  if (needsBedrooms(d.type) && !(d.bedrooms && d.bedrooms > 0)) e.bedrooms = 'Enter the number of bedrooms.'
  if (!d.certificate?.trim()) e.certificate = 'Enter the certificate.'
  if ((d.photos?.length ?? 0) > MAX_LISTING_PHOTOS) e.photos = `Keep at most ${MAX_LISTING_PHOTOS} photos.`
  return e
}

const ask = (convo: PartnerConvo, stage: PartnerStage, reply: Reply, draft?: Partial<PartnerDraft>): Turn<PartnerConvo> => ({
  convo: { ...convo, stage, draft: { ...convo.draft, ...draft } },
  actions: [],
  replies: [reply],
})

const QUESTIONS: Partial<Record<PartnerStage, Reply>> = {
  type: { text: 'What type of property is it?', quick: ASSET_TYPES.map((t) => ASSET_TYPE_LABEL[t]) },
  deal: { text: 'Is it for sale or for rent?', quick: ['For sale', 'For rent'] },
  title: { text: 'Write a short headline for the ad. For example: "Two-storey house near the station".' },
  location: { text: 'Which city and district? Separate them with a comma, for example: Bandung, Coblong.' },
  price: { text: 'What is your asking price? For example: Rp 2.5 B or Rp 850 M. For rentals, give the yearly price.' },
  land: { text: 'How large is the land, in m²?' },
  building: { text: 'How large is the building, in m²?' },
  bedrooms: { text: 'How many bedrooms?', quick: ['1', '2', '3', '4', '5'] },
  certificate: { text: 'Which certificate does it have?', quick: ['SHM', 'SHGB', 'HGB', 'SHMSRS', 'Girik'] },
  highlights: { text: 'List 1 to 3 highlights, separated by commas. For example: near the toll road, flood-free.' },
  photos: {
    text: `Add up to ${MAX_LISTING_PHOTOS} photos with the attach button: the front, the main rooms and the view work best. No photos yet? Tap Skip.`,
    quick: ['Skip'],
    attach: true,
  },
  exclusive: {
    text: 'Would you give Artha Samoedra exclusive marketing rights? We promote exclusive properties harder, and I will remind you before the period ends.',
    quick: ['Yes, 90 days', 'Yes, 60 days', 'No'],
  },
}

const REVIEW: Reply = {
  text: 'Here is your listing. Check every field and fix anything that is wrong, then send it to the team for review.',
  review: true,
}

const partnerPurpose = (before: PartnerStage, t: Turn<PartnerConvo>) => {
  const kinds = t.actions.map((a) => a.type)
  if (kinds.includes('listings/create')) return 'Submit listing'
  if (kinds.includes('listings/delist') || before.startsWith('delist')) return 'Withdraw listing'
  if (kinds.includes('partners/create')) return 'Partner registration'
  if (before === 'phone') return 'Partner sign-in'
  return before === 'menu' ? 'Partner menu' : 'Partner listing step'
}

/** What Jessy remembers about a partner, keyed by the WhatsApp number. */
const partnerFacts = (s: AppState, convo: PartnerConvo, t: Turn<PartnerConvo>) => {
  const partner = s.partners.find((p) => p.id === t.convo.partnerId)
  const facts: string[] = []
  for (const a of t.actions) {
    if (a.type === 'partners/create') facts.push(`Partner: ${a.partner.code} ${a.partner.name}`)
    if (a.type === 'listings/create') facts.push(`Last listing: ${a.listing.code}, in review`, `City: ${a.listing.city}`)
    if (a.type === 'listings/delist') facts.push(`Withdrew: ${s.listings.find((l) => l.id === a.id)?.code ?? a.id}, ${a.reason}`)
  }
  if (convo.stage === 'phone' && partner) facts.push(`Partner: ${partner.code} ${partner.name}`)
  return facts
}

export const partnerTurn: Engine<PartnerConvo> = (s, convo, raw, at, input) => {
  const turn = partnerStep(s, convo, raw, at, input)
  const subject = turn.convo.phone || null
  return { ...turn, log: { purpose: partnerPurpose(convo.stage, turn), subject, facts: partnerFacts(s, convo, turn) } }
}

const partnerStep = (s: AppState, convo: PartnerConvo, raw: string, at: string, input?: TurnInput): Turn<PartnerConvo> => {
  const text = raw.trim()
  const t = text.toLowerCase()
  const partner = s.partners.find((p) => p.id === convo.partnerId)

  if (convo.partnerId && CANCEL.test(t)) return ask({ ...convo, draft: {}, delistId: null }, 'menu', MENU)

  switch (convo.stage) {
    case 'phone': {
      const phone = normalizePhone(text)
      if (phone.length < 9) return ask(convo, 'phone', { text: 'That number looks incomplete. For example: 0812 3456 7890.' })
      const found = s.partners.find((p) => normalizePhone(p.phone) === phone)
      if (found) {
        return {
          convo: { ...convo, partnerId: found.id, phone, stage: 'menu' },
          actions: [],
          replies: [{ text: `Welcome back, ${found.name}.` }, MENU],
        }
      }
      return ask({ ...convo, phone }, 'name', {
        text: 'This number is not registered as a partner yet, so I will register you now. What is your name or company name?',
      })
    }
    case 'name': {
      if (text.length < 3) return ask(convo, 'name', { text: 'Please use at least 3 letters.' })
      const created = buildPartner(
        s,
        { name: text, kind: /\b(pt|cv)\b/i.test(text) ? 'developer' : 'owner', phone: convo.phone, email: '', city: '' },
        at,
      )
      return {
        convo: { ...convo, partnerId: created.id, stage: 'menu' },
        actions: [{ type: 'partners/create', partner: created }],
        replies: [{ text: `Thanks, ${text}. You are registered as partner ${created.code}.` }, MENU],
      }
    }
    case 'menu': {
      if (has(t, /register|new|list a|add|daftar|baru|jual|pasang|titip/)) return ask({ ...convo, draft: {} }, 'type', QUESTIONS.type!)
      const mine = partnerListings(s, convo.partnerId)
      if (has(t, /withdraw|remove|delist|take down|sold|tarik|hapus|turunkan|laku/)) {
        const pickable = mine.filter((l) => !delistBlocker(l))
        if (!pickable.length) {
          return ask(convo, 'menu', { ...MENU, text: 'You have no live listings to withdraw. Anything else?' })
        }
        return ask(convo, 'delist_pick', {
          text: 'Which listing would you like to withdraw?',
          listingIds: pickable.map((l) => l.id),
          quick: pickable.map((l) => l.code),
        })
      }
      if (has(t, /my listings|show|status|lihat|listing saya/)) {
        return ask(convo, 'menu', {
          text: mine.length ? `You have ${mine.length} ${mine.length === 1 ? 'listing' : 'listings'}:` : 'You have no listings yet.',
          listingIds: mine.map((l) => l.id),
          quick: MENU.quick,
        })
      }
      return ask(convo, 'menu', MENU)
    }
    case 'type': {
      const type = ASSET_TYPES.find((k) => TYPE_WORDS[k].test(t) || t === ASSET_TYPE_LABEL[k].toLowerCase())
      return type ? ask(convo, 'deal', QUESTIONS.deal!, { type }) : ask(convo, 'type', QUESTIONS.type!)
    }
    case 'deal': {
      const deal: DealType | null = has(t, /rent|lease|sewa/) ? 'sewa' : has(t, /sale|sell|jual/) ? 'jual' : null
      return deal ? ask(convo, 'title', QUESTIONS.title!, { deal }) : ask(convo, 'deal', QUESTIONS.deal!)
    }
    case 'title':
      return text.length >= 10
        ? ask(convo, 'location', QUESTIONS.location!, { title: text })
        : ask(convo, 'title', { text: 'That headline is too short. Use at least 10 characters.' })
    case 'location': {
      const [city, district] = text.split(',').map((x) => x.trim())
      if (!city || !district) return ask(convo, 'location', QUESTIONS.location!)
      return ask(convo, 'price', QUESTIONS.price!, { city, district })
    }
    case 'price': {
      const price = parseNumber(text)
      return price && price >= 10_000_000
        ? ask(convo, 'land', QUESTIONS.land!, { price })
        : ask(convo, 'price', { text: 'I could not read that price. For example: Rp 2.5 B or Rp 850 M.' })
    }
    case 'land': {
      const landArea = parseNumber(text)
      if (!landArea) return ask(convo, 'land', QUESTIONS.land!)
      if (needsBuilding(convo.draft.type)) return ask(convo, 'building', QUESTIONS.building!, { landArea })
      return ask(convo, 'certificate', QUESTIONS.certificate!, { landArea, buildingArea: null, bedrooms: null })
    }
    case 'building': {
      const buildingArea = parseNumber(text)
      if (!buildingArea) return ask(convo, 'building', QUESTIONS.building!)
      return needsBedrooms(convo.draft.type)
        ? ask(convo, 'bedrooms', QUESTIONS.bedrooms!, { buildingArea })
        : ask(convo, 'certificate', QUESTIONS.certificate!, { buildingArea, bedrooms: null })
    }
    case 'bedrooms': {
      const bedrooms = parseNumber(text)
      return bedrooms ? ask(convo, 'certificate', QUESTIONS.certificate!, { bedrooms }) : ask(convo, 'bedrooms', QUESTIONS.bedrooms!)
    }
    case 'certificate':
      return ask(convo, 'highlights', QUESTIONS.highlights!, { certificate: text.toUpperCase().slice(0, 12) })
    case 'highlights': {
      const highlights = text.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 3)
      return ask(convo, 'photos', QUESTIONS.photos!, { highlights })
    }
    case 'photos': {
      const added = input?.photos ?? []
      if (added.length) {
        const photos = [...(convo.draft.photos ?? []), ...added].slice(0, MAX_LISTING_PHOTOS)
        return {
          convo: { ...convo, stage: 'exclusive', draft: { ...convo.draft, photos } },
          actions: [],
          replies: [{ text: `Got ${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}. You can remove any of them on the review card.` }, QUESTIONS.exclusive!],
        }
      }
      if (has(t, /^(skip|no|none|later|done|lewati|tidak|nanti)\b/)) return ask(convo, 'exclusive', QUESTIONS.exclusive!, { photos: [] })
      return ask(convo, 'photos', { ...QUESTIONS.photos!, text: 'Use the attach button to add photos, or tap Skip.' })
    }
    case 'exclusive': {
      const days = has(t, /^no\b|not|tidak|enggak|nggak/) ? null : (Number(t.match(/\d+/)?.[0]) || 90)
      return ask(convo, 'confirm', REVIEW, { exclusiveDays: days })
    }
    case 'confirm': {
      if (!input?.draft && !has(t, /^(yes|ok|okay|send|sure|correct|ya|oke|kirim|setuju|benar)/)) return ask({ ...convo, draft: {} }, 'menu', { ...MENU, text: 'The listing was not sent. Anything else?' })
      const d: PartnerDraft = { ...convo.draft, ...input?.draft }
      const errors = Object.values(partnerDraftErrors(d))
      if (errors.length) return ask({ ...convo, draft: d }, 'confirm', { ...REVIEW, text: `Almost there. ${errors.join(' ')}` })
      const photos = d.photos ?? []
      const listing = buildListing(
        s,
        {
          title: d.title!,
          type: d.type!,
          deal: d.deal!,
          partnerId: convo.partnerId!,
          city: d.city!,
          district: d.district!,
          address: `${d.district}, ${d.city}`,
          price: d.price!,
          landArea: d.landArea!,
          buildingArea: d.buildingArea ?? null,
          bedrooms: d.bedrooms ?? null,
          certificate: d.certificate!,
          description: `${d.title} in ${d.district}, ${d.city}. ${(d.highlights ?? []).join('. ')}.`,
          highlights: d.highlights ?? [],
          photo: photos[0] ?? null,
          photos,
          status: 'review',
          source: 'jessy',
        },
        at,
      )
      const actions: AppAction[] = [{ type: 'listings/create', listing }]
      if (d.exclusiveDays) {
        actions.push({
          type: 'exclusives/upsert',
          exclusive: {
            id: newId('exc'),
            listingId: listing.id,
            startsAt: at,
            endsAt: addDays(at, d.exclusiveDays),
            remindDaysBefore: 14,
            endedAt: null,
            lastRemindedAt: null,
            note: 'Granted by the partner through the Jessy chat.',
          },
        })
      }
      return {
        convo: { ...convo, stage: 'menu', draft: {} },
        actions,
        replies: [
          {
            text: `Sent as ${listing.code}. The Artha Samoedra team reviews it within 24 hours, then the listing goes live on the website.${d.exclusiveDays ? ` The ${d.exclusiveDays}-day exclusive is recorded, and I will remind you before it ends.` : ''}`,
          },
          MENU,
        ],
      }
    }
    case 'delist_pick': {
      const l = partnerListings(s, convo.partnerId).find((x) => t.includes(x.code.toLowerCase()))
      if (!l) return ask(convo, 'delist_pick', { text: 'Pick a listing code from the list above.' })
      const blocker = delistBlocker(l)
      if (blocker) return ask(convo, 'menu', { ...MENU, text: `${l.code} cannot be withdrawn: ${blocker}` })
      return ask({ ...convo, delistId: l.id }, 'delist_reason', {
        text: `Why do you want to withdraw ${l.code}?`,
        quick: ['Sold it myself', 'No longer selling', 'Moving to another agent'],
      })
    }
    case 'delist_reason':
      return ask({ ...convo, delistReason: text }, 'delist_confirm', {
        text: `Withdraw ${s.listings.find((l) => l.id === convo.delistId)?.code} because "${text}"? The listing leaves the website and its exclusive rights end.`,
        quick: ['Yes, withdraw', 'Cancel'],
      })
    case 'delist_confirm': {
      if (!has(t, /^(yes|ok|okay|withdraw|sure|ya|oke|tarik|setuju)/)) return ask({ ...convo, delistId: null }, 'menu', { ...MENU, text: 'The listing stays live.' })
      const l = s.listings.find((x) => x.id === convo.delistId)
      const blocker = l ? delistBlocker(l) : 'Listing not found.'
      if (!l || blocker) return ask(convo, 'menu', { ...MENU, text: blocker ?? '' })
      return {
        convo: { ...convo, stage: 'menu', delistId: null },
        actions: [{ type: 'listings/delist', id: l.id, reason: convo.delistReason }],
        replies: [{ text: `${l.code} is off the website. Thank you${partner ? `, ${partner.name}` : ''}.` }, MENU],
      }
    }
  }
}
