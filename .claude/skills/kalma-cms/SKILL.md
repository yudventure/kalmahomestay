---
name: kalma-cms
description: Aturan dan pola untuk website & admin CMS Kalma Raja Ampat. Pakai setiap kali mengubah tampilan admin, menambah fitur CMS, menambah tempat unggah foto/video/dokumen, atau menulis teks untuk website/admin Kalma.
---

# Kalma CMS

## Unggahan selalu lewat tombol
Setiap fitur yang butuh foto, video, atau dokumen harus punya tombol unggah di admin. Tidak boleh lewat File Manager.

Pola:
1. Route: `router.post('/area/:id/files', (req, res, next) => media.receive('document')(req, res, next), ah(async (req, res) => { ... }))`.
   Jenis: `image` (JPG/PNG/WebP, 10 MB), `video` (MP4/WebM, 80 MB), `document` (PDF/foto/Word/Excel, 15 MB).
   Cek `req.uploadError` lalu redirect dengan `?err=upload-<kode>` (pesan otomatis tampil di `_top.ejs`).
2. Simpan: `media.save(req.file, { kind, ownerType, ownerId, label, by: req.staff.username })`.
   Untuk tempat foto website pakai `slot` dan daftarkan di `SLOTS` (`src/media.js`).
3. Tampilan: `<%- include('_upload', { action, accept, title, hint, fields }) %>`. Tombol ini langsung mengunggah
   saat file dipilih atau ditarik, dengan progress bar.
4. File pribadi (dokumen karyawan, bukti transaksi) dibuka lewat `/admin/files/<id>` yang mengecek peran.
   Tambahkan `owner_type` baru ke `AREA` di `src/admin-media.js`.
5. Hapus file ikut saat datanya dihapus (`media.remove(id)`).

## Layout admin
- `_top.ejs`: top bar (logo, Kembali ke situs, lonceng pemberitahuan, menu akun), sidebar berikon dengan grup
  yang bisa dibuka, kotak "Status hari ini", dan eyebrow halaman otomatis.
- Komponen: `.hello` (kartu sapaan), `.cards` + `.card-stat` (angka), `.panel`, `.panel--attn`, `.grid3 .action-card`,
  `.tabs` (filter pil), `.table`, `.chip`, `.btn btn--primary|btn--ghost`, `.pill-btn`.
- Menu baru: tambahkan ke `NAV` di `_top.ejs` dengan `area` peran dari `src/staff.js`.
- Pemberitahuan lonceng dihitung di middleware "bell notifications" di `src/admin.js`.

## Gaya tulisan
Tanpa em dash/en dash di tengah kalimat, tanpa titik koma, tanpa titik dua di tengah kalimat. Kalimat pendek dan jelas
dalam bahasa Indonesia sehari-hari. Nilai kosong ditulis "-".

## Branding
Fraunces untuk judul, Plus Jakarta Sans untuk teks, warna dari `brand/tokens.css`. Jangan menambah font atau warna di luar token.

## Animasi di Windows dan Android
Banyak laptop Windows dan HP Android menyalakan pengaturan "kurangi animasi" (prefers-reduced-motion: reduce).
Pemilik ingin semua animasi tetap jalan. Jangan menulis `@media (prefers-reduced-motion: reduce) { ... animation: none }`
untuk elemen website. Uji dengan Playwright `reducedMotion: 'reduce'` di ukuran 1366×768 dan perangkat Android (Pixel 7).

## Pemesanan dan layanan
- Tombol Pesan/Book menuju halaman pemesanan `/pesan` (`/en/book`), bukan WhatsApp. Alurnya: pilih kamar dan tanggal,
  isi data diri, lalu bayar lewat Midtrans Snap (`src/booking.js`, `public/js/book.js`). Tanpa kunci Midtrans pesanan
  disimpan sebagai permintaan dan tamu diarahkan ke `/pesan/selesai`.
- Kolom tanggal memakai kalender Kalma (`public/js/datepicker.js`, `data-dp="range"` atau `data-dp="single"`), bukan
  kalender bawaan browser.
- Halaman detail layanan ada di `/layanan/<slug>` (`views/service.ejs`). Isi diving, snorkeling, dan trip diatur di admin
  Website → Aktivitas & trip (tabel `activities`, foto lewat tombol unggah). Harga kosong berarti "sesuai permintaan".
- Survei tamu sudah tidak ada di website dan tidak ada tombol WhatsApp melayang.

## Bahasa, peran PR, dan konten planner
- Bahasa bawaan website adalah Inggris. Beranda Inggris di `/`, beranda Indonesia di `/id` (`homePath()` di
  `src/activities.js`). Halaman lain tetap `/en/...` untuk Inggris dan `/pesan`, `/layanan`, `/masukan` untuk Indonesia.
- Semua pemberitahuan ke tamu lewat email. Teks website meminta tamu mengecek email (termasuk folder spam).
- Halaman We hear you tanpa header situs. Logo Kalma dan pilihan bahasa ada di kartu biru, ada tombol kembali ke beranda,
  email dan nomor WhatsApp wajib dan dipisah. Tidak ada tombol WhatsApp di halaman itu.
- Peran `pr` (Public Relations) membuka area `website` dan `content`. Menu Sosial media berisi Kalender konten,
  Papan konten (ide, naskah, produksi, siap tayang, sudah tayang), dan Komentar Instagram (`src/admin-content.js`).
  Materi konten diunggah lewat tombol (dokumen/foto dan video), bersifat pribadi.
- Kalender tanggal di bar pemesanan selalu terbuka di bawah bar. Jika layar pendek, halaman digulir dulu.
