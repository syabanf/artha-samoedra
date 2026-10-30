import { nowMs, toMs } from './clock'

const LOCALE = 'en-GB'

export const fmtNumber = (n: number, digits = 0) =>
  n.toLocaleString(LOCALE, { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export const fmtIdr = (n: number) => `Rp ${fmtNumber(Math.round(n))}`

/** Rp 2.5 B · Rp 850 M: billions and millions, the way property ads print prices. */
export const fmtIdrShort = (n: number) => {
  if (n >= 1e12) return `Rp ${fmtNumber(n / 1e12, 2)} T`
  if (n >= 1e9) return `Rp ${fmtNumber(n / 1e9, 2)} B`
  if (n >= 1e6) return `Rp ${fmtNumber(n / 1e6, 1)} M`
  return fmtIdr(n)
}

export const fmtPercent = (n: number, digits = 1) => `${fmtNumber(n, digits)}%`

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' })

export const fmtDateLong = (iso: string) =>
  new Date(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' })

export const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`

export const fmtAgo = (iso: string) => {
  const diff = Math.round((nowMs() - toMs(iso)) / 60_000)
  if (diff < 1) return 'just now'
  if (diff < 60) return `${diff} min ago`
  if (diff < 60 * 24) return `${Math.floor(diff / 60)} h ago`
  const days = Math.floor(diff / (60 * 24))
  if (days < 30) return `${days} d ago`
  return fmtDate(iso)
}

export const fmtArea = (m2: number) => `${fmtNumber(m2)} m²`

export const slugify = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)

/** nextCode(['AS-0007'], 'AS-', 4) → 'AS-0008' */
export const nextCode = (existing: string[], prefix: string, width: number) => {
  const max = existing
    .filter((c) => c.startsWith(prefix))
    .map((c) => Number(c.slice(prefix.length)))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${String(max + 1).padStart(width, '0')}`
}

let seq = 0
export const newId = (prefix: string) => `${prefix}-${nowMs().toString(36)}${(seq++).toString(36)}`

export const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
