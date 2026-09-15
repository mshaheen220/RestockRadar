import { useEffect, useRef, useState } from 'react';
import { Check, EyeOff, Link2, Plus, Upload } from 'lucide-react';
import { coverageApi, purchasesApi, sitesApi, watchlistApi, type ProductSuggestion, type Site, type WatchlistProduct } from '../api';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type AddedItem = { key: string; productName: string; siteName: string; total: number };

/**
 * A purchase you just added is unlinked, same as anything from a CSV import — Deal Finder can't
 * use it until it's tied to a watchlist product. Without this, closing that loop means a
 * separate trip to Coverage for every single add, which defeats the point of a "quick" add.
 * Ranks suggestions via the same scoring ProductMatcher already uses (just the reverse direction:
 * one fresh name against every watchlist product, not one product against every fresh name).
 */
function LinkSuggestion({ item, products }: { item: AddedItem; products: WatchlistProduct[] }) {
  const [suggestions, setSuggestions] = useState<ProductSuggestion[] | null>(null);
  const [manualId, setManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'linked' | 'ignored' | null>(null);

  useEffect(() => {
    coverageApi
      .suggest(item.productName)
      .then(setSuggestions)
      .catch(() => setSuggestions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const link = async (watchlistProductId: number) => {
    setBusy(true);
    try {
      await watchlistApi.acceptSuggestion(watchlistProductId, { site_name: item.siteName, raw_product_name: item.productName });
      setStatus('linked');
    } finally {
      setBusy(false);
    }
  };

  const ignore = async () => {
    setBusy(true);
    try {
      await coverageApi.ignore({ site_name: item.siteName, raw_product_name: item.productName });
      setStatus('ignored');
    } finally {
      setBusy(false);
    }
  };

  if (status === 'linked') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-brand-600 dark:text-brand-400">
        <Check size={12} /> Linked
      </span>
    );
  }
  if (status === 'ignored') {
    return <span className="text-xs text-stone-400 dark:text-stone-500">Ignored — won't ask again</span>;
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
      {suggestions === null && <span className="text-xs text-stone-400 dark:text-stone-500">Checking watchlist…</span>}
      {suggestions?.map((s) => (
        <button
          key={s.watchlist_product_id}
          type="button"
          onClick={() => link(s.watchlist_product_id)}
          disabled={busy}
          title={`${Math.round(s.score * 100)}% match`}
          className="inline-flex items-center gap-1 text-xs rounded-full border border-brand-300 dark:border-brand-700 px-2 py-0.5 text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800/40 disabled:opacity-40"
        >
          <Link2 size={11} /> {s.display_name}
        </button>
      ))}
      {suggestions !== null && (
        <>
          <select
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            aria-label={`Assign ${item.productName} to a watchlist product`}
            className="text-xs rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-1 py-0.5 max-w-[8rem]"
          >
            <option value="">Something else…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
          </select>
          {manualId && (
            <button
              type="button"
              onClick={() => link(Number(manualId))}
              disabled={busy}
              aria-label={`Link ${item.productName}`}
              title="Link to selected product"
              className="p-1 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800/40 disabled:opacity-40"
            >
              <Link2 size={13} />
            </button>
          )}
          <button
            type="button"
            onClick={ignore}
            disabled={busy}
            title="Never a watchlist item — don't ask again"
            className="inline-flex items-center gap-1 text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
          >
            <EyeOff size={11} /> Not tracked
          </button>
        </>
      )}
    </div>
  );
}

/**
 * "I bought one thing, there's no receipt" — the common case for a quick stop on the way home.
 * Site and date persist across submissions (most likely still true for the next item from the
 * same trip); product/quantity/price clear so the next add starts fresh. A running list of what
 * was just added is the only feedback — there's no separate transaction-review UI, so without
 * this a person has no way to tell an add actually landed.
 */
function SinglePurchaseForm({ sites, products, onAdded }: { sites: Site[]; products: WatchlistProduct[]; onAdded: () => void }) {
  const [siteName, setSiteName] = useState('');
  const [txnDate, setTxnDate] = useState(todayIso());
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [showQuantity, setShowQuantity] = useState(false);
  const [unitPrice, setUnitPrice] = useState('');
  const [packQuantity, setPackQuantity] = useState('');
  const [packQuantityUnit, setPackQuantityUnit] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<AddedItem[]>([]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsedQuantity = Number(quantity);
    const parsedPrice = Number(unitPrice);
    if (!siteName.trim() || !productName.trim()) {
      setError('Site and product name are required.');
      return;
    }
    if (!quantity.trim() || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setError('Quantity must be a positive number.');
      return;
    }
    if (!unitPrice.trim() || Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setError('Price must be a number.');
      return;
    }

    setSaving(true);
    try {
      await purchasesApi.addSingle({
        site_name: siteName.trim(),
        product_name: productName.trim(),
        quantity: parsedQuantity,
        unit_price: parsedPrice,
        txn_date: txnDate || null,
        category: category.trim() || null,
        pack_quantity: packQuantity.trim() ? Number(packQuantity) : null,
        pack_quantity_unit: packQuantityUnit.trim() || null,
      });
      setAdded((prev) => [
        { key: `${Date.now()}-${prev.length}`, productName: productName.trim(), siteName: siteName.trim(), total: parsedQuantity * parsedPrice },
        ...prev,
      ]);
      setProductName('');
      setQuantity('1');
      setShowQuantity(false);
      setUnitPrice('');
      setCategory('');
      setPackQuantity('');
      setPackQuantityUnit('');
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4">
      <h2 className="font-semibold mb-1">Add a single purchase</h2>
      <p className="text-sm text-stone-500 dark:text-stone-400 mb-3">
        For a quick stop with nothing worth a full receipt — one item, added right now.
      </p>

      <form onSubmit={submit} className="flex flex-wrap gap-2 items-end">
        <div>
          <label htmlFor="purchase-site" className="block text-xs text-stone-500 dark:text-stone-400">
            Site
          </label>
          <input
            id="purchase-site"
            list="known-sites"
            value={siteName}
            onChange={(e) => setSiteName(e.target.value)}
            placeholder="Walmart, Sheetz…"
            required
            className="w-32 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
          <datalist id="known-sites">
            {sites.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>
        <div>
          <label htmlFor="purchase-date" className="block text-xs text-stone-500 dark:text-stone-400">
            Date
          </label>
          <input
            id="purchase-date"
            type="date"
            value={txnDate}
            onChange={(e) => setTxnDate(e.target.value)}
            className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex-1 min-w-[12rem]">
          <label htmlFor="purchase-product" className="block text-xs text-stone-500 dark:text-stone-400">
            Product name
          </label>
          <input
            id="purchase-product"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g. Charmin Ultra Soft, 12 Mega Rolls"
            required
            autoFocus
            className="w-full rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="purchase-pack-quantity" className="block text-xs text-stone-500 dark:text-stone-400">
            Pack size (optional)
          </label>
          <input
            id="purchase-pack-quantity"
            type="number"
            step="any"
            min="0"
            inputMode="decimal"
            value={packQuantity}
            onChange={(e) => setPackQuantity(e.target.value)}
            placeholder="guessed if blank"
            title="How many of the product's own unit are in ONE package — e.g. 24 for a 24-roll pack of toilet paper. Left blank, this is guessed from the product name (which only works if the name itself says a size); typing it here always wins."
            className="w-28 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor="purchase-pack-unit" className="block text-xs text-stone-500 dark:text-stone-400">
            Unit
          </label>
          <input
            id="purchase-pack-unit"
            value={packQuantityUnit}
            onChange={(e) => setPackQuantityUnit(e.target.value)}
            placeholder="roll, oz, ct…"
            className="w-24 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        {showQuantity && (
          <div>
            <label htmlFor="purchase-quantity" className="block text-xs text-stone-500 dark:text-stone-400">
              How many identical packages
            </label>
            <input
              id="purchase-quantity"
              type="number"
              step="any"
              min="0"
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              title="Only how many of this exact package you bought — e.g. two 24-roll packs of toilet paper is 2 here, not 48."
              className="w-20 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
            />
          </div>
        )}
        <div>
          <label htmlFor="purchase-price" className="block text-xs text-stone-500 dark:text-stone-400">
            {showQuantity ? 'Price paid (each)' : 'Price paid'}
          </label>
          <input
            id="purchase-price"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={unitPrice}
            onChange={(e) => setUnitPrice(e.target.value)}
            placeholder="14.99"
            required
            title={showQuantity ? 'Price per package — if you bought 2 at $5 each, that’s 5 here, not 10.' : 'What you paid for it.'}
            className="w-24 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
          {!showQuantity && (
            <button
              type="button"
              onClick={() => setShowQuantity(true)}
              className="block text-xs text-brand-600 dark:text-brand-400 hover:underline mt-0.5"
            >
              Bought more than one?
            </button>
          )}
        </div>
        <div>
          <label htmlFor="purchase-category" className="block text-xs text-stone-500 dark:text-stone-400">
            Category (optional)
          </label>
          <input
            id="purchase-category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Household…"
            className="w-28 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5 disabled:opacity-40"
        >
          <Plus size={14} />
          {saving ? 'Adding…' : 'Add'}
        </button>
      </form>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}

      {added.length > 0 && (
        <ul className="mt-3 space-y-2 text-sm">
          {added.map((item) => (
            <li key={item.key} className="border-t border-stone-100 dark:border-stone-800 pt-2 first:border-0 first:pt-0">
              <p className="text-stone-500 dark:text-stone-400">
                Added <span className="text-stone-700 dark:text-stone-300">{item.productName}</span> ({item.siteName}) —{' '}
                ${item.total.toFixed(2)}
              </p>
              <LinkSuggestion item={item} products={products} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Bulk path: the same unified CSV shape that seeded all of transaction_log.csv (paste it or pick
 * a file) — both end up as one string sent to the same POST /purchases/import that
 * scripts/import_transactions.php's CLI path also flows through on the backend.
 */
function ImportForm({ onImported }: { onImported: () => void }) {
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ read: number; inserted: number } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setCsv(String(reader.result ?? ''));
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!csv.trim()) {
      setError('Paste or choose a CSV file first.');
      return;
    }
    setError(null);
    setImporting(true);
    setResult(null);
    try {
      const res = await purchasesApi.import(csv);
      setResult(res);
      setCsv('');
      setFileName(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onImported();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4">
      <h2 className="font-semibold mb-1">Import a full receipt</h2>
      <details className="mb-3">
        <summary className="text-sm text-brand-600 dark:text-brand-400 cursor-pointer">What format does this expect?</summary>
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-1">
          The same CSV format as <code>transaction_log.csv</code>: <code>date, site, order_id, product_name, quantity,
          unit_price, total_price, shipping_charge, product_id, category, delivery_status, recent_24mo</code>. Safe to
          re-import a file that includes rows already in your history — duplicates are skipped, never double-counted.
        </p>
      </details>

      <div className="flex items-center gap-2 mb-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="sr-only"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 hover:bg-brand-50 dark:hover:bg-brand-900/20 text-brand-700 dark:text-brand-300 text-sm px-3 py-1.5"
        >
          <Upload size={14} />
          Choose CSV file
        </button>
        <span className="text-sm text-stone-500 dark:text-stone-400">{fileName ?? 'No file chosen'}</span>
      </div>

      <label htmlFor="purchase-csv" className="sr-only">
        CSV contents
      </label>
      <textarea
        id="purchase-csv"
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder="Paste CSV rows here, or choose a file above…"
        rows={6}
        className="w-full rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1.5 text-sm font-mono"
      />

      <button
        type="button"
        onClick={submit}
        disabled={importing}
        className="mt-2 flex items-center gap-1.5 rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5 disabled:opacity-40"
      >
        <Upload size={14} />
        {importing ? 'Importing…' : 'Import'}
      </button>

      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      {result && (
        <p className="text-sm text-stone-500 dark:text-stone-400 mt-2">
          Read {result.read} row{result.read === 1 ? '' : 's'}, inserted {result.inserted} new transaction
          {result.inserted === 1 ? '' : 's'}
          {result.read !== result.inserted ? ` (${result.read - result.inserted} already in your history)` : ''}.
        </p>
      )}
    </section>
  );
}

/**
 * Embedded inside Coverage's "Add purchase" toggle, not a standalone page — the table of actual
 * purchase history is the focus of that merged tab, this is a convenience tucked behind a button
 * rather than the first thing on the page. `onChanged` re-runs whatever the host page uses to
 * refresh its own data (the coverage summary/table), since an add here changes both.
 */
export default function AddPurchasePanel({ onChanged }: { onChanged: () => void }) {
  const [sites, setSites] = useState<Site[]>([]);
  const [products, setProducts] = useState<WatchlistProduct[]>([]);

  const loadSites = () => {
    sitesApi.list().then(setSites).catch(() => {});
    onChanged();
  };
  const loadProducts = () => {
    watchlistApi.list().then(setProducts).catch(() => {});
  };

  useEffect(() => {
    sitesApi.list().then(setSites).catch(() => {});
    loadProducts();
  }, []);

  return (
    <div className="space-y-4">
      <SinglePurchaseForm sites={sites} products={products} onAdded={loadSites} />
      <ImportForm onImported={loadSites} />
    </div>
  );
}
