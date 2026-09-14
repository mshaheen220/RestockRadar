<?php

namespace RestockRadar\Analysis;

use PDO;

/**
 * Stage 4: the other half of "deal & habit analysis" — ReorderAnalyzer answers "when will I need
 * to buy this again"; this answers "is the price I'm looking at actually good, based on what I've
 * paid before." Deliberately descriptive statistics over transactions.normalized_unit_price, not
 * ML, same as the rest of this app.
 *
 * Two separate prices matter here and must not be confused:
 *   - Historical stats come from `transactions` — what you've actually PAID before.
 *   - The price being evaluated comes from a watchlist_product_choices row — a price you (or the
 *     browser extension) captured just now, for a product you're considering buying. Comparing a
 *     past purchase price against its own history would be circular and useless; the point is
 *     comparing what's in front of you right now against what you've paid in the past.
 */
final class DealDetector
{
    private const ROLLING_WINDOW_DAYS = 180;

    // A "good deal" is at least this far below the rolling average — 10%, not just any dip,
    // so ordinary price noise doesn't trigger an alert every time.
    private const GOOD_DEAL_MARGIN = 0.90;

    private const MIN_SAMPLE_SIZE = 3;

    public function __construct(private PDO $pdo)
    {
    }

    /**
     * $targetUnit re-expresses every row in one unit before averaging — without it, a case of 12
     * fl oz cans and a 2-liter bottle of the same product would both just contribute "a unit
     * price" to the same average despite being priced per different-sized units. A row whose own
     * unit is known and DOESN'T convert into $targetUnit is excluded outright rather than mixed
     * in; a row with no unit on record at all (saved before pack_quantity_unit existed) is kept
     * as-is, same as before this parameter existed, since there's nothing to check it against.
     *
     * @return array{sample_size: int, min_unit_price: ?float, avg_unit_price: ?float,
     *               rolling_avg_unit_price: ?float, last_purchase_unit_price: ?float, last_purchase_date: ?string}
     */
    public function historicalStats(array $productNames, ?string $targetUnit = null): array
    {
        if ($productNames === []) {
            return $this->emptyStats();
        }

        $placeholders = implode(',', array_fill(0, count($productNames), '?'));
        $stmt = $this->pdo->prepare(
            "SELECT txn_date, unit_price, pack_quantity, pack_quantity_unit, normalized_unit_price FROM transactions
             WHERE product_name IN ({$placeholders}) AND normalized_unit_price IS NOT NULL
             ORDER BY txn_date ASC"
        );
        $stmt->execute($productNames);
        $allRows = $stmt->fetchAll();

        $rows = [];
        foreach ($allRows as $row) {
            $price = (float) $row['normalized_unit_price'];
            $rowUnit = $row['pack_quantity_unit'];

            if ($targetUnit !== null && $rowUnit !== null && $rowUnit !== $targetUnit) {
                $convertedQuantity = PackQuantity::convert((float) $row['pack_quantity'], $rowUnit, $targetUnit);
                if ($convertedQuantity === null) {
                    continue;
                }
                $price = (float) $row['unit_price'] / $convertedQuantity;
            }

            $rows[] = ['txn_date' => $row['txn_date'], 'normalized_unit_price' => $price];
        }

        if ($rows === []) {
            return $this->emptyStats();
        }

        $prices = array_map(fn ($r) => (float) $r['normalized_unit_price'], $rows);
        $min = min($prices);
        $avg = array_sum($prices) / count($prices);

        $lastRow = $rows[count($rows) - 1];
        $cutoff = strtotime($lastRow['txn_date']) - self::ROLLING_WINDOW_DAYS * 86400;
        $recentPrices = [];
        foreach ($rows as $row) {
            if (strtotime($row['txn_date']) >= $cutoff) {
                $recentPrices[] = (float) $row['normalized_unit_price'];
            }
        }
        $rollingAvg = count($recentPrices) >= 2 ? array_sum($recentPrices) / count($recentPrices) : $avg;

        return [
            'sample_size' => count($rows),
            'min_unit_price' => round($min, 4),
            'avg_unit_price' => round($avg, 4),
            'rolling_avg_unit_price' => round($rollingAvg, 4),
            'last_purchase_unit_price' => round((float) $lastRow['normalized_unit_price'], 4),
            'last_purchase_date' => $lastRow['txn_date'],
        ];
    }

    /**
     * @return array{verdict: string, message: ?string}
     */
    public function evaluate(float $currentUnitPrice, array $stats): array
    {
        if ($stats['sample_size'] < self::MIN_SAMPLE_SIZE) {
            return ['verdict' => 'insufficient_history', 'message' => null];
        }

        if ($currentUnitPrice <= $stats['min_unit_price']) {
            return [
                'verdict' => 'all_time_low',
                'message' => sprintf(
                    'All-time low: $%s (previous low was $%s, from %d purchases)',
                    number_format($currentUnitPrice, 3),
                    number_format($stats['min_unit_price'], 3),
                    $stats['sample_size'],
                ),
            ];
        }

        $threshold = $stats['rolling_avg_unit_price'] * self::GOOD_DEAL_MARGIN;
        if ($currentUnitPrice <= $threshold) {
            $percentBelow = round((1 - $currentUnitPrice / $stats['rolling_avg_unit_price']) * 100);

            return [
                'verdict' => 'good_deal',
                'message' => sprintf(
                    '%d%% below your recent average ($%s vs $%s)',
                    $percentBelow,
                    number_format($currentUnitPrice, 3),
                    number_format($stats['rolling_avg_unit_price'], 3),
                ),
            ];
        }

        return ['verdict' => 'normal', 'message' => null];
    }

    private function emptyStats(): array
    {
        return [
            'sample_size' => 0,
            'min_unit_price' => null,
            'avg_unit_price' => null,
            'rolling_avg_unit_price' => null,
            'last_purchase_unit_price' => null,
            'last_purchase_date' => null,
        ];
    }
}
