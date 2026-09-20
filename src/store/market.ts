import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { api } from '../lib/api';
import { buildPriceSeries, toEurPoints, type PricePoints } from '../lib/history';
import type { Asset, ID } from '../lib/types';
import { applyQuotes, type QuoteUpdate } from './actions';
import { useDb } from './db';

interface HistoryEntry {
  status: 'loading' | 'ready' | 'error';
  points?: PricePoints;
  error?: string;
}

interface MarketState {
  refreshing: boolean;
  lastRefresh: number | null;
  /** Erreur de cours par titre. */
  errors: Record<ID, string>;
  histories: Record<string, HistoryEntry>;
}

export const useMarket = create<MarketState>(() => ({
  refreshing: false,
  lastRefresh: null,
  errors: {},
  histories: {},
}));

export const marketKey = (asset: Pick<Asset, 'provider' | 'symbol'>) => `${asset.provider}:${asset.symbol ?? ''}`;

const isTracked = (a: Asset) => a.provider !== 'manual' && Boolean(a.symbol);

/** Récupère les derniers cours. Renvoie null si aucun titre n'est suivi ou si une mise à jour est déjà en cours. */
export async function refreshQuotes(): Promise<{ updated: number; failed: number } | null> {
  const tracked = useDb.getState().data.assets.filter(isTracked);
  if (!tracked.length || useMarket.getState().refreshing) return null;
  useMarket.setState({ refreshing: true });
  try {
    const symbols = (provider: Asset['provider']) => [
      ...new Set(tracked.filter((a) => a.provider === provider).map((a) => a.symbol as string)),
    ];
    const res = await api.quotes(symbols('yahoo'), symbols('coingecko'));
    const updates: Record<ID, QuoteUpdate> = {};
    const errors: Record<ID, string> = {};
    for (const asset of tracked) {
      const key = marketKey(asset);
      const quote = res.quotes[key];
      if (!quote) {
        errors[asset.id] = res.errors[key] ?? 'Cours indisponible';
        continue;
      }
      const rate = res.fx[quote.currency];
      if (!rate) {
        errors[asset.id] = `Taux de change ${quote.currency} → EUR indisponible`;
        continue;
      }
      updates[asset.id] = { price: quote.price * rate, at: quote.at, changePct: quote.changePct, currency: quote.currency };
    }
    applyQuotes(updates);
    useMarket.setState({ lastRefresh: Date.now(), errors });
    return { updated: Object.keys(updates).length, failed: Object.keys(errors).length };
  } finally {
    useMarket.setState({ refreshing: false });
  }
}

const inflight = new Map<string, Promise<PricePoints>>();
const fxInflight = new Map<string, Promise<PricePoints>>();

function setHistory(key: string, entry: HistoryEntry) {
  useMarket.setState((s) => ({ histories: { ...s.histories, [key]: entry } }));
}

function fxHistory(currency: string): Promise<PricePoints> {
  let p = fxInflight.get(currency);
  if (!p) {
    p = api.history('yahoo', `${currency}EUR=X`).then((h) => h.points);
    p.catch(() => fxInflight.delete(currency));
    fxInflight.set(currency, p);
  }
  return p;
}

/** Historique des cours d'un titre, converti en euros (mis en cache pendant la session). */
export function loadHistory(asset: Asset): Promise<PricePoints> {
  if (!isTracked(asset)) return Promise.resolve([]);
  const key = marketKey(asset);
  const existing = useMarket.getState().histories[key];
  if (existing?.status === 'ready') return Promise.resolve(existing.points ?? []);
  if (existing?.status === 'error') return Promise.resolve([]);
  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    setHistory(key, { status: 'loading' });
    try {
      const h = await api.history(asset.provider as 'yahoo' | 'coingecko', asset.symbol as string);
      const points = h.currency === 'EUR' ? h.points : toEurPoints(h, await fxHistory(h.currency));
      setHistory(key, { status: 'ready', points });
      return points;
    } catch (err) {
      setHistory(key, { status: 'error', error: err instanceof Error ? err.message : 'Historique indisponible' });
      return [];
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/** Séries de cours en euros pour chaque titre utilisé ; charge les historiques manquants. */
export function usePriceSeries() {
  const assets = useDb((s) => s.data.assets);
  const operations = useDb((s) => s.data.operations);
  const histories = useMarket((s) => s.histories);

  useEffect(() => {
    const used = new Set(operations.map((o) => o.assetId));
    for (const asset of assets) if (used.has(asset.id)) void loadHistory(asset);
  }, [assets, operations]);

  return useMemo(() => {
    const series = new Map<ID, PricePoints>();
    let loading = false;
    for (const asset of assets) {
      const entry = isTracked(asset) ? histories[marketKey(asset)] : undefined;
      if (entry?.status === 'loading') loading = true;
      series.set(asset.id, buildPriceSeries(asset, operations, entry?.points));
    }
    return { series, loading };
  }, [assets, operations, histories]);
}
