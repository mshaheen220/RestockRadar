/** Shared by Preferred Products (WatchlistManager) and the Coverage table so a price/unit-price/
 * good-deal badge looks and behaves identically everywhere it appears. */

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
