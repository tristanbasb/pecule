import { ChartLine, Plus, RefreshCw, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { StackedBar, type StackSegment } from '../components/charts/Bars';
import { LineChart } from '../components/charts/LineChart';
import { openAssetDialog } from '../components/dialogs/AssetDialog';
import { OperationsList } from '../components/OperationsList';
import { PositionsTable } from '../components/PositionsTable';
import { Button, buttonClass } from '../components/ui/Button';
import { Segmented, Select } from '../components/ui/fields';
import { Delta, Money } from '../components/ui/Money';
import { Card, CardHeader, EmptyState, IconChip, PageHeader, Spinner } from '../components/ui/misc';
import { Stat } from '../components/ui/Stat';
import { cn } from '../lib/cn';
import { formatDateTime, today } from '../lib/dates';
import { annualizedReturn } from '../lib/finance';
import { formatMoney, formatPct, pluralize } from '../lib/format';
import { RANGE_LABELS, earliestDate, netWorthSeries, rangeStart, sampleDates, type RangeKey } from '../lib/history';
import { ACCOUNT_TYPES, ASSET_CLASSES, ASSET_CLASS_ORDER, accountKind, colorVar } from '../lib/meta';
import { useStoredState } from '../lib/useStoredState';
import { refreshQuotes, useMarket, usePriceSeries } from '../store/market';
import { useAccountMap, useAssetMap, useData, useSnapshot } from '../store/selectors';
import { openOperation } from '../store/ui';

const RANGES: RangeKey[] = ['1M', '3M', '6M', '1A', '3A', 'MAX'];

export function Investments() {
  const data = useData();
  const snapshot = useSnapshot();
  const accounts = useAccountMap();
  const assets = useAssetMap();
  const { refreshing, lastRefresh, errors } = useMarket();
  const investAccounts = useMemo(() => data.accounts.filter((a) => accountKind(a.type) === 'invest' && !a.archived), [data.accounts]);
  const investIds = useMemo(() => new Set(data.accounts.filter((a) => accountKind(a.type) === 'invest').map((a) => a.id)), [data.accounts]);
  const irr = useMemo(() => annualizedReturn(data, investIds, snapshot.invest.value), [data, investIds, snapshot.invest.value]);
  const [opsAccount, setOpsAccount] = useState('');
  const [opsLimit, setOpsLimit] = useState(25);

  async function refresh() {
    try {
      const result = await refreshQuotes();
      if (!result) toast('Aucun titre à cours automatique à actualiser.');
      else if (result.failed) toast.warning(`${pluralize(result.updated, 'cours mis à jour', 'cours mis à jour')}, ${result.failed} en échec`);
      else toast.success(`${pluralize(result.updated, 'cours mis à jour', 'cours mis à jour')}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Actualisation impossible');
    }
  }

  if (!investIds.size) {
    return (
      <>
        <PageHeader title="Investissements" />
        <Card>
          <EmptyState
            icon={<ChartLine />}
            title="Aucun compte de placement"
            action={
              <Link to="/comptes" className={buttonClass('primary')}>
                Créer un PEA, un compte-titres…
              </Link>
            }
            className="py-16"
          >
            PEA, compte-titres, assurance-vie, PER ou portefeuille crypto : chaque compte suit ses titres, ses espèces et ses
            performances.
          </EmptyState>
        </Card>
      </>
    );
  }

  const ops = data.operations
    .filter((o) => !opsAccount || o.accountId === opsAccount)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const errorCount = Object.keys(errors).length;

  return (
    <>
      <PageHeader
        title="Investissements"
        subtitle={
          lastRefresh ? `Cours actualisés à ${formatDateTime(new Date(lastRefresh).toISOString()).split(' ').pop()}` : 'Cours issus de Yahoo Finance et CoinGecko'
        }
        actions={
          <>
            <Button onClick={() => void refresh()} disabled={refreshing}>
              {refreshing ? <Spinner /> : <RefreshCw />} Actualiser les cours
            </Button>
            <Button onClick={() => openAssetDialog()}>Ajouter un titre</Button>
            <Button variant="primary" onClick={() => openOperation()}>
              <Plus /> Opération
            </Button>
          </>
        }
      />

      {errorCount > 0 && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          <TriangleAlert className="size-4 shrink-0" />
          {pluralize(errorCount, 'cours n’a pas pu être actualisé', 'cours n’ont pas pu être actualisés')} : le dernier cours connu est utilisé.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <div className="grid grid-cols-2 gap-5 p-5 sm:p-6 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Valeur totale" value={<Money value={snapshot.invest.value} decimals={0} tabular={false} />} valueClassName="text-[26px]" />
            <Stat label="Apports nets" value={<Money value={snapshot.invest.contributions} decimals={0} tabular={false} />} />
            <Stat
              label="Plus-value totale"
              value={<Money value={snapshot.invest.gain} sign tone="gain" decimals={0} tabular={false} />}
              sub={snapshot.invest.gainPct !== null ? `${formatPct(snapshot.invest.gainPct, { sign: true })} des apports` : undefined}
            />
            <Stat label="Rendement annualisé" value={irr === null ? '—' : formatPct(irr, { sign: true })} sub="Taux de rendement interne" />
            <Stat label="Dividendes et réalisé" value={<Money value={snapshot.invest.dividends + snapshot.invest.realized} sign tone="gain" decimals={0} tabular={false} />} sub={`dont ${formatMoney(snapshot.invest.dividends, { decimals: 0 })} de dividendes`} />
            <Stat label="Aujourd'hui" value={<Money value={snapshot.invest.dayChange} sign tone="gain" decimals={0} tabular={false} />} />
          </div>
        </Card>

        <ValueChart className="lg:col-span-7" investIds={investIds} />
        <AllocationCard className="lg:col-span-5" />

        {investAccounts.map((account) => {
          const summary = snapshot.byId.get(account.id);
          if (!summary) return null;
          return (
            <Card key={account.id} className="lg:col-span-12">
              <CardHeader
                title={
                  <Link to={`/comptes/${account.id}`} className="flex items-center gap-2.5 hover:underline">
                    <IconChip icon={ACCOUNT_TYPES[account.type].icon} color={account.color} size="sm" />
                    {account.name}
                  </Link>
                }
                subtitle={[ACCOUNT_TYPES[account.type].label, account.institution].filter(Boolean).join(' · ')}
                action={
                  <div className="text-right">
                    <p className="money tnum text-[17px] font-semibold text-ink">{formatMoney(summary.value)}</p>
                    <Delta value={summary.gain} pct={summary.gainPct} className="text-[12.5px]" />
                  </div>
                }
              />
              <div className="mt-3 pb-2">
                {summary.positions.length ? (
                  <PositionsTable positions={summary.positions} totalValue={summary.value} cash={summary.cash} />
                ) : (
                  <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-2 px-4 py-3 text-[13.5px]">
                    <span className="text-ink-2">
                      Aucun titre · espèces et fonds euros <Money value={summary.cash} className="ml-1 font-semibold text-ink" />
                    </span>
                    <Button size="sm" onClick={() => openOperation({ draft: { type: 'buy', accountId: account.id } })}>
                      <Plus /> Enregistrer un achat
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}

        <Card className="lg:col-span-12">
          <CardHeader
            title="Opérations"
            subtitle={pluralize(ops.length, 'opération')}
            action={
              <Select aria-label="Filtrer par compte" value={opsAccount} onChange={(e) => setOpsAccount(e.target.value)} className="h-8 w-48">
                <option value="">Tous les comptes</option>
                {investAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            }
          />
          <div className="px-2 pb-3 pt-2">
            {ops.length ? (
              <>
                <OperationsList operations={ops.slice(0, opsLimit)} accounts={accounts} assets={assets} showAccount={!opsAccount} />
                {ops.length > opsLimit && (
                  <div className="flex justify-center pt-2">
                    <Button size="sm" onClick={() => setOpsLimit((n) => n + 50)}>
                      Afficher plus
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <p className="px-3 py-6 text-sm text-ink-3">Aucune opération enregistrée.</p>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

function ValueChart({ className, investIds }: { className?: string; investIds: Set<string> }) {
  const data = useData();
  const { series } = usePriceSeries();
  const [range, setRange] = useStoredState<RangeKey>('pecule:investRange', '1A', RANGES);
  const points = useMemo(() => {
    const end = today();
    return netWorthSeries(data, sampleDates(rangeStart(range, end, earliestDate(data)), end), series, (id) => investIds.has(id));
  }, [data, series, range, investIds]);

  return (
    <Card className={className}>
      <CardHeader
        title="Valeur et apports"
        subtitle="L'écart entre les deux courbes est la plus-value"
        action={
          <Segmented<RangeKey>
            label="Période"
            size="sm"
            value={range}
            onChange={setRange}
            options={RANGES.map((r) => ({ value: r, label: r === 'MAX' ? 'Tout' : RANGE_LABELS[r].replace(' mois', ' m').replace(' ans', ' a').replace(' an', ' a') }))}
          />
        }
      />
      <div className="px-3 pb-4 pt-3 sm:px-5">
        <LineChart
          dates={points.map((p) => p.date)}
          height={240}
          ariaLabel="Valeur des placements comparée aux apports"
          series={[
            { key: 'value', label: 'Valeur', values: points.map((p) => p.invest), color: 'var(--series-1)', primary: true },
            { key: 'contrib', label: 'Apports nets', values: points.map((p) => p.contributions), color: 'var(--ink-3)' },
          ]}
        />
        <div className="mt-2 flex gap-4 px-1 text-xs text-ink-2">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-s1" /> Valeur
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-ink-3" /> Apports nets
          </span>
        </div>
      </div>
    </Card>
  );
}

function AllocationCard({ className }: { className?: string }) {
  const snapshot = useSnapshot();
  const [mode, setMode] = useStoredState<'class' | 'account'>('pecule:allocation', 'class', ['class', 'account']);

  const segments: StackSegment[] = useMemo(() => {
    if (mode === 'account') {
      return snapshot.accounts
        .filter((s) => s.kind === 'invest' && s.value > 0.5)
        .sort((a, b) => b.value - a.value)
        .map((s) => ({ key: s.account.id, label: s.account.name, value: s.value, color: colorVar(s.account.color) }));
    }
    const byClass = new Map<string, number>();
    for (const p of snapshot.positions) byClass.set(p.asset.assetClass, (byClass.get(p.asset.assetClass) ?? 0) + p.value);
    return [
      ...ASSET_CLASS_ORDER.filter((c) => (byClass.get(c) ?? 0) > 0).map((c) => ({
        key: c,
        label: ASSET_CLASSES[c].label,
        value: byClass.get(c) ?? 0,
        color: colorVar(ASSET_CLASSES[c].color),
      })),
      ...(snapshot.invest.cash > 0.5 ? [{ key: 'cash', label: 'Espèces et fonds euros', value: snapshot.invest.cash, color: 'var(--series-7)' }] : []),
    ];
  }, [snapshot, mode]);

  const top = [...snapshot.positions].sort((a, b) => b.value - a.value).slice(0, 5);
  const total = snapshot.invest.value;

  return (
    <Card className={className}>
      <CardHeader
        title="Répartition"
        action={
          <Segmented<'class' | 'account'>
            label="Répartir par"
            size="sm"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'class', label: 'Type' },
              { value: 'account', label: 'Compte' },
            ]}
          />
        }
      />
      <div className="px-5 pb-5 pt-4">
        <StackedBar segments={segments} ariaLabel="Répartition des placements" height={14} formatValue={(v) => formatMoney(v, { decimals: 0 })} />
        {top.length > 0 && (
          <>
            <p className="mb-2 mt-6 text-[12.5px] font-medium text-ink-3">Principales lignes</p>
            <ul className="flex flex-col gap-2.5">
              {top.map((p) => {
                const share = total > 0 ? p.value / total : 0;
                return (
                  <li key={`${p.accountId}:${p.assetId}`} className="text-[13px]">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-ink">{p.asset.name}</span>
                      <span className="tnum shrink-0 text-ink-2">{formatPct(share)}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-3">
                      <div className={cn('h-full rounded-full bg-s1')} style={{ width: `${Math.max(1, share * 100)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}
