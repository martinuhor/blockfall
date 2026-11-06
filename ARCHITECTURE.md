# Architecture

Blockfall is a **static-first** web app with a thin **Cloudflare Pages Functions** edge for money, ranks, and counts.

```
Browser (phone PWA shell)
  index.html   game + leaderboard + merch modal
  ost.html     soundtrack player
  room.html    local 2D lobby (bitchat adapter stub)
  about.html   portfolio framing
  studio.html  private stats viewer
        │
        ▼
Cloudflare Pages
  dist/ from `ruby build.rb`   (HTML/CSS/JS/audio/video)
  functions/api/*              (edge only)
        │
        ├── Paystack  (NGN checkout)
        ├── Printful  (POD after charge.success)
        └── KV        (optional LEADERBOARD_KV / STATS_KV)
```

## Core game

| Module | Role |
| --- | --- |
| `js/engine.js` | Rules, Lagos day key, deterministic bags, `step` / `verifyRun` |
| `js/game.js` | Screens, input, receipts, board submit |
| `js/draw.js` | Canvas + emoji faces |
| `js/music.js` / `ost.js` | Catalog + player |
| `js/ads.js` | Local sponsor-break stub |
| `js/replay.js` | CLI receipt check |

Daily seed format: `daily-YYYY-MM-DD` in Lagos time (UTC+1, no DST). A finished daily run is replayed with `verifyRun` before it can hit the shared board.

## Edge APIs

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/create-checkout-session` | POST | Paystack `transaction/initialize` |
| `/api/paystack-webhook` | POST | Verify signature → Printful order |
| `/api/leaderboard` | GET/POST | Ranked Lagos-day runs (verified) |
| `/api/event` | POST | Allow-listed analytics counters |
| `/api/stats` | GET | Bearer-gated studio readout |

Secrets never ship in `dist/`. See `.env.example`.

## Trust boundaries

1. **Client is untrusted.** Scores only rank after server-side replay.
2. **Paystack signature** is HMAC-SHA512 over the raw webhook body.
3. **Printful** is called only after `charge.success`.
4. **Studio** requires `STATS_VIEW_KEY`; robots disallow `/studio`.

## Build & quality gates

```bash
npm run check   # test + lint + build
```

CI runs the same gates on `main` and `cursor/**` branches.
