const MINUS = '−';

const eur2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eur0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const eurCompact = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1 });
const pct1 = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct0 = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });

export interface MoneyOptions {
  /** Affiche « + » devant les montants positifs. */
  sign?: boolean;
  /** 0 = arrondi à l'euro ; 'auto' = sans centimes au-delà de 100 000 €. */
  decimals?: 0 | 2 | 'auto';
  compact?: boolean;
}

/** Évite « -0,00 € » et les erreurs d'arrondi flottant. */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function formatMoney(value: number, opts: MoneyOptions = {}): string {
  const v = Object.is(round2(value), -0) ? 0 : round2(value);
  const abs = Math.abs(v);
  const decimals = opts.decimals === 'auto' ? (abs >= 100_000 ? 0 : 2) : (opts.decimals ?? 2);
  const fmt = opts.compact && abs >= 10_000 ? eurCompact : decimals === 0 ? eur0 : eur2;
  const body = fmt.format(abs);
  if (v < 0 && (decimals === 2 ? abs >= 0.005 : abs >= 0.5)) return `${MINUS}${body}`;
  if (opts.sign && v > 0) return `+${body}`;
  return body;
}

export function formatPct(ratio: number, opts: { sign?: boolean; decimals?: 0 | 1 } = {}): string {
  if (!Number.isFinite(ratio)) return '—';
  const body = (opts.decimals === 0 ? pct0 : pct1).format(Math.abs(ratio));
  const tiny = Math.abs(ratio) < (opts.decimals === 0 ? 0.005 : 0.0005);
  if (ratio < 0 && !tiny) return `${MINUS}${body}`;
  if (opts.sign && ratio > 0 && !tiny) return `+${body}`;
  return body;
}

const num = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 8 });
export const formatNumber = (n: number, maxDecimals = 8) =>
  maxDecimals === 8 ? num.format(n) : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: maxDecimals }).format(n);

/** Cours unitaire : plus de décimales pour les petits prix (cryptos). */
export function formatPrice(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * Lit un montant saisi à la française ou à l'anglaise :
 * « 1 234,56 », « 1234.56 », « 1.234,56 », « -12,5 € ».
 */
export function parseAmount(input: string): number | null {
  // \s couvre aussi les espaces insécables utilisés comme séparateurs de milliers.
  let s = input.replace(/[\s€]/g, '').replace(/−/g, '-');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? ',' : '.';
    const thousandsSep = decimalSep === ',' ? '.' : ',';
    s = s.split(thousandsSep).join('').replace(decimalSep, '.');
  } else if (lastComma >= 0) {
    s = (s.match(/,/g)?.length ?? 0) > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if ((s.match(/\./g)?.length ?? 0) > 1) {
    s = s.replace(/\./g, '');
  }
  if (!/^[+-]?\d*\.?\d+$/.test(s) && !/^[+-]?\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Accepte aussi une petite addition, pratique pour un ticket partagé : « 12,50 + 7 − 3 ». */
export function parseAmountExpression(input: string): number | null {
  const cleaned = input.replace(/−/g, '-').trim();
  if (!cleaned || /[+-]$/.test(cleaned)) return null;
  const tokens = cleaned.match(/[+-]?[^+-]+/g);
  if (!tokens) return null;
  let total = 0;
  for (const token of tokens) {
    const trimmed = token.trim();
    const sign = trimmed.startsWith('-') ? -1 : 1;
    const n = parseAmount(trimmed.replace(/^[+-]\s*/, ''));
    if (n === null) return null;
    total += sign * n;
  }
  return round2(total);
}

/** Valeur à afficher dans un champ de saisie (virgule décimale, sans séparateur de milliers). */
export function amountToInput(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return String(round2(value)).replace('.', ',');
}

export function quantityToInput(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '';
  return String(value).replace('.', ',');
}

/** Minuscule et sans accents : pour comparer des libellés. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const pluralize = (n: number, singular: string, plural = `${singular}s`) =>
  `${formatNumber(n, 0)} ${Math.abs(n) >= 2 ? plural : singular}`;
