const DEFAULT_BACKEND_URL = 'http://localhost:8734/api';

/**
 * Runs inside the active page's own context (via chrome.scripting.executeScript), so it sees
 * whatever actually rendered in the user's real browser session — the same reason this approach
 * isn't blocked the way a server-side fetch of the same URL would be. Mirrors the metadata the
 * backend's ProductPreviewFetcher reads (Open Graph tags, schema.org Product JSON-LD).
 */
function extractProductInfo() {
  function metaContent(property) {
    const el = document.querySelector(`meta[property="${property}"]`) || document.querySelector(`meta[name="${property}"]`);
    return el ? el.getAttribute('content') : null;
  }

  function toFloatOrNull(value) {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    const cleaned = String(value).replace(/[^0-9.]/g, '');
    return cleaned === '' ? null : parseFloat(cleaned);
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

  const price = toFloatOrNull(offer && offer.price) ?? toFloatOrNull(metaContent('product:price:amount'));
  const currency = (offer && offer.priceCurrency) || metaContent('product:price:currency') || null;

  // Schema.org has no standard "pack size" field, so this is a best-effort guess from the title
  // text — covers both count-style packaging ("24 Count") and size/weight units ("52 oz"), since
  // "quantity" means "how many of the product's own unit" either way. Mirrors
  // ProductPreviewFetcher::guessQuantity() in the backend.
  let quantity = null;
  if (title) {
    const match = title.match(
      /(\d+(?:\.\d+)?)\s*-?\s*(?:count|ct|pack|pk|capsules?|pods?|rolls?|sheets?|bags?|cans?|bottles?|fl\.?\s*oz|oz|lbs?|kg|g|ml|l)\b/i,
    );
    if (match) quantity = parseFloat(match[1]);
  }

  return {
    title: title || null,
    image: image || null,
    price,
    currency,
    quantity,
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

    select.innerHTML = '';
    for (const p of products) {
      const option = document.createElement('option');
      option.value = String(p.id);
      option.textContent = p.display_name;
      select.appendChild(option);
    }
    if (products.length === 0) {
      select.innerHTML = '<option value="">No watchlist items yet</option>';
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
