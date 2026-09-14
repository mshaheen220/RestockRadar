import { useEffect, useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { alertsApi, dealsApi, type Alert, type WatchlistProduct } from '../api';
import { daysSince, isStalePrice, STALE_PRICE_DAYS } from '../priceUtils';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

type TransactionSummary = {
  row_count: number;
  earliest: string | null;
  latest: string | null;
  distinct_sites: number;
};

function useJson<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`${API_BASE}${path}`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return { data, error };
}

function AlertsPanel() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = () => {
    alertsApi.list().then(setAlerts).catch((err: Error) => setError(err.message));
  };

  useEffect(load, []);

  const checkForDeals = async () => {
    setChecking(true);
    setStatus(null);
    setError(null);
    try {
      const result = await dealsApi.detect();
      setStatus(
        result.alerts_created.length === 0
          ? `Checked ${result.products_checked} product(s) with preferred prices set — nothing new.`
          : `Checked ${result.products_checked} product(s) — found ${result.alerts_created.length} new alert(s).`,
      );
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const acknowledge = async (id: number) => {
    await alertsApi.acknowledge(id);
    load();
  };

  return (
    <section
      aria-labelledby="alerts-heading"
      className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 id="alerts-heading" className="font-semibold">
          Alerts
        </h2>
        <button
          type="button"
          onClick={checkForDeals}
          disabled={checking}
          aria-label="Check for deals now"
          title="Check whether your preferred products' captured prices beat their price history"
          className="shrink-0 flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40"
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
          {checking ? 'Checking…' : 'Check for deals'}
        </button>
      </div>

      {status && <p className="text-xs text-stone-500 dark:text-stone-400 mb-2">{status}</p>}
      {error && <p className="text-red-600 text-sm">Couldn't load alerts: {error}</p>}
      {alerts && alerts.length === 0 && <p className="text-sm text-stone-500 dark:text-stone-400">No open alerts.</p>}
      {alerts && alerts.length > 0 && (
        <ul className="text-sm space-y-2">
          {alerts.map((alert) => (
            <li key={alert.id} className="flex items-start justify-between gap-2">
              <span>
                <span className="font-medium">{alert.display_name}</span>: {alert.message}
              </span>
              <button
                type="button"
                onClick={() => acknowledge(alert.id)}
                aria-label={`Dismiss alert for ${alert.display_name}`}
                title="Dismiss"
                className="shrink-0 p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A captured price is a one-time snapshot (wand/extension), not a live check — it goes stale
 * silently, so a "good deal" verdict could be built on a price from months ago. This is a nudge,
 * not an automated recheck: re-capturing still has to happen via the wand button or the extension.
 */
function PriceFreshnessPanel({ watchlist }: { watchlist: WatchlistProduct[] | null }) {
  const dueForRecheck = (watchlist ?? []).flatMap((product) =>
    product.choices
      .filter((choice) => choice.price == null || isStalePrice(choice.price_captured_at))
      .map((choice) => ({ product, choice })),
  );

  return (
    <section
      aria-labelledby="price-freshness-heading"
      className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4 sm:col-span-2"
    >
      <h2 id="price-freshness-heading" className="font-semibold mb-2">
        Price checks due
      </h2>

      {watchlist === null && <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>}
      {watchlist && dueForRecheck.length === 0 && (
        <p className="text-sm text-stone-500 dark:text-stone-400">All captured prices are fresh.</p>
      )}
      {dueForRecheck.length > 0 && (
        <ul className="text-sm space-y-1">
          {dueForRecheck.map(({ product, choice }) => (
            <li key={`${product.id}-${choice.rank}`} className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium">{product.display_name}</span>
                <span className="text-stone-500 dark:text-stone-400"> — {choice.label}</span>
              </span>
              <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">
                {choice.price == null ? 'never captured' : `captured ${daysSince(choice.price_captured_at as string)}d ago`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-stone-400 dark:text-stone-500">
        Recheck via the wand button or the browser extension — a captured price older than {STALE_PRICE_DAYS}{' '}
        days doesn't refresh on its own.
      </p>
    </section>
  );
}

export default function Dashboard() {
  const { data: watchlist, error: watchlistError } = useJson<WatchlistProduct[]>('/watchlist');
  const { data: summary, error: summaryError } = useJson<TransactionSummary>('/transactions/summary');

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <section
        aria-labelledby="summary-heading"
        className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4"
      >
        <h2 id="summary-heading" className="font-semibold mb-2">
          Purchase history
        </h2>
        {summaryError && <p className="text-red-600 text-sm">Couldn't load summary: {summaryError}</p>}
        {summary && (
          <dl className="text-sm space-y-1">
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Transactions</dt>
              <dd>{summary.row_count.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Date range</dt>
              <dd>
                {summary.earliest} – {summary.latest}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500 dark:text-stone-400">Sites</dt>
              <dd>{summary.distinct_sites}</dd>
            </div>
          </dl>
        )}
      </section>

      <AlertsPanel />

      <PriceFreshnessPanel watchlist={watchlist} />

      <section
        aria-labelledby="watchlist-heading"
        className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4 sm:col-span-2"
      >
        <h2 id="watchlist-heading" className="font-semibold mb-2">
          Watchlist
        </h2>
        {watchlistError && <p className="text-red-600 text-sm">Couldn't load watchlist: {watchlistError}</p>}
        {watchlist && watchlist.length === 0 && (
          <p className="text-sm text-stone-500 dark:text-stone-400">
            No products on the watchlist yet — add some via the backend API or database.
          </p>
        )}
        {watchlist && watchlist.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <caption className="sr-only">Watchlist products and what matters about each one</caption>
              <thead>
                <tr className="text-brand-700 dark:text-brand-400 border-b border-brand-200 dark:border-brand-800">
                  <th scope="col" className="py-1 pr-4">Product</th>
                  <th scope="col" className="py-1">What matters</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((item) => (
                  <tr key={item.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="py-1 pr-4">{item.display_name}</td>
                    <td className="py-1">
                      {item.criteria.length === 0
                        ? '—'
                        : item.criteria.map((c) => `${c.attribute_key}: ${c.attribute_value}`).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
