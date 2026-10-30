import type { Settlement } from '@artha/types'
import { at, LISTINGS, PARTNERS, PROFIT_SHARES } from './seed'
import { DEALS } from './seed-crm'
import { COMPANY, USERS } from './seed-iam'
import { buildSettlement } from './sharing'

const base = { profitShares: PROFIT_SHARES, settlements: [] as Settlement[], company: COMPANY, users: USERS, partners: PARTNERS }

/** The Gading Serpong house, sold through deal DL-26-0047 six days ago. */
const sold = LISTINGS.find((l) => l.id === 'lst-10')!
const won = DEALS.find((d) => d.id === 'del-7')!

export const SETTLEMENTS: Settlement[] = [
  { ...buildSettlement(base, sold, won, won.value, won.closedAt ?? at(-6), at(-6)), id: 'stl-1', code: 'ST-26-0001' },
]
