import { ArrowRight, CalendarClock, ChartLine, Sparkles, Upload, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Meter, BudgetNote, ColumnChart, StackedBar, type StackSegment } from '../components/charts/Bars';
import { DataTable } from '../components/charts/core';
import { LineChart } from '../components/charts/LineChart';
import { AccountDialog } from '../components/dialogs/AccountDialog';
import { Guilloche } from '../components/Guilloche';
import { TransactionRow } from '../components/TransactionRow';
import { Button, buttonClass } from '../components/ui/Button';
import { Delta, Money } from '../components/ui/Money';
import { Card, CardHeader, EmptyState, IconChip } from '../components/ui/misc';
import { Stat } from '../components/ui/Stat';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { addMonths, currentMonth, daysInMonth, formatDate, formatMonth, formatMonthShort, parseISODate, today } from '../lib/dates';
import { buildDemoData } from '../lib/demo';
import { annualizedReturn, budgetLines, monthElapsed } from '../lib/finance';
import { formatMoney, formatPct } from '../lib/format';
import { RANGE_LABELS, earliestDate, netWorthSeries, rangeStart, sampleDates, type RangeKey } from '../lib/history';
import { ASSET_CLASSES, ASSET_CLASS_ORDER, KIND_LABELS, KIND_ORDER, accountKind, colorVar } from '../lib/meta';
import { upcoming } from '../lib/recurring';
import { useStoredState } from '../lib/useStoredState';
import { replaceAllData } from '../store/actions';
import { usePriceSeries } from '../store/market';
import { useAccountMap, useCategoryMap, useData, useFlows, useSnapshot } from '../store/selectors';
import { setImportOpen } from '../store/ui';

const RANGES: RangeKey[] = ['1M', '3M', '6M', '1A', '3A', 'MAX'];
const RANGE_PHRASE: Record<RangeKey, string> = {
  '1M': 'sur 1 mois',
  '3M': 'sur 3 mois',
  '6M': 'sur 6 mois',
  '1A': 'sur 1 an',
  '3A': 'sur 3 ans',
  MAX: 'depuis le début du suivi',
};

export function Dashboard() {
  const data = useData();
  const [accountOpen, setAccountOpen] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);

  const greeting = data.settings.displayName ? `Bonjour ${data.settings.displayName}` : 'Bonjour';

  if (!data.accounts.length) {
    return (
      <>
        <h1 className="display text-[32px] text-ink">{greeting}</h1>
        <Card className="mt-6">
          <EmptyState
            icon={<WalletCards />}
            title="Tout commence par un compte"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => setAccountOpen(true)}>
                  Créer un compte
                </Button>
                <Button
                  disabled={loadingDemo}
                  onClick={async () => {
                    setLoadingDemo(true);
                    try {
                      const demo = await buildDemoData(async (s) => (await api.history('yahoo', s)).points);
                      replaceAllData({ ...demo, settings: data.settings });
                      toast.success('Données de démonstration chargées');
                    } finally {
                      setLoadingDemo(false);
                    }
                  }}
                >
                  <Sparkles /> Charger la démonstration
                </Button>
              </div>
            }
            className="py-16"
          >
            Compte courant, livret, PEA… Chaque compte regroupe ses transactions et, pour les placements, ses titres.
          </EmptyState>
        </Card>
        <AccountDialog open={accountOpen} onClose={() => setAccountOpen(false)} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] text-ink-3">{formatDate(today(), 'long')}</p>
          <h1 className="display text-[30px] leading-tight text-ink sm:text-[34px]">{greeting}</h1>
        </div>
        <Button onClick={() => setImportOpen(true)}>
          <Upload /> Importer un relevé
        </Button>
      </div>
      <WorthHero />
      <div className="grid gap-6 lg:grid-cols-12">
        <MonthCard className="lg:col-span-7" />
        <BudgetCard className="lg:col-span-5" />
        <InvestCard className="lg:col-span-5" />
        <RecentCard className="lg:col-span-7" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Patrimoine */

function WorthHero() {
  const data = useData();
  const snapshot = useSnapshot();
  const { series } = usePriceSeries();
  const [range, setRange] = useStoredState<RangeKey>('pecule:range', '6M', RANGES);

  const points = useMemo(() => {
    const end = today();
    return netWorthSeries(data, sampleDates(rangeStart(range, end, earliestDate(data)), end), series);
  }, [data, series, range]);

  const first = points[0];
  const last = points[points.length - 1];
  const delta = first && last ? last.total - first.total : 0;
  const pct = first && Math.abs(first.total) > 1 ? delta / Math.abs(first.total) : null;
  const monthly = points.filter((p, i) => i === points.length - 1 || p.date.slice(0, 7) !== points[i + 1]?.date.slice(0, 7));

  return (
    <section aria-labelledby="worth-title" className="rise relative overflow-hidden rounded-[22px] bg-vault text-vault-ink shadow-float">
      <Guilloche className="pointer-events-none absolute -right-36 -top-44 size-[480px] text-gilt opacity-30 sm:-right-20 sm:-top-40" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-vault via-vault/80 to-transparent" />
      <div className="relative px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id="worth-title" className="text-[13px] font-medium tracking-wide text-vault-ink-2">
              Patrimoine net
            </h2>
            <p className="display money mt-2 text-[44px] leading-none sm:text-[64px]">
              {formatMoney(snapshot.netWorth, { decimals: 0 })}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <Delta value={delta} pct={pct} onVault decimals={0} />
              <span className="text-vault-ink-2">{RANGE_PHRASE[range]}</span>
            </p>
          </div>
          <div role="radiogroup" aria-label="Période" className="flex rounded-lg bg-white/[0.06] p-0.5 ring-1 ring-white/10">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={range === r}
                aria-label={RANGE_LABELS[r]}
                onClick={() => setRange(r)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-xs font-semibold transition-colors',
                  range === r ? 'bg-vault-ink text-vault' : 'text-vault-ink-2 hover:text-vault-ink',
                )}
              >
                {r === 'MAX' ? 'Tout' : r.replace('A', ' an').replace('M', ' m').replace('3 an', '3 ans')}
              </button>
            ))}
          </div>
        </div>
        <dl className="mt-5 flex flex-wrap gap-x-7 gap-y-2 text-[13px]">
          {KIND_ORDER.filter((k) => Math.abs(snapshot.byKind[k]) > 0.5).map((k) => (
            <div key={k}>
              <dt className="text-vault-ink-2">{KIND_LABELS[k]}</dt>
              <dd className="money tnum mt-0.5 font-semibold">{formatMoney(snapshot.byKind[k], { decimals: 0 })}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="relative mt-3 px-2 pb-3 sm:px-5">
        <LineChart
          dates={points.map((p) => p.date)}
          series={[{ key: 'total', label: 'Patrimoine net', values: points.map((p) => p.total), color: 'var(--gilt)', primary: true }]}
          height={200}
          onVault
          ariaLabel={`Évolution du patrimoine net ${RANGE_PHRASE[range]} : de ${formatMoney(first?.total ?? 0, { decimals: 0 })} à ${formatMoney(last?.total ?? 0, { decimals: 0 })}`}
          formatValue={(v) => formatMoney(v, { decimals: 0 })}
        />
        <DataTable
          className="sr-only"
          caption="Patrimoine net en fin de mois"
          columns={['Date', 'Patrimoine net']}
          rows={monthly.map((p) => [formatDate(p.date, 'numeric'), formatMoney(p.total, { decimals: 0 })])}
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Mois */

function MonthCard({ className }: { className?: string }) {
  const data = useData();
  const navigate = useNavigate();
  const month = currentMonth();
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)), [month]);
  const flows = useFlows(months);
  const flow = flows.get(month)!;
  const budgetTotal = data.categories.filter((c) => c.type === 'expense' && !c.archived).reduce((s, c) => s + (c.budget ?? 0), 0);
  const day = Number(today().slice(8, 10));

  return (
    <Card className={className}>
      <CardHeader
        title={formatMonth(month)}
        subtitle={`Jour ${day} sur ${daysInMonth(month)}`}
        action={
          <Link to="/budget" className={buttonClass('ghost', 'sm')}>
            Budget <ArrowRight />
          </Link>
        }
      />
      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 px-5 sm:grid-cols-4">
        <Stat label="Revenus" value={<Money value={flow.income} tabular={false} decimals={0} />} />
        <Stat label="Dépenses" value={<Money value={flow.expense} tabular={false} decimals={0} />} />
        <Stat
          label="Épargne"
          value={<Money value={flow.net} sign tone={flow.income > 0 ? 'gain' : 'none'} tabular={false} decimals={0} />}
          sub={flow.savingsRate !== null ? `${formatPct(flow.savingsRate, { decimals: 0 })} des revenus` : 'Revenus du mois pas encore perçus'}
        />
        {budgetTotal > 0 ? (
          <Stat
            label="Reste à dépenser"
            value={<Money value={budgetTotal - flow.expense} tone={budgetTotal - flow.expense < 0 ? 'gain' : 'none'} tabular={false} decimals={0} />}
            sub={`sur ${formatMoney(budgetTotal, { decimals: 0 })} de budget`}
          />
        ) : (
          <Stat label="Opérations" value={flow.count} sub="ce mois-ci" />
        )}
      </div>
      <div className="px-5 pb-5 pt-6">
        <ColumnChart
          height={176}
          ariaLabel="Revenus et dépenses des six derniers mois"
          activeKey={month}
          onSelect={(m) => navigate(`/budget?mois=${m}`)}
          series={[
            { key: 'income', label: 'Revenus', color: 'var(--series-1)' },
            { key: 'expense', label: 'Dépenses', color: 'var(--series-2)' },
          ]}
          groups={months.map((m) => {
            const f = flows.get(m)!;
            return {
              key: m,
              label: formatMonthShort(m),
              title: formatMonth(m),
              values: [f.income, f.expense],
              extra: { label: 'Épargne', value: formatMoney(f.net, { sign: true }) },
            };
          })}
        />
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Budget */

function BudgetCard({ className }: { className?: string }) {
  const data = useData();
  const month = currentMonth();
  const months = useMemo(() => [addMonths(month, -3), addMonths(month, -2), addMonths(month, -1), month], [month]);
  const flows = useFlows(months);
  const lines = budgetLines(data.categories, flows.get(month)!, months.slice(0, 3).map((m) => flows.get(m)!));
  const budgeted = lines.filter((l) => l.budget > 0);
  const overCount = budgeted.filter((l) => l.status === 'over').length;
  const rank = { over: 0, warning: 1, ok: 2, none: 3 };
  const shown = (budgeted.length ? budgeted : lines.filter((l) => l.spent > 0))
    .sort((a, b) => rank[a.status] - rank[b.status] || (b.ratio ?? b.spent) - (a.ratio ?? a.spent))
    .slice(0, 5);
  const maxSpent = Math.max(1, ...shown.map((l) => l.spent));
  const elapsed = monthElapsed(month);

  return (
    <Card className={className}>
      <CardHeader
        title="Budget du mois"
        subtitle={
          !budgeted.length
            ? 'Principales dépenses'
            : overCount === 0
              ? 'Aucun dépassement'
              : `${overCount} dépassement${overCount > 1 ? 's' : ''}`
        }
        action={
          <Link to="/budget" className={buttonClass('ghost', 'sm')}>
            Tout voir <ArrowRight />
          </Link>
        }
      />
      {shown.length === 0 ? (
        <EmptyState title="Aucune dépense ce mois-ci" className="py-10">
          Les dépenses apparaîtront ici au fil du mois.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4 px-5 pb-5 pt-4">
          {shown.map((l) => (
            <li key={l.category.id} className="flex items-center gap-3">
              <IconChip icon={l.category.icon} color={l.category.color} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 text-[13.5px]">
                  <span className="truncate font-medium text-ink">{l.category.name}</span>
                  <span className="shrink-0 text-ink-3">
                    <span className="money tnum font-medium text-ink">{formatMoney(l.spent, { decimals: 0 })}</span>
                    {l.budget > 0 && <span className="money tnum"> / {formatMoney(l.budget, { decimals: 0 })}</span>}
                  </span>
                </div>
                {l.budget > 0 ? (
                  <>
                    <Meter value={l.spent} max={l.budget} status={l.status} marker={elapsed} label={`Budget ${l.category.name}`} className="mt-1.5" />
                    <p className="mt-1 text-xs">
                      <BudgetNote status={l.status} remaining={l.remaining} />
                    </p>
                  </>
                ) : (
                  <div className="mt-1.5 h-2 rounded-full bg-surface-3">
                    <div className="h-full rounded-full bg-s1" style={{ width: `${(l.spent / maxSpent) * 100}%` }} />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ----------------------------------------------------------- Placements */

function InvestCard({ className }: { className?: string }) {
  const data = useData();
  const snapshot = useSnapshot();
  const investIds = useMemo(() => new Set(data.accounts.filter((a) => accountKind(a.type) === 'invest').map((a) => a.id)), [data.accounts]);
  const irr = useMemo(() => annualizedReturn(data, investIds, snapshot.invest.value), [data, investIds, snapshot.invest.value]);

  if (!investIds.size) {
    return (
      <Card className={className}>
        <CardHeader title="Investissements" />
        <EmptyState
          icon={<ChartLine />}
          title="Suivre ses placements"
          action={
            <Link to="/comptes" className={buttonClass('secondary', 'sm')}>
              Ajouter un PEA, une assurance-vie…
            </Link>
          }
        >
          Valeur, plus-values et répartition, avec les cours mis à jour automatiquement.
        </EmptyState>
      </Card>
    );
  }

  const byClass = new Map<string, number>();
  for (const p of snapshot.positions) byClass.set(p.asset.assetClass, (byClass.get(p.asset.assetClass) ?? 0) + p.value);
  const segments: StackSegment[] = [
    ...ASSET_CLASS_ORDER.filter((c) => (byClass.get(c) ?? 0) > 0).map((c) => ({
      key: c,
      label: ASSET_CLASSES[c].label,
      value: byClass.get(c) ?? 0,
      color: colorVar(ASSET_CLASSES[c].color),
    })),
    ...(snapshot.invest.cash > 0.5 ? [{ key: 'cash', label: 'Espèces et fonds euros', value: snapshot.invest.cash, color: 'var(--series-7)' }] : []),
  ];
  const top = [...snapshot.positions].sort((a, b) => b.value - a.value).slice(0, 3);

  return (
    <Card className={className}>
      <CardHeader
        title="Investissements"
        action={
          <Link to="/investissements" className={buttonClass('ghost', 'sm')}>
            Détails <ArrowRight />
          </Link>
        }
      />
      <div className="px-5 pb-5 pt-3">
        <p className="wide money text-[28px] font-semibold leading-tight text-ink">{formatMoney(snapshot.invest.value, { decimals: 0 })}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <Delta value={snapshot.invest.gain} pct={snapshot.invest.gainPct} decimals={0} />
          <span className="text-ink-3">de plus-value</span>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-ink-3">Rendement annualisé</dt>
            <dd className="tnum mt-0.5 font-semibold text-ink">{irr === null ? '—' : formatPct(irr, { sign: true })}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Aujourd'hui</dt>
            <dd className="mt-0.5 font-semibold">
              <Money value={snapshot.invest.dayChange} sign tone="gain" decimals={0} />
            </dd>
          </div>
        </dl>
        {segments.length > 0 && (
          <StackedBar className="mt-5" segments={segments} ariaLabel="Répartition des placements par type d'actif" legend="values" formatValue={(v) => formatMoney(v, { decimals: 0 })} />
        )}
        {top.length > 0 && (
          <ul className="mt-5 flex flex-col divide-y divide-line border-t border-line">
            {top.map((p) => (
              <li key={`${p.accountId}:${p.assetId}`} className="flex items-center gap-3 py-2.5 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{p.asset.name}</span>
                <Money value={p.value} decimals={0} className="font-medium text-ink" />
                <span className={cn('tnum w-16 text-right font-medium', p.unrealized >= 0 ? 'text-good' : 'text-bad')}>
                  {p.unrealizedPct === null ? '—' : formatPct(p.unrealizedPct, { sign: true })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------ Dernières opérations */

function RecentCard({ className }: { className?: string }) {
  const data = useData();
  const accounts = useAccountMap();
  const categories = useCategoryMap();
  const end = today();
  const recent = useMemo(
    () =>
      data.transactions
        .filter((t) => t.date <= end)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 7),
    [data.transactions, end],
  );
  const next = useMemo(() => upcoming(data, 10).slice(0, 4), [data]);

  return (
    <Card className={className}>
      <CardHeader
        title="Dernières transactions"
        action={
          <Link to="/transactions" className={buttonClass('ghost', 'sm')}>
            Tout voir <ArrowRight />
          </Link>
        }
      />
      {recent.length === 0 ? (
        <EmptyState title="Aucune transaction" action={<Button onClick={() => setImportOpen(true)}><Upload /> Importer un relevé</Button>}>
          Ajouter une transaction avec la touche N, ou importer un relevé bancaire.
        </EmptyState>
      ) : (
        <div className="px-2 pb-2 pt-2">
          {recent.map((t) => (
            <TransactionRow key={t.id} tx={t} accounts={accounts} categories={categories} showDate />
          ))}
        </div>
      )}
      {next.length > 0 && (
        <div className="border-t border-line px-5 pb-4 pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-3">
            <CalendarClock className="size-3.5" /> À venir
          </p>
          <ul className="flex flex-col gap-1.5">
            {next.map(({ recurring: r, date }) => (
              <li key={`${r.id}-${date}`} className="flex items-center gap-3 text-[13px]">
                <span className="tnum w-14 shrink-0 text-ink-3">
                  {new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(parseISODate(date)).replace('.', '')}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink-2">{r.label}</span>
                <span className={cn('money tnum font-medium', r.kind === 'income' ? 'text-good' : 'text-ink')}>
                  {r.kind === 'income' ? formatMoney(r.amount, { sign: true }) : r.kind === 'transfer' ? formatMoney(r.amount) : formatMoney(-r.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
