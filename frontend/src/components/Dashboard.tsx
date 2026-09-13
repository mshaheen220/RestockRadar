import { useEffect, useState } from 'react';
import type { WatchlistProduct } from '../api';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

type TransactionSummary = {
  row_count: number;
  earliest: string | null;
  latest: string | null;
  distinct_sites: number;
};

type Alert = {
  id: number;
  kind: string;
  message: string;
  created_at: string;
  display_name: string;
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

export default function Dashboard() {
  const { data: watchlist, error: watchlistError } = useJson<WatchlistProduct[]>('/watchlist');
  const { data: summary, error: summaryError } = useJson<TransactionSummary>('/transactions/summary');
  const { data: alerts, error: alertsError } = useJson<Alert[]>('/alerts');

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

      <section
        aria-labelledby="alerts-heading"
        className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4"
      >
        <h2 id="alerts-heading" className="font-semibold mb-2">
          Alerts
        </h2>
        {alertsError && <p className="text-red-600 text-sm">Couldn't load alerts: {alertsError}</p>}
        {alerts && alerts.length === 0 && <p className="text-sm text-stone-500 dark:text-stone-400">No open alerts.</p>}
        {alerts && alerts.length > 0 && (
          <ul className="text-sm space-y-2">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <span className="font-medium">{alert.display_name}</span>: {alert.message}
              </li>
            ))}
          </ul>
        )}
      </section>

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
              <caption className="sr-only">Watchlist products and target rates</caption>
              <thead>
                <tr className="text-brand-700 dark:text-brand-400 border-b border-brand-200 dark:border-brand-800">
                  <th scope="col" className="py-1 pr-4">Product</th>
                  <th scope="col" className="py-1 pr-4">What matters</th>
                  <th scope="col" className="py-1">Stated rate</th>
                </tr>
              </thead>
              <tbody>
                {watchlist.map((item) => (
                  <tr key={item.id} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                    <td className="py-1 pr-4">{item.display_name}</td>
                    <td className="py-1 pr-4">
                      {item.criteria.length === 0
                        ? '—'
                        : item.criteria.map((c) => `${c.attribute_key}: ${c.attribute_value}`).join(', ')}
                    </td>
                    <td className="py-1">{item.stated_rate ?? '—'}</td>
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
