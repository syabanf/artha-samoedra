import { blogText, draftBlogPost, fmtDate, fmtDateTime, nowIso, publicListings, seoChecks, slugify } from '@artha/fixtures'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Banner,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  PageHeader,
  Textarea,
  type Column,
} from '@artha/ui'
import { CONTENT_STATUS_LABEL, type BlogPost, type ContentStatus, type Faq } from '@artha/types'
import { CalendarClock, Check, CircleCheck, CircleDashed, ExternalLink, Plus, Search, Send, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { ContentStatusBadge } from '../../components/badges'
import { paths } from '../../components/links'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'
import { ScheduleForm, SendBackForm, useContentLog } from './SocialPage'

const BLOG_STATUSES: ContentStatus[] = ['draft', 'in_review', 'approved', 'scheduled', 'published']

export function BlogAdminPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [status, setStatus] = useState<ContentStatus | null>(null)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const base = state.blogPosts.filter((p) => terms.every((t) => `${p.title} ${p.slug} ${p.keywords.join(' ')}`.toLowerCase().includes(t)))
  const rows = base.filter((p) => !status || p.status === status)
  const count = (s: ContentStatus) => base.filter((p) => p.status === s).length
  const filters = [status, q].filter(Boolean).length
  const clear = () => {
    setStatus(null)
    setQ('')
  }

  const columns: Column<BlogPost>[] = [
    { id: 'title', header: 'Article', sortValue: (p) => p.title, cell: (p) => <div className="min-w-0"><div className="truncate text-sm font-semibold">{p.title}</div><div className="truncate font-mono text-[11px] text-muted">/blog/{p.slug}</div></div> },
    { id: 'status', header: 'Status', hideBelow: 'sm', cell: (p) => <ContentStatusBadge status={p.status} /> },
    {
      id: 'seo',
      header: 'SEO/GEO score',
      hideBelow: 'md',
      sortValue: (p) => seoChecks(p).filter((c) => c.ok).length,
      cell: (p) => {
        const checks = seoChecks(p)
        const ok = checks.filter((c) => c.ok).length
        return <span className={ok === checks.length ? 'font-semibold text-success' : ok < checks.length - 2 ? 'font-semibold text-warning' : ''}>{ok}/{checks.length}</span>
      },
    },
    { id: 'kw', header: 'Keyword', hideBelow: 'lg', cell: (p) => <span className="text-xs text-muted">{p.keywords[0]}</span> },
    {
      id: 'date',
      header: 'Date',
      align: 'right',
      sortValue: (p) => p.publishedAt ?? p.scheduledAt ?? p.createdAt,
      cell: (p) => <span className="whitespace-nowrap text-xs text-muted">{fmtDate(p.publishedAt ?? p.scheduledAt ?? p.createdAt)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Blog SEO"
        description="Articles for search engines and AI answer engines (GEO). Jessy drafts them from listing data, and a content manager approves each one before it goes live."
        className="mb-2 [&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search articles"
              placeholder="Title, slug or keyword"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-w-0 flex-1 sm:w-72 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setQ('')}><X /></Button> : undefined}
            />
            {can('content.manage') && (
              <Button onClick={() => setCreating(true)}>
                <Sparkles />
                Write with Jessy
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!status} count={base.length} onClick={() => setStatus(null)}>
            All
          </Chip>
          {BLOG_STATUSES.map((s) => (
            <Chip key={s} active={status === s} count={count(s)} onClick={() => setStatus(status === s ? null : s)}>
              {CONTENT_STATUS_LABEL[s]}
            </Chip>
          ))}
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.blogPosts.length}
            <Button variant="ghost" size="sm" className="ml-1" onClick={clear}>
              Clear filters
            </Button>
          </span>
        )}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(p) => p.id}
        rowLabel={(p) => p.title}
        onRowClick={(p) => navigate(paths.blogEdit(p.id))}
        initialSort={{ id: 'date', desc: true }}
        resetPageKey={`${status}|${q}`}
        empty={
          filters ? (
            <EmptyState compact title="No matching articles" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState compact title="No articles yet" description="Ask Jessy to write an article from a topic and keyword." />
          )
        }
      />
      <Dialog open={creating} onOpenChange={setCreating} size="lg" title="Write an article with Jessy" description="Jessy drafts the title, meta, GEO summary, body and FAQ from the topic and listings you choose.">
        <BlogDraftForm onDone={(post) => { setCreating(false); if (post) navigate(paths.blogEdit(post.id)) }} />
      </Dialog>
    </div>
  )
}

function BlogDraftForm({ onDone }: { onDone: (post: BlogPost | null) => void }) {
  const { state } = useAppState()
  const act = useAct()
  const log = useContentLog()
  const live = publicListings(state)
  const [topic, setTopic] = useState('')
  const [keyword, setKeyword] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [tried, setTried] = useState(false)
  const error = topic.trim().length < 15 ? 'Write a topic of at least 15 characters, for example "Tips for choosing a warehouse in Cikarang".' : null
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (error) return
        const post = draftBlogPost(topic, keyword, live.filter((l) => picked.includes(l.id)), nowIso())
        if (!log('Draft blog post', `${topic} | ${keyword}`, blogText(post), 'draft_blog_post')) return
        if (act({ type: 'blog/upsert', post }, 'Article draft created', post.title)) onDone(post)
      }}
    >
      <div className="grid grid-cols-1 gap-4">
        <FormField label="Topic" required error={tried ? (error ?? undefined) : undefined}>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Tips for choosing a warehouse in Cikarang for small businesses" />
        </FormField>
        <FormField label="Main keyword" hint="Leave empty to use the topic">
          <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="sewa gudang cikarang" />
        </FormField>
        <FormField label="Linked listings" hint="Jessy uses their price and location as article data">
          <div className="flex flex-wrap gap-2">
            {live.map((l) => (
              <Chip key={l.id} variant="default" active={picked.includes(l.id)} onClick={() => setPicked(picked.includes(l.id) ? picked.filter((x) => x !== l.id) : [...picked, l.id])}>
                {l.code}
              </Chip>
            ))}
          </div>
        </FormField>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">
          <Sparkles />
          Write draft
        </Button>
      </DialogFooter>
    </form>
  )
}

export function BlogEditorPage() {
  const { id } = useParams()
  const { state } = useAppState()
  const saved = state.blogPosts.find((p) => p.id === id)
  if (!saved) {
    return (
      <Card>
        <EmptyState pageTitle title="Article not found" action={<BackButton fallback={paths.blogAdmin} />} />
      </Card>
    )
  }
  return <BlogEditor key={saved.id} saved={saved} />
}

/** The fields an editor changes; the flow fields move through their own actions. */
const contentOf = ({ status: _s, publishedAt: _p, scheduledAt: _a, approvedBy: _b, reviewNote: _n, ...rest }: BlogPost) => JSON.stringify(rest)

function BlogEditor({ saved }: { saved: BlogPost }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const [p, setP] = useState(saved)
  const [scheduling, setScheduling] = useState(false)
  const [sendingBack, setSendingBack] = useState(false)
  const dirty = contentOf(p) !== contentOf(saved)
  const checks = seoChecks(p)
  const manage = can('content.manage')
  /** Approved and scheduled articles are locked until they go back to draft. */
  const locked = saved.status === 'approved' || saved.status === 'scheduled'
  const readOnly = !manage || locked
  const publishable = saved.status === 'approved' || saved.status === 'scheduled'
  const set = <K extends keyof BlogPost>(k: K, v: BlogPost[K]) => setP({ ...p, [k]: v })
  const setFaq = (i: number, f: Faq) => set('faq', p.faq.map((x, n) => (n === i ? f : x)))
  const save = () => act({ type: 'blog/upsert', post: p }, 'Article saved', p.title)

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.blogAdmin} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <ContentStatusBadge status={saved.status} />
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{saved.title}</h1>
        </div>
        {manage && (
          <div className="flex flex-wrap gap-2">
            {saved.status === 'published' && (
              <Button variant="outline" asChild>
                <a href={paths.blogPost(saved.slug)} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  View
                </a>
              </Button>
            )}
            {!locked && (
              <Button variant={saved.status === 'published' ? 'primary' : 'outline'} disabled={!dirty} onClick={save}>
                Save
              </Button>
            )}
            {saved.status === 'draft' && (
              <Button
                onClick={() => {
                  if (dirty && !save()) return
                  act({ type: 'blog/submit', id: p.id }, 'Sent for review', p.title)
                }}
              >
                <Send />
                {dirty ? 'Save and submit for review' : 'Submit for review'}
              </Button>
            )}
            {saved.status === 'in_review' && (
              <>
                <Button variant="outline" onClick={() => setSendingBack(true)}>
                  <Undo2 />
                  Send back
                </Button>
                <Button
                  onClick={() => {
                    if (dirty && !save()) return
                    act({ type: 'blog/approve', id: p.id, by: user.id }, 'Article approved', p.title)
                  }}
                >
                  <Check />
                  Approve
                </Button>
              </>
            )}
            {publishable && (
              <>
                <Button variant="ghost" onClick={() => act({ type: 'blog/toDraft', id: p.id }, 'Moved back to draft', p.title)}>
                  Back to draft
                </Button>
                <Button variant="outline" onClick={() => setScheduling(true)}>
                  <CalendarClock />
                  {saved.status === 'scheduled' ? 'Reschedule' : 'Schedule'}
                </Button>
                <Button onClick={() => act({ type: 'blog/publish', id: p.id }, 'Article published', `/blog/${p.slug}`)}>
                  <Send />
                  Publish now
                </Button>
              </>
            )}
            {saved.status === 'published' && (
              <Button variant="ghost" onClick={() => act({ type: 'blog/toDraft', id: p.id }, 'Article taken off the website', p.title)}>
                Take down
              </Button>
            )}
          </div>
        )}
      </div>
      {saved.reviewNote && saved.status === 'draft' && (
        <Banner tone="warning" title="Sent back">
          {saved.reviewNote}
        </Banner>
      )}
      {locked && (
        <Banner tone="info" title={saved.status === 'scheduled' && saved.scheduledAt ? `Scheduled for ${fmtDateTime(saved.scheduledAt)}` : 'Approved and ready to publish'}>
          {manage ? 'Approved articles are locked. Move the article back to draft to edit it.' : 'A content manager approved this article.'}
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="p-5">
            <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Title" required className="sm:col-span-2">
                <Input value={p.title} onChange={(e) => set('title', e.target.value)} />
              </FormField>
              <FormField label="Slug" hint={`/blog/${p.slug}`}>
                <Input value={p.slug} onChange={(e) => set('slug', slugify(e.target.value))} />
              </FormField>
              <FormField label="Keywords" hint="Separate with commas, the first one is the main keyword">
                <Input value={p.keywords.join(', ')} onChange={(e) => set('keywords', e.target.value.split(',').map((k) => k.trim()).filter(Boolean))} />
              </FormField>
              <FormField label="Meta title" hint={`${p.metaTitle.length}/60 characters`} className="sm:col-span-2">
                <Input value={p.metaTitle} onChange={(e) => set('metaTitle', e.target.value)} />
              </FormField>
              <FormField label="Meta description" hint={`${p.metaDescription.length}/160 characters`} className="sm:col-span-2">
                <Textarea className="min-h-20" value={p.metaDescription} onChange={(e) => set('metaDescription', e.target.value)} />
              </FormField>
              <FormField label="GEO summary" hint="A direct answer of 30 to 80 words, shown at the top and quoted by AI answer engines" className="sm:col-span-2">
                <Textarea className="min-h-24" value={p.geoSummary} onChange={(e) => set('geoSummary', e.target.value)} />
              </FormField>
              <FormField label="Excerpt" className="sm:col-span-2">
                <Input value={p.excerpt} onChange={(e) => set('excerpt', e.target.value)} />
              </FormField>
              <FormField label="Body" hint="## for subheadings, - or 1. for lists" className="sm:col-span-2">
                <Textarea className="min-h-72 font-mono text-sm md:text-[13px]" value={p.body} onChange={(e) => set('body', e.target.value)} />
              </FormField>
            </fieldset>
          </Card>
          <Card>
            <CardHeader action={!readOnly && <Button variant="outline" size="sm" onClick={() => set('faq', [...p.faq, { q: '', a: '' }])}><Plus />Add FAQ</Button>}>
              <CardTitle>FAQ (schema FAQPage)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {p.faq.length === 0 && <EmptyState compact title="No FAQ yet" description="Add at least 2 FAQs so the article can show as a rich result." />}
              {p.faq.map((f, i) => (
                <fieldset key={i} disabled={readOnly} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-2xl bg-surface-2 p-3">
                  <Input variant="soft" className="[&_input]:bg-card" aria-label={`Question ${i + 1}`} value={f.q} placeholder="Question" onChange={(e) => setFaq(i, { ...f, q: e.target.value })} />
                  <Button variant="ghost" size="icon" aria-label={`Remove FAQ ${i + 1}`} className="text-accent" onClick={() => set('faq', p.faq.filter((_, n) => n !== i))}>
                    <Trash2 />
                  </Button>
                  <Textarea className="col-span-2 min-h-16 border-0 bg-card" aria-label={`Answer ${i + 1}`} value={f.a} placeholder="Answer" onChange={(e) => setFaq(i, { ...f, a: e.target.value })} />
                </fieldset>
              ))}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-0 xl:self-start">
          <Card className="p-5">
            <div className="flex items-end justify-between">
              <CardTitle>SEO and GEO checks</CardTitle>
              <span className="text-2xl font-bold tabular-nums">
                {checks.filter((c) => c.ok).length}
                <span className="text-sm font-semibold text-muted">/{checks.length}</span>
              </span>
            </div>
            <ul className="mt-4 space-y-2.5">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  {c.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-warning" />}
                  <span>
                    {c.label}
                    <span className="block text-xs text-muted">{c.hint}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-5">
            <CardTitle>Google preview</CardTitle>
            <div className="mt-3 rounded-2xl bg-surface-2 p-4">
              <div className="truncate text-xs text-muted">arthasamoedra.id › blog › {p.slug}</div>
              <div className="mt-1 line-clamp-1 text-[17px] font-medium text-info">{p.metaTitle || p.title}</div>
              <div className="mt-1 line-clamp-2 text-xs text-body">{p.metaDescription}</div>
            </div>
            <div className="mt-3 text-xs text-muted">
              {p.listingIds.length} linked listing{p.listingIds.length === 1 ? '' : 's'}:{' '}
              {p.listingIds.map((lid) => state.listings.find((l) => l.id === lid)?.code).filter(Boolean).join(', ') || 'none'}
            </div>
          </Card>
        </aside>
      </div>
      <Dialog open={scheduling} onOpenChange={setScheduling} size="sm" title="Schedule article" description={saved.title}>
        <ScheduleForm initial={saved.scheduledAt ?? null} label={saved.title} build={(at) => ({ type: 'blog/schedule', id: saved.id, scheduledAt: at })} onDone={() => setScheduling(false)} />
      </Dialog>
      <Dialog open={sendingBack} onOpenChange={setSendingBack} size="sm" title="Send back to draft" description={saved.title}>
        <SendBackForm label={saved.title} build={(note) => ({ type: 'blog/reject', id: saved.id, by: user.id, note })} onDone={() => setSendingBack(false)} />
      </Dialog>
    </div>
  )
}
