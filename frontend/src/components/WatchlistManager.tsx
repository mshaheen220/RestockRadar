import { useEffect, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import {
  previewApi,
  watchlistApi,
  type Choice,
  type ChoiceEvaluation,
  type Importance,
  type MatchSuggestion,
  type PriceStats,
  type WatchlistProduct,
} from '../api';
import {
  daysSince,
  formatMoney,
  isStalePrice,
  normalizeUnit,
  stripSiteSuffix,
  unitPriceBadge,
  unitPriceBadgeClass,
  unitsComparable,
} from '../priceUtils';
import RankBadge, { SLOT_LABEL } from './RankBadge';
import SiteIcon from './SiteIcon';

const IMPORTANCE_LABEL: Record<Importance, string> = {
  must_match: 'Must match',
  preferred: 'Preferred',
  flexible: 'Flexible / just noting',
};

function CriteriaEditor({ product, onChange }: { product: WatchlistProduct; onChange: () => void }) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [importance, setImportance] = useState<Importance>('preferred');
  const [error, setError] = useState<string | null>(null);

  const addCriterion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || !value.trim()) return;

    try {
      await watchlistApi.addCriterion(product.id, { attribute_key: key.trim(), attribute_value: value.trim(), importance });
      setKey('');
      setValue('');
      setImportance('preferred');
      setError(null);
      onChange();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeCriterion = async (criterionId: number) => {
    await watchlistApi.removeCriterion(product.id, criterionId);
    onChange();
  };

  return (
    <div className="mt-3 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        What matters about this product
      </h4>

      {product.criteria.length === 0 && (
        <p className="text-sm text-stone-500 dark:text-stone-400">Nothing specific yet — any option is fine.</p>
      )}

      <ul className="flex flex-wrap gap-2">
        {product.criteria.map((c) => (
          <li
            key={c.id}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 dark:bg-brand-800/40 border border-brand-300 dark:border-brand-600 px-2.5 py-1 text-xs"
          >
            <span className="font-medium">{c.attribute_key}:</span> {c.attribute_value}
            <span className="text-stone-500 dark:text-stone-400">({IMPORTANCE_LABEL[c.importance]})</span>
            <button
              type="button"
              onClick={() => removeCriterion(c.id)}
              aria-label={`Remove ${c.attribute_key} criterion`}
              title="Remove"
              className="text-stone-400 hover:text-red-600 ml-0.5"
            >
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={addCriterion} className="flex flex-wrap gap-2 items-end">
        <div>
          <label htmlFor={`crit-key-${product.id}`} className="block text-xs text-stone-500 dark:text-stone-400">
            Attribute
          </label>
          <input
            id={`crit-key-${product.id}`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="brand, variety, dietary…"
            className="w-32 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor={`crit-value-${product.id}`} className="block text-xs text-stone-500 dark:text-stone-400">
            Value
          </label>
          <input
            id={`crit-value-${product.id}`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Donut Shop"
            className="w-40 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label htmlFor={`crit-importance-${product.id}`} className="block text-xs text-stone-500 dark:text-stone-400">
            Importance
          </label>
          <select
            id={`crit-importance-${product.id}`}
            value={importance}
            onChange={(e) => setImportance(e.target.value as Importance)}
            className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          >
            {Object.entries(IMPORTANCE_LABEL).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5"
        >
          Add
        </button>
      </form>
      {error && <p className="text-red-600 text-sm">{error}</p>}
    </div>
  );
}

const ALIASES_COLLAPSED_COUNT = 5;

function MatchReview({ product, onChange }: { product: WatchlistProduct; onChange: () => void }) {
  const [suggestions, setSuggestions] = useState<MatchSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllAliases, setShowAllAliases] = useState(false);

  const loadSuggestions = () => {
    setLoading(true);
    setError(null);
    watchlistApi
      .matchSuggestions(product.id)
      .then(setSuggestions)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  };

  const removeAlias = async (aliasId: number) => {
    await watchlistApi.removeAlias(product.id, aliasId);
    onChange();
  };

  const accept = async (s: MatchSuggestion) => {
    await watchlistApi.acceptSuggestion(product.id, { site_name: s.site_name, raw_product_name: s.raw_product_name });
    setSuggestions((prev) => prev?.filter((x) => !(x.site_id === s.site_id && x.raw_product_name === s.raw_product_name)) ?? null);
    onChange();
  };

  const reject = async (s: MatchSuggestion) => {
    await watchlistApi.rejectSuggestion(product.id, { site_name: s.site_name, raw_product_name: s.raw_product_name });
    setSuggestions((prev) => prev?.filter((x) => !(x.site_id === s.site_id && x.raw_product_name === s.raw_product_name)) ?? null);
  };

  return (
    <div className="mt-3 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Purchase history matches
      </h4>

      {product.aliases.length === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Not linked to any purchase history yet.
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {(showAllAliases ? product.aliases : product.aliases.slice(0, ALIASES_COLLAPSED_COUNT)).map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-2 text-sm rounded border border-stone-200 dark:border-stone-700 px-2 py-1"
              >
                <span className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 rounded px-1.5 py-0.5">
                  <SiteIcon name={a.site_name} />
                  {a.site_name}
                </span>
                <span className="flex-1 min-w-0">{a.raw_product_name}</span>
                <button
                  type="button"
                  onClick={() => removeAlias(a.id)}
                  aria-label={`Unlink ${a.raw_product_name}`}
                  title="Unlink"
                  className="shrink-0 p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="flex flex-col items-start gap-1.5">
        {product.aliases.length > ALIASES_COLLAPSED_COUNT && (
          <button
            type="button"
            onClick={() => setShowAllAliases((v) => !v)}
            className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline"
          >
            {showAllAliases ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {showAllAliases ? 'Show fewer' : `Show all ${product.aliases.length}`}
          </button>
        )}

        {suggestions === null && (
          <button
            type="button"
            onClick={loadSuggestions}
            disabled={loading}
            className="inline-flex items-center gap-1 text-sm text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-60"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            {loading ? 'Looking…' : 'Find matches in purchase history'}
          </button>
        )}
      </div>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {suggestions !== null && (
        <div className="space-y-1">
          {suggestions.length === 0 && (
            <p className="text-sm text-stone-500 dark:text-stone-400">No likely matches found.</p>
          )}
          <ul className="space-y-1">
            {suggestions.map((s) => (
              <li
                key={`${s.site_id}-${s.raw_product_name}`}
                className="flex items-center justify-between gap-2 text-sm rounded border border-stone-200 dark:border-stone-700 px-2 py-1"
              >
                <span>
                  <span className="inline-flex items-center gap-1 text-stone-500 dark:text-stone-400">
                    <SiteIcon name={s.site_name} />
                    {s.site_name}:
                  </span>{' '}
                  {s.raw_product_name}{' '}
                  <span className="text-stone-400 dark:text-stone-500">
                    ({s.transaction_count}× · {Math.round(s.score * 100)}% match)
                  </span>
                </span>
                <span className="flex gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => accept(s)}
                    aria-label={`Accept match: ${s.raw_product_name}`}
                    title="Accept match"
                    className="p-1.5 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800/40"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(s)}
                    aria-label={`Dismiss match: ${s.raw_product_name}`}
                    title="Dismiss match"
                    className="p-1.5 rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                  >
                    <X size={16} />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <button type="button" onClick={loadSuggestions} disabled={loading} className="text-sm text-brand-600 dark:text-brand-400 hover:underline">
            {loading ? 'Looking…' : 'Refresh matches'}
          </button>
        </div>
      )}
    </div>
  );
}

function ChoiceSlotForm({
  productId,
  rank,
  existing,
  unitLabel,
  onDone,
}: {
  productId: number;
  rank: number;
  existing?: Choice;
  unitLabel: string | null;
  onDone: () => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? '');
  const [siteName, setSiteName] = useState(existing?.site_name ?? '');
  const [url, setUrl] = useState(existing?.url ?? '');
  const [image, setImage] = useState<string | null>(existing?.image_url ?? null);
  const [price, setPrice] = useState(existing?.price != null ? String(existing.price) : '');
  const [priceCurrency, setPriceCurrency] = useState(existing?.price_currency ?? '');
  const [quantity, setQuantity] = useState(existing?.quantity != null ? String(existing.quantity) : '');
  const [quantityUnit, setQuantityUnit] = useState(existing?.quantity_unit ?? '');
  const [error, setError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchDetails = async () => {
    if (!url.trim()) return;
    setFetching(true);
    setFetchError(null);
    try {
      const result = await previewApi.fetch(url.trim());
      if (result.title) {
        setLabel(result.title);
      } else {
        setFetchError("Couldn't find a product name on that page.");
      }
      setImage(result.image);
      if (result.price != null) setPrice(String(result.price));
      if (result.currency) setPriceCurrency(result.currency);
      if (result.quantity != null) setQuantity(String(result.quantity));
      if (result.quantity_unit) setQuantityUnit(result.quantity_unit);
    } catch (err) {
      setFetchError((err as Error).message);
    } finally {
      setFetching(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    const parsedPrice = price.trim() ? Number(price) : null;
    if (price.trim() && Number.isNaN(parsedPrice)) {
      setError('Price must be a number.');
      return;
    }

    const parsedQuantity = quantity.trim() ? Number(quantity) : null;
    if (quantity.trim() && Number.isNaN(parsedQuantity)) {
      setError('Quantity must be a number.');
      return;
    }

    try {
      await watchlistApi.setChoice(productId, {
        rank,
        label: label.trim(),
        site_name: siteName.trim() || null,
        url: url.trim() || null,
        image_url: image,
        price: parsedPrice,
        price_currency: priceCurrency.trim() || null,
        quantity: parsedQuantity,
        quantity_unit: quantityUnit.trim() || null,
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const unitPricePreview = (() => {
    const p = price.trim() ? Number(price) : null;
    const q = quantity.trim() ? Number(quantity) : null;
    if (p == null || q == null || Number.isNaN(p) || Number.isNaN(q) || q === 0) return null;
    return `${(p / q).toFixed(3)}${unitLabel ? `/${unitLabel}` : '/unit'}`;
  })();

  return (
    <form onSubmit={save} className="flex flex-wrap gap-2 items-end p-2 rounded border border-dashed border-brand-300 dark:border-brand-700">
      <div>
        <label htmlFor={`choice-label-${productId}-${rank}`} className="block text-xs text-stone-500 dark:text-stone-400">
          Product name
        </label>
        <input
          id={`choice-label-${productId}-${rank}`}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Planet Oat Original Oatmilk, 52 oz"
          autoFocus
          required
          className="w-56 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`choice-site-${productId}-${rank}`} className="block text-xs text-stone-500 dark:text-stone-400">
          Site (optional)
        </label>
        <input
          id={`choice-site-${productId}-${rank}`}
          value={siteName}
          onChange={(e) => setSiteName(e.target.value)}
          placeholder="Walmart…"
          className="w-28 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`choice-url-${productId}-${rank}`} className="block text-xs text-stone-500 dark:text-stone-400">
          Link (optional)
        </label>
        <div className="flex items-center gap-1">
          <input
            id={`choice-url-${productId}-${rank}`}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-40 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={fetchDetails}
            disabled={!url.trim() || fetching}
            aria-label="Fetch product name, image, price, and quantity from this link"
            title="Fetch product name, image, price, and quantity from this link"
            className="shrink-0 p-1.5 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800/40 disabled:opacity-40"
          >
            {fetching ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          </button>
        </div>
      </div>
      <div>
        <label htmlFor={`choice-price-${productId}-${rank}`} className="block text-xs text-stone-500 dark:text-stone-400">
          Price (optional)
        </label>
        <input
          id={`choice-price-${productId}-${rank}`}
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="4.48"
          className="w-20 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`choice-currency-${productId}-${rank}`} className="block text-xs text-stone-500 dark:text-stone-400">
          Currency
        </label>
        <input
          id={`choice-currency-${productId}-${rank}`}
          value={priceCurrency}
          onChange={(e) => setPriceCurrency(e.target.value)}
          placeholder="USD"
          className="w-16 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`choice-quantity-${productId}-${rank}`} className="block text-xs text-stone-500 dark:text-stone-400">
          Quantity{unitLabel ? ` (${unitLabel})` : ''}
        </label>
        <input
          id={`choice-quantity-${productId}-${rank}`}
          type="number"
          step="any"
          min="0"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder={unitLabel === 'ct' ? '80' : '52'}
          className="w-20 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`choice-quantity-unit-${productId}-${rank}`} className="block text-xs text-stone-500 dark:text-stone-400">
          Unit captured in
        </label>
        <input
          id={`choice-quantity-unit-${productId}-${rank}`}
          value={quantityUnit}
          onChange={(e) => setQuantityUnit(e.target.value)}
          placeholder="fl oz, ct, l…"
          title="The literal unit this quantity is in — a case of 12oz cans and a 2-liter bottle both just have 'a quantity' without this"
          className="w-24 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        />
      </div>
      {unitPricePreview && (
        <span className="text-xs text-stone-500 dark:text-stone-400 pb-1.5">= {unitPricePreview}</span>
      )}
      {quantityUnit.trim() && unitLabel && !unitsComparable(normalizeUnit(quantityUnit), normalizeUnit(unitLabel)) && (
        <span
          className="text-xs text-amber-700 dark:text-amber-400 pb-1.5"
          title={`This product's unit is "${unitLabel}" — a quantity captured in "${quantityUnit}" can't be converted into that, so this choice won't get a unit-price comparison`}
        >
          ⚠ doesn't convert to "{unitLabel}"
        </span>
      )}
      {image && <img src={image} alt="" className="w-10 h-10 object-cover rounded border border-stone-200 dark:border-stone-700" />}
      <button type="submit" className="rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5">
        Save
      </button>
      <button type="button" onClick={onDone} className="text-sm px-2 py-1.5 text-stone-500">
        Cancel
      </button>
      {fetchError && <p className="text-stone-500 text-sm w-full">{fetchError}</p>}
      {error && <p className="text-red-600 text-sm w-full">{error}</p>}
    </form>
  );
}

function formatPrice(choice: Choice): string | null {
  if (choice.price == null) return null;
  return formatMoney(choice.price, choice.price_currency);
}

function unitPriceInfo(choice: Choice, product: WatchlistProduct) {
  return unitPriceBadge({
    price: choice.price,
    quantity: choice.quantity,
    currency: choice.price_currency,
    unitLabel: product.unit_label,
    quantityUnit: choice.quantity_unit,
    targetUnitPrice: product.target_unit_price,
  });
}

function PreferredProducts({ product, onChange }: { product: WatchlistProduct; onChange: () => void }) {
  const [editingRank, setEditingRank] = useState<number | null>(null);
  const byRank = new Map(product.choices.map((c) => [c.rank, c]));

  const remove = async (rank: number) => {
    await watchlistApi.removeChoice(product.id, rank);
    onChange();
  };

  return (
    <div className="mt-3 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Preferred products
      </h4>

      <ul className="space-y-1">
        {[1, 2, 3, 4, 5].map((rank) => {
          const choice = byRank.get(rank);

          if (editingRank === rank) {
            return (
              <li key={rank}>
                <ChoiceSlotForm
                  productId={product.id}
                  rank={rank}
                  existing={choice}
                  unitLabel={product.unit_label}
                  onDone={() => {
                    setEditingRank(null);
                    onChange();
                  }}
                />
              </li>
            );
          }

          return (
            <li
              key={rank}
              className="flex items-center gap-2 text-sm rounded border border-stone-200 dark:border-stone-700 px-2 py-1"
            >
              <RankBadge rank={rank} />

              {choice ? (
                <>
                  {choice.image_url && (
                    <img
                      src={choice.image_url}
                      alt=""
                      className="shrink-0 w-8 h-8 object-cover rounded border border-stone-200 dark:border-stone-700"
                    />
                  )}
                  <span className="flex-1 min-w-0" title={choice.label}>
                    {stripSiteSuffix(choice.label)}
                    {choice.site_name && (
                      <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
                        <SiteIcon name={choice.site_name} />({choice.site_name})
                      </span>
                    )}
                    {formatPrice(choice) && (
                      <span
                        className="ml-1.5 text-xs font-medium text-brand-700 dark:text-brand-400"
                        title={choice.price_captured_at ? `Captured ${choice.price_captured_at}` : undefined}
                      >
                        {formatPrice(choice)}
                      </span>
                    )}
                    {isStalePrice(choice.price_captured_at) && (
                      <span
                        className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                        title={`Captured ${choice.price_captured_at} — recheck via the wand button or the browser extension`}
                      >
                        stale · {daysSince(choice.price_captured_at as string)}d
                      </span>
                    )}
                    {(() => {
                      const unitInfo = unitPriceInfo(choice, product);
                      if (!unitInfo) return null;
                      return (
                        <span
                          className={'ml-1.5 text-xs px-1.5 py-0.5 rounded ' + unitPriceBadgeClass(unitInfo.isGoodDeal)}
                          title={
                            product.target_unit_price != null
                              ? `Target: ${product.target_unit_price}${product.unit_label ? `/${product.unit_label}` : ''}`
                              : 'Set a target unit price on this product to flag good deals'
                          }
                        >
                          {unitInfo.text}
                        </span>
                      );
                    })()}
                  </span>
                  {choice.url && (
                    <a
                      href={choice.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open product page for ${choice.label}`}
                      title="Open product page"
                      className="shrink-0 p-1 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800/40"
                    >
                      <ExternalLink size={14} />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditingRank(rank)}
                    aria-label={`Edit ${SLOT_LABEL[rank]}`}
                    title="Edit"
                    className="shrink-0 p-1 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800/40"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(rank)}
                    aria-label={`Remove ${SLOT_LABEL[rank]}`}
                    title="Remove"
                    className="shrink-0 p-1 rounded text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <X size={14} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingRank(rank)}
                  className="flex-1 flex items-center gap-1 text-stone-400 dark:text-stone-500 hover:text-brand-600 dark:hover:text-brand-400"
                >
                  <Plus size={14} /> Add
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const VERDICT_CLASS: Record<ChoiceEvaluation['verdict'], string> = {
  all_time_low: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  good_deal: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  normal: 'text-stone-400 dark:text-stone-500',
  insufficient_history: 'text-stone-400 dark:text-stone-500',
};

function PriceHistory({ product }: { product: WatchlistProduct }) {
  const [data, setData] = useState<{ stats: PriceStats; choice_evaluations: ChoiceEvaluation[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    watchlistApi
      .priceStats(product.id)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [product.id]);

  if (error) {
    return <p className="text-red-600 text-sm">Couldn't load price history: {error}</p>;
  }
  if (!data) {
    return null;
  }

  const { stats, choice_evaluations } = data;
  const unit = product.unit_label ? `/${product.unit_label}` : '';

  return (
    <div className="mt-3 space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        Price history
      </h4>

      {stats.sample_size === 0 ? (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          No purchase history with a computed unit price yet for this product.
        </p>
      ) : (
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-xs text-stone-500 dark:text-stone-400">All-time low</dt>
            <dd className="font-medium">${stats.min_unit_price?.toFixed(3)}{unit}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500 dark:text-stone-400">Recent average</dt>
            <dd className="font-medium">${stats.rolling_avg_unit_price?.toFixed(3)}{unit}</dd>
          </div>
          <div>
            <dt className="text-xs text-stone-500 dark:text-stone-400">Last purchase</dt>
            <dd className="font-medium">
              ${stats.last_purchase_unit_price?.toFixed(3)}{unit}
              <span className="ml-1 text-xs text-stone-400 dark:text-stone-500">({stats.last_purchase_date})</span>
            </dd>
          </div>
        </dl>
      )}

      {choice_evaluations.length > 0 && (
        <ul className="space-y-1">
          {choice_evaluations.map((e) => (
            <li key={e.rank} className="flex items-center gap-2 text-sm">
              <span className="truncate flex-1 min-w-0">{e.label}</span>
              {e.comparable ? (
                <span className={'shrink-0 text-xs px-1.5 py-0.5 rounded ' + VERDICT_CLASS[e.verdict]}>
                  {e.message ?? (e.verdict === 'insufficient_history' ? 'Not enough history yet' : 'Typical price')}
                </span>
              ) : (
                <span
                  className="shrink-0 text-xs px-1.5 py-0.5 rounded text-amber-700 dark:text-amber-400"
                  title={`Captured in "${e.quantity_unit}", which doesn't convert into this product's history — can't compare`}
                >
                  unit mismatch
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductRow({ product, onChange }: { product: WatchlistProduct; onChange: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(product.display_name);
  const [unitLabel, setUnitLabel] = useState(product.unit_label ?? '');
  const [targetUnitPrice, setTargetUnitPrice] = useState(
    product.target_unit_price != null ? String(product.target_unit_price) : '',
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  const mainChoice = product.choices.find((c) => c.rank === 1);

  const save = async () => {
    const parsedTarget = targetUnitPrice.trim() ? Number(targetUnitPrice) : null;
    if (targetUnitPrice.trim() && Number.isNaN(parsedTarget)) {
      setSaveError('Target unit price must be a number.');
      return;
    }

    await watchlistApi.update(product.id, {
      display_name: displayName,
      unit_label: unitLabel || null,
      target_unit_price: parsedTarget,
    });
    setSaveError(null);
    setEditing(false);
    onChange();
  };

  const toggleActive = async () => {
    await watchlistApi.update(product.id, { active: product.active ? 0 : 1 });
    onChange();
  };

  const remove = async () => {
    if (!confirm(`Remove "${product.display_name}" from the watchlist? This can't be undone.`)) return;
    await watchlistApi.remove(product.id);
    onChange();
  };

  return (
    <li className="rounded-xl border border-brand-200 dark:border-brand-800 bg-white dark:bg-stone-900 p-4">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${product.display_name}`}
          className="mt-1 shrink-0 text-stone-400 hover:text-brand-600 dark:hover:text-brand-400"
        >
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex flex-wrap gap-2 items-end">
              <div>
                <label htmlFor={`name-${product.id}`} className="block text-xs text-stone-500 dark:text-stone-400">
                  Product
                </label>
                <input
                  id={`name-${product.id}`}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label htmlFor={`unit-${product.id}`} className="block text-xs text-stone-500 dark:text-stone-400">
                  Unit
                </label>
                <input
                  id={`unit-${product.id}`}
                  value={unitLabel}
                  onChange={(e) => setUnitLabel(e.target.value)}
                  placeholder="oz, ct…"
                  className="w-20 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
                />
              </div>
              <div>
                <label htmlFor={`target-price-${product.id}`} className="block text-xs text-stone-500 dark:text-stone-400">
                  Good price (per {unitLabel || 'unit'})
                </label>
                <input
                  id={`target-price-${product.id}`}
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  value={targetUnitPrice}
                  onChange={(e) => setTargetUnitPrice(e.target.value)}
                  placeholder="0.35"
                  className="w-24 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
                />
              </div>
              <button type="button" onClick={save} className="rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5">
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="text-sm px-3 py-1.5 text-stone-500">
                Cancel
              </button>
              {saveError && <p className="text-red-600 text-sm w-full">{saveError}</p>}
            </div>
          ) : (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="text-left w-full">
              <h3 className="font-semibold">
                {product.display_name}
                {!product.active && (
                  <span className="ml-2 text-xs font-normal text-stone-400 dark:text-stone-500">(inactive)</span>
                )}
              </h3>
              <p className="text-sm text-stone-500 dark:text-stone-400 truncate">
                {[
                  product.unit_label ? `unit: ${product.unit_label}` : null,
                  product.target_unit_price != null
                    ? `good price: $${product.target_unit_price}/${product.unit_label ?? 'unit'}`
                    : null,
                  `${product.criteria.length} criteria`,
                  `${product.aliases.length} linked`,
                  mainChoice ? `Main: ${stripSiteSuffix(mainChoice.label)}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </button>
          )}
        </div>

        {!editing && (
          <div className="flex gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${product.display_name}`}
              title="Edit"
              className="p-1.5 rounded text-brand-600 dark:text-brand-400 hover:bg-brand-100 dark:hover:bg-brand-800/40"
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              onClick={toggleActive}
              aria-label={product.active ? `Deactivate ${product.display_name}` : `Activate ${product.display_name}`}
              title={product.active ? 'Deactivate' : 'Activate'}
              className="p-1.5 rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
            >
              {product.active ? <PowerOff size={16} /> : <Power size={16} />}
            </button>
            <button
              type="button"
              onClick={remove}
              aria-label={`Remove ${product.display_name}`}
              title="Remove"
              className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )}
      </div>

      {expanded && (
        <div className="mt-2 pl-6 space-y-3">
          <CriteriaEditor product={product} onChange={onChange} />
          <PreferredProducts product={product} onChange={onChange} />
          <PriceHistory product={product} />
          <MatchReview product={product} onChange={onChange} />
        </div>
      )}
    </li>
  );
}

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [unitLabel, setUnitLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    try {
      await watchlistApi.create({
        display_name: displayName.trim(),
        unit_label: unitLabel.trim() || null,
      });
      setDisplayName('');
      setUnitLabel('');
      setError(null);
      onCreated();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form
      onSubmit={submit}
      aria-label="Add a new watchlist product"
      className="rounded-xl border border-dashed border-brand-300 dark:border-brand-700 p-4 flex flex-wrap gap-3 items-end"
    >
      <div>
        <label htmlFor="new-product-name" className="block text-xs text-stone-500 dark:text-stone-400">
          New product name
        </label>
        <input
          id="new-product-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="e.g. Dish soap"
          required
          className="w-48 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        />
      </div>
      <div>
        <label htmlFor="new-product-unit" className="block text-xs text-stone-500 dark:text-stone-400">
          Unit (optional)
        </label>
        <input
          id="new-product-unit"
          value={unitLabel}
          onChange={(e) => setUnitLabel(e.target.value)}
          placeholder="oz, ct…"
          className="w-24 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
        />
      </div>
      <button type="submit" className="rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-1.5">
        Add product
      </button>
      {error && <p className="text-red-600 text-sm w-full">{error}</p>}
    </form>
  );
}

export default function WatchlistManager() {
  const [products, setProducts] = useState<WatchlistProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    watchlistApi
      .list()
      .then(setProducts)
      .catch((err: Error) => setError(err.message));
  };

  useEffect(reload, []);

  return (
    <div className="space-y-4 max-w-3xl">
      <NewProductForm onCreated={reload} />

      {error && <p className="text-red-600 text-sm">Couldn't load watchlist: {error}</p>}
      {products === null && !error && <p className="text-sm text-stone-500 dark:text-stone-400">Loading…</p>}
      {products && products.length === 0 && (
        <p className="text-sm text-stone-500 dark:text-stone-400">No products yet — add one above.</p>
      )}

      <ul className="space-y-4">
        {products?.map((product) => (
          <ProductRow key={product.id} product={product} onChange={reload} />
        ))}
      </ul>
    </div>
  );
}
