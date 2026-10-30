import type { OpenHouse, Payment, PortalSync, Project, Promotion, SavedProperty, SitePage, Unit, UnitStatus, Visit } from '@artha/types'
import { at, INQUIRIES, LISTINGS } from './seed'

export const PROJECTS: Project[] = [
  {
    id: 'prj-1',
    code: 'PRJ-SRP',
    name: 'Serpong Green Residence',
    kind: 'cluster',
    partnerId: 'ptn-2',
    city: 'Tangerang Selatan',
    district: 'Serpong',
    description: 'Two blocks of 2-storey family houses, one-gate cluster, 5 minutes to the toll gate.',
    createdAt: at(-120),
  },
  {
    id: 'prj-2',
    code: 'PRJ-SMT',
    name: 'Simatupang Sky Suites',
    kind: 'tower',
    partnerId: 'ptn-1',
    city: 'Jakarta Selatan',
    district: 'Pasar Minggu',
    description: 'Serviced apartment tower with direct mall access, floors 15 to 18 on sale.',
    createdAt: at(-200),
  },
  {
    id: 'prj-3',
    code: 'PRJ-CKR',
    name: 'Cikarang Logistics Park',
    kind: 'warehouse_park',
    partnerId: 'ptn-4',
    city: 'Bekasi',
    district: 'Cikarang Barat',
    description: 'Six warehouse bays with shared loading yard inside the MM2100 estate.',
    createdAt: at(-60),
  },
]

// A fixed pattern keeps the board readable: mostly available, a few held, booked and sold.
const PATTERN: UnitStatus[] = ['sold', 'available', 'available', 'booked', 'available', 'held', 'available', 'sold']

const cluster: Unit[] = ['A', 'B'].flatMap((block, b) =>
  Array.from({ length: 8 }, (_, i) => ({
    id: `unt-${block}${i + 1}`,
    projectId: 'prj-1',
    code: `${block}-${String(i + 1).padStart(2, '0')}`,
    group: `Block ${block}`,
    type: i % 4 === 3 ? 'Corner 120' : 'Type 90',
    landArea: i % 4 === 3 ? 150 : 105,
    buildingArea: i % 4 === 3 ? 120 : 90,
    bedrooms: 3,
    price: (i % 4 === 3 ? 2_450_000_000 : 1_890_000_000) + b * 50_000_000,
    status: PATTERN[(i + b * 3) % PATTERN.length],
    dealId: null,
    holdUntil: PATTERN[(i + b * 3) % PATTERN.length] === 'held' ? at(1, 17) : null,
  })),
)

const tower: Unit[] = [15, 16, 17, 18].flatMap((floor, f) =>
  Array.from({ length: 4 }, (_, i) => ({
    id: `unt-${floor}${i + 1}`,
    projectId: 'prj-2',
    code: `${floor}-${String(i + 1).padStart(2, '0')}`,
    group: `Floor ${floor}`,
    type: i % 2 ? '2BR' : '1BR',
    landArea: null,
    buildingArea: i % 2 ? 72 : 45,
    bedrooms: i % 2 ? 2 : 1,
    price: (i % 2 ? 1_650_000_000 : 1_050_000_000) + f * 40_000_000,
    status: PATTERN[(i + f * 2 + 1) % PATTERN.length],
    dealId: null,
    holdUntil: PATTERN[(i + f * 2 + 1) % PATTERN.length] === 'held' ? at(-0.2) : null,
  })),
)

const park: Unit[] = Array.from({ length: 6 }, (_, i) => ({
  id: `unt-W${i + 1}`,
  projectId: 'prj-3',
  code: `W-${String(i + 1).padStart(2, '0')}`,
  group: 'Bays',
  type: i < 2 ? 'Bay 1,400 m²' : 'Bay 900 m²',
  landArea: i < 2 ? 2_000 : 1_300,
  buildingArea: i < 2 ? 1_400 : 900,
  bedrooms: null,
  price: i < 2 ? 1_350_000_000 : 900_000_000,
  status: i === 0 ? 'booked' : i === 4 ? 'sold' : 'available',
  dealId: i === 0 ? 'del-4' : null,
  holdUntil: null,
}))

export const UNITS: Unit[] = [...cluster, ...tower, ...park]

const visit = (n: number, contact: string, agent: string, day: number, hour: number, status: Visit['status'], extra: Partial<Visit> = {}): Visit => ({
  id: `vis-${n}`,
  code: `VS-26-${String(200 + n).padStart(4, '0')}`,
  listingId: null,
  unitId: null,
  contactId: contact,
  dealId: null,
  agentId: agent,
  startAt: at(day, hour),
  durationMin: 60,
  status,
  notes: '',
  rating: null,
  feedback: '',
  createdAt: at(day - 3),
  ...extra,
})

export const VISITS: Visit[] = [
  visit(1, 'con-3', 'usr-2', -3, 10, 'done', { listingId: 'lst-6', dealId: 'del-3', rating: 4, feedback: 'Needs a taller canopy over dock 3.' }),
  visit(2, 'con-10', 'usr-4', -14, 14, 'no_show', { listingId: 'lst-11', dealId: 'del-9' }),
  visit(3, 'con-1', 'usr-2', 1, 10, 'scheduled', { listingId: 'lst-1', dealId: 'del-1', notes: 'Buyer prefers 10:00, bring the floor plan.' }),
  visit(4, 'con-2', 'usr-5', 2, 10, 'scheduled', { listingId: 'lst-5', dealId: 'del-2' }),
  visit(5, 'con-9', 'usr-6', 0, 15, 'scheduled', { listingId: 'lst-14', dealId: 'del-8' }),
  visit(6, 'con-6', 'usr-4', 0, 9, 'checked_in', { unitId: 'unt-A3', notes: 'Comparing A-03 with the Sentul house.' }),
  visit(7, 'con-7', 'usr-4', 3, 13, 'scheduled', { listingId: 'lst-3', dealId: 'del-6' }),
  visit(8, 'con-14', 'usr-2', 5, 11, 'scheduled', { unitId: 'unt-162' }),
]

export const OPEN_HOUSES: OpenHouse[] = [
  {
    id: 'oh-1',
    slug: 'sentul-house-open-day',
    title: 'Sentul family house open day',
    listingId: 'lst-7',
    projectId: null,
    startAt: at(2, 10),
    endAt: at(2, 14),
    capacity: 20,
    hostId: 'usr-4',
    published: true,
    registrations: [
      { id: 'ohr-1', name: 'Putri Lestari', phone: INQUIRIES[3].phone, at: at(-1), attended: false },
      { id: 'ohr-2', name: 'Hadi Gunawan', phone: '0812-4400-1188', at: at(-0.5), attended: false },
      { id: 'ohr-3', name: 'Mira Santoso', phone: '0813-9911-2020', at: at(-0.2), attended: false },
    ],
    createdAt: at(-7),
  },
  {
    id: 'oh-2',
    slug: 'serpong-green-show-unit',
    title: 'Serpong Green show unit weekend',
    listingId: null,
    projectId: 'prj-1',
    startAt: at(-9, 9),
    endAt: at(-9, 16),
    capacity: 40,
    hostId: 'usr-2',
    published: true,
    registrations: [
      { id: 'ohr-4', name: 'Rina Wulandari', phone: '0817-2233-4455', at: at(-15), attended: true },
      { id: 'ohr-5', name: 'Joko Susilo', phone: '0818-6655-4433', at: at(-12), attended: true },
      { id: 'ohr-6', name: 'Anita Hartati', phone: '0819-1122-3344', at: at(-11), attended: false },
    ],
    createdAt: at(-20),
  },
]

export const PAYMENTS: Payment[] = [
  { id: 'pay-1', code: 'PAY-26-0301', kind: 'booking_fee', dealId: 'del-4', contactId: 'con-5', unitId: 'unt-W1', amount: 50_000_000, method: 'virtual_account', status: 'paid', reference: '8808 1234 5678 0301', expiresAt: at(-8), paidAt: at(-9), refundOf: null, createdBy: 'usr-2', createdAt: at(-10) },
  { id: 'pay-2', code: 'PAY-26-0302', kind: 'booking_fee', dealId: 'del-5', contactId: 'con-6', unitId: null, amount: 20_000_000, method: 'qris', status: 'pending', reference: 'QRIS-26-0302', expiresAt: at(1, 17), paidAt: null, refundOf: null, createdBy: 'usr-4', createdAt: at(-0.3) },
  { id: 'pay-3', code: 'PAY-26-0303', kind: 'booking_fee', dealId: 'del-7', contactId: 'con-8', unitId: null, amount: 15_000_000, method: 'transfer', status: 'paid', reference: 'BCA 0291 7723', expiresAt: null, paidAt: at(-21), refundOf: null, createdBy: 'usr-2', createdAt: at(-22) },
  { id: 'pay-4', code: 'PAY-26-0304', kind: 'booking_fee', dealId: 'del-9', contactId: 'con-10', unitId: null, amount: 25_000_000, method: 'virtual_account', status: 'expired', reference: '8808 1234 5678 0304', expiresAt: at(-13), paidAt: null, refundOf: null, createdBy: 'usr-4', createdAt: at(-15) },
]

const live = LISTINGS.filter((l) => l.status === 'active' || l.status === 'reserved')
export const PORTAL_SYNCS: PortalSync[] = [
  ...live.slice(0, 8).flatMap((l, i) => [
    { id: `syn-${l.id}-r`, listingId: l.id, portal: 'rumah123' as const, status: 'live' as const, externalId: `R123-${48100 + i}`, lastSyncAt: at(-1), error: null, views: 420 - i * 37, leads: 9 - i },
    {
      id: `syn-${l.id}-l`,
      listingId: l.id,
      portal: 'lamudi' as const,
      status: i === 3 ? ('error' as const) : ('live' as const),
      externalId: i === 3 ? null : `LMD-${9100 + i}`,
      lastSyncAt: at(-2),
      error: i === 3 ? 'Lamudi rejected the listing: photos are required.' : null,
      views: i === 3 ? 0 : 210 - i * 20,
      leads: i === 3 ? 0 : Math.max(0, 4 - i),
    },
  ]),
  { id: 'syn-lst-15-r', listingId: 'lst-15', portal: 'rumah123', status: 'removed', externalId: 'R123-47002', lastSyncAt: at(-30), error: null, views: 980, leads: 6 },
]

export const PROMOTIONS: Promotion[] = [
  { id: 'prm-1', listingId: 'lst-5', kind: 'featured', startsAt: at(-5), endsAt: at(25), promoPrice: null, label: 'Editor pick', createdAt: at(-5) },
  { id: 'prm-2', listingId: 'lst-14', kind: 'price_drop', startsAt: at(-2), endsAt: at(28), promoPrice: 35_500_000_000, label: 'Price cut', createdAt: at(-2) },
  { id: 'prm-3', listingId: 'lst-2', kind: 'featured', startsAt: at(-40), endsAt: at(-10), promoPrice: null, label: 'BSD launch', createdAt: at(-40) },
]

export const SITE_PAGES: SitePage[] = [
  {
    id: 'pg-about',
    slug: 'about',
    kind: 'about',
    title: 'About Artha Samoedra',
    summary: 'A property marketing house that checks every certificate before a listing goes live.',
    body: '## Who we are\nArtha Samoedra markets land, houses, shophouses, warehouses and villas for owners and developers across Java and Bali.\n\n## How we work\n1. We check the certificate and land tax before a listing goes live.\n2. Jessy answers buyers day and night.\n3. A named agent takes every inquiry the same day.',
    city: null,
    published: true,
    updatedAt: at(-30),
  },
  {
    id: 'pg-contact',
    slug: 'contact',
    kind: 'contact',
    title: 'Contact us',
    summary: 'Offices in Jakarta, Bandung, Surabaya and Bali.',
    body: '## Head office\nJl. TB Simatupang Kav. 18, Jakarta Selatan. Phone 021-7880-1200.\n\n## Branch offices\n- Bandung: Jl. Ir. H. Juanda 112\n- Surabaya: Jl. Raya Darmo 45\n- Bali: Jl. Sunset Road 88',
    city: null,
    published: true,
    updatedAt: at(-30),
  },
  {
    id: 'pg-bali',
    slug: 'bali',
    kind: 'area_guide',
    title: 'Buying property in Bali',
    summary: 'Villas in Uluwatu and Ubud, licences for nightly rentals, and what foreigners can hold.',
    body: '## Where buyers look\n- Uluwatu for ocean views and surf tourism\n- Ubud for rice-field villas and long stays\n\n## Licences\nA villa let by the night needs a guesthouse licence or a building permit for business use.',
    city: 'Badung',
    published: true,
    updatedAt: at(-12),
  },
  {
    id: 'pg-bekasi',
    slug: 'bekasi',
    kind: 'area_guide',
    title: 'Warehouses and shophouses in Bekasi',
    summary: 'Industrial estates in Cikarang and busy shophouse rows in Harapan Indah.',
    body: '## Industrial estates\nMM2100, Jababeka and Delta Silicon host most warehouse demand.\n\n## Shophouses\nHarapan Indah and Summarecon Bekasi suit clinics, cafes and branch offices.',
    city: 'Bekasi',
    published: true,
    updatedAt: at(-8),
  },
  {
    id: 'pg-bandung',
    slug: 'bandung',
    kind: 'area_guide',
    title: 'Living and investing in Bandung',
    summary: 'Cool hills in Dago and busy food streets in the city centre.',
    body: '## Dago and Dago Pakar\nCool air and views. Plots sell by the square metre with road width setting the price.',
    city: 'Bandung',
    published: false,
    updatedAt: at(-1),
  },
  {
    id: 'pg-privacy',
    slug: 'privacy',
    kind: 'legal',
    title: 'Privacy policy',
    summary: 'How Artha Samoedra handles the details you share with Jessy and our team.',
    body: '## What we keep\nYour name, WhatsApp number and the properties you ask about.\n\n## What we do not do\nWe do not sell your details. You can opt out of marketing messages at any time.',
    city: null,
    published: true,
    updatedAt: at(-90),
  },
]

export const SAVED_PROPERTIES: SavedProperty[] = [
  { id: 'sav-1', phone: INQUIRIES[0].phone.replace(/\D/g, ''), listingId: 'lst-1', at: at(-1) },
  { id: 'sav-2', phone: INQUIRIES[0].phone.replace(/\D/g, ''), listingId: 'lst-8', at: at(-0.5) },
]
