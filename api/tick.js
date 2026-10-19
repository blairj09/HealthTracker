const webpush = require('web-push');
const { redis, safeEqual, zoned, planned } = require('./_lib');

// Called every ~15 minutes by .github/workflows/tick.yml. Sends a push for any of today's random
// slots that has come due and has not been sent yet.
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual((req.headers.authorization || '').replace(/^Bearer /, ''), secret)) return res.status(401).end();

  const raw = await redis(['GET', 'sub']);
  if (!raw) return res.json({ sent: 0, reason: 'no subscription' });
  const cfg = JSON.parse(raw);
  const { date, minutes } = zoned(new Date(), cfg.tz);
  const due = planned(cfg, date).map((m, i) => ({ m, i })).filter(({ m }) => minutes >= m && minutes - m < 90);

  let fresh = 0;
  for (const { i } of due) if (await redis(['SADD', `sent:${date}`, String(i)]) === 1) fresh++;
  if (fresh) await redis(['EXPIRE', `sent:${date}`, '172800']);
  if (!fresh) return res.json({ sent: 0, due: due.length });

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:noreply@example.com', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  try {
    await webpush.sendNotification(cfg.subscription, JSON.stringify({ title: 'Time for a quick check-in', body: 'Tap to log how you’re feeling.' }), { TTL: 3600 });
    res.json({ sent: 1 });
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { await redis(['DEL', 'sub']); return res.json({ sent: 0, reason: 'subscription expired' }); }
    res.status(502).json({ error: 'push failed', status: e.statusCode });
  }
};
