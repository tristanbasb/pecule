import { addDays, addMonths, addMonthsToDate, currentMonth, daysInMonth, diffDays, monthEnd, today } from './dates';
import { defaultCategories } from './defaults';
import { round2 } from './format';
import { priceAt, type PricePoints } from './history';
import { nowIso, uid } from './id';
import { occurrenceAt } from './recurring';
import type {
  Account,
  Asset,
  Category,
  ID,
  ISODate,
  InvestmentOp,
  PeculeData,
  Recurring,
  Transaction,
  Valuation,
} from './types';

/** Données de démonstration réalistes sur 14 mois, pour découvrir l'application. */

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoAssetSpec {
  key: string;
  name: string;
  symbol: string;
  assetClass: Asset['assetClass'];
  /** Cours approximatif actuel, utilisé si l'historique réel est indisponible. */
  fallback: number;
  drift: number;
}

const ASSETS: DemoAssetSpec[] = [
  { key: 'sp500', name: 'BNP Paribas Easy S&P 500', symbol: 'ESE.PA', assetClass: 'etf', fallback: 33.5, drift: 0.14 },
  { key: 'world', name: 'Amundi MSCI World', symbol: 'EWLD.PA', assetClass: 'etf', fallback: 40.8, drift: 0.13 },
  { key: 'tte', name: 'TotalEnergies', symbol: 'TTE.PA', assetClass: 'action', fallback: 78.8, drift: 0.12 },
  { key: 'btc', name: 'Bitcoin', symbol: 'BTC-EUR', assetClass: 'crypto', fallback: 66700, drift: 0.12 },
];

export type HistoryLoader = (symbol: string) => Promise<PricePoints>;

export async function buildDemoData(loadHistory?: HistoryLoader): Promise<PeculeData> {
  const rand = mulberry32(20260913);
  const between = (min: number, max: number) => round2(min + rand() * (max - min));
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const end = today();
  const startMonth = addMonths(currentMonth(), -13);
  const createdAt = nowIso();

  const categories: Category[] = defaultCategories();
  const cat = (name: string): ID => categories.find((c) => c.name === name)?.id as ID;
  const budgets: Record<string, number> = {
    Logement: 960,
    Courses: 450,
    'Restaurants & sorties': 220,
    Transports: 140,
    'Factures & énergie': 120,
    Abonnements: 60,
    Santé: 50,
    Shopping: 150,
    Loisirs: 100,
  };
  for (const c of categories) if (budgets[c.name]) c.budget = budgets[c.name];

  const account = (name: string, type: Account['type'], color: Account['color'], openingBalance: number, institution?: string): Account => ({
    id: uid(),
    name,
    type,
    color,
    openingBalance,
    openingDate: `${startMonth}-01`,
    institution,
    createdAt,
  });
  const checking = account('Compte courant', 'courant', 'c1', 2150, 'Banque en ligne');
  const livret = account('Livret A', 'epargne', 'c3', 7800, 'Banque en ligne');
  const pea = account('PEA', 'pea', 'c7', 0, 'Courtier en ligne');
  const av = account('Assurance-vie', 'assurance_vie', 'c5', 12500, 'Assureur');
  const crypto = account('Crypto', 'crypto', 'c4', 0, 'Plateforme');
  const home = account('Appartement', 'immobilier', 'c2', 245000);
  const loan = account('Crédit immobilier', 'credit', 'c8', 172400, 'Banque en ligne');
  const accounts = [checking, livret, pea, av, crypto, home, loan];

  /* ------------------------------------------------------------ Récurrences */
  const recurring: Recurring[] = [];
  const addRecurring = (r: Omit<Recurring, 'id' | 'createdAt' | 'active' | 'startDate'> & { day: number }) => {
    const { day, ...rest } = r;
    const rec: Recurring = {
      ...rest,
      id: uid(),
      active: true,
      startDate: `${startMonth}-${String(Math.min(day, daysInMonth(startMonth))).padStart(2, '0')}`,
      createdAt,
    };
    recurring.push(rec);
    return rec;
  };
  addRecurring({ label: 'Salaire', kind: 'income', amount: 2850, accountId: checking.id, categoryId: cat('Salaire'), frequency: 'monthly', day: 28 });
  addRecurring({ label: 'Échéance prêt immobilier', kind: 'expense', amount: 948.6, accountId: checking.id, categoryId: cat('Logement'), frequency: 'monthly', day: 5 });
  addRecurring({ label: 'Navigo', kind: 'expense', amount: 88.8, accountId: checking.id, categoryId: cat('Transports'), frequency: 'monthly', day: 3 });
  addRecurring({ label: 'EDF', kind: 'expense', amount: 71.4, accountId: checking.id, categoryId: cat('Factures & énergie'), frequency: 'monthly', day: 12 });
  addRecurring({ label: 'Free Box', kind: 'expense', amount: 29.99, accountId: checking.id, categoryId: cat('Abonnements'), frequency: 'monthly', day: 8 });
  addRecurring({ label: 'Netflix', kind: 'expense', amount: 13.49, accountId: checking.id, categoryId: cat('Abonnements'), frequency: 'monthly', day: 15 });
  addRecurring({ label: 'Spotify', kind: 'expense', amount: 11.12, accountId: checking.id, categoryId: cat('Abonnements'), frequency: 'monthly', day: 18 });
  addRecurring({ label: 'Épargne Livret A', kind: 'transfer', amount: 250, accountId: checking.id, toAccountId: livret.id, frequency: 'monthly', day: 29 });
  addRecurring({ label: 'Versement PEA', kind: 'transfer', amount: 400, accountId: checking.id, toAccountId: pea.id, frequency: 'monthly', day: 29 });
  addRecurring({ label: 'Versement crypto', kind: 'transfer', amount: 100, accountId: checking.id, toAccountId: crypto.id, frequency: 'monthly', day: 29 });

  const transactions: Transaction[] = [];
  const tx = (t: Omit<Transaction, 'id' | 'createdAt'>) => transactions.push({ ...t, id: uid(), createdAt });

  for (const r of recurring) {
    for (let i = 0; ; i++) {
      const date = occurrenceAt(r, i);
      if (date > end) break;
      r.lastDate = date;
      tx({ date, label: r.label, amount: r.amount, kind: r.kind, accountId: r.accountId, toAccountId: r.toAccountId, categoryId: r.categoryId, recurringId: r.id });
    }
  }

  /* ------------------------------------------------------- Vie quotidienne */
  const groceries = ['CARREFOUR MARKET', 'LIDL', 'MONOPRIX', 'PICARD', 'BIOCOOP', 'FRANPRIX'];
  const restaurants = ['UBER EATS', 'LE PETIT BISTROT', 'BOULANGERIE PAUL', 'SUSHI SHOP', 'CAFE DES ARTS', 'PIZZERIA NAPOLI'];
  const shopping = ['AMAZON', 'DECATHLON', 'FNAC', 'UNIQLO', 'IKEA', 'ZARA'];
  const leisure = ['UGC CINE CITE', 'FNAC SPECTACLES', 'STEAM', 'MUSEE DU LOUVRE', 'BASIC FIT'];

  for (let m = startMonth; m <= currentMonth(); m = addMonths(m, 1)) {
    const days = daysInMonth(m);
    const dayOf = (d: number): ISODate => `${m}-${String(Math.max(1, Math.min(days, d))).padStart(2, '0')}`;
    const inRange = (d: ISODate) => d <= end;
    const add = (d: ISODate, t: Omit<Transaction, 'id' | 'createdAt' | 'date'>) => inRange(d) && tx({ ...t, date: d });
    const month = Number(m.slice(5, 7));

    for (let i = 0, n = 7 + Math.floor(rand() * 3); i < n; i++) {
      add(dayOf(1 + Math.floor(rand() * days)), { label: `CB ${pick(groceries)}`, amount: between(18, 96), kind: 'expense', accountId: checking.id, categoryId: cat('Courses') });
    }
    for (let i = 0, n = 3 + Math.floor(rand() * 4); i < n; i++) {
      add(dayOf(1 + Math.floor(rand() * days)), { label: `CB ${pick(restaurants)}`, amount: between(9, 58), kind: 'expense', accountId: checking.id, categoryId: cat('Restaurants & sorties') });
    }
    for (let i = 0, n = 1 + Math.floor(rand() * 2); i < n; i++) {
      add(dayOf(1 + Math.floor(rand() * days)), { label: `CB ${pick(shopping)}`, amount: between(15, 120), kind: 'expense', accountId: checking.id, categoryId: cat('Shopping') });
    }
    if (rand() > 0.3) add(dayOf(6 + Math.floor(rand() * 20)), { label: `CB ${pick(leisure)}`, amount: between(12, 65), kind: 'expense', accountId: checking.id, categoryId: cat('Loisirs') });
    if (rand() > 0.5) add(dayOf(4 + Math.floor(rand() * 20)), { label: 'CB TOTAL ACCESS', amount: between(45, 70), kind: 'expense', accountId: checking.id, categoryId: cat('Transports') });
    if (rand() > 0.55) {
      const d = dayOf(3 + Math.floor(rand() * 20));
      add(d, { label: 'DOCTOLIB MEDECIN GENERALISTE', amount: 30, kind: 'expense', accountId: checking.id, categoryId: cat('Santé') });
      add(addDays(d, 4), { label: 'VIR CPAM REMBOURSEMENT', amount: 21, kind: 'income', accountId: checking.id, categoryId: cat('Santé') });
    }
    if (rand() > 0.6) add(dayOf(2 + Math.floor(rand() * 25)), { label: 'CB PHARMACIE DU MARCHE', amount: between(6, 32), kind: 'expense', accountId: checking.id, categoryId: cat('Santé') });

    if (month === 12) {
      add(dayOf(20), { label: 'Prime de fin d’année', amount: 1200, kind: 'income', accountId: checking.id, categoryId: cat('Salaire') });
      add(dayOf(14), { label: 'CB GALERIES LAFAYETTE', amount: 186.4, kind: 'expense', accountId: checking.id, categoryId: cat('Cadeaux & dons') });
      add(dayOf(21), { label: 'SNCF CONNECT', amount: 142, kind: 'expense', accountId: checking.id, categoryId: cat('Voyages') });
    }
    if (month === 10) add(dayOf(15), { label: 'TAXE FONCIERE DGFIP', amount: 894, kind: 'expense', accountId: checking.id, categoryId: cat('Impôts & taxes') });
    if (month === 7) {
      add(dayOf(9), { label: 'AIRBNB', amount: 640, kind: 'expense', accountId: checking.id, categoryId: cat('Voyages') });
      add(dayOf(11), { label: 'SNCF CONNECT', amount: 176, kind: 'expense', accountId: checking.id, categoryId: cat('Voyages') });
    }
    if (month === 3) add(dayOf(2), { label: 'COTISATION CARTE VISA', amount: 45, kind: 'expense', accountId: checking.id, categoryId: cat('Frais bancaires') });
    if (month === 5) add(dayOf(18), { label: 'Vente Vinted', amount: 64, kind: 'income', accountId: checking.id, categoryId: cat('Revenus annexes') });
    if (month === 1) {
      add(dayOf(1), { label: 'Intérêts Livret A', amount: 183.2, kind: 'income', accountId: livret.id, categoryId: cat('Intérêts & dividendes') });
    }
  }

  /* ------------------------------------------------------------- Placements */
  const histories = new Map<string, PricePoints>();
  if (loadHistory) {
    await Promise.all(
      ASSETS.map(async (a) => {
        try {
          const points = await loadHistory(a.symbol);
          if (points.length > 20) histories.set(a.key, points);
        } catch {
          /* cours de repli */
        }
      }),
    );
  }
  const priceOn = (spec: DemoAssetSpec, date: ISODate) => {
    const h = histories.get(spec.key);
    if (h) return priceAt(h, date) ?? spec.fallback;
    const years = diffDays(date, end) / 365;
    return round2((spec.fallback / Math.pow(1 + spec.drift, years)) * (1 + 0.04 * Math.sin(years * 9)));
  };

  const assets: Asset[] = ASSETS.map((a) => ({
    id: uid(),
    name: a.name,
    symbol: a.symbol,
    provider: 'yahoo',
    assetClass: a.assetClass,
    currency: 'EUR',
    createdAt,
  }));
  const assetId = (key: string) => assets[ASSETS.findIndex((a) => a.key === key)].id;
  const spec = (key: string) => ASSETS.find((a) => a.key === key) as DemoAssetSpec;

  const operations: InvestmentOp[] = [];
  const op = (o: Omit<InvestmentOp, 'id' | 'createdAt'>) => operations.push({ ...o, id: uid(), createdAt });
  const buyFor = (key: string, accountId: ID, date: ISODate, budget: number, fees = 0) => {
    const price = priceOn(spec(key), date);
    const quantity = key === 'btc' ? Math.floor((budget / price) * 1e6) / 1e6 : Math.floor(budget / price);
    if (quantity > 0) op({ accountId, date, type: 'buy', assetId: assetId(key), quantity, unitPrice: round2(price), fees });
  };

  // Positions constituées avant le début du suivi (achats financés par un apport).
  const initialDate = `${startMonth}-02`;
  const initialWorld = priceOn(spec('world'), initialDate);
  op({ accountId: pea.id, date: initialDate, type: 'buy', assetId: assetId('world'), quantity: Math.floor(9000 / initialWorld), unitPrice: round2(initialWorld), fees: 1.99, newMoney: true });
  const initialTte = priceOn(spec('tte'), initialDate);
  op({ accountId: pea.id, date: initialDate, type: 'buy', assetId: assetId('tte'), quantity: 40, unitPrice: round2(initialTte), fees: 1.99, newMoney: true });

  for (let m = startMonth; m <= currentMonth(); m = addMonths(m, 1)) {
    const buyDate = addDays(monthEnd(m), 1);
    if (buyDate > end) break;
    buyFor(m.slice(5) === '01' || m.slice(5) === '07' ? 'world' : 'sp500', pea.id, buyDate, 395, 0.99);
    buyFor('btc', crypto.id, buyDate, 99);
  }
  for (const [month, perShare] of [['01', 0.85], ['04', 0.85], ['06', 0.85], ['10', 0.85]] as const) {
    for (let m = startMonth; m <= currentMonth(); m = addMonths(m, 1)) {
      if (m.slice(5) !== month) continue;
      const date = `${m}-15`;
      if (date <= end) op({ accountId: pea.id, date, type: 'dividend', assetId: assetId('tte'), amount: round2(40 * perShare) });
    }
  }
  // Assurance-vie en fonds euros : versements trimestriels et intérêts annuels.
  for (let i = 0; i < 20; i++) {
    const date = addMonthsToDate(`${startMonth}-10`, i * 3);
    if (date > end) break;
    op({ accountId: av.id, date, type: 'deposit', amount: 300 });
  }
  op({ accountId: av.id, date: `${addMonths(currentMonth(), -(Number(currentMonth().slice(5)) - 1))}-02`, type: 'interest', amount: 318.4 });

  /* --------------------------------------------------- Biens et crédit */
  const valuations: Valuation[] = [];
  for (let i = 0; ; i++) {
    const date = addMonthsToDate(`${startMonth}-05`, i);
    if (date > end) break;
    valuations.push({ id: uid(), accountId: loan.id, date, value: round2(172400 - 618 * (i + 1) - i * 1.9) });
    if (i % 6 === 5) valuations.push({ id: uid(), accountId: home.id, date, value: 245000 + 3000 * ((i + 1) / 6) });
  }

  return {
    version: 1,
    settings: { onboarded: true },
    accounts,
    categories,
    transactions,
    assets,
    operations,
    valuations,
    recurring,
    rules: [{ id: uid(), pattern: 'TOTAL ACCESS', categoryId: cat('Transports'), createdAt }],
    importProfiles: [],
  };
}
