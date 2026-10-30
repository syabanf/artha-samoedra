import { fmtDateLong, fmtTime, newId, nowIso, toMs, unitCounts } from '@artha/fixtures'
import { Button, Card, EmptyState, FormField, Input, Kicker, ProgressBar } from '@artha/ui'
import { PROJECT_KIND_LABEL, PUBLIC_LISTING_STATUSES, type OpenHouse } from '@artha/types'
import { CalendarDays, CircleCheck, Clock, MapPin, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { useAppState, useNow } from '../state/store'
import { ListingCard } from './ListingCard'
import { SiteContainer } from './SiteLayout'

export function OpenHousePublicPage() {
  const { slug } = useParams()
  const { state } = useAppState()
  const now = useNow()
  const found = state.openHouses.find((o) => o.slug === slug)
  const o = found?.published ? found : undefined
  useDocumentMeta(
    o ? `${o.title} · Artha Samoedra` : 'Open house not found · Artha Samoedra',
    o ? `Open house on ${fmtDateLong(o.startAt)}, ${fmtTime(o.startAt)} to ${fmtTime(o.endAt)}. Register with your WhatsApp number.` : undefined,
  )

  if (!o) {
    return (
      <SiteContainer className="pt-10">
        <h1 className="sr-only">Open house not found</h1>
        <Card>
          <EmptyState
            title="Open house not found"
            description="The link may be mistyped or the event is no longer listed. Browse the properties on offer instead."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to={paths.assets}>View properties</Link>
              </Button>
            }
          />
        </Card>
      </SiteContainer>
    )
  }

  const listing = state.listings.find((l) => l.id === o.listingId)
  const project = state.projects.find((p) => p.id === o.projectId)
  const seatsLeft = Math.max(0, o.capacity - o.registrations.length)
  const ended = toMs(o.endAt) < now

  return (
    <SiteContainer className="pt-8">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Kicker>Open house</Kicker>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {o.title}
            <span className="text-accent">.</span>
          </h1>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-muted" />
              {fmtDateLong(o.startAt)}
            </li>
            <li className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-muted" />
              {fmtTime(o.startAt)} to {fmtTime(o.endAt)}
            </li>
            <li className="flex items-center gap-2">
              <Users className="size-4 shrink-0 text-muted" />
              {ended ? 'This open house has ended' : seatsLeft ? `${seatsLeft} of ${o.capacity} seats left` : 'All seats are taken'}
            </li>
          </ul>
          {!ended && <ProgressBar value={(o.registrations.length / o.capacity) * 100} tone={seatsLeft ? 'ink' : 'accent'} className="mt-3 max-w-xs" />}
          <div className="mt-6">
            {listing && PUBLIC_LISTING_STATUSES.includes(listing.status) ? (
              <ListingCard listing={listing} />
            ) : project ? (
              <ProjectSummary projectId={project.id} />
            ) : null}
          </div>
        </div>
        <Card className="h-fit p-6">
          {ended || !seatsLeft ? (
            <EmptyState
              compact
              title={ended ? 'This open house has ended' : 'This open house is full'}
              description="Chat with Jessy or browse the properties to book a private viewing."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to={paths.assets}>View properties</Link>
                </Button>
              }
            />
          ) : (
            <RegisterForm openHouse={o} key={o.id} />
          )}
        </Card>
      </div>
    </SiteContainer>
  )
}

function ProjectSummary({ projectId }: { projectId: string }) {
  const { state } = useAppState()
  const p = state.projects.find((x) => x.id === projectId)!
  const counts = unitCounts(state.units.filter((u) => u.projectId === p.id))
  return (
    <Card variant="ink" className="p-5">
      <Kicker className="text-on-ink-muted">{PROJECT_KIND_LABEL[p.kind]}</Kicker>
      <h2 className="mt-1 font-semibold">{p.name}</h2>
      <p className="mt-1 flex items-center gap-1.5 text-sm text-on-ink-muted">
        <MapPin className="size-3.5 shrink-0" />
        {[p.district, p.city].filter(Boolean).join(', ')}
      </p>
      {p.description && <p className="mt-3 text-sm text-on-ink-muted">{p.description}</p>}
      <div className="mt-4 text-2xl font-bold tracking-tight tabular-nums">
        {counts.available}
        <span className="ml-1.5 text-sm font-semibold text-on-ink-muted">units available</span>
      </div>
    </Card>
  )
}

function RegisterForm({ openHouse }: { openHouse: OpenHouse }) {
  const { dispatch } = useAppState()
  const [f, setF] = useState({ name: '', phone: '' })
  const [tried, setTried] = useState(false)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const errors = {
    name: f.name.trim().length >= 2 ? null : 'Enter your name.',
    phone: f.phone.replace(/\D/g, '').length >= 9 ? null : 'Enter a full WhatsApp number, for example 0812 3456 7890.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  if (done) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success [&_svg]:size-6">
          <CircleCheck />
        </span>
        <h2 className="mt-4 text-lg font-semibold">See you there, {f.name.trim().split(' ')[0]}</h2>
        <p className="mt-1 max-w-xs text-sm text-muted">
          Your seat is saved for {fmtDateLong(openHouse.startAt)} at {fmtTime(openHouse.startAt)}. We will send a reminder to {f.phone.trim()} on WhatsApp.
        </p>
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.values(errors).some(Boolean)) return
        const registration = { id: newId('ohr'), name: f.name.trim(), phone: f.phone.trim(), at: nowIso(), attended: false }
        const refused = dispatch({ type: 'openHouses/register', id: openHouse.id, registration }, 'public')
        setBlocker(refused)
        if (!refused) setDone(true)
      }}
    >
      <h2 className="text-base font-semibold">Save your seat</h2>
      <div className="mt-4 space-y-4">
        <FormField label="Name" required error={show(errors.name)}>
          <Input autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </FormField>
        <FormField label="WhatsApp number" required error={show(errors.phone)}>
          <Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="0812 3456 7890" />
        </FormField>
      </div>
      {blocker && <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">{blocker}</p>}
      <Button type="submit" className="mt-6 w-full">
        Register
      </Button>
      <p className="mt-3 text-center text-xs text-muted">We use your number only for this open house.</p>
    </form>
  )
}
