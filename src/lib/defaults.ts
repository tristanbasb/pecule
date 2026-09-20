import { uid } from './id';
import type { Category, ColorKey, PeculeData } from './types';

type CategorySeed = [name: string, icon: string, color: ColorKey];

const EXPENSE_SEEDS: CategorySeed[] = [
  ['Logement', 'house', 'c1'],
  ['Courses', 'shopping-cart', 'c3'],
  ['Restaurants & sorties', 'utensils', 'c2'],
  ['Transports', 'car', 'c7'],
  ['Factures & énergie', 'zap', 'c4'],
  ['Abonnements', 'repeat', 'c5'],
  ['Santé', 'heart-pulse', 'c8'],
  ['Shopping', 'shopping-bag', 'c5'],
  ['Loisirs', 'gamepad-2', 'c6'],
  ['Voyages', 'plane', 'c1'],
  ['Cadeaux & dons', 'gift', 'c2'],
  ['Impôts & taxes', 'landmark', 'c7'],
  ['Frais bancaires', 'receipt', 'c4'],
  ['Divers', 'package', 'c3'],
];

const INCOME_SEEDS: CategorySeed[] = [
  ['Salaire', 'briefcase', 'c6'],
  ['Revenus annexes', 'sparkles', 'c3'],
  ['Remboursements', 'rotate-ccw', 'c1'],
  ['Aides & allocations', 'hand-coins', 'c7'],
  ['Intérêts & dividendes', 'percent', 'c4'],
];

export function defaultCategories(): Category[] {
  return [
    ...EXPENSE_SEEDS.map(([name, icon, color]) => ({ id: uid(), name, icon, color, type: 'expense' as const })),
    ...INCOME_SEEDS.map(([name, icon, color]) => ({ id: uid(), name, icon, color, type: 'income' as const })),
  ];
}

export function emptyData(): PeculeData {
  return {
    version: 1,
    settings: { onboarded: false },
    accounts: [],
    categories: defaultCategories(),
    transactions: [],
    assets: [],
    operations: [],
    valuations: [],
    recurring: [],
    rules: [],
    importProfiles: [],
  };
}

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Complète un fichier incomplet ou ancien pour qu'il respecte le modèle actuel. */
export function sanitizeData(raw: unknown): PeculeData {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Partial<PeculeData>;
  const settings = src.settings && typeof src.settings === 'object' ? src.settings : { onboarded: false };
  return {
    version: 1,
    settings: { onboarded: Boolean(settings.onboarded), displayName: settings.displayName },
    accounts: arr(src.accounts),
    categories: Array.isArray(src.categories) ? src.categories : defaultCategories(),
    transactions: arr(src.transactions),
    assets: arr(src.assets),
    operations: arr(src.operations),
    valuations: arr(src.valuations),
    recurring: arr(src.recurring),
    rules: arr(src.rules),
    importProfiles: arr(src.importProfiles),
  };
}

export function looksLikePeculeData(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const o = raw as Record<string, unknown>;
  return Array.isArray(o.accounts) && Array.isArray(o.transactions) && Array.isArray(o.categories);
}
