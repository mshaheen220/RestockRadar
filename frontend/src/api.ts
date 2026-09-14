const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export type Importance = 'must_match' | 'preferred' | 'flexible';

export type Criterion = {
  id: number;
  attribute_key: string;
  attribute_value: string;
  importance: Importance;
};

export type Alias = {
  id: number;
  raw_product_name: string;
  raw_product_id: string | null;
  site_id: number;
  site_name: string;
};

export type MatchSuggestion = {
  site_id: number;
  site_name: string;
  raw_product_name: string;
  transaction_count: number;
  score: number;
  matched_preferred: string[];
  missing_preferred: string[];
};

export type Choice = {
  id: number;
  rank: number;
  label: string;
  site_name: string | null;
  url: string | null;
  image_url: string | null;
  price: number | null;
  price_currency: string | null;
  price_captured_at: string | null;
  quantity: number | null;
};

export type WatchlistProduct = {
  id: number;
  display_name: string;
  stated_rate: string | null;
  unit_label: string | null;
  target_unit_price: number | null;
  active: number;
  criteria: Criterion[];
  aliases: Alias[];
  choices: Choice[];
};

export type CoverageSummary = {
  total_transactions: number;
  linked_transactions: number;
  ignored_transactions: number;
  unmatched_transactions: number;
  unmatched_distinct_items: number;
  linked_ratio: number;
};

export type CoverageStatus = 'linked' | 'unmatched' | 'ignored';

export type CoverageItem = {
  site_id: number;
  site_name: string;
  product_name: string;
  transaction_count: number;
  last_purchased: string;
  alias_id: number | null;
  watchlist_product_id: number | null;
  linked_product_name: string | null;
  linked_unit_label: string | null;
  linked_target_unit_price: number | null;
  ignored_at: string | null;
  last_price: number | null;
  last_pack_quantity: number | null;
  last_normalized_unit_price: number | null;
  status: CoverageStatus;
};

export type Site = { id: number; name: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }

  return res.json();
}

export const watchlistApi = {
  list: () => request<WatchlistProduct[]>('/watchlist'),
  create: (input: { display_name: string; stated_rate?: string | null; unit_label?: string | null }) =>
    request<WatchlistProduct>('/watchlist', { method: 'POST', body: JSON.stringify(input) }),
  update: (
    id: number,
    fields: Partial<Pick<WatchlistProduct, 'display_name' | 'stated_rate' | 'unit_label' | 'target_unit_price' | 'active'>>,
  ) =>
    request<WatchlistProduct>(`/watchlist/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  remove: (id: number) => request<{ deleted: number }>(`/watchlist/${id}`, { method: 'DELETE' }),
  addCriterion: (id: number, input: { attribute_key: string; attribute_value: string; importance: Importance }) =>
    request<WatchlistProduct>(`/watchlist/${id}/criteria`, { method: 'POST', body: JSON.stringify(input) }),
  removeCriterion: (id: number, criterionId: number) =>
    request<WatchlistProduct>(`/watchlist/${id}/criteria/${criterionId}`, { method: 'DELETE' }),
  removeAlias: (id: number, aliasId: number) =>
    request<WatchlistProduct>(`/watchlist/${id}/aliases/${aliasId}`, { method: 'DELETE' }),
  setChoice: (
    id: number,
    input: {
      rank: number;
      label: string;
      site_name?: string | null;
      url?: string | null;
      image_url?: string | null;
      price?: number | null;
      price_currency?: string | null;
      quantity?: number | null;
    },
  ) => request<WatchlistProduct>(`/watchlist/${id}/choices`, { method: 'POST', body: JSON.stringify(input) }),
  removeChoice: (id: number, rank: number) =>
    request<WatchlistProduct>(`/watchlist/${id}/choices/${rank}`, { method: 'DELETE' }),
  matchSuggestions: (id: number) => request<MatchSuggestion[]>(`/watchlist/${id}/match-suggestions`),
  acceptSuggestion: (id: number, input: { site_name: string; raw_product_name: string }) =>
    request<WatchlistProduct>(`/watchlist/${id}/match-suggestions/accept`, { method: 'POST', body: JSON.stringify(input) }),
  rejectSuggestion: (id: number, input: { site_name: string; raw_product_name: string }) =>
    request<{ rejected: boolean }>(`/watchlist/${id}/match-suggestions/reject`, { method: 'POST', body: JSON.stringify(input) }),
};

export const coverageApi = {
  summary: () => request<CoverageSummary>('/coverage/summary'),
  items: (params: { limit: number; offset: number; status?: CoverageStatus; search?: string; siteId?: number }) => {
    const query = new URLSearchParams({ limit: String(params.limit), offset: String(params.offset) });
    if (params.status) query.set('status', params.status);
    if (params.search) query.set('search', params.search);
    if (params.siteId) query.set('site_id', String(params.siteId));
    return request<{ items: CoverageItem[]; total: number }>(`/coverage/items?${query}`);
  },
  ignore: (input: { site_name: string; raw_product_name: string }) =>
    request<{ ignored: true }>('/coverage/ignore', { method: 'POST', body: JSON.stringify(input) }),
  unignore: (input: { site_name: string; raw_product_name: string }) =>
    request<{ ignored: false }>('/coverage/ignore', { method: 'DELETE', body: JSON.stringify(input) }),
};

export const sitesApi = {
  list: () => request<Site[]>('/sites'),
};

export const previewApi = {
  fetch: (url: string) =>
    request<{ title: string | null; image: string | null; price: number | null; currency: string | null; quantity: number | null }>(
      `/product-preview?url=${encodeURIComponent(url)}`,
    ),
};
