'use strict';

/**
 * Admin language. English is the default; staff can switch to Indonesian in the account menu.
 * The admin templates are written in Indonesian. For English, each template is translated once at start
 * (static text, titles, placeholders and labels in the template code) with the dictionary in
 * admin-i18n-en.js, and render() uses the English copy. Data typed by guests and staff is never translated:
 * it reaches the page through <%= %> and only exact dictionary labels (status names and such) are swapped.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const LANG_COOKIE = 'kalma_admin_lang';
const DICT = require('./admin-i18n-en');

// longest phrases first so "Simpan perubahan" wins over "Simpan"
const PHRASES = Object.keys(DICT).filter((k) => !k.includes('{n}')).sort((a, b) => b.length - a.length);
const PATTERNS = Object.keys(DICT).filter((k) => k.includes('{n}')).map((k) => ({
  re: new RegExp('^' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{n\\\}/g, '(-?[\\d.,\\-]+)') + '$'),
  to: DICT[k],
}));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASE_RE = PHRASES.length ? new RegExp('(?<![\\p{L}\\d])(' + PHRASES.map(escapeRe).join('|') + ')(?![\\p{L}\\d])', 'gu') : null;

/** A whole label: exact dictionary entry or a "{n} …" pattern. Returns undefined when unknown. */
function exact(s) {
  if (typeof s !== 'string') return undefined;
  const k = s.trim();
  if (!k) return undefined;
  if (Object.prototype.hasOwnProperty.call(DICT, k)) return s.replace(k, DICT[k]);
  for (const p of PATTERNS) {
    const m = p.re.exec(k);
    if (m) { let i = 1; return s.replace(k, p.to.replace(/\{n\}/g, () => m[i++])); }
  }
  return undefined;
}

/** Free text written by us (messages, notes): translate every known phrase inside it. */
function phrases(s) {
  if (typeof s !== 'string' || !PHRASE_RE) return s;
  const whole = exact(s);
  if (whole !== undefined) return whole;
  return s.replace(PHRASE_RE, (m) => DICT[m]);
}

/* ---------------------------------------------------------------- templates */
const EJS_TAG = /<%[_=\-#]?[\s\S]*?[_-]?%>/g;
const STR = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;
const ATTRS = /\b(placeholder|title|aria-label|alt|label|data-confirm)=("[^"]*"|'[^']*')/g;

/** Translate strings inside template code: whole labels, and sentences that are fully known. */
function translateCode(code) {
  if (/^<%#/.test(code)) return code;
  return code.replace(STR, (lit) => {
    const q = lit[0];
    const inner = lit.slice(1, -1);
    if (q === '`' && inner.includes('${')) return lit;
    if (!/[A-Za-z]/.test(inner) || /^[\w\-/.:#?=&%]+$/.test(inner) && !/^[A-Z]/.test(inner)) return lit; // ids, paths, classes
    const out = exact(inner);
    if (out !== undefined) return q + out.replace(new RegExp(q === '`' ? '`' : q, 'g'), '\\' + q) + q;
    // a sentence such as an onsubmit confirm() or a hint: translate its known phrases
    if (/\s/.test(inner) && /^[A-Z]/.test(inner)) return q + phrases(inner).replace(new RegExp(q, 'g'), '\\' + q) + q;
    return lit;
  });
}

/** Translate an EJS template source: text between HTML tags, a few attributes, and string literals in code. */
function translateTemplate(src) {
  const code = [];
  const masked = src.replace(EJS_TAG, (m) => { code.push(m); return `\u0000${code.length - 1}\u0000`; });
  let out = '';
  let i = 0;
  // walk HTML: tags keep their structure (only some attributes are words), text is translated
  const TAG = /<(script|style)\b[\s\S]*?<\/\1>|<[^>]*>/gi;
  let m;
  while ((m = TAG.exec(masked))) {
    out += translateText(masked.slice(i, m.index));
    let tag = m[0];
    if (/^<script/i.test(tag)) {
      tag = tag.replace(STR, (lit) => lit[0] + phrases(lit.slice(1, -1)) + lit[0]); // texts in small inline scripts
    } else if (!/^<style/i.test(tag)) {
      tag = tag.replace(ATTRS, (a, name, val) => `${name}=${val[0]}${translateText(val.slice(1, -1))}${val[0]}`);
      // onsubmit="return confirm('…')"
      tag = tag.replace(/(confirm\()('(?:[^'\\]|\\.)*')/g, (a, f, lit) => f + "'" + phrases(lit.slice(1, -1)) + "'");
    }
    out += tag;
    i = m.index + m[0].length;
  }
  out += translateText(masked.slice(i));
  return out.replace(/\u0000(\d+)\u0000/g, (all, n) => translateCode(code[Number(n)]));
}

/** A text run, possibly split by masked EJS tags: translate each piece between them. */
function translateText(s) {
  return s.split(/(\u0000\d+\u0000)/).map((part) => (/^\u0000\d+\u0000$/.test(part) || !/\p{L}/u.test(part) ? part : translatePiece(part))).join('');
}
function translatePiece(part) {
  const lead = part.match(/^\s*/)[0];
  const trail = part.match(/\s*$/)[0];
  const core = part.trim();
  if (!core) return part;
  const whole = exact(core);
  return lead + (whole !== undefined ? whole : phrases(core)) + trail;
}

/** Write English copies of the admin templates once; returns the folder that holds views/admin in English. */
function buildEnglishViews(viewsDir) {
  const src = path.join(viewsDir, 'admin');
  const files = fs.readdirSync(src).filter((f) => f.endsWith('.ejs')).sort();
  const hash = crypto.createHash('sha1');
  for (const f of files) hash.update(f).update(fs.readFileSync(path.join(src, f)));
  hash.update(JSON.stringify(DICT));
  const root = path.join(os.tmpdir(), 'kalma-admin-en-' + hash.digest('hex').slice(0, 12));
  const dest = path.join(root, 'admin');
  if (!fs.existsSync(path.join(dest, '.done'))) {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of files) fs.writeFileSync(path.join(dest, f), translateTemplate(fs.readFileSync(path.join(src, f), 'utf8')));
    fs.writeFileSync(path.join(dest, '.done'), '');
  }
  return root;
}

/** Labels handed to the views (status names, menus, errors): a copy with known Indonesian labels in English. */
function translateValue(v, depth = 0) {
  if (depth > 5 || v == null) return v;
  if (typeof v === 'string') { const out = exact(v); return out === undefined ? v : out; }
  if (Array.isArray(v)) return v.map((x) => translateValue(x, depth + 1));
  if (Object.getPrototypeOf(v) === Object.prototype) {
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = translateValue(x, depth + 1);
    return out;
  }
  return v;
}

module.exports = { LANG_COOKIE, DICT, exact, phrases, translateTemplate, buildEnglishViews, translateValue };
