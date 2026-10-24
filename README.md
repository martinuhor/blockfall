# Blockfall

Blockfall is a free falling-tiles game for a phone. One ranked run each Lagos day uses the same tile order. Practice is separate. The vessel, the five tiles, and the receipt are the game. This build does not pay airtime or cash.

## Play locally

From the project folder:

```bash
python3 -m http.server 5173
```

Open [http://127.0.0.1:5173/](http://127.0.0.1:5173/). Add it to the home screen from the browser. The module script needs a local server; opening the file directly will not run.

```bash
npm test
```

`node js/replay.js receipt.json` checks a saved run. The score it checks is the score before any sponsor bonus.

## Pitch page

The deck is a second static page. Ruby runs only when you build. The site Cloudflare serves is HTML, CSS, and JS.

```bash
ruby build.rb
```

That writes `dist/`. The game is `dist/index.html`. The deck is `dist/deck.html`.

```bash
python3 -m http.server 5173 --directory dist
```

## Cloudflare Pages

- Build command: `ruby build.rb`
- Output directory: `dist`

No Ruby runs when someone opens the site. The deck talks about a possible sponsor-funded airtime prize and an NLRC permit before any prize is paid. That is not legal advice, and this product does not pay prizes.


## DEMO SITE 

: https://blockfall-1fx.pages.dev/
