import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Cours de bourse (Yahoo Finance) et crypto (CoinGecko), sans clé d'API.
 * Les appels partent de la machine locale ; les résultats sont mis en cache.
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export type Provider = 'yahoo' | 'coingecko';

export interface Quote {
  provider: Provider;
  symbol: string;
  /** Prix dans `currency` (les pence britanniques sont convertis en livres). */
  price: number;
  currency: string;
  changePct: number | null;
  name?: string;
  exchange?: string;
  type?: string;
  at: string;
}

export interface History {
  provider: Provider;
  symbol: string;
  currency: string;
  /** [date AAAA-MM-JJ, cours de clôture] triés par date. */
  points: [string, number][];
  fetchedAt: string;
}

export interface SearchResult {
  provider: Provider;
  symbol: string;
  name: string;
  exchange?: string;
  type?: string;
}

export class MarketError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getJson(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    throw new MarketError('Service de cours injoignable. Vérifier la connexion internet.');
  }
  if (res.status === 404) throw new MarketError('Symbole introuvable', 404);
  if (res.status === 429) throw new MarketError('Trop de requêtes vers le service de cours. Réessayer dans une minute.', 429);
  if (!res.ok) throw new MarketError(`Le service de cours a répondu ${res.status}.`);
  return res.json();
}

const memo = new Map<string, { expires: number; promise: Promise<unknown> }>();

function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && hit.expires > now) return hit.promise as Promise<T>;
  const promise = fn();
  memo.set(key, { expires: now + ttlMs, promise });
  promise.catch(() => memo.delete(key));
  return promise;
}

async function mapLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await fn(queue.shift() as T);
  });
  await Promise.all(workers);
}

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Erreur inconnue');

function normalizeCurrency(raw: string | undefined): { currency: string; factor: number } {
  switch (raw) {
    case 'GBp':
    case 'GBX':
      return { currency: 'GBP', factor: 0.01 };
    case 'ZAc':
      return { currency: 'ZAR', factor: 0.01 };
    case 'ILA':
      return { currency: 'ILS', factor: 0.01 };
    default:
      return { currency: (raw || 'EUR').toUpperCase(), factor: 1 };
  }
}

async function yahooQuote(symbol: string): Promise<Quote> {
  const json = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
  );
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta || typeof meta.regularMarketPrice !== 'number') throw new MarketError('Symbole introuvable', 404);
  const { currency, factor } = normalizeCurrency(meta.currency);
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  const changePct =
    typeof meta.regularMarketChangePercent === 'number'
      ? meta.regularMarketChangePercent
      : typeof prev === 'number' && prev > 0
        ? (meta.regularMarketPrice / prev - 1) * 100
        : null;
  return {
    provider: 'yahoo',
    symbol,
    price: meta.regularMarketPrice * factor,
    currency,
    changePct,
    name: meta.longName || meta.shortName,
    exchange: meta.fullExchangeName || meta.exchangeName,
    type: meta.instrumentType,
    at: new Date((meta.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString(),
  };
}

async function coingeckoQuotes(ids: string[]): Promise<Record<string, Quote>> {
  const json = await getJson(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids.map(encodeURIComponent).join(',')}` +
      '&vs_currencies=eur&include_24hr_change=true&include_last_updated_at=true',
  );
  const out: Record<string, Quote> = {};
  for (const id of ids) {
    const row = json?.[id];
    if (!row || typeof row.eur !== 'number') continue;
    out[id] = {
      provider: 'coingecko',
      symbol: id,
      price: row.eur,
      currency: 'EUR',
      changePct: typeof row.eur_24h_change === 'number' ? row.eur_24h_change : null,
      at: new Date((row.last_updated_at ?? Date.now() / 1000) * 1000).toISOString(),
    };
  }
  return out;
}

function fxToEur(currency: string): Promise<number> {
  if (currency === 'EUR') return Promise.resolve(1);
  return cached(`fx:${currency}`, 10 * 60_000, async () => (await yahooQuote(`${currency}EUR=X`)).price);
}

export async function getQuotes(yahoo: string[], coingecko: string[]) {
  const quotes: Record<string, Quote> = {};
  const errors: Record<string, string> = {};

  await Promise.all([
    mapLimit(yahoo, 4, async (symbol) => {
      try {
        quotes[`yahoo:${symbol}`] = await cached(`q:yahoo:${symbol}`, 60_000, () => yahooQuote(symbol));
      } catch (err) {
        errors[`yahoo:${symbol}`] = errorMessage(err);
      }
    }),
    (async () => {
      if (!coingecko.length) return;
      try {
        const key = `q:cg:${[...coingecko].sort().join(',')}`;
        const found = await cached(key, 60_000, () => coingeckoQuotes(coingecko));
        for (const id of coingecko) {
          if (found[id]) quotes[`coingecko:${id}`] = found[id];
          else errors[`coingecko:${id}`] = 'Crypto introuvable';
        }
      } catch (err) {
        for (const id of coingecko) errors[`coingecko:${id}`] = errorMessage(err);
      }
    })(),
  ]);

  const fx: Record<string, number> = { EUR: 1 };
  const currencies = [...new Set(Object.values(quotes).map((q) => q.currency))].filter((c) => c !== 'EUR');
  await Promise.all(
    currencies.map(async (c) => {
      try {
        fx[c] = await fxToEur(c);
      } catch (err) {
        errors[`fx:${c}`] = errorMessage(err);
      }
    }),
  );
  return { quotes, errors, fx };
}

function sortedPoints(byDay: Map<string, number>): [string, number][] {
  return [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

async function yahooHistory(symbol: string): Promise<Omit<History, 'fetchedAt'>> {
  const json = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`,
  );
  const result = json?.chart?.result?.[0];
  if (!result) throw new MarketError('Symbole introuvable', 404);
  const { currency, factor } = normalizeCurrency(result.meta?.currency);
  const offset: number = result.meta?.gmtoffset ?? 0;
  const timestamps: number[] = result.timestamp ?? [];
  const closes: (number | null)[] = result.indicators?.quote?.[0]?.close ?? [];
  const byDay = new Map<string, number>();
  timestamps.forEach((t, i) => {
    const close = closes[i];
    if (typeof close === 'number' && Number.isFinite(close)) {
      byDay.set(new Date((t + offset) * 1000).toISOString().slice(0, 10), close * factor);
    }
  });
  return { provider: 'yahoo', symbol, currency, points: sortedPoints(byDay) };
}

async function coingeckoHistory(id: string): Promise<Omit<History, 'fetchedAt'>> {
  const json = await getJson(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=eur&days=365&interval=daily`,
  );
  const byDay = new Map<string, number>();
  for (const [ms, price] of (json?.prices ?? []) as [number, number][]) {
    if (Number.isFinite(price)) byDay.set(new Date(ms).toISOString().slice(0, 10), price);
  }
  return { provider: 'coingecko', symbol: id, currency: 'EUR', points: sortedPoints(byDay) };
}

const HISTORY_TTL = 12 * 3600_000;

/** Historiques de cours, gardés sur disque pour limiter les appels réseau. */
export function createHistoryCache(cacheDir: string) {
  return async function getHistory(provider: Provider, symbol: string): Promise<History> {
    const file = path.join(cacheDir, `${provider}_${symbol.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`);
    let stale: History | null = null;
    try {
      stale = JSON.parse(await fs.readFile(file, 'utf8')) as History;
      if (Date.now() - Date.parse(stale.fetchedAt) < HISTORY_TTL) return stale;
    } catch {
      /* pas de cache exploitable */
    }
    try {
      const fresh = await cached(`h:${provider}:${symbol}`, 60_000, () =>
        provider === 'yahoo' ? yahooHistory(symbol) : coingeckoHistory(symbol),
      );
      const full: History = { ...fresh, fetchedAt: new Date().toISOString() };
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(file, JSON.stringify(full), 'utf8');
      return full;
    } catch (err) {
      if (stale) return stale;
      throw err;
    }
  };
}

const YAHOO_TYPES: Record<string, string> = {
  EQUITY: 'Action',
  ETF: 'ETF',
  MUTUALFUND: 'Fonds',
  INDEX: 'Indice',
  CRYPTOCURRENCY: 'Crypto',
};

export function search(q: string): Promise<SearchResult[]> {
  const query = q.trim();
  if (query.length < 2) return Promise.resolve([]);
  return cached(`s:${query.toLowerCase()}`, 10 * 60_000, async () => {
    const [yahoo, gecko] = await Promise.allSettled([
      getJson(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}` +
          '&quotesCount=8&newsCount=0&listsCount=0&lang=fr-FR&region=FR',
      ),
      getJson(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`),
    ]);
    if (yahoo.status === 'rejected' && gecko.status === 'rejected') throw yahoo.reason;

    const stocks: SearchResult[] = [];
    if (yahoo.status === 'fulfilled') {
      for (const r of yahoo.value?.quotes ?? []) {
        if (!r.symbol || !YAHOO_TYPES[r.quoteType]) continue;
        stocks.push({
          provider: 'yahoo',
          symbol: r.symbol,
          name: r.longname || r.shortname || r.symbol,
          exchange: r.exchDisp,
          type: YAHOO_TYPES[r.quoteType],
        });
      }
    }

    const coins: (SearchResult & { exact: boolean })[] = [];
    if (gecko.status === 'fulfilled') {
      const needle = query.toLowerCase();
      for (const c of (gecko.value?.coins ?? []).slice(0, 5)) {
        coins.push({
          provider: 'coingecko',
          symbol: c.id,
          name: c.name,
          exchange: String(c.symbol ?? '').toUpperCase(),
          type: 'Crypto',
          exact: String(c.symbol).toLowerCase() === needle || String(c.name).toLowerCase() === needle,
        });
      }
    }
    const strip = ({ exact: _exact, ...rest }: SearchResult & { exact: boolean }): SearchResult => rest;
    const exactCoins = coins.filter((c) => c.exact).map(strip);
    const otherCoins = coins.filter((c) => !c.exact).map(strip);
    return [...exactCoins, ...stocks, ...otherCoins];
  });
}
