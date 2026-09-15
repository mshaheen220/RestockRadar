<?php

namespace RestockRadar\Fetchers;

use RestockRadar\Preview\ProductPreviewFetcher;

/**
 * First stage-2 fetcher (see PROJECT-BRIEF.md and SiteFetcher). A plain, unauthenticated request
 * to a Walmart product page is confirmed bot-walled (see ProductPreviewFetcher) — this attaches a
 * session cookie captured from the user's own logged-in browser instead (via the extension's
 * "Capture Walmart session" action; see SiteSessionRepository), on the theory that a request
 * presenting a real logged-in session is less likely to get walled than an anonymous one.
 *
 * Not guaranteed: Walmart's bot protection can also fingerprint TLS/HTTP behavior that cookies
 * alone don't fix. If it's still blocked, isBlocked() surfaces that as a clear "recapture the
 * session" error rather than silently returning a stale/wrong price.
 *
 * Reuses ProductPreviewFetcher::parseHtml() for the actual price extraction (same JSON-LD/OG/
 * microdata parsing) — this class only owns the fetch, not the parsing.
 */
final class WalmartFetcher implements SiteFetcher
{
    private const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
        . '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    public function siteName(): string
    {
        return 'Walmart';
    }

    /**
     * @return array{title: ?string, image: ?string, price: ?float, currency: ?string, quantity: ?float, quantity_unit: ?string}
     * @throws \RuntimeException if the page couldn't be reached, came back as a bot challenge, or had no price on it
     */
    public function fetchPrice(string $url, string $cookieHeader): array
    {
        $html = $this->download($url, $cookieHeader);

        if ($this->isBlocked($html)) {
            throw new \RuntimeException(
                'Walmart blocked this request — the captured session may have expired. Recapture it with the browser extension.'
            );
        }

        $parsed = (new ProductPreviewFetcher())->parseHtml($html);

        if ($parsed['price'] === null) {
            throw new \RuntimeException('Fetched the page but could not find a price on it.');
        }

        return $parsed;
    }

    private function download(string $url, string $cookieHeader): string
    {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => "User-Agent: " . self::USER_AGENT . "\r\n"
                    . "Accept: text/html\r\n"
                    . "Cookie: {$cookieHeader}\r\n",
                'timeout' => 10,
                'follow_location' => 1,
                'max_redirects' => 5,
                'ignore_errors' => true,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
        ]);

        $html = @file_get_contents($url, false, $context);

        if ($html === false) {
            throw new \RuntimeException('Could not reach that Walmart URL.');
        }

        return $html;
    }

    /** Known markers of Walmart's bot-challenge page rather than a real product page. */
    private function isBlocked(string $html): bool
    {
        return stripos($html, 'Robot or human') !== false
            || stripos($html, 'px-captcha') !== false
            || stripos($html, 'Access Denied') !== false;
    }
}
