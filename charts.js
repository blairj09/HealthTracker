// Dependency-free SVG charts.
const svgNS = (w, h, body) => `<svg class="chart" viewBox="0 0 ${w} ${h}" role="img">${body}</svg>`;

// Fatigue (daily average, 1-5) over a medication on/off background, with a fever strip underneath.
function trendChart(entries, days, rangeDays, now = Date.now()) {
  const W = 360, H = 230, L = 26, R = 8, T = 10, plotB = 170, stripT = 182, stripH = 14;
  const to = startOfDay(now) + DAY, from = to - rangeDays * DAY;
  const x = ts => L + (ts - from) / (to - from) * (W - L - R);
  const y = f => plotB - (f - 1) / 4 * (plotB - T);
  let s = '';
  for (const sp of medSpans(entries, from, to))
    s += `<rect x="${x(sp.a)}" y="${T}" width="${x(sp.b) - x(sp.a)}" height="${plotB - T}" fill="${sp.onMeds ? 'var(--med)' : 'transparent'}"/>`;
  for (let f = 1; f <= 5; f++) s += `<line x1="${L}" x2="${W - R}" y1="${y(f)}" y2="${y(f)}" stroke="var(--line)"/><text x="${L - 6}" y="${y(f) + 4}" text-anchor="end">${f}</text>`;
  const step = rangeDays <= 14 ? 1 : rangeDays <= 30 ? 7 : 14;
  for (let t = from, i = 0; t < to; t += DAY, i++) if (i % step === 0) {
    const d = new Date(t + DAY / 2); s += `<text x="${x(t + DAY / 2)}" y="${H - 4}" text-anchor="middle">${d.getMonth() + 1}/${d.getDate()}</text>`;
  }
  const pts = days.filter(d => d.day >= from).map(d => [x(d.day + DAY / 2), y(d.fatigue), d]);
  if (pts.length > 1) s += `<polyline fill="none" stroke="var(--green)" stroke-width="2.5" stroke-linejoin="round" points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
  for (const [px, py] of pts) s += `<circle cx="${px}" cy="${py}" r="${rangeDays > 30 ? 2.5 : 4}" fill="var(--green)"/>`;
  s += `<text x="${L}" y="${stripT - 2}" style="font-size:10px">Fever</text>`;
  for (const d of days.filter(d => d.day >= from)) {
    const w = (W - L - R) / rangeDays;
    s += `<rect x="${x(d.day) + 0.5}" y="${stripT + 4}" width="${Math.max(w - 1, 1)}" height="${stripH}" rx="2" fill="${d.fever ? 'var(--red)' : 'var(--line)'}"/>`;
  }
  return svgNS(W, H, s);
}
