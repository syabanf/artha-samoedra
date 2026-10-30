import type { AiAgent, AiAgentId, AiCall, AiMemory, AiSettings, AiTool, PromptVersion } from '@artha/types'
import { DAY, startOfDay, toMs } from './clock'
import { normalizePhone } from './derive'
import { newId } from './format'
import { upsert } from './rows'
import type { AppState } from './store'

export type AiAction =
  | { type: 'ai/logCall'; call: AiCall }
  | { type: 'ai/upsertAgent'; agent: AiAgent }
  | { type: 'ai/publishPrompt'; prompt: PromptVersion }
  | { type: 'ai/setMemory'; memory: AiMemory }
  | { type: 'ai/clearMemory'; id: string }
  | { type: 'ai/settings'; patch: Partial<AiSettings> }

/** USD per million tokens, input and output. */
export const MODEL_PRICES: Record<string, [number, number]> = {
  'claude-haiku-5-5': [1, 5],
  'claude-sonnet-5-5': [3, 15],
  'claude-opus-5-5': [15, 75],
  mock: [0, 0],
}

export const MODELS = Object.keys(MODEL_PRICES)

/** Share of the monthly budget at which the console warns. */
export const BUDGET_WARN_SHARE = 0.8

const tokens = (text: string) => Math.max(1, Math.ceil(text.length / 4))

/**
 * Builds the usage record for one agent call. The mock engines answer locally; the record keeps the
 * same shape a real model call would, so the gateway log and budget work before a key is connected.
 */
export function aiCall(s: AppState, agentId: AiAgentId, purpose: string, input: string, output: string, at: string, extra: Partial<AiCall> = {}): AiCall {
  const agent = s.aiAgents.find((x) => x.id === agentId)
  const model = agent?.model ?? s.aiSettings.defaultModel
  const [pin, pout] = MODEL_PRICES[model] ?? [0, 0]
  const prompt = s.aiPrompts.find((p) => p.id === agent?.promptId)?.system ?? ''
  const inputTokens = tokens(prompt + input)
  const outputTokens = tokens(output)
  return {
    id: newId('aic'),
    at,
    agentId,
    purpose,
    model,
    inputTokens,
    outputTokens,
    costUsd: (inputTokens * pin + outputTokens * pout) / 1_000_000,
    latencyMs: 300 + outputTokens * 8,
    ok: true,
    toolCalls: [],
    subject: null,
    ...extra,
  }
}

/** Tool ids for the store actions an agent dispatched in one turn. */
export const TOOL_FOR_ACTION: Record<string, string> = {
  'inquiries/create': 'create_inquiry',
  'inquiries/assign': 'assign_agent',
  'listings/create': 'create_listing',
  'listings/delist': 'delist_listing',
  'social/upsert': 'draft_social_post',
  'blog/upsert': 'draft_blog_post',
}

// ---------------------------------------------------------------- memory

/** One memory row per agent and subject, so later turns update the same facts. */
export const memoryId = (agentId: AiAgentId, subject: string) => `mem-${agentId}-${normalizePhone(subject) || subject}`

const factKey = (fact: string) => fact.split(':')[0].trim().toLowerCase()

/** Facts read "Label: value"; a new fact replaces the old one with the same label. */
export const mergeFacts = (old: string[], fresh: string[]) => {
  const keys = new Set(fresh.map(factKey))
  return [...old.filter((f) => !keys.has(factKey(f))), ...fresh]
}

export function rememberFacts(s: AppState, agentId: AiAgentId, subject: string, facts: string[], at: string): AiMemory | null {
  if (!facts.length || !subject) return null
  const id = memoryId(agentId, subject)
  const old = s.aiMemory.find((m) => m.id === id)
  const merged = mergeFacts(old?.facts ?? [], facts)
  if (old && merged.join('\n') === old.facts.join('\n')) return null
  return { id, agentId, subject, facts: merged, updatedAt: at }
}

// ---------------------------------------------------------------- usage

export interface UsageTotals {
  calls: number
  failed: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
}

export const usageTotals = (calls: AiCall[]): UsageTotals => {
  const t = calls.reduce(
    (acc, c) => ({
      calls: acc.calls + 1,
      failed: acc.failed + (c.ok ? 0 : 1),
      inputTokens: acc.inputTokens + c.inputTokens,
      outputTokens: acc.outputTokens + c.outputTokens,
      costUsd: acc.costUsd + c.costUsd,
      latencyMs: acc.latencyMs + c.latencyMs,
    }),
    { calls: 0, failed: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, latencyMs: 0 },
  )
  return { ...t, latencyMs: t.calls ? Math.round(t.latencyMs / t.calls) : 0 }
}

/** Calls from the first day of the month `nowMs` falls in. */
export const monthCalls = (s: AppState, nowMs: number) => {
  const d = new Date(nowMs)
  const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  return s.aiCalls.filter((c) => toMs(c.at) >= from && toMs(c.at) <= nowMs)
}

export interface BudgetState {
  spentUsd: number
  budgetUsd: number
  share: number
  warn: boolean
}

export const budgetState = (s: AppState, nowMs: number): BudgetState => {
  const spentUsd = usageTotals(monthCalls(s, nowMs)).costUsd
  const budgetUsd = s.aiSettings.monthlyBudgetUsd
  const share = budgetUsd > 0 ? spentUsd / budgetUsd : 1
  return { spentUsd, budgetUsd, share, warn: share >= BUDGET_WARN_SHARE }
}

/** One row per day for the last `days` days, oldest first. */
export const usageByDay = (calls: AiCall[], nowMs: number, days: number) => {
  const today = startOfDay(nowMs)
  return Array.from({ length: days }, (_, i) => {
    const from = today - (days - 1 - i) * DAY
    return { day: new Date(from).toISOString(), ...usageTotals(calls.filter((c) => toMs(c.at) >= from && toMs(c.at) < from + DAY)) }
  })
}

export const usageByAgent = (s: AppState, calls: AiCall[]) =>
  s.aiAgents.map((a) => ({ agent: a, ...usageTotals(calls.filter((c) => c.agentId === a.id)) }))

export const toolUsers = (s: AppState, toolId: string) => s.aiAgents.filter((a) => a.toolIds.includes(toolId))

// ---------------------------------------------------------------- prompts

export const promptHistory = (s: AppState, agentId: AiAgentId) =>
  s.aiPrompts.filter((p) => p.agentId === agentId).sort((a, b) => b.version - a.version)

export const currentPrompt = (s: AppState, agentId: AiAgentId) => {
  const agent = s.aiAgents.find((a) => a.id === agentId)
  return s.aiPrompts.find((p) => p.id === agent?.promptId)
}

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string }

/** Line diff by longest common subsequence: enough for prompts of a few dozen lines. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: 'removed', text: a[i++] })
    else out.push({ kind: 'added', text: b[j++] })
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++] })
  while (j < b.length) out.push({ kind: 'added', text: b[j++] })
  return out
}

// ---------------------------------------------------------------- blockers and reducer slice

export const ANTHROPIC_BLOCKER = 'The Anthropic provider needs an API key on the server. Keep the mock provider until the backend is connected.'

export function aiBlocker(s: AppState, a: AiAction): string | null {
  switch (a.type) {
    case 'ai/logCall':
      return s.aiAgents.find((x) => x.id === a.call.agentId)?.enabled ? null : 'This agent is switched off in the AI gateway.'
    case 'ai/upsertAgent': {
      if (!MODEL_PRICES[a.agent.model]) return 'Pick a model from the list.'
      if (!(a.agent.temperature >= 0 && a.agent.temperature <= 1)) return 'Temperature must be between 0 and 1.'
      const unknown = a.agent.toolIds.find((id) => !s.aiTools.some((t) => t.id === id))
      return unknown ? `The tool ${unknown} is not in the registry.` : null
    }
    case 'ai/publishPrompt': {
      if (a.prompt.system.trim().length < 20) return 'The system prompt needs at least 20 characters.'
      const current = currentPrompt(s, a.prompt.agentId)
      return current && current.system.trim() === a.prompt.system.trim() ? 'Nothing changed since the current version.' : null
    }
    case 'ai/clearMemory':
      return s.aiMemory.some((m) => m.id === a.id) ? null : 'This memory was already cleared.'
    case 'ai/settings':
      if (a.patch.provider === 'anthropic') return ANTHROPIC_BLOCKER
      if (a.patch.defaultModel !== undefined && !MODEL_PRICES[a.patch.defaultModel]) return 'Pick a model from the list.'
      if (a.patch.monthlyBudgetUsd !== undefined && !(a.patch.monthlyBudgetUsd > 0)) return 'The monthly budget must be above 0.'
      return null
    default:
      return null
  }
}

export function aiApply(s: AppState, a: AiAction): AppState {
  switch (a.type) {
    case 'ai/logCall':
      return { ...s, aiCalls: [a.call, ...s.aiCalls].slice(0, 2000) }
    case 'ai/upsertAgent':
      return { ...s, aiAgents: upsert(s.aiAgents, a.agent) }
    case 'ai/publishPrompt':
      return {
        ...s,
        aiPrompts: [a.prompt, ...s.aiPrompts],
        aiAgents: s.aiAgents.map((x) => (x.id === a.prompt.agentId ? { ...x, promptId: a.prompt.id } : x)),
      }
    case 'ai/setMemory':
      return { ...s, aiMemory: upsert(s.aiMemory, a.memory, true) }
    case 'ai/clearMemory':
      return { ...s, aiMemory: s.aiMemory.filter((m) => m.id !== a.id) }
    case 'ai/settings':
      return { ...s, aiSettings: { ...s.aiSettings, ...a.patch } }
  }
}

export type { AiTool }
