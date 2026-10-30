import { cn, FOCUS } from '@artha/ui'
import type { Permission } from '@artha/types'
import type { LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { useAuth } from '../auth/auth'

export interface SectionItem {
  to: string
  label: string
  icon: LucideIcon
  /** Hidden from roles without it. */
  needs?: Permission
  /** Match the path exactly, for a section root that has sibling sub-pages. */
  end?: boolean
  /** Other path prefixes that belong to this tab, such as vendors under payables. */
  also?: string[]
}

/** Pill tabs across the pages of one console section. */
export function SectionNav({ label, items }: { label: string; items: SectionItem[] }) {
  const { can } = useAuth()
  const { pathname } = useLocation()
  return (
    <nav aria-label={label} className="no-scrollbar mb-4 flex max-w-full overflow-x-auto print:hidden">
      <div className="inline-flex shrink-0 gap-1 rounded-full bg-card p-1 shadow-card">
        {items
          .filter((s) => !s.needs || can(s.needs))
          .map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                cn(
                  'inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-semibold transition-colors [&_svg]:size-4',
                  isActive || s.also?.some((p) => pathname.startsWith(p)) ? 'bg-ink text-on-ink' : 'text-muted hover:text-foreground',
                  FOCUS,
                )
              }
            >
              <s.icon />
              {s.label}
            </NavLink>
          ))}
      </div>
    </nav>
  )
}
