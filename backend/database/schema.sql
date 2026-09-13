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
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    display_name    TEXT NOT NULL,                -- e.g. 'Oat milk'
    stated_rate     TEXT,                          -- free-text from household, e.g. '4 containers/week'
    unit_label      TEXT,                           -- e.g. 'oz', 'ct' — for unit-price normalization
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
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

-- Stage 3: unified purchase history, loaded from transaction_log.csv (kept out of git; see .gitignore)
CREATE TABLE IF NOT EXISTS transactions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    txn_date         TEXT NOT NULL,
    site_id          INTEGER NOT NULL REFERENCES sites(id),
    order_id         TEXT NOT NULL,
    product_name     TEXT NOT NULL,
    quantity         REAL NOT NULL,
    unit_price       REAL NOT NULL,
    total_price      REAL NOT NULL,
    shipping_charge  REAL NOT NULL DEFAULT 0,
    product_id       TEXT,                  -- ASIN / site item code, not a universal UPC
    category         TEXT,                  -- only populated for Amazon today
    delivery_status  TEXT,
    recent_24mo      INTEGER NOT NULL DEFAULT 0,  -- flag from source data, NOT a filter — see brief
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

-- Stage 4: derived reorder-interval stats per watchlist product (recomputed by the analysis job)
CREATE TABLE IF NOT EXISTS reorder_stats (
    watchlist_product_id  INTEGER PRIMARY KEY REFERENCES watchlist_products(id) ON DELETE CASCADE,
    avg_interval_days      REAL,
    median_interval_days   REAL,
    last_purchase_date     TEXT,
    next_expected_date     TEXT,
    sample_size            INTEGER NOT NULL DEFAULT 0,
    updated_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Stage 5: alerts surfaced to the dashboard/notifications
CREATE TABLE IF NOT EXISTS alerts (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    watchlist_product_id  INTEGER NOT NULL REFERENCES watchlist_products(id) ON DELETE CASCADE,
    kind                  TEXT NOT NULL,   -- 'deal', 'reorder_due', 'all_time_low'
    message                TEXT NOT NULL,
    created_at             TEXT NOT NULL DEFAULT (datetime('now')),
    acknowledged            INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO sites (name, has_live_fetch, notes) VALUES
    ('Walmart', 0, 'Order-history CSV export used for stage 3; bot protection blocks live fetch today.'),
    ('Amazon', 0, 'Order History.csv export used for stage 3; bot protection blocks live fetch today.'),
    ('Costco', 0, 'Receipt PDF text extraction used for stage 3; no official API.'),
    ('Chewy', 0, 'Pasted invoice text used for stage 3; Autoship-only history so far.'),
    ('Sam''s Club', 0, 'Pending: access via relative''s membership, not yet pulled.'),
    ('Giant Eagle', 0, 'Permanent gap for in-store purchases; only online orders are visible.');
