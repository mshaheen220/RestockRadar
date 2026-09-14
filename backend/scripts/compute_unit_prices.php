<?php

/**
 * Fills in transactions.pack_quantity and transactions.normalized_unit_price for every distinct
 * product_name where a pack size can be guessed from the name (see RestockRadar\Analysis\PackQuantity)
 * — the true per-oz/per-ct price, as distinct from the existing unit_price column (price per
 * package purchased; see schema.sql's comment on the naming collision).
 *
 * Idempotent and incremental: only touches rows where pack_quantity IS NULL, so re-running after
 * importing more history (or after PackQuantity's regex improves) only processes what's new/still
 * unset. To force a full recompute (e.g. after a regex change), clear the columns first:
 *   UPDATE transactions SET pack_quantity = NULL, normalized_unit_price = NULL;
 *
 * Usage: php backend/scripts/compute_unit_prices.php
 */

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Analysis\PackQuantity;
use RestockRadar\Storage\Database;

$pdo = Database::connection();

$namesStmt = $pdo->query(
    'SELECT DISTINCT product_name FROM transactions WHERE pack_quantity IS NULL'
);
$names = $namesStmt->fetchAll(PDO::FETCH_COLUMN);

$guessed = 0;
$rowsUpdated = 0;

// unit_price varies per row (different sale prices over time) even for the same product_name,
// so normalized_unit_price can't be set with one UPDATE per name — fetch and update each row.
$rowsStmt = $pdo->prepare('SELECT id, unit_price FROM transactions WHERE product_name = :name AND pack_quantity IS NULL');
$rowUpdateStmt = $pdo->prepare(
    'UPDATE transactions SET pack_quantity = :pack_quantity, normalized_unit_price = :normalized_unit_price WHERE id = :id'
);

$pdo->beginTransaction();

foreach ($names as $name) {
    $packQuantity = PackQuantity::guess($name);
    if ($packQuantity === null || $packQuantity == 0.0) {
        continue;
    }

    $rowsStmt->execute(['name' => $name]);
    $rows = $rowsStmt->fetchAll();

    foreach ($rows as $row) {
        $rowUpdateStmt->execute([
            'pack_quantity' => $packQuantity,
            'normalized_unit_price' => $row['unit_price'] / $packQuantity,
            'id' => $row['id'],
        ]);
        $rowsUpdated++;
    }

    $guessed++;
}

$pdo->commit();

$totalDistinctConsidered = count($names);
echo "{$totalDistinctConsidered} distinct product names had no pack quantity yet.\n";
echo "{$guessed} got a guessed pack size, covering {$rowsUpdated} transaction rows.\n";
