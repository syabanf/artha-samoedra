import { currentExclusive, daysLeft, exclusiveState, fmtDate, fmtIdr, fmtIdrShort, fmtNumber, normalizePhone, partyRule, SETTLEMENT_STATUS_LABEL } from '@artha/fixtures'
import { Button, Card, CardContent, CardHeader, CardTitle, EmptyState, FormField, Input, Kicker, StatCard } from '@artha/ui'
import { PARTNER_KIND_LABEL, PUBLIC_LISTING_STATUSES, type Listing } from '@artha/types'
import { ArrowRight, Building2, Eye, LogOut, MessageSquareText, Phone, Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { ExclusiveBadge, ListingStatusBadge } from '../components/badges'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { usePersistentState } from '../lib/storage'
import { useAppState, useNow } from '../state/store'
import { SiteContainer } from './SiteLayout'

export function PartnerDashboardPage() {
  useDocumentMeta('Partner dashboard · Artha Samoedra', 'Owners, agents and developers see their listings, exclusive rights, portal reach and profit-share earnings.')
  const { state } = useAppState()
  const [phone, setPhone] = usePersistentState<string>('partnerPhone', '')
  const partner = phone ? state.partners.find((p) => normalizePhone(p.phone) === phone) : undefined
  return (
    <SiteContainer className="pt-8">
      {partner ? <Dashboard partnerId={partner.id} onSignOut={() => setPhone('')} /> : <SignIn onSignIn={setPhone} />}
    </SiteContainer>
  )
}

function SignIn({ onSignIn }: { onSignIn: (phone: string) => void }) {
  const { state } = useAppState()
  const [value, setValue] = useState('')
  const [tried, setTried] = useState(false)
  const phone = normalizePhone(value)
  const error =
    phone.length < 9
      ? 'Enter the full WhatsApp number you registered with.'
      : state.partners.some((p) => normalizePhone(p.phone) === phone)
        ? null
        : 'No partner uses this number. List a property first through the partner chat.'
  return (
    <div className="mx-auto max-w-md">
      <Kicker>Partner dashboard</Kicker>
      <h1 className="mt-2 font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">Your listings and earnings in one place</h1>
      <p className="mt-3 text-sm text-muted">Sign in with the WhatsApp number you registered with. Sample partner number: {state.partners[0]?.phone}.</p>
      <Card className="mt-6 p-5">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (!error) onSignIn(phone)
          }}
          className="space-y-4"
        >
          <FormField label="WhatsApp number" required error={tried ? (error ?? undefined) : undefined}>
            <Input type="tel" inputMode="tel" autoComplete="tel" icon={<Phone />} placeholder="0812-1100-2231" value={value} onChange={(e) => setValue(e.target.value)} />
          </FormField>
          <Button type="submit" className="w-full">
            Open dashboard
          </Button>
        </form>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        New partner?{' '}
        <Link to={paths.partnerPortal} className="font-semibold text-accent-strong hover:underline">
          List a property with Jessy
        </Link>
      </p>
    </div>
  )
}

function Dashboard({ partnerId, onSignOut }: { partnerId: string; onSignOut: () => void }) {
  const { state } = useAppState()
  const now = useNow()
  const partner = state.partners.find((p) => p.id === partnerId)!
  const listings = state.listings.filter((l) => l.partnerId === partnerId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const reach = (l: Listing) => {
    const syncs = state.portalSyncs.filter((x) => x.listingId === l.id)
    return { views: syncs.reduce((n, x) => n + x.views, 0), leads: syncs.reduce((n, x) => n + x.leads, 0), live: syncs.filter((x) => x.status === 'live').length }
  }
  // Earnings are the partner's lines on settlements, on its own listings or as a co-broker on others.
  const earnings = state.settlements
    .flatMap((st) => {
      const line = st.lines.find((x) => x.party === `partner:${partnerId}`)
      const listing = state.listings.find((l) => l.id === st.listingId)
      return line && listing ? [{ settlement: st, line, listing }] : []
    })
    .sort((a, b) => b.settlement.closedAt.localeCompare(a.settlement.closedAt))
  const earned = earnings.reduce((n, e) => n + e.line.amount, 0)
  const paidOut = earnings.filter((e) => e.settlement.status === 'paid').reduce((n, e) => n + e.line.amount, 0)
  const live = listings.filter((l) => PUBLIC_LISTING_STATUSES.includes(l.status)).length
  const totalViews = listings.reduce((n, l) => n + reach(l).views, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Kicker>
            Partner dashboard · {PARTNER_KIND_LABEL[partner.kind]} · {partner.code}
          </Kicker>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">{partner.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={paths.partnerPortal}>
              <MessageSquareText />
              List or withdraw
            </Link>
          </Button>
          <Button variant="outline" onClick={onSignOut}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Live listings" value={live} icon={<Building2 />} tone="ink" />
        <StatCard label="In review" value={listings.filter((l) => l.status === 'review').length} icon={<Building2 />} tone="warning" />
        <StatCard label="Portal views" value={fmtNumber(totalViews)} icon={<Eye />} tone="info" />
        <StatCard label="Earned" value={fmtIdrShort(earned)} icon={<Wallet />} tone="success" hint={`${fmtIdrShort(paidOut)} paid out`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your listings</CardTitle>
        </CardHeader>
        <CardContent>
          {listings.length ? (
            <ul className="divide-y divide-border">
              {listings.map((l) => {
                const r = reach(l)
                const ex = currentExclusive(state, l.id)
                const isPublic = PUBLIC_LISTING_STATUSES.includes(l.status)
                return (
                  <li key={l.id} className="grid grid-cols-1 gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-muted">{l.code}</span>
                        <ListingStatusBadge status={l.status} />
                        {ex && (
                          <span className="flex items-center gap-1 text-xs text-muted">
                            Exclusive
                            <ExclusiveBadge state={exclusiveState(ex, now)} days={daysLeft(ex, now)} />
                          </span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold">
                        {isPublic ? (
                          <Link to={paths.asset(l.slug)} className="hover:text-accent-strong hover:underline">
                            {l.title}
                          </Link>
                        ) : (
                          l.title
                        )}
                      </div>
                      <div className="text-xs text-muted">
                        {l.district}, {l.city} · {fmtIdrShort(l.soldPrice ?? l.price)}
                        {ex && !ex.endedAt && ` · exclusive until ${fmtDate(ex.endsAt)}`}
                      </div>
                    </div>
                    <dl className="flex gap-5 text-xs sm:text-right">
                      <div>
                        <dt className="text-muted">Portals</dt>
                        <dd className="font-semibold tabular-nums">{r.live}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Views</dt>
                        <dd className="font-semibold tabular-nums">{fmtNumber(r.views)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Leads</dt>
                        <dd className="font-semibold tabular-nums">{r.leads}</dd>
                      </div>
                    </dl>
                  </li>
                )
              })}
            </ul>
          ) : (
            <EmptyState
              compact
              title="No listings yet"
              description="Tell Jessy about your property and our team reviews it within a day."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to={paths.partnerPortal}>List a property</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profit-share earnings</CardTitle>
        </CardHeader>
        <CardContent>
          {earnings.length ? (
            <ul className="divide-y divide-border">
              {earnings.map(({ settlement: st, line, listing: l }) => (
                <li key={st.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{l.title}</div>
                    <div className="text-xs text-muted">
                      Closed {fmtDate(st.closedAt)} for {fmtIdrShort(st.basis)} · commission {fmtIdrShort(st.commission)}, your share {line.mode === 'percent' ? `${partyRule(line)} of the rest` : partyRule(line)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold tabular-nums">{fmtIdr(line.amount)}</div>
                    <div className={`text-xs font-semibold ${st.status === 'paid' ? 'text-success' : 'text-muted'}`}>{SETTLEMENT_STATUS_LABEL[st.status]}</div>
                  </div>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 pt-3 text-sm font-bold">
                <span>Total</span>
                <span className="tabular-nums">{fmtIdr(earned)}</span>
              </li>
            </ul>
          ) : (
            <EmptyState compact icon={<Wallet />} title="No earnings yet" description="Your share appears here when a listing you take part in is sold." />
          )}
        </CardContent>
      </Card>

      <Card variant="ink" className="flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-medium">Sold it yourself, or have a new property?</h2>
          <p className="mt-1 text-sm text-on-ink-muted">Jessy lists or withdraws a property in one conversation.</p>
        </div>
        <Button variant="onInk" asChild>
          <Link to={paths.partnerPortal}>
            Open partner chat <ArrowRight />
          </Link>
        </Button>
      </Card>
    </div>
  )
}
