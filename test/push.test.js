const test = require('node:test'), assert = require('node:assert');
const { planned, zoned, safeEqual } = require('../api/_lib.js');

test('planned slots are in-window, sorted, stable for a date', () => {
  const cfg = { perDay: 4, from: '09:00', to: '20:00' };
  const a = planned(cfg, '2026-10-18');
  assert.equal(a.length, 4);
  assert.deepEqual(a, planned(cfg, '2026-10-18'));
  assert.notDeepEqual(a, planned(cfg, '2026-10-19'));
  assert.ok(a.every((m, i) => m >= 540 && m <= 1200 && (i === 0 || m > a[i - 1])));
});
test('empty window gives no slots', () => assert.deepEqual(planned({ perDay: 3, from: '20:00', to: '09:00' }, '2026-10-18'), []));
test('zoned converts to the local calendar day', () => {
  const d = new Date('2026-10-18T02:30:00Z');
  assert.deepEqual(zoned(d, 'America/Denver'), { date: '2026-10-17', minutes: 20 * 60 + 30 });
  assert.deepEqual(zoned(d, 'UTC'), { date: '2026-10-18', minutes: 150 });
});
test('safeEqual', () => { assert.ok(safeEqual('abc', 'abc')); assert.ok(!safeEqual('abc', 'abd')); assert.ok(!safeEqual('', 'x')); });

// Handlers with an in-memory Redis and a fake web-push.
function setup() {
  const store = new Map(), sets = new Map(); const sent = [];
  process.env.KV_REST_API_URL = 'http://redis.test'; process.env.KV_REST_API_TOKEN = 't';
  process.env.SUBSCRIBE_CODE = 'sesame'; process.env.CRON_SECRET = 'cron'; process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv';
  global.fetch = async (_u, o) => {
    const [c, k, v] = JSON.parse(o.body); let result = null;
    if (c === 'SET') store.set(k, v); else if (c === 'GET') result = store.get(k) ?? null; else if (c === 'DEL') store.delete(k);
    else if (c === 'SADD') { const s = sets.get(k) || new Set(); result = s.has(v) ? 0 : 1; s.add(v); sets.set(k, s); } else if (c === 'EXPIRE') result = 1;
    return { ok: true, json: async () => ({ result }) };
  };
  require.cache[require.resolve('web-push')] = { id: 'x', filename: 'x', loaded: true, exports: { setVapidDetails() {}, sendNotification: async (s, p) => { sent.push([s, p]); } } };
  for (const m of ['subscribe', 'tick']) delete require.cache[require.resolve(`../api/${m}.js`)];
  return { store, sent, subscribe: require('../api/subscribe.js'), tick: require('../api/tick.js') };
}
const mkRes = () => { const r = { code: 200, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; }, end() { return r; } }; return r; };
const body = { code: 'sesame', subscription: { endpoint: 'https://push.test/x', keys: { p256dh: 'a', auth: 'b' } }, perDay: 4, from: '00:00', to: '23:59', tz: 'UTC' };

test('subscribe rejects a wrong code and bad input, stores a good one', async () => {
  const { subscribe, store } = setup();
  let r = mkRes(); await subscribe({ method: 'POST', body: { ...body, code: 'nope' } }, r); assert.equal(r.code, 401);
  r = mkRes(); await subscribe({ method: 'POST', body: { ...body, perDay: 99 } }, r); assert.equal(r.code, 400);
  r = mkRes(); await subscribe({ method: 'POST', body: { ...body, tz: 'Mars/Base' } }, r); assert.equal(r.code, 400);
  r = mkRes(); await subscribe({ method: 'POST', body }, r); assert.equal(r.code, 200); assert.ok(store.get('sub'));
});
test('tick needs the cron secret, and sends each due slot only once', async () => {
  const { subscribe, tick, sent } = setup();
  let r = mkRes(); await tick({ headers: {} }, r); assert.equal(r.code, 401);
  await subscribe({ method: 'POST', body }, mkRes());
  // Window is the whole day with 4 slots; run at a time just after the first slot.
  const cfg = { perDay: 4, from: '00:00', to: '23:59' };
  const t0 = planned(cfg, new Date().toISOString().slice(0, 10))[0];
  const RealDate = Date, fixed = new RealDate(new RealDate().toISOString().slice(0, 10) + 'T00:00:00Z').getTime() + (t0 + 5) * 6e4;
  global.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } };
  try {
    r = mkRes(); await tick({ headers: { authorization: 'Bearer cron' } }, r); assert.deepEqual(r.body, { sent: 1 });
    r = mkRes(); await tick({ headers: { authorization: 'Bearer cron' } }, r); assert.equal(r.body.sent, 0);
    assert.equal(sent.length, 1);
  } finally { global.Date = RealDate; }
});
