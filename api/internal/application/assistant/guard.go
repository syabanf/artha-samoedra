package assistant

import (
	"regexp"
	"strings"
)

// Jessy in the console answers team members about the company's own back-office data. These
// checks refuse prompt injection and unrelated tasks before any model call, so a refused message
// costs no tokens. The patterns match packages/fixtures/src/guardrails.ts, the frontend's guard.

var injection = []*regexp.Regexp{
	regexp.MustCompile(`\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|earlier|all|your)\b.{0,20}\b(instructions?|rules?|prompts?|messages?)\b`),
	regexp.MustCompile(`\b(abaikan|lupakan)\b.{0,30}\b(instruksi|perintah|aturan|prompt)\b`),
	regexp.MustCompile(`\b(system|developer|hidden)\s+(prompt|message|instructions?)\b`),
	regexp.MustCompile(`\b(prompt|instruksi)\s+(sistem|rahasia)\b`),
	regexp.MustCompile(`\b(you are now|act as|pretend (to be|you are)|roleplay as|jailbreak|developer mode|dan mode)\b`),
	regexp.MustCompile(`\b(sekarang kamu adalah|berpura-pura (jadi|menjadi)|anggap kamu)\b`),
	regexp.MustCompile(`\b(reveal|show|print|repeat)\b.{0,20}\b(your|the)\b.{0,10}\b(prompt|instructions|rules|configuration|api key|token)\b`),
}

var offTopic = []*regexp.Regexp{
	regexp.MustCompile(`\b(write|tulis|buatkan|bikin)\b.{0,25}\b(code|kode|program|script|essay|esai|poem|puisi|lagu|song|story|cerita|cerpen|skripsi|tugas)\b`),
	regexp.MustCompile(`\b(python|javascript|java|sql query|html|css|regex|golang|php)\b`),
	regexp.MustCompile(`\b(weather|cuaca|recipe|resep|football|sepak bola|movie|film|game|horoscope|zodiak|lottery|togel)\b`),
	regexp.MustCompile(`\b(politic\w*|politik|election|pemilu|presiden|president|religion|agama)\b`),
	regexp.MustCompile(`\b(bitcoin|crypto|kripto|saham|stock tips|forex|trading)\b`),
	regexp.MustCompile(`\b(translate|terjemahkan|capital of|ibu kota|who invented|siapa penemu|homework|pr matematika)\b`),
	regexp.MustCompile(`\b(diagnos\w*|obat|medicine|symptom|gejala|legal advice|nasihat hukum)\b`),
}

var idWords = regexp.MustCompile(`\b(apa|yang|saya|aku|berapa|bisa|tolong|dong|ada|mau|cari|gimana|bagaimana|kamu|tidak|nggak|gak|ini|itu|untuk|dengan|rumah|tanah|nomor|pemilik|harga|lokasi|sewa|jual|minta|kasih|tulis|buatkan|bikin)\b`)

// guard returns the refusal for a message Jessy must not handle, or "" when she may answer it.
func guard(text string) string {
	t := strings.ToLower(text)
	id := len(idWords.FindAllString(t, -1)) >= 2
	pick := func(en, idn string) string {
		if id {
			return idn
		}
		return en
	}
	for _, re := range injection {
		if re.MatchString(t) {
			return pick("I cannot change how I work. I answer from the console data your role may see, and every change waits for your Confirm.",
				"Saya tidak bisa mengubah cara kerja saya. Saya menjawab dari data konsol sesuai akses peran Anda, dan setiap perubahan menunggu Confirm dari Anda.")
		}
	}
	for _, re := range offTopic {
		if re.MatchString(t) {
			return pick("I only answer questions about Artha Samoedra back-office data: listings, sales, finance, people, purchasing and approvals.",
				"Saya hanya menjawab pertanyaan seputar data back office Artha Samoedra: listing, penjualan, keuangan, SDM, pembelian, dan approval.")
		}
	}
	return ""
}
