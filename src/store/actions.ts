import { today } from '../lib/dates';
import { computeSnapshot } from '../lib/finance';
import { round2 } from '../lib/format';
import { nowIso, uid } from '../lib/id';
import type {
  Account,
  Asset,
  Category,
  ID,
  ISODate,
  ImportProfile,
  InvestmentOp,
  PeculeData,
  Recurring,
  Rule,
  Settings,
  Transaction,
  Valuation,
} from '../lib/types';
import { updateData } from './db';

type WithOptionalId<T extends { id: ID }> = Omit<T, 'id' | 'createdAt'> & { id?: ID; createdAt?: string };

function upsert<T extends { id: ID }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

const withMeta = <T extends { id: ID; createdAt: string }>(input: WithOptionalId<T>): T =>
  ({ ...input, id: input.id ?? uid(), createdAt: input.createdAt ?? nowIso() }) as T;

/* ----------------------------------------------------------------- Réglages */

export function updateSettings(patch: Partial<Settings>) {
  updateData((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
}

export function replaceAllData(data: PeculeData) {
  updateData(() => data);
}

/* -------------------------------------------------------------------- Comptes */

export function saveAccount(input: WithOptionalId<Account>): Account {
  const account = withMeta<Account>(input);
  updateData((d) => ({ ...d, accounts: upsert(d.accounts, account) }));
  return account;
}

export function setAccountArchived(id: ID, archived: boolean) {
  updateData((d) => ({ ...d, accounts: d.accounts.map((a) => (a.id === id ? { ...a, archived } : a)) }));
}

/** Supprime le compte et tout ce qui s'y rapporte. */
export function deleteAccount(id: ID) {
  updateData((d) => ({
    ...d,
    accounts: d.accounts.filter((a) => a.id !== id),
    transactions: d.transactions.filter((t) => t.accountId !== id && t.toAccountId !== id),
    operations: d.operations.filter((o) => o.accountId !== id),
    valuations: d.valuations.filter((v) => v.accountId !== id),
    recurring: d.recurring.filter((r) => r.accountId !== id && r.toAccountId !== id),
    importProfiles: d.importProfiles.filter((p) => p.accountId !== id),
  }));
}

/** Crée une correction datée pour que le solde corresponde au montant indiqué. */
export function adjustCashBalance(accountId: ID, target: number, date: ISODate = today()) {
  updateData((d) => {
    const current = computeSnapshot(d, date).byId.get(accountId)?.cash ?? 0;
    const delta = round2(target - current);
    if (Math.abs(delta) < 0.005) return d;
    const tx: Transaction = {
      id: uid(),
      date,
      label: 'Correction de solde',
      amount: Math.abs(delta),
      kind: delta > 0 ? 'income' : 'expense',
      accountId,
      adjustment: true,
      createdAt: nowIso(),
    };
    return { ...d, transactions: [...d.transactions, tx] };
  });
}

/* --------------------------------------------------------------- Transactions */

export function saveTransaction(input: WithOptionalId<Transaction>): Transaction {
  const tx = withMeta<Transaction>(input);
  if (tx.kind === 'transfer') delete tx.categoryId;
  else delete tx.toAccountId;
  updateData((d) => ({ ...d, transactions: upsert(d.transactions, tx) }));
  return tx;
}

export function addTransactions(list: Transaction[]) {
  if (!list.length) return;
  updateData((d) => ({ ...d, transactions: [...d.transactions, ...list] }));
}

export function deleteTransactions(ids: ID[]) {
  const set = new Set(ids);
  updateData((d) => ({ ...d, transactions: d.transactions.filter((t) => !set.has(t.id)) }));
}

export function setTransactionsCategory(ids: ID[], categoryId: ID | undefined) {
  const set = new Set(ids);
  updateData((d) => {
    const category = d.categories.find((c) => c.id === categoryId);
    return {
      ...d,
      transactions: d.transactions.map((t) => {
        if (!set.has(t.id) || t.kind === 'transfer') return t;
        return { ...t, categoryId: category?.id };
      }),
    };
  });
}

/* ----------------------------------------------------------------- Catégories */

export function saveCategory(input: WithOptionalId<Category> & { createdAt?: string }): Category {
  const { createdAt: _createdAt, ...rest } = input;
  const category: Category = { ...rest, id: rest.id ?? uid() };
  updateData((d) => ({ ...d, categories: upsert(d.categories, category) }));
  return category;
}

export function deleteCategory(id: ID, reassignTo?: ID) {
  updateData((d) => ({
    ...d,
    categories: d.categories.filter((c) => c.id !== id),
    transactions: d.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: reassignTo } : t)),
    recurring: d.recurring.map((r) => (r.categoryId === id ? { ...r, categoryId: reassignTo } : r)),
    rules: reassignTo
      ? d.rules.map((r) => (r.categoryId === id ? { ...r, categoryId: reassignTo } : r))
      : d.rules.filter((r) => r.categoryId !== id),
  }));
}

export function setBudget(categoryId: ID, budget: number | undefined) {
  updateData((d) => ({
    ...d,
    categories: d.categories.map((c) =>
      c.id === categoryId ? { ...c, budget: budget && budget > 0 ? round2(budget) : undefined } : c,
    ),
  }));
}

/* ---------------------------------------------------------------- Placements */

export function saveAsset(input: WithOptionalId<Asset>): Asset {
  const asset = withMeta<Asset>(input);
  updateData((d) => ({ ...d, assets: upsert(d.assets, asset) }));
  return asset;
}

export function deleteAsset(id: ID) {
  updateData((d) => ({
    ...d,
    assets: d.assets.filter((a) => a.id !== id),
    operations: d.operations.filter((o) => o.assetId !== id),
  }));
}

export function setManualPrice(assetId: ID, date: ISODate, price: number) {
  updateData((d) => ({
    ...d,
    assets: d.assets.map((a) => {
      if (a.id !== assetId) return a;
      const prices = (a.manualPrices ?? []).filter(([day]) => day !== date);
      prices.push([date, price]);
      prices.sort((x, y) => (x[0] < y[0] ? -1 : 1));
      return { ...a, manualPrices: prices };
    }),
  }));
}

export interface QuoteUpdate {
  price: number;
  at: string;
  changePct: number | null;
  currency: string;
}

/** Mise à jour des cours : hors historique d'annulation, appliquée à tous les états. */
export function applyQuotes(updates: Record<ID, QuoteUpdate>) {
  if (!Object.keys(updates).length) return;
  updateData(
    (d) => ({
      ...d,
      assets: d.assets.map((a) => {
        const u = updates[a.id];
        return u ? { ...a, lastPrice: u.price, lastPriceAt: u.at, changePct: u.changePct, currency: u.currency } : a;
      }),
    }),
    { undoable: false, rebase: true },
  );
}

export function saveOperation(input: WithOptionalId<InvestmentOp>): InvestmentOp {
  const op = withMeta<InvestmentOp>(input);
  updateData((d) => ({ ...d, operations: upsert(d.operations, op) }));
  return op;
}

export function deleteOperations(ids: ID[]) {
  const set = new Set(ids);
  updateData((d) => ({ ...d, operations: d.operations.filter((o) => !set.has(o.id)) }));
}

export function saveValuation(input: Omit<Valuation, 'id'> & { id?: ID }): Valuation {
  const valuation: Valuation = { ...input, id: input.id ?? uid() };
  updateData((d) => ({ ...d, valuations: upsert(d.valuations, valuation) }));
  return valuation;
}

export function deleteValuation(id: ID) {
  updateData((d) => ({ ...d, valuations: d.valuations.filter((v) => v.id !== id) }));
}

/* ----------------------------------------------------- Récurrences & règles */

export function saveRecurring(input: WithOptionalId<Recurring>): Recurring {
  const recurring = withMeta<Recurring>(input);
  updateData((d) => ({ ...d, recurring: upsert(d.recurring, recurring) }));
  return recurring;
}

export function deleteRecurring(id: ID) {
  updateData((d) => ({
    ...d,
    recurring: d.recurring.filter((r) => r.id !== id),
    transactions: d.transactions.map((t) => (t.recurringId === id ? { ...t, recurringId: undefined } : t)),
  }));
}

export function saveRule(pattern: string, categoryId: ID): Rule {
  const rule: Rule = { id: uid(), pattern: pattern.trim(), categoryId, createdAt: nowIso() };
  updateData((d) => ({
    ...d,
    rules: [...d.rules.filter((r) => r.pattern.toLowerCase() !== rule.pattern.toLowerCase()), rule],
  }));
  return rule;
}

export function deleteRule(id: ID) {
  updateData((d) => ({ ...d, rules: d.rules.filter((r) => r.id !== id) }));
}

export function saveImportProfile(profile: ImportProfile) {
  updateData(
    (d) => ({
      ...d,
      importProfiles: [...d.importProfiles.filter((p) => p.accountId !== profile.accountId), profile],
    }),
    { undoable: false },
  );
}
