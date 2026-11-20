# Milo Julo

Video call, audio call and chat app with three roles:

| Role | Where | What they do |
| --- | --- | --- |
| **User** (customer) | `/app` | Discover hosts, chat (1 coin/msg), audio & video call (billed per minute), send gifts, wallet & full coin history, report/block |
| **Host** (engagement agent) | `/host` | Go online/offline, receive & answer calls, reply to chats free, see earnings, request UPI payouts |
| **Admin** | `/admin` | Live KPIs, manage users (block, add/deduct coins), approve hosts & set per-host rates, call log & coin ledger, reports, payouts, platform settings |

## Run locally

```bash
npm install && npm --prefix client install && npm --prefix worker install
npm run dev       # API on Cloudflare's local runtime (:8787) + app (:5173) → http://localhost:5173
npm test          # 40 end-to-end checks against wrangler dev
```

Local admin: sign up with the email in `worker/.dev.vars` (`ADMIN_EMAILS`), then load demo hosts with
`POST /api/admin/seed-demo` (demo password is `DEMO_PASSWORD` in `.dev.vars`).

To try a call on one computer, open the user in one browser and the host in another (or a private window), turn the host **online**, then call.

## How it works
- **Stack:** Cloudflare Worker + one Durable Object (`worker/`) holding SQLite, WebSockets, presence and call billing; React + Vite installable PWA (`client/`).
- **Calls:** WebRTC peer-to-peer, signalled over a WebSocket to the Durable Object, with Cloudflare Realtime TURN for mobile networks.
- **Billing:** server-side, per started minute from when the host answers, driven by Durable Object alarms. The call ends when the user can't afford the next minute, so the balance never goes negative.
- **Payments:** Razorpay Checkout with server-side orders, signature checks and an idempotent webhook.
- **Accounts:** http-only cookie sessions, PBKDF2 passwords, 18+ gate, email reset (Resend), sign out everywhere, photo upload (resized on device, EXIF stripped), in-app account deletion.
- **Notifications:** Web Push (VAPID, written on WebCrypto) for incoming and missed calls and offline messages.
- **Safety & legal:** report/block, admin moderation, Terms / Privacy / Refunds / Guidelines / Contact pages.

## Deploy
See **[DEPLOY.md](DEPLOY.md)**: `npx wrangler login`, set two secrets, `npm run deploy`.

See `replica/` for the recon map, architecture, backend checklist and feature matrix.
