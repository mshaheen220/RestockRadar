<?php

namespace RestockRadar\Alerts;

use PDO;

/**
 * Stage 5: reads/writes alerts surfaced on the dashboard. Deal/all-time-low detection
 * (stage 4) is not implemented yet — this just persists and lists whatever gets created.
 */
final class AlertRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function unacknowledged(): array
    {
        $stmt = $this->pdo->query(
            "SELECT a.id, a.kind, a.message, a.created_at, wp.display_name
             FROM alerts a
             JOIN watchlist_products wp ON wp.id = a.watchlist_product_id
             WHERE a.acknowledged = 0
             ORDER BY a.created_at DESC"
        );

        return $stmt->fetchAll();
    }

    public function create(int $watchlistProductId, string $kind, string $message): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO alerts (watchlist_product_id, kind, message) VALUES (:wp_id, :kind, :message)'
        );
        $stmt->execute(['wp_id' => $watchlistProductId, 'kind' => $kind, 'message' => $message]);

        return (int) $this->pdo->lastInsertId();
    }

    public function acknowledge(int $alertId): void
    {
        $stmt = $this->pdo->prepare('UPDATE alerts SET acknowledged = 1 WHERE id = :id');
        $stmt->execute(['id' => $alertId]);
    }
}
