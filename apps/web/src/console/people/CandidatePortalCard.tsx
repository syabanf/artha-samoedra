import { blockerFor, fmtDate, fmtDateTime, newShareToken } from '@artha/fixtures'
import type { Candidate } from '@artha/types'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, toast } from '@artha/ui'
import { Copy, ExternalLink, Link2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))

/** The candidate's portal link, the tests to take there, and what the candidate answered. */
export function CandidatePortalCard({ candidate: c, manage }: { candidate: Candidate; manage: boolean }) {
  const { state } = useAppState()
  const act = useAct()
  const assigned = c.assignedTestIds ?? []
  const [picked, setPicked] = useState(assigned)
  const blocker = blockerFor(state, { type: 'candidates/portal', id: c.id, token: c.token || 'probe', testIds: picked })
  const url = c.token ? `${window.location.origin}${paths.candidatePortal(c.token)}` : null
  const answered = c.interviews.filter((i) => i.response)
  const offerAnswered = c.offer?.answeredAt ? c.offer : null

  const copy = (link: string) =>
    navigator.clipboard
      .writeText(link)
      .then(() => toast('Link copied', { tone: 'success', description: link }))
      .catch(() => toast('Could not copy the link', { tone: 'danger', description: link }))

  const share = () => {
    const token = c.token || newShareToken()
    if (act({ type: 'candidates/portal', id: c.id, token, testIds: picked }, c.token ? 'Tests updated' : 'Portal link created', c.name) && !c.token) {
      void copy(`${window.location.origin}${paths.candidatePortal(token)}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Candidate portal</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {url ? (
          <div className="flex min-w-0 items-center gap-2 rounded-2xl bg-surface px-3 py-2">
            <Link2 className="size-4 shrink-0 text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-xs">{url}</span>
            <Button variant="ghost" size="icon-sm" aria-label="Copy the portal link" onClick={() => void copy(url)}>
              <Copy />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Open the portal" asChild>
              <Link to={paths.candidatePortal(c.token!)} target="_blank">
                <ExternalLink />
              </Link>
            </Button>
          </div>
        ) : (
          <p className="text-muted">The candidate has no portal link yet. Create one to let them take tests and answer interviews and offers online.</p>
        )}

        {manage && (
          <div>
            <div className="mb-2 text-xs font-semibold text-muted">Tests to take on the portal</div>
            <ul className="space-y-2">
              {state.psychTests.map((t) => {
                const taken = c.tests.some((x) => x.testId === t.id)
                return (
                  <li key={t.id} className="flex items-center gap-2.5">
                    <Checkbox
                      label={t.name}
                      checked={picked.includes(t.id)}
                      onCheckedChange={(on) => setPicked(on ? [...picked, t.id] : picked.filter((x) => x !== t.id))}
                    />
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    {taken && <Badge variant="muted">Taken</Badge>}
                  </li>
                )
              })}
            </ul>
            <Button
              size="sm"
              variant={c.token ? 'outline' : 'primary'}
              className="mt-3"
              disabled={!!blocker || (!!c.token && sameSet(picked, assigned))}
              title={blocker ?? (c.token && sameSet(picked, assigned) ? 'Change the tests to save.' : undefined)}
              onClick={share}
            >
              {c.token ? 'Save tests' : 'Create and copy link'}
            </Button>
          </div>
        )}

        <div>
          <div className="mb-2 text-xs font-semibold text-muted">Answers from the candidate</div>
          {answered.length || offerAnswered ? (
            <ul className="space-y-2">
              {answered.map((i) => (
                <li key={i.id} className="rounded-2xl bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Interview {fmtDateTime(i.at)}</span>
                    <Badge variant={i.response!.kind === 'confirmed' ? 'success' : 'warning'}>{i.response!.kind === 'confirmed' ? 'Confirmed' : 'Asks to reschedule'}</Badge>
                  </div>
                  {i.response!.note && <p className="mt-1 text-xs text-body">"{i.response!.note}"</p>}
                  <p className="mt-0.5 text-xs text-muted">Answered {fmtDate(i.response!.at)}</p>
                </li>
              ))}
              {offerAnswered && (
                <li className="rounded-2xl bg-surface px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">Offer</span>
                    <Badge variant={offerAnswered.status === 'accepted' ? 'success' : 'danger'}>{offerAnswered.status === 'accepted' ? 'Accepted' : 'Declined'}</Badge>
                  </div>
                  {offerAnswered.answerNote && <p className="mt-1 text-xs text-body">"{offerAnswered.answerNote}"</p>}
                  <p className="mt-0.5 text-xs text-muted">Answered {fmtDate(offerAnswered.answeredAt!)}</p>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-muted">No answers yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
