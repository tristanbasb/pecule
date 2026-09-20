import { ChevronDown, ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { BudgetNote, ColumnChart, Meter } from '../components/charts/Bars';
import { CategoryDialog } from '../components/dialogs/CategoryDialog';
import { Button } from '../components/ui/Button';
import { Money } from '../components/ui/Money';
import { Card, CardHeader, IconChip, PageHeader } from '../components/ui/misc';
import { Stat } from '../components/ui/Stat';
import { cn } from '../lib/cn';
import { addMonths, currentMonth, formatMonth, formatMonthShort } from '../lib/dates';
import { UNCATEGORIZED_EXPENSE, UNCATEGORIZED_INCOME, budgetLines, budgetStatus, monthElapsed, type BudgetLine } from '../lib/finance';
import { amountToInput, formatMoney, formatPct, parseAmountExpression } from '../lib/format';
import type { Category, CategoryType } from '../lib/types';
import { setBudget } from '../store/actions';
import { useData, useFlows } from '../store/selectors';

const RANK = { over: 0, warning: 1, ok: 2, none: 3 };

export function Budget() {
  const data = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get('mois') ?? '') ? (params.get('mois') as string) : currentMonth();
  const [dialog, setDialog] = useState<{ open: boolean; category?: Category; type?: CategoryType }>({ open: false });
  const [showIdle, setShowIdle] = useState(false);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonths(month, i - 11)), [month]);
  const flows = useFlows(months);
  const flow = flows.get(month)!;
  const previous = months.slice(-4, -1).map((m) => flows.get(m)!);
  const expenseLines = budgetLines(data.categories, flow, previous, 'expense');
  const incomeLines = budgetLines(data.categories, flow, previous, 'income');
  const elapsed = monthElapsed(month);

  const active = expenseLines.filter((l) => l.budget > 0 || Math.abs(l.spent) > 0.004);
  const idle = expenseLines.filter((l) => !(l.budget > 0 || Math.abs(l.spent) > 0.004));
  active.sort((a, b) => RANK[a.status] - RANK[b.status] || (b.ratio ?? -1) - (a.ratio ?? -1) || b.spent - a.spent);

  const budgetTotal = expenseLines.reduce((s, l) => s + l.budget, 0);
  const spentInBudget = expenseLines.filter((l) => l.budget > 0).reduce((s, l) => s + Math.max(0, l.spent), 0);
  const uncategorized = flow.byCategory.get(UNCATEGORIZED_EXPENSE) ?? 0;
  const uncategorizedIncome = flow.byCategory.get(UNCATEGORIZED_INCOME) ?? 0;
  const totalStatus = budgetStatus(spentInBudget, budgetTotal);

  const go = (m: string) => setParams(m === currentMonth() ? {} : { mois: m }, { replace: true });

  return (
    <>
      <PageHeader
        title="Budget"
        subtitle="Enveloppes mensuelles par catégorie"
        actions={
          <>
            <div className="flex items-center rounded-lg border border-line bg-surface shadow-sm">
              <Button variant="ghost" size="icon" aria-label="Mois précédent" onClick={() => go(addMonths(month, -1))}>
                <ChevronLeft />
              </Button>
              <span className="min-w-36 text-center text-sm font-medium text-ink" aria-live="polite">
                {formatMonth(month)}
              </span>
              <Button variant="ghost" size="icon" aria-label="Mois suivant" onClick={() => go(addMonths(month, 1))}>
                <ChevronRight />
              </Button>
            </div>
            <Button variant="primary" onClick={() => setDialog({ open: true, type: 'expense' })}>
              <Plus /> Catégorie
            </Button>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[1.2fr_2fr]">
            <div>
              <p className="text-[13px] font-medium text-ink-3">Dépensé sur les catégories budgétées</p>
              <p className="display money mt-1 text-[36px] leading-tight text-ink">
                {formatMoney(spentInBudget, { decimals: 0 })}
                {budgetTotal > 0 && <span className="text-[20px] text-ink-3"> / {formatMoney(budgetTotal, { decimals: 0 })}</span>}
              </p>
              {budgetTotal > 0 ? (
                <>
                  <Meter value={spentInBudget} max={budgetTotal} status={totalStatus} marker={elapsed} label="Budget total du mois" className="mt-4 h-2.5" />
                  <p className="mt-2 text-[13px]">
                    <BudgetNote status={totalStatus} remaining={budgetTotal - spentInBudget} />
                    {elapsed > 0 && elapsed < 1 && (
                      <span className="text-ink-3"> · {formatPct(elapsed, { decimals: 0 })} du mois écoulé</span>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-3 text-sm text-ink-3">Définir un budget sur une catégorie en cliquant sur « Définir » dans la liste.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
              <Stat label="Revenus" value={<Money value={flow.income} tabular={false} decimals={0} />} />
              <Stat label="Dépenses" value={<Money value={flow.expense} tabular={false} decimals={0} />} />
              <Stat label="Épargne" value={<Money value={flow.net} sign tone={flow.income > 0 ? 'gain' : 'none'} tabular={false} decimals={0} />} />
              <Stat label="Taux d'épargne" value={flow.savingsRate === null ? '—' : formatPct(flow.savingsRate, { decimals: 0 })} />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Dépenses" subtitle="Moyenne calculée sur les trois mois précédents" />
          <ul className="flex flex-col px-2 pb-3 pt-2">
            {active.map((l) => (
              <BudgetRow key={l.category.id} line={l} month={month} elapsed={elapsed} onEdit={() => setDialog({ open: true, category: l.category })} />
            ))}
            {uncategorized > 0.004 && (
              <li>
                <Link
                  to={`/transactions?mois=${month}&categorie=none`}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-sm text-ink-2 hover:bg-surface-2"
                >
                  <span>Dépenses sans catégorie</span>
                  <span className="money tnum font-medium text-ink">{formatMoney(uncategorized)}</span>
                </Link>
              </li>
            )}
            {active.length === 0 && uncategorized < 0.004 && <li className="px-3 py-6 text-sm text-ink-3">Aucune dépense ce mois-ci.</li>}
          </ul>
          {idle.length > 0 && (
            <div className="border-t border-line px-2 py-2">
              <button
                type="button"
                aria-expanded={showIdle}
                onClick={() => setShowIdle((v) => !v)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium text-ink-3 hover:text-ink"
              >
                <ChevronDown className={cn('size-4 transition-transform', showIdle && 'rotate-180')} />
                Catégories sans dépense ni budget ({idle.length})
              </button>
              {showIdle && (
                <ul className="flex flex-col">
                  {idle.map((l) => (
                    <BudgetRow key={l.category.id} line={l} month={month} elapsed={elapsed} onEdit={() => setDialog({ open: true, category: l.category })} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <Card>
            <CardHeader title="Sur 12 mois" subtitle="Cliquer sur un mois pour l'afficher" />
            <div className="px-5 pb-5 pt-4">
              <ColumnChart
                height={190}
                ariaLabel="Revenus et dépenses sur douze mois"
                activeKey={month}
                onSelect={go}
                series={[
                  { key: 'income', label: 'Revenus', color: 'var(--series-1)' },
                  { key: 'expense', label: 'Dépenses', color: 'var(--series-2)' },
                ]}
                groups={months.map((m) => {
                  const f = flows.get(m)!;
                  return {
                    key: m,
                    label: formatMonthShort(m).slice(0, 1).toUpperCase(),
                    title: formatMonth(m),
                    values: [f.income, f.expense],
                    extra: { label: 'Épargne', value: formatMoney(f.net, { sign: true }) },
                  };
                })}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Revenus"
              action={
                <Button variant="ghost" size="sm" onClick={() => setDialog({ open: true, type: 'income' })}>
                  <Plus /> Catégorie
                </Button>
              }
            />
            <ul className="flex flex-col px-2 pb-3 pt-2">
              {incomeLines
                .filter((l) => l.budget > 0 || Math.abs(l.spent) > 0.004)
                .sort((a, b) => b.spent - a.spent)
                .map((l) => (
                  <li key={l.category.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/transactions?mois=${month}&categorie=${l.category.id}`)}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
                    >
                      <IconChip icon={l.category.icon} color={l.category.color} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{l.category.name}</span>
                      <span className="text-right text-[13px]">
                        <Money value={l.spent} className="font-semibold text-ink" />
                        {l.budget > 0 && (
                          <span className="block text-xs text-ink-3">
                            attendu <span className="money tnum">{formatMoney(l.budget, { decimals: 0 })}</span>
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              {uncategorizedIncome > 0.004 && (
                <li className="flex items-center justify-between px-3 py-2.5 text-sm text-ink-2">
                  <span>Revenus sans catégorie</span>
                  <Money value={uncategorizedIncome} className="font-medium text-ink" />
                </li>
              )}
              {flow.income < 0.004 && <li className="px-3 py-4 text-sm text-ink-3">Aucun revenu ce mois-ci.</li>}
            </ul>
          </Card>
        </div>
      </div>

      <CategoryDialog open={dialog.open} category={dialog.category} defaultType={dialog.type} onClose={() => setDialog({ open: false })} />
    </>
  );
}

function BudgetRow({ line, month, elapsed, onEdit }: { line: BudgetLine; month: string; elapsed: number; onEdit: () => void }) {
  const { category, spent, budget, status, remaining, average } = line;
  return (
    <li className="group flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-surface-2/70">
      <IconChip icon={category.icon} color={category.color} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link to={`/transactions?mois=${month}&categorie=${category.id}`} className="truncate text-[14px] font-medium text-ink hover:underline">
            {category.name}
          </Link>
          <span className="flex shrink-0 items-baseline gap-1 text-[13px] text-ink-3">
            <span className="money tnum font-semibold text-ink">{formatMoney(spent, { decimals: 'auto' })}</span>
            <span>/</span>
            <BudgetAmount category={category} />
          </span>
        </div>
        {budget > 0 ? (
          <Meter value={spent} max={budget} status={status} marker={elapsed} label={`Budget ${category.name}`} className="mt-2" />
        ) : (
          <div className="mt-2 h-2 rounded-full bg-surface-3" />
        )}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 text-xs">
          <BudgetNote status={status} remaining={remaining} />
          {average > 0.5 && (
            <span className="text-ink-3">
              Moy. <span className="money tnum">{formatMoney(average, { decimals: 0 })}</span>
            </span>
          )}
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${category.name}`} onClick={onEdit} className="opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100 max-lg:opacity-100">
        <Pencil />
      </Button>
    </li>
  );
}

function BudgetAmount({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(amountToInput(category.budget));
          setEditing(true);
        }}
        className={cn(
          'rounded-md px-1 underline decoration-dotted underline-offset-4 hover:bg-brand-soft hover:text-brand-text',
          !category.budget && 'font-medium text-brand-text',
        )}
        title="Modifier le budget"
      >
        {category.budget ? <span className="money tnum">{formatMoney(category.budget, { decimals: 0 })}</span> : 'Définir'}
      </button>
    );
  }

  const commit = () => {
    const parsed = value.trim() ? parseAmountExpression(value) : 0;
    if (parsed !== null && parsed >= 0 && parsed !== (category.budget ?? 0)) setBudget(category.id, parsed || undefined);
    setEditing(false);
  };

  return (
    <input
      autoFocus
      value={value}
      inputMode="decimal"
      aria-label={`Budget mensuel ${category.name}`}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      className="tnum h-7 w-24 rounded-md border border-brand bg-surface px-2 text-right text-[13px] text-ink outline-none ring-3 ring-brand/20"
    />
  );
}
