import { useMemo } from 'react';
import { computeSnapshot, flowsByMonth, type Flow, type Snapshot } from '../lib/finance';
import type { Account, Asset, Category, ID, MonthKey, PeculeData } from '../lib/types';
import { useDb } from './db';

/** Calculs mémorisés par référence : les données sont immuables, chaque version est calculée une fois. */

const snapshots = new WeakMap<PeculeData, Snapshot>();
export function getSnapshot(data: PeculeData): Snapshot {
  let s = snapshots.get(data);
  if (!s) {
    s = computeSnapshot(data);
    snapshots.set(data, s);
  }
  return s;
}

const flowCache = new WeakMap<PeculeData, Map<string, Map<MonthKey, Flow>>>();
export function getFlows(data: PeculeData, months: MonthKey[]): Map<MonthKey, Flow> {
  let byKey = flowCache.get(data);
  if (!byKey) {
    byKey = new Map();
    flowCache.set(data, byKey);
  }
  const key = months.join(',');
  let flows = byKey.get(key);
  if (!flows) {
    flows = flowsByMonth(data, months);
    byKey.set(key, flows);
  }
  return flows;
}

export const useData = () => useDb((s) => s.data);

export function useSnapshot(): Snapshot {
  const data = useData();
  return getSnapshot(data);
}

export function useFlows(months: MonthKey[]): Map<MonthKey, Flow> {
  const data = useData();
  return getFlows(data, months);
}

function useIndex<T extends { id: ID }>(list: T[]): Map<ID, T> {
  return useMemo(() => new Map(list.map((x) => [x.id, x])), [list]);
}

export const useAccountMap = (): Map<ID, Account> => useIndex(useDb((s) => s.data.accounts));
export const useCategoryMap = (): Map<ID, Category> => useIndex(useDb((s) => s.data.categories));
export const useAssetMap = (): Map<ID, Asset> => useIndex(useDb((s) => s.data.assets));

/** Comptes ouverts, dans l'ordre d'affichage. */
export function useActiveAccounts(): Account[] {
  const accounts = useDb((s) => s.data.accounts);
  return useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
}
