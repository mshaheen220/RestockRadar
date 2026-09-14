<?php

namespace RestockRadar\Watchlist;

use PDO;

/**
 * Stage 1: CRUD over the manually curated watchlist, its "what matters" criteria
 * (see watchlist_product_criteria in schema.sql), and per-site product aliases.
 */
final class WatchlistRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    public function all(): array
    {
        $stmt = $this->pdo->query(
            'SELECT id, display_name, stated_rate, unit_label, target_unit_price, active
             FROM watchlist_products ORDER BY display_name ASC'
        );
        $products = $stmt->fetchAll();

        foreach ($products as &$product) {
            $product['criteria'] = $this->criteriaFor((int) $product['id']);
            $product['aliases'] = $this->aliasesFor((int) $product['id']);
            $product['choices'] = $this->choicesFor((int) $product['id']);
        }

        return $products;
    }

    public function find(int $id): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, display_name, stated_rate, unit_label, target_unit_price, active FROM watchlist_products WHERE id = :id'
        );
        $stmt->execute(['id' => $id]);
        $product = $stmt->fetch();

        if ($product === false) {
            return null;
        }

        $product['criteria'] = $this->criteriaFor($id);
        $product['aliases'] = $this->aliasesFor($id);
        $product['choices'] = $this->choicesFor($id);

        return $product;
    }

    public function create(string $displayName, ?string $statedRate, ?string $unitLabel): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO watchlist_products (display_name, stated_rate, unit_label) VALUES (:display_name, :stated_rate, :unit_label)'
        );
        $stmt->execute([
            'display_name' => $displayName,
            'stated_rate' => $statedRate,
            'unit_label' => $unitLabel,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function update(int $id, array $fields): void
    {
        $allowed = ['display_name', 'stated_rate', 'unit_label', 'target_unit_price', 'active'];
        $sets = [];
        $params = ['id' => $id];

        foreach ($fields as $key => $value) {
            if (!in_array($key, $allowed, true)) {
                continue;
            }
            $sets[] = "{$key} = :{$key}";
            $params[$key] = $value;
        }

        if ($sets === []) {
            return;
        }

        $stmt = $this->pdo->prepare('UPDATE watchlist_products SET ' . implode(', ', $sets) . ' WHERE id = :id');
        $stmt->execute($params);
    }

    public function delete(int $id): void
    {
        $stmt = $this->pdo->prepare('DELETE FROM watchlist_products WHERE id = :id');
        $stmt->execute(['id' => $id]);
    }

    public function criteriaFor(int $watchlistProductId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, attribute_key, attribute_value, importance
             FROM watchlist_product_criteria WHERE watchlist_product_id = :id ORDER BY attribute_key ASC'
        );
        $stmt->execute(['id' => $watchlistProductId]);

        return $stmt->fetchAll();
    }

    public function addCriterion(int $watchlistProductId, string $attributeKey, string $attributeValue, string $importance): int
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO watchlist_product_criteria (watchlist_product_id, attribute_key, attribute_value, importance)
             VALUES (:wp_id, :key, :value, :importance)
             ON CONFLICT(watchlist_product_id, attribute_key)
             DO UPDATE SET attribute_value = :value, importance = :importance'
        );
        $stmt->execute([
            'wp_id' => $watchlistProductId,
            'key' => $attributeKey,
            'value' => $attributeValue,
            'importance' => $importance,
        ]);

        $idStmt = $this->pdo->prepare(
            'SELECT id FROM watchlist_product_criteria WHERE watchlist_product_id = :wp_id AND attribute_key = :key'
        );
        $idStmt->execute(['wp_id' => $watchlistProductId, 'key' => $attributeKey]);

        return (int) $idStmt->fetchColumn();
    }

    public function deleteCriterion(int $watchlistProductId, int $criterionId): void
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM watchlist_product_criteria WHERE id = :id AND watchlist_product_id = :wp_id'
        );
        $stmt->execute(['id' => $criterionId, 'wp_id' => $watchlistProductId]);
    }

    public function aliasesFor(int $watchlistProductId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT pa.id, pa.raw_product_name, pa.raw_product_id, pa.site_id, s.name AS site_name
             FROM product_aliases pa
             JOIN sites s ON s.id = pa.site_id
             WHERE pa.watchlist_product_id = :id
             ORDER BY s.name ASC, pa.raw_product_name ASC'
        );
        $stmt->execute(['id' => $watchlistProductId]);

        return $stmt->fetchAll();
    }

    public function addAlias(int $watchlistProductId, int $siteId, string $rawProductName, ?string $rawProductId): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT OR IGNORE INTO product_aliases (watchlist_product_id, site_id, raw_product_name, raw_product_id)
             VALUES (:watchlist_product_id, :site_id, :raw_product_name, :raw_product_id)'
        );
        $stmt->execute([
            'watchlist_product_id' => $watchlistProductId,
            'site_id' => $siteId,
            'raw_product_name' => $rawProductName,
            'raw_product_id' => $rawProductId,
        ]);
    }

    public function removeAlias(int $watchlistProductId, int $aliasId): void
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM product_aliases WHERE id = :id AND watchlist_product_id = :wp_id'
        );
        $stmt->execute(['id' => $aliasId, 'wp_id' => $watchlistProductId]);
    }

    public function siteIdByName(string $siteName): ?int
    {
        $stmt = $this->pdo->prepare('SELECT id FROM sites WHERE name = :name');
        $stmt->execute(['name' => $siteName]);
        $id = $stmt->fetchColumn();

        return $id === false ? null : (int) $id;
    }

    public function rejectMatch(int $watchlistProductId, int $siteId, string $rawProductName): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT OR IGNORE INTO watchlist_product_rejected_matches (watchlist_product_id, site_id, raw_product_name)
             VALUES (:wp_id, :site_id, :raw_product_name)'
        );
        $stmt->execute([
            'wp_id' => $watchlistProductId,
            'site_id' => $siteId,
            'raw_product_name' => $rawProductName,
        ]);
    }

    /** Ranked 1 (first choice) through 5 (fourth backup); see watchlist_product_choices in schema.sql. */
    public function choicesFor(int $watchlistProductId): array
    {
        $stmt = $this->pdo->prepare(
            'SELECT id, rank, label, site_label AS site_name, url, image_url, price, price_currency, price_captured_at, quantity, quantity_unit
             FROM watchlist_product_choices
             WHERE watchlist_product_id = :id
             ORDER BY rank ASC'
        );
        $stmt->execute(['id' => $watchlistProductId]);

        return $stmt->fetchAll();
    }

    /**
     * $fields may include: site_label, url, image_url, price, price_currency, quantity,
     * quantity_unit. Any key omitted (not just null) keeps whatever that slot already had — e.g.
     * editing just the label doesn't wipe out a previously captured price/image/quantity snapshot.
     */
    public function setChoice(int $watchlistProductId, int $rank, string $label, array $fields = []): void
    {
        $existingStmt = $this->pdo->prepare(
            'SELECT site_label, url, image_url, price, price_currency, price_captured_at, quantity, quantity_unit
             FROM watchlist_product_choices WHERE watchlist_product_id = :wp_id AND rank = :rank'
        );
        $existingStmt->execute(['wp_id' => $watchlistProductId, 'rank' => $rank]);
        $existing = $existingStmt->fetch() ?: [];

        $pick = fn (string $key) => array_key_exists($key, $fields) ? $fields[$key] : ($existing[$key] ?? null);

        $priceCapturedAt = array_key_exists('price', $fields)
            ? ($fields['price'] !== null ? date('Y-m-d H:i:s') : null)
            : ($existing['price_captured_at'] ?? null);

        $params = [
            'wp_id' => $watchlistProductId,
            'rank' => $rank,
            'label' => $label,
            'site_label' => $pick('site_label'),
            'url' => $pick('url'),
            'image_url' => $pick('image_url'),
            'price' => $pick('price'),
            'price_currency' => $pick('price_currency'),
            'price_captured_at' => $priceCapturedAt,
            'quantity' => $pick('quantity'),
            'quantity_unit' => $pick('quantity_unit'),
        ];

        $stmt = $this->pdo->prepare(
            'INSERT INTO watchlist_product_choices
                (watchlist_product_id, rank, label, site_label, url, image_url, price, price_currency, price_captured_at, quantity, quantity_unit)
             VALUES (:wp_id, :rank, :label, :site_label, :url, :image_url, :price, :price_currency, :price_captured_at, :quantity, :quantity_unit)
             ON CONFLICT(watchlist_product_id, rank)
             DO UPDATE SET label = :label, site_label = :site_label, url = :url, image_url = :image_url,
                            price = :price, price_currency = :price_currency, price_captured_at = :price_captured_at,
                            quantity = :quantity, quantity_unit = :quantity_unit'
        );
        $stmt->execute($params);
    }

    public function removeChoice(int $watchlistProductId, int $rank): void
    {
        $stmt = $this->pdo->prepare(
            'DELETE FROM watchlist_product_choices WHERE watchlist_product_id = :wp_id AND rank = :rank'
        );
        $stmt->execute(['wp_id' => $watchlistProductId, 'rank' => $rank]);
    }
}
