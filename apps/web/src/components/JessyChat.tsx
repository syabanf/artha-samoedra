import { fmtIdrShort, JESSY, jessyStep, MAX_LISTING_PHOTOS, MAX_MESSAGE_CHARS, nowIso, type AppState, type Engine, type Reply, type Turn, type TurnInput } from '@artha/fixtures'
import type { AiAgentId } from '@artha/types'
import { cn, FOCUS, toast } from '@artha/ui'
import { ArrowUp, Paperclip, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppState } from '../state/store'
import { ListingVisual } from './ListingVisual'

export interface Message extends Reply {
  id: number
  from: 'bot' | 'user'
  photos?: string[]
}

let msgId = 0
const toMessages = (replies: Reply[]): Message[] => replies.map((r) => ({ ...r, id: msgId++, from: 'bot' }))

/**
 * Runs a Jessy engine through the AI gateway: keeps the conversation, applies its actions to the store as Jessy,
 * and logs the turn (`ai/logCall`, plus `ai/setMemory` when Jessy learned something about the subject).
 */
/** `by` runs the turn's actions as that user instead of Jessy (the console assistant acts for the member). */
export function useJessyChat<C>(agentId: AiAgentId, start: (s: AppState) => Turn<C>, turn: Engine<C>, by: string = JESSY) {
  const { state, dispatch } = useAppState()
  const [boot] = useState(() => start(state))
  const [convo, setConvo] = useState<C>(boot.convo)
  const [messages, setMessages] = useState<Message[]>(() => toMessages(boot.replies))
  const [typing, setTyping] = useState(false)
  const stateRef = useRef(state)
  stateRef.current = state

  const send = (text: string, input?: TurnInput) => {
    const clean = text.trim()
    if (!clean || typing) return
    setMessages((m) => [...m, { id: msgId++, from: 'user', text: clean, photos: input?.photos }])
    setTyping(true)
    // A short pause reads as Jessy thinking, and lets the user message render first.
    setTimeout(() => {
      const result = jessyStep(stateRef.current, agentId, turn, convo, clean, nowIso(), input, by)
      result.actions.forEach((a) => dispatch(a, a.type === 'ai/logCall' ? JESSY : by))
      setConvo(result.convo)
      setMessages((m) => [...m, ...toMessages(result.replies)])
      setTyping(false)
    }, 450)
  }

  return { messages, typing, send, convo }
}

/** Downscales an image to at most `max` px on the long side and returns a JPEG data URL. */
async function downscale(file: File, max = 800, quality = 0.7) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}

export function JessyChat({
  messages,
  typing,
  onSend,
  renderListingLink,
  renderReview,
  renderAfter,
  placeholder = 'Type a message…',
  className,
}: {
  messages: Message[]
  typing: boolean
  onSend: (text: string, input?: TurnInput) => void
  renderListingLink: (id: string, children: ReactNode) => ReactNode
  /** The review card under the latest reply that asks for one. */
  renderReview?: () => ReactNode
  /** Extra content under a bot message, such as links to records. */
  renderAfter?: (m: Message) => ReactNode
  placeholder?: string
  className?: string
}) {
  const { state } = useAppState()
  const [draft, setDraft] = useState('')
  const [reading, setReading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const name = state.settings.agentName
  const last = messages.at(-1)
  const latest = last?.from === 'bot' && !typing ? last : undefined
  // A proposal card carries its own Confirm and Cancel buttons.
  const quick = latest?.proposal ? [] : (latest?.quick ?? [])

  const attach = async (files: File[]) => {
    const images = files.filter((f) => f.type.startsWith('image/')).slice(0, MAX_LISTING_PHOTOS)
    if (!images.length) return toast('Pick image files', { tone: 'danger', description: 'Photos must be JPEG, PNG or WebP.' })
    setReading(true)
    try {
      const photos = await Promise.all(images.map((f) => downscale(f)))
      onSend(`${photos.length} ${photos.length === 1 ? 'photo' : 'photos'} attached`, { photos })
      if (files.length > images.length) toast(`Only the first ${MAX_LISTING_PHOTOS} images were added`)
    } catch {
      toast('Could not read the photos', { tone: 'danger', description: 'Try another file, or tap Skip.' })
    } finally {
      setReading(false)
    }
  }

  // Scroll the message list only; scrollIntoView would also move the page around an embedded chat.
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, typing])

  const submit = (text: string) => {
    onSend(text)
    setDraft('')
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={cn('flex gap-2', m.from === 'user' && 'justify-end')}>
            {m.from === 'bot' && (
              <span
                aria-hidden
                className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white [&_svg]:size-3.5"
              >
                <Sparkles />
              </span>
            )}
            <div className={cn('min-w-0 max-w-[85%] space-y-2', m.from === 'user' && 'items-end')}>
              <p
                className={cn(
                  'whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed',
                  m.from === 'bot' ? 'rounded-tl-md bg-surface text-foreground' : 'rounded-tr-md bg-ink text-on-ink',
                )}
              >
                <span className="sr-only">{m.from === 'bot' ? `${name}: ` : 'You: '}</span>
                {m.text}
              </p>
              {m.photos && m.photos.length > 0 && (
                <div className="ml-auto grid w-fit grid-cols-2 gap-1.5">
                  {m.photos.map((src, i) => (
                    <img key={i} src={src} alt={`Photo ${i + 1}`} className="size-20 rounded-xl object-cover" />
                  ))}
                </div>
              )}
              {m.listingIds?.map((id) => {
                const l = state.listings.find((x) => x.id === id)
                if (!l) return null
                return (
                  <div key={id}>
                    {renderListingLink(
                      id,
                      <span className="flex items-center gap-3 rounded-2xl border border-border bg-card p-2 pr-3 text-left transition-colors hover:bg-surface-2">
                        <ListingVisual listing={l} className="size-14 shrink-0 rounded-xl [&_span]:hidden [&_svg]:size-6" />
                        <span className="min-w-0">
                          <span className="block font-mono text-[11px] font-semibold text-muted">{l.code}</span>
                          <span className="block truncate text-sm font-semibold">{l.title}</span>
                          <span className="block text-xs text-muted">
                            {fmtIdrShort(l.price)}
                            {l.deal === 'sewa' && '/year'} · {l.city}
                          </span>
                        </span>
                      </span>,
                    )}
                  </div>
                )
              })}
              {m.proposal && (
                <div className="rounded-2xl border border-border bg-card p-3">
                  <p className="text-sm font-semibold">{m.proposal.title}</p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-body">
                    {m.proposal.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {m === latest && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => submit('Confirm')}
                        className={cn('h-9 rounded-full bg-accent-strong px-4 text-xs font-semibold text-white transition-colors hover:bg-accent-dark', FOCUS)}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => submit('Cancel')}
                        className={cn('h-9 rounded-full bg-surface px-4 text-xs font-semibold text-body transition-colors hover:bg-surface-2', FOCUS)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              )}
              {m.from === 'bot' && renderAfter?.(m)}
            </div>
          </div>
        ))}
        {latest?.review && renderReview?.()}
        {typing && (
          <div className="flex items-center gap-2 text-xs text-muted" role="status">
            <span className="flex gap-1" aria-hidden>
              <span className="size-1.5 animate-bounce rounded-full bg-muted" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:120ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:240ms]" />
            </span>
            {name} is typing
          </div>
        )}
      </div>
      {quick.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
          {quick.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => submit(q)}
              className={cn(
                'h-8 shrink-0 whitespace-nowrap rounded-full border border-border bg-card px-3 text-xs font-semibold text-body transition-colors hover:bg-surface',
                FOCUS,
              )}
            >
              {q}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault()
          submit(draft)
        }}
      >
        {latest?.attach && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                void attach(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            <button
              type="button"
              aria-label={`Attach up to ${MAX_LISTING_PHOTOS} photos`}
              disabled={reading}
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-body transition-colors hover:bg-surface-2 disabled:opacity-40 [&_svg]:size-4',
                FOCUS,
              )}
            >
              <Paperclip />
            </button>
          </>
        )}
        <label className="sr-only" htmlFor="jessy-input">
          Message to {name}
        </label>
        <input
          id="jessy-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_MESSAGE_CHARS}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-full border-0 bg-surface px-4 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/20 md:text-sm"
        />
        <button
          type="submit"
          aria-label="Send"
          disabled={!draft.trim() || typing}
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-strong text-white shadow-glow transition-colors hover:bg-accent-dark disabled:opacity-40 [&_svg]:size-4',
            FOCUS,
          )}
        >
          <ArrowUp />
        </button>
      </form>
    </div>
  )
}
