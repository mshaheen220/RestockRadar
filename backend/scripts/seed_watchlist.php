<?php

/**
 * Seeds watchlist_products (+ criteria) from the "Consumption profile" table in
 * PROJECT-BRIEF.md. A starting point, not a final decision — edit/replace via the
 * Manage Watchlist UI once it's running.
 *
 * Usage: php backend/scripts/seed_watchlist.php
 */

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Storage\Database;
use RestockRadar\Watchlist\WatchlistRepository;

$pdo = Database::connection();
$repo = new WatchlistRepository($pdo);

// [display_name, unit_label, criteria]
// criteria: list of [attribute_key, attribute_value, importance]
$seed = [
    ['K-cups', 'ct', [
        ['variety', 'Donut Shop blend / Amazon Medium Roast', 'preferred'],
    ]],
    ['Oat milk', 'oz', [
        ['brand', 'Planet Oat', 'preferred'],
    ]],
    ['Coffee creamer', 'oz', [
        ['brand', 'Coffee mate', 'preferred'],
        ['variety', 'coconut', 'must_match'],
    ]],
    ['Yogurt', 'oz', [
        ['brand', 'Chobani', 'preferred'],
    ]],
    ['Toilet paper', 'ct', []],
    ['Paper towels', 'ct', []],
    ['Cat food', 'ct', [
        ['variety', 'Friskies Extra Gravy Chunky Variety, canned', 'must_match'],
    ]],
];

$existing = array_column($repo->all(), 'display_name');

foreach ($seed as [$displayName, $unit, $criteria]) {
    if (in_array($displayName, $existing, true)) {
        echo "Skipping (already exists): {$displayName}\n";
        continue;
    }

    $id = $repo->create($displayName, $unit);

    foreach ($criteria as [$key, $value, $importance]) {
        $repo->addCriterion($id, $key, $value, $importance);
    }

    echo "Added: {$displayName}\n";
}
