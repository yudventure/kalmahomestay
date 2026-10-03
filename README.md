# Kalma Raja Ampat — Website

Website Kalma Homestay dengan **Node.js + Express**, dibangun dari brand identity di folder [`brand/`](brand/README.md).

- Halaman dirender di server dalam dua bahasa: `/` (Indonesia) dan `/en` (English)
- Form pemesanan disimpan di server lalu diteruskan ke WhatsApp dengan pesan yang sudah terisi
- Halaman `/admin` (pakai password) untuk melihat semua pertanyaan pemesanan
- Tetap berfungsi walau JavaScript di browser mati

## Menjalankan

Butuh **Node.js 20.12 atau lebih baru**.

```bash
npm install
cp .env.example .env     # lalu isi nomor WhatsApp, email, password admin
npm run dev              # mode pengembangan, auto-restart saat file berubah
# buka http://localhost:3000
```

Untuk server produksi: `npm start`. Untuk menjalankan test: `npm test`.

## Struktur

```
server.js              Titik masuk: memuat .env lalu menjalankan server
src/app.js             Rute Express: halaman, form pemesanan, admin, sitemap
src/config.js          Pengaturan dari .env + data kamar (harga)
src/inquiry.js         Validasi form, pesan WhatsApp, penyimpanan
content/id.json        Semua teks Bahasa Indonesia
content/en.json        Semua teks English (key sama dengan id.json)
views/index.ejs        Template halaman utama
views/admin.ejs        Daftar pertanyaan pemesanan
views/404.ejs          Halaman tidak ditemukan
public/css, public/js  Tampilan dan interaksi di browser
public/img/            Taruh foto asli di sini
brand/                 Brand guidelines, logo, design tokens, deck klien
test/                  Test otomatis (node --test)
data/                  Pertanyaan pemesanan tersimpan (dibuat otomatis, tidak masuk git)
```

## Mengubah isi

| Yang diubah | File |
|---|---|
| Nomor WhatsApp, email, Instagram, password admin | `.env` |
| Harga kamar | `src/config.js` → `ROOMS` |
| Semua teks (judul, deskripsi kamar, FAQ, jadwal harian, menu) | `content/id.json` dan `content/en.json` |
| Tampilan | `public/css/style.css` (warna & font dari `brand/tokens.css`) |

Semua data homestay (harga, kapasitas, jam listrik, sinyal, pembayaran, pembatalan) saat ini **placeholder**. Ganti dengan data asli sebelum online.

## Mengganti foto

Kotak foto masih berupa gradasi warna. Simpan foto di `public/img/`, lalu di `views/index.ejs` tambahkan `--img`:

```html
<div class="photo ph-lagoon" style="--img:url(/img/bungalow-laguna.jpg)" …></div>
```

Lebar sekitar 1600 px, JPG/WebP, di bawah 300 KB.

## Pertanyaan pemesanan

Setiap kali tamu mengirim form:
1. Data divalidasi dan disimpan ke `data/inquiries.jsonl`
2. Tamu mendapat tombol **Buka WhatsApp** dengan pesan yang sudah terisi (atau email)

Buka `/admin` (user `admin`, password dari `ADMIN_PASSWORD`) untuk melihat daftarnya dan membalas tamu lewat WhatsApp/email dengan satu klik. Jika `ADMIN_PASSWORD` kosong, halaman admin nonaktif. Ada perlindungan spam sederhana (honeypot + batas 10 kiriman per 10 menit per IP).

## Online

Website ini di-deploy ke **Hostinger (paket Business, Node.js Web App)** langsung dari GitHub; setiap `git push` otomatis deploy ulang.
Langkah lengkap, pengaturan build, dan environment variables ada di **[DEPLOY.md](DEPLOY.md)**.

Bisa juga dijalankan di hosting Node.js lain (Railway, Render, VPS): start command `npm start`, isi environment variables sesuai `.env.example`.

---
Website & brand identity oleh **Team Dampier**.
