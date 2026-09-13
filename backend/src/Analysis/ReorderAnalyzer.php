<?php

namespace RestockRadar\Analysis;

use PDO;

/**
 * Stage 4: descriptive-statistics reorder-interval calculation.
 *
 * Deliberately not ML — just gap analysis between purchase dates, with recency
 * weighting so pre-move-out household sizes (see PROJECT-BRIEF.md "Household context")
 * don't drag the average toward stale behavior.
 */
final class ReorderAnalyzer
{
    public function __construct(private PDO $pdo)
    {
    }

    /**
     * @return array{avg_interval_days: ?float, median_interval_days: ?float, weighted_avg_interval_days: ?float,
     *               last_purchase_date: ?string, next_expected_date: ?string, sample_size: int}
     */
    public function computeForProductNames(array $productNames): array
    {
        if ($productNames === []) {
            return $this->emptyResult();
        }

        $placeholders = implode(',', array_fill(0, count($productNames), '?'));
        $stmt = $this->pdo->prepare(
            "SELECT txn_date FROM transactions WHERE product_name IN ({$placeholders}) ORDER BY txn_date ASC"
        );
        $stmt->execute($productNames);
        $dates = array_column($stmt->fetchAll(), 'txn_date');

        if (count($dates) < 2) {
            $result = $this->emptyResult();
            $result['sample_size'] = count($dates);
            $result['last_purchase_date'] = $dates[0] ?? null;

            return $result;
        }

        $intervals = [];
        for ($i = 1; $i < count($dates); $i++) {
            $days = $this->daysBetween($dates[$i - 1], $dates[$i]);
            $intervals[] = ['days' => $days, 'anchor_date' => $dates[$i]];
        }

        $avg = array_sum(array_column($intervals, 'days')) / count($intervals);
        $median = $this->median(array_column($intervals, 'days'));
        $weightedAvg = $this->recencyWeightedAverage($intervals);

        $lastPurchase = $dates[count($dates) - 1];
        $nextExpected = date('Y-m-d', strtotime($lastPurchase) + (int) round($weightedAvg) * 86400);

        return [
            'avg_interval_days' => round($avg, 1),
            'median_interval_days' => round($median, 1),
            'weighted_avg_interval_days' => round($weightedAvg, 1),
            'last_purchase_date' => $lastPurchase,
            'next_expected_date' => $nextExpected,
            'sample_size' => count($dates),
        ];
    }

    /**
     * Half-life recency weighting: an interval observed `halfLifeDays` ago counts half as
     * much as one observed today, relative to the most recent purchase in the series.
     */
    private function recencyWeightedAverage(array $intervals, int $halfLifeDays = 365): float
    {
        $mostRecent = strtotime(end($intervals)['anchor_date']);

        $weightedSum = 0.0;
        $weightTotal = 0.0;

        foreach ($intervals as $interval) {
            $age = ($mostRecent - strtotime($interval['anchor_date'])) / 86400;
            $weight = 0.5 ** ($age / $halfLifeDays);
            $weightedSum += $interval['days'] * $weight;
            $weightTotal += $weight;
        }

        return $weightTotal > 0 ? $weightedSum / $weightTotal : 0.0;
    }

    private function daysBetween(string $earlier, string $later): int
    {
        return (int) round((strtotime($later) - strtotime($earlier)) / 86400);
    }

    private function median(array $values): float
    {
        sort($values);
        $count = count($values);
        $mid = intdiv($count, 2);

        if ($count % 2 === 0) {
            return ($values[$mid - 1] + $values[$mid]) / 2;
        }

        return (float) $values[$mid];
    }

    private function emptyResult(): array
    {
        return [
            'avg_interval_days' => null,
            'median_interval_days' => null,
            'weighted_avg_interval_days' => null,
            'last_purchase_date' => null,
            'next_expected_date' => null,
            'sample_size' => 0,
        ];
    }
}
