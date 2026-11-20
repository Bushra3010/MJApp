# Recon map — FRND → Milo Julo

## Scope
- **Original:** FRND : Chat, Play, Connect (Android, `com.dating.for.all`), 4.5★, 6.49L reviews, 5Cr+ downloads, #8 top free social (India).
- **Platform for clone:** mobile-first web app (installable PWA) — runs in any phone browser now, can be wrapped for Play Store later.
- **Slice (core loop):** user finds an online host → chats / audio-calls / video-calls them → pays per minute in coins; host earns; admin runs the platform.
- **For:** the user's own brand, *Milo Julo* (logo supplied by the user).

## Sources
| source | url | gives |
| --- | --- | --- |
| Play Store listing | https://play.google.com/store/apps/details?id=com.dating.for.all&hl=en_IN | pitch, feature list, data safety, reviews |
| Play reviews (top shown) | same page | complaints: coin deductions w/o clarity, can't reconnect with same person, random matching, no nearby |

## Roles
| role | who | can |
| --- | --- | --- |
| user | customer | browse hosts, chat, audio/video call, buy coins, send gifts, report/block |
| host | engagement agent (FRND "RJ"/friend) | go online/offline, accept calls, chat, see earnings, request payout |
| admin | operator | dashboard, manage users/hosts, approve hosts, set rates, credit coins, view calls, handle reports & payouts |

## Screens
| ID | screen | route | purpose | key components | states |
| --- | --- | --- | --- | --- | --- |
| S01 | Splash / landing | `/` | brand, enter | logo, CTA | — |
| S02 | Login / sign up | `/login` | auth w/ role | tabs, form | error, loading |
| S03 | User home (discover) | `/app` | list online hosts | host card, language filter, online dot | empty, offline-only |
| S04 | Host profile | `/app/host/:id` | bio, rates, call buttons | avatar, rate chips, call CTA | busy, offline |
| S05 | Chats list | `/app/chats` | conversations | list row, unread badge | empty |
| S06 | Chat thread | `/app/chat/:id` | messages, gifts, call from chat | bubble, composer, gift sheet | empty, sending, low balance |
| S07 | Outgoing / incoming call | overlay | ring | avatar, accept/decline | ringing, declined, missed, busy |
| S08 | In-call (audio/video) | overlay | talk, timer, coin meter | video tiles, mute, cam, end | connecting, low balance warning, ended |
| S09 | Wallet / buy coins | `/app/wallet` | balance, packs, history | pack card, txn row | empty history |
| S10 | Profile / settings | `/app/me` | edit profile, language, logout | form | — |
| S11 | Host dashboard | `/host` | online toggle, today's earnings, recent calls | toggle, stat tiles | offline, online, busy |
| S12 | Host earnings / payouts | `/host/earnings` | earnings history, request payout | table | empty |
| S13 | Admin dashboard | `/admin` | KPIs | stat tiles, recent activity | — |
| S14 | Admin users | `/admin/users` | users list, credit coins, block | table, modal | empty |
| S15 | Admin hosts | `/admin/hosts` | approve, set rates, block | table | pending |
| S16 | Admin calls | `/admin/calls` | call log | table | — |
| S17 | Admin reports & payouts | `/admin/reports` | moderate | table | — |

## Flows
```
F01 User signs up and finds a host
    S01 -> S02 -> S03          (3 taps)
F02 User video-calls a host
    S03 -> S04 -> S07 ringing -> S08 in call -> end -> coins debited per minute
    edge: host busy/offline, host declines, balance runs out mid-call, network drop
F03 User chats with a host
    S03 -> S04 -> S06          edge: chat is free? (clone: 1 coin/message, configurable)
F04 User buys coins
    S09 -> pick pack -> credited  edge: payment failure
F05 Host goes online and takes a call
    S11 toggle online -> S07 incoming -> accept -> S08 -> earnings credited
F06 Host requests payout
    S12 -> request -> admin approves (S17)
F07 Admin approves host, sets rates
    S15 -> approve -> rate edit
F08 User reports a host / host reports a user
    S06/S08 menu -> report -> S17
```

## Components
button (primary/ghost/danger, loading), input, tabs, avatar w/ online dot, host card, chat bubble (me/them/system/gift), bottom nav (user), side nav (admin), stat tile, table, modal/sheet, toast, call overlay, coin badge, toggle.

## Inferred data model
```
User      id, role(user|host|admin), name, email, password_hash, avatar, bio, gender, languages,
          coins, status(active|blocked), created_at                       confidence: high
HostProfile user_id, approved, online(bool), busy(bool), audio_rate, video_rate (coins/min),
          earnings_balance, share_pct                                      evidence: RJ/host model, reviews "females get money" — high
Conversation id, user_id, host_id, last_message_at                         high
Message   id, conversation_id, sender_id, type(text|gift|system), body, created_at  high
Call      id, caller_id, callee_id, type(audio|video), status(ringing|active|ended|missed|declined),
          started_at, ended_at, seconds, coins_charged                     high
Transaction id, user_id, kind(purchase|call|chat|gift|credit|payout|earning), amount, ref, created_at  high
Gift      id, name, emoji, price                                            medium
Report    id, reporter_id, target_id, reason, status                       medium
Payout    id, host_id, amount, status(pending|paid|rejected)               medium
```

## Out of scope (skip)
- FRND's users/hosts network, trainers, quizzes, radio shows, 12-language content, games.
- Real payment gateway in v1 (wallet + packs built; gateway — Razorpay/Stripe — is the next step).
- KYC for hosts, TURN relay infra for calls across strict NATs (needed for production).

## Size
17 screens, 8 flows, 9 entities. Hard parts: (1) realtime WebRTC calls + signaling, (2) per-minute billing that's correct when balance runs out / disconnects, (3) presence (online/busy). Size: **M**.

## Differentiators from reviews
- Transparent per-minute charges shown live in-call + full coin history (top complaint: unexplained deductions).
- Reconnect with the same host anytime from chats (complaint: can't reach same person).
- Choose who to call rather than random only.
