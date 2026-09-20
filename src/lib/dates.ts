import type { ISODate, MonthKey } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Minuit, heure locale. */
export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export const today = (): ISODate => toISODate(new Date());

export const isValidISODate = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parseISODate(s);
  return toISODate(d) === s;
};

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / 86_400_000);
}

export const monthKey = (iso: ISODate): MonthKey => iso.slice(0, 7);
export const currentMonth = (): MonthKey => monthKey(today());

export function addMonths(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(key: MonthKey): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export const monthStart = (key: MonthKey): ISODate => `${key}-01`;
export const monthEnd = (key: MonthKey): ISODate => `${key}-${pad(daysInMonth(key))}`;

/** Ajoute n mois à une date en restant sur le même jour quand il existe (31 → 30/28). */
export function addMonthsToDate(iso: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1 + n, 1);
  const key = `${target.getFullYear()}-${pad(target.getMonth() + 1)}`;
  const day = Math.min(anchorDay ?? d, daysInMonth(key));
  return `${key}-${pad(day)}`;
}

/** Liste des mois de `from` à `to` inclus. */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let k = from; k <= to && out.length < 1200; k = addMonths(k, 1)) out.push(k);
  return out;
}

const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtLongYear = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtShortYear = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtNumeric = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const fmtMonthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const fmtMonthShortYear = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export type DateStyle = 'long' | 'short' | 'numeric';

export function formatDate(iso: ISODate, style: DateStyle = 'short'): string {
  const d = parseISODate(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  switch (style) {
    case 'long':
      return capitalize((sameYear ? fmtLong : fmtLongYear).format(d));
    case 'numeric':
      return fmtNumeric.format(d);
    default:
      return (sameYear ? fmtShort : fmtShortYear).format(d);
  }
}

/** « Aujourd'hui », « Hier », sinon la date longue. */
export function formatDayHeading(iso: ISODate): string {
  const t = today();
  if (iso === t) return "Aujourd'hui";
  if (iso === addDays(t, -1)) return 'Hier';
  if (iso === addDays(t, 1)) return 'Demain';
  return formatDate(iso, 'long');
}

export const formatMonth = (key: MonthKey): string => capitalize(fmtMonth.format(parseISODate(monthStart(key))));

export function formatMonthShort(key: MonthKey, withYear = false): string {
  const d = parseISODate(monthStart(key));
  return (withYear ? fmtMonthShortYear : fmtMonthShort).format(d).replace('.', '');
}

export function formatDateTime(isoDateTime: string): string {
  const d = new Date(isoDateTime);
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}
