import { countBy, fmtDate, fmtFileSize, hiredCount, newId, newShareToken, nowIso } from '@artha/fixtures'
import { EMPLOYMENT_TYPE_LABEL, type JobOpening } from '@artha/types'
import { Button, Card, Chip, ChipRow, cn, EmptyState, FOCUS, FormField, Input, Kicker, Textarea } from '@artha/ui'
import { ArrowRight, ArrowUpRight, Briefcase, Building2, CircleCheck, FileText, MapPin, Paperclip, Users, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { useSetParam } from '../lib/useSetParam'
import { useAppState } from '../state/store'
import { FadeImage, Reveal } from './motion'
import { SiteContainer } from './SiteLayout'

const CV_LIMIT = 1024 * 1024

const REASONS = [
  ['Leads come to you', 'Jessy, our AI agent, answers buyers day and night and passes you the ones ready to visit.'],
  ['Commission in writing', 'Every listing carries its profit share before you show it, so you know what a deal pays.'],
  ['Learn on live deals', 'Check certificates, run open houses and sit with the notary next to senior agents from week one.'],
] as const

function useOpeningInfo() {
  const { state } = useAppState()
  const dept = (o: JobOpening) => state.departments.find((d) => d.id === o.departmentId)?.name ?? 'Team'
  const branch = (o: JobOpening) => state.branches.find((b) => b.id === o.branchId)?.name ?? 'Office'
  const seats = (o: JobOpening) => Math.max(0, o.headcount - hiredCount(state, o.id))
  return { state, dept, branch, seats }
}

function OpeningFacts({ opening: o, className }: { opening: JobOpening; className?: string }) {
  const { dept, branch, seats } = useOpeningInfo()
  const n = seats(o)
  const facts = [
    [Building2, dept(o)],
    [Briefcase, EMPLOYMENT_TYPE_LABEL[o.type]],
    [MapPin, branch(o)],
    [Users, `${n} ${n === 1 ? 'seat' : 'seats'}`],
  ] as const
  return (
    <ul className={cn('flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted', className)}>
      {facts.map(([Icon, text]) => (
        <li key={text} className="flex min-w-0 items-center gap-1.5">
          <Icon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{text}</span>
        </li>
      ))}
    </ul>
  )
}

export function CareersPage() {
  useDocumentMeta('Careers · Artha Samoedra', 'Open roles at Artha Samoedra: sales agents, marketing and back office across Java and Bali. Apply online and follow your application.')
  const { state, dept } = useOpeningInfo()
  const { params, set } = useSetParam()
  const open = state.jobOpenings.filter((o) => o.status === 'open').sort((a, b) => (b.openedAt ?? '').localeCompare(a.openedAt ?? ''))
  const counts = countBy(open, (o) => o.departmentId)
  const depts = state.departments.filter((d) => counts[d.id])
  const active = depts.some((d) => d.id === params.get('dept')) ? params.get('dept') : null
  const shown = active ? open.filter((o) => o.departmentId === active) : open

  return (
    <SiteContainer className="pt-10">
      <Kicker>Careers</Kicker>
      <h1 className="mt-2 max-w-3xl font-display text-4xl font-medium leading-tight tracking-tight sm:text-6xl">
        Sell, write and build with us<span className="text-accent">.</span>
      </h1>
      <p className="mt-4 max-w-xl text-sm text-muted sm:text-base">
        We sell and rent homes, land and shops across Java and Bali. Apply in five minutes, then follow every step of your application on your own page.
      </p>

      <section aria-labelledby="roles-heading" className="mt-12">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="roles-heading" className="font-display text-3xl font-medium tracking-tight">
            Open roles
          </h2>
          <span className="text-sm text-muted">
            {open.length} {open.length === 1 ? 'role' : 'roles'} open
          </span>
        </div>
        {depts.length > 1 && (
          <ChipRow className="mt-4" aria-label="Filter by department">
            <Chip active={!active} count={open.length} onClick={() => set('dept', null)}>
              All
            </Chip>
            {depts.map((d) => (
              <Chip key={d.id} active={active === d.id} count={counts[d.id]} onClick={() => set('dept', d.id)}>
                {d.name}
              </Chip>
            ))}
          </ChipRow>
        )}
        {shown.length ? (
          <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            {shown.map((o, i) => (
              <Reveal as="li" key={o.id} delay={(i % 2) * 100}>
                <Link
                  to={paths.career(o.code)}
                  className={cn('group flex h-full flex-col rounded-card bg-card p-6 shadow-card motion-safe:transition-transform motion-safe:hover:-translate-y-0.5', FOCUS)}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold uppercase tracking-wider text-muted">{dept(o)}</span>
                      <span className="mt-1 block text-xl font-semibold tracking-tight">{o.title}</span>
                    </span>
                    <ArrowUpRight className="size-5 shrink-0 text-muted motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
                  </span>
                  <span className="mt-3 line-clamp-2 text-sm text-body">{o.description}</span>
                  <OpeningFacts opening={o} className="mt-auto pt-5" />
                </Link>
              </Reveal>
            ))}
          </ul>
        ) : (
          <Card className="mt-6">
            <EmptyState
              title="No open roles right now"
              description="We post new roles here first. Check back soon, or follow us for the next opening."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to={paths.home}>Back to the home page</Link>
                </Button>
              }
            />
          </Card>
        )}
      </section>

      <section aria-labelledby="why-heading" className="mt-16 grid grid-cols-1 gap-6 rounded-hero bg-card p-6 shadow-card sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center lg:gap-12">
        <Reveal variant="clip" className="shimmer overflow-hidden rounded-hero bg-surface-2">
          <FadeImage src="/landing/showcase.jpg" alt="An Artha Samoedra agent showing a living room to buyers" loading="lazy" className="aspect-[4/3] w-full object-cover" />
        </Reveal>
        <div className="min-w-0">
          <Kicker>Why join</Kicker>
          <h2 id="why-heading" className="mt-2 font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">
            Good tools, clear pay, real deals
          </h2>
          <ol className="mt-6 space-y-5">
            {REASONS.map(([title, text], i) => (
              <Reveal as="li" key={title} delay={i * 120} className="flex gap-5 border-t border-border pt-5">
                <span className="text-2xl font-semibold leading-none text-accent tabular-nums">0{i + 1}</span>
                <span className="min-w-0">
                  <span className="block font-semibold">{title}</span>
                  <span className="mt-1 block text-sm text-muted">{text}</span>
                </span>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>
    </SiteContainer>
  )
}

export function CareerOpeningPage() {
  const { code = '' } = useParams()
  const { state, dept } = useOpeningInfo()
  const found = state.jobOpenings.find((o) => o.code.toLowerCase() === code.toLowerCase() && o.status !== 'draft')
  const opening = found?.status === 'open' ? found : undefined
  useDocumentMeta(opening ? `${opening.title} · Careers · Artha Samoedra` : 'Role closed · Careers · Artha Samoedra', opening?.description.slice(0, 150))

  if (!opening) {
    return (
      <SiteContainer className="pt-10">
        <h1 className="sr-only">{found ? 'This role has closed' : 'Role not found'}</h1>
        <Card>
          <EmptyState
            title={found ? 'This role has closed' : 'Role not found'}
            description={found ? `We are no longer taking applications for ${found.title}. See the roles open now.` : 'The link may be mistyped or the role was removed.'}
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to={paths.careers}>See open roles</Link>
              </Button>
            }
          />
        </Card>
      </SiteContainer>
    )
  }

  return (
    <SiteContainer className="pt-6">
      <nav aria-label="Breadcrumb" className="mb-6 text-xs text-muted">
        <Link to={paths.careers} className="hover:text-foreground hover:underline">
          Careers
        </Link>
        <span className="mx-1.5">/</span>
        <span aria-current="page" className="font-medium text-foreground">
          {opening.code}
        </span>
      </nav>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-12">
        <div className="min-w-0">
          <Kicker>{dept(opening)}</Kicker>
          <h1 className="mt-2 font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">{opening.title}</h1>
          <OpeningFacts opening={opening} className="mt-4 text-sm" />
          {opening.openedAt && <p className="mt-2 text-xs text-muted">Posted {fmtDate(opening.openedAt)}</p>}
          <h2 className="mt-10 text-lg font-semibold">The role</h2>
          <p className="mt-2 max-w-prose whitespace-pre-line text-body">{opening.description}</p>
          <h2 className="mt-10 text-lg font-semibold">How we hire</h2>
          <ol className="mt-3 grid max-w-prose grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              ['Apply', 'Send your details and CV. You get a link to your own application page.'],
              ['Screening', 'HR reads your CV within five working days.'],
              ['Test', 'A short online test you take from your application page.'],
              ['Interview and offer', 'Confirm the interview time and answer the offer on the same page.'],
            ].map(([title, text], i) => (
              <li key={title} className="rounded-card bg-card p-4 shadow-card">
                <span className="text-xs font-semibold text-accent tabular-nums">0{i + 1}</span>
                <span className="mt-1 block text-sm font-semibold">{title}</span>
                <span className="mt-1 block text-xs text-muted">{text}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <Card className="p-6">
            <ApplyForm opening={opening} key={opening.id} />
          </Card>
        </div>
      </div>
    </SiteContainer>
  )
}

function ApplyForm({ opening }: { opening: JobOpening }) {
  const { dispatch } = useAppState()
  const [f, setF] = useState({ name: '', email: '', phone: '', note: '' })
  const [cv, setCv] = useState<{ name: string; size: number } | null>(null)
  const [tried, setTried] = useState(false)
  const [blocker, setBlocker] = useState<string | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const errors = {
    name: f.name.trim().length >= 2 ? null : 'Enter your full name.',
    email: /^\S+@\S+\.\S+$/.test(f.email.trim()) ? null : 'Enter an email, for example nama@gmail.com.',
    phone: /^\d{9,14}$/.test(f.phone.replace(/\D/g, '')) ? null : 'Enter a phone number we can call, for example 0812 3456 7890.',
    cv: !cv ? 'Attach your CV.' : cv.size > CV_LIMIT ? `This file is ${fmtFileSize(cv.size)}. Attach a CV of 1 MB or smaller.` : null,
  }
  const show = (m: string | null) => (tried ? (m ?? undefined) : undefined)

  if (token) {
    return (
      <div className="flex flex-col items-center py-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success-soft text-success [&_svg]:size-6">
          <CircleCheck />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Thank you, {f.name.trim().split(' ')[0]}</h2>
        <p className="mt-1 max-w-xs text-sm text-muted">
          We received your application for {opening.title}. Keep the link to your application page: tests, interviews and the offer show up there.
        </p>
        <Button className="mt-6" asChild>
          <Link to={paths.candidatePortal(token)}>
            Open my application <ArrowRight />
          </Link>
        </Button>
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
        const next = newShareToken()
        const refused = dispatch(
          {
            type: 'candidates/apply',
            candidate: {
              id: newId('cnd'),
              name: f.name.trim(),
              email: f.email.trim(),
              phone: f.phone.trim(),
              openingId: opening.id,
              stage: 'applied',
              source: 'website',
              rating: 0,
              tags: [],
              cvName: cv!.name,
              notes: f.note.trim(),
              tests: [],
              interviews: [],
              offer: null,
              employeeId: null,
              rejectReason: '',
              appliedAt: nowIso(),
              token: next,
              assignedTestIds: [],
            },
          },
          'public',
        )
        setBlocker(refused)
        if (!refused) setToken(next)
      }}
    >
      <h2 className="text-base font-semibold">Apply for this role</h2>
      <div className="mt-4 space-y-4">
        <FormField label="Full name" required error={show(errors.name)}>
          <Input autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </FormField>
        <FormField label="Email" required error={show(errors.email)}>
          <Input type="email" inputMode="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </FormField>
        <FormField label="Phone or WhatsApp" required error={show(errors.phone)}>
          <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="0812 3456 7890" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </FormField>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-foreground">
            CV<span className="ml-0.5 text-accent">*</span>
          </span>
          {cv ? (
            <div className="flex items-center gap-2 rounded-2xl border border-border px-3 py-2.5 text-sm">
              <FileText className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{cv.name}</span>
              <span className="shrink-0 text-xs text-muted">{fmtFileSize(cv.size)}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove the CV" onClick={() => setCv(null)}>
                <X />
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted transition-colors hover:bg-surface-2 focus-within:ring-2 focus-within:ring-accent">
              <Paperclip className="size-4 shrink-0" aria-hidden />
              Attach a PDF or Word file, 1 MB or smaller
              <input
                type="file"
                accept=".pdf,.doc,.docx,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) setCv({ name: file.name, size: file.size })
                }}
              />
            </label>
          )}
          {show(errors.cv) && <p className="mt-1 text-xs text-danger">{errors.cv}</p>}
        </div>
        <FormField label="Note to HR" hint="Optional. Tell us when you can start or why this role fits you.">
          <Textarea className="min-h-24" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        </FormField>
      </div>
      {blocker && <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">{blocker}</p>}
      <Button type="submit" className="mt-6 w-full">
        Send application
      </Button>
      <p className="mt-3 text-center text-xs text-muted">We keep your CV for this role and our talent pool only.</p>
    </form>
  )
}
