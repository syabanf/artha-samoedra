import { fmtDate, fmtIdr, fmtIdrShort, fromDateInput, nowMs, parseBudget, toDateInput } from '@artha/fixtures'
import { Button, Card, EmptyState, FormField, Input, Kicker } from '@artha/ui'
import { PUBLIC_LISTING_STATUSES } from '@artha/types'
import { CircleCheck, MapPin } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { useAppState } from '../state/store'
import { SiteContainer } from './SiteLayout'

export function PublicFormPage() {
  const { slug } = useParams()
  const { state } = useAppState()
  const form = state.leadForms.find((f) => f.slug === slug)
  const open = form?.active ? form : undefined
  useDocumentMeta(open ? `${open.headline} · Artha Samoedra` : 'Form closed · Artha Samoedra', open?.headline)

  if (!open) {
    return (
      <SiteContainer className="pt-10">
        <Card>
          <EmptyState
            title={form ? 'This form is closed' : 'Form not found'}
            description={form ? 'Registration has ended. Browse the properties on offer or chat with Jessy.' : 'The link may be mistyped or the form has been removed.'}
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

  const listing = state.listings.find((l) => l.id === open.listingId)
  const live = listing && PUBLIC_LISTING_STATUSES.includes(listing.status)

  return (
    <SiteContainer className="pt-8">
      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="min-w-0">
          <Kicker>Register</Kicker>
          <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
            {open.headline}
            <span className="text-accent">.</span>
          </h1>
          <p className="mt-3 max-w-md text-sm text-muted">Leave your name and WhatsApp number. Our team replies within one working day.</p>
          {listing && (
            <Card variant="ink" className="mt-6 p-5">
              <Kicker className="text-on-ink-muted">{listing.code}</Kicker>
              <h2 className="mt-1 font-semibold">{listing.title}</h2>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-on-ink-muted">
                <MapPin className="size-3.5" />
                {listing.district}, {listing.city}
              </p>
              <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
                <span className="text-2xl font-bold tracking-tight tabular-nums">{fmtIdrShort(listing.price)}</span>
                {live && (
                  <Link to={paths.asset(listing.slug)} className="text-sm font-semibold underline-offset-4 hover:underline">
                    View property
                  </Link>
                )}
              </div>
            </Card>
          )}
        </div>
        <Card className="p-6">
          <SubmitForm formId={open.id} askBudget={open.askBudget} askVisitDate={open.askVisitDate} key={open.id} />
        </Card>
      </div>
    </SiteContainer>
  )
}

function SubmitForm({ formId, askBudget, askVisitDate }: { formId: string; askBudget: boolean; askVisitDate: boolean }) {
  const { dispatch } = useAppState()
  const [f, setF] = useState({ name: '', phone: '', budget: '', visit: '' })
  const [tried, setTried] = useState(false)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const budget = f.budget ? (parseBudget(f.budget) ?? (Number(f.budget.replace(/\D/g, '')) || null)) : null
  const today = toDateInput(new Date(nowMs()).toISOString())
  const errors = {
    name: f.name.trim().length >= 2 ? null : 'Enter your name.',
    phone: f.phone.replace(/\D/g, '').length >= 9 ? null : 'Enter a full WhatsApp number, for example 0812 3456 7890.',
    budget: !f.budget || budget ? null : 'Enter a budget, for example 1.5 B or 800 M.',
    visit: !f.visit || f.visit >= today ? null : 'Pick a date from today on.',
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  if (done) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success [&_svg]:size-6">
          <CircleCheck />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Thank you, {f.name.trim().split(' ')[0]}</h2>
        <p className="mt-1 max-w-xs text-sm text-muted">We received your details. Our team will message you on WhatsApp at {f.phone.trim()}.</p>
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
        const message = f.visit ? `Would like to visit on ${fmtDate(fromDateInput(f.visit))}.` : ''
        const refused = dispatch({ type: 'forms/submit', formId, name: f.name, phone: f.phone, budget, message }, 'public')
        setBlocker(refused)
        if (!refused) setDone(true)
      }}
    >
      <h2 className="text-base font-semibold">Your details</h2>
      <div className="mt-4 space-y-4">
        <FormField label="Name" required error={show(errors.name)}>
          <Input autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </FormField>
        <FormField label="WhatsApp number" required error={show(errors.phone)}>
          <Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="0812 3456 7890" />
        </FormField>
        {askBudget && (
          <FormField label="Budget" error={show(errors.budget)} hint={budget ? fmtIdr(budget) : 'Optional, for example 1.5 B or 800 M'}>
            <Input value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} />
          </FormField>
        )}
        {askVisitDate && (
          <FormField label="Preferred visit date" error={show(errors.visit)} hint="Optional">
            <Input type="date" min={today} value={f.visit} onChange={(e) => setF({ ...f, visit: e.target.value })} />
          </FormField>
        )}
      </div>
      {blocker && <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">{blocker}</p>}
      <Button type="submit" className="mt-6 w-full">
        Send
      </Button>
      <p className="mt-3 text-center text-xs text-muted">We use your number only to answer this request.</p>
    </form>
  )
}
