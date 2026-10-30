import { buyerStart, buyerTurn, type AppState } from '@artha/fixtures'
import { Button, cn, FOCUS, Toaster } from '@artha/ui'
import { Menu, Sparkles, X } from 'lucide-react'
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useMatch } from 'react-router'
import { JessyChat, useJessyChat } from '../components/JessyChat'
import { BrandLogo } from '../components/BrandMark'
import { paths } from '../components/links'
import { useAppState } from '../state/store'
import { RouteProgress } from './motion'

interface WidgetCtx {
  open: (focusId?: string | null, firstMessage?: string) => void
}
const WidgetContext = createContext<WidgetCtx>({ open: () => {} })
export const useJessyWidget = () => use(WidgetContext)

const NAV = [
  { to: paths.home, label: 'Home' },
  { to: paths.assets, label: 'Properties' },
  { to: paths.areas, label: 'Areas' },
  { to: paths.blog, label: 'Blog' },
  { to: paths.partnerPortal, label: 'For partners' },
]

/** One header for every public page: pill nav in the middle, a frosted bar once the page scrolls. */
function SiteHeader({ onAsk }: { onAsk: () => void }) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 8)
    onScroll()
    addEventListener('scroll', onScroll, { passive: true })
    return () => removeEventListener('scroll', onScroll)
  }, [])
  const pill = ({ isActive }: { isActive: boolean }) =>
    cn('rounded-full px-4 py-2 text-sm font-semibold transition-colors', isActive ? 'bg-ink text-on-ink' : 'text-muted hover:bg-card hover:text-foreground', FOCUS)
  return (
    <header className={cn('sticky top-0 z-40 transition-[background-color,box-shadow] duration-300', scrolled || open ? 'bg-card/85 shadow-card backdrop-blur' : 'bg-transparent')}>
      <div className={cn('mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-[height] duration-300 sm:px-6', scrolled ? 'h-16' : 'h-20')}>
        <Link to={paths.home} className={cn('rounded-xl', FOCUS)} aria-label="Artha Samoedra, home">
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 rounded-full bg-surface p-1 lg:flex">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === paths.home || n.to === paths.partnerPortal} className={pill}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link to={paths.console} className={cn('hidden rounded-full px-3 py-2 text-sm font-semibold text-muted hover:text-foreground xl:inline', FOCUS)}>
            Team login
          </Link>
          <Button variant="outline" onClick={onAsk} aria-label="Ask Jessy" className="max-sm:size-10 max-sm:px-0">
            <Sparkles />
            <span className="max-sm:hidden">Ask Jessy</span>
          </Button>
          <Button variant="secondary" className="hidden sm:inline-flex" asChild>
            <Link to={paths.partnerPortal}>List a property</Link>
          </Button>
          <Button variant="card" size="icon" className="lg:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile menu" className="flex flex-col gap-1 px-4 pb-4 pt-1 animate-in fade-in slide-in-from-top-2 duration-300 lg:hidden">
          {[...NAV, { to: paths.buyerPortal, label: 'My account' }, { to: paths.console, label: 'Team login' }].map((n, i) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === paths.home}
              onClick={() => setOpen(false)}
              style={{ animationDelay: `${i * 40}ms` }}
              className={({ isActive }) => cn('rounded-2xl px-4 py-3 text-sm font-semibold animate-in fade-in slide-in-from-top-1 fill-mode-both', isActive ? 'bg-ink text-on-ink' : 'hover:bg-surface')}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}

export const Logo = BrandLogo

export function SiteLayout() {
  const [session, setSession] = useState<{ key: number; focusId: string | null; first?: string } | null>(null)
  // The partner portal has its own Jessy; the buyer bubble would cover it.
  const onPartnerPortal = !!useMatch(paths.partnerPortal)
  // A private share is a document room for one outside recipient: no site nav, footer or chat.
  const onShare = !!useMatch('/share/:token')
  // The landing hero is white edge to edge; inner pages sit on the grey canvas.
  const onHome = !!useMatch(paths.home)
  const open = (focusId: string | null = null, first?: string) => setSession({ key: Date.now(), focusId, first })

  return (
    <WidgetContext value={{ open }}>
      <div className={cn('min-h-dvh', onHome ? 'bg-card' : 'bg-surface')}>
        <RouteProgress />
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-on-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        {!onShare && <SiteHeader onAsk={() => open()} />}
        <main id="main" tabIndex={-1} className="outline-none">
          <Outlet />
        </main>
        {!onShare && <SiteFooter />}
        {session ? (
          <JessyPanel key={session.key} focusId={session.focusId} first={session.first} onClose={() => setSession(null)} />
        ) : onPartnerPortal || onShare ? null : (
          <button
            type="button"
            onClick={() => open()}
            aria-label="Open chat with Jessy"
            className={cn(
              'fixed bottom-4 right-4 z-40 flex h-14 items-center gap-2 rounded-full bg-ink pl-2 pr-5 text-sm font-semibold text-on-ink shadow-float transition-transform hover:-translate-y-0.5 sm:bottom-6 sm:right-6',
              FOCUS,
            )}
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-accent-strong [&_svg]:size-4">
              <Sparkles />
            </span>
            Chat with Jessy
          </button>
        )}
        <Toaster />
      </div>
    </WidgetContext>
  )
}

function JessyPanel({ focusId, first, onClose }: { focusId: string | null; first?: string; onClose: () => void }) {
  const { state } = useAppState()
  const chat = useJessyChat('jessy_buyer', (s: AppState) => buyerStart(s, focusId), buyerTurn)
  // A CTA can open the panel with a message already on its way ("Book a site visit").
  const sentFirst = useRef(false)
  useEffect(() => {
    if (!first || sentFirst.current) return
    sentFirst.current = true
    chat.send(first)
  })
  return (
    <section
      aria-label={`Chat with ${state.settings.agentName}`}
      className="fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col rounded-t-[28px] bg-card shadow-float animate-in slide-in-from-bottom-4 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[600px] sm:max-h-[calc(100dvh-3rem)] sm:w-[400px] sm:rounded-card"
    >
      <header className="flex items-center gap-3 rounded-t-[28px] bg-ink px-4 py-3 text-on-ink sm:rounded-t-card">
        <span className="relative flex size-10 items-center justify-center rounded-full bg-accent-strong [&_svg]:size-4">
          <Sparkles />
          <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success ring-2 ring-ink" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{state.settings.agentName}</div>
          <div className="text-xs text-on-ink-muted">Artha Samoedra property assistant · online</div>
        </div>
        <Button variant="onInk" size="icon-sm" aria-label="Close chat" onClick={onClose}>
          <X />
        </Button>
      </header>
      <JessyChat
        className="flex-1"
        messages={chat.messages}
        typing={chat.typing}
        onSend={chat.send}
        placeholder="e.g. shop house in Bandung under Rp 6 B"
        renderListingLink={(id, children) => {
          const l = state.listings.find((x) => x.id === id)
          return l ? (
            <Link to={paths.asset(l.slug)} className={cn('block rounded-2xl', FOCUS)}>
              {children}
            </Link>
          ) : null
        }}
      />
    </section>
  )
}

function SiteFooter() {
  return (
    <footer className="mt-16 bg-ink text-on-ink">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 sm:grid-cols-2 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo onInk />
          <p className="mt-3 max-w-sm text-sm text-on-ink-muted">
            Verified property listings: land, houses, shop houses, warehouses and villas across Java and Bali.
          </p>
        </div>
        <FooterCol title="Explore" links={[[paths.assets, 'All properties'], [paths.areas, 'Area guides'], [paths.blog, 'Property blog'], [paths.buyerPortal, 'My account']]} />
        <FooterCol
          title="Partners"
          links={[[paths.partnerPortal, 'List a property'], [paths.partnerDashboard, 'Partner dashboard'], [paths.console, 'Team login']]}
        />
        <FooterCol title="Company" links={[[paths.sitePage('about'), 'About'], [paths.careers, 'Careers'], [paths.sitePage('contact'), 'Contact'], [paths.sitePage('privacy'), 'Privacy']]} />
      </div>
      <div className="border-t border-white/10 px-4 py-4 text-center text-xs text-on-ink-muted">
        © 2026 PT Artha Samoedra. Prices and availability may change.
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-on-ink-muted">{title}</div>
      <ul className="mt-3 space-y-2 text-sm">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="hover:text-white hover:underline">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const SiteContainer = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('mx-auto max-w-7xl px-4 sm:px-6', className)}>{children}</div>
)
