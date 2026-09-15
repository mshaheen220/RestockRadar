-- RestockRadar SQLite schema
-- Pipeline stages: (1) watchlist/site config, (3) price & purchase history.
-- Stages 2/4/5 (fetchers, analysis, alerts) read/write these tables but don't own new ones yet.

PRAGMA foreign_keys = ON;

-- Stage 1: sites we track (both purchase-history sources and future live-fetch targets)
CREATE TABLE IF NOT EXISTS sites (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL UNIQUE,          -- e.g. 'Walmart', 'Amazon', 'Costco', 'Chewy'
    has_live_fetch INTEGER NOT NULL DEFAULT 0,    -- 1 once a stage-2 fetcher exists for this site
    notes         TEXT
);

-- Stage 1: manually curated watchlist of products to track/analyze
CREATE TABLE IF NOT EXISTS watchlist_products (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name       TEXT NOT NULL,                -- e.g. 'Oat milk'
    unit_label         TEXT,                           -- e.g. 'oz', 'ct' — for unit-price normalization
    target_unit_price  REAL,                           -- "a good deal" threshold, e.g. 0.35 for $0.35/ct
    active             INTEGER NOT NULL DEFAULT 1,
    created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- What actually matters about a product, e.g. (attribute_key='variety', attribute_value='Donut Shop',
-- importance='must_match') with brand left unset entirely because any brand of that blend is fine.
-- Deliberately open-ended (no fixed brand/variety columns) so a new kind of criterion — dietary,
-- size, whatever comes up later — never needs a schema change.
CREATE TABLE IF NOT EXISTS watchlist_product_criteria (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_product_id  INTEGER NOT NULL REFERENCES watchlist_products(id) ON DELETE CASCADE,
    attribute_key         TEXT NOT NULL,     -- e.g. 'brand', 'variety', 'dietary', 'size'
    attribute_value       TEXT NOT NULL,     -- e.g. 'Donut Shop', 'lactose-free'
    importance            TEXT NOT NULL DEFAULT 'preferred'
                              CHECK (importance IN ('must_match', 'preferred', 'flexible')),
    UNIQUE(watchlist_product_id, attribute_key)
);

-- The specific real-world products a person would actually buy for this watchlist entry, ranked:
-- rank 1 is the first choice, ranks 2-5 are substitutes in preference order. Distinct from
-- watchlist_product_criteria (abstract "what matters" rules used for fuzzy matching) and from
-- product_aliases (raw purchase-history strings) — this is a person's own curated shortlist,
-- e.g. for future stage-2 price checks: check the first choice, fall back to alternates.
-- site_label is free text, NOT a foreign key to `sites` — that table is purchase-history import
-- sources (Walmart/Amazon/...); a preferred product can come from any site at all (the browser
-- extension in particular writes whatever hostname the page was on).
-- image_url/price/price_currency/price_captured_at are a one-time snapshot from whenever the
-- choice was added or last refreshed (via the URL fetch or the browser extension) — NOT a live or
-- recurring price feed. That's what price_observations below is for, once stage-2 fetchers exist.
-- quantity is the pack size this price is FOR (e.g. 80 for an 80-count K-cup box), in the parent
-- watchlist_products.unit_label's unit — without it, price alone can't say whether $18.99 is good
-- or bad. price / quantity is the unit price, compared against target_unit_price to flag a deal;
-- computed on read, not stored, so it can never drift out of sync with its inputs.
-- quantity_unit is the literal unit that quantity was captured in (see PackQuantity::normalizeUnit) —
-- e.g. 'floz' for a 12-pack of 12 fl oz cans, 'l' for a 2-liter bottle. Without it, a 12-pack of
-- cans and a 2-liter bottle both just have "a quantity", with nothing recording that one is fluid
-- ounces and the other liters — comparing their unit prices would silently be nonsense. Nullable
-- because rows saved before this column existed have no unit on record; PackQuantity::comparable()/
-- convert() decide whether two choices' units can be compared at all before their prices are.
CREATE TABLE IF NOT EXISTS watchlist_product_choices (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_product_id  INTEGER NOT NULL REFERENCES watchlist_products(id) ON DELETE CASCADE,
    rank                  INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 5),
    label                 TEXT NOT NULL,             -- e.g. 'Planet Oat Original Oatmilk, 52 oz'
    site_label            TEXT,                       -- e.g. 'Walmart', 'target.com' — free text
    url                   TEXT,                       -- optional link to the product page
    image_url             TEXT,
    price                 REAL,
    price_currency        TEXT,
    price_captured_at     TEXT,
    quantity               REAL,
    quantity_unit          TEXT,
    UNIQUE(watchlist_product_id, rank)
);

-- Links a watchlist product to the raw product_name/product_id values seen in transactions,
-- since cross-site matching has no shared UPC (see PROJECT-BRIEF.md).
CREATE TABLE IF NOT EXISTS product_aliases (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_product_id  INTEGER NOT NULL REFERENCES watchlist_products(id) ON DELETE CASCADE,
    site_id               INTEGER NOT NULL REFERENCES sites(id),
    raw_product_name      TEXT NOT NULL,
    raw_product_id        TEXT,
    UNIQUE(site_id, raw_product_name)
);

-- Suggestions a person dismissed (stage-4 fuzzy matching, see ProductMatcher) so the same
-- (product, site, raw name) triple doesn't keep resurfacing every time suggestions are recomputed.
CREATE TABLE IF NOT EXISTS watchlist_product_rejected_matches (
    watchlist_product_id  INTEGER NOT NULL REFERENCES watchlist_products(id) ON DELETE CASCADE,
    site_id               INTEGER NOT NULL REFERENCES sites(id),
    raw_product_name      TEXT NOT NULL,
    rejected_at           TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (watchlist_product_id, site_id, raw_product_name)
);

-- Purchase-history items marked "never going to be a watchlist product" (one-off Amazon DVD
-- purchases, etc.) so they stop cluttering the coverage triage view. Global, not tied to any
-- one watchlist product — unlike watchlist_product_rejected_matches, which is a "not for THIS
-- product" rejection and leaves the item open to matching something else.
CREATE TABLE IF NOT EXISTS ignored_purchase_items (
    site_id           INTEGER NOT NULL REFERENCES sites(id),
    raw_product_name  TEXT NOT NULL,
    ignored_at        TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (site_id, raw_product_name)
);

-- Stage 3: unified purchase history, loaded from transaction_log.csv (kept out of git; see .gitignore)
-- Note the naming collision with watchlist_product_choices: `quantity`/`unit_price` here come
-- straight from the source CSVs and mean "how many packages were bought" / "price per package" —
-- e.g. quantity=1, unit_price=18.89 for one $18.89 item. pack_quantity/normalized_unit_price below
-- are a different, later-added axis: how many of the product's own unit (oz/ct/etc., guessed from
-- product_name — see PackQuantity) are INSIDE one package, and the resulting price per oz/ct.
-- Populated by scripts/compute_unit_prices.php, safe to leave NULL where no guess was possible.
-- product_name can be corrected by a person (garbled Costco receipt-OCR text, e.g. "'TALIANO BRD" —
-- see CoverageService::rename()); original_product_name is set once at import and never touched
-- again, so a correction is never destructive. pack_quantity_source distinguishes an automatic
-- guess from a person's own override — CoverageService::setPackQuantity() writes 'user', so a case
-- like Costco's "POISE PLUS" (no size in the name at all, nothing for PackQuantity to guess from)
-- can still get a real value.
CREATE TABLE IF NOT EXISTS transactions (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    txn_date               TEXT NOT NULL,
    site_id                INTEGER NOT NULL REFERENCES sites(id),
    order_id               TEXT NOT NULL,
    product_name           TEXT NOT NULL,
    original_product_name TEXT,                    -- set once at import, immutable after that
    quantity               REAL NOT NULL,
    unit_price             REAL NOT NULL,
    total_price            REAL NOT NULL,
    shipping_charge        REAL NOT NULL DEFAULT 0,
    product_id             TEXT,                  -- ASIN / site item code, not a universal UPC
    category               TEXT,                  -- only populated for Amazon today
    delivery_status        TEXT,
    recent_24mo            INTEGER NOT NULL DEFAULT 0,  -- flag from source data, NOT a filter — see brief
    pack_quantity          REAL,                   -- oz/ct inside one package — guessed or user-set
    pack_quantity_unit     TEXT,                   -- literal unit pack_quantity is in (see PackQuantity::normalizeUnit)
    normalized_unit_price  REAL,                    -- unit_price / pack_quantity — price per oz/ct
    pack_quantity_source   TEXT CHECK (pack_quantity_source IN ('guessed', 'user')),
    UNIQUE(site_id, order_id, product_name, txn_date, total_price)
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(txn_date);
CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions(product_name);

-- Stage 3/4: live price observations from stage-2 fetchers (empty until fetchers exist)
CREATE TABLE IF NOT EXISTS price_observations (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_product_id  INTEGER NOT NULL REFERENCES watchlist_products(id) ON DELETE CASCADE,
    site_id               INTEGER NOT NULL REFERENCES sites(id),
    observed_at           TEXT NOT NULL DEFAULT (datetime('now')),
    price                 REAL NOT NULL,
    shipping_charge       REAL NOT NULL DEFAULT 0,
    effective_price       REAL NOT NULL,   -- price + amortized/threshold-aware shipping
    in_stock              INTEGER NOT NULL DEFAULT 1
);

INSERT OR IGNORE INTO sites (name, has_live_fetch, notes) VALUES
    ('Walmart', 0, 'Order-history CSV export used for stage 3; bot protection blocks live fetch today.'),
    ('Amazon', 0, 'Order History.csv export used for stage 3; bot protection blocks live fetch today.'),
    ('Costco', 0, 'Receipt PDF text extraction used for stage 3; no official API.'),
    ('Chewy', 0, 'Pasted invoice text used for stage 3; Autoship-only history so far.'),
    ('Sam''s Club', 0, 'Pending: access via relative''s membership, not yet pulled.'),
    ('Giant Eagle', 0, 'Permanent gap for in-store purchases; only online orders are visible.');
