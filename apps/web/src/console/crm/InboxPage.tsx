import { aiCall, fillTemplate, fmtAgo, fmtDateTime, JESSY, newId, nowIso, toMs } from '@artha/fixtures'
import { Badge, Button, Card, Chip, ChipRow, cn, EmptyState, FOCUS, NativeSelect, PageHeader } from '@artha/ui'
import { CHANNEL_LABEL, type Channel, type ChatMessage, type Contact, type Conversation } from '@artha/types'
import { ArrowLeft, ArrowUp, CheckCheck, FileText, Instagram, MessageCircle, RotateCcw, Sparkles, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useAuth, useUser } from '../../auth/auth'
import { paths } from '../../components/links'
import { useAppState, useScoped } from '../../state/store'
import { useAct } from '../dialogs'

type View = 'mine' | 'unassigned' | 'all'
const VIEW_LABEL: Record<View, string> = { mine: 'Mine', unassigned: 'Unassigned', all: 'All' }
const CHANNELS = Object.keys(CHANNEL_LABEL) as Channel[]
const CHANNEL_ICON: Record<Channel, LucideIcon> = { whatsapp: MessageCircle, instagram: Instagram }

const isTeam = (m: ChatMessage) => m.from !== 'contact'
const unreadCount = (c: Conversation) => c.messages.filter((m) => !isTeam(m) && (!c.readAt || toMs(m.at) > toMs(c.readAt))).length
const lastAt = (c: Conversation) => c.messages.at(-1)?.at ?? ''
const firstName = (name: string) => name.split(' ')[0]

/** Drafts a reply to the contact's last message from a few keyword rules; the agent edits it before sending. */
function suggestReply(text: string, contactName: string, agentName: string) {
  const t = text.toLowerCase()
  const hi = `Hi ${firstName(contactName)},`
  if (/visit|survey|saturday|sunday|weekend|tomorrow|morning|afternoon/.test(t))
    return `${hi} that time works. I will book the site visit and send the address and a reminder the day before. ${agentName}`
  if (/price|discount|nego|cheaper|offer/.test(t)) return `${hi} I will check with the owner how much room there is on the price and come back to you today.`
  if (/transfer|paid|booking fee|proof/.test(t)) return `${hi} thank you, we received it. I will send the receipt and the next steps shortly.`
  if (/lease|rent|minimum/.test(t)) return `${hi} the minimum lease is one year, paid yearly in advance. Shall I send the full terms?`
  if (/update|news|any\b/.test(t)) return `${hi} thanks for waiting. I am still waiting on the owner and will update you by tomorrow at the latest.`
  if (/available|still/.test(t)) return `${hi} yes, it is still available. Would you like to schedule a viewing?`
  return `${hi} thanks for your message. Let me check and get back to you shortly.`
}

export function InboxPage() {
  const { state } = useAppState()
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View | null) ?? 'all'
  const channel = (params.get('channel') as Channel | null) || null
  const selectedId = params.get('c')
  const set = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: key !== 'c' })
  }

  const inView = (c: Conversation, v: View) => (v === 'mine' ? c.assigneeId === user.id : v === 'unassigned' ? !c.assigneeId : true)
  const sorted = [...state.conversations].sort((a, b) => lastAt(b).localeCompare(lastAt(a)))
  const viewCounts = Object.fromEntries((Object.keys(VIEW_LABEL) as View[]).map((v) => [v, sorted.filter((c) => inView(c, v) && (!channel || c.channel === channel)).length])) as Record<View, number>
  const rows = sorted.filter((c) => inView(c, view) && (!channel || c.channel === channel))
  const selected = state.conversations.find((c) => c.id === selectedId) ?? null

  return (
    <div>
      <PageHeader title="Inbox" description="WhatsApp and Instagram chats in one place. Jessy answers first; the team takes over here." className={cn('mb-4', selected && 'max-md:hidden')} />
      <div className="grid h-[calc(100dvh-12rem)] min-h-[26rem] grid-cols-1 gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <Card className={cn('flex min-h-0 flex-col overflow-hidden', selected && 'max-md:hidden')}>
          <div className="space-y-2 border-b border-border p-3">
            <ChipRow>
              {(Object.keys(VIEW_LABEL) as View[]).map((v) => (
                <Chip key={v} active={view === v} count={viewCounts[v]} onClick={() => set('view', v === 'all' ? null : v)} className="h-9 px-3">
                  {VIEW_LABEL[v]}
                </Chip>
              ))}
            </ChipRow>
            <ChipRow>
              {CHANNELS.map((ch) => (
                <Chip key={ch} variant="default" active={channel === ch} count={state.conversations.filter((c) => c.channel === ch && inView(c, view)).length} onClick={() => set('channel', channel === ch ? null : ch)} className="h-8">
                  {CHANNEL_LABEL[ch]}
                </Chip>
              ))}
            </ChipRow>
          </div>
          <ConversationList rows={rows} selectedId={selected?.id ?? null} onSelect={(id) => set('c', id)} onClear={() => setParams({}, { replace: true })} filtered={view !== 'all' || !!channel} />
        </Card>
        <Card className={cn('relative flex min-h-0 flex-col overflow-hidden', !selected && 'max-md:hidden')}>
          {selected ? (
            <Thread key={selected.id} conversation={selected} onBack={() => set('c', null)} />
          ) : (
            <EmptyState className="flex-1" icon={<MessageCircle />} title="Pick a conversation" description="Unread chats show a red dot. Opening one marks it as read." />
          )}
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- list

function ConversationList({
  rows,
  selectedId,
  onSelect,
  onClear,
  filtered,
}: {
  rows: Conversation[]
  selectedId: string | null
  onSelect: (id: string) => void
  onClear: () => void
  filtered: boolean
}) {
  const { state } = useAppState()
  if (!rows.length) {
    return (
      <EmptyState
        compact
        className="flex-1"
        title={filtered ? 'No conversations match' : 'No conversations yet'}
        description={filtered ? 'Try another view or channel.' : 'Chats from WhatsApp and Instagram arrive here.'}
        action={filtered ? <Button variant="outline" size="sm" onClick={onClear}>Clear filters</Button> : undefined}
      />
    )
  }
  return (
    <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-2">
      {rows.map((c) => (
        <li key={c.id}>
          <ConversationItem conversation={c} contact={state.contacts.find((x) => x.id === c.contactId)} active={c.id === selectedId} onSelect={() => onSelect(c.id)} />
        </li>
      ))}
    </ul>
  )
}

function ConversationItem({ conversation: c, contact, active, onSelect }: { conversation: Conversation; contact: Contact | undefined; active: boolean; onSelect: () => void }) {
  const Icon = CHANNEL_ICON[c.channel]
  const last = c.messages.at(-1)
  const unread = unreadCount(c)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active || undefined}
      className={cn('flex w-full items-start gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-surface-2', active && 'bg-surface-2', FOCUS)}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface text-body [&_svg]:size-4" aria-hidden>
        <Icon />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-sm', unread ? 'font-bold' : 'font-semibold')}>{contact?.name ?? 'Unknown contact'}</span>
          {last && <span className="shrink-0 text-[11px] text-muted">{fmtAgo(last.at)}</span>}
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={cn('min-w-0 flex-1 truncate text-xs', unread ? 'text-foreground' : 'text-muted')}>{last?.text ?? 'No messages'}</span>
          {c.status === 'closed' && <Badge variant="muted">Closed</Badge>}
          {unread > 0 && (
            <span className="size-2.5 shrink-0 rounded-full bg-accent" role="img" aria-label={`${unread} unread`} />
          )}
        </span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------- thread

function Thread({ conversation: c, onBack }: { conversation: Conversation; onBack: () => void }) {
  const { state, dispatch } = useAppState()
  const { actorName } = useScoped()
  const { can } = useAuth()
  const user = useUser()
  const act = useAct()
  const listRef = useRef<HTMLDivElement>(null)
  const contact = state.contacts.find((x) => x.id === c.contactId)
  const unread = unreadCount(c)
  const manage = can('crm.manage')
  const Icon = CHANNEL_ICON[c.channel]

  // Opening a thread marks it read; a quiet store write, so no toast.
  useEffect(() => {
    if (unread > 0) dispatch({ type: 'conversations/markRead', id: c.id }, user.id)
  }, [c.id, unread, dispatch, user.id])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [c.messages.length])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Back to conversations" onClick={onBack}>
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          {contact ? (
            <Link to={paths.contact(contact.id)} className="block truncate text-sm font-semibold hover:text-accent">
              {contact.name}
            </Link>
          ) : (
            <span className="block text-sm font-semibold">Unknown contact</span>
          )}
          <span className="flex items-center gap-1 text-xs text-muted [&_svg]:size-3">
            <Icon />
            {CHANNEL_LABEL[c.channel]}
            {contact && <span className="font-mono"> · {contact.phone}</span>}
          </span>
        </div>
        {manage ? <ThreadControls conversation={c} /> : <Badge variant={c.status === 'open' ? 'info' : 'muted'}>{c.status === 'open' ? 'Open' : 'Closed'}</Badge>}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {c.messages.map((m) => (
          <Bubble key={m.id} message={m} author={m.from === 'contact' ? (contact?.name ?? 'Contact') : actorName(m.from)} />
        ))}
        {c.status === 'closed' && <p className="text-center text-xs text-muted">Conversation closed. A reply reopens it.</p>}
      </div>

      {manage && <Composer conversation={c} contact={contact} onSend={(text) => act({ type: 'conversations/reply', id: c.id, message: { id: newId('cm'), at: nowIso(), from: user.id, text } }, 'Reply sent', contact?.name)} />}
    </>
  )
}

function ThreadControls({ conversation: c }: { conversation: Conversation }) {
  const { state } = useAppState()
  const act = useAct()
  const agents = state.users.filter((u) => u.status === 'active')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        variant="inline"
        aria-label="Assign conversation"
        value={c.assigneeId ?? ''}
        onChange={(e) => {
          const id = e.target.value || null
          act({ type: 'conversations/assign', id: c.id, assigneeId: id }, id ? `Assigned to ${agents.find((u) => u.id === id)?.name}` : 'Conversation unassigned')
        }}
      >
        <option value="">Unassigned</option>
        {agents.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </NativeSelect>
      {c.status === 'open' ? (
        <Button variant="outline" size="sm" onClick={() => act({ type: 'conversations/setStatus', id: c.id, status: 'closed' }, 'Conversation closed')}>
          <CheckCheck />
          Close
        </Button>
      ) : (
        <Button variant="outline" size="sm" onClick={() => act({ type: 'conversations/setStatus', id: c.id, status: 'open' }, 'Conversation reopened')}>
          <RotateCcw />
          Reopen
        </Button>
      )}
    </div>
  )
}

function Bubble({ message: m, author }: { message: ChatMessage; author: string }) {
  const team = isTeam(m)
  const jessy = m.from === JESSY
  return (
    <div className={cn('flex', team && 'justify-end')}>
      <div className={cn('min-w-0 max-w-[85%]', team && 'text-right')}>
        <p
          className={cn(
            'whitespace-pre-line break-words rounded-2xl px-3.5 py-2.5 text-left text-sm leading-relaxed',
            team ? 'rounded-tr-md bg-ink text-on-ink' : 'rounded-tl-md bg-surface text-foreground',
          )}
        >
          <span className="sr-only">{author}: </span>
          {m.text}
        </p>
        <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted [&_svg]:size-3">
          {jessy && <Sparkles className="text-accent" />}
          {team && <span className="font-semibold">{author}</span>}
          {team && '·'}
          {fmtDateTime(m.at)}
        </span>
      </div>
    </div>
  )
}

function Composer({ conversation: c, contact, onSend }: { conversation: Conversation; contact: Contact | undefined; onSend: (text: string) => boolean }) {
  const { state, dispatch } = useAppState()
  const user = useUser()
  const [draft, setDraft] = useState('')
  const lastFromContact = [...c.messages].reverse().find((m) => !isTeam(m))
  const name = contact?.name ?? 'there'
  // The suggester is an AI gateway agent: hidden while switched off, and every suggestion is logged as a call.
  const suggester = state.aiAgents.find((a) => a.id === 'inbox_assist')
  const suggest = (text: string) => {
    const reply = suggestReply(text, name, firstName(user.name))
    dispatch({ type: 'ai/logCall', call: aiCall(state, 'inbox_assist', 'Suggest reply', text, reply, nowIso(), { subject: contact?.phone ?? null }) }, user.id)
    setDraft(reply)
  }
  const submit = () => {
    const text = draft.trim()
    if (text && onSend(text)) setDraft('')
  }
  return (
    <div className="border-t border-border p-3">
      <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto">
        {lastFromContact && suggester?.enabled !== false && (
          <button
            type="button"
            onClick={() => suggest(lastFromContact.text)}
            className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-accent-soft px-3 text-xs font-semibold text-accent-strong transition-colors hover:bg-accent-soft/70 [&_svg]:size-3.5', FOCUS)}
          >
            <Sparkles />
            {state.settings.agentName || 'Jessy'} suggests
          </button>
        )}
        <TemplateMenu onPick={(body) => setDraft(fillTemplate(body, { name, agent: user.name }))} />
      </div>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label className="sr-only" htmlFor={`reply-${c.id}`}>
          Reply to {name}
        </label>
        <textarea
          id={`reply-${c.id}`}
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Write a reply"
          className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-3xl border-0 bg-surface px-4 py-3 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/20 md:text-sm"
        />
        <button
          type="submit"
          aria-label="Send reply"
          disabled={!draft.trim()}
          className={cn('flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white shadow-glow transition-colors hover:bg-accent-dark disabled:opacity-40 [&_svg]:size-4', FOCUS)}
        >
          <ArrowUp />
        </button>
      </form>
    </div>
  )
}

function TemplateMenu({ onPick }: { onPick: (body: string) => void }) {
  const { state } = useAppState()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div ref={ref} className="shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn('inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-3 text-xs font-semibold text-body transition-colors hover:bg-surface [&_svg]:size-3.5', FOCUS)}
      >
        <FileText />
        Insert template
      </button>
      {open && (
        // Opens upward from the composer and spans the thread width, so it fits at 375 px.
        <div role="menu" className="absolute inset-x-3 bottom-[7.5rem] z-20 max-h-72 overflow-y-auto rounded-2xl bg-card p-1.5 shadow-float">
          {state.templates.length === 0 && <p className="p-3 text-sm text-muted">No templates yet. Add them in Settings, Messaging.</p>}
          {state.templates.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(t.body)
                setOpen(false)
              }}
              className={cn('block w-full rounded-xl p-2.5 text-left hover:bg-surface-2', FOCUS)}
            >
              <span className="block text-sm font-semibold">{t.name}</span>
              <span className="line-clamp-2 block text-xs text-muted">{t.body}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
