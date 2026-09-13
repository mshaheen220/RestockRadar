import { useEffect, useState } from 'react';
import { watchlistApi, type Importance, type WatchlistProduct } from '../api';

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
              className="text-stone-400 hover:text-red-600 ml-0.5"
            >
              ×
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

function ProductRow({ product, onChange }: { product: WatchlistProduct; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(product.display_name);
  const [statedRate, setStatedRate] = useState(product.stated_rate ?? '');
  const [unitLabel, setUnitLabel] = useState(product.unit_label ?? '');

  const save = async () => {
    await watchlistApi.update(product.id, {
      display_name: displayName,
      stated_rate: statedRate || null,
      unit_label: unitLabel || null,
    });
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        {editing ? (
          <div className="flex flex-wrap gap-2 items-end grow">
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
              <label htmlFor={`rate-${product.id}`} className="block text-xs text-stone-500 dark:text-stone-400">
                Stated rate
              </label>
              <input
                id={`rate-${product.id}`}
                value={statedRate}
                onChange={(e) => setStatedRate(e.target.value)}
                placeholder="4/week"
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
            <button type="button" onClick={save} className="rounded bg-brand-500 hover:bg-brand-600 text-white text-sm px-3 py-1.5">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-sm px-3 py-1.5 text-stone-500">
              Cancel
            </button>
          </div>
        ) : (
          <div>
            <h3 className="font-semibold">
              {product.display_name}
              {!product.active && (
                <span className="ml-2 text-xs font-normal text-stone-400 dark:text-stone-500">(inactive)</span>
              )}
            </h3>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {product.stated_rate ?? 'No target rate set'}
              {product.unit_label ? ` · unit: ${product.unit_label}` : ''}
            </p>
          </div>
        )}

        {!editing && (
          <div className="flex gap-2 text-sm">
            <button type="button" onClick={() => setEditing(true)} className="text-brand-600 dark:text-brand-400 hover:underline">
              Edit
            </button>
            <button type="button" onClick={toggleActive} className="text-stone-500 hover:underline">
              {product.active ? 'Deactivate' : 'Activate'}
            </button>
            <button type="button" onClick={remove} className="text-red-600 hover:underline">
              Remove
            </button>
          </div>
        )}
      </div>

      <CriteriaEditor product={product} onChange={onChange} />
    </li>
  );
}

function NewProductForm({ onCreated }: { onCreated: () => void }) {
  const [displayName, setDisplayName] = useState('');
  const [statedRate, setStatedRate] = useState('');
  const [unitLabel, setUnitLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    try {
      await watchlistApi.create({
        display_name: displayName.trim(),
        stated_rate: statedRate.trim() || null,
        unit_label: unitLabel.trim() || null,
      });
      setDisplayName('');
      setStatedRate('');
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
        <label htmlFor="new-product-rate" className="block text-xs text-stone-500 dark:text-stone-400">
          Stated rate (optional)
        </label>
        <input
          id="new-product-rate"
          value={statedRate}
          onChange={(e) => setStatedRate(e.target.value)}
          placeholder="1/week"
          className="w-32 rounded border border-brand-300 dark:border-brand-700 bg-white dark:bg-stone-950 px-2 py-1 text-sm"
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
