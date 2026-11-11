/**
 * Words for the console Jessy: how she reads a member's message (language, period, intent) and every sentence she
 * says back, in English and Indonesian. The engine in assistant.ts picks the facts from the store; this file words them.
 */
import type { Permission, TaskKind } from '@artha/types'
import { TASK_KIND_LABEL } from '@artha/types'
import { INTENT as BUYER_INTENT, money } from './buyer-copy'
import type { Lang } from './buyer-copy'
import { fmtTime } from './format'
import { speaksIndonesian } from './guardrails'

export type { Lang }
export { money }

/** A pair of strings or sentence builders, one per language. */
type Pair<T> = Record<Lang, T>

// ---------------------------------------------------------------- language

/** Words that tip a short message one way. Report nouns such as "stok" stay out: members mix them into English. */
const ID_HINT =
  /\b(halo|hai|pagi|siang|sore|malam|selamat|makasih|terima|kasih|trims|siapa|berapa|mana|kalau|kalo|klo|gimana|bagaimana|dibanding\w*|banding\w*|rinci\w*|detailnya|terbaik|terbesar|paling|lama|telat|lalu|kemarin|sebelumnya|bulan|kuartal|ini|hari|ada|yang|saja|aja|dong|ya|iya|oke|lanjut\w*|jalankan|batal\w*|jangan|jadi|gak|nggak|tidak|kabar|kamu|cuti|menipis|baru|aktif|laba|omzet|piutang|jatuh|tempo|apa|tolong|sampai|jumpa|setujui|tolak|ajukan|absenkan|sisa|siap|sip|mantap)\b/g
const EN_HINT =
  /\b(hi|hello|hey|good|morning|afternoon|evening|the|is|are|was|what|how|who|which|show|me|my|i|you|and|last|this|month|quarter|vs|versus|compared?|breakdown|details|top|best|largest|biggest|longest|oldest|thanks|thank|bye|please|much|many|today|waits|for|of|about|low|new|active|live|overdue|profit|revenue|sales|report|leads|finance|yes|no|sure|go|ahead|never|mind)\b/g

const hits = (t: string, re: RegExp) => t.match(re)?.length ?? 0

/** The language of this message, or the conversation's language when the message could be either ("rinci", a code). */
export const detectLang = (text: string, prev: Lang): Lang => {
  if (speaksIndonesian(text)) return 'id'
  const t = text.toLowerCase()
  const id = hits(t, ID_HINT)
  const en = hits(t, EN_HINT)
  return id > en ? 'id' : en > id ? 'en' : prev
}

// ---------------------------------------------------------------- numbers and lists

/** Money with a sign: "-Rp 120 jt" rather than a broken short form. */
export const amount = (n: number, lang: Lang) => (n < 0 ? `-${money(Math.round(-n), lang)}` : money(Math.round(n), lang))

export const percent = (n: number, lang: Lang) => `${n.toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', { maximumFractionDigits: 1 })}%`

/** "3 deals" in English; Indonesian nouns do not change for the plural. */
export const count = (n: number, lang: Lang, one: string, many = `${one}s`, id = one) => `${n} ${lang === 'id' ? id : n === 1 ? one : many}`

/** "A, B and C" or "A, B dan C". */
export const listJoin = (names: string[], lang: Lang) => {
  const and = lang === 'id' ? 'dan' : 'and'
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

/** The first `max` names, then "and 2 more". */
export const shortList = (names: string[], lang: Lang, max = 3) =>
  names.length <= max ? listJoin(names, lang) : `${names.slice(0, max).join(', ')} ${lang === 'id' ? `dan ${names.length - max} lainnya` : `and ${names.length - max} more`}`

export const dateOf = (iso: string, lang: Lang) => new Date(iso).toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

// ---------------------------------------------------------------- periods

/** A calendar month or quarter, counted back from the current one: offset 0 is this month, -1 last month. */
export interface Period {
  unit: 'month' | 'quarter'
  offset: number
}

export const THIS_MONTH: Period = { unit: 'month', offset: 0 }

const PERIOD_WORDS: [RegExp, Period][] = [
  [/\b(bulan (lalu|kemarin|sebelumnya)|last month|previous month|month before)\b/, { unit: 'month', offset: -1 }],
  [/\b((kuartal|triwulan) (lalu|kemarin|sebelumnya)|last quarter|previous quarter)\b/, { unit: 'quarter', offset: -1 }],
  [/\b(kuartal|triwulan|quarter|q[1-4])\b/, { unit: 'quarter', offset: 0 }],
  [/\b(bulan ini|this month)\b/, THIS_MONTH],
]

/** The period a message names, or null. */
export const readPeriod = (t: string): Period | null => PERIOD_WORDS.find(([re]) => re.test(t))?.[1] ?? null

/** The message with its period words taken out, for checking what else it asks. */
export const withoutPeriod = (t: string) => PERIOD_WORDS.reduce((acc, [re]) => acc.replace(new RegExp(re.source, 'g'), ' '), t)

export const samePeriod = (a: Period, b: Period) => a.unit === b.unit && a.offset === b.offset
export const previousPeriod = (p: Period): Period => ({ ...p, offset: p.offset - 1 })

const PERIOD_NAME: Pair<Record<Period['unit'], [string, string]>> = {
  en: { month: ['this month', 'last month'], quarter: ['this quarter', 'last quarter'] },
  id: { month: ['bulan ini', 'bulan lalu'], quarter: ['kuartal ini', 'kuartal lalu'] },
}

/** "bulan ini", "last month", or the month by name further back: "Agustus 2026". */
export const periodLabel = (p: Period, from: Date, lang: Lang) => {
  if (p.offset >= -1) return PERIOD_NAME[lang][p.unit][-p.offset]
  if (p.unit === 'quarter') return `Q${Math.floor(from.getMonth() / 3) + 1} ${from.getFullYear()}`
  return from.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-GB', { month: 'long', year: 'numeric' })
}

/** The label inside a sentence: "last month", but "in August 2026" for a period named by its date. */
export const periodWhen = (p: Period, from: Date, lang: Lang) => `${p.offset >= -1 ? '' : lang === 'id' ? 'pada ' : 'in '}${periodLabel(p, from, lang)}`

// ---------------------------------------------------------------- topics

/** The reports Jessy keeps in memory between turns. */
export type Topic = 'sales' | 'finance' | 'inventory' | 'purchasing' | 'people' | 'listings' | 'leads'

/** Words that name a topic, in the order a message is matched. */
export const TOPIC_WORDS: [Topic, RegExp][] = [
  ['sales', /\b(sales|penjualan|deals?|closing|omzet)\b/],
  ['finance', /\b(finance|keuangan|laba|rugi|profit|income|revenue|pendapatan|expenses?|biaya)\b/],
  ['inventory', /\b(stock|stok|inventory|persediaan|gudang)\b/],
  ['purchasing', /\b(purchas\w*|pembelian|po|orders?|pengadaan|spend)\b/],
  ['people', /\b(people|sdm|hr|karyawan|employees?|pegawai|absensi|kehadiran)\b/],
  ['listings', /\b(listings?|properti|property|properties|aset)\b/],
  ['leads', /\b(leads?|inquir\w*|prospek|pertanyaan|calon pembeli)\b/],
]

export const TOPIC_NAME: Pair<Record<Topic, string>> = {
  en: { sales: 'sales', finance: 'finance', inventory: 'stock', purchasing: 'purchasing', people: 'people', listings: 'listing', leads: 'lead' },
  id: { sales: 'penjualan', finance: 'keuangan', inventory: 'stok', purchasing: 'pembelian', people: 'SDM', listings: 'listing', leads: 'leads' },
}

// ---------------------------------------------------------------- intents

/** What a message asks for. Patterns run on the lowercased text. */
export const INTENT = {
  greeting: BUYER_INTENT.greeting,
  thanks: BUYER_INTENT.thanks,
  ok: BUYER_INTENT.ok,
  bye: BUYER_INTENT.bye,
  who: BUYER_INTENT.who,
  filler: BUYER_INTENT.filler,
  howAreYou: /\b(apa kabar\w*|gimana kabar\w*|how are you|how's it going|how are things)\b/,
  help: /^(help|bantuan|menu|what can you do|apa yang bisa)/,
  confirm: /^(confirm|konfirmasi|yes|yep|yup|sure|ya|iya|ok|oke|okay|lanjut\w*|jalankan|setuju|boleh|gas|do it|go ahead|proceed)\b/,
  /** Checked before confirm, anywhere in the message, so "ok, batal" never runs a change. */
  cancel: /\b(cancel|batal\w*|jangan|(gak|ga|nggak|tidak|enggak) jadi|never ?mind|stop)\b|^(no|nope|tidak|nggak|gak|enggak|ngga)\b/,
  report: /\b(report|reports|laporan|ringkasan|summary|rekap|recap|overview|dashboard)\b/,
  drill: /\b(rinci\w*|detail\w*|breakdown|break it down|yang mana( saja| aja)?|which ones?|list them|daftar\w*)\b/,
  compare: /\b(dibanding\w*|bandingkan|banding|vs\.?|versus|compared?|comparison)\b/,
  rankAgent: /\b(agen|agents?|sales ?(person|people))\b.*\b(terbaik|teratas|top|best|paling (banyak|besar|laris))\b|\b(top|best)\b.*\bagents?\b/,
  rankLargest: /\b(terbesar|paling besar|tertinggi|largest|biggest|highest)\b/,
  rankLongest: /\b(paling lama|terlama|longest|oldest|most overdue)\b/,
  /** A message that turns the last answer to another topic: "kalau stok?", "and finance?". */
  refine: /^(kalau|kalo|klo|gimana dengan|bagaimana dengan|terus|lalu|dan|and|what about|how about)\b/,
  /** Words left after the period and topic that do not ask anything new. */
  followFiller: /\b(kalau|kalo|klo|gimana|bagaimana|dengan|terus|lalu|dan|and|what|how|about|for|untuk|yang|the|ya|dong|sih|nya|then|itu|ini|this|laporan|report|jessy)\b/g,
} as const

/** Short questions that name a metric without asking for a report. Each answers in one sentence. */
export type Metric = 'revenue' | 'netIncome' | 'overdue' | 'lowStock' | 'activeListings' | 'newLeads'

export const METRIC_WORDS: [Metric, RegExp][] = [
  ['revenue', /\b(omzet|omset|turnover|nilai penjualan|sales value|won value|total sales)\b/],
  ['netIncome', /\b(laba|rugi|untung|profit|net income)\b/],
  ['overdue', /\b(piutang|receivables?|jatuh tempo|overdue)\b/],
  ['lowStock', /\b(stok|stock)\b.*\b(menipis|habis|rendah|low|minimum|kurang)\b|\b(menipis|low on stock|low stock|running low)\b/],
  ['activeListings', /\b(listings?|properti)\b.*\b(aktif|active|live|tayang)\b|\b(active|live) listings?\b/],
  ['newLeads', /\b(leads?|inquir\w*|prospek)\b.*\b(baru|new|masuk)\b|\bnew (leads?|inquir\w*)\b/],
]

export const METRIC_TOPIC: Record<Metric, Topic> = { revenue: 'sales', netIncome: 'finance', overdue: 'finance', lowStock: 'inventory', activeListings: 'listings', newLeads: 'leads' }

// ---------------------------------------------------------------- small talk

const PART_OF_DAY: Pair<[number, string][]> = {
  id: [[11, 'pagi'], [15, 'siang'], [18, 'sore'], [24, 'malam']],
  en: [[12, 'morning'], [18, 'afternoon'], [24, 'evening']],
}

/** Morning, afternoon or evening at the office in Jakarta (UTC+7), whatever the device clock says. */
const partOfDay = (at: string, lang: Lang) => {
  const hour = (new Date(at).getUTCHours() + 7) % 24
  return PART_OF_DAY[lang].find(([until]) => hour < until)![1]
}

// ---------------------------------------------------------------- sentences

export const COPY = {
  start: {
    en: (name: string, agent: string) => `Hi ${name}, I am ${agent}. Ask me for a report or about any figure on your dashboard, and I answer from live data. I can also prepare a change for you to confirm. You can write in English or Bahasa Indonesia.`,
    id: (name: string, agent: string) => `Halo ${name}, saya ${agent}. Tanyakan laporan atau angka apa pun di dashboard Anda, saya jawab dari data live. Saya juga bisa menyiapkan perubahan untuk Anda konfirmasi.`,
  },
  greet: {
    en: (at: string, name: string) => `Good ${partOfDay(at, 'en')}, ${name}! Which report would you like to see?`,
    id: (at: string, name: string) => `Selamat ${partOfDay(at, 'id')}, ${name}! Mau lihat laporan apa hari ini?`,
  },
  thanks: { en: "You're welcome. Ask me any time.", id: 'Sama-sama. Kabari saya kalau butuh angka lain.' },
  ok: { en: "Great. I'm here if you need another figure.", id: 'Siap. Saya di sini kalau butuh angka lain.' },
  bye: { en: (name: string) => `Bye, ${name}. Talk soon.`, id: (name: string) => `Sampai jumpa, ${name}.` },
  who: {
    en: (agent: string, company: string) => `I'm ${agent}, the reporting assistant of ${company}. I answer from the live data your role can see.`,
    id: (agent: string, company: string) => `Saya ${agent}, asisten laporan ${company}. Saya menjawab dari data live sesuai akses peran Anda.`,
  },
  howAreYou: { en: "I'm well, thanks for asking. Shall I pull up today's dashboard summary?", id: 'Kabar baik, terima kasih. Mau saya tampilkan ringkasan dashboard hari ini?' },
  help: {
    en: { head: 'Here is what I can do for your role. Reports first:', foot: 'I always show a change first and run it only after you tap Confirm.' },
    id: { head: 'Ini yang bisa saya bantu untuk peran Anda. Laporan dulu:', foot: 'Setiap perubahan saya tampilkan dulu dan baru saya jalankan setelah Anda konfirmasi.' },
  },
  noChange: { en: 'There is no change waiting. Ask me something, or type "help".', id: 'Tidak ada perubahan yang menunggu. Silakan tanya, atau ketik "help".' },
  fallback: { en: 'Sorry, I did not catch that. Try one of these:', id: 'Maaf, saya belum menangkap maksudnya. Coba salah satu ini:' },
  askReport: { en: 'Which report should I use? Pick one:', id: 'Laporan yang mana? Pilih salah satu:' },
  snapshot: {
    en: (topic: string) => `The ${topic} report shows today's position, so there is no other period to run or compare.`,
    id: (topic: string) => `Laporan ${topic} menunjukkan posisi hari ini, jadi tidak ada periode lain untuk dijalankan atau dibandingkan.`,
  },
  noRank: { en: 'There is nothing in the last report to rank that way.', id: 'Tidak ada data di laporan terakhir yang bisa diurutkan seperti itu.' },

  // refusals
  refuseRead: {
    en: (what: string, perm: string) => `Sorry, your role cannot see ${what}. It needs the "${perm}" permission. An admin can add it to your role.`,
    id: (what: string, perm: string) => `Maaf, peran Anda tidak bisa melihat ${what}. Perlu izin "${perm}". Admin bisa menambahkannya ke peran Anda.`,
  },
  refuseWrite: {
    en: (perm: string) => `Sorry, your role cannot do that. It needs the "${perm}" permission.`,
    id: (perm: string) => `Maaf, peran Anda tidak bisa melakukan itu. Perlu izin "${perm}".`,
  },

  // reports
  reportTitle: {
    en: (topic: Topic, label: string | null) => `${{ sales: 'Sales report', finance: 'Finance report', inventory: 'Stock report', purchasing: 'Purchasing report', people: 'People report', listings: 'Listing report', leads: 'Lead report' }[topic]}${label ? `, ${label}` : ''}`,
    id: (topic: Topic, label: string | null) => `${{ sales: 'Laporan penjualan', finance: 'Laporan keuangan', inventory: 'Laporan stok', purchasing: 'Laporan pembelian', people: 'Laporan SDM', listings: 'Laporan listing', leads: 'Laporan leads' }[topic]}${label ? `, ${label}` : ''}`,
  },
  /** The quick reply that asks for a full report. */
  reportAsk: {
    en: (topic: Topic, label: string | null) => `${COPY_TITLE.en[topic]} report${label ? ` ${label}` : ''}`,
    id: (topic: Topic, label: string | null) => `Laporan ${TOPIC_NAME.id[topic]}${label ? ` ${label}` : ''}`,
  },
  reportLink: {
    en: { sales: 'Open sales reports', finance: 'Open finance reports', inventory: 'Open purchasing reports', purchasing: 'Open purchasing reports', people: 'Open people reports', listings: 'Open listings', leads: 'Open inquiries' },
    id: { sales: 'Buka laporan penjualan', finance: 'Buka laporan keuangan', inventory: 'Buka laporan pembelian', purchasing: 'Buka laporan pembelian', people: 'Buka laporan SDM', listings: 'Buka listing', leads: 'Buka inquiry' },
  } satisfies Pair<Record<Topic, string>>,
  sales: {
    en: {
      won: (n: number, v: string) => `Won: ${count(n, 'en', 'deal')}, ${v}`,
      open: (n: number, v: string) => `Open pipeline: ${count(n, 'en', 'deal')}, ${v}`,
      top: (names: string[]) => `Top agents: ${names.join(', ')}`,
      noTop: 'No agent closed a deal in this period.',
    },
    id: {
      won: (n: number, v: string) => `Closing: ${n} deal, ${v}`,
      open: (n: number, v: string) => `Pipeline terbuka: ${n} deal, ${v}`,
      top: (names: string[]) => `Agen teratas: ${names.join(', ')}`,
      noTop: 'Belum ada agen yang closing di periode ini.',
    },
  },
  finance: {
    en: { revenue: 'Revenue', expense: 'Expenses', net: 'Net income', pastDue: 'Receivables past due' },
    id: { revenue: 'Pendapatan', expense: 'Biaya', net: 'Laba bersih', pastDue: 'Piutang lewat jatuh tempo' },
  },
  inventory: {
    en: { value: (v: string) => `Stock value at average cost: ${v}`, items: (n: number) => `Items in stock: ${n}`, low: (names: string) => `Below minimum: ${names}`, noLow: 'No item is below its minimum.' },
    id: { value: (v: string) => `Nilai stok (harga rata-rata): ${v}`, items: (n: number) => `Barang tersedia: ${n}`, low: (names: string) => `Di bawah minimum: ${names}`, noLow: 'Tidak ada barang di bawah minimum.' },
  },
  purchasing: {
    en: { spend: (v: string, n: number) => `Spend on orders sent: ${v} across ${count(n, 'en', 'order')}`, open: (n: number, late: number) => `Open orders: ${n}, of which ${late} late`, waiting: (n: number) => `Requests waiting for approval: ${n}` },
    id: { spend: (v: string, n: number) => `Belanja dari PO terkirim: ${v} dari ${n} PO`, open: (n: number, late: number) => `PO terbuka: ${n}, ${late} di antaranya telat`, waiting: (n: number) => `Permintaan menunggu persetujuan: ${n}` },
  },
  people: {
    en: {
      title: 'People report, today',
      headcount: (n: number, d: number) => `Headcount: ${n} across ${count(d, 'en', 'department')}`,
      today: (c: Record<'present' | 'late' | 'leave' | 'absent', number>) => `Today: ${c.present} on time, ${c.late} late, ${c.leave} on leave, ${c.absent} absent`,
      open: (n: number) => `Open requests: ${n} leave, overtime or loan`,
    },
    id: {
      title: 'Laporan SDM, hari ini',
      headcount: (n: number, d: number) => `Jumlah karyawan: ${n} di ${d} departemen`,
      today: (c: Record<'present' | 'late' | 'leave' | 'absent', number>) => `Hari ini: ${c.present} tepat waktu, ${c.late} terlambat, ${c.leave} cuti, ${c.absent} tidak hadir`,
      open: (n: number) => `Pengajuan terbuka: ${n} cuti, lembur, atau pinjaman`,
    },
  },
  listings: {
    en: { live: (a: number, r: number, v: number) => `Live: ${a}, reserved: ${r}, in review: ${v}`, closed: (sold: number, off: number) => `Sold: ${sold}, delisted: ${off}`, value: (v: string) => `Value of live listings: ${v}` },
    id: { live: (a: number, r: number, v: number) => `Aktif: ${a}, reserved: ${r}, direview: ${v}`, closed: (sold: number, off: number) => `Terjual: ${sold}, diturunkan: ${off}`, value: (v: string) => `Nilai listing aktif: ${v}` },
  },
  leads: {
    en: { fresh: (n: number) => `New inquiries: ${n}`, stages: (parts: string) => `All inquiries by stage: ${parts}` },
    id: { fresh: (n: number) => `Leads baru: ${n}`, stages: (parts: string) => `Semua inquiry per tahap: ${parts}` },
  },
  dashboard: {
    en: { head: 'Dashboard summary:', waiting: (n: number) => `Waiting for your approval: ${n}`, foot: 'Ask for any of these as a full report, for example "sales report last month".', link: 'Open the dashboard' },
    id: { head: 'Ringkasan dashboard:', waiting: (n: number) => `Menunggu persetujuan Anda: ${n}`, foot: 'Minta salah satunya sebagai laporan lengkap, misalnya "laporan penjualan bulan lalu".', link: 'Buka dashboard' },
  },

  // one-sentence answers to short questions
  metric: {
    en: {
      revenue: (label: string, v: string, n: number) => `Sales won ${label}: ${v} from ${count(n, 'en', 'deal')}.`,
      noRevenue: (label: string) => `No deals were won ${label}.`,
      netIncome: (label: string, net: string, rev: string, exp: string) => `Net income ${label} is ${net}, from ${rev} revenue and ${exp} expenses.`,
      overdue: (n: number, total: string) => `${count(n, 'en', 'invoice is', 'invoices are')} overdue, ${total} in all.`,
      noOverdue: 'No invoice is overdue.',
      lowStock: (n: number, names: string) => `${count(n, 'en', 'item is', 'items are')} below minimum stock: ${names}.`,
      noLowStock: 'Every active item is at or above its minimum stock.',
      activeListings: (n: number, v: string) => `There ${n === 1 ? 'is' : 'are'} ${count(n, 'en', 'live listing')}, worth ${v} in all.`,
      newLeads: (label: string, n: number) => `${count(n, 'en', 'new inquiry', 'new inquiries')} came in ${label}.`,
    },
    id: {
      revenue: (label: string, v: string, n: number) => `Omzet ${label} ${v} dari ${n} deal.`,
      noRevenue: (label: string) => `Belum ada deal closing ${label}.`,
      netIncome: (label: string, net: string, rev: string, exp: string) => `Laba bersih ${label} ${net}, dari pendapatan ${rev} dan biaya ${exp}.`,
      overdue: (n: number, total: string) => `Piutang lewat jatuh tempo ${total} dari ${n} invoice.`,
      noOverdue: 'Tidak ada invoice yang lewat jatuh tempo.',
      lowStock: (n: number, names: string) => `${n} barang di bawah stok minimum: ${names}.`,
      noLowStock: 'Semua barang aktif ada di atas stok minimum.',
      activeListings: (n: number, v: string) => `Ada ${n} listing aktif, total nilainya ${v}.`,
      newLeads: (label: string, n: number) => `Ada ${n} leads baru ${label}.`,
    },
  },

  // the rows behind a report
  drill: {
    en: {
      sales: (n: number, label: string, v: string) => `${count(n, 'en', 'deal')} won ${label}, worth ${v}:`,
      finance: (n: number, total: string) => `${count(n, 'en', 'invoice is', 'invoices are')} overdue, ${total} in all:`,
      inventory: (n: number) => `${count(n, 'en', 'item is', 'items are')} below minimum stock:`,
      purchasing: (orders: number, late: number, prs: number) => `${count(orders, 'en', 'open order')}, ${late} late, and ${count(prs, 'en', 'request')} waiting for approval:`,
      people: (n: number) => `${count(n, 'en', 'request is', 'requests are')} still open:`,
      listings: (n: number) => `${count(n, 'en', 'live listing')}:`,
      leads: (n: number, label: string) => `${count(n, 'en', 'new inquiry', 'new inquiries')} ${label}:`,
      none: 'There are no rows behind that report.',
      more: (n: number) => `and ${n} more`,
    },
    id: {
      sales: (n: number, label: string, v: string) => `${n} deal closing ${label}, senilai ${v}:`,
      finance: (n: number, total: string) => `${n} invoice lewat jatuh tempo, total ${total}:`,
      inventory: (n: number) => `${n} barang di bawah stok minimum:`,
      purchasing: (orders: number, late: number, prs: number) => `${orders} PO terbuka, ${late} telat, dan ${prs} permintaan menunggu persetujuan:`,
      people: (n: number) => `${n} pengajuan masih terbuka:`,
      listings: (n: number) => `${n} listing aktif:`,
      leads: (n: number, label: string) => `${n} leads baru ${label}:`,
      none: 'Tidak ada rincian di balik laporan itu.',
      more: (n: number) => `dan ${n} lainnya`,
    },
  },
  row: {
    en: {
      deal: (code: string, title: string, v: string, agent: string) => `${code} ${title}, ${v}, by ${agent}`,
      invoice: (code: string, customer: string, v: string, days: number) => `${code} · ${customer}, ${v}, ${count(days, 'en', 'day')} late`,
      lowItem: (name: string, qty: string, short: string) => `${name}: ${qty}, ${short} short`,
      po: (code: string, vendor: string, v: string, late: boolean, due: string) => `${code} · ${vendor}, ${v}, ${late ? `late since ${due}` : `due ${due}`}`,
      pr: (code: string, who: string, v: string) => `${code} · ${who}, about ${v}`,
      leave: (days: number, from: string) => `${count(days, 'en', 'day')} of leave from ${from}`,
      overtime: (hours: number) => `${hours} h overtime`,
      loan: (v: string) => `loan of ${v}`,
      listing: (code: string, title: string, v: string) => `${code} ${title}, ${v}`,
      inquiry: (code: string, name: string, stage: string) => `${code} · ${name}, ${stage}`,
    },
    id: {
      deal: (code: string, title: string, v: string, agent: string) => `${code} ${title}, ${v}, oleh ${agent}`,
      invoice: (code: string, customer: string, v: string, days: number) => `${code} · ${customer}, ${v}, telat ${days} hari`,
      lowItem: (name: string, qty: string, short: string) => `${name}: ${qty}, kurang ${short}`,
      po: (code: string, vendor: string, v: string, late: boolean, due: string) => `${code} · ${vendor}, ${v}, ${late ? `telat sejak ${due}` : `jatuh tempo ${due}`}`,
      pr: (code: string, who: string, v: string) => `${code} · ${who}, sekitar ${v}`,
      leave: (days: number, from: string) => `cuti ${days} hari mulai ${from}`,
      overtime: (hours: number) => `lembur ${hours} jam`,
      loan: (v: string) => `pinjaman ${v}`,
      listing: (code: string, title: string, v: string) => `${code} ${title}, ${v}`,
      inquiry: (code: string, name: string, stage: string) => `${code} · ${name}, ${stage}`,
    },
  },
  inquiryStage: {
    en: { new: 'new', contacted: 'contacted', survey: 'site visit', negotiation: 'negotiation', won: 'won', lost: 'lost' },
    id: { new: 'baru', contacted: 'sudah dihubungi', survey: 'survei', negotiation: 'negosiasi', won: 'closing', lost: 'batal' },
  },

  // ranking
  rank: {
    en: {
      agent: (label: string, name: string, v: string, n: number) => `${name} is the top agent ${label}, with ${v} from ${count(n, 'en', 'deal')}.`,
      noAgent: (label: string) => `No agent closed a deal ${label}.`,
      largest: (row: string, v: string) => `The largest is ${row}, at ${v}.`,
      longest: (row: string, days: number) => `The longest overdue is ${row}, ${count(days, 'en', 'day')} late.`,
    },
    id: {
      agent: (label: string, name: string, v: string, n: number) => `Agen terbaik ${label} adalah ${name}, dengan ${v} dari ${n} deal.`,
      noAgent: (label: string) => `Belum ada agen yang closing ${label}.`,
      largest: (row: string, v: string) => `Yang terbesar adalah ${row}, senilai ${v}.`,
      longest: (row: string, days: number) => `Yang paling lama telat adalah ${row}, sudah ${days} hari.`,
    },
  },

  // comparison
  compare: {
    en: {
      line: (what: string, a: string, labelA: string, b: string, labelB: string) => `${what} ${labelA}: ${a}, against ${b} ${labelB}.`,
      up: (diff: string, pct: string | null) => `That is up ${diff}${pct ? ` (${pct})` : ' from nothing'}.`,
      down: (diff: string, pct: string | null) => `That is down ${diff}${pct ? ` (${pct})` : ''}.`,
      same: 'That is the same as before.',
    },
    id: {
      line: (what: string, a: string, labelA: string, b: string, labelB: string) => `${what} ${labelA} ${a}, dibanding ${b} ${labelB}.`,
      up: (diff: string, pct: string | null) => `Naik ${diff}${pct ? ` (${pct})` : ' dari nol'}.`,
      down: (diff: string, pct: string | null) => `Turun ${diff}${pct ? ` (${pct})` : ''}.`,
      same: 'Angkanya sama.',
    },
  },
  measure: {
    en: { wonValue: 'Sales won', revenue: 'Revenue', netIncome: 'Net income', spend: 'Purchasing spend', newLeads: 'New inquiries' },
    id: { wonValue: 'Omzet', revenue: 'Pendapatan', netIncome: 'Laba bersih', spend: 'Belanja pembelian', newLeads: 'Leads baru' },
  },

  // other reads
  attendance: {
    en: {
      head: (date: string, n: number, scope: string) => `Attendance on ${date} for ${count(n, 'en', 'person', 'people')}${scope}:`,
      scope: (dept: string) => ` in ${dept}`,
      state: { present: 'In on time', late: 'Late', leave: 'On leave', absent: 'Absent', upcoming: 'Not in yet' },
      only: (word: string, scope: string, names: string) => `${word} today${scope}: ${names}.`,
      nobody: (word: string, scope: string) => `Nobody is ${word.toLowerCase()}${scope} today.`,
      link: 'Open attendance',
    },
    id: {
      head: (date: string, n: number, scope: string) => `Kehadiran ${date} untuk ${n} orang${scope}:`,
      scope: (dept: string) => ` di ${dept}`,
      state: { present: 'Hadir tepat waktu', late: 'Terlambat', leave: 'Cuti', absent: 'Tidak hadir', upcoming: 'Belum datang' },
      only: (word: string, scope: string, names: string) => `Yang ${word.toLowerCase()} hari ini${scope}: ${names}.`,
      nobody: (word: string, scope: string) => `Hari ini tidak ada yang ${word.toLowerCase()}${scope}.`,
      link: 'Buka kehadiran',
    },
  },
  stockItem: {
    en: { head: (item: string, qty: string) => `${item}: ${qty} on hand.`, below: (min: string) => ` That is below the minimum of ${min}.`, link: 'Open stock' },
    id: { head: (item: string, qty: string) => `Stok ${item}: ${qty}.`, below: (min: string) => ` Itu di bawah minimum ${min}.`, link: 'Buka stok' },
  },
  pipeline: {
    en: { head: (n: number, v: string) => `The open pipeline holds ${count(n, 'en', 'deal')} worth ${v}.`, stage: (name: string, n: number, v: string) => `${name}: ${count(n, 'en', 'deal')}, ${v}`, link: 'Open the pipeline', ask: 'Pipeline by stage' },
    id: { head: (n: number, v: string) => `Pipeline terbuka berisi ${n} deal senilai ${v}.`, stage: (name: string, n: number, v: string) => `${name}: ${n} deal, ${v}`, link: 'Buka pipeline', ask: 'Pipeline per tahap' },
  },
  candidate: {
    en: {
      which: 'Which candidate? Give me a name, for example "status of Clara Wijaya".',
      atStage: (n: number, stage: string) => `${count(n, 'en', 'candidate is', 'candidates are')} at ${stage}:`,
      status: (name: string, stage: string, opening: string | null) => `${name} is at ${stage}${opening ? ` for ${opening}` : ', in the talent pool'}.`,
      tests: (n: number, best: number) => `Tests taken: ${n}, best score ${best}.`,
      next: (when: string, video: boolean) => `Next interview: ${when}, ${video ? 'video call' : 'on site'}.`,
      offer: (v: string, status: string) => `Offer: ${v} a month, ${status}.`,
      reason: (r: string) => `Reason: ${r}`,
    },
    id: {
      which: 'Kandidat yang mana? Sebutkan namanya, misalnya "status Clara Wijaya".',
      atStage: (n: number, stage: string) => `${n} kandidat di tahap ${stage}:`,
      status: (name: string, stage: string, opening: string | null) => `${name} ada di tahap ${stage}${opening ? ` untuk ${opening}` : ', di talent pool'}.`,
      tests: (n: number, best: number) => `Tes diikuti: ${n}, skor terbaik ${best}.`,
      next: (when: string, video: boolean) => `Interview berikutnya: ${when}, ${video ? 'video call' : 'tatap muka'}.`,
      offer: (v: string, status: string) => `Penawaran: ${v} per bulan, ${status}.`,
      reason: (r: string) => `Alasan: ${r}`,
    },
  },
  approvals: {
    en: {
      none: 'Nothing waits for your approval right now.',
      head: (n: number) => `${count(n, 'en', 'request waits', 'requests wait')} for you:`,
      foot: 'Say "approve" or "reject" with a code to decide one.',
      which: 'Which one? These wait for you:',
      all: 'All approvals',
      verb: { approved: 'Approve', rejected: 'Reject' },
      items: (n: number) => count(n, 'en', 'item'),
      about: (v: string) => `about ${v}`,
      discount: (pct: number) => `${pct}% discount`,
    },
    id: {
      none: 'Saat ini tidak ada yang menunggu persetujuan Anda.',
      head: (n: number) => `${n} pengajuan menunggu Anda:`,
      foot: 'Ketik "setujui" atau "tolak" dengan kodenya untuk memutuskan.',
      which: 'Yang mana? Ini yang menunggu Anda:',
      all: 'Semua approval',
      verb: { approved: 'Setujui', rejected: 'Tolak' },
      items: (n: number) => `${n} barang`,
      about: (v: string) => `sekitar ${v}`,
      discount: (pct: number) => `diskon ${pct}%`,
    },
  },
  decideStep: { en: (code: string, who: string, what: string, step: string) => `${code} · ${who}, ${what}, ${step} step`, id: (code: string, who: string, what: string, step: string) => `${code} · ${who}, ${what}, tahap ${step}` },
  exclusives: {
    en: { none: 'No exclusive right ends in the next 30 days.', head: (n: number) => `${count(n, 'en', 'exclusive right ends', 'exclusive rights end')} within 30 days:`, row: (code: string, title: string, ends: string, days: number) => `${code} ${title}, ends ${ends}, ${count(days, 'en', 'day')} left`, link: 'Open exclusive rights', all: 'All exclusive rights' },
    id: { none: 'Tidak ada hak eksklusif yang berakhir dalam 30 hari ke depan.', head: (n: number) => `${n} hak eksklusif berakhir dalam 30 hari:`, row: (code: string, title: string, ends: string, days: number) => `${code} ${title}, berakhir ${ends}, sisa ${days} hari`, link: 'Buka hak eksklusif', all: 'Semua hak eksklusif' },
  },
  leave: {
    en: {
      noEmployee: 'You have no employee record, so there is no leave balance to show.',
      balance: (left: number, year: number, quota: number, used: number, pending: number) =>
        `You have ${count(left, 'en', 'day')} of annual leave left in ${year}. Your quota is ${quota}, you have used ${used}${pending ? `, and ${count(pending, 'en', 'day')} wait${pending === 1 ? 's' : ''} for approval` : ''}.`,
      link: 'My requests',
    },
    id: {
      noEmployee: 'Anda belum punya data karyawan, jadi tidak ada sisa cuti untuk ditampilkan.',
      balance: (left: number, year: number, quota: number, used: number, pending: number) =>
        `Sisa cuti tahunan Anda di ${year}: ${left} hari. Kuota ${quota}, sudah terpakai ${used}${pending ? `, dan ${pending} hari menunggu persetujuan` : ''}.`,
      link: 'Pengajuan saya',
    },
  },

  // changes
  propose: {
    en: { note: 'Nothing happens until you confirm.', confirm: 'Confirm', cancel: 'Cancel' },
    id: { note: 'Belum ada yang berubah sampai Anda konfirmasi.', confirm: 'Ya, jalankan', cancel: 'Batal' },
  },
  cancelled: { en: 'Cancelled. Nothing changed.', id: 'Oke, dibatalkan. Tidak ada yang berubah.' },
  cannot: { en: (why: string) => `I cannot do that: ${why}`, id: (why: string) => `Tidak bisa dijalankan: ${why}` },
  failed: { en: (why: string) => `The change did not go through: ${why}`, id: (why: string) => `Perubahan gagal: ${why}` },
  noEmployee: {
    en: { pr: 'You have no employee record, so I cannot raise a request in your name.', checkIn: 'You have no employee record, so there is nothing to check in.' },
    id: { pr: 'Anda belum punya data karyawan, jadi saya tidak bisa mengajukan permintaan atas nama Anda.', checkIn: 'Anda belum punya data karyawan, jadi tidak ada yang bisa diabsenkan.' },
  },
  pr: {
    en: {
      title: (code: string) => `Raise purchase request ${code}`,
      lines: (item: string, qty: string, est: string | null, by: string, reason: string) => [`Item: ${item}`, `Quantity: ${qty}`, `Estimate: ${est ?? 'no vendor price yet'}`, `Needed by: ${by}`, `Reason: ${reason}`, 'It goes for approval as soon as you confirm.'],
      summary: (code: string, qty: string, item: string, est: string | null) => `I'll raise ${code} for ${qty} of ${item}${est ? `, about ${est}` : ''}.`,
      done: (code: string, qty: string, item: string) => `Done. ${code} for ${qty} of ${item} is waiting for approval.`,
      which: 'Which item? Name it as it appears in the item list, for example "raise a PR for 10 A4 paper".',
      howMany: (item: string) => `How many ${item}? For example "raise a PR for 10 ${item}".`,
      reason: 'Raised from the Jessy chat.',
      ask: (n: number, item: string) => `Raise a PR for ${n} ${item}`,
    },
    id: {
      title: (code: string) => `Ajukan permintaan pembelian ${code}`,
      lines: (item: string, qty: string, est: string | null, by: string, reason: string) => [`Barang: ${item}`, `Jumlah: ${qty}`, `Perkiraan: ${est ?? 'belum ada harga vendor'}`, `Dibutuhkan: ${by}`, `Alasan: ${reason}`, 'Langsung masuk approval setelah Anda konfirmasi.'],
      summary: (code: string, qty: string, item: string, est: string | null) => `Saya siapkan ${code} untuk ${qty} ${item}${est ? `, sekitar ${est}` : ''}.`,
      done: (code: string, qty: string, item: string) => `Beres. ${code} untuk ${qty} ${item} sudah menunggu persetujuan.`,
      which: 'Barang yang mana? Sebutkan seperti di daftar barang, misalnya "ajukan PR untuk 10 kertas A4".',
      howMany: (item: string) => `Berapa ${item}? Misalnya "ajukan PR untuk 10 ${item}".`,
      reason: 'Diajukan dari chat Jessy.',
      ask: (n: number, item: string) => `Ajukan PR untuk ${n} ${item}`,
    },
  },
  decide: {
    en: {
      title: (verb: string, code: string) => `${verb} ${code}`,
      note: (n: string) => `Note: ${n}`,
      summary: (decision: 'approved' | 'rejected', code: string) => `I'll ${decision === 'approved' ? 'approve' : 'reject'} ${code}.`,
      done: (decision: string, code: string) => `Done. You ${decision} ${code}.`,
      notFound: (code: string) => `I cannot find a pending request with the code ${code}.`,
      notYours: (code: string) => `${code} does not wait for you, so I cannot decide it for you.`,
      decided: { approved: 'approved', rejected: 'rejected' },
    },
    id: {
      title: (verb: string, code: string) => `${verb} ${code}`,
      note: (n: string) => `Catatan: ${n}`,
      summary: (decision: 'approved' | 'rejected', code: string) => `Saya akan ${decision === 'approved' ? 'menyetujui' : 'menolak'} ${code}.`,
      done: (decision: string, code: string) => `Beres. ${code} sudah Anda ${decision}.`,
      notFound: (code: string) => `Saya tidak menemukan pengajuan tertunda dengan kode ${code}.`,
      notYours: (code: string) => `${code} tidak sedang menunggu Anda, jadi saya tidak bisa memutuskannya.`,
      decided: { approved: 'setujui', rejected: 'tolak' },
    },
  },
  checkIn: {
    en: {
      title: (time: string) => `Check in at ${time}`,
      lines: (name: string, date: string, shift: string | null) => [`Employee: ${name}`, `Date: ${date}`, shift ? `Shift: ${shift}` : 'No shift today', 'No photo or location is sent from the chat.'],
      summary: (time: string) => `I'll check you in at ${time}.`,
      done: (time: string) => `Done. You checked in at ${time}.`,
      shift: (name: string, start: string, end: string) => `${name}, ${start} to ${end}`,
      link: 'My day',
    },
    id: {
      title: (time: string) => `Absen masuk pukul ${time}`,
      lines: (name: string, date: string, shift: string | null) => [`Karyawan: ${name}`, `Tanggal: ${date}`, shift ? `Shift: ${shift}` : 'Tidak ada shift hari ini', 'Chat tidak mengirim foto atau lokasi.'],
      summary: (time: string) => `Saya absenkan Anda masuk pukul ${time}.`,
      done: (time: string) => `Beres. Anda tercatat masuk pukul ${time}.`,
      shift: (name: string, start: string, end: string) => `${name}, ${start} sampai ${end}`,
      link: 'Hari saya',
    },
  },
  announce: {
    en: {
      title: 'Post an announcement',
      lines: (title: string, body: string) => [`Title: ${title}`, `Message: ${body}`, 'Audience: everyone'],
      summary: (title: string) => `I'll post "${title}" for everyone.`,
      done: (title: string) => `Done. "${title}" is posted for everyone.`,
      ask: 'What should it say? For example: "announce Office closed Friday: The office closes at noon for maintenance."',
      link: 'Announcements',
    },
    id: {
      title: 'Kirim pengumuman',
      lines: (title: string, body: string) => [`Judul: ${title}`, `Isi: ${body}`, 'Untuk: semua karyawan'],
      summary: (title: string) => `Saya akan memasang pengumuman "${title}" untuk semua karyawan.`,
      done: (title: string) => `Beres. "${title}" sudah tayang untuk semua karyawan.`,
      ask: 'Isinya apa? Misalnya: "umumkan Kantor tutup Jumat: Kantor tutup jam 12 untuk perawatan."',
      link: 'Pengumuman',
    },
  },
  task: {
    en: {
      title: 'Add a follow-up',
      lines: (deal: string, task: string, kind: string, due: string) => [`Deal: ${deal}`, `Task: ${task}`, `Kind: ${kind}`, `Due: ${due}`, 'Owner: you'],
      summary: (deal: string, due: string) => `I'll add a follow-up on ${deal}, due ${due}.`,
      done: (code: string, due: string) => `Done. The follow-up on ${code} is due ${due}.`,
      which: 'Which deal? Give the code or the buyer\'s name, for example "follow up DL-26-0041 tomorrow by call".',
      name: (who: string) => `Follow up with ${who}`,
      onDeal: (title: string) => `Follow up on ${title}`,
      link: 'Follow-ups',
    },
    id: {
      title: 'Tambah tindak lanjut',
      lines: (deal: string, task: string, kind: string, due: string) => [`Deal: ${deal}`, `Tugas: ${task}`, `Jenis: ${kind}`, `Tenggat: ${due}`, 'Pemilik: Anda'],
      summary: (deal: string, due: string) => `Saya tambahkan tindak lanjut untuk ${deal}, tenggat ${due}.`,
      done: (code: string, due: string) => `Beres. Tindak lanjut ${code} jatuh tempo ${due}.`,
      which: 'Deal yang mana? Sebutkan kode atau nama pembelinya, misalnya "follow up DL-26-0041 besok lewat telepon".',
      name: (who: string) => `Tindak lanjut dengan ${who}`,
      onDeal: (title: string) => `Tindak lanjut ${title}`,
      link: 'Tindak lanjut',
    },
  },
  /** What Jessy offers after a change runs. */
  next: {
    en: { pr: 'Want to see the purchasing report?', decide: 'Want to see what else waits for you?', checkIn: 'Want your leave balance too?', announce: 'Anything else for today?', task: 'Want to see the pipeline?' },
    id: { pr: 'Mau lihat laporan pembeliannya?', decide: 'Mau lihat apa lagi yang menunggu Anda?', checkIn: 'Mau cek sisa cuti juga?', announce: 'Ada lagi yang bisa saya bantu?', task: 'Mau lihat pipeline-nya?' },
  },
} as const

/** What a refusal says the role cannot see. */
export type Seen = Topic | 'attendance' | 'candidates' | 'exclusives'

export const WHAT: Pair<Record<Seen, string>> = {
  en: { sales: 'sales', finance: 'finance figures', inventory: 'stock', purchasing: 'purchasing', people: 'people data', listings: 'listings', leads: 'inquiries', attendance: 'attendance', candidates: 'candidates', exclusives: 'exclusive rights' },
  id: { sales: 'data penjualan', finance: 'data keuangan', inventory: 'data stok', purchasing: 'data pembelian', people: 'data SDM', listings: 'data listing', leads: 'data inquiry', attendance: 'data kehadiran', candidates: 'data kandidat', exclusives: 'hak eksklusif' },
}

export const TASK_KIND: Pair<Record<TaskKind, string>> = {
  en: TASK_KIND_LABEL,
  id: { call: 'Telepon', whatsapp: 'WhatsApp', visit: 'Kunjungan', email: 'Email', todo: 'Tugas' },
}

export const dateTimeOf = (iso: string, lang: Lang) => `${dateOf(iso, lang)} ${fmtTime(iso)}`

/** One line of help per thing Jessy can do, and the starter chip that tries it. */
export const ABILITIES: { needs: Permission | null; line: Pair<string>; starter: Pair<string> | null }[] = [
  { needs: null, line: { en: 'A dashboard summary of everything your role can see', id: 'Ringkasan dashboard untuk semua yang bisa dilihat peran Anda' }, starter: { en: 'Dashboard summary today', id: 'Ringkasan dashboard hari ini' } },
  { needs: 'deal.view', line: { en: 'A sales report: deals won, value, top agents and the open pipeline', id: 'Laporan penjualan: deal closing, nilainya, agen teratas, dan pipeline terbuka' }, starter: { en: 'Sales report this month', id: 'Laporan penjualan bulan ini' } },
  { needs: 'finance.view', line: { en: 'A finance report: revenue, expenses, net income and overdue invoices', id: 'Laporan keuangan: pendapatan, biaya, laba bersih, dan invoice jatuh tempo' }, starter: { en: 'Finance report this month', id: 'Laporan keuangan bulan ini' } },
  { needs: 'purchase.view', line: { en: 'Purchasing and stock reports: spend, open and late orders, stock value, low stock', id: 'Laporan pembelian dan stok: belanja, PO terbuka dan telat, nilai stok, stok menipis' }, starter: { en: 'Stock report', id: 'Laporan stok' } },
  { needs: 'hr.view', line: { en: "A people report: headcount, today's attendance and open requests", id: 'Laporan SDM: jumlah karyawan, kehadiran hari ini, dan pengajuan terbuka' }, starter: { en: 'People report', id: 'Laporan SDM' } },
  { needs: 'listing.view', line: { en: 'Listing and lead reports: listings by status, new inquiries and their stages', id: 'Laporan listing dan leads: listing per status, leads baru, dan tahapnya' }, starter: { en: 'Listing report', id: 'Laporan listing' } },
  { needs: null, line: { en: 'Follow-ups on the last report: another period, a comparison, the breakdown or the top rows', id: 'Lanjutan dari laporan terakhir: periode lain, perbandingan, rincian, atau yang teratas' }, starter: null },
  { needs: 'hr.view', line: { en: 'Who is in, late or on leave today, by department', id: 'Siapa yang hadir, telat, atau cuti hari ini, per departemen' }, starter: { en: 'Who is late today?', id: 'Siapa yang telat hari ini?' } },
  { needs: 'purchase.view', line: { en: 'Low stock, and the stock of a named item', id: 'Stok menipis, dan stok barang tertentu' }, starter: { en: 'What is low on stock?', id: 'Stok apa yang menipis?' } },
  { needs: 'deal.view', line: { en: 'Won deals this month, last month or this quarter, and the pipeline by stage', id: 'Deal closing bulan ini, bulan lalu, atau kuartal ini, dan pipeline per tahap' }, starter: { en: 'Sales this month', id: 'Berapa omzet bulan ini?' } },
  { needs: 'hr.view', line: { en: "A candidate's status by name", id: 'Status kandidat berdasarkan nama' }, starter: { en: 'Candidates in interview', id: 'Kandidat tahap interview' } },
  { needs: null, line: { en: 'What waits for your approval', id: 'Apa yang menunggu persetujuan Anda' }, starter: { en: 'What waits for my approval?', id: 'Apa yang menunggu persetujuan saya?' } },
  { needs: 'finance.view', line: { en: 'Overdue invoices', id: 'Invoice yang lewat jatuh tempo' }, starter: { en: 'Overdue invoices', id: 'Piutang jatuh tempo' } },
  { needs: 'exclusive.view', line: { en: 'Exclusive rights that end soon', id: 'Hak eksklusif yang segera berakhir' }, starter: { en: 'Exclusive rights expiring soon', id: 'Hak eksklusif yang segera berakhir' } },
  { needs: null, line: { en: 'Your leave balance', id: 'Sisa cuti Anda' }, starter: { en: 'My leave balance', id: 'Sisa cuti saya' } },
  { needs: 'purchase.request', line: { en: 'Raise a purchase request, such as "raise a PR for 10 A4 paper"', id: 'Ajukan permintaan pembelian, misalnya "ajukan PR untuk 10 kertas A4"' }, starter: { en: 'Raise a PR for 10 A4 paper', id: 'Ajukan PR untuk 10 kertas A4' } },
  { needs: null, line: { en: 'Approve or reject a request that waits for you, by code or name', id: 'Setujui atau tolak pengajuan yang menunggu Anda, dengan kode atau nama' }, starter: null },
  { needs: null, line: { en: 'Check you in for today', id: 'Absen masuk untuk hari ini' }, starter: { en: 'Check me in', id: 'Absenkan saya' } },
  { needs: 'employee.manage', line: { en: 'Post an announcement, such as "announce Office closed Friday: The office closes at noon."', id: 'Kirim pengumuman, misalnya "umumkan Kantor tutup Jumat: Kantor tutup jam 12."' }, starter: null },
  { needs: 'deal.manage', line: { en: 'Add a follow-up task on a deal, such as "follow up DL-26-0041 tomorrow by call"', id: 'Tambah tindak lanjut pada deal, misalnya "follow up DL-26-0041 besok lewat telepon"' }, starter: null },
]

const COPY_TITLE: Pair<Record<Topic, string>> = {
  en: { sales: 'Sales', finance: 'Finance', inventory: 'Stock', purchasing: 'Purchasing', people: 'People', listings: 'Listing', leads: 'Lead' },
  id: TOPIC_NAME.id,
}

// ---------------------------------------------------------------- quick replies

const QUICK = {
  dashboard: { en: 'Dashboard summary today', id: 'Ringkasan dashboard hari ini' },
  drill: { en: 'Show the breakdown', id: 'Rinciannya' },
  topAgent: { en: 'Who is the top agent?', id: 'Siapa agen terbaik?' },
  longest: { en: 'Which is the longest overdue?', id: 'Yang paling lama telat?' },
  largest: { en: 'Which is the largest?', id: 'Yang terbesar?' },
  lastMonth: { en: 'Last month?', id: 'Bulan lalu?' },
  thisMonth: { en: 'This month?', id: 'Bulan ini?' },
  approvals: { en: 'What waits for my approval?', id: 'Apa yang menunggu persetujuan saya?' },
  leave: { en: 'My leave balance', id: 'Sisa cuti saya' },
} as const

export type QuickKey = keyof typeof QUICK
export const quick = (lang: Lang, ...keys: QuickKey[]) => keys.map((k) => QUICK[k][lang])

/** "Compare with last month" for the period before the one shown. */
export const compareAsk = (prevLabel: string, lang: Lang) => (lang === 'id' ? `Dibanding ${prevLabel}` : `Compare with ${prevLabel}`)
