import { fmtAgo, fmtDateLong, nowIso } from '@artha/fixtures'
import { Banner, Button, cn, CountBadge, EmptyState, FOCUS, IconTile, Sheet, Toaster, useIsPhone, useMediaQuery } from '@artha/ui'
import { Bell, BellOff, Ellipsis, ExternalLink, LogOut, PanelLeftClose, PanelLeftOpen, RotateCcw, Sparkles } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { RequireAuth, useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { NoAccess } from '../../components/NoAccess'
import { usePersistentState } from '../../lib/storage'
import { useAppState, useNow } from '../../state/store'
import { NAV, navFor, PHONE_NAV, type NavItem } from './nav'
import { bellNotices, navCounts, readOutbox, usePushDelivery, type Notice } from './notifications'
import { BrandMark } from '../../components/BrandMark'
import { AssistantLauncher } from '../assistant/AssistantLauncher'
import { SearchLauncher } from '../search/SearchLauncher'

const GLOW =
  'radial-gradient(38% 34% at 72% 22%, color-mix(in srgb, var(--color-accent) 9%, transparent), transparent 70%), radial-gradient(28% 30% at 92% 48%, color-mix(in srgb, var(--color-accent) 6%, transparent), transparent 70%), radial-gradient(34% 30% at 55% 8%, color-mix(in srgb, var(--color-accent-soft) 55%, transparent), transparent 72%)'

function useVisibleNav() {
  const { can } = useAuth()
  return NAV.filter((n) => !n.needs || can(n.needs))
}

export const ConsoleRoot = () => (
  <RequireAuth>
    <ConsoleLayout />
  </RequireAuth>
)

function ConsoleLayout() {
  const isDesktop = useMediaQuery('(min-width: 1280px)')
  const [railPref, setRailPref] = usePersistentState('rail', true)
  const [moreOpen, setMoreOpen] = useState(false)
  const { storageError } = useAppState()
  const mainRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()
  // The OS desktop frames console pages with ?embed=1. Read once, so links inside the frame keep the bare shell.
  const [embed] = useState(() => new URLSearchParams(window.location.search).get('embed') === '1')

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
    document.title = `${navFor(pathname)?.label ?? 'Console'} · Artha Samoedra Console`
  }, [pathname])

  return (
    <div className={cn('relative flex h-dvh gap-4 overflow-clip bg-surface p-3 print:block print:h-auto print:overflow-visible print:bg-card print:p-0', !embed && 'lg:p-4')}>
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -right-[8%] -top-[30%] h-[120%] w-[70%] opacity-70 blur-xl" style={{ background: GLOW }} />
      </div>
      <div className={cn('relative hidden shrink-0 print:hidden', !embed && 'md:block')}>
        <SideRail expanded={railPref && isDesktop} canExpand={isDesktop} onToggle={() => setRailPref(!railPref)} />
      </div>
      <div className="relative flex min-w-0 flex-1 flex-col gap-4">
        <a
          href="#main"
          className="sr-only z-30 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-on-ink shadow-float focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        {!embed && <Header onMenu={() => setMoreOpen(true)} />}
        <main
          id="main"
          tabIndex={-1}
          ref={mainRef}
          className={cn('relative min-h-0 flex-1 overflow-y-auto pr-0.5 outline-none md:pb-2 print:overflow-visible print:p-0', embed ? 'pb-2' : 'pb-24')}
        >
          <ImpersonationBanner />
          {storageError && (
            <Banner tone="danger" title="Changes cannot be saved" className="mb-4">
              Browser storage is full or blocked. Changes are lost when the page reloads.
            </Banner>
          )}
          <GuardedOutlet />
        </main>
      </div>
      {!embed && <PhoneNav moreOpen={moreOpen} onMoreChange={setMoreOpen} />}
      <Toaster />
    </div>
  )
}

function useCounts() {
  const { state } = useAppState()
  const now = useNow()
  return navCounts(state, now)
}

function SideRail({ expanded, canExpand, onToggle }: { expanded: boolean; canExpand: boolean; onToggle: () => void }) {
  const nav = useVisibleNav()
  const counts = useCounts()
  const { state } = useAppState()
  return (
    <nav
      aria-label="Console"
      className={cn(
        'flex h-full flex-col rounded-hero bg-ink py-4 text-on-ink shadow-float transition-[width] duration-200',
        expanded ? 'w-60 px-3' : 'w-[76px] items-center',
      )}
    >
      <Link to={paths.console} className={cn('flex items-center gap-3 rounded-2xl', FOCUS, expanded && 'px-1')}>
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/5">
          <BrandMark
            className="h-6 w-8"
            fallback={<span className="flex size-7 items-center justify-center rounded-lg bg-accent-strong text-[11px] font-extrabold text-white">{state.appearance.logoText}</span>}
          />
        </span>
        {expanded && (
          <span className="min-w-0">
            <span className="block text-[15px] font-bold leading-tight tracking-tight">Artha Samoedra</span>
            <span className="block text-[11px] text-on-ink-muted">Asset ERP</span>
          </span>
        )}
      </Link>
      <div className="no-scrollbar mt-6 flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto p-1">
        {nav.map((n) => (
          <RailLink key={n.to} item={n} expanded={expanded} count={n.badge ? counts[n.badge] : 0} />
        ))}
      </div>
      <div className="mt-3 flex w-full flex-col gap-1 p-1">
        <a
          href={paths.home}
          target="_blank"
          rel="noreferrer"
          title={expanded ? undefined : 'Open website'}
          className={cn(
            'flex shrink-0 items-center rounded-2xl text-on-ink-muted transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-5',
            expanded ? 'h-11 w-full gap-3 px-3 text-sm font-medium' : 'size-11 justify-center',
            FOCUS,
          )}
        >
          <ExternalLink />
          {expanded ? 'Public website' : <span className="sr-only">Public website</span>}
        </a>
        {expanded && (
          <div className="rounded-2xl border border-white/10 bg-ink-2 p-3 text-xs text-on-ink-muted">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Sparkles className="size-3.5 text-accent" />
              {state.settings.agentName} active
            </div>
            <div className="mt-0.5">{state.agentEvents.length} actions logged</div>
          </div>
        )}
        {canExpand && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse menu' : 'Expand menu'}
            className={cn(
              'flex items-center justify-center gap-2 rounded-2xl border border-white/10 text-xs font-semibold text-on-ink-muted hover:bg-white/10 hover:text-white [&_svg]:size-4',
              expanded ? 'h-10 w-full' : 'size-11',
              FOCUS,
            )}
          >
            {expanded ? <PanelLeftClose /> : <PanelLeftOpen />}
            {expanded && 'Collapse menu'}
          </button>
        )}
      </div>
    </nav>
  )
}

function RailLink({ item, expanded, count }: { item: NavItem; expanded: boolean; count: number }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={expanded ? undefined : item.label}
      className={({ isActive }) =>
        cn(
          'relative flex shrink-0 items-center rounded-2xl text-on-ink-muted transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-5',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-strong',
          expanded ? 'h-11 w-full gap-3 px-3 text-sm font-medium' : 'size-11 justify-center',
          isActive && 'bg-accent-strong text-white shadow-glow hover:bg-accent-strong',
        )
      }
    >
      <item.icon />
      {expanded ? (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          <CountBadge count={count} onInk className="ring-0" />
        </>
      ) : (
        <>
          <span className="sr-only">
            {item.label}
            {count ? `, ${count}` : ''}
          </span>
          <CountBadge count={count} onInk className="absolute -right-1 -top-1" />
        </>
      )}
    </NavLink>
  )
}

function Header({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation()
  const user = useUser()
  const { signOut, role } = useAuth()
  const { resetDemo } = useAppState()
  const navigate = useNavigate()
  const item = navFor(pathname)
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 print:hidden">
      <Button variant="card" size="icon-lg" className="md:hidden" aria-label="Open menu" onClick={onMenu}>
        <Ellipsis />
      </Button>
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-lg font-bold leading-tight">{item?.label ?? 'Console'}</h2>
        <p className="truncate text-xs text-muted">{fmtDateLong(nowIso())}</p>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <SearchLauncher />
        <AssistantLauncher />
        <Notifications />
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              type="button"
              aria-label={`Account ${user.name}`}
              className={cn('flex h-11 items-center gap-2.5 rounded-full bg-card p-1.5 shadow-card transition-colors hover:bg-surface-2 xl:pr-4', FOCUS)}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-on-ink">
                {user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
              </span>
              <span className="hidden text-left xl:block">
                <span className="block max-w-[10rem] truncate text-sm font-semibold leading-tight">{user.name}</span>
                <span className="block max-w-[10rem] truncate text-[11px] text-muted">{role?.name}</span>
              </span>
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content align="end" sideOffset={8} collisionPadding={8} className="z-50 w-64 rounded-2xl border border-border bg-card p-1 shadow-float">
              <div className="px-3 pb-2 pt-2.5 text-xs text-muted">
                {user.name} · {role?.name}
              </div>
              <MenuButton icon={<RotateCcw />} label="Reset demo data" hint="Back to the starting data" onClick={resetDemo} />
              <MenuButton
                icon={<LogOut />}
                label="Sign out / switch user"
                onClick={() => {
                  signOut()
                  navigate(paths.login)
                }}
              />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </header>
  )
}

function MenuButton({ icon, label, hint, onClick }: { icon: ReactNode; label: string; hint?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left hover:bg-surface [&_svg]:mt-0.5 [&_svg]:size-4', FOCUS)}
    >
      {icon}
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </button>
  )
}

function Notifications() {
  const { state, dispatch } = useAppState()
  const { can } = useAuth()
  const now = useNow()
  const user = useUser()
  const isPhone = useIsPhone()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [read, setRead] = usePersistentState<string[]>(`read.${user.id}`, [])
  usePushDelivery(user.id)
  // Outbox items leave the list once read; derived notices stay until their condition ends, dimmed once read.
  const notices = bellNotices(state, user.id, now)
  const isRead = (n: Notice) => !n.outboxId && read.includes(n.id)
  const unread = notices.filter((n) => !isRead(n)).length

  const markRead = (list: Notice[]) => {
    readOutbox(dispatch, list.flatMap((n) => (n.outboxId ? [n.outboxId] : [])), user.id)
    setRead([...new Set([...read, ...list.filter((n) => !n.outboxId).map((n) => n.id)])])
  }

  const go = (n: Notice) => {
    markRead([n])
    setOpen(false)
    navigate(n.to)
  }

  const panel = (
    <>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
        <div>
          <div className="text-base font-semibold">Needs attention</div>
          <div className="text-xs text-muted">{unread ? `${unread} unread` : 'All read'}</div>
        </div>
        <Button variant="ghost" size="sm" disabled={!unread} onClick={() => markRead(notices)}>
          Mark all read
        </Button>
      </div>
      <div className="max-h-[min(70dvh,480px)] overflow-y-auto p-2">
        {notices.length ? (
          notices.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => go(n)}
              className={cn('flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface', FOCUS, isRead(n) && 'opacity-70')}
            >
              <IconTile size="sm" tone={n.tone}>
                <Bell />
              </IconTile>
              <span className="min-w-0 flex-1">
                <span className="flex items-start gap-2">
                  <span className="text-sm font-semibold leading-snug">{n.title}</span>
                  {!isRead(n) && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">{n.body}</span>
                <span className="mt-1 block text-[11px] font-medium text-silver">{fmtAgo(n.at)}</span>
              </span>
            </button>
          ))
        ) : (
          <EmptyState compact icon={<BellOff />} title="Nothing to act on" description="New listings, inquiries and exclusive rights coming due show up here." />
        )}
      </div>
      {can('settings.view') && (
        <div className="border-t border-border px-4 py-3">
          <Link to={paths.outbox} onClick={() => setOpen(false)} className={cn('text-sm font-semibold text-accent-strong hover:underline', FOCUS)}>
            Open the notification outbox
          </Link>
        </div>
      )}
    </>
  )

  const trigger = (
    <Button variant="card" size="icon-lg" className="relative" aria-label={`Notifications, ${unread} unread`} onClick={isPhone ? () => setOpen(true) : undefined}>
      <Bell />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[19px] min-w-[19px] items-center justify-center rounded-full border-2 border-surface bg-accent px-1 text-[10.5px] font-bold text-on-ink">
          {unread}
        </span>
      )}
    </Button>
  )

  if (isPhone) {
    return (
      <>
        {trigger}
        <Sheet open={open} onOpenChange={setOpen} title="Notifications">
          {panel}
        </Sheet>
      </>
    )
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} collisionPadding={8} className="z-50 w-[400px] rounded-2xl border border-border bg-card p-0 shadow-float">
          {panel}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

function PhoneNav({ moreOpen, onMoreChange }: { moreOpen: boolean; onMoreChange: (v: boolean) => void }) {
  const nav = useVisibleNav()
  const counts = useCounts()
  const primary = nav.filter((n) => PHONE_NAV.includes(n.to))
  const rest = nav.filter((n) => !PHONE_NAV.includes(n.to))
  return (
    <>
      <nav
        aria-label="Console"
        className="fixed inset-x-3 bottom-3 z-40 mb-[env(safe-area-inset-bottom)] flex h-[68px] items-center justify-between rounded-[22px] bg-ink px-3 shadow-float md:hidden print:hidden"
      >
        {primary.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            aria-label={`${n.label}${n.badge && counts[n.badge] ? `, ${counts[n.badge]}` : ''}`}
            className={({ isActive }) =>
              cn(
                'relative flex size-11 shrink-0 items-center justify-center rounded-2xl text-on-ink-muted hover:bg-white/10 hover:text-white active:scale-[0.98] [&_svg]:size-5',
                isActive && 'bg-accent-strong text-white shadow-glow',
                FOCUS,
              )
            }
          >
            <n.icon />
            <CountBadge count={n.badge ? counts[n.badge] : 0} onInk className="absolute -right-1 -top-1" />
          </NavLink>
        ))}
        <button
          type="button"
          aria-label="More"
          onClick={() => onMoreChange(true)}
          className={cn('flex size-11 items-center justify-center rounded-2xl text-on-ink-muted hover:bg-white/10 hover:text-white [&_svg]:size-5', FOCUS)}
        >
          <Ellipsis />
        </button>
      </nav>
      <Sheet open={moreOpen} onOpenChange={onMoreChange} title="More">
        <div className="grid grid-cols-3 gap-2">
          {rest.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={() => onMoreChange(false)}
              className={cn('flex flex-col items-center gap-2 rounded-2xl bg-surface-2 p-3 text-center text-xs font-semibold hover:bg-surface [&_svg]:size-5', FOCUS)}
            >
              <n.icon />
              {n.label}
            </NavLink>
          ))}
        </div>
      </Sheet>
    </>
  )
}

/** Shown while an admin views the console as another user. */
function ImpersonationBanner() {
  const { user, realUser, role, stopImpersonating } = useAuth()
  const navigate = useNavigate()
  if (!realUser || !user) return null
  return (
    <Banner
      tone="warning"
      title={`Viewing as ${user.name} · ${role?.name ?? ''}`}
      className="mb-4"
      actions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            stopImpersonating()
            navigate(paths.users)
          }}
        >
          Back to {realUser.name}
        </Button>
      }
    >
      You see only the menus and actions this role allows. Changes you make are recorded under {user.name}.
    </Banner>
  )
}

/** A typed URL cannot open a page the role's menu hides. */
function GuardedOutlet() {
  const { pathname } = useLocation()
  const { can } = useAuth()
  const needs = navFor(pathname)?.needs
  if (needs && !can(needs)) {
    return (
      <NoAccess
        description="Your role does not include it. Ask an admin to change your role."
        action={
            <Button variant="outline" size="sm" asChild>
              <Link to={paths.console}>Go to dashboard</Link>
            </Button>
        }
      />
    )
  }
  return <Outlet />
}
