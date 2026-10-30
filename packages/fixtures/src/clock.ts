/** Every seeded date is relative to this instant; the app clock starts here and ticks in real time. */
export const FIXTURE_NOW = Date.parse('2026-10-30T09:00:00+07:00')

const bootedAt = Date.now()

export const nowMs = () => FIXTURE_NOW + (Date.now() - bootedAt)
export const nowIso = () => new Date(nowMs()).toISOString()

export const DAY = 86_400_000

export const toMs = (iso: string) => Date.parse(iso)
export const addDays = (iso: string, days: number) => new Date(toMs(iso) + days * DAY).toISOString()
export const startOfDay = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
export const toDateInput = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export const fromDateInput = (value: string) => new Date(`${value}T00:00:00`).toISOString()
