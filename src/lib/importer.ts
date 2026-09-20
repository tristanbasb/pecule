import { labelKey } from './categorize';
import { diffDays, isValidISODate } from './dates';
import { txEffect } from './finance';
import { normalizeText, parseAmount } from './format';
import type { DateFormat, ID, ISODate, ImportProfile, Transaction } from './types';

/** Lecture des relevés bancaires : CSV (toutes banques), OFX et QIF. */

export type FileFormat = 'csv' | 'ofx' | 'qif';

export interface ParsedEntry {
  line: number;
  date: ISODate;
  label: string;
  /** Positif = crédit, négatif = débit. */
  amount: number;
}

/** UTF-8 si possible, sinon Windows-1252 (fréquent dans les exports des banques françaises). */
export function decodeText(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function detectFormat(text: string): FileFormat {
  const head = text.slice(0, 3000).toUpperCase();
  if (head.includes('<OFX>') || head.includes('OFXHEADER')) return 'ofx';
  if (/^\s*!TYPE:/i.test(text)) return 'qif';
  return 'csv';
}

/* ---------------------------------------------------------------------- CSV */

export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      inQuotes = true;
      field = '';
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some((c) => c !== ''));
}

export const DELIMITERS: { value: string; label: string }[] = [
  { value: ';', label: 'Point-virgule ( ; )' },
  { value: ',', label: 'Virgule ( , )' },
  { value: '\t', label: 'Tabulation' },
  { value: '|', label: 'Barre verticale ( | )' },
];

export function detectDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 25);
  let best = ';';
  let bestScore = -1;
  for (const { value: d } of DELIMITERS) {
    const freq = new Map<number, number>();
    for (const l of lines) {
      const n = parseCsv(l, d)[0]?.length ?? 0;
      freq.set(n, (freq.get(n) ?? 0) + 1);
    }
    let score = 0;
    for (const [cols, count] of freq) if (cols > 1) score = Math.max(score, count * 100 + cols);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

export const DATE_FORMATS: DateFormat[] = ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD/MM/YY', 'MM/DD/YYYY'];

export function parseDateWith(value: string, format: DateFormat): ISODate | null {
  const token = value.trim().split(/[ T]/)[0] ?? '';
  const parts = token.split(/[/.-]/);
  if (parts.length !== 3 || parts.some((p) => !/^\d+$/.test(p))) return null;
  let [a, b, c] = parts;
  let y: string;
  let m: string;
  let d: string;
  switch (format) {
    case 'YYYY-MM-DD':
      [y, m, d] = [a, b, c];
      break;
    case 'MM/DD/YYYY':
      [m, d, y] = [a, b, c];
      break;
    default:
      [d, m, y] = [a, b, c];
  }
  if (format === 'DD/MM/YY') {
    if (y.length !== 2) return null;
    y = (Number(y) <= (new Date().getFullYear() % 100) + 1 ? '20' : '19') + y;
  } else if (y.length !== 4) {
    return null;
  }
  const iso = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
}

export function guessDateFormat(values: string[]): DateFormat {
  const sample = values.filter((v) => v.trim()).slice(0, 40);
  let best: DateFormat = 'DD/MM/YYYY';
  let bestCount = -1;
  for (const f of DATE_FORMATS) {
    const count = sample.filter((v) => parseDateWith(v, f)).length;
    if (count > bestCount) {
      best = f;
      bestCount = count;
    }
  }
  return best;
}

export type CsvMapping = Omit<ImportProfile, 'accountId' | 'delimiter'>;

const HEADER_HINT = /(libell|montant|d[ée]bit|cr[ée]dit|description|label|amount|op[ée]ration|intitul)/i;

export function guessMapping(rows: string[][]): CsvMapping {
  const headerIndex = rows.slice(0, 15).findIndex(
    (r) => r.some((c) => /date/i.test(c)) && r.some((c) => HEADER_HINT.test(c)),
  );
  const header = headerIndex >= 0 ? rows[headerIndex].map((c) => normalizeText(c)) : [];
  const data = rows.slice(headerIndex + 1, headerIndex + 41);
  const width = Math.max(0, ...rows.map((r) => r.length));
  const cols = Array.from({ length: width }, (_, i) => i);
  const find = (re: RegExp, exclude: number[] = []) => header.findIndex((h, i) => re.test(h) && !exclude.includes(i));

  const ratio = (col: number, test: (v: string) => boolean) =>
    data.length ? data.filter((r) => r[col] && test(r[col])).length / data.length : 0;
  const isDate = (v: string) => DATE_FORMATS.some((f) => parseDateWith(v, f));

  let dateCol = find(/date.*(op|compta)/);
  if (dateCol < 0) dateCol = find(/^date$/);
  if (dateCol < 0) dateCol = find(/date(?!.*valeur)/);
  if (dateCol < 0) dateCol = find(/date/);
  if (dateCol < 0) dateCol = [...cols].sort((a, b) => ratio(b, isDate) - ratio(a, isDate))[0] ?? 0;

  let debitCol = find(/d[e]bit/);
  let creditCol = find(/cr[e]dit/);
  let amountCol = find(/montant|amount|somme/, [debitCol, creditCol]);
  if (amountCol < 0 && (debitCol < 0 || creditCol < 0)) {
    debitCol = -1;
    creditCol = -1;
    amountCol =
      cols
        .filter((c) => c !== dateCol)
        .sort((a, b) => ratio(b, (v) => parseAmount(v) !== null) - ratio(a, (v) => parseAmount(v) !== null))[0] ?? -1;
  }

  let labelCol = find(/libell|description|label|intitul|detail|nature|operation|motif|beneficiaire/, [dateCol, amountCol, debitCol, creditCol]);
  if (labelCol < 0) {
    const avgLength = (c: number) => data.reduce((s, r) => s + (parseAmount(r[c] ?? '') === null ? (r[c] ?? '').length : 0), 0);
    labelCol = cols.filter((c) => ![dateCol, amountCol, debitCol, creditCol].includes(c)).sort((a, b) => avgLength(b) - avgLength(a))[0] ?? 0;
  }

  return {
    skipRows: headerIndex + 1,
    dateCol,
    labelCol,
    amountCol,
    debitCol,
    creditCol,
    dateFormat: guessDateFormat(data.map((r) => r[dateCol] ?? '')),
  };
}

export function extractCsvEntries(rows: string[][], mapping: CsvMapping): { entries: ParsedEntry[]; skipped: number } {
  const entries: ParsedEntry[] = [];
  let skipped = 0;
  rows.slice(mapping.skipRows).forEach((r, i) => {
    const date = parseDateWith(r[mapping.dateCol] ?? '', mapping.dateFormat);
    let amount: number | null;
    if (mapping.amountCol >= 0) {
      amount = parseAmount(r[mapping.amountCol] ?? '');
    } else {
      const debit = parseAmount(r[mapping.debitCol] ?? '') ?? 0;
      const credit = parseAmount(r[mapping.creditCol] ?? '') ?? 0;
      amount = Math.abs(credit) - Math.abs(debit);
    }
    const label = (r[mapping.labelCol] ?? '').replace(/\s+/g, ' ').trim();
    if (!date || amount === null || Math.abs(amount) < 0.005) {
      skipped++;
      return;
    }
    entries.push({ line: mapping.skipRows + i + 1, date, label: label || 'Opération', amount });
  });
  return { entries, skipped };
}

/* ---------------------------------------------------------------- OFX / QIF */

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'");

export function parseOfx(text: string): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  blocks.forEach((raw, i) => {
    const block = raw.split(/<\/STMTTRN>/i)[0];
    const get = (tag: string) => block.match(new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim();
    const posted = get('DTPOSTED') ?? '';
    const date = `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}`;
    const amount = parseAmount(get('TRNAMT') ?? '');
    if (!isValidISODate(date) || amount === null) return;
    const parts = [get('NAME'), get('MEMO')].filter((v): v is string => Boolean(v));
    const label = [...new Set(parts)].join(' — ') || 'Opération';
    out.push({ line: i + 1, date, label: decodeEntities(label), amount });
  });
  return out;
}

export function parseQif(text: string): ParsedEntry[] {
  const out: ParsedEntry[] = [];
  let current: { date?: string; amount?: number; payee?: string; memo?: string } = {};
  for (const raw of text.split(/\r?\n/)) {
    const code = raw[0];
    const value = raw.slice(1).trim();
    if (code === 'D') current.date = value.replace("'", '/');
    else if (code === 'T' || code === 'U') current.amount = parseAmount(value) ?? undefined;
    else if (code === 'P') current.payee = value;
    else if (code === 'M') current.memo = value;
    else if (code === '^') {
      const format = current.date ? guessDateFormat([current.date]) : 'DD/MM/YYYY';
      const date = current.date ? parseDateWith(current.date, format) : null;
      if (date && current.amount !== undefined) {
        out.push({ line: out.length + 1, date, label: current.payee || current.memo || 'Opération', amount: current.amount });
      }
      current = {};
    }
  }
  return out;
}

/* ---------------------------------------------------------------- Doublons */

export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export interface ImportCandidate extends ParsedEntry {
  hash: string;
  /** Transaction existante qui semble identique. */
  duplicateOf?: ID;
}

/** Empreinte stable ; `occurrence` distingue deux lignes identiques le même jour. */
export function buildCandidates(entries: ParsedEntry[], accountId: ID, existing: Transaction[]): ImportCandidate[] {
  const seen = new Map<string, number>();
  const inAccount = existing.filter((t) => t.accountId === accountId || t.toAccountId === accountId);
  const byHash = new Map(inAccount.filter((t) => t.importHash).map((t) => [t.importHash as string, t.id]));
  const consumed = new Set<ID>();

  return entries.map((entry) => {
    const base = `${accountId}|${entry.date}|${entry.amount.toFixed(2)}|${normalizeText(entry.label)}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const hash = hashString(`${base}|${occurrence}`);

    let duplicateOf = byHash.get(hash);
    if (!duplicateOf) {
      const key = labelKey(entry.label);
      const match = inAccount.find(
        (t) =>
          !consumed.has(t.id) &&
          !t.importHash &&
          Math.abs(txEffect(t, accountId) - entry.amount) < 0.005 &&
          Math.abs(diffDays(t.date, entry.date)) <= 3 &&
          (Boolean(t.recurringId) || labelKey(t.label) === key || t.date === entry.date),
      );
      duplicateOf = match?.id;
    }
    if (duplicateOf) consumed.add(duplicateOf);
    return { ...entry, hash, duplicateOf };
  });
}
