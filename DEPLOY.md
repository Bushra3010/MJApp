# Deploying Milo Julo on Cloudflare

**Live (Cloudflare account milojulooo@gmail.com):**

| App | Link | Worker | Who signs up there |
| --- | --- | --- | --- |
| Milo Julo (make friends) | https://milo-julo.milojulooo.workers.dev | `milo-julo` (owns the shared Hub) | Members |
| Milo Julo Host | https://milo-julo-host.milojulooo.workers.dev | `milo-julo-host` | Hosts (wait for admin approval) |
| Milo Julo Admin | https://milo-julo-admin.milojulooo.workers.dev | `milo-julo-admin` | Only emails listed in `ADMIN_EMAILS` |

All three share one backend (the `Hub` Durable Object in `milo-julo`). Each app's Worker stamps which app a request came from, and a session only works in the app it was created in. Secrets (`JWT_SECRET`, `ADMIN_EMAILS`, payment keys…) are set on `milo-julo` only.
Build all three with `npm run build` (outputs `client/dist/{user,host,admin}`) and deploy all three with `npm run deploy`.

Everything runs on Cloudflare:

| Piece | Cloudflare product |
| --- | --- |
| Web app (React PWA) | Workers static assets |
| API, chat, call signaling, presence, per-minute billing | One Worker + one **Durable Object** (`Hub`) with built-in SQLite |
| Photos | Stored in the Durable Object, cached at the edge |
| Call relay for mobile networks | **Cloudflare Realtime TURN** |
| Backups | Durable Object point-in-time recovery (last 30 days) |

Free plan is enough to start. Upgrade to Workers Paid ($5/month) when traffic grows.

## One-time setup

```bash
cd worker
npx wrangler login                 # opens the browser: approve access to your Cloudflare account
npx wrangler secret put JWT_SECRET # paste: openssl rand -base64 48
npx wrangler secret put ADMIN_EMAILS   # your email; sign up with it to become admin
npm run deploy                     # builds the app and deploys → https://milo-julo.<your-subdomain>.workers.dev
```
The first deploy asks you to pick a `workers.dev` subdomain.

Then open the site, **sign up with the email in ADMIN_EMAILS**, and you'll land in the admin panel.

## Calls on mobile data (TURN)
Cloudflare dashboard → **Realtime → TURN Server → Create**. Copy the key ID and API token:
```bash
npx wrangler secret put TURN_KEY_ID
npx wrangler secret put TURN_KEY_API_TOKEN
```
Without TURN, calls connect on most Wi‑Fi but often fail on mobile data.

## Payments (Razorpay)
1. Test mode keys: Razorpay → Account & Settings → API Keys.
   ```bash
   npx wrangler secret put RAZORPAY_KEY_ID
   npx wrangler secret put RAZORPAY_KEY_SECRET
   ```
2. Webhooks → add `https://YOUR-DOMAIN/api/webhooks/razorpay`, events `payment.captured`, `order.paid`, `payment.failed`, then:
   `npx wrangler secret put RAZORPAY_WEBHOOK_SECRET`
3. Test with UPI `success@razorpay`. Swap in live keys after Razorpay KYC.

Until keys are set, buying coins shows "temporarily unavailable" (test-mode coins are only allowed locally).

## Email (password reset)
Create a Resend account, verify your domain, then `npx wrangler secret put RESEND_API_KEY` and set `EMAIL_FROM` in `worker/wrangler.toml`.

## Your own domain
Add the domain to Cloudflare (Websites → Add), then Workers → milo-julo → Settings → Domains & Routes → **Add custom domain**.

## Before launch
- Business details in `client/src/brand.js`, plus a lawyer's review of the legal pages
- `ADMIN_EMAILS` set and your admin account created
- TURN, Razorpay and Resend secrets set
- One real call between two phones on mobile data

## Updating
Every push to `main` on GitHub (Bushra3010/MJApp) deploys automatically via Cloudflare Workers Builds:
- Root directory `/`
- Build: `npm ci && npm --prefix client ci && npm --prefix worker ci && npm --prefix client run build`
- Deploy: `cd worker && npx wrangler deploy && npx wrangler deploy -c apps/host/wrangler.toml && npx wrangler deploy -c apps/admin/wrangler.toml`
  (if the dashboard still has only `cd worker && npx wrangler deploy`, pushes update the friends app but not the host and admin apps)

Pushes to other branches don't change the live site. To deploy by hand instead:
```bash
npm run deploy      # from the project root
```
The database schema upgrades itself on start.

## Local development
```bash
npm install && npm --prefix client install && npm --prefix worker install
npm run dev         # wrangler dev (API, :8787) + Vite (:5173)
npm test            # end-to-end tests against wrangler dev
```
Local settings live in `worker/.dev.vars`. To load demo accounts locally, sign up as the admin email in `.dev.vars` and call `POST /api/admin/seed-demo`.

## Android app on Google Play (optional)
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-DOMAIN/manifest.webmanifest
bubblewrap build
npx wrangler secret put ANDROID_SHA256_FINGERPRINT
```

## Limits to know
- One Durable Object runs all realtime traffic. That covers thousands of connected users. Past that, shard by region.
- Photos are capped at 2 MB (the app resizes to ~50 KB). For heavy media, move uploads to R2.

## Sign in with Google (via Supabase)
Live on all three apps.

| Piece | Where |
| --- | --- |
| Supabase project | `edtnzipyxmclwdiyfeqm` ("milojulooo@gmail.com's Project"). Authentication → Providers → Google is **enabled** |
| Supabase redirect URLs | `https://milo-julo…/auth/callback`, `https://milo-julo-host…/auth/callback`, `https://milo-julo-admin…/auth/callback` (Authentication → URL Configuration) |
| Google Cloud project | "Milo Julo" (`pro-signal-515422-v3`), owned by milojulooo@gmail.com. Published (In production) |
| Google OAuth client | "Milo Julo Web", Client ID `1069480501329-gtki9bt0uvrjhdbs5c3jmsjtn3tg2437.apps.googleusercontent.com`, redirect URI `https://edtnzipyxmclwdiyfeqm.supabase.co/auth/v1/callback`. The client secret is stored only in Supabase |
| Worker vars | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` in `worker/wrangler.toml` (public values) |

The "Continue with Google" button only appears while Google is enabled in Supabase. The server checks this every minute.
If you add a custom domain to an app, add its `/auth/callback` to Supabase's redirect URLs.
