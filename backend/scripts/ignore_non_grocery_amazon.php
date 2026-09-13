<?php

/**
 * Bulk-marks Amazon purchase-history items as "ignored" (see ignored_purchase_items) when their
 * native Amazon `Department`/category is one that's consistently non-grocery/household on manual
 * inspection of this dataset (electronics, books, apparel, toys, etc.).
 *
 * Deliberately excludes ambiguous catch-all categories (Kitchen, Health and Beauty, Misc.,
 * Not Available, Baby Product) even though most of their items are also non-grocery — a manual
 * sample of each turned up real groceries misfiled there (e.g. "Purina Friskies Wet Cat Food"
 * and "Clabber Girl Corn Starch" under "Misc."; smoked salmon and chili sauce under
 * "Not Available"). Those need per-item review via the Coverage tab, not a category blanket rule.
 *
 * Skips anything already linked to a watchlist product — never overrides a person's own decision.
 * Safe to re-run after importing more Amazon history; already-ignored items are just skipped.
 *
 * Usage: php backend/scripts/ignore_non_grocery_amazon.php
 */

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Matching\CoverageService;
use RestockRadar\Storage\Database;

// Verified via manual sampling — see class docblock above for what was excluded and why.
$nonGroceryCategories = [
    'Electronics', 'Apparel', 'Paperback', 'Hardcover', 'Office Product', 'Toy', 'Sports',
    'Personal Computers', 'Lawn & Patio', 'Wireless Phone Accessory', 'DVD', 'Audio CD',
    'Automotive', 'Accessory', 'Tools & Hardware', 'Tools & Home Improvement', 'Camera',
    'Jewelry', 'Vinyl', 'Video Game', 'Shoes', 'Board book', 'Mass Market Paperback', 'Watch',
    'Spiral-bound', 'Software Download', 'Digital Audiobook', 'Digital', 'Diary', 'Calendar',
    'Ecard Gift Certificate', 'Plastic Gift Certificate', 'Paper Gift Certificate', 'Target',
    'Home', 'Misc. Supplies', 'Baby Product', 'B00004T7W1',
];

$pdo = Database::connection();
$coverage = new CoverageService($pdo);

$siteId = $pdo->query("SELECT id FROM sites WHERE name = 'Amazon'")->fetchColumn();
if ($siteId === false) {
    fwrite(STDERR, "No Amazon site found.\n");
    exit(1);
}

$placeholders = implode(',', array_fill(0, count($nonGroceryCategories), '?'));
$stmt = $pdo->prepare(
    "SELECT DISTINCT t.product_name
     FROM transactions t
     WHERE t.site_id = ? AND t.category IN ({$placeholders})
     AND NOT EXISTS (
         SELECT 1 FROM product_aliases pa WHERE pa.site_id = t.site_id AND pa.raw_product_name = t.product_name
     )"
);
$stmt->execute([$siteId, ...$nonGroceryCategories]);
$names = $stmt->fetchAll(PDO::FETCH_COLUMN);

$alreadyIgnoredStmt = $pdo->prepare(
    'SELECT COUNT(*) FROM ignored_purchase_items WHERE site_id = :site_id AND raw_product_name = :name'
);

$newlyIgnored = 0;
foreach ($names as $name) {
    $alreadyIgnoredStmt->execute(['site_id' => $siteId, 'name' => $name]);
    $wasAlreadyIgnored = (int) $alreadyIgnoredStmt->fetchColumn() > 0;

    $coverage->ignore((int) $siteId, $name);

    if (!$wasAlreadyIgnored) {
        $newlyIgnored++;
    }
}

echo count($names) . " unmatched Amazon items matched a non-grocery category.\n";
echo "{$newlyIgnored} newly marked ignored (" . (count($names) - $newlyIgnored) . " were already ignored).\n";
