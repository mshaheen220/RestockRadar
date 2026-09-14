<?php

/**
 * Minimal front controller — no framework, since the API surface is small.
 * Routes:
 *   GET    /api/watchlist
 *   POST   /api/watchlist
 *   PATCH  /api/watchlist/{id}
 *   DELETE /api/watchlist/{id}
 *   GET    /api/watchlist/{id}/reorder-stats
 *   GET    /api/watchlist/{id}/price-stats
 *   GET    /api/deal-finder
 *   POST   /api/deals/detect
 *   POST   /api/alerts/{id}/acknowledge
 *   POST   /api/watchlist/{id}/criteria
 *   DELETE /api/watchlist/{id}/criteria/{criterionId}
 *   DELETE /api/watchlist/{id}/aliases/{aliasId}
 *   POST   /api/watchlist/{id}/choices        { rank, label, site_name?, url? }
 *   DELETE /api/watchlist/{id}/choices/{rank}
 *   GET    /api/watchlist/{id}/match-suggestions
 *   POST   /api/watchlist/{id}/match-suggestions/accept
 *   POST   /api/watchlist/{id}/match-suggestions/reject
 *   GET    /api/coverage/summary
 *   GET    /api/coverage/items?status=&search=&site_id=&limit=&offset=
 *   POST   /api/coverage/ignore
 *   DELETE /api/coverage/ignore
 *   POST   /api/coverage/rename          { site_name, raw_product_name, new_name }
 *   POST   /api/coverage/pack-quantity   { site_name, raw_product_name, pack_quantity }
 *   POST   /api/coverage/transaction     { site_name, raw_product_name, quantity, unit_price } — single-purchase items only
 *   GET    /api/sites
 *   GET    /api/product-preview?url=
 *   GET    /api/alerts
 *   GET    /api/transactions/summary
 */

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Alerts\AlertRepository;
use RestockRadar\Analysis\DealDetector;
use RestockRadar\Analysis\ReorderAnalyzer;
use RestockRadar\Matching\CoverageService;
use RestockRadar\Matching\ProductMatcher;
use RestockRadar\Preview\ProductPreviewFetcher;
use RestockRadar\Storage\Database;
use RestockRadar\Watchlist\WatchlistRepository;

header('Content-Type: application/json');

// The frontend origin is the default; the browser extension's chrome-extension:// origin is
// also allowed since it's a trusted first-party client, same as the frontend — both are just
// this one person's own tools talking to their own home-network backend.
$requestOrigin = $_SERVER['HTTP_ORIGIN'] ?? '';
$configuredOrigin = getenv('RESTOCKRADAR_ALLOWED_ORIGIN') ?: '*';
if ($configuredOrigin === '*' || $requestOrigin === $configuredOrigin || str_starts_with($requestOrigin, 'chrome-extension://')) {
    header('Access-Control-Allow-Origin: ' . ($requestOrigin !== '' ? $requestOrigin : $configuredOrigin));
} else {
    header("Access-Control-Allow-Origin: {$configuredOrigin}");
}
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

if (preg_match('#^/watchlist/(\d+)/price-stats$#', $path, $m) && $method === 'GET') {
    $watchlistId = (int) $m[1];
    $product = $watchlistRepo->find($watchlistId);

    if ($product === null) {
        respond(['error' => 'Not found'], 404);
    }

    $aliases = $watchlistRepo->aliasesFor($watchlistId);
    $productNames = array_column($aliases, 'raw_product_name');

    $detector = new DealDetector($pdo);
    $stats = $detector->historicalStats($productNames);

    $choiceEvaluations = [];
    foreach ($product['choices'] as $choice) {
        if ($choice['price'] === null || $choice['quantity'] === null || (float) $choice['quantity'] === 0.0) {
            continue;
        }
        $unitPrice = $choice['price'] / $choice['quantity'];
        $choiceEvaluations[] = [
            'rank' => $choice['rank'],
            'label' => $choice['label'],
            'unit_price' => round($unitPrice, 4),
        ] + $detector->evaluate($unitPrice, $stats);
    }

    respond(['stats' => $stats, 'choice_evaluations' => $choiceEvaluations]);
}

/**
 * Answers "where should I buy this, right now" across the whole watchlist in one pass — every
 * captured store price for every active product, cheapest first, judged against that product's
 * own purchase history. A report you re-run any time, not a notification log: unlike /deals/detect
 * (which only surfaces what's NEW since last check and dedupes on exact price), this always shows
 * the full current picture, including deals you already knew about.
 */
if ($path === '/deal-finder' && $method === 'GET') {
    $detector = new DealDetector($pdo);
    $report = [];

    foreach ($watchlistRepo->all() as $product) {
        if ((int) $product['active'] !== 1) {
            continue;
        }

        $aliases = $watchlistRepo->aliasesFor((int) $product['id']);
        $productNames = array_column($aliases, 'raw_product_name');
        $stats = $detector->historicalStats($productNames);

        $choices = [];
        foreach ($product['choices'] as $choice) {
            if ($choice['price'] === null || $choice['quantity'] === null || (float) $choice['quantity'] === 0.0) {
                continue;
            }
            $unitPrice = $choice['price'] / $choice['quantity'];
            $choices[] = [
                'rank' => $choice['rank'],
                'label' => $choice['label'],
                'site_name' => $choice['site_name'],
                'price' => $choice['price'],
                'price_currency' => $choice['price_currency'],
                'price_captured_at' => $choice['price_captured_at'],
                'unit_price' => round($unitPrice, 4),
            ] + $detector->evaluate($unitPrice, $stats);
        }

        usort($choices, fn ($a, $b) => $a['unit_price'] <=> $b['unit_price']);

        $report[] = [
            'id' => $product['id'],
            'display_name' => $product['display_name'],
            'unit_label' => $product['unit_label'],
            'target_unit_price' => $product['target_unit_price'],
            'stats' => $stats,
            'choices' => $choices,
        ];
    }

    respond($report);
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

if (preg_match('#^/watchlist/(\d+)/aliases/(\d+)$#', $path, $m) && $method === 'DELETE') {
    [$watchlistId, $aliasId] = [(int) $m[1], (int) $m[2]];
    $watchlistRepo->removeAlias($watchlistId, $aliasId);
    respond($watchlistRepo->find($watchlistId));
}

if (preg_match('#^/watchlist/(\d+)/choices$#', $path, $m) && $method === 'POST') {
    $watchlistId = (int) $m[1];
    $body = jsonBody();

    if (!isset($body['rank']) || !is_int($body['rank']) && !ctype_digit((string) $body['rank'])) {
        respond(['error' => 'rank is required and must be an integer 1-5'], 422);
    }
    $rank = (int) $body['rank'];
    if ($rank < 1 || $rank > 5) {
        respond(['error' => 'rank must be between 1 and 5'], 422);
    }

    if (!isset($body['label']) || trim((string) $body['label']) === '') {
        respond(['error' => 'label is required'], 422);
    }

    $fields = [];
    if (array_key_exists('site_name', $body)) {
        $fields['site_label'] = !empty($body['site_name']) ? (string) $body['site_name'] : null;
    }
    foreach (['url', 'image_url'] as $key) {
        if (array_key_exists($key, $body)) {
            $fields[$key] = $body[$key] !== '' ? $body[$key] : null;
        }
    }
    if (array_key_exists('price', $body)) {
        $fields['price'] = $body['price'] !== null && $body['price'] !== '' ? (float) $body['price'] : null;
    }
    if (array_key_exists('price_currency', $body)) {
        $fields['price_currency'] = $body['price_currency'] !== '' ? (string) $body['price_currency'] : null;
    }
    if (array_key_exists('quantity', $body)) {
        $fields['quantity'] = $body['quantity'] !== null && $body['quantity'] !== '' ? (float) $body['quantity'] : null;
    }

    $watchlistRepo->setChoice($watchlistId, $rank, $body['label'], $fields);
    respond($watchlistRepo->find($watchlistId), 201);
}

if (preg_match('#^/watchlist/(\d+)/choices/(\d+)$#', $path, $m) && $method === 'DELETE') {
    [$watchlistId, $rank] = [(int) $m[1], (int) $m[2]];
    $watchlistRepo->removeChoice($watchlistId, $rank);
    respond($watchlistRepo->find($watchlistId));
}

if (preg_match('#^/watchlist/(\d+)/match-suggestions$#', $path, $m) && $method === 'GET') {
    $watchlistId = (int) $m[1];
    $product = $watchlistRepo->find($watchlistId);

    if ($product === null) {
        respond(['error' => 'Not found'], 404);
    }

    $matcher = new ProductMatcher($pdo);
    respond($matcher->suggestMatches($product));
}

if (preg_match('#^/watchlist/(\d+)/match-suggestions/accept$#', $path, $m) && $method === 'POST') {
    $watchlistId = (int) $m[1];
    $body = jsonBody();

    foreach (['site_name', 'raw_product_name'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $siteId = $watchlistRepo->siteIdByName($body['site_name']);
    if ($siteId === null) {
        respond(['error' => "Unknown site: {$body['site_name']}"], 422);
    }

    $watchlistRepo->addAlias($watchlistId, $siteId, $body['raw_product_name'], null);
    respond($watchlistRepo->find($watchlistId), 201);
}

if (preg_match('#^/watchlist/(\d+)/match-suggestions/reject$#', $path, $m) && $method === 'POST') {
    $watchlistId = (int) $m[1];
    $body = jsonBody();

    foreach (['site_name', 'raw_product_name'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $siteId = $watchlistRepo->siteIdByName($body['site_name']);
    if ($siteId === null) {
        respond(['error' => "Unknown site: {$body['site_name']}"], 422);
    }

    $watchlistRepo->rejectMatch($watchlistId, $siteId, $body['raw_product_name']);
    respond(['rejected' => true]);
}

if ($path === '/coverage/summary' && $method === 'GET') {
    $coverage = new CoverageService($pdo);
    respond($coverage->summary());
}

if ($path === '/coverage/items' && $method === 'GET') {
    $limit = isset($_GET['limit']) ? max(1, min(100, (int) $_GET['limit'])) : 25;
    $offset = isset($_GET['offset']) ? max(0, (int) $_GET['offset']) : 0;
    $search = isset($_GET['search']) && trim((string) $_GET['search']) !== '' ? trim((string) $_GET['search']) : null;
    $status = isset($_GET['status']) && in_array($_GET['status'], ['linked', 'unmatched', 'ignored'], true) ? $_GET['status'] : null;
    $siteId = isset($_GET['site_id']) && $_GET['site_id'] !== '' ? (int) $_GET['site_id'] : null;

    $coverage = new CoverageService($pdo);
    respond($coverage->items($limit, $offset, $status, $search, $siteId));
}

if ($path === '/sites' && $method === 'GET') {
    respond($pdo->query('SELECT id, name FROM sites ORDER BY name')->fetchAll());
}

if ($path === '/coverage/ignore' && $method === 'POST') {
    $body = jsonBody();

    foreach (['site_name', 'raw_product_name'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $siteId = $watchlistRepo->siteIdByName($body['site_name']);
    if ($siteId === null) {
        respond(['error' => "Unknown site: {$body['site_name']}"], 422);
    }

    (new CoverageService($pdo))->ignore($siteId, $body['raw_product_name']);
    respond(['ignored' => true], 201);
}

if ($path === '/coverage/ignore' && $method === 'DELETE') {
    $body = jsonBody();

    foreach (['site_name', 'raw_product_name'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $siteId = $watchlistRepo->siteIdByName($body['site_name']);
    if ($siteId === null) {
        respond(['error' => "Unknown site: {$body['site_name']}"], 422);
    }

    (new CoverageService($pdo))->unignore($siteId, $body['raw_product_name']);
    respond(['ignored' => false]);
}

if ($path === '/coverage/rename' && $method === 'POST') {
    $body = jsonBody();

    foreach (['site_name', 'raw_product_name', 'new_name'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $siteId = $watchlistRepo->siteIdByName($body['site_name']);
    if ($siteId === null) {
        respond(['error' => "Unknown site: {$body['site_name']}"], 422);
    }

    try {
        (new CoverageService($pdo))->rename($siteId, $body['raw_product_name'], trim($body['new_name']));
        respond(['renamed' => true, 'new_name' => trim($body['new_name'])]);
    } catch (\RuntimeException $e) {
        respond(['error' => $e->getMessage()], 409);
    }
}

if ($path === '/coverage/pack-quantity' && $method === 'POST') {
    $body = jsonBody();

    foreach (['site_name', 'raw_product_name'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $siteId = $watchlistRepo->siteIdByName($body['site_name']);
    if ($siteId === null) {
        respond(['error' => "Unknown site: {$body['site_name']}"], 422);
    }

    $packQuantity = array_key_exists('pack_quantity', $body) && $body['pack_quantity'] !== null && $body['pack_quantity'] !== ''
        ? (float) $body['pack_quantity']
        : null;

    try {
        (new CoverageService($pdo))->setPackQuantity($siteId, $body['raw_product_name'], $packQuantity);
        respond(['pack_quantity' => $packQuantity]);
    } catch (\RuntimeException $e) {
        respond(['error' => $e->getMessage()], 422);
    }
}

if ($path === '/coverage/transaction' && $method === 'POST') {
    $body = jsonBody();

    foreach (['site_name', 'raw_product_name', 'quantity', 'unit_price'] as $required) {
        if (!isset($body[$required]) || $body[$required] === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $siteId = $watchlistRepo->siteIdByName($body['site_name']);
    if ($siteId === null) {
        respond(['error' => "Unknown site: {$body['site_name']}"], 422);
    }

    try {
        (new CoverageService($pdo))->correctSingleTransaction(
            $siteId,
            $body['raw_product_name'],
            (float) $body['quantity'],
            (float) $body['unit_price'],
        );
        respond(['corrected' => true]);
    } catch (\RuntimeException $e) {
        respond(['error' => $e->getMessage()], 409);
    }
}

if ($path === '/product-preview' && $method === 'GET') {
    $url = isset($_GET['url']) ? trim((string) $_GET['url']) : '';
    if ($url === '') {
        respond(['error' => 'url is required'], 422);
    }

    try {
        respond((new ProductPreviewFetcher())->fetch($url));
    } catch (\RuntimeException $e) {
        respond(['error' => $e->getMessage()], 502);
    }
}

if ($path === '/alerts' && $method === 'GET') {
    $repo = new AlertRepository($pdo);
    respond($repo->unacknowledged());
}

if (preg_match('#^/alerts/(\d+)/acknowledge$#', $path, $m) && $method === 'POST') {
    (new AlertRepository($pdo))->acknowledge((int) $m[1]);
    respond(['acknowledged' => true]);
}

if ($path === '/deals/detect' && $method === 'POST') {
    $detector = new DealDetector($pdo);
    $alertRepo = new AlertRepository($pdo);

    $checked = 0;
    $created = [];

    foreach ($watchlistRepo->all() as $product) {
        if (!$product['active'] || $product['choices'] === []) {
            continue;
        }

        $aliases = $watchlistRepo->aliasesFor((int) $product['id']);
        $productNames = array_column($aliases, 'raw_product_name');
        $stats = $detector->historicalStats($productNames);
        $checked++;

        foreach ($product['choices'] as $choice) {
            if ($choice['price'] === null || $choice['quantity'] === null || (float) $choice['quantity'] === 0.0) {
                continue;
            }

            $unitPrice = $choice['price'] / $choice['quantity'];
            $result = $detector->evaluate($unitPrice, $stats);

            if ($result['message'] === null) {
                continue;
            }

            if ($alertRepo->existsWithMessage((int) $product['id'], $result['message'])) {
                continue;
            }

            $alertId = $alertRepo->create((int) $product['id'], $result['verdict'], $result['message']);
            $created[] = ['alert_id' => $alertId, 'watchlist_product_id' => $product['id'], 'display_name' => $product['display_name'], 'message' => $result['message']];
        }
    }

    respond(['products_checked' => $checked, 'alerts_created' => $created]);
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
