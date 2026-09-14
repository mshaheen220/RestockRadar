<?php

/**
 * Loads transaction_log.csv (repo root, gitignored — real purchase history) into the
 * `transactions` table. Re-run safe: duplicate rows are skipped via the UNIQUE constraint
 * in schema.sql, not overwritten.
 *
 * Usage: php backend/scripts/import_transactions.php [path/to/transaction_log.csv]
 */

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Storage\Database;

$csvPath = $argv[1] ?? __DIR__ . '/../../transaction_log.csv';

if (!file_exists($csvPath)) {
    fwrite(STDERR, "CSV not found: {$csvPath}\n");
    exit(1);
}

$pdo = Database::connection();

$siteIdCache = [];
$siteLookupStmt = $pdo->prepare('SELECT id FROM sites WHERE name = :name');
$siteInsertStmt = $pdo->prepare('INSERT INTO sites (name) VALUES (:name)');

function resolveSiteId(PDO $pdo, array &$cache, string $name, \PDOStatement $lookup, \PDOStatement $insert): int
{
    if (isset($cache[$name])) {
        return $cache[$name];
    }

    $lookup->execute(['name' => $name]);
    $row = $lookup->fetch();

    if ($row === false) {
        $insert->execute(['name' => $name]);
        $id = (int) $pdo->lastInsertId();
    } else {
        $id = (int) $row['id'];
    }

    $cache[$name] = $id;

    return $id;
}

$insertStmt = $pdo->prepare(
    'INSERT OR IGNORE INTO transactions
        (txn_date, site_id, order_id, product_name, original_product_name, quantity, unit_price, total_price,
         shipping_charge, product_id, category, delivery_status, recent_24mo)
     VALUES
        (:txn_date, :site_id, :order_id, :product_name, :original_product_name, :quantity, :unit_price, :total_price,
         :shipping_charge, :product_id, :category, :delivery_status, :recent_24mo)'
);

$handle = fopen($csvPath, 'r');
$header = fgetcsv($handle);
$expected = [
    'date', 'site', 'order_id', 'product_name', 'quantity', 'unit_price', 'total_price',
    'shipping_charge', 'product_id', 'category', 'delivery_status', 'recent_24mo',
];

if ($header !== $expected) {
    fwrite(STDERR, "Unexpected CSV header. Expected: " . implode(',', $expected) . "\n");
    exit(1);
}

$pdo->beginTransaction();

$rowCount = 0;
$insertedCount = 0;

while (($row = fgetcsv($handle)) !== false) {
    [$date, $site, $orderId, $productName, $quantity, $unitPrice, $totalPrice,
        $shippingCharge, $productId, $category, $deliveryStatus, $recent24mo] = $row;

    $siteId = resolveSiteId($pdo, $siteIdCache, $site, $siteLookupStmt, $siteInsertStmt);

    $insertStmt->execute([
        'txn_date' => $date,
        'site_id' => $siteId,
        'order_id' => $orderId,
        'product_name' => $productName,
        'original_product_name' => $productName,
        'quantity' => (float) $quantity,
        'unit_price' => (float) $unitPrice,
        'total_price' => (float) $totalPrice,
        'shipping_charge' => (float) $shippingCharge,
        'product_id' => $productId !== '' ? $productId : null,
        'category' => $category !== '' ? $category : null,
        'delivery_status' => $deliveryStatus !== '' ? $deliveryStatus : null,
        'recent_24mo' => strtolower((string) $recent24mo) === 'true' ? 1 : 0,
    ]);

    $rowCount++;
    if ($insertStmt->rowCount() > 0) {
        $insertedCount++;
    }
}

fclose($handle);
$pdo->commit();

echo "Read {$rowCount} rows, inserted {$insertedCount} new transactions.\n";
