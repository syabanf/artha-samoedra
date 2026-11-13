import { fmtDate, fmtIdr, fmtIdrShort, LEASE_STATE_LABEL, type LeaseState, type LeaseSummary } from '@artha/fixtures'
import { Badge, Banner, Button, Card, CardContent, CardHeader, CardTitle, type BadgeVariant } from '@artha/ui'
import { PUBLIC_LISTING_STATUSES, RENT_BILLING_LABEL, type RentBill } from '@artha/types'
import { CalendarClock, ChevronDown, MessageSquareText } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '../components/links'

const STATE_BADGE: Record<LeaseState, BadgeVariant> = { occupied: 'success', ending: 'warning', upcoming: 'info', ended: 'muted' }
const PER: Record<LeaseSummary['lease']['billing'], string> = { monthly: 'month', quarterly: 'quarter', yearly: 'year' }

/**
 * The partner's managed rentals: who rents each property, the rent Artha collected, its fee and what
 * reached the owner. An agent sees the client it represents and its commission from Artha's fee.
 */
export function PartnerRentals({ rentals, agent }: { rentals: LeaseSummary[]; agent: boolean }) {
  if (!rentals.length) return null
  const total = (pick: (r: LeaseSummary) => number) => rentals.reduce((n, r) => n + pick(r), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Managed rentals</CardTitle>
        <p className="text-sm text-muted">
          Artha Samoedra collects the rent, keeps its management fee and pays the rest to the owner{agent ? ', and pays your commission from that fee' : ''}.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Rent collected" value={fmtIdrShort(total((r) => r.collected))} />
          <Figure label="Artha fee" value={fmtIdrShort(total((r) => r.fee))} />
          <Figure label={agent ? 'Net to your clients' : 'Net to you'} value={fmtIdrShort(total((r) => r.ownerNet))} />
          {agent ? (
            <Figure label="Your commission" value={fmtIdrShort(total((r) => r.agentFee))} strong />
          ) : (
            <Figure label="Paid out" value={fmtIdrShort(total((r) => r.paidOut))} strong />
          )}
        </dl>
        <ul className="space-y-3">
          {rentals.map((r) => (
            <RentalRow key={r.lease.id} rental={r} agent={agent} />
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface-2 p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`mt-0.5 text-lg font-bold tabular-nums ${strong ? 'text-accent-strong' : ''}`}>{value}</dd>
    </div>
  )
}

function RentalRow({ rental: r, agent }: { rental: LeaseSummary; agent: boolean }) {
  const { lease, listing } = r
  const onMarket = PUBLIC_LISTING_STATUSES.includes(listing.status)
  const owed = r.overdue.reduce((n, b) => n + b.amount, 0)
  return (
    <li className="rounded-2xl bg-surface-2 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] font-semibold text-muted">{lease.code}</span>
        <Badge variant={STATE_BADGE[r.state]} dot>
          {LEASE_STATE_LABEL[r.state]}
        </Badge>
        {r.state === 'ended' && onMarket && <Badge variant="outline">Back on the market</Badge>}
      </div>
      <div className="mt-1.5 text-sm font-semibold">
        {onMarket ? (
          <Link to={paths.asset(listing.slug)} className="hover:text-accent-strong hover:underline">
            {listing.title}
          </Link>
        ) : (
          listing.title
        )}
      </div>
      <p className="text-xs text-muted">
        {listing.district}, {listing.city}
        {lease.ownerName && ` · on behalf of ${lease.ownerName}`}
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <Fact label="Tenant" value={lease.tenant} />
        <Fact label={`Rent (${RENT_BILLING_LABEL[lease.billing].toLowerCase()})`} value={`${fmtIdrShort(lease.rent)} / ${PER[lease.billing]}`} />
        <Fact label="Lease" value={`${fmtDate(lease.startDate)} to ${fmtDate(lease.endDate)}`} />
        <Fact label={r.state === 'ended' ? 'Ended' : 'Next bill'} value={r.state === 'ended' ? `${-r.daysToEnd} days ago` : r.nextDue ? fmtDate(r.nextDue) : 'Last period billed'} />
        <Fact label="Collected" value={fmtIdr(r.collected)} />
        <Fact label={`Artha fee ${lease.feePct}%`} value={fmtIdr(r.fee)} />
        <Fact label="Net to owner" value={fmtIdr(r.ownerNet)} />
        {agent ? <Fact label={`Your commission ${lease.agentPct}% of fee`} value={fmtIdr(r.agentFee)} /> : <Fact label="Paid out to you" value={fmtIdr(r.paidOut)} />}
      </dl>

      {r.overdue.length > 0 && (
        <Banner tone="danger" title={`${r.overdue.length} bill overdue, ${fmtIdr(owed)}`} className="mt-3">
          Due {fmtDate(r.overdue[0].dueDate)}. Our team is following up with the tenant, and the payout follows once the rent arrives.
        </Banner>
      )}
      {r.state === 'ending' && (
        <Banner
          tone="warning"
          title={`Lease ends in ${r.daysToEnd} days`}
          className="mt-3"
          actions={
            <Button size="sm" variant="outline" asChild>
              <Link to={paths.partnerPortal}>
                <MessageSquareText />
                Tell Jessy
              </Link>
            </Button>
          }
        >
          Tell us whether {lease.tenant} renews or we look for a new tenant. The listing stays on the market meanwhile.
        </Banner>
      )}

      <details className="group mt-3">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-accent-strong">
          <CalendarClock className="size-3.5" />
          Rent history ({r.bills.length})
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <ul className="mt-2 divide-y divide-border rounded-xl bg-card px-3">
          {r.bills
            .slice()
            .reverse()
            .map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-xs">
                <span>
                  {fmtDate(b.periodStart)}
                  <span className="text-muted"> · {fmtIdr(b.amount)}</span>
                </span>
                <BillStatus bill={b} overdue={r.overdue.includes(b)} />
              </li>
            ))}
          {!r.bills.length && <li className="py-2 text-xs text-muted">The first bill goes out on {fmtDate(lease.startDate)}.</li>}
        </ul>
      </details>
    </li>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums [overflow-wrap:anywhere]">{value}</dd>
    </div>
  )
}

function BillStatus({ bill, overdue }: { bill: RentBill; overdue: boolean }) {
  if (bill.payoutAt) return <Badge variant="success">Paid out {fmtDate(bill.payoutAt)}</Badge>
  if (bill.paidAt) return <Badge variant="info">Paid, payout pending</Badge>
  return <Badge variant={overdue ? 'danger' : 'muted'}>{overdue ? 'Overdue' : 'Due'}</Badge>
}
