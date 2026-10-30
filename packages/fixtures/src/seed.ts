import type {
  AgentEvent,
  AssetType,
  BlogPost,
  DealType,
  ExclusiveRight,
  Inquiry,
  InquiryChannel,
  InquiryStatus,
  Listing,
  ListingStatus,
  Partner,
  PartnerKind,
  ProfitShare,
  ShareParty,
  Settings,
  SocialPost,
} from '@artha/types'
import { DAY, FIXTURE_NOW } from './clock'
import { slugify } from './format'
import { fromThreeWay } from './sharing'

export const at = (days: number, hour = 9) => new Date(FIXTURE_NOW + days * DAY + (hour - 9) * 3_600_000).toISOString()

const partnerRows: [string, PartnerKind, string, string][] = [
  ['Hendra Gunawan', 'owner', '0812-1100-2231', 'Jakarta Selatan'],
  ['PT Bumi Lestari Properti', 'developer', '0811-8890-1200', 'Tangerang Selatan'],
  ['Sri Wahyuni', 'owner', '0813-5521-7781', 'Bandung'],
  ['Rumah Kita Realty', 'agent', '0817-2200-4410', 'Bekasi'],
  ['Made Arsana', 'owner', '0819-3345-9902', 'Badung'],
  ['CV Gudang Nusantara', 'developer', '0812-7770-3321', 'Surabaya'],
  ['Lukas Tanoto', 'owner', '0815-6612-0045', 'Bogor'],
  ['Prima Agung Properti', 'agent', '0818-0431-5520', 'Semarang'],
]

export const PARTNERS: Partner[] = partnerRows.map(([name, kind, phone, city], i) => ({
  id: `ptn-${i + 1}`,
  code: `MT-${String(i + 1).padStart(3, '0')}`,
  name,
  kind,
  phone,
  email: `${slugify(name).split('-')[0]}@mail.id`,
  city,
  joinedAt: at(-300 + i * 31),
}))

interface ListingSeed {
  title: string
  type: AssetType
  deal: DealType
  partner: number
  city: string
  district: string
  price: number
  land: number
  building: number | null
  beds: number | null
  cert: string
  status: ListingStatus
  highlights: string[]
  age: number
}

const listingRows: ListingSeed[] = [
  { title: 'Modern two-storey house near Fatmawati MRT', type: 'rumah', deal: 'jual', partner: 0, city: 'Jakarta Selatan', district: 'Cilandak', price: 6_850_000_000, land: 240, building: 310, beds: 4, cert: 'SHM', status: 'active', highlights: ['5 minutes to Fatmawati MRT', 'Two-car carport', 'Smart home'], age: 40 },
  { title: 'Ready-to-build plot in BSD City', type: 'tanah', deal: 'jual', partner: 1, city: 'Tangerang Selatan', district: 'Serpong', price: 3_200_000_000, land: 300, building: null, beds: null, cert: 'SHGB', status: 'active', highlights: ['Corner plot, two frontages', 'One-gate cluster', 'Near AEON Mall'], age: 75 },
  { title: 'Three-storey shophouse on Dago main road', type: 'ruko', deal: 'jual', partner: 2, city: 'Bandung', district: 'Coblong', price: 5_400_000_000, land: 120, building: 330, beds: null, cert: 'SHM', status: 'active', highlights: ['6 m frontage', 'Wide front parking', 'Busy food street'], age: 22 },
  { title: 'Warehouse with office in MM2100 estate', type: 'gudang', deal: 'sewa', partner: 3, city: 'Bekasi', district: 'Cikarang Barat', price: 1_350_000_000, land: 2_000, building: 1_400, beds: null, cert: 'HGB', status: 'reserved', highlights: ['40 ft container access', '197 kVA power', 'Near Cibitung toll gate'], age: 58 },
  { title: 'Cliffside ocean-view villa in Uluwatu', type: 'villa', deal: 'jual', partner: 4, city: 'Badung', district: 'Kuta Selatan', price: 14_500_000_000, land: 800, building: 450, beds: 4, cert: 'SHM', status: 'active', highlights: ['Infinity pool', 'Sunset view', 'Guesthouse licence'], age: 12 },
  { title: 'Logistics warehouse by the Waru toll road', type: 'gudang', deal: 'jual', partner: 5, city: 'Sidoarjo', district: 'Waru', price: 18_750_000_000, land: 5_200, building: 3_600, beds: null, cert: 'SHGB', status: 'active', highlights: ['Six loading docks', '12 m ceiling height', '2 km from the toll exit'], age: 90 },
  { title: 'Leafy house in a quiet Sentul neighbourhood', type: 'rumah', deal: 'jual', partner: 6, city: 'Bogor', district: 'Babakan Madang', price: 2_150_000_000, land: 180, building: 140, beds: 3, cert: 'SHM', status: 'active', highlights: ['Mountain view', 'Back garden', 'Near Sentul circuit'], age: 33 },
  { title: 'Furnished 2BR apartment on Simatupang', type: 'apartemen', deal: 'sewa', partner: 0, city: 'Jakarta Selatan', district: 'Pasar Minggu', price: 120_000_000, land: 72, building: 72, beds: 2, cert: 'SHMSRS', status: 'active', highlights: ['Fully furnished', '18th floor city view', 'Direct mall access'], age: 8 },
  { title: 'Roadside commercial land in West Semarang', type: 'tanah', deal: 'jual', partner: 7, city: 'Semarang', district: 'Semarang Barat', price: 9_900_000_000, land: 1_650, building: null, beds: null, cert: 'SHM', status: 'active', highlights: ['Commercial zoning', '25 m road frontage', 'Near Ahmad Yani airport'], age: 120 },
  { title: 'New cluster house in Gading Serpong', type: 'rumah', deal: 'jual', partner: 1, city: 'Tangerang', district: 'Kelapa Dua', price: 1_890_000_000, land: 98, building: 110, beds: 3, cert: 'SHGB', status: 'sold', highlights: ['Mortgage fees covered', 'Cluster pool', 'Near Summarecon Mall'], age: 160 },
  { title: 'Twin shophouses in Harapan Indah', type: 'ruko', deal: 'jual', partner: 3, city: 'Bekasi', district: 'Medan Satria', price: 4_100_000_000, land: 150, building: 360, beds: null, cert: 'SHGB', status: 'active', highlights: ['Two joined units', 'Fits a branch office', 'Near the station'], age: 47 },
  { title: 'Joglo villa among Ubud rice fields', type: 'villa', deal: 'sewa', partner: 4, city: 'Gianyar', district: 'Ubud', price: 450_000_000, land: 600, building: 280, beds: 3, cert: 'SHM', status: 'active', highlights: ['Yearly lease', 'Rice field view', 'Private pool'], age: 19 },
  { title: 'Corner plot in Dago Pakar', type: 'tanah', deal: 'jual', partner: 2, city: 'Bandung', district: 'Cimenyan', price: 2_700_000_000, land: 420, building: null, beds: null, cert: 'SHM', status: 'review', highlights: ['Cool climate', 'Flat contour', '6 m road access'], age: 2 },
  { title: 'Old Menteng house sold at land value', type: 'rumah', deal: 'jual', partner: 6, city: 'Jakarta Pusat', district: 'Menteng', price: 38_000_000_000, land: 900, building: 520, beds: 6, cert: 'SHM', status: 'active', highlights: ['Prime district', 'Priced as land', 'Flood-free'], age: 140 },
  { title: 'Small warehouse in Rungkut Industrial', type: 'gudang', deal: 'sewa', partner: 5, city: 'Surabaya', district: 'Rungkut', price: 210_000_000, land: 450, building: 380, beds: null, cert: 'HGB', status: 'delisted', highlights: ['Fits small businesses', 'Small truck access', '24-hour security'], age: 210 },
  { title: 'Move-in-ready house in Banyumanik', type: 'rumah', deal: 'jual', partner: 7, city: 'Semarang', district: 'Banyumanik', price: 1_250_000_000, land: 135, building: 110, beds: 3, cert: 'SHM', status: 'review', highlights: ['Renovated 2025', 'Near Diponegoro University', 'Family-friendly street'], age: 1 },
]

const describe = (r: ListingSeed) =>
  `${r.title} in ${r.district}, ${r.city}. Land ${r.land} m²${r.building ? `, building ${r.building} m²` : ''}${r.beds ? `, ${r.beds} bedrooms` : ''}. ${r.cert} certificate. ${r.highlights.join('. ')}.`

export const LISTINGS: Listing[] = listingRows.map((r, i) => {
  const code = `AS-${String(i + 1).padStart(4, '0')}`
  return {
    id: `lst-${i + 1}`,
    code,
    slug: `${slugify(r.title)}-${code.toLowerCase()}`,
    title: r.title,
    type: r.type,
    deal: r.deal,
    partnerId: PARTNERS[r.partner].id,
    city: r.city,
    district: r.district,
    address: `${r.district}, ${r.city}`,
    price: r.price,
    landArea: r.land,
    buildingArea: r.building,
    bedrooms: r.beds,
    certificate: r.cert,
    description: describe(r),
    highlights: r.highlights,
    // The MM2100 warehouse waits for photos, which is why Lamudi refused it (seed-ops).
    photo: i === 3 ? null : `/listings/${code}.jpg`,
    status: r.status,
    source: r.status === 'review' || i === 4 || i === 11 ? 'jessy' : 'internal',
    createdAt: at(-r.age),
    updatedAt: at(-Math.min(r.age, 3)),
    soldPrice: r.status === 'sold' ? 1_820_000_000 : null,
    soldAt: r.status === 'sold' ? at(-6) : null,
    delistReason: r.status === 'delisted' ? 'The owner is using the warehouse again.' : null,
  }
})

/** [listing index, started days ago, length in days, remind days before, ended days ago] */
const exclusiveRows: [number, number, number, number, number | null][] = [
  [0, 40, 90, 14, null],
  [1, 75, 90, 14, null], // ends in 15 days
  [2, 22, 60, 7, null],
  [4, 12, 180, 30, null],
  [5, 85, 90, 14, null], // ends in 5 days
  [8, 120, 120, 14, null], // ended today, expired
  [13, 140, 135, 21, null], // expired 5 days ago
  [9, 160, 120, 14, 6], // ended when sold
  [10, 47, 60, 10, null], // ends in 13 days, inside window
]

export const EXCLUSIVES: ExclusiveRight[] = exclusiveRows.map(([li, started, length, remind, ended], i): ExclusiveRight => {
  const left = length - started
  // Milestones (30, 7, 1 days before the end) that passed before the seed instant, or before the right ended, went out on their day.
  const cutoff = ended === null ? 0 : -ended
  const reminders = ([30, 7, 1] as const).filter((m) => left - m <= cutoff).map((days) => ({ days, at: at(left - days) }))
  return {
    id: `exc-${i + 1}`,
    listingId: LISTINGS[li].id,
    startsAt: at(-started),
    endsAt: at(left),
    remindDaysBefore: remind,
    endedAt: ended === null ? null : at(-ended),
    lastRemindedAt: reminders.at(-1)?.at ?? null,
    note: i === 3 ? 'Six-month exclusive, owner wants a weekly report.' : '',
    // exc-6 ends at the seed instant and stays active, so the first sweep on load expires it.
    status: ended !== null ? 'ended' : left < 0 ? 'expired' : 'active',
    reminders,
    contractNo: i === 2 ? '' : `EXC/${String(i + 1).padStart(3, '0')}/AS/2026`,
    signedAt: i === 2 ? null : at(-started - 2),
    document: null,
  }
})

/** Dimas Wicaksono, Rina Kartika and Bayu Saputra. */
const AGENTS = ['usr-2', 'usr-4', 'usr-5']

/** Fixed parties some listings add on top of the old three-way split, by listing id. */
const SHARE_EXTRAS: Record<string, ShareParty[]> = {
  'lst-14': [{ id: 'psh-14-notary', kind: 'other', refId: null, name: 'Notary Hendra Wijaya, S.H.', mode: 'fixed', value: 25_000_000 }],
  'lst-6': [{ id: 'psh-6-cobroker', kind: 'other', refId: null, name: 'Surya Properti (co-broker)', mode: 'fixed', value: 40_000_000 }],
}

/** The original three-way split per listing, migrated to multi-party schemes. */
export const PROFIT_SHARES: ProfitShare[] = LISTINGS.filter((l) => l.status !== 'review').map((l, i) => {
  const exclusive = EXCLUSIVES.some((e) => e.listingId === l.id)
  const rent = l.deal === 'sewa'
  const partnerPct = l.type === 'gudang' ? 20 : exclusive ? 0 : 10
  const agentPct = 30
  const share = fromThreeWay({
    id: `psh-${i + 1}`,
    listingId: l.id,
    commissionPct: rent ? 5 : exclusive ? 3 : 2.5,
    partnerPct,
    agentPct,
    companyPct: 100 - partnerPct - agentPct,
    agentId: AGENTS[i % AGENTS.length],
    note: partnerPct ? 'The partner agent receives a co-broke share.' : '',
  })
  return { ...share, parties: [...(SHARE_EXTRAS[l.id] ?? []), ...share.parties] }
})

const inquiryRows: [string, number | null, InquiryChannel, InquiryStatus, number, string, number | null][] = [
  ['Rizky Ananda', 0, 'web_chat', 'new', 0.1, 'Still available? Can I visit this Saturday?', 7_000_000_000],
  ['Melati Siregar', 4, 'web_chat', 'contacted', 1, 'Can the villa be rented to tourists? Which licences does it have?', null],
  ['Andre Wijaya', 5, 'whatsapp', 'survey', 3, 'Please book a warehouse visit, we need at least 4 loading docks.', 20_000_000_000],
  ['Putri Lestari', null, 'web_chat', 'new', 0.3, 'Looking for a 3-bedroom house in Bogor, budget Rp 2 B.', 2_000_000_000],
  ['Kevin Hartono', 3, 'instagram', 'negotiation', 9, 'Offering Rp 1.2 B a year on a 3-year lease.', 1_200_000_000],
  ['Siti Rahma', 6, 'web_chat', 'contacted', 2, 'Is a mortgage possible? How much is the down payment?', 2_200_000_000],
  ['Bima Prakoso', 2, 'whatsapp', 'new', 0.6, 'Is the Dago shophouse still available? It is for a cafe.', 5_500_000_000],
  ['Laras Ayuningtyas', 9, 'web_chat', 'won', 20, 'I will take the unit.', 1_900_000_000],
  ['Fajar Nugroho', 13, 'whatsapp', 'survey', 4, 'Investor here, please send the land tax and certificate details.', 38_000_000_000],
  ['Dewi Anggraini', 7, 'web_chat', 'lost', 15, 'Found another unit.', null],
  ['Yusuf Maulana', 10, 'instagram', 'contacted', 5, 'Can I buy just one of the twin shophouses?', 2_000_000_000],
  ['Clara Setiawan', 11, 'web_chat', 'new', 1.5, 'What is the minimum lease for the Ubud villa?', 450_000_000],
]

export const INQUIRIES: Inquiry[] = inquiryRows.map(([name, li, channel, status, daysAgo, message, budget], i) => ({
  id: `inq-${i + 1}`,
  code: `INQ-26-${String(101 + i).padStart(4, '0')}`,
  listingId: li === null ? null : LISTINGS[li].id,
  name,
  phone: `08${String(1_122_334_455 + i * 7_919).slice(0, 10)}`,
  channel,
  message,
  budget,
  status,
  ownerId: status === 'new' ? null : 'usr-2',
  createdAt: new Date(FIXTURE_NOW - daysAgo * DAY).toISOString(),
  updatedAt: new Date(FIXTURE_NOW - Math.min(daysAgo, 0.5) * DAY).toISOString(),
}))

export const SETTINGS: Settings = {
  agentName: 'Jessy',
  socialAccounts: ['@infopropertijkt', '@rumahmurahbekasi', '@villabali.daily', '@gudang.indonesia'],
}

export const SOCIAL_POSTS: SocialPost[] = [
  {
    id: 'soc-1',
    listingId: 'lst-5',
    platform: 'instagram',
    account: '@villabali.daily',
    format: 'post',
    hook: 'A sunset every evening from your own pool.',
    caption:
      'Cliffside ocean-view villa in Uluwatu: 4 bedrooms, infinity pool, guesthouse licence in place. A fit for nightly rental investors.',
    hashtags: ['#villabali', '#uluwatu', '#investasiproperti'],
    status: 'published',
    scheduledAt: at(-3, 18),
    approvedBy: 'usr-3',
    publishedAt: at(-3, 18),
    platformPostId: 'ig_3290017745',
    permalink: 'https://www.instagram.com/p/C4uL9xQ/',
    createdAt: at(-4),
  },
  {
    id: 'soc-2',
    listingId: 'lst-4',
    platform: 'tiktok',
    account: '@gudang.indonesia',
    format: 'reel',
    hook: '1,400 m² warehouse in MM2100 that takes 40 ft containers.',
    caption: 'Quick tour of a warehouse with office in West Cikarang. 197 kVA power, 10 minutes to the Cibitung toll gate.',
    hashtags: ['#gudangdisewakan', '#cikarang', '#logistik'],
    scenes: [
      { shot: 'Wide shot of the loading bay with a container truck backing in', onScreen: '1,400 m² for rent', voiceOver: 'This MM2100 warehouse takes 40 ft containers.' },
      { shot: 'Pan across the power panel', onScreen: '197 kVA power', voiceOver: 'It runs on 197 kVA, enough for cold storage.' },
      { shot: 'Walk through the office upstairs', onScreen: 'Office included', voiceOver: 'The office sits right above the floor.' },
      { shot: 'Dashcam drive from the Cibitung toll gate', onScreen: '10 min to the toll', voiceOver: 'And the toll gate is ten minutes away.' },
    ],
    cta: 'Send AS-0004 by DM to book a site visit.',
    audio: 'Steady corporate beat',
    status: 'scheduled',
    scheduledAt: at(1, 19),
    approvedBy: 'usr-3',
    createdAt: at(-1),
  },
  {
    id: 'soc-3',
    listingId: 'lst-11',
    platform: 'instagram',
    account: '@rumahmurahbekasi',
    format: 'post',
    hook: 'Two joined shophouses, one package price.',
    caption: 'Twin shophouses in Harapan Indah with 360 m² of floor space, a fit for a branch office or clinic.',
    hashtags: ['#rukobekasi', '#propertibekasi'],
    status: 'draft',
    scheduledAt: null,
    createdAt: at(-0.2),
  },
]

export const BLOG_POSTS: BlogPost[] = [
  {
    id: 'blg-1',
    slug: 'how-to-check-a-land-certificate-before-buying',
    title: 'How to check a land certificate before buying: 6 practical steps',
    metaTitle: 'How to Check a Land Certificate | Artha Samoedra',
    metaDescription:
      'Six steps to verify an Indonesian land certificate with BPN and the Sentuh Tanahku app, plus the documents to ask the seller for.',
    keywords: ['check land certificate', 'sentuh tanahku', 'buy land safely'],
    geoSummary:
      'To check a land certificate in Indonesia, ask the seller for a copy, look up the number in the Sentuh Tanahku app, then have a notary (PPAT) request an official check at the local BPN land office. The process takes 1 to 7 working days.',
    excerpt: 'How to verify SHM and SHGB certificates through BPN and the official app before you pay a deposit.',
    body: '## Why the certificate needs checking\nDouble certificates and inheritance disputes still happen. An official BPN check confirms the owner name, the area and any block on the title.\n\n## Steps\n1. Ask for a copy of the certificate and the latest land tax bill.\n2. Match the name on the certificate with the seller ID card.\n3. Look up the certificate number in Sentuh Tanahku.\n4. Ask a notary (PPAT) for the official check.\n5. Make sure the title carries no block or seizure note.\n6. Compare the area with a measurement on site.',
    faq: [
      { q: 'How long does a BPN certificate check take?', a: 'Usually 1 to 7 working days through a notary (PPAT).' },
      { q: 'What is the difference between SHM and SHGB?', a: 'SHM is freehold with no expiry. SHGB is a 30-year building right that can be extended.' },
    ],
    listingIds: ['lst-2', 'lst-13'],
    status: 'published',
    publishedAt: at(-12),
    createdAt: at(-14),
  },
  {
    id: 'blg-2',
    slug: 'warehouse-rent-in-cikarang-2026',
    title: 'Warehouse rent in Cikarang in 2026 and what drives the price',
    metaTitle: 'Warehouse Rent in Cikarang 2026 | Artha Samoedra',
    metaDescription:
      'Typical warehouse rent in Cikarang per m² per year, and how location, power supply and container access move the price.',
    keywords: ['warehouse rent cikarang', 'mm2100 warehouse price', 'bekasi logistics warehouse'],
    geoSummary:
      'Warehouse rent in the Cikarang industrial estates runs from Rp 750 thousand to Rp 1.1 million per m² per year in 2026. Rent rises for units with 40 ft container access, more than 150 kVA of power, and a toll gate within 5 km.',
    excerpt: 'Price ranges and a technical checklist before you rent a warehouse in MM2100, Jababeka or Delta Silicon.',
    body: '## Price range\nA standard Cikarang warehouse rents for Rp 750 thousand to Rp 1.1 million per m² per year.\n\n## What moves the price\n- 40 ft container access\n- Power supply\n- Distance to the toll road\n- Ceiling height and loading docks',
    faq: [{ q: 'What is the minimum warehouse lease?', a: 'Usually 2 years, with a 3-month deposit.' }],
    listingIds: ['lst-4'],
    status: 'published',
    publishedAt: at(-5),
    createdAt: at(-6),
  },
  {
    id: 'blg-3',
    slug: 'bali-villa-investment-for-beginners',
    title: 'Bali villa investment for beginners: licences, yield and risk',
    metaTitle: 'Bali Villa Investment for Beginners | Artha Samoedra',
    metaDescription: 'Guesthouse licences, expected nightly-rental yield and the risks to price in before you buy a villa in Bali.',
    keywords: ['bali villa investment', 'guesthouse licence', 'villa yield'],
    geoSummary:
      'A Bali villa let on nightly rental earns a gross yield of about 8 to 12 percent a year. Buyers should confirm a guesthouse licence or building permit and tourism zoning before they buy.',
    excerpt: 'What to check before buying a villa to rent out: licences, zoning, occupancy and management costs.',
    body: '## Licences you need\nA guesthouse licence or a building permit for business use.\n\n## Working out the yield\nSixty percent occupancy at the average nightly rate sets the gross income.',
    faq: [{ q: 'Can foreigners buy a villa?', a: 'Foreigners can hold a right of use (hak pakai), not freehold SHM.' }],
    listingIds: ['lst-5', 'lst-12'],
    status: 'draft',
    publishedAt: null,
    createdAt: at(-1),
  },
]

export const AGENT_EVENTS: AgentEvent[] = [
  { id: 'evt-1', at: at(-0.1), kind: 'inquiry', text: 'Logged an inquiry from Rizky Ananda for AS-0001 via web chat.', ref: 'inq-1' },
  { id: 'evt-2', at: at(-1), kind: 'listing', text: 'Received new listing AS-0016 from Prima Agung Properti via chat.', ref: 'lst-16' },
  { id: 'evt-3', at: at(-2), kind: 'reminder', text: 'Reminded the team: the AS-0006 exclusive ends in 7 days.', ref: 'lst-6' },
  { id: 'evt-4', at: at(-4), kind: 'content', text: 'Drafted an Instagram post for AS-0005 on @villabali.daily.', ref: 'soc-1' },
]
