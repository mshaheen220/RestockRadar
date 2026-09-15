<?php

namespace RestockRadar\Fetchers;

/**
 * Stage 2 contract. First implementation: WalmartFetcher. Each fetcher takes a product page URL
 * (from watchlist_product_choices.url) plus a session cookie captured from the user's own
 * logged-in browser (see SiteSessionRepository) — every tracked site's product pages are
 * confirmed bot-walled for a plain anonymous request, so cookie-persisted auth is the default
 * approach for every fetcher here, not just Walmart's.
 */
interface SiteFetcher
{
    /** Site name as stored in the `sites` table, e.g. 'Walmart'. */
    public function siteName(): string;

    /**
     * @return array{title: ?string, image: ?string, price: ?float, currency: ?string, quantity: ?float, quantity_unit: ?string}
     * @throws \RuntimeException if the page couldn't be reached, came back as a bot challenge, or had no price on it
     */
    public function fetchPrice(string $url, string $cookieHeader): array;
}
