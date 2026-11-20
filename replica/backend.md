# Backend — Milo Julo

## Auth
- [x] Email + password sign up (18+ by date of birth, terms acceptance), bcrypt hashes
- [x] Sessions in http-only, SameSite=Lax, Secure (prod) cookies; Bearer token kept for a future native app
- [x] Sign out everywhere (token_version), also on password change/reset
- [x] Password reset by email (hashed one-time token, 1 h expiry, token in URL fragment so it never hits logs)
- [x] Account deletion in-app (password confirm); payments kept without personal data, calls anonymised
- [x] Roles: user / host / admin, enforced by `requireAuth(...roles)` on every route and on every socket event
- [ ] Email verification at sign up. Not added: no email needed to use the app; add if fake sign-ups become a problem
- [ ] Phone OTP login. Needs an SMS provider (MSG91 / Twilio) account

## Database
- [x] Versioned migrations (`PRAGMA user_version`) run at start
- [x] Access rules: conversations/messages only readable by the two participants (tested); admin-only routes (tested)
- [x] Seed script with fictional demo data
- [x] Daily online backups, 14 kept; VPS snapshots recommended

## Payments: Razorpay
- [x] Orders created server-side with the owner's keys; price never taken from the client
- [x] Checkout signature verified (HMAC-SHA256, timing-safe)
- [x] Webhook signature verified on the raw body; event ids stored; fulfilment idempotent (tested: callback + webhook + retry = credited once)
- [x] Webhook-only fulfilment works if the browser closes mid-payment
- [x] Test mode without keys in dev; refused in production unless `ALLOW_TEST_PAYMENTS=true`
- [x] Refund policy page; payment IDs shown in user wallet and admin

## Calls
- [x] Per-call billing on the server, per started minute, never negative
- [x] TURN: coturn with short-lived HMAC credentials per user (`TURN_SECRET`), private IP ranges denied

## Email & jobs
- [x] Resend REST API, dev fallback prints to console
- [x] Daily DB backup job
- [x] Web Push (VAPID) for incoming calls (high urgency), missed calls, and messages while offline

## Security checklist
- [x] secrets only in env vars, `.env*` in `.gitignore`/`.dockerignore`, nothing in client bundles
- [x] input validated on the server (zod) on auth, profile, payments, admin create; ids/amounts coerced elsewhere
- [x] authorisation checked on every read and write, tested with a second user
- [x] rate limits on login, sign up, password reset (email: 5/h)
- [x] webhooks verify signatures
- [x] uploads: 5 MB, images only, re-encoded with sharp (strips EXIF/GPS), random names, `nosniff` + `default-src 'none'` CSP. Served from the same domain; move to object storage + a separate domain if volume grows
- [x] no user data in URLs or logs (initials avatars replaced the third-party avatar service, which put names in URLs)
- [x] dependencies audited: `npm audit` 0 vulnerabilities (server and client)
- [x] helmet: CSP (Razorpay allow-listed), HSTS in prod, frame-ancestors, Permissions-Policy limits camera/mic to self
- [x] privacy policy lists processors: Razorpay, host, Resend, browser push services
- [x] JWT_SECRET required (32+ chars) in production or the server refuses to start
