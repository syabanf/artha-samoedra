import { fmtDateLong } from '@artha/fixtures'
import { Badge, Button, Card, EmptyState, Kicker } from '@artha/ui'
import { Sparkles } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { JsonLd } from '../components/JsonLd'
import { paths } from '../components/links'
import { Markdown } from '../components/Markdown'
import { useDocumentMeta } from '../lib/meta'
import { useAppState } from '../state/store'
import { ListingCard } from './ListingCard'
import { SiteContainer } from './SiteLayout'

export function BlogPage() {
  useDocumentMeta('Property blog · Artha Samoedra', 'Guides to buying, renting and investing in property in Indonesia from the Artha Samoedra team.')
  const { state } = useAppState()
  const posts = state.blogPosts.filter((p) => p.status === 'published')
  return (
    <SiteContainer className="max-w-4xl pt-8">
      <h1 className="text-3xl font-bold tracking-tight">
        Property blog<span className="text-accent">.</span>
      </h1>
      <p className="mt-1 text-sm text-muted">Practical guides drawn from Artha Samoedra listing data.</p>
      <div className="mt-6 space-y-4">
        {posts.length ? (
          posts.map((p) => (
            <Card key={p.id} className="relative p-6 transition-colors hover:bg-surface-2">
              <div className="text-xs text-muted">{p.publishedAt && fmtDateLong(p.publishedAt)}</div>
              <h2 className="mt-2 text-xl font-semibold leading-snug">
                <Link
                  to={paths.blogPost(p.slug)}
                  className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
                >
                  {p.title}
                </Link>
              </h2>
              <p className="mt-2 text-sm text-muted">{p.excerpt}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.keywords.slice(0, 3).map((k) => (
                  <Badge key={k} variant="muted">
                    {k}
                  </Badge>
                ))}
              </div>
            </Card>
          ))
        ) : (
          <EmptyState title="No articles yet" description="Articles appear here once the marketing team publishes them." />
        )}
      </div>
    </SiteContainer>
  )
}

export function BlogPostPage() {
  const { slug } = useParams()
  const { state } = useAppState()
  const post = state.blogPosts.find((p) => p.slug === slug && p.status === 'published')
  useDocumentMeta(post?.metaTitle ?? 'Article not found · Artha Samoedra', post?.metaDescription)

  if (!post) {
    return (
      <SiteContainer className="max-w-3xl pt-10">
        <Card>
          <EmptyState
            pageTitle
            title="Article not found"
            description="This article is not published yet or its address has changed."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to={paths.blog}>Go to the blog</Link>
              </Button>
            }
          />
        </Card>
      </SiteContainer>
    )
  }

  const listings = post.listingIds
    .map((id) => state.listings.find((l) => l.id === id))
    .filter((l) => l && (l.status === 'active' || l.status === 'reserved'))

  return (
    <SiteContainer className="max-w-3xl pt-8">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Article',
              headline: post.title,
              description: post.metaDescription,
              datePublished: post.publishedAt,
              keywords: post.keywords.join(', '),
              author: { '@type': 'Organization', name: 'Artha Samoedra' },
            },
            {
              '@type': 'FAQPage',
              mainEntity: post.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
            },
          ],
        }}
      />
      <Link to={paths.blog} className="text-xs text-muted hover:text-foreground hover:underline">
        Blog
      </Link>
      <h1 className="mt-2 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{post.title}</h1>
      <div className="mt-2 text-sm text-muted">{post.publishedAt && fmtDateLong(post.publishedAt)} · Artha Samoedra team</div>

      <Card variant="soft" className="mt-6 border-l-4 border-accent p-5">
        <Kicker>Short answer</Kicker>
        <p className="mt-2 text-[15px] leading-relaxed">{post.geoSummary}</p>
      </Card>

      <article className="mt-8">
        <Markdown text={post.body} />
      </article>

      {post.faq.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xl font-bold tracking-tight">Frequently asked questions</h2>
          <div className="mt-4 space-y-2">
            {post.faq.map((f) => (
              <details key={f.q} className="group rounded-2xl bg-card p-4 shadow-card">
                <summary className="cursor-pointer list-none font-semibold marker:hidden">{f.q}</summary>
                <p className="mt-2 text-sm text-body">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      {listings.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-bold tracking-tight">Related properties</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {listings.map((l) => l && <ListingCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      <Card variant="ink" className="mt-10 flex flex-wrap items-center gap-4 p-6">
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Still have questions?</div>
          <div className="text-sm text-on-ink-muted">Jessy can help with prices, paperwork and site visits.</div>
        </div>
        <Sparkles className="size-6 text-accent" aria-hidden />
      </Card>
    </SiteContainer>
  )
}
