const test = require('node:test'), assert = require('node:assert');
const { byDay, feverStreak, medStatus, medSpans } = require('../stats.js');
const now = new Date('2026-10-18T12:00:00').getTime(), D = 864e5;
const e = (daysAgo, o = {}) => ({ ts: now - daysAgo * D, fatigue: 3, fever: false, onMeds: true, ...o });

test('fever streak counts back from today', () => {
  assert.equal(feverStreak(byDay([e(2, { fever: true }), e(1, { fever: true }), e(0, { fever: true })]), now), 3);
});
test('streak survives a not-yet-logged today', () => {
  assert.equal(feverStreak(byDay([e(2, { fever: true }), e(1, { fever: true })]), now), 2);
});
test('streak is 0 after a clear day', () => {
  assert.equal(feverStreak(byDay([e(2, { fever: true }), e(1), e(0)]), now), 0);
});
test('med status reports days since change', () => {
  const m = medStatus([e(5), e(4, { onMeds: false }), e(2, { onMeds: false })], now);
  assert.deepEqual(m, { onMeds: false, days: 4 });
});
test('med spans merge and clip', () => {
  const s = medSpans([e(5), e(4), e(3, { onMeds: false })], now - 10 * D, now);
  assert.equal(s.length, 2); assert.equal(s[0].onMeds, true);
});

test('sheet rows are formatted for Sheets', () => {
  const G = require('../gsync.js');
  const r = G.rows([{ ts: new Date('2026-10-18T09:05:00').getTime(), fatigue: 4, fever: true, temp: 101.2, onMeds: false, hr: 72, note: 'rough' }]);
  assert.deepEqual(r[0], ['2026-10-18', '09:05', 4, 'Yes', 101.2, 'Off', 72, 'rough']);
});

test('daily heart rate averages only entries that have one', () => {
  const d = byDay([e(0, { hr: 70 }), e(0, { hr: 90 }), e(0)])[0];
  assert.equal(d.hr, 80);
  assert.equal(byDay([e(0)])[0].hr, null);
});
test('csv has hr column', () => {
  const { toCSV } = require('../stats.js');
  assert.match(toCSV([e(0, { hr: 66 })]), /on_meds,hr_bpm,note\n.*,1,66,""$/);
});

test('sheet rows round-trip, including serial-number dates', () => {
  const G = require('../gsync.js');
  const ts = new Date('2026-10-18T09:05:00').getTime();
  const [r] = G.rows([{ ts, fatigue: 4, fever: true, temp: 101.2, onMeds: false, hr: 72, note: 'rough' }]);
  assert.deepEqual(G.parse([r])[0], { ts, fatigue: 4, fever: true, temp: 101.2, onMeds: false, hr: 72, note: 'rough' });
  const serial = [46313, 9 * 60 / 1440 + 5 / 1440, 4, 'Yes', 101.2, 'Off', 72, 'rough'];
  assert.equal(G.parse([serial])[0].ts, ts);
  assert.equal(G.parse([G.HEADER]).length, 0);
});
test('sheet link or bare id is accepted', () => {
  const G = require('../gsync.js'), id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
  assert.equal(G.parseId(`https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`), id);
  assert.equal(G.parseId(id), id); assert.equal(G.parseId('nope'), '');
});
test('merge adds new entries from both sides', () => {
  const G = require('../gsync.js'), a = { ts: 6e4 * 10 }, b = { ts: 6e4 * 20 };
  assert.deepEqual(G.merge([a], [b], []).map(e => e.ts), [a.ts, b.ts]);
});
test('merge propagates deletes from either side but never wipes a fresh device', () => {
  const G = require('../gsync.js'), a = { ts: 6e4 * 10 }, b = { ts: 6e4 * 20 }, synced = [10, 20];
  assert.deepEqual(G.merge([a, b], [a], synced), [a]);   // deleted in the sheet elsewhere
  assert.deepEqual(G.merge([a], [a, b], synced), [a]);   // deleted on this device
  assert.deepEqual(G.merge([], [a, b], []), [a, b]);     // new device pulls everything
});
