import { describe, expect, it } from 'vitest';
import { emptyData } from './defaults';
import {
  budgetStatus,
  computePositions,
  computeSnapshot,
  flowsByMonth,
  txEffect,
  xirr,
} from './finance';
import { formatMoney, formatPct, normalizeText, parseAmount } from './format';
import { buildPriceSeries, netWorthSeries, priceAt, toEurPoints } from './history';
import { dueOccurrences, materializeRecurring, occurrenceAt } from './recurring';
import type { Account, Asset, InvestmentOp, PeculeData, Recurring, Transaction } from './types';

const T = '2026-01-01T00:00:00.000Z';

const account = (id: string, type: Account['type'], openingBalance = 0): Account => ({
  id,
  name: id,
  type,
  color: 'c1',
  openingBalance,
  openingDate: '2026-01-01',
  createdAt: T,
});

const tx = (p: Partial<Transaction> & Pick<Transaction, 'kind' | 'amount' | 'accountId'>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-03-10',
  label: 'x',
  createdAt: T,
  ...p,
});

const op = (p: Partial<InvestmentOp> & Pick<InvestmentOp, 'type' | 'accountId'>): InvestmentOp => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-03-12',
  createdAt: T,
  ...p,
});

describe('format', () => {
  it('lit les montants français et anglais', () => {
    expect(parseAmount('1 234,56')).toBe(1234.56);
    expect(parseAmount('1 234,56 €')).toBe(1234.56);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1,234.56')).toBe(1234.56);
    expect(parseAmount('-12,5')).toBe(-12.5);
    expect(parseAmount('42')).toBe(42);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it('formate les montants avec un vrai signe moins', () => {
    // Intl utilise des espaces insécables : on les ramène à des espaces simples pour comparer.
    const plain = (s: string) => s.replace(/\s/g, ' ');
    expect(plain(formatMoney(-12.5))).toBe('−12,50 €');
    expect(plain(formatMoney(1234.5, { sign: true }))).toBe('+1 234,50 €');
    expect(plain(formatMoney(-0.001))).toBe('0,00 €');
    expect(plain(formatPct(0.1234, { sign: true }))).toBe('+12,3 %');
  });

  it('normalise les libellés', () => {
    expect(normalizeText('  Café  Élysée ')).toBe('cafe elysee');
  });
});

describe('transactions', () => {
  it('calcule l’effet sur chaque compte', () => {
    const t = tx({ kind: 'transfer', amount: 100, accountId: 'a', toAccountId: 'b' });
    expect(txEffect(t, 'a')).toBe(-100);
    expect(txEffect(t, 'b')).toBe(100);
    expect(txEffect(tx({ kind: 'expense', amount: 5, accountId: 'a' }), 'a')).toBe(-5);
    expect(txEffect(tx({ kind: 'income', amount: 5, accountId: 'a' }), 'a')).toBe(5);
  });
});

describe('positions', () => {
  it('suit le PRU au coût moyen pondéré et la plus-value réalisée', () => {
    const ops = [
      op({ type: 'buy', accountId: 'pea', assetId: 'cw8', quantity: 10, unitPrice: 100, fees: 1, date: '2026-01-02' }),
      op({ type: 'buy', accountId: 'pea', assetId: 'cw8', quantity: 10, unitPrice: 120, date: '2026-02-02' }),
      op({ type: 'sell', accountId: 'pea', assetId: 'cw8', quantity: 5, unitPrice: 130, fees: 1, date: '2026-03-02' }),
    ];
    const p = computePositions(ops).get('pea:cw8');
    expect(p?.quantity).toBe(15);
    expect(p?.avgPrice).toBeCloseTo(110.05, 6);
    expect(p?.costBasis).toBeCloseTo(1650.75, 6);
    expect(p?.realized).toBeCloseTo(650 - 1 - 550.25, 6);
  });
});

function sampleData(): PeculeData {
  const data = emptyData();
  const food = data.categories.find((c) => c.name === 'Courses')!;
  const salary = data.categories.find((c) => c.name === 'Salaire')!;
  const cw8: Asset = { id: 'cw8', name: 'MSCI World', assetClass: 'etf', provider: 'yahoo', symbol: 'CW8.PA', currency: 'EUR', lastPrice: 110, lastPriceAt: '2026-03-20T16:00:00Z', changePct: 1, createdAt: T };
  return {
    ...data,
    accounts: [account('cc', 'courant', 1000), account('pea', 'pea'), account('home', 'immobilier', 200000), account('loan', 'credit', 150000)],
    transactions: [
      tx({ kind: 'expense', amount: 50, accountId: 'cc', categoryId: food.id }),
      tx({ kind: 'income', amount: 10, accountId: 'cc', categoryId: food.id, label: 'remboursement' }),
      tx({ kind: 'income', amount: 2000, accountId: 'cc', categoryId: salary.id }),
      tx({ kind: 'transfer', amount: 500, accountId: 'cc', toAccountId: 'pea' }),
      tx({ kind: 'expense', amount: 999, accountId: 'cc', date: '2099-01-01' }),
    ],
    assets: [cw8],
    operations: [op({ type: 'buy', accountId: 'pea', assetId: 'cw8', quantity: 4, unitPrice: 100 })],
    valuations: [{ id: 'v1', accountId: 'loan', date: '2026-03-01', value: 140000 }],
  };
}

describe('snapshot', () => {
  it('valorise comptes, placements, biens et dettes', () => {
    const s = computeSnapshot(sampleData(), '2026-03-31');
    const cc = s.byId.get('cc')!;
    const pea = s.byId.get('pea')!;
    expect(cc.value).toBe(1000 - 50 + 10 + 2000 - 500);
    expect(pea.cash).toBe(100);
    expect(pea.holdingsValue).toBe(440);
    expect(pea.value).toBe(540);
    expect(pea.contributions).toBe(500);
    expect(pea.gain).toBe(40);
    expect(s.byId.get('loan')!.value).toBe(-140000);
    expect(s.netWorth).toBe(2460 + 540 + 200000 - 140000);
  });

  it('ignore les transactions futures', () => {
    const s = computeSnapshot(sampleData(), '2026-03-31');
    expect(s.byId.get('cc')!.value).toBe(2460);
  });

  it('compte un achat en « nouvel apport » comme un versement', () => {
    const data = sampleData();
    data.operations = [op({ type: 'buy', accountId: 'pea', assetId: 'cw8', quantity: 1, unitPrice: 100, fees: 2, newMoney: true })];
    data.transactions = [];
    const pea = computeSnapshot(data, '2026-03-31').byId.get('pea')!;
    expect(pea.cash).toBe(0);
    expect(pea.contributions).toBe(102);
    expect(pea.value).toBe(110);
  });
});

describe('budget', () => {
  it('déduit les remboursements de la catégorie et calcule le taux d’épargne', () => {
    const data = sampleData();
    const flow = flowsByMonth(data, ['2026-03']).get('2026-03')!;
    expect(flow.expense).toBe(40);
    expect(flow.income).toBe(2000);
    expect(flow.net).toBe(1960);
    expect(flow.savingsRate).toBeCloseTo(0.98, 6);
  });

  it('classe l’état d’un budget', () => {
    expect(budgetStatus(50, 100)).toBe('ok');
    expect(budgetStatus(95, 100)).toBe('warning');
    expect(budgetStatus(101, 100)).toBe('over');
    expect(budgetStatus(10, 0)).toBe('none');
  });
});

describe('récurrences', () => {
  const r: Recurring = {
    id: 'r',
    label: 'Loyer',
    kind: 'expense',
    amount: 800,
    accountId: 'cc',
    frequency: 'monthly',
    startDate: '2026-01-31',
    active: true,
    createdAt: T,
  };

  it('garde le jour d’ancrage en fin de mois', () => {
    expect([0, 1, 2, 3].map((i) => occurrenceAt(r, i))).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('ne recrée pas les occurrences déjà générées', () => {
    expect(dueOccurrences({ ...r, lastDate: '2026-02-28' }, '2026-04-30')).toEqual(['2026-03-31', '2026-04-30']);
    expect(dueOccurrences({ ...r, endDate: '2026-02-28' }, '2026-04-30')).toEqual(['2026-01-31', '2026-02-28']);
  });

  it('matérialise les transactions échues', () => {
    const data = { ...emptyData(), accounts: [account('cc', 'courant')], recurring: [r] };
    const result = materializeRecurring(data, '2026-03-31')!;
    expect(result.created).toHaveLength(3);
    expect(result.data.recurring[0].lastDate).toBe('2026-03-31');
    expect(materializeRecurring(result.data, '2026-03-31')).toBeNull();
  });
});

describe('rendement', () => {
  it('calcule un TRI annuel', () => {
    const rate = xirr([
      { date: '2025-01-01', amount: -1000 },
      { date: '2026-01-01', amount: 1100 },
    ]);
    expect(rate).toBeCloseTo(0.1, 2);
  });

  it('renvoie null sans flux de signe opposé', () => {
    expect(xirr([{ date: '2025-01-01', amount: -1000 }])).toBeNull();
  });
});

describe('historique', () => {
  it('retrouve le cours à une date', () => {
    const series: [string, number][] = [['2026-01-01', 10], ['2026-01-05', 12]];
    expect(priceAt(series, '2025-12-01')).toBe(10);
    expect(priceAt(series, '2026-01-03')).toBe(10);
    expect(priceAt(series, '2026-01-05')).toBe(12);
    expect(priceAt(series, '2026-02-01')).toBe(12);
  });

  it('convertit un historique en euros', () => {
    const eur = toEurPoints({ currency: 'USD', points: [['2026-01-02', 100], ['2026-01-03', 110]] }, [['2026-01-01', 0.9], ['2026-01-03', 0.8]]);
    expect(eur).toEqual([['2026-01-02', 90], ['2026-01-03', 88]]);
  });

  it('reconstitue le patrimoine dans le temps', () => {
    const data = sampleData();
    const prices = new Map([['cw8', buildPriceSeries(data.assets[0], data.operations, [['2026-03-15', 105]])]]);
    const [before, after] = netWorthSeries(data, ['2026-03-01', '2026-03-16'], prices);
    expect(before.cash).toBe(1000);
    expect(before.invest).toBe(0);
    expect(after.cash).toBe(2460);
    expect(after.invest).toBe(100 + 4 * 105);
    expect(after.contributions).toBe(500);
  });
});
