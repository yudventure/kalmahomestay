# Kalma Raja Ampat — Website

Website satu halaman untuk Kalma Homestay, dibangun dari brand identity di folder [`brand/`](brand/README.md).
HTML, CSS, dan JavaScript murni, tanpa build step dan tanpa framework.

```
index.html        Halaman utama (teks Bahasa Indonesia)
css/style.css     Tampilan; semua warna/font/jarak memakai brand/tokens.css
js/i18n.js        Teks English + pesan form
js/main.js        Ganti bahasa, menu mobile, animasi, form → WhatsApp
brand/            Brand guidelines, logo, design tokens, deck presentasi klien
```

## Menjalankan di komputer
```bash
python3 -m http.server 8000
# buka http://localhost:8000
```

## Online (gratis)
- **GitHub Pages:** Settings → Pages → Source: *Deploy from a branch* → pilih branch & folder `/ (root)`.
- **Netlify / Vercel:** import repo ini, tanpa build command, publish directory `/`.

## Wajib diganti sebelum online
Semua data di bawah adalah **placeholder**:

| Apa | Di mana |
|---|---|
| Nomor WhatsApp | `js/main.js` → `WHATSAPP_NUMBER` (format `62812…`) |
| Email | `js/main.js` → `EMAIL`, dan `mailto:` di `index.html` |
| Instagram | link `instagram.com/` di `index.html` (galeri & kontak) |
| Nama, harga, kapasitas kamar | bagian `#kamar` di `index.html` + `r1.*`–`r3.*` di `js/i18n.js` |
| Jam listrik, sinyal, pembayaran, pembatalan | bagian `#faq` + `q1`–`q6` di `js/i18n.js` |
| Jadwal harian, menu makanan, aktivitas | bagian `#sehari`, `#makan`, `#pengalaman` |

## Mengganti foto
Setiap kotak foto masih berupa gradasi warna. Simpan foto di folder `img/`, lalu tambahkan `--img`:

```html
<div class="photo ph-lagoon" style="--img:url(img/bungalow-laguna.jpg)" …></div>
```

Ukuran yang disarankan: lebar 1600 px, format JPG/WebP, < 300 KB. Ikuti arah fotografi di brand guidelines (cahaya alami, tenang, ada manusia).

## Bahasa
Teks Indonesia ada langsung di `index.html`. Teks English ada di `js/i18n.js` dengan key yang sama (`data-i18n="…"`).
Bahasa awal mengikuti bahasa browser pengunjung, lalu diingat setelah dipilih.

---
Website & brand identity oleh **Team Dampier**.
