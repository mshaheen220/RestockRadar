<?php

/**
 * Fills in transactions.pack_quantity, pack_quantity_unit, and normalized_unit_price for every
 * distinct product_name where a pack size can be guessed from the name (see
 * RestockRadar\Analysis\PackQuantity) — the true per-oz/per-ct price, as distinct from the
 * existing unit_price column (price per package purchased; see schema.sql's comment on the
 * naming collision).
 *
 * Idempotent and safe to re-run: only touches rows where pack_quantity_source is NULL or
 * 'guessed' — i.e. every automatic guess, never a person's own override via
 * CoverageService::setPackQuantity() (source='user'). Always re-derives guessed rows from
 * scratch (not just NULL ones) so a PackQuantity regex fix retroactively corrects rows it already
 * touched before — e.g. it used to guess 12 (the per-can fl oz) for a 12-pack of ginger ale cans
 * instead of 144 (the true total), until the "N Pack" trailing-multiplier bug was fixed.
 *
 * Usage: php backend/scripts/compute_unit_prices.php
 */

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Analysis\PackQuantity;
use RestockRadar\Storage\Database;

$pdo = Database::connection();

$namesStmt = $pdo->query(
    "SELECT DISTINCT product_name FROM transactions WHERE pack_quantity_source IS NULL OR pack_quantity_source = 'guessed'"
);
$names = $namesStmt->fetchAll(PDO::FETCH_COLUMN);

$guessed = 0;
$rowsUpdated = 0;

// unit_price varies per row (different sale prices over time) even for the same product_name,
// so normalized_unit_price can't be set with one UPDATE per name — fetch and update each row.
$rowsStmt = $pdo->prepare(
    "SELECT id, unit_price FROM transactions WHERE product_name = :name
     AND (pack_quantity_source IS NULL OR pack_quantity_source = 'guessed')"
);
$rowUpdateStmt = $pdo->prepare(
    'UPDATE transactions SET pack_quantity = :pack_quantity, pack_quantity_unit = :pack_quantity_unit,
        normalized_unit_price = :normalized_unit_price, pack_quantity_source = :source WHERE id = :id'
);

$pdo->beginTransaction();

foreach ($names as $name) {
    $guess = PackQuantity::guess($name);
    if ($guess === null || $guess['quantity'] == 0.0) {
        continue;
    }

    $rowsStmt->execute(['name' => $name]);
    $rows = $rowsStmt->fetchAll();

    foreach ($rows as $row) {
        $rowUpdateStmt->execute([
            'pack_quantity' => $guess['quantity'],
            'pack_quantity_unit' => $guess['unit'],
            'normalized_unit_price' => $row['unit_price'] / $guess['quantity'],
            'source' => 'guessed',
            'id' => $row['id'],
        ]);
        $rowsUpdated++;
    }

    $guessed++;
}

$pdo->commit();

$totalDistinctConsidered = count($names);
echo "{$totalDistinctConsidered} distinct product names had no pack quantity yet or were only guessed.\n";
echo "{$guessed} got a guessed pack size, covering {$rowsUpdated} transaction rows.\n";
