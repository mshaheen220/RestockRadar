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

/** The reverse of MatchSuggestion — one raw name, ranked watchlist products it might belong to. */
export type ProductSuggestion = {
  watchlist_product_id: number;
  display_name: string;
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
  quantity_unit: string | null;
};

export type WatchlistProduct = {
  id: number;
  display_name: string;
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
  /** linked / (linked + unmatched) — deliberately excludes ignored items from the denominator,
   * since "ignored" is a resting state you chose, not unfinished work. */
  relevant_linked_ratio: number;
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
  last_quantity: number | null;
  last_pack_quantity: number | null;
  last_normalized_unit_price: number | null;
  last_pack_quantity_source: 'guessed' | 'user' | null;
  status: CoverageStatus;
};

export type Site = { id: number; name: string };

export type PriceStats = {
  sample_size: number;
  min_unit_price: number | null;
  avg_unit_price: number | null;
  rolling_avg_unit_price: number | null;
  last_purchase_unit_price: number | null;
  last_purchase_date: string | null;
};

export type DealVerdict = 'insufficient_history' | 'all_time_low' | 'good_deal' | 'normal';

export type ChoiceEvaluation = {
  rank: number;
  label: string;
  quantity_unit: string | null;
  comparable: boolean;
  unit_price: number;
  verdict: DealVerdict;
  message: string | null;
};

export type DealFinderChoice = {
  rank: number;
  label: string;
  site_name: string | null;
  price: number;
  price_currency: string | null;
  price_captured_at: string | null;
  quantity_unit: string | null;
  comparable: boolean;
  unit_price: number;
  verdict: DealVerdict;
  message: string | null;
};

export type DealFinderProduct = {
  id: number;
  display_name: string;
  unit_label: string | null;
  target_unit_price: number | null;
  stats: PriceStats;
  choices: DealFinderChoice[];
};

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    // Explicit even though the Vite/Caddy proxy makes this same-origin (where the browser would
    // send the session cookie by default anyway) — keeps working if that proxy is ever missing.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error ?? `${res.status} ${res.statusText}`;
    throw Object.assign(new Error(message), { status: res.status });
  }

  return res.json();
}

export const watchlistApi = {
  list: () => request<WatchlistProduct[]>('/watchlist'),
  create: (input: { display_name: string; unit_label?: string | null }) =>
    request<WatchlistProduct>('/watchlist', { method: 'POST', body: JSON.stringify(input) }),
  update: (
    id: number,
    fields: Partial<Pick<WatchlistProduct, 'display_name' | 'unit_label' | 'target_unit_price' | 'active'>>,
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
      quantity_unit?: string | null;
    },
  ) => request<WatchlistProduct>(`/watchlist/${id}/choices`, { method: 'POST', body: JSON.stringify(input) }),
  removeChoice: (id: number, rank: number) =>
    request<WatchlistProduct>(`/watchlist/${id}/choices/${rank}`, { method: 'DELETE' }),
  matchSuggestions: (id: number) => request<MatchSuggestion[]>(`/watchlist/${id}/match-suggestions`),
  acceptSuggestion: (id: number, input: { site_name: string; raw_product_name: string }) =>
    request<WatchlistProduct>(`/watchlist/${id}/match-suggestions/accept`, { method: 'POST', body: JSON.stringify(input) }),
  rejectSuggestion: (id: number, input: { site_name: string; raw_product_name: string }) =>
    request<{ rejected: boolean }>(`/watchlist/${id}/match-suggestions/reject`, { method: 'POST', body: JSON.stringify(input) }),
  priceStats: (id: number) => request<{ stats: PriceStats; choice_evaluations: ChoiceEvaluation[] }>(`/watchlist/${id}/price-stats`),
};

export const purchasesApi = {
  import: (csv: string) => request<{ read: number; inserted: number }>('/purchases/import', { method: 'POST', body: JSON.stringify({ csv }) }),
  addSingle: (input: {
    site_name: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    txn_date?: string | null;
    category?: string | null;
    pack_quantity?: number | null;
    pack_quantity_unit?: string | null;
  }) => request<{ id: number }>('/purchases', { method: 'POST', body: JSON.stringify(input) }),
};

export const dealsApi = {
  finder: () => request<DealFinderProduct[]>('/deal-finder'),
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
  rename: (input: { site_name: string; raw_product_name: string; new_name: string }) =>
    request<{ renamed: true; new_name: string }>('/coverage/rename', { method: 'POST', body: JSON.stringify(input) }),
  setPackQuantity: (input: { site_name: string; raw_product_name: string; pack_quantity: number | null }) =>
    request<{ pack_quantity: number | null }>('/coverage/pack-quantity', { method: 'POST', body: JSON.stringify(input) }),
  correctTransaction: (input: { site_name: string; raw_product_name: string; quantity: number; unit_price: number }) =>
    request<{ corrected: true }>('/coverage/transaction', { method: 'POST', body: JSON.stringify(input) }),
  suggest: (productName: string) =>
    request<ProductSuggestion[]>(`/coverage/suggest?product_name=${encodeURIComponent(productName)}`),
};

export const sitesApi = {
  list: () => request<Site[]>('/sites'),
};

export const previewApi = {
  fetch: (url: string) =>
    request<{
      title: string | null;
      image: string | null;
      price: number | null;
      currency: string | null;
      quantity: number | null;
      quantity_unit: string | null;
    }>(`/product-preview?url=${encodeURIComponent(url)}`),
};

export type Role = 'admin' | 'contributor' | 'viewer';

export type CurrentUser = { id: number; username: string; role: Role };

export type ApiToken = { id: number; label: string | null; created_at: string; last_used_at: string | null };

export type UserAccount = { id: number; username: string; role: Role; active: number; created_at: string };

export const authApi = {
  login: (username: string, password: string) =>
    request<CurrentUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<{ loggedOut: true }>('/auth/logout', { method: 'POST' }),
  me: () => request<CurrentUser>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: true }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  listTokens: () => request<ApiToken[]>('/auth/tokens'),
  createToken: (label: string | null) =>
    request<{ token: string }>('/auth/tokens', { method: 'POST', body: JSON.stringify({ label }) }),
  revokeToken: (id: number) => request<{ revoked: true }>(`/auth/tokens/${id}`, { method: 'DELETE' }),
};

export const usersApi = {
  list: () => request<UserAccount[]>('/users'),
  create: (input: { username: string; password: string; role: Role }) =>
    request<{ id: number }>('/users', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: number, fields: { role?: Role; active?: boolean; password?: string }) =>
    request<{ updated: true }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  remove: (id: number) => request<{ deleted: number }>(`/users/${id}`, { method: 'DELETE' }),
};
