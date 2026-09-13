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

export type WatchlistProduct = {
  id: number;
  display_name: string;
  stated_rate: string | null;
  unit_label: string | null;
  active: number;
  criteria: Criterion[];
  aliases: Alias[];
};

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
  update: (id: number, fields: Partial<Pick<WatchlistProduct, 'display_name' | 'stated_rate' | 'unit_label' | 'active'>>) =>
    request<WatchlistProduct>(`/watchlist/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  remove: (id: number) => request<{ deleted: number }>(`/watchlist/${id}`, { method: 'DELETE' }),
  addCriterion: (id: number, input: { attribute_key: string; attribute_value: string; importance: Importance }) =>
    request<WatchlistProduct>(`/watchlist/${id}/criteria`, { method: 'POST', body: JSON.stringify(input) }),
  removeCriterion: (id: number, criterionId: number) =>
    request<WatchlistProduct>(`/watchlist/${id}/criteria/${criterionId}`, { method: 'DELETE' }),
  removeAlias: (id: number, aliasId: number) =>
    request<WatchlistProduct>(`/watchlist/${id}/aliases/${aliasId}`, { method: 'DELETE' }),
  matchSuggestions: (id: number) => request<MatchSuggestion[]>(`/watchlist/${id}/match-suggestions`),
  acceptSuggestion: (id: number, input: { site_name: string; raw_product_name: string }) =>
    request<WatchlistProduct>(`/watchlist/${id}/match-suggestions/accept`, { method: 'POST', body: JSON.stringify(input) }),
  rejectSuggestion: (id: number, input: { site_name: string; raw_product_name: string }) =>
    request<{ rejected: boolean }>(`/watchlist/${id}/match-suggestions/reject`, { method: 'POST', body: JSON.stringify(input) }),
};
