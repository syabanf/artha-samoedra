import { fmtDate, publicListings } from '@artha/fixtures'
import { Button, Card, cn, EmptyState, FOCUS, Kicker } from '@artha/ui'
import type { SitePage } from '@artha/types'
import { ArrowUpRight, MapPin } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { paths } from '../components/links'
import { Markdown } from '../components/Markdown'
import { useDocumentMeta } from '../lib/meta'
import { useAppState } from '../state/store'
import { ListingCard } from './ListingCard'
import { SiteContainer } from './SiteLayout'

/** Area photo at /landing/area-<slug>.jpg over an ink gradient that shows while it loads. */
export const areaBackground = (slug: string) => ({
  backgroundImage: `url(/landing/area-${slug}.jpg), radial-gradient(90% 70% at 85% 15%, color-mix(in srgb, var(--color-accent) 28%, transparent), transparent 65%), linear-gradient(165deg, var(--color-ink-3), var(--color-ink))`,
  backgroundSize: 'cover',
  backgroundPosition: 'center',
})

/** Photo card for one area guide: used on /areas and in the landing collage. */
export function AreaCard({ page, count, className }: { page: SitePage; count: number; className?: string }) {
  return (
    <Link
      to={paths.area(page.slug)}
      style={areaBackground(page.slug)}
      className={cn(
        'group relative flex min-h-60 flex-col justify-end overflow-hidden rounded-hero p-6 text-on-ink shadow-card motion-safe:transition-transform motion-safe:hover:-translate-y-0.5',
        FOCUS,
        className,
      )}
    >
      <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent" />
      <span className="relative">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-on-ink-muted">
          <MapPin className="size-3.5" />
          {page.city} · {count} {count === 1 ? 'property' : 'properties'}
        </span>
        <span className="mt-2 block font-display text-2xl font-medium leading-tight sm:text-3xl">{page.title}</span>
        <span className="mt-2 line-clamp-2 block max-w-md text-sm text-on-ink-muted">{page.summary}</span>
      </span>
      <ArrowUpRight className="absolute right-5 top-5 size-5 text-on-ink-muted motion-safe:transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5" />
    </Link>
  )
}

const notFound = (title: string) => (
  <SiteContainer className="pt-10">
    <Card>
      <EmptyState
        title={title}
        description="This page was moved or is not published yet."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link to={paths.home}>Back to the home page</Link>
          </Button>
        }
      />
    </Card>
  </SiteContainer>
)

export function SitePagePublic() {
  const { slug } = useParams()
  const { state } = useAppState()
  const page = state.sitePages.find((p) => p.slug === slug && p.published)
  useDocumentMeta(page ? `${page.title} · Artha Samoedra` : 'Page not found · Artha Samoedra', page?.summary)
  if (!page) return notFound('Page not found')
  if (page.kind === 'area_guide') return <AreaGuide page={page} />
  return (
    <SiteContainer className="pt-10">
      <article className="mx-auto max-w-2xl">
        <h1 className="font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">{page.title}</h1>
        <p className="mt-4 text-lg text-muted">{page.summary}</p>
        <div className="mt-8 border-t border-border pt-8">
          <Markdown text={page.body} />
        </div>
        <p className="mt-10 text-xs text-muted">Last updated {fmtDate(page.updatedAt)}</p>
      </article>
    </SiteContainer>
  )
}

export function AreasPage() {
  useDocumentMeta('Area guides · Artha Samoedra', 'Where to buy or rent in Java and Bali: area guides with live listings, prices and licences to check.')
  const { state } = useAppState()
  const live = publicListings(state)
  const guides = state.sitePages.filter((p) => p.kind === 'area_guide' && p.published)
  return (
    <SiteContainer className="pt-10">
      <Kicker>Area guides</Kicker>
      <h1 className="mt-2 max-w-2xl font-display text-4xl font-medium leading-tight tracking-tight sm:text-5xl">Know the area before you visit</h1>
      <p className="mt-3 max-w-xl text-sm text-muted">Our agents write these from the ground: where buyers look, what prices follow, and which permits to check.</p>
      {guides.length ? (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          {guides.map((g) => (
            <AreaCard key={g.id} page={g} count={live.filter((l) => l.city === g.city).length} className="min-h-72" />
          ))}
        </div>
      ) : (
        <Card className="mt-8">
          <EmptyState title="No area guides yet" description="Browse all properties while our team writes the first guides." />
        </Card>
      )}
    </SiteContainer>
  )
}

export function AreaGuidePage() {
  const { slug } = useParams()
  const { state } = useAppState()
  const page = state.sitePages.find((p) => p.slug === slug && p.kind === 'area_guide' && p.published)
  useDocumentMeta(page ? `${page.title} · Area guide · Artha Samoedra` : 'Area guide not found · Artha Samoedra', page?.summary)
  if (!page) return notFound('Area guide not found')
  return <AreaGuide page={page} />
}

function AreaGuide({ page }: { page: SitePage }) {
  const { state } = useAppState()
  const listings = publicListings(state).filter((l) => l.city === page.city)
  return (
    <SiteContainer className="pt-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted">
        <Link to={paths.areas} className="hover:text-foreground hover:underline">
          Area guides
        </Link>
        <span className="mx-1.5">/</span>
        <span aria-current="page" className="font-medium text-foreground">
          {page.city}
        </span>
      </nav>
      <header style={areaBackground(page.slug)} className="relative isolate overflow-hidden rounded-hero px-6 pb-8 pt-28 text-on-ink sm:px-10 sm:pt-40">
        <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 to-transparent" />
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-on-ink-muted">
          <MapPin className="size-3.5" />
          {page.city}
        </span>
        <h1 className="mt-2 max-w-3xl font-display text-4xl font-medium leading-tight tracking-tight sm:text-6xl">{page.title}</h1>
        <p className="mt-3 max-w-xl text-sm text-on-ink-muted sm:text-base">{page.summary}</p>
      </header>
      <div className="mx-auto mt-10 max-w-2xl">
        <Markdown text={page.body} />
      </div>
      <section className="mt-12" aria-labelledby="area-listings">
        <h2 id="area-listings" className="mb-5 font-display text-3xl font-medium tracking-tight">
          Live in {page.city}
        </h2>
        {listings.length ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState
              compact
              title={`No live listings in ${page.city} right now`}
              description="Ask Jessy to tell you when one comes up, or browse other cities."
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to={paths.assets}>All properties</Link>
                </Button>
              }
            />
          </Card>
        )}
      </section>
    </SiteContainer>
  )
}
