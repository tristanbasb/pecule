import { addDays, addMonthsToDate, diffDays, today } from './dates';
import { applyOpToPositions, byDateAsc, opCashEffect, opContribution, txEffect, type Position } from './finance';
import { accountKind } from './meta';
import type { AccountKind, Asset, ID, ISODate, InvestmentOp, PeculeData } from './types';

/** [date, cours en euros], triés par date. */
export type PricePoints = [ISODate, number][];

export interface MarketHistory {
  currency: string;
  points: PricePoints;
}

const sortPoints = (points: PricePoints) => points.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

/** Convertit un historique en euros avec l'historique de change (ou un taux fixe à défaut). */
export function toEurPoints(history: MarketHistory, fx?: PricePoints, fallbackRate?: number): PricePoints {
  if (history.currency === 'EUR') return history.points;
  if (!fx?.length) return fallbackRate ? history.points.map(([d, p]) => [d, p * fallbackRate]) : [];
  const out: PricePoints = [];
  let j = 0;
  for (const [date, price] of history.points) {
    while (j + 1 < fx.length && fx[j + 1][0] <= date) j++;
    out.push([date, price * fx[j][1]]);
  }
  return out;
}

/** Réunit les cours connus d'un titre : opérations, historique de marché, saisies manuelles. */
export function buildPriceSeries(asset: Asset, ops: InvestmentOp[], market?: PricePoints): PricePoints {
  const byDay = new Map<ISODate, number>();
  for (const op of ops) {
    if (op.assetId === asset.id && (op.type === 'buy' || op.type === 'sell') && (op.unitPrice ?? 0) > 0) {
      byDay.set(op.date, op.unitPrice as number);
    }
  }
  for (const [d, p] of market ?? []) byDay.set(d, p);
  if (asset.provider !== 'manual' && asset.lastPrice && asset.lastPriceAt) {
    byDay.set(asset.lastPriceAt.slice(0, 10), asset.lastPrice);
  }
  for (const [d, p] of asset.manualPrices ?? []) byDay.set(d, p);
  return sortPoints([...byDay.entries()]);
}

/** Dernier cours connu à une date ; avant le premier point, on retient le premier cours. */
export function priceAt(series: PricePoints, date: ISODate): number | null {
  if (!series.length) return null;
  let lo = 0;
  let hi = series.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid][0] <= date) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return series[found >= 0 ? found : 0][1];
}

export type RangeKey = '1M' | '3M' | '6M' | '1A' | '3A' | 'MAX';

export const RANGE_LABELS: Record<RangeKey, string> = {
  '1M': '1 mois',
  '3M': '3 mois',
  '6M': '6 mois',
  '1A': '1 an',
  '3A': '3 ans',
  MAX: 'Tout',
};

export function earliestDate(data: PeculeData): ISODate | null {
  let min: ISODate | null = null;
  const consider = (d: ISODate | undefined) => {
    if (d && (!min || d < min)) min = d;
  };
  data.transactions.forEach((t) => consider(t.date));
  data.operations.forEach((o) => consider(o.date));
  data.valuations.forEach((v) => consider(v.date));
  data.accounts.forEach((a) => consider(a.openingDate));
  return min;
}

export function rangeStart(range: RangeKey, end: ISODate, earliest: ISODate | null): ISODate {
  const months: Record<Exclude<RangeKey, 'MAX'>, number> = { '1M': 1, '3M': 3, '6M': 6, '1A': 12, '3A': 36 };
  const floor = earliest ?? addDays(end, -30);
  if (range === 'MAX') return floor < end ? floor : addDays(end, -30);
  return addMonthsToDate(end, -months[range]);
}

/** Dates d'échantillonnage : quotidien sur une courte période, plus espacé ensuite. */
export function sampleDates(start: ISODate, end: ISODate): ISODate[] {
  const span = diffDays(start, end);
  if (span <= 0) return [end];
  const step = span <= 120 ? 1 : span <= 400 ? 3 : span <= 1100 ? 7 : 14;
  const out: ISODate[] = [];
  for (let d = start; d < end; d = addDays(d, step)) out.push(d);
  out.push(end);
  return out;
}

export interface WorthPoint {
  date: ISODate;
  total: number;
  cash: number;
  invest: number;
  asset: number;
  liability: number;
  contributions: number;
}

/** Patrimoine reconstitué à chaque date, à partir des opérations et des cours connus. */
export function netWorthSeries(
  data: PeculeData,
  dates: ISODate[],
  priceSeries: Map<ID, PricePoints>,
  accountFilter?: (id: ID) => boolean,
): WorthPoint[] {
  const accounts = data.accounts.filter((a) => !accountFilter || accountFilter(a.id));
  const included = new Set(accounts.map((a) => a.id));
  const kinds = new Map<ID, AccountKind>(accounts.map((a) => [a.id, accountKind(a.type)]));
  const txs = data.transactions.filter((t) => included.has(t.accountId) || (t.toAccountId && included.has(t.toAccountId))).sort(byDateAsc);
  const ops = data.operations.filter((o) => included.has(o.accountId)).sort(byDateAsc);
  const vals = data.valuations.filter((v) => included.has(v.accountId)).sort(byDateAsc);

  const balance = new Map<ID, number>(accounts.map((a) => [a.id, a.openingBalance || 0]));
  let contributions = accounts.reduce((s, a) => s + (kinds.get(a.id) === 'invest' ? a.openingBalance || 0 : 0), 0);
  const positions = new Map<string, Position>();
  const lastValuation = new Map<ID, number>();
  let ti = 0;
  let oi = 0;
  let vi = 0;
  const out: WorthPoint[] = [];

  for (const date of dates) {
    for (; ti < txs.length && txs[ti].date <= date; ti++) {
      const tx = txs[ti];
      for (const id of [tx.accountId, tx.toAccountId]) {
        if (!id || !included.has(id)) continue;
        const effect = txEffect(tx, id);
        balance.set(id, (balance.get(id) ?? 0) + effect);
        if (tx.kind === 'transfer' && kinds.get(id) === 'invest') contributions += effect;
      }
    }
    for (; oi < ops.length && ops[oi].date <= date; oi++) {
      const op = ops[oi];
      balance.set(op.accountId, (balance.get(op.accountId) ?? 0) + opCashEffect(op));
      contributions += opContribution(op);
      applyOpToPositions(positions, op);
    }
    for (; vi < vals.length && vals[vi].date <= date; vi++) lastValuation.set(vals[vi].accountId, vals[vi].value);

    const point: WorthPoint = { date, total: 0, cash: 0, invest: 0, asset: 0, liability: 0, contributions };
    for (const a of accounts) {
      const kind = kinds.get(a.id);
      if (kind === 'cash') point.cash += balance.get(a.id) ?? 0;
      else if (kind === 'invest') point.invest += balance.get(a.id) ?? 0;
      else if (kind === 'asset') point.asset += lastValuation.get(a.id) ?? (a.openingBalance || 0);
      else point.liability -= lastValuation.get(a.id) ?? (a.openingBalance || 0);
    }
    for (const p of positions.values()) {
      if (p.quantity <= 1e-9) continue;
      const series = priceSeries.get(p.assetId);
      const price = series ? priceAt(series, date) : null;
      point.invest += price !== null ? p.quantity * price : p.costBasis;
    }
    point.total = point.cash + point.invest + point.asset + point.liability;
    out.push(point);
  }
  return out;
}

export const defaultEnd = () => today();
