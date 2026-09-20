import { addDays, addMonthsToDate, today } from './dates';
import { nowIso, uid } from './id';
import type { Frequency, ISODate, PeculeData, Recurring, Transaction } from './types';

const MONTH_STEP: Record<Frequency, number> = { weekly: 0, monthly: 1, quarterly: 3, yearly: 12 };

/** i-ème occurrence, calculée depuis la date de départ pour ne pas dériver (31 → 28 → 31). */
export function occurrenceAt(r: Pick<Recurring, 'frequency' | 'startDate'>, index: number): ISODate {
  if (r.frequency === 'weekly') return addDays(r.startDate, 7 * index);
  const anchorDay = Number(r.startDate.slice(8, 10));
  return addMonthsToDate(r.startDate, MONTH_STEP[r.frequency] * index, anchorDay);
}

/** Occurrences pas encore créées, jusqu'à `until` inclus. */
export function dueOccurrences(r: Recurring, until: ISODate, limit = 500): ISODate[] {
  if (!r.active) return [];
  const out: ISODate[] = [];
  for (let i = 0; i < 20_000 && out.length < limit; i++) {
    const date = occurrenceAt(r, i);
    if (date > until || (r.endDate && date > r.endDate)) break;
    if (r.lastDate && date <= r.lastDate) continue;
    out.push(date);
  }
  return out;
}

export function nextOccurrence(r: Recurring, after: ISODate): ISODate | null {
  if (!r.active) return null;
  for (let i = 0; i < 20_000; i++) {
    const date = occurrenceAt(r, i);
    if (r.endDate && date > r.endDate) return null;
    if (date > after && (!r.lastDate || date > r.lastDate)) return date;
  }
  return null;
}

export function transactionFromRecurring(r: Recurring, date: ISODate): Transaction {
  return {
    id: uid(),
    date,
    label: r.label,
    amount: r.amount,
    kind: r.kind,
    accountId: r.accountId,
    toAccountId: r.kind === 'transfer' ? r.toAccountId : undefined,
    categoryId: r.kind === 'transfer' ? undefined : r.categoryId,
    recurringId: r.id,
    createdAt: nowIso(),
  };
}

/** Crée les transactions récurrentes échues. Retourne null si rien n'est à créer. */
export function materializeRecurring(data: PeculeData, until: ISODate = today()) {
  const accountIds = new Set(data.accounts.map((a) => a.id));
  const created: Transaction[] = [];
  const recurring = data.recurring.map((r) => {
    if (!accountIds.has(r.accountId)) return r;
    const dates = dueOccurrences(r, until);
    if (!dates.length) return r;
    for (const date of dates) created.push(transactionFromRecurring(r, date));
    return { ...r, lastDate: dates[dates.length - 1] };
  });
  if (!created.length) return null;
  return { data: { ...data, recurring, transactions: [...data.transactions, ...created] }, created };
}

/** Échéances à venir dans les `days` prochains jours. */
export function upcoming(data: PeculeData, days = 30, from: ISODate = today()) {
  const until = addDays(from, days);
  const items: { recurring: Recurring; date: ISODate }[] = [];
  for (const r of data.recurring) {
    if (!r.active) continue;
    let cursor = from;
    for (let n = 0; n < 10; n++) {
      const date = nextOccurrence(r, cursor);
      if (!date || date > until) break;
      items.push({ recurring: r, date });
      cursor = date;
    }
  }
  return items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}
