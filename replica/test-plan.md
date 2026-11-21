# Test plan — Milo Julo

Three apps on one backend: **friends** (members, `:5173` locally), **host** (`:5174`), **admin** (`:5175`).
Automated: `npm test` (API + realtime, against `wrangler dev`) and `npm run e2e` (Playwright UI, two real browsers with fake camera/mic).
Manual: built-in browser pane, mobile width (375 × 812), local dev and live.

Legend: **H** happy path · **E** edge case · **N** negative case · `[api]` API suite · `[ui]` Playwright · `[man]` manual

## F01 Member signs up and finds a host
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F01-H1 | Sign up on friends app with name, DOB, languages, email, password, terms | Lands on Discover, 50 welcome coins | ui |
| F01-E1 | DOB under 18 | "must be 18 or older", no account | api, ui |
| F01-E2 | Terms not ticked | Browser blocks submit / server refuses | api, ui |
| F01-E3 | Password < 8 | Error shown | api |
| F01-E4 | Emoji / accents in name ("Zoë 🌸") | Saved and shown correctly | ui |
| F01-E5 | Very long name (200 chars) | Capped at 40, no layout break | man |
| F01-E6 | Double-click "Create account" | One account only | ui |
| F01-E7 | Email already used | Clear error | api |
| F01-N1 | Wrong password on login | "Wrong email or password" | ui |
| F01-N2 | Host account logs in on friends app | Refused, link to host app | api, ui |
| F01-E8 | Refresh on Discover | Still signed in | ui |
| F01-E9 | No hosts online / none match language | Empty state, no crash | man |

## F02 Member video/audio-calls a host
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F02-H1 | Host online → member taps Video call → host accepts | Both see each other's video; timer runs; coins charged per started minute; host sees earnings | api, ui |
| F02-H2 | Member ends call | Summary shown; call line added to chat; host freed | api, ui |
| F02-E1 | Host declines | "Call declined", no charge | api, ui |
| F02-E2 | Host doesn't answer for 30 s | "No answer", missed call, no charge | api |
| F02-E3 | Balance runs out mid-call | Call ends at next minute; balance never negative | api |
| F02-E4 | Second member calls a busy host | "on another call" | api |
| F02-E5 | Camera/mic permission denied | Toast, no ring, no charge | man |
| F02-E6 | Member closes tab mid-call | Call ends, billing stops | man |
| F02-N1 | Call an offline / unapproved host | Refused with reason | api |

## F03 Member chats with a host
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F03-H1 | Member sends message | Host sees it live, unread badge; 1 coin charged | api, ui |
| F03-H2 | Host replies | Member sees it live; host not charged | api, ui |
| F03-E1 | Empty / whitespace message | Not sent | ui |
| F03-E2 | 2,000+ chars, emoji | Truncated at 2,000, renders | man |
| F03-E3 | Send gift without coins | Clear error, nothing sent | api |
| F03-N1 | Another member opens someone else's chat URL | Not found | api |
| F03-N2 | Blocked person sends | Refused | man |

## F04 Member buys coins
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F04-H1 | Buy pack (test mode locally) | Balance up, history row with payment ID | ui |
| F04-H2 | Razorpay order → verified signature | Credited once | api |
| F04-E1 | Webhook + callback + retry | Credited exactly once | api |
| F04-N1 | Forged signature / someone else's order | Refused | api |
| F04-N2 | Live site without Razorpay keys | "temporarily unavailable", no charge | man |

## F05 Host goes online and takes a call
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F05-H1 | Host signs up on host app | "Waiting for approval", can't go online | api, ui |
| F05-H2 | Approved host toggles online | Shows online to members instantly | api, ui |
| F05-E1 | Host refreshes while online | Stays online | man |

## F06 Host payouts
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F06-H1 | Request payout ≥ 100 coins with UPI | Pending; balance reduced | ui |
| F06-H2 | Admin marks paid / rejects | Status updates; reject returns coins | ui |
| F06-N1 | Below minimum / bad UPI / more than balance | Refused | api, ui |

## F07 Admin approves hosts, sets rates
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F07-H1 | Admin approves a pending host | Host can go online | ui |
| F07-H2 | Admin changes video rate | New calls use new rate | ui |
| F07-H3 | Admin adds/deducts coins | Member's balance updates live | ui |
| F07-H4 | Admin blocks a member | Member signed out, can't log in | ui |
| F07-N1 | Non-admin email signs up on admin app | Refused | api, ui |
| F07-N2 | Member/host session used on admin API | 401/403 | api |

## F08 Reports and blocks
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F08-H1 | Member reports a host | Admin sees report, can block & resolve | ui |
| F08-H2 | Member blocks a host | Host disappears from Discover, chat refused | man |

## F09 Account & settings (added since recon)
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F09-H1 | Change password | Old fails, new works, other devices signed out | api, ui |
| F09-H2 | Forgot password → reset link | Works once | api |
| F09-H3 | Delete account | Signed out; can't log in; records anonymised | api, ui |
| F09-H4 | Upload profile photo | Shown, EXIF stripped | api, man |
| F09-E1 | Sign out everywhere | Old sessions rejected | api |

## F10 Sign in with Google (Supabase)
| ID | Case | Expected | How |
| --- | --- | --- | --- |
| F10-H1 | New Google user → "Almost done" → account | Member/host created per app | api |
| F10-H2 | Button → Google account chooser → back to same app | Chooser shown, returns to that app's /auth/callback | man (live) |
| F10-N1 | Forged / expired / other-project token | Refused | api |

## Cross-cutting (every screen)
| ID | Case | How |
| --- | --- | --- |
| X-1 | No console errors, no 5xx | ui |
| X-2 | axe accessibility scan: no serious/critical violations | ui |
| X-3 | Mobile width 375 px: no horizontal scroll | ui |
| X-4 | Keyboard only: Discover card, buttons reachable | man |
| X-5 | Expired session mid-use → back to login, no crash | man |
