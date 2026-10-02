# Kalma Raja Ampat: Brand Identity

Panduan identitas brand untuk website dan semua materi Kalma Homestay.

**Buka `brand-guidelines.html` di browser** untuk panduan visual lengkap.

## Isi
| File | Fungsi |
|---|---|
| `brand-guidelines.html` | Dokumen brand guideline (esensi, logo, warna, tipografi, elemen grafis, fotografi, tone of voice, komponen web, aplikasi) |
| `Kalma-Brand-Guidelines-ID.pdf` · `-EN.pdf` · `-ES.pdf` | Deck presentasi klien (16:9, 26 halaman) dalam Bahasa Indonesia, English, Español |
| `deck/` | Sumber deck: `content.py` (teks 3 bahasa), `build_deck.py` (template), `render.js` (ekspor PDF) |
| `tokens.css` | Design tokens (CSS variables) untuk dipakai langsung di website |
| `assets/` | Logo (utama, putih, monokrom, wordmark, monogram), ikon sosmed, favicon |

## Ringkasan cepat
**Warna**
| Nama | HEX | Peran |
|---|---|---|
| Pasir Kalma | `#EDE0B5` | Latar utama (±60%) |
| Laut Dalam | `#224866` | Judul, tombol utama, section gelap |
| Laguna | `#4B8AA5` | Grafis, ikon, gelombang |
| Laguna Dalam | `#2B6680` | Link & teks biru (lolos WCAG AA) |
| Kerang | `#FAF6EA` | Permukaan kartu |
| Tinta Malam | `#1B2B38` | Teks body |
| Karang | `#E07A5F` | CTA pemesanan (aksen ≤5%) |
| Hutan | `#3F6B4E` | Label eco / sukses |

**Tipografi** (Google Fonts)
- Judul: **Fraunces** (sumbu `SOFT` 100), weight 300–500
- Teks & UI: **Plus Jakarta Sans**, weight 400–700
- Label kapital: Plus Jakarta Sans 600, `letter-spacing: 0.3em`

## Membuat ulang PDF
```bash
cd brand/deck && python3 build_deck.py && node render.js
```
Ubah teks di `content.py`; tampilan di `build_deck.py`.

## Catatan
- Logo saat ini berupa PNG hasil ekstraksi dari file asli. Untuk cetak besar, minta versi vektor (SVG/AI/PDF) ke desainer logo.
- Harga, jumlah kamar, rating, dan detail fasilitas pada contoh di guideline adalah placeholder.
- Dokumen disusun oleh Team Dampier (watermark & kredit di setiap halaman deck).
