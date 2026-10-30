import {
  contentCall,
  contentDue,
  draftSocialPost,
  fmtDateTime,
  formatLabel,
  fromDateInput,
  nowIso,
  nowMs,
  PLATFORM_FORMATS,
  publicListings,
  publishBlocker,
  rewriteSocialPost,
  SOCIAL_FORMAT_LABEL,
  socialText,
  toDateInput,
  type CalendarChannel,
  type ContentAction,
} from '@artha/fixtures'
import {
  Badge,
  Banner,
  Button,
  Card,
  Chip,
  ChipRow,
  cn,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  PillTabs,
  StatCard,
  Textarea,
  toast,
} from '@artha/ui'
import {
  CONTENT_STATUS_LABEL,
  CONTENT_STATUSES,
  SOCIAL_PLATFORM_LABEL,
  SOCIAL_PLATFORMS,
  type CarouselSlide,
  type ContentStatus,
  type ReelScene,
  type SocialFormat,
  type SocialPlatform,
  type SocialPost,
} from '@artha/types'
import { CalendarClock, CalendarDays, Check, CircleAlert, Copy, ExternalLink, Pencil, Search, Send, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { ContentStatusBadge } from '../../components/badges'
import { CodeLink, paths } from '../../components/links'
import { useAppState, useScoped } from '../../state/store'
import { useAct } from '../dialogs'

// ---------------------------------------------------------------- shared with the calendar and blog pages

export const CHANNEL_LABEL: Record<CalendarChannel, string> = { ...SOCIAL_PLATFORM_LABEL, blog: 'Blog' }
/** One colour per channel, tokens only. */
export const CHANNEL_TONE: Record<CalendarChannel, string> = {
  instagram: 'bg-accent-soft text-accent-strong',
  tiktok: 'bg-ink text-on-ink',
  facebook: 'bg-info-soft text-info',
  x: 'bg-surface-2 text-body',
  blog: 'bg-success-soft text-success',
}
export const CHANNEL_DOT: Record<CalendarChannel, string> = {
  instagram: 'bg-accent',
  tiktok: 'bg-ink',
  facebook: 'bg-info',
  x: 'bg-chart-muted',
  blog: 'bg-success',
}

export const ChannelPill = ({ channel, className }: { channel: CalendarChannel; className?: string }) => (
  <span className={cn('inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold', CHANNEL_TONE[channel], className)}>{CHANNEL_LABEL[channel]}</span>
)

/** Logs one content agent turn in the AI gateway. Returns false, with a toast, when the gateway refuses it. */
export function useContentLog() {
  const { state, dispatch } = useAppState()
  const user = useUser()
  return (purpose: string, input: string, output: string, tool: 'draft_social_post' | 'draft_blog_post') => {
    const blocker = dispatch({ type: 'ai/logCall', call: contentCall(state, purpose, input, output, nowIso(), tool) }, user.id)
    if (blocker) toast('Jessy could not write', { tone: 'danger', description: blocker })
    return !blocker
  }
}

/** Date and time picker for schedule and reschedule; `build` turns the chosen time into the store action. */
export function ScheduleForm({ initial, build, label, onDone }: { initial: string | null; build: (at: string) => ContentAction; label: string; onDone: () => void }) {
  const act = useAct()
  const [date, setDate] = useState(initial ? toDateInput(initial) : '')
  const [time, setTime] = useState(initial ? new Date(initial).toTimeString().slice(0, 5) : '19:00')
  const [tried, setTried] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!date) return
        const at = new Date(Date.parse(fromDateInput(date)) + Number(time.slice(0, 2)) * 3_600_000 + Number(time.slice(3)) * 60_000).toISOString()
        if (act(build(at), 'Content scheduled', `${label} · ${fmtDateTime(at)}`)) onDone()
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Date" required error={tried && !date ? 'Choose a publish date.' : undefined}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </FormField>
        <FormField label="Time" hint="Peak hour is 19:00">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Schedule</Button>
      </DialogFooter>
    </form>
  )
}

/** Asks the reviewer what needs to change before the content goes back to draft. */
export function SendBackForm({ build, label, onDone }: { build: (note: string) => ContentAction; label: string; onDone: () => void }) {
  const act = useAct()
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!note.trim()) return
        if (act(build(note), 'Sent back to draft', label)) onDone()
      }}
    >
      <FormField label="What needs to change" required error={tried && !note.trim() ? 'Write what needs to change.' : undefined}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lead with the MRT distance and drop the last hashtag." />
      </FormField>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Send back</Button>
      </DialogFooter>
    </form>
  )
}

// ---------------------------------------------------------------- page

const PUBLISHABLE: ContentStatus[] = ['approved', 'scheduled', 'failed']

export function SocialPage() {
  const { state, listingCode } = useScoped()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<SocialPost | 'new' | null>(null)
  const [scheduling, setScheduling] = useState<SocialPost | null>(null)
  const [sendingBack, setSendingBack] = useState<SocialPost | null>(null)
  const manage = can('content.manage')

  const tab = (CONTENT_STATUSES.find((s) => s === params.get('status')) ?? 'draft') as ContentStatus
  const platform = (SOCIAL_PLATFORMS.find((p) => p === params.get('platform')) ?? null) as SocialPlatform | null
  const account = params.get('account')
  const q = params.get('q') ?? ''
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const clear = () => setParams(params.get('status') ? new URLSearchParams({ status: tab }) : new URLSearchParams(), { replace: true })

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const base = state.socialPosts.filter(
    (p) =>
      (!platform || p.platform === platform) &&
      (!account || p.account === account) &&
      terms.every((t) => `${p.hook} ${p.caption} ${p.account} ${listingCode(p.listingId)}`.toLowerCase().includes(t)),
  )
  const rows = base.filter((p) => p.status === tab).sort((a, b) => (b.scheduledAt ?? b.createdAt).localeCompare(a.scheduledAt ?? a.createdAt))
  const count = (s: ContentStatus) => base.filter((p) => p.status === s).length
  const all = (s: ContentStatus) => state.socialPosts.filter((p) => p.status === s).length
  const filters = [platform, account, q].filter(Boolean).length
  const due = contentDue(state, nowMs())

  return (
    <div className="space-y-4">
      <PageHeader
        title="Social media"
        description="Jessy drafts posts, carousels and reel scripts from listing data. A content manager approves them before they are scheduled or published through the connected accounts."
        className="mb-2"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={paths.contentCalendar}>
                <CalendarDays />
                Calendar
              </Link>
            </Button>
            {manage && due && (
              <Button variant="outline" onClick={() => act({ type: 'social/publishDue' }, 'Due content sent to the platforms')}>
                <Send />
                Publish due
              </Button>
            )}
            {manage && (
              <Button onClick={() => setEditing('new')}>
                <Sparkles />
                Create with Jessy
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Waiting for review" value={all('in_review')} icon={<CircleAlert />} tone={all('in_review') ? 'warning' : 'default'} active={tab === 'in_review'} onClick={() => set('status', 'in_review')} />
        <StatCard label="Ready to schedule" value={all('approved')} icon={<Check />} active={tab === 'approved'} onClick={() => set('status', 'approved')} />
        <StatCard label="Scheduled" value={all('scheduled')} icon={<CalendarClock />} tone="ink" active={tab === 'scheduled'} onClick={() => set('status', 'scheduled')} />
        <StatCard label="Failed" value={all('failed')} icon={<X />} tone={all('failed') ? 'danger' : 'default'} active={tab === 'failed'} onClick={() => set('status', 'failed')} />
      </div>

      <PillTabs label="Content status" value={tab} onChange={(s) => set('status', s === 'draft' ? null : s)} items={CONTENT_STATUSES.map((s) => ({ value: s, label: CONTENT_STATUS_LABEL[s], count: count(s) }))} />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          variant="pill"
          icon={<Search />}
          aria-label="Search content"
          placeholder="Hook, caption or listing code"
          value={q}
          onChange={(e) => set('q', e.target.value)}
          className="min-w-0 flex-1 sm:w-72 sm:flex-none"
          right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => set('q', null)}><X /></Button> : undefined}
        />
        <NativeSelect variant="inline" aria-label="Filter by platform" value={platform ?? ''} onChange={(e) => set('platform', e.target.value)}>
          <option value="">All platforms</option>
          {SOCIAL_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {SOCIAL_PLATFORM_LABEL[p]}
            </option>
          ))}
        </NativeSelect>
        <ChipRow className="w-full">
          <Chip variant="default" active={!account} onClick={() => set('account', null)}>
            All accounts
          </Chip>
          {state.settings.socialAccounts.map((a) => (
            <Chip key={a} variant="default" active={account === a} count={state.socialPosts.filter((p) => p.account === a).length} onClick={() => set('account', account === a ? null : a)}>
              {a}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.socialPosts.filter((p) => p.status === tab).length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear filters
            </Button>
          </span>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          {filters > 0 ? (
            <EmptyState title="No matching content" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState
              title={`No ${CONTENT_STATUS_LABEL[tab].toLowerCase()} content`}
              description={tab === 'draft' ? 'Ask Jessy to draft content from a live listing.' : 'Content shows here when it reaches this step.'}
              action={
                tab === 'draft' && manage ? (
                  <Button variant="outline" size="sm" onClick={() => setEditing('new')}>
                    Create with Jessy
                  </Button>
                ) : undefined
              }
            />
          )}
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const blocker = PUBLISHABLE.includes(p.status) ? publishBlocker(state, p.platform) : null
            return (
              <Card key={p.id} className="flex min-w-0 flex-col p-5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <ChannelPill channel={p.platform} />
                  <Badge variant="outline">{p.platform === 'tiktok' ? 'Script' : SOCIAL_FORMAT_LABEL[p.format]}</Badge>
                  <span className="ml-auto">
                    <ContentStatusBadge status={p.status} />
                  </span>
                </div>
                <div className="mt-2 truncate text-sm font-semibold">{p.account}</div>
                {p.reviewNote && (
                  <Banner tone={p.status === 'failed' ? 'danger' : 'warning'} title={p.status === 'failed' ? 'Publishing failed' : 'Sent back'} className="mt-3">
                    {p.reviewNote}
                  </Banner>
                )}
                <PostBody post={p} />
                <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted">
                  {p.listingId && <CodeLink to={paths.listing(p.listingId)} code={listingCode(p.listingId)} />}
                  {p.status === 'published' && p.publishedAt ? (
                    <span className="flex items-center gap-1">
                      <Send className="size-3.5" />
                      {fmtDateTime(p.publishedAt)}
                    </span>
                  ) : (
                    p.scheduledAt && (
                      <span className="flex items-center gap-1">
                        <CalendarClock className="size-3.5" />
                        {fmtDateTime(p.scheduledAt)}
                      </span>
                    )
                  )}
                  {p.permalink && (
                    <a href={p.permalink} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1 font-medium text-info hover:underline">
                      <ExternalLink className="size-3.5 shrink-0" />
                      <span className="truncate">View on {SOCIAL_PLATFORM_LABEL[p.platform]}</span>
                    </a>
                  )}
                  {p.platformPostId && <span className="truncate font-mono">ID {p.platformPostId}</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard?.writeText(socialText(p))
                      toast('Content copied', { tone: 'success', description: p.account })
                    }}
                  >
                    <Copy />
                    Copy
                  </Button>
                  {manage && (
                    <>
                      {(p.status === 'draft' || p.status === 'in_review') && (
                        <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                          <Pencil />
                          Edit
                        </Button>
                      )}
                      {p.status === 'draft' && (
                        <Button size="sm" onClick={() => act({ type: 'social/submit', id: p.id }, 'Sent for review', p.account)}>
                          <Send />
                          Submit for review
                        </Button>
                      )}
                      {p.status === 'in_review' && (
                        <>
                          <Button size="sm" onClick={() => act({ type: 'social/approve', id: p.id, by: user.id }, 'Content approved', p.account)}>
                            <Check />
                            Approve
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setSendingBack(p)}>
                            <Undo2 />
                            Send back
                          </Button>
                        </>
                      )}
                      {PUBLISHABLE.includes(p.status) && (
                        <>
                          <Button
                            size="sm"
                            disabled={!!blocker}
                            title={blocker ?? undefined}
                            onClick={() => act({ type: 'social/publish', id: p.id }, 'Published', `${SOCIAL_PLATFORM_LABEL[p.platform]} · ${p.account}`)}
                          >
                            <Send />
                            {p.status === 'failed' ? 'Retry publish' : 'Publish now'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setScheduling(p)}>
                            <CalendarClock />
                            {p.status === 'approved' ? 'Schedule' : 'Reschedule'}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => act({ type: 'social/toDraft', id: p.id }, 'Moved back to draft', p.account)}>
                            Back to draft
                          </Button>
                        </>
                      )}
                      {p.status !== 'published' && (
                        <Button variant="ghost" size="icon-sm" aria-label="Delete content" className="ml-auto text-accent" onClick={() => act({ type: 'social/remove', id: p.id }, 'Content deleted', p.account)}>
                          <Trash2 />
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {manage && blocker && p.status !== 'failed' && (
                  <p className="mt-2 text-xs text-warning">
                    {blocker}{' '}
                    <Link to={paths.integrations} className="font-semibold underline-offset-2 hover:underline">
                      Open integrations
                    </Link>
                  </p>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Dialog
        open={!!editing}
        onOpenChange={(v) => !v && setEditing(null)}
        size="lg"
        title={editing === 'new' ? 'Create content with Jessy' : 'Edit content'}
        description={editing === 'new' ? 'Choose a listing, platform, format and account. Jessy writes from the listing data, and you can edit before saving.' : 'Changes stay in draft until a content manager approves them.'}
      >
        {editing && (
          <SocialDraftForm
            initial={editing === 'new' ? null : editing}
            onDone={(saved) => {
              setEditing(null)
              if (saved && editing === 'new') set('status', null)
            }}
          />
        )}
      </Dialog>
      <Dialog open={!!scheduling} onOpenChange={(v) => !v && setScheduling(null)} size="sm" title="Schedule content" description={scheduling ? `${scheduling.account} · ${formatLabel(scheduling)}` : undefined}>
        {scheduling && (
          <ScheduleForm initial={scheduling.scheduledAt} label={scheduling.account} build={(at) => ({ type: 'social/schedule', id: scheduling.id, scheduledAt: at })} onDone={() => setScheduling(null)} />
        )}
      </Dialog>
      <Dialog open={!!sendingBack} onOpenChange={(v) => !v && setSendingBack(null)} size="sm" title="Send back to draft" description={sendingBack ? `${sendingBack.account} · ${formatLabel(sendingBack)}` : undefined}>
        {sendingBack && <SendBackForm label={sendingBack.account} build={(note) => ({ type: 'social/reject', id: sendingBack.id, by: user.id, note })} onDone={() => setSendingBack(null)} />}
      </Dialog>
    </div>
  )
}

/** Hook, then the slides or the scene script, then the caption. */
function PostBody({ post: p }: { post: SocialPost }) {
  return (
    <div className="min-w-0">
      <p className="mt-3 text-base font-semibold leading-snug">{p.hook}</p>
      {p.slides && (
        <ol className="mt-3 space-y-1.5">
          {p.slides.map((s, i) => (
            <li key={i} className="flex gap-2 rounded-2xl bg-surface-2 px-3 py-2 text-sm">
              <span className="w-4 shrink-0 font-semibold text-muted tabular-nums">{i + 1}</span>
              <span className="min-w-0">
                <span className="block font-semibold">{s.headline}</span>
                <span className="block text-xs text-body">{s.line}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {p.scenes && (
        <ol className="mt-3 space-y-1.5">
          {p.scenes.map((s, i) => (
            <li key={i} className="rounded-2xl bg-surface-2 px-3 py-2 text-sm">
              <span className="block text-xs text-muted">
                Scene {i + 1} · {s.shot}
              </span>
              <span className="block font-semibold">{s.onScreen}</span>
              <span className="block text-xs text-body">Voice-over: {s.voiceOver}</span>
            </li>
          ))}
          {(p.cta || p.audio) && (
            <li className="px-3 pt-1 text-xs text-muted">
              {p.cta && <span className="block">Call to action: {p.cta}</span>}
              {p.audio && <span className="block">Suggested audio: {p.audio}</span>}
            </li>
          )}
        </ol>
      )}
      <p className="mt-3 whitespace-pre-line text-sm text-body">{p.caption}</p>
      <p className="mt-2 break-words text-sm text-info">{p.hashtags.join(' ')}</p>
    </div>
  )
}

// ---------------------------------------------------------------- draft and edit

function SocialDraftForm({ initial, onDone }: { initial: SocialPost | null; onDone: (saved: boolean) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const log = useContentLog()
  const live = publicListings(state)
  const [listingId, setListingId] = useState(initial?.listingId ?? live[0]?.id ?? '')
  const [platform, setPlatform] = useState<SocialPlatform>(initial?.platform ?? 'instagram')
  const [format, setFormat] = useState<SocialFormat>(initial?.format ?? 'post')
  const [account, setAccount] = useState(initial?.account ?? state.settings.socialAccounts[0] ?? '')
  const [draft, setDraft] = useState<SocialPost | null>(initial)
  const [variant, setVariant] = useState(0)
  const listing = state.listings.find((l) => l.id === listingId)
  const reset = () => !initial && setDraft(null)

  const write = () => {
    if (!listing) return
    const next = draftSocialPost(listing, platform, account, nowIso(), format)
    if (log('Draft social post', `${listing.code} ${formatLabel(next)} for ${account}`, socialText(next), 'draft_social_post')) {
      setDraft(next)
      setVariant(0)
    }
  }
  const rewrite = () => {
    if (!listing || !draft) return
    const next = rewriteSocialPost(draft, listing, variant + 1)
    if (log('Rewrite caption', `${listing.code} ${formatLabel(draft)}, take ${variant + 2}`, socialText(next), 'draft_social_post')) {
      setDraft(next)
      setVariant(variant + 1)
    }
  }
  const setSlide = (i: number, s: CarouselSlide) => draft && setDraft({ ...draft, slides: draft.slides?.map((x, n) => (n === i ? s : x)) })
  const setScene = (i: number, s: ReelScene) => draft && setDraft({ ...draft, scenes: draft.scenes?.map((x, n) => (n === i ? s : x)) })

  return (
    <div>
      {!initial && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Listing" required className="sm:col-span-3">
            <NativeSelect value={listingId} onChange={(e) => { setListingId(e.target.value); reset() }}>
              {live.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} · {l.title}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Platform">
            <NativeSelect
              value={platform}
              onChange={(e) => {
                const p = e.target.value as SocialPlatform
                setPlatform(p)
                if (!PLATFORM_FORMATS[p].includes(format)) setFormat(PLATFORM_FORMATS[p][0])
                reset()
              }}
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {SOCIAL_PLATFORM_LABEL[p]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Format">
            <NativeSelect value={format} onChange={(e) => { setFormat(e.target.value as SocialFormat); reset() }}>
              {PLATFORM_FORMATS[platform].map((f) => (
                <option key={f} value={f}>
                  {platform === 'tiktok' ? 'Video script' : SOCIAL_FORMAT_LABEL[f]}
                </option>
              ))}
            </NativeSelect>
          </FormField>
          <FormField label="Account">
            <NativeSelect value={account} onChange={(e) => { setAccount(e.target.value); reset() }}>
              {state.settings.socialAccounts.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </NativeSelect>
          </FormField>
        </div>
      )}
      {draft ? (
        <div className="mt-4 space-y-3 rounded-2xl bg-surface-2 p-4">
          <FormField label={draft.format === 'reel' ? 'Hook (first 3 seconds)' : 'Hook'}>
            <Input variant="soft" className="[&_input]:bg-card" value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} />
          </FormField>
          {draft.slides?.map((s, i) => (
            <fieldset key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <legend className="mb-1 text-xs font-semibold text-muted">Slide {i + 1}</legend>
              <Input variant="soft" className="[&_input]:bg-card" aria-label={`Slide ${i + 1} headline`} value={s.headline} onChange={(e) => setSlide(i, { ...s, headline: e.target.value })} />
              <Input variant="soft" className="[&_input]:bg-card" aria-label={`Slide ${i + 1} line`} value={s.line} onChange={(e) => setSlide(i, { ...s, line: e.target.value })} />
            </fieldset>
          ))}
          {draft.scenes?.map((s, i) => (
            <fieldset key={i} className="grid grid-cols-1 gap-2">
              <legend className="mb-1 text-xs font-semibold text-muted">Scene {i + 1}</legend>
              <Input variant="soft" className="[&_input]:bg-card" aria-label={`Scene ${i + 1} shot`} placeholder="Shot" value={s.shot} onChange={(e) => setScene(i, { ...s, shot: e.target.value })} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input variant="soft" className="[&_input]:bg-card" aria-label={`Scene ${i + 1} on-screen text`} placeholder="On-screen text" value={s.onScreen} onChange={(e) => setScene(i, { ...s, onScreen: e.target.value })} />
                <Input variant="soft" className="[&_input]:bg-card" aria-label={`Scene ${i + 1} voice-over`} placeholder="Voice-over" value={s.voiceOver} onChange={(e) => setScene(i, { ...s, voiceOver: e.target.value })} />
              </div>
            </fieldset>
          ))}
          {draft.format === 'reel' && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Call to action">
                <Input variant="soft" className="[&_input]:bg-card" value={draft.cta ?? ''} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
              </FormField>
              <FormField label="Suggested audio">
                <Input variant="soft" className="[&_input]:bg-card" value={draft.audio ?? ''} onChange={(e) => setDraft({ ...draft, audio: e.target.value })} />
              </FormField>
            </div>
          )}
          <FormField label="Caption">
            <Textarea className="bg-card" value={draft.caption} onChange={(e) => setDraft({ ...draft, caption: e.target.value })} />
          </FormField>
          <FormField label="Hashtags" hint="Separate with spaces">
            <Input value={draft.hashtags.join(' ')} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value.split(/\s+/).filter(Boolean) })} />
          </FormField>
        </div>
      ) : (
        <p className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm text-muted">Press "Write draft" and Jessy prepares the {SOCIAL_FORMAT_LABEL[format].toLowerCase()} from the listing data. Each draft is logged in the AI gateway.</p>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={() => onDone(false)}>
          Cancel
        </Button>
        {draft ? (
          <>
            {listing && (
              <Button variant="outline" onClick={rewrite}>
                <Sparkles />
                Rewrite
              </Button>
            )}
            <Button onClick={() => act({ type: 'social/upsert', post: draft }, initial ? 'Content saved' : 'Content draft saved', `${draft.account} · ${formatLabel(draft)}`) && onDone(true)}>
              {initial ? 'Save' : 'Save draft'}
            </Button>
          </>
        ) : (
          <Button onClick={write} disabled={!listing || !account}>
            <Sparkles />
            Write draft
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}
