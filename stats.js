// Pure helpers over entries: {ts, fatigue 1-5, fever bool, temp?, onMeds bool, note?}
const DAY = 864e5;
const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

function byDay(entries) {
  const m = new Map();
  for (const e of entries) {
    const k = dayKey(e.ts);
    if (!m.has(k)) m.set(k, { key: k, day: startOfDay(e.ts), n: 0, fatigueSum: 0, fever: false, maxTemp: null, onMeds: false });
    const d = m.get(k);
    d.n++; d.fatigueSum += e.fatigue; d.fever ||= e.fever; d.onMeds = e.onMeds; // last entry of the day wins
    if (e.temp != null) d.maxTemp = Math.max(d.maxTemp ?? 0, e.temp);
  }
  return [...m.values()].map(d => ({ ...d, fatigue: d.fatigueSum / d.n })).sort((a, b) => a.day - b.day);
}

// Consecutive calendar days (ending today or yesterday) that had a fever.
function feverStreak(days, now = Date.now()) {
  const fev = new Set(days.filter(d => d.fever).map(d => d.key));
  let t = startOfDay(now), n = 0;
  if (!fev.has(dayKey(t))) t -= DAY;
  while (fev.has(dayKey(t))) { n++; t -= DAY; }
  return n;
}

// Days since onMeds last changed, plus current state.
function medStatus(entries, now = Date.now()) {
  if (!entries.length) return null;
  const cur = entries[entries.length - 1].onMeds;
  let since = entries[entries.length - 1].ts;
  for (let i = entries.length - 2; i >= 0 && entries[i].onMeds === cur; i--) since = entries[i].ts;
  return { onMeds: cur, days: Math.floor((startOfDay(now) - startOfDay(since)) / DAY) };
}

// Contiguous medication on/off spans for chart shading, clipped to [from,to].
function medSpans(entries, from, to) {
  const spans = [];
  entries.forEach((e, i) => {
    const end = i + 1 < entries.length ? entries[i + 1].ts : to;
    const a = Math.max(e.ts, from), b = Math.min(end, to);
    if (b <= a) return;
    const last = spans[spans.length - 1];
    if (last && last.onMeds === e.onMeds && last.b === a) last.b = b; else spans.push({ a, b, onMeds: e.onMeds });
  });
  return spans;
}

function toCSV(entries) {
  const q = s => '"' + String(s ?? '').replace(/"/g, '""') + '"';
  return 'timestamp,fatigue_1to5,fever,temp_f,on_meds,note\n' + entries.map(e =>
    [new Date(e.ts).toISOString(), e.fatigue, e.fever ? 1 : 0, e.temp ?? '', e.onMeds ? 1 : 0, q(e.note)].join(',')).join('\n');
}
if (typeof module !== 'undefined') module.exports = { byDay, feverStreak, medStatus, medSpans, toCSV, dayKey, startOfDay, DAY };
