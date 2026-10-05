'use strict';

/** Words on the branded error and maintenance pages, in English and Indonesian. */
const TEXT = {
  en: {
    401: { eyebrow: 'Error 401', title: 'Please sign in first', text: 'This part of Kalma is only for our team. Sign in to continue, or head back to the beach.' },
    403: { eyebrow: 'Error 403', title: 'This dock is closed', text: 'You do not have access to this page. If you think you should, please ask the Kalma team.' },
    404: { eyebrow: 'Error 404', title: 'Lost at sea', text: 'We searched the whole lagoon but could not find this page. It may have moved, or the link has a typo.' },
    500: { eyebrow: 'Error 500', title: 'Our boat hit a small wave', text: 'Something went wrong on our side. Please try again in a moment. Your booking details are safe.' },
    503: { eyebrow: 'Under maintenance', title: 'We are tidying up the reef', text: 'Kalma is getting a little care right now. We will be back very soon, thank you for your patience.' },
    page: { eyebrow: 'Under maintenance', title: 'This page is being refreshed', text: 'We are making this page better. Please come back a little later, the rest of the website is open.' },
    until: 'Expected back',
    home: 'Back to home',
    retry: 'Try again',
    login: 'Sign in',
    contact: 'Need help right away?',
  },
  id: {
    401: { eyebrow: 'Error 401', title: 'Silakan masuk dulu', text: 'Bagian ini hanya untuk tim Kalma. Masuk untuk melanjutkan, atau kembali ke pantai.' },
    403: { eyebrow: 'Error 403', title: 'Dermaga ini sedang ditutup', text: 'Kamu tidak punya akses ke halaman ini. Jika seharusnya bisa, hubungi tim Kalma.' },
    404: { eyebrow: 'Error 404', title: 'Tersesat di laut', text: 'Kami sudah mencari ke seluruh laguna tapi halaman ini tidak ditemukan. Mungkin sudah pindah, atau ada salah ketik di link.' },
    500: { eyebrow: 'Error 500', title: 'Perahu kami kena ombak kecil', text: 'Ada gangguan di sisi kami. Coba lagi sebentar lagi. Data pesananmu tetap aman.' },
    503: { eyebrow: 'Sedang perawatan', title: 'Kami sedang merapikan karang', text: 'Website Kalma sedang dirawat sebentar. Kami segera kembali, terima kasih sudah menunggu.' },
    page: { eyebrow: 'Sedang perawatan', title: 'Halaman ini sedang diperbarui', text: 'Kami sedang menyempurnakan halaman ini. Silakan kembali sebentar lagi, bagian lain website tetap bisa dibuka.' },
    until: 'Perkiraan kembali',
    home: 'Kembali ke beranda',
    retry: 'Coba lagi',
    login: 'Masuk',
    contact: 'Perlu bantuan segera?',
  },
};

/** Note shown in place of a homepage section that is under maintenance. */
const SECTION_NOTE = {
  en: 'This part of the page is being refreshed. Please check back soon.',
  id: 'Bagian ini sedang diperbarui. Silakan cek lagi sebentar lagi.',
};

module.exports = { TEXT, SECTION_NOTE };
