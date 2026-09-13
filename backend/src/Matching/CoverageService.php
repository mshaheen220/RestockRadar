<?php

namespace RestockRadar\Matching;

use PDO;

/**
 * Stage 4: reports how much of purchase history is linked to a watchlist product vs. not,
 * and lets a person triage the unlinked remainder directly — the reverse direction from
 * ProductMatcher, which starts from one watchlist product and searches history for it.
 */
final class CoverageService
{
    public function __construct(private PDO $pdo)
    {
    }

    public function summary(): array
    {
        $linked = (int) $this->pdo->query(
            'SELECT COUNT(*) FROM transactions t
             WHERE EXISTS (SELECT 1 FROM product_aliases pa WHERE pa.site_id = t.site_id AND pa.raw_product_name = t.product_name)'
        )->fetchColumn();

        $ignored = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM transactions t
             WHERE NOT EXISTS (SELECT 1 FROM product_aliases pa WHERE pa.site_id = t.site_id AND pa.raw_product_name = t.product_name)
             AND EXISTS (SELECT 1 FROM ignored_purchase_items i WHERE i.site_id = t.site_id AND i.raw_product_name = t.product_name)"
        )->fetchColumn();

        $total = (int) $this->pdo->query('SELECT COUNT(*) FROM transactions')->fetchColumn();
        $unmatched = $total - $linked - $ignored;

        $distinctUnmatched = (int) $this->pdo->query(
            "SELECT COUNT(*) FROM (
                SELECT DISTINCT t.site_id, t.product_name FROM transactions t
                WHERE NOT EXISTS (SELECT 1 FROM product_aliases pa WHERE pa.site_id = t.site_id AND pa.raw_product_name = t.product_name)
                AND NOT EXISTS (SELECT 1 FROM ignored_purchase_items i WHERE i.site_id = t.site_id AND i.raw_product_name = t.product_name)
            )"
        )->fetchColumn();

        return [
            'total_transactions' => $total,
            'linked_transactions' => $linked,
            'ignored_transactions' => $ignored,
            'unmatched_transactions' => $unmatched,
            'unmatched_distinct_items' => $distinctUnmatched,
            'linked_ratio' => $total > 0 ? round($linked / $total, 3) : 0.0,
        ];
    }

    /**
     * Every distinct (site, purchase-history item) pair, annotated with its status —
     * 'linked' (with which watchlist product), 'ignored', or 'unmatched' — and filterable
     * by all three so the same view covers triage and later cleanup/correction.
     *
     * @return array{items: array, total: int}
     */
    public function items(int $limit = 25, int $offset = 0, ?string $status = null, ?string $search = null, ?int $siteId = null): array
    {
        $where = [];
        $params = [];

        if ($siteId !== null) {
            $where[] = 't.site_id = :site_id';
            $params['site_id'] = $siteId;
        }

        if ($search !== null && $search !== '') {
            $where[] = 't.product_name LIKE :search';
            $params['search'] = '%' . $search . '%';
        }

        switch ($status) {
            case 'linked':
                $where[] = 'pa.id IS NOT NULL';
                break;
            case 'ignored':
                $where[] = 'pa.id IS NULL AND ipi.site_id IS NOT NULL';
                break;
            case 'unmatched':
                $where[] = 'pa.id IS NULL AND ipi.site_id IS NULL';
                break;
        }

        $whereSql = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);
        $joins = 'JOIN sites s ON s.id = t.site_id
                  LEFT JOIN product_aliases pa ON pa.site_id = t.site_id AND pa.raw_product_name = t.product_name
                  LEFT JOIN watchlist_products wp ON wp.id = pa.watchlist_product_id
                  LEFT JOIN ignored_purchase_items ipi ON ipi.site_id = t.site_id AND ipi.raw_product_name = t.product_name';

        $countStmt = $this->pdo->prepare(
            "SELECT COUNT(*) FROM (
                SELECT 1 FROM transactions t {$joins} {$whereSql} GROUP BY t.site_id, t.product_name
            )"
        );
        $countStmt->execute($params);
        $total = (int) $countStmt->fetchColumn();

        $stmt = $this->pdo->prepare(
            "SELECT t.site_id, s.name AS site_name, t.product_name,
                    COUNT(*) AS transaction_count, MAX(t.txn_date) AS last_purchased,
                    pa.id AS alias_id, pa.watchlist_product_id, wp.display_name AS linked_product_name,
                    ipi.ignored_at
             FROM transactions t
             {$joins}
             {$whereSql}
             GROUP BY t.site_id, t.product_name
             ORDER BY transaction_count DESC, t.product_name ASC
             LIMIT :limit OFFSET :offset"
        );
        foreach ($params as $key => $value) {
            $stmt->bindValue(":{$key}", $value);
        }
        $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
        $stmt->execute();

        $rows = array_map(function (array $row): array {
            $row['status'] = $row['alias_id'] !== null ? 'linked' : ($row['ignored_at'] !== null ? 'ignored' : 'unmatched');

            return $row;
        }, $stmt->fetchAll());

        return ['items' => $rows, 'total' => $total];
    }

    public function ignore(int $siteId, string $rawProductName): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT OR IGNORE INTO ignored_purchase_items (site_id, raw_product_name) VALUES (:site_id, :name)'
        );
        $stmt->execute(['site_id' => $siteId, 'name' => $rawProductName]);
    }

    public function unignore(int $siteId, string $rawProductName): void
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM ignored_purchase_items WHERE site_id = :site_id AND raw_product_name = :name'
        );
        $stmt->execute(['site_id' => $siteId, 'name' => $rawProductName]);
    }
}
