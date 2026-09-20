import { Archive, ArchiveRestore, ArrowLeft, Pencil, Plus, Scale, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { LineChart } from '../components/charts/LineChart';
import { AccountDialog } from '../components/dialogs/AccountDialog';
import { ValueDialog } from '../components/dialogs/ValueDialog';
import { OperationsList } from '../components/OperationsList';
import { PositionsTable } from '../components/PositionsTable';
import { TransactionRow } from '../components/TransactionRow';
import { Button, buttonClass } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Segmented } from '../components/ui/fields';
import { Delta, Money } from '../components/ui/Money';
import { Card, CardHeader, EmptyState, IconChip } from '../components/ui/misc';
import { Stat } from '../components/ui/Stat';
import { formatDate, today } from '../lib/dates';
import { annualizedReturn } from '../lib/finance';
import { formatMoney, formatPct, pluralize } from '../lib/format';
import { RANGE_LABELS, earliestDate, netWorthSeries, rangeStart, sampleDates, type RangeKey } from '../lib/history';
import { ACCOUNT_TYPES } from '../lib/meta';
import { useStoredState } from '../lib/useStoredState';
import { adjustCashBalance, deleteAccount, deleteValuation, saveValuation, setAccountArchived } from '../store/actions';
import { notifyDone } from '../store/feedback';
import { usePriceSeries } from '../store/market';
import { useAccountMap, useAssetMap, useCategoryMap, useData, useSnapshot } from '../store/selectors';
import { openOperation, openTransaction, setImportOpen } from '../store/ui';

const RANGES: RangeKey[] = ['3M', '6M', '1A', '3A', 'MAX'];

export function AccountDetail() {
  const { accountId = '' } = useParams();
  const navigate = useNavigate();
  const data = useData();
  const snapshot = useSnapshot();
  const accounts = useAccountMap();
  const categories = useCategoryMap();
  const assets = useAssetMap();
  const summary = snapshot.byId.get(accountId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [valueOpen, setValueOpen] = useState(false);
  const [txLimit, setTxLimit] = useState(40);

  const transactions = useMemo(
    () =>
      data.transactions
        .filter((t) => t.accountId === accountId || t.toAccountId === accountId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [data.transactions, accountId],
  );
  const operations = useMemo(
    () => data.operations.filter((o) => o.accountId === accountId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [data.operations, accountId],
  );
  const valuations = useMemo(() => data.valuations.filter((v) => v.accountId === accountId).sort((a, b) => b.date.localeCompare(a.date)), [data.valuations, accountId]);
  const irr = useMemo(
    () => (summary?.kind === 'invest' ? annualizedReturn(data, new Set([accountId]), summary.value) : null),
    [data, accountId, summary?.kind, summary?.value],
  );

  if (!summary) {
    return (
      <EmptyState
        title="Compte introuvable"
        action={
          <Link to="/comptes" className={buttonClass('primary')}>
            Voir les comptes
          </Link>
        }
        className="py-24"
      >
        Ce compte a peut-être été supprimé.
      </EmptyState>
    );
  }

  const { account, kind } = summary;
  const meta = ACCOUNT_TYPES[account.type];
  const counts = transactions.length + operations.length + valuations.length;

  return (
    <>
      <Link to="/comptes" className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-3 hover:text-ink">
        <ArrowLeft className="size-4" /> Comptes
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <IconChip icon={meta.icon} color={account.color} size="lg" />
          <div className="min-w-0">
            <h1 className="display truncate text-[28px] leading-tight text-ink">{account.name}</h1>
            <p className="text-sm text-ink-3">
              {[meta.label, account.institution, account.archived ? 'Archivé' : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setEditOpen(true)}>
            <Pencil /> Modifier
          </Button>
          <Button
            onClick={() => {
              setAccountArchived(account.id, !account.archived);
              notifyDone(account.archived ? 'Compte réactivé' : 'Compte archivé');
            }}
          >
            {account.archived ? <ArchiveRestore /> : <Archive />} {account.archived ? 'Réactiver' : 'Archiver'}
          </Button>
          <Button variant="ghost" className="text-bad hover:bg-bad-soft hover:text-bad" onClick={() => setDeleteOpen(true)}>
            <Trash2 /> Supprimer
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-12">
          <div className="flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[13px] font-medium text-ink-3">
                {kind === 'liability' ? 'Capital restant dû' : kind === 'asset' ? 'Valeur estimée' : kind === 'invest' ? 'Valeur du compte' : 'Solde'}
              </p>
              <p className="display money mt-1 text-[40px] leading-none text-ink">{formatMoney(kind === 'liability' ? -summary.value : summary.value)}</p>
              {kind === 'invest' && (
                <p className="mt-2 flex items-center gap-2 text-sm">
                  <Delta value={summary.gain} pct={summary.gainPct} /> <span className="text-ink-3">de plus-value</span>
                </p>
              )}
              {(kind === 'asset' || kind === 'liability') && summary.lastValuation && (
                <p className="mt-2 text-sm text-ink-3">Mise à jour le {formatDate(summary.lastValuation.date, 'long')}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {kind === 'cash' && (
                <>
                  <Button variant="primary" onClick={() => openTransaction({ draft: { accountId: account.id } })}>
                    <Plus /> Transaction
                  </Button>
                  <Button onClick={() => setImportOpen(true)}>
                    <Upload /> Importer
                  </Button>
                  <Button onClick={() => setValueOpen(true)}>
                    <Scale /> Corriger le solde
                  </Button>
                </>
              )}
              {kind === 'invest' && (
                <>
                  <Button variant="primary" onClick={() => openOperation({ draft: { accountId: account.id } })}>
                    <Plus /> Opération
                  </Button>
                  <Button onClick={() => openTransaction({ draft: { kind: 'transfer', toAccountId: account.id } })}>Virement vers ce compte</Button>
                  <Button onClick={() => setValueOpen(true)}>
                    <Scale /> Corriger les espèces
                  </Button>
                </>
              )}
              {(kind === 'asset' || kind === 'liability') && (
                <Button variant="primary" onClick={() => setValueOpen(true)}>
                  <Pencil /> Mettre à jour
                </Button>
              )}
            </div>
          </div>
          {kind === 'invest' && (
            <div className="grid grid-cols-2 gap-5 border-t border-line px-5 py-4 sm:grid-cols-5 sm:px-6">
              <Stat label="Titres" value={<Money value={summary.holdingsValue} decimals={0} tabular={false} />} valueClassName="text-[18px]" />
              <Stat label="Espèces" value={<Money value={summary.cash} decimals={0} tabular={false} />} valueClassName="text-[18px]" />
              <Stat label="Apports nets" value={<Money value={summary.contributions} decimals={0} tabular={false} />} valueClassName="text-[18px]" />
              <Stat label="Dividendes" value={<Money value={summary.dividends} decimals={0} tabular={false} />} valueClassName="text-[18px]" />
              <Stat label="Rendement annualisé" value={irr === null ? '—' : formatPct(irr, { sign: true })} valueClassName="text-[18px]" />
            </div>
          )}
        </Card>

        <AccountChart accountId={account.id} liability={kind === 'liability'} className="lg:col-span-12" />

        {kind === 'invest' && (
          <Card className="lg:col-span-12">
            <CardHeader title="Titres détenus" subtitle={pluralize(summary.positions.length, 'ligne')} />
            <div className="mt-3 pb-2">
              {summary.positions.length ? (
                <PositionsTable positions={summary.positions} totalValue={summary.value} cash={summary.cash} />
              ) : (
                <p className="px-5 pb-4 text-sm text-ink-3">Aucun titre pour le moment.</p>
              )}
            </div>
          </Card>
        )}

        {kind === 'invest' && operations.length > 0 && (
          <Card className="lg:col-span-12">
            <CardHeader title="Opérations" subtitle={pluralize(operations.length, 'opération')} />
            <div className="px-2 pb-3 pt-2">
              <OperationsList operations={operations} accounts={accounts} assets={assets} />
            </div>
          </Card>
        )}

        {(kind === 'asset' || kind === 'liability') && (
          <Card className="lg:col-span-12">
            <CardHeader title="Historique des estimations" />
            {valuations.length ? (
              <ul className="flex flex-col divide-y divide-line px-5 pb-3 pt-2">
                {valuations.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-28 text-ink-2">{formatDate(v.date, 'numeric')}</span>
                    <Money value={v.value} className="flex-1 font-medium text-ink" />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Supprimer l'estimation du ${formatDate(v.date, 'numeric')}`}
                      onClick={() => {
                        deleteValuation(v.id);
                        notifyDone('Estimation supprimée');
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 pt-2 text-sm text-ink-3">Valeur de départ : {formatMoney(account.openingBalance)}.</p>
            )}
          </Card>
        )}

        {(kind === 'cash' || transactions.length > 0) && (
          <Card className="lg:col-span-12">
            <CardHeader
              title="Transactions"
              subtitle={pluralize(transactions.length, 'transaction')}
              action={
                <Link to={`/transactions?mois=tout&compte=${account.id}`} className={buttonClass('ghost', 'sm')}>
                  Filtrer dans Transactions
                </Link>
              }
            />
            <div className="px-2 pb-3 pt-2">
              {transactions.length ? (
                <>
                  {transactions.slice(0, txLimit).map((t) => (
                    <TransactionRow key={t.id} tx={t} accounts={accounts} categories={categories} perspective={account.id} showDate />
                  ))}
                  {transactions.length > txLimit && (
                    <div className="flex justify-center pt-2">
                      <Button size="sm" onClick={() => setTxLimit((n) => n + 60)}>
                        Afficher plus
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <p className="px-3 py-6 text-sm text-ink-3">Aucune transaction sur ce compte.</p>
              )}
            </div>
          </Card>
        )}
      </div>

      <AccountDialog open={editOpen} onClose={() => setEditOpen(false)} account={account} />
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Supprimer ce compte ?"
        confirmLabel="Supprimer définitivement"
        message={
          counts > 0
            ? `${account.name} et ses ${counts} éléments (transactions, opérations, estimations) seront supprimés. Pour garder l'historique, archiver le compte plutôt.`
            : `${account.name} sera supprimé.`
        }
        onConfirm={() => {
          deleteAccount(account.id);
          notifyDone('Compte supprimé');
          navigate('/comptes');
        }}
      />
      <ValueDialog
        open={valueOpen}
        onClose={() => setValueOpen(false)}
        title={kind === 'cash' ? 'Corriger le solde' : kind === 'invest' ? 'Corriger les espèces' : kind === 'asset' ? 'Mettre à jour la valeur' : 'Mettre à jour le capital restant dû'}
        description={
          kind === 'cash' || kind === 'invest'
            ? 'Une correction datée est ajoutée pour que le montant corresponde à celui de la banque.'
            : 'La nouvelle estimation sert au calcul du patrimoine à partir de cette date.'
        }
        label={kind === 'cash' ? 'Solde constaté' : kind === 'invest' ? 'Espèces constatées' : kind === 'asset' ? 'Valeur estimée' : 'Capital restant dû'}
        submitLabel="Enregistrer"
        allowNegative={kind === 'cash' || kind === 'invest'}
        initialValue={kind === 'cash' || kind === 'invest' ? summary.cash : Math.abs(summary.value)}
        onSubmit={(date, value) => {
          if (kind === 'cash' || kind === 'invest') {
            adjustCashBalance(account.id, value, date);
            notifyDone('Solde corrigé');
          } else {
            saveValuation({ accountId: account.id, date, value });
            notifyDone('Estimation enregistrée');
          }
        }}
      />
    </>
  );
}

function AccountChart({ accountId, liability, className }: { accountId: string; liability: boolean; className?: string }) {
  const data = useData();
  const { series } = usePriceSeries();
  const [range, setRange] = useStoredState<RangeKey>('pecule:accountRange', '1A', RANGES);
  const points = useMemo(() => {
    const end = today();
    return netWorthSeries(data, sampleDates(rangeStart(range, end, earliestDate(data)), end), series, (id) => id === accountId);
  }, [data, series, range, accountId]);

  return (
    <Card className={className}>
      <CardHeader
        title="Évolution"
        action={
          <Segmented<RangeKey>
            label="Période"
            size="sm"
            value={range}
            onChange={setRange}
            options={RANGES.map((r) => ({ value: r, label: r === 'MAX' ? 'Tout' : RANGE_LABELS[r] }))}
          />
        }
      />
      <div className="px-3 pb-4 pt-3 sm:px-5">
        <LineChart
          dates={points.map((p) => p.date)}
          height={220}
          ariaLabel="Évolution de la valeur du compte"
          series={[
            {
              key: 'value',
              label: liability ? 'Capital restant dû' : 'Valeur',
              values: points.map((p) => (liability ? -p.total : p.total)),
              color: 'var(--series-1)',
              primary: true,
            },
          ]}
        />
      </div>
    </Card>
  );
}
