<?php

namespace RestockRadar\Analysis;

/**
 * Guesses "how many of the product's own unit are in this package" from a product-name/title
 * string — a count for K-cups ("24 Count"), ounces for oat milk ("52 oz"), etc. Schema.org has
 * no standard pack-size field, so this is a best-effort regex, not something to trust blindly:
 * it can grab the wrong number when a title mentions size in more than one place (e.g. a cat food
 * variety pack titled "...Variety Pack, Extra Gravy Chunky - (24) 5.5 oz. Cans" guesses 5.5, the
 * per-can ounces, not 24, the case count — both numbers are "correct" depending on which unit the
 * product is tracked by).
 *
 * Also applies a "(Pack of N)" multiplier when present — "24 Count (Pack of 4)" is 96 total, not
 * 24, since the purchased line-item is the 4-box bundle and unit_price is priced for that whole
 * bundle. Confirmed against real transaction history: without this, K-cup prices came out ~4x
 * too high per count. Similarly, a leading "(N pack)" prefix ("(2 pack) ... 16 fl oz") is a
 * multiplier on whatever size follows, not the answer itself — handled narrowly (only when
 * anchored at the very start of the string) since "N Pack" elsewhere in a title usually IS the
 * direct answer (e.g. "12 Pack Cans"), and a broader rule risked breaking those.
 *
 * Single source of truth shared by ProductPreviewFetcher (one URL at a time, backend), the
 * browser extension's popup.js (same regex, reimplemented in JS since it runs in the page's own
 * context), and scripts/compute_unit_prices.php (all of transaction history, in bulk).
 */
final class PackQuantity
{
    private const PATTERN = '/(\d+(?:\.\d+)?)\s*[-]?\s*'
        . '(?:count|ct|pack|pk|capsules?|pods?|rolls?|sheets?|bags?|cans?|bottles?|fl\.?\s*oz|oz|lbs?|kg|g|ml|l)\b/i';

    private const SUFFIX_MULTIPLIER_PATTERN = '/pack of (\d+)/i';

    private const LEADING_MULTIPLIER_PATTERN = '/^\(\s*(\d+)\s*-?\s*pack\s*\)\s*/i';

    public static function guess(string $text): ?float
    {
        $leadingMultiplier = 1.0;

        if (preg_match(self::LEADING_MULTIPLIER_PATTERN, $text, $leading) === 1) {
            $leadingMultiplier = (float) $leading[1];
            $text = substr($text, strlen($leading[0]));
        }

        if (preg_match(self::PATTERN, $text, $m) !== 1) {
            return null;
        }

        $quantity = (float) $m[1] * $leadingMultiplier;

        if (preg_match(self::SUFFIX_MULTIPLIER_PATTERN, $text, $multiplier) === 1) {
            $quantity *= (float) $multiplier[1];
        }

        return $quantity;
    }
}
