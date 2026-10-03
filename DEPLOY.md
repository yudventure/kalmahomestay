# Deploy ke Hostinger (paket Business) dari GitHub

Hostinger paket Business mendukung **Node.js Web App** yang diambil langsung dari repository GitHub.
Setelah terhubung, setiap `git push` ke branch yang dipilih otomatis membuat Hostinger build & deploy ulang.

## 1. Hubungkan repository

1. Login **hPanel** → **Websites** → **Add website** → pilih **Node.js Web App**.
2. Pilih **Import Git repository** → **Connect with GitHub**.
3. Di jendela GitHub, install **Hostinger GitHub App** dan beri akses ke repository `yudventure/kalmahomestay`.
4. Pilih repository tersebut, lalu pilih **branch** yang akan di-deploy (lihat catatan branch di bawah).

## 2. Pengaturan build

Hostinger biasanya mendeteksi Express otomatis. Pastikan isinya seperti ini:

| Field | Isi |
|---|---|
| Framework preset | Express |
| Branch | `main` (atau branch yang kamu pakai) |
| Node version | **22** |
| Build command | *(kosongkan)* atau `npm install` |
| Entry file | `server.js` |
| Output directory | *(kosongkan, tidak dipakai Express)* |

## 3. Environment variables

Isi di bagian **Environment variables** saat deploy (bisa diubah lagi nanti dari pengaturan aplikasi).
Jangan upload file `.env` ke GitHub.

| Nama | Contoh | Wajib |
|---|---|---|
| `SITE_URL` | `https://kalma-rajaampat.com` | Ya, dipakai untuk link canonical, sitemap & preview media sosial |
| `WHATSAPP_NUMBER` | `6281234567890` | Ya, nomor tujuan pemesanan, tanpa `+` |
| `WHATSAPP_DISPLAY` | `+62 812-3456-7890` | Opsional |
| `CONTACT_EMAIL` | `hello@kalma-rajaampat.com` | Ya |
| `INSTAGRAM_HANDLE` | `kalma.rajaampat` | Opsional |
| `ADMIN_PASSWORD` | password yang kuat | Ya, untuk membuka `/admin` |
| `NODE_ENV` | `production` | Disarankan (aktifkan cache file statis) |
| `DATA_DIR` | lihat langkah 5 | Disarankan |

`PORT` **tidak perlu** diisi; Hostinger mengaturnya sendiri dan aplikasi sudah membaca `process.env.PORT`.

## 4. Deploy & cek

1. Klik **Deploy** dan tunggu build selesai.
2. Buka domain sementara dari Hostinger, cek:
   - `/` dan `/en` tampil normal
   - `/healthz` menampilkan `{"ok":true}`
   - kirim form pemesanan percobaan → muncul tombol **Buka WhatsApp**
   - `/admin` (user `admin`, password dari `ADMIN_PASSWORD`) menampilkan pertanyaan percobaan tadi
3. Hubungkan domain asli (mis. `kalma-rajaampat.com`) dari hPanel, aktifkan SSL, lalu ubah `SITE_URL` sesuai domain tersebut.

## 5. Penyimpanan data pertanyaan tamu

Pertanyaan pemesanan disimpan di file `inquiries.jsonl` di folder `DATA_DIR` (default: folder `data/` di dalam aplikasi).
Folder aplikasi bisa diganti saat deploy ulang, jadi **simpan data di luar folder aplikasi**:

1. Di hPanel buka **File Manager**, buat folder misalnya `kalma-data` di home directory (di luar folder aplikasi).
2. Salin path lengkapnya (contoh: `/home/u123456789/kalma-data`) dan isi ke `DATA_DIR`.
3. Setelah deploy ulang, buka `/admin` dan pastikan pertanyaan lama masih ada.

Kalau penyimpanan gagal (misalnya folder tidak bisa ditulis), tamu **tetap** mendapat link WhatsApp; hanya pencatatan di `/admin` yang terlewat. Pesan error-nya muncul di log aplikasi Hostinger.

## 6. Alur kerja sehari-hari

```bash
# ubah teks / harga / tampilan
git add -A
git commit -m "Update harga kamar"
git push
```

GitHub Actions menjalankan `npm test` di setiap push (tab **Actions** di GitHub). Hostinger otomatis deploy ulang dari branch yang terhubung.
Kalau test merah, perbaiki dulu sebelum push ke branch produksi.

## Catatan branch

Saat ini kode ada di branch `claude/serene-hypatia-xsgc9w`. Hostinger bisa langsung memakai branch ini, tapi lebih rapi jika
memakai `main` sebagai branch produksi: buat branch `main` dari branch ini di GitHub, jadikan *default branch*
(Settings → Branches), lalu pilih `main` di Hostinger.

## Kalau build/deploy gagal

- **Build gagal**: pastikan Node version 22 dan entry file `server.js`.
- **Build sukses tapi situs error**: biasanya environment variable belum diisi; cek log aplikasi di hPanel.
- **Foto/CSS tidak muncul**: pastikan folder `public/` dan `brand/assets/` ikut ter-push ke GitHub.
