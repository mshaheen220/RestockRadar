const DEFAULT_BACKEND_URL = 'http://localhost:8734/api';

/**
 * Runs inside the active page's own context (via chrome.scripting.executeScript), so it sees
 * whatever actually rendered in the user's real browser session — the same reason this approach
 * isn't blocked the way a server-side fetch of the same URL would be. Mirrors the metadata the
 * backend's ProductPreviewFetcher reads: Open Graph tags, schema.org Product JSON-LD, and
 * schema.org microdata (`itemprop="price"` etc.) — the last one confirmed necessary on Walmart,
 * whose price only shows up this way on at least some product page templates.
 *
 * Every helper this needs is nested INSIDE this function, not at module scope — chrome.scripting.
 * executeScript's `func` option serializes and re-invokes only this one function in the page's
 * own isolated world; it can't close over anything declared elsewhere in this file.
 */
function extractProductInfo() {
  function metaContent(property) {
    const el = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
    return el ? el.getAttribute('content') : null;
  }

  // schema.org microdata: `<span itemprop="price">$4.67</span>` (value in the element's own
  // text) or `<meta itemprop="price" content="4.67">` (value in a `content` attribute instead).
  function itemPropContent(itemprop) {
    const el = document.querySelector(`[itemprop="${itemprop}"]`);
    if (!el) return null;
    return el.getAttribute('content') || el.textContent;
  }

  function toFloatOrNull(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    return cleaned === '' ? null : parseFloat(cleaned);
  }

  // Mirrors backend/src/Analysis/PackQuantity.php::guess() exactly — see that file for the
  // reasoning behind each pattern (the leading/trailing multiplier handling in particular).
  // Kept in sync by hand since this can't share code with the backend.
  const UNIT_MAP = {
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
  const VOLUME_UNITS = new Set(['floz', 'ml', 'l', 'gal']);
  const WEIGHT_UNITS = new Set(['oz', 'lb', 'kg', 'g']);
  const UNIT_WORDS =
    'count|ct|pack|pk|capsules?|pods?|rolls?|sheets?|bags?|cans?|bottles?' +
    '|fl\\.?\\s*oz|oz|lbs?|kg|gal(?:lons?)?|liters?|kilograms?|grams?|milliliters?|g|ml|l';
  const MAIN_PATTERN = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*-?\\s*(${UNIT_WORDS})\\b`, 'i');
  const SUFFIX_MULTIPLIER_OF_PATTERN = /(?:pack|case) of (\d+)/i;
  const SUFFIX_MULTIPLIER_BARE_PATTERN = /(\d+)\s*-?\s*(?:count|ct|pack|pk|cans?|bottles?|rolls?|sheets?|bags?|capsules?|pods?)\b/i;
  const LEADING_MULTIPLIER_PATTERN = /^\(\s*(\d+)\s*-?\s*pack\s*\)\s*/i;

  function normalizeUnit(raw) {
    const key = raw.trim().toLowerCase().replace(/\s+/g, ' ');
    return UNIT_MAP[key] ?? key;
  }

  function guessPackQuantity(text) {
    let leadingMultiplier = 1;
    const leading = text.match(LEADING_MULTIPLIER_PATTERN);
    if (leading) {
      leadingMultiplier = parseFloat(leading[1]);
      text = text.slice(leading[0].length);
    }

    const m = text.match(MAIN_PATTERN);
    if (!m) {
      // No per-item size anywhere in the title for "Pack of N" to multiply — standing alone, it
      // still just means N of these. Not extended to spelled-out counts ("Three Pack", "Single")
      // — see PackQuantity.php's guess() docblock for why.
      const standalone = text.match(SUFFIX_MULTIPLIER_OF_PATTERN);
      return standalone ? { quantity: parseFloat(standalone[1]) * leadingMultiplier, unit: 'ct' } : null;
    }

    let quantity = parseFloat(m[1]) * leadingMultiplier;
    const unit = normalizeUnit(m[2]);

    const remainder = text.slice(m.index + m[0].length);
    const mainUnitIsSize = VOLUME_UNITS.has(unit) || WEIGHT_UNITS.has(unit);

    const ofMatch = remainder.match(SUFFIX_MULTIPLIER_OF_PATTERN);
    const bareMatch = mainUnitIsSize ? remainder.match(SUFFIX_MULTIPLIER_BARE_PATTERN) : null;
    if (ofMatch) {
      quantity *= parseFloat(ofMatch[1]);
    } else if (bareMatch) {
      quantity *= parseFloat(bareMatch[1]);
    }

    return { quantity, unit };
  }

  let jsonLdProduct = null;
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data) ? data : data['@graph'] || [data];
      const found = candidates.find((entry) => entry && entry['@type'] === 'Product');
      if (found) {
        jsonLdProduct = found;
        break;
      }
    } catch {
      // Malformed JSON-LD on the page — skip it, not our problem to fix.
    }
  }

  const title = metaContent('og:title') || (jsonLdProduct && jsonLdProduct.name) || document.title;

  let image = metaContent('og:image');
  if (!image && jsonLdProduct && jsonLdProduct.image) {
    const img = jsonLdProduct.image;
    image = Array.isArray(img) ? img[0] : img.url || img;
  }

  let offer = jsonLdProduct && jsonLdProduct.offers;
  if (Array.isArray(offer)) offer = offer[0];

  const price =
    toFloatOrNull(offer && offer.price) ?? toFloatOrNull(metaContent('product:price:amount')) ?? toFloatOrNull(itemPropContent('price'));
  const currency =
    (offer && offer.priceCurrency) || metaContent('product:price:currency') || itemPropContent('priceCurrency') || null;

  const guess = title ? guessPackQuantity(title) : null;

  return {
    title: title || null,
    image: image || null,
    price,
    currency,
    quantity: guess ? guess.quantity : null,
    quantityUnit: guess ? guess.unit : null,
    url: location.href,
    hostname: location.hostname,
  };
}

async function getBackendUrl() {
  const { backendUrl } = await chrome.storage.local.get('backendUrl');
  return backendUrl || DEFAULT_BACKEND_URL;
}

function setStatus(message, kind) {
  const el = document.getElementById('status');
  el.textContent = message;
  el.className = kind || '';
}

async function loadProducts(backendUrl) {
  const select = document.getElementById('product');
  try {
    const res = await fetch(`${backendUrl}/watchlist`);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const products = await res.json();

    if (products.length === 0) {
      select.innerHTML = '<option value="">No watchlist items yet</option>';
      return;
    }

    // No option here is ever pre-selected on purpose — nothing on the page tells us which
    // watchlist item this product actually belongs to, so the default has to be "nothing," not
    // whichever item happens to load first. Without this, the browser would default the select
    // to its first real option, and the "pick something" check below would never be able to fire.
    select.innerHTML = '<option value="">Choose a watchlist item…</option>';
    for (const p of products) {
      const option = document.createElement('option');
      option.value = String(p.id);
      option.textContent = p.display_name;
      select.appendChild(option);
    }
  } catch (err) {
    select.innerHTML = '<option value="">Could not load watchlist</option>';
    setStatus(`Couldn't reach RestockRadar at ${backendUrl} — check the backend settings below.`, 'error');
  }
}

async function init() {
  const backendUrl = await getBackendUrl();
  document.getElementById('backend-url').value = backendUrl;

  loadProducts(backendUrl);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractProductInfo });

  document.getElementById('preview-title').textContent = result.title || '(no title found on this page)';
  document.getElementById('preview-url').textContent = result.url;
  document.getElementById('label').value = result.title || '';
  if (result.price != null) document.getElementById('price').value = result.price;
  if (result.currency) document.getElementById('currency').value = result.currency;
  if (result.quantity != null) document.getElementById('quantity').value = result.quantity;
  if (result.quantityUnit) document.getElementById('quantity-unit').value = result.quantityUnit;

  if (result.image) {
    const img = document.getElementById('preview-image');
    img.src = result.image;
    img.hidden = false;
  }

  document.getElementById('save').addEventListener('click', async () => {
    const productId = document.getElementById('product').value;
    const rank = Number(document.getElementById('rank').value);
    const label = document.getElementById('label').value.trim();
    const priceInput = document.getElementById('price').value.trim();
    const currency = document.getElementById('currency').value.trim();
    const quantityInput = document.getElementById('quantity').value.trim();
    const quantityUnitInput = document.getElementById('quantity-unit').value.trim();

    if (!productId) {
      setStatus('Pick a watchlist item first.', 'error');
      return;
    }
    if (!label) {
      setStatus('Product name is required.', 'error');
      return;
    }

    const saveButton = document.getElementById('save');
    saveButton.disabled = true;
    setStatus('Saving…', '');

    try {
      const currentBackendUrl = await getBackendUrl();
      const res = await fetch(`${currentBackendUrl}/watchlist/${productId}/choices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rank,
          label,
          site_name: result.hostname,
          url: result.url,
          image_url: result.image,
          price: priceInput ? Number(priceInput) : null,
          price_currency: currency || null,
          quantity: quantityInput ? Number(quantityInput) : null,
          quantity_unit: quantityUnitInput || null,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `${res.status} ${res.statusText}`);
      }

      setStatus('Saved!', 'success');
    } catch (err) {
      setStatus(err.message, 'error');
    } finally {
      saveButton.disabled = false;
    }
  });

  document.getElementById('save-settings').addEventListener('click', async () => {
    const url = document.getElementById('backend-url').value.trim().replace(/\/$/, '');
    await chrome.storage.local.set({ backendUrl: url });
    setStatus('Backend URL saved.', 'success');
    loadProducts(url);
  });
}

init();
