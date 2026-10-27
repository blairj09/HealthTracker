const $ = s => document.querySelector(s), app = $('#app');
const FATIGUE = [['😀', 'None'], ['🙂', 'Mild'], ['😐', 'Moderate'], ['😟', 'Heavy'], ['😫', 'Wiped']];
const state = { tab: 'checkin', range: 14, draft: null, entries: [], settings: {} };
const DEFAULTS = { sheetId: '', lastSync: 0, push: false, pushCode: '', remind: false, perDay: 4, from: '09:00', to: '20:00' };

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = ts => new Date(ts).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }

async function load() {
  state.entries = await DB.allEntries();
  for (const k in DEFAULTS) state.settings[k] = await DB.getSetting(k, DEFAULTS[k]);
}
const newDraft = () => ({ fatigue: null, fever: null, temp: '', hr: '', onMeds: state.entries.length ? state.entries.at(-1).onMeds : true, note: '' });

// ---------- views ----------
function viewCheckin() {
  const d = state.draft ||= newDraft();
  const last = state.entries.at(-1);
  app.innerHTML = `<h1>How are you feeling?</h1>
  ${last ? `<p class="hint">Last check-in ${fmt(last.ts)}</p>` : ''}
  <div class="card"><p class="q">Fatigue right now</p>
    <div class="scale">${FATIGUE.map((f, i) => `<button data-fat="${i + 1}" class="${d.fatigue === i + 1 ? 'on' : ''}"><b>${f[0]}</b>${f[1]}</button>`).join('')}</div></div>
  <div class="card"><p class="q">Fever?</p>
    <div class="seg"><button data-fev="0" class="${d.fever === false ? 'on' : ''}">No</button><button data-fev="1" class="bad ${d.fever ? 'on' : ''}">Yes</button></div>
    ${d.fever ? `<label class="f" for="temp">Temperature °F, optional</label><input id="temp" type="number" inputmode="decimal" step="0.1" min="90" max="110" value="${esc(d.temp)}">` : ''}</div>
  <div class="card"><label class="q" for="hr">Heart rate <span class="hint">optional, from your watch</span></label><input id="hr" type="number" inputmode="numeric" min="30" max="220" placeholder="bpm" value="${esc(d.hr)}"></div>
  <div class="card"><button class="toggle" id="meds" role="switch" aria-checked="${d.onMeds}"><span><span><span class="q">Taking medication</span><span class="hint">${d.onMeds ? 'On meds' : 'Off meds (on a break)'}</span></span></span><span class="sw"></span></button></div>
  <div class="card"><label class="q" for="note">Note <span class="hint">optional</span></label><textarea id="note" rows="2" placeholder="Nausea, appetite, anything else…">${esc(d.note)}</textarea></div>
  <div class="save-bar"><button class="primary" id="save" ${d.fatigue && d.fever !== null ? '' : 'disabled'}>Save check-in</button></div>`;
  app.querySelectorAll('[data-fat]').forEach(b => b.onclick = () => { d.fatigue = +b.dataset.fat; viewCheckin(); });
  app.querySelectorAll('[data-fev]').forEach(b => b.onclick = () => { d.fever = b.dataset.fev === '1'; if (!d.fever) d.temp = ''; viewCheckin(); });
  $('#meds').onclick = () => { d.onMeds = !d.onMeds; viewCheckin(); };
  $('#hr').oninput = e => d.hr = e.target.value;
  $('#note').oninput = e => d.note = e.target.value;
  if ($('#temp')) $('#temp').oninput = e => d.temp = e.target.value;
  $('#save').onclick = async () => {
    await DB.addEntry({ ts: Date.now(), fatigue: d.fatigue, fever: d.fever, temp: d.temp ? +d.temp : null, hr: d.hr ? Math.round(+d.hr) : null, onMeds: d.onMeds, note: d.note.trim() });
    state.draft = null; await load(); toast('Saved ✓'); if (GSync.canAuto()) syncSheets(false); scheduleReminders(); show('trends');
  };
}

function viewTrends() {
  const days = byDay(state.entries), hrDays = days.filter(d => d.hr != null), streak = feverStreak(days), med = medStatus(state.entries);
  const recent = days.slice(-7), avg = recent.length ? (recent.reduce((a, d) => a + d.fatigue, 0) / recent.length).toFixed(1) : '–';
  app.innerHTML = `<h1>Trends</h1>
  <div class="tiles">
    <div class="tile ${streak >= 3 ? 'alert' : ''}"><div class="n">${streak} day${streak === 1 ? '' : 's'}</div><div class="l">${streak >= 3 ? 'Fever streak. Consider calling your care team' : 'Current fever streak'}</div></div>
    <div class="tile"><div class="n">${med ? (med.onMeds ? 'On' : 'Off') + ' · ' + med.days + 'd' : '–'}</div><div class="l">Medication status</div></div>
    <div class="tile"><div class="n">${avg}</div><div class="l">Avg fatigue, last 7 days (1–5)</div></div>
    <div class="tile"><div class="n">${recent.filter(d => d.fever).length}/${recent.length}</div><div class="l">Fever days, last 7</div></div>
    ${hrDays.length ? `<div class="tile"><div class="n">${Math.round(hrDays.slice(-7).reduce((a, d) => a + d.hr, 0) / hrDays.slice(-7).length)} bpm</div><div class="l">Avg heart rate, recent days</div></div>` : ''}
  </div>
  <div class="range">${[7, 14, 30, 90].map(r => `<button data-r="${r}" class="${state.range === r ? 'on' : ''}">${r}d</button>`).join('')}</div>
  <div class="card">${state.entries.length ? trendChart(state.entries, days, state.range) : '<p class="hint">No check-ins yet. Do your first one!</p>'}
  <div class="legend"><span><i style="background:var(--green)"></i>Fatigue, daily avg</span><span><i class="sq" style="background:var(--med)"></i>On meds</span><span><i style="background:var(--red)"></i>Fever day</span></div></div>
  ${hrDays.length ? `<div class="card"><p class="q">Heart rate <span class="hint">daily avg, bpm</span></p>${hrChart(hrDays, state.range)}</div>` : ''}`;
  app.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { state.range = +b.dataset.r; viewTrends(); });
}

function viewHistory() {
  app.innerHTML = `<h1>History</h1><div class="list">${[...state.entries].reverse().map(e => `<div class="row"><div><b class="when">${fmt(e.ts)}</b>
    <span class="pill fat">Fatigue ${e.fatigue}/5</span> ${e.fever ? `<span class="pill f">Fever${e.temp ? ' ' + e.temp + '°' : ''}</span>` : ''} ${e.hr ? `<span class="pill">${e.hr} bpm</span>` : ''} <span class="pill m">${e.onMeds ? 'On meds' : 'Off meds'}</span>
    ${e.note ? `<span class="hint note">${esc(e.note)}</span>` : ''}</div><button class="ghost danger" data-del="${e.id}" aria-label="Delete">✕</button></div>`).join('') || '<p class="hint">Nothing yet.</p>'}</div>`;
  app.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('Delete this check-in?')) { await DB.deleteEntry(+b.dataset.del); await load(); viewHistory(); } });
}

function viewSettings() {
  const s = state.settings;
  app.innerHTML = `<h1>Settings</h1>
  <div class="card"><button class="toggle" id="rem" role="switch" aria-checked="${s.remind}"><span><span class="q" style="margin:0">Random check-in reminders</span><br><span class="hint">Random times each day, inside your window</span></span><span class="sw"></span></button>
    <label class="f">Check-ins per day</label><select id="per">${[2, 3, 4, 5, 6].map(n => `<option ${n === s.perDay ? 'selected' : ''}>${n}</option>`).join('')}</select>
    <label class="f">Between</label><div style="display:flex;gap:8px"><input id="from" type="time" value="${s.from}"><input id="to" type="time" value="${s.to}"></div>
    ${state.pushKey ? `<button class="toggle" id="push" role="switch" aria-checked="${s.push}" style="margin-top:14px"><span><span class="q" style="margin:0">Reminders when the app is closed</span><br><span class="hint">Sent from a server so they arrive on time</span></span><span class="sw"></span></button>` : ''}
    <p class="hint">${state.pushKey ? 'Without it, reminders only fire while the app is open or recently used.' : 'Reminders fire while the app is open or recently used.'}</p></div>
  <div class="card"><p class="q">Your data</p><p class="hint">Stored only on this phone.</p>
    ${window.GOOGLE_CLIENT_ID ? `<button class="primary" id="gs" style="min-height:52px;margin-bottom:10px">${s.sheetId ? 'Sync to Google Sheets now' : 'Connect Google Sheets'}</button>
    <p class="hint">${s.sheetId ? `Last synced ${s.lastSync ? fmt(s.lastSync) : 'never'}. Open the sheet in Google Drive (“Health Check-Ins”) and share it with family from there.` : 'Creates a sheet in your Google Drive. The app can only see the sheet it creates.'}</p>` : ''}
    <button class="ghost" id="share">Share CSV</button> <button class="ghost" id="csv">Export CSV</button> <button class="ghost" id="imp">Import CSV</button> <input id="file" type="file" accept=".csv" hidden></div>`;
  const save = async () => { for (const k in DEFAULTS) await DB.setSetting(k, s[k]); scheduleReminders(); if (s.push) pushSync().catch(() => {}); };
  $('#rem').onclick = async () => {
    if (!s.remind && 'Notification' in window && Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return toast('Notifications blocked');
    s.remind = !s.remind; await save(); viewSettings();
  };
  if ($('#push')) $('#push').onclick = async () => {
    try { await (s.push ? pushOff() : pushOn()); } catch (e) { toast(e.message); }
    viewSettings();
  };
  $('#per').onchange = e => { s.perDay = +e.target.value; save(); };
  $('#from').onchange = e => { s.from = e.target.value; save(); };
  $('#to').onchange = e => { s.to = e.target.value; save(); };
  if ($('#gs')) $('#gs').onclick = () => syncSheets(true).then(viewSettings);
  $('#share').onclick = async () => {
    const f = new File([toCSV(state.entries)], 'health-checkins.csv', { type: 'text/csv' });
    if (navigator.canShare?.({ files: [f] })) navigator.share({ files: [f], title: 'Health check-ins' }).catch(() => {}); else toast('Sharing not supported; use Export');
  };
  $('#csv').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([toCSV(state.entries)], { type: 'text/csv' })); a.download = 'health-checkins.csv'; a.click(); };
  $('#imp').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    const [head, ...lines] = (await e.target.files[0].text()).trim().split('\n'); let n = 0;
    const hasHr = head.includes('hr_bpm'), noteAt = hasHr ? 6 : 5;
    for (const l of lines) {
      const c = l.split(','), ts = Date.parse(c[0]); if (!ts || !+c[1]) continue;
      await DB.addEntry({ ts, fatigue: +c[1], fever: c[2] === '1', temp: c[3] ? +c[3] : null, onMeds: c[4] === '1', hr: hasHr && c[5] ? +c[5] : null, note: (c.slice(noteAt).join(',') || '').replace(/^"|"$/g, '').replace(/""/g, '"') }); n++;
    }
    await load(); toast(`Imported ${n}`);
  };
}

// ---------- web push (reminders while the app is closed) ----------
const b64 = s => Uint8Array.from(atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
async function pushPost(path, body) {
  const r = await fetch('api/' + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 401) { state.settings.pushCode = ''; await DB.setSetting('pushCode', ''); throw new Error('Wrong setup code'); }
  if (!r.ok) throw new Error('Server error ' + r.status);
}
async function pushSync() {
  const s = state.settings, reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await pushPost('subscribe', { code: s.pushCode, subscription: sub.toJSON(), perDay: s.perDay, from: s.from, to: s.to, tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
}
async function pushOn() {
  const s = state.settings;
  if (!s.pushCode) { s.pushCode = (prompt('Enter the setup code') || '').trim(); if (!s.pushCode) return; }
  if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') throw new Error('Notifications blocked');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(state.pushKey) });
  s.push = true;
  try { await pushSync(); } catch (e) { s.push = false; await sub.unsubscribe(); await DB.setSetting('pushCode', s.pushCode); throw e; }
  await DB.setSetting('push', true); await DB.setSetting('pushCode', s.pushCode); scheduleReminders();
  toast('Background reminders on ✓');
}
async function pushOff() {
  const s = state.settings, reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
  try { await pushPost('unsubscribe', { code: s.pushCode }); } catch (e) { /* still turn off locally */ }
  if (sub) await sub.unsubscribe();
  s.push = false; await DB.setSetting('push', false); scheduleReminders();
}
async function detectPush() {
  if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;
  try { const r = await fetch('api/vapid'); if (r.ok) state.pushKey = (await r.json()).key; } catch (e) { /* offline or not configured */ }
}

// ---------- google sheets ----------
async function syncSheets(interactive) {
  if (!window.GOOGLE_CLIENT_ID || (!interactive && !state.settings.sheetId)) return;
  try {
    const id = await GSync.sync(state.entries, state.settings.sheetId, interactive);
    state.settings.sheetId = id; state.settings.lastSync = Date.now();
    await DB.setSetting('sheetId', id); await DB.setSetting('lastSync', state.settings.lastSync);
    if (interactive) toast('Synced to Google Sheets ✓');
  } catch (e) { if (interactive) toast(e.message); }
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
  if (!state.settings.remind || state.settings.push) return;
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
  detectPush().then(() => state.tab === 'settings' && viewSettings());
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
