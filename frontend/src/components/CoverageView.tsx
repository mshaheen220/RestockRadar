import { useEffect, useState } from 'react';
import { Eye, EyeOff, Link2, Unlink } from 'lucide-react';
import {
  coverageApi,
  sitesApi,
  watchlistApi,
  type CoverageItem,
  type CoverageStatus,
  type CoverageSummary,
  type Site,
  type WatchlistProduct,
} from '../api';
import { formatMoney, unitPriceBadge, unitPriceBadgeClass } from '../priceUtils';
import SiteIcon from './SiteIcon';

const PAGE_SIZE = 25;

const STATUS_OPTIONS: { value: CoverageStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'unmatched', label: 'Unmatched' },
  { value: 'linked', label: 'Linked' },
  { value: 'ignored', label: 'Ignored' },
];

const STATUS_PILL: Record<CoverageStatus, string> = {
  linked: 'bg-brand-100 dark:bg-brand-800/40 text-brand-700 dark:text-brand-300',
  unmatched: 'bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400',
  ignored: 'bg-stone-200 dark:bg-stone-800 text-stone-500 dark:text-stone-500',
};

type BulkAction = 'assign' | 'ignore' | 'unignore' | 'unlink';

const BULK_ACTION_OPTIONS: { value: BulkAction; label: string }[] = [
  { value: 'assign', label: 'Assign to product…' },
  { value: 'ignore', label: 'Ignore' },
  { value: 'unignore', label: 'Un-ignore' },
  { value: 'unlink', label: 'Unlink' },
];

function itemKey(item: CoverageItem): string {
  return `${item.site_id}::${item.product_name}`;
}

function SummaryTiles({ summary }: { summary: CoverageSummary }) {
  const percent = Math.round(summary.linked_ratio * 100);

  return (
    <section
      aria-labelledby="coverage-summary-heading"
      className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4"
    >
      <h2 id="coverage-summary-heading" className="font-semibold mb-3">
        How much of your purchase history is organized
      </h2>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Percent of transactions linked to a watchlist product"
        className="h-3 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden mb-3"
      >
        <div className="h-full bg-brand-500" style={{ width: `${percent}%` }} />
      </div>

      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <dt className="text-stone-500 dark:text-stone-400">Linked</dt>
          <dd className="text-lg font-semibold">{percent}%</dd>
        </div>
        <div>
          <dt className="text-stone-500 dark:text-stone-400">Total transactions</dt>
          <dd className="text-lg font-semibold">{summary.total_transactions.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-stone-500 dark:text-stone-400">Unmatched items</dt>
          <dd className="text-lg font-semibold">{summary.unmatched_distinct_items.toLocaleString()}</dd>
        </div>
        <div>
          <dt className="text-stone-500 dark:text-stone-400">Ignored transactions</dt>
          <dd className="text-lg font-semibold">{summary.ignored_transactions.toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  );
}

function AssignControl({ item, products, onChanged }: { item: CoverageItem; products: WatchlistProduct[]; onChanged: () => void }) {
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);

  const assign = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await watchlistApi.acceptSuggestion(Number(selected), {
        site_name: item.site_name,
        raw_product_name: item.product_name,
      });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        aria-label={`Assign ${item.product_name} to a watchlist product`}
        className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-1.5 py-1 text-xs max-w-[9rem]"
      >
        <option value="">Assign to…</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.display_name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={assign}
        disabled={!selected || busy}
        aria-label={`Link ${item.product_name}`}
        title="Link to selected product"
        className="p-1.5 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800/40 disabled:opacity-40"
      >
        <Link2 size={16} />
      </button>
    </div>
  );
}

function RowActions({ item, products, onChanged }: { item: CoverageItem; products: WatchlistProduct[]; onChanged: () => void }) {
  const unlink = async () => {
    if (item.watchlist_product_id === null || item.alias_id === null) return;
    await watchlistApi.removeAlias(item.watchlist_product_id, item.alias_id);
    onChanged();
  };

  const ignore = async () => {
    await coverageApi.ignore({ site_name: item.site_name, raw_product_name: item.product_name });
    onChanged();
  };

  const unignore = async () => {
    await coverageApi.unignore({ site_name: item.site_name, raw_product_name: item.product_name });
    onChanged();
  };

  if (item.status === 'linked') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-stone-500 dark:text-stone-400">→ {item.linked_product_name}</span>
        <button
          type="button"
          onClick={unlink}
          aria-label={`Unlink ${item.product_name}`}
          title="Unlink"
          className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Unlink size={16} />
        </button>
      </div>
    );
  }

  if (item.status === 'ignored') {
    return (
      <button
        type="button"
        onClick={unignore}
        aria-label={`Un-ignore ${item.product_name}`}
        title="Un-ignore"
        className="p-1.5 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800/40 inline-flex items-center gap-1"
      >
        <Eye size={16} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <AssignControl item={item} products={products} onChanged={onChanged} />
      <button
        type="button"
        onClick={ignore}
        aria-label={`Ignore ${item.product_name}`}
        title="Ignore — never suggest for any product"
        className="p-1.5 rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
      >
        <EyeOff size={16} />
      </button>
    </div>
  );
}

function BulkActionBar({
  selectedCount,
  products,
  onApply,
  onClear,
}: {
  selectedCount: number;
  products: WatchlistProduct[];
  onApply: (action: BulkAction, productId: string) => Promise<void>;
  onClear: () => void;
}) {
  const [action, setAction] = useState<BulkAction>('assign');
  const [productId, setProductId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    if (action === 'assign' && !productId) return;
    setBusy(true);
    setError(null);
    try {
      await onApply(action, productId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-300 dark:border-brand-700 bg-brand-50 dark:bg-brand-900/20 px-3 py-2 mb-3">
      <span className="text-sm font-medium">{selectedCount} selected</span>

      <select
        value={action}
        onChange={(e) => setAction(e.target.value as BulkAction)}
        aria-label="Bulk action"
        className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
      >
        {BULK_ACTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>

      {action === 'assign' && (
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          aria-label="Product to assign selected items to"
          className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        >
          <option value="">Choose a product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </select>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={busy || (action === 'assign' && !productId)}
        className="rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5 disabled:opacity-40"
      >
        {busy ? 'Applying…' : 'Apply'}
      </button>

      <button type="button" onClick={onClear} className="text-sm text-stone-500 hover:underline">
        Clear selection
      </button>

      {error && <p className="text-red-600 text-sm w-full">{error}</p>}
    </div>
  );
}

export default function CoverageView() {
  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [products, setProducts] = useState<WatchlistProduct[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [items, setItems] = useState<CoverageItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<CoverageStatus | ''>('');
  const [siteId, setSiteId] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadSummary = () => {
    coverageApi.summary().then(setSummary).catch((err: Error) => setError(err.message));
  };

  const loadItems = (nextOffset: number, nextStatus: CoverageStatus | '', nextSiteId: string, nextSearch: string) => {
    coverageApi
      .items({
        limit: PAGE_SIZE,
        offset: nextOffset,
        status: nextStatus || undefined,
        search: nextSearch || undefined,
        siteId: nextSiteId ? Number(nextSiteId) : undefined,
      })
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setSelected(new Set());
      })
      .catch((err: Error) => setError(err.message));
  };

  useEffect(() => {
    loadSummary();
    watchlistApi.list().then(setProducts);
    sitesApi.list().then(setSites);
    loadItems(0, '', '', '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAll = () => {
    loadSummary();
    loadItems(offset, status, siteId, search);
  };

  const applyFilters = (nextStatus: CoverageStatus | '', nextSiteId: string, nextSearch: string) => {
    setOffset(0);
    setStatus(nextStatus);
    setSiteId(nextSiteId);
    setSearch(nextSearch);
    loadItems(0, nextStatus, nextSiteId, nextSearch);
  };

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters(status, siteId, searchInput);
  };

  const goToPage = (nextOffset: number) => {
    setOffset(nextOffset);
    loadItems(nextOffset, status, siteId, search);
  };

  const toggleSelect = (item: CoverageItem) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const key = itemKey(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allVisibleSelected = items !== null && items.length > 0 && items.every((item) => selected.has(itemKey(item)));

  const toggleSelectAll = () => {
    if (items === null) return;
    setSelected(allVisibleSelected ? new Set() : new Set(items.map(itemKey)));
  };

  const applyBulkAction = async (action: BulkAction, productId: string) => {
    if (items === null) return;
    const targets = items.filter((item) => selected.has(itemKey(item)));

    await Promise.all(
      targets.map(async (item) => {
        if (action === 'assign') {
          await watchlistApi.acceptSuggestion(Number(productId), {
            site_name: item.site_name,
            raw_product_name: item.product_name,
          });
        } else if (action === 'ignore') {
          await coverageApi.ignore({ site_name: item.site_name, raw_product_name: item.product_name });
        } else if (action === 'unignore') {
          await coverageApi.unignore({ site_name: item.site_name, raw_product_name: item.product_name });
        } else if (action === 'unlink' && item.watchlist_product_id !== null && item.alias_id !== null) {
          await watchlistApi.removeAlias(item.watchlist_product_id, item.alias_id);
        }
      }),
    );

    refreshAll();
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {summary && <SummaryTiles summary={summary} />}

      <section
        aria-labelledby="coverage-items-heading"
        className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4"
      >
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <h2 id="coverage-items-heading" className="font-semibold">
            Purchase history
          </h2>
        </div>

        <div className="flex flex-wrap gap-3 items-end mb-4">
          <div>
            <label htmlFor="coverage-status" className="block text-xs text-stone-500 dark:text-stone-400">
              Status
            </label>
            <select
              id="coverage-status"
              value={status}
              onChange={(e) => applyFilters(e.target.value as CoverageStatus | '', siteId, search)}
              className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="coverage-site" className="block text-xs text-stone-500 dark:text-stone-400">
              Site
            </label>
            <select
              id="coverage-site"
              value={siteId}
              onChange={(e) => applyFilters(status, e.target.value, search)}
              className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
            >
              <option value="">All sites</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={runSearch} role="search" className="ml-auto">
            <label htmlFor="coverage-search" className="block text-xs text-stone-500 dark:text-stone-400">
              Search
            </label>
            <input
              id="coverage-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name…"
              className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm w-48"
            />
          </form>
        </div>

        {items === null && <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>}
        {items && items.length === 0 && (
          <p className="text-sm text-stone-500 dark:text-stone-400">No items match these filters.</p>
        )}

        {items && items.length > 0 && (
          <>
            {selected.size > 0 && (
              <BulkActionBar selectedCount={selected.size} products={products} onApply={applyBulkAction} onClear={() => setSelected(new Set())} />
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <caption className="sr-only">Purchase history items and their watchlist link status</caption>
                <thead>
                  <tr className="text-brand-700 dark:text-brand-400 border-b border-brand-200 dark:border-brand-800">
                    <th scope="col" className="py-1 pr-2 w-6">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                        aria-label="Select all visible items"
                        className="accent-brand-500"
                      />
                    </th>
                    <th scope="col" className="py-1 pr-4">Item</th>
                    <th scope="col" className="py-1 pr-4">Site</th>
                    <th scope="col" className="py-1 pr-4">Status</th>
                    <th scope="col" className="py-1 pr-4">Last price</th>
                    <th scope="col" className="py-1 pr-4">Times bought</th>
                    <th scope="col" className="py-1 pr-4">Last bought</th>
                    <th scope="col" className="py-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={`${item.site_id}-${item.product_name}`} className="border-b border-stone-100 dark:border-stone-800 last:border-0">
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          checked={selected.has(itemKey(item))}
                          onChange={() => toggleSelect(item)}
                          aria-label={`Select ${item.product_name}`}
                          className="accent-brand-500"
                        />
                      </td>
                      <td className="py-1.5 pr-4">{item.product_name}</td>
                      <td className="py-1.5 pr-4 text-stone-500 dark:text-stone-400">
                        <span className="inline-flex items-center gap-1">
                          <SiteIcon name={item.site_name} />
                          {item.site_name}
                        </span>
                      </td>
                      <td className="py-1.5 pr-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_PILL[item.status]}`}>{item.status}</span>
                      </td>
                      <td className="py-1.5 pr-4">
                        {item.last_price != null && <span className="text-brand-700 dark:text-brand-400 font-medium">{formatMoney(item.last_price)}</span>}
                        {(() => {
                          const badge = unitPriceBadge({
                            price: item.last_price,
                            quantity: item.last_pack_quantity,
                            unitLabel: item.linked_unit_label,
                            targetUnitPrice: item.linked_target_unit_price,
                          });
                          if (!badge) return null;
                          return (
                            <span
                              className={'ml-1.5 text-xs px-1.5 py-0.5 rounded whitespace-nowrap ' + unitPriceBadgeClass(badge.isGoodDeal)}
                              title={
                                item.linked_target_unit_price != null
                                  ? `Target: $${item.linked_target_unit_price}${item.linked_unit_label ? `/${item.linked_unit_label}` : ''}`
                                  : item.status === 'linked'
                                    ? 'Set a target unit price on this product to flag good deals'
                                    : 'Link this item to a watchlist product to compare against its target price'
                              }
                            >
                              {badge.text}
                            </span>
                          );
                        })()}
                        {item.last_price == null && <span className="text-stone-400 dark:text-stone-500">—</span>}
                      </td>
                      <td className="py-1.5 pr-4">{item.transaction_count}</td>
                      <td className="py-1.5 pr-4 text-stone-500 dark:text-stone-400">{item.last_purchased}</td>
                      <td className="py-1.5">
                        <RowActions item={item} products={products} onChanged={refreshAll} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="text-stone-500 dark:text-stone-400">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total.toLocaleString()}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(Math.max(0, offset - PAGE_SIZE))}
                  disabled={offset === 0}
                  className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(offset + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total}
                  className="text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
