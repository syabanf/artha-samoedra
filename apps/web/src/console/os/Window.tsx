import { cn, FOCUS } from '@artha/ui'
import { Maximize2, Minimize2, Minus, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { clamp, MIN_H, MIN_W, reducedMotion, rectOf, type OsApp, type Rect, type Snap, type Win } from './model'

const EDGE = 12
const RISE: Keyframe[] = [
  { opacity: 0, transform: 'translateY(12px) scale(0.96)' },
  { opacity: 1, transform: 'none' },
]
const RISE_TIMING: KeyframeAnimationOptions = { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }

interface Props {
  win: Win
  app: OsApp
  z: number
  focused: boolean
  /** Desktop size, tracked by the desktop. */
  area: { w: number; h: number }
  areaRef: RefObject<HTMLDivElement | null>
  onFocus: () => void
  onCommit: (next: Win) => void
  onMinimize: () => void
  onToggleMax: () => void
  onClose: () => void
  /** Drag and resize report the snap zone under the pointer and whether frames should ignore the pointer. */
  onDrag: (state: { busy: boolean; snap: Snap | null }) => void
  children: ReactNode
}

export function OsWindow({ win, app, z, focused, area, areaRef, onFocus, onCommit, onMinimize, onToggleMax, onClose, onDrag, children }: Props) {
  const outer = useRef<HTMLElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const rect = rectOf(win, area)
  const painted = useRef(false)
  const prevMin = useRef(win.min)
  // Minimising keeps the window shown until its exit animation ends.
  const [leaving, setLeaving] = useState(false)

  // The first paint skips the transition, so windows do not slide in from the corner.
  useLayoutEffect(() => {
    const el = outer.current
    if (!el) return
    if (!painted.current) el.style.transition = 'none'
    paint(el, rect)
    if (!painted.current) {
      void el.offsetWidth
      el.style.transition = ''
      painted.current = true
    }
  })

  // A window opened in the last second rises in; one restored from a reload just appears.
  useEffect(() => {
    if (!win.min && win.openedAt && Date.now() - win.openedAt < 1000 && !reducedMotion()) inner.current?.animate(RISE, RISE_TIMING)
  }, [])

  useLayoutEffect(() => {
    if (prevMin.current === win.min) return
    prevMin.current = win.min
    const el = inner.current
    el?.getAnimations().forEach((a) => a.cancel())
    setLeaving(win.min && !reducedMotion())
    if (!win.min && !reducedMotion()) el?.animate(RISE, RISE_TIMING)
  }, [win.min])

  // The exit holds its last frame until the window is hidden, and is cancelled on restore.
  useEffect(() => {
    if (!leaving) return
    const exit = inner.current?.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(48px) scale(0.9)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' })
    if (exit) exit.onfinish = () => setLeaving(false)
  }, [leaving])

  /** Runs one pointer gesture: `move` gets the pointer offset, `end` the last one. */
  const gesture = (e: ReactPointerEvent, move: (dx: number, dy: number, ev: PointerEvent) => void, end: (dx: number, dy: number, ev: PointerEvent) => void) => {
    const el = outer.current
    if (!el) return
    e.preventDefault()
    onFocus()
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)
    el.style.transition = 'none'
    onDrag({ busy: true, snap: null })
    let frame = 0
    let last: PointerEvent | null = null
    const at = (ev: PointerEvent) => [ev.clientX - e.clientX, ev.clientY - e.clientY] as const
    const onMove = (ev: PointerEvent) => {
      last = ev
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          if (last) move(...at(last), last)
        })
      }
    }
    const onUp = (ev: PointerEvent) => {
      cancelAnimationFrame(frame)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      el.style.transition = ''
      onDrag({ busy: false, snap: null })
      end(...at(ev), ev)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }

  const startDrag = (e: ReactPointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    const box = areaRef.current?.getBoundingClientRect()
    if (!box) return
    // A maximised or snapped window leaves its slot at its own size, keeping the grab point under the pointer.
    let from: Rect = rect
    if (win.max || win.snap) {
      const ratio = (e.clientX - box.left - rect.x) / rect.w
      from = { w: win.w, h: win.h, x: e.clientX - box.left - ratio * Math.min(win.w, area.w), y: rect.y }
    }
    let snap: Snap | null = null
    let moved = false
    const place = (dx: number, dy: number) => ({ ...from, x: from.x + dx, y: clamp(from.y + dy, 0, box.height - 40) })
    gesture(
      e,
      (dx, dy, ev) => {
        if (!moved && Math.hypot(dx, dy) < 4) return
        moved = true
        paint(outer.current, place(dx, dy))
        const x = ev.clientX - box.left
        const next = x <= EDGE ? 'left' : x >= box.width - EDGE ? 'right' : null
        if (next !== snap) {
          snap = next
          onDrag({ busy: true, snap })
        }
      },
      (dx, dy) => {
        if (!moved) return paint(outer.current, rect)
        const r = place(dx, dy)
        onCommit(snap ? { ...win, max: false, snap } : { ...win, ...r, max: false, snap: null })
      },
    )
  }

  const startResize = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    const box = areaRef.current?.getBoundingClientRect()
    if (!box) return
    const from = rect
    const size = (dx: number, dy: number): Rect => ({
      ...from,
      w: clamp(from.w + dx, MIN_W, box.width - from.x),
      h: clamp(from.h + dy, MIN_H, box.height - from.y),
    })
    gesture(
      e,
      (dx, dy) => paint(outer.current, size(dx, dy)),
      (dx, dy) => onCommit({ ...win, ...size(dx, dy), max: false, snap: null }),
    )
  }

  const titleId = `win-${app.id.replace(/\W/g, '-')}-title`
  return (
    <section
      ref={outer}
      aria-labelledby={titleId}
      data-win={win.id}
      hidden={win.min && !leaving}
      inert={leaving}
      onPointerDownCapture={onFocus}
      onFocusCapture={onFocus}
      style={{ zIndex: z }}
      className="absolute left-0 top-0 transition-[transform,width,height] duration-200 ease-out will-change-transform"
    >
      <div
        ref={inner}
        className={cn(
          'flex size-full flex-col overflow-hidden bg-card text-foreground shadow-float ring-1 transition-shadow',
          win.max ? 'rounded-none' : 'rounded-2xl',
          focused ? 'ring-black/10' : 'ring-black/5',
        )}
      >
        <div
          onPointerDown={startDrag}
          onDoubleClick={(e) => !(e.target as HTMLElement).closest('button') && onToggleMax()}
          className={cn('flex h-10 shrink-0 touch-none select-none items-center gap-2 border-b border-border pl-3 pr-1.5', focused ? 'bg-surface-2' : 'bg-card')}
        >
          <app.icon aria-hidden className={cn('size-4 shrink-0', focused ? 'text-accent-strong' : 'text-silver')} />
          <h2 id={titleId} className={cn('min-w-0 flex-1 truncate text-[13px] font-semibold', focused ? 'text-foreground' : 'text-muted')}>
            {app.label}
          </h2>
          <TitleButton label={`Minimize ${app.label}`} onClick={onMinimize}>
            <Minus />
          </TitleButton>
          <TitleButton label={win.max ? `Restore ${app.label}` : `Maximize ${app.label}`} onClick={onToggleMax}>
            {win.max ? <Minimize2 /> : <Maximize2 />}
          </TitleButton>
          <TitleButton label={`Close ${app.label}`} onClick={onClose} danger>
            <X />
          </TitleButton>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
      {!win.max && (
        <div
          aria-hidden
          onPointerDown={startResize}
          className="absolute bottom-0 right-0 z-10 size-5 cursor-se-resize touch-none"
        >
          <span className="absolute bottom-1.5 right-1.5 size-2 rounded-br-sm border-b-2 border-r-2 border-silver" />
        </div>
      )}
    </section>
  )
}

function TitleButton({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-lg text-muted transition-colors [&_svg]:size-3.5',
        danger ? 'hover:bg-danger hover:text-white' : 'hover:bg-black/5 hover:text-foreground',
        FOCUS,
      )}
    >
      {children}
    </button>
  )
}

function paint(el: HTMLElement | null, r: Rect) {
  if (!el) return
  el.style.transform = `translate3d(${Math.round(r.x)}px, ${Math.round(r.y)}px, 0)`
  el.style.width = `${Math.round(r.w)}px`
  el.style.height = `${Math.round(r.h)}px`
}
