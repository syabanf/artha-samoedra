import { announcementsFor, countBy, fmtDate } from '@artha/fixtures'
import type { Employee } from '@artha/types'
import { Badge, Card, Chip, ChipRow, cn, EmptyState, PageHeader } from '@artha/ui'
import { ChevronDown, Megaphone, Pin } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useUser } from '../../auth/auth'
import { SearchBox } from '../../components/SearchBox'
import { useSetParam } from '../../lib/useSetParam'
import { useAppState } from '../../state/store'
import { useAct } from '../dialogs'
import { WithMe } from './shared'

type Show = 'unread' | 'everyone' | 'department'

export function MyNewsPage() {
  return <WithMe title="News">{(me) => <News me={me} />}</WithMe>
}

function News({ me }: { me: Employee }) {
  const { state } = useAppState()
  const user = useUser()
  const act = useAct()
  const { params, set, clear } = useSetParam()
  const marked = useRef(new Set<string>())
  const q = params.get('q') ?? ''
  const show = (params.get('show') as Show | null) || null
  const open = params.get('open')
  const department = state.departments.find((d) => d.id === me.departmentId)?.name ?? 'My department'

  const all = announcementsFor(state, user.id)
  const isUnread = (id: string) => !all.find((a) => a.id === id)?.readBy.includes(user.id)
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const searched = all.filter((a) => terms.every((w) => `${a.title} ${a.body}`.toLowerCase().includes(w)))
  const counts = countBy(searched, (a) => (a.departmentId ? 'department' : 'everyone'))
  const unreadCount = searched.filter((a) => isUnread(a.id)).length
  // The open announcement stays in the Unread view after opening marks it read.
  const rows = searched.filter((a) => (show === 'unread' ? isUnread(a.id) || a.id === open : show ? (a.departmentId ? 'department' : 'everyone') === show : true))
  const filters = [q, show].filter(Boolean).length

  const markRead = (id: string) => {
    if (!isUnread(id) || marked.current.has(id)) return
    marked.current.add(id)
    act({ type: 'announcements/read', id, userId: user.id }, 'Marked as read', all.find((a) => a.id === id)?.title)
  }
  // A link from Today opens an announcement through the URL; that counts as opening it.
  useEffect(() => {
    if (open) markRead(open)
  }, [open])

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="News" description={`Announcements for everyone and for ${department}. Opening one marks it read.`} />
      <SearchBox value={q} onChange={(v) => set('q', v)} label="Search news" placeholder="Title or text" />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ChipRow className="min-w-0 flex-1">
          <Chip active={!show} count={searched.length} onClick={() => set('show', null)}>
            All
          </Chip>
          <Chip active={show === 'unread'} count={unreadCount} onClick={() => set('show', show === 'unread' ? null : 'unread')}>
            Unread
          </Chip>
          <Chip active={show === 'everyone'} count={counts.everyone ?? 0} onClick={() => set('show', show === 'everyone' ? null : 'everyone')}>
            Company-wide
          </Chip>
          <Chip active={show === 'department'} count={counts.department ?? 0} onClick={() => set('show', show === 'department' ? null : 'department')}>
            {department}
          </Chip>
        </ChipRow>
        {filters > 0 && (
          <span className="text-xs text-muted tabular-nums">
            {rows.length} of {all.length}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-3">
        {rows.map((a) => {
          const expanded = open === a.id
          const unread = isUnread(a.id)
          const author = state.users.find((u) => u.id === a.authorId)?.name ?? 'HR'
          return (
            <Card key={a.id} className="min-w-0">
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => set('open', expanded ? null : a.id)}
                className="flex min-h-16 w-full items-center gap-3 rounded-card p-4 text-left hover:bg-surface/60"
              >
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', unread ? 'bg-accent' : 'bg-transparent')} />
                <span className="min-w-0 flex-1">
                  <span className={cn('block truncate', unread ? 'font-bold' : 'font-semibold')}>{a.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {author} · {fmtDate(a.publishedAt)}
                    {unread && <span className="sr-only">, unread</span>}
                  </span>
                </span>
                {a.pinned && (
                  <Badge variant="ink">
                    <Pin className="size-3" aria-hidden />
                    Pinned
                  </Badge>
                )}
                <ChevronDown className={cn('size-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')} aria-hidden />
              </button>
              {expanded && (
                <div className="border-t border-border p-4">
                  <p className="whitespace-pre-line text-[15px] leading-relaxed text-body">{a.body}</p>
                  <p className="mt-3 text-xs text-muted">{a.departmentId ? `For ${department}` : 'For everyone'}</p>
                </div>
              )}
            </Card>
          )
        })}
        {!rows.length && (
          <Card>
            {filters ? (
              <EmptyState compact title="No matching news" description="Change the search or clear the filters." action={<button type="button" className="text-sm font-semibold underline-offset-4 hover:underline" onClick={() => clear()}>Clear filters</button>} />
            ) : (
              <EmptyState icon={<Megaphone />} title="No announcements yet" description="News from HR and your managers shows up here." />
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
