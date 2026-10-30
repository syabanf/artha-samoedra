import { fmtDate, fmtIdrShort, isOpenDeal, newId, nowIso, stageOf, type AppState } from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  KeyValue,
  NativeSelect,
  PageHeader,
  StatCard,
  type Column,
} from '@artha/ui'
import { CONTACT_KIND_LABEL, type Account } from '@artha/types'
import { Briefcase, Building2, Pencil, Plus, Search, Users, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'
import { StageBadge } from '../../components/badges'
import { HeroTile, RowLink } from './ContactPages'

const userName = (state: AppState, id: string | null) => (id ? (state.users.find((u) => u.id === id)?.name ?? 'Unknown user') : 'Unassigned')

/** Contacts on the account, their deals, and the summed value of the deals still open. */
function accountStats(state: AppState, account: Account) {
  const contacts = state.contacts.filter((c) => c.accountId === account.id)
  const ids = new Set(contacts.map((c) => c.id))
  const deals = state.deals.filter((d) => ids.has(d.contactId))
  const open = deals.filter((d) => isOpenDeal(state, d))
  const won = deals.filter((d) => stageOf(state, d)?.kind === 'won')
  return {
    contacts,
    deals,
    openValue: open.reduce((sum, d) => sum + d.value, 0),
    openCount: open.length,
    wonValue: won.reduce((sum, d) => sum + d.value, 0),
  }
}

// ---------------------------------------------------------------- list

export function AccountsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(params.get('new') === '1')
  const q = params.get('q') ?? ''
  const industry = params.get('industry') || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clear = () => setParams({}, { replace: true })

  const stats = new Map(state.accounts.map((a) => [a.id, accountStats(state, a)]))
  const industries = [...new Set(state.accounts.map((a) => a.industry))].sort()
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const rows = state.accounts.filter((a) => terms.every((t) => `${a.name} ${a.city} ${a.industry} ${a.phone}`.toLowerCase().includes(t)) && (!industry || a.industry === industry))
  const filters = [q, industry].filter(Boolean).length
  const totalOpen = [...stats.values()].reduce((sum, s) => sum + s.openValue, 0)
  const linkedContacts = state.contacts.filter((c) => c.accountId).length

  const columns: Column<Account>[] = [
    {
      id: 'name',
      header: 'Account',
      sortValue: (a) => a.name,
      cell: (a) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{a.name}</div>
          <div className="truncate text-xs text-muted">
            {a.industry} · {a.city}
          </div>
        </div>
      ),
    },
    { id: 'industry', header: 'Industry', hideBelow: 'lg', sortValue: (a) => a.industry, cell: (a) => <span className="text-sm">{a.industry}</span> },
    { id: 'city', header: 'City', hideBelow: 'md', sortValue: (a) => a.city, cell: (a) => <span className="text-sm">{a.city}</span> },
    { id: 'contacts', header: 'Contacts', align: 'right', hideBelow: 'sm', sortValue: (a) => stats.get(a.id)?.contacts.length ?? 0, cell: (a) => <span className="tabular-nums">{stats.get(a.id)?.contacts.length ?? 0}</span> },
    { id: 'owner', header: 'Owner', hideBelow: 'xl', cell: (a) => <span className="text-sm">{userName(state, a.ownerId)}</span> },
    {
      id: 'open',
      header: 'Open deals',
      align: 'right',
      sortValue: (a) => stats.get(a.id)?.openValue ?? 0,
      cell: (a) => {
        const v = stats.get(a.id)?.openValue ?? 0
        return v ? <span className="font-semibold tabular-nums">{fmtIdrShort(v)}</span> : <span className="text-muted">–</span>
      },
    },
  ]

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Companies the team sells to. Their contacts and deals roll up here."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search accounts"
              placeholder="Name, city or industry"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {can('crm.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New account
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <StatCard label="Accounts" value={state.accounts.length} icon={<Building2 />} tone="ink" />
        <StatCard label="Linked contacts" value={linkedContacts} icon={<Users />} />
        <StatCard label="Open deal value" value={fmtIdrShort(totalOpen)} icon={<Briefcase />} tone="success" className="col-span-2 xl:col-span-1" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <NativeSelect variant="inline" aria-label="Filter by industry" value={industry ?? ''} onChange={(e) => set('industry', e.target.value)}>
          <option value="">All industries</option>
          {industries.map((i) => (
            <option key={i} value={i}>
              {i}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.accounts.length}
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
          getRowKey={(a) => a.id}
          rowLabel={(a) => a.name}
          onRowClick={(a) => navigate(paths.account(a.id))}
          initialSort={{ id: 'open', desc: true }}
          resetPageKey={`${q}|${industry}`}
          empty={
            filters ? (
              <EmptyState compact title="No matching accounts" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No accounts yet" description="Add the companies your corporate contacts buy for." />
            )
          }
        />
      </div>
      <AccountDialog open={creating} onOpenChange={setCreating} editing={null} onSaved={(a) => navigate(paths.account(a.id))} />
    </div>
  )
}

// ---------------------------------------------------------------- form

function AccountDialog({ open, onOpenChange, editing, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Account | null; onSaved?: (a: Account) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={editing ? `Edit ${editing.name}` : 'New account'} description="Link contacts to the account from their contact page.">
      <AccountForm
        editing={editing}
        onDone={(saved) => {
          onOpenChange(false)
          if (saved) onSaved?.(saved)
        }}
      />
    </Dialog>
  )
}

function AccountForm({ editing, onDone }: { editing: Account | null; onDone: (a: Account | null) => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({
    name: editing?.name ?? '',
    industry: editing?.industry ?? '',
    city: editing?.city ?? '',
    phone: editing?.phone ?? '',
    ownerId: editing ? (editing.ownerId ?? '') : user.id,
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const taken = state.accounts.find((a) => a.id !== editing?.id && a.name.trim().toLowerCase() === f.name.trim().toLowerCase())
  const errors = {
    name: f.name.trim().length < 2 ? 'Enter the company name.' : taken ? 'An account with this name already exists.' : null,
    industry: f.industry.trim() ? null : 'Enter the industry.',
    city: f.city.trim() ? null : 'Enter the city.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const account: Account = {
          id: editing?.id ?? newId('acc'),
          name: f.name.trim(),
          industry: f.industry.trim(),
          city: f.city.trim(),
          phone: f.phone.trim(),
          ownerId: f.ownerId || null,
          createdAt: editing?.createdAt ?? nowIso(),
        }
        if (act({ type: 'accounts/upsert', account }, editing ? 'Account updated' : 'Account created', account.name)) onDone(account)
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Company name" required error={show(errors.name)} className="sm:col-span-2">
          <Input value={f.name} onChange={set('name')} placeholder="PT Logistik Prima Nusantara" autoComplete="off" />
        </FormField>
        <FormField label="Industry" required error={show(errors.industry)}>
          <Input value={f.industry} onChange={set('industry')} placeholder="Logistics" list="account-industries" />
        </FormField>
        <datalist id="account-industries">
          {[...new Set(state.accounts.map((a) => a.industry))].map((i) => (
            <option key={i} value={i} />
          ))}
        </datalist>
        <FormField label="City" required error={show(errors.city)}>
          <Input value={f.city} onChange={set('city')} placeholder="Surabaya" />
        </FormField>
        <FormField label="Phone" hint="Optional">
          <Input inputMode="tel" value={f.phone} onChange={set('phone')} />
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
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{editing ? 'Save changes' : 'Create account'}</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- detail

export function AccountDetailPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  const [editing, setEditing] = useState(false)
  const a = state.accounts.find((x) => x.id === id)

  if (!a) {
    return (
      <Card>
        <EmptyState title="Account not found" description="This account may have been removed." action={<BackButton fallback={paths.accounts} />} />
      </Card>
    )
  }

  const s = accountStats(state, a)
  const contactName = (cid: string) => state.contacts.find((c) => c.id === cid)?.name ?? '–'

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.accounts} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-muted">{a.industry}</div>
          <h1 className="text-2xl font-bold tracking-tight">{a.name}</h1>
        </div>
        {can('crm.manage') && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            Edit
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <div className="text-xs text-on-ink-muted">Open deal value</div>
          <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{fmtIdrShort(s.openValue)}</div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
            <HeroTile label="Contacts" value={String(s.contacts.length)} />
            <HeroTile label="Open deals" value={String(s.openCount)} />
            <HeroTile label="Won" value={s.wonValue ? fmtIdrShort(s.wonValue) : '–'} />
          </div>
        </Card>
        <KeyValue
          items={[
            { label: 'Industry', value: a.industry },
            { label: 'City', value: a.city },
            { label: 'Phone', value: a.phone ? <span className="font-mono text-xs">{a.phone}</span> : '–' },
            { label: 'Owner', value: userName(state, a.ownerId) },
            { label: 'Added', value: fmtDate(a.createdAt) },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contacts ({s.contacts.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.contacts.length === 0 && <EmptyState compact title="No contacts yet" description="Pick this account on a contact's edit form to link them." />}
            {s.contacts.map((c) => (
              <RowLink key={c.id} to={paths.contact(c.id)} title={c.name} sub={c.phone} badge={<Badge variant="outline">{CONTACT_KIND_LABEL[c.kind]}</Badge>} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Deals ({s.deals.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {s.deals.length === 0 && <EmptyState compact title="No deals yet" description="Deals with this account's contacts show up here." />}
            {s.deals.map((d) => (
              <RowLink key={d.id} to={paths.deal(d.id)} title={d.title} sub={`${d.code} · ${contactName(d.contactId)} · ${fmtIdrShort(d.value)}`} badge={<StageBadge stage={stageOf(state, d)} />} />
            ))}
          </CardContent>
        </Card>
      </div>

      <AccountDialog open={editing} onOpenChange={setEditing} editing={a} />
    </div>
  )
}
