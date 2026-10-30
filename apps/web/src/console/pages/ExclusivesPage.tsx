import { countBy, daysLeft, exclusiveState, fmtAgo, fmtDate, milestoneTimeline, sweepTargets } from '@artha/fixtures'
import { Banner, Button, Chip, ChipRow, DataTable, EmptyState, Input, PageHeader, StatCard, type Column } from '@artha/ui'
import { EXCLUSIVE_STATE_LABEL, type ExclusiveRight, type ExclusiveState } from '@artha/types'
import { CalendarClock, FileText, Search, ShieldAlert, ShieldCheck, Sparkles, X } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { ExclusiveBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useNow, useScoped } from '../../state/store'
import { useAct } from '../dialogs'

const STATES: ExclusiveState[] = ['due', 'expired', 'active', 'ended']

/** The next milestone still to go out, or null when none is left. */
const nextReminder = (e: ExclusiveRight, now: number) => {
  if (e.endedAt || e.status === 'expired') return null
  return milestoneTimeline(e).find((m) => !m.sent && Date.parse(m.due) > now) ?? null
}

export function ExclusivesPage() {
  const { state, maps, partnerName } = useScoped()
  const { can } = useAuth()
  const act = useAct()
  const now = useNow()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = (params.get('state') as ExclusiveState | null) || null
  const q = params.get('q') ?? ''
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = (e: ExclusiveRight) => {
    const l = maps.listings.get(e.listingId)
    const text = `${l?.code ?? ''} ${l?.title ?? ''} ${partnerName(l?.partnerId ?? '')} ${e.contractNo ?? ''}`.toLowerCase()
    return terms.every((t) => text.includes(t))
  }
  const searched = state.exclusives.filter(matches)
  const counts = countBy(searched, (e) => exclusiveState(e, now))
  const rows = searched.filter((e) => !filter || exclusiveState(e, now) === filter)
  const filters = [q, filter].filter(Boolean).length
  const pending = sweepTargets(state, now)
  const lastSent = state.exclusives
    .flatMap((e) => (e.reminders ?? []).filter((r) => !r.skipped).map((r) => ({ at: r.at, e })))
    .sort((a, b) => b.at.localeCompare(a.at))[0]

  const columns: Column<ExclusiveRight>[] = [
    {
      id: 'listing',
      header: 'Listing',
      sortValue: (e) => maps.listings.get(e.listingId)?.code ?? '',
      cell: (e) => {
        const l = maps.listings.get(e.listingId)
        return (
          <div className="min-w-0">
            <div className="font-mono text-xs font-semibold">{l?.code}</div>
            <div className="truncate text-sm">{l?.title}</div>
            <div className="mt-1.5 sm:hidden">
              <ExclusiveBadge state={exclusiveState(e, now)} days={daysLeft(e, now)} />
            </div>
          </div>
        )
      },
    },
    { id: 'state', header: 'Status', hideBelow: 'sm', sortValue: (e) => STATES.indexOf(exclusiveState(e, now)), cell: (e) => <ExclusiveBadge state={exclusiveState(e, now)} days={daysLeft(e, now)} /> },
    { id: 'partner', header: 'Partner', hideBelow: 'lg', cell: (e) => partnerName(maps.listings.get(e.listingId)?.partnerId ?? '') },
    {
      id: 'contract',
      header: 'Contract',
      hideBelow: 'xl',
      cell: (e) =>
        e.contractNo ? (
          <span className="flex items-center gap-1.5 text-xs">
            <span className="font-mono">{e.contractNo}</span>
            {e.document && <FileText className="size-3.5 shrink-0 text-muted" aria-label="Document attached" />}
          </span>
        ) : (
          <span className="text-xs text-muted">Not recorded</span>
        ),
    },
    { id: 'period', header: 'Period', hideBelow: 'md', cell: (e) => <span className="whitespace-nowrap text-xs">{fmtDate(e.startsAt)} to {fmtDate(e.endsAt)}</span> },
    {
      id: 'remind',
      header: 'Next reminder',
      hideBelow: 'lg',
      cell: (e) => {
        const next = nextReminder(e, now)
        return <span className="whitespace-nowrap text-xs text-muted">{next ? `${next.days} d before, ${fmtDate(next.due)}` : 'None left'}</span>
      },
    },
    {
      id: 'left',
      header: 'Left',
      align: 'right',
      sortValue: (e) => (e.endedAt ? null : daysLeft(e, now)),
      cell: (e) => {
        if (e.endedAt) return <span className="text-muted">–</span>
        const st = exclusiveState(e, now)
        const left = daysLeft(e, now)
        return <span className={st === 'expired' ? 'font-semibold text-accent' : st === 'due' ? 'font-semibold text-warning' : ''}>{left < 0 ? `${-left} d overdue` : `${left} d`}</span>
      },
    },
    {
      id: 'actions',
      header: '',
      width: '9rem',
      align: 'right',
      cell: (e) =>
        can('exclusive.manage') && !e.endedAt ? (
          <Button variant="outline" size="sm" onClick={() => act({ type: 'exclusives/extend', id: e.id, days: 30 }, 'Extended by 30 days', maps.listings.get(e.listingId)?.code)}>
            +30 days
          </Button>
        ) : null,
    },
  ]

  const toggle = (s: ExclusiveState) => set('state', filter === s ? null : s)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Exclusive rights"
        description="Exclusive marketing periods per listing. Jessy reminds the team 30, 7 and 1 day before the end and marks a right expired on its end date."
        className="mb-2 [&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <Input
            variant="pill"
            icon={<Search />}
            aria-label="Search exclusive rights"
            placeholder="Listing, partner or contract"
            value={q}
            onChange={(e) => set('q', e.target.value)}
            className="min-w-0 flex-1 sm:w-72 sm:flex-none"
            right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
          />
        }
      />
      <Banner
        tone={pending.length ? 'warning' : 'neutral'}
        title={pending.length ? `${pending.length} exclusive rights wait for the next check` : 'Every reminder that is due has gone out'}
        actions={
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Sparkles className="size-3.5 text-accent" />
            {lastSent ? `Last reminder ${fmtAgo(lastSent.at)}` : 'No reminders yet'}
          </span>
        }
      >
        Each reminder goes out once, by the channels set in Notifications.
      </Banner>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Due soon" value={counts.due ?? 0} icon={<CalendarClock />} tone={counts.due ? 'warning' : 'default'} active={filter === 'due'} onClick={() => toggle('due')} />
        <StatCard label={EXCLUSIVE_STATE_LABEL.expired} value={counts.expired ?? 0} icon={<ShieldAlert />} tone={counts.expired ? 'danger' : 'default'} active={filter === 'expired'} onClick={() => toggle('expired')} />
        <StatCard label="Active" value={counts.active ?? 0} icon={<ShieldCheck />} tone="ink" active={filter === 'active'} onClick={() => toggle('active')} />
        <StatCard label="Ended" value={counts.ended ?? 0} icon={<ShieldCheck />} active={filter === 'ended'} onClick={() => toggle('ended')} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!filter} count={searched.length} onClick={() => set('state', null)}>
            All
          </Chip>
          {STATES.map((s) => (
            <Chip key={s} active={filter === s} count={counts[s] ?? 0} onClick={() => toggle(s)}>
              {EXCLUSIVE_STATE_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.exclusives.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={() => setParams({}, { replace: true })}>
              Clear {filters} {filters === 1 ? 'filter' : 'filters'}
            </Button>
          </span>
        )}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(e) => e.id}
        rowLabel={(e) => maps.listings.get(e.listingId)?.code ?? ''}
        onRowClick={(e) => navigate(paths.listing(e.listingId))}
        initialSort={{ id: 'left', desc: false }}
        resetPageKey={`${q}|${filter ?? ''}`}
        rowClassName={(e) => (exclusiveState(e, now) === 'expired' ? 'bg-accent-soft/40' : exclusiveState(e, now) === 'due' ? 'bg-warning-soft/40' : undefined)}
        empty={
          filters ? (
            <EmptyState compact title="No exclusive rights match" description="Change the search or clear filters." action={<Button variant="outline" size="sm" onClick={() => setParams({}, { replace: true })}>Clear filters</Button>} />
          ) : (
            <EmptyState compact title="No exclusive rights yet" description="Grant exclusive rights from a listing page, or a partner grants them through Jessy chat." />
          )
        }
      />
    </div>
  )
}
