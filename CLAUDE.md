# Kalma Raja Ampat · panduan kerja proyek

Website homestay Kalma (Node 22, Express, EJS, MySQL di Hostinger) dengan admin CMS di `/admin`.
Baca juga `.claude/skills/kalma-cms/SKILL.md` sebelum mengubah admin atau menambah fitur.

## Aturan tetap dari pemilik

1. **Setiap unggahan foto, video, atau dokumen wajib lewat tombol di admin.** Jangan pernah meminta pemilik
   menaruh file lewat File Manager hosting atau Git. Pakai partial `views/admin/_upload.ejs` dan `media.receive()`
   dari `src/media.js` (tersimpan di `UPLOAD_DIR`, di luar folder aplikasi, jadi tidak hilang saat deploy).
2. **Gaya tulisan tanpa jejak AI.** Di teks website, admin, dan konten:
   - jangan pakai em dash (—) atau en dash (–) di tengah kalimat; pakai titik, koma, atau kata ("sampai", "dan").
   - jangan pakai titik koma (;) dan jangan pakai titik dua (:) di tengah kalimat. Titik dua hanya untuk label
     seperti "Tips:" atau format jam.
   - untuk nilai kosong di tabel pakai "-".
3. **Branding Kalma tetap**: font Fraunces (judul) dan Plus Jakarta Sans (teks), warna dari `brand/tokens.css`
   (deep sea #224866, lagoon #4B8AA5, sand #EDE0B5, coral #E07A5F). Admin memakai layout `views/admin/_top.ejs`.
4. **Animasi website harus jalan di semua perangkat**, termasuk Windows dengan "Animation effects" mati dan
   Android dengan "Remove animations". Jangan mematikan animasi dekoratif (partner, gelembung komentar, logo sosial,
   kelomang, video hero, efek muncul) lewat `prefers-reduced-motion`. Pengaturan itu hanya dipakai untuk smooth scroll.
5. Buat setiap fitur semudah mungkin dipakai staf homestay yang bukan orang teknis.
6. **Bahasa bawaan website dan admin: Inggris.** Website Inggris di `/`, Indonesia di `/id`. Admin ditulis dalam bahasa
   Indonesia di template, lalu diterjemahkan otomatis ke Inggris lewat kamus `src/admin-i18n-en.js` (staf bisa memilih
   Indonesia di menu akun). Setiap menambah teks admin, tambahkan juga baris terjemahannya di kamus itu.

## Alur kerja

- Uji: `npm test` (MySQL: set `TEST_DATABASE_URL`). Tambah tes untuk setiap fitur baru.
- Commit ke branch kerja, buka PR draft, tunggu CI hijau, lalu merge (pemilik meminta semua otomatis).
- Migrasi database: file baru `migrations/NNN_nama.sql`, berjalan otomatis saat aplikasi start.
- Tabel CMS baru cukup didaftarkan di `src/db/tables.js` (berlaku untuk MySQL dan file JSON pengembangan).
