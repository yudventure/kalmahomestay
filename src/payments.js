'use strict';

/**
 * Online payment with Midtrans Snap.
 * Flow: the website prices the stay on the server, saves the booking with an order id,
 * asks Midtrans for a Snap token, and the browser opens the Snap payment popup.
 * Midtrans then calls POST /api/payments/midtrans (set it as the Payment Notification URL),
 * which we verify with the signature key before marking the booking paid.
 */
const crypto = require('crypto');
const { ROOMS } = require('./config');

const DAY = 24 * 60 * 60 * 1000;
const MAX_NIGHTS = 60;

function nightsBetween(checkin, checkout) {
  return Math.round((Date.parse(checkout + 'T00:00:00Z') - Date.parse(checkin + 'T00:00:00Z')) / DAY);
}

/** Price a stay. Prices are per person per night. Returns { error } (a content ui.* key) or the quote. */
function quote(v, percent = 100) {
  const room = ROOMS.find((r) => r.id === v.room);
  if (!room) return { error: 'errRoom' };
  const guests = Number(v.guests);
  if (!Number.isInteger(guests) || guests < 1) return { error: 'errGuests' };
  if (guests > room.maxGuests) return { error: 'errCapacity', max: room.maxGuests };
  const nights = nightsBetween(v.checkin, v.checkout);
  if (!(nights >= 1 && nights <= MAX_NIGHTS)) return { error: 'errOrder' };
  const total = room.price * guests * nights;
  const amount = Math.round((total * percent) / 100);
  return { room, guests, nights, total, amount, percent };
}

function newOrderId() {
  return 'KALMA-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

/** Ask Midtrans for a Snap token. Throws on any failure (the caller falls back to WhatsApp). */
async function createSnapTransaction(cfg, { orderId, amount, itemName, name, email, phone, finishUrl }, fetchImpl = fetch) {
  const customer = { first_name: String(name || 'Guest').slice(0, 50) };
  if (email) customer.email = email;
  if (phone) customer.phone = '+' + phone;
  const body = {
    transaction_details: { order_id: orderId, gross_amount: amount },
    item_details: [{ id: 'stay', price: amount, quantity: 1, name: String(itemName).slice(0, 50) }],
    customer_details: customer,
    callbacks: { finish: finishUrl },
    expiry: { unit: 'hours', duration: 24 },
  };
  const res = await fetchImpl(cfg.snapUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(cfg.serverKey + ':').toString('base64'),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) {
    throw new Error(`Midtrans ${res.status}: ${(data.error_messages || []).join('; ') || 'no token'}`);
  }
  return { token: data.token, redirectUrl: data.redirect_url };
}

/** Midtrans signs notifications with SHA512(order_id + status_code + gross_amount + server key). */
function verifyNotification(cfg, n) {
  if (!n || !n.order_id || !n.status_code || !n.gross_amount || typeof n.signature_key !== 'string') return false;
  const expected = crypto.createHash('sha512')
    .update(String(n.order_id) + String(n.status_code) + String(n.gross_amount) + cfg.serverKey).digest('hex');
  const got = n.signature_key.toLowerCase();
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Map a Midtrans transaction status to ours: pending, paid, failed, expired or refunded. */
function paymentStatus(n) {
  const s = n.transaction_status;
  if (s === 'settlement') return 'paid';
  if (s === 'capture') return !n.fraud_status || n.fraud_status === 'accept' ? 'paid' : 'pending';
  if (s === 'pending' || s === 'authorize') return 'pending';
  if (s === 'deny' || s === 'cancel' || s === 'failure') return 'failed';
  if (s === 'expire') return 'expired';
  if (/refund|chargeback/.test(s || '')) return 'refunded';
  return null;
}

/** Midtrans reports times in Western Indonesia Time (UTC+7) as "YYYY-MM-DD HH:MM:SS". */
function midtransTime(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return null;
  const d = new Date(s.replace(' ', 'T') + '+07:00');
  return isNaN(d) ? null : d;
}

module.exports = { quote, nightsBetween, newOrderId, createSnapTransaction, verifyNotification, paymentStatus, midtransTime };
