import type { AccountKind, AccountType, AssetClass, ColorKey, Frequency, OpType, TxKind } from './types';

export interface AccountTypeMeta {
  label: string;
  kind: AccountKind;
  icon: string;
  hint: string;
}

export const ACCOUNT_TYPES: Record<AccountType, AccountTypeMeta> = {
  courant: { label: 'Compte courant', kind: 'cash', icon: 'wallet', hint: 'Dépenses du quotidien' },
  epargne: { label: "Livret d'épargne", kind: 'cash', icon: 'piggy-bank', hint: 'Livret A, LDDS, LEP…' },
  pea: { label: 'PEA', kind: 'invest', icon: 'chart-line', hint: 'Actions et ETF européens' },
  cto: { label: 'Compte-titres', kind: 'invest', icon: 'chart-column', hint: 'Actions et ETF du monde entier' },
  assurance_vie: { label: 'Assurance-vie', kind: 'invest', icon: 'umbrella', hint: 'Fonds euros et unités de compte' },
  per: { label: 'PER', kind: 'invest', icon: 'landmark', hint: 'Épargne retraite' },
  crypto: { label: 'Crypto', kind: 'invest', icon: 'bitcoin', hint: 'Plateforme ou portefeuille' },
  immobilier: { label: 'Immobilier', kind: 'asset', icon: 'house', hint: "Valeur estimée d'un bien" },
  autre_actif: { label: 'Autre bien', kind: 'asset', icon: 'gem', hint: 'Véhicule, objet de valeur…' },
  credit: { label: 'Crédit', kind: 'liability', icon: 'scale', hint: 'Capital restant dû' },
};

export const ACCOUNT_TYPE_ORDER = Object.keys(ACCOUNT_TYPES) as AccountType[];

export const accountKind = (type: AccountType): AccountKind => ACCOUNT_TYPES[type].kind;

export const KIND_LABELS: Record<AccountKind, string> = {
  cash: 'Liquidités',
  invest: 'Placements',
  asset: 'Biens',
  liability: 'Dettes',
};

export const KIND_ORDER: AccountKind[] = ['cash', 'invest', 'asset', 'liability'];

export const ASSET_CLASSES: Record<AssetClass, { label: string; color: ColorKey }> = {
  etf: { label: 'ETF', color: 'c1' },
  action: { label: 'Actions', color: 'c2' },
  crypto: { label: 'Crypto', color: 'c3' },
  obligation: { label: 'Obligations', color: 'c4' },
  fonds: { label: 'Fonds', color: 'c5' },
  autre: { label: 'Autres', color: 'c6' },
};

export const ASSET_CLASS_ORDER = Object.keys(ASSET_CLASSES) as AssetClass[];

export const OP_TYPES: Record<OpType, { label: string; withAsset: boolean }> = {
  buy: { label: 'Achat', withAsset: true },
  sell: { label: 'Vente', withAsset: true },
  dividend: { label: 'Dividende', withAsset: true },
  deposit: { label: 'Versement', withAsset: false },
  withdrawal: { label: 'Retrait', withAsset: false },
  interest: { label: 'Intérêts', withAsset: false },
  fee: { label: 'Frais', withAsset: false },
};

export const TX_KINDS: Record<TxKind, string> = {
  expense: 'Dépense',
  income: 'Revenu',
  transfer: 'Virement',
};

export const FREQUENCIES: Record<Frequency, string> = {
  weekly: 'Chaque semaine',
  monthly: 'Chaque mois',
  quarterly: 'Chaque trimestre',
  yearly: 'Chaque année',
};

export const COLOR_KEYS: ColorKey[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

export const COLOR_NAMES: Record<ColorKey, string> = {
  c1: 'Bleu',
  c2: 'Orange',
  c3: 'Aqua',
  c4: 'Jaune',
  c5: 'Rose',
  c6: 'Vert',
  c7: 'Violet',
  c8: 'Rouge',
};

/** Couleur CSS d'un emplacement de palette (suit le thème clair/sombre). */
export const colorVar = (key: ColorKey | undefined) => `var(--series-${(key ?? 'c1').slice(1)})`;
