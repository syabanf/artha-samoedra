/**
 * Guardrails for Jessy. Each Jessy has one job, and these checks run before her engine:
 * - public: the website chat answers customers about properties and site visits, and never
 *   shares internal data (commissions, owner contacts, staff, other buyers).
 * - console: the back-office assistant answers team members about the company's own data.
 * Both refuse prompt injection, unrelated tasks and oversized messages, and say what they can do.
 */

export type JessyAudience = 'public' | 'console'
export type GuardKind = 'too_long' | 'injection' | 'internal' | 'off_topic' | 'advice'

export const MAX_MESSAGE_CHARS = 1000

const INJECTION = [
  /\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|earlier|all|your)\b.{0,20}\b(instructions?|rules?|prompts?|messages?)\b/,
  /\b(abaikan|lupakan)\b.{0,30}\b(instruksi|perintah|aturan|prompt)\b/,
  /\b(system|developer|hidden)\s+(prompt|message|instructions?)\b/,
  /\b(prompt|instruksi)\s+(sistem|rahasia)\b/,
  /\b(you are now|act as|pretend (to be|you are)|roleplay as|jailbreak|developer mode|dan mode)\b/,
  /\b(sekarang kamu adalah|berpura-pura (jadi|menjadi)|anggap kamu)\b/,
  /\b(reveal|show|print|repeat)\b.{0,20}\b(your|the)\b.{0,10}\b(prompt|instructions|rules|configuration|api key|token)\b/,
]

/** Internal data the public chat never shares: it belongs to the console, behind a sign-in. */
const INTERNAL = [
  /\b(commission|komisi|fee agen|profit.?shar\w*|bagi hasil|margin|harga modal|harga dasar)\b/,
  /\b(owner|pemilik|partner|mitra|seller|penjual)\b.{0,25}\b(phone|number|nomor|wa|whatsapp|email|contact|kontak|alamat|address|name|nama)\b/,
  /\b(phone|nomor|whatsapp|email|contact|kontak)\b.{0,25}\b(owner|pemilik|partner|mitra|seller|penjual)\b/,
  /\b(other|lain)\b.{0,15}\b(buyers?|pembeli|customers?|pelanggan|leads?)\b/,
  /\b(salary|gaji|payroll|employee|karyawan|staff data|data staf)\b/,
  /\b(journal|jurnal|ledger|buku besar|revenue|pendapatan perusahaan|laporan keuangan)\b/,
  /\b(dashboard|database|basis data|console|konsol|backoffice|back office)\b/,
]

/** Tasks no Jessy does, whichever audience. */
const OFF_TOPIC = [
  /\b(write|tulis|buatkan|bikin)\b.{0,25}\b(code|kode|program|script|essay|esai|poem|puisi|lagu|song|story|cerita|cerpen|skripsi|tugas)\b/,
  /\b(python|javascript|java|sql query|html|css|regex|golang|php)\b/,
  /\b(weather|cuaca|recipe|resep|football|sepak bola|movie|film|game|horoscope|zodiak|lottery|togel)\b/,
  /\b(politic\w*|politik|election|pemilu|presiden|president|religion|agama)\b/,
  /\b(bitcoin|crypto|kripto|saham|stock tips|forex|trading)\b/,
  /\b(translate|terjemahkan|capital of|ibu kota|who invented|siapa penemu|homework|pr matematika)\b/,
  /\b(diagnos\w*|obat|medicine|symptom|gejala|legal advice|nasihat hukum)\b/,
]

/** The console Jessy reports on data; advice and strategy questions go to a report instead. */
const ADVICE = [
  /\b(tips|strategi|strategy|strategies|saran|advice|rekomendasi strategi|motivasi|motivation)\b/,
  /\b(ide|ideas?)\b.{0,15}\b(konten|content|promosi|promotion|marketing|caption|iklan)\b/,
  /\b(bagaimana|gimana|how)\b.{0,15}\b(cara|can|do|to)\b.{0,15}\b(meningkatkan|naikkan|jual|menjual|jualan|sell|market|improve|increase|grow|boost)\b/,
]

const fold = (t: string) => t.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/** The guard that refuses this message, or null when Jessy may answer it. */
export function guardMessage(text: string, audience: JessyAudience): GuardKind | null {
  if (text.length > MAX_MESSAGE_CHARS) return 'too_long'
  const t = fold(text)
  if (INJECTION.some((re) => re.test(t))) return 'injection'
  if (audience === 'public' && INTERNAL.some((re) => re.test(t))) return 'internal'
  if (audience === 'console' && ADVICE.some((re) => re.test(t))) return 'advice'
  if (OFF_TOPIC.some((re) => re.test(t))) return 'off_topic'
  return null
}

const ID_WORDS = /\b(apa|yang|saya|aku|berapa|bisa|tolong|dong|ada|mau|cari|gimana|bagaimana|kamu|tidak|nggak|gak|ini|itu|untuk|dengan|rumah|tanah|nomor|pemilik|harga|lokasi|sewa|jual|minta|kasih|tulis|buatkan|bikin|bulan|depan|minggu|hari|tahun|laporan|penjualan|jualan|strategi|saran|ringkasan|keuangan|stok|karyawan|kenapa|mengapa|sudah|belum)\b/

/** Indonesian when the message reads Indonesian, English otherwise. */
export const speaksIndonesian = (text: string) => (fold(text).match(new RegExp(ID_WORDS, 'g'))?.length ?? 0) >= 2

const REFUSAL: Record<JessyAudience, Record<GuardKind, [en: string, id: string]>> = {
  public: {
    too_long: ['That message is too long for me. Tell me in a sentence or two what property you are looking for.', 'Pesannya terlalu panjang. Ceritakan dalam satu atau dua kalimat properti seperti apa yang Anda cari.'],
    injection: ['I can only help with our properties: finding one, explaining a listing, or booking a site visit.', 'Saya hanya bisa membantu soal properti kami: mencari properti, menjelaskan listing, atau menjadwalkan survei lokasi.'],
    internal: ['I cannot share internal details such as commissions, owner contacts or other customers. I can tell you the price, size, certificate and location of any listing, or connect you with an agent.', 'Saya tidak bisa membagikan data internal seperti komisi, kontak pemilik, atau data pelanggan lain. Saya bisa menjelaskan harga, luas, sertifikat, dan lokasi listing, atau menghubungkan Anda dengan agen.'],
    off_topic: ['I am the property assistant of Artha Samoedra, so I only answer questions about our properties and site visits.', 'Saya asisten properti Artha Samoedra, jadi saya hanya menjawab pertanyaan seputar properti kami dan jadwal survei.'],
    advice: ['', ''],
  },
  console: {
    too_long: [`That message is longer than ${MAX_MESSAGE_CHARS} characters. Ask one question at a time.`, `Pesan itu lebih dari ${MAX_MESSAGE_CHARS} karakter. Ajukan satu pertanyaan sekali kirim.`],
    injection: ['I cannot change how I work. I answer from the console data your role may see, and every change waits for your Confirm.', 'Saya tidak bisa mengubah cara kerja saya. Saya menjawab dari data konsol sesuai akses peran Anda, dan setiap perubahan menunggu Confirm dari Anda.'],
    internal: ['', ''],
    advice: ['I report on the data in your dashboard rather than give advice. Ask for a report, such as "sales report this month" or "stock report", and use the figures to decide.', 'Saya membuat laporan dari data di dashboard, bukan memberi saran. Minta laporan, misalnya "laporan penjualan bulan ini" atau "laporan stok", lalu gunakan angkanya untuk memutuskan.'],
    off_topic: ['I only answer questions about Artha Samoedra back-office data: listings, sales, finance, people, purchasing and approvals. Type "help" to see what I can do.', 'Saya hanya menjawab pertanyaan seputar data back office Artha Samoedra: listing, penjualan, keuangan, SDM, pembelian, dan approval. Ketik "help" untuk melihat apa yang bisa saya bantu.'],
  },
}

/** The sentence Jessy answers with when a guard refuses, in the customer's language. */
/** `lang` lets a chat that already knows the customer's language keep it; otherwise the text decides. */
export const guardReply = (kind: GuardKind, audience: JessyAudience, text: string, lang?: 'id' | 'en') =>
  REFUSAL[audience][kind][(lang ?? (speaksIndonesian(text) ? 'id' : 'en')) === 'id' ? 1 : 0]

/** Purpose logged in the AI gateway, so refusals show up in Jessy's usage log. */
export const GUARD_PURPOSE = 'Guardrail refusal'
