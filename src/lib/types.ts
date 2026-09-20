/** Modèle de données de Pécule. Tous les montants sont en euros. */

export type ID = string;
/** Date locale au format AAAA-MM-JJ. */
export type ISODate = string;
/** Mois au format AAAA-MM. */
export type MonthKey = string;

/** Couleur d'identité : un emplacement de la palette catégorielle (c1 à c8). */
export type ColorKey = 'c1' | 'c2' | 'c3' | 'c4' | 'c5' | 'c6' | 'c7' | 'c8';

export type AccountType =
  | 'courant'
  | 'epargne'
  | 'pea'
  | 'cto'
  | 'assurance_vie'
  | 'per'
  | 'crypto'
  | 'immobilier'
  | 'autre_actif'
  | 'credit';

/** cash : solde issu des transactions · invest : positions + espèces · asset / liability : estimations. */
export type AccountKind = 'cash' | 'invest' | 'asset' | 'liability';

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  institution?: string;
  color: ColorKey;
  /** Solde (ou espèces pour un compte d'investissement) à la date d'ouverture du suivi. */
  openingBalance: number;
  openingDate: ISODate;
  archived?: boolean;
  createdAt: string;
}

export type TxKind = 'expense' | 'income' | 'transfer';

export interface Transaction {
  id: ID;
  date: ISODate;
  label: string;
  /** Toujours positif ; le sens vient de `kind`. */
  amount: number;
  kind: TxKind;
  accountId: ID;
  /** Compte de destination d'un virement. */
  toAccountId?: ID;
  categoryId?: ID;
  note?: string;
  recurringId?: ID;
  /** Correction de solde : exclue du budget et des statistiques. */
  adjustment?: boolean;
  /** Empreinte de la ligne importée, pour repérer les doublons. */
  importHash?: string;
  createdAt: string;
}

export type CategoryType = 'expense' | 'income';

export interface Category {
  id: ID;
  name: string;
  type: CategoryType;
  icon: string;
  color: ColorKey;
  /** Budget mensuel (dépenses) ou montant attendu (revenus). */
  budget?: number;
  archived?: boolean;
}

export type AssetClass = 'etf' | 'action' | 'crypto' | 'obligation' | 'fonds' | 'autre';
export type PriceProvider = 'yahoo' | 'coingecko' | 'manual';

export interface Asset {
  id: ID;
  name: string;
  assetClass: AssetClass;
  provider: PriceProvider;
  /** Symbole Yahoo (ex. CW8.PA) ou identifiant CoinGecko (ex. bitcoin). */
  symbol?: string;
  /** Devise de cotation du symbole. */
  currency: string;
  isin?: string;
  /** Dernier cours connu, converti en euros. */
  lastPrice?: number;
  lastPriceAt?: string;
  changePct?: number | null;
  /** Cours saisis à la main, en euros. */
  manualPrices?: [ISODate, number][];
  createdAt: string;
}

export type OpType = 'buy' | 'sell' | 'dividend' | 'deposit' | 'withdrawal' | 'fee' | 'interest';

export interface InvestmentOp {
  id: ID;
  accountId: ID;
  date: ISODate;
  type: OpType;
  assetId?: ID;
  quantity?: number;
  unitPrice?: number;
  fees?: number;
  /** Montant des opérations sans titre (dividende, versement, retrait, frais, intérêts). */
  amount?: number;
  /** Achat payé par un nouvel apport plutôt que par les espèces du compte. */
  newMoney?: boolean;
  note?: string;
  createdAt: string;
}

export interface Valuation {
  id: ID;
  accountId: ID;
  date: ISODate;
  /** Valeur estimée (bien) ou capital restant dû (crédit), toujours positif. */
  value: number;
  note?: string;
}

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Recurring {
  id: ID;
  label: string;
  kind: TxKind;
  amount: number;
  accountId: ID;
  toAccountId?: ID;
  categoryId?: ID;
  frequency: Frequency;
  startDate: ISODate;
  endDate?: ISODate;
  /** Dernière occurrence déjà créée. */
  lastDate?: ISODate;
  active: boolean;
  createdAt: string;
}

export interface Rule {
  id: ID;
  /** Texte recherché dans le libellé, sans tenir compte de la casse ni des accents. */
  pattern: string;
  categoryId: ID;
  createdAt: string;
}

export type DateFormat = 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YY';

export interface ImportProfile {
  accountId: ID;
  delimiter: string;
  skipRows: number;
  dateCol: number;
  labelCol: number;
  amountCol: number;
  debitCol: number;
  creditCol: number;
  dateFormat: DateFormat;
}

export interface Settings {
  onboarded: boolean;
  /** Affiché dans l'accueil. */
  displayName?: string;
}

export interface PeculeData {
  version: 1;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  assets: Asset[];
  operations: InvestmentOp[];
  valuations: Valuation[];
  recurring: Recurring[];
  rules: Rule[];
  importProfiles: ImportProfile[];
}
