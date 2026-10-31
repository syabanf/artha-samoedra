import { Calculator, CalendarDays, NotebookPen, Search, Sparkles, type LucideIcon } from 'lucide-react'
import { useAuth } from '../../auth/auth'
import { paths } from '../../components/links'
import { NS, readJson, writeJson } from '../../lib/storage'
import { NAV } from '../layouts/nav'

export type NativeKind = 'notes' | 'calc' | 'calendar' | 'jessy'

export interface OsApp {
  id: string
  label: string
  icon: LucideIcon
  /** Console page shown in a frame. */
  url?: string
  /** Rendered in the desktop itself. */
  native?: NativeKind
  /** Opening size; module pages get the default. */
  size?: { w: number; h: number }
}

const BUILT_IN: OsApp[] = [
  { id: 'notes', label: 'Notes', icon: NotebookPen, native: 'notes', size: { w: 420, h: 460 } },
  { id: 'calc', label: 'Calculator', icon: Calculator, native: 'calc', size: { w: 300, h: 440 } },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays, native: 'calendar', size: { w: 720, h: 560 } },
  { id: 'jessy', label: 'Ask Jessy', icon: Sparkles, native: 'jessy', size: { w: 440, h: 620 } },
]

/** Opened from the top bar only, so it has no desktop icon. */
export const SEARCH_APP: OsApp = { id: 'search', label: 'Search', icon: Search, url: paths.search }

/** Built-in apps, then every module page the user's role may open. */
export function useOsApps() {
  const { can } = useAuth()
  const modules = NAV.filter((n) => n.to !== paths.os && (!n.needs || can(n.needs))).map<OsApp>((n) => ({ id: n.to, label: n.label, icon: n.icon, url: n.to }))
  return [...BUILT_IN, ...modules]
}

export const frameSrc = (url: string) => `${url}${url.includes('?') ? '&' : '?'}embed=1`

// ---------------------------------------------------------------- layout

export type Snap = 'left' | 'right'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Win extends Rect {
  /** One window per app, so the app id is the window id. */
  id: string
  min: boolean
  max: boolean
  snap: Snap | null
  /** The page a framed window last showed, so a reload returns to it. */
  url?: string
  /** Set when the user opens it, so only a fresh window plays the opening animation. */
  openedAt?: number
}

export interface Layout {
  /** Back to front. */
  wins: Win[]
  pinned: string[]
}

const DEFAULT_PINNED = ['notes', 'calc', 'calendar', 'jessy', paths.console]
export const MIN_W = 280
export const MIN_H = 200
const TITLE_H = 40

const keyFor = (userId: string) => `${NS}.os.${userId}`

export function loadLayout(userId: string, apps: OsApp[]): Layout {
  const saved = readJson<Layout>(keyFor(userId))
  const known = new Set([...apps.map((a) => a.id), SEARCH_APP.id])
  if (!saved || !Array.isArray(saved.wins) || !Array.isArray(saved.pinned)) return { wins: [], pinned: DEFAULT_PINNED.filter((id) => known.has(id)) }
  return { wins: saved.wins.filter((w) => known.has(w.id)), pinned: saved.pinned.filter((id) => known.has(id)) }
}

export const saveLayout = (userId: string, layout: Layout) => writeJson(keyFor(userId), layout)

/** Where a window sits inside a desktop of `area` size, after maximise, snap and clamping. */
export function rectOf(win: Win, area: { w: number; h: number }): Rect {
  if (win.max) return { x: 0, y: 0, w: area.w, h: area.h }
  if (win.snap) {
    const half = Math.round(area.w / 2)
    return { x: win.snap === 'left' ? 0 : area.w - half, y: 0, w: half, h: area.h }
  }
  const w = Math.min(Math.max(win.w, MIN_W), area.w)
  const h = Math.min(Math.max(win.h, MIN_H), area.h)
  // Keep the title bar on screen so the window can always be dragged back.
  return { x: clamp(win.x, 80 - w, area.w - 80), y: clamp(win.y, 0, area.h - TITLE_H), w, h }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))

/**
 * A new window's place. Below 1024 px a module opens maximized, since a tablet has no room for two;
 * small built-in apps keep their own size. Wider screens get a window that grows with the screen,
 * near the centre, cascading a step for each window already open.
 */
export function newWin(app: OsApp, area: { w: number; h: number }, open: number): Win {
  const base = { id: app.id, openedAt: Date.now(), min: false, snap: null }
  if (area.w < 1024 && !app.size) return { ...base, x: 0, y: 0, w: area.w, h: area.h, max: true }
  const margin = 24
  const w = Math.min(app.size?.w ?? clamp(Math.round(area.w * 0.62), 760, 1280), area.w - 2 * margin)
  const h = Math.min(app.size?.h ?? clamp(Math.round(area.h * 0.84), 520, 900), area.h - margin)
  const step = (open % 6) * 28
  const x = clamp(Math.round((area.w - w) / 2) + step, margin, area.w - w - margin)
  const y = clamp(16 + step, 0, area.h - h)
  return { ...base, x, y, w, h, max: false }
}

export const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
