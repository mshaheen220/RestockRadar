/** Shared by Preferred Products (WatchlistManager) and the Coverage table so a price/unit-price/
 * good-deal badge looks and behaves identically everywhere it appears. */

import type { DealVerdict } from './api';

export function formatMoney(amount: number, currency?: string | null): string {
  const symbol = !currency || currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${amount.toFixed(2)}`;
}

export type UnitPriceBadge = { text: string; isGoodDeal: boolean | null };

/** null return means "can't compute" (missing price or quantity); isGoodDeal null means "no target set to compare against". */
export function unitPriceBadge(params: {
  price: number | null | undefined;
  quantity: number | null | undefined;
  currency?: string | null;
  unitLabel?: string | null;
  targetUnitPrice?: number | null;
}): UnitPriceBadge | null {
  const { price, quantity, currency, unitLabel, targetUnitPrice } = params;
  if (price == null || quantity == null || quantity === 0) return null;

  const unitPrice = price / quantity;
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
