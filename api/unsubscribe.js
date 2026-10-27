const { redis, safeEqual } = require('./_lib');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();
  if (!process.env.SUBSCRIBE_CODE || !safeEqual((req.body || {}).code, process.env.SUBSCRIBE_CODE)) return res.status(401).json({ error: 'wrong setup code' });
  await redis(['DEL', 'sub']);
  res.json({ ok: true });
};
