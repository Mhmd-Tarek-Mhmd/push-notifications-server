# Rafik Push Notification Server

Standalone push notification server for the Rafik Islamic companion app. Runs `node-cron` every minute, stores subscriptions + prayer timings in SQLite, and sends Web Push notifications via `web-push`.

## Deploy to Railway

1. Push this repo to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Set env vars:
   ```
   VAPID_PUBLIC_KEY=<from rafik .env>
   VAPID_PRIVATE_KEY=<from rafik .env>
   VAPID_SUBJECT=mailto:you@example.com
   ```
4. Deploy — Railway auto-detects the Dockerfile

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | `{ ok: true }` |
| GET | `/api/status` | subscription count + device info |
| POST | `/api/subscriptions` | register push subscription |
| DELETE | `/api/subscriptions` | remove subscription |
| POST | `/api/test-push` | immediate test push |

## Local dev

```bash
cp .env.example .env   # fill in VAPID keys
npm install
npm run dev            # --watch mode
```

## How it works

- Every minute, `tick()` reads all subscriptions from SQLite
- For each subscription: fetches prayer times from Aladhan (cached 3 days), checks if any prayer/adhkar is due within a 45s window, sends a push if so
- Test pushes fire immediately (no cron dependency)
- Stale sent marks and old caches are pruned automatically
