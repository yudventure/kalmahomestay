#!/usr/bin/env python3
"""Build the Kalma brand-guidelines presentation deck (16:9) in ID / EN.

Output: brand/deck/kalma-deck-<lang>.html  ->  render to PDF with render.js
Usage:  python3 build_deck.py && node render.js
"""
import os
from urllib.parse import quote

from content import TEXT  # per-language copy

HERE = os.path.dirname(os.path.abspath(__file__))
A = "../assets/"

# ---------------------------------------------------------------- palette data
CORE = [
    ("sand", "#EDE0B5", "237 224 181", "5 8 32 0", "#224866"),
    ("lagoon", "#4B8AA5", "75 138 165", "72 30 20 2", "#FFFFFF"),
    ("deep", "#224866", "34 72 102", "92 68 38 25", "#EDE0B5"),
]
SUPPORT = [
    ("shell", "#FAF6EA", "1 2 8 0", "#224866"),
    ("drift", "#C9B98A", "20 22 50 0", "#1B2B38"),
    ("lagoondeep", "#2B6680", "85 50 30 10", "#FFFFFF"),
    ("ink", "#1B2B38", "85 68 50 55", "#EDE0B5"),
    ("coral", "#E07A5F", "5 62 65 0", "#1B2B38"),
    ("coraldeep", "#A84A33", "20 78 88 12", "#FFFFFF"),
    ("jungle", "#3F6B4E", "75 38 75 25", "#FFFFFF"),
]
TINT_BASES = [("sand", "#EDE0B5"), ("lagoon", "#4B8AA5"), ("deep", "#224866"),
              ("coral", "#E07A5F"), ("jungle", "#3F6B4E")]

# Alternative palette directions: (key, bg, text, colors[(hex, role)], logo variant, button bg, button text)
PALETTES = [
    ("A", "#EDE0B5", "#224866", ["#EDE0B5", "#FAF6EA", "#4B8AA5", "#224866", "#E07A5F"], "kalma-logo-primary.png", "#E07A5F", "#1B2B38"),
    ("B", "#F3E6C4", "#224866", ["#F3E6C4", "#E9B44C", "#D9824B", "#7A4E5C", "#224866"], "kalma-logo-primary.png", "#D9824B", "#1B2B38"),
    ("C", "#EDE0B5", "#2E4F3A", ["#EDE0B5", "#8FA169", "#3F6B4E", "#224866", "#E07A5F"], "kalma-logo-primary.png", "#3F6B4E", "#FFFFFF"),
    ("D", "#F6EFD8", "#164B5E", ["#F6EFD8", "#BFE3DC", "#1F8A8A", "#224866", "#F2C14E"], "kalma-logo-primary.png", "#1F8A8A", "#FFFFFF"),
    ("E", "#1B2B38", "#EDE0B5", ["#1B2B38", "#224866", "#A9C4D3", "#EDE0B5", "#C9B98A"], "kalma-logo-white.png", "#EDE0B5", "#1B2B38"),
    ("F", "#FFFFFF", "#224866", ["#FFFFFF", "#F4EFE3", "#B9A57A", "#4B8AA5", "#224866"], "kalma-logo-primary.png", "#224866", "#FFFFFF"),
]


def mix(hex_, other, t):
    a = [int(hex_[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(other[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02X}" for x, y in zip(a, b))


def lum(hex_):
    c = [int(hex_[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def on(hex_):
    return "#1B2B38" if lum(hex_) > 0.28 else "#FFFFFF"


def tints(hex_):
    steps = [("50", "#FFFFFF", .88), ("100", "#FFFFFF", .72), ("200", "#FFFFFF", .5),
             ("300", "#FFFFFF", .25), ("500", None, 0), ("700", "#000000", .25), ("900", "#000000", .5)]
    return [(n, mix(hex_, o, t) if o else hex_) for n, o, t in steps]


# ---------------------------------------------------------------- watermark
def wm_uri(color, opacity):
    svg = (f"<svg xmlns='http://www.w3.org/2000/svg' width='560' height='320'>"
           f"<text x='40' y='190' transform='rotate(-22 280 160)' font-family='Helvetica, Arial, sans-serif' "
           f"font-size='26' font-weight='700' letter-spacing='9' fill='{color}' fill-opacity='{opacity}'>TEAM DAMPIER</text></svg>")
    return "url(\"data:image/svg+xml," + quote(svg) + "\")"


DAMPIER_MARK = (
    '<svg class="dmark" viewBox="0 0 32 32" aria-hidden="true">'
    '<circle cx="16" cy="16" r="14.5" fill="none" stroke="currentColor" stroke-width="2"/>'
    '<path d="M6 18c3-3 5-3 7 0s4 3 6 0 4-3 7 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    '<path d="M11 11h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
)

CSS = r"""
@page { size: 1600px 900px; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: var(--font-body); color: var(--kalma-ink); -webkit-font-smoothing: antialiased; background: #ccc; }
img { display: block; max-width: 100%; }
.slide {
  width: 1600px; height: 900px; position: relative; overflow: hidden; break-after: page; page-break-after: always;
  background: var(--kalma-sand); padding: 84px 104px 110px; display: flex; flex-direction: column;
}
.slide:last-child { break-after: auto; page-break-after: auto; }
.slide.shell { background: var(--kalma-shell); }
.slide.dark { background: var(--kalma-deep-sea); color: var(--kalma-shell); }
.slide.ink { background: var(--kalma-ink); color: var(--kalma-shell); }
.wm { position: absolute; inset: 0; pointer-events: none; z-index: 5; background-image: WM_LIGHT; background-size: 560px 320px; }
.dark .wm, .ink .wm { background-image: WM_DARK; }
.foot {
  position: absolute; left: 104px; right: 104px; bottom: 40px; display: flex; justify-content: space-between; align-items: center;
  font-size: 13px; color: #5B6B76; z-index: 6; letter-spacing: .02em;
}
.dark .foot, .ink .foot { color: #A9C4D3; }
.foot .l { display: flex; align-items: center; gap: 14px; }
.foot .l img { height: 22px; width: auto; }
.foot .r { display: flex; align-items: center; gap: 10px; }
.foot .r b { letter-spacing: .22em; font-weight: 700; color: var(--kalma-deep-sea); font-size: 12px; }
.dark .foot .r b, .ink .foot .r b { color: var(--kalma-sand); }
.foot .pg { min-width: 54px; text-align: right; font-variant-numeric: tabular-nums; }
.dmark { width: 20px; height: 20px; color: var(--kalma-deep-sea); }
.dark .dmark, .ink .dmark { color: var(--kalma-sand); }

.kick { font-size: 14px; font-weight: 600; letter-spacing: .3em; text-transform: uppercase; color: var(--kalma-lagoon-deep); margin: 0 0 14px; }
.dark .kick, .ink .kick { color: var(--kalma-sand); }
h1, h2, h3 { font-family: var(--font-display); font-variation-settings: "SOFT" 100; font-weight: 500; color: var(--kalma-deep-sea); margin: 0; letter-spacing: -.01em; }
.dark h1, .dark h2, .dark h3, .ink h1, .ink h2, .ink h3 { color: var(--kalma-shell); }
h2 { font-size: 54px; line-height: 1.05; margin-bottom: 14px; }
h3 { font-size: 26px; line-height: 1.2; margin-bottom: 8px; }
p { margin: 0 0 12px; font-size: 18px; line-height: 1.6; }
.lead { font-size: 21px; line-height: 1.55; color: #3E4E5A; max-width: 1100px; }
.dark .lead, .ink .lead { color: #C7D6E0; }
.muted { color: #5B6B76; }
.dark .muted, .ink .muted { color: #A9C4D3; }
.sm { font-size: 15px; line-height: 1.55; }
.xs { font-size: 13px; line-height: 1.5; }
.head { margin-bottom: 36px; }
.body { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; }
.row { display: grid; gap: 28px; }
.c2 { grid-template-columns: 1fr 1fr; } .c3 { grid-template-columns: repeat(3, 1fr); }
.c4 { grid-template-columns: repeat(4, 1fr); } .c5 { grid-template-columns: repeat(5, 1fr); } .c6 { grid-template-columns: repeat(6, 1fr); }
.c7 { grid-template-columns: repeat(7, 1fr); }
.card { background: var(--kalma-shell); border: 1px solid var(--kalma-driftwood); border-radius: 20px; padding: 28px; }
.shell .card { background: #fff; }
.dark .card { background: rgba(255,255,255,.06); border-color: rgba(237,224,181,.22); }
ul.l { margin: 0; padding-left: 1.1em; } ul.l li { font-size: 16px; line-height: 1.55; margin-bottom: 7px; }
.yes { color: var(--kalma-jungle); font-weight: 700; } .no { color: #B03A2E; font-weight: 700; }
.mono { font-family: ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace; }

/* cover */
.cover { padding: 0; background: var(--kalma-sand); }
.cover .in { position: relative; z-index: 2; height: 100%; display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: 96px; }
.cover .in > img { width: 500px; }
.cover .in .kick { margin-top: 48px; }
.cover h1 { font-size: 60px; line-height: 1.08; max-width: 760px; }
.cover .meta { margin-top: 44px; display: flex; gap: 64px; justify-content: center; }
.cover .meta small { display: block; font-size: 12px; letter-spacing: .25em; text-transform: uppercase; color: var(--kalma-lagoon-deep); font-weight: 600; margin-bottom: 4px; }
.cover .meta b { font-size: 19px; color: var(--kalma-deep-sea); font-weight: 600; }
.cover .wave { position: absolute; left: 0; right: 0; bottom: 0; height: 110px; z-index: 1; }
.cover .foot .l, .cover .foot { color: #E6EEF2; }
.cover .foot .r b { color: var(--kalma-sand); } .cover .dmark { color: var(--kalma-sand); }

/* contents */
.toc { display: grid; grid-template-columns: 1fr 1fr; gap: 0 72px; }
.toc div { display: grid; grid-template-columns: 64px 1fr auto; align-items: baseline; padding: 18px 0; border-bottom: 1px solid var(--kalma-driftwood); }
.toc .n { font-family: var(--font-display); color: var(--kalma-lagoon); font-size: 22px; }
.toc .t { font-family: var(--font-display); font-size: 30px; color: var(--kalma-deep-sea); }
.toc .p { font-size: 15px; color: #5B6B76; font-variant-numeric: tabular-nums; }

.quote { font-family: var(--font-display); font-variation-settings: "SOFT" 100; font-style: italic; font-size: 46px; line-height: 1.15; color: var(--kalma-deep-sea); margin: 0; }
.pills { display: flex; flex-wrap: wrap; gap: 10px; }
.pills span { background: var(--kalma-sand); color: var(--kalma-deep-sea); border-radius: 999px; padding: 8px 18px; font-weight: 600; font-size: 16px; }
.big-tag { font-family: var(--font-display); font-size: 40px; color: var(--kalma-deep-sea); line-height: 1.15; }

/* logo stages */
.stage { border-radius: 18px; display: grid; place-items: center; border: 1px solid var(--kalma-driftwood); position: relative; overflow: hidden; }
.stage img { max-height: 70%; max-width: 78%; width: auto; }
.st-sand { background: var(--kalma-sand); } .st-shell { background: var(--kalma-shell); } .st-white { background: #fff; }
.st-deep { background: var(--kalma-deep-sea); border-color: transparent; } .st-lagoon { background: var(--kalma-lagoon); border-color: transparent; }
.st-photo { border-color: transparent; background: linear-gradient(180deg, rgba(27,43,56,.15), rgba(27,43,56,.5)), radial-gradient(120% 80% at 70% 10%, #9FD3DA 0%, transparent 60%), linear-gradient(170deg, #7EC4CF 0%, #3E8FA6 40%, #1F5873 75%, #163B52 100%); }
.cap { margin-top: 12px; font-size: 14px; line-height: 1.45; color: #5B6B76; }
.cap b { display: block; color: var(--kalma-deep-sea); font-size: 16px; }
.dark .cap b { color: var(--kalma-shell); }
.tag { position: absolute; font-size: 12px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; background: var(--kalma-ink); color: var(--kalma-shell); padding: 6px 14px; border-radius: 999px; }
.misuse .stage::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top right, transparent calc(50% - 2px), rgba(176,58,46,.85) 50%, transparent calc(50% + 2px)); }
.clear { position: relative; padding: 56px; outline: 2px dashed var(--kalma-coral-deep); background: repeating-linear-gradient(45deg, rgba(224,122,95,.13) 0 7px, transparent 7px 14px); width: 520px; }
.clear .inner { background: var(--kalma-sand); }
.clear .x { position: absolute; font-family: var(--font-display); font-style: italic; color: var(--kalma-coral-deep); font-size: 22px; }

/* colors */
.sw { border-radius: 18px; overflow: hidden; border: 1px solid var(--kalma-driftwood); background: #fff; display: flex; flex-direction: column; }
.sw .chip { padding: 20px; display: flex; align-items: flex-end; font-family: var(--font-display); font-size: 26px; }
.sw dl { margin: 0; padding: 14px 20px 6px; display: grid; grid-template-columns: auto 1fr; gap: 3px 14px; font-size: 14px; }
.sw dt { color: #5B6B76; } .sw dd { margin: 0; }
.sw .use { padding: 0 20px 18px; font-size: 14px; color: #5B6B76; margin: 0; line-height: 1.45; }
.ratio { display: flex; height: 92px; border-radius: 16px; overflow: hidden; border: 1px solid var(--kalma-driftwood); }
.ratio div { display: flex; align-items: flex-end; padding: 10px 12px; font-size: 13px; font-weight: 700; }
.pair { border-radius: 14px; padding: 18px 20px; border: 1px solid var(--kalma-driftwood); }
.pair b { font-family: var(--font-display); font-size: 24px; font-weight: 500; display: block; }
.pair span { font-size: 13px; font-weight: 600; }
.tint-row { display: grid; grid-template-columns: 150px repeat(7, 1fr); gap: 8px; align-items: stretch; margin-bottom: 10px; }
.tint-row .nm { display: flex; flex-direction: column; justify-content: center; font-family: var(--font-display); font-size: 21px; color: var(--kalma-deep-sea); }
.tint-row .nm small { font-family: var(--font-body); font-size: 12px; color: #5B6B76; }
.tint { border-radius: 10px; height: 82px; padding: 8px 10px; display: flex; flex-direction: column; justify-content: space-between; font-size: 12px; }
.tint b { font-weight: 700; } .tint.base { outline: 3px solid var(--kalma-deep-sea); outline-offset: 2px; }

.pal { border-radius: 20px; overflow: hidden; border: 1px solid var(--kalma-driftwood); background: #fff; display: flex; flex-direction: column; }
.pal .strip { display: flex; height: 112px; }
.pal .strip div { flex: 1; display: flex; align-items: flex-end; padding: 8px; font-size: 11px; font-weight: 700; }
.pal .info { padding: 18px 20px 6px; }
.pal .info h3 { font-size: 24px; margin-bottom: 4px; display: flex; gap: 10px; align-items: baseline; }
.pal .info h3 i { font-style: normal; font-family: var(--font-body); font-size: 12px; font-weight: 700; letter-spacing: .14em; color: #fff; background: var(--kalma-coral-deep); padding: 4px 10px; border-radius: 999px; }
.pal .info p { font-size: 14px; line-height: 1.5; color: #5B6B76; margin: 0 0 6px; }
.pal .prev { margin: 10px 20px 20px; border-radius: 14px; padding: 18px 20px; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 14px; }
.pal .prev img { height: 46px; width: auto; }
.pal .prev .t { font-family: var(--font-display); font-size: 19px; line-height: 1.2; grid-column: 1 / -1; }
.pal .prev .btn { font-size: 12px; font-weight: 700; padding: 8px 14px; border-radius: 999px; justify-self: start; }
.pal .prev .dots { display: flex; gap: 6px; justify-self: end; } .pal .prev .dots i { width: 14px; height: 14px; border-radius: 50%; display: block; }

/* type */
.spec { font-size: 150px; line-height: 1; color: var(--kalma-deep-sea); margin-bottom: 12px; }
.spec.d { font-family: var(--font-display); font-variation-settings: "SOFT" 100; font-weight: 500; }
.spec.b { font-family: var(--font-body); font-weight: 600; }
.glyph { font-size: 19px; color: var(--kalma-lagoon-deep); line-height: 1.5; margin-bottom: 14px; }
.sr { display: grid; grid-template-columns: 240px 1fr; gap: 24px; align-items: baseline; padding: 13px 0; border-bottom: 1px solid #E6DCBC; }
.sr:last-child { border-bottom: 0; }
.sr .m { font-size: 13px; color: #5B6B76; line-height: 1.4; } .sr .m b { display: block; color: var(--kalma-deep-sea); font-size: 15px; }

/* graphic */
.pat { border-radius: 18px; height: 190px; border: 1px solid var(--kalma-driftwood); background-color: var(--kalma-sand);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40' viewBox='0 0 120 40'%3E%3Cpath d='M0 20 Q 30 4 60 20 T 120 20' fill='none' stroke='%234B8AA5' stroke-opacity='.35' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E"); }
.pat.dk { background-color: var(--kalma-deep-sea); border-color: transparent;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='40' viewBox='0 0 120 40'%3E%3Cpath d='M0 20 Q 30 4 60 20 T 120 20' fill='none' stroke='%23EDE0B5' stroke-opacity='.18' stroke-width='3' stroke-linecap='round'/%3E%3C/svg%3E"); }
.icons { display: flex; gap: 18px; flex-wrap: wrap; }
.icons figure { margin: 0; width: 92px; text-align: center; font-size: 13px; color: #5B6B76; }
.icons .ic { width: 72px; height: 72px; margin: 0 auto 8px; border-radius: 22px; background: var(--kalma-sand); display: grid; place-items: center; }
.icons svg { width: 34px; height: 34px; stroke: var(--kalma-deep-sea); stroke-width: 1.75; fill: none; stroke-linecap: round; stroke-linejoin: round; }

/* photo */
.ph { border-radius: 18px; position: relative; overflow: hidden; display: flex; align-items: flex-end; padding: 16px; color: #fff; font-weight: 600; font-size: 14px; }
.ph span { background: rgba(27,43,56,.55); padding: 5px 12px; border-radius: 999px; }
.ph-1 { background: radial-gradient(90% 60% at 50% 0%, #F6D9A8 0%, transparent 60%), linear-gradient(180deg, #F2B58A 0%, #6FB3C3 45%, #2E7A92 70%, #1A4A63 100%); }
.ph-2 { background: radial-gradient(60% 40% at 30% 70%, #3E6B4D 0%, transparent 70%), radial-gradient(50% 50% at 75% 60%, #2F5A40 0%, transparent 70%), linear-gradient(180deg, #A9D8E4 0%, #79C1CC 40%, #3E9BAE 70%, #1F6A82 100%); }
.ph-3 { background: radial-gradient(70% 50% at 50% 50%, #E9D8A9 0%, transparent 70%), linear-gradient(160deg, #B98C5A 0%, #8A6440 50%, #5A4029 100%); }
.ph-4 { background: radial-gradient(40% 30% at 60% 40%, #E07A5F 0%, transparent 70%), radial-gradient(35% 25% at 30% 60%, #F2C14E 0%, transparent 70%), linear-gradient(180deg, #2C8AA0 0%, #1C6880 50%, #12425A 100%); }

/* voice table */
table.v { width: 100%; border-collapse: collapse; background: var(--kalma-shell); color: var(--kalma-ink); border-radius: 16px; overflow: hidden; }
table.v th, table.v td { text-align: left; padding: 13px 18px; font-size: 15px; line-height: 1.4; border-bottom: 1px solid #E6DCBC; vertical-align: top; }
table.v th { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #5B6B76; }
table.v tr:last-child td { border-bottom: 0; }

/* ui */
.btn { display: inline-flex; align-items: center; font: 600 16px/1 var(--font-body); padding: 15px 28px; border-radius: 999px; }
.b-cta { background: var(--kalma-coral); color: var(--kalma-ink); } .b-pri { background: var(--kalma-deep-sea); color: var(--kalma-shell); }
.b-gh { box-shadow: inset 0 0 0 1.5px var(--kalma-deep-sea); color: var(--kalma-deep-sea); } .b-sand { background: var(--kalma-sand); color: var(--kalma-deep-sea); }
.badge { display: inline-block; font-size: 13px; font-weight: 600; padding: 5px 13px; border-radius: 999px; }
.bg-l { background: #D7E8EF; color: var(--kalma-lagoon-deep); } .bg-j { background: #DCE8DF; color: var(--kalma-jungle); }
.bg-c { background: #F8DDD4; color: var(--kalma-coral-deep); } .bg-s { background: var(--kalma-sand); color: var(--kalma-deep-sea); }
.room { background: #fff; border-radius: 26px; overflow: hidden; border: 1px solid #E2D5A8; }
.room .img { height: 230px; } .room .bd { padding: 22px 24px; }
.room h4 { font-family: var(--font-display); font-weight: 500; font-size: 28px; margin: 8px 0 6px; color: var(--kalma-deep-sea); }
.room .pr { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #EFE7CF; margin-top: 14px; padding-top: 14px; }
.room .pr b { font-family: var(--font-display); font-size: 24px; color: var(--kalma-deep-sea); font-weight: 600; }
.field { display: grid; gap: 6px; margin-bottom: 14px; } .field label { font-size: 14px; font-weight: 600; color: var(--kalma-deep-sea); }
.field div { border: 1.5px solid var(--kalma-driftwood); border-radius: 10px; background: #fff; padding: 13px 16px; font-size: 16px; }
.field.f div { border-color: var(--kalma-lagoon); }

/* applications */
.site { border-radius: 18px; overflow: hidden; background: var(--kalma-sand); border: 1px solid var(--kalma-driftwood); border: 1px solid #E2D5A8; }
.site .bar { background: #E2D5A8; padding: 10px 14px; display: flex; gap: 6px; } .site .bar i { width: 10px; height: 10px; border-radius: 50%; background: rgba(34,72,102,.25); }
.site .nav { display: flex; align-items: center; justify-content: space-between; padding: 16px 30px; }
.site .nav img { height: 32px; width: auto; } .site .nav ul { display: flex; gap: 26px; list-style: none; margin: 0; padding: 0; font-size: 14px; font-weight: 500; color: var(--kalma-deep-sea); }
.site .hero { display: grid; grid-template-columns: 1.1fr 1fr; gap: 30px; padding: 10px 30px 0; align-items: center; }
.site .hero h1 { font-size: 44px; line-height: 1.04; }
.site .hero .img { border-radius: 200px 200px 22px 22px; height: 270px; }
.site .strip { background: var(--kalma-deep-sea); color: var(--kalma-shell); padding: 16px 30px; display: flex; gap: 40px; font-size: 13px; }
.site .strip b { display: block; color: var(--kalma-sand); font-family: var(--font-display); font-size: 20px; font-weight: 500; }
.biz { width: 340px; aspect-ratio: 85/55; border-radius: 12px; border: 1px solid #E2D5A8; padding: 7%; display: flex; flex-direction: column; justify-content: space-between; }
.biz.f { background: var(--kalma-sand); align-items: center; justify-content: center; } .biz.f img { width: 62%; }
.biz.b { background: var(--kalma-deep-sea); color: var(--kalma-shell); font-size: 12px; line-height: 1.5; }
.biz.b .nm { font-family: var(--font-display); font-size: 21px; color: var(--kalma-sand); line-height: 1.1; }
.biz.b .ro { text-transform: uppercase; letter-spacing: .25em; font-size: 9px; color: #A9C4D3; }
.ig { aspect-ratio: 1; border-radius: 14px; overflow: hidden; position: relative; }
.ig.a { background: var(--kalma-sand); padding: 9%; display: flex; flex-direction: column; justify-content: space-between; }
.ig.a .q { font-family: var(--font-display); font-style: italic; font-size: 16px; line-height: 1.2; color: var(--kalma-deep-sea); }
.ig.a img { width: 34%; }
.ig.b { display: flex; align-items: flex-end; padding: 8%; }
.ig.b .lb { background: var(--kalma-shell); color: var(--kalma-deep-sea); border-radius: 12px; padding: 10px 14px; width: 100%; }
.ig.b .lb small { display: block; font-size: 9px; letter-spacing: .25em; text-transform: uppercase; color: var(--kalma-lagoon-deep); font-weight: 600; }
.ig.b .lb b { font-family: var(--font-display); font-weight: 500; font-size: 17px; }
.ig.b img.mk { position: absolute; top: 8%; left: 8%; width: 26%; }
.sign { padding: 22px !important; background: #7A5A3C; background-image: repeating-linear-gradient(90deg, rgba(0,0,0,.06) 0 2px, transparent 2px 22px); border-radius: 16px; padding: 28px; display: grid; place-items: center; }
.sign .bd { background: var(--kalma-sand); border-radius: 16px; padding: 20px 28px; border: 1px solid #E2D5A8; text-align: center; }
.sign .bd img { width: 190px; margin: 0 auto 6px; } .sign .bd small { font-size: 10px; letter-spacing: .25em; text-transform: uppercase; color: var(--kalma-deep-sea); font-weight: 600; }
.key { width: 110px; height: 184px; background: var(--kalma-deep-sea); border-radius: 55px 55px 22px 22px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 20px 0 22px; }
.key::before { content: ""; width: 16px; height: 16px; border-radius: 50%; background: var(--kalma-sand); }
.key img { width: 44px; border-radius: 10px; } .key b { font-family: var(--font-display); color: var(--kalma-sand); font-size: 28px; font-weight: 500; line-height: 1; }
.key small { color: #A9C4D3; font-size: 9px; letter-spacing: .25em; text-transform: uppercase; }
.asset { display: flex; gap: 16px; align-items: center; padding: 12px; border-radius: 12px; background: #fff; border: 1px solid var(--kalma-driftwood); }
.asset .th { width: 62px; height: 62px; flex: none; border-radius: 10px; display: grid; place-items: center; padding: 8px; }
.asset .th img { max-height: 46px; width: auto; }
.asset code { display: block; font-size: 13px; color: var(--kalma-deep-sea); word-break: break-all; font-family: ui-monospace, Menlo, Consolas, "DejaVu Sans Mono", monospace; }
.asset span { font-size: 12px; color: #5B6B76; }

/* closing */
.close { justify-content: center; align-items: center; text-align: center; }
.close img.lg { width: 460px; margin: 0 auto 40px; }
.close h2 { font-size: 72px; }
.close .credit { margin-top: 44px; display: inline-flex; align-items: center; gap: 14px; border: 1px solid rgba(237,224,181,.35); border-radius: 999px; padding: 14px 28px; }
.close .credit .dmark { width: 30px; height: 30px; }
.close .credit b { letter-spacing: .3em; color: var(--kalma-sand); font-size: 16px; }
.note { font-size: 13px; color: #5B6B76; font-style: italic; }
"""


class Deck:
    def __init__(self, t):
        self.t = t
        self.slides = []

    def add(self, html, cls=""):
        self.slides.append((html, cls))

    def render(self):
        t = self.t
        total = len(self.slides)
        out = []
        for i, (html, cls) in enumerate(self.slides, 1):
            foot = (f'<div class="foot"><div class="l"><img src="{A}{"kalma-wordmark-white.png" if ("dark" in cls or "ink" in cls or "cover" in cls) else "kalma-wordmark.png"}" alt="">'
                    f'<span>{t["foot"]}</span></div><div class="r">{DAMPIER_MARK}<span>{t["credit"]}</span><b>TEAM DAMPIER</b>'
                    f'<span class="pg">{i:02d} / {total:02d}</span></div></div>')
            out.append(f'<section class="slide {cls}">{html}<div class="wm"></div>{foot}</section>')
        css = CSS.replace("WM_LIGHT", wm_uri("#224866", .055)).replace("WM_DARK", wm_uri("#EDE0B5", .07))
        return f"""<!doctype html>
<html lang="{t['lang']}"><head><meta charset="utf-8">
<title>{t['doc_title']}</title>
<link rel="stylesheet" href="fonts/fonts.css">
<link rel="stylesheet" href="../tokens.css">
<style>{css}</style></head>
<body>
{''.join(out)}
</body></html>"""


def head(kick, title, lead=None):
    h = f'<div class="head"><p class="kick">{kick}</p><h2>{title}</h2>'
    if lead:
        h += f'<p class="lead">{lead}</p>'
    return h + "</div>"


def build(t):
    d = Deck(t)
    C = t["ch"]  # chapter names
    S = t["s"]   # slide copy

    # 1 cover
    d.add(f"""
<div class="in">
  <img src="{A}kalma-logo-primary.png" alt="Kalma Raja Ampat">
  <p class="kick">{S['cover']['kick']}</p>
  <h1>{S['cover']['title']}</h1>
  <div class="meta">
    <div><small>{S['cover']['for']}</small><b>Kalma Raja Ampat Homestay</b></div>
    <div><small>{S['cover']['by']}</small><b>Team Dampier</b></div>
    <div><small>{S['cover']['date_k']}</small><b>{S['cover']['date']}</b></div>
  </div>
</div>
<svg class="wave" viewBox="0 0 1600 110" preserveAspectRatio="none" aria-hidden="true">
  <path d="M0 52 C 260 10, 540 10, 800 46 S 1340 104, 1600 40 L1600 110 L0 110 Z" fill="#4B8AA5"/>
  <path d="M0 78 C 300 46, 560 52, 840 76 S 1360 112, 1600 70 L1600 110 L0 110 Z" fill="#224866"/>
</svg>""", "cover")

    # 2 contents
    pages = [3, 6, 11, 17, 19, 20, 21, 22, 23, 25]
    items = "".join(f'<div><span class="n">{i+1:02d}</span><span class="t">{C[i]}</span><span class="p">{pages[i]:02d}</span></div>' for i in range(10))
    d.add(head(S['toc']['kick'], S['toc']['title']) + f'<div class="body" style="justify-content:flex-start"><div class="toc">{items}</div>'
          f'<p class="note" style="margin-top:28px">{S["toc"]["note"]}</p></div>', "shell")

    # 3 essence: name
    e = S['ess']
    d.add(head(f"01 · {C[0]}", e['title']) + f"""
<div class="body"><div class="row c2" style="gap:72px; align-items:center">
  <div><p class="kick">{e['k_name']}</p><p class="quote">{e['quote']}</p></div>
  <div><p>{e['p1']}</p><p>{e['p2']}</p></div>
</div></div>""", "shell")

    # 4 vision mission positioning
    d.add(head(f"01 · {C[0]}", e['title2']) + f"""
<div class="body"><div class="row c3">
  <div class="card"><p class="kick">{e['vis_k']}</p><h3>{e['vis']}</h3><p class="sm muted">{e['vis_d']}</p></div>
  <div class="card"><p class="kick">{e['mis_k']}</p><ul class="l">{''.join(f'<li>{x}</li>' for x in e['mis'])}</ul></div>
  <div class="card"><p class="kick">{e['pos_k']}</p><h3>{e['pos']}</h3><p class="sm muted">{e['pos_d']}</p></div>
</div></div>""", "shell")

    # 5 values personality tagline
    vals = "".join(f'<div style="padding:14px 0; border-bottom:1px solid #E6DCBC"><b style="font-family:var(--font-display); font-size:26px; color:var(--kalma-deep-sea); font-weight:500">{a}</b><br><span class="sm muted">{b}</span></div>' for a, b in e['values'])
    d.add(head(f"01 · {C[0]}", e['title3']) + f"""
<div class="body"><div class="row c2" style="gap:56px">
  <div class="card"><p class="kick">{e['val_k']}</p>{vals}</div>
  <div style="display:flex; flex-direction:column; gap:28px">
    <div class="card"><p class="kick">{e['per_k']}</p><div class="pills">{''.join(f'<span>{x}</span>' for x in e['pers'])}</div></div>
    <div class="card" style="flex:1"><p class="kick">Tagline</p><p class="big-tag">{e['tag']}</p><p class="sm muted" style="margin-top:12px">{e['tag_alt']}</p></div>
  </div>
</div></div>""", "shell")

    # 6 logo anatomy
    g = S['logo']
    d.add(head(f"02 · {C[1]}", g['title'], g['lead']) + f"""
<div class="body"><div class="row" style="grid-template-columns: 1.15fr 1fr; gap:40px; align-items:stretch">
  <div class="stage st-sand" style="height:470px">
    <img src="{A}kalma-logo-primary.png" alt="" style="max-height:62%">
    <span class="tag" style="top:20px; left:20px">① Wordmark</span>
    <span class="tag" style="top:20px; right:20px; background:var(--kalma-lagoon)">② {g['wave']}</span>
    <span class="tag" style="bottom:20px; left:50%; transform:translateX(-50%)">③ Descriptor</span>
  </div>
  <div class="card" style="display:flex; flex-direction:column; justify-content:center">
    <p><b>① Wordmark “Kalma”</b> {g['a1']}</p>
    <p><b>② {g['wave']}</b> {g['a2']}</p>
    <p><b>③ Descriptor “RAJA AMPAT”</b> {g['a3']}</p>
    <p class="xs muted" style="margin-top:10px">{g['vector']}</p>
  </div>
</div></div>""")

    # 7 variants
    vs = [("st-sand", "kalma-logo-primary.png", "70%"), ("st-deep", "kalma-logo-white.png", "70%"), ("st-white", "kalma-logo-mono-deepsea.png", "70%"),
          ("st-sand", "kalma-wordmark.png", "55%"), ("st-shell", None, ""), ("st-lagoon", "kalma-logo-mono-sand.png", "70%")]
    cells = ""
    for (st, img, h), (nm, ds) in zip(vs, g['variants']):
        inner = (f'<img src="{A}{img}" alt="" style="max-height:{h}">' if img else
                 f'<div style="display:flex; gap:18px"><img src="{A}kalma-icon-sand.png" alt="" style="height:110px; border-radius:26px"><img src="{A}kalma-icon-deepsea.png" alt="" style="height:110px; border-radius:26px"></div>')
        cells += f'<div><div class="stage {st}" style="height:165px">{inner}</div><p class="cap"><b>{nm}</b>{ds}</p></div>'
    d.add(head(f"02 · {C[1]}", g['var_title'], g['var_lead']) + f'<div class="body"><div class="row c3" style="gap:24px 28px">{cells}</div></div>')

    # 8 clear space & min size
    d.add(head(f"02 · {C[1]}", g['cs_title']) + f"""
<div class="body"><div class="row c2" style="gap:64px; align-items:center">
  <div>
    <p class="muted">{g['cs_d']}</p>
    <div class="clear"><span class="x" style="top:14px; left:50%">x</span><span class="x" style="bottom:14px; left:50%">x</span>
      <span class="x" style="left:20px; top:45%">x</span><span class="x" style="right:20px; top:45%">x</span>
      <div class="inner"><img src="{A}kalma-logo-primary.png" alt=""></div></div>
  </div>
  <div>
    <h3>{g['min_t']}</h3><p class="muted sm">{g['min_d']}</p>
    <div style="display:flex; gap:44px; align-items:flex-end; margin:18px 0 34px">
      <figure style="margin:0; text-align:center" class="xs"><img src="{A}kalma-logo-primary.png" style="width:120px" alt="">{g['min1']}<br><b>120 px · 30 mm</b></figure>
      <figure style="margin:0; text-align:center" class="xs"><img src="{A}kalma-wordmark.png" style="width:80px" alt="">Wordmark<br><b>80 px · 20 mm</b></figure>
      <figure style="margin:0; text-align:center" class="xs"><img src="{A}kalma-icon-sand.png" style="width:24px; margin:0 auto" alt="">{g['min3']}<br><b>16 px · 6 mm</b></figure>
    </div>
    <h3>{g['place_t']}</h3><ul class="l">{''.join(f'<li>{x}</li>' for x in g['place'])}</ul>
  </div>
</div></div>""", "shell")

    # 9 backgrounds
    bgs = [("st-sand", "kalma-logo-primary.png"), ("st-white", "kalma-logo-primary.png"), ("st-deep", "kalma-logo-white.png"), ("st-photo", "kalma-logo-white.png")]
    cells = "".join(f'<div><div class="stage {st}" style="height:300px"><img src="{A}{im}" alt=""></div><p class="cap"><span class="yes">✓</span> {lb}</p></div>' for (st, im), lb in zip(bgs, g['bgs']))
    d.add(head(f"02 · {C[1]}", g['bg_title'], g['bg_lead']) + f'<div class="body"><div class="row c4">{cells}</div></div>')

    # 10 misuse
    mis_style = ['style="transform:scaleX(1.45)"', 'style="transform:rotate(-14deg)"', 'img/misuse-recolor.png',
                 'img/misuse-shadow.png', '', '', 'img/misuse-faded.png', None]
    mis_bg = ["st-sand", "st-sand", "st-sand", "st-sand", "st-lagoon", None, "st-sand", "st-sand"]
    cells = ""
    for stl, bg, lb in zip(mis_style, mis_bg, g['misuse']):
        bgattr = f'class="stage {bg}"' if bg else 'class="stage" style="background: repeating-conic-gradient(#E07A5F 0 25%, #F2C14E 0 50%) 0 0/40px 40px"'
        inner = (f'<img src="{stl}" alt="">' if stl.startswith('img/') else f'<img src="{A}kalma-logo-primary.png" alt="" {stl}>') if stl is not None else '<span style="font-family:\'DejaVu Sans\', sans-serif; font-size:44px; color:var(--kalma-deep-sea)">Kalma</span>'
        cells += f'<div><div {bgattr} style="height:170px">{inner}</div><p class="cap"><span class="no">✕</span> {lb}</p></div>'
    cells = cells.replace('class="stage" style="background: repeating-conic-gradient(#E07A5F 0 25%, #F2C14E 0 50%) 0 0/40px 40px" style="height:170px"',
                          'class="stage" style="height:170px; background: repeating-conic-gradient(#E07A5F 0 25%, #F2C14E 0 50%) 0 0/40px 40px"')
    d.add(head(f"02 · {C[1]}", g['mis_title']) + f'<div class="body"><div class="row c4 misuse" style="gap:22px 28px">{cells}</div></div>')

    # 11 core colors
    c = S['col']
    cells = ""
    for key, hx, rgb, cmyk, fg in CORE:
        nm, use = c['names'][key], c['uses'][key]
        cells += (f'<div class="sw"><div class="chip" style="background:{hx}; color:{fg}; height:270px">{nm}</div>'
                  f'<dl><dt>HEX</dt><dd class="mono">{hx}</dd><dt>RGB</dt><dd class="mono">{rgb}</dd><dt>CMYK</dt><dd class="mono">{cmyk}</dd></dl>'
                  f'<p class="use">{use}</p></div>')
    d.add(head(f"03 · {C[2]}", c['core_t'], c['core_l']) + f'<div class="body"><div class="row c3">{cells}</div></div>', "shell")

    # 12 supporting
    cells = ""
    for key, hx, cmyk, fg in SUPPORT:
        cells += (f'<div class="sw"><div class="chip" style="background:{hx}; color:{fg}; height:150px; font-size:21px">{c["names"][key]}</div>'
                  f'<dl><dt>HEX</dt><dd class="mono">{hx}</dd><dt>CMYK</dt><dd class="mono">{cmyk}</dd></dl><p class="use">{c["uses"][key]}</p></div>')
    d.add(head(f"03 · {C[2]}", c['sup_t'], c['sup_l']) + f'<div class="body"><div class="row c7" style="gap:16px">{cells}</div></div>', "shell")

    # 13 proportion + contrast
    pairs = [("#EDE0B5", "#224866", "7.3 : 1 · AAA"), ("#EDE0B5", "#1B2B38", "11 : 1 · AAA"), ("#224866", "#FFFFFF", "9.6 : 1 · AAA"),
             ("#FAF6EA", "#2B6680", "5.9 : 1 · AA"), ("#E07A5F", "#1B2B38", "4.9 : 1 · AA"), ("#EDE0B5", "#4B8AA5", c['deco'])]
    pc = "".join(f'<div class="pair" style="background:{bg}; color:{fg}"><b>Aa {c["pairnames"][i]}</b><span>{lbl}</span></div>' for i, (bg, fg, lbl) in enumerate(pairs))
    d.add(head(f"03 · {C[2]}", c['prop_t']) + f"""
<div class="body"><div class="row c2" style="gap:64px; align-items:start">
  <div><h3>{c['prop_h']}</h3><p class="muted">{c['prop_d']}</p>
    <div class="ratio"><div style="flex:60; background:#EDE0B5; color:#224866">{c['names']['sand']} + {c['names']['shell']} 60%</div>
      <div style="flex:25; background:#224866; color:#EDE0B5">25%</div><div style="flex:10; background:#4B8AA5; color:#fff">10%</div>
      <div style="flex:5; background:#E07A5F; color:#1B2B38">5%</div></div>
    <p class="xs muted" style="margin-top:14px">{c['cmyk_note']}</p></div>
  <div><h3>{c['acc_h']}</h3><div class="row c2" style="gap:12px">{pc}</div></div>
</div></div>""", "shell")

    # 14 tints & shades
    rows = ""
    for key, hx in TINT_BASES:
        cells = "".join(f'<div class="tint{" base" if n == "500" else ""}" style="background:{v}; color:{on(v)}"><b>{n}</b><span class="mono">{v}</span></div>' for n, v in tints(hx))
        rows += f'<div class="tint-row"><div class="nm">{c["names"][key]}<small>{hx}</small></div>{cells}</div>'
    d.add(head(f"03 · {C[2]}", c['tint_t'], c['tint_l']) + f'<div class="body">{rows}</div>', "shell")

    # 15-16 palette directions
    def pal_card(p):
        key, bg, fg, cols, logo, bbg, bfg = p
        nm, mood, best = c['pal'][key]
        strip = "".join(f'<div style="background:{h}; color:{on(h)}; {"box-shadow: inset 0 0 0 1px #E6DCBC;" if h in ("#FFFFFF",) else ""}">{h}</div>' for h in cols)
        rec = f' <i>{c["rec"]}</i>' if key == "A" else ""
        dots = "".join(f'<i style="background:{h}"></i>' for h in cols[1:4])
        border = "box-shadow: inset 0 0 0 1px #E6DCBC;" if bg == "#FFFFFF" else ""
        return (f'<div class="pal"><div class="strip">{strip}</div><div class="info"><h3>{key}. {nm}{rec}</h3><p>{mood}</p><p><b style="color:var(--kalma-deep-sea)">{c["best"]}</b> {best}</p></div>'
                f'<div class="prev" style="background:{bg}; color:{fg}; {border}"><img src="{A}{logo}" alt=""><div class="dots">{dots}</div>'
                f'<div class="t">{c["prev_t"]}</div><span class="btn" style="background:{bbg}; color:{bfg}">{c["prev_b"]}</span></div></div>')
    for part, rng in ((1, PALETTES[:3]), (2, PALETTES[3:])):
        d.add(head(f"03 · {C[2]}", f"{c['pal_t']} ({part}/2)", c['pal_l'] if part == 1 else c['pal_l2']) +
              f'<div class="body"><div class="row c3">{"".join(pal_card(p) for p in rng)}</div></div>', "shell")

    # 17 typography fonts
    ty = S['type']
    d.add(head(f"04 · {C[3]}", ty['title'], ty['lead']) + f"""
<div class="body"><div class="row c2" style="gap:36px">
  <div class="card"><p class="kick">{ty['disp_k']}</p><div class="spec d">Aa</div><h3>Fraunces <span class="xs muted" style="font-family:var(--font-body)">(SOFT 100)</span></h3>
    <div class="glyph" style="font-family:var(--font-display); font-variation-settings:'SOFT' 100">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz · 0123456789 Ññ Áé</div>
    <p class="sm muted">{ty['disp_d']}</p></div>
  <div class="card"><p class="kick">{ty['body_k']}</p><div class="spec b">Aa</div><h3 style="font-family:var(--font-body); font-weight:600">Plus Jakarta Sans</h3>
    <div class="glyph">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz · 0123456789 Ññ Áé</div>
    <p class="sm muted">{ty['body_d']}</p></div>
</div></div>""", "shell")

    # 18 hierarchy
    H = ty['h']
    d.add(head(f"04 · {C[3]}", ty['h_title']) + f"""
<div class="body"><div class="row" style="grid-template-columns: 1.6fr 1fr; gap:40px; align-items:start">
  <div class="card" style="padding:10px 28px">
    <div class="sr"><div class="m"><b>Eyebrow</b>Jakarta 600 · 12px · CAPS · +0.3em</div><div class="kick" style="margin:0">{H[0]}</div></div>
    <div class="sr"><div class="m"><b>H1 / Hero</b>Fraunces 500 · 40→72px</div><h2 style="font-size:52px; margin:0">{H[1]}</h2></div>
    <div class="sr"><div class="m"><b>H2</b>Fraunces 500 · 32→44px</div><h2 style="font-size:38px; margin:0">{H[2]}</h2></div>
    <div class="sr"><div class="m"><b>H3</b>Fraunces 500 · 24→32px</div><h3 style="margin:0">{H[3]}</h3></div>
    <div class="sr"><div class="m"><b>Body</b>Jakarta 400 · 16px · 1.65</div><p class="sm" style="margin:0">{H[4]}</p></div>
    <div class="sr"><div class="m"><b>Caption</b>Jakarta 400 · 14px</div><p class="xs muted" style="margin:0">{H[5]}</p></div>
  </div>
  <div style="display:grid; gap:20px">
    <div class="card"><h3><span class="yes">✓</span> {ty['do_t']}</h3><ul class="l">{''.join(f'<li>{x}</li>' for x in ty['do'])}</ul></div>
    <div class="card"><h3><span class="no">✕</span> {ty['dont_t']}</h3><ul class="l">{''.join(f'<li>{x}</li>' for x in ty['dont'])}</ul></div>
  </div>
</div></div>""")

    # 19 graphic elements
    gr = S['gfx']
    icons = [
        '<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 17c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 7c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>',
        '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
        '<path d="M3 18c3 0 4-3 9-3s6 3 9 3"/><path d="M12 15V4"/><path d="M12 4l6 7H12"/>',
        '<path d="M4 11h16"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M9 7c0-1 1-1 1-2M13 7c0-1 1-1 1-2"/>',
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
        '<path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14z"/><path d="M5 19l8-8"/>']
    ic = "".join(f'<figure><div class="ic"><svg viewBox="0 0 24 24">{p}</svg></div>{n}</figure>' for p, n in zip(icons, gr['icons']))
    d.add(head(f"05 · {C[4]}", gr['title'], gr['lead']) + f"""
<div class="body"><div class="row c3" style="margin-bottom:34px">
  <div><div class="stage st-sand" style="height:190px; display:block; padding:0"><svg viewBox="0 0 400 230" width="100%" height="190" preserveAspectRatio="none">
    <rect width="400" height="230" fill="#EDE0B5"/><path d="M0 110 C 90 70, 170 80, 230 115 S 340 160, 400 125 L400 230 L0 230 Z" fill="#4B8AA5"/>
    <path d="M0 150 C 110 115, 190 125, 260 155 S 350 190, 400 170 L400 230 L0 230 Z" fill="#224866"/></svg></div><p class="cap"><b>{gr['g1'][0]}</b>{gr['g1'][1]}</p></div>
  <div><div class="pat"></div><p class="cap"><b>{gr['g2'][0]}</b>{gr['g2'][1]}</p></div>
  <div><div class="pat dk"></div><p class="cap"><b>{gr['g3'][0]}</b>{gr['g3'][1]}</p></div>
</div>
<div class="row c2" style="gap:48px">
  <div><h3>{gr['shape_t']}</h3><p class="sm muted">{gr['shape_d']}</p>
    <div style="display:flex; gap:20px; align-items:flex-end"><div style="width:110px; height:110px; border-radius:48% 52% 44% 56% / 56% 44% 56% 44%; background:var(--kalma-lagoon)"></div>
    <div style="width:92px; height:124px; border-radius:999px 999px 16px 16px; background:var(--kalma-deep-sea)"></div><div style="width:110px; height:110px; border-radius:28px; background:var(--kalma-coral)"></div></div></div>
  <div><h3>{gr['icon_t']}</h3><p class="sm muted">{gr['icon_d']}</p><div class="icons">{ic}</div></div>
</div></div>""", "shell")

    # 20 photography
    ph = S['photo']
    d.add(head(f"06 · {C[5]}", ph['title'], ph['lead']) + f"""
<div class="body"><div class="row c4" style="margin-bottom:26px">
  {''.join(f'<div class="ph ph-{i+1}" style="height:250px"><span>{n}</span></div>' for i, n in enumerate(ph['tiles']))}
</div>
<div class="row c2">
  <div class="card"><h3><span class="yes">✓</span> {ph['do_t']}</h3><ul class="l">{''.join(f'<li>{x}</li>' for x in ph['do'])}</ul></div>
  <div class="card"><h3><span class="no">✕</span> {ph['dont_t']}</h3><ul class="l">{''.join(f'<li>{x}</li>' for x in ph['dont'])}</ul></div>
</div></div>""")

    # 21 tone of voice
    v = S['voice']
    rows = "".join(f'<tr><td><b>{a}</b></td><td>{b}</td><td>{cc}</td></tr>' for a, b, cc in v['rows'])
    prin = "".join(f'<div class="card" style="padding:20px"><h3 style="font-size:22px">{a}</h3><p class="sm muted" style="margin:0">{b}</p></div>' for a, b in v['principles'])
    d.add(head(f"07 · {C[6]}", v['title'], v['lead']) + f"""
<div class="body"><div class="row c4" style="gap:18px; margin-bottom:24px">{prin}</div>
<table class="v"><thead><tr><th>{v['th'][0]}</th><th>✓ {v['th'][1]}</th><th>✕ {v['th'][2]}</th></tr></thead><tbody>{rows}</tbody></table></div>""", "dark")

    # 22 ui components
    u = S['ui']
    d.add(head(f"08 · {C[7]}", u['title'], u['lead']) + f"""
<div class="body"><div class="row" style="grid-template-columns: 1.25fr 1fr; gap:48px; align-items:center">
  <div>
    <h3>{u['btn_t']}</h3>
    <div style="display:flex; gap:14px; flex-wrap:wrap; margin-bottom:14px"><span class="btn b-cta">{u['b'][0]}</span><span class="btn b-pri">{u['b'][1]}</span><span class="btn b-gh">{u['b'][2]}</span></div>
    <div style="display:flex; gap:14px; background:var(--kalma-deep-sea); padding:16px; border-radius:16px; width:max-content; margin-bottom:12px"><span class="btn b-sand">{u['b'][3]}</span><span class="btn b-cta">{u['b'][0]}</span></div>
    <p class="xs muted">{u['btn_d']}</p>
    <h3 style="margin-top:18px">Badge</h3>
    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:22px">{''.join(f'<span class="badge {k}">{x}</span>' for k, x in zip(["bg-l", "bg-j", "bg-c", "bg-s"], u['badges']))}</div>
    <h3>Form</h3>
    <div class="row c2" style="gap:16px; max-width:620px"><div class="field f"><label>Check-in</label><div>12 / 12 / 2026</div></div><div class="field"><label>{u['guests']}</label><div>{u['guests_v']}</div></div></div>
  </div>
  <div class="room"><div class="img ph-2"></div><div class="bd"><span class="badge bg-l">{u['room_b']}</span><h4>{u['room']}</h4>
    <p class="sm muted" style="margin:0">{u['room_d']}</p><div class="pr"><div><b>Rp 850.000</b> <span class="xs muted">{u['per']}</span></div><span class="btn b-pri" style="padding:10px 18px; font-size:14px">{u['detail']}</span></div></div></div>
</div></div>""", "shell")

    # 23 application website
    ap = S['app']
    d.add(head(f"09 · {C[8]}", ap['web_t']) + f"""
<div class="body" style="justify-content:flex-start"><div class="site">
  <div class="bar"><i></i><i></i><i></i></div>
  <div class="nav"><img src="{A}kalma-wordmark.png" alt=""><ul>{''.join(f'<li>{x}</li>' for x in ap['nav'])}</ul><span class="btn b-cta" style="padding:10px 20px; font-size:14px">{ap['book']}</span></div>
  <div class="hero"><div><p class="kick" style="font-size:12px">Homestay · Raja Ampat</p><h1>{ap['hero']}</h1>
    <p class="muted" style="margin:14px 0 20px">{ap['hero_d']}</p>
    <div style="display:flex; gap:12px"><span class="btn b-cta">{ap['cta1']}</span><span class="btn b-gh">{ap['cta2']}</span></div></div>
    <div class="img ph-1"></div></div>
  <svg viewBox="0 0 1440 60" preserveAspectRatio="none" style="display:block; width:100%; height:34px; margin-top:20px"><path d="M0 30 C 300 0, 600 0, 820 26 S 1250 60, 1440 22 L1440 60 L0 60 Z" fill="#224866"/></svg>
  <div class="strip">{''.join(f'<div><b>{a}</b>{b}</div>' for a, b in ap['stats'])}</div>
</div><p class="note" style="margin-top:14px">{ap['note']}</p></div>""", "shell")

    # 24 print & social
    d.add(head(f"09 · {C[8]}", ap['print_t']) + f"""
<div class="body"><div class="row c3" style="gap:40px; align-items:start">
  <div><div class="biz f"><img src="{A}kalma-logo-primary.png" alt=""></div>
    <div class="biz b" style="margin-top:16px"><div><div class="nm">{ap['owner']}</div><div class="ro">Host · Kalma</div></div>
      <div style="display:flex; justify-content:space-between; align-items:flex-end"><div>+62 8xx xxxx xxxx<br>hello@kalma-rajaampat.com</div><img src="{A}kalma-logo-mono-sand.png" alt="" style="width:30%"></div></div>
    <p class="cap"><b>{ap['biz'][0]}</b>{ap['biz'][1]}</p></div>
  <div><div class="row c2" style="gap:12px; width:380px">
      <div class="ig a"><div class="q">{ap['igq']}</div><img src="{A}kalma-logo-mono-deepsea.png" alt=""></div>
      <div class="ig b ph-1"><img class="mk" src="{A}kalma-logo-white.png" alt=""><div class="lb"><small>{ap['ig1'][0]}</small><b>{ap['ig1'][1]}</b></div></div>
      <div class="ig b ph-4"><img class="mk" src="{A}kalma-logo-white.png" alt=""><div class="lb"><small>{ap['ig2'][0]}</small><b>{ap['ig2'][1]}</b></div></div>
      <div class="ig" style="background:var(--kalma-deep-sea); display:grid; place-items:center"><img src="{A}kalma-icon-sand.png" alt="" style="width:46%; border-radius:22%"></div>
    </div><p class="cap"><b>{ap['igc'][0]}</b>{ap['igc'][1]}</p></div>
  <div><div class="sign"><div class="bd"><img src="{A}kalma-logo-primary.png" alt=""><small>{ap['welcome']}</small></div></div>
    <div style="display:flex; gap:20px; margin-top:16px; align-items:center; justify-content:center">
      <div class="key"><img src="{A}kalma-icon-deepsea.png" alt="" style="box-shadow:0 0 0 1px rgba(237,224,181,.3)"><b>03</b><small>Laguna</small></div>
      <div style="background:var(--kalma-sand); border-radius:0 0 40px 40px; width:150px; height:190px; display:grid; place-items:center; border-top:10px solid var(--kalma-deep-sea)"><img src="{A}kalma-logo-mono-deepsea.png" alt="" style="width:80%"></div>
    </div><p class="cap"><b>{ap['sign'][0]}</b>{ap['sign'][1]}</p></div>
</div></div>""", "shell")

    # 25 assets
    a = S['assets']
    files = [("st-sand", "kalma-logo-primary.png"), ("st-deep", "kalma-logo-white.png"), ("st-white", "kalma-logo-mono-deepsea.png"),
             ("st-deep", "kalma-logo-mono-sand.png"), ("st-sand", "kalma-wordmark.png"), ("st-deep", "kalma-wordmark-white.png"),
             ("st-shell", "kalma-monogram.png"), ("st-shell", "kalma-icon-sand.png"), ("st-shell", "favicon-32.png")]
    names = ["kalma-logo-primary.png", "kalma-logo-white.png", "kalma-logo-mono-deepsea.png", "kalma-logo-mono-sand.png", "kalma-wordmark.png",
             "kalma-wordmark-white.png", "kalma-monogram.png", "kalma-icon-sand.png / -deepsea.png", "favicon.ico · favicon-32.png · apple-touch-icon.png"]
    cells = "".join(f'<div class="asset"><div class="th {st}"><img src="{A}{im}" alt=""></div><div><code>{nm}</code><span>{ds}</span></div></div>' for (st, im), nm, ds in zip(files, names, a['desc']))
    cells += f'<div class="asset"><div class="th st-shell" style="font-family:var(--font-display); font-size:24px; color:var(--kalma-deep-sea)">{{ }}</div><div><code>tokens.css</code><span>{a["tokens"]}</span></div></div>'
    d.add(head(f"10 · {C[9]}", a['title'], a['lead']) + f'<div class="body"><div class="row c3" style="gap:16px">{cells}</div></div>', "shell")

    # 26 closing
    cl = S['close']
    d.add(f"""<div class="body close">
  <img class="lg" src="{A}kalma-logo-white.png" alt="Kalma Raja Ampat">
  <h2>{cl['title']}</h2><p class="lead" style="margin:0 auto">{cl['lead']}</p>
  <div class="credit">{DAMPIER_MARK}<span class="muted">{t['credit']}</span><b>TEAM DAMPIER</b></div>
</div>""", "dark")
    return d.render()


if __name__ == "__main__":
    for lang, t in TEXT.items():
        path = os.path.join(HERE, f"kalma-deck-{lang}.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(build(t))
        print("wrote", path)
