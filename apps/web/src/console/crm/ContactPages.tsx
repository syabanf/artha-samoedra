import {
  contactByPhone,
  countBy,
  fmtAgo,
  fmtDate,
  fmtDateTime,
  fmtIdrShort,
  followUpBucket,
  isOpenDeal,
  leadScore,
  newId,
  normalizePhone,
  nowIso,
  stageOf,
  temperature,
  type AppState,
  type FollowUpBucket,
} from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  NativeSelect,
  PageHeader,
  ProgressBar,
  StatCard,
  Switch,
  Textarea,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import {
  ACTIVITY_KIND_LABEL,
  CHANNEL_LABEL,
  CONTACT_KIND_LABEL,
  LEAD_SOURCE_LABEL,
  TASK_KIND_LABEL,
  TEMPERATURE_LABEL,
  type ActivityKind,
  type Contact,
  type ContactKind,
  type CustomFieldDef,
  type LeadSource,
  type Temperature,
} from '@artha/types'
import { Flame, MailX, MessageSquare, NotebookPen, Pencil, Plus, Search, Snowflake, Users, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { InquiryStatusBadge } from '../../components/badges'
import { StageBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useAppState, useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'

const KINDS = Object.keys(CONTACT_KIND_LABEL) as ContactKind[]
const SOURCES = Object.keys(LEAD_SOURCE_LABEL) as LeadSource[]
const TEMPS: Temperature[] = ['hot', 'warm', 'cold']
const LOG_KINDS: ActivityKind[] = ['note', 'call', 'whatsapp', 'visit', 'email']

const TEMP_VARIANT: Record<Temperature, BadgeVariant> = { hot: 'danger', warm: 'warning', cold: 'info' }
const BUCKET_VARIANT: Record<FollowUpBucket, BadgeVariant> = { overdue: 'danger', today: 'warning', upcoming: 'default', done: 'success' }
const BUCKET_LABEL: Record<FollowUpBucket, string> = { overdue: 'Overdue', today: 'Due today', upcoming: 'Upcoming', done: 'Done' }

function ScoreBadge({ score }: { score: number }) {
  const t = temperature(score)
  return (
    <Badge variant={TEMP_VARIANT[t]}>
      <span className="tabular-nums">{score}</span> · {TEMPERATURE_LABEL[t]}
    </Badge>
  )
}

const userName = (state: AppState, id: string | null) => (id ? (state.users.find((u) => u.id === id)?.name ?? 'Unknown user') : 'Unassigned')
const splitTags = (v: string) => [...new Set(v.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]

// ---------------------------------------------------------------- list

export function ContactsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(params.get('new') === '1')
  const q = params.get('q') ?? ''
  const kind = (params.get('kind') as ContactKind | null) || null
  const source = (params.get('source') as LeadSource | null) || null
  const temp = (params.get('temp') as Temperature | null) || null
  const optOut = params.get('optout') === '1'
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clear = () => setParams({}, { replace: true })

  const scores = new Map(state.contacts.map((c) => [c.id, leadScore(state, c, now)]))
  const tempOf = (c: Contact) => temperature(scores.get(c.id) ?? 0)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const base = state.contacts.filter(
    (c) =>
      terms.every((t) => `${c.name} ${c.phone} ${normalizePhone(c.phone)} ${c.email} ${c.city} ${c.tags.join(' ')}`.toLowerCase().includes(t)) &&
      (!source || c.source === source) &&
      (!optOut || c.optOut),
  )
  const rows = base.filter((c) => (!kind || c.kind === kind) && (!temp || tempOf(c) === temp))
  const kindCounts = countBy(base.filter((c) => !temp || tempOf(c) === temp), (c) => c.kind)
  const tempCounts = countBy(base.filter((c) => !kind || c.kind === kind), tempOf)
  const allTemps = countBy(state.contacts, tempOf)
  const filters = [q, kind, source, temp, optOut].filter(Boolean).length

  const columns: Column<Contact>[] = [
    {
      id: 'name',
      header: 'Contact',
      sortValue: (c) => c.name,
      cell: (c) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{c.name}</div>
          <div className="font-mono text-xs text-muted">{c.phone}</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5 sm:hidden">
            <ScoreBadge score={scores.get(c.id) ?? 0} />
          </div>
        </div>
      ),
    },
    { id: 'kind', header: 'Type', hideBelow: 'md', sortValue: (c) => c.kind, cell: (c) => <span className="text-sm">{CONTACT_KIND_LABEL[c.kind]}</span> },
    { id: 'source', header: 'Source', hideBelow: 'lg', cell: (c) => <span className="text-xs text-muted">{LEAD_SOURCE_LABEL[c.source]}</span> },
    {
      id: 'score',
      header: 'Score',
      hideBelow: 'sm',
      sortValue: (c) => scores.get(c.id) ?? 0,
      cell: (c) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <ScoreBadge score={scores.get(c.id) ?? 0} />
          {c.optOut && <Badge variant="muted">Opted out</Badge>}
        </div>
      ),
    },
    { id: 'owner', header: 'Owner', hideBelow: 'md', sortValue: (c) => userName(state, c.ownerId), cell: (c) => <span className="text-sm">{userName(state, c.ownerId)}</span> },
    {
      id: 'tags',
      header: 'Tags',
      hideBelow: 'xl',
      cell: (c) =>
        c.tags.length ? (
          <div className="flex flex-wrap gap-1">
            {c.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted">–</span>
        ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Every buyer, investor, tenant and company contact, scored from their inquiries, deals and recent activity."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search contacts"
              placeholder="Name, phone, city or tag"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('crm.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New contact
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Contacts" value={state.contacts.length} icon={<Users />} tone="ink" />
        <StatCard label="Hot leads" value={allTemps.hot ?? 0} icon={<Flame />} tone="danger" active={temp === 'hot'} onClick={() => set('temp', temp === 'hot' ? null : 'hot')} />
        <StatCard label="Cold leads" value={allTemps.cold ?? 0} icon={<Snowflake />} tone="info" active={temp === 'cold'} onClick={() => set('temp', temp === 'cold' ? null : 'cold')} />
        <StatCard
          label="Opted out"
          value={state.contacts.filter((c) => c.optOut).length}
          icon={<MailX />}
          hint="No marketing messages"
          active={optOut}
          onClick={() => set('optout', optOut ? null : '1')}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!kind} count={Object.values(kindCounts).reduce((a, b) => a + b, 0)} onClick={() => set('kind', null)}>
            All
          </Chip>
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} count={kindCounts[k] ?? 0} onClick={() => set('kind', kind === k ? null : k)}>
              {CONTACT_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by source" value={source ?? ''} onChange={(e) => set('source', e.target.value)}>
          <option value="">All sources</option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {LEAD_SOURCE_LABEL[s]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          {TEMPS.map((t) => (
            <Chip key={t} variant="default" active={temp === t} count={tempCounts[t] ?? 0} onClick={() => set('temp', temp === t ? null : t)}>
              {TEMPERATURE_LABEL[t]}
            </Chip>
          ))}
          <Chip variant="default" active={optOut} onClick={() => set('optout', optOut ? null : '1')}>
            Opted out
          </Chip>
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.contacts.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      <div className="mt-2">
        <DataTable
          rows={rows}
          columns={columns}
          getRowKey={(c) => c.id}
          rowLabel={(c) => c.name}
          onRowClick={(c) => navigate(paths.contact(c.id))}
          initialSort={{ id: 'score', desc: true }}
          resetPageKey={`${q}|${kind}|${source}|${temp}|${optOut}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching contacts" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No contacts yet" description="Contacts appear when an inquiry arrives, or add one yourself." />
            )
          }
        />
      </div>
      <ContactDialog open={creating} onOpenChange={setCreating} editing={null} onSaved={(c) => navigate(paths.contact(c.id))} />
    </div>
  )
}

// ---------------------------------------------------------------- form

function ContactDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Contact | null; onSaved?: (c: Contact) => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={editing ? `Edit ${editing.name}` : 'New contact'}
      description={editing ? 'Changes apply everywhere this contact appears.' : 'Each WhatsApp number belongs to one contact. Inquiries from the same number join this record.'}
    >
      <ContactForm
        editing={editing}
        onDone={(saved) => {
          onOpenChange(false)
          if (saved) onSaved?.(saved)
        }}
      />
    </Dialog>
  )
}

function ContactForm({ editing, onDone }: { editing: Contact | null; onDone: (c: Contact | null) => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    name: editing?.name ?? '',
    phone: editing?.phone ?? '',
    email: editing?.email ?? '',
    kind: editing?.kind ?? ('buyer' as ContactKind),
    source: editing?.source ?? ('walk_in' as LeadSource),
    city: editing?.city ?? '',
    accountId: editing?.accountId ?? '',
    ownerId: editing ? (editing.ownerId ?? '') : user.id,
    tags: editing?.tags.join(', ') ?? '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const duplicate = f.phone.trim() ? contactByPhone(state, f.phone) : undefined
  const clash = duplicate && duplicate.id !== editing?.id ? duplicate : null
  const errors = {
    name: f.name.trim().length < 2 ? 'Enter the contact name.' : null,
    phone: normalizePhone(f.phone).length < 9 ? 'Enter a full WhatsApp number.' : clash ? `This number already belongs to ${clash.name}.` : null,
    email: !f.email.trim() || /^\S+@\S+\.\S+$/.test(f.email.trim()) ? null : 'Enter a valid email address or leave it empty.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const contact: Contact = {
          id: editing?.id ?? newId('con'),
          name: f.name.trim(),
          phone: f.phone.trim(),
          email: f.email.trim().toLowerCase(),
          kind: f.kind,
          source: f.source,
          city: f.city.trim(),
          accountId: f.accountId || null,
          ownerId: f.ownerId || null,
          tags: splitTags(f.tags),
          optOut: editing?.optOut ?? false,
          custom: editing?.custom ?? {},
          createdAt: editing?.createdAt ?? nowIso(),
        }
        if (act({ type: 'contacts/upsert', contact }, editing ? 'Contact updated' : 'Contact created', contact.name)) onDone(contact)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Full name" required error={show(errors.name)}>
          <Input value={f.name} onChange={set('name')} autoComplete="off" />
        </FormField>
        <FormField label="WhatsApp" required error={show(errors.phone)}>
          <Input inputMode="tel" value={f.phone} onChange={set('phone')} placeholder="0812-3456-7890" />
        </FormField>
        {clash && (
          <p className="rounded-xl bg-warning-soft px-3 py-2 text-xs font-medium text-warning sm:col-span-2">
            {clash.name} already uses this number.{' '}
            <Link to={paths.contact(clash.id)} className="font-semibold underline" onClick={() => onDone(null)}>
              Open {clash.name}
            </Link>
          </p>
        )}
        <FormField label="Email" hint="Optional" error={show(errors.email)}>
          <Input type="email" value={f.email} onChange={set('email')} autoComplete="off" />
        </FormField>
        <FormField label="City" hint="Optional">
          <Input value={f.city} onChange={set('city')} placeholder="Bandung" />
        </FormField>
        <FormField label="Type" required>
          <NativeSelect value={f.kind} onChange={set('kind')}>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {CONTACT_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Source" required>
          <NativeSelect value={f.source} onChange={set('source')}>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {LEAD_SOURCE_LABEL[s]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Account" hint="The company they buy for, if any">
          <NativeSelect value={f.accountId} onChange={set('accountId')}>
            <option value="">No account</option>
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Owner">
          <NativeSelect value={f.ownerId} onChange={set('ownerId')}>
            <option value="">Unassigned</option>
            {state.users
              .filter((u) => u.status === 'active')
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </NativeSelect>
        </FormField>
        <FormField label="Tags" hint="Separate with commas" className="sm:col-span-2">
          <Input value={f.tags} onChange={set('tags')} placeholder="first-home, mortgage" />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Create contact'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- detail

type Open = 'edit' | 'log' | null

export function ContactDetailPage() {
  const { id } = useParams()
  const { state, actorName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const [open, setOpen] = useState<Open>(null)
  const c = state.contacts.find((x) => x.id === id)

  if (!c) {
    return (
      <Card>
        <EmptyState title="Contact not found" description="This contact may have been merged or removed." action={<BackButton fallback={paths.contacts} />} />
      </Card>
    )
  }

  const manage = can('crm.manage')
  const score = leadScore(state, c, now)
  const temp = temperature(score)
  const account = state.accounts.find((a) => a.id === c.accountId)
  const deals = state.deals.filter((d) => d.contactId === c.id)
  const dealIds = new Set(deals.map((d) => d.id))
  const openValue = deals.filter((d) => isOpenDeal(state, d)).reduce((sum, d) => sum + d.value, 0)
  const inquiries = state.inquiries.filter((i) => normalizePhone(i.phone) === normalizePhone(c.phone))
  const conversations = state.conversations.filter((x) => x.contactId === c.id)
  const linked = (ref: { type: string; id: string } | null) => !!ref && ((ref.type === 'contact' && ref.id === c.id) || (ref.type === 'deal' && dealIds.has(ref.id)))
  const tasks = state.tasks.filter((t) => linked(t.ref)).sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const activities = state.activities.filter((a) => linked(a.ref)).sort((a, b) => b.at.localeCompare(a.at))
  const closeTo = (v: boolean) => !v && setOpen(null)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.contacts} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs font-semibold text-muted">{c.phone}</div>
          <h1 className="text-2xl font-bold tracking-tight">{c.name}</h1>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          {conversations[0] && (
            <Button variant="outline" asChild>
              <Link to={`${paths.inbox}?c=${conversations[0].id}`}>
                <MessageSquare />
                Open chat
              </Link>
            </Button>
          )}
          {manage && (
            <>
              <Button variant="outline" onClick={() => setOpen('edit')}>
                <Pencil />
                Edit
              </Button>
              <Button onClick={() => setOpen('log')}>
                <NotebookPen />
                Log activity
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="flex flex-wrap gap-1.5">
            <Badge variant={TEMP_VARIANT[temp]}>{TEMPERATURE_LABEL[temp]} lead</Badge>
            <Badge className="bg-white/10 text-white">{CONTACT_KIND_LABEL[c.kind]}</Badge>
            {c.optOut && <Badge className="bg-white/10 text-white">Opted out of marketing</Badge>}
          </div>
          <div className="mt-4 flex items-end gap-1">
            <span className="text-4xl font-bold tracking-tight tabular-nums">{score}</span>
            <span className="pb-1 text-sm font-semibold text-on-ink-muted">/ 100 lead score</span>
          </div>
          <ProgressBar value={score} tone="accent" className="mt-3 bg-white/10" />
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <HeroTile label="Source" value={LEAD_SOURCE_LABEL[c.source]} />
            <HeroTile label="Owner" value={userName(state, c.ownerId)} />
            <HeroTile label="Open deals" value={String(deals.filter((d) => isOpenDeal(state, d)).length)} />
            <HeroTile label="Open value" value={openValue ? fmtIdrShort(openValue) : '–'} />
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <KeyValue
              bare
              items={[
                { label: 'WhatsApp', value: <span className="font-mono text-xs">{c.phone}</span> },
                { label: 'Email', value: c.email || '–' },
                { label: 'City', value: c.city || '–' },
                { label: 'Account', value: account ? <Link to={paths.account(account.id)} className="font-medium hover:text-accent">{account.name}</Link> : '–' },
                { label: 'Added', value: fmtDate(c.createdAt) },
              ]}
            />
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Marketing messages</div>
                <div className="text-xs text-muted">{c.optOut ? 'Opted out. Campaigns skip this contact.' : 'Accepts campaigns. Transactional messages always go.'}</div>
              </div>
              {manage ? (
                <Switch
                  label="Accepts marketing messages"
                  checked={!c.optOut}
                  onCheckedChange={(v) => act({ type: 'contacts/setOptOut', id: c.id, optOut: !v }, v ? 'Marketing consent given' : 'Opted out of marketing', c.name)}
                />
              ) : (
                <Badge variant={c.optOut ? 'muted' : 'success'}>{c.optOut ? 'Opted out' : 'Accepts'}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TagsCard contact={c} manage={manage} />
        <CustomFieldsCard contact={c} fields={state.crmSettings.customFields} manage={manage} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deals ({deals.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {deals.length === 0 && <EmptyState compact title="No deals yet" description="Create a deal from one of this contact's inquiries." />}
            {deals.map((d) => (
              <RowLink key={d.id} to={paths.deal(d.id)} title={d.title} sub={`${d.code} · ${fmtIdrShort(d.value)}`} badge={<StageBadge stage={stageOf(state, d)} />} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Inquiries ({inquiries.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {inquiries.length === 0 && <EmptyState compact title="No inquiries" description="Inquiries from this WhatsApp number show up here." />}
            {inquiries.map((i) => (
              <RowLink key={i.id} to={paths.inquiry(i.id)} title={i.code} sub={i.message} badge={<InquiryStatusBadge status={i.status} />} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conversations ({conversations.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {conversations.length === 0 && <EmptyState compact title="No conversations" description="WhatsApp and Instagram chats with this contact land in the inbox." />}
            {conversations.map((x) => {
              const last = x.messages.at(-1)
              return (
                <RowLink
                  key={x.id}
                  to={`${paths.inbox}?c=${x.id}`}
                  title={CHANNEL_LABEL[x.channel]}
                  sub={last ? `${fmtAgo(last.at)} · ${last.text}` : 'No messages'}
                  badge={<Badge variant={x.status === 'open' ? 'info' : 'muted'}>{x.status === 'open' ? 'Open' : 'Closed'}</Badge>}
                />
              )
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tasks ({tasks.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {tasks.length === 0 && <EmptyState compact title="No tasks" description="Follow-up tasks on this contact or their deals show up here." />}
            {tasks.map((t) => {
              const bucket = followUpBucket(t, now)
              return (
                <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{t.title}</span>
                    <span className="block text-xs text-muted">
                      {TASK_KIND_LABEL[t.kind]} · {userName(state, t.ownerId)} · due {fmtDateTime(t.dueAt)}
                    </span>
                  </span>
                  <Badge variant={BUCKET_VARIANT[bucket]}>{BUCKET_LABEL[bucket]}</Badge>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader action={manage && <Button variant="outline" size="sm" onClick={() => setOpen('log')}>Log activity</Button>}>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length ? (
            <ol className="space-y-3">
              {activities.map((a) => (
                <li key={a.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 size-2 shrink-0 rounded-full bg-silver" />
                  <span className="min-w-0">
                    <span className="font-semibold">{ACTIVITY_KIND_LABEL[a.kind]}</span>
                    {a.ref.type === 'deal' && <span className="text-muted"> · {state.deals.find((d) => d.id === a.ref.id)?.code}</span>}
                    <span className="block break-words">{a.text}</span>
                    <span className="block text-xs text-muted">
                      {actorName(a.by)} · {fmtAgo(a.at)}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState compact title="No activity yet" description="Calls, visits, notes and stage changes on this contact and their deals show up here." />
          )}
        </CardContent>
      </Card>

      <ContactDialog open={open === 'edit'} onOpenChange={closeTo} editing={c} />
      <Dialog open={open === 'log'} onOpenChange={closeTo} title={`Log activity for ${c.name}`} description="The note lands on the contact timeline with your name and the time.">
        <LogActivityForm contact={c} onDone={() => setOpen(null)} />
      </Dialog>
    </div>
  )
}

export const HeroTile = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0 rounded-2xl bg-white/5 p-3">
    <div className="text-xs text-on-ink-muted">{label}</div>
    <div className="truncate font-semibold tabular-nums">{value}</div>
  </div>
)

export function RowLink({ to, title, sub, badge }: { to: string; title: string; sub: string; badge: ReactNode }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-muted">{sub}</span>
      </span>
      {badge}
    </Link>
  )
}

// ---------------------------------------------------------------- tags and custom fields

function TagsCard({ contact, manage }: { contact: Contact; manage: boolean }) {
  const act = useAct()
  const [draft, setDraft] = useState('')
  const save = (tags: string[], message: string) => act({ type: 'contacts/upsert', contact: { ...contact, tags } }, message, contact.name)
  const add = () => {
    const fresh = splitTags(draft).filter((t) => !contact.tags.includes(t))
    if (!fresh.length) return setDraft('')
    if (save([...contact.tags, ...fresh], fresh.length === 1 ? `Tag "${fresh[0]}" added` : `${fresh.length} tags added`)) setDraft('')
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Tags</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {contact.tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {contact.tags.map((t) => (
              <Badge key={t} variant="outline" className="gap-1 pr-1">
                {t}
                {manage && (
                  <button
                    type="button"
                    aria-label={`Remove tag ${t}`}
                    onClick={() => save(contact.tags.filter((x) => x !== t), `Tag "${t}" removed`)}
                    className="rounded-full p-0.5 hover:bg-surface [&_svg]:size-3"
                  >
                    <X />
                  </button>
                )}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">No tags yet. Segments can target contacts by tag.</p>
        )}
        {manage && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              add()
            }}
          >
            <Input aria-label="New tag" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="first-home" className="min-w-0 flex-1" />
            <Button type="submit" variant="outline" disabled={!draft.trim()}>
              Add tag
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function CustomFieldsCard({ contact, fields, manage }: { contact: Contact; fields: CustomFieldDef[]; manage: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>More details</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {fields.length === 0 && <EmptyState compact title="No custom fields" description="Add custom fields in sales settings." />}
        {fields.map((field) =>
          manage ? (
            <CustomFieldRow key={`${field.id}|${contact.custom[field.id] ?? ''}`} contact={contact} field={field} />
          ) : (
            <KeyValue key={field.id} bare items={[{ label: field.label, value: contact.custom[field.id] || '–' }]} />
          ),
        )}
      </CardContent>
    </Card>
  )
}

/** Keyed by the saved value, so a save elsewhere resets the draft. */
function CustomFieldRow({ contact, field }: { contact: Contact; field: CustomFieldDef }) {
  const act = useAct()
  const saved = contact.custom[field.id] ?? ''
  const [value, setValue] = useState(saved)
  const invalid = field.type === 'number' && value.trim() !== '' && Number.isNaN(Number(value))
  const save = (next: string) =>
    act({ type: 'contacts/upsert', contact: { ...contact, custom: { ...contact.custom, [field.id]: next.trim() } } }, `${field.label} saved`, contact.name)

  if (field.type === 'select') {
    return (
      <FormField label={field.label}>
        <NativeSelect value={saved} onChange={(e) => save(e.target.value)}>
          <option value="">Not set</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </NativeSelect>
      </FormField>
    )
  }
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid) save(value)
      }}
    >
      <FormField label={field.label} error={invalid ? 'Enter a number.' : undefined} className="min-w-0 flex-1">
        <Input inputMode={field.type === 'number' ? 'decimal' : undefined} value={value} onChange={(e) => setValue(e.target.value)} />
      </FormField>
      {value !== saved && (
        <Button type="submit" variant="outline" disabled={invalid} className={invalid ? 'mb-6' : undefined}>
          Save
        </Button>
      )}
    </form>
  )
}

function LogActivityForm({ contact, onDone }: { contact: Contact; onDone: () => void }) {
  const user = useUser()
  const act = useAct()
  const [kind, setKind] = useState<ActivityKind>('call')
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!text.trim()) return
        const activity = { id: newId('act'), at: nowIso(), by: user.id, kind, ref: { type: 'contact' as const, id: contact.id }, text: text.trim() }
        if (act({ type: 'activities/add', activity }, `${ACTIVITY_KIND_LABEL[kind]} logged`, contact.name)) onDone()
      }}
    >
      <div className="space-y-4">
        <FormField label="Type" required>
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as ActivityKind)}>
            {LOG_KINDS.map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_KIND_LABEL[k]}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="What happened" required error={tried && !text.trim() ? 'Write a short note.' : undefined}>
          <Textarea className="min-h-24" value={text} onChange={(e) => setText(e.target.value)} placeholder="Called about the Saturday visit. Prefers 10:00." />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Log activity</Button>
      </DialogFooter>
    </form>
  )
}
