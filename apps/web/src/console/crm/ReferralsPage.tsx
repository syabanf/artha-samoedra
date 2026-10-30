import { countBy, fmtDate, fmtIdr, fmtIdrShort, newId, nowIso } from '@artha/fixtures'
import {
  Badge,
  Button,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  StatCard,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import { REFERRAL_STATUS_LABEL, type Referral, type ReferralStatus } from '@artha/types'
import { BadgeCheck, Check, Clock, Gift, Plus, Search, Wallet, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { CodeLink, paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'

const STATUSES: ReferralStatus[] = ['pending', 'approved', 'paid', 'rejected']
const STATUS_VARIANT: Record<ReferralStatus, BadgeVariant> = { pending: 'warning', approved: 'info', paid: 'success', rejected: 'muted' }
const StatusBadge = ({ status }: { status: ReferralStatus }) => (
  <Badge variant={STATUS_VARIANT[status]} dot={status === 'pending'}>
    {REFERRAL_STATUS_LABEL[status]}
  </Badge>
)
type ReferrerType = Referral['referrer']['type']
const REFERRER_LABEL: Record<ReferrerType, string> = { contact: 'Contact', partner: 'Partner' }

export function ReferralsPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const q = params.get('q') ?? ''
  const status = (params.get('status') as ReferralStatus | null) || null
  const by = (params.get('by') as ReferrerType | null) || null
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clear = () => setParams({}, { replace: true })

  const contactName = (id: string) => state.contacts.find((c) => c.id === id)?.name ?? 'Unknown contact'
  const referrerName = (r: Referral) => (r.referrer.type === 'contact' ? contactName(r.referrer.id) : (state.partners.find((p) => p.id === r.referrer.id)?.name ?? 'Unknown partner'))
  const dealCode = (id: string | null) => (id ? state.deals.find((d) => d.id === id)?.code : undefined)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (r: Referral) => terms.every((t) => `${referrerName(r)} ${contactName(r.contactId)} ${dealCode(r.dealId) ?? ''}`.toLowerCase().includes(t)) && (!by || r.referrer.type === by)
  const rows = state.referrals.filter((r) => matches(r) && (!status || r.status === status))
  const counts = countBy(state.referrals.filter(matches), (r) => r.status)
  const filters = [q, status, by].filter(Boolean).length
  const sum = (s: ReferralStatus) => state.referrals.filter((r) => r.status === s).reduce((a, r) => a + r.reward, 0)
  const manage = can('referral.manage')

  const columns: Column<Referral>[] = [
    {
      id: 'referrer',
      header: 'Referrer',
      sortValue: referrerName,
      cell: (r) => (
        <div className="min-w-0">
          {r.referrer.type === 'contact' ? (
            <Link to={paths.contact(r.referrer.id)} className="block truncate text-sm font-semibold hover:text-accent">
              {referrerName(r)}
            </Link>
          ) : (
            <Link to={paths.partner(r.referrer.id)} className="block truncate text-sm font-semibold hover:text-accent">
              {referrerName(r)}
            </Link>
          )}
          <div className="text-xs text-muted">{REFERRER_LABEL[r.referrer.type]}</div>
          <div className="mt-1.5 sm:hidden">
            <StatusBadge status={r.status} />
          </div>
        </div>
      ),
    },
    {
      id: 'contact',
      header: 'Referred',
      hideBelow: 'md',
      sortValue: (r) => contactName(r.contactId),
      cell: (r) => (
        <Link to={paths.contact(r.contactId)} className="text-sm hover:text-accent">
          {contactName(r.contactId)}
        </Link>
      ),
    },
    {
      id: 'deal',
      header: 'Deal',
      hideBelow: 'lg',
      cell: (r) => {
        const code = dealCode(r.dealId)
        return code && r.dealId ? <CodeLink to={paths.deal(r.dealId)} code={code} /> : <span className="text-muted">–</span>
      },
    },
    { id: 'reward', header: 'Reward', align: 'right', sortValue: (r) => r.reward, cell: (r) => <span className="font-semibold tabular-nums">{fmtIdrShort(r.reward)}</span> },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (r) => STATUSES.indexOf(r.status), cell: (r) => <StatusBadge status={r.status} /> },
    { id: 'created', header: 'Added', hideBelow: 'xl', sortValue: (r) => r.createdAt, cell: (r) => <span className="text-xs text-muted">{fmtDate(r.createdAt)}</span> },
  ]
  if (manage) columns.push({ id: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', cell: (r) => <ReferralActions referral={r} name={referrerName(r)} /> })

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Leads brought in by past buyers and partners, and the reward each one earns once approved."
        className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search referrals"
              placeholder="Name or deal code"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
            {(can('crm.manage') || manage) && (
              <Button onClick={() => setCreating(true)}>
                <Plus />
                New referral
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Referrals" value={state.referrals.length} icon={<Gift />} tone="ink" />
        <StatCard label="Waiting for approval" value={fmtIdrShort(sum('pending'))} icon={<Clock />} tone={counts.pending ? 'warning' : 'default'} active={status === 'pending'} onClick={() => set('status', status === 'pending' ? null : 'pending')} />
        <StatCard label="Approved, not paid" value={fmtIdrShort(sum('approved'))} icon={<BadgeCheck />} tone="info" active={status === 'approved'} onClick={() => set('status', status === 'approved' ? null : 'approved')} />
        <StatCard label="Paid out" value={fmtIdrShort(sum('paid'))} icon={<Wallet />} tone="success" active={status === 'paid'} onClick={() => set('status', status === 'paid' ? null : 'paid')} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!status} count={state.referrals.filter(matches).length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {REFERRAL_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label="Filter by referrer type" value={by ?? ''} onChange={(e) => set('by', e.target.value)}>
          <option value="">All referrers</option>
          <option value="contact">Contacts</option>
          <option value="partner">Partners</option>
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.referrals.length}
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
          getRowKey={(r) => r.id}
          rowLabel={referrerName}
          initialSort={{ id: 'created', desc: true }}
          resetPageKey={`${q}|${status}|${by}`}
          rowClassName={(r) => (r.status === 'pending' ? 'bg-warning-soft/40' : undefined)}
          empty={
            filters ? (
              <EmptyState compact title="No matching referrals" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState compact title="No referrals yet" description="Record a referral when a buyer or partner sends someone your way." />
            )
          }
        />
      </div>
      <Dialog open={creating} onOpenChange={setCreating} title="New referral" description="The reward waits for approval. Pay it once the referred deal closes.">
        <ReferralForm onDone={() => setCreating(false)} />
      </Dialog>
    </div>
  )
}

function ReferralActions({ referral: r, name }: { referral: Referral; name: string }) {
  const act = useAct()
  const move = (to: ReferralStatus, message: string) => act({ type: 'referrals/setStatus', id: r.id, status: to }, message, `${name} · ${fmtIdr(r.reward)}`)
  if (r.status === 'pending') {
    return (
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={() => move('approved', 'Referral approved')}>
          <Check />
          Approve
        </Button>
        <Button size="sm" variant="ghost" onClick={() => move('rejected', 'Referral rejected')}>
          Reject
        </Button>
      </div>
    )
  }
  if (r.status === 'approved') {
    return (
      <Button size="sm" variant="outline" onClick={() => move('paid', 'Reward marked as paid')}>
        <Wallet />
        Mark paid
      </Button>
    )
  }
  return null
}

function ReferralForm({ onDone }: { onDone: () => void }) {
  const { state } = useAppState()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [f, setF] = useState({ referrerType: 'contact' as ReferrerType, referrerId: '', contactId: '', dealId: '', reward: '' })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const reward = Number(f.reward.replace(/\D/g, '')) || 0
  const deals = state.deals.filter((d) => d.contactId === f.contactId)
  const contacts = [...state.contacts].sort((a, b) => a.name.localeCompare(b.name))
  const errors = {
    referrerId: f.referrerId ? null : `Choose the ${f.referrerType} who referred them.`,
    contactId: !f.contactId ? 'Choose the referred contact.' : f.referrerType === 'contact' && f.contactId === f.referrerId ? 'A contact cannot refer themselves.' : null,
    reward: reward > 0 ? null : 'Enter the reward in rupiah.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const referral: Referral = {
          id: newId('ref'),
          referrer: { type: f.referrerType, id: f.referrerId },
          contactId: f.contactId,
          dealId: f.dealId || null,
          reward,
          status: 'pending',
          createdAt: nowIso(),
        }
        if (act({ type: 'referrals/create', referral }, 'Referral recorded', `${fmtIdr(reward)} waiting for approval`)) onDone()
      }}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Referred by" required>
          <NativeSelect value={f.referrerType} onChange={(e) => setF({ ...f, referrerType: e.target.value as ReferrerType, referrerId: '' })}>
            <option value="contact">A contact</option>
            <option value="partner">A partner</option>
          </NativeSelect>
        </FormField>
        <FormField label={f.referrerType === 'contact' ? 'Referring contact' : 'Referring partner'} required error={show(errors.referrerId)}>
          <NativeSelect value={f.referrerId} onChange={set('referrerId')}>
            <option value="">Choose</option>
            {f.referrerType === 'contact'
              ? contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              : state.partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
          </NativeSelect>
        </FormField>
        <FormField label="Referred contact" required error={show(errors.contactId)}>
          <NativeSelect value={f.contactId} onChange={(e) => setF({ ...f, contactId: e.target.value, dealId: '' })}>
            <option value="">Choose</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Deal" hint={f.contactId && !deals.length ? 'This contact has no deals yet' : 'Optional'}>
          <NativeSelect value={f.dealId} onChange={set('dealId')} disabled={!deals.length}>
            <option value="">No deal yet</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} · {d.title}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField label="Reward" required error={show(errors.reward)} hint={reward ? fmtIdr(reward) : 'In rupiah, for example 5000000'} className="sm:col-span-2">
          <Input inputMode="numeric" value={f.reward} onChange={set('reward')} placeholder="5000000" />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Record referral</Button>
      </DialogFooter>
    </form>
  )
}
