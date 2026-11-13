import {
  blockerFor,
  JESSY,
  nowIso,
  nowMs,
  overdueToFlag,
  sweepDue,
  contentDue,
  contractsDue,
  sweepTargets,
  reduce,
  seedState,
  type AppAction,
  type AppState,
} from '@artha/fixtures'
import { createContext, use, useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { NS, readJson, writeJson } from '../lib/storage'

const KEY = `${NS}.state.v8`
const VERSION = 16

const load = (): AppState => {
  const saved = readJson<{ version: number; state: AppState }>(KEY)
  return saved?.version === VERSION ? saved.state : seedState()
}

interface Ctx {
  state: AppState
  /** Returns the blocker sentence when the store refuses the action. */
  dispatch: (action: AppAction, by: string) => string | null
  storageError: boolean
  resetDemo: () => void
}

const StateContext = createContext<Ctx | null>(null)

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [state, raw] = useReducer(reduce, undefined, load)
  const [storageError, setStorageError] = useState(false)
  const latest = useRef(state)
  latest.current = state

  useEffect(() => {
    setStorageError(!writeJson(KEY, { version: VERSION, state }))
  }, [state])

  const dispatch = (action: AppAction, by: string) => {
    const blocker = blockerFor(latest.current, action)
    if (blocker) return blocker
    const envelope = { action, meta: { by, at: nowIso() } }
    // A second dispatch in the same handler (save, then post) checks its blocker against this result, not the last render.
    latest.current = reduce(latest.current, envelope)
    raw(envelope)
    return null
  }

  // Jessy's jobs: on load and every minute, send exclusive milestone reminders, expire rights at their end date and flag tasks that went overdue.
  useEffect(() => {
    // Desktop windows frame console pages; only the top window runs the jobs, so they fire once.
    if (window.top !== window.self) return
    // Each job reads the state the previous one left, so a re-run (React dev mounts twice) sends nothing twice.
    const job = (action: AppAction) => {
      const envelope = { action, meta: { by: JESSY, at: nowIso() } }
      latest.current = reduce(latest.current, envelope)
      raw(envelope)
    }
    const run = () => {
      const ids = sweepTargets(latest.current, nowMs()).map((e) => e.id)
      if (ids.length) job({ type: 'exclusives/sweep', ids })
      const overdue = overdueToFlag(latest.current, nowMs()).map((t) => t.id)
      if (overdue.length) job({ type: 'tasks/flagOverdue', ids: overdue })
      if (sweepDue(latest.current, nowMs())) job({ type: 'ops/sweep' })
      if (contentDue(latest.current, nowMs())) job({ type: 'social/publishDue' })
      if (contractsDue(latest.current, nowMs())) job({ type: 'hr/sweep' })
    }
    run()
    const timer = setInterval(run, 60_000)
    return () => clearInterval(timer)
  }, [])

  const resetDemo = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith(NS))
        .forEach((k) => localStorage.removeItem(k))
    } catch {
      /* storage missing: the reload still starts from the seed */
    }
    window.location.reload()
  }

  return <StateContext value={{ state, dispatch, storageError, resetDemo }}>{children}</StateContext>
}

export function useAppState() {
  const ctx = use(StateContext)
  if (!ctx) throw new Error('useAppState outside AppStateProvider')
  return ctx
}

/** Lookup maps and name helpers over the live state, so renamed records propagate everywhere. */
export function useScoped() {
  const { state, dispatch } = useAppState()
  const listings = new Map(state.listings.map((l) => [l.id, l]))
  const partners = new Map(state.partners.map((p) => [p.id, p]))
  return {
    state,
    dispatch,
    maps: { listings, partners },
    partnerName: (id: string) => partners.get(id)?.name ?? 'Unknown partner',
    listingCode: (id: string | null) => (id ? (listings.get(id)?.code ?? '–') : '–'),
    actorName: (by: string) => (by === JESSY ? state.settings.agentName : (state.users.find((u) => u.id === by)?.name ?? by)),
  }
}

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(nowMs)
  useEffect(() => {
    const t = setInterval(() => setNow(nowMs()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}
