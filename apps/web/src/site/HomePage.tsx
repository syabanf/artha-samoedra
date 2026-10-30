/*
 * Landing page, after the "Real Estate Design" shot by Sujon Hossain on Dribbble: a split photo hero
 * with an ink Jessy card, a search card over the photo, a "who we are" statement, type tiles,
 * a photo grid with a sale and rent switch, and a tabbed close-up. Areas, partners and the journal follow.
 * Photos are Unsplash licence images in apps/web/public: listing covers in listings/, the rest in landing/.
 */
import { fmtDate, fmtIdrShort, isFeatured, nowMs, promoPrice, publicListings } from '@artha/fixtures'
import { Button, cn, FOCUS, NativeSelect, PillTabs } from '@artha/ui'
import { ASSET_TYPE_LABEL, ASSET_TYPES, DEAL_TYPE_LABEL, type AssetType, type DealType, type Listing } from '@artha/types'
import { ArrowRight, ArrowUpRight, MapPin, Search, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { paths } from '../components/links'
import { ASSET_ICON } from '../components/ListingVisual'
import { useDocumentMeta } from '../lib/meta'
import { useAppState } from '../state/store'
import { CountUp, FadeImage, Reveal, ScrollFill, Splash, SplitWords } from './motion'
import { useJessyWidget } from './SiteLayout'
import { AreaCard } from './SitePages'

const BOOK_VISIT = 'I would like to book a site visit'

const PRICE_CAPS = ['1', '2', '5', '10', '20']

const Container = ({ className, children }: { className?: string; children: ReactNode }) => (
  <div className={cn('mx-auto max-w-7xl px-4 sm:px-6', className)}>{children}</div>
)

/** Small white pill laid over a photo. */
const PhotoChip = ({ children }: { children: ReactNode }) => (
  <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold text-foreground backdrop-blur">{children}</span>
)

const SectionTitle = ({ id, children, className }: { id: string; children: ReactNode; className?: string }) => (
  <Reveal>
    <h2 id={id} className={cn('text-3xl font-semibold tracking-tight sm:text-4xl', className)}>
      {children}
    </h2>
  </Reveal>
)

export function HomePage() {
  useDocumentMeta(
    'Artha Samoedra · Verified property, ready to visit',
    'Verified land, houses, shop houses, warehouses and villas in Java and Bali. Every certificate checked before listing. Ask Jessy or book a site visit.',
  )
  const { state } = useAppState()
  const now = nowMs()
  const listings = publicListings(state)
  const rank = (l: Listing) => (isFeatured(state, l.id, now) ? 2 : promoPrice(state, l.id, now) !== null ? 1 : 0)
  const ranked = [...listings].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).sort((a, b) => rank(b) - rank(a))
  const withPhoto = ranked.filter((l) => l.photo)
  const cities = [...new Set(listings.map((l) => l.city))].sort()
  const guides = state.sitePages.filter((p) => p.kind === 'area_guide' && p.published).slice(0, 3)
  const posts = state.blogPosts.filter((p) => p.status === 'published').slice(0, 3)
  const checked = listings.length ? Math.round((listings.filter((l) => l.certificate.trim()).length / listings.length) * 100) : 0

  return (
    <>
      <Splash src={withPhoto[0]?.photo} />
      <section className="bg-card pb-14 sm:pb-20">
        <Container className="pt-2 sm:pt-4">
          <Hero spotlight={withPhoto[0]} second={withPhoto[1]} count={listings.length} cities={cities.length} />
          <Reveal delay={600} className="relative z-10">
            <SearchCard cities={cities} />
          </Reveal>
        </Container>
      </section>

      <WhoWeAre
        photo={withPhoto[2]?.photo ?? '/landing/showcase.jpg'}
        inline={withPhoto[3]?.photo ?? '/landing/hero.jpg'}
        stats={[
          [listings.length, '', 'Properties on the market'],
          [cities.length, '', 'Cities in Java and Bali'],
          [state.partners.length, '', 'Owners and developers'],
          [checked, '%', 'Certificates checked'],
        ]}
      />

      <Categories listings={listings} />

      {withPhoto.length > 0 && <PhotoGrid listings={withPhoto} />}

      {withPhoto.length > 0 && <CloseUp listings={withPhoto} />}

      {guides.length > 0 && (
        <section aria-labelledby="areas-heading" className="bg-surface py-16 sm:py-20">
          <Container>
            <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-end">
              <SectionTitle id="areas-heading">Know the area before you visit</SectionTitle>
              <p className="text-sm text-muted md:justify-self-end md:text-right">
                Guides from our agents on the ground: where buyers look, what drives the price, and which permits to check.{' '}
                <Link to={paths.areas} className="font-semibold text-foreground underline-offset-4 hover:underline">
                  All area guides
                </Link>
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:grid-rows-2">
              {guides.map((g, i) => (
                <AreaCard
                  key={g.id}
                  page={g}
                  count={listings.filter((l) => l.city === g.city).length}
                  className={cn(i === 0 && guides.length > 1 && 'md:col-span-2 md:row-span-2 md:min-h-[28rem]', guides.length === 1 && 'md:col-span-3')}
                />
              ))}
            </div>
          </Container>
        </section>
      )}

      <PartnerCta />

      {posts.length > 0 && (
        <section aria-labelledby="journal-heading" className="bg-card pt-16 sm:pt-20">
          <Container>
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <SectionTitle id="journal-heading">From the journal</SectionTitle>
              <Button variant="outline" asChild>
                <Link to={paths.blog}>
                  All articles <ArrowRight />
                </Link>
              </Button>
            </div>
            <ol className="grid grid-cols-1 gap-x-8 md:grid-cols-3">
              {posts.map((p, i) => (
                <Reveal as="li" key={p.id} delay={i * 100} className="relative border-t border-foreground/15 py-6">
                  <div className="text-xs uppercase tracking-wider text-muted">{p.publishedAt && fmtDate(p.publishedAt)}</div>
                  <h3 className="mt-3 text-xl font-semibold leading-snug tracking-tight">
                    <Link
                      to={paths.blogPost(p.slug)}
                      className="after:absolute after:inset-0 hover:underline focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:ring-2 focus-visible:after:ring-accent/40"
                    >
                      {p.title}
                    </Link>
                  </h3>
                  <p className="mt-3 line-clamp-3 text-sm text-muted">{p.excerpt}</p>
                </Reveal>
              ))}
            </ol>
          </Container>
        </section>
      )}
    </>
  )
}

const HERO_LINKS = [
  { label: 'All properties', to: paths.assets },
  { label: 'For sale', to: `${paths.assets}?deal=jual` },
  { label: 'For rent', to: `${paths.assets}?deal=sewa` },
  { label: 'Land', to: `${paths.assets}?type=tanah` },
]

function Hero({ spotlight: l, second, count, cities }: { spotlight?: Listing; second?: Listing; count: number; cities: number }) {
  const widget = useJessyWidget()
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10">
      <div className="flex min-w-0 flex-col gap-6 lg:order-2 lg:pt-6">
        <h1 className="text-4xl font-semibold leading-[1.02] tracking-tight sm:text-5xl xl:text-6xl">
          <SplitWords text="Find verified property, then visit it with us" base={150} />
        </h1>
        <Reveal delay={500}>
          <p className="max-w-lg text-sm text-muted sm:text-base">
            {count} homes, plots and warehouses in {cities} cities. Our team reads every certificate before a listing goes live.
          </p>
        </Reveal>
        <nav aria-label="Quick browse" className="flex flex-wrap gap-2">
          {HERO_LINKS.map((h, i) => (
            <Link
              key={h.label}
              to={h.to}
              style={{ animationDelay: `${650 + i * 80}ms` }}
              className={cn(
                'rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors animate-in fade-in zoom-in-90 fill-mode-both duration-500',
                i === 0 ? 'border-foreground text-foreground' : 'border-border text-muted hover:border-foreground/40 hover:text-foreground',
                FOCUS,
              )}
            >
              {h.label}
            </Link>
          ))}
        </nav>
        <Reveal delay={750} variant="scale" className="mt-auto">
        <div className="relative isolate grid grid-cols-1 gap-4 overflow-hidden rounded-card bg-ink p-4 text-on-ink shadow-float sm:grid-cols-[minmax(0,1fr)_11rem] sm:p-5">
          <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 -z-10 size-56 rounded-full bg-accent/30 blur-3xl" />
          <div className="flex min-w-0 flex-col items-start gap-2">
            <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold">Jessy, our assistant</span>
            <h2 className="text-lg font-semibold leading-snug">Ask about a home and book the visit in one chat</h2>
            <p className="text-xs text-on-ink-muted">Price, paperwork and road access, answered any hour. A named agent takes it from there.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" className="bg-card text-foreground shadow-none hover:bg-surface" onClick={() => widget.open(null, BOOK_VISIT)}>
                Book a visit
              </Button>
              <Button size="sm" variant="onInk" onClick={() => widget.open()}>
                <Sparkles />
                Ask Jessy
              </Button>
            </div>
          </div>
          {second?.photo && (
            <div className="shimmer hidden overflow-hidden rounded-2xl bg-ink-3 sm:block">
              <FadeImage src={second.photo} alt="" className="h-full min-h-32 w-full object-cover" />
            </div>
          )}
        </div>
        </Reveal>
      </div>

      <Reveal variant="clip" delay={100} className="relative min-w-0 lg:order-1">
        <div className="shimmer relative isolate aspect-[4/5] overflow-hidden rounded-hero bg-ink-3 sm:aspect-[4/3] lg:aspect-auto lg:h-full lg:min-h-[34rem]">
          {l?.photo && <FadeImage src={l.photo} alt={`Photo of ${l.title}`} fetchPriority="high" className="kenburns absolute inset-0 -z-10 size-full object-cover" />}
          <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
          {l && (
            <>
              <div className="absolute left-4 top-4 flex flex-wrap gap-1.5 sm:left-5 sm:top-5">
                <PhotoChip>{ASSET_TYPE_LABEL[l.type]}</PhotoChip>
                <PhotoChip>{DEAL_TYPE_LABEL[l.deal]}</PhotoChip>
                <PhotoChip>{l.certificate} certificate</PhotoChip>
              </div>
              <Link
                to={paths.asset(l.slug)}
                className={cn('absolute bottom-24 left-4 right-4 flex items-end justify-between gap-4 text-white sm:bottom-28 sm:left-6 sm:right-6 lg:bottom-28', FOCUS)}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1 text-xs text-white/80">
                    <MapPin className="size-3.5" />
                    {l.district}, {l.city}
                  </span>
                  <span className="mt-1 block line-clamp-2 text-xl font-semibold leading-snug sm:text-2xl">{l.title}</span>
                </span>
                <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-bold text-foreground tabular-nums">{fmtIdrShort(l.price)}</span>
              </Link>
            </>
          )}
        </div>
      </Reveal>
    </div>
  )
}

function SearchCard({ cities }: { cities: string[] }) {
  const navigate = useNavigate()
  const [deal, setDeal] = useState('')
  const [max, setMax] = useState('')
  const [type, setType] = useState('')
  const [city, setCity] = useState('')
  const field = 'text-[11px] font-semibold uppercase tracking-wider text-muted'
  return (
    <form
      role="search"
      aria-label="Find a property"
      className="relative z-10 mx-2 -mt-20 rounded-card bg-card p-5 shadow-float sm:mx-6 sm:p-6 lg:mr-[48%]"
      onSubmit={(e) => {
        e.preventDefault()
        const q = new URLSearchParams(Object.entries({ deal, max, type, city }).filter(([, v]) => v))
        navigate(q.size ? `${paths.assets}?${q}` : paths.assets)
      }}
    >
      <div className="text-base font-semibold">Find the best place</div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={field}>Looking to</span>
          <NativeSelect value={deal} onChange={(e) => setDeal(e.target.value)}>
            <option value="">Any</option>
            {(['jual', 'sewa'] as DealType[]).map((d) => (
              <option key={d} value={d}>
                {d === 'jual' ? 'Buy' : 'Rent'}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={field}>Price</span>
          <NativeSelect value={max} onChange={(e) => setMax(e.target.value)}>
            <option value="">Any price</option>
            {PRICE_CAPS.map((m) => (
              <option key={m} value={m}>
                Up to Rp {m} B
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={field}>Property type</span>
          <NativeSelect value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Any type</option>
            {ASSET_TYPES.map((t) => (
              <option key={t} value={t}>
                {ASSET_TYPE_LABEL[t]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5">
          <span className={field}>Location</span>
          <NativeSelect value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="">Any city</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </NativeSelect>
        </label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-semibold text-muted">Popular:</span>
          {(['rumah', 'villa', 'gudang'] as AssetType[]).map((t) => {
            const Icon = ASSET_ICON[t]
            return (
              <Link
                key={t}
                to={`${paths.assets}?type=${t}`}
                className={cn('flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-semibold hover:bg-surface', FOCUS)}
              >
                <Icon className="size-3.5" />
                {ASSET_TYPE_LABEL[t]}
              </Link>
            )
          })}
        </div>
        <Button type="submit" variant="secondary" className="w-full sm:w-auto">
          <Search />
          Search properties
        </Button>
      </div>
    </form>
  )
}

function WhoWeAre({ photo, inline, stats }: { photo: string; inline: string; stats: [number, string, string][] }) {
  return (
    <section aria-labelledby="who-heading" className="bg-card pb-16 sm:pb-20">
      <Container>
        <div className="grid grid-cols-1 gap-8 border-t border-border pt-14 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-14">
          <div className="flex flex-row items-start gap-4 lg:flex-col">
            <Reveal>
              <h2 id="who-heading" className="shrink-0 rounded-full border border-border px-4 py-1.5 text-xs font-semibold">
                Who we are
              </h2>
            </Reveal>
            <Reveal variant="clip" delay={150} className="ml-auto w-40 sm:w-56 lg:ml-0 lg:w-full">
              <div className="shimmer overflow-hidden rounded-2xl bg-surface-2">
                <FadeImage src={photo} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </div>
            </Reveal>
          </div>
          <div className="min-w-0">
            <ScrollFill
              className="text-2xl font-medium leading-snug tracking-tight sm:text-4xl sm:leading-tight"
              parts={[
                'We read the certificate before a listing goes live',
                <img src={inline} alt="" loading="lazy" className="inline-block h-[1.1em] w-[1.8em] rotate-6 rounded-xl object-cover align-[-0.15em] shadow-card transition-transform duration-500 hover:rotate-0 hover:scale-125" />,
                'and Jessy answers you day and night. One team takes you from the first chat to the keys, with one price and a clear exclusive period.',
              ]}
            />
            <Reveal delay={100}>
              <Button variant="secondary" className="mt-8" asChild>
                <Link to={paths.sitePage('about')}>
                  More about us <ArrowRight />
                </Link>
              </Button>
            </Reveal>
            <dl className="mt-12 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
              {stats.map(([value, suffix, caption], i) => (
                <Reveal key={caption} delay={i * 90} className="flex min-w-0 flex-col-reverse">
                  <dt className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{caption}</dt>
                  <dd className="text-4xl font-semibold tracking-tight tabular-nums sm:text-5xl">
                    <CountUp value={value} suffix={suffix} />
                  </dd>
                </Reveal>
              ))}
            </dl>
          </div>
        </div>
      </Container>
    </section>
  )
}

function Categories({ listings }: { listings: Listing[] }) {
  const count = (t: AssetType) => listings.filter((l) => l.type === t).length
  const top = [...ASSET_TYPES].sort((a, b) => count(b) - count(a))[0]
  return (
    <section aria-labelledby="types-heading" className="bg-surface py-16 sm:py-20">
      <Container>
        <SectionTitle id="types-heading" className="text-center">
          Browse by type
        </SectionTitle>
        <ul className="mx-auto mt-8 grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {ASSET_TYPES.map((t, i) => {
            const Icon = ASSET_ICON[t]
            const n = count(t)
            return (
              <Reveal as="li" key={t} delay={i * 70} variant="scale">
                <Link
                  to={`${paths.assets}?type=${t}`}
                  className={cn(
                    'flex h-full flex-col items-center gap-2 rounded-2xl px-3 py-5 text-center transition-[background-color,translate,box-shadow] duration-300 hover:-translate-y-1',
                    t === top ? 'bg-ink text-on-ink shadow-float' : 'bg-card shadow-card hover:bg-surface-2',
                    FOCUS,
                  )}
                >
                  <Icon className={cn('size-5', t === top ? 'text-accent' : 'text-muted')} />
                  <span className="text-sm font-semibold">{ASSET_TYPE_LABEL[t]}</span>
                  <span className={cn('text-xs', t === top ? 'text-on-ink-muted' : 'text-muted')}>
                    {n} {n === 1 ? 'listing' : 'listings'}
                  </span>
                </Link>
              </Reveal>
            )
          })}
        </ul>
      </Container>
    </section>
  )
}

function PhotoGrid({ listings }: { listings: Listing[] }) {
  const { state } = useAppState()
  const now = nowMs()
  const [deal, setDeal] = useState<DealType>('jual')
  const rows = listings.filter((l) => l.deal === deal).slice(0, 6)
  return (
    <section aria-labelledby="featured-heading" className="bg-card py-16 sm:py-20">
      <Container>
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <SectionTitle id="featured-heading">Ready to visit this week</SectionTitle>
          <PillTabs
            label="Sale or rent"
            size="sm"
            value={deal}
            onChange={setDeal}
            items={[
              { value: 'jual', label: 'Buying' },
              { value: 'sewa', label: 'Renting' },
            ]}
          />
        </div>
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((l, i) => {
            const promo = promoPrice(state, l.id, now)
            const tag = isFeatured(state, l.id, now) ? 'Featured' : promo !== null ? 'Price drop' : l.status === 'reserved' ? 'Reserved' : 'Ready to visit'
            return (
              <Reveal as="li" key={l.id} delay={(i % 3) * 110} className="shimmer group relative isolate aspect-[4/5] overflow-hidden rounded-card bg-ink-3 sm:aspect-[5/6]">
                <FadeImage src={l.photo!} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover transition-[opacity,scale] duration-700 group-hover:scale-110" />
                <div className="absolute inset-0 -z-10 bg-gradient-to-t from-ink/85 via-ink/10 to-transparent" />
                <span className="absolute right-4 top-4">
                  <PhotoChip>{tag}</PhotoChip>
                </span>
                <div className="absolute inset-x-4 bottom-4 text-white">
                  <div className="flex items-center gap-1 text-xs text-white/75">
                    <MapPin className="size-3.5" />
                    {l.district}, {l.city}
                  </div>
                  <h3 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug">
                    <Link to={paths.asset(l.slug)} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-white/70">
                      {l.title}
                    </Link>
                  </h3>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-foreground tabular-nums">
                      {fmtIdrShort(promo ?? l.price)}
                      {l.deal === 'sewa' && <span className="font-semibold text-muted"> /yr</span>}
                    </span>
                    {promo !== null && <s className="text-xs text-white/70 tabular-nums">{fmtIdrShort(l.price)}</s>}
                  </div>
                </div>
              </Reveal>
            )
          })}
        </ul>
        <div className="mt-8 flex justify-center">
          <Button variant="outline" asChild>
            <Link to={`${paths.assets}?deal=${deal}`}>
              All {DEAL_TYPE_LABEL[deal].toLowerCase()} <ArrowRight />
            </Link>
          </Button>
        </div>
      </Container>
    </section>
  )
}

function CloseUp({ listings }: { listings: Listing[] }) {
  const types = ASSET_TYPES.filter((t) => listings.some((l) => l.type === t))
  const [type, setType] = useState<AssetType>(types.includes('villa') ? 'villa' : types[0])
  const l = listings.find((x) => x.type === type)!
  return (
    <section aria-labelledby="closeup-heading" className="bg-card pb-16 sm:pb-20">
      <Container>
        <SectionTitle id="closeup-heading" className="text-center">
          See the place <span className="text-silver">before you drive out</span>
        </SectionTitle>
        <div className="mt-6 flex justify-center">
          <PillTabs
            label="Property type"
            size="sm"
            className="no-scrollbar max-w-full overflow-x-auto"
            value={type}
            onChange={setType}
            items={types.map((t) => ({ value: t, label: ASSET_TYPE_LABEL[t] }))}
          />
        </div>
        <Reveal variant="clip" className="shimmer relative isolate mt-6 aspect-[4/5] overflow-hidden rounded-hero bg-ink-3 sm:aspect-[16/9] lg:aspect-[21/9]">
          <FadeImage key={l.id} src={l.photo!} alt={`Photo of ${l.title}`} loading="lazy" className="kenburns absolute inset-0 -z-10 size-full object-cover" />
          <div className="absolute bottom-4 left-4 max-w-[calc(100%-8rem)] rounded-2xl bg-white/75 p-4 backdrop-blur sm:bottom-6 sm:left-6 sm:max-w-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {l.district}, {l.city}
            </div>
            <Link to={paths.asset(l.slug)} className={cn('mt-1 line-clamp-2 block font-semibold leading-snug hover:underline', FOCUS)}>
              {l.title}
            </Link>
          </div>
          <Link
            to={`${paths.assets}?type=${type}`}
            className={cn(
              'absolute bottom-4 right-4 flex size-24 flex-col items-center justify-center gap-1 rounded-full bg-white/85 text-xs font-semibold text-foreground backdrop-blur transition-colors hover:bg-white sm:bottom-6 sm:right-6 sm:size-28',
              FOCUS,
            )}
          >
            <ArrowUpRight className="size-4" />
            View all
          </Link>
        </Reveal>
      </Container>
    </section>
  )
}

const STEPS = ['Send the type, place, price and paperwork to Jessy', 'Our team checks the certificate and publishes within a day', 'Follow views, leads and your earnings on the partner dashboard']

function PartnerCta() {
  return (
    <section aria-labelledby="partner-heading" className="bg-ink-2 py-16 text-on-ink sm:py-20">
      <Container className="grid grid-cols-1 gap-10 md:grid-cols-2 md:items-center">
        <div className="min-w-0">
          <p className="text-sm text-on-ink-muted">For owners, agents and developers</p>
          <h2 id="partner-heading" className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Own a property? We market it for you.
          </h2>
          <p className="mt-4 max-w-md text-sm text-on-ink-muted">One conversation lists it, one message withdraws it. You keep the exclusive period and the price in view.</p>
          <div className="mt-8 flex flex-wrap gap-2">
            <Button className="bg-card text-foreground shadow-none hover:bg-surface" asChild>
              <Link to={paths.partnerPortal}>
                List your property <ArrowRight />
              </Link>
            </Button>
            <Button variant="onInk" asChild>
              <Link to={paths.partnerDashboard}>Partner dashboard</Link>
            </Button>
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
          <Reveal variant="clip" className="shimmer overflow-hidden rounded-hero bg-ink-3">
            <FadeImage
              src="/landing/partner.jpg"
              alt="An owner holding the keys to their house"
              loading="lazy"
              className="aspect-[4/3] w-full object-cover sm:aspect-[4/5] md:aspect-[16/9] lg:aspect-[4/5]"
            />
          </Reveal>
          <ol className="space-y-6">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s} delay={i * 120} className="flex gap-5 border-t border-white/15 pt-6">
                <span className="text-3xl font-semibold leading-none text-accent tabular-nums">0{i + 1}</span>
                <span className="text-sm text-on-ink-muted">{s}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </Container>
    </section>
  )
}
