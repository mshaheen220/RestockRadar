<?php

/**
 * Loads transaction_log.csv (repo root, gitignored — real purchase history) into the
 * `transactions` table via RestockRadar\Import\TransactionImporter — the same class the
 * Purchases tab's bulk-import uses, so the CLI and the UI can never drift apart. Re-run safe:
 * duplicate rows are skipped via the UNIQUE constraint in schema.sql, not overwritten.
 *
 * Usage: php backend/scripts/import_transactions.php [path/to/transaction_log.csv]
 */

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Import\TransactionImporter;
use RestockRadar\Storage\Database;

$csvPath = $argv[1] ?? __DIR__ . '/../../transaction_log.csv';

if (!file_exists($csvPath)) {
    fwrite(STDERR, "CSV not found: {$csvPath}\n");
    exit(1);
}

$importer = new TransactionImporter(Database::connection());
$result = $importer->importCsvFromFile($csvPath);

echo "Read {$result['read']} rows, inserted {$result['inserted']} new transactions.\n";
