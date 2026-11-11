import { Button, cn, FOCUS } from '@artha/ui'
import { ArrowRight, Building2, MapPin, Newspaper, Sparkles } from 'lucide-react'
import { Link } from 'react-router'
import { paths } from '../components/links'
import { useDocumentMeta } from '../lib/meta'
import { SiteContainer, useJessyWidget } from './SiteLayout'

const WAYS = [
  { to: paths.assets, label: 'Browse properties', note: 'Houses, land, shop houses, warehouses and villas', icon: Building2 },
  { to: paths.areas, label: 'Area guides', note: 'Where buyers look and what drives the price', icon: MapPin },
  { to: paths.blog, label: 'Blog', note: 'Certificates, permits and buying tips', icon: Newspaper },
]

/** Public 404: a path the site does not have, inside the normal header and footer. */
export function NotFoundPage() {
  useDocumentMeta('Page not found · Artha Samoedra')
  const widget = useJessyWidget()
  return (
    <SiteContainer className="py-16 sm:py-24">
      <p className="text-7xl font-semibold tracking-tight text-accent tabular-nums sm:text-8xl">404</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
        This page is not on our site<span className="text-accent">.</span>
      </h1>
      <p className="mt-3 max-w-lg text-sm text-muted sm:text-base">The link may be old, or the listing has left the market. Start from one of these, or ask Jessy.</p>
      <ul className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {WAYS.map((w) => (
          <li key={w.to}>
            <Link to={w.to} className={cn('group flex h-full flex-col gap-3 rounded-card bg-card p-5 shadow-card transition-transform hover:-translate-y-1', FOCUS)}>
              <w.icon className="size-5 text-accent" />
              <span className="font-semibold">{w.label}</span>
              <span className="text-sm text-muted">{w.note}</span>
              <ArrowRight className="mt-auto size-4 text-muted transition-transform group-hover:translate-x-1" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-2">
        <Button variant="secondary" asChild>
          <Link to={paths.home}>Back to home</Link>
        </Button>
        <Button variant="outline" onClick={() => widget.open()}>
          <Sparkles />
          Ask Jessy
        </Button>
      </div>
    </SiteContainer>
  )
}
