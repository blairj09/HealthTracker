# Health Check-In

A single-user, phone-first app for logging how someone is feeling through the day and seeing trends over time. Tracks fatigue, fevers and medication on/off cycles.

## What it does
- **Check in** (10 seconds): fatigue 1–5, fever yes/no (+ optional temperature), optional heart rate typed in from the watch, medication on/off toggle, optional note.
- **Trends**: fatigue line over shaded medication-on periods, a fever-day strip, current fever streak, days on/off meds. 7/14/30/90-day views.
- **History** with delete, **CSV export/import**.
- **Random reminders**: N check-ins/day at random times inside a chosen window.
- All data is stored on the device (IndexedDB). No account, no server.

## Run it
It is static files, no build. `python3 -m http.server 8123` then open http://localhost:8123.
To install on a Pixel, host it over HTTPS (GitHub Pages, Vercel, Netlify) and in Chrome choose **Install app**.

## Google Sheets sync (optional)
Settings → **Connect Google Sheets** creates a sheet called "Health Check-Ins" in the user's own Drive and rewrites it with all check-ins on each sync (so deletes carry over). It uses only the `drive.file` scope, so the app can see only that sheet. Family can be given access with Drive's normal Share button and read it in Sheets, no extra app needed. Without a client ID the button is hidden; "Share CSV" and "Export CSV" always work.

One-time setup (needs a Google account, ~5 min):
1. In Google Cloud Console create a project, enable **Google Sheets API**.
2. Create an **OAuth client ID** of type *Web application*; add the hosted site's URL (and `http://localhost:8123` for testing) under *Authorized JavaScript origins*.
3. Put the client ID in `config.js`. While the consent screen is in "Testing", add the user's Google account as a test user.

## Reminders when the app is closed (Web Push, optional)
A phone browser can't run timers while the app is closed, so a small server sends the reminders. It stores only the phone's push address and the reminder window, never any check-in data.

- `api/*.js` are Vercel functions: `vapid` (public key), `subscribe`/`unsubscribe` (guarded by a setup code), `tick` (sends due reminders).
- `.github/workflows/tick.yml` calls `tick` every 15 minutes. GitHub runs scheduled jobs best-effort, so a reminder can be a few minutes late. GitHub also pauses scheduled workflows after 60 days without repo activity.
- Reminder times are random but stable per day, inside the window set in Settings (same scheme as the in-app timers).

One-time setup:
1. Vercel project → **Storage** → create an **Upstash Redis** (free tier) and connect it to the project. This adds the `KV_REST_API_URL` and `KV_REST_API_TOKEN` env vars.
2. Make VAPID keys with `npx web-push generate-vapid-keys`. In the Vercel project add env vars `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:you@example.com`), `SUBSCRIBE_CODE` (any passphrase, the app asks for it once) and `CRON_SECRET` (a long random string). Redeploy.
3. GitHub repo → Settings → Secrets and variables → Actions: secret `CRON_SECRET` (same value) and variable `TICK_URL` = `https://<project>.vercel.app/api/tick`.
4. On the phone: Settings → switch on **Reminders when the app is closed** and enter the setup code.

Until step 2 is done the switch is hidden and the app uses its in-app timers.

## Hosting (GitHub Pages)
`.github/workflows/pages.yml` runs the tests and deploys to GitHub Pages on every push to `main`. One-time: repo **Settings → Pages → Source: GitHub Actions**. The site will be at `https://<user>.github.io/HealthTracker/`; on the Pixel open it in Chrome and choose **Install app**. Use that URL as the OAuth authorized origin (`https://<user>.github.io`, no path).

## Mockups
Screenshots of the real app with sample data are in [`mockups/`](mockups/).

## Known limits / next steps
- **Reminders without the server are best-effort.** Android Chrome cannot reliably fire local notifications while the app is closed. Turn on Web Push (above) for reliable ones.
- **Pixel Watch heart rate and temperature** are exposed to apps through Android **Health Connect**, which web apps cannot read. Doing this needs a small native Android wrapper (e.g. Kotlin or Capacitor with a Health Connect plugin) that syncs readings into the same data. Planned as a later step.
- Fever threshold alert is simple (3+ consecutive fever days). Not medical advice; the care team decides when to pause medication.

## Tests
`node --test` runs the stats helpers.
