/** Shared by Preferred Products (WatchlistManager) and the Coverage table so a price/unit-price/
 * good-deal badge looks and behaves identically everywhere it appears. */

import type { DealVerdict } from './api';

export function formatMoney(amount: number, currency?: string | null): string {
  const symbol = !currency || currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

// Mirrors backend/src/Analysis/PackQuantity.php's UNIT_MAP/VOLUME_TO_FLOZ/WEIGHT_TO_GRAMS — same
// reasoning for reimplementing in JS/TS as the browser extension's regex mirror: this needs to run
// client-side. Only the normalize/comparable/convert half is needed here (the regex-guessing half
// only ever runs server-side or in the extension's own content-script context).
const UNIT_MAP: Record<string, string> = {
  'fl oz': 'floz', 'fl. oz': 'floz', 'fl.oz': 'floz',
  oz: 'oz', lb: 'lb', lbs: 'lb',
  kg: 'kg', kilogram: 'kg', kilograms: 'kg',
  g: 'g', gram: 'g', grams: 'g',
  ml: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', liter: 'l', liters: 'l',
  gal: 'gal', gallon: 'gal', gallons: 'gal',
  count: 'ct', ct: 'ct', pack: 'ct', pk: 'ct',
  capsule: 'capsule', capsules: 'capsule',
  pod: 'pod', pods: 'pod',
  roll: 'roll', rolls: 'roll',
  sheet: 'sheet', sheets: 'sheet',
  bag: 'bag', bags: 'bag',
  can: 'can', cans: 'can',
  bottle: 'bottle', bottles: 'bottle',
};

const VOLUME_TO_FLOZ: Record<string, number> = { floz: 1.0, ml: 0.033814, l: 33.814, gal: 128.0 };
const WEIGHT_TO_GRAMS: Record<string, number> = { oz: 28.3495, lb: 453.592, kg: 1000.0, g: 1.0 };

export function normalizeUnit(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return UNIT_MAP[key] ?? key;
}

export function unitsComparable(unitA: string, unitB: string): boolean {
  if (unitA === unitB) return true;
  return (
    (unitA in VOLUME_TO_FLOZ && unitB in VOLUME_TO_FLOZ) || (unitA in WEIGHT_TO_GRAMS && unitB in WEIGHT_TO_GRAMS)
  );
}

/** Null means "can't" — different, non-convertible units. */
export function convertUnit(quantity: number, fromUnit: string, toUnit: string): number | null {
  if (fromUnit === toUnit) return quantity;
  if (fromUnit in VOLUME_TO_FLOZ && toUnit in VOLUME_TO_FLOZ) {
    return (quantity * VOLUME_TO_FLOZ[fromUnit]) / VOLUME_TO_FLOZ[toUnit];
  }
  if (fromUnit in WEIGHT_TO_GRAMS && toUnit in WEIGHT_TO_GRAMS) {
    return (quantity * WEIGHT_TO_GRAMS[fromUnit]) / WEIGHT_TO_GRAMS[toUnit];
  }
  return null;
}

export type UnitPriceBadge = { text: string; isGoodDeal: boolean | null };

/**
 * null return means "can't compute" (missing price or quantity), or a genuine unit mismatch —
 * isGoodDeal null (with text '(unit mismatch)') means the captured quantityUnit doesn't convert
 * into unitLabel, so no honest unit price can be shown at all (e.g. a case of cans captured in
 * fl oz for a product whose declared unit is 'ct'). quantityUnit is optional and backward
 * compatible: when omitted (as Coverage does today, since transactions don't carry a unit yet),
 * this behaves exactly as before — no mismatch check, just price / quantity.
 */
export function unitPriceBadge(params: {
  price: number | null | undefined;
  quantity: number | null | undefined;
  currency?: string | null;
  unitLabel?: string | null;
  quantityUnit?: string | null;
  targetUnitPrice?: number | null;
}): UnitPriceBadge | null {
  const { price, quantity, currency, unitLabel, quantityUnit, targetUnitPrice } = params;
  if (price == null || quantity == null || quantity === 0) return null;

  let comparableQuantity = quantity;
  if (quantityUnit != null && unitLabel != null) {
    const from = normalizeUnit(quantityUnit);
    const to = normalizeUnit(unitLabel);
    if (from !== to) {
      const converted = unitsComparable(from, to) ? convertUnit(quantity, from, to) : null;
      if (converted == null) {
        return { text: '(unit mismatch)', isGoodDeal: null };
      }
      comparableQuantity = converted;
    }
  }

  const unitPrice = price / comparableQuantity;
  const symbol = !currency || currency === 'USD' ? '$' : `${currency} `;
  const text = `${symbol}${unitPrice.toFixed(3)}${unitLabel ? `/${unitLabel}` : '/unit'}`;
  const isGoodDeal = targetUnitPrice != null ? unitPrice <= targetUnitPrice : null;

  return { text, isGoodDeal };
}

export function unitPriceBadgeClass(isGoodDeal: boolean | null): string {
  if (isGoodDeal === true) return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
  if (isGoodDeal === false) return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400';
  return 'text-stone-400 dark:text-stone-500';
}

/** A captured price never updates itself — this is the threshold past which a deal verdict is
 * based on a price that's plausibly gone stale, not "how long until it's wrong". */
export const STALE_PRICE_DAYS = 30;

/** `capturedAt` is a "Y-m-d H:i:s" string from the backend (see price_captured_at in schema.sql). */
export function daysSince(capturedAt: string): number {
  const capturedMs = new Date(capturedAt.replace(' ', 'T')).getTime();
  return Math.floor((Date.now() - capturedMs) / 86_400_000);
}

export function isStalePrice(priceCapturedAt: string | null): boolean {
  return priceCapturedAt != null && daysSince(priceCapturedAt) >= STALE_PRICE_DAYS;
}

export function verdictLabel(verdict: DealVerdict): string {
  switch (verdict) {
    case 'all_time_low':
      return 'All-time low';
    case 'good_deal':
      return 'Good deal';
    case 'insufficient_history':
      return 'Not enough history yet';
    default:
      return 'Typical price';
  }
}

export function verdictBadgeClass(verdict: DealVerdict): string {
  if (verdict === 'all_time_low') return 'bg-green-600 text-white dark:bg-green-500';
  if (verdict === 'good_deal') return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
  if (verdict === 'insufficient_history') return 'text-stone-400 dark:text-stone-500';
  return 'text-stone-500 dark:text-stone-400';
}
