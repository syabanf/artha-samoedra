import { cn, FOCUS, Toaster, useMediaQuery } from '@artha/ui'
import { ArrowLeft, ChevronDown, ExternalLink, LayoutGrid, LogOut, Search } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { RequireAuth, useAuth, useUser } from '../../auth/auth'
import { BrandMark } from '../../components/BrandMark'
import { paths } from '../../components/links'
import { useNow } from '../../state/store'
import { frameSrc, loadLayout, newWin, saveLayout, SEARCH_APP, useOsApps, type Layout, type OsApp, type Snap, type Win } from './model'
import { NativeApp } from './NativeApps'
import { OsWindow } from './Window'

export function DesktopPage() {
  return (
    <RequireAuth>
      <Shell />
    </RequireAuth>
  )
}

function Shell() {
  const wide = useMediaQuery('(min-width: 768px)')
  useEffect(() => {
    document.title = 'Desktop · Artha Samoedra Console'
  }, [])
  return (
    <div className="relative h-dvh overflow-hidden bg-ink text-on-ink">
      <Wallpaper />
      {wide ? <Desktop /> : <PhoneLauncher />}
      <Toaster />
    </div>
  )
}

function Wallpaper() {
  const [missing, setMissing] = useState(false)
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {!missing && <img src="/landing/showcase.jpg" alt="" onError={() => setMissing(true)} className="size-full object-cover opacity-45" />}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/20 to-ink/85" />
    </div>
  )
}

// ---------------------------------------------------------------- desktop

function Desktop() {
  const user = useUser()
  const apps = useOsApps()
  const appOf = (id: string) => (id === SEARCH_APP.id ? SEARCH_APP : apps.find((a) => a.id === id))
  const [layout, setLayout] = useState<Layout>(() => loadLayout(user.id, apps))
  const areaRef = useRef<HTMLDivElement>(null)
  const [area, setArea] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<{ busy: boolean; snap: Snap | null }>({ busy: false, snap: null })

  useEffect(() => {
    saveLayout(user.id, layout)
  }, [user.id, layout])

  useLayoutEffect(() => {
    const el = areaRef.current
    if (!el) return
    const measure = () => setArea({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const shown = layout.wins.filter((w) => !w.min)
  const focusedId = shown.at(-1)?.id ?? null
  const focusedApp = focusedId ? appOf(focusedId) : undefined

  const edit = (id: string, fn: (w: Win) => Win) => setLayout((l) => ({ ...l, wins: l.wins.map((w) => (w.id === id ? fn(w) : w)) }))
  /** Brings a window to the front and out of the dock. */
  const raise = (id: string) =>
    setLayout((l) => {
      const win = l.wins.find((w) => w.id === id)
      if (!win || (l.wins.at(-1) === win && !win.min)) return l
      return { ...l, wins: [...l.wins.filter((w) => w !== win), { ...win, min: false }] }
    })
  const open = (app: OsApp) =>
    layout.wins.some((w) => w.id === app.id) ? raise(app.id) : setLayout((l) => ({ ...l, wins: [...l.wins, newWin(app, area, l.wins.length)] }))
  const minimize = (id: string) => edit(id, (w) => ({ ...w, min: true }))
  const close = (id: string) => setLayout((l) => ({ ...l, wins: l.wins.filter((w) => w.id !== id) }))
  const toggleMax = (id: string) => edit(id, (w) => ({ ...w, max: !w.max }))
  const snapTo = (id: string, snap: Snap) => edit(id, (w) => ({ ...w, max: false, snap }))
  const togglePin = (id: string) => setLayout((l) => ({ ...l, pinned: l.pinned.includes(id) ? l.pinned.filter((p) => p !== id) : [...l.pinned, id] }))
  const setUrl = (id: string, url: string) =>
    setLayout((l) => (l.wins.some((w) => w.id === id && w.url !== url) ? { ...l, wins: l.wins.map((w) => (w.id === id ? { ...w, url } : w)) } : l))

  /** Opens a console path in the window of the module that owns it (the longest matching app url). */
  const openPath = (path: string) => {
    const app = apps.filter((a) => a.url && (path === a.url || path.startsWith(`${a.url}/`))).sort((a, b) => b.url!.length - a.url!.length)[0]
    if (!app) return
    open(app)
    setUrl(app.id, path)
  }

  const fromDock = (app: OsApp) => {
    const win = layout.wins.find((w) => w.id === app.id)
    if (win && !win.min && win.id === focusedId) minimize(app.id)
    else open(app)
  }

  // A click inside a frame never reaches this document, so the frame taking focus raises its window.
  useEffect(() => {
    const onBlur = () =>
      setTimeout(() => {
        const frame = document.activeElement
        const id = frame instanceof HTMLIFrameElement ? frame.closest<HTMLElement>('[data-win]')?.dataset.win : undefined
        if (id) raise(id)
      })
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
    // raise only calls the state setter, so the first one stays valid.
  }, [])

  const dock = [...layout.pinned, ...layout.wins.map((w) => w.id).filter((id) => !layout.pinned.includes(id))].flatMap((id) => appOf(id) ?? [])

  return (
    <div className="relative flex h-full flex-col">
      <TopBar
        app={focusedApp}
        pinned={!!focusedId && layout.pinned.includes(focusedId)}
        maximized={!!layout.wins.find((w) => w.id === focusedId)?.max}
        onSearch={() => open(SEARCH_APP)}
        onAction={(action) => {
          if (!focusedId) return
          if (action === 'pin') togglePin(focusedId)
          else if (action === 'min') minimize(focusedId)
          else if (action === 'max') toggleMax(focusedId)
          else if (action === 'left' || action === 'right') snapTo(focusedId, action)
          else close(focusedId)
        }}
        hasMinimized={layout.wins.some((w) => w.min)}
        onRestoreAll={() => setLayout((l) => ({ ...l, wins: l.wins.map((w) => ({ ...w, min: false })) }))}
      />
      <div ref={areaRef} className={cn('relative min-h-0 flex-1', drag.busy && '[&_iframe]:pointer-events-none')}>
        <nav aria-label="Apps" className="absolute inset-0 grid auto-cols-[88px] grid-flow-col grid-rows-[repeat(auto-fill,96px)] content-start gap-1 overflow-hidden p-3">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => open(app)}
              className={cn('group flex h-24 w-[88px] flex-col items-center gap-1.5 rounded-2xl p-1.5 text-center hover:bg-white/10', FOCUS)}
            >
              <AppTile app={app} />
              <span className="line-clamp-2 text-[11.5px] font-medium leading-tight text-white [text-shadow:0_1px_3px_var(--color-ink)]">{app.label}</span>
            </button>
          ))}
        </nav>
        {drag.snap && (
          <div
            aria-hidden
            className={cn('pointer-events-none absolute inset-y-2 z-[900] w-[calc(50%-12px)] rounded-2xl bg-white/10 ring-2 ring-white/50 backdrop-blur-sm', drag.snap === 'left' ? 'left-2' : 'right-2')}
          />
        )}
        {area.w > 0 &&
          layout.wins.flatMap((win, i) => {
            const app = appOf(win.id)
            if (!app) return []
            return (
                <OsWindow
                  key={win.id}
                  win={win}
                  app={app}
                  z={10 + i}
                  focused={win.id === focusedId}
                  area={area}
                  areaRef={areaRef}
                  onFocus={() => raise(win.id)}
                  onCommit={(next) => edit(win.id, () => next)}
                  onMinimize={() => minimize(win.id)}
                  onToggleMax={() => toggleMax(win.id)}
                  onClose={() => close(win.id)}
                  onDrag={setDrag}
                >
                  {app.native ? <NativeApp kind={app.native} onOpenPath={openPath} /> : <Frame title={app.label} url={win.url ?? app.url!} onUrl={(url) => setUrl(win.id, url)} />}
                </OsWindow>
            )
          })}
      </div>
      <Dock apps={dock} wins={layout.wins} focusedId={focusedId} onClick={fromDock} />
    </div>
  )
}

type MenuAction = 'pin' | 'min' | 'max' | 'left' | 'right' | 'close'

function TopBar({
  app,
  pinned,
  maximized,
  hasMinimized,
  onSearch,
  onAction,
  onRestoreAll,
}: {
  app: OsApp | undefined
  pinned: boolean
  maximized: boolean
  hasMinimized: boolean
  onSearch: () => void
  onAction: (a: MenuAction) => void
  onRestoreAll: () => void
}) {
  return (
    <header className="relative z-[1000] flex h-11 shrink-0 items-center gap-2 bg-ink/70 px-3 backdrop-blur-xl">
      <h1 className="sr-only">Desktop</h1>
      <Link to={paths.console} className={cn('flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/10', FOCUS)}>
        <BrandMark onInk className="size-6" />
        <span className="hidden text-sm font-bold lg:inline">Artha Samoedra</span>
        <span className="sr-only lg:hidden">Artha Samoedra console</span>
      </Link>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger className={cn('flex min-w-0 items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold hover:bg-white/10 data-[state=open]:bg-white/15', FOCUS)}>
          <span className="truncate">{app?.label ?? 'Desktop'}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 text-on-ink-muted" />
        </DropdownMenu.Trigger>
        <Menu align="start">
          {app ? (
            <>
              <MenuItem onSelect={() => onAction('pin')}>{pinned ? 'Unpin from dock' : 'Pin to dock'}</MenuItem>
              <MenuItem onSelect={() => onAction('min')}>Minimize</MenuItem>
              <MenuItem onSelect={() => onAction('max')}>{maximized ? 'Restore size' : 'Maximize'}</MenuItem>
              <MenuItem onSelect={() => onAction('left')}>Snap to left half</MenuItem>
              <MenuItem onSelect={() => onAction('right')}>Snap to right half</MenuItem>
              {app.url && (
                <MenuItem asChild>
                  <a href={app.url} target="_blank" rel="noreferrer">
                    Open in a new tab
                    <ExternalLink aria-hidden className="ml-auto size-3.5" />
                  </a>
                </MenuItem>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <MenuItem onSelect={() => onAction('close')}>Close {app.label}</MenuItem>
            </>
          ) : (
            <>
              <MenuItem disabled={!hasMinimized} onSelect={onRestoreAll}>
                Show minimized windows
              </MenuItem>
              <MenuItem asChild>
                <Link to={paths.console}>Open the console</Link>
              </MenuItem>
            </>
          )}
        </Menu>
      </DropdownMenu.Root>
      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={onSearch} className={cn('flex h-8 items-center gap-2 rounded-full bg-white/10 px-3 text-xs font-medium text-on-ink-muted hover:bg-white/20 hover:text-white', FOCUS)}>
          <Search aria-hidden className="size-3.5" />
          Search
        </button>
        <Clock />
        <UserMenu />
      </div>
    </header>
  )
}

function Clock() {
  const now = useNow(5_000)
  const d = new Date(now)
  return (
    <time dateTime={d.toISOString()} className="hidden px-2 text-sm font-medium tabular-nums sm:block">
      {d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}{' '}
      {d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
    </time>
  )
}

function UserMenu() {
  const user = useUser()
  const { signOut, role } = useAuth()
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger aria-label={`Account ${user.name}`} className={cn('flex size-8 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold hover:bg-white/25', FOCUS)}>
        {initials(user.name)}
      </DropdownMenu.Trigger>
      <Menu align="end">
        <div className="px-3 pb-2 pt-2 text-xs text-muted">
          {user.name} · {role?.name}
        </div>
        <MenuItem asChild>
          <Link to={paths.console}>
            <ArrowLeft aria-hidden className="size-4" />
            Back to console
          </Link>
        </MenuItem>
        <MenuItem
          onSelect={() => {
            signOut()
            navigate(paths.login)
          }}
        >
          <LogOut aria-hidden className="size-4" />
          Sign out
        </MenuItem>
      </Menu>
    </DropdownMenu.Root>
  )
}

function Menu({ align, children }: { align: 'start' | 'end'; children: ReactNode }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} sideOffset={6} collisionPadding={8} className="z-[2000] min-w-56 rounded-2xl border border-border bg-card p-1 text-foreground shadow-float">
        {children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

function MenuItem(props: DropdownMenu.DropdownMenuItemProps) {
  return (
    <DropdownMenu.Item
      {...props}
      className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl px-3 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface data-[disabled]:text-silver"
    />
  )
}

function Dock({ apps, wins, focusedId, onClick }: { apps: OsApp[]; wins: Win[]; focusedId: string | null; onClick: (app: OsApp) => void }) {
  return (
    <div className="relative z-[1000] flex shrink-0 justify-center px-3 pb-2 pt-1.5">
      <nav aria-label="Dock" className="no-scrollbar flex max-w-full items-end gap-1.5 overflow-x-auto rounded-[22px] bg-ink/60 px-2 pb-1.5 pt-2 ring-1 ring-white/10 backdrop-blur-xl">
        {apps.map((app) => {
          const win = wins.find((w) => w.id === app.id)
          const state = !win ? '' : win.min ? ', minimized' : win.id === focusedId ? ', in front' : ', open'
          return (
            <button
              key={app.id}
              type="button"
              title={app.label}
              aria-label={`${app.label}${state}`}
              onClick={() => onClick(app)}
              className={cn('flex shrink-0 flex-col items-center gap-1 rounded-xl transition-transform hover:-translate-y-1 active:scale-95', FOCUS)}
            >
              <AppTile app={app} small />
              <span aria-hidden className={cn('size-1 rounded-full', win ? 'bg-white' : 'bg-transparent')} />
            </button>
          )
        })}
      </nav>
    </div>
  )
}

function AppTile({ app, small }: { app: OsApp; small?: boolean }) {
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-2xl text-white shadow-float ring-1 ring-white/15 transition-colors',
        small ? 'size-11 [&_svg]:size-5' : 'size-12 [&_svg]:size-6',
        app.native ? 'bg-accent-strong' : 'bg-ink-3/85 backdrop-blur group-hover:bg-ink-2',
      )}
    >
      <app.icon aria-hidden />
    </span>
  )
}

/** A console page from the same origin, without its shell. Reports where the user goes inside it. */
function Frame({ title, url, onUrl }: { title: string; url: string; onUrl?: (url: string) => void }) {
  const ref = useRef<HTMLIFrameElement>(null)
  // The source is fixed at mount: changing it would reload the page the user is on.
  const [src] = useState(() => frameSrc(url))
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!onUrl) return
    const t = setInterval(() => {
      try {
        const loc = ref.current?.contentWindow?.location
        if (!loc) return
        const q = new URLSearchParams(loc.search)
        q.delete('embed')
        const query = q.toString()
        onUrl(`${loc.pathname}${query ? `?${query}` : ''}`)
      } catch {
        // A frame that left the origin cannot be read; keep the last page.
      }
    }, 1000)
    return () => clearInterval(t)
  }, [onUrl])

  return (
    <div className="absolute inset-0 bg-surface">
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-muted" role="status">
          Opening {title}
        </div>
      )}
      <iframe ref={ref} src={src} title={title} onLoad={() => setLoaded(true)} className={cn('size-full border-0 transition-opacity', loaded ? 'opacity-100' : 'opacity-0')} />
    </div>
  )
}

const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')

// ---------------------------------------------------------------- phone

function PhoneLauncher() {
  const apps = useOsApps()
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const now = useNow(5_000)
  const asked = params.get('app')
  const app = asked === SEARCH_APP.id ? SEARCH_APP : apps.find((a) => a.id === asked)

  if (app) {
    return (
      <div className="relative flex h-full flex-col bg-surface text-foreground">
        <div className="safe-t flex shrink-0 items-center gap-2 bg-ink px-2 text-on-ink">
          <button type="button" onClick={() => setParams({})} className={cn('flex h-12 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-white/10', FOCUS)}>
            <ArrowLeft aria-hidden className="size-4" />
            Apps
          </button>
          <h1 className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{app.label}</h1>
          <span className="w-[76px]" />
        </div>
        <div className="relative min-h-0 flex-1">{app.native ? <NativeApp kind={app.native} /> : <Frame title={app.label} url={app.url!} />}</div>
      </div>
    )
  }

  const d = new Date(now)
  return (
    <div className="safe-t relative flex h-full flex-col overflow-y-auto px-4 pb-6">
      <div className="flex items-center justify-between pt-4">
        <Link to={paths.console} className={cn('flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20', FOCUS)}>
          <ArrowLeft aria-hidden className="size-3.5" />
          Console
        </Link>
        <button
          type="button"
          onClick={() => setParams({ app: SEARCH_APP.id })}
          aria-label="Search"
          className={cn('flex size-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20', FOCUS)}
        >
          <Search aria-hidden className="size-4" />
        </button>
      </div>
      <div className="pb-6 pt-8 text-center">
        <div className="text-5xl font-light tabular-nums">{d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
        <div className="mt-1 text-sm text-on-ink-muted">{d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <h1 className="mb-3 flex items-center gap-2 text-sm font-semibold text-on-ink-muted">
        <LayoutGrid aria-hidden className="size-4" />
        Apps for {user.name.split(' ')[0]}
      </h1>
      <nav aria-label="Apps" className="grid grid-cols-4 gap-x-2 gap-y-4">
        {apps.map((a) => (
          <button key={a.id} type="button" onClick={() => setParams({ app: a.id })} className={cn('flex min-w-0 flex-col items-center gap-1.5 rounded-2xl p-1', FOCUS)}>
            <AppTile app={a} />
            <span className="line-clamp-2 w-full text-center text-[11px] font-medium leading-tight text-white">{a.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
