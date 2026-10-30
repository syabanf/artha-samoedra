import { countBy, fmtAgo, fmtDateTime } from '@artha/fixtures'
import { Button, Card, CardContent, CardHeader, CardTitle, Chip, ChipRow, DataTable, EmptyState, FormField, IconTile, Input, PageHeader, type Column } from '@artha/ui'
import { AGENT_EVENT_KIND_LABEL, type AgentEvent, type AgentEventKind } from '@artha/types'
import { BellRing, FileText, MessagesSquare, Plus, Sparkles, Undo2, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'

const KIND_ICON: Record<AgentEventKind, typeof Sparkles> = {
  inquiry: MessagesSquare,
  listing: UserPlus,
  delisting: Undo2,
  reminder: BellRing,
  content: FileText,
}

const KINDS = Object.keys(AGENT_EVENT_KIND_LABEL) as AgentEventKind[]

export function JessyPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const [kind, setKind] = useState<AgentEventKind | null>(null)
  const counts = countBy(state.agentEvents, (e) => e.kind)
  const rows = state.agentEvents.filter((e) => !kind || e.kind === kind)
  const name = state.settings.agentName

  const columns: Column<AgentEvent>[] = [
    {
      id: 'text',
      header: 'Action',
      cell: (e) => {
        const Icon = KIND_ICON[e.kind]
        return (
          <div className="flex items-start gap-3">
            <IconTile size="sm" tone={e.kind === 'reminder' ? 'warning' : e.kind === 'inquiry' ? 'danger' : 'default'}>
              <Icon />
            </IconTile>
            <div className="min-w-0">
              <div className="text-sm">{e.text}</div>
              <div className="mt-0.5 text-[11px] text-muted md:hidden">{fmtAgo(e.at)}</div>
            </div>
          </div>
        )
      },
    },
    { id: 'kind', header: 'Type', hideBelow: 'sm', cell: (e) => <span className="text-xs">{AGENT_EVENT_KIND_LABEL[e.kind]}</span> },
    { id: 'at', header: 'Time', align: 'right', hideBelow: 'md', sortValue: (e) => e.at, cell: (e) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(e.at)}</span> },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title={`Agent ${name}`} description="What the Artha Samoedra AI agent does, plus settings for its name and the media accounts it manages." className="mb-2" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card variant="ink" className="p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-strong [&_svg]:size-5">
                <Sparkles />
              </span>
              <div>
                <div className="text-lg font-bold">{name}</div>
                <div className="text-xs text-on-ink-muted">Active on the website, partner portal and console</div>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {KINDS.map((k) => {
                const Icon = KIND_ICON[k]
                return (
                  <div key={k} className="rounded-2xl bg-white/5 p-3">
                    <Icon className="size-4 text-on-ink-muted" />
                    <div className="mt-2 text-2xl font-bold tabular-nums">{counts[k] ?? 0}</div>
                    <div className="text-[11px] text-on-ink-muted">{AGENT_EVENT_KIND_LABEL[k]}</div>
                  </div>
                )
              })}
            </div>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Activity log</CardTitle>
            </CardHeader>
            <div className="px-5 pb-3">
              <ChipRow>
                <Chip variant="default" active={!kind} count={state.agentEvents.length} onClick={() => setKind(null)}>
                  All
                </Chip>
                {KINDS.map((k) => (
                  <Chip key={k} variant="default" active={kind === k} count={counts[k] ?? 0} onClick={() => setKind(kind === k ? null : k)}>
                    {AGENT_EVENT_KIND_LABEL[k]}
                  </Chip>
                ))}
              </ChipRow>
            </div>
            <DataTable
              rows={rows}
              columns={columns}
              getRowKey={(e) => e.id}
              initialSort={{ id: 'at', desc: true }}
              resetPageKey={kind ?? ''}
              empty={<EmptyState compact title="No activity yet" description="Activity shows up when Jessy answers a chat, receives a listing or sends a reminder." />}
            />
          </Card>
        </div>
        {can('jessy.manage') && <SettingsCard />}
      </div>
    </div>
  )
}

function SettingsCard() {
  const { state } = useAppState()
  const act = useAct()
  const [name, setName] = useState(state.settings.agentName)
  const [account, setAccount] = useState('')
  const accounts = state.settings.socialAccounts
  const nameError = name.trim().length < 2 ? 'Name needs at least 2 characters.' : null
  const handle = account.trim().startsWith('@') ? account.trim() : `@${account.trim()}`
  return (
    <Card className="self-start">
      <CardHeader>
        <CardTitle>Agent settings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <form
          noValidate
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!nameError) act({ type: 'settings/update', patch: { agentName: name.trim() } }, 'Agent name saved', `Visitors now chat with ${name.trim()}`)
          }}
        >
          <FormField label="Agent name" error={nameError ?? undefined} hint="Shown in website chat, the partner portal and the console">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <Button type="submit" variant="outline" size="sm" disabled={name.trim() === state.settings.agentName}>
            Save name
          </Button>
        </form>
        <div>
          <div className="mb-1.5 text-sm font-medium">Homeless media accounts</div>
          <ul className="space-y-1.5">
            {accounts.map((a) => (
              <li key={a} className="flex items-center justify-between rounded-xl bg-surface-2 py-1.5 pl-3 pr-1.5 text-sm">
                {a}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${a}`}
                  onClick={() => act({ type: 'settings/update', patch: { socialAccounts: accounts.filter((x) => x !== a) } }, 'Account removed', a)}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <form
            noValidate
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (account.trim().length < 3 || accounts.includes(handle)) return
              act({ type: 'settings/update', patch: { socialAccounts: [...accounts, handle] } }, 'Account added', handle)
              setAccount('')
            }}
          >
            <Input aria-label="New account" placeholder="@newaccount" value={account} onChange={(e) => setAccount(e.target.value)} className="flex-1" />
            <Button type="submit" variant="outline" size="icon" aria-label="Add account" disabled={account.trim().length < 3}>
              <Plus />
            </Button>
          </form>
        </div>
      </CardContent>
    </Card>
  )
}
