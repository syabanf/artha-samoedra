import { RENT_BILLING_MONTHS, type Lease, type RentBill } from '@artha/types'
import { at } from './seed'

/** [listing index, tenant, owner an agent represents, start days ago, months, billing, rent per period, deposit, unpaid periods at the end] */
const leaseRows: [number, string, string | null, number, number, Lease['billing'], number, number, number][] = [
  // Hendra's Simatupang apartment: monthly, ends in about five weeks, the latest month unpaid.
  [7, 'Rina Kartika', null, 300, 11, 'monthly', 10_000_000, 20_000_000, 1],
  // Rumah Kita Realty consigned the MM2100 warehouse for its client; quarterly, in its second year.
  [3, 'PT Sinar Logistik Express', 'Bapak Darmawan Susilo', 400, 24, 'quarterly', 337_500_000, 337_500_000, 0],
  // Made's Ubud villa: a yearly lease that ended three weeks ago, so the villa is back on the market.
  [11, 'Sophie Laurent', null, 386, 12, 'yearly', 450_000_000, 45_000_000, 0],
]

const addMonths = (iso: string, months: number) => {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString()
}

export const LEASES: Lease[] = leaseRows.map(([listing, tenant, ownerName, startAgo, months, billing, rent, deposit], i) => {
  const startDate = at(-startAgo)
  return {
    id: `lea-${i + 1}`,
    code: `SW-${String(i + 1).padStart(3, '0')}`,
    listingId: `lst-${listing + 1}`,
    tenant,
    ownerName,
    startDate,
    endDate: addMonths(startDate, months),
    billing,
    rent,
    deposit,
    feePct: 10,
    agentPct: ownerName ? 30 : 0,
  }
})

const NOW = at(0)

/** Bills from the lease start up to today. Paid bills pay out to the owner five days later. */
export const RENT_BILLS: RentBill[] = LEASES.flatMap((lease, li) => {
  const step = RENT_BILLING_MONTHS[lease.billing]
  const unpaid = leaseRows[li][8]
  const starts: string[] = []
  for (let d = lease.startDate; d < lease.endDate && d <= NOW; d = addMonths(d, step)) starts.push(d)
  return starts.map((periodStart, i) => {
    const open = i >= starts.length - unpaid
    const paidAt = open ? null : new Date(Date.parse(periodStart) + 2 * 86_400_000).toISOString()
    const payoutAt = paidAt && Date.parse(paidAt) + 5 * 86_400_000 <= Date.parse(NOW) ? new Date(Date.parse(paidAt) + 5 * 86_400_000).toISOString() : null
    return { id: `rb-${lease.id}-${i + 1}`, leaseId: lease.id, periodStart, dueDate: periodStart, amount: lease.rent, paidAt, payoutAt }
  })
})
