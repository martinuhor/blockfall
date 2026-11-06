# Blockfall

Personal portfolio web project: an **original** falling-tiles game for phones in Nigeria. One free ranked run each Lagos day (same tile order for everyone). Practice is separate. Soundtrack, a local multiplayer-style room, and Paystack merch sit beside the game.

**Live demo:** [https://blockfall-1fx.pages.dev/](https://blockfall-1fx.pages.dev/)

This build does **not** pay airtime or cash. Prize talk on the pitch page is not a live payout system.

## Why this stack

| Choice | Reason |
| --- | --- |
| Vanilla ES modules + canvas | Fast phone load, no SPA tax, easy to audit |
| Deterministic engine + receipts | Server can replay a run; ranks are not trust-me scores |
| Cloudflare Pages + Functions | Static hosting + edge checkout/webhooks without a always-on server |
| Paystack (not Stripe) | Nigeria-native cards / transfers / USSD |
| Printful after webhook | POD only when payment cleared |

Longer notes: [ARCHITECTURE.md](./ARCHITECTURE.md).

## Quick start

```bash
npm install
npm start          # http://127.0.0.1:5173/
npm test
npm run lint
npm run build      # writes dist/ for Pages
npm run check      # test + lint + build
```

`node js/replay.js receipt.json` checks a saved run (score before any sponsor bonus).

## Product surfaces

| Path | What it is |
| --- | --- |
| `/` | Splash, play, today's verified board, merch modal |
| `/ost.html` | Silent Parker soundtrack player |
| `/room.html` | Top-down room (local chat until a real bitchat client is plugged in) |
| `/about.html` | Portfolio / design constraints |
| `/studio.html` | Private event counters (key required) |
| `/deck.html` | Pitch page from ERB at build time |

## Cloudflare Pages

- **Build command:** `npm run build` (or `ruby build.rb`)
- **Output directory:** `dist`
- **Functions:** `functions/` (checked in next to the site; not copied into `dist`)

### Secrets & bindings

Copy `.env.example`. Set Production env vars in the Pages project:

**Merch:** `PAYSTACK_SECRET_KEY`, `POD_API_KEY`, `POD_VARIANT_ID_{S,M,L,XL}`, `MERCH_UNIT_AMOUNT` (kobo), `MERCH_CURRENCY=NGN`

**Board / analytics:** bind a KV namespace as `LEADERBOARD_KV` (and optionally `STATS_KV`). Set `STATS_VIEW_KEY` for `/studio`.

**Paystack webhook URL:** `https://blockfall-1fx.pages.dev/api/paystack-webhook` · event `charge.success`

Without secrets, checkout returns **503** with a clear JSON error. Without KV, the board still works in a single-isolate preview memory store and reports `durable: false`.

## Pitch page

```bash
ruby build.rb
python3 -m http.server 5173 --directory dist
```

The deck mentions a possible sponsor-funded airtime prize and an NLRC permit before any prize is paid. That is not legal advice.

## License / credit

Game design and code for portfolio demonstration. Silent Parker tracks are used with the artist’s involvement on this project; do not redistribute the audio outside this product without permission.
