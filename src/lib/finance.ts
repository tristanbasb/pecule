import { diffDays, monthKey, today } from './dates';
import { accountKind } from './meta';
import type {
  Account,
  AccountKind,
  Asset,
  Category,
  CategoryType,
  ID,
  ISODate,
  InvestmentOp,
  MonthKey,
  PeculeData,
  Transaction,
  Valuation,
} from './types';

const EPS = 1e-9;

const add = (map: Map<string, number>, key: string | undefined, value: number) => {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + value);
};

export function byDateAsc<T extends { date: ISODate; createdAt?: string }>(a: T, b: T): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const ca = a.createdAt ?? '';
  const cb = b.createdAt ?? '';
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}

/* ------------------------------------------------------------------ Transactions */

/** Effet signé d'une transaction sur le solde d'un compte. */
export function txEffect(tx: Transaction, accountId: ID): number {
  if (tx.kind === 'transfer') {
    if (tx.accountId === accountId) return -tx.amount;
    if (tx.toAccountId === accountId) return tx.amount;
    return 0;
  }
  if (tx.accountId !== accountId) return 0;
  return tx.kind === 'income' ? tx.amount : -tx.amount;
}

/** Les virements et corrections de solde ne sont ni des dépenses ni des revenus. */
export const isBudgetTx = (tx: Transaction) => tx.kind !== 'transfer' && !tx.adjustment;

/* --------------------------------------------------------- Opérations de placement */

export const opCost = (op: InvestmentOp) => (op.quantity ?? 0) * (op.unitPrice ?? 0) + (op.fees ?? 0);
export const opProceeds = (op: InvestmentOp) => (op.quantity ?? 0) * (op.unitPrice ?? 0) - (op.fees ?? 0);

/** Effet d'une opération sur les espèces du compte. */
export function opCashEffect(op: InvestmentOp): number {
  switch (op.type) {
    case 'buy':
      return op.newMoney ? 0 : -opCost(op);
    case 'sell':
      return opProceeds(op);
    case 'dividend':
    case 'interest':
    case 'deposit':
      return op.amount ?? 0;
    case 'withdrawal':
    case 'fee':
      return -(op.amount ?? 0);
  }
}

/** Argent apporté (ou retiré) par l'investisseur. */
export function opContribution(op: InvestmentOp): number {
  switch (op.type) {
    case 'deposit':
      return op.amount ?? 0;
    case 'withdrawal':
      return -(op.amount ?? 0);
    case 'buy':
      return op.newMoney ? opCost(op) : 0;
    default:
      return 0;
  }
}

/** Montant signé à afficher dans la liste des opérations. */
export function opDisplayAmount(op: InvestmentOp): number {
  switch (op.type) {
    case 'buy':
      return -opCost(op);
    case 'sell':
      return opProceeds(op);
    case 'withdrawal':
    case 'fee':
      return -(op.amount ?? 0);
    default:
      return op.amount ?? 0;
  }
}

export interface Position {
  accountId: ID;
  assetId: ID;
  quantity: number;
  /** Coût d'acquisition des titres encore détenus (quantité × PRU). */
  costBasis: number;
  /** Prix de revient unitaire, frais inclus. */
  avgPrice: number;
  realized: number;
  dividends: number;
  fees: number;
  firstDate: ISODate;
  lastDate: ISODate;
}

export const positionKey = (accountId: ID, assetId: ID) => `${accountId}:${assetId}`;

/** Méthode du coût moyen pondéré : une vente ne modifie pas le PRU. */
export function applyOpToPositions(positions: Map<string, Position>, op: InvestmentOp) {
  if (!op.assetId || (op.type !== 'buy' && op.type !== 'sell' && op.type !== 'dividend')) return;
  const key = positionKey(op.accountId, op.assetId);
  let p = positions.get(key);
  if (!p) {
    p = {
      accountId: op.accountId,
      assetId: op.assetId,
      quantity: 0,
      costBasis: 0,
      avgPrice: 0,
      realized: 0,
      dividends: 0,
      fees: 0,
      firstDate: op.date,
      lastDate: op.date,
    };
    positions.set(key, p);
  }
  p.lastDate = op.date;
  const qty = Math.max(0, op.quantity ?? 0);
  const price = Math.max(0, op.unitPrice ?? 0);
  const fees = Math.max(0, op.fees ?? 0);

  if (op.type === 'buy') {
    p.quantity += qty;
    p.costBasis += qty * price + fees;
    p.fees += fees;
  } else if (op.type === 'sell') {
    const avg = p.quantity > EPS ? p.costBasis / p.quantity : 0;
    const costOut = avg * Math.min(qty, p.quantity);
    p.realized += qty * price - fees - costOut;
    p.fees += fees;
    p.quantity -= qty;
    p.costBasis -= costOut;
    if (p.quantity <= EPS) {
      p.quantity = 0;
      p.costBasis = 0;
    }
  } else {
    p.dividends += Math.max(0, op.amount ?? 0);
  }
  p.avgPrice = p.quantity > EPS ? p.costBasis / p.quantity : 0;
}

export function computePositions(ops: InvestmentOp[], upTo?: ISODate): Map<string, Position> {
  const positions = new Map<string, Position>();
  for (const op of [...ops].sort(byDateAsc)) {
    if (upTo && op.date > upTo) break;
    applyOpToPositions(positions, op);
  }
  return positions;
}

/* ------------------------------------------------------------------------- Cours */

export type PriceSource = 'market' | 'manual' | 'operation';

export interface PriceInfo {
  price: number;
  source: PriceSource;
  date?: string;
}

export function latestManualPrice(asset: Asset): [ISODate, number] | undefined {
  let best: [ISODate, number] | undefined;
  for (const entry of asset.manualPrices ?? []) if (!best || entry[0] >= best[0]) best = entry;
  return best;
}

/** Cours de marché si disponible, sinon le plus récent entre saisie manuelle et dernière opération. */
export function resolvePrice(asset: Asset, lastOp?: { date: ISODate; price: number }): PriceInfo | null {
  if (asset.provider !== 'manual' && typeof asset.lastPrice === 'number') {
    return { price: asset.lastPrice, source: 'market', date: asset.lastPriceAt };
  }
  const manual = latestManualPrice(asset);
  if (manual && (!lastOp || manual[0] >= lastOp.date)) return { price: manual[1], source: 'manual', date: manual[0] };
  if (lastOp) return { price: lastOp.price, source: 'operation', date: lastOp.date };
  return null;
}

/* ---------------------------------------------------------------- Photographie */

export interface PositionView extends Position {
  asset: Asset;
  price: number | null;
  priceSource: PriceSource | null;
  priceDate?: string;
  value: number;
  unrealized: number;
  unrealizedPct: number | null;
  dayChange: number | null;
}

export interface AccountSummary {
  account: Account;
  kind: AccountKind;
  value: number;
  /** Espèces (compte d'investissement) ou solde (compte bancaire). */
  cash: number;
  holdingsValue: number;
  contributions: number;
  gain: number;
  gainPct: number | null;
  realized: number;
  dividends: number;
  dayChange: number;
  positions: PositionView[];
  missingPrices: number;
  lastValuation?: Valuation;
}

export interface Snapshot {
  asOf: ISODate;
  accounts: AccountSummary[];
  byId: Map<ID, AccountSummary>;
  netWorth: number;
  byKind: Record<AccountKind, number>;
  invest: {
    value: number;
    cash: number;
    holdingsValue: number;
    contributions: number;
    gain: number;
    gainPct: number | null;
    realized: number;
    dividends: number;
    dayChange: number;
  };
  positions: PositionView[];
}

export function computeSnapshot(data: PeculeData, asOf: ISODate = today()): Snapshot {
  const kinds = new Map<ID, AccountKind>(data.accounts.map((a) => [a.id, accountKind(a.type)]));
  const cash = new Map<string, number>();
  const contributions = new Map<string, number>();

  for (const a of data.accounts) {
    cash.set(a.id, a.openingBalance || 0);
    contributions.set(a.id, kinds.get(a.id) === 'invest' ? a.openingBalance || 0 : 0);
  }

  for (const tx of data.transactions) {
    if (tx.date > asOf) continue;
    add(cash, tx.accountId, txEffect(tx, tx.accountId));
    if (tx.kind === 'transfer' && tx.toAccountId) {
      add(cash, tx.toAccountId, tx.amount);
      if (kinds.get(tx.accountId) === 'invest') add(contributions, tx.accountId, -tx.amount);
      if (kinds.get(tx.toAccountId) === 'invest') add(contributions, tx.toAccountId, tx.amount);
    }
  }

  const positions = new Map<string, Position>();
  const lastOpPrice = new Map<ID, { date: ISODate; price: number }>();
  for (const op of data.operations.filter((o) => o.date <= asOf).sort(byDateAsc)) {
    add(cash, op.accountId, opCashEffect(op));
    add(contributions, op.accountId, opContribution(op));
    applyOpToPositions(positions, op);
    if ((op.type === 'buy' || op.type === 'sell') && op.assetId && (op.unitPrice ?? 0) > 0) {
      lastOpPrice.set(op.assetId, { date: op.date, price: op.unitPrice as number });
    }
  }

  const lastValuation = new Map<ID, Valuation>();
  for (const v of data.valuations) {
    if (v.date > asOf) continue;
    const prev = lastValuation.get(v.accountId);
    if (!prev || v.date >= prev.date) lastValuation.set(v.accountId, v);
  }

  const assets = new Map(data.assets.map((a) => [a.id, a]));
  const positionsByAccount = new Map<ID, PositionView[]>();
  const realizedByAccount = new Map<string, number>();
  const dividendsByAccount = new Map<string, number>();

  for (const p of positions.values()) {
    add(realizedByAccount, p.accountId, p.realized);
    add(dividendsByAccount, p.accountId, p.dividends);
    const asset = assets.get(p.assetId);
    if (!asset || p.quantity <= EPS) continue;
    const info = resolvePrice(asset, lastOpPrice.get(asset.id));
    const value = info ? p.quantity * info.price : p.costBasis;
    const unrealized = value - p.costBasis;
    const change = info?.source === 'market' ? asset.changePct : null;
    const view: PositionView = {
      ...p,
      asset,
      price: info?.price ?? null,
      priceSource: info?.source ?? null,
      priceDate: info?.date,
      value,
      unrealized,
      unrealizedPct: p.costBasis > EPS ? unrealized / p.costBasis : null,
      dayChange: typeof change === 'number' && change > -100 ? (value * change) / (100 + change) : null,
    };
    const list = positionsByAccount.get(p.accountId) ?? [];
    list.push(view);
    positionsByAccount.set(p.accountId, list);
  }

  const byKind: Record<AccountKind, number> = { cash: 0, invest: 0, asset: 0, liability: 0 };
  const invest = {
    value: 0,
    cash: 0,
    holdingsValue: 0,
    contributions: 0,
    gain: 0,
    gainPct: null as number | null,
    realized: 0,
    dividends: 0,
    dayChange: 0,
  };
  const summaries: AccountSummary[] = [];

  for (const account of data.accounts) {
    const kind = kinds.get(account.id) as AccountKind;
    const accCash = cash.get(account.id) ?? 0;
    const views = (positionsByAccount.get(account.id) ?? []).sort((a, b) => b.value - a.value);
    const holdingsValue = views.reduce((s, v) => s + v.value, 0);
    const valuation = lastValuation.get(account.id);
    let value: number;
    switch (kind) {
      case 'cash':
        value = accCash;
        break;
      case 'invest':
        value = accCash + holdingsValue;
        break;
      case 'asset':
        value = valuation?.value ?? account.openingBalance ?? 0;
        break;
      case 'liability':
        value = -(valuation?.value ?? account.openingBalance ?? 0);
        break;
    }
    const contrib = contributions.get(account.id) ?? 0;
    const gain = kind === 'invest' ? value - contrib : 0;
    const summary: AccountSummary = {
      account,
      kind,
      value,
      cash: kind === 'cash' || kind === 'invest' ? accCash : 0,
      holdingsValue,
      contributions: contrib,
      gain,
      gainPct: kind === 'invest' && contrib > EPS ? gain / contrib : null,
      realized: realizedByAccount.get(account.id) ?? 0,
      dividends: dividendsByAccount.get(account.id) ?? 0,
      dayChange: views.reduce((s, v) => s + (v.dayChange ?? 0), 0),
      positions: views,
      missingPrices: views.filter((v) => v.price === null).length,
      lastValuation: valuation,
    };
    summaries.push(summary);
    byKind[kind] += value;
    if (kind === 'invest') {
      invest.value += value;
      invest.cash += accCash;
      invest.holdingsValue += holdingsValue;
      invest.contributions += contrib;
      invest.realized += summary.realized;
      invest.dividends += summary.dividends;
      invest.dayChange += summary.dayChange;
    }
  }
  invest.gain = invest.value - invest.contributions;
  invest.gainPct = invest.contributions > EPS ? invest.gain / invest.contributions : null;

  return {
    asOf,
    accounts: summaries,
    byId: new Map(summaries.map((s) => [s.account.id, s])),
    netWorth: byKind.cash + byKind.invest + byKind.asset + byKind.liability,
    byKind,
    invest,
    positions: summaries.flatMap((s) => s.positions),
  };
}

/* ------------------------------------------------------------------------- Budget */

export const UNCATEGORIZED_EXPENSE = '__none_expense';
export const UNCATEGORIZED_INCOME = '__none_income';

export interface Flow {
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null;
  /** Montant net par catégorie (un remboursement réduit la dépense de sa catégorie). */
  byCategory: Map<string, number>;
  count: number;
}

const emptyFlow = (): Flow => ({ income: 0, expense: 0, net: 0, savingsRate: null, byCategory: new Map(), count: 0 });

export function bucketOf(
  tx: Transaction,
  categories: Map<ID, Category>,
): { key: string; type: CategoryType; sign: 1 | -1 } {
  const cat = tx.categoryId ? categories.get(tx.categoryId) : undefined;
  if (cat) {
    const natural = (cat.type === 'expense') === (tx.kind === 'expense');
    return { key: cat.id, type: cat.type, sign: natural ? 1 : -1 };
  }
  return tx.kind === 'income'
    ? { key: UNCATEGORIZED_INCOME, type: 'income', sign: 1 }
    : { key: UNCATEGORIZED_EXPENSE, type: 'expense', sign: 1 };
}

export function flowsByMonth(data: PeculeData, months: MonthKey[]): Map<MonthKey, Flow> {
  const out = new Map<MonthKey, Flow>(months.map((m) => [m, emptyFlow()]));
  const categories = new Map(data.categories.map((c) => [c.id, c]));
  for (const tx of data.transactions) {
    if (!isBudgetTx(tx)) continue;
    const flow = out.get(monthKey(tx.date));
    if (!flow) continue;
    const bucket = bucketOf(tx, categories);
    const v = bucket.sign * tx.amount;
    if (bucket.type === 'income') flow.income += v;
    else flow.expense += v;
    add(flow.byCategory, bucket.key, v);
    flow.count += 1;
  }
  for (const f of out.values()) {
    f.net = f.income - f.expense;
    f.savingsRate = f.income > EPS ? f.net / f.income : null;
  }
  return out;
}

export type BudgetStatus = 'ok' | 'warning' | 'over' | 'none';

export interface BudgetLine {
  category: Category;
  spent: number;
  budget: number;
  remaining: number;
  ratio: number | null;
  status: BudgetStatus;
  /** Moyenne des mois de comparaison. */
  average: number;
}

export function budgetStatus(spent: number, budget: number): BudgetStatus {
  if (!(budget > 0)) return 'none';
  const ratio = spent / budget;
  if (ratio > 1 + EPS) return 'over';
  if (ratio >= 0.9) return 'warning';
  return 'ok';
}

export function budgetLines(
  categories: Category[],
  flow: Flow,
  previous: Flow[],
  type: CategoryType = 'expense',
): BudgetLine[] {
  return categories
    .filter((c) => c.type === type && (!c.archived || (flow.byCategory.get(c.id) ?? 0) !== 0))
    .map((category) => {
      const spent = flow.byCategory.get(category.id) ?? 0;
      const budget = category.budget ?? 0;
      const average = previous.length
        ? previous.reduce((s, f) => s + (f.byCategory.get(category.id) ?? 0), 0) / previous.length
        : 0;
      return {
        category,
        spent,
        budget,
        remaining: budget - spent,
        ratio: budget > 0 ? spent / budget : null,
        status: budgetStatus(spent, budget),
        average,
      };
    });
}

/** Part du mois écoulée (1 pour un mois passé, 0 pour un mois futur). */
export function monthElapsed(month: MonthKey, now: ISODate = today()): number {
  const current = monthKey(now);
  if (month < current) return 1;
  if (month > current) return 0;
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return Number(now.slice(8, 10)) / days;
}

/* --------------------------------------------------------------- Rendement (TRI) */

export interface CashFlow {
  date: ISODate;
  amount: number;
}

/** Taux de rendement interne annualisé ; flux négatifs = apports, positifs = retraits et valeur finale. */
export function xirr(flows: CashFlow[]): number | null {
  const list = flows.filter((f) => Math.abs(f.amount) > EPS);
  if (list.length < 2 || !list.some((f) => f.amount > 0) || !list.some((f) => f.amount < 0)) return null;
  const start = list.reduce((min, f) => (f.date < min ? f.date : min), list[0].date);
  const years = list.map((f) => diffDays(start, f.date) / 365.25);
  const npv = (r: number) => list.reduce((s, f, i) => s + f.amount / Math.pow(1 + r, years[i]), 0);
  const dnpv = (r: number) => list.reduce((s, f, i) => s - (years[i] * f.amount) / Math.pow(1 + r, years[i] + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 60; i++) {
    const value = npv(r);
    const slope = dnpv(r);
    if (!Number.isFinite(value) || !Number.isFinite(slope) || Math.abs(slope) < 1e-12) break;
    const next = r - value / slope;
    if (!Number.isFinite(next) || next <= -0.999999) break;
    if (Math.abs(next - r) < 1e-10) return Math.abs(npv(next)) < 1e-4 * list.length ? next : null;
    r = next;
  }

  let lo = -0.999;
  let hi = 100;
  let flo = npv(lo);
  if (!Number.isFinite(flo) || flo * npv(hi) > 0) return null;
  for (let i = 0; i < 300; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (Math.abs(fm) < 1e-8 || hi - lo < 1e-10) return mid;
    if (flo * fm < 0) hi = mid;
    else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

/** Flux d'argent de l'investisseur pour un ensemble de comptes de placement. */
export function investmentCashFlows(data: PeculeData, accountIds: Set<ID>, asOf: ISODate = today()): CashFlow[] {
  const flows: CashFlow[] = [];
  for (const a of data.accounts) {
    if (accountIds.has(a.id) && a.openingBalance) flows.push({ date: a.openingDate, amount: -a.openingBalance });
  }
  for (const tx of data.transactions) {
    if (tx.kind !== 'transfer' || tx.date > asOf) continue;
    const from = accountIds.has(tx.accountId);
    const to = tx.toAccountId ? accountIds.has(tx.toAccountId) : false;
    if (from && !to) flows.push({ date: tx.date, amount: tx.amount });
    if (to && !from) flows.push({ date: tx.date, amount: -tx.amount });
  }
  for (const op of data.operations) {
    if (!accountIds.has(op.accountId) || op.date > asOf) continue;
    const c = opContribution(op);
    if (c) flows.push({ date: op.date, amount: -c });
  }
  return flows;
}

/** TRI d'un ensemble de comptes, uniquement si l'historique couvre au moins deux mois. */
export function annualizedReturn(data: PeculeData, accountIds: Set<ID>, value: number, asOf: ISODate = today()) {
  const flows = investmentCashFlows(data, accountIds, asOf);
  if (!flows.length) return null;
  const first = flows.reduce((min, f) => (f.date < min ? f.date : min), flows[0].date);
  if (diffDays(first, asOf) < 60) return null;
  return xirr([...flows, { date: asOf, amount: value }]);
}
