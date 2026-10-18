// One-way sync of all check-ins to a Google Sheet in the user's own Drive.
// Uses only the drive.file scope: the app can touch just the sheet it created.
const GSync = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const HEADER = ['Date', 'Time', 'Fatigue (1-5)', 'Fever', 'Temp (F)', 'On meds', 'Note'];
  let token = null, expires = 0, client = null;

  const rows = entries => entries.map(e => {
    const d = new Date(e.ts), p = n => String(n).padStart(2, '0');
    return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}`,
      e.fatigue, e.fever ? 'Yes' : 'No', e.temp ?? '', e.onMeds ? 'On' : 'Off', e.note || ''];
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
  // Rewrites the whole sheet, so edits and deletes on the phone carry over. Data is tiny.
  async function sync(entries, sheetId, interactive) {
    await auth(interactive);
    const id = await ensureSheet(sheetId), base = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Check-ins`;
    await api(`${base}:clear`, { method: 'POST', body: '{}' });
    await api(`${base}!A1?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ values: [HEADER, ...rows(entries)] }) });
    return id;
  }
  return { sync, rows, HEADER, canAuto: () => !!token && Date.now() < expires - 6e4 };
})();
if (typeof module !== 'undefined') module.exports = GSync;
