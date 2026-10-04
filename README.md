# Kalma Raja Ampat, Website

Website Kalma Homestay dengan **Node.js + Express**, dibangun dari brand identity di folder [`brand/`](brand/README.md).

- Halaman dirender di server dalam dua bahasa: `/` (Indonesia) dan `/en` (English)
- Form pemesanan disimpan ke **database MySQL** lalu diteruskan ke WhatsApp dengan pesan yang sudah terisi
- Halaman `/admin` (pakai password) untuk mengelola **customer & permintaan**: status, catatan, riwayat, ekspor CSV, hapus data
- **Survei tamu** di `/en/survey` dan `/survey`, direkap di `/admin/survey`
- **SEO**: `sitemap.xml` dengan hreflang, `robots.txt`, verifikasi Google Search Console
- Tetap berfungsi walau JavaScript di browser mati

## Menjalankan

Butuh **Node.js 20.12 atau lebih baru**.

```bash
npm install
cp .env.example .env     # lalu isi nomor WhatsApp, email, password admin
npm run dev              # mode pengembangan, auto-restart saat file berubah
# buka http://localhost:3000
```

Tanpa pengaturan database, data disimpan di file JSON `data/kalma-db.json` (cukup untuk mencoba di komputer).
Untuk memakai MySQL lokal (mis. dari XAMPP/Laragon), isi `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` di `.env`; tabel dibuat otomatis.

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server pengembangan (auto-restart) |
| `npm start` | Server produksi |
| `npm run migrate` | Jalankan migrasi database secara manual |
| `npm test` | Test otomatis; tambahkan `TEST_DATABASE_URL=mysql://…` untuk ikut menguji MySQL |

## Struktur

```
server.js              Titik masuk: memuat .env lalu menjalankan server
src/app.js             Rute Express: halaman, form pemesanan, admin, sitemap
src/config.js          Pengaturan dari .env + data kamar (harga)
src/inquiry.js         Validasi form & pesan WhatsApp
src/admin.js           Halaman admin: ringkasan, permintaan, customer, survei, ekspor CSV
src/survey.js          Daftar pertanyaan survei (EN & ID), validasi, rekap
src/db/                Penyimpanan: mysql.js (produksi), file.js (development), shared.js
migrations/            Struktur tabel database (dijalankan otomatis)
content/id.json        Semua teks Bahasa Indonesia
content/en.json        Semua teks English (key sama dengan id.json)
views/index.ejs        Template halaman utama
views/admin/           Template halaman admin
views/survey.ejs       Halaman survei tamu
views/404.ejs          Halaman tidak ditemukan
public/css, public/js  Tampilan dan interaksi di browser
public/img/            Taruh foto asli di sini
brand/                 Brand guidelines, logo, design tokens, deck klien
test/                  Test otomatis (node --test)
data/                  File JSON saat tanpa MySQL (tidak masuk git)
```

## Mengubah isi

| Yang diubah | File |
|---|---|
| Nomor WhatsApp, email, Instagram, password admin | `.env` |
| Harga kamar | `src/config.js` → `ROOMS` |
| Semua teks (judul, deskripsi kamar, FAQ, jadwal harian, menu) | `content/id.json` dan `content/en.json` |
| Tampilan | `public/css/style.css` (warna & font dari `brand/tokens.css`) |
| Pertanyaan survei | `src/survey.js` (teks EN & ID; ID pertanyaan jangan diubah setelah ada jawaban) |

Semua data homestay (harga, kapasitas, jam listrik, sinyal, pembayaran, pembatalan) saat ini **placeholder**. Ganti dengan data asli sebelum online.

## Mengganti foto dan video

Masuk ke admin lalu buka **Website → Foto & video**. Setiap tempat foto punya tombol **Unggah foto** (dan **Unggah video** untuk empat kotak hero). Pilih file atau tarik ke kotaknya, foto langsung tampil di website. Tidak perlu File Manager atau Git.

Tempat yang tersedia: empat kotak hero (foto dan video), tiga kartu layanan, enam foto pengalaman, dan foto keunggulan. Foto bawaan di `public/img/` tetap dipakai selama belum ada unggahan.

Video hero sebaiknya 5 sampai 10 detik, tanpa suara, dan sekecil mungkin agar website tetap cepat.

## Cerita tamu

Isi `"reviews"` di `content/id.json` dan `content/en.json` dengan ulasan asli (dengan izin tamunya):

```json
"reviews": [
  { "quote": "Tempat paling tenang yang pernah kami datangi.", "name": "Nama Tamu", "from": "Jakarta", "rating": 5 }
]
```

Selama masih kosong, bagian ini menampilkan ajakan untuk mengirim cerita lewat WhatsApp.

Lebar sekitar 1600 px, JPG/WebP, di bawah 300 KB.

## Data customer & admin

Setiap kali tamu mengirim form:
1. Data divalidasi lalu disimpan: **customer** (dicocokkan dari nomor HP/email, jadi tamu yang kembali tidak dobel) dan **permintaan** menginapnya
2. Tamu mendapat tombol **Buka WhatsApp** dengan pesan yang sudah terisi (atau email)

Buka `/admin` (user `admin`, password dari `ADMIN_PASSWORD`):
- **Ringkasan**: permintaan baru, terkonfirmasi, kedatangan terdekat
- **Permintaan**: cari, filter status, ubah status & catatan internal, balas lewat WhatsApp/email
- **Customer**: riwayat, edit data & catatan, hapus data atas permintaan customer (UU PDP)
- **Ekspor CSV** customer & permintaan

Keamanan: password admin (HTTP Basic), aksi admin hanya bisa dari situs sendiri (proteksi CSRF), ekspor CSV aman dari formula injection, honeypot + batas 10 kiriman per 10 menit per IP pada form.

## Online

Website ini di-deploy ke **Hostinger (paket Business, Node.js Web App)** langsung dari GitHub; setiap `git push` otomatis deploy ulang.
Langkah lengkap, pengaturan build, dan environment variables ada di **[DEPLOY.md](DEPLOY.md)**.

Bisa juga dijalankan di hosting Node.js lain dengan MySQL/MariaDB (Railway, Render, VPS): start command `npm start`, isi environment variables sesuai `.env.example`.

---
Website & brand identity oleh **Team Dampier**.
