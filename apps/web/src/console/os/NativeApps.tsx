import { attendanceState, employeeOfUser, fmtDateLong, fmtTime, monthDates, monthLabel, nowIso, ymd } from '@artha/fixtures'
import { ATTENDANCE_STATE_LABEL, HR_REQUEST_STATUS_LABEL, LEAVE_TYPE_LABEL } from '@artha/types'
import { cn, FOCUS } from '@artha/ui'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useUser } from '../../auth/auth'
import { NS, readJson, writeJson } from '../../lib/storage'
import { useAppState, useNow } from '../../state/store'
import { addMonth, DAY_TONE, WEEKDAYS } from '../people/parts'
import { ConsoleJessyChat, useConsoleJessy } from '../assistant/AssistantLauncher'
import type { NativeKind } from './model'

/** `onOpenPath` lets Jessy's record links open a console page in a desktop window. */
export function NativeApp({ kind, onOpenPath }: { kind: NativeKind; onOpenPath?: (path: string) => void }) {
  if (kind === 'notes') return <Notes />
  if (kind === 'calc') return <CalculatorApp />
  if (kind === 'jessy') return <JessyApp onOpenPath={onOpenPath} />
  return <CalendarApp />
}

function JessyApp({ onOpenPath }: { onOpenPath?: (path: string) => void }) {
  const chat = useConsoleJessy()
  return (
    <ConsoleJessyChat
      chat={chat}
      className="h-full"
      onFollow={(to, e) => {
        if (!onOpenPath) return
        e.preventDefault()
        onOpenPath(to)
      }}
    />
  )
}

// ---------------------------------------------------------------- notes

function Notes() {
  const user = useUser()
  const key = `${NS}.os.notes.${user.id}`
  const [text, setText] = useState(() => readJson<string>(key) ?? '')
  const [saved, setSaved] = useState(true)

  // Saves half a second after the last keystroke.
  useEffect(() => {
    if (saved) return
    const t = setTimeout(() => setSaved(writeJson(key, text)), 500)
    return () => clearTimeout(t)
  }, [key, text, saved])

  return (
    <div className="flex h-full flex-col bg-highlight-soft">
      <label htmlFor="os-notes" className="sr-only">
        Notes
      </label>
      <textarea
        id="os-notes"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setSaved(false)
        }}
        placeholder="Write a note. It stays in this browser."
        className="min-h-0 flex-1 resize-none bg-transparent p-4 text-sm leading-relaxed text-body outline-none placeholder:text-muted"
      />
      <div className="flex shrink-0 items-center justify-between border-t border-black/5 px-4 py-2 text-[11px] text-muted" aria-live="polite">
        <span>{text.length} characters</span>
        <span>{saved ? 'Saved in this browser' : 'Saving'}</span>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- calculator

type Op = '+' | '−' | '×' | '÷'
const OPS: Record<string, Op> = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷' }

function apply(a: number, op: Op, b: number) {
  if (op === '+') return a + b
  if (op === '−') return a - b
  if (op === '×') return a * b
  return b === 0 ? NaN : a / b
}

const show = (n: number) => (Number.isFinite(n) ? String(Number(n.toPrecision(12))) : 'Cannot divide by 0')

function CalculatorApp() {
  const [entry, setEntry] = useState('0')
  const [acc, setAcc] = useState<number | null>(null)
  const [op, setOp] = useState<Op | null>(null)
  const [fresh, setFresh] = useState(true)

  const digit = (d: string) => {
    if (d === '.' && !fresh && entry.includes('.')) return
    const base = fresh || entry === '0' || entry.startsWith('Cannot') ? (d === '.' ? '0' : '') : entry
    if (base.replace(/\D/g, '').length >= 15) return
    setEntry(base + d)
    setFresh(false)
  }
  const operator = (next: Op) => {
    const value = Number(entry)
    const result = acc !== null && op && !fresh ? apply(acc, op, value) : value
    setAcc(result)
    setEntry(show(result))
    setOp(next)
    setFresh(true)
  }
  const equals = () => {
    if (acc === null || !op) return
    setEntry(show(apply(acc, op, Number(entry))))
    setAcc(null)
    setOp(null)
    setFresh(true)
  }
  const clear = () => {
    setEntry('0')
    setAcc(null)
    setOp(null)
    setFresh(true)
  }
  const back = () => setEntry(fresh || entry.length <= 1 ? '0' : entry.slice(0, -1))
  const negate = () => setEntry(show(-Number(entry)))
  const percent = () => setEntry(show(Number(entry) / 100))

  const onKey = (e: KeyboardEvent) => {
    const k = e.key
    if (/^[0-9.]$/.test(k)) digit(k)
    else if (OPS[k]) operator(OPS[k])
    else if (k === 'Enter' || k === '=') equals()
    else if (k === 'Backspace') back()
    else if (k === 'Escape' || k === 'Delete') clear()
    else return
    e.preventDefault()
  }

  const keys: [string, () => void, 'num' | 'op' | 'fn'][] = [
    ['C', clear, 'fn'],
    ['±', negate, 'fn'],
    ['%', percent, 'fn'],
    ['÷', () => operator('÷'), 'op'],
    ...(['7', '8', '9'] as const).map((d) => [d, () => digit(d), 'num'] as [string, () => void, 'num']),
    ['×', () => operator('×'), 'op'],
    ...(['4', '5', '6'] as const).map((d) => [d, () => digit(d), 'num'] as [string, () => void, 'num']),
    ['−', () => operator('−'), 'op'],
    ...(['1', '2', '3'] as const).map((d) => [d, () => digit(d), 'num'] as [string, () => void, 'num']),
    ['+', () => operator('+'), 'op'],
    ['0', () => digit('0'), 'num'],
    ['.', () => digit('.'), 'num'],
    ['=', equals, 'op'],
  ]

  return (
    <div role="group" aria-label="Calculator" tabIndex={0} onKeyDown={onKey} className="flex h-full flex-col bg-ink p-3 outline-none">
      <div className="flex min-h-20 flex-1 flex-col items-end justify-end px-2 pb-3 text-on-ink">
        <div className="h-4 text-xs text-on-ink-muted">{acc !== null && op ? `${show(acc)} ${op}` : ''}</div>
        <output aria-live="polite" className="w-full truncate text-right text-4xl font-light tabular-nums">
          {entry}
        </output>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {keys.map(([label, run, kind]) => (
          <button
            key={label}
            type="button"
            onClick={run}
            aria-pressed={kind === 'op' && label !== '=' ? op === label && fresh : undefined}
            className={cn(
              'h-12 rounded-full text-lg font-medium transition-colors active:scale-[0.97]',
              label === '0' && 'col-span-2',
              kind === 'num' && 'bg-ink-3 text-on-ink hover:bg-white/15',
              kind === 'fn' && 'bg-white/15 text-on-ink hover:bg-white/25',
              kind === 'op' && 'bg-accent-strong text-white hover:bg-accent-dark aria-pressed:bg-white aria-pressed:text-accent-strong',
              FOCUS,
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- calendar

interface Event {
  date: string
  title: string
  detail: string
}

function CalendarApp() {
  const { state } = useAppState()
  const user = useUser()
  const now = useNow()
  const today = ymd(now)
  const [month, setMonth] = useState(today.slice(0, 7))
  const me = employeeOfUser(state, user.id)
  const dates = monthDates(month)
  const lead = (new Date(`${dates[0]}T12:00:00`).getDay() + 6) % 7
  const inMonth = (d: string) => d.startsWith(month)

  const events: Event[] = [
    ...state.holidays.filter((h) => inMonth(h.date)).map((h) => ({ date: h.date, title: h.name, detail: 'Public holiday' })),
    ...(me
      ? state.hrRequests
          .filter((r) => r.employeeId === me.id && r.leave && (r.status === 'approved' || r.status === 'pending') && r.leave.from <= dates[dates.length - 1] && r.leave.to >= dates[0])
          .map((r) => ({
            date: r.leave!.from < dates[0] ? dates[0] : r.leave!.from,
            title: LEAVE_TYPE_LABEL[r.leave!.type],
            detail: `${r.leave!.from === r.leave!.to ? r.leave!.from : `${r.leave!.from} to ${r.leave!.to}`} · ${HR_REQUEST_STATUS_LABEL[r.status]}`,
          }))
      : []),
    ...(me
      ? state.attendance
          .filter((a) => a.employeeId === me.id && a.date === today && inMonth(today) && a.checkIn)
          .map((a) => ({ date: a.date, title: 'Checked in', detail: `${fmtTime(a.checkIn!)}${a.checkOut ? `, out ${fmtTime(a.checkOut)}` : ''}` }))
      : []),
  ].sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto sm:flex-row">
      <div className="shrink-0 bg-ink p-5 text-on-ink sm:w-52">
        <div className="text-xs font-semibold uppercase tracking-wider text-accent">{new Date(now).toLocaleDateString('en-GB', { weekday: 'long' })}</div>
        <div className="mt-1 text-6xl font-light tabular-nums leading-none">{new Date(now).getDate()}</div>
        <div className="mt-2 text-sm text-on-ink-muted">{fmtDateLong(nowIso())}</div>
        <div className="mt-4 text-2xl font-light tabular-nums">{fmtTime(new Date(now).toISOString())}</div>
      </div>
      <div className="min-w-0 flex-1 p-4">
        <div className="mb-3 flex items-center gap-1">
          <h3 className="flex-1 text-base font-semibold">{monthLabel(month)}</h3>
          <MonthButton label="Previous month" onClick={() => setMonth(addMonth(month, -1))}>
            <ChevronLeft />
          </MonthButton>
          <button type="button" onClick={() => setMonth(today.slice(0, 7))} className={cn('h-8 rounded-full px-3 text-xs font-semibold hover:bg-surface', FOCUS)}>
            Today
          </button>
          <MonthButton label="Next month" onClick={() => setMonth(addMonth(month, 1))}>
            <ChevronRight />
          </MonthButton>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-muted">
          {WEEKDAYS.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, i) => (
            <div key={`lead-${i}`} />
          ))}
          {dates.map((d) => {
            const st = me ? attendanceState(state, me.id, d, now) : null
            const marked = events.some((e) => e.date === d)
            return (
              <div
                key={d}
                title={st ? ATTENDANCE_STATE_LABEL[st] : undefined}
                className={cn('relative flex aspect-square items-center justify-center rounded-xl text-xs tabular-nums', st ? DAY_TONE[st] : 'bg-surface-2', d === today && 'font-bold ring-2 ring-accent-strong')}
              >
                {Number(d.slice(8))}
                {marked && <span aria-hidden className="absolute bottom-1 size-1 rounded-full bg-accent-strong" />}
              </div>
            )
          })}
        </div>
        <h3 className="mt-4 text-sm font-semibold">This month</h3>
        {!me && <p className="mt-1 text-xs text-muted">Your account has no employee record, so attendance and leave do not show here.</p>}
        {events.length ? (
          <ul className="mt-2 space-y-1.5">
            {events.map((e, i) => (
              <li key={`${e.date}-${i}`} className="flex gap-3 rounded-xl bg-surface-2 px-3 py-2 text-sm">
                <span className="w-10 shrink-0 font-semibold tabular-nums text-accent-strong">{Number(e.date.slice(8))}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{e.title}</span>
                  <span className="block truncate text-xs text-muted">{e.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted">No holidays or leave this month.</p>
        )}
      </div>
    </div>
  )
}

function MonthButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn('flex size-8 items-center justify-center rounded-full hover:bg-surface [&_svg]:size-4', FOCUS)}>
      {children}
    </button>
  )
}
