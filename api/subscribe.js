const { redis, safeEqual, validTime, validTz } = require('./_lib');

// Saves this phone's push subscription and reminder window. Guarded by a setup code so a stranger
// who finds the site cannot replace the subscription.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  const { code, subscription, perDay, from, to, tz } = req.body || {};
  if (!process.env.SUBSCRIBE_CODE || !safeEqual(code, process.env.SUBSCRIBE_CODE)) return res.status(401).json({ error: 'wrong setup code' });
  const ok = subscription && typeof subscription.endpoint === 'string' && subscription.endpoint.startsWith('https://') && subscription.keys
    && Number.isInteger(perDay) && perDay >= 1 && perDay <= 12 && validTime(from) && validTime(to) && validTz(tz);
  if (!ok) return res.status(400).json({ error: 'bad request' });
  await redis(['SET', 'sub', JSON.stringify({ subscription, perDay, from, to, tz })]);
  res.json({ ok: true });
};
