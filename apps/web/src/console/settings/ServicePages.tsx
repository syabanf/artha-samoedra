import { countBy, fillTemplate, fmtAgo, fmtDate, fmtDateTime, newId, normalizePhone, nowIso, templateVariables } from '@artha/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
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
  Switch,
  Textarea,
  toast,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import {
  INTEGRATION_STATUS_LABEL,
  MESSAGE_STATUS_LABEL,
  NOTIFY_CHANNEL_LABEL,
  TEMPLATE_CATEGORY_LABEL,
  type ApiToken,
  type Integration,
  type IntegrationKind,
  type IntegrationStatus,
  type MessageLog,
  type MessageStatus,
  type MessageTemplate,
  type NotifyChannel,
  type TemplateCategory,
} from '@artha/types'
import { Building2, Copy, CreditCard, Instagram, KeyRound, Mail, MessageCircle, Pencil, Plus, Send, Trash2, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/auth'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import { Clapperboard } from 'lucide-react'

const KIND_ICON: Record<IntegrationKind, LucideIcon> = {
  whatsapp: MessageCircle,
  instagram: Instagram,
  tiktok: Clapperboard,
  payment: CreditCard,
  email: Mail,
  portal: Building2,
}
const STATUS_VARIANT: Record<IntegrationStatus, BadgeVariant> = { connected: 'success', disconnected: 'outline', error: 'accent' }

// ---------------------------------------------------------------- integrations

export function IntegrationsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const [connecting, setConnecting] = useState<Integration | null>(null)
  const manage = can('integrations.manage')
  return (
    <div className="space-y-4">
      <PageHeader title="Integrations" description="Services the console and Jessy talk to. Secret keys go to the server once and never show again." className="mb-2" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.integrations.map((i) => {
          const Icon = KIND_ICON[i.kind]
          return (
            <Card key={i.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <IconTile tone={i.status === 'connected' ? 'success' : i.status === 'error' ? 'danger' : 'default'}>
                  <Icon />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{i.name}</h2>
                  <p className="text-xs text-muted">{i.provider}</p>
                </div>
                <Badge variant={STATUS_VARIANT[i.status]} dot={i.status === 'error'}>
                  {INTEGRATION_STATUS_LABEL[i.status]}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-body">{i.description}</p>
              {i.lastError && <p className="mt-3 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">{i.lastError}</p>}
              <div className="mt-auto pt-4 text-xs text-muted">
                {i.status !== 'disconnected' && i.account ? `${i.account} · since ${fmtDate(i.connectedAt!)}` : 'Not set up'}
              </div>
              {manage && (
                <div className="mt-3 flex gap-2">
                  {i.status === 'connected' ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => toast('Connection works', { tone: 'success', description: `${i.provider} answered in 240 ms` })}>
                        Test
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => act({ type: 'integrations/disconnect', id: i.id }, `${i.name} disconnected`)}>
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setConnecting(i)}>
                      {i.status === 'error' ? 'Reconnect' : 'Connect'}
                    </Button>
                  )}
                </div>
              )}
            </Card>
          )
        })}
      </div>
      <Dialog
        open={!!connecting}
        onOpenChange={(v) => !v && setConnecting(null)}
        title={`Connect ${connecting?.name ?? ''}`}
        description={`Paste the credentials from your ${connecting?.provider ?? ''} dashboard. The console keeps only the account name.`}
      >
        {connecting && <ConnectForm integration={connecting} onDone={() => setConnecting(null)} />}
      </Dialog>
    </div>
  )
}

function ConnectForm({ integration, onDone }: { integration: Integration; onDone: () => void }) {
  const act = useAct()
  const [account, setAccount] = useState(integration.account)
  const [secret, setSecret] = useState('')
  const [tried, setTried] = useState(false)
  const errors = {
    account: account.trim() ? null : 'Enter the account, number or handle.',
    secret: secret.trim().length >= 12 ? null : 'Paste the full API key.',
  }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        if (act({ type: 'integrations/connect', id: integration.id, account: account.trim() }, `${integration.name} connected`, account.trim())) onDone()
      }}
    >
      <div className="space-y-4">
        <FormField label="Account" required error={tried ? (errors.account ?? undefined) : undefined}>
          <Input value={account} onChange={(e) => setAccount(e.target.value)} />
        </FormField>
        <FormField label="API key" required error={tried ? (errors.secret ?? undefined) : undefined} hint="Write-only: sent once, never shown again">
          <Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} inputClassName="font-mono" />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Connect</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- messaging

const MSG_VARIANT: Record<MessageStatus, BadgeVariant> = { sent: 'default', delivered: 'info', read: 'success', failed: 'accent' }

export function MessagingPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const manage = can('integrations.manage')
  const [editing, setEditing] = useState<MessageTemplate | 'new' | null>(null)
  const [testing, setTesting] = useState<MessageTemplate | null>(null)
  const [status, setStatus] = useState<MessageStatus | null>(null)
  const [q, setQ] = useState('')
  const wa = state.integrations.find((i) => i.kind === 'whatsapp')
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (m: MessageLog) => terms.every((t) => `${m.to} ${m.body}`.toLowerCase().includes(t))
  const rows = state.messages.filter((m) => matches(m) && (!status || m.status === status))
  const counts = countBy(state.messages.filter(matches), (m) => m.status)
  const tplName = (id: string | null) => state.templates.find((t) => t.id === id)?.name ?? 'Free text'

  const columns: Column<MessageLog>[] = [
    { id: 'to', header: 'To', cell: (m) => <div><div className="font-mono text-xs font-semibold">{m.to}</div><div className="text-xs text-muted">{tplName(m.templateId)}</div></div> },
    { id: 'body', header: 'Message', hideBelow: 'md', cell: (m) => <span className="line-clamp-2 text-sm">{m.body}</span> },
    { id: 'status', header: 'Status', cell: (m) => <Badge variant={MSG_VARIANT[m.status]}>{MESSAGE_STATUS_LABEL[m.status]}</Badge> },
    { id: 'at', header: 'Sent', align: 'right', hideBelow: 'sm', sortValue: (m) => m.at, cell: (m) => <span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(m.at)}</span> },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Messaging"
        description="WhatsApp templates Jessy and the team send, with {{variables}} filled from the record. The log shows every message the gateway handled."
        className="mb-2"
        actions={manage && <Button onClick={() => setEditing('new')}><Plus />New template</Button>}
      />
      {wa?.status !== 'connected' && <Banner tone="warning" title="WhatsApp gateway is not connected">Messages queue but do not leave until the gateway is connected in Integrations.</Banner>}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {state.templates.map((t) => (
          <Card key={t.id} className="flex flex-col p-5">
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate font-semibold">{t.name}</h2>
              <Badge variant="muted">{TEMPLATE_CATEGORY_LABEL[t.category]}</Badge>
            </div>
            <p className="mt-3 flex-1 rounded-2xl bg-surface-2 p-3 text-sm">{t.body}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {templateVariables(t.body).map((v) => (
                <span key={v} className="rounded-full bg-info-soft px-2 py-0.5 font-mono text-[11px] text-info">
                  {v}
                </span>
              ))}
            </div>
            {manage && (
              <div className="mt-4 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setTesting(t)}>
                  <Send />
                  Test send
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                  <Pencil />
                </Button>
                <Button variant="ghost" size="icon-sm" className="ml-auto text-accent" aria-label={`Delete ${t.name}`} onClick={() => act({ type: 'templates/remove', id: t.id }, 'Template deleted', t.name)}>
                  <Trash2 />
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Message log</CardTitle>
        </CardHeader>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
          <Input variant="soft" inputClassName="rounded-full" aria-label="Search messages" placeholder="Number or text" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:w-56" />
          <ChipRow>
            <Chip variant="default" active={!status} count={state.messages.filter(matches).length} onClick={() => setStatus(null)}>
              All
            </Chip>
            {(Object.keys(MESSAGE_STATUS_LABEL) as MessageStatus[]).map((s) => (
              <Chip key={s} variant="default" active={status === s} count={counts[s] ?? 0} onClick={() => setStatus(status === s ? null : s)}>
                {MESSAGE_STATUS_LABEL[s]}
              </Chip>
            ))}
          </ChipRow>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(m) => m.id}
          initialSort={{ id: 'at', desc: true }}
          resetPageKey={`${q}|${status}`}
          empty={<EmptyState compact title="No messages match" action={<Button variant="outline" size="sm" onClick={() => { setQ(''); setStatus(null) }}>Clear filters</Button>} />}
        />
      </Card>
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)} title={editing === 'new' ? 'New template' : 'Edit template'} description="Wrap variables in double braces, for example {{name}} or {{listing}}.">
        {editing && <TemplateForm editing={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      </Dialog>
      <Dialog open={!!testing} onOpenChange={(v) => !v && setTesting(null)} title={`Test "${testing?.name ?? ''}"`} description="Fill the variables and send the message to one number.">
        {testing && <TestSendForm template={testing} onDone={() => setTesting(null)} />}
      </Dialog>
    </div>
  )
}

function TemplateForm({ editing, onDone }: { editing: MessageTemplate | null; onDone: () => void }) {
  const act = useAct()
  const [t, setT] = useState<MessageTemplate>(editing ?? { id: newId('tpl'), name: '', category: 'inquiry', body: '' })
  const [tried, setTried] = useState(false)
  const errors = { name: t.name.trim() ? null : 'Name the template.', body: t.body.trim().length >= 10 ? null : 'Write the message, at least 10 characters.' }
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        if (act({ type: 'templates/upsert', template: { ...t, name: t.name.trim(), body: t.body.trim() } }, 'Template saved', t.name)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Name" required error={tried ? (errors.name ?? undefined) : undefined}>
          <Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        </FormField>
        <FormField label="Category">
          <NativeSelect value={t.category} onChange={(e) => setT({ ...t, category: e.target.value as TemplateCategory })}>
            {(Object.keys(TEMPLATE_CATEGORY_LABEL) as TemplateCategory[]).map((c) => (
              <option key={c} value={c}>
                {TEMPLATE_CATEGORY_LABEL[c]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Message" required error={tried ? (errors.body ?? undefined) : undefined} hint={`Variables: ${templateVariables(t.body).join(', ') || 'none'}`} className="sm:col-span-2">
          <Textarea value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save template</Button>
      </DialogFooter>
    </form>
  )
}

function TestSendForm({ template, onDone }: { template: MessageTemplate; onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const vars = templateVariables(template.body)
  const [to, setTo] = useState('')
  const [values, setValues] = useState<Record<string, string>>({})
  const [tried, setTried] = useState(false)
  const phone = normalizePhone(to)
  const body = fillTemplate(template.body, values)
  const connected = state.integrations.find((i) => i.kind === 'whatsapp')?.status === 'connected'
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (phone.length < 9) return
        const message: MessageLog = { id: newId('msg'), at: nowIso(), to, templateId: template.id, body, status: connected ? 'sent' : 'failed' }
        act({ type: 'messages/send', message }, connected ? 'Test message sent' : 'Message failed', connected ? to : 'The WhatsApp gateway is not connected.')
        onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="WhatsApp number" required error={tried && phone.length < 9 ? 'Enter a full number, for example 0812 3456 7890.' : undefined} className="sm:col-span-2">
          <Input inputMode="tel" value={to} onChange={(e) => setTo(e.target.value)} />
        </FormField>
        {vars.map((v) => (
          <FormField key={v} label={v}>
            <Input value={values[v] ?? ''} onChange={(e) => setValues({ ...values, [v]: e.target.value })} />
          </FormField>
        ))}
      </div>
      <p className="mt-4 rounded-2xl bg-surface-2 p-3 text-sm">{body}</p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">
          <Send />
          Send test
        </Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- notifications

export function NotificationsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const manage = can('integrations.manage')
  const channels = Object.keys(NOTIFY_CHANNEL_LABEL) as NotifyChannel[]
  const failedCount = state.outbox.filter((o) => o.status === 'failed').length
  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description="Which event reaches which roles, and on which channel. In-app items show in the bell, push goes to the browser, WhatsApp and email go through Integrations."
        className="mb-2"
        actions={
          <Button asChild variant="outline">
            <Link to={failedCount ? `${paths.outbox}?status=failed` : paths.outbox}>
              <Send />
              {failedCount ? `Outbox, ${failedCount} failed` : 'Open outbox'}
            </Link>
          </Button>
        }
      />
      <div className="space-y-3">
        {state.notificationRules.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-[12rem] flex-1">
                <h2 className="font-semibold">{r.event}</h2>
                <p className="text-sm text-muted">{r.description}</p>
              </div>
              {manage ? (
                <Switch
                  checked={r.enabled}
                  label={`${r.event} notifications`}
                  onCheckedChange={(on) => act({ type: 'notificationRules/update', id: r.id, patch: { enabled: on } }, on ? 'Rule turned on' : 'Rule turned off', r.event)}
                />
              ) : (
                <Badge variant={r.enabled ? 'success' : 'muted'}>{r.enabled ? 'On' : 'Off'}</Badge>
              )}
            </div>
            {!manage ? (
              <div className={`mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 ${r.enabled ? '' : 'opacity-60'}`}>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Channels</div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.channels.length ? r.channels.map((c) => <Badge key={c} variant="outline">{NOTIFY_CHANNEL_LABEL[c]}</Badge>) : <span className="text-sm text-muted">None</span>}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Roles</div>
                  <div className="flex flex-wrap gap-1.5">
                    {state.roles.filter((role) => r.roleIds.includes(role.id)).map((role) => <Badge key={role.id} variant="muted">{role.name}</Badge>)}
                    {!r.roleIds.length && <span className="text-sm text-muted">None</span>}
                  </div>
                </div>
              </div>
            ) : (
            <fieldset disabled={!r.enabled} className="mt-4 grid grid-cols-1 gap-4 disabled:opacity-60 md:grid-cols-2">
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Channels</div>
                <div className="flex flex-wrap gap-4">
                  {channels.map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={r.channels.includes(c)}
                        label={`${r.event} by ${NOTIFY_CHANNEL_LABEL[c]}`}
                        disabled={!manage || !r.enabled}
                        onCheckedChange={(on) =>
                          act({ type: 'notificationRules/update', id: r.id, patch: { channels: on ? [...r.channels, c] : r.channels.filter((x) => x !== c) } }, 'Channels updated', r.event)
                        }
                      />
                      {NOTIFY_CHANNEL_LABEL[c]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Roles</div>
                <div className="flex flex-wrap gap-2">
                  {state.roles.map((role) => {
                    const on = r.roleIds.includes(role.id)
                    return (
                      <Chip
                        key={role.id}
                        variant="default"
                        active={on}
                        disabled={!manage || !r.enabled}
                        onClick={() =>
                          act({ type: 'notificationRules/update', id: r.id, patch: { roleIds: on ? r.roleIds.filter((x) => x !== role.id) : [...r.roleIds, role.id] } }, 'Roles updated', r.event)
                        }
                      >
                        {role.name}
                      </Chip>
                    )
                  })}
                </div>
              </div>
            </fieldset>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- API

const ENDPOINTS: [string, string, string][] = [
  ['GET', '/v1/listings', 'Live listings with price, location and specs'],
  ['GET', '/v1/listings/{code}', 'One listing by code, for example AS-0001'],
  ['POST', '/v1/inquiries', 'Log a buyer inquiry from another channel'],
  ['GET', '/v1/partners/{id}/listings', "A partner's listings and their status"],
  ['POST', '/v1/listings/{id}/delist', 'Delist with a reason; ends the exclusive right'],
  ['GET', '/v1/blog', 'Published articles with meta and FAQ'],
]

export function ApiPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const manage = can('integrations.manage')
  const [creating, setCreating] = useState(false)
  const [revealed, setRevealed] = useState<string | null>(null)
  const columns: Column<ApiToken>[] = [
    { id: 'name', header: 'Token', cell: (t) => <div><div className="text-sm font-semibold">{t.name}</div><div className="font-mono text-xs text-muted">{t.prefix}…</div></div> },
    { id: 'scopes', header: 'Scopes', hideBelow: 'sm', cell: (t) => <div className="flex gap-1">{t.scopes.map((s) => <Badge key={s} variant="outline">{s}</Badge>)}</div> },
    { id: 'used', header: 'Last used', hideBelow: 'md', cell: (t) => <span className="text-xs text-muted">{t.lastUsedAt ? fmtAgo(t.lastUsedAt) : 'Never'}</span> },
    {
      id: 'state',
      header: 'Status',
      align: 'right',
      cell: (t) =>
        t.revokedAt ? (
          <Badge variant="muted">Revoked {fmtDate(t.revokedAt)}</Badge>
        ) : manage ? (
          <Button variant="outline" size="sm" onClick={() => act({ type: 'apiTokens/revoke', id: t.id }, 'Token revoked', t.name)}>
            Revoke
          </Button>
        ) : (
          <Badge variant="success">Active</Badge>
        ),
    },
  ]
  return (
    <div className="space-y-4">
      <PageHeader title="API" description="Tokens let the website build, portals and partner tools read and write through the REST API." className="mb-2" actions={manage && <Button onClick={() => setCreating(true)}><KeyRound />New token</Button>} />
      {revealed && (
        <Banner
          tone="success"
          title="Copy this token now. It will not show again."
          actions={
            <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(revealed); toast('Token copied', { tone: 'success' }) }}>
              <Copy />
              Copy
            </Button>
          }
          onDismiss={() => setRevealed(null)}
        >
          <span className="break-all font-mono text-xs">{revealed}</span>
        </Banner>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Tokens</CardTitle>
        </CardHeader>
        <div className="pb-2">
          <DataTable rows={state.apiTokens} columns={columns} getRowKey={(t) => t.id} pageSize={0} rowClassName={(t) => (t.revokedAt ? 'opacity-60' : undefined)} />
        </div>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Endpoints</CardTitle>
        </CardHeader>
        <ul className="divide-y divide-border px-5 pb-3">
          {ENDPOINTS.map(([method, path, what]) => (
            <li key={path + method} className="flex flex-wrap items-center gap-3 py-3 text-sm">
              <Badge variant={method === 'GET' ? 'info' : 'ink'} className="w-14 justify-center font-mono">{method}</Badge>
              <span className="font-mono text-xs font-semibold">{path}</span>
              <span className="text-muted">{what}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Dialog open={creating} onOpenChange={setCreating} size="sm" title="New API token" description="Give it a name you will recognise in the log. Read is enough for the website build.">
        <TokenForm
          onDone={(secret) => {
            setCreating(false)
            if (secret) setRevealed(secret)
          }}
        />
      </Dialog>
    </div>
  )
}

function TokenForm({ onDone }: { onDone: (secret: string | null) => void }) {
  const act = useAct()
  const [name, setName] = useState('')
  const [write, setWrite] = useState(false)
  const [tried, setTried] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!name.trim()) return
        const secret = `as_live_${crypto.randomUUID().replace(/-/g, '')}`
        const token: ApiToken = { id: newId('tok'), name: name.trim(), prefix: secret.slice(0, 12), scopes: write ? ['read', 'write'] : ['read'], createdAt: nowIso(), lastUsedAt: null, revokedAt: null }
        // Only the prefix is stored; the full secret shows once in the banner.
        onDone(act({ type: 'apiTokens/create', token }, 'Token created', token.name) ? secret : null)
      }}
    >
      <FormField label="Name" required error={tried && !name.trim() ? 'Name the token.' : undefined}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rumah123 sync" />
      </FormField>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
        <div>
          <div className="text-sm font-medium">Allow writes</div>
          <div className="text-xs text-muted">Create inquiries and delist through the API</div>
        </div>
        <Switch checked={write} onCheckedChange={setWrite} label="Allow writes" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">Create token</Button>
      </DialogFooter>
    </form>
  )
}
