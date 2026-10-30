import { ChipRow, cn, FOCUS } from '@artha/ui'
import { Link, useLocation } from 'react-router'

/** Second-level links for a section tab that spans pages, such as Bills, Vendors and Aging under Payables. */
export function SubTabs({ items }: { items: { to: string; label: string }[] }) {
  const { pathname, hash } = useLocation()
  // A tab pointing at a section (bills#aging) wins while its hash is open; otherwise the longest matching path wins, so /payroll/settings beats /payroll.
  const here = pathname + hash
  const matches = (to: string) => (to.includes('#') ? to === here : pathname === to || pathname.startsWith(`${to}/`))
  const activeTo = items.map((i) => i.to).filter(matches).sort((a, b) => Number(b.includes('#')) - Number(a.includes('#')) || b.length - a.length)[0]
  return (
    <ChipRow role="navigation" aria-label="Pages in this section" className="mb-4">
      {items.map((i) => {
        const active = i.to === activeTo
        return (
          <Link
            key={i.to}
            to={i.to}
            aria-current={active ? 'page' : undefined}
            className={cn('inline-flex h-9 shrink-0 items-center rounded-full px-4 text-sm font-semibold transition-colors', FOCUS, active ? 'bg-ink text-on-ink' : 'bg-card text-body shadow-card hover:bg-surface')}
          >
            {i.label}
          </Link>
        )
      })}
    </ChipRow>
  )
}
