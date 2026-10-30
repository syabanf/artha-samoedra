import { currentExclusive, daysLeft, exclusiveState, fmtAgo, fmtIdrShort, shareAmounts } from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, CountBadge, EmptyState, Kicker, StatCard } from '@artha/ui'
import { AGENT_EVENT_KIND_LABEL, OPEN_INQUIRY_STATUSES } from '@artha/types'
import { Building2, CircleDollarSign, MessagesSquare, MonitorSmartphone, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { ExclusiveBadge, InquiryStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useUser } from '../../auth/auth'
import { useAppState, useNow, useScoped } from '../../state/store'

export function DashboardPage() {
  const { state } = useAppState()
  const { listingCode } = useScoped()
  const user = useUser()
  const now = useNow()
  const navigate = useNavigate()

  const active = state.listings.filter((l) => l.status === 'active' || l.status === 'reserved')
  const review = state.listings.filter((l) => l.status === 'review')
  const openInq = state.inquiries.filter((i) => OPEN_INQUIRY_STATUSES.includes(i.status))
  const newInq = state.inquiries.filter((i) => i.status === 'new')
  const watch = state.exclusives
    .filter((e) => currentExclusive(state, e.listingId)?.id === e.id)
    .map((e) => ({ e, st: exclusiveState(e, now), left: daysLeft(e, now) }))
    .filter((x) => x.st === 'due' || x.st === 'expired')
    .sort((a, b) => a.left - b.left)
  const pipeline = active.reduce((sum, l) => {
    const share = state.profitShares.find((p) => p.listingId === l.id)
    return share ? sum + shareAmounts(share, l).company : sum
  }, 0)
  const top = watch[0]
  const topListing = top && state.listings.find((l) => l.id === top.e.listingId)

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Dashboard</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[28px] font-bold leading-tight tracking-tight">
          Hi, {user.name.split(' ')[0]}
          <span className="text-accent">.</span>
        </div>
        <Button variant="secondary" asChild>
          <Link to={paths.os}>
            <MonitorSmartphone />
            Open desktop view
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card variant="ink" className="p-6">
          <Kicker className="text-on-ink-muted">Jessy today</Kicker>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-5xl font-bold tracking-tight tabular-nums">{state.agentEvents.length}</span>
            <span className="pb-1 text-sm font-semibold text-on-ink-muted">actions logged</span>
          </div>
          <ul className="mt-5 space-y-2">
            {state.agentEvents.slice(0, 3).map((ev) => (
              <li key={ev.id} className="flex items-start gap-3 rounded-2xl bg-white/5 p-3 text-sm">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block">{ev.text}</span>
                  <span className="text-xs text-on-ink-muted">
                    {AGENT_EVENT_KIND_LABEL[ev.kind]} · {fmtAgo(ev.at)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Button variant="onInk" size="sm" className="mt-4" asChild>
            <Link to={paths.jessy}>View all Jessy activity</Link>
          </Button>
        </Card>
        {topListing ? (
          <Card variant="accent" className="flex flex-col p-6">
            <div className="text-[13px] font-semibold text-white/80">Most urgent exclusive rights</div>
            <div className="mt-2 text-5xl font-bold leading-none tracking-tight tabular-nums">
              {top.left < 0 ? `+${-top.left}` : top.left}
              <span className="ml-1 text-lg font-semibold text-white/80">{top.left < 0 ? 'days overdue' : 'days left'}</span>
            </div>
            <div className="mt-3 text-sm text-white/80">
              {topListing.code} · {topListing.title}
            </div>
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              <Button variant="onInk" size="sm" asChild>
                <Link to={paths.listing(topListing.id)}>Open listing</Link>
              </Button>
              <Button variant="onInk" size="sm" asChild>
                <Link to={`${paths.exclusives}?state=due`}>
                  All due <CountBadge count={watch.length} onInk className="ring-0" />
                </Link>
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <EmptyState compact icon={<ShieldCheck />} title="No exclusives coming due" description="Jessy sends a reminder when an exclusive period enters its reminder window." />
          </Card>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Live listings" value={active.length} icon={<Building2 />} tone="ink" hint={`${review.length} awaiting review`} onClick={() => navigate(paths.listings)} />
        <StatCard
          label="Open inquiries"
          value={openInq.length}
          icon={<MessagesSquare />}
          tone={newInq.length ? 'danger' : 'default'}
          hint={`${newInq.length} new, not yet handled`}
          onClick={() => navigate(`${paths.inquiries}?status=new`)}
        />
        <StatCard label="Exclusives due" value={watch.length} icon={<ShieldCheck />} tone={watch.length ? 'warning' : 'success'} hint="In the reminder window" onClick={() => navigate(`${paths.exclusives}?state=due`)} />
        <StatCard label="Company commission pipeline" value={fmtIdrShort(pipeline).replace('Rp ', '')} unit="Rp" icon={<CircleDollarSign />} tone="success" hint="From live listings" onClick={() => navigate(paths.sharing)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader action={<Button variant="outline" size="sm" asChild><Link to={paths.inquiries}>View all</Link></Button>}>
            <CardTitle className="flex items-center gap-2">
              Latest inquiries <CountBadge count={newInq.length} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {state.inquiries.slice(0, 5).map((i) => (
              <Link key={i.id} to={paths.inquiry(i.id)} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{i.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {listingCode(i.listingId)} · {i.message}
                  </span>
                </span>
                <InquiryStatusBadge status={i.status} />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader action={<Button variant="outline" size="sm" asChild><Link to={paths.listings}>Open listings</Link></Button>}>
            <CardTitle className="flex items-center gap-2">
              Needs review <CountBadge count={review.length} />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {review.length === 0 && <EmptyState compact title="No listings waiting" description="Listings from partner chats show up here before they go live." />}
            {review.map((l) => (
              <Link key={l.id} to={paths.listing(l.id)} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] font-semibold text-muted">{l.code}</span>
                  <span className="block truncate text-sm font-semibold">{l.title}</span>
                </span>
                <Badge variant="muted">{fmtAgo(l.createdAt)}</Badge>
              </Link>
            ))}
            {watch.slice(0, 3).map(({ e, st, left }) => (
              <Link key={e.id} to={paths.listing(e.listingId)} className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                <ShieldCheck className="size-4 shrink-0 text-warning" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">Exclusive {listingCode(e.listingId)}</span>
                <ExclusiveBadge state={st} days={left} />
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
