/** AI gateway: one layer every agent calls for prompts, tools, memory and usage logging. */

export type AiAgentId = 'jessy_buyer' | 'jessy_partner' | 'content' | 'inbox_assist' | 'jessy_console'

export interface AiAgent {
  id: AiAgentId
  name: string
  purpose: string
  model: string
  temperature: number
  enabled: boolean
  toolIds: string[]
  /** The prompt version in use. */
  promptId: string
}

export interface PromptVersion {
  id: string
  agentId: AiAgentId
  version: number
  system: string
  note: string
  createdBy: string
  createdAt: string
}

export interface AiTool {
  id: string
  name: string
  description: string
  /** The store action the tool runs, e.g. 'inquiries/create'. */
  action: string
  params: string[]
}

export interface AiCall {
  id: string
  at: string
  agentId: AiAgentId
  purpose: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  latencyMs: number
  ok: boolean
  toolCalls: string[]
  /** Phone or contact id the call was about, for memory and audit. */
  subject: string | null
}

export interface AiMemory {
  id: string
  agentId: AiAgentId
  subject: string
  facts: string[]
  updatedAt: string
}

export interface AiSettings {
  provider: 'mock' | 'anthropic'
  defaultModel: string
  monthlyBudgetUsd: number
}
