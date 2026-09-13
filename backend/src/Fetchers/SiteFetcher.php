<?php

namespace RestockRadar\Fetchers;

/**
 * Stage 2 contract: not implemented yet for any site (see PROJECT-BRIEF.md "Data sources — status").
 * Each future fetcher (Walmart, Amazon, Costco, ...) implements this against a reverse-engineered
 * API where possible, falling back to an authenticated cookie-persisted session otherwise.
 */
interface SiteFetcher
{
    /** Site name as stored in the `sites` table, e.g. 'Walmart'. */
    public function siteName(): string;

    /**
     * @param string $rawProductId Site-specific item id/ASIN/SKU
     * @return array{price: float, shipping_charge: float, in_stock: bool}
     */
    public function fetchPrice(string $rawProductId): array;
}
