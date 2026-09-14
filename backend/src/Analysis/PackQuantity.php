<?php

namespace RestockRadar\Analysis;

/**
 * Guesses "how many of the product's own unit are in this package" from a product-name/title
 * string — a count for K-cups ("24 Count"), ounces for oat milk ("52 oz"), etc. — AND which unit
 * that number is in. Schema.org has no standard pack-size field, so this is a best-effort regex,
 * not something to trust blindly: it can grab the wrong number when a title mentions size in more
 * than one place (e.g. a cat food variety pack titled "...Variety Pack, Extra Gravy Chunky - (24)
 * 5.5 oz. Cans" guesses 5.5, the per-can ounces, not 24, the case count — both numbers are
 * "correct" depending on which unit the product is tracked by).
 *
 * The unit matters as much as the number: a case of 12oz cans and a 2-liter bottle both have a
 * "quantity", but they're meaningless to compare without knowing one is in fl oz and the other in
 * liters — and a bare number alone can't tell "52 oz" apart from "52 g" a year from now when
 * nobody remembers which product this was. See comparable()/convert() below.
 *
 * Also applies pack-count multipliers when the title separates a per-item size from a case count:
 *   - "(Pack of N)"/"case of N" suffix — "24 Count (Pack of 4)" is 96 total, not 24, and "5.5-oz,
 *     case of 24" is 132 oz total, not 5.5, since the purchased line-item is the whole bundle and
 *     unit_price is priced for that whole bundle, not one item inside it.
 *   - a bare "N Pack"/"N-Pack" suffix — "12 fl oz, 12 Pack Cans" is 144 fl oz total, not 12 (the
 *     size of a single can), since it's a 12-can case. Scoped to text AFTER the main size match so
 *     it can never re-multiply the same digits the main pattern already consumed (e.g. a title
 *     that's nothing but "8 Pack" with no separate per-item size stays 8, not 8x8).
 *   - a leading "(N pack)" prefix — "(2 pack) ... 16 fl oz" is a multiplier on whatever size
 *     follows, not the answer itself. Handled narrowly (anchored at the very start of the string)
 *     since "N Pack" elsewhere in a title is usually the per-item size answer itself, not a second
 *     multiplier on top of it.
 *
 * Single source of truth shared by ProductPreviewFetcher (one URL at a time, backend), the
 * browser extension's popup.js (same regex, reimplemented in JS since it runs in the page's own
 * context), and scripts/compute_unit_prices.php (all of transaction history, in bulk).
 */
final class PackQuantity
{
    private const UNIT_WORDS = 'count|ct|pack|pk|capsules?|pods?|rolls?|sheets?|bags?|cans?|bottles?'
        . '|fl\.?\s*oz|oz|lbs?|kg|gal(?:lons?)?|liters?|kilograms?|grams?|milliliters?|g|ml|l';

    private const PATTERN = '/(\d+(?:\.\d+)?)\s*[-]?\s*(' . self::UNIT_WORDS . ')\b/i';

    private const SUFFIX_MULTIPLIER_OF_PATTERN = '/(?:pack|case) of (\d+)/i';

    // A trailing "N <container word>" after a SIZE has already been matched is a case count —
    // "12 fl oz, 12 Pack" and "12 Fl Oz, 12 Count" are the same product worded two different ways
    // by two different sellers, both meaning a 12-can case. Deliberately not applied when the
    // main match's own unit is itself a count word (see the isset() guard at the call site) —
    // "Bounty Paper Towels, 8 Pack" has no separate size to multiply, so this must stay unused
    // there or "8 Pack" would wrongly multiply against its own digits.
    private const SUFFIX_MULTIPLIER_BARE_PATTERN = '/(\d+)\s*-?\s*(?:count|ct|pack|pk|cans?|bottles?|rolls?|sheets?|bags?|capsules?|pods?)\b/i';

    private const LEADING_MULTIPLIER_PATTERN = '/^\(\s*(\d+)\s*-?\s*pack\s*\)\s*/i';

    // Every surface word that can appear in the pattern above, collapsed to one canonical code per
    // physical thing it names. Plural/spelling variants of the same word map together (ct/count);
    // genuinely different containers do NOT (roll vs sheet vs can) — a roll of paper towels isn't
    // interchangeable with a sheet of it, so those never compare even though both are "a count".
    private const UNIT_MAP = [
        'fl oz' => 'floz', 'fl. oz' => 'floz', 'fl.oz' => 'floz',
        'oz' => 'oz',
        'lb' => 'lb', 'lbs' => 'lb',
        'kg' => 'kg', 'kilogram' => 'kg', 'kilograms' => 'kg',
        'g' => 'g', 'gram' => 'g', 'grams' => 'g',
        'ml' => 'ml', 'milliliter' => 'ml', 'milliliters' => 'ml',
        'l' => 'l', 'liter' => 'l', 'liters' => 'l',
        'gal' => 'gal', 'gallon' => 'gal', 'gallons' => 'gal',
        'count' => 'ct', 'ct' => 'ct', 'pack' => 'ct', 'pk' => 'ct',
        'capsule' => 'capsule', 'capsules' => 'capsule',
        'pod' => 'pod', 'pods' => 'pod',
        'roll' => 'roll', 'rolls' => 'roll',
        'sheet' => 'sheet', 'sheets' => 'sheet',
        'bag' => 'bag', 'bags' => 'bag',
        'can' => 'can', 'cans' => 'can',
        'bottle' => 'bottle', 'bottles' => 'bottle',
    ];

    // Fixed conversion factors into one canonical base per dimension — this is just arithmetic
    // (1 l = 33.814 fl oz), not a guess, so it's always safe to apply. Bare "oz" defaults to
    // WEIGHT (the dictionary meaning without a qualifier) rather than fluid ounces: most liquids
    // are labeled "fl oz" explicitly, but a few (Planet Oat's oat milk carton, in testing) list
    // just "oz" for a liquid. That one case won't get the cross-unit comparison benefit — it won't
    // get a wrong one either, since weight and volume can't be converted without knowing density,
    // and we deliberately never guess that.
    private const VOLUME_TO_FLOZ = ['floz' => 1.0, 'ml' => 0.033814, 'l' => 33.814, 'gal' => 128.0];

    private const WEIGHT_TO_GRAMS = ['oz' => 28.3495, 'lb' => 453.592, 'kg' => 1000.0, 'g' => 1.0];

    /** @return array{quantity: float, unit: string}|null */
    public static function guess(string $text): ?array
    {
        $leadingMultiplier = 1.0;
        if (preg_match(self::LEADING_MULTIPLIER_PATTERN, $text, $leading) === 1) {
            $leadingMultiplier = (float) $leading[1];
            $text = substr($text, strlen($leading[0]));
        }

        if (preg_match(self::PATTERN, $text, $m, PREG_OFFSET_CAPTURE) !== 1) {
            // No per-item size anywhere in the title for "Pack of N" to multiply — standing
            // completely alone, it still just means N of these ("...Pack of 4" with nothing else
            // in the title is 4 ct, not a multiplier with nothing to multiply). Deliberately not
            // extended to spelled-out counts ("Three Pack", "Single") — words like "Twin"/"Double"/
            // "Triple" too often describe flavor or size, not pack count ("Twin XL", "Triple Action
            // Formula"), so guessing those risks a silently wrong number instead of correctly
            // finding none; that's what Coverage's manual pack-quantity override is for.
            if (preg_match(self::SUFFIX_MULTIPLIER_OF_PATTERN, $text, $standalone) === 1) {
                return ['quantity' => (float) $standalone[1] * $leadingMultiplier, 'unit' => 'ct'];
            }

            return null;
        }

        $quantity = (float) $m[1][0] * $leadingMultiplier;
        $unit = self::normalizeUnit($m[2][0]);

        // Only look for a case-count multiplier in whatever comes AFTER the size we just matched —
        // never in the matched text itself, so "8 Pack" (no separate per-item size in the title)
        // can never multiply against its own digits.
        $remainder = substr($text, $m[0][1] + strlen($m[0][0]));
        $mainUnitIsSize = isset(self::VOLUME_TO_FLOZ[$unit]) || isset(self::WEIGHT_TO_GRAMS[$unit]);

        if (preg_match(self::SUFFIX_MULTIPLIER_OF_PATTERN, $remainder, $multiplier) === 1) {
            $quantity *= (float) $multiplier[1];
        } elseif ($mainUnitIsSize && preg_match(self::SUFFIX_MULTIPLIER_BARE_PATTERN, $remainder, $multiplier) === 1) {
            $quantity *= (float) $multiplier[1];
        }

        return ['quantity' => $quantity, 'unit' => $unit];
    }

    /** Maps any surface spelling this class recognizes (or a person's free-text unit_label) to its canonical code. */
    public static function normalizeUnit(string $raw): string
    {
        $key = strtolower(trim($raw));
        $key = preg_replace('/\s+/', ' ', $key) ?? $key;

        return self::UNIT_MAP[$key] ?? $key;
    }

    /** True if two (already-normalized) units are either identical or in the same convertible family. */
    public static function comparable(string $unitA, string $unitB): bool
    {
        if ($unitA === $unitB) {
            return true;
        }

        return (isset(self::VOLUME_TO_FLOZ[$unitA]) && isset(self::VOLUME_TO_FLOZ[$unitB]))
            || (isset(self::WEIGHT_TO_GRAMS[$unitA]) && isset(self::WEIGHT_TO_GRAMS[$unitB]));
    }

    /** Converts a quantity between comparable units. Null means "can't" — different, non-convertible units. */
    public static function convert(float $quantity, string $fromUnit, string $toUnit): ?float
    {
        if ($fromUnit === $toUnit) {
            return $quantity;
        }

        if (isset(self::VOLUME_TO_FLOZ[$fromUnit], self::VOLUME_TO_FLOZ[$toUnit])) {
            return $quantity * self::VOLUME_TO_FLOZ[$fromUnit] / self::VOLUME_TO_FLOZ[$toUnit];
        }

        if (isset(self::WEIGHT_TO_GRAMS[$fromUnit], self::WEIGHT_TO_GRAMS[$toUnit])) {
            return $quantity * self::WEIGHT_TO_GRAMS[$fromUnit] / self::WEIGHT_TO_GRAMS[$toUnit];
        }

        return null;
    }
}
