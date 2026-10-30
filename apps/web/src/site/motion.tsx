/*
 * Public-site motion without a library: IntersectionObserver sets data-shown and the CSS in
 * index.css animates it. The theme's reduced-motion rule shortens every transition to nothing,
 * so content still appears, only without the movement.
 */
import { cn } from '@artha/ui'
import { Fragment, useEffect, useRef, useState, type ComponentProps, type CSSProperties, type ReactNode } from 'react'
import { useNavigation } from 'react-router'
import { BrandLogo } from '../components/BrandMark'

/** True once the element has scrolled into view; it stays true. */
function useInView<T extends Element>(margin = '0px 0px -12% 0px') {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || shown) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { rootMargin: margin })
    io.observe(el)
    return () => io.disconnect()
  }, [margin, shown])
  return [ref, shown] as const
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Rises and fades in on first view. `delay` staggers siblings; `variant` picks the motion. */
export function Reveal({
  children,
  className,
  delay = 0,
  variant = 'up',
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  variant?: 'up' | 'scale' | 'clip'
  as?: 'div' | 'li' | 'section'
}) {
  const [ref, shown] = useInView<HTMLDivElement>()
  return (
    <Tag
      ref={ref as never}
      data-shown={shown || undefined}
      className={cn('reveal', variant !== 'up' && `reveal-${variant}`, className)}
      style={{ '--d': `${delay}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  )
}

/** Each word rises out of a mask, one after another. Screen readers get the plain text. */
export function SplitWords({ text, base = 0 }: { text: string; base?: number }) {
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(' ').map((w, i) => (
          <Fragment key={i}>
            <span className="word">
              <span style={{ '--i': i, '--base': `${base}ms` } as CSSProperties}>{w}</span>
            </span>{' '}
          </Fragment>
        ))}
      </span>
    </>
  )
}

/** Counts up from zero the first time it comes into view. */
export function CountUp({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [ref, shown] = useInView<HTMLSpanElement>()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!shown) return
    if (reduced()) return setN(value)
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min((t - start) / 1200, 1)
      setN(Math.round(value * (1 - (1 - p) ** 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [shown, value])
  return (
    <span ref={ref} aria-label={`${value}${suffix}`}>
      <span aria-hidden>
        {n}
        {suffix}
      </span>
    </span>
  )
}

/**
 * Text whose words darken from silver to ink as the reader scrolls past it. A ReactNode part
 * (an inline photo) sits between the words untouched.
 */
export function ScrollFill({ parts, className }: { parts: (string | ReactNode)[]; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    if (reduced()) return setProgress(1)
    let raf = 0
    const measure = () => {
      raf = 0
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const vh = innerHeight
      setProgress(Math.min(Math.max((vh * 0.85 - r.top) / (r.height + vh * 0.3), 0), 1))
    }
    const onScroll = () => (raf ||= requestAnimationFrame(measure))
    measure()
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    return () => {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [])
  const words = parts.flatMap((p) => (typeof p === 'string' ? p.split(' ').filter(Boolean) : [p]))
  const lit = Math.round(progress * words.length)
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) =>
        typeof w === 'string' ? (
          <span key={i} className={cn('transition-colors duration-300', i < lit ? 'text-foreground' : 'text-silver')}>
            {w}{' '}
          </span>
        ) : (
          <span key={i}>{w} </span>
        ),
      )}
    </p>
  )
}

/** An image that fades in once loaded; give its frame the `shimmer` class for the loading sweep. */
export function FadeImage({ className, onLoad, ...props }: ComponentProps<'img'>) {
  const [loaded, setLoaded] = useState(false)
  return (
    <img
      {...props}
      ref={(el) => {
        if (el?.complete && el.naturalWidth && !loaded) setLoaded(true)
      }}
      data-loaded={loaded || undefined}
      onLoad={(e) => {
        setLoaded(true)
        onLoad?.(e)
      }}
      className={cn('fade-img', className)}
    />
  )
}

/** A thin accent bar across the top while the next page's code loads. */
export function RouteProgress() {
  const busy = useNavigation().state !== 'idle'
  return busy ? (
    <div role="progressbar" aria-label="Loading page" className="fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-accent/15">
      <div className="route-progress h-full w-1/3 rounded-full bg-accent" />
    </div>
  ) : null
}

const SPLASH_KEY = 'artha.splash'

/**
 * First visit in a session: the brand mark and a filling bar over the page until the hero photo
 * has loaded, at least 0.6 s and at most 1.6 s.
 */
export function Splash({ src }: { src: string | null | undefined }) {
  const [phase, setPhase] = useState<'on' | 'leaving' | 'off'>(() => {
    try {
      return sessionStorage.getItem(SPLASH_KEY) || reduced() ? 'off' : 'on'
    } catch {
      return 'off'
    }
  })
  useEffect(() => {
    if (phase !== 'on') return
    try {
      sessionStorage.setItem(SPLASH_KEY, '1')
    } catch {
      // Private mode: the splash shows again next time, which is harmless.
    }
    const started = performance.now()
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setTimeout(() => setPhase('leaving'), Math.max(0, 600 - (performance.now() - started)))
    }
    const cap = setTimeout(finish, 1600)
    if (src) {
      const img = new Image()
      img.onload = img.onerror = finish
      img.src = src
    } else finish()
    return () => clearTimeout(cap)
  }, [phase, src])
  useEffect(() => {
    if (phase !== 'leaving') return
    const t = setTimeout(() => setPhase('off'), 600)
    return () => clearTimeout(t)
  }, [phase])
  if (phase === 'off') return null
  return (
    <div aria-hidden className={cn('splash fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-card', phase === 'leaving' && 'splash-leave')}>
      <span className="splash-mark">
        <BrandLogo className="h-12" />
      </span>
      <span className="h-1 w-40 overflow-hidden rounded-full bg-surface">
        <span className="splash-bar block h-full rounded-full bg-accent" />
      </span>
    </div>
  )
}
