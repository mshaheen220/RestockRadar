# RestockRadar — grocery deal tracker & habit engine

A home-network app that monitors specific grocery/household products across sites Michael has accounts with, learns his household's consumption habits from purchase history, and surfaces better prices — including shipping cost — without relying on an AI API.

## Goals

- Track prices for a manually curated watchlist of products across multiple sites.
- Learn reorder cadence and preferred brands from real purchase history (no ML training required — descriptive statistics: rolling averages, frequency counts, reorder intervals).
- Normalize prices to unit price (price per oz/ct) so pack sizes compare fairly across sites.
- Factor shipping cost / free-shipping thresholds into an "effective price" comparison.
- Zero ongoing monetary cost: no AI API calls, no paid cloud hosting.

## Prior art (same author)

- [`mmj-deals-finder`](https://github.com/mshaheen220/mmj-deals-finder) — deterministic Python rule engine, no AI API, reverse-engineers dispensary APIs (Dutchie/Trulieve/Sweed) instead of scraping. This project reuses the same "no API" philosophy but for general groceries.

## Architecture (decided)

Five-stage pipeline, single direction:

1. **Watchlist & site config** — products, sites, price thresholds.
2. **Site fetchers** — prefer reverse-engineered site APIs over headless-browser scraping where possible; some sites (Amazon/Walmart/Target) have heavy bot protection and may need an authenticated, cookie-persisted session instead.
3. **Price & purchase history** — SQLite time-series log (matches the FloraSync/Spoolman pattern already running on TheForge).
4. **Deal & habit analysis** — rolling-average/all-time-low deal detection, unit-price-normalized fuzzy product matching (no UPC on most sources), reorder-interval calculation from purchase history, recency-weighted (see Data notes below).
5. **Alerts & dashboard** — email/ntfy or a simple mobile-friendly web UI.

## Hosting

Target: **TheForge** (Michael's home server — headless 2015 MacBook Air, PM2 process manager, Caddy reverse proxy). Follow the same pattern as FloraSync: local web app, SQLite backend, PM2-managed. **OR** local to his work laptop if it is to be used on-demand instead of in background **OR** on github pages if their system allows it. this needs to be discussed and decided still.

## Stack conventions to follow

- React + TypeScript front end, styled with Tailwind (or existing component library) — not custom CSS from scratch.
- Back end: PHP preferred, Node/Python/.NET all fine.
- SQLite for storage.
- GitHub repo under `github.com/mshaheen220`, with a `.gitignore` and **two READMEs** (dev + user).
- `.vscode/settings.json` with a unique Peacock color per project.
- UI: version number pulled from `package.json` and incremented on changes; theme switcher (day/night/system); mobile-friendly; basic accessibility (ARIA where sensible).

## Data sources — status

| Source | Status | Notes |
|---|---|---|
| Walmart | ✅ Done | Official order-history CSV export (order-level + item-level pairs). Delivery charge is per-order, not per-item. |
| Amazon | ✅ Done | Official "Request My Data" → `Order History.csv`. Includes a `Department` field (196 items tagged "Grocery") and per-item ASIN + shipping charge. |
| Costco | ✅ Done (10 receipts so far) | No official export — receipts saved as browser print-to-PDF, text-layer extracted and parsed (item code, discount line, tax flag). Every receipt reconciled exactly to its printed subtotal. Known issue: a few multi-line wrapped descriptions merged a fragment from a neighboring item (dollar amounts unaffected). More receipts can be added the same way. |
| Chewy | ✅ Done (3 orders) | Pasted invoice text, all the same Autoship item (Friskies canned cat food). Reorder interval looks irregular (71–116 days) — worth more data points before trusting it. |
| Sam's Club | ⏳ Pending | Access via a relative's membership; not yet pulled. |
| Giant Eagle | ❌ Permanent gap (mostly) | Has an Advantage Card, but the online account only shows *online-order* history, not in-store swipe-card purchases, and Michael hasn't ordered online with them in a long time. No retroactive fix; only matters going forward if he resumes online ordering. |
| Trader Joe's | Out of scope | Impulse/discovery shopping ("interesting frozen things"), not staple-buying — doesn't fit the reorder-interval model. |

## Unified transaction log

All sources are merged into one file: `transaction_log.csv` (currently 6,124 rows).

Columns: `date, site, order_id, product_name, quantity, unit_price, total_price, shipping_charge, product_id, category, delivery_status, recent_24mo`

- `recent_24mo` is a boolean flag, **not a filter** — all history (back to 2000 for Amazon) is kept, but the habit model should default to filtering on this flag or weighting recent purchases more heavily.
- `product_id` is ASIN (Amazon), Walmart's internal item ID, or Costco's item code — not a universal UPC. Cross-site product matching still needs to be built (fuzzy name + unit price).
- `category` is only populated for Amazon (its native `Department` field).
- Pre-tax totals throughout, for consistency.

## Consumption profile (seed data for the habit model)

| Product | Preferred brand(s) | Stated rate | What the purchase history shows |
|---|---|---|---|
| K-cups | Donut Shop blend / Amazon Medium Roast | ~3/day (21/week) | Mainly an 80-count box from **Costco** every ~64 days on average (irregular: 20–121 day gaps), topped up with smaller boxes from Walmart/Amazon. No single source fully explains the stated daily rate — worth double-checking with Michael. |
| Oat milk | Planet Oat | 4 containers/week | Almost entirely **Walmart** (193 line items); negligible on Amazon (6). |
| Coffee creamer | Coffee mate, coconut | 1.5 containers/week | Almost entirely **Walmart** (142 line items). |
| Yogurt | Chobani | 5/week | 100% **Walmart** (106 line items); zero on Amazon. |
| Toilet paper | — (rate not given) | — | Amazon purchases stop entirely after 2019 — moved to Walmart/Costco since. |
| Paper towels | — (rate not given) | — | Same pattern as toilet paper. |
| Cat food (3 cats: Baby, Omar, Boots) | Friskies Extra Gravy Chunky Variety, canned | — | **Chewy** Autoship, 4 cases of 24 per order, ~71–116 day gaps (only 3 data points so far). |

## Household context relevant to modeling

Kids (Ashlyn, Kylie) moved out about 3 years ago; Kylie returns summers. Buying patterns from more than ~2–3 years ago (especially bulk staples) are **not representative** of current household size — weight recent data heavily, don't smooth over this as noise.

## Next steps

1. Build the actual reorder-interval + deal-detection logic on top of `transaction_log.csv`.
2. Clean up the noisy Costco description merges before running fuzzy product-matching.
3. Add Sam's Club data once available.
4. Get exact weekly toilet paper / paper towel targets from Michael.
5. Decide on the watchlist + which 2–3 sites to wire up live fetchers for first.
