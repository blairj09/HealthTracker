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
