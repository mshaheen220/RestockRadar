<?php

/**
 * Minimal front controller — no framework, since the API surface is small.
 *
 * Auth: every route below except POST /auth/login requires either a session cookie (web app) or
 * an `Authorization: Bearer <token>` header (browser extension). GET works for any role; every
 * other method needs 'admin' or 'contributor' — 'viewer' is read-only everywhere. Routes under
 * /users require 'admin' specifically. See RestockRadar\Auth\AuthService.
 *   POST   /api/auth/login            { username, password }
 *   POST   /api/auth/logout
 *   GET    /api/auth/me
 *   POST   /api/auth/change-password  { current_password, new_password }
 *   GET    /api/auth/tokens
 *   POST   /api/auth/tokens           { label? }             — returns the raw token ONCE
 *   DELETE /api/auth/tokens/{id}
 *   GET    /api/users                                        — admin only
 *   POST   /api/users                 { username, password, role }
 *   PATCH  /api/users/{id}            { role?, active?, password? }
 *   DELETE /api/users/{id}
 *
 * Routes:
 *   GET    /api/watchlist
 *   POST   /api/watchlist
 *   PATCH  /api/watchlist/{id}
 *   DELETE /api/watchlist/{id}
 *   GET    /api/watchlist/{id}/price-stats
 *   GET    /api/deal-finder
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
 *   GET    /api/transactions/summary
 *   POST   /api/purchases/import  { csv }  — bulk, same format as transaction_log.csv
 *   POST   /api/purchases         { site_name, product_name, quantity, unit_price, txn_date?, category? }
 *   GET    /api/coverage/suggest?product_name=  — reverse match lookup, used by the Purchases tab
 */

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use RestockRadar\Analysis\DealDetector;
use RestockRadar\Analysis\PackQuantity;
use RestockRadar\Auth\AuthService;
use RestockRadar\Import\TransactionImporter;
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
header('Access-Control-Allow-Headers: Content-Type, Authorization');
// Safe unconditionally: the block above never actually echoes a literal "*" back when a real
// Origin header was sent, only that exact origin — which is what Allow-Credentials requires.
header('Access-Control-Allow-Credentials: true');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Session cookie: same-origin in both dev (Vite's proxy) and prod (Caddy's reverse proxy), so
// plain Lax + HttpOnly is enough — no SameSite=None, which would need Secure/HTTPS, which isn't
// guaranteed this app ever runs behind. Still marks Secure when the request DID arrive over
// HTTPS (direct or via a proxy's X-Forwarded-Proto) so the cookie isn't needlessly sent in the
// clear on a deployment that does have TLS.
$isHttps = ($_SERVER['HTTPS'] ?? '') !== '' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $isHttps, 'httponly' => true, 'samesite' => 'Lax']);
session_start();

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

$auth = new AuthService($pdo);

/** @return array{id: int, username: string, role: string}|null */
function currentUser(AuthService $auth): ?array
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (str_starts_with($header, 'Bearer ')) {
        return $auth->userFromToken(substr($header, 7));
    }

    if (!empty($_SESSION['user_id'])) {
        return $auth->findActiveUser((int) $_SESSION['user_id']);
    }

    return null;
}

$user = currentUser($auth);

if ($path === '/auth/login' && $method === 'POST') {
    $body = jsonBody();
    foreach (['username', 'password'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $loggedIn = $auth->login((string) $body['username'], (string) $body['password']);
    if ($loggedIn === null) {
        respond(['error' => 'Invalid username or password'], 401);
    }

    session_regenerate_id(true);
    $_SESSION['user_id'] = $loggedIn['id'];
    respond($loggedIn);
}

if ($user === null) {
    respond(['error' => 'Authentication required'], 401);
}

// Self-service auth routes: any authenticated role, including viewer — changing your own
// password or managing your own token is never a "write to app data" action.
if ($path === '/auth/logout' && $method === 'POST') {
    $_SESSION = [];
    session_destroy();
    respond(['loggedOut' => true]);
}

if ($path === '/auth/me' && $method === 'GET') {
    respond($user);
}

if ($path === '/auth/change-password' && $method === 'POST') {
    $body = jsonBody();
    foreach (['current_password', 'new_password'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $ok = $auth->changeOwnPassword($user['id'], (string) $body['current_password'], (string) $body['new_password']);
    if (!$ok) {
        respond(['error' => 'Current password is incorrect'], 422);
    }
    respond(['changed' => true]);
}

if ($path === '/auth/tokens' && $method === 'GET') {
    respond($auth->listTokens($user['id']));
}

if ($path === '/auth/tokens' && $method === 'POST') {
    $body = jsonBody();
    $raw = $auth->createToken($user['id'], !empty($body['label']) ? (string) $body['label'] : null);
    respond(['token' => $raw], 201);
}

if (preg_match('#^/auth/tokens/(\d+)$#', $path, $m) && $method === 'DELETE') {
    $auth->revokeToken((int) $m[1], $user['id']);
    respond(['revoked' => true]);
}

// Admin-only: everything under /users. Checked before the generic write-gate below so a
// contributor (who'd otherwise pass a plain "is this a write" check) still can't manage accounts.
if (preg_match('#^/users#', $path)) {
    if ($user['role'] !== 'admin') {
        respond(['error' => 'Forbidden — admin only'], 403);
    }

    if ($path === '/users' && $method === 'GET') {
        respond($auth->listUsers());
    }

    if ($path === '/users' && $method === 'POST') {
        $body = jsonBody();
        foreach (['username', 'password', 'role'] as $required) {
            if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
                respond(['error' => "{$required} is required"], 422);
            }
        }
        if (!in_array($body['role'], ['admin', 'contributor', 'viewer'], true)) {
            respond(['error' => 'role must be one of: admin, contributor, viewer'], 422);
        }

        try {
            $id = $auth->createUser((string) $body['username'], (string) $body['password'], (string) $body['role']);
        } catch (\PDOException $e) {
            respond(['error' => "Username \"{$body['username']}\" is already taken."], 409);
        }
        respond(['id' => $id], 201);
    }

    if (preg_match('#^/users/(\d+)$#', $path, $m) && $method === 'PATCH') {
        $targetId = (int) $m[1];
        $body = jsonBody();

        // Refuse to demote/deactivate the last active admin — otherwise nobody could manage
        // users again without going back to the database directly.
        $wouldRemoveLastAdmin = $targetId === $user['id']
            && $auth->activeAdminCount() <= 1
            && ((isset($body['role']) && $body['role'] !== 'admin') || (isset($body['active']) && !$body['active']));
        if ($wouldRemoveLastAdmin) {
            respond(['error' => "Can't remove the last active admin."], 422);
        }

        if (isset($body['role']) && !in_array($body['role'], ['admin', 'contributor', 'viewer'], true)) {
            respond(['error' => 'role must be one of: admin, contributor, viewer'], 422);
        }

        $fields = array_intersect_key($body, ['role' => true, 'active' => true]);
        if (isset($fields['active'])) {
            $fields['active'] = $fields['active'] ? 1 : 0;
        }
        $auth->updateUser($targetId, $fields);

        if (!empty($body['password'])) {
            $auth->setPassword($targetId, (string) $body['password']);
        }

        respond(['updated' => true]);
    }

    if (preg_match('#^/users/(\d+)$#', $path, $m) && $method === 'DELETE') {
        $targetId = (int) $m[1];
        if ($targetId === $user['id']) {
            respond(['error' => "Can't delete your own account while signed in as it."], 422);
        }
        $auth->deleteUser($targetId);
        respond(['deleted' => $targetId]);
    }

    respond(['error' => 'Not found', 'path' => $path], 404);
}

// Everything below this line is existing app data: any authenticated role can read it (GET),
// but only admin/contributor can write to it — a viewer's role is enforced here once, rather
// than re-checked in every individual route below.
if ($method !== 'GET' && !in_array($user['role'], ['admin', 'contributor'], true)) {
    respond(['error' => 'Forbidden — your account has read-only access'], 403);
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

    $id = $watchlistRepo->create($body['display_name'], $body['unit_label'] ?? null);
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

if (preg_match('#^/watchlist/(\d+)/price-stats$#', $path, $m) && $method === 'GET') {
    $watchlistId = (int) $m[1];
    $product = $watchlistRepo->find($watchlistId);

    if ($product === null) {
        respond(['error' => 'Not found'], 404);
    }

    $aliases = $watchlistRepo->aliasesFor($watchlistId);
    $productNames = array_column($aliases, 'raw_product_name');

    // See the /deal-finder route below for why a reference unit matters: a captured choice's
    // quantity has to be converted into the SAME unit the history is being measured in before
    // "10% below your recent average" means anything.
    $referenceUnit = $product['unit_label'] !== null ? PackQuantity::normalizeUnit($product['unit_label']) : null;
    if ($referenceUnit === null) {
        foreach ($product['choices'] as $choice) {
            if ($choice['quantity_unit'] !== null) {
                $referenceUnit = $choice['quantity_unit'];
                break;
            }
        }
    }

    $detector = new DealDetector($pdo);
    $stats = $detector->historicalStats($productNames, $referenceUnit);

    $choiceEvaluations = [];
    foreach ($product['choices'] as $choice) {
        if ($choice['price'] === null || $choice['quantity'] === null || (float) $choice['quantity'] === 0.0) {
            continue;
        }

        $unit = $choice['quantity_unit'];
        $quantity = (float) $choice['quantity'];
        $comparable = true;
        if ($unit !== null && $referenceUnit !== null && $unit !== $referenceUnit) {
            $converted = PackQuantity::convert($quantity, $unit, $referenceUnit);
            if ($converted === null) {
                $comparable = false;
            } else {
                $quantity = $converted;
            }
        }

        $unitPrice = $choice['price'] / $quantity;
        $evaluation = $comparable ? $detector->evaluate($unitPrice, $stats) : ['verdict' => 'insufficient_history', 'message' => null];
        $choiceEvaluations[] = [
            'rank' => $choice['rank'],
            'label' => $choice['label'],
            'quantity_unit' => $unit,
            'comparable' => $comparable,
            'unit_price' => round($unitPrice, 4),
        ] + $evaluation;
    }

    respond(['stats' => $stats, 'choice_evaluations' => $choiceEvaluations]);
}

/**
 * Answers "where should I buy this, right now" across the whole watchlist in one pass — every
 * captured store price for every active product, cheapest first, judged against that product's
 * own purchase history. Always re-run fresh: no dedup, no notification log (that approach —
 * /deals/detect + an alerts table — was removed once this existed, since it only ever surfaced
 * what was NEW since the last check, where this always shows the full current picture).
 *
 * Ranking choices against each other only means something when their quantities are in the same
 * (or a convertible) unit — a case of 12 fl oz cans and a 2-liter bottle both just have "a
 * quantity" unless something records which unit each was captured in (see quantity_unit in
 * schema.sql). This converts every choice into one reference unit — the product's own unit_label
 * if set, else whatever the first captured choice used — before comparing; a choice whose unit
 * can't convert into that reference (e.g. a count-based size next to a volume one) still gets
 * shown with its own honest unit price, just marked `comparable: false` and sorted after the ones
 * that actually could be ranked together, instead of silently mixed in as if it were.
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
        $rawChoices = array_values(array_filter(
            $product['choices'],
            fn ($c) => $c['price'] !== null && $c['quantity'] !== null && (float) $c['quantity'] !== 0.0
        ));

        $referenceUnit = $product['unit_label'] !== null ? PackQuantity::normalizeUnit($product['unit_label']) : null;
        if ($referenceUnit === null) {
            foreach ($rawChoices as $choice) {
                if ($choice['quantity_unit'] !== null) {
                    $referenceUnit = $choice['quantity_unit'];
                    break;
                }
            }
        }

        $stats = $detector->historicalStats($productNames, $referenceUnit);

        $choices = [];
        foreach ($rawChoices as $choice) {
            $unit = $choice['quantity_unit'];
            $quantity = (float) $choice['quantity'];
            $comparable = true;

            if ($unit !== null && $referenceUnit !== null && $unit !== $referenceUnit) {
                $converted = PackQuantity::convert($quantity, $unit, $referenceUnit);
                if ($converted === null) {
                    $comparable = false;
                } else {
                    $quantity = $converted;
                }
            }

            $unitPrice = $choice['price'] / $quantity;
            // A non-comparable choice's unit_price is in ITS OWN unit, not $referenceUnit — evaluating
            // it against $stats (which IS in $referenceUnit) would be exactly the unit-mismatch bug
            // this whole thing exists to avoid, so it gets no verdict at all rather than a bogus one.
            $evaluation = $comparable ? $detector->evaluate($unitPrice, $stats) : ['verdict' => 'insufficient_history', 'message' => null];
            $choices[] = [
                'rank' => $choice['rank'],
                'label' => $choice['label'],
                'site_name' => $choice['site_name'],
                'price' => $choice['price'],
                'price_currency' => $choice['price_currency'],
                'price_captured_at' => $choice['price_captured_at'],
                'quantity_unit' => $unit,
                'comparable' => $comparable,
                'unit_price' => round($unitPrice, 4),
            ] + $evaluation;
        }

        usort($choices, fn ($a, $b) => ($b['comparable'] <=> $a['comparable']) ?: ($a['unit_price'] <=> $b['unit_price']));

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
    if (array_key_exists('quantity_unit', $body)) {
        $fields['quantity_unit'] = !empty($body['quantity_unit']) ? PackQuantity::normalizeUnit((string) $body['quantity_unit']) : null;
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

/**
 * The reverse direction of /watchlist/{id}/match-suggestions — one fresh raw name (typically
 * just added via the Purchases tab), which watchlist products might it belong to. Reuses
 * /watchlist/{id}/match-suggestions/accept (and CoverageService::ignore()) for the actual
 * link/ignore action; this route only scores and ranks.
 */
if ($path === '/coverage/suggest' && $method === 'GET') {
    $productName = isset($_GET['product_name']) ? trim((string) $_GET['product_name']) : '';
    if ($productName === '') {
        respond(['error' => 'product_name is required'], 422);
    }

    $matcher = new ProductMatcher($pdo);
    respond($matcher->suggestProductsFor($productName, $watchlistRepo->all()));
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

if ($path === '/transactions/summary' && $method === 'GET') {
    $stmt = $pdo->query(
        "SELECT COUNT(*) AS row_count, MIN(txn_date) AS earliest, MAX(txn_date) AS latest,
                (SELECT COUNT(DISTINCT site_id) FROM transactions) AS distinct_sites
         FROM transactions"
    );
    respond($stmt->fetch());
}

/**
 * Bulk path: paste/upload the same unified CSV format that seeded transaction_log.csv. Shares
 * TransactionImporter with scripts/import_transactions.php, so the CLI and this endpoint can
 * never drift into parsing things differently.
 */
if ($path === '/purchases/import' && $method === 'POST') {
    $body = jsonBody();

    if (!isset($body['csv']) || trim((string) $body['csv']) === '') {
        respond(['error' => 'csv is required'], 422);
    }

    $importer = new TransactionImporter($pdo);

    try {
        $result = $importer->importCsvFromString($body['csv']);
        respond($result);
    } catch (\RuntimeException $e) {
        respond(['error' => $e->getMessage()], 422);
    }
}

/** Single path: one purchase, no receipt to import — see TransactionImporter::addSingle(). */
if ($path === '/purchases' && $method === 'POST') {
    $body = jsonBody();

    foreach (['site_name', 'product_name', 'quantity', 'unit_price'] as $required) {
        if (!isset($body[$required]) || trim((string) $body[$required]) === '') {
            respond(['error' => "{$required} is required"], 422);
        }
    }

    $importer = new TransactionImporter($pdo);
    $id = $importer->addSingle([
        'site_name' => (string) $body['site_name'],
        'product_name' => (string) $body['product_name'],
        'quantity' => (float) $body['quantity'],
        'unit_price' => (float) $body['unit_price'],
        'txn_date' => !empty($body['txn_date']) ? (string) $body['txn_date'] : null,
        'category' => !empty($body['category']) ? (string) $body['category'] : null,
        'pack_quantity' => !empty($body['pack_quantity']) ? (float) $body['pack_quantity'] : null,
        'pack_quantity_unit' => !empty($body['pack_quantity_unit']) ? PackQuantity::normalizeUnit((string) $body['pack_quantity_unit']) : null,
    ]);

    respond(['id' => $id], 201);
}

respond(['error' => 'Not found', 'path' => $path], 404);
