# Architecture — Milo Julo

## Stack (boring, self-hostable)
- **Server:** Node 20, Express, Socket.IO (chat, presence, call signaling), better-sqlite3 (swap for Postgres in prod), JWT auth, bcryptjs.
- **Client:** React 18 + Vite, plain CSS with design tokens, mobile-first PWA.
- **Calls:** browser WebRTC, peer-to-peer. Socket.IO relays offer/answer/ICE. STUN by default; set `TURN_URL/TURN_USER/TURN_PASS` for production (calls on mobile data need TURN).
- **Billing:** server-authoritative. A call is charged one minute up front on connect and then every 60 s; when the user can't afford the next minute the server ends the call. Host earns `host_share_pct` of every coin.

## Layout
```
server/   index.js (http + static), db.js (schema + seed), auth.js, routes/*.js, realtime.js (sockets, calls, billing)
client/   src/pages/{user,host,admin}, src/components, src/lib (api, socket, webrtc)
```

## API
| method | route | role |
| --- | --- | --- |
| POST | /api/auth/register, /api/auth/login | public |
| GET | /api/me · PATCH /api/me | any |
| GET | /api/hosts, /api/hosts/:id | user |
| GET | /api/conversations · POST /api/conversations {hostId|userId} | user/host |
| GET/POST | /api/conversations/:id/messages | participant |
| GET | /api/gifts · POST /api/conversations/:id/gift | user |
| GET | /api/wallet · POST /api/wallet/purchase | user |
| GET | /api/host/stats · POST /api/host/payouts | host |
| GET | /api/admin/stats, users, hosts, calls, reports, payouts, settings | admin |
| PATCH | /api/admin/users/:id, hosts/:id, payouts/:id, reports/:id, settings | admin |
| POST | /api/admin/users/:id/credit | admin |
| POST | /api/reports | any |
| GET | /api/ice | any |

## Socket events
`presence:set` · `host:status` · `message:new` · `call:start` → `call:incoming` · `call:accept|decline|end` · `call:connected|ended|tick` · `rtc:signal`
