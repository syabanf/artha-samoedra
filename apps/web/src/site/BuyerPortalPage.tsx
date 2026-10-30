import { contactByPhone, fmtDate, fmtDateTime, fmtIdr, normalizePhone, savedFor, toMs } from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, FormField, Input, Kicker, toast, type BadgeVariant } from '@artha/ui'
import { PAYMENT_KIND_LABEL, PAYMENT_STATUS_LABEL, VISIT_STATUS_LABEL, type PaymentStatus, type Visit, type VisitStatus } from '@artha/types'
import { CalendarClock, Heart, LogOut, MessageSquareText, Phone, Receipt, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { InquiryStatusBadge } from '../components/badges'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { usePersistentState } from '../lib/storage'
import { useAppState, useNow } from '../state/store'
import { ListingCard } from './ListingCard'
import { SiteContainer } from './SiteLayout'

/** The buyer's WhatsApp number, remembered on this device. The asset page reads it for the Save button. */
export const useBuyerPhone = () => usePersistentState<string>('buyerPhone', '')

const VISIT_VARIANT: Record<VisitStatus, BadgeVariant> = {
  scheduled: 'info',
  checked_in: 'warning',
  done: 'success',
  no_show: 'muted',
  cancelled: 'muted',
}
const PAYMENT_VARIANT: Record<PaymentStatus, BadgeVariant> = { pending: 'warning', paid: 'success', expired: 'muted', refunded: 'outline' }

export function BuyerPortalPage() {
  useDocumentMeta('My account · Artha Samoedra', 'Your saved properties, inquiries, site visits and payments with Artha Samoedra.')
  const [phone, setPhone] = useBuyerPhone()
  return (
    <SiteContainer className="pt-8">
      {phone ? <BuyerHome phone={phone} onSignOut={() => setPhone('')} /> : <SignIn onSignIn={setPhone} />}
    </SiteContainer>
  )
}

function SignIn({ onSignIn }: { onSignIn: (phone: string) => void }) {
  const { state } = useAppState()
  const [value, setValue] = useState('')
  const [tried, setTried] = useState(false)
  const error = normalizePhone(value).length < 9 ? 'Enter the full WhatsApp number you used with us.' : null
  const sample = state.savedProperties[0]?.phone
  return (
    <div className="mx-auto max-w-md">
      <Kicker>My account</Kicker>
      <h1 className="mt-2 font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">Sign in with your WhatsApp number</h1>
      <p className="mt-3 text-sm text-muted">
        See the properties you saved, your questions to our team, booked site visits and payments. No password needed.
        {sample && <> Demo number: {sample}.</>}
      </p>
      <Card className="mt-6 p-5">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (error) return
            onSignIn(normalizePhone(value))
          }}
          className="space-y-4"
        >
          <FormField label="WhatsApp number" required error={tried ? (error ?? undefined) : undefined}>
            <Input type="tel" inputMode="tel" autoComplete="tel" icon={<Phone />} placeholder="0812-3456-7890" value={value} onChange={(e) => setValue(e.target.value)} />
          </FormField>
          <Button type="submit" className="w-full">
            Open my account
          </Button>
        </form>
      </Card>
    </div>
  )
}

function BuyerHome({ phone, onSignOut }: { phone: string; onSignOut: () => void }) {
  const { state, dispatch } = useAppState()
  const now = useNow()
  const contact = contactByPhone(state, phone)
  const saved = savedFor(state, phone)
    .map((x) => state.listings.find((l) => l.id === x.listingId))
    .filter((l) => l !== undefined)
  const inquiries = state.inquiries.filter((i) => normalizePhone(i.phone) === phone).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const visits = contact ? state.visits.filter((v) => v.contactId === contact.id) : []
  const isUpcoming = (v: Visit) => (v.status === 'scheduled' || v.status === 'checked_in') && toMs(v.startAt) + v.durationMin * 60_000 >= now
  const upcoming = visits.filter(isUpcoming).sort((a, b) => a.startAt.localeCompare(b.startAt))
  const past = visits.filter((v) => !isUpcoming(v)).sort((a, b) => b.startAt.localeCompare(a.startAt))
  const payments = contact ? state.payments.filter((p) => p.contactId === contact.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : []
  const listingTitle = (id: string | null) => state.listings.find((l) => l.id === id)?.title
  const place = (v: Visit) => {
    const unit = state.units.find((u) => u.id === v.unitId)
    const project = unit && state.projects.find((p) => p.id === unit.projectId)
    return listingTitle(v.listingId) ?? (unit ? `${project?.name ?? 'Unit'} ${unit.code}` : 'Property to be confirmed')
  }
  const remove = (listingId: string, title: string) => {
    dispatch({ type: 'saved/toggle', phone, listingId }, 'public')
    toast('Removed from saved', { tone: 'success', description: title })
  }
  const browse = (
    <Button variant="outline" size="sm" asChild>
      <Link to={paths.assets}>Browse properties</Link>
    </Button>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Kicker>My account</Kicker>
          <h1 className="mt-1 font-display text-3xl font-medium tracking-tight sm:text-4xl">{contact ? `Hello, ${contact.name.split(' ')[0]}` : 'Your property account'}</h1>
          <p className="mt-1 text-sm text-muted">Signed in as {phone}</p>
        </div>
        <Button variant="outline" onClick={onSignOut}>
          <LogOut />
          Sign out
        </Button>
      </div>

      <section aria-labelledby="saved-heading">
        <h2 id="saved-heading" className="mb-3 flex items-center gap-2 text-lg font-bold tracking-tight">
          <Heart className="size-4 text-accent" />
          Saved properties
        </h2>
        {saved.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {saved.map((l) => (
              <div key={l.id} className="relative">
                <ListingCard listing={l} />
                <Button variant="card" size="icon-sm" aria-label={`Remove ${l.title} from saved`} className="absolute right-3 top-3 z-10" onClick={() => remove(l.id, l.title)}>
                  <X />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState compact icon={<Heart />} title="No saved properties yet" description="Tap Save on any property page to keep it here." action={browse} />
          </Card>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section title="Upcoming site visits" icon={<CalendarClock />}>
          {upcoming.length ? (
            <ul className="divide-y divide-border">
              {upcoming.map((v) => (
                <VisitRow key={v.id} visit={v} place={place(v)} agent={state.users.find((u) => u.id === v.agentId)?.name} />
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No visits booked" description="Pick a property and ask Jessy to book a site visit." action={browse} />
          )}
        </Section>

        <Section title="Your questions" icon={<MessageSquareText />}>
          {inquiries.length ? (
            <ul className="divide-y divide-border">
              {inquiries.map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{listingTitle(i.listingId) ?? 'General question'}</div>
                    <p className="line-clamp-2 text-xs text-muted">{i.message}</p>
                    <div className="mt-1 font-mono text-[11px] text-muted">
                      {i.code} · {fmtDate(i.createdAt)}
                    </div>
                  </div>
                  <InquiryStatusBadge status={i.status} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No questions yet" description="Ask about any property and our team replies on WhatsApp." action={browse} />
          )}
        </Section>

        <Section title="Payments" icon={<Receipt />}>
          {payments.length ? (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{PAYMENT_KIND_LABEL[p.kind]}</div>
                    <div className="font-mono text-[11px] text-muted">
                      {p.code} · {fmtDate(p.paidAt ?? p.createdAt)}
                    </div>
                    {p.status === 'pending' && p.expiresAt && <div className="mt-1 text-xs text-warning">Pay before {fmtDateTime(p.expiresAt)}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-sm font-bold tabular-nums">{fmtIdr(p.amount)}</span>
                    <Badge variant={PAYMENT_VARIANT[p.status]}>{PAYMENT_STATUS_LABEL[p.status]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No payments" description="Booking fees and deposits show here once our team sends a payment request." action={browse} />
          )}
        </Section>

        <Section title="Past site visits" icon={<CalendarClock />}>
          {past.length ? (
            <ul className="divide-y divide-border">
              {past.map((v) => (
                <VisitRow key={v.id} visit={v} place={place(v)} agent={state.users.find((u) => u.id === v.agentId)?.name} />
              ))}
            </ul>
          ) : (
            <EmptyState compact title="No past visits" description="Visits you have made show here with their outcome." action={browse} />
          )}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-muted">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function VisitRow({ visit: v, place, agent }: { visit: Visit; place: string; agent?: string }) {
  return (
    <li className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{place}</div>
        <div className="text-xs text-muted">
          {fmtDateTime(v.startAt)} · {v.durationMin} min{agent && ` · with ${agent}`}
        </div>
      </div>
      <Badge variant={VISIT_VARIANT[v.status]}>{VISIT_STATUS_LABEL[v.status]}</Badge>
    </li>
  )
}
