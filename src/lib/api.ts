import type { DbFile } from '../../server/db';
import type { History, Quote, SearchResult } from '../../server/market';

export type { History, Quote, SearchResult };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: {
        'X-Pecule': '1',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new ApiError(0, "Le serveur de l'application ne répond pas. Vérifier qu'il est bien lancé.");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Erreur ${res.status}`, body);
  return body as T;
}

export interface QuotesResponse {
  quotes: Record<string, Quote>;
  errors: Record<string, string>;
  fx: Record<string, number>;
}

const list = (items: string[]) => encodeURIComponent(items.join(','));

export const api = {
  loadDb: () => request<{ file: DbFile | null; location: string }>('/api/db'),
  saveDb: (baseRev: number, data: unknown) =>
    request<{ rev: number; savedAt: string }>('/api/db', {
      method: 'PUT',
      body: JSON.stringify({ baseRev, data }),
    }),
  backups: () => request<{ backups: string[]; dir: string }>('/api/backups'),
  quotes: (yahoo: string[], coingecko: string[]) =>
    request<QuotesResponse>(`/api/quotes?yahoo=${list(yahoo)}&coingecko=${list(coingecko)}`),
  history: (provider: 'yahoo' | 'coingecko', symbol: string) =>
    request<History>(`/api/history?provider=${provider}&symbol=${encodeURIComponent(symbol)}`),
  search: (q: string) => request<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`),
};
