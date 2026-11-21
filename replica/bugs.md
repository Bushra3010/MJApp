# Bugs — Milo Julo QA pass (22 Nov 2026)

Scope: local stack (`wrangler dev` + three Vite apps) at phone width, plus the live apps for Google sign-in.
Suites: `npm test` (API + realtime, 69 checks) and `npm run e2e` (Playwright UI, 21 tests in two real browsers with fake camera/mic, axe scan on 23 screens).
Final run: **69/69 API, 21/21 UI, 0 serious/critical accessibility issues.**

| ID | Sev | Title | Status |
| --- | --- | --- | --- |
| B01 | S2 | Hosts earn nothing from chat; odd call rates underpay | Fixed |
| B02 | S3 | `npm run build` crashes the running local API | Fixed |
| B03 | S3 | Login/Sign-up switch has broken tab semantics (critical a11y) | Fixed |
| B04 | S3 | Low-contrast text and buttons (several screens) | Fixed |
| B05 | S3 | Unlabelled profile link on Discover; admin tables not keyboard-scrollable | Fixed |
| B06 | S4 | Deleting an account lands on Log in instead of the welcome page | Fixed |
| B07 | S4 | Technical validation wording ("Too big: expected string…") | Fixed for sign-up and profile; admin-only fields remain |
| B08 | S4 | Host earnings history says "video call minute" in lowercase | Fixed |
| B09 | S4 | Admin tables on a phone hide status/actions off-screen with no scroll hint | Open |

---

### B01 — S2 — Hosts earn nothing from chat; odd call rates underpay
- **Steps:** member sends a host two chat messages (1 coin each, host share 50%). Separately: a 3-minute video call at 25 coins/min.
- **Expected:** host earns 1 coin from the two messages; 37 coins (12.5 × 3, rounded fairly) from the call.
- **Actual:** host earned **0** from any number of messages (½ coin rounded down every time) and **36** from the call (½ coin lost every minute).
- **Evidence:** host Earnings screen showed only call income; API test `host earns from chat` failed (0 ≠ 1).
- **Fix:** each host now keeps the leftover fraction of a coin and it's added to the next credit (`host_profiles.earn_remainder`, DB migration v4). Tests: "host earns from chat: two 1-coin messages pay the host 1 coin", "half-coins carried over (12 + 13 + 12)".

### B02 — S3 — `npm run build` crashes the running local API
- **Steps:** `npm run dev`, then `npm run build` in another terminal.
- **Expected:** dev keeps working.
- **Actual:** the build deleted `client/dist`; `wrangler dev` lost its asset folder and exited ("ENOENT … client/dist/user"); every API call through the apps returned 500.
- **Fix:** the build no longer deletes the whole folder (Vite already empties each app's folder), and `worker` dev creates the folder if missing. Dev-only; users never saw this.

### B03 — S3 — Login/Sign-up switch has broken tab semantics
- **Steps:** axe scan on `/login` (any app).
- **Actual:** critical `aria-required-children`: a `tablist` with plain buttons. Screen readers announce it wrongly; the "Log in" tab and "Log in" submit button also had the same name.
- **Fix:** buttons are now `role="tab"` with `aria-selected`.

### B04 — S3 — Low-contrast text and buttons
- **Actual (WCAG AA 4.5:1 needed):** small grey text 4.17:1 on cards; admin's active menu tab white-on-pink 4.05:1; red text 4.2:1; red buttons/error toasts 3.4:1; green success toast 2.2:1.
- **Fix:** grey `#9E9EA3`; admin active tab uses the deep logo pink `#E0005C` (4.9:1); red text `#FF6961`; red backgrounds `#D92D20` (4.8:1); success toast `#16803A` (5.0:1).

### B05 — S3 — Unlabelled profile link; admin tables not keyboard-scrollable
- **Actual:** the avatar link on Discover had no accessible name; wide admin tables scrolled only with a mouse/touch.
- **Fix:** `aria-label="Your profile"`; tables are focusable labelled regions.

### B06 — S4 — Deleting an account lands on Log in
- **Steps:** Profile → Settings → Delete account → confirm.
- **Expected:** back to the welcome page. **Actual:** the Log in page (the protected screen redirected first).
- **Fix:** full reload to `/` after deletion. Test: `F09-H1 … delete account`.

### B07 — S4 — Technical validation wording
- **Steps:** submit a 41+ character name through the API (the input itself stops at 40).
- **Actual:** "Too big: expected string to have <=40 characters".
- **Fix:** plain messages on sign-up and profile fields ("Name can be up to 40 characters"…). Admin-only forms still use default wording.

### B08 — S4 — Lowercase earnings label
- **Actual:** host history showed "video call minute". **Fix:** "Video call minute" / "Audio call minute".

### B09 — S4 — Admin tables on a phone (open)
- **Steps:** admin app at 375 px → Hosts.
- **Actual:** status and action buttons are off to the right; the table scrolls sideways but nothing shows that it can.
- **Suggested:** card layout for admin lists under 600 px, or a fade/scroll hint. Admin is mostly used on a computer, so low priority.

---

## To check (not reproduced as bugs)
- **Login rate limit per IP vs. mobile networks.** Auth is limited to 20 attempts / 15 min per IP. Indian mobile carriers put many users behind one shared IP (carrier-grade NAT), so at scale real users could be blocked. Consider limiting per email + IP instead.
- **Calls on mobile data:** no TURN key is set on the live site yet (`TURN_KEY_ID` / `TURN_KEY_API_TOKEN`). Calls work on most Wi-Fi but often fail between two phones on mobile data. **Launch blocker.**
- **Live payments:** Razorpay keys aren't set, so live "Add coins" is disabled. The payment code is tested against a mock Razorpay only.
- **Google sign-in, full round trip:** the button → Google account chooser → return address is verified live; completing sign-in with a real Google account wasn't done (it would create an account on your behalf).
- Google's consent screen shows "continue to edtnzipyxmclwdiyfeqm.supabase.co" (Supabase custom domain is a paid add-on).
- After "sign out of all devices" elsewhere, an open tab takes ~2 s to return to Log in (it waits for the realtime connection to drop). Acceptable.

## Cases run
| Area | Cases | Result |
| --- | --- | --- |
| API + realtime (`npm test`) | 69 | 69 pass |
| UI (`npm run e2e`) | 21 tests covering F01–F09 (~45 plan cases) | 21 pass |
| Accessibility (axe, 23 screens) | 23 | 0 serious/critical |
| Manual (browser pane) | long names, emoji, keyboard on Discover, expired session, admin at phone width, camera denied, live Google redirect | 1 open (B09) |
