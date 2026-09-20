import { describe, expect, it } from 'vitest';
import { createCategorizer, labelKey } from './categorize';
import { emptyData } from './defaults';
import { parseAmountExpression } from './format';
import {
  buildCandidates,
  decodeText,
  detectDelimiter,
  detectFormat,
  extractCsvEntries,
  guessMapping,
  parseCsv,
  parseDateWith,
  parseOfx,
  parseQif,
} from './importer';
import type { Transaction } from './types';

const T = '2026-01-01T00:00:00.000Z';

describe('CSV', () => {
  it('lit un export avec une colonne montant (dates ISO, virgule décimale)', () => {
    const text = [
      'dateOp;dateVal;label;category;categoryParent;supplierFound;amount;accountNum;accountLabel;accountbalance',
      '2026-09-12;2026-09-12;"CARTE 11/09/26 CARREFOUR CITY CB*1234";"Alimentation";"Vie quotidienne";"carrefour";-23,45;000123;Compte;1234,56',
      '2026-09-10;2026-09-10;"VIR SEPA SALAIRE ACME";"Salaire";"Revenus";"";2850,00;000123;Compte;1258,01',
    ].join('\r\n');
    expect(detectFormat(text)).toBe('csv');
    const delimiter = detectDelimiter(text);
    expect(delimiter).toBe(';');
    const rows = parseCsv(text, delimiter);
    const mapping = guessMapping(rows);
    expect(mapping).toMatchObject({ skipRows: 1, dateCol: 0, labelCol: 2, amountCol: 6, dateFormat: 'YYYY-MM-DD' });
    const { entries, skipped } = extractCsvEntries(rows, mapping);
    expect(skipped).toBe(0);
    expect(entries.map((e) => [e.date, e.amount])).toEqual([
      ['2026-09-12', -23.45],
      ['2026-09-10', 2850],
    ]);
  });

  it('lit un export débit / crédit précédé de lignes d’information', () => {
    const text = [
      'Compte courant n° 12345678;;;',
      'Solde au 13/09/2026;1 234,56;;',
      ';;;',
      'Date;Libellé;Débit euros;Crédit euros;',
      '12/09/2026;"PAIEMENT PAR CARTE X1234 LIDL 11/09";23,45;;',
      '10/09/2026;"VIREMENT EN VOTRE FAVEUR ACME";;2 850,00;',
    ].join('\n');
    const rows = parseCsv(text, detectDelimiter(text));
    const mapping = guessMapping(rows);
    expect(mapping).toMatchObject({ dateCol: 0, labelCol: 1, amountCol: -1, debitCol: 2, creditCol: 3, dateFormat: 'DD/MM/YYYY' });
    const { entries } = extractCsvEntries(rows, mapping);
    expect(entries.map((e) => e.amount)).toEqual([-23.45, 2850]);
    expect(entries[0].label).toBe('PAIEMENT PAR CARTE X1234 LIDL 11/09');
  });

  it('gère les guillemets, séparateurs et retours à la ligne dans les champs', () => {
    const rows = parseCsv('a,"b, c","d ""e"""\n1,"x\ny",3', ',');
    expect(rows).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', 'x\ny', '3'],
    ]);
  });

  it('valide les dates selon le format', () => {
    expect(parseDateWith('31/12/2025', 'DD/MM/YYYY')).toBe('2025-12-31');
    expect(parseDateWith('31/02/2025', 'DD/MM/YYYY')).toBeNull();
    expect(parseDateWith('05.03.26', 'DD/MM/YY')).toBe('2026-03-05');
    expect(parseDateWith('2026-03-05T10:00:00', 'YYYY-MM-DD')).toBe('2026-03-05');
  });

  it('décode un fichier Windows-1252', () => {
    const bytes = new Uint8Array([0x44, 0xe9, 0x62, 0x69, 0x74]);
    expect(decodeText(bytes.buffer)).toBe('Débit');
  });
});

describe('OFX et QIF', () => {
  it('lit les opérations OFX', () => {
    const text = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912<TRNAMT>-23.45<FITID>1<NAME>CARREFOUR CITY<MEMO>CB 11/09</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260910120000<TRNAMT>2850,00<FITID>2<NAME>SALAIRE &amp; PRIME</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(detectFormat(text)).toBe('ofx');
    expect(parseOfx(text)).toEqual([
      { line: 1, date: '2026-09-12', label: 'CARREFOUR CITY — CB 11/09', amount: -23.45 },
      { line: 2, date: '2026-09-10', label: 'SALAIRE & PRIME', amount: 2850 },
    ]);
  });

  it('lit les opérations QIF', () => {
    const text = '!Type:Bank\nD12/09/2026\nT-23,45\nPCARREFOUR CITY\n^\nD10/09/2026\nT2 850,00\nPSALAIRE\n^\n';
    expect(detectFormat(text)).toBe('qif');
    expect(parseQif(text).map((e) => [e.date, e.amount, e.label])).toEqual([
      ['2026-09-12', -23.45, 'CARREFOUR CITY'],
      ['2026-09-10', 2850, 'SALAIRE'],
    ]);
  });
});

describe('doublons et classement', () => {
  const existing: Transaction[] = [
    { id: 'e1', date: '2026-09-11', label: 'CB CARREFOUR CITY', amount: 23.45, kind: 'expense', accountId: 'cc', createdAt: T },
  ];

  it('simplifie les libellés bancaires', () => {
    expect(labelKey('CARTE 11/09/26 CARREFOUR CITY CB*1234')).toBe('carrefour city');
    expect(labelKey('PRLV SEPA FREE MOBILE')).toBe('free mobile');
  });

  it('repère une transaction déjà saisie à la main', () => {
    const [candidate] = buildCandidates(
      [{ line: 1, date: '2026-09-12', label: 'CARTE 11/09/26 CARREFOUR CITY CB*1234', amount: -23.45 }],
      'cc',
      existing,
    );
    expect(candidate.duplicateOf).toBe('e1');
  });

  it('repère une ligne déjà importée et distingue deux achats identiques', () => {
    const entries = [
      { line: 1, date: '2026-09-12', label: 'CAFE', amount: -2.5 },
      { line: 2, date: '2026-09-12', label: 'CAFE', amount: -2.5 },
    ];
    const first = buildCandidates(entries, 'cc', []);
    expect(first[0].hash).not.toBe(first[1].hash);
    const imported = first.map((c, i) => ({ ...existing[0], id: `i${i}`, label: c.label, date: c.date, amount: 2.5, importHash: c.hash }));
    expect(buildCandidates(entries, 'cc', imported).map((c) => c.duplicateOf)).toEqual(['i0', 'i1']);
  });

  it('propose une catégorie par règle, historique ou marchand connu', () => {
    const data = emptyData();
    const id = (name: string) => data.categories.find((c) => c.name === name)!.id;
    data.rules = [{ id: 'r', pattern: 'navigo', categoryId: id('Transports'), createdAt: T }];
    data.transactions = [{ id: 't', date: '2026-09-01', label: 'CB SUSHI SHOP 01/09', amount: 20, kind: 'expense', accountId: 'cc', categoryId: id('Loisirs'), createdAt: T }];
    const c = createCategorizer(data);
    expect(c.suggest('PRLV NAVIGO ANNUEL', 'expense')).toBe(id('Transports'));
    expect(c.suggest('CB SUSHI SHOP 12/09', 'expense')).toBe(id('Loisirs'));
    expect(c.suggest('CB LIDL 11/09', 'expense')).toBe(id('Courses'));
    expect(c.suggest('VIR SALAIRE SEPTEMBRE', 'income')).toBe(id('Salaire'));
    expect(c.suggest('ZZZ INCONNU', 'expense')).toBeUndefined();
  });
});

describe('saisie des montants', () => {
  it('additionne une petite expression', () => {
    expect(parseAmountExpression('12,50 + 7 − 3')).toBe(16.5);
    expect(parseAmountExpression('1 234,56')).toBe(1234.56);
    expect(parseAmountExpression('-12')).toBe(-12);
    expect(parseAmountExpression('12 +')).toBeNull();
  });
});
