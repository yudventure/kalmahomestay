'use strict';

/**
 * Guest comments from Kalma's own Instagram posts and reels, shown as scrolling bubbles under "Guest stories".
 *
 * Uses the official Instagram API with Instagram Login (graph.instagram.com) and a long-lived
 * access token for the Kalma business/creator account (INSTAGRAM_ACCESS_TOKEN). Once a day the
 * site reads the comments on every post and reel (back to the first one), keeps the ones that read like a guest story,
 * and saves them. At /admin/instagram the admin can hide comments or paste comments in by hand
 * (for when there is no token yet).
 *
 * Long-lived tokens expire after 60 days unless refreshed, so each sync also refreshes the
 * token (allowed once it is a day old) and stores the new one in the database.
 */
const crypto = require('crypto');

const API = 'https://graph.instagram.com';
const DAY = 24 * 60 * 60 * 1000;
const RETRY_AFTER_ERROR = 60 * 60 * 1000;
const MEDIA_PAGE = 50;        // posts per page; pages are followed back to the first post
const MEDIA_PAGES = 40;       // safety cap: up to 2000 posts
const COMMENT_PAGES = 5;      // up to 5 × 50 comments per post
const SHOW = 40;              // comments shown on the website

const fingerprint = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

/** Keep comments that read like a short story about a stay: no owner replies, links, tag-a-friend or emoji-only notes. */
function isStory(c, ownUsername) {
  if (!c || !c.text || !c.username) return false;
  if (ownUsername && c.username.toLowerCase() === ownUsername.toLowerCase()) return false;
  const text = c.text.trim();
  if (text.length > 400 || /https?:\/\/|www\.|\.com\b/i.test(text)) return false;
  const words = text.replace(/@[\w.]+/g, ' ').match(/[\p{L}\p{N}']{2,}/gu) || [];
  return words.length >= 4;
}

function cleanText(text) {
  return text.replace(/^(\s*@[\w.]+)+\s*/, '').replace(/\s+/g, ' ').trim();
}

async function getJSON(fetchImpl, url) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = new Error(`Instagram ${res.status}: ${(data.error && data.error.message) || 'request failed'}`);
    e.status = res.status;
    throw e;
  }
  return data;
}

/** Read the account, its latest posts and their top-level comments. */
async function fetchComments(token, { fetchImpl = fetch, api = API } = {}) {
  const q = (p, params) => `${api}${p}?${new URLSearchParams({ ...params, access_token: token })}`;
  const me = await getJSON(fetchImpl, q('/me', { fields: 'user_id,username' }));
  const media = [];
  let next = q('/me/media', { fields: 'id,permalink,timestamp,comments_count,media_type,media_product_type', limit: String(MEDIA_PAGE) });
  for (let i = 0; next && i < MEDIA_PAGES; i += 1) {
    const page = await getJSON(fetchImpl, next);
    media.push(...(page.data || []));
    next = page.paging && page.paging.next;
  }
  const comments = [];
  const completeMedia = [];
  for (const m of media) {
    const kind = m.media_product_type === 'REELS' || m.media_type === 'VIDEO' ? 'reel' : 'post';
    if (!m.comments_count) { completeMedia.push(m.id); continue; }
    let url = q(`/${m.id}/comments`, { fields: 'id,text,username,timestamp,like_count', limit: '50' });
    let pages = 0;
    while (url && pages < COMMENT_PAGES) {
      const page = await getJSON(fetchImpl, url);
      for (const c of page.data || []) {
        comments.push({ id: c.id, mediaId: m.id, permalink: m.permalink, kind, username: c.username, text: c.text, likes: c.like_count || 0, timestamp: c.timestamp });
      }
      url = page.paging && page.paging.next;
      pages += 1;
    }
    if (!url) completeMedia.push(m.id);
  }
  return { username: me.username, comments, completeMedia };
}

async function refreshToken(token, { fetchImpl = fetch, api = API } = {}) {
  const data = await getJSON(fetchImpl, `${api}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`);
  if (!data.access_token) throw new Error('Instagram: no token in refresh response');
  return { token: data.access_token, expiresIn: Number(data.expires_in) || null };
}

/**
 * Daily sync bound to a repo. `comments` is an in-memory list of visible comments for the home page,
 * so rendering never waits on Instagram or the database.
 */
function createInstagramSync({ repo, token: envToken, fetchImpl = fetch, api = API, log = console.log, now = () => Date.now() }) {
  let visible = [];
  let running = null;

  async function currentToken() {
    if (!envToken) return null;
    const saved = await repo.getSetting('ig_token');
    // A refreshed token belongs to the token in hPanel it came from; a new token there wins.
    if (saved && saved.from === fingerprint(envToken) && saved.token) return saved;
    return { token: envToken, from: fingerprint(envToken), refreshedAt: null };
  }

  async function reload() {
    const rows = await repo.listIgComments({ visibleOnly: true, limit: SHOW });
    visible = rows.map((r) => ({ quote: r.text, name: '@' + r.username, from: 'Instagram', kind: r.media_kind || null, url: r.permalink || null }));
    return visible;
  }

  async function run() {
    const status = { at: new Date(now()).toISOString(), ok: false, error: '', count: 0 };
    try {
      const t = await currentToken();
      if (!t) throw new Error('INSTAGRAM_ACCESS_TOKEN belum diisi');
      const { username, comments, completeMedia } = await fetchComments(t.token, { fetchImpl, api });
      const stories = comments.filter((c) => isStory(c, username)).map((c) => ({ ...c, text: cleanText(c.text) }));
      await repo.saveIgComments(stories, completeMedia);
      status.ok = true;
      status.count = stories.length;
      status.username = username;
      // Keep the token alive: refresh at most once a day (Instagram refuses tokens younger than 24 hours).
      if (!t.refreshedAt || now() - Date.parse(t.refreshedAt) >= DAY) {
        try {
          const r = await refreshToken(t.token, { fetchImpl, api });
          await repo.setSetting('ig_token', { token: r.token, from: t.from, refreshedAt: new Date(now()).toISOString(), expiresIn: r.expiresIn });
        } catch (e) {
          log(`Instagram: token refresh skipped (${e.message})`);
        }
      }
    } catch (e) {
      status.error = e.message;
      log(`Instagram sync failed: ${e.message}`);
    }
    await repo.setSetting('ig_sync', status);
    await reload().catch(() => {});
    return status;
  }

  /** Sync now (one at a time). */
  function syncNow() {
    if (!running) running = run().finally(() => { running = null; });
    return running;
  }

  /** Sync if the last one is older than a day (or an hour after a failure). */
  async function maybeSync() {
    if (!envToken) return null;
    const last = await repo.getSetting('ig_sync');
    const wait = last && last.ok ? DAY : RETRY_AFTER_ERROR;
    if (last && now() - Date.parse(last.at) < wait) return null;
    return syncNow();
  }

  /** Load saved comments, sync when due, then check every hour. */
  async function start() {
    await reload().catch(() => {});
    maybeSync().catch(() => {});
    const timer = setInterval(() => { maybeSync().catch(() => {}); }, RETRY_AFTER_ERROR);
    timer.unref();
    return timer;
  }

  return {
    enabled: Boolean(envToken),
    get comments() { return visible; },
    status: () => repo.getSetting('ig_sync'),
    reload, syncNow, maybeSync, start,
  };
}

module.exports = { createInstagramSync, fetchComments, refreshToken, isStory, cleanText };
