import { ChevronLeft, ChevronRight, Plus, Repeat, Search, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { RecurringDialog } from '../components/dialogs/RecurringDialog';
import { TransactionRow } from '../components/TransactionRow';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Input, Segmented, Select } from '../components/ui/fields';
import { Money } from '../components/ui/Money';
import { Badge, Card, EmptyState, PageHeader } from '../components/ui/misc';
import { cn } from '../lib/cn';
import { addMonths, currentMonth, formatDate, formatDayHeading, formatMonth, monthKey, today } from '../lib/dates';
import { txEffect } from '../lib/finance';
import { formatMoney, normalizeText, parseAmount, pluralize } from '../lib/format';
import { FREQUENCIES } from '../lib/meta';
import { nextOccurrence } from '../lib/recurring';
import type { Recurring, Transaction, TxKind } from '../lib/types';
import { deleteTransactions, setTransactionsCategory } from '../store/actions';
import { notifyDone } from '../store/feedback';
import { useAccountMap, useCategoryMap, useData } from '../store/selectors';
import { openTransaction, setImportOpen } from '../store/ui';

const PAGE = 150;
type TypeFilter = 'all' | TxKind;

export function Transactions() {
  const data = useData();
  const accounts = useAccountMap();
  const categories = useCategoryMap();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recurringOpen, setRecurringOpen] = useState(false);

  const month = params.get('mois') ?? currentMonth();
  const allDates = month === 'tout';
  const accountId = params.get('compte') ?? '';
  const categoryId = params.get('categorie') ?? '';
  const type = (params.get('type') as TypeFilter | null) ?? 'all';

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => setParam('q', query.trim() || null), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    setSelected(new Set());
    setLimit(PAGE);
  }, [month, accountId, categoryId, type, params]);

  const filtered = useMemo(() => {
    const q = normalizeText(params.get('q') ?? '');
    const amountQuery = q ? parseAmount(q) : null;
    return data.transactions
      .filter((t) => {
        if (!allDates && monthKey(t.date) !== month) return false;
        if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
        if (categoryId === 'none' && (t.categoryId || t.kind === 'transfer')) return false;
        if (categoryId && categoryId !== 'none' && t.categoryId !== categoryId) return false;
        if (type !== 'all' && t.kind !== type) return false;
        if (q) {
          const text = normalizeText(`${t.label} ${t.note ?? ''} ${t.categoryId ? (categories.get(t.categoryId)?.name ?? '') : ''}`);
          const amountMatch = amountQuery !== null && Math.abs(t.amount - Math.abs(amountQuery)) < 0.005;
          if (!text.includes(q) && !amountMatch) return false;
        }
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [data.transactions, allDates, month, accountId, categoryId, type, params, categories]);

  const signedOf = (t: Transaction) => (accountId ? txEffect(t, accountId) : t.kind === 'transfer' ? 0 : t.kind === 'income' ? t.amount : -t.amount);
  const totals = filtered.reduce(
    (acc, t) => {
      if (t.adjustment) return acc;
      const v = signedOf(t);
      if (v > 0) acc.in += v;
      else acc.out += v;
      return acc;
    },
    { in: 0, out: 0 },
  );

  const groups = useMemo(() => {
    const out: { date: string; items: Transaction[]; total: number }[] = [];
    for (const t of filtered.slice(0, limit)) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) {
        g = { date: t.date, items: [], total: 0 };
        out.push(g);
      }
      g.items.push(t);
      if (!t.adjustment) g.total += signedOf(t);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, limit, accountId]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasFilters = Boolean(accountId || categoryId || type !== 'all' || params.get('q'));
  const sortedAccounts = [...accounts.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const sortedCategories = [...categories.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={`${pluralize(filtered.length, 'transaction')} · ${allDates ? 'toutes les dates' : formatMonth(month)}`}
        actions={
          <>
            <Button onClick={() => setRecurringOpen(true)}>
              <Repeat /> Récurrences
            </Button>
            <Button onClick={() => setImportOpen(true)}>
              <Upload /> Importer
            </Button>
            <Button variant="primary" onClick={() => openTransaction()} className="max-lg:hidden">
              <Plus /> Nouvelle
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-line bg-surface shadow-sm">
            <Button variant="ghost" size="icon" aria-label="Mois précédent" disabled={allDates} onClick={() => setParam('mois', addMonths(month, -1))}>
              <ChevronLeft />
            </Button>
            <Select
              aria-label="Période"
              value={allDates ? 'tout' : month}
              onChange={(e) => setParam('mois', e.target.value)}
              className="h-9 w-44 border-0 bg-transparent text-center font-medium shadow-none focus:ring-0"
            >
              {!allDates && month !== currentMonth() && month > currentMonth() && <option value={month}>{formatMonth(month)}</option>}
              {Array.from({ length: 36 }, (_, i) => addMonths(currentMonth(), -i)).map((m) => (
                <option key={m} value={m}>
                  {formatMonth(m)}
                </option>
              ))}
              {!allDates && month < addMonths(currentMonth(), -35) && <option value={month}>{formatMonth(month)}</option>}
              <option value="tout">Toutes les dates</option>
            </Select>
            <Button variant="ghost" size="icon" aria-label="Mois suivant" disabled={allDates} onClick={() => setParam('mois', addMonths(month, 1))}>
              <ChevronRight />
            </Button>
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un libellé, une note, un montant…" aria-label="Rechercher" className="pl-9" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Compte" value={accountId} onChange={(e) => setParam('compte', e.target.value || null)} className="w-48">
            <option value="">Tous les comptes</option>
            {sortedAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Catégorie" value={categoryId} onChange={(e) => setParam('categorie', e.target.value || null)} className="w-52">
            <option value="">Toutes les catégories</option>
            <option value="none">Sans catégorie</option>
            {sortedCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Segmented<TypeFilter>
            label="Type"
            size="sm"
            value={type}
            onChange={(v) => setParam('type', v === 'all' ? null : v)}
            options={[
              { value: 'all', label: 'Tout' },
              { value: 'expense', label: 'Dépenses' },
              { value: 'income', label: 'Revenus' },
              { value: 'transfer', label: 'Virements' },
            ]}
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery('');
                setParams(allDates || month !== currentMonth() ? { mois: month } : {}, { replace: true });
              }}
            >
              <X /> Effacer les filtres
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line bg-surface-2/50 px-5 py-3 text-[13px]">
          {selected.size > 0 ? (
            <div className="flex w-full flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{pluralize(selected.size, 'sélectionnée', 'sélectionnées')}</span>
              <Select
                aria-label="Classer la sélection"
                value=""
                onChange={(e) => {
                  const value = e.target.value;
                  if (!value) return;
                  setTransactionsCategory([...selected], value === 'none' ? undefined : value);
                  notifyDone(`${pluralize(selected.size, 'transaction classée', 'transactions classées')}`);
                  setSelected(new Set());
                }}
                className="h-8 w-52"
              >
                <option value="">Classer dans…</option>
                <option value="none">Sans catégorie</option>
                {sortedCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="ghost"
                className="text-bad hover:bg-bad-soft hover:text-bad"
                onClick={() => {
                  const n = selected.size;
                  deleteTransactions([...selected]);
                  setSelected(new Set());
                  notifyDone(pluralize(n, 'transaction supprimée', 'transactions supprimées'));
                }}
              >
                <Trash2 /> Supprimer
              </Button>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
                Désélectionner
              </Button>
            </div>
          ) : (
            <>
              <span className="text-ink-3">
                Entrées <Money value={totals.in} sign tone="flow" className="ml-1 font-semibold" />
              </span>
              <span className="text-ink-3">
                Sorties <Money value={totals.out} className="ml-1 font-semibold text-ink" />
              </span>
              <span className="text-ink-3">
                Solde <Money value={totals.in + totals.out} sign tone="gain" className="ml-1 font-semibold" />
              </span>
              {filtered.length > 0 && (
                <label className="ml-auto flex items-center gap-2 text-ink-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--brand)]"
                    checked={false}
                    onChange={() => setSelected(new Set(filtered.slice(0, limit).map((t) => t.id)))}
                  />
                  Tout sélectionner
                </label>
              )}
            </>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'Aucune transaction ne correspond' : 'Aucune transaction sur cette période'}
            action={
              hasFilters ? undefined : (
                <div className="flex gap-2">
                  <Button onClick={() => setImportOpen(true)}>
                    <Upload /> Importer un relevé
                  </Button>
                  <Button variant="primary" onClick={() => openTransaction()}>
                    <Plus /> Ajouter
                  </Button>
                </div>
              )
            }
            className="py-16"
          >
            {hasFilters ? 'Modifier les filtres ou la période.' : 'Ajouter une transaction ou importer un relevé bancaire.'}
          </EmptyState>
        ) : (
          <div className="px-2 pb-3">
            {groups.map((g) => (
              <section key={g.date} aria-label={formatDayHeading(g.date)}>
                <header className="sticky top-[53px] z-[1] flex items-baseline justify-between bg-surface/95 px-3 pb-1 pt-4 backdrop-blur lg:top-0">
                  <h2 className="text-[12.5px] font-semibold text-ink-2">
                    {formatDayHeading(g.date)}
                    {g.date > today() && (
                      <Badge tone="brand" className="ml-2">
                        À venir
                      </Badge>
                    )}
                  </h2>
                  {g.items.length > 1 && Math.abs(g.total) > 0.004 && <Money value={g.total} sign className="text-xs text-ink-3" />}
                </header>
                {g.items.map((t) => (
                  <TransactionRow
                    key={t.id}
                    tx={t}
                    accounts={accounts}
                    categories={categories}
                    perspective={accountId || undefined}
                    selected={selected.has(t.id)}
                    onToggleSelect={() => toggle(t.id)}
                  />
                ))}
              </section>
            ))}
            {filtered.length > limit && (
              <div className="flex justify-center pt-3">
                <Button onClick={() => setLimit((l) => l + PAGE)}>Afficher {Math.min(PAGE, filtered.length - limit)} de plus</Button>
              </div>
            )}
          </div>
        )}
      </Card>

      <RecurringList open={recurringOpen} onClose={() => setRecurringOpen(false)} />
    </>
  );
}

function RecurringList({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const accounts = useAccountMap();
  const [editing, setEditing] = useState<Recurring | undefined>();
  const [formOpen, setFormOpen] = useState(false);
  const items = [...data.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.label.localeCompare(b.label, 'fr'));

  return (
    <>
      <Dialog
        open={open && !formOpen}
        onClose={onClose}
        title="Transactions récurrentes"
        description="Créées automatiquement à chaque échéance, à l'ouverture de l'application."
        width={620}
        footer={
          <Button
            variant="primary"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus /> Nouvelle récurrence
          </Button>
        }
      >
        {items.length === 0 ? (
          <EmptyState title="Aucune récurrence" className="py-8">
            Loyer, salaire, abonnements, épargne mensuelle : les saisir une fois pour toutes.
          </EmptyState>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {items.map((r) => {
              const next = nextOccurrence(r, today());
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(r);
                      setFormOpen(true);
                    }}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2', !r.active && 'opacity-60')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                      <span className="block truncate text-xs text-ink-3">
                        {FREQUENCIES[r.frequency]} · {accounts.get(r.accountId)?.name ?? 'Compte supprimé'}
                        {r.active && next ? ` · prochaine le ${formatDate(next)}` : ''}
                      </span>
                    </span>
                    {!r.active && <Badge>En pause</Badge>}
                    <span className={cn('money tnum text-sm font-semibold', r.kind === 'income' ? 'text-good' : 'text-ink')}>
                      {r.kind === 'income' ? formatMoney(r.amount, { sign: true }) : r.kind === 'transfer' ? formatMoney(r.amount) : formatMoney(-r.amount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
      <RecurringDialog open={formOpen} onClose={() => setFormOpen(false)} recurring={editing} />
    </>
  );
}
