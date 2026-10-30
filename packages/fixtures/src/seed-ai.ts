import type { AiAgent, AiAgentId, AiCall, AiMemory, AiSettings, AiTool, PromptVersion } from '@artha/types'
import { DAY, FIXTURE_NOW } from './clock'
import { MODEL_PRICES, memoryId } from './gateway'
import { INQUIRIES, PARTNERS } from './seed'

const at = (days: number) => new Date(FIXTURE_NOW + days * DAY).toISOString()

export const AI_TOOLS: AiTool[] = [
  { id: 'search_listings', name: 'Search listings', description: 'Finds live listings by type, deal, place, budget and bedrooms.', action: 'read', params: ['type', 'deal', 'place', 'maxPrice', 'minBedrooms'] },
  { id: 'create_inquiry', name: 'Create inquiry', description: 'Logs a buyer lead with contact details and qualification answers.', action: 'inquiries/create', params: ['name', 'phone', 'listingId', 'budget', 'qualification'] },
  { id: 'create_listing', name: 'Create listing', description: 'Submits a partner property for team review, with photos.', action: 'listings/create', params: ['title', 'type', 'deal', 'city', 'district', 'price', 'landArea', 'photos'] },
  { id: 'delist_listing', name: 'Delist listing', description: 'Takes a partner listing off the website with a reason.', action: 'listings/delist', params: ['listingId', 'reason'] },
  { id: 'draft_social_post', name: 'Draft social post', description: 'Writes a post, carousel or reel script from listing data.', action: 'social/upsert', params: ['listingId', 'platform', 'format'] },
  { id: 'draft_blog_post', name: 'Draft blog post', description: 'Writes an SEO and GEO article around a keyword.', action: 'blog/upsert', params: ['title', 'keyword', 'listingIds'] },
  { id: 'read_attendance', name: 'Read attendance', description: 'Who is in, late, absent or on leave on a day.', action: 'read', params: ['date', 'departmentId'] },
  { id: 'read_stock', name: 'Read stock', description: 'On-hand quantities, low stock and stock value.', action: 'read', params: ['itemId', 'warehouseId'] },
  { id: 'read_sales', name: 'Read sales', description: 'Deals won, pipeline and revenue for a period.', action: 'read', params: ['from', 'to', 'ownerId'] },
  { id: 'read_candidates', name: 'Read candidates', description: 'A candidate\'s stage, tests, interviews and offer.', action: 'read', params: ['name', 'openingId'] },
  { id: 'read_approvals', name: 'Read approvals', description: 'Requests waiting for the member to decide.', action: 'read', params: ['userId'] },
  { id: 'read_leave', name: 'Read leave', description: 'Leave balances and who is on leave.', action: 'read', params: ['employeeId'] },
  { id: 'read_exclusives', name: 'Read exclusive rights', description: 'Exclusive rights near their end date.', action: 'read', params: ['days'] },
  { id: 'read_receivables', name: 'Read receivables', description: 'Open and overdue invoices by customer.', action: 'read', params: ['asOf'] },
  { id: 'assign_agent', name: 'Assign agent', description: 'Hands a lead to a sales agent.', action: 'inquiries/assign', params: ['inquiryId', 'ownerId'] },
]

const PROMPTS: Record<AiAgentId, string> = {
  jessy_console: [
    'You are Jessy, the assistant inside the Artha Samoedra console, working for the signed-in team member.',
    'Answer from the store with the read tools: attendance, stock, sales, candidates, approvals, receivables and listings.',
    'Show only what the member\'s role may see. Say so when a question needs a permission they lack.',
    'For a change, propose it first: say exactly what will happen, then wait for Confirm. Never act without it.',
    'Run the change as the member, so the audit log names them.',
  ].join('\n'),
  jessy_buyer: [
    'You are Jessy, the property assistant of Artha Samoedra on the public website.',
    'Find listings with search_listings and answer only from listing data.',
    'When a buyer shows interest, ask budget, timeline, financing and purpose, one question at a time, with quick replies.',
    'Then take a name and WhatsApp number and log the lead with create_inquiry.',
    'Name the assigned sales agent in the handoff, or say "our team" when nobody is assigned.',
  ].join('\n'),
  jessy_partner: [
    'You are Jessy, the partner assistant of Artha Samoedra.',
    'Identify the partner by WhatsApp number, or register them.',
    'Collect type, deal, headline, location, price, sizes, certificate, highlights and up to 4 photos.',
    'Show the partner a review card before calling create_listing. Listings enter as review.',
    'Withdraw a listing with delist_listing only after the partner confirms the reason.',
  ].join('\n'),
  content: [
    'You are the Artha Samoedra content agent for faceless media accounts.',
    'Write captions, carousels and reel scripts from listing data only. Never invent prices or features.',
    'Blog posts open with an answer-first summary and include an FAQ.',
  ].join('\n'),
  inbox_assist: [
    'You suggest a reply for the sales team in the inbox.',
    'Answer the last customer message in two short sentences, greet by first name and sign with the agent name.',
  ].join('\n'),
}

export const AI_PROMPTS: PromptVersion[] = (Object.keys(PROMPTS) as AiAgentId[]).map((agentId) => ({
  id: `prm-${agentId}-1`,
  agentId,
  version: 1,
  system: PROMPTS[agentId],
  note: 'First version.',
  createdBy: 'usr-1',
  createdAt: at(-30),
}))

export const AI_AGENTS: AiAgent[] = [
  { id: 'jessy_buyer', name: 'Jessy, buyer chat', purpose: 'Finds listings for website visitors, qualifies buyers and hands them to sales.', model: 'claude-haiku-5-5', temperature: 0.3, enabled: true, toolIds: ['search_listings', 'create_inquiry', 'assign_agent'], promptId: 'prm-jessy_buyer-1' },
  { id: 'jessy_partner', name: 'Jessy, partner chat', purpose: 'Registers partners, takes listings with photos and withdraws sold ones.', model: 'claude-haiku-5-5', temperature: 0.2, enabled: true, toolIds: ['search_listings', 'create_listing', 'delist_listing'], promptId: 'prm-jessy_partner-1' },
  { id: 'content', name: 'Content agent', purpose: 'Drafts social posts, carousels, reel scripts and blog articles.', model: 'claude-sonnet-5-5', temperature: 0.7, enabled: true, toolIds: ['search_listings', 'draft_social_post', 'draft_blog_post'], promptId: 'prm-content-1' },
  { id: 'jessy_console', name: 'Jessy, console assistant', purpose: 'Answers team questions from live data and proposes changes the member confirms.', model: 'claude-sonnet-5-5', temperature: 0.2, enabled: true, toolIds: ['read_attendance', 'read_leave', 'read_stock', 'read_sales', 'read_candidates', 'read_approvals', 'read_receivables', 'read_exclusives', 'search_listings'], promptId: 'prm-jessy_console-1' },
  { id: 'inbox_assist', name: 'Inbox suggester', purpose: 'Drafts a reply in the team inbox from the last customer message.', model: 'claude-haiku-5-5', temperature: 0.4, enabled: true, toolIds: ['search_listings'], promptId: 'prm-inbox_assist-1' },
]

export const AI_SETTINGS: AiSettings = { provider: 'mock', defaultModel: 'claude-haiku-5-5', monthlyBudgetUsd: 3 }

/** Deterministic sample traffic: about two weeks of calls per agent, so the usage tab has a shape. */
const PLAN: { agentId: AiAgentId; perDay: number; purposes: [string, string[]][]; input: [number, number]; output: [number, number] }[] = [
  { agentId: 'jessy_buyer', perDay: 9, purposes: [['Search listings', ['search_listings']], ['Answer listing question', []], ['Qualify buyer', []], ['Capture lead', ['create_inquiry']]], input: [1800, 3200], output: [80, 260] },
  { agentId: 'jessy_partner', perDay: 3, purposes: [['Partner listing step', []], ['Submit listing', ['create_listing']], ['Withdraw listing', ['delist_listing']]], input: [1500, 2600], output: [60, 200] },
  { agentId: 'content', perDay: 2, purposes: [['Draft social post', ['draft_social_post']], ['Draft blog post', ['draft_blog_post']], ['Rewrite caption', []]], input: [5000, 9000], output: [900, 2400] },
  { agentId: 'inbox_assist', perDay: 4, purposes: [['Suggest reply', []]], input: [700, 1400], output: [40, 120] },
]

const SUBJECTS = [...INQUIRIES.map((i) => i.phone), ...PARTNERS.map((p) => p.phone)]

export const AI_CALLS: AiCall[] = (() => {
  let seed = 7
  const rnd = () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647
  const between = ([lo, hi]: [number, number]) => Math.round(lo + rnd() * (hi - lo))
  const calls: AiCall[] = []
  for (let day = 13; day >= 0; day--) {
    for (const p of PLAN) {
      const n = Math.max(1, Math.round(p.perDay * (0.6 + rnd() * 0.8)))
      for (let k = 0; k < n; k++) {
        const agent = AI_AGENTS.find((a) => a.id === p.agentId)!
        const [purpose, toolCalls] = p.purposes[Math.floor(rnd() * p.purposes.length)]
        const inputTokens = between(p.input)
        const outputTokens = between(p.output)
        const [pin, pout] = MODEL_PRICES[agent.model]
        // Calls spread over office hours, never later than the fixture clock.
        const offset = -day * DAY - (1 + rnd() * 9) * 3_600_000
        const ok = rnd() > 0.03
        calls.push({
          id: `aic-seed-${calls.length + 1}`,
          at: new Date(FIXTURE_NOW + offset).toISOString(),
          agentId: p.agentId,
          purpose,
          model: agent.model,
          inputTokens,
          outputTokens,
          costUsd: (inputTokens * pin + outputTokens * pout) / 1_000_000,
          latencyMs: ok ? 300 + outputTokens * 8 + Math.round(rnd() * 400) : 30_000,
          ok,
          toolCalls: ok ? toolCalls : [],
          subject: p.agentId === 'content' ? null : SUBJECTS[Math.floor(rnd() * SUBJECTS.length)],
        })
      }
    }
  }
  return calls.sort((a, b) => b.at.localeCompare(a.at))
})()

export const AI_MEMORY: AiMemory[] = [
  { id: memoryId('jessy_buyer', INQUIRIES[0].phone), agentId: 'jessy_buyer', subject: INQUIRIES[0].phone, facts: ['Name: Rizky Ananda', 'Budget: Rp 7 B', 'Interested in: AS-0001', 'Timeline: now', 'Financing: cash'], updatedAt: at(-0.1) },
  { id: memoryId('jessy_buyer', INQUIRIES[3].phone), agentId: 'jessy_buyer', subject: INQUIRIES[3].phone, facts: ['Name: Putri Lestari', 'Budget: Rp 2 B', 'Preferred city: Bogor', 'Bedrooms: 3', 'Financing: mortgage'], updatedAt: at(-0.3) },
  { id: memoryId('jessy_buyer', INQUIRIES[5].phone), agentId: 'jessy_buyer', subject: INQUIRIES[5].phone, facts: ['Name: Siti Rahma', 'Budget: Rp 2.2 B', 'Financing: mortgage', 'Purpose: live in'], updatedAt: at(-2) },
  { id: memoryId('jessy_partner', PARTNERS[0].phone), agentId: 'jessy_partner', subject: PARTNERS[0].phone, facts: ['Partner: MT-001 Hendra Gunawan', 'City: Jakarta Selatan', 'Prefers: exclusive for 90 days'], updatedAt: at(-6) },
  { id: memoryId('jessy_partner', PARTNERS[2].phone), agentId: 'jessy_partner', subject: PARTNERS[2].phone, facts: ['Partner: MT-003 Sri Wahyuni', 'City: Bandung', 'Photographer visit: Thursday 10:00'], updatedAt: at(-3) },
]
