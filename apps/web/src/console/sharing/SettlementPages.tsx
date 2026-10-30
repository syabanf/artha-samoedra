import {
  countBy,
  fmtDate,
  fmtDateLong,
  fmtIdr,
  fmtIdrShort,
  fmtPercent,
  nowIso,
  partyRule,
  periodLabel,
  periodOf,
  SETTLEMENT_STATUS_LABEL,
  SHARE_PARTY_LABEL,
  totalsByParty,
  totalsByPeriod,
  type PartyRow,
  type PeriodRow,
  type ReportGrain,
  journalFor,
} from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  Chip,
  ChipRow,
  DataTable,
  EmptyState,
  Input,
  KeyValue,
  NativeSelect,
  PageHeader,
  PillTabs,
  Sheet,
  StatCard,
  type BadgeVariant,
  type Column,
} from '@artha/ui'
import type { Settlement, SettlementStatus, SharePartyKind } from '@artha/types'
import { Banknote, BarChart3, Building2, CircleCheck, CircleDollarSign, Download, HandCoins, PieChart, Printer, Receipt, Search, UserRound, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { LetterBlock, LetterHead, LetterRow, Signature } from '../../components/Letter'
import { CodeLink, paths } from '../../components/links'
import { SectionNav, type SectionItem } from '../../components/SectionNav'
import { downloadCsv } from '../../lib/csv'
import { useScoped } from '../../state/store'
import { useAct } from '../dialogs'
import { PARTY_TONE } from '../listing/ShareParts'

const STATUSES: SettlementStatus[] = ['open', 'paid']
const STATUS_VARIANT: Record<SettlementStatus, BadgeVariant> = { open: 'warning', paid: 'success' }
const KINDS: SharePartyKind[] = ['partner', 'agent', 'company', 'other']
const KIND_PLURAL: Record<SharePartyKind, string> = { partner: 'Partners', agent: 'Agents', company: 'Company', other: 'Other parties' }

const SettlementStatusBadge = ({ status }: { status: SettlementStatus }) => <Badge variant={STATUS_VARIANT[status]}>{SETTLEMENT_STATUS_LABEL[status]}</Badge>

const short = (n: number) => fmtIdrShort(n).replace('Rp ', '')



const SHARING_TABS: SectionItem[] = [
  { to: paths.sharing, label: 'Schemes', icon: PieChart, end: true },
  { to: paths.settlements, label: 'Settlements', icon: Receipt },
  { to: paths.sharingReports, label: 'Reports', icon: BarChart3 },
]

export const SharingNav = () => <SectionNav label="Profit sharing" items={SHARING_TABS} />

// ---------------------------------------------------------------- settlements

export function SettlementsPage() {
  const { state, maps } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const [params, setParams] = useSearchParams()
  const [printId, setPrintId] = useState<string | null>(null)
  const q = params.get('q') ?? ''
  const status = (params.get('status') as SettlementStatus | null) || null
  const party = params.get('party') || null
  const openId = params.get('id')
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clear = () => setParams(openId ? { id: openId } : {}, { replace: true })

  const dealOf = (id: string | null) => (id ? state.deals.find((d) => d.id === id) : undefined)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = (x: Settlement) => {
    const l = maps.listings.get(x.listingId)
    return `${x.code} ${l?.code ?? ''} ${l?.title ?? ''} ${dealOf(x.dealId)?.code ?? ''} ${x.lines.map((n) => n.label).join(' ')}`.toLowerCase()
  }
  const searched = state.settlements.filter((x) => (!party || x.lines.some((l) => l.party === party)) && terms.every((t) => haystack(x).includes(t)))
  const counts = countBy(searched, (x) => x.status)
  const rows = searched.filter((x) => !status || x.status === status)
  const filters = [q, status, party].filter(Boolean).length
  const parties = totalsByParty(state.settlements)
  const sumOf = (s: SettlementStatus) => state.settlements.filter((x) => x.status === s).reduce((n, x) => n + x.commission, 0)
  const month = nowIso().slice(0, 7)
  const thisMonth = state.settlements.filter((x) => x.closedAt.startsWith(month))
  const all = countBy(state.settlements, (x) => x.status)
  const toggle = (s: SettlementStatus) => set('status', status === s ? null : s)
  const opened = state.settlements.find((x) => x.id === openId) ?? null
  const printed = state.settlements.find((x) => x.id === (openId ?? printId)) ?? null

  const columns: Column<Settlement>[] = [
    {
      id: 'code',
      header: 'Settlement',
      sortValue: (x) => x.code,
      cell: (x) => {
        const l = maps.listings.get(x.listingId)
        return (
          <div className="min-w-0">
            <div className="font-mono text-xs font-semibold">{x.code}</div>
            <div className="truncate text-sm">
              {l?.code} · {l?.title}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 sm:hidden">
              <SettlementStatusBadge status={x.status} />
              <span className="text-xs text-muted">{fmtDate(x.closedAt)}</span>
            </div>
          </div>
        )
      },
    },
    { id: 'status', header: 'Status', hideBelow: 'sm', sortValue: (x) => STATUSES.indexOf(x.status), cell: (x) => <SettlementStatusBadge status={x.status} /> },
    { id: 'closed', header: 'Closed', hideBelow: 'sm', sortValue: (x) => x.closedAt, cell: (x) => <span className="text-sm">{fmtDate(x.closedAt)}</span> },
    { id: 'deal', header: 'Deal', hideBelow: 'lg', cell: (x) => <span className="font-mono text-xs">{dealOf(x.dealId)?.code ?? 'Sold directly'}</span> },
    { id: 'parties', header: 'Parties', hideBelow: 'md', align: 'right', sortValue: (x) => x.lines.length, cell: (x) => <span className="tabular-nums">{x.lines.length}</span> },
    { id: 'basis', header: 'Deal price', hideBelow: 'xl', align: 'right', sortValue: (x) => x.basis, cell: (x) => <span className="tabular-nums">{fmtIdrShort(x.basis)}</span> },
    { id: 'commission', header: 'Commission', align: 'right', sortValue: (x) => x.commission, cell: (x) => <span className="font-semibold tabular-nums">{fmtIdrShort(x.commission)}</span> },
  ]

  const print = (id: string) => {
    setPrintId(id)
    set('id', null)
    // Let the sheet close before the print dialog snapshots the page.
    setTimeout(() => window.print(), 300)
  }

  return (
    <div>
      <div className="print:hidden">
        <SharingNav />
        <PageHeader
          title="Settlements"
          description="One settlement per sold listing or won deal, with a line for each party in the listing's scheme. Finance marks each one paid."
          className="[&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
          actions={
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search settlements"
              placeholder="Code, listing, deal or party"
              value={q}
              onChange={(e) => set('q', e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
            />
          }
        />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label="Open" value={all.open ?? 0} icon={<Receipt />} tone={all.open ? 'warning' : 'default'} active={status === 'open'} onClick={() => toggle('open')} />
          <StatCard label="To pay out" value={short(sumOf('open'))} unit="Rp" icon={<Banknote />} tone="ink" hint="Open settlements" />
          <StatCard label="Paid out" value={short(sumOf('paid'))} unit="Rp" icon={<CircleCheck />} tone="success" active={status === 'paid'} onClick={() => toggle('paid')} />
          <StatCard label="Closed this month" value={short(thisMonth.reduce((n, x) => n + x.commission, 0))} unit="Rp" icon={<CircleDollarSign />} hint={`${thisMonth.length} settlement${thisMonth.length === 1 ? '' : 's'}`} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <ChipRow className="flex-1">
            <Chip active={!status} count={searched.length} onClick={() => set('status', null)}>
              All
            </Chip>
            {STATUSES.map((s) => (
              <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => toggle(s)}>
                {SETTLEMENT_STATUS_LABEL[s]}
              </Chip>
            ))}
          </ChipRow>
          <NativeSelect variant="inline" aria-label="Filter by party" value={party ?? ''} onChange={(e) => set('party', e.target.value)} className="max-w-full">
            <option value="">All parties</option>
            {KINDS.map((k) => {
              const ofKind = parties.filter((p) => p.kind === k)
              return ofKind.length ? (
                <optgroup key={k} label={KIND_PLURAL[k]}>
                  {ofKind.map((p) => (
                    <option key={p.party} value={p.party}>
                      {p.label}
                    </option>
                  ))}
                </optgroup>
              ) : null
            })}
          </NativeSelect>
          {filters > 0 && (
            <span className="text-xs text-muted tabular-nums">
              {rows.length} of {state.settlements.length}
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
            getRowKey={(x) => x.id}
            rowLabel={(x) => x.code}
            onRowClick={(x) => set('id', x.id)}
            initialSort={{ id: 'closed', desc: true }}
            resetPageKey={`${q}|${status}|${party}`}
            empty={
              filters ? (
                <EmptyState compact title="No matching settlements" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
              ) : (
                <EmptyState compact title="No settlements yet" description="A settlement appears when a listing is marked sold or a deal moves to won." />
              )
            }
          />
        </div>
      </div>

      <Sheet
        open={!!opened}
        onOpenChange={(v) => !v && set('id', null)}
        title={opened ? `Settlement ${opened.code}` : 'Settlement'}
        description={opened ? maps.listings.get(opened.listingId)?.title : undefined}
        footer={
          opened && (
            <div className="flex w-full flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => print(opened.id)}>
                <Printer />
                Print
              </Button>
              {can('share.manage') && opened.status === 'open' && (
                <Button onClick={() => act({ type: 'settlements/markPaid', id: opened.id }, 'Settlement marked paid', `${opened.code} · ${fmtIdr(opened.commission)}`)}>
                  <Banknote />
                  Mark paid
                </Button>
              )}
            </div>
          )
        }
      >
        {opened && <SettlementDetail settlement={opened} />}
      </Sheet>

      {printed && <SettlementLetter settlement={printed} />}
    </div>
  )
}

function SettlementDetail({ settlement: st }: { settlement: Settlement }) {
  const { state, maps } = useScoped()
  const listing = maps.listings.get(st.listingId)
  const deal = st.dealId ? state.deals.find((d) => d.id === st.dealId) : undefined
  const journal = useAuth().can('finance.view') ? journalFor(state, 'settlement', st.id) : undefined
  return (
    <div className="space-y-4">
      <SettlementStatusBadge status={st.status} />
      <KeyValue
        bare
        size="sm"
        items={[
          { label: 'Listing', value: listing ? <CodeLink to={paths.listing(listing.id)} code={listing.code} /> : st.listingId },
          { label: 'Deal', value: deal ? <CodeLink to={paths.deal(deal.id)} code={deal.code} /> : 'Sold directly' },
          { label: 'Closed', value: fmtDateLong(st.closedAt) },
          { label: 'Deal price', value: <span className="tabular-nums">{fmtIdr(st.basis)}</span> },
          { label: 'Commission', value: <span className="font-semibold tabular-nums">{fmtIdr(st.commission)}</span> },
          { label: 'Paid', value: st.paidAt ? fmtDateLong(st.paidAt) : 'Not yet', hidden: st.status !== 'paid' },
          { label: 'Journal', value: journal ? <CodeLink to={paths.journal(journal.id)} code={journal.code} /> : null, hidden: !journal },
        ]}
      />
      <div>
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Lines</div>
        <ul className="divide-y divide-border text-sm">
          {st.lines.map((l) => (
            <li key={l.party} className="flex items-start justify-between gap-3 py-2.5">
              <span className="flex min-w-0 items-start gap-2">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${PARTY_TONE[l.kind]}`} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{l.label}</span>
                  <span className="block text-xs text-muted">
                    {SHARE_PARTY_LABEL[l.kind]} · {partyRule(l)}
                  </span>
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{fmtIdr(l.amount)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/** The printable settlement: hidden on screen, the only thing on paper. */
function SettlementLetter({ settlement: st }: { settlement: Settlement }) {
  const { state, maps, partnerName } = useScoped()
  const listing = maps.listings.get(st.listingId)
  const deal = st.dealId ? state.deals.find((d) => d.id === st.dealId) : undefined
  return (
    <div className="hidden print:block">
      <LetterHead company={state.company} />
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-lg font-bold">Profit-sharing settlement</div>
          <div className="font-mono text-xs text-muted">{st.code}</div>
        </div>
        <div className="text-sm text-muted">{fmtDateLong(st.closedAt)}</div>
      </div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <LetterBlock title="Property">
          <div className="font-semibold">{listing ? `${listing.code} · ${listing.title}` : st.listingId}</div>
          {listing && <div>Partner: {partnerName(listing.partnerId)}</div>}
          <div>{deal ? `Deal ${deal.code}` : 'Sold directly'}</div>
        </LetterBlock>
        <LetterBlock title="Status">
          <div className="font-semibold">{SETTLEMENT_STATUS_LABEL[st.status]}</div>
          {st.paidAt && <div>Paid {fmtDateLong(st.paidAt)}</div>}
        </LetterBlock>
      </div>
      <dl className="mt-6 divide-y divide-border border-y border-border text-sm">
        <LetterRow label="Deal price" value={fmtIdr(st.basis)} />
        <LetterRow label={`Commission${st.basis ? ` (${fmtPercent((st.commission / st.basis) * 100, 2)})` : ''}`} value={fmtIdr(st.commission)} strong />
      </dl>
      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
            <th className="py-2 pr-3 font-semibold">Party</th>
            <th className="py-2 pr-3 font-semibold">Rule</th>
            <th className="py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {st.lines.map((l) => (
            <tr key={l.party}>
              <td className="py-2.5 pr-3">
                <div className="font-medium">{l.label}</div>
                <div className="text-xs text-muted">{SHARE_PARTY_LABEL[l.kind]}</div>
              </td>
              <td className="py-2.5 pr-3 tabular-nums">{l.mode === 'percent' ? `${partyRule(l)} of the rest` : partyRule(l)}</td>
              <td className="py-2.5 text-right font-semibold tabular-nums">{fmtIdr(l.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-muted">Fixed amounts come off the commission first. Percentage parties split what is left.</p>
      <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
        <Signature role="Prepared by" name="" />
        <Signature role={`For ${state.company.name}`} name="" />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- reports

export function SharingReportsPage() {
  const { state } = useScoped()
  const [params, setParams] = useSearchParams()
  const grain: ReportGrain = params.get('grain') === 'quarter' ? 'quarter' : 'month'
  const status = (params.get('status') as SettlementStatus | null) || null
  const period = params.get('period') || null
  const kind = (params.get('kind') as SharePartyKind | null) || 'partner'
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const periods = [...new Set(state.settlements.map((x) => periodOf(x.closedAt, grain)))].sort().reverse()
  const inPeriod = state.settlements.filter((x) => !period || periodOf(x.closedAt, grain) === period)
  const counts = countBy(inPeriod, (x) => x.status)
  const rows = inPeriod.filter((x) => !status || x.status === status)
  const filters = [status, period].filter(Boolean).length
  const byPeriod = totalsByPeriod(rows, grain)
  const byParty = totalsByParty(rows)
  const partyRows = byParty.filter((r) => r.kind === kind)
  const kindTotal = (k: SharePartyKind) => byParty.filter((r) => r.kind === k).reduce((n, r) => n + r.total, 0)
  const scope = `${period ? periodLabel(period) : 'all periods'}${status ? `, ${SETTLEMENT_STATUS_LABEL[status].toLowerCase()}` : ''}`

  const periodColumns: Column<PeriodRow>[] = [
    { id: 'period', header: grain === 'month' ? 'Month' : 'Quarter', sortValue: (r) => r.period, cell: (r) => <span className="text-sm font-medium">{periodLabel(r.period)}</span> },
    { id: 'count', header: 'Settlements', align: 'right', hideBelow: 'md', sortValue: (r) => r.settlements, cell: (r) => <span className="tabular-nums">{r.settlements}</span> },
    { id: 'company', header: 'Company', align: 'right', hideBelow: 'lg', sortValue: (r) => r.company, cell: (r) => <span className="tabular-nums">{fmtIdrShort(r.company)}</span> },
    { id: 'agent', header: 'Agents', align: 'right', hideBelow: 'lg', sortValue: (r) => r.agent, cell: (r) => <span className="tabular-nums">{fmtIdrShort(r.agent)}</span> },
    { id: 'partner', header: 'Partners', align: 'right', hideBelow: 'xl', sortValue: (r) => r.partner, cell: (r) => <span className="tabular-nums">{fmtIdrShort(r.partner)}</span> },
    { id: 'other', header: 'Other', align: 'right', hideBelow: 'xl', sortValue: (r) => r.other, cell: (r) => <span className="tabular-nums">{fmtIdrShort(r.other)}</span> },
    { id: 'commission', header: 'Commission', align: 'right', sortValue: (r) => r.commission, cell: (r) => <span className="font-semibold tabular-nums">{fmtIdrShort(r.commission)}</span> },
  ]
  const partyColumns: Column<PartyRow>[] = [
    { id: 'label', header: SHARE_PARTY_LABEL[kind], sortValue: (r) => r.label, cell: (r) => <span className="block truncate text-sm font-medium">{r.label}</span> },
    { id: 'count', header: 'Settlements', align: 'right', hideBelow: 'md', sortValue: (r) => r.settlements, cell: (r) => <span className="tabular-nums">{r.settlements}</span> },
    { id: 'open', header: 'Open', align: 'right', hideBelow: 'sm', sortValue: (r) => r.open, cell: (r) => <span className="tabular-nums">{fmtIdrShort(r.open)}</span> },
    { id: 'paid', header: 'Paid', align: 'right', hideBelow: 'sm', sortValue: (r) => r.paid, cell: (r) => <span className="tabular-nums">{fmtIdrShort(r.paid)}</span> },
    { id: 'total', header: 'Total', align: 'right', sortValue: (r) => r.total, cell: (r) => <span className="font-semibold tabular-nums">{fmtIdrShort(r.total)}</span> },
  ]

  const exportPeriods = () =>
    downloadCsv(`profit-sharing-by-${grain}`, [
      [grain === 'month' ? 'Month' : 'Quarter', 'Settlements', 'Commission (IDR)', 'Company (IDR)', 'Agents (IDR)', 'Partners (IDR)', 'Other (IDR)'],
      ...byPeriod.map((r) => [periodLabel(r.period), r.settlements, Math.round(r.commission), Math.round(r.company), Math.round(r.agent), Math.round(r.partner), Math.round(r.other)]),
    ])
  const exportParties = () =>
    downloadCsv(`profit-sharing-${kind}${period ? `-${period.toLowerCase()}` : ''}`, [
      ['Type', 'Party', 'Settlements', 'Open (IDR)', 'Paid (IDR)', 'Total (IDR)'],
      ...partyRows.map((r) => [SHARE_PARTY_LABEL[r.kind], r.label, r.settlements, Math.round(r.open), Math.round(r.paid), Math.round(r.total)]),
    ])

  return (
    <div>
      <SharingNav />
      <PageHeader
        title="Profit-sharing reports"
        description="Settlement totals per month or quarter, and what each partner, agent and the company earned."
        actions={
          <PillTabs
            label="Report period"
            size="sm"
            value={grain}
            onChange={(g) => {
              const next = new URLSearchParams(params)
              next.delete('period')
              if (g === 'quarter') next.set('grain', g)
              else next.delete('grain')
              setParams(next, { replace: true })
            }}
            items={[
              { value: 'month', label: 'Month' },
              { value: 'quarter', label: 'Quarter' },
            ]}
          />
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Commission" value={short(rows.reduce((n, x) => n + x.commission, 0))} unit="Rp" icon={<CircleDollarSign />} tone="ink" hint={`${rows.length} settlement${rows.length === 1 ? '' : 's'}`} />
        <StatCard label="Company" value={short(kindTotal('company'))} unit="Rp" icon={<Building2 />} tone="success" />
        <StatCard label="Agents" value={short(kindTotal('agent'))} unit="Rp" icon={<UserRound />} />
        <StatCard label="Partners" value={short(kindTotal('partner'))} unit="Rp" icon={<HandCoins />} hint={kindTotal('other') ? `Other parties ${fmtIdrShort(kindTotal('other'))}` : undefined} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={inPeriod.length} onClick={() => set('status', null)}>
            All
          </Chip>
          {STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={counts[s] ?? 0} onClick={() => set('status', status === s ? null : s)}>
              {SETTLEMENT_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        <NativeSelect variant="inline" aria-label={grain === 'month' ? 'Filter by month' : 'Filter by quarter'} value={period ?? ''} onChange={(e) => set('period', e.target.value)}>
          <option value="">{grain === 'month' ? 'All months' : 'All quarters'}</option>
          {periods.map((p) => (
            <option key={p} value={p}>
              {periodLabel(p)}
            </option>
          ))}
        </NativeSelect>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.settlements.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams(grain === 'quarter' ? { grain } : {}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4">
        <Card>
          <CardHeader
            action={
              <Button variant="outline" size="sm" disabled={!byPeriod.length} onClick={exportPeriods}>
                <Download />
                Export CSV
              </Button>
            }
          >
            <CardTitle>By {grain}</CardTitle>
          </CardHeader>
          <div className="px-2 pb-2">
            <DataTable
              rows={byPeriod}
              columns={periodColumns}
              getRowKey={(r) => r.period}
              rowLabel={(r) => periodLabel(r.period)}
              initialSort={{ id: 'period', desc: true }}
              resetPageKey={`${grain}|${status}|${period}`}
              empty={<EmptyState compact title="No settlements in this view" description={filters ? 'Change or clear the filters.' : 'Settlements appear when listings sell or deals are won.'} />}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            action={
              <Button variant="outline" size="sm" disabled={!partyRows.length} onClick={exportParties}>
                <Download />
                Export CSV
              </Button>
            }
          >
            <CardTitle>By party</CardTitle>
            <p className="text-sm text-muted">Earnings for {scope}.</p>
          </CardHeader>
          <div className="px-5">
            <PillTabs
              label="Party type"
              size="sm"
              value={kind}
              onChange={(k) => set('kind', k === 'partner' ? null : k)}
              items={KINDS.map((k) => ({ value: k, label: KIND_PLURAL[k], count: byParty.filter((r) => r.kind === k).length }))}
            />
          </div>
          <div className="px-2 pb-2 pt-2">
            <DataTable
              rows={partyRows}
              columns={partyColumns}
              getRowKey={(r) => r.party}
              rowLabel={(r) => r.label}
              initialSort={{ id: 'total', desc: true }}
              resetPageKey={`${kind}|${status}|${period}`}
              empty={<EmptyState compact title={`No ${KIND_PLURAL[kind].toLowerCase()} in this view`} description="Pick another party type or clear the filters." />}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
