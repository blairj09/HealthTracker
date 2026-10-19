// Two-way sync of check-ins with a Google Sheet. Each sync reads the sheet, merges it with
// the device's data, then writes the merged result back, so any device on the sheet sees the same history.
// Uses the spreadsheets scope so a second person/device can open a sheet someone else shared or created.
const GSync = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const HEADER = ['Date', 'Time', 'Fatigue (1-5)', 'Fever', 'Temp (F)', 'On meds', 'Heart rate (bpm)', 'Note'];
  let token = null, expires = 0, client = null;

  const rows = entries => entries.map(e => {
    const d = new Date(e.ts), p = n => String(n).padStart(2, '0');
    return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}`,
      e.fatigue, e.fever ? 'Yes' : 'No', e.temp ?? '', e.onMeds ? 'On' : 'Off', e.hr ?? '', e.note || ''];
  });

  const loadGsi = () => new Promise((res, rej) => {
    if (window.google?.accounts?.oauth2) return res();
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res; s.onerror = () => rej(new Error('Could not reach Google (offline?)')); document.head.appendChild(s);
  });
  // Must be called from a tap the first time (opens Google's consent popup).
  async function auth(interactive) {
    if (token && Date.now() < expires - 6e4) return token;
    await loadGsi();
    return new Promise((res, rej) => {
      client ||= google.accounts.oauth2.initTokenClient({ client_id: window.GOOGLE_CLIENT_ID, scope: SCOPE, callback: () => {} });
      client.callback = r => r.access_token ? (token = r.access_token, expires = Date.now() + r.expires_in * 1e3, res(token)) : rej(new Error(r.error || 'Sign-in failed'));
      client.error_callback = e => rej(new Error(e.type || 'Sign-in cancelled'));
      client.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  }
  const api = async (url, opts = {}) => {
    const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    if (!r.ok) throw new Error('Google API ' + r.status);
    return r.json();
  };
  async function ensureSheet(id) {
    if (id) { try { await api(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`); return id; } catch (e) { /* deleted: recreate */ } }
    const s = await api('https://sheets.googleapis.com/v4/spreadsheets', { method: 'POST', body: JSON.stringify({ properties: { title: 'Health Check-Ins' }, sheets: [{ properties: { title: 'Check-ins', gridProperties: { frozenRowCount: 1 } } }] }) });
    return s.spreadsheetId;
  }
  const key = ts => Math.floor(ts / 6e4);
  // Accepts a pasted sheet URL or a bare id.
  const parseId = v => (String(v).match(/\/d\/([\w-]+)/) || String(v).trim().match(/^([\w-]{20,})$/) || [])[1] || '';
  // Sheets may hand back dates as serial numbers (default) or text, depending on how the cell was typed.
  const parseDay = v => {
    if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30 + Math.floor(v))); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; }
    const m = String(v).match(/^(\d{4})-(\d{1,2})-(\d{1,2})/) || String(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) return null;
    return m[1].length === 4 ? [+m[1], m[2] - 1, +m[3]] : [+m[3], m[1] - 1, +m[2]];
  };
  const parseMin = v => {
    if (typeof v === 'number') return Math.round((v % 1) * 1440);
    const m = String(v).match(/^(\d{1,2}):(\d{2})(?:\s*([AP]M))?/i);
    if (!m) return null;
    let h = +m[1] % (m[3] ? 12 : 24); if (m[3] && m[3].toUpperCase() === 'PM') h += 12;
    return h * 60 + +m[2];
  };
  const num = v => (v === '' || v == null || isNaN(+v) ? null : +v);
  // Inverse of rows(); skips the header and anything it can't read.
  const parse = values => (values || []).flatMap(r => {
    const day = parseDay(r[0]), min = parseMin(r[1]), fatigue = num(r[2]);
    if (!day || min == null || !fatigue) return [];
    return [{ ts: new Date(day[0], day[1], day[2], 0, min).getTime(), fatigue, fever: r[3] === 'Yes', temp: num(r[4]), onMeds: r[5] === 'On', hr: num(r[6]), note: r[7] ?? '' }];
  });
  // Three-way merge. `synced` holds the keys both sides had after the last sync, so a key missing from
  // one side now means it was deleted there, not that the other side's copy is new. Local copy wins on conflict.
  function merge(local, remote, synced = []) {
    const was = new Set(synced), loc = new Map(local.map(e => [key(e.ts), e])), rem = new Map(remote.map(e => [key(e.ts), e]));
    const out = [];
    for (const [k, e] of loc) if (rem.has(k) || !was.has(k)) out.push(e);
    for (const [k, e] of rem) if (!loc.has(k) && !was.has(k)) out.push(e);
    return out.sort((a, b) => a.ts - b.ts);
  }
  // Reads the sheet, merges, and rewrites it. Returns the merged entries; the caller stores them.
  async function sync(entries, sheetId, synced, interactive) {
    await auth(interactive);
    const id = await ensureSheet(sheetId), base = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Check-ins`;
    const remote = parse((await api(`${base}?valueRenderOption=UNFORMATTED_VALUE`)).values);
    const merged = merge(entries, remote, synced);
    await api(`${base}:clear`, { method: 'POST', body: '{}' });
    await api(`${base}!A1?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ values: [HEADER, ...rows(merged)] }) });
    return { id, entries: merged };
  }
  return { sync, rows, parse, merge, parseId, key, HEADER, canAuto: () => !!token && Date.now() < expires - 6e4 };
})();
if (typeof module !== 'undefined') module.exports = GSync;
