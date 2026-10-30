import {
  ANTHROPIC_BLOCKER,
  BUDGET_WARN_SHARE,
  budgetState,
  contactByPhone,
  countBy,
  currentPrompt,
  DAY,
  fmtDate,
  fmtDateTime,
  fmtNumber,
  lineDiff,
  MODEL_PRICES,
  MODELS,
  monthCalls,
  newId,
  normalizePhone,
  nowIso,
  promptHistory,
  startOfDay,
  toMs,
  toolUsers,
  usageByAgent,
  usageByDay,
  usageTotals,
  type AppState,
} from '@artha/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  IconTile,
  Input,
  NativeSelect,
  PageHeader,
  PillTabs,
  ProgressBar,
  StatCard,
  Switch,
  Textarea,
  type Column,
} from '@artha/ui'
import type { AiAgent, AiAgentId, AiCall, AiMemory, AiSettings, AiTool, PromptVersion } from '@artha/types'
import { Activity, Bot, Brain, Cpu, Inbox, MessagesSquare, Pencil, Search, Sparkles, Trash2, Wallet, X, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { NoAccess } from '../../components/NoAccess'
import { useAppState, useNow } from '../../state/store'
import { useAct } from '../dialogs'

type Tab = 'agents' | 'prompts' | 'tools' | 'memory' | 'usage' | 'settings'
const TABS: { value: Tab; label: string }[] = [
  { value: 'agents', label: 'Agents' },
  { value: 'prompts', label: 'Prompts' },
  { value: 'tools', label: 'Tools' },
  { value: 'memory', label: 'Memory' },
  { value: 'usage', label: 'Usage' },
  { value: 'settings', label: 'Settings' },
]

const AGENT_ICON: Record<AiAgentId, LucideIcon> = {
  jessy_buyer: MessagesSquare,
  jessy_partner: Bot,
  content: Sparkles,
  inbox_assist: Inbox,
  jessy_console: Bot,
}

const PROVIDER_LABEL: Record<AiSettings['provider'], string> = { mock: 'Mock engine (rule based, no cost)', anthropic: 'Anthropic (needs a server key)' }

const fmtUsd = (n: number, digits = 2) => (n > 0 && n < 10 ** -digits ? `< $${(10 ** -digits).toFixed(digits)}` : `$${n.toFixed(digits)}`)
const fmtTokens = (n: number) => (n >= 1_000_000 ? `${fmtNumber(n / 1_000_000, 1)} M` : n >= 1000 ? `${fmtNumber(n / 1000, 1)} k` : fmtNumber(n))
const agentName = (s: AppState, id: AiAgentId) => s.aiAgents.find((a) => a.id === id)?.name ?? id

/** A phone in the log or memory, shown with the contact or partner it belongs to. */
const subjectName = (s: AppState, subject: string) => {
  const phone = normalizePhone(subject)
  return contactByPhone(s, subject)?.name ?? s.partners.find((p) => normalizePhone(p.phone) === phone)?.name ?? null
}

/** URL-backed filter state, shared by the tabs; switching tab clears the filters. */
function useParamsState() {
  const [params, setParams] = useSearchParams()
  const patch = (values: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    setParams(next, { replace: true })
  }
  const set = (key: string, value: string | null) => patch({ [key]: value })
  const clear = () => setParams(params.get('tab') ? { tab: params.get('tab')! } : {}, { replace: true })
  return { params, set, patch, clear, setTab: (tab: Tab) => setParams(tab === 'agents' ? {} : { tab }, { replace: true }) }
}

export function AiGatewayPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const { params, setTab } = useParamsState()
  const tab = (TABS.find((t) => t.value === params.get('tab'))?.value ?? 'agents') satisfies Tab
  if (!can('jessy.view')) return <NoAccess />

  const budget = budgetState(state, now)
  const today = usageTotals(state.aiCalls.filter((c) => toMs(c.at) >= startOfDay(now) && toMs(c.at) <= now))
  const on = state.aiAgents.filter((a) => a.enabled).length

  return (
    <div className="space-y-4">
      <PageHeader title="AI gateway" description="One layer every agent calls: which model it runs, its prompt and tools, what it remembers and what it costs." className="mb-2" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Calls today" value={fmtNumber(today.calls)} icon={<Activity />} tone="ink" hint={`${fmtTokens(today.inputTokens + today.outputTokens)} tokens`} />
        <StatCard label="Cost this month" value={fmtUsd(budget.spentUsd)} icon={<Wallet />} hint={`Budget ${fmtUsd(budget.budgetUsd)}`} />
        <StatCard
          label="Budget used"
          value={`${Math.round(budget.share * 100)}%`}
          icon={<Cpu />}
          tone={budget.warn ? 'warning' : 'default'}
          active={tab === 'usage'}
          onClick={() => setTab('usage')}
        />
        <StatCard label="Agents on" value={`${on} of ${state.aiAgents.length}`} icon={<Bot />} tone={on < state.aiAgents.length ? 'warning' : 'success'} active={tab === 'agents'} onClick={() => setTab('agents')} />
      </div>
      {budget.warn && (
        <Banner tone="warning" title={`${Math.round(budget.share * 100)}% of the monthly AI budget is used`}>
          {fmtUsd(budget.spentUsd)} of {fmtUsd(budget.budgetUsd)} this month. Raise the budget in Settings or switch agents to a cheaper model.
        </Banner>
      )}
      <PillTabs label="AI gateway sections" items={TABS} value={tab} onChange={setTab} />
      {tab === 'agents' && <AgentsTab />}
      {tab === 'prompts' && <PromptsTab />}
      {tab === 'tools' && <ToolsTab />}
      {tab === 'memory' && <MemoryTab />}
      {tab === 'usage' && <UsageTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  )
}

// ---------------------------------------------------------------- agents

function AgentsTab() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [editing, setEditing] = useState<AiAgent | null>(null)
  const manage = can('jessy.manage')
  const week = state.aiCalls.filter((c) => toMs(c.at) > now - 7 * DAY)
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {state.aiAgents.map((a) => {
          const Icon = AGENT_ICON[a.id]
          const usage = usageTotals(week.filter((c) => c.agentId === a.id))
          return (
            <Card key={a.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <IconTile tone={a.enabled ? 'accent' : 'default'}>
                  <Icon />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{a.name}</h2>
                  <p className="text-xs text-muted">{a.purpose}</p>
                </div>
                {manage ? (
                  <Switch
                    checked={a.enabled}
                    label={`${a.name} on`}
                    onCheckedChange={(enabled) => act({ type: 'ai/upsertAgent', agent: { ...a, enabled } }, enabled ? `${a.name} switched on` : `${a.name} switched off`, enabled ? undefined : 'Chats show an offline message until it is back on.')}
                  />
                ) : (
                  <Badge variant={a.enabled ? 'success' : 'outline'}>{a.enabled ? 'On' : 'Off'}</Badge>
                )}
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="min-w-0 rounded-xl bg-surface-2 p-2.5">
                  <dt className="text-[11px] text-muted">Model</dt>
                  <dd className="truncate font-mono text-xs font-semibold">{a.model}</dd>
                </div>
                <div className="rounded-xl bg-surface-2 p-2.5">
                  <dt className="text-[11px] text-muted">Temperature</dt>
                  <dd className="font-semibold tabular-nums">{a.temperature.toFixed(1)}</dd>
                </div>
                <div className="rounded-xl bg-surface-2 p-2.5">
                  <dt className="text-[11px] text-muted">Prompt</dt>
                  <dd className="font-semibold">v{currentPrompt(state, a.id)?.version ?? 0}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.toolIds.map((id) => (
                  <Badge key={id} variant="muted" className="font-mono">
                    {id}
                  </Badge>
                ))}
              </div>
              <div className="mt-auto pt-4 text-xs text-muted">
                Last 7 days: {fmtNumber(usage.calls)} calls · {fmtTokens(usage.inputTokens + usage.outputTokens)} tokens · {fmtUsd(usage.costUsd)}
              </div>
              {manage && (
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => setEditing(a)}>
                    <Pencil />
                    Edit
                  </Button>
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} title={`Edit ${editing?.name ?? ''}`} description="Model, temperature and the tools this agent may call.">
        {editing && <AgentForm agent={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  )
}

function AgentForm({ agent, onDone }: { agent: AiAgent; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [model, setModel] = useState(agent.model)
  const [temperature, setTemperature] = useState(String(agent.temperature))
  const [tools, setTools] = useState(agent.toolIds)
  const [tried, setTried] = useState(false)
  const temp = Number(temperature)
  const tempError = temperature.trim() !== '' && temp >= 0 && temp <= 1 ? null : 'Use a number from 0 to 1.'
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (tempError) return
        if (act({ type: 'ai/upsertAgent', agent: { ...agent, model, temperature: temp, toolIds: tools } }, `${agent.name} saved`, `${model}, temperature ${temp.toFixed(1)}`)) onDone()
      }}
    >
      <FormField label="Model" hint={`Input and output price per million tokens: $${MODEL_PRICES[model][0]} and $${MODEL_PRICES[model][1]}`}>
        <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
          {MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField label="Temperature" error={tried ? (tempError ?? undefined) : undefined} hint="Lower is steadier, higher is more varied">
        <Input type="number" inputMode="decimal" min={0} max={1} step={0.1} value={temperature} onChange={(e) => setTemperature(e.target.value)} />
      </FormField>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Tools</legend>
        <div className="space-y-2">
          {state.aiTools.map((t) => (
            <Checkbox
              key={t.id}
              checked={tools.includes(t.id)}
              onCheckedChange={(v) => setTools(v ? [...tools, t.id] : tools.filter((x) => x !== t.id))}
              label={t.name}
            />
          ))}
        </div>
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save agent</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- prompts

function PromptsTab() {
  const { state } = useAppState()
  const { can } = useAuth()
  const { params, set, patch } = useParamsState()
  const [publishing, setPublishing] = useState(false)
  const agentId = (state.aiAgents.find((a) => a.id === params.get('agent'))?.id ?? state.aiAgents[0]?.id) as AiAgentId | undefined
  if (!agentId) return <Card><EmptyState title="No agents yet" description="Agents appear here once the gateway is seeded." /></Card>
  const history = promptHistory(state, agentId)
  const current = currentPrompt(state, agentId)
  const picked = history.find((p) => p.id === params.get('version')) ?? current ?? history[0]
  const previous = history.find((p) => picked && p.version < picked.version)
  const userName = (id: string) => state.users.find((u) => u.id === id)?.name ?? id

  return (
    <div className="space-y-4">
      <ChipRow>
        {state.aiAgents.map((a) => (
          <Chip key={a.id} active={a.id === agentId} count={promptHistory(state, a.id).length} onClick={() => patch({ agent: a.id === state.aiAgents[0].id ? null : a.id, version: null })}>
            {a.name}
          </Chip>
        ))}
      </ChipRow>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card>
          <CardHeader
            action={
              can('jessy.manage') && (
                <Button size="sm" onClick={() => setPublishing(true)}>
                  <Pencil />
                  Edit and publish
                </Button>
              )
            }
          >
            <CardTitle>
              Version {picked?.version ?? 0}
              {picked && picked.id === current?.id && <Badge variant="success" className="ml-2 align-middle">In use</Badge>}
            </CardTitle>
            {picked && <p className="text-xs text-muted">{picked.note} · {userName(picked.createdBy)} · {fmtDateTime(picked.createdAt)}</p>}
          </CardHeader>
          <CardContent className="space-y-3">
            {picked ? (
              <>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">{previous ? `Changes since version ${previous.version}` : 'System prompt'}</div>
                <PromptDiff before={previous?.system ?? null} after={picked.system} />
              </>
            ) : (
              <EmptyState compact title="No prompt yet" description="Publish the first version to give this agent its instructions." />
            )}
          </CardContent>
        </Card>
        <Card className="self-start">
          <CardHeader>
            <CardTitle>Version history</CardTitle>
          </CardHeader>
          <ol className="space-y-1 px-3 pb-3">
            {history.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  aria-current={p.id === picked?.id}
                  onClick={() => set('version', p.id === current?.id ? null : p.id)}
                  className="flex w-full items-start gap-3 rounded-xl p-2.5 text-left hover:bg-surface-2 aria-[current=true]:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface text-xs font-bold">v{p.version}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.note || 'No note'}</span>
                    <span className="block text-xs text-muted">{fmtDate(p.createdAt)}{p.id === current?.id ? ' · in use' : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <Dialog open={publishing} onOpenChange={setPublishing} title={`New prompt for ${agentName(state, agentId)}`} description="Publishing makes it the version the agent runs from its next turn." size="lg">
        {publishing && <PublishForm agentId={agentId} base={current} onDone={() => setPublishing(false)} />}
      </Dialog>
    </div>
  )
}

function PromptDiff({ before, after }: { before: string | null; after: string }) {
  const lines = before === null ? after.split('\n').map((text) => ({ kind: 'same' as const, text })) : lineDiff(before, after)
  return (
    <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-surface-2 p-3 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div
          key={i}
          className={l.kind === 'added' ? 'rounded bg-success-soft text-success' : l.kind === 'removed' ? 'rounded bg-accent-soft text-accent-strong line-through' : undefined}
        >
          <span aria-hidden className="mr-2 select-none text-muted">{l.kind === 'added' ? '+' : l.kind === 'removed' ? '−' : ' '}</span>
          <span className="sr-only">{l.kind === 'added' ? 'Added: ' : l.kind === 'removed' ? 'Removed: ' : ''}</span>
          {l.text || ' '}
        </div>
      ))}
    </pre>
  )
}

function PublishForm({ agentId, base, onDone }: { agentId: AiAgentId; base: PromptVersion | undefined; onDone: () => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [system, setSystem] = useState(base?.system ?? '')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const version = Math.max(0, ...promptHistory(state, agentId).map((p) => p.version)) + 1
  const errors = {
    system: system.trim().length >= 20 ? null : 'Write at least 20 characters.',
    note: note.trim() ? null : 'Say what changed, for the history.',
  }
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (errors.system || errors.note) return
        const prompt: PromptVersion = { id: newId('prm'), agentId, version, system: system.trim(), note: note.trim(), createdBy: user.id, createdAt: nowIso() }
        if (act({ type: 'ai/publishPrompt', prompt }, `Version ${version} published`, agentName(state, agentId))) onDone()
      }}
    >
      <FormField label="System prompt" error={tried ? (errors.system ?? undefined) : undefined}>
        <Textarea value={system} rows={10} onChange={(e) => setSystem(e.target.value)} className="font-mono text-xs md:text-xs" />
      </FormField>
      <FormField label="What changed" error={tried ? (errors.note ?? undefined) : undefined}>
        <Input value={note} placeholder="e.g. Ask for the preferred visit day" onChange={(e) => setNote(e.target.value)} />
      </FormField>
      {base && system.trim() !== base.system && (
        <div>
          <div className="mb-1.5 text-sm font-medium">Changes since version {base.version}</div>
          <PromptDiff before={base.system} after={system.trim()} />
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Publish version {version}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- tools

function ToolsTab() {
  const { state } = useAppState()
  const { params, set, clear } = useParamsState()
  const q = params.get('q') ?? ''
  const agent = (params.get('agent') as AiAgentId | null) || null
  const rows = state.aiTools.filter(
    (t) =>
      (!agent || state.aiAgents.find((a) => a.id === agent)?.toolIds.includes(t.id)) &&
      (!q || `${t.id} ${t.name} ${t.description} ${t.action}`.toLowerCase().includes(q.toLowerCase())),
  )
  const filters = [q, agent].filter(Boolean).length
  const columns: Column<AiTool>[] = [
    {
      id: 'name',
      header: 'Tool',
      sortValue: (t) => t.id,
      cell: (t) => (
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold">{t.id}</div>
          <div className="text-sm">{t.description}</div>
          <div className="mt-1 font-mono text-[11px] text-muted md:hidden">{t.action}</div>
        </div>
      ),
    },
    { id: 'action', header: 'Store action', hideBelow: 'md', cell: (t) => <span className="font-mono text-xs">{t.action === 'read' ? 'read only' : t.action}</span> },
    { id: 'params', header: 'Parameters', hideBelow: 'xl', cell: (t) => <span className="font-mono text-xs text-muted">{t.params.join(', ')}</span> },
    {
      id: 'agents',
      header: 'Used by',
      hideBelow: 'sm',
      sortValue: (t) => toolUsers(state, t.id).length,
      cell: (t) => {
        const users = toolUsers(state, t.id)
        return users.length ? (
          <div className="flex flex-wrap gap-1">
            {users.map((a) => (
              <Badge key={a.id} variant={a.enabled ? 'default' : 'outline'}>
                {a.name}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">No agent</span>
        )
      },
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool registry</CardTitle>
        <p className="text-xs text-muted">Functions an agent may call. Each runs one store action, so the same rules and audit apply as for the team.</p>
      </CardHeader>
      <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search tools"
          placeholder="Tool or action"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
          right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
        />
        <NativeSelect variant="inline" aria-label="Filter by agent" value={agent ?? ''} onChange={(e) => set('agent', e.target.value)}>
          <option value="">All agents</option>
          {state.aiAgents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && <FilterCaption shown={rows.length} total={state.aiTools.length} filters={filters} onClear={clear} />}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(t) => t.id}
        resetPageKey={`${q}|${agent}`}
        empty={<EmptyState compact title="No matching tools" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />}
      />
    </Card>
  )
}

function FilterCaption({ shown, total, filters, onClear }: { shown: number; total: number; filters: number; onClear: () => void }) {
  return (
    <span className="text-xs text-muted tabular-nums">
      {shown} of {total}
      <Button variant="ghost" size="sm" className="ml-1" onClick={onClear}>
        Clear {filters} filter{filters === 1 ? '' : 's'}
      </Button>
    </span>
  )
}

// ---------------------------------------------------------------- memory

function MemoryTab() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const { params, set, clear } = useParamsState()
  const q = params.get('q') ?? ''
  const agent = (params.get('agent') as AiAgentId | null) || null
  const matches = (m: AiMemory) => !q || `${m.subject} ${subjectName(state, m.subject) ?? ''} ${m.facts.join(' ')}`.toLowerCase().includes(q.toLowerCase())
  const counts = countBy(state.aiMemory.filter(matches), (m) => m.agentId)
  const rows = state.aiMemory.filter((m) => matches(m) && (!agent || m.agentId === agent))
  const filters = [q, agent].filter(Boolean).length
  const manage = can('jessy.manage')

  const columns: Column<AiMemory>[] = [
    {
      id: 'subject',
      header: 'Who',
      sortValue: (m) => subjectName(state, m.subject) ?? m.subject,
      cell: (m) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{subjectName(state, m.subject) ?? 'Unknown'}</div>
          <div className="font-mono text-xs text-muted">{m.subject}</div>
          <div className="mt-0.5 text-[11px] text-muted sm:hidden">{agentName(state, m.agentId)}</div>
        </div>
      ),
    },
    { id: 'agent', header: 'Agent', hideBelow: 'sm', cell: (m) => <span className="text-xs">{agentName(state, m.agentId)}</span> },
    {
      id: 'facts',
      header: 'Facts',
      hideBelow: 'md',
      cell: (m) => (
        <ul className="flex flex-wrap gap-1">
          {m.facts.map((f) => (
            <li key={f} className="rounded-full bg-surface-2 px-2.5 py-0.5 text-xs">
              {f}
            </li>
          ))}
        </ul>
      ),
    },
    { id: 'updated', header: 'Updated', align: 'right', hideBelow: 'lg', sortValue: (m) => m.updatedAt, cell: (m) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(m.updatedAt)}</span> },
  ]
  if (manage) {
    columns.push({
      id: 'clear',
      header: <span className="sr-only">Clear</span>,
      align: 'right',
      cell: (m) => (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Clear memory of ${subjectName(state, m.subject) ?? m.subject}`}
          onClick={() => act({ type: 'ai/clearMemory', id: m.id }, 'Memory cleared', `${agentName(state, m.agentId)} forgot ${m.facts.length} facts`)}
        >
          <Trash2 />
        </Button>
      ),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memory</CardTitle>
        <p className="text-xs text-muted">Facts an agent keeps per buyer or partner, keyed by WhatsApp number. A new answer replaces the fact with the same label.</p>
      </CardHeader>
      <div className="space-y-2 px-5 pb-3">
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search memory"
          placeholder="Name, number or fact"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="w-full sm:w-72"
          right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
        />
        <div className="flex flex-wrap items-center gap-2">
          <ChipRow className="flex-1">
            <Chip variant="default" active={!agent} count={Object.values(counts).reduce((a, b) => a + b, 0)} onClick={() => set('agent', null)}>
              All
            </Chip>
            {state.aiAgents.map((a) => (
              <Chip key={a.id} variant="default" active={agent === a.id} count={counts[a.id] ?? 0} onClick={() => set('agent', agent === a.id ? null : a.id)}>
                {a.name}
              </Chip>
            ))}
          </ChipRow>
          {filters > 0 && <FilterCaption shown={rows.length} total={state.aiMemory.length} filters={filters} onClear={clear} />}
        </div>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(m) => m.id}
        initialSort={{ id: 'updated', desc: true }}
        resetPageKey={`${q}|${agent}`}
        empty={
          filters ? (
            <EmptyState compact title="No matching memory" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState compact icon={<Brain />} title="Nothing remembered yet" description="Jessy stores budget, city and qualification answers once a buyer or partner shares a number." />
          )
        }
      />
    </Card>
  )
}

// ---------------------------------------------------------------- usage

type CallStatus = 'ok' | 'failed'

function UsageTab() {
  const { state } = useAppState()
  const now = useNow()
  const { params, set, clear } = useParamsState()
  const q = params.get('q') ?? ''
  const agent = (params.get('agent') as AiAgentId | null) || null
  const status = (params.get('status') as CallStatus | null) || null
  const budget = budgetState(state, now)
  const month = monthCalls(state, now)
  const days = usageByDay(state.aiCalls, now, 14)
  const peak = Math.max(...days.map((d) => d.costUsd), 0.0001)
  const perAgent = usageByAgent(state, month)

  const matches = (c: AiCall) =>
    (!agent || c.agentId === agent) &&
    (!q || `${c.purpose} ${c.model} ${c.subject ?? ''} ${c.subject ? (subjectName(state, c.subject) ?? '') : ''} ${c.toolCalls.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
  const statusCounts = countBy(state.aiCalls.filter(matches), (c) => (c.ok ? 'ok' : 'failed'))
  const rows = state.aiCalls.filter((c) => matches(c) && (!status || (status === 'ok') === c.ok))
  const filters = [q, agent, status].filter(Boolean).length

  const columns: Column<AiCall>[] = [
    {
      id: 'purpose',
      header: 'Call',
      cell: (c) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
            {c.purpose}
            {!c.ok && <Badge variant="accent">Failed</Badge>}
          </div>
          <div className="truncate text-xs text-muted">
            {agentName(state, c.agentId)}
            {c.subject && ` · ${subjectName(state, c.subject) ?? c.subject}`}
          </div>
          {c.toolCalls.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.toolCalls.map((t) => (
                <Badge key={t} variant="muted" className="font-mono">
                  {t}
                </Badge>
              ))}
            </div>
          )}
          <div className="mt-0.5 text-[11px] text-muted md:hidden">{fmtDateTime(c.at)}</div>
        </div>
      ),
    },
    { id: 'model', header: 'Model', hideBelow: 'xl', cell: (c) => <span className="font-mono text-xs">{c.model}</span> },
    { id: 'tokens', header: 'Tokens in / out', align: 'right', hideBelow: 'lg', sortValue: (c) => c.inputTokens + c.outputTokens, cell: (c) => <span className="whitespace-nowrap text-xs tabular-nums">{fmtNumber(c.inputTokens)} / {fmtNumber(c.outputTokens)}</span> },
    { id: 'latency', header: 'Latency', align: 'right', hideBelow: 'lg', sortValue: (c) => c.latencyMs, cell: (c) => <span className="whitespace-nowrap text-xs tabular-nums">{fmtNumber(c.latencyMs / 1000, 1)} s</span> },
    { id: 'cost', header: 'Cost', align: 'right', hideBelow: 'sm', sortValue: (c) => c.costUsd, cell: (c) => <span className="whitespace-nowrap text-xs font-semibold tabular-nums">{fmtUsd(c.costUsd, 4)}</span> },
    { id: 'at', header: 'Time', align: 'right', hideBelow: 'md', sortValue: (c) => c.at, cell: (c) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(c.at)}</span> },
  ]

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold">Budget this month</h2>
          <div className="mt-3 flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums">{fmtUsd(budget.spentUsd)}</span>
            <span className="text-sm text-muted">of {fmtUsd(budget.budgetUsd)}</span>
          </div>
          <ProgressBar value={budget.share * 100} tone={budget.warn ? 'warning' : 'ink'} className="mt-3 h-2" />
          <p className="mt-2 text-xs text-muted">
            {budget.warn
              ? `Above the ${Math.round(BUDGET_WARN_SHARE * 100)}% warning line.`
              : `The console warns at ${Math.round(BUDGET_WARN_SHARE * 100)}%, ${fmtUsd(budget.budgetUsd * BUDGET_WARN_SHARE)}.`}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-surface-2 p-2.5">
              <dt className="text-[11px] text-muted">Calls</dt>
              <dd className="font-semibold tabular-nums">{fmtNumber(month.length)}</dd>
            </div>
            <div className="rounded-xl bg-surface-2 p-2.5">
              <dt className="text-[11px] text-muted">Tokens</dt>
              <dd className="font-semibold tabular-nums">{fmtTokens(month.reduce((n, c) => n + c.inputTokens + c.outputTokens, 0))}</dd>
            </div>
          </dl>
        </Card>
        <Card className="min-w-0 p-5">
          <h2 className="text-sm font-semibold">Cost per day, last 14 days</h2>
          <ol className="mt-4 flex h-36 items-end gap-1" aria-label="Cost per day">
            {days.map((d, i) => (
              <li key={d.day} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${fmtDate(d.day)}: ${d.calls} calls, ${fmtUsd(d.costUsd)}`}>
                <span className="sr-only">{fmtDate(d.day)}: {d.calls} calls, {fmtUsd(d.costUsd)}</span>
                <span className={i === days.length - 1 ? 'rounded-t-md bg-accent' : 'rounded-t-md bg-chart-muted'} style={{ height: `${Math.max(2, (d.costUsd / peak) * 100)}%` }} />
              </li>
            ))}
          </ol>
          <div className="mt-2 flex justify-between text-[11px] text-muted">
            <span>{fmtDate(days[0].day)}</span>
            <span>Today</span>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Per agent, this month</CardTitle>
        </CardHeader>
        <div className="overflow-x-auto px-5 pb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-2 font-medium">Agent</th>
                <th className="py-2 text-right font-medium">Calls</th>
                <th className="hidden py-2 text-right font-medium sm:table-cell">Tokens</th>
                <th className="hidden py-2 text-right font-medium md:table-cell">Avg latency</th>
                <th className="py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {perAgent.map((r) => (
                <tr key={r.agent.id}>
                  <td className="py-2.5">
                    <div className="font-medium">{r.agent.name}</div>
                    {r.failed > 0 && <div className="text-xs text-accent-strong">{r.failed} failed</div>}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">{fmtNumber(r.calls)}</td>
                  <td className="hidden py-2.5 text-right tabular-nums sm:table-cell">{fmtTokens(r.inputTokens + r.outputTokens)}</td>
                  <td className="hidden py-2.5 text-right tabular-nums md:table-cell">{fmtNumber(r.latencyMs / 1000, 1)} s</td>
                  <td className="py-2.5 text-right font-semibold tabular-nums">{fmtUsd(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest calls</CardTitle>
        </CardHeader>
        <div className="space-y-2 px-5 pb-3">
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search calls"
            placeholder="Purpose, tool, name or number"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="w-full sm:w-80"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
          <div className="flex flex-wrap items-center gap-2">
            <ChipRow className="flex-1">
              <Chip variant="default" active={!status} count={(statusCounts.ok ?? 0) + (statusCounts.failed ?? 0)} onClick={() => set('status', null)}>
                All
              </Chip>
              <Chip variant="default" active={status === 'ok'} count={statusCounts.ok ?? 0} onClick={() => set('status', status === 'ok' ? null : 'ok')}>
                Succeeded
              </Chip>
              <Chip variant="default" active={status === 'failed'} count={statusCounts.failed ?? 0} onClick={() => set('status', status === 'failed' ? null : 'failed')}>
                Failed
              </Chip>
            </ChipRow>
            <NativeSelect variant="inline" aria-label="Filter by agent" value={agent ?? ''} onChange={(e) => set('agent', e.target.value)}>
              <option value="">All agents</option>
              {state.aiAgents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
            {filters > 0 && <FilterCaption shown={rows.length} total={state.aiCalls.length} filters={filters} onClear={clear} />}
          </div>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(c) => c.id}
          initialSort={{ id: 'at', desc: true }}
          resetPageKey={`${q}|${agent}|${status}`}
          rowClassName={(c) => (c.ok ? undefined : 'bg-accent-soft/40')}
          empty={
            filters ? (
              <EmptyState compact title="No matching calls" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState compact icon={<Activity />} title="No calls yet" description="Calls show up here once an agent answers a chat or drafts content." />
            )
          }
        />
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------- settings

function SettingsTab() {
  const { state } = useAppState()
  const { can } = useAuth()
  const s = state.aiSettings
  if (!can('jessy.manage')) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gateway settings</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-border text-sm">
            {[
              ['Provider', PROVIDER_LABEL[s.provider]],
              ['Default model', s.defaultModel],
              ['Monthly budget', fmtUsd(s.monthlyBudgetUsd)],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-3">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0 break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    )
  }
  return <SettingsForm key={`${s.provider}|${s.defaultModel}|${s.monthlyBudgetUsd}`} settings={s} />
}

function SettingsForm({ settings }: { settings: AiSettings }) {
  const act = useAct()
  const [provider, setProvider] = useState(settings.provider)
  const [model, setModel] = useState(settings.defaultModel)
  const [budget, setBudget] = useState(String(settings.monthlyBudgetUsd))
  const [tried, setTried] = useState(false)
  const amount = Number(budget)
  const budgetError = amount > 0 ? null : 'Enter an amount above 0.'
  const changed = provider !== settings.provider || model !== settings.defaultModel || amount !== settings.monthlyBudgetUsd
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Gateway settings</CardTitle>
        <p className="text-xs text-muted">Applies to every agent. An agent with its own model keeps it.</p>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (budgetError) return
            act({ type: 'ai/settings', patch: { provider, defaultModel: model, monthlyBudgetUsd: amount } }, 'Gateway settings saved', `${fmtUsd(amount)} a month on ${model}`)
          }}
        >
          <FormField label="Provider" error={provider === 'anthropic' ? ANTHROPIC_BLOCKER : undefined}>
            <NativeSelect value={provider} onChange={(e) => setProvider(e.target.value as AiSettings['provider'])}>
              {(Object.keys(PROVIDER_LABEL) as AiSettings['provider'][]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Default model" hint="Used by agents without a model of their own and for cost estimates">
            <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Monthly budget, USD" error={tried ? (budgetError ?? undefined) : undefined} hint={`The console warns at ${Math.round(BUDGET_WARN_SHARE * 100)}% of this amount`}>
            <Input type="number" inputMode="decimal" min={0} step={1} value={budget} onChange={(e) => setBudget(e.target.value)} />
          </FormField>
          <div className="flex justify-end">
            <Button type="submit" disabled={!changed} title={provider === 'anthropic' ? ANTHROPIC_BLOCKER : undefined}>
              Save settings
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
