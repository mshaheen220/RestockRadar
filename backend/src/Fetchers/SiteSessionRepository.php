<?php

namespace RestockRadar\Fetchers;

use PDO;

/**
 * Stores the cookie-persisted session a site fetcher needs to look like a real logged-in user
 * (see WalmartFetcher) rather than an anonymous request. Captured from the user's own browser via
 * the extension's "Capture session" action — this app never handles the underlying site login
 * itself. One row per site; capturing again overwrites the previous session, since only the most
 * recent one is ever useful.
 */
final class SiteSessionRepository
{
    public function __construct(private PDO $pdo)
    {
    }

    /** @return array{site_name: string, cookie_header: string, captured_at: string}|null */
    public function get(string $siteName): ?array
    {
        $stmt = $this->pdo->prepare(
            'SELECT site_name, cookie_header, captured_at FROM site_sessions WHERE site_name = :site_name'
        );
        $stmt->execute(['site_name' => $siteName]);

        $row = $stmt->fetch();

        return $row ?: null;
    }

    public function set(string $siteName, string $cookieHeader): void
    {
        $stmt = $this->pdo->prepare(
            'INSERT INTO site_sessions (site_name, cookie_header, captured_at)
             VALUES (:site_name, :cookie_header, :captured_at)
             ON CONFLICT(site_name) DO UPDATE SET cookie_header = :cookie_header, captured_at = :captured_at'
        );
        $stmt->execute([
            'site_name' => $siteName,
            'cookie_header' => $cookieHeader,
            'captured_at' => date('Y-m-d H:i:s'),
        ]);
    }
}
