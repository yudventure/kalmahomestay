# Deploy ke Hostinger (paket Business) dari GitHub

Hostinger paket Business mendukung **Node.js Web App** yang diambil langsung dari repository GitHub,
dan sudah termasuk **database MySQL** untuk menyimpan data customer.
Setelah terhubung, setiap `git push` ke branch `main` otomatis membuat Hostinger build & deploy ulang.

## 1. Buat database MySQL

1. hPanel → **Databases** → **MySQL Databases**.
2. Buat database baru, misalnya nama `kalma` dan user `kalma`, dengan password yang kuat.
   Hostinger menambahkan awalan akun, jadi hasilnya mirip `u123456789_kalma`.
3. Catat **nama database**, **user**, **password**, dan **host** (biasanya `localhost`; lihat di halaman yang sama).

Tabel dibuat otomatis oleh aplikasi saat pertama kali jalan (migrasi di folder `migrations/`), jadi tidak perlu import SQL manual.

## 2. Hubungkan repository

1. hPanel → **Websites** → **Add website** → pilih **Node.js Web App**.
2. Pilih **Import Git repository** → **Connect with GitHub**.
3. Di jendela GitHub, install **Hostinger GitHub App** dan beri akses ke repository `yudventure/kalmahomestay`.
4. Pilih repository tersebut dan branch **`main`**.

## 3. Pengaturan build

| Field | Isi |
|---|---|
| Framework preset | Express |
| Branch | `main` |
| Node version | **22** |
| Build command | *(kosongkan)* atau `npm install` |
| Entry file | `server.js` |
| Output directory | *(kosongkan)* |

## 4. Environment variables

Isi di bagian **Environment variables** (jangan upload file `.env` ke GitHub).

| Nama | Contoh | Keterangan |
|---|---|---|
| `SITE_URL` | `https://kalma-rajaampat.com` | Domain website |
| `WHATSAPP_NUMBER` | `6281234567890` | Nomor tujuan pemesanan, tanpa `+` |
| `WHATSAPP_DISPLAY` | `+62 812-3456-7890` | Opsional |
| `CONTACT_EMAIL` | `hello@kalma-rajaampat.com` | |
| `INSTAGRAM_HANDLE` | `kalma.rajaampat` | Opsional |
| `ADMIN_PASSWORD` | password kuat | Untuk login `/admin` (user `admin`) |
| `DB_HOST` | `localhost` | Dari langkah 1 |
| `DB_PORT` | `3306` | |
| `DB_NAME` | `u123456789_kalma` | Dari langkah 1 |
| `DB_USER` | `u123456789_kalma` | Dari langkah 1 |
| `DB_PASSWORD` | ••••••• | Dari langkah 1 |
| `DB_SOCKET` | `/var/lib/mysql/mysql.sock` | Opsional, hanya jika koneksi lewat host gagal |
| `NODE_ENV` | `production` | Aktifkan cache file statis |
| `GOOGLE_SITE_VERIFICATION` | `AbC123…` | Kode verifikasi Search Console (langkah 8) |

`PORT` **tidak perlu** diisi; Hostinger mengaturnya sendiri.

## 5. Deploy & cek

1. Klik **Deploy** dan tunggu build selesai. Di log aplikasi akan muncul `Applied migration 001_init.sql` dan `Storage: MySQL database`.
2. Buka domain sementara dari Hostinger, lalu cek:
   - `/healthz` menampilkan `{"ok":true,"storage":"mysql","db":"ok"}`
     (kalau `"storage":"file"`, berarti variabel `DB_*` belum terbaca)
   - `/` dan `/en` tampil normal
   - kirim form pemesanan percobaan → muncul tombol **Buka WhatsApp**
   - `/admin` → permintaan percobaan muncul; hapus lagi lewat halaman customer
3. Hubungkan domain asli dari hPanel, aktifkan SSL, lalu sesuaikan `SITE_URL`.

## 6. Mengelola data customer

Semua ada di `/admin`:

- **Ringkasan**: jumlah permintaan baru, yang sudah dihubungi, terkonfirmasi, dan kedatangan terdekat
- **Permintaan**: cari & filter per status, ubah status (Baru → Sudah dihubungi → Terkonfirmasi → Selesai/Batal), catatan internal, tombol balas WhatsApp/email
- **Customer**: satu orang = satu data (dicocokkan dari nomor HP/email), riwayat semua permintaannya, edit data & catatan, hapus data
- **Ekspor CSV** untuk Excel/Google Sheets

Data juga bisa dilihat langsung lewat **phpMyAdmin** di hPanel (Databases → phpMyAdmin), tabel `customers` dan `inquiries`.

### Backup

Hostinger membuat backup otomatis, tapi sebaiknya unduh juga secara berkala:
- hPanel → **Databases → phpMyAdmin** → pilih database → **Export**, atau
- `/admin` → **Ekspor data** → CSV

### Privasi (UU PDP)

Data customer adalah data pribadi. Form website menampilkan pemberitahuan penggunaan data, dan admin bisa menghapus semua data seorang customer jika ia memintanya (tombol **Hapus customer** di halaman customer). Jangan bagikan password admin atau database, dan jangan simpan ekspor CSV di tempat umum.

## 7. Survei tamu

Bagikan link survei ke tamu, grup Facebook, komunitas diving, atau Instagram:

- English: `https://domainmu.com/en/survey`
- Indonesia: `https://domainmu.com/survey`

Jawaban tersimpan di tabel `survey_responses` dan direkap otomatis di **`/admin/survey`**: grafik persentase untuk pilihan ganda, daftar jawaban terbuka, detail per responden, dan ekspor CSV. Halaman survei diberi `noindex` sehingga tidak muncul di Google; cukup dibagikan lewat link.

## 8. Google Search Console

1. Buka [search.google.com/search-console](https://search.google.com/search-console) → **Add property**.
2. Pilih **Domain** (verifikasi lewat DNS di hPanel → Domains → DNS / Nameservers → tambah record TXT dari Google),
   **atau** pilih **URL prefix** `https://domainmu.com` → metode **HTML tag**:
   salin isi `content="…"` dari tag yang diberikan Google ke environment variable `GOOGLE_SITE_VERIFICATION`, deploy ulang, lalu klik **Verify**.
3. Menu **Sitemaps** → masukkan `sitemap.xml` → **Submit**.
4. Menu **URL Inspection** → masukkan `https://domainmu.com/` dan `https://domainmu.com/en` → **Request indexing**.

Yang sudah disiapkan website:
- `/sitemap.xml`: halaman Indonesia & English, lengkap dengan tautan `hreflang` antar bahasa dan tanggal update terakhir
- `/robots.txt`: menunjuk ke sitemap dan memblokir `/admin`
- Tag `canonical`, `hreflang`, Open Graph, dan data terstruktur `LodgingBusiness` di setiap halaman
- `SITE_URL` **wajib** berisi domain asli dengan `https://` agar semua URL di atas benar

## 9. Alur kerja sehari-hari

```bash
git checkout main && git pull
# ubah teks / harga / tampilan
git commit -am "Update harga kamar"
git push
```

GitHub Actions menjalankan semua test (termasuk test database dengan MariaDB) di setiap push dan pull request; lihat tab **Actions**.
Hostinger otomatis deploy ulang dari `main`. Perubahan struktur database ditambahkan sebagai file baru di `migrations/` (mis. `002_….sql`) dan dijalankan otomatis saat deploy.

## Kalau ada masalah

- **Build gagal**: pastikan Node version 22 dan entry file `server.js`.
- **Build sukses tapi situs error / `Failed to start`**: cek log aplikasi. Biasanya `DB_*` salah (`Access denied` = user/password, `ECONNREFUSED`/`ENOTFOUND` = host).
- **Halaman 503 setelah deploy**: buka **Log build** dan log aplikasi di hPanel; pastikan entry file `server.js` dan Node 20.12+ / 22.
- **`/healthz` menampilkan `"db":"error"`**: website tetap jalan, tapi data belum tersimpan ke database. Lihat isi `hint`:
  - `DB_USER atau DB_PASSWORD salah` → cek user & password di hPanel → MySQL Databases
  - `DB_NAME tidak ditemukan` / `DB_NAME salah…` → pakai nama lengkap dengan awalan, mis. `u865185815_kalma`
  - `Database tidak bisa dihubungi (EINVAL/ECONNREFUSED/…)` → aplikasi sudah otomatis mencoba IPv4 (`127.0.0.1`) dan socket MySQL lokal. Kalau masih gagal, isi `DB_HOST=127.0.0.1`, atau `DB_SOCKET` dengan lokasi socket MySQL (mis. `/var/lib/mysql/mysql.sock`; tanyakan ke support Hostinger bila perlu)

  Setelah environment variable diperbaiki, deploy ulang. Aplikasi juga mencoba menghubungi database lagi secara otomatis setiap beberapa menit.
- **Tamu tetap bisa memesan** walaupun database sedang bermasalah: mereka tetap mendapat link WhatsApp, hanya pencatatan di admin yang terlewat (tercatat di log).
