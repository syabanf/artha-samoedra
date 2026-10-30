/*
 * The public site header: the client logo, a pill nav with a sliding active pill, a header that
 * hides while you scroll down and returns when you scroll up, a reading-progress line on the
 * home page, and a full-screen phone menu that opens as a circle from the menu button.
 */
import { Button, cn, FOCUS } from '@artha/ui'
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation } from 'react-router'
import { BrandLogo, BrandMark } from '../components/BrandMark'
import { paths } from '../components/links'

const NAV = [
  { to: paths.home, label: 'Home' },
  { to: paths.assets, label: 'Properties' },
  { to: paths.areas, label: 'Areas' },
  { to: paths.blog, label: 'Blog' },
  { to: paths.partnerPortal, label: 'For partners' },
]
const MORE = [
  { to: paths.careers, label: 'Careers' },
  { to: paths.buyerPortal, label: 'My account' },
  { to: paths.console, label: 'Team login' },
]
const isActive = (pathname: string, to: string) => (to === paths.home || to === paths.partnerPortal ? pathname === to : pathname === to || pathname.startsWith(`${to}/`))

/** Scrolled past the top, hidden while scrolling down, and how far down the page the reader is. */
function useScrollState(locked: boolean) {
  const [s, setS] = useState({ scrolled: false, hidden: false, progress: 0 })
  useEffect(() => {
    let last = scrollY
    let raf = 0
    const read = () => {
      raf = 0
      const y = scrollY
      const max = document.documentElement.scrollHeight - innerHeight
      // Direction is worked out here, outside the updater, which React may run twice.
      const dir = y > last + 4 ? 'down' : y < last - 4 ? 'up' : null
      last = y
      setS((prev) => ({
        scrolled: y > 8,
        hidden: locked ? false : dir === 'down' && y > 160 ? true : dir === 'up' ? false : prev.hidden,
        progress: max > 0 ? Math.min(y / max, 1) : 0,
      }))
    }
    const onScroll = () => (raf ||= requestAnimationFrame(read))
    read()
    addEventListener('scroll', onScroll, { passive: true })
    return () => {
      removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [locked])
  return s
}

export function SiteHeader({ onAsk }: { onAsk: () => void }) {
  const { pathname } = useLocation()
  const [menu, setMenu] = useState<'closed' | 'open' | 'closing'>('closed')
  const burger = useRef<HTMLButtonElement>(null)
  const { scrolled, hidden, progress } = useScrollState(menu !== 'closed')
  const onHome = pathname === paths.home

  const close = () => setMenu((m) => (m === 'open' ? 'closing' : m))
  // A new page closes the menu at once.
  useEffect(() => setMenu('closed'), [pathname])
  useEffect(() => {
    if (menu !== 'closing') return
    const t = setTimeout(() => {
      setMenu('closed')
      burger.current?.focus()
    }, 380)
    return () => clearTimeout(t)
  }, [menu])

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-[background-color,box-shadow,translate] duration-300',
        scrolled ? 'bg-card/85 shadow-card backdrop-blur' : 'bg-transparent',
        hidden && '-translate-y-full',
      )}
    >
      <div className={cn('mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 transition-[height] duration-300 sm:px-6', scrolled ? 'h-16' : 'h-20')}>
        <Link to={paths.home} className={cn('logo-rise rounded-xl transition-transform duration-300 hover:scale-[1.03]', FOCUS)} aria-label="Artha Samoedra, home">
          <BrandLogo className={cn('transition-[height] duration-300', scrolled ? 'h-8' : 'h-9 sm:h-10')} />
        </Link>
        <PillNav pathname={pathname} />
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
          <button
            ref={burger}
            type="button"
            aria-label="Open menu"
            aria-expanded={menu === 'open'}
            aria-controls="site-menu"
            onClick={() => setMenu('open')}
            className={cn('flex size-10 items-center justify-center rounded-full bg-ink text-on-ink shadow-card transition-transform active:scale-95 lg:hidden', FOCUS)}
          >
            <span aria-hidden className="flex w-4 flex-col items-end gap-[5px]">
              <span className="h-0.5 w-4 rounded-full bg-current" />
              <span className="h-0.5 w-2.5 rounded-full bg-current" />
            </span>
          </button>
        </div>
      </div>
      {onHome && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent transition-transform duration-150" style={{ transform: `scaleX(${progress})` }} />
      )}
      {menu !== 'closed' && <MobileMenu pathname={pathname} leaving={menu === 'closing'} onClose={close} onAsk={onAsk} />}
    </header>
  )
}

/** Desktop pill nav; the dark pill slides to the active page. */
function PillNav({ pathname }: { pathname: string }) {
  const wrap = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      const el = wrap.current?.querySelector<HTMLElement>('[aria-current="page"]')
      setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null)
    }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [pathname])
  return (
    <nav ref={wrap} aria-label="Main" className="relative hidden items-center gap-1 rounded-full bg-surface p-1 lg:flex">
      {pill && (
        <span
          aria-hidden
          className="absolute inset-y-1 rounded-full bg-ink shadow-card transition-[left,width] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ left: pill.left, width: pill.width }}
        />
      )}
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === paths.home || n.to === paths.partnerPortal}
          className={({ isActive }) =>
            cn('relative rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300', isActive ? 'text-on-ink' : 'text-muted hover:text-foreground', FOCUS)
          }
        >
          {n.label}
        </NavLink>
      ))}
    </nav>
  )
}

/** Full-screen phone menu on ink: big numbered links that rise in turn, then the two actions. */
function MobileMenu({ pathname, leaving, onClose, onAsk }: { pathname: string; leaving: boolean; onClose: () => void; onAsk: () => void }) {
  const closeBtn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeBtn.current?.focus()
    const root = document.documentElement
    const before = root.style.overflow
    root.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    addEventListener('keydown', onKey)
    return () => {
      root.style.overflow = before
      removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return createPortal(
    <div
      id="site-menu"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      className={cn('menu-sheet fixed inset-0 z-50 flex flex-col overflow-y-auto bg-ink text-on-ink lg:hidden', leaving && 'menu-sheet-leave')}
    >
      <BrandMark onInk className="pointer-events-none absolute -bottom-10 -right-16 size-80 rotate-[-8deg] opacity-[0.07]" />
      <div className="flex h-20 shrink-0 items-center justify-between px-4 sm:px-6">
        <BrandLogo onInk className="h-9" />
        <button
          ref={closeBtn}
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className={cn('flex size-10 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 active:scale-95', FOCUS)}
        >
          <span aria-hidden className="relative block size-4">
            <span className="absolute left-0 top-1/2 h-0.5 w-4 -translate-y-1/2 rotate-45 rounded-full bg-current" />
            <span className="absolute left-0 top-1/2 h-0.5 w-4 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
          </span>
        </button>
      </div>

      <nav aria-label="Mobile menu" className="relative flex-1 px-4 pt-6 sm:px-6">
        <ol className="space-y-1">
          {NAV.map((n, i) => {
            const active = isActive(pathname, n.to)
            return (
              <li key={n.to} className="menu-item overflow-hidden" style={{ '--i': i } as CSSProperties}>
                <Link
                  to={n.to}
                  onClick={onClose}
                  aria-current={active ? 'page' : undefined}
                  className={cn('group flex items-baseline gap-4 rounded-2xl py-2 transition-colors', FOCUS)}
                >
                  <span className={cn('w-7 text-xs font-semibold tabular-nums', active ? 'text-accent' : 'text-on-ink-muted')}>0{i + 1}</span>
                  <span className={cn('text-4xl font-semibold tracking-tight transition-transform duration-300 group-hover:translate-x-1', active ? 'text-white' : 'text-white/80')}>
                    {n.label}
                  </span>
                  {active && <span aria-hidden className="size-2 self-center rounded-full bg-accent" />}
                </Link>
              </li>
            )
          })}
        </ol>
        <ul className="menu-item mt-8 flex flex-wrap gap-2" style={{ '--i': NAV.length } as CSSProperties}>
          {MORE.map((m) => (
            <li key={m.to}>
              <Link to={m.to} onClick={onClose} className={cn('inline-flex items-center gap-1 rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-on-ink-muted transition-colors hover:border-white/40 hover:text-white', FOCUS)}>
                {m.label}
                <ArrowUpRight className="size-3.5" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="menu-item relative grid shrink-0 grid-cols-2 gap-2 px-4 pb-8 pt-8 sm:px-6" style={{ '--i': NAV.length + 1 } as CSSProperties}>
        <Button
          className="h-12 bg-card text-foreground shadow-none hover:bg-surface"
          onClick={() => {
            onClose()
            onAsk()
          }}
        >
          <Sparkles />
          Ask Jessy
        </Button>
        <Button variant="onInk" className="h-12" asChild>
          <Link to={paths.partnerPortal} onClick={onClose}>
            List a property
          </Link>
        </Button>
        <p className="col-span-2 mt-4 text-xs text-on-ink-muted">Verified land, houses, shop houses, warehouses and villas across Java and Bali.</p>
      </div>
    </div>,
    document.body,
  )
}
