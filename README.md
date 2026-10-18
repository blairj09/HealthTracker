# Health Check-In

A single-user, phone-first app for logging how someone is feeling through the day and seeing trends over time. Built for tracking fatigue, fevers and medication on/off cycles during cancer treatment.

## What it does
- **Check in** (10 seconds): fatigue 1–5, fever yes/no (+ optional temperature), medication on/off toggle, optional note.
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

## Hosting (GitHub Pages)
`.github/workflows/pages.yml` runs the tests and deploys to GitHub Pages on every push to `main`. One-time: repo **Settings → Pages → Source: GitHub Actions**. The site will be at `https://<user>.github.io/HealthTracker/`; on the Pixel open it in Chrome and choose **Install app**. Use that URL as the OAuth authorized origin (`https://<user>.github.io`, no path).

## Mockups
Screenshots of the real app with sample data are in [`mockups/`](mockups/).

## Known limits / next steps
- **Reminders in a PWA are best-effort.** Android Chrome cannot reliably fire local notifications while the app is closed. They fire while the app is open or recently active. Reliable background reminders need either web push from a small server, or a native app.
- **Pixel Watch heart rate and temperature** are exposed to apps through Android **Health Connect**, which web apps cannot read. Doing this needs a small native Android wrapper (e.g. Kotlin or Capacitor with a Health Connect plugin) that syncs readings into the same data. Planned as a later step.
- Fever threshold alert is simple (3+ consecutive fever days). Not medical advice; the care team decides when to pause medication.

## Tests
`node --test` runs the stats helpers.
