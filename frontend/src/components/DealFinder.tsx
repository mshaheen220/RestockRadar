import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { dealsApi, type DealFinderChoice, type DealFinderProduct } from '../api';
import { daysSince, formatMoney, isStalePrice, stripSiteSuffix, verdictBadgeClass, verdictLabel } from '../priceUtils';
import RankBadge from './RankBadge';
import SiteIcon from './SiteIcon';

const ACTIONABLE = new Set(['good_deal', 'all_time_low']);

function ChoiceRow({ choice, unitLabel, isBest }: { choice: DealFinderChoice; unitLabel: string | null; isBest: boolean }) {
  const stale = isStalePrice(choice.price_captured_at);
  // Only choices the backend could actually convert into the shared reference unit get labeled
  // with it — a non-comparable one shows its OWN captured unit instead, so its price is never
  // mislabeled as something it wasn't converted into.
  const displayUnit = choice.comparable ? unitLabel : choice.quantity_unit;

  return (
    <li className="flex items-center justify-between gap-2 text-sm py-0.5">
      <span className="flex items-center gap-1.5 min-w-0">
        <RankBadge rank={choice.rank} />
        {choice.site_name && <SiteIcon name={choice.site_name} />}
        <span className="truncate text-stone-600 dark:text-stone-400" title={choice.label}>
          {stripSiteSuffix(choice.label)}
        </span>
        {stale && (
          <span
            className="shrink-0 text-xs px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
            title={`Captured ${choice.price_captured_at} — this may not be today's actual price`}
          >
            stale · {daysSince(choice.price_captured_at as string)}d
          </span>
        )}
        {!choice.comparable && (
          <span
            className="shrink-0 text-xs px-1 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
            title="This unit doesn't convert into the other captured choices' unit, so it's shown on its own rather than ranked against them"
          >
            can't compare
          </span>
        )}
      </span>
      <span className="shrink-0 flex items-center gap-1.5">
        <span className="font-medium">
          {formatMoney(choice.unit_price, choice.price_currency)}
          {displayUnit ? `/${displayUnit}` : '/unit'}
        </span>
        {isBest && choice.comparable && (
          <span className={'text-xs px-1.5 py-0.5 rounded ' + verdictBadgeClass(choice.verdict)}>{verdictLabel(choice.verdict)}</span>
        )}
      </span>
    </li>
  );
}

function ProductCard({ product }: { product: DealFinderProduct }) {
  const best = product.choices[0];

  return (
    <li className="rounded border border-stone-200 dark:border-stone-700 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{product.display_name}</span>
        {product.target_unit_price != null && (
          <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
            good price: {formatMoney(product.target_unit_price)}
            {product.unit_label ? `/${product.unit_label}` : ''}
          </span>
        )}
      </div>
      {best.message && (
        <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">{best.message}</p>
      )}
      <ul className="mt-1">
        {product.choices.map((choice) => (
          <ChoiceRow key={choice.rank} choice={choice} unitLabel={product.unit_label} isBest={choice.rank === best.rank} />
        ))}
      </ul>
    </li>
  );
}

function ProductGroup({
  title,
  hint,
  products,
  emptyText,
}: {
  title: string;
  hint?: string;
  products: DealFinderProduct[];
  emptyText: string;
}) {
  return (
    <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="text-xs text-stone-500 dark:text-stone-400 mb-2">{hint}</p>}
      {products.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-2">{emptyText}</p>
      ) : (
        <ul className="space-y-2 mt-2">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Answers "where should I buy this, right now" across the whole watchlist — a report you
 * re-run any time, not a notification log (that's /deals/detect + the Dashboard's Alerts panel,
 * which only surfaces what's NEW and dedupes on exact price). This always shows the current
 * picture using whatever prices you've most recently captured via the wand button or the
 * extension — the "stale" flag on a choice is a reminder that a "deal" is only as current as
 * the last time you checked it.
 */
export default function DealFinder() {
  const [report, setReport] = useState<DealFinderProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRun, setLastRun] = useState<Date | null>(null);

  const analyze = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await dealsApi.finder();
      setReport(result.filter((p) => p.choices.length > 0));
      setLastRun(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    analyze();
  }, []);

  const deals = (report ?? []).filter((p) => ACTIONABLE.has(p.choices[0].verdict));
  const rest = (report ?? []).filter((p) => !ACTIONABLE.has(p.choices[0].verdict));

  return (
    <div className="space-y-4 max-w-3xl">
      <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-semibold">Deal Finder</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Every store price you've captured for your watchlist, judged against your own purchase history —
              cheapest first, so you know where to buy today even if you're not out yet.
            </p>
          </div>
          <button
            type="button"
            onClick={analyze}
            disabled={loading}
            className="shrink-0 flex items-center gap-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5 disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
        {lastRun && (
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-2">Last analyzed {lastRun.toLocaleTimeString()}</p>
        )}
        {error && <p className="text-red-600 text-sm mt-2">Couldn't load the report: {error}</p>}
      </section>

      <ProductGroup
        title="Good deals right now"
        hint="At or below your recent average, or an all-time low, for at least one captured store price."
        products={deals}
        emptyText={
          report === null
            ? 'Analyzing…'
            : "Nothing's beating your history right now — recapture prices (wand or extension) if it's been a while, then re-analyze."
        }
      />

      <ProductGroup
        title="Everything else"
        hint="Captured, but at a typical price (or not enough purchase history yet to judge)."
        products={rest}
        emptyText={report === null ? '' : '—'}
      />
    </div>
  );
}
