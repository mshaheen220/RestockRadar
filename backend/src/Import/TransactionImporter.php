<?php

namespace RestockRadar\Import;

use PDO;
use RestockRadar\Analysis\PackQuantity;

/**
 * Stage 3: gets purchase history INTO `transactions` — two paths, one shared core.
 *
 * importCsv() is the bulk path: the same unified format that seeded all of transaction_log.csv
 * (date, site, order_id, product_name, quantity, unit_price, total_price, shipping_charge,
 * product_id, category, delivery_status, recent_24mo), whether that arrives as a full file
 * (scripts/import_transactions.php) or pasted/uploaded through the Purchases tab
 * (POST /purchases/import) — both call this class instead of duplicating the parsing logic.
 * Re-run safe: duplicate rows are skipped via the UNIQUE constraint in schema.sql (site + order +
 * product + date + price), not overwritten.
 *
 * addSingle() is the other path: "I bought one thing, there's no receipt to import" (e.g. picked
 * up toilet paper on the way home) — inserts one row directly, guesses pack_quantity/unit from
 * the product name immediately via PackQuantity (same as compute_unit_prices.php does in bulk),
 * and fabricates an order_id since transactions.order_id is NOT NULL but a walk-in purchase has
 * no real one.
 */
final class TransactionImporter
{
    private const EXPECTED_HEADER = [
        'date', 'site', 'order_id', 'product_name', 'quantity', 'unit_price', 'total_price',
        'shipping_charge', 'product_id', 'category', 'delivery_status', 'recent_24mo',
    ];

    private array $siteIdCache = [];

    public function __construct(private PDO $pdo)
    {
    }

    /** @return array{read: int, inserted: int} */
    public function importCsvFromFile(string $path): array
    {
        $handle = fopen($path, 'r');
        if ($handle === false) {
            throw new \RuntimeException("Could not open {$path}");
        }

        try {
            return $this->importFromHandle($handle);
        } finally {
            fclose($handle);
        }
    }

    /** @return array{read: int, inserted: int} */
    public function importCsvFromString(string $csv): array
    {
        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $csv);
        rewind($handle);

        try {
            return $this->importFromHandle($handle);
        } finally {
            fclose($handle);
        }
    }

    /**
     * $input['pack_quantity']/['pack_quantity_unit'], when given, override PackQuantity::guess()
     * entirely (pack_quantity_source = 'user') — for when the product name alone has nothing to
     * guess from ("Charmin Ultra Soft Toilet Paper" doesn't say 24 anywhere), or the guess would
     * be wrong, and a person checked the actual package instead. Omit both to fall back to
     * guessing from the name, same as everywhere else.
     *
     * @param array{site_name: string, product_name: string, quantity: float, unit_price: float,
     *              txn_date?: ?string, category?: ?string, pack_quantity?: ?float, pack_quantity_unit?: ?string} $input
     */
    public function addSingle(array $input): int
    {
        $siteId = $this->resolveSiteId($input['site_name']);
        $totalPrice = $input['quantity'] * $input['unit_price'];
        $orderId = 'manual-' . bin2hex(random_bytes(6));

        if (!empty($input['pack_quantity'])) {
            $packQuantity = (float) $input['pack_quantity'];
            $packQuantityUnit = $input['pack_quantity_unit'] ?? null;
            $packQuantitySource = 'user';
        } else {
            $guess = PackQuantity::guess($input['product_name']);
            $packQuantity = $guess['quantity'] ?? null;
            $packQuantityUnit = $guess['unit'] ?? null;
            $packQuantitySource = $guess !== null ? 'guessed' : null;
        }

        $stmt = $this->pdo->prepare(
            'INSERT INTO transactions
                (txn_date, site_id, order_id, product_name, original_product_name, quantity, unit_price,
                 total_price, shipping_charge, category, recent_24mo, pack_quantity, pack_quantity_unit,
                 normalized_unit_price, pack_quantity_source)
             VALUES
                (:txn_date, :site_id, :order_id, :product_name, :original_product_name, :quantity, :unit_price,
                 :total_price, 0, :category, 1, :pack_quantity, :pack_quantity_unit,
                 :normalized_unit_price, :pack_quantity_source)'
        );
        $stmt->execute([
            'txn_date' => $input['txn_date'] ?? date('Y-m-d'),
            'site_id' => $siteId,
            'order_id' => $orderId,
            'product_name' => $input['product_name'],
            'original_product_name' => $input['product_name'],
            'quantity' => $input['quantity'],
            'unit_price' => $input['unit_price'],
            'total_price' => $totalPrice,
            'category' => $input['category'] ?? null,
            'pack_quantity' => $packQuantity,
            'pack_quantity_unit' => $packQuantityUnit,
            'normalized_unit_price' => $packQuantity !== null && $packQuantity > 0 ? $input['unit_price'] / $packQuantity : null,
            'pack_quantity_source' => $packQuantitySource,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return array{read: int, inserted: int} */
    private function importFromHandle($handle): array
    {
        $header = fgetcsv($handle);
        if ($header !== self::EXPECTED_HEADER) {
            throw new \RuntimeException('Unexpected CSV header. Expected: ' . implode(',', self::EXPECTED_HEADER));
        }

        $insertStmt = $this->pdo->prepare(
            'INSERT OR IGNORE INTO transactions
                (txn_date, site_id, order_id, product_name, original_product_name, quantity, unit_price, total_price,
                 shipping_charge, product_id, category, delivery_status, recent_24mo)
             VALUES
                (:txn_date, :site_id, :order_id, :product_name, :original_product_name, :quantity, :unit_price, :total_price,
                 :shipping_charge, :product_id, :category, :delivery_status, :recent_24mo)'
        );

        $this->pdo->beginTransaction();

        $rowCount = 0;
        $insertedCount = 0;

        while (($row = fgetcsv($handle)) !== false) {
            [$date, $site, $orderId, $productName, $quantity, $unitPrice, $totalPrice,
                $shippingCharge, $productId, $category, $deliveryStatus, $recent24mo] = $row;

            $siteId = $this->resolveSiteId($site);

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

        $this->pdo->commit();

        return ['read' => $rowCount, 'inserted' => $insertedCount];
    }

    private function resolveSiteId(string $name): int
    {
        if (isset($this->siteIdCache[$name])) {
            return $this->siteIdCache[$name];
        }

        $lookup = $this->pdo->prepare('SELECT id FROM sites WHERE name = :name');
        $lookup->execute(['name' => $name]);
        $row = $lookup->fetch();

        if ($row === false) {
            $insert = $this->pdo->prepare('INSERT INTO sites (name) VALUES (:name)');
            $insert->execute(['name' => $name]);
            $id = (int) $this->pdo->lastInsertId();
        } else {
            $id = (int) $row['id'];
        }

        $this->siteIdCache[$name] = $id;

        return $id;
    }
}
