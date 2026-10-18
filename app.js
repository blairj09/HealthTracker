const $ = s => document.querySelector(s), app = $('#app');
const FATIGUE = [['😀', 'None'], ['🙂', 'Mild'], ['😐', 'Moderate'], ['😟', 'Heavy'], ['😫', 'Wiped']];
const state = { tab: 'checkin', range: 14, draft: null, entries: [], settings: {} };
const DEFAULTS = { remind: false, perDay: 4, from: '09:00', to: '20:00' };

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = ts => new Date(ts).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }

async function load() {
  state.entries = await DB.allEntries();
  for (const k in DEFAULTS) state.settings[k] = await DB.getSetting(k, DEFAULTS[k]);
}
const newDraft = () => ({ fatigue: null, fever: null, temp: '', onMeds: state.entries.length ? state.entries.at(-1).onMeds : true, note: '' });

// ---------- views ----------
function viewCheckin() {
  const d = state.draft ||= newDraft();
  const last = state.entries.at(-1);
  app.innerHTML = `<h1>How are you feeling?</h1>
  ${last ? `<p class="hint">Last check-in: ${fmt(last.ts)}</p>` : ''}
  <div class="card"><p class="q">Fatigue right now</p>
    <div class="scale">${FATIGUE.map((f, i) => `<button data-fat="${i + 1}" class="${d.fatigue === i + 1 ? 'on' : ''}"><b>${f[0]}</b>${f[1]}</button>`).join('')}</div></div>
  <div class="card"><p class="q">Fever?</p>
    <div class="seg"><button data-fev="0" class="${d.fever === false ? 'on' : ''}">No</button><button data-fev="1" class="bad ${d.fever ? 'on' : ''}">Yes</button></div>
    ${d.fever ? `<label class="f" for="temp">Temperature °F (optional)</label><input id="temp" type="number" inputmode="decimal" step="0.1" min="90" max="110" value="${esc(d.temp)}">` : ''}</div>
  <div class="card"><button class="toggle" id="meds" role="switch" aria-checked="${d.onMeds}"><span><span class="q" style="margin:0">Taking medication</span><br><span class="hint">${d.onMeds ? 'On meds' : 'Off meds (on a break)'}</span></span><span class="sw"></span></button></div>
  <div class="card"><label class="f" for="note" style="margin-top:0">Note (optional)</label><textarea id="note" rows="2" placeholder="Nausea, appetite, anything else…">${esc(d.note)}</textarea></div>
  <button class="primary" id="save" ${d.fatigue && d.fever !== null ? '' : 'disabled style="opacity:.45"'}>Save check-in</button>`;
  app.querySelectorAll('[data-fat]').forEach(b => b.onclick = () => { d.fatigue = +b.dataset.fat; viewCheckin(); });
  app.querySelectorAll('[data-fev]').forEach(b => b.onclick = () => { d.fever = b.dataset.fev === '1'; if (!d.fever) d.temp = ''; viewCheckin(); });
  $('#meds').onclick = () => { d.onMeds = !d.onMeds; viewCheckin(); };
  $('#note').oninput = e => d.note = e.target.value;
  if ($('#temp')) $('#temp').oninput = e => d.temp = e.target.value;
  $('#save').onclick = async () => {
    await DB.addEntry({ ts: Date.now(), fatigue: d.fatigue, fever: d.fever, temp: d.temp ? +d.temp : null, onMeds: d.onMeds, note: d.note.trim() });
    state.draft = null; await load(); toast('Saved ✓'); scheduleReminders(); show('trends');
  };
}

function viewTrends() {
  const days = byDay(state.entries), streak = feverStreak(days), med = medStatus(state.entries);
  const recent = days.slice(-7), avg = recent.length ? (recent.reduce((a, d) => a + d.fatigue, 0) / recent.length).toFixed(1) : '–';
  app.innerHTML = `<h1>Trends</h1>
  <div class="tiles">
    <div class="tile ${streak >= 3 ? 'alert' : ''}"><div class="n">${streak} day${streak === 1 ? '' : 's'}</div><div class="l">${streak >= 3 ? 'Fever streak — consider calling your care team' : 'Current fever streak'}</div></div>
    <div class="tile"><div class="n">${med ? (med.onMeds ? 'On' : 'Off') + ' · ' + med.days + 'd' : '–'}</div><div class="l">Medication status</div></div>
    <div class="tile"><div class="n">${avg}</div><div class="l">Avg fatigue, last 7 days (1–5)</div></div>
    <div class="tile"><div class="n">${recent.filter(d => d.fever).length}/${recent.length}</div><div class="l">Fever days, last 7</div></div>
  </div>
  <div class="range">${[7, 14, 30, 90].map(r => `<button data-r="${r}" class="${state.range === r ? 'on' : ''}">${r}d</button>`).join('')}</div>
  <div class="card">${state.entries.length ? trendChart(state.entries, days, state.range) : '<p class="hint">No check-ins yet. Do your first one!</p>'}
  <div class="legend"><span><i style="background:var(--green)"></i>Fatigue (daily avg)</span><span><i style="background:var(--med)"></i>On meds</span><span><i style="background:var(--red)"></i>Fever day</span></div></div>`;
  app.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { state.range = +b.dataset.r; viewTrends(); });
}

function viewHistory() {
  app.innerHTML = `<h1>History</h1><div class="card">${[...state.entries].reverse().map(e => `<div class="row"><div><b>${fmt(e.ts)}</b><br>
    <span class="pill">Fatigue ${e.fatigue}/5</span> ${e.fever ? `<span class="pill f">Fever${e.temp ? ' ' + e.temp + '°' : ''}</span>` : ''} <span class="pill m">${e.onMeds ? 'On meds' : 'Off meds'}</span>
    ${e.note ? `<br><span class="hint">${esc(e.note)}</span>` : ''}</div><button class="ghost danger" data-del="${e.id}" aria-label="Delete">✕</button></div>`).join('') || '<p class="hint">Nothing yet.</p>'}</div>`;
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Delete this check-in?')) { await DB.deleteEntry(+b.dataset.del); await load(); viewHistory(); } });
}

function viewSettings() {
  const s = state.settings;
  app.innerHTML = `<h1>Settings</h1>
  <div class="card"><button class="toggle" id="rem" role="switch" aria-checked="${s.remind}"><span><span class="q" style="margin:0">Random check-in reminders</span><br><span class="hint">Random times each day, inside your window</span></span><span class="sw"></span></button>
    <label class="f">Check-ins per day</label><select id="per">${[2, 3, 4, 5, 6].map(n => `<option ${n === s.perDay ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <label class="f">Between</label><div style="display:flex;gap:8px"><input id="from" type="time" value="${s.from}"><input id="to" type="time" value="${s.to}"></div>
    <p class="hint">Reminders fire while the app is open or recently used. For fully reliable background alerts see the README.</p></div>
  <div class="card"><p class="q">Your data</p><p class="hint">Stored only on this phone.</p>
    <button class="ghost" id="csv">Export CSV</button> <button class="ghost" id="imp">Import CSV</button> <input id="file" type="file" accept=".csv" hidden></div>`;
  const save = async () => { for (const k in DEFAULTS) await DB.setSetting(k, s[k]); scheduleReminders(); };
  $('#rem').onclick = async () => {
    if (!s.remind && 'Notification' in window && Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return toast('Notifications blocked');
    s.remind = !s.remind; await save(); viewSettings();
  };
  $('#per').onchange = e => { s.perDay = +e.target.value; save(); };
  $('#from').onchange = e => { s.from = e.target.value; save(); };
  $('#to').onchange = e => { s.to = e.target.value; save(); };
  $('#csv').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCSV(state.entries)], { type: 'text/csv' })); a.download = 'health-checkins.csv'; a.click(); };
  $('#imp').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const lines = (await e.target.files[0].text()).trim().split('\n').slice(1); let n = 0;
    for (const l of lines) { const c = l.split(','); const ts = Date.parse(c[0]); if (!ts || !+c[1]) continue; await DB.addEntry({ ts, fatigue: +c[1], fever: c[2] === '1', temp: c[3] ? +c[3] : null, onMeds: c[4] === '1', note: (c.slice(5).join(',') || '').replace(/^"|"$/g, '').replace(/""/g, '"') }); n++; }
    await load(); toast(`Imported ${n}`);
  };
}

// ---------- reminders ----------
let timers = [];
function plannedTimes() {
  const s = state.settings, today = startOfDay(Date.now());
  const [fh, fm] = s.from.split(':').map(Number), [th, tm] = s.to.split(':').map(Number);
  const a = today + (fh * 60 + fm) * 6e4, b = today + (th * 60 + tm) * 6e4;
  if (b <= a) return [];
  // Deterministic per-day jitter so times are stable across reloads. One slot per equal segment.
  let seed = [...dayKey(today)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const seg = (b - a) / s.perDay;
  return Array.from({ length: s.perDay }, (_, i) => Math.round(a + seg * (i + 0.15 + rnd() * 0.7)));
}
async function notify() {
  const reg = await navigator.serviceWorker?.ready;
  const opts = { body: 'Tap to log how you’re feeling.', icon: 'icons/icon-192.png', tag: 'checkin', renotify: true };
  if (reg && Notification.permission === 'granted') reg.showNotification('Time for a quick check-in', opts);
}
function scheduleReminders() {
  timers.forEach(clearTimeout); timers = [];
  if (!state.settings.remind) return;
  const last = state.entries.at(-1)?.ts ?? 0, now = Date.now();
  plannedTimes().forEach(t => {
    if (t > now) timers.push(setTimeout(notify, t - now));
    else if (now - t < 36e5 && last < t && t > (scheduleReminders.fired ||= 0)) { scheduleReminders.fired = t; notify(); } // missed within the last hour
  });
}

// ---------- shell ----------
const views = { checkin: viewCheckin, trends: viewTrends, history: viewHistory, settings: viewSettings };
function show(tab) {
  state.tab = tab;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  views[tab](); scrollTo(0, 0);
}
document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => show(b.dataset.tab));
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleReminders(); });
(async () => {
  await load(); show(new URLSearchParams(location.search).get('tab') || 'checkin'); scheduleReminders();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
