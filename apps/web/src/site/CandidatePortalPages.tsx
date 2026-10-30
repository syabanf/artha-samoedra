import { candidateByToken, fmtDate, fmtDateTime, fmtIdr, testsDue, toMs } from '@artha/fixtures'
import { CANDIDATE_STAGE_LABEL, EMPLOYMENT_TYPE_LABEL, type Candidate, type CandidateStage, type Interview, type PsychTest } from '@artha/types'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, cn, EmptyState, FOCUS, FormField, Kicker, ProgressBar, Textarea, toast } from '@artha/ui'
import { ArrowLeft, ArrowRight, CalendarClock, Check, CircleCheck, ClipboardList, Clock, MapPin, Video } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { useAppState, useNow } from '../state/store'
import { SiteContainer } from './SiteLayout'

const STEPS: CandidateStage[] = ['applied', 'screening', 'test', 'interview', 'offer']

/** Public pages answer as the candidate; the store returns the blocker sentence or null. */
function usePublicAct() {
  const { dispatch } = useAppState()
  return (action: Parameters<typeof dispatch>[0], success: string) => {
    const refused = dispatch(action, 'public')
    if (refused) toast('Could not send', { tone: 'danger', description: refused })
    else toast(success, { tone: 'success' })
    return !refused
  }
}

function PortalNotFound({ title, description, back }: { title: string; description: string; back?: string }) {
  return (
    <SiteContainer className="pt-10">
      <h1 className="sr-only">{title}</h1>
      <Card>
        <EmptyState
          title={title}
          description={description}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to={back ?? paths.careers}>{back ? 'Back to my application' : 'See open roles'}</Link>
            </Button>
          }
        />
      </Card>
    </SiteContainer>
  )
}

const firstName = (c: Candidate) => c.name.trim().split(' ')[0]

export function CandidatePortalPage() {
  const { token = '' } = useParams()
  const { state } = useAppState()
  const now = useNow()
  const c = candidateByToken(state, token)
  useDocumentMeta(c ? 'My application · Careers · Artha Samoedra' : 'Application not found · Artha Samoedra')
  if (!c) return <PortalNotFound title="Application not found" description="This link does not match an application. Check the link in your email, or apply for an open role." />

  const opening = state.jobOpenings.find((o) => o.id === c.openingId)
  const due = c.stage === 'rejected' ? [] : testsDue(state, c)
  const taken = c.tests.map((t) => ({ ...t, test: state.psychTests.find((p) => p.id === t.testId) })).filter((t) => c.assignedTestIds?.includes(t.testId))
  const interviews = [...c.interviews].sort((a, b) => a.at.localeCompare(b.at))
  const offer = c.offer && c.offer.status !== 'draft' ? c.offer : null
  const closed = c.stage === 'rejected'

  return (
    <SiteContainer className="pt-8">
      <div className="mx-auto max-w-3xl">
        <Kicker>My application</Kicker>
        <h1 className="mt-2 font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">
          Hi {firstName(c)}
          <span className="text-accent">.</span>
        </h1>
        <p className="mt-3 text-sm text-muted sm:text-base">
          {opening ? (
            <>
              You applied for <span className="font-semibold text-foreground">{opening.title}</span> on {fmtDate(c.appliedAt)}.
            </>
          ) : (
            <>Your profile is in our talent pool since {fmtDate(c.appliedAt)}.</>
          )}
        </p>

        {closed ? (
          <Card className="mt-8 p-6">
            <h2 className="font-display text-2xl font-medium tracking-tight">Thank you for your time</h2>
            <p className="mt-3 text-sm text-body">
              We chose another candidate for this role. Thank you for applying and for the time you gave us. We keep your profile in our talent pool and will contact you when a role fits your experience.
            </p>
            <Button variant="outline" size="sm" className="mt-5" asChild>
              <Link to={paths.careers}>See other open roles</Link>
            </Button>
          </Card>
        ) : (
          <>
            <StageTimeline stage={c.stage} />
            {c.stage === 'hired' && (
              <Card variant="ink" className="mt-4 p-6">
                <h2 className="text-xl font-semibold">Welcome to the team</h2>
                <p className="mt-2 text-sm text-on-ink-muted">HR will send your first-day details by email before you start.</p>
              </Card>
            )}
            {offer && <OfferCard candidate={c} />}
            {(due.length > 0 || taken.length > 0) && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Tests</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {due.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <TestLine test={t} detail={`${t.questions.length} questions · about ${t.minutes} min`} />
                        <Button size="sm" asChild>
                          <Link to={paths.candidateTest(token, t.id)}>
                            Start test <ArrowRight />
                          </Link>
                        </Button>
                      </li>
                    ))}
                    {taken.map((t) => (
                      <li key={t.testId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        {t.test && <TestLine test={t.test} detail={`Taken ${fmtDate(t.takenAt)}`} />}
                        <Badge variant="success">
                          <Check aria-hidden /> Done
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {interviews.length > 0 && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle>Interviews</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border">
                    {interviews.map((i) => (
                      <InterviewRow key={i.id} candidate={c} interview={i} upcoming={toMs(i.at) >= now} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {!offer && !due.length && !interviews.length && c.stage !== 'hired' && (
              <Card className="mt-4">
                <EmptyState compact icon={<ClipboardList />} title="Nothing to do right now" description="HR reviews new applications within five working days. Tests and interview times will show up here." />
              </Card>
            )}
          </>
        )}
        <p className="mt-8 text-center text-xs text-muted">Keep this link private. Anyone with it can see and answer for your application.</p>
      </div>
    </SiteContainer>
  )
}

function StageTimeline({ stage }: { stage: CandidateStage }) {
  const at = stage === 'hired' ? STEPS.length : STEPS.indexOf(stage)
  return (
    <ol aria-label="Application progress" className="mt-8 grid grid-cols-5 gap-1.5 sm:gap-2">
      {STEPS.map((s, i) => {
        const state = i < at ? 'done' : i === at ? 'now' : 'next'
        return (
          <li key={s} aria-current={state === 'now' ? 'step' : undefined} className="min-w-0">
            <span className={cn('block h-1.5 rounded-full', state === 'next' ? 'bg-border' : 'bg-accent')} />
            <span className={cn('mt-2 flex items-center gap-1 text-[11px] font-semibold sm:text-xs', state === 'next' ? 'text-muted' : 'text-foreground')}>
              {state === 'done' && <Check className="hidden size-3.5 shrink-0 text-accent sm:block" aria-hidden />}
              <span className="truncate">{CANDIDATE_STAGE_LABEL[s]}</span>
            </span>
            {state === 'now' && <span className="mt-0.5 hidden text-xs text-muted sm:block">You are here</span>}
          </li>
        )
      })}
    </ol>
  )
}

function TestLine({ test, detail }: { test: PsychTest; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="font-semibold">{test.name}</div>
      <div className="text-xs text-muted">{detail}</div>
    </div>
  )
}

function InterviewRow({ candidate: c, interview: i, upcoming }: { candidate: Candidate; interview: Interview; upcoming: boolean }) {
  const act = usePublicAct()
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const r = i.response
  const noteError = note.trim() ? undefined : 'Suggest a day and time that work for you.'
  const respond = (kind: 'confirmed' | 'reschedule') =>
    act({ type: 'candidates/respondInterview', id: c.id, interviewId: i.id, kind, note: kind === 'reschedule' ? note : '' }, kind === 'confirmed' ? 'Interview confirmed' : 'Request sent to HR')

  return (
    <li className="space-y-3 py-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-body [&_svg]:size-4">{i.mode === 'video' ? <Video /> : <MapPin />}</span>
          <div className="min-w-0">
            <div className="font-semibold">{fmtDateTime(i.at)}</div>
            <div className="text-xs text-muted">{i.mode === 'video' ? 'Video call' : 'At our office'}</div>
            {i.mode === 'video' && i.link && upcoming && (
              <a href={i.link} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs font-medium text-accent hover:underline">
                {i.link}
              </a>
            )}
          </div>
        </div>
        {!upcoming ? <Badge variant="muted">Done</Badge> : r && <Badge variant={r.kind === 'confirmed' ? 'success' : 'warning'}>{r.kind === 'confirmed' ? 'Confirmed' : 'Reschedule asked'}</Badge>}
      </div>
      {upcoming && r && !asking && (
        <p className="rounded-2xl bg-surface px-3 py-2 text-xs text-body">
          {r.kind === 'confirmed' ? `You confirmed on ${fmtDate(r.at)}.` : `You asked for another time on ${fmtDate(r.at)}: "${r.note}". HR will reply by email.`}
        </p>
      )}
      {upcoming && !asking && (
        <div className="flex flex-wrap gap-2">
          {r?.kind !== 'confirmed' && (
            <Button size="sm" onClick={() => respond('confirmed')}>
              <CircleCheck />
              Confirm
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
            <CalendarClock />
            {r?.kind === 'reschedule' ? 'Change my request' : 'Ask to reschedule'}
          </Button>
        </div>
      )}
      {upcoming && asking && (
        <form
          noValidate
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            setTried(true)
            if (noteError) return
            if (respond('reschedule')) setAsking(false)
          }}
        >
          <FormField label="When can you come instead?" required error={tried ? noteError : undefined}>
            <Textarea className="min-h-20" placeholder="For example: Thursday after 13.00, or any morning next week." value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit">
              Send request
            </Button>
            <Button size="sm" type="button" variant="ghost" onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </li>
  )
}

function OfferCard({ candidate: c }: { candidate: Candidate }) {
  const act = usePublicAct()
  const [note, setNote] = useState('')
  const o = c.offer!
  const answered = o.status === 'accepted' || o.status === 'declined'
  return (
    <Card variant="ink" className="mt-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Kicker className="text-on-ink-muted">Your offer</Kicker>
          <div className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{fmtIdr(o.salary)}</div>
          <div className="text-xs text-on-ink-muted">gross salary a month</div>
        </div>
        {answered && <Badge variant={o.status === 'accepted' ? 'success' : 'muted'}>{o.status === 'accepted' ? 'Accepted' : 'Declined'}</Badge>}
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-2xl bg-white/5 p-3">
          <dt className="text-xs text-on-ink-muted">Start date</dt>
          <dd className="font-semibold">{fmtDate(o.startsOn)}</dd>
        </div>
        <div className="rounded-2xl bg-white/5 p-3">
          <dt className="text-xs text-on-ink-muted">Contract</dt>
          <dd className="font-semibold">{EMPLOYMENT_TYPE_LABEL[o.type]}</dd>
        </div>
      </dl>
      {answered ? (
        <p className="mt-5 text-sm text-on-ink-muted">
          You {o.status} this offer{o.answeredAt ? ` on ${fmtDate(o.answeredAt)}` : ''}.{o.answerNote ? ` Your note: "${o.answerNote}"` : ''}
          {o.status === 'accepted' && ' HR will send the contract to sign before your start date.'}
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium" htmlFor="offer-note">
            Note to HR <span className="font-normal text-on-ink-muted">(optional)</span>
          </label>
          <Textarea id="offer-note" className="min-h-20" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Questions about the start date or anything else." />
          <div className="flex flex-wrap gap-2">
            <Button className="bg-card text-foreground shadow-none hover:bg-surface" onClick={() => act({ type: 'candidates/respondOffer', id: c.id, accept: true, note }, 'Offer accepted')}>
              <CircleCheck />
              Accept offer
            </Button>
            <Button variant="onInk" onClick={() => act({ type: 'candidates/respondOffer', id: c.id, accept: false, note }, 'Offer declined')}>
              Decline
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------- test

export function CandidateTestPage() {
  const { token = '', testId = '' } = useParams()
  const { state } = useAppState()
  const c = candidateByToken(state, token)
  const test = state.psychTests.find((t) => t.id === testId)
  const assigned = !!c && !!test && !!c.assignedTestIds?.includes(test.id)
  useDocumentMeta(assigned ? `${test.name} · Careers · Artha Samoedra` : 'Test not found · Artha Samoedra')
  if (!c) return <PortalNotFound title="Application not found" description="This link does not match an application. Check the link in your email." />
  if (!assigned) return <PortalNotFound title="Test not found" description="This test is not on your list. Open your application page to see the tests you were given." back={paths.candidatePortal(token)} />
  return <TestRunner candidate={c} test={test} key={test.id} />
}

function TestRunner({ candidate: c, test }: { candidate: Candidate; test: PsychTest }) {
  const { dispatch } = useAppState()
  const result = c.tests.find((t) => t.testId === test.id)
  const [answers, setAnswers] = useState<number[]>(() => test.questions.map(() => -1))
  const [step, setStep] = useState(0)
  const [blocker, setBlocker] = useState<string | null>(null)
  const q = test.questions[step]
  const last = step === test.questions.length - 1
  const picked = answers[step] >= 0
  const pickFirst = picked ? undefined : 'Pick an answer first.'

  const frame = (body: ReactNode) => (
    <SiteContainer className="pt-6">
      <div className="mx-auto max-w-2xl">
        <Link to={paths.candidatePortal(c.token!)} className={cn('inline-flex items-center gap-1.5 rounded-full text-xs font-semibold text-muted hover:text-foreground', FOCUS)}>
          <ArrowLeft className="size-3.5" />
          My application
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <Kicker>Online test</Kicker>
            <h1 className="mt-1 font-display text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{test.name}</h1>
          </div>
          {!result && <Countdown minutes={test.minutes} />}
        </div>
        {body}
      </div>
    </SiteContainer>
  )

  if (result) {
    const pass = result.score >= test.passMark
    return frame(
      <Card className="mt-6 p-6 text-center">
        <span className={cn('mx-auto flex size-12 items-center justify-center rounded-full [&_svg]:size-6', pass ? 'bg-success-soft text-success' : 'bg-surface text-body')}>
          <CircleCheck />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Test submitted</h2>
        <div className="mt-4 text-5xl font-semibold tracking-tight tabular-nums">
          {result.score}
          <span className="text-xl text-muted">/100</span>
        </div>
        <p className="mt-2 text-sm text-muted">
          Pass mark {test.passMark}. {pass ? 'You passed. HR will contact you about the next step.' : 'HR reviews every result together with your CV and will contact you either way.'}
        </p>
        <Button variant="outline" className="mt-6" asChild>
          <Link to={paths.candidatePortal(c.token!)}>Back to my application</Link>
        </Button>
      </Card>,
    )
  }

  return frame(
    <Card className="mt-6 p-6">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-muted">
        <span>
          Question {step + 1} of {test.questions.length}
        </span>
        <span>{answers.filter((a) => a >= 0).length} answered</span>
      </div>
      <ProgressBar value={((step + 1) / test.questions.length) * 100} tone="accent" className="mt-2" />
      <fieldset className="mt-6 min-w-0">
        <legend className="text-lg font-semibold leading-snug">{q.q}</legend>
        <div role="radiogroup" className="mt-4 grid grid-cols-1 gap-2">
          {q.options.map((opt, i) => {
            const on = answers[step] === i
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setAnswers(answers.map((a, j) => (j === step ? i : a)))}
                className={cn(
                  'flex min-h-12 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition-colors',
                  on ? 'border-accent bg-accent-soft font-semibold text-foreground' : 'border-border bg-card hover:bg-surface',
                  FOCUS,
                )}
              >
                <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold', on ? 'border-accent bg-accent text-white' : 'border-border text-muted')}>
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="min-w-0">{opt}</span>
              </button>
            )
          })}
        </div>
      </fieldset>
      {blocker && <p className="mt-4 rounded-xl bg-accent-soft px-3 py-2 text-xs font-medium text-accent-strong">{blocker}</p>}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" disabled={step === 0} title={step === 0 ? 'This is the first question.' : undefined} onClick={() => setStep(step - 1)}>
          <ArrowLeft />
          Back
        </Button>
        {last ? (
          <Button
            disabled={!picked}
            title={pickFirst}
            onClick={() => {
              const refused = dispatch({ type: 'candidates/takeTest', id: c.id, testId: test.id, answers }, 'public')
              setBlocker(refused)
            }}
          >
            Submit answers
          </Button>
        ) : (
          <Button disabled={!picked} title={pickFirst} onClick={() => setStep(step + 1)}>
            Next
            <ArrowRight />
          </Button>
        )}
      </div>
    </Card>,
  )
}

/** Counts down the test's minutes. It only informs: answers still go in after time runs out. */
function Countdown({ minutes }: { minutes: number }) {
  const [left, setLeft] = useState(minutes * 60)
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [])
  const mm = String(Math.floor(left / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <span role="timer" className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold tabular-nums shadow-card', left ? 'bg-card' : 'bg-warning-soft text-foreground')} aria-label={`Suggested time left ${mm} minutes ${ss} seconds`}>
      <Clock className="size-4 text-muted" aria-hidden />
      {left ? `${mm}:${ss}` : 'Time is up, you can still submit'}
    </span>
  )
}
