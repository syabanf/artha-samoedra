import { fmtAgo, newId, nowIso, publicListings, slugify } from '@artha/fixtures'
import {
  Badge,
  Button,
  Card,
  CardTitle,
  Chip,
  ChipRow,
  DataTable,
  Dialog,
  DialogFooter,
  EmptyState,
  FormField,
  Input,
  NativeSelect,
  PageHeader,
  Switch,
  Textarea,
  type Column,
} from '@artha/ui'
import { PAGE_KIND_LABEL, type PageKind, type SitePage } from '@artha/types'
import { ExternalLink, Plus, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../../auth/auth'
import { BackButton } from '../../components/BackButton'
import { paths } from '../../components/links'
import { Markdown } from '../../components/Markdown'
import { NoAccess } from '../../components/NoAccess'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'

const KINDS = Object.keys(PAGE_KIND_LABEL) as PageKind[]

/** Area guides live under /areas, every other page under /p. */
const publicPath = (p: Pick<SitePage, 'kind' | 'slug'>) => (p.kind === 'area_guide' ? paths.area(p.slug) : paths.sitePage(p.slug))

const PublishedBadge = ({ published }: { published: boolean }) =>
  published ? <Badge variant="success">Published</Badge> : <Badge variant="outline">Draft</Badge>

export function CmsPagesPage() {
  const { state } = useAppState()
  const { can } = useAuth()
  const navigate = useNavigate()
  const [kind, setKind] = useState<PageKind | null>(null)
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const rows = state.sitePages.filter(
    (p) => (!kind || p.kind === kind) && (!needle || `${p.title} ${p.slug} ${p.city ?? ''}`.toLowerCase().includes(needle)),
  )
  const count = (k: PageKind) => state.sitePages.filter((p) => p.kind === k).length
  const filtered = !!kind || !!needle
  const clear = () => {
    setKind(null)
    setQ('')
  }

  const columns: Column<SitePage>[] = [
    {
      id: 'title',
      header: 'Page',
      sortValue: (p) => p.title,
      cell: (p) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold">{p.title}</div>
          <div className="truncate font-mono text-[11px] text-muted">{publicPath(p)}</div>
        </div>
      ),
    },
    { id: 'kind', header: 'Kind', hideBelow: 'sm', sortValue: (p) => p.kind, cell: (p) => <span className="text-sm">{PAGE_KIND_LABEL[p.kind]}{p.city && <span className="text-muted"> · {p.city}</span>}</span> },
    { id: 'state', header: 'State', hideBelow: 'md', cell: (p) => <PublishedBadge published={p.published} /> },
    { id: 'updated', header: 'Updated', align: 'right', sortValue: (p) => p.updatedAt, cell: (p) => <span className="text-xs text-muted">{fmtAgo(p.updatedAt)}</span> },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Website pages"
        description="About, contact, legal pages and area guides on the public site. Area guides list the live properties in their city."
        className="mb-2 [&>div:last-child]:w-full sm:[&>div:last-child]:w-auto"
        actions={
          <>
            <Input
              variant="pill"
              icon={<Search />}
              aria-label="Search pages"
              placeholder="Title, link or city"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-w-0 flex-1 sm:w-64 sm:flex-none"
              right={q ? <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setQ('')}><X /></Button> : undefined}
            />
            {can('cms.manage') && (
              <Button onClick={() => navigate(paths.cmsPage('new'))}>
                <Plus />
                New page
              </Button>
            )}
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <ChipRow className="flex-1">
          <Chip active={!kind} count={state.sitePages.length} onClick={() => setKind(null)}>
            All
          </Chip>
          {KINDS.map((k) => (
            <Chip key={k} active={kind === k} count={count(k)} onClick={() => setKind(kind === k ? null : k)}>
              {PAGE_KIND_LABEL[k]}
            </Chip>
          ))}
        </ChipRow>
        {filtered && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {state.sitePages.length}
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
        onRowClick={(p) => navigate(paths.cmsPage(p.id))}
        initialSort={{ id: 'updated', desc: true }}
        resetPageKey={`${kind}|${needle}`}
        empty={
          filtered ? (
            <EmptyState compact title="No matching pages" description="Change the search or clear the filters." action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
          ) : (
            <EmptyState compact title="No pages yet" description="Create the About page or a first area guide." />
          )
        }
      />
    </div>
  )
}

const blankPage = (): SitePage => ({
  id: newId('pg'),
  slug: '',
  kind: 'about',
  title: '',
  summary: '',
  body: '',
  city: null,
  published: false,
  updatedAt: nowIso(),
})

export function CmsPageEditor() {
  const { id } = useParams()
  const { state } = useAppState()
  const { can } = useAuth()
  if (id === 'new') {
    if (!can('cms.manage')) return <NoAccess action={<BackButton fallback={paths.cmsPages} />} />
    return <PageEditor saved={null} />
  }
  const saved = state.sitePages.find((p) => p.id === id)
  if (!saved) {
    return (
      <Card>
        <EmptyState pageTitle title="Page not found" action={<BackButton fallback={paths.cmsPages} />} />
      </Card>
    )
  }
  return <PageEditor key={saved.id} saved={saved} />
}

/** Compare drafts without the timestamp the store stamps on save. */
const same = (a: SitePage, b: SitePage) => JSON.stringify({ ...a, updatedAt: '' }) === JSON.stringify({ ...b, updatedAt: '' })

function PageEditor({ saved }: { saved: SitePage | null }) {
  const { state } = useAppState()
  const { can } = useAuth()
  const act = useAct()
  const navigate = useNavigate()
  const [p, setP] = useState<SitePage>(() => saved ?? blankPage())
  const [tried, setTried] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const readOnly = !can('cms.manage')
  const dirty = !saved || !same(p, saved)
  const set = <K extends keyof SitePage>(k: K, v: SitePage[K]) => setP({ ...p, [k]: v })
  const cities = [...new Set(publicListings(state).map((l) => l.city))].sort()

  const errors = {
    title: p.title.trim() ? undefined : 'Enter a title.',
    slug: p.slug ? undefined : 'Enter the link, for example "about".',
    city: p.kind !== 'area_guide' || p.city ? undefined : 'Pick the city whose listings appear under the guide.',
  }
  const invalid = Object.values(errors).some(Boolean)

  const save = (next: SitePage) => {
    setTried(true)
    if (invalid) return false
    const page = { ...next, city: next.kind === 'area_guide' ? next.city : null }
    const ok = act({ type: 'pages/upsert', page }, saved ? 'Page saved' : 'Page created', page.title)
    if (ok && !saved) navigate(paths.cmsPage(page.id), { replace: true })
    return ok
  }
  const togglePublished = (published: boolean) => {
    const next = { ...p, published }
    setP(next)
    // A saved page publishes at once; a new page publishes on its first save.
    if (saved) act({ type: 'pages/upsert', page: { ...saved, published } }, published ? 'Page published' : 'Page moved to draft', publicPath(saved))
  }

  return (
    <div className="space-y-4">
      <BackButton fallback={paths.cmsPages} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {saved ? <PublishedBadge published={saved.published} /> : <Badge variant="outline">New page</Badge>}
          <h1 className="mt-1 truncate text-2xl font-bold tracking-tight">{saved?.title || 'New page'}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saved?.published && (
            <Button variant="outline" asChild>
              <a href={publicPath(saved)} target="_blank" rel="noreferrer">
                <ExternalLink />
                View on site
              </a>
            </Button>
          )}
          {!readOnly && saved && (
            <Button variant="ghost" className="text-accent-strong" onClick={() => setDeleting(true)}>
              <Trash2 />
              Delete
            </Button>
          )}
          {!readOnly && (
            <Button disabled={!dirty} onClick={() => save(p)}>
              {saved ? 'Save' : 'Create page'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Title" required error={tried ? errors.title : undefined} className="sm:col-span-2">
              <Input
                value={p.title}
                onChange={(e) => setP({ ...p, title: e.target.value, slug: saved || p.slug !== slugify(p.title) ? p.slug : slugify(e.target.value) })}
              />
            </FormField>
            <FormField label="Link" required error={tried ? errors.slug : undefined} hint={publicPath(p)}>
              <Input value={p.slug} onChange={(e) => set('slug', slugify(e.target.value))} />
            </FormField>
            <FormField label="Kind">
              <NativeSelect value={p.kind} onChange={(e) => set('kind', e.target.value as PageKind)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {PAGE_KIND_LABEL[k]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {p.kind === 'area_guide' && (
              <FormField label="City" required error={tried ? errors.city : undefined} hint="Live listings in this city show under the guide" className="sm:col-span-2">
                <NativeSelect value={p.city ?? ''} onChange={(e) => set('city', e.target.value || null)}>
                  <option value="">Pick a city</option>
                  {[...new Set([...cities, ...(p.city ? [p.city] : [])])].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </NativeSelect>
              </FormField>
            )}
            <FormField label="Summary" hint="Shown under the title and as the search description" className="sm:col-span-2">
              <Textarea className="min-h-20" value={p.summary} onChange={(e) => set('summary', e.target.value)} />
            </FormField>
            <FormField label="Body" hint="## for subheadings, - or 1. for lists, a blank line between paragraphs" className="sm:col-span-2">
              <Textarea className="min-h-80 font-mono text-sm md:text-[13px]" value={p.body} onChange={(e) => set('body', e.target.value)} />
            </FormField>
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 sm:col-span-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">Published</div>
                <div className="text-xs text-muted">{p.published ? `Visible at ${publicPath(p)}` : 'Only the team can see this page'}</div>
              </div>
              <Switch label="Published" checked={p.published} disabled={readOnly} onCheckedChange={togglePublished} />
            </div>
          </fieldset>
        </Card>

        <Card className="p-5 xl:sticky xl:top-0 xl:self-start">
          <CardTitle>Preview</CardTitle>
          <div className="mt-4 rounded-2xl bg-surface-2 p-5">
            <div className="truncate font-mono text-[11px] text-muted">arthasamoedra.id{publicPath(p)}</div>
            <div className="mt-3 break-words font-display text-3xl font-medium leading-tight tracking-tight">{p.title || 'Untitled page'}</div>
            {p.summary && <p className="mt-2 text-muted">{p.summary}</p>}
            <div className="mt-5 border-t border-border pt-5">
              {p.body.trim() ? <Markdown text={p.body} /> : <p className="text-sm text-muted">The body preview shows here as you type.</p>}
            </div>
          </div>
        </Card>
      </div>

      {saved && (
        <Dialog open={deleting} onOpenChange={setDeleting} title="Delete this page?" description={`${saved.title} leaves the website and its link stops working.`}>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (act({ type: 'pages/remove', id: saved.id }, 'Page deleted', saved.title)) navigate(paths.cmsPages)
              }}
            >
              <Trash2 />
              Delete page
            </Button>
          </DialogFooter>
        </Dialog>
      )}
    </div>
  )
}
