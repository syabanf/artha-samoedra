import { parseBudget } from '@artha/fixtures'

/** Reads "2.5 B", "850 M" or plain digits into rupiah. */
export const readPrice = (v: string) => parseBudget(v) ?? (Number(v.replace(/\D/g, '')) || null)

/** Formats rupiah for a price input the way readPrice reads it back. */
// Millions are spelled out: parseBudget reads a bare "M" under 100 as billions, the Indonesian way.
export const priceInput = (n: number) => (n >= 1e9 ? `${n / 1e9} B` : n >= 1e6 ? `${n / 1e6} million` : n ? String(n) : '')
