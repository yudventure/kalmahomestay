'use strict';

/**
 * Privacy policy and terms of use, in English and Indonesian.
 *   /en/privacy, /privasi        privacy policy
 *   /en/terms,   /ketentuan      terms of booking and use
 * The texts live here (not in the editable website texts) because they change rarely and as a whole.
 */
const UPDATED = '2026-10-05';

const PATHS = {
  privacy: { en: '/en/privacy', id: '/privasi' },
  terms: { en: '/en/terms', id: '/ketentuan' },
};

const TEXT = {
  en: {
    updated: 'Last updated',
    contactTitle: 'Questions',
    contactText: 'Write to us at {email} or send a WhatsApp message to {wa}. We reply within two working days.',
    privacy: {
      title: 'Privacy policy',
      lead: 'Kalma Raja Ampat only asks for the details we need to host you well, and we never sell them.',
      sections: [
        ['What we collect', [
          'When you book or send feedback we receive your name, email address, WhatsApp number, country, travel dates, number of guests and any message you write.',
          'When you pay online, Midtrans processes the payment. We receive the payment status and method, never your full card number.',
          'Our server keeps standard technical logs, such as IP address and browser type, to keep the website safe.',
        ]],
        ['How we use it', [
          'To confirm and manage your booking, arrange your pick-up from Waisai and prepare your stay.',
          'To send booking confirmations, payment receipts and important travel information by email.',
          'To answer your questions and feedback, and to improve our service.',
        ]],
        ['Who we share it with', [
          'Midtrans, our licensed payment provider, to process online payments.',
          'Hostinger, our hosting provider, which stores the website and its database on secure servers.',
          'Our boat crew and local guides receive only the details they need for your trip.',
          'We never sell or rent your personal data.',
        ]],
        ['Cookies', [
          'The public website does not use advertising or tracking cookies.',
          'Small cookies keep staff signed in to the operator area and remember the language they chose.',
        ]],
        ['How long we keep it', [
          'Booking and payment records are kept for as long as Indonesian tax and accounting rules require.',
          'Feedback is kept for up to three years and then deleted or anonymised.',
        ]],
        ['Your rights', [
          'You can ask to see, correct or delete your personal data at any time.',
          'We answer every request within 14 days.',
        ]],
      ],
    },
    terms: {
      title: 'Terms and conditions',
      lead: 'These terms apply to every booking made on halokalma.com and to the use of this website.',
      sections: [
        ['Bookings', [
          'A booking is confirmed once payment is received, or once the Kalma team confirms a request by email.',
          'Please make sure your name, email address and WhatsApp number are correct, because every confirmation is sent by email.',
          'Guests must be at least 18 years old to make a booking. Children stay under the supervision of their parents or guardians.',
        ]],
        ['Prices and payment', [
          'Room prices are per person per night in Indonesian rupiah and include three meals a day, drinking water, coffee and tea, and pick-up from Waisai.',
          'Prices are checked again by our system before payment, so the amount shown on the payment page is final.',
          'Online payments are processed by Midtrans. Bank or payment provider fees are shown before you pay.',
          'Activity and trip prices are listed per person. Activities without a listed price are confirmed by email before payment.',
        ]],
        ['Changes and cancellations', [
          'Contact us as early as possible if your plans change. Date changes depend on availability.',
          'The refund terms for your deposit or payment are stated in your booking confirmation.',
          'If weather or sea conditions make a trip unsafe, we move it to another day or offer a refund for that trip.',
        ]],
        ['During your stay', [
          'Please respect the reef, the forest and the village. No standing on coral, no touching marine life and no taking anything home.',
          'Follow the instructions of our crew and guides during boat trips, snorkeling and diving.',
          'Electricity runs in the evening and phone signal is limited. Please plan for both.',
          'Kalma is not responsible for loss of personal belongings or for injuries caused by ignoring safety instructions.',
        ]],
        ['Use of this website', [
          'Photos, texts and the Kalma brand on this website belong to Kalma Raja Ampat and may not be reused without permission.',
          'The operator area is for Kalma staff only. Any attempt to access it without permission is prohibited.',
          'We may update these terms. The version on this page always applies to new bookings.',
        ]],
      ],
    },
  },
  id: {
    updated: 'Diperbarui',
    contactTitle: 'Pertanyaan',
    contactText: 'Kirim email ke {email} atau pesan WhatsApp ke {wa}. Kami membalas dalam dua hari kerja.',
    privacy: {
      title: 'Kebijakan privasi',
      lead: 'Kalma Raja Ampat hanya meminta data yang kami perlukan untuk melayani kamu dengan baik, dan kami tidak pernah menjualnya.',
      sections: [
        ['Data yang kami kumpulkan', [
          'Saat memesan atau mengirim masukan, kami menerima nama, alamat email, nomor WhatsApp, negara, tanggal perjalanan, jumlah tamu, dan pesan yang kamu tulis.',
          'Saat membayar online, pembayaran diproses oleh Midtrans. Kami hanya menerima status dan metode pembayaran, tidak pernah nomor kartu lengkap.',
          'Server kami menyimpan log teknis standar seperti alamat IP dan jenis browser untuk menjaga keamanan website.',
        ]],
        ['Cara kami memakainya', [
          'Untuk mengonfirmasi dan mengatur pesananmu, menyiapkan penjemputan dari Waisai, dan menyiapkan masa inapmu.',
          'Untuk mengirim konfirmasi pesanan, bukti pembayaran, dan informasi penting perjalanan lewat email.',
          'Untuk menjawab pertanyaan dan masukanmu, serta meningkatkan layanan kami.',
        ]],
        ['Pihak yang menerima data', [
          'Midtrans, penyedia pembayaran berizin, untuk memproses pembayaran online.',
          'Hostinger, penyedia hosting, yang menyimpan website dan database di server yang aman.',
          'Kru perahu dan pemandu lokal hanya menerima data yang mereka perlukan untuk perjalananmu.',
          'Kami tidak pernah menjual atau menyewakan data pribadimu.',
        ]],
        ['Cookie', [
          'Website untuk tamu tidak memakai cookie iklan atau pelacakan.',
          'Cookie kecil dipakai agar staf tetap masuk di area operator dan bahasa pilihan mereka tersimpan.',
        ]],
        ['Lama penyimpanan', [
          'Catatan pesanan dan pembayaran disimpan selama diwajibkan aturan pajak dan akuntansi Indonesia.',
          'Masukan tamu disimpan paling lama tiga tahun, lalu dihapus atau dianonimkan.',
        ]],
        ['Hak kamu', [
          'Kamu bisa meminta untuk melihat, memperbaiki, atau menghapus data pribadimu kapan saja.',
          'Setiap permintaan kami jawab dalam 14 hari.',
        ]],
      ],
    },
    terms: {
      title: 'Syarat dan ketentuan',
      lead: 'Ketentuan ini berlaku untuk setiap pemesanan di halokalma.com dan untuk penggunaan website ini.',
      sections: [
        ['Pemesanan', [
          'Pesanan terkonfirmasi setelah pembayaran diterima, atau setelah tim Kalma mengonfirmasi permintaan lewat email.',
          'Pastikan nama, alamat email, dan nomor WhatsApp sudah benar, karena setiap konfirmasi dikirim lewat email.',
          'Pemesan minimal berusia 18 tahun. Anak-anak menginap di bawah pengawasan orang tua atau wali.',
        ]],
        ['Harga dan pembayaran', [
          'Harga kamar dihitung per orang per malam dalam rupiah, sudah termasuk tiga kali makan, air minum, kopi dan teh, serta penjemputan dari Waisai.',
          'Harga diperiksa ulang oleh sistem sebelum pembayaran, sehingga jumlah di halaman pembayaran adalah jumlah akhir.',
          'Pembayaran online diproses oleh Midtrans. Biaya bank atau penyedia pembayaran ditampilkan sebelum kamu membayar.',
          'Harga aktivitas dan trip dihitung per orang. Aktivitas tanpa harga tercantum dikonfirmasi lewat email sebelum pembayaran.',
        ]],
        ['Perubahan dan pembatalan', [
          'Hubungi kami secepatnya bila rencanamu berubah. Perubahan tanggal bergantung pada ketersediaan.',
          'Ketentuan pengembalian uang muka atau pembayaran tercantum di konfirmasi pesananmu.',
          'Bila cuaca atau kondisi laut membuat trip tidak aman, kami memindahkannya ke hari lain atau mengembalikan biaya trip tersebut.',
        ]],
        ['Selama menginap', [
          'Hormati karang, hutan, dan kampung. Jangan berdiri di atas karang, jangan menyentuh biota laut, dan jangan membawa apa pun pulang.',
          'Ikuti arahan kru dan pemandu selama perjalanan perahu, snorkeling, dan diving.',
          'Listrik menyala pada malam hari dan sinyal telepon terbatas. Mohon persiapkan keduanya.',
          'Kalma tidak bertanggung jawab atas kehilangan barang pribadi atau cedera akibat mengabaikan arahan keselamatan.',
        ]],
        ['Penggunaan website', [
          'Foto, teks, dan merek Kalma di website ini milik Kalma Raja Ampat dan tidak boleh dipakai ulang tanpa izin.',
          'Area operator hanya untuk staf Kalma. Setiap upaya masuk tanpa izin dilarang.',
          'Ketentuan ini bisa kami perbarui. Versi di halaman ini selalu berlaku untuk pesanan baru.',
        ]],
      ],
    },
  },
};

function mountLegal(app, { page }) {
  for (const kind of ['privacy', 'terms']) {
    for (const lang of ['en', 'id']) {
      app.get(PATHS[kind][lang], (req, res) => {
        const L = TEXT[lang];
        res.render('legal', page(lang, {
          title: `${L[kind].title} · Kalma Raja Ampat`, path: PATHS[kind][lang], alt: PATHS[kind],
          doc: L[kind], L, kind, updated: UPDATED, other: PATHS[kind === 'privacy' ? 'terms' : 'privacy'][lang],
          otherTitle: L[kind === 'privacy' ? 'terms' : 'privacy'].title,
        }));
      });
    }
  }
  app.get(['/privacy', '/terms'], (req, res) => res.redirect(301, '/en' + req.path));
}

const legalPaths = (lang) => ({ privacy: PATHS.privacy[lang], terms: PATHS.terms[lang] });

module.exports = { mountLegal, legalPaths, PATHS, TEXT };
