<?php

/**
 * Minimal front controller — no framework, since the API surface is small.
 * Routes:
 *   GET    /api/watchlist
 *   POST   /api/watchlist
 *   PATCH  /api/watchlist/{id}
 *   DELETE /api/watchlist/{id}
 *   GET    /api/watchlist/{id}/reorder-stats
 *   POST   /api/watchlist/{id}/criteria
 *   DELETE /api/watchlist/{id}/criteria/{criterionId}
 *   GET    /api/alerts
 *   GET    /api/transactions/summary
 */

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Alerts\AlertRepository;
use RestockRadar\Analysis\ReorderAnalyzer;
use RestockRadar\Storage\Database;
use RestockRadar\Watchlist\WatchlistRepository;

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: ' . (getenv('RESTOCKRADAR_ALLOWED_ORIGIN') ?: '*'));
header('Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$pdo = Database::connection();
$path = rtrim(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH), '/');
$path = preg_replace('#^/api#', '', $path) ?: '/';
$method = $_SERVER['REQUEST_METHOD'];

function respond(mixed $data, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($data, JSON_PRETTY_PRINT);
    exit;
}

function jsonBody(): array
{
    $raw = file_get_contents('php://input');
    $decoded = $raw === '' ? [] : json_decode($raw, true);

    return is_array($decoded) ? $decoded : [];
}

$watchlistRepo = new WatchlistRepository($pdo);

if ($path === '/watchlist' && $method === 'GET') {
    respond($watchlistRepo->all());
}

if ($path === '/watchlist' && $method === 'POST') {
    $body = jsonBody();

    if (!isset($body['display_name']) || trim((string) $body['display_name']) === '') {
        respond(['error' => 'display_name is required'], 422);
    }

    $id = $watchlistRepo->create($body['display_name'], $body['stated_rate'] ?? null, $body['unit_label'] ?? null);
    respond($watchlistRepo->find($id), 201);
}

if (preg_match('#^/watchlist/(\d+)$#', $path, $m) && $method === 'PATCH') {
    $id = (int) $m[1];

    if ($watchlistRepo->find($id) === null) {
        respond(['error' => 'Not found'], 404);
    }

    $watchlistRepo->update($id, jsonBody());
    respond($watchlistRepo->find($id));
}

if (preg_match('#^/watchlist/(\d+)$#', $path, $m) && $method === 'DELETE') {
    $id = (int) $m[1];
    $watchlistRepo->delete($id);
    respond(['deleted' => $id]);
}

if (preg_match('#^/watchlist/(\d+)/reorder-stats$#', $path, $m) && $method === 'GET') {
    $watchlistId = (int) $m[1];
    $aliases = $watchlistRepo->aliasesFor($watchlistId);
    $productNames = array_column($aliases, 'raw_product_name');

    $analyzer = new ReorderAnalyzer($pdo);
    respond($analyzer->computeForProductNames($productNames));
}

if (preg_match('#^/watchlist/(\d+)/criteria$#', $path, $m) && $method === 'POST') {
    $watchlistId = (int) $m[1];
    $body = jsonBody();

    foreach (['attribute_key', 'attribute_value'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $importance = $body['importance'] ?? 'preferred';
    if (!in_array($importance, ['must_match', 'preferred', 'flexible'], true)) {
        respond(['error' => 'importance must be one of: must_match, preferred, flexible'], 422);
    }

    $watchlistRepo->addCriterion($watchlistId, $body['attribute_key'], $body['attribute_value'], $importance);
    respond($watchlistRepo->find($watchlistId), 201);
}

if (preg_match('#^/watchlist/(\d+)/criteria/(\d+)$#', $path, $m) && $method === 'DELETE') {
    [$watchlistId, $criterionId] = [(int) $m[1], (int) $m[2]];
    $watchlistRepo->deleteCriterion($watchlistId, $criterionId);
    respond($watchlistRepo->find($watchlistId));
}

if ($path === '/alerts' && $method === 'GET') {
    $repo = new AlertRepository($pdo);
    respond($repo->unacknowledged());
}

if ($path === '/transactions/summary' && $method === 'GET') {
    $stmt = $pdo->query(
        "SELECT COUNT(*) AS row_count, MIN(txn_date) AS earliest, MAX(txn_date) AS latest,
                (SELECT COUNT(DISTINCT site_id) FROM transactions) AS distinct_sites
         FROM transactions"
    );
    respond($stmt->fetch());
}

respond(['error' => 'Not found', 'path' => $path], 404);
