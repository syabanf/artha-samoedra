import { Check, CircleAlert, X } from 'lucide-react'
import { Dialog as D } from 'radix-ui'
import { useRef, useSyncExternalStore, type ReactNode } from 'react'
import { cn, FOCUS } from '../lib/cn'

const OVERLAY =
  'fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0'
const CLOSE = `absolute right-4 top-4 inline-flex size-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground [&_svg]:size-4 ${FOCUS}`

/** Focus goes back to whatever opened the overlay, a menu item included. */
function useReturnFocus() {
  const opener = useRef<HTMLElement | null>(null)
  return {
    onOpenAutoFocus: () => {
      opener.current = document.activeElement as HTMLElement | null
    },
    onCloseAutoFocus: (e: Event) => {
      if (opener.current?.isConnected) {
        e.preventDefault()
        opener.current.focus()
      }
    },
  }
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  size = 'md',
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  size?: keyof typeof SIZES
  children: ReactNode
}) {
  const focus = useReturnFocus()
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={OVERLAY} />
        <D.Content
          {...focus}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card bg-card p-6 text-foreground shadow-float outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
            SIZES[size],
          )}
        >
          <div className="mb-4 flex flex-col gap-1 pr-6">
            <D.Title className="text-lg font-semibold leading-tight">{title}</D.Title>
            {description ? (
              <D.Description className="text-sm text-muted">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          {open && children}
          <D.Close className={CLOSE} aria-label="Close">
            <X />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export const DialogFooter = ({ children, className }: { children: ReactNode; className?: string }) => (
  <div className={cn('mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}>{children}</div>
)

/** Right sheet from md up, bottom sheet on phones. */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const focus = useReturnFocus()
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className={OVERLAY} />
        <D.Content
          {...focus}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90dvh] flex-col rounded-t-[28px] bg-card shadow-float outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-[440px] md:rounded-hero md:data-[state=open]:slide-in-from-right"
        >
          <div className="flex flex-col gap-1 p-6 pb-3 pr-14">
            <D.Title className="text-lg font-semibold leading-tight">{title}</D.Title>
            <D.Description className={description ? 'text-sm text-muted' : 'sr-only'}>{description ?? title}</D.Description>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{open && children}</div>
          {footer && <div className="safe-b flex gap-2 border-t border-border p-4">{footer}</div>}
          <D.Close className={CLOSE} aria-label="Close">
            <X />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

// ---- toast: a tiny external store ----

type ToastTone = 'default' | 'success' | 'danger'
interface ToastItem {
  id: number
  message: string
  description?: string
  tone: ToastTone
}

let toasts: ToastItem[] = []
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
let nextId = 1

export function toast(message: string, opts: { tone?: ToastTone; description?: string } = {}) {
  const item = { id: nextId++, message, tone: opts.tone ?? 'default', description: opts.description }
  toasts = [...toasts, item].slice(-3)
  emit()
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== item.id)
    emit()
  }, 3500)
}

export function Toaster() {
  const items = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => toasts,
  )
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:inset-x-auto md:bottom-4 md:right-4 md:items-end md:px-0"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'danger' ? 'alert' : 'status'}
          className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-on-ink shadow-float animate-in fade-in-0 slide-in-from-bottom-2"
        >
          {t.tone !== 'default' && (
            <span
              className={cn(
                'mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-white [&_svg]:size-3',
                t.tone === 'success' ? 'bg-success' : 'bg-accent',
              )}
            >
              {t.tone === 'success' ? <Check /> : <CircleAlert />}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-medium">{t.message}</div>
            {t.description && <div className="mt-0.5 text-xs text-on-ink-muted">{t.description}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
