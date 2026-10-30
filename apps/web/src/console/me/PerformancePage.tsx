import { blockerFor, fmtDate, fmtIdrShort, fmtNumber, kpiAchievement, scoreBand, scorecardScore } from '@artha/fixtures'
import { REVIEW_RELATION_LABEL, SCORECARD_STATUS_LABEL, type Employee, type Review, type ReviewCycle, type Scorecard, type ScorecardStatus } from '@artha/types'
import { Badge, Button, Card, CardContent, cn, EmptyState, PageHeader, PillTabs, ProgressBar, Textarea, type BadgeVariant } from '@artha/ui'
import { CircleCheck, ChevronDown, Send, Star, Target } from 'lucide-react'
import { useState } from 'react'
import { useUser } from '../../auth/auth'
import { useSetParam } from '../../lib/useSetParam'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'
import { WithMe } from './shared'

const STATUS_VARIANT: Record<ScorecardStatus, BadgeVariant> = { draft: 'warning', submitted: 'info', final: 'success' }
const BAND_VARIANT: Record<string, BadgeVariant> = { Outstanding: 'success', Exceeds: 'success', Meets: 'info', 'Needs improvement': 'warning', 'Below expectations': 'danger' }
const fmtValue = (v: number, unit: string) => (unit === 'Rp' ? fmtIdrShort(v) : unit === '%' ? `${fmtNumber(v, v % 1 ? 1 : 0)}%` : `${fmtNumber(v, v % 1 ? 1 : 0)} ${unit}`)
const periodLabel = (p: string) => p.replace(/^(\d{4})-Q(\d)$/, 'Q$2 $1')

export function MyPerformancePage() {
  return <WithMe title="My performance">{(me) => <Performance me={me} />}</WithMe>
}

function Performance({ me }: { me: Employee }) {
  const { state } = useAppState()
  const { params, set } = useSetParam()
  const openCycles = state.reviewCycles.filter((c) => c.status === 'open')
  const toWrite = state.reviews.filter((r) => r.reviewerId === me.id && openCycles.some((c) => c.id === r.cycleId))
  const due = toWrite.filter((r) => !r.submittedAt).length
  const scorecards = state.scorecards.filter((s) => s.employeeId === me.id).sort((a, b) => b.period.localeCompare(a.period))
  const tab = (params.get('tab') ?? (scorecards.length ? 'scorecards' : 'reviews')) === 'reviews' ? 'reviews' : 'scorecards'

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My performance" description="Your KPI scorecards each quarter, and the 360 reviews you write while a cycle is open." />
      <PillTabs
        label="Performance views"
        value={tab}
        onChange={(v) => set('tab', v)}
        items={[
          { value: 'scorecards', label: 'Scorecards', count: scorecards.length },
          { value: 'reviews', label: 'Reviews to write', count: due },
        ]}
        className="mb-4"
      />
      {tab === 'scorecards' ? <Scorecards cards={scorecards} /> : <Reviews reviews={toWrite} cycles={openCycles} />}
    </div>
  )
}

function Scorecards({ cards }: { cards: Scorecard[] }) {
  const { state } = useAppState()
  if (!cards.length) {
    return (
      <Card>
        <EmptyState icon={<Target />} title="No scorecards yet" description="Your manager sets your KPIs each quarter. Your scorecard shows up here once it exists." />
      </Card>
    )
  }
  return (
    <div className="space-y-4">
      {cards.map((sc) => {
        const score = scorecardScore(state, sc)
        return (
          <Card key={sc.id} className="min-w-0 overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-3 bg-ink p-5 text-on-ink">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-on-ink-muted">{periodLabel(sc.period)}</div>
                <div className="mt-1 flex items-end gap-2">
                  <span className="text-4xl font-bold tracking-tight tabular-nums">{score ?? '–'}</span>
                  <span className="pb-1 text-sm font-semibold text-on-ink-muted">{score === null ? 'No actuals yet' : scoreBand(score)}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={STATUS_VARIANT[sc.status]}>{SCORECARD_STATUS_LABEL[sc.status]}</Badge>
                {score !== null && <Badge variant={BAND_VARIANT[scoreBand(score)]}>{scoreBand(score)}</Badge>}
              </div>
            </div>
            <CardContent className="pt-2">
              <ul className="divide-y divide-border">
                {sc.entries.map((e) => {
                  const kpi = state.kpis.find((k) => k.id === e.kpiId)
                  const ach = kpi ? kpiAchievement(kpi, e.target, e.actual) : null
                  return (
                    <li key={e.kpiId} className="py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate font-semibold">{kpi?.name ?? 'Removed KPI'}</span>
                        <span className="shrink-0 font-semibold tabular-nums">{ach === null ? '–' : `${ach}%`}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted tabular-nums">
                        Target {fmtValue(e.target, kpi?.unit ?? '')} · actual {e.actual === null ? 'not in yet' : fmtValue(e.actual, kpi?.unit ?? '')} · weight {kpi?.weight ?? 0}%
                      </div>
                      <ProgressBar value={((ach ?? 0) / 120) * 100} className="mt-2" />
                    </li>
                  )
                })}
              </ul>
              {sc.note && <p className="mt-2 rounded-2xl bg-surface-2 p-3 text-sm text-body">{sc.note}</p>}
            </CardContent>
          </Card>
        )
      })}
      <p className="text-xs text-muted">Achievement caps at 120%. For lower-is-better KPIs the score is target over actual.</p>
    </div>
  )
}

function Reviews({ reviews, cycles }: { reviews: Review[]; cycles: ReviewCycle[] }) {
  const { state } = useAppState()
  const { params, set } = useSetParam()
  const open = params.get('review')
  if (!reviews.length) {
    return (
      <Card>
        <EmptyState icon={<Star />} title="No reviews to write" description="When HR opens a 360 cycle, the reviews you owe show up here." />
      </Card>
    )
  }
  const sorted = [...reviews].sort((a, b) => Number(!!a.submittedAt) - Number(!!b.submittedAt))
  return (
    <div className="space-y-3">
      {cycles.map((c) => (
        <p key={c.id} className="text-sm text-muted">
          <span className="font-semibold text-foreground">{c.name}</span> is open until {fmtDate(c.dueAt)}.
        </p>
      ))}
      {sorted.map((r) => {
        const cycle = cycles.find((c) => c.id === r.cycleId)!
        const subject = state.employees.find((e) => e.id === r.subjectId)?.name ?? 'Unknown employee'
        const expanded = open === r.id && !r.submittedAt
        return (
          <Card key={r.id} className="min-w-0">
            <button
              type="button"
              aria-expanded={expanded}
              disabled={!!r.submittedAt}
              onClick={() => set('review', expanded ? null : r.id)}
              className="flex min-h-16 w-full items-center gap-3 rounded-card p-4 text-left enabled:hover:bg-surface/60"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{r.relation === 'self' ? 'Self review' : subject}</span>
                <span className="block truncate text-xs text-muted">
                  {REVIEW_RELATION_LABEL[r.relation]} review · {cycle.name}
                </span>
              </span>
              {r.submittedAt ? (
                <Badge variant="success">
                  <CircleCheck className="size-3.5" aria-hidden />
                  Sent {fmtDate(r.submittedAt)}
                </Badge>
              ) : (
                <>
                  <Badge variant="warning" dot>
                    To write
                  </Badge>
                  <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} aria-hidden />
                </>
              )}
            </button>
            {expanded && <ReviewForm key={r.id} review={r} cycle={cycle} subject={subject} onDone={() => set('review', null)} />}
          </Card>
        )
      })}
    </div>
  )
}

function ReviewForm({ review, cycle, subject, onDone }: { review: Review; cycle: ReviewCycle; subject: string; onDone: () => void }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const [tried, setTried] = useState(false)
  const [answers, setAnswers] = useState<Review['answers']>(review.answers)
  const answer = (questionId: string) => answers.find((a) => a.questionId === questionId)
  const put = (questionId: string, patch: Partial<Review['answers'][number]>) => {
    const old = answer(questionId) ?? { questionId, score: 0, comment: '' }
    setAnswers([...answers.filter((a) => a.questionId !== questionId), { ...old, ...patch }])
  }
  const scored = answers.filter((a) => a.score > 0).map((a) => ({ ...a, comment: a.comment.trim() }))
  const action = { type: 'reviews/submit' as const, id: review.id, answers: scored, by: user.id }
  const blocker = blockerFor(state, action)

  return (
    <form
      noValidate
      className="space-y-5 border-t border-border p-4"
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (blocker) return
        if (act(action, 'Review sent', review.relation === 'self' ? 'Self review' : `Review of ${subject}`)) onDone()
      }}
    >
      {cycle.questions.map((q, i) => {
        const a = answer(q.id)
        return (
          <fieldset key={q.id} className="min-w-0">
            <legend className="text-xs font-semibold text-muted">Question {i + 1}</legend>
            <p className="mt-1 font-semibold">{q.text}</p>
            <div role="group" aria-label={`Score for question ${i + 1}`} className="mt-3 grid grid-cols-5 gap-2 sm:flex">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={a?.score === n}
                  onClick={() => put(q.id, { score: n })}
                  className={cn(
                    'h-12 rounded-full text-base font-semibold shadow-card transition-colors sm:w-12',
                    a?.score === n ? 'bg-ink text-on-ink' : 'bg-card text-body hover:bg-surface',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-muted">1 is poor, 5 is excellent</p>
            <Textarea aria-label={`Comment for question ${i + 1}`} rows={2} className="mt-2" placeholder="Comment (optional)" value={a?.comment ?? ''} onChange={(e) => put(q.id, { comment: e.target.value })} />
          </fieldset>
        )
      })}
      {tried && blocker && <p className="text-sm text-danger">{blocker}</p>}
      <Button type="submit" size="lg" className="w-full sm:w-auto">
        <Send />
        Send review
      </Button>
    </form>
  )
}
