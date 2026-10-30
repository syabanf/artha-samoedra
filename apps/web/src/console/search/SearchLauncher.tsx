import { SEARCH_KIND_LABEL, SEARCH_KINDS, foldText, queryWords } from '@artha/fixtures'
import { cn, Dialog, FOCUS, Sheet, useIsPhone } from '@artha/ui'
import {
  ArrowRight,
  CalendarPlus,
  ClipboardPlus,
  History,
  type LucideIcon,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { NAV } from '../layouts/nav'
import {
  clearRecent,
  groupHits,
  Highlight,
  hitPath,
  KIND_ICON,
  readRecent,
  rememberSearch,
  SECTION_PAGES,
  useSearchHits,
} from './parts'

const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const SHORTCUT = IS_MAC ? '⌘K' : 'Ctrl K'
const PER_KIND = 4

/** Header search button plus the ⌘K palette: a dialog on desktop, a bottom sheet on phones. */
export function SearchLauncher() {
  const [open, setOpen] = useState(false)
  const isPhone = useIsPhone()

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const title = 'Search the console'
  const description = 'Find records by name or code, jump to a page, or start a task.'
  const palette = <Palette onDone={() => setOpen(false)} />
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-keyshortcuts="Meta+K Control+K"
        aria-label={`Search, ${SHORTCUT}`}
        className={cn(
          'flex size-11 items-center justify-center gap-2 rounded-full bg-card text-sm text-muted shadow-card transition-colors hover:bg-surface-2 lg:w-60 lg:justify-start lg:px-4 [&_svg]:size-[18px]',
          FOCUS,
        )}
      >
        <Search className="shrink-0" />
        <span className="hidden flex-1 text-left lg:block">Search</span>
        <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-sans text-[11px] font-semibold text-muted lg:block">
          {SHORTCUT}
        </kbd>
      </button>
      {isPhone ? (
        <Sheet open={open} onOpenChange={setOpen} title={title} description={description}>
          {palette}
        </Sheet>
      ) : (
        <Dialog open={open} onOpenChange={setOpen} title={title} description={description} size="lg">
          {palette}
        </Dialog>
      )}
    </>
  )
}

interface Entry {
  key: string
  group: string
  icon: LucideIcon
  label: ReactNode
  hint?: ReactNode
  code?: string
  run: () => void
}

function Palette({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate()
  const user = useUser()
  const { can } = useAuth()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [recent, setRecent] = useState(() => readRecent(user.id))
  const listRef = useRef<HTMLDivElement>(null)
  const listId = useId()
  const hits = useSearchHits(query)
  const typed = query.trim()

  const go = (to: string, remember = true) => {
    if (remember) rememberSearch(user.id, typed)
    onDone()
    navigate(to)
  }

  const pages = [
    ...NAV.filter((n) => !n.needs || can(n.needs)).map((n) => ({
      to: n.to,
      label: n.label,
      section: '',
      icon: n.icon,
    })),
    ...SECTION_PAGES.filter((p) => !p.needs || can(p.needs)).map((p) => ({
      to: p.to,
      label: p.label,
      section: p.section,
      icon: ArrowRight,
    })),
  ]

  const commands = [
    can('listing.edit') && {
      key: 'new-listing',
      label: 'New listing',
      icon: Plus,
      to: `${paths.listings}?new=1`,
    },
    can('purchase.request') && {
      key: 'new-pr',
      label: 'New purchase request',
      icon: ClipboardPlus,
      to: paths.prNew,
    },
    {
      key: 'new-leave',
      label: 'New leave request',
      icon: CalendarPlus,
      to: `${paths.meRequestNew}?kind=leave`,
    },
    { key: 'ask-jessy', label: 'Ask Jessy', icon: Sparkles, to: paths.assistant },
  ].filter((c) => !!c)

  const entries: Entry[] = []
  if (!typed) {
    for (const r of recent)
      entries.push({
        key: `recent-${r}`,
        group: 'Recent searches',
        icon: History,
        label: r,
        run: () => {
          setQuery(r)
          setActive(0)
        },
      })
    for (const p of pages.slice(0, 8))
      entries.push({
        key: `page-${p.to}`,
        group: 'Jump to',
        icon: p.icon,
        label: p.label,
        hint: p.section,
        run: () => go(p.to, false),
      })
    for (const c of commands)
      entries.push({
        key: c.key,
        group: 'Quick commands',
        icon: c.icon,
        label: c.label,
        run: () => go(c.to, false),
      })
  } else {
    const byKind = groupHits(hits)
    for (const kind of SEARCH_KINDS)
      for (const h of byKind.get(kind)?.slice(0, PER_KIND) ?? [])
        entries.push({
          key: `${h.kind}-${h.id}`,
          group: SEARCH_KIND_LABEL[kind],
          icon: KIND_ICON[kind],
          label: <Highlight text={h.title} query={typed} />,
          hint: <Highlight text={h.subtitle} query={typed} />,
          code: h.code,
          run: () => go(hitPath(h)),
        })
    const words = queryWords(typed)
    const matches = (text: string) => words.every((w) => foldText(text).includes(w))
    for (const p of pages.filter((p) => matches(`${p.section} ${p.label}`)).slice(0, 4))
      entries.push({
        key: `page-${p.to}`,
        group: 'Pages',
        icon: p.icon,
        label: <Highlight text={p.label} query={typed} />,
        hint: p.section,
        run: () => go(p.to),
      })
    for (const c of commands.filter((c) => matches(c.label)))
      entries.push({ key: c.key, group: 'Quick commands', icon: c.icon, label: c.label, run: () => go(c.to) })
    entries.push({
      key: 'all',
      group: 'More',
      icon: Search,
      label: hits.length ? `See all ${hits.length} results` : 'Search the whole console',
      hint: `for “${typed}”`,
      run: () => go(`${paths.search}?q=${encodeURIComponent(typed)}`),
    })
  }

  const current = Math.min(active, entries.length - 1)
  const optionId = (i: number) => `${listId}-opt-${i}`

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [current])

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!entries.length) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((current + step + entries.length) % entries.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      entries[current]?.run()
    }
  }

  const groups: { name: string; items: { entry: Entry; index: number }[] }[] = []
  entries.forEach((entry, index) => {
    const last = groups[groups.length - 1]
    if (last?.name === entry.group) last.items.push({ entry, index })
    else groups.push({ name: entry.group, items: [{ entry, index }] })
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted"
        />
        <input
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={entries.length ? optionId(current) : undefined}
          aria-label="Search records, pages and commands"
          placeholder="Name, code, phone or page"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          spellCheck={false}
          className={cn(
            'h-12 w-full rounded-full bg-surface pl-11 pr-11 text-base text-foreground placeholder:text-muted md:text-sm',
            FOCUS,
          )}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('')
              setActive(0)
            }}
            className={cn(
              'absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:bg-card [&_svg]:size-4',
              FOCUS,
            )}
          >
            <X />
          </button>
        )}
      </div>

      <div
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label="Results"
        className="-mx-2 max-h-[min(56dvh,30rem)] overflow-y-auto px-2"
      >
        {typed && !hits.length && (
          <p className="px-3 pb-1 pt-2 text-sm text-muted">
            No records match “{typed}”. Try one word, a code such as AS-0004, or a phone number.
          </p>
        )}
        {groups.map((g, gi) => (
          <div key={g.name} role="group" aria-labelledby={`${listId}-g${gi}`} className="pb-2">
            <div
              id={`${listId}-g${gi}`}
              className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted"
            >
              {g.name}
            </div>
            {g.items.map(({ entry, index }) => (
              <div
                key={entry.key}
                id={optionId(index)}
                data-index={index}
                role="option"
                aria-selected={index === current}
                onMouseMove={() => index !== current && setActive(index)}
                onClick={entry.run}
                className={cn(
                  'flex min-w-0 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm',
                  index === current ? 'bg-ink text-on-ink' : 'text-foreground',
                )}
              >
                <entry.icon
                  aria-hidden
                  className={cn('size-4 shrink-0', index === current ? 'text-on-ink-muted' : 'text-muted')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{entry.label}</span>
                  {entry.hint && (
                    <span
                      className={cn(
                        'block truncate text-xs',
                        index === current ? 'text-on-ink-muted' : 'text-muted',
                      )}
                    >
                      {entry.hint}
                    </span>
                  )}
                </span>
                {entry.code && (
                  <span
                    className={cn(
                      'shrink-0 font-mono text-xs',
                      index === current ? 'text-on-ink-muted' : 'text-muted',
                    )}
                  >
                    {entry.code}
                  </span>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div
        className={cn(
          'items-center gap-3 border-t border-border pt-3 text-xs text-muted md:flex',
          !typed && recent.length ? 'flex' : 'hidden',
        )}
      >
        <span aria-hidden className="hidden gap-3 md:flex">
          <span>↑ ↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </span>
        {!typed && recent.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearRecent(user.id)
              setRecent([])
            }}
            className={cn('ml-auto rounded-full px-2 py-1 font-semibold hover:text-foreground', FOCUS)}
          >
            Clear recent searches
          </button>
        )}
      </div>
    </div>
  )
}
