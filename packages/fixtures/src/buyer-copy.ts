/**
 * Words for the public buyer chat: how Jessy reads a message (language and intent) and what she says back,
 * in English and Indonesian. The engine in jessy.ts picks the facts; every sentence lives here.
 */
import type { AssetType, DealType, Listing } from '@artha/types'
import { ASSET_TYPE_LABEL } from '@artha/types'
import { fmtArea, fmtIdrShort } from './format'
import { speaksIndonesian } from './guardrails'

export type Lang = 'en' | 'id'

// ---------------------------------------------------------------- language

const ID_HINT = /\b(halo|hai|pagi|siang|sore|malam|selamat|makasih|terima|trims|harganya|sertifikatnya|luasnya|kamarnya|lokasinya|alamatnya|masih|bisa|yang|kalau|di|ke|bandingkan|siapa|berapa|mana|dimana|nego|dijual|disewakan|murah|pertama|kedua|ketiga|nomor|oke|sip|dong|ya|kak|aja|saja|ada|mau|rumah|tanah|jadwalkan|survei|hubungi|hubungkan|tunai|sekarang|lewati|cicilan|cara|lihat|sampai|jumpa|dah|apakah|kantor)\b/g
const EN_HINT = /\b(hi|hello|hey|the|is|are|what|how|can|i|you|my|me|for|under|in|with|price|house|land|thanks|thank|bye|good|morning|cheaper|compare|available|which|where|does|do|it|one|second|first|please|book|visit|contact|show|find|who|much|see)\b/g

const count = (t: string, re: RegExp) => t.match(re)?.length ?? 0

/** The language of this message, or the conversation's language when the message could be either ("ok", a code, a name). */
export const detectLang = (text: string, prev: Lang): Lang => {
  if (speaksIndonesian(text)) return 'id'
  const t = text.toLowerCase()
  const id = count(t, ID_HINT)
  const en = count(t, EN_HINT)
  return id > en ? 'id' : en > id ? 'en' : prev
}

// ---------------------------------------------------------------- formatting

/** Rp 2,15 M and Rp 850 jt for Indonesian readers; Rp 2.15 B and Rp 850 M in English, as on the site. */
export const money = (n: number, lang: Lang) => {
  if (lang === 'en') return fmtIdrShort(n)
  const num = (v: number, digits: number) => v.toLocaleString('id-ID', { maximumFractionDigits: digits })
  if (n >= 1e12) return `Rp ${num(n / 1e12, 2)} T`
  if (n >= 1e9) return `Rp ${num(n / 1e9, 2)} M`
  if (n >= 1e6) return `Rp ${num(n / 1e6, 1)} jt`
  return `Rp ${num(n, 0)}`
}

const TYPE_ID: Record<AssetType, string> = { tanah: 'Tanah', rumah: 'Rumah', ruko: 'Ruko', gudang: 'Gudang', villa: 'Villa', apartemen: 'Apartemen' }
export const typeName = (t: AssetType, lang: Lang) => (lang === 'id' ? TYPE_ID : ASSET_TYPE_LABEL)[t]

export const titleCase = (text: string) => text.replace(/\b[a-z]/g, (c) => c.toUpperCase())

const perYear = (l: Listing, lang: Lang) => (l.deal === 'sewa' ? (lang === 'id' ? ' per tahun' : ' a year') : '')
const priceOf = (l: Listing, lang: Lang) => `${money(l.price, lang)}${perYear(l, lang)}`
const placeLine = (l: Listing) => `${l.district}, ${l.city}`
/** The street address when the listing has one beyond its district and city. */
const street = (l: Listing) => (l.address !== placeLine(l) ? l.address : null)

// ---------------------------------------------------------------- intents

/** What a message asks for. Patterns run on the lowercased text. */
export const INTENT = {
  greeting: /^(hal+o+|hai+|hi+|hello+|hey+|selamat (pagi|siang|sore|malam)|pagi|siang|sore|malam|good (morning|afternoon|evening)|assalamu\w*)\b/,
  thanks: /^(terima ?kasih|makasih|thanks?( you)?|thx|tq|trims)\b/,
  ok: /^(ok(e|ay)?|oke+|sip|siap|baik|alright|got it|noted|mantap|great)$/,
  bye: /^(bye|goodbye|dadah?|sampai jumpa|see you)\b/,
  /** Words left over after a greeting or thanks that do not ask anything. */
  filler: /\b(kak|kakak|jessy|min|admin|there|ya|yah|dong|sis|gan|juga|banyak|very much|so much|a lot|semua)\b/g,
  who: /\b(siapa (kamu|anda|ini)|kamu siapa|who are you|what are you|are you (a )?(bot|human|robot|real))\b/,
  compare: /\b(bandingkan|banding|compare|comparison|vs|versus|bedanya|perbedaan|difference)\b/,
  visit: /\b(visit|viewing|book|schedule|contact|call me|interested|survei|survey|jadwal\w*|hubungi|hubungkan|connect|kontak|tertarik|minat|telepon|whatsapp|wa|see it|see the|lihat langsung|bisa lihat|mau lihat)\b/,
  nego: /\b(nego\w*|negotiat\w*|tawar\w*|diskon|discount|best price|harga pas)\b/,
  kpr: /\b(kpr|mortgage|cicil\w*|kredit|installment|bank loan|pinjaman)\b/,
  howToBuy: /\b(cara (beli|membeli|pembelian)|proses\w* (beli|pembelian)|alur\w*|how (do i|to|does) buy\w*|buying process|how buying works|steps to buy|langkah\w* (beli|membeli))\b/,
  docs: /\b(dokumen|documents?|syarat\w*|berkas|pajak|tax(es)?|bphtb|notaris|notary|ppat|biaya (balik nama|notaris|tambahan)|extra costs?|other costs?|ajb)\b/,
  certCheck:
    /\b(sertifikat\w*|certificates?)\b.{0,30}\b(cek|dicek|check\w*|verif\w*|asli|aman|periksa|diperiksa|legal|genuine)\b|\b(cek|dicek|check\w*|verif\w*|periksa|diperiksa)\b.{0,30}\b(sertifikat\w*|certificates?)\b/,
  office: /\b(kantor\w*|office|nomor kantor|email|where are you located|alamat (kalian|anda|artha))\b/,
  details: /\b(details? of this property|detail (properti|aset) ini|detail\w*|tell me more|more info\w*|info lengkap|ceritakan|jelaskan)\b/,
  cheaper: /\b(lebih murah|yang murah|cheaper|less expensive|lower price)\b/,
  similar: /\b(similar|mirip|serupa)\b/,
  all: /\b(all properties|other properties|semua (aset|properti)|properti lain|aset lain|lihat semua)\b/,
  /** Words that adjust the last search rather than start a new one. */
  refine: /^(yang|kalau|klo|kl|gimana kalau|how about|what about|and|dan|only|just|any|ada yang)\b/,
  /** "yang itu", "that one": the listing already in focus. */
  that: /^(yang itu|yang ini|itu|ini|that one|this one|that|this)\W*$/,
} as const

const ORDINAL: Record<string, number> = { pertama: 0, kesatu: 0, first: 0, '1st': 0, kedua: 1, second: 1, '2nd': 1, ketiga: 2, third: 2, '3rd': 2 }

/** "yang kedua", "nomor 2", "the second one": the index into the results shown, or null. */
export const readOrdinal = (t: string): number | null => {
  const digit = t.match(/(?:\b(?:nomor|no|number)\.?\s*|#)([1-9])\b/)
  if (digit) return Number(digit[1]) - 1
  const word = t.match(/(?:^|\b(?:yang|the)\s+)(pertama|kesatu|first|1st|kedua|second|2nd|ketiga|third|3rd)\b/)
  return word ? ORDINAL[word[1]] : null
}

/** Questions about the listing in focus, answered from its own fields. */
export type Topic = 'price' | 'location' | 'certificate' | 'size' | 'bedrooms' | 'deal' | 'status'

export const TOPIC: Record<Topic, RegExp> = {
  price: /\b(harga\w*|price\w*|cost|how much|berapaan)\b/,
  location: /\b(lokasi\w*|alamat\w*|di ?mana\w*|where|location|address|daerah\w*)\b/,
  certificate: /\b(sertifikat\w*|certificates?|shm|shgb|hgb|legalitas\w*)\b/,
  size: /\b(luas\w*|ukuran\w*|size|how big|land area|building area)\b/,
  bedrooms: /\b(kamar\w*|bedrooms?|rooms?)\b/,
  deal: /\b(dijual atau disewa\w*|jual atau sewa|for sale or|sale or rent|rent or (buy|sale)|is it for (sale|rent)|bisa disewa|bisa dibeli)\b/,
  status: /\b(masih (ada|tersedia|available|dijual)|sudah (laku|terjual)|still available|available|tersedia|sold)\b/,
}

// ---------------------------------------------------------------- quick replies

const QUICK = {
  visit: { en: 'Book a site visit', id: 'Jadwalkan survei' },
  connect: { en: 'Connect me with an agent', id: 'Hubungkan dengan agen' },
  contact: { en: 'Contact me', id: 'Hubungi saya' },
  similar: { en: 'Find similar', id: 'Cari yang mirip' },
  details: { en: 'Details of this property', id: 'Detail properti ini' },
  cheaper: { en: 'Cheaper ones', id: 'Yang lebih murah' },
  compareTop: { en: 'Compare the top two', id: 'Bandingkan dua teratas' },
  howToBuy: { en: 'How buying works', id: 'Cara membeli' },
  docs: { en: 'Documents and taxes', id: 'Dokumen dan pajak' },
  kpr: { en: 'Mortgage (KPR)?', id: 'Bisa KPR?' },
  nego: { en: 'Is the price negotiable?', id: 'Bisa nego?' },
  other: { en: 'Search other properties', id: 'Cari properti lain' },
  all: { en: 'Show all properties', id: 'Lihat semua properti' },
} as const

export type QuickKey = keyof typeof QUICK
export const quick = (lang: Lang, ...keys: QuickKey[]) => keys.map((k) => QUICK[k][lang])

/** A search suggestion such as "House in Jakarta Selatan", built from a real listing. */
export const searchHint = (l: Listing, lang: Lang) => `${typeName(l.type, lang)} ${lang === 'id' ? 'di' : 'in'} ${l.city}`

// ---------------------------------------------------------------- criteria

/** Search criteria, kept between turns so "yang lebih murah" or "kalau di Bandung?" adjusts the last search. */
export interface BuyerQuery {
  type: AssetType | null
  deal: DealType | null
  maxPrice: number | null
  /** A hard cap ("under 3 B", "cheaper"); otherwise a budget that may stretch 10%. */
  under: boolean
  minBedrooms: number | null
  places: string[]
}

/** "House in Jakarta Selatan, under Rp 3 B": the criteria a search used, so the customer sees what Jessy understood. */
export const describeCriteria = (q: BuyerQuery, lang: Lang) => {
  const id = lang === 'id'
  const head = [
    q.type ? typeName(q.type, lang) : id ? 'Properti' : 'Properties',
    q.deal && (id ? (q.deal === 'jual' ? 'dijual' : 'disewakan') : q.deal === 'jual' ? 'for sale' : 'for rent'),
    q.places.length && `${id ? 'di' : 'in'} ${q.places.map(titleCase).join(id ? ' atau ' : ' or ')}`,
  ]
  const tail = [
    q.maxPrice && `${q.under ? (id ? 'di bawah' : 'under') : 'budget'} ${money(q.maxPrice, lang)}`,
    q.minBedrooms && (id ? `min. ${q.minBedrooms} kamar` : `${q.minBedrooms}+ bedrooms`),
  ]
  return [head.filter(Boolean).join(' '), ...tail.filter(Boolean)].join(', ')
}

// ---------------------------------------------------------------- what Jessy says

interface Company {
  name: string
  address: string
  phone: string
  email: string
}

const greetWord = (t: string, lang: Lang) => {
  const part = t.match(/\b(pagi|siang|sore|malam|morning|afternoon|evening)\b/)?.[1]
  if (!part) return lang === 'id' ? 'Halo!' : 'Hi!'
  return lang === 'id' ? `Selamat ${part}!` : `Good ${part}!`
}

export const COPY = {
  start: {
    en: (agent: string, company: string) => `Hi, I'm ${agent} from ${company}. Tell me what you're looking for: type, location and budget. You can write in English or Bahasa Indonesia.`,
    id: (agent: string, company: string) => `Halo, saya ${agent} dari ${company}. Ceritakan properti yang Anda cari: jenis, lokasi, dan budget.`,
  },
  startFocus: {
    en: (agent: string, company: string, l: Listing) => `Hi, I'm ${agent} from ${company}. Questions about ${l.code}, ${l.title}? I can walk you through the details or book a site visit.`,
    id: (agent: string, company: string, l: Listing) => `Halo, saya ${agent} dari ${company}. Ada pertanyaan soal ${l.code}, ${l.title}? Saya bisa jelaskan detailnya atau atur jadwal survei.`,
  },
  greet: {
    en: (t: string, l?: Listing) => `${greetWord(t, 'en')} ${l ? `Happy to help with ${l.code}. What would you like to know?` : 'What kind of property are you looking for?'}`,
    id: (t: string, l?: Listing) => `${greetWord(t, 'id')} ${l ? `Siap bantu soal ${l.code}. Mau tahu apa dulu?` : 'Lagi cari properti seperti apa?'}`,
  },
  thanks: { en: "You're welcome. I'm here if you need anything else.", id: 'Sama-sama. Kabari saya kalau ada yang lain, ya.' },
  ok: { en: 'Great. Message me any time if you have another question.', id: 'Siap. Kabari saya kalau ada pertanyaan lain.' },
  bye: { en: 'Thanks for stopping by. Have a good day!', id: 'Terima kasih sudah mampir. Sampai jumpa!' },
  who: {
    en: (agent: string, company: string) => `I'm ${agent}, the online property assistant of ${company}: I find listings, answer questions about them and book site visits.`,
    id: (agent: string, company: string) => `Saya ${agent}, asisten properti online ${company}. Saya bantu cari properti, jawab pertanyaan soal listing, dan atur jadwal survei.`,
  },

  detail: {
    en: (l: Listing) =>
      [
        `${l.code}: ${l.title}.`,
        `${l.deal === 'jual' ? 'For sale' : 'For rent'} at ${priceOf(l, 'en')}, ${placeLine(l)}.`,
        `Land ${fmtArea(l.landArea)}${l.buildingArea ? `, building ${fmtArea(l.buildingArea)}` : ''}${l.bedrooms ? `, ${l.bedrooms} bedrooms` : ''}, ${l.certificate} certificate.`,
        l.highlights.length ? `Highlights: ${l.highlights.join(', ')}.` : '',
      ],
    id: (l: Listing) =>
      [
        `${l.code}: ${l.title}.`,
        `${l.deal === 'jual' ? 'Dijual' : 'Disewakan'} ${priceOf(l, 'id')}, di ${placeLine(l)}.`,
        `Tanah ${fmtArea(l.landArea)}${l.buildingArea ? `, bangunan ${fmtArea(l.buildingArea)}` : ''}${l.bedrooms ? `, ${l.bedrooms} kamar tidur` : ''}, sertifikat ${l.certificate}.`,
        l.highlights.length ? `Keunggulan: ${l.highlights.join(', ')}.` : '',
      ],
  },

  topic: {
    en: {
      price: (l: Listing) =>
        `${l.code} is listed at ${priceOf(l, 'en')}.${l.type === 'tanah' ? ` That is about ${money(l.price / l.landArea, 'en')} per m² of land.` : ''}`,
      location: (l: Listing) => `${l.code} is in ${placeLine(l)}.${street(l) ? ` The address is ${street(l)}.` : ''}`,
      certificate: (l: Listing) => `The certificate for ${l.code} is ${l.certificate}. Our team checks it before a listing goes live.`,
      size: (l: Listing) => `${l.code} has ${fmtArea(l.landArea)} of land${l.buildingArea ? ` and ${fmtArea(l.buildingArea)} of building` : ''}.`,
      bedrooms: (l: Listing) => (l.bedrooms ? `${l.code} has ${l.bedrooms} bedrooms.` : `${l.code} is a ${typeName(l.type, 'en').toLowerCase()} listing, so there are no bedrooms on record.`),
      deal: (l: Listing) => (l.deal === 'jual' ? `${l.code} is for sale.` : `${l.code} is for rent at ${priceOf(l, 'en')}.`),
      status: (l: Listing) =>
        l.status === 'active'
          ? `Yes, ${l.code} is still available.`
          : l.status === 'reserved'
            ? `${l.code} is reserved by another buyer right now. Our agent can tell you if it opens up again.`
            : `${l.code} is no longer available. I can look for something similar.`,
    },
    id: {
      price: (l: Listing) =>
        `Harga ${l.code} ${priceOf(l, 'id')}.${l.type === 'tanah' ? ` Kira-kira ${money(l.price / l.landArea, 'id')} per m² tanah.` : ''}`,
      location: (l: Listing) => `Lokasinya di ${placeLine(l)}.${street(l) ? ` Alamatnya ${street(l)}.` : ''}`,
      certificate: (l: Listing) => `Sertifikatnya ${l.certificate}. Tim kami sudah memeriksa sertifikat sebelum listing tayang.`,
      size: (l: Listing) => `Luas tanahnya ${fmtArea(l.landArea)}${l.buildingArea ? `, bangunannya ${fmtArea(l.buildingArea)}` : ''}.`,
      bedrooms: (l: Listing) => (l.bedrooms ? `Ada ${l.bedrooms} kamar tidur.` : `${l.code} berupa ${typeName(l.type, 'id').toLowerCase()}, jadi tidak ada data kamar tidur.`),
      deal: (l: Listing) => (l.deal === 'jual' ? `${l.code} dijual.` : `${l.code} disewakan ${priceOf(l, 'id')}.`),
      status: (l: Listing) =>
        l.status === 'active'
          ? `Masih tersedia, ${l.code} belum terjual.`
          : l.status === 'reserved'
            ? `${l.code} sedang di-booking pembeli lain. Agen kami bisa kabari kalau batal.`
            : `${l.code} sudah tidak tersedia. Saya bisa carikan yang mirip.`,
    },
  } satisfies Record<Lang, Record<Topic, (l: Listing) => string>>,

  nego: {
    en: (l?: Listing) => `${l ? `${l.code} is listed at ${priceOf(l, 'en')}. ` : ''}That is the asking price. Any room to negotiate depends on the owner, so our agent will confirm it with you. Shall I connect you?`,
    id: (l?: Listing) => `${l ? `Harga ${l.code} ${priceOf(l, 'id')}. ` : ''}Itu harga penawaran. Soal nego tergantung pemilik, jadi agen kami yang akan konfirmasi. Mau saya hubungkan?`,
  },
  kpr: {
    en: (l?: Listing) =>
      !l
        ? 'Yes, we help buyers apply for a mortgage (KPR) with banks. Our agent will check which listings qualify and confirm the terms with you.'
        : l.deal === 'sewa'
          ? `${l.code} is for rent, so a mortgage does not apply. The rent is ${priceOf(l, 'en')}.`
          : `Yes, we can help you apply for a mortgage (KPR). ${l.code} has an ${l.certificate} certificate, which the bank reviews during approval. Our agent will confirm the exact terms. Shall I connect you?`,
    id: (l?: Listing) =>
      !l
        ? 'Bisa, kami bantu pengajuan KPR ke bank. Agen kami akan cek listing mana yang bisa dan konfirmasi detailnya.'
        : l.deal === 'sewa'
          ? `${l.code} disewakan, jadi tidak pakai KPR. Sewanya ${priceOf(l, 'id')}.`
          : `Bisa, kami bantu proses KPR-nya. Sertifikat ${l.code} ${l.certificate}, nanti bank menilainya saat pengajuan. Agen kami yang konfirmasi detailnya. Mau saya hubungkan?`,
  },
  howToBuy: {
    en: 'Buying with us goes like this:\n1. Chat with me or an agent about what you need.\n2. Visit the property.\n3. Pay a booking fee to hold it.\n4. Our team checks the certificate and documents.\n5. Sign the deed (AJB) at a notary (PPAT).\nOur agent will confirm the booking fee and guide you through each step.',
    id: 'Prosesnya begini:\n1. Ngobrol dengan saya atau agen soal kebutuhan Anda.\n2. Survei lokasi.\n3. Bayar booking fee untuk mengamankan properti.\n4. Tim kami cek sertifikat dan dokumen.\n5. Tanda tangan AJB di notaris/PPAT.\nAgen kami akan konfirmasi besaran booking fee dan mendampingi di setiap langkah.',
  },
  docs: {
    en: 'You usually need your KTP, NPWP and family card (KK), plus a marriage certificate if you are married. The buyer pays BPHTB (commonly 5% of the value above the regional tax-free threshold) and the notary (PPAT) fee, and the seller pays the income tax on the sale. Our agent will confirm the exact amount for your property.',
    id: 'Biasanya perlu KTP, NPWP, dan Kartu Keluarga, ditambah buku nikah kalau sudah menikah. Pembeli membayar BPHTB (umumnya 5% dari nilai transaksi setelah dikurangi NPOPTKP daerah) dan biaya notaris/PPAT, sedangkan penjual membayar PPh. Agen kami akan konfirmasi jumlah pastinya untuk properti Anda.',
  },
  certCheck: {
    en: 'Yes. Our team checks the certificate before a listing goes live, and the notary (PPAT) checks it again at the land office (BPN) before the deed is signed.',
    id: 'Ya. Tim kami memeriksa sertifikat sebelum listing tayang, dan notaris/PPAT mengeceknya lagi ke BPN sebelum akta ditandatangani.',
  },
  office: {
    en: (c: Company, wa?: string) => `Our office is at ${c.address}. Phone ${c.phone}, email ${c.email}${wa ? `, WhatsApp ${wa}` : ''}.`,
    id: (c: Company, wa?: string) => `Kantor ${c.name} ada di ${c.address}. Telepon ${c.phone}, email ${c.email}${wa ? `, WhatsApp ${wa}` : ''}.`,
  },

  results: {
    en: (criteria: string, n: number, shown: number) => `${criteria}: ${n} found.${n > shown ? ` Here are the top ${shown}.` : ''}`,
    id: (criteria: string, n: number, shown: number) => `${criteria}: ada ${n} yang cocok.${n > shown ? ` Ini ${shown} teratas.` : ''}`,
  },
  noResults: {
    en: (criteria: string) => `${criteria}: nothing on our list yet. Leave your contact and I'll ask the team to search our partner network.`,
    id: (criteria: string) => `${criteria}: belum ada yang cocok di daftar kami. Tinggalkan kontak Anda, nanti tim kami carikan lewat jaringan kami.`,
  },
  noCheaper: {
    en: (price: string) => `Nothing cheaper than ${price} for these criteria. The results above are still the best match.`,
    id: (price: string) => `Belum ada yang lebih murah dari ${price} untuk kriteria ini. Hasil tadi masih yang paling cocok.`,
  },
  notListed: {
    en: (code: string) => `${code} is not available or no longer on the market.`,
    id: (code: string) => `${code} tidak tersedia atau sudah tidak dipasarkan.`,
  },
  outOfRange: {
    en: (n: number) => `I showed ${n} result${n === 1 ? '' : 's'} earlier. Which one do you mean?`,
    id: (n: number) => `Tadi saya menampilkan ${n} hasil. Yang mana maksudnya?`,
  },
  whichListing: {
    en: (code: string) => `Which property do you mean? Send me its code, for example ${code}, or tell me what you're looking for.`,
    id: (code: string) => `Properti yang mana? Kirim kodenya, misalnya ${code}, atau ceritakan yang Anda cari.`,
  },
  compareNeedsTwo: {
    en: (a: string, b: string) => `Send me two codes to compare, for example "compare ${a} and ${b}".`,
    id: (a: string, b: string) => `Kirim dua kode untuk dibandingkan, misalnya "bandingkan ${a} dan ${b}".`,
  },
  compare: {
    en: (ls: Listing[]) => compareRows(ls, 'en', ['Price', 'Land', 'Building', 'Location', 'Certificate'], 'Comparing'),
    id: (ls: Listing[]) => compareRows(ls, 'id', ['Harga', 'Tanah', 'Bangunan', 'Lokasi', 'Sertifikat'], 'Perbandingan'),
  },
  searchPrompt: {
    en: 'Tell me a type, location or budget and I will search.',
    id: 'Sebutkan jenis, lokasi, atau budget, nanti saya carikan.',
  },

  visitIntro: {
    en: (l?: Listing) => (l ? `Sure, I'll set that up for ${l.code}. A few quick questions first so the right agent calls you.` : 'Sure, our team will help. A few quick questions first so the right agent calls you.'),
    id: (l?: Listing) => (l ? `Siap, saya atur untuk ${l.code}. Ada beberapa pertanyaan singkat dulu supaya agen yang tepat menghubungi Anda.` : 'Siap, tim kami akan bantu. Ada beberapa pertanyaan singkat dulu supaya agen yang tepat menghubungi Anda.'),
  },
  qualify: {
    en: {
      budget: { text: 'What budget do you have in mind? For example: Rp 2.5 B.', quick: ['Under Rp 1 B', 'Rp 1 to 3 B', 'Rp 3 to 10 B', 'Above Rp 10 B', 'Skip'] },
      timeline: { text: 'When are you planning to buy or move in?', quick: ['Now', 'Within 3 months', '6 months or later', 'Skip'] },
      financing: { text: 'How will you pay?', quick: ['Cash', 'Mortgage', 'Installment', 'Skip'] },
      purpose: { text: 'What is the property for?', quick: ['To live in', 'To invest', 'For business', 'Skip'] },
    },
    id: {
      budget: { text: 'Kira-kira budget-nya berapa? Contoh: Rp 2,5 M.', quick: ['Di bawah Rp 1 M', 'Rp 1 sampai 3 M', 'Rp 3 sampai 10 M', 'Di atas Rp 10 M', 'Lewati'] },
      timeline: { text: 'Rencananya kapan mau beli atau pindah?', quick: ['Sekarang', 'Dalam 3 bulan', '6 bulan lagi atau lebih', 'Lewati'] },
      financing: { text: 'Rencana bayarnya bagaimana?', quick: ['Tunai', 'KPR', 'Cicilan', 'Lewati'] },
      purpose: { text: 'Propertinya untuk apa?', quick: ['Untuk tempat tinggal', 'Investasi', 'Untuk usaha', 'Lewati'] },
    },
  },
  badBudget: { en: 'I could not read that amount. For example: Rp 2.5 B or Rp 850 M.', id: 'Saya belum bisa membaca angkanya. Contoh: Rp 2,5 M atau Rp 850 juta.' },
  pickOne: { en: 'Pick one of the options, or tap Skip.', id: 'Pilih salah satu opsi, atau ketuk Lewati.' },
  askName: { en: 'Thanks. May I have your name?', id: 'Terima kasih. Boleh tahu nama Anda?' },
  askNameAgain: { en: 'May I have your name?', id: 'Boleh tahu nama Anda?' },
  askPhone: {
    en: (name: string) => `Thanks, ${name}. Which WhatsApp number can our team reach you on?`,
    id: (name: string) => `Terima kasih, ${name}. Nomor WhatsApp yang bisa dihubungi tim kami?`,
  },
  badPhone: { en: 'That number looks incomplete. Please try again, for example 0812 3456 7890.', id: 'Nomornya sepertinya belum lengkap. Coba lagi, contoh 0812 3456 7890.' },
  logged: {
    en: (name: string, code: string) => `Thanks, ${name}. I logged your request as ${code}.`,
    id: (name: string, code: string) => `Terima kasih, ${name}. Permintaan Anda sudah saya catat dengan nomor ${code}.`,
  },
  handoff: {
    en: (owner: string | null, code: string | null) => `${owner ? `${owner} from our sales team` : 'Our team'} will message you on WhatsApp today${code ? ` about ${code}` : ''}.`,
    id: (owner: string | null, code: string | null) => `${owner ? `${owner} dari tim sales kami` : 'Tim kami'} akan menghubungi Anda lewat WhatsApp hari ini${code ? ` soal ${code}` : ''}.`,
  },
  cancelled: { en: 'Cancelled. Anything else I can help with?', id: 'Oke, dibatalkan. Ada lagi yang bisa saya bantu?' },
  fallback: {
    en: "Sorry, I didn't catch that. I can find properties, answer questions about a listing, compare listings or book a site visit.",
    id: 'Maaf, saya belum menangkap maksudnya. Saya bisa carikan properti, jawab pertanyaan soal listing, bandingkan listing, atau atur jadwal survei.',
  },
}

function compareRows(ls: Listing[], lang: Lang, labels: string[], title: string) {
  const row = (label: string, cell: (l: Listing) => string) => `${label}: ${ls.map(cell).join(' vs ')}`
  const [price, land, building, location, certificate] = labels
  return [
    `${title} ${ls.map((l) => l.code).join(lang === 'id' ? ' dan ' : ' and ')}:`,
    row(price, (l) => priceOf(l, lang)),
    row(land, (l) => fmtArea(l.landArea)),
    row(building, (l) => (l.buildingArea ? fmtArea(l.buildingArea) : '-')),
    row(location, placeLine),
    row(certificate, (l) => l.certificate),
  ].join('\n')
}
