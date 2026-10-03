'use strict';

/**
 * Traveler survey: questions defined once, in English and Indonesian.
 * type: 'single' (radio), 'multi' (checkboxes, optional max), 'text' (long answer), 'short' (one line).
 * Answers are stored as { questionId: value } where value is a string or an array of option ids.
 */
const o = (id, en, idn) => ({ id, label: { en, id: idn } });

const SECTIONS = [
  {
    id: 'A', title: { en: 'About you', id: 'Tentang kamu' },
    questions: [
      { id: 'q1', type: 'single', required: true, text: { en: 'Have you been to Raja Ampat?', id: 'Pernah ke Raja Ampat?' }, options: [
        o('yes_once', 'Yes, once', 'Ya, sekali'), o('yes_more', 'Yes, more than once', 'Ya, lebih dari sekali'),
        o('planning', "Not yet, but I'm planning to", 'Belum, tapi sedang merencanakan'), o('curious', 'Not yet, just curious', 'Belum, baru tertarik')] },
      { id: 'q2', type: 'short', text: { en: 'Where are you from?', id: 'Kamu berasal dari mana?' }, placeholder: { en: 'Country', id: 'Kota / negara' } },
      { id: 'q3', type: 'single', text: { en: 'Who did you travel with / will you travel with?', id: 'Pergi (atau akan pergi) bersama siapa?' }, options: [
        o('solo', 'Solo', 'Sendiri'), o('partner', 'Partner', 'Pasangan'), o('friends', 'Friends', 'Teman'),
        o('family_kids', 'Family with kids', 'Keluarga dengan anak'), o('group_tour', 'Group tour', 'Rombongan tur')] },
      { id: 'q4', type: 'multi', max: 2, text: { en: 'What was the main reason for your trip?', id: 'Apa alasan utama perjalananmu?' }, options: [
        o('diving', 'Diving', 'Diving'), o('snorkeling', 'Snorkeling', 'Snorkeling'), o('views', 'Island views / photography', 'Pemandangan pulau / fotografi'),
        o('birds', 'Birdwatching', 'Melihat burung'), o('relax', 'Relaxing / disconnecting', 'Istirahat / lepas dari rutinitas'),
        o('culture', 'Local culture', 'Budaya lokal'), o('honeymoon', 'Honeymoon', 'Bulan madu')] },
    ],
  },
  {
    id: 'B', title: { en: 'Planning the trip', id: 'Merencanakan perjalanan' },
    questions: [
      { id: 'q5', type: 'multi', text: { en: 'Where did you look for information when planning?', id: 'Di mana kamu mencari informasi saat merencanakan?' }, options: [
        o('google', 'Google', 'Google'), o('instagram', 'Instagram', 'Instagram'), o('tiktok', 'TikTok', 'TikTok'), o('youtube', 'YouTube', 'YouTube'),
        o('ota', 'Booking.com / Agoda', 'Booking.com / Agoda / Traveloka'), o('tripadvisor', 'TripAdvisor', 'TripAdvisor'),
        o('facebook', 'Facebook groups', 'Grup Facebook'), o('reddit', 'Reddit', 'Reddit'), o('blogs', 'Blogs', 'Blog'), o('friends', 'Friends', 'Teman / keluarga')] },
      { id: 'q6', type: 'text', text: { en: 'What information was the hardest to find?', id: 'Informasi apa yang paling sulit ditemukan?' } },
      { id: 'q7', type: 'single', text: { en: 'How far in advance did you book your accommodation?', id: 'Berapa lama sebelumnya kamu memesan penginapan?' }, options: [
        o('lt2w', 'Less than 2 weeks', 'Kurang dari 2 minggu'), o('2to4w', '2–4 weeks', '2–4 minggu'),
        o('1to3m', '1–3 months', '1–3 bulan'), o('gt3m', 'More than 3 months', 'Lebih dari 3 bulan')] },
    ],
  },
  {
    id: 'C', title: { en: 'Pain points', id: 'Yang bikin repot' },
    questions: [
      { id: 'q8', type: 'text', required: true, text: {
        en: 'What was (or do you expect to be) the most frustrating part of a trip to Raja Ampat?',
        id: 'Apa bagian yang paling bikin repot (atau kamu khawatirkan) saat ke Raja Ampat?' } },
      { id: 'q9', type: 'multi', text: { en: 'Which of these were a problem for you?', id: 'Mana saja yang jadi masalah buatmu?' }, options: [
        o('getting_there', 'Getting there (flights, ferry, connections)', 'Perjalanan ke sana (pesawat, kapal, sambungan)'),
        o('cost', 'Total cost was higher than expected', 'Total biaya lebih mahal dari perkiraan'),
        o('contact', 'Hard to contact the homestay / slow replies', 'Homestay sulit dihubungi / lambat membalas'),
        o('legit', 'Unsure if the homestay was legit before paying a deposit', 'Ragu homestay-nya asli sebelum bayar DP'),
        o('photos', "Photos didn't match reality", 'Foto tidak sesuai kenyataan'),
        o('prices', 'No clear prices online', 'Harga tidak jelas di internet'),
        o('cash', 'Cash only / no ATM nearby', 'Hanya tunai / tidak ada ATM'),
        o('signal', 'No internet or phone signal', 'Tidak ada internet atau sinyal'),
        o('electricity', 'Limited electricity', 'Listrik terbatas'),
        o('food', 'Food options (vegetarian, allergies)', 'Pilihan makanan (vegetarian, alergi)'),
        o('hidden_fees', 'Hidden fees (marine park card, boat transfers, trips)', 'Biaya tersembunyi (kartu kawasan, transfer perahu, trip)'),
        o('language', 'Language barrier', 'Kendala bahasa')] },
      { id: 'q10', type: 'text', text: { en: 'If you could fix ONE thing about traveling to Raja Ampat, what would it be?', id: 'Kalau bisa memperbaiki SATU hal tentang liburan ke Raja Ampat, apa itu?' } },
      { id: 'q11', type: 'text', text: { en: 'Was there anything you wish someone had told you before you arrived?', id: 'Ada hal yang kamu harap sudah diberi tahu sebelum tiba?' } },
    ],
  },
  {
    id: 'D', title: { en: 'Choosing a place to stay', id: 'Memilih penginapan' },
    questions: [
      { id: 'q12', type: 'multi', max: 3, text: { en: 'What matters most when choosing a homestay?', id: 'Apa yang paling penting saat memilih homestay?' }, options: [
        o('price', 'Price', 'Harga'), o('location', 'Location / house reef', 'Lokasi / terumbu di depan'), o('comfort', 'Room comfort', 'Kenyamanan kamar'),
        o('food', 'Food', 'Makanan'), o('reviews', 'Reviews', 'Ulasan'), o('responsiveness', 'Owner responsiveness', 'Pemilik cepat membalas'),
        o('activities', 'Activities included', 'Aktivitas sudah termasuk'), o('eco', 'Eco-friendly practices', 'Ramah lingkungan'), o('photos', 'Photos', 'Foto')] },
      { id: 'q13', type: 'text', text: { en: 'What makes you trust a homestay enough to pay a deposit?', id: 'Apa yang membuatmu cukup percaya untuk membayar DP ke sebuah homestay?' } },
      { id: 'q14', type: 'text', text: { en: 'What would make you NOT book a homestay, even if it looked nice?', id: 'Apa yang membuatmu TIDAK jadi memesan, walau homestay-nya terlihat bagus?' } },
      { id: 'q15', type: 'single', text: { en: 'How much did you expect to pay per person per night (including meals)?', id: 'Berapa harga yang kamu harapkan per orang per malam (termasuk makan)?' }, options: [
        o('lt500', 'Under Rp 500,000', 'Di bawah Rp 500.000'), o('500_800', 'Rp 500,000–800,000', 'Rp 500.000–800.000'),
        o('800_1200', 'Rp 800,000–1,200,000', 'Rp 800.000–1.200.000'), o('gt1200', 'Over Rp 1,200,000', 'Di atas Rp 1.200.000')] },
    ],
  },
  {
    id: 'E', title: { en: 'Booking & communication', id: 'Pemesanan & komunikasi' },
    questions: [
      { id: 'q16', type: 'single', text: { en: 'How do you prefer to book?', id: 'Kamu lebih suka memesan lewat apa?' }, options: [
        o('whatsapp', 'WhatsApp chat', 'Chat WhatsApp'), o('email', 'Email', 'Email'), o('instant', 'Instant booking on the website', 'Pesan langsung di website'),
        o('ota', 'Booking.com / Agoda', 'Booking.com / Agoda / Traveloka'), o('agent', 'Through a travel agent', 'Lewat agen perjalanan')] },
      { id: 'q17', type: 'single', text: { en: 'How do you prefer to pay the deposit?', id: 'Bagaimana kamu lebih suka membayar DP?' }, options: [
        o('transfer', 'Bank transfer', 'Transfer bank'), o('card', 'Credit card', 'Kartu kredit'), o('paypal_wise', 'PayPal / Wise', 'PayPal / Wise / e-wallet'),
        o('on_arrival', 'Pay everything on arrival', 'Bayar semua saat tiba')] },
      { id: 'q18', type: 'single', text: { en: 'How quickly do you expect a reply before you look elsewhere?', id: 'Seberapa cepat balasan yang kamu harapkan sebelum mencari tempat lain?' }, options: [
        o('1h', 'Within 1 hour', 'Dalam 1 jam'), o('same_day', 'Same day', 'Di hari yang sama'), o('2d', 'Within 2 days', 'Dalam 2 hari'), o('any', "Doesn't matter", 'Tidak masalah')] },
    ],
  },
  {
    id: 'F', title: { en: 'The stay', id: 'Selama menginap' },
    questions: [
      { id: 'q19', type: 'text', text: { en: 'What was the best moment of your stay?', id: 'Apa momen terbaik saat menginap?' } },
      { id: 'q20', type: 'multi', text: { en: 'Which activities would you pay extra for?', id: 'Aktivitas apa yang mau kamu bayar tambahan?' }, options: [
        o('island_hopping', 'Island hopping', 'Island hopping'), o('manta', 'Manta trip', 'Trip manta'), o('diving', 'Diving', 'Diving'),
        o('birds', 'Birds of paradise tour', 'Tur burung cendrawasih'), o('village', 'Village visit', 'Kunjungan kampung'),
        o('cooking', 'Cooking class', 'Kelas memasak'), o('kayak', 'Sunset kayak', 'Kayak senja')] },
    ],
  },
  {
    id: 'G', title: { en: 'The website', id: 'Website' },
    questions: [
      { id: 'q21', type: 'multi', text: { en: 'What must a homestay website show for you to book?', id: 'Apa yang wajib ada di website homestay agar kamu mau memesan?' }, options: [
        o('real_photos', 'Real photos of rooms and bathrooms', 'Foto asli kamar dan kamar mandi'), o('prices', 'Clear prices', 'Harga yang jelas'),
        o('included', "What's included", 'Apa saja yang termasuk'), o('how_to_get', 'How to get there step by step', 'Cara ke sana langkah demi langkah'),
        o('calendar', 'Availability calendar', 'Kalender ketersediaan'), o('reviews', 'Guest reviews', 'Ulasan tamu'), o('map', 'Map', 'Peta'),
        o('utilities', 'Electricity / internet info', 'Info listrik / internet'), o('cancellation', 'Cancellation policy', 'Kebijakan pembatalan'),
        o('video', 'Video tour', 'Video tur')] },
      { id: 'q22', type: 'text', text: { en: 'Anything else you would like us to know?', id: 'Ada hal lain yang ingin kamu sampaikan?' } },
      { id: 'q23', type: 'short', contact: true, text: { en: 'Can we contact you with a follow-up question? (optional)', id: 'Boleh kami hubungi untuk pertanyaan lanjutan? (opsional)' },
        placeholder: { en: 'Email or WhatsApp', id: 'Email atau WhatsApp' } },
    ],
  },
];

const QUESTIONS = SECTIONS.flatMap((s) => s.questions);
const BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));

const MAX_TEXT = 2000;
const MAX_SHORT = 120;

/** Read a form body into clean answers. Returns { answers, contact, missing: [questionIds] }. */
function parseSurvey(body = {}) {
  const answers = {};
  let contact = '';
  for (const q of QUESTIONS) {
    const raw = body[q.id];
    if (q.type === 'single') {
      const v = String(Array.isArray(raw) ? raw[0] : raw || '');
      if (q.options.some((op) => op.id === v)) answers[q.id] = v;
    } else if (q.type === 'multi') {
      const list = (Array.isArray(raw) ? raw : raw ? [raw] : []).map(String);
      const valid = q.options.map((op) => op.id).filter((id) => list.includes(id));
      const picked = q.max ? valid.slice(0, q.max) : valid;
      if (picked.length) answers[q.id] = picked;
    } else {
      const v = String(Array.isArray(raw) ? raw[0] : raw || '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
        .slice(0, q.type === 'short' ? MAX_SHORT : MAX_TEXT);
      if (v) {
        if (q.contact) contact = v;
        else answers[q.id] = v;
      }
    }
  }
  const missing = QUESTIONS.filter((q) => q.required && !answers[q.id]).map((q) => q.id);
  return { answers, contact, missing };
}

/** Counts per option for choice questions and the latest text answers, from stored responses. */
function summarize(responses) {
  const out = {};
  for (const q of QUESTIONS) {
    if (q.contact) continue;
    if (q.type === 'single' || q.type === 'multi') {
      const counts = Object.fromEntries(q.options.map((op) => [op.id, 0]));
      let answered = 0;
      for (const r of responses) {
        const v = r.answers[q.id];
        if (v == null) continue;
        answered += 1;
        (Array.isArray(v) ? v : [v]).forEach((id) => { if (id in counts) counts[id] += 1; });
      }
      out[q.id] = { answered, counts };
    } else {
      const texts = responses.filter((r) => r.answers[q.id]).map((r) => ({ id: r.id, text: r.answers[q.id], lang: r.lang, created_at: r.created_at }));
      out[q.id] = { answered: texts.length, texts };
    }
  }
  return out;
}

/** Flat row (English labels) for CSV export. */
function toRow(r) {
  const row = { id: r.id, created_at: r.created_at, lang: r.lang, contact: r.contact || '' };
  for (const q of QUESTIONS) {
    if (q.contact) continue;
    const v = r.answers[q.id];
    if (v == null) { row[q.id] = ''; continue; }
    if (q.options) {
      const label = (id) => (q.options.find((op) => op.id === id) || { label: { en: id } }).label.en;
      row[q.id] = Array.isArray(v) ? v.map(label).join('; ') : label(v);
    } else row[q.id] = v;
  }
  return row;
}
const CSV_COLUMNS = ['id', 'created_at', 'lang', 'contact', ...QUESTIONS.filter((q) => !q.contact).map((q) => q.id)];

module.exports = { SECTIONS, QUESTIONS, BY_ID, parseSurvey, summarize, toRow, CSV_COLUMNS };
