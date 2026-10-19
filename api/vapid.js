// Tells the app whether push is set up on the server and gives it the public VAPID key.
module.exports = (req, res) => {
  const configured = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.SUBSCRIBE_CODE && process.env.CRON_SECRET
    && (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  if (!configured) return res.status(404).json({ error: 'push not configured' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ key: process.env.VAPID_PUBLIC_KEY });
};
