# RestockRadar (developer README)

Grocery/household deal tracker and reorder-habit engine. No AI API calls, no paid hosting —
descriptive statistics over purchase history plus (eventually) live price fetchers.

See [PROJECT-BRIEF.md](./PROJECT-BRIEF.md) for the full product brief, data-source status,
and household consumption profile this project is built around.

## Architecture

Five-stage pipeline, single direction:

1. **Watchlist & site config** — `backend/src/Watchlist`, table `watchlist_products` / `watchlist_product_criteria`
   (open-ended {attribute, value, importance} rows — how you tell the engine what matters: brand, variety,
   dietary need, etc. — instead of fixed brand/variety columns) / `product_aliases`.
2. **Site fetchers** — `backend/src/Fetchers` — **not implemented yet** (deferred; see Status below).
3. **Price & purchase history** — SQLite (`backend/database/schema.sql`), loaded from `transaction_log.csv`
   via `backend/scripts/import_transactions.php`.
4. **Deal & habit analysis** — `backend/src/Analysis/ReorderAnalyzer.php` (reorder-interval calculation
   with recency-weighted averaging, half-life decay, so pre-move-out household size doesn't skew results)
   + `backend/src/Matching/ProductMatcher.php` (suggests links between a watchlist product and the raw
   `product_name` strings in purchase history, using word overlap plus the "what matters" criteria as
   scoring/filtering signal — deterministic string matching, not ML; a person reviews and accepts/rejects
   every suggestion via `/watchlist/{id}/match-suggestions`, nothing is linked automatically)
   + `backend/src/Matching/CoverageService.php` (the reverse direction: every distinct purchase-history
   item annotated with its status — linked/unmatched/ignored — filterable by status/site/search via
   `/coverage/items`, so the same **Coverage** tab both triages new items and corrects existing links,
   e.g. unlinking something a brand-only match got wrong).
5. **Alerts & dashboard** — `backend/src/Alerts` (API) + `frontend/` (React + TS + Tailwind dashboard).

## Status

- Stages 1, 3, 4, 5 scaffolded: watchlist CRUD (with a "what matters" criteria editor — see
  `frontend/src/components/WatchlistManager.tsx`), SQLite schema + CSV import, reorder-interval analysis,
  fuzzy match suggestions (accept/reject review UI, same component), a minimal JSON API, and a dashboard
  UI (summary stats, alerts list, watchlist table).
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
