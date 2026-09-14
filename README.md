# RestockRadar (developer README)

Grocery/household deal tracker and reorder-habit engine. No AI API calls, no paid hosting —
descriptive statistics over purchase history plus (eventually) live price fetchers.

See [PROJECT-BRIEF.md](./PROJECT-BRIEF.md) for the full product brief, data-source status,
and household consumption profile this project is built around.

## Architecture

Five-stage pipeline, single direction:

1. **Watchlist & site config** — `backend/src/Watchlist`, three distinct tables per watchlist product:
   `watchlist_product_criteria` (open-ended {attribute, value, importance} rows — abstract rules like
   brand/variety/dietary, used to score fuzzy matches), `watchlist_product_choices` (a person's own
   ranked shortlist of up to 5 *specific* real products — rank 1 = first choice, 2-5 = substitutes,
   each with an optional site + product-page URL — for future stage-2 price checks to try in order),
   and `product_aliases` (raw purchase-history strings actually seen in `transactions`, for reorder
   stats). Criteria describe what matters in the abstract; choices name concrete products; aliases
   are historical fact. `backend/src/Preview/ProductPreviewFetcher.php` (`GET /product-preview?url=`)
   does a one-time, non-recurring fetch of a pasted product URL to auto-fill a choice's name/thumbnail
   from the page's own Open Graph tags, schema.org Product/Offer JSON-LD, or schema.org microdata
   (`itemprop="price"` etc. — the attribute-based form; confirmed necessary for price specifically
   on Walmart, which doesn't always populate the other two) — not price-checking, and not the
   deferred stage-2 fetcher work; it hits the exact same bot-protection wall on sites like Walmart
   (confirmed: returns a "Robot or human?" challenge page rather than product data), so treat it
   as best-effort.
   `extension/` is the more reliable alternative for the same job: a small unpacked Chrome
   extension (see `extension/README.md`) that reads the same metadata but from inside the user's
   own browser session via `chrome.scripting.executeScript`, so it isn't making a bot-shaped
   server-side request in the first place — it's just the user's browser looking at a page, on any
   site. Saves straight to `POST /watchlist/{id}/choices`. `site_label` on `watchlist_product_choices`
   is free text (not an FK to `sites`, unlike `product_aliases`) precisely so this can write an
   arbitrary hostname the purchase-history import has never heard of. Both the URL-fetch and the
   extension also capture `image_url`/`price`/`price_currency`/`price_captured_at` — parsed from
   the same Open Graph/JSON-LD metadata (schema.org `Offer.price`, or the `product:price:*` OG
   tags as fallback) — as a one-time snapshot of what the product looked like when the choice was
   added, not a live or recurring price feed (that's `price_observations`, once stage-2 fetchers
   exist). `WatchlistRepository::setChoice($id, $rank, $label, $fields)` treats `$fields` as a
   sparse patch: a key that's absent leaves that column as whatever it already was, so a caller
   that doesn't know about price/image (e.g. a future integration) can't accidentally null them
   out just by not mentioning them. `ProductPreviewFetcher::parseHtml()` is split out from
   `fetch()` specifically so the metadata parsing can be exercised with a hand-built HTML string
   instead of a live, possibly bot-blocked, network request. A choice also captures `quantity` —
   the pack size the price is *for* ("80" for an 80-count K-cup box, in `watchlist_products.unit_label`'s
   unit), without which price alone can't say whether $18.99 is a good deal. A choice also captures
   `quantity_unit` — the literal unit `quantity` is in (`floz`, `ct`, `l`...), since a case of 12 fl oz
   cans and a 2-liter bottle both just have "a quantity" without something recording which unit each
   is. Both capture paths guess quantity+unit from the title via `RestockRadar\Analysis\PackQuantity::guess()`
   (PHP, returns `array{quantity, unit}`) / the mirrored regex in `extension/popup.js` (JS, nested
   entirely inside `extractProductInfo()` since `chrome.scripting.executeScript`'s `func` option
   can't close over module-scope helpers) — best-effort only (schema.org has no standard pack-size
   field), always shown back to the person to confirm/edit. `PackQuantity::comparable()`/`::convert()`
   decide whether two captured units can be judged against each other at all (same unit, or a fixed
   conversion within the volume family [floz/ml/l/gal] or weight family [oz/lb/kg/g] — never across
   those two, since that needs density, which is never guessed) — used wherever choices get ranked
   against each other or against purchase history (see DealDetector below). `watchlist_products.target_unit_price`
   is the "good deal" threshold a person sets (e.g. 0.35 for "$0.35/ct or better"). Both this tab
   and the Coverage tab (below) render price/unit-price/good-deal-badge identically via
   `frontend/src/priceUtils.ts` (`formatMoney`, `unitPriceBadge`, `unitPriceBadgeClass`) —
   deliberately not stored/derived columns on the frontend side, computed on read so they can
   never drift out of sync with their inputs.
2. **Site fetchers** — `backend/src/Fetchers` — **not implemented yet** (deferred; see Status below).
3. **Price & purchase history** — SQLite (`backend/database/schema.sql`), loaded from `transaction_log.csv`
   via `backend/scripts/import_transactions.php`. `PackQuantity::guess()` is also run in bulk over
   all of `transactions` by `backend/scripts/compute_unit_prices.php`, populating
   `pack_quantity`/`pack_quantity_unit`/`normalized_unit_price` per row (unlike the per-choice case,
   this *is* stored — transaction rows are immutable historical fact once imported, so there's no
   live value for a derived column to drift out of sync with). Re-runnable and safe: only touches
   rows where `pack_quantity_source IS NULL OR = 'guessed'`, and always re-derives those from
   scratch (not just `NULL` ones) so a `PackQuantity` regex fix retroactively corrects rows it
   already touched wrong — e.g. it used to guess 12 (the per-can fl oz) for "12 fl oz, 12 Pack Cans"
   instead of 144 (the true case total), until the trailing-multiplier pattern was broadened past
   just "Pack of N" to also catch a bare "N Pack"/"N Count" following an already-matched size.
   Never touches `pack_quantity_source = 'user'` rows (`CoverageService::setPackQuantity()`).
   Coverage's `last_price`/`last_pack_quantity`/
   `last_normalized_unit_price` per item come from whichever single transaction is most recent for
   that (site, product_name) — a correlated scalar subquery per column in `CoverageService::items()`,
   not a join, so a same-day tie between two orders can't multiply-join and inflate `transaction_count`.
   Some purchase-history names have nothing for `PackQuantity::guess()` to work with (Costco's
   receipt-OCR sometimes drops the size entirely — "POISE PLUS" — or merges in a fragment of a
   neighboring line — "BUTTERNUT SQ CASCADE"), so `CoverageService::rename()` and `::setPackQuantity()`
   let a person fix either by hand, applied to every transaction/alias/ignore/rejected-match row
   sharing that exact (site, name) — same granularity as everything else in Coverage.
   `transactions.original_product_name` is set once at import and never touched again, so a rename
   is corrective, never destructive; `pack_quantity_source` ('guessed' vs 'user') tracks which ones
   were hand-set so `compute_unit_prices.php` (which only fills `NULL` rows) can never clobber them.
   Verified live: renamed a real item to a throwaway string and back, confirming the transaction row,
   its `ignored_purchase_items` status, and `original_product_name` all survived the round-trip intact.
   `CoverageService::correctSingleTransaction()` fixes a wrong `quantity`/`unit_price` from the CSV
   import itself (receipt-OCR misreads happen, not just on the name) — deliberately restricted to
   (site, name) groups with exactly one transaction, since a group with several purchases has no
   single "the price" to correct; picking one purchase out of a multi-purchase group to fix isn't
   built (would need a drill-down view Coverage doesn't have). Rejects with a clear message
   ("groups N purchases") rather than silently guessing which one you meant. `total_price` is always
   recomputed as `quantity × unit_price`, never taken as separate input, so the two can't disagree.
4. **Deal & habit analysis** — `backend/src/Analysis/ReorderAnalyzer.php` (reorder-interval calculation
   with recency-weighted averaging, half-life decay, so pre-move-out household size doesn't skew results)
   + `backend/src/Matching/ProductMatcher.php` (suggests links between a watchlist product and the raw
   `product_name` strings in purchase history, using word overlap plus the "what matters" criteria as
   scoring/filtering signal — deterministic string matching, not ML; a person reviews and accepts/rejects
   every suggestion via `/watchlist/{id}/match-suggestions`, nothing is linked automatically)
   + `backend/src/Matching/CoverageService.php` (the reverse direction: every distinct purchase-history
   item annotated with its status — linked/unmatched/ignored — filterable by status/site/search via
   `/coverage/items`, so the same **Coverage** tab both triages new items and corrects existing links,
   e.g. unlinking something a brand-only match got wrong)
   + `backend/src/Analysis/DealDetector.php` — the other half of stage 4: `historicalStats($productNames, $targetUnit)`
   computes all-time-low/average/rolling-average (last 180 days) unit price from `transactions.normalized_unit_price`
   for a product's aliases; `evaluate()` compares a *currently captured* price (a `watchlist_product_choices`
   row — something you or the extension just looked at) against that history and returns a verdict
   (`all_time_low` / `good_deal` / `normal` / `insufficient_history`, the last requiring 3+ priced
   purchases). Comparing a past purchase against its own history would be circular, so the two prices
   are deliberately kept separate — see the class docblock. `$targetUnit` re-expresses every historical
   row into one unit before averaging via `PackQuantity::convert()`, excluding a row outright if its
   own unit is known and doesn't convert into `$targetUnit` (a legacy row with no unit on record is
   kept as-is, same as before this parameter existed) — without it, a 2-liter bottle and a 12oz can
   would both just contribute "a unit price" to the same average despite being priced per
   different-sized units. `GET /watchlist/{id}/price-stats` and `GET /deal-finder` both compute a
   reference unit (the product's own `unit_label`, or else whichever captured choice has a unit
   first) and pass it through; a choice whose own unit can't convert into that reference gets
   `comparable: false` in the response and no verdict at all (rather than one computed against
   stats measured in a different unit) — it's still shown, just sorted after the ones that could
   actually be ranked together. **Known, disclosed gap**: this unit-awareness covers choices and
   transactions independently; it does not attempt cross-product unit reconciliation beyond what
   `historicalStats`'s `$targetUnit` already does.
   `POST /deals/detect` runs `evaluate()` across every active product with at least one priced choice
   and inserts a row into `alerts` for each qualifying verdict, deduped by exact message text
   (`AlertRepository::existsWithMessage()`) so repeat runs don't spam identical findings — verified
   live: creates on first run, empty on a second run with no change, and an acknowledge clears it
   from `/alerts` immediately. `GET /deal-finder` is the other consumer of the same evaluation logic,
   but as a full report instead of a notification log: every active product with at least one priced
   choice, choices sorted cheapest-first (comparable ones before non-comparable ones), re-computed
   fresh on every call rather than dedup/diffed against a prior run — `frontend/src/components/DealFinder.tsx`
   groups the result into "Good deals right now" (`good_deal`/`all_time_low`) vs. everything else,
   and flags any choice whose `price_captured_at` is 30+ days stale (`priceUtils.ts`'s `isStalePrice`).
5. **Alerts & dashboard** — `backend/src/Alerts` (API) + `frontend/` (React + TS + Tailwind dashboard).
   The Dashboard's Alerts panel has a "Check for deals" button (`POST /deals/detect`) and a dismiss
   action per alert (`POST /alerts/{id}/acknowledge`) — until this, `alerts` existed in the schema from
   the very first commit but nothing had ever written to it. The Dashboard also has a "Price checks
   due" panel (`PriceFreshnessPanel` in `Dashboard.tsx`) computed purely client-side from data the
   Dashboard already loads — no backend endpoint needed — listing any choice with no captured price
   or one 30+ days old.

## Status

- Stages 1, 3, 4, 5 scaffolded: watchlist CRUD (with a "what matters" criteria editor — see
  `frontend/src/components/WatchlistManager.tsx`), SQLite schema + CSV import, reorder-interval analysis,
  deal detection against real purchase history, fuzzy match suggestions (accept/reject review UI, same
  component), a minimal JSON API, and a dashboard UI (summary stats, a now-functional alerts list,
  watchlist table).
- Fuzzy matching is a *suggestion* layer only — accepting a suggestion writes a normal row into
  `product_aliases`, same as manual aliasing. A rejected suggestion is remembered
  (`watchlist_product_rejected_matches`) so it won't resurface for that product. Brand-only criteria can
  produce false positives across similar products (e.g. "Chobani Oatmilk" surfacing under a dairy yogurt
  watchlist entry just because the brand matches) — that's expected; it's why suggestions need a person
  to confirm rather than auto-linking.
- The Coverage tab surfaces real gaps in the data: on the actual `transaction_log.csv`, only 7 watchlist
  products exist against ~3,700 distinct unmatched item names — high-frequency items like "Fresh Banana,
  Each" (121×) show up unmatched simply because nothing on the watchlist covers produce yet, not because
  matching failed.
- Stage 2 (live site fetchers) is **intentionally deferred** — no live fetcher exists for any site yet.
  `backend/src/Fetchers/SiteFetcher.php` documents the contract future fetchers should implement.
- Deal/all-time-low detection and actually populating `alerts` automatically are not built yet — the
  `alerts` table and API exist, but nothing writes to it on its own yet.

## Data privacy

`transaction_log.csv` (repo root) contains **real personal order history** and is gitignored — it must
never be committed, since this GitHub repo is public. `sample-data/transaction_log.sample.csv` is a small
synthetic file with the same columns, safe to commit, for local dev/demo without the real data.

## Local development (Docker)

```bash
docker compose up
```

- Backend: http://localhost:8734 (PHP built-in server, PDO SQLite)
- Frontend: http://localhost:5734 (Vite dev server, proxies API calls to the backend)

The real `transaction_log.csv` is bind-mounted read-only into the backend container so you can import
your actual purchase history without it ever being baked into an image or committed.

### First-time setup: import purchase history

```bash
docker compose exec backend composer install
docker compose exec backend php scripts/import_transactions.php /data/transaction_log.csv
docker compose exec backend php scripts/seed_watchlist.php   # optional: starter watchlist from PROJECT-BRIEF.md
```

This populates `backend/database/restockradar.sqlite` (gitignored, generated) from `transaction_log.csv`.
Re-running is safe — duplicate rows are skipped via a `UNIQUE` constraint, not overwritten. Manage the
watchlist afterward from the app itself (the "Manage Watchlist" tab) rather than re-running the seed script.

### Without Docker

Backend needs PHP 8.1+ with `pdo_sqlite`, and [Composer](https://getcomposer.org/):

```bash
cd backend && composer install
php -S localhost:8734 -t public
```

Frontend needs Node 20+:

```bash
cd frontend && npm install && npm run dev
```

## Deployment target: TheForge

Follows the same pattern as FloraSync/Spoolman already running there: PHP backend as a PM2-managed
process, static frontend build served by Caddy.

```bash
# On TheForge, after pulling:
cd frontend && npm install && npm run build   # outputs frontend/dist
cd ../backend && composer install --no-dev
pm2 start ecosystem.config.js
```

Point Caddy's site block at `frontend/dist` for static files and reverse-proxy `/api/*` to
`127.0.0.1:8734` (matching `ecosystem.config.js`'s bind address).

## Project structure

```
backend/            PHP API + analysis (stages 1, 3, 4, 5)
  src/Watchlist/     stage 1 — watchlist CRUD
  src/Fetchers/      stage 2 — contract only, not implemented
  src/Storage/       PDO/SQLite connection
  src/Analysis/      stage 4 — reorder-interval stats
  src/Alerts/         stage 5 — alerts API
  database/          schema.sql + generated .sqlite (gitignored)
  scripts/           CSV import
frontend/            React + TypeScript + Tailwind dashboard
sample-data/         synthetic CSV, safe to commit
transaction_log.csv  real data, gitignored, lives at repo root locally
```

## Next steps

See "Next steps" in [PROJECT-BRIEF.md](./PROJECT-BRIEF.md) — cleaning up noisy Costco description
merges, adding Sam's Club data, and deciding which 2-3 sites get live fetchers built first.
