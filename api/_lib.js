// Shared helpers for the push functions. The server stores only the push subscription and the
// reminder window. No check-in data ever reaches it.
const crypto = require('crypto');

// Upstash Redis over REST. The Vercel marketplace integration injects one of these env pairs.
async function redis(cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('Redis is not configured');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `Redis ${r.status}`);
  return j.result;
}

const safeEqual = (a = '', b = '') => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Local calendar date and minutes-since-midnight in an IANA time zone.
function zoned(date, tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}

// Same scheme as the in-app reminders: one slot per equal segment of the window, jittered, stable per day.
function planned({ perDay, from, to }, dateKey) {
  const [fh, fm] = from.split(':').map(Number), [th, tm] = to.split(':').map(Number);
  const a = fh * 60 + fm, b = th * 60 + tm;
  if (b <= a) return [];
  let seed = [...dateKey].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const seg = (b - a) / perDay;
  return Array.from({ length: perDay }, (_, i) => Math.round(a + seg * (i + 0.15 + rnd() * 0.7)));
}

const validTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return typeof tz === 'string'; } catch { return false; } };

module.exports = { redis, safeEqual, zoned, planned, validTime, validTz };
