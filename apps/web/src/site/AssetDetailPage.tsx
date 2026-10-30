import { fmtArea, fmtIdr, fmtIdrShort, isFeatured, nowMs, promoPrice, publicListings, savedFor } from '@artha/fixtures'
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, KeyValue, toast } from '@artha/ui'
import { ASSET_TYPE_LABEL, DEAL_TYPE_LABEL, PUBLIC_LISTING_STATUSES } from '@artha/types'
import { CalendarCheck, Check, Heart, MapPin, Sparkles, Star } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { JsonLd } from '../components/JsonLd'
import { paths } from '../components/links'
import { ListingVisual } from '../components/ListingVisual'
import { useDocumentMeta } from '../lib/meta'
import { useAppState } from '../state/store'
import { useBuyerPhone } from './BuyerPortalPage'
import { ListingCard } from './ListingCard'
import { SiteContainer, useJessyWidget } from './SiteLayout'

export function AssetDetailPage() {
  const { slug } = useParams()
  const { state, dispatch } = useAppState()
  const widget = useJessyWidget()
  const [buyerPhone] = useBuyerPhone()
  const l = state.listings.find((x) => x.slug === slug && PUBLIC_LISTING_STATUSES.includes(x.status))
  const now = nowMs()
  const promo = l ? promoPrice(state, l.id, now) : null
  const price = promo ?? l?.price ?? 0
  useDocumentMeta(
    l ? `${l.title} · ${fmtIdrShort(price)} · Artha Samoedra` : 'Property not found · Artha Samoedra',
    l?.description.slice(0, 155),
  )

  if (!l) {
    return (
      <SiteContainer className="pt-10">
        <Card>
          <EmptyState
            title="Property not found"
            description="This property has been sold, withdrawn by its owner, or moved to a new address."
            action={
              <Button variant="outline" size="sm" asChild>
                <Link to={paths.assets}>View other properties</Link>
              </Button>
            }
          />
        </Card>
      </SiteContainer>
    )
  }

  const related = publicListings(state)
    .filter((x) => x.id !== l.id && (x.type === l.type || x.city === l.city))
    .slice(0, 3)
  const perYear = l.deal === 'sewa' ? ' per year' : ''
  const featured = isFeatured(state, l.id, now)
  const saved = !!buyerPhone && savedFor(state, buyerPhone).some((x) => x.listingId === l.id)
  const toggleSaved = () => {
    const blocker = dispatch({ type: 'saved/toggle', phone: buyerPhone, listingId: l.id }, 'public')
    if (blocker) toast('Could not save', { tone: 'danger', description: blocker })
    else toast(saved ? 'Removed from saved' : 'Saved to your account', { tone: 'success', description: l.title })
  }

  return (
    <SiteContainer className="pt-6">
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'RealEstateListing',
          name: l.title,
          description: l.description,
          url: `https://arthasamoedra.id${paths.asset(l.slug)}`,
          datePosted: l.createdAt,
          offers: { '@type': 'Offer', price, priceCurrency: 'IDR', availability: 'https://schema.org/InStock' },
          address: { '@type': 'PostalAddress', addressLocality: l.city, addressRegion: l.district, addressCountry: 'ID' },
          floorSize: l.buildingArea ? { '@type': 'QuantitativeValue', value: l.buildingArea, unitCode: 'MTK' } : undefined,
        }}
      />
      <nav aria-label="Breadcrumb" className="mb-4 text-xs text-muted">
        <Link to={paths.assets} className="hover:text-foreground hover:underline">
          Properties
        </Link>
        <span className="mx-1.5">/</span>
        <span aria-current="page" className="font-medium text-foreground">
          {l.code}
        </span>
      </nav>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ListingVisual listing={l} className="aspect-[16/10] w-full rounded-hero [&_svg]:size-20" />
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={l.deal === 'sewa' ? 'info' : 'default'}>{DEAL_TYPE_LABEL[l.deal]}</Badge>
              <Badge variant="outline">{ASSET_TYPE_LABEL[l.type]}</Badge>
              {featured && (
                <Badge variant="accent">
                  <Star />
                  Featured
                </Badge>
              )}
              {promo !== null && <Badge variant="danger">Price drop</Badge>}
              {l.status === 'reserved' && <Badge variant="warning">Reserved</Badge>}
              <span className="ml-auto font-mono text-xs font-semibold text-muted">{l.code}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{l.title}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
              <MapPin className="size-4" />
              {l.address}
            </p>
            <p className="mt-5 text-[15px] leading-relaxed text-body">{l.description}</p>
            <ul className="mt-5 grid gap-2 sm:grid-cols-2">
              {l.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-sm">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" />
                  {h}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
            </CardHeader>
            <CardContent>
              <KeyValue
                bare
                items={[
                  { label: 'Land area', value: fmtArea(l.landArea) },
                  { label: 'Building area', value: l.buildingArea ? fmtArea(l.buildingArea) : '–' },
                  { label: 'Bedrooms', value: l.bedrooms ?? '–', hidden: !l.bedrooms },
                  { label: 'Certificate', value: l.certificate },
                  { label: 'Location', value: `${l.district}, ${l.city}` },
                ]}
              />
            </CardContent>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card variant="ink" className="p-6">
            <div className="text-[13px] font-semibold text-on-ink-muted">{perYear ? 'Rental price' : 'Sale price'}</div>
            <div className="mt-1 flex flex-wrap items-end gap-x-2">
              <span className="text-4xl font-bold tracking-tight tabular-nums">{fmtIdrShort(price)}</span>
              {perYear && <span className="pb-1 text-sm font-semibold text-on-ink-muted">/year</span>}
              {promo !== null && (
                <s className="pb-1 text-sm text-on-ink-muted tabular-nums">
                  <span className="sr-only">was </span>
                  {fmtIdrShort(l.price)}
                </s>
              )}
            </div>
            <div className="mt-1 text-xs text-on-ink-muted tabular-nums">{fmtIdr(price)}</div>
            <div className="mt-6 flex flex-col gap-2">
              <Button size="lg" onClick={() => widget.open(l.id, 'I would like to book a site visit')}>
                <CalendarCheck />
                Book a site visit
              </Button>
              <Button variant="onInk" size="lg" onClick={() => widget.open(l.id)}>
                <Sparkles />
                Ask Jessy about this property
              </Button>
              {buyerPhone ? (
                <Button variant="onInk" size="lg" aria-pressed={saved} onClick={toggleSaved}>
                  <Heart className={saved ? 'fill-current text-accent' : undefined} />
                  {saved ? 'Saved' : 'Save property'}
                </Button>
              ) : (
                <Button variant="onInk" size="lg" asChild>
                  <Link to={paths.buyerPortal}>
                    <Heart />
                    Sign in to save
                  </Link>
                </Button>
              )}
            </div>
            <p className="mt-4 text-xs text-on-ink-muted">Mention code {l.code} when you contact us.</p>
          </Card>
        </aside>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-5 text-2xl font-bold tracking-tight">Similar properties</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((r) => (
              <ListingCard key={r.id} listing={r} />
            ))}
          </div>
        </section>
      )}
    </SiteContainer>
  )
}
