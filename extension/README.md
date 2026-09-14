# RestockRadar Product Grabber (browser extension)

Grabs the product on whatever page you're currently looking at — reads the same Open Graph /
schema.org metadata the backend's `ProductPreviewFetcher` reads, but from inside your own browser
session instead of a server-side request, so it isn't blocked by bot-protection the way a plain
server fetch is (see `backend/src/Preview/ProductPreviewFetcher.php`'s docblock and the developer
README's note about Walmart blocking that endpoint). Saves the result as a **preferred product**
(first choice or a backup) on a RestockRadar watchlist item.

Not published to the Chrome Web Store — it's a personal tool, installed as an unpacked extension.

## Install

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this `extension/` folder.
4. Pin it to the toolbar if you want it handy (puzzle-piece icon → pin).

## Use

1. Navigate to a product page on any site.
2. Click the extension icon. It reads the page and shows what it found: name, thumbnail, price
   (from schema.org `Offer` data or Open Graph product-price tags — not every site publishes this),
   and a guessed **quantity** (pack size — parsed from the title, e.g. "80 Count" or "52 oz").
3. Edit any of the fields if needed — this is a one-time snapshot, not a live price, and the
   quantity guess especially is worth double-checking. Pick which watchlist item and slot (First
   choice / Backup #1-4) it belongs to, and click **Save to watchlist**.
4. Set a **Good price (per unit)** on the watchlist item itself (in the web app, not the extension)
   to have preferred products show up green/red for whether they clear that price.

## Backend URL

Defaults to `http://localhost:8734/api` — matches the Docker Compose setup in the repo root. If
you run the backend on a different port, change it under **Backend settings** in the popup.

If you later move RestockRadar off `localhost` (e.g. deploying to TheForge per the brief), you'll
also need to add that host to `host_permissions` in `manifest.json` and reload the extension —
Chrome only lets an extension's background/popup scripts fetch hosts it explicitly declares.
