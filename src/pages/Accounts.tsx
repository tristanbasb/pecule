import { ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { AccountDialog } from '../components/dialogs/AccountDialog';
import { Button } from '../components/ui/Button';
import { Delta } from '../components/ui/Money';
import { Card, EmptyState, IconChip, PageHeader } from '../components/ui/misc';
import { cn } from '../lib/cn';
import type { AccountSummary } from '../lib/finance';
import { formatDate } from '../lib/dates';
import { formatMoney, pluralize } from '../lib/format';
import { ACCOUNT_TYPES, KIND_LABELS, KIND_ORDER } from '../lib/meta';
import { useSnapshot } from '../store/selectors';

export function Accounts() {
  const snapshot = useSnapshot();
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const active = snapshot.accounts.filter((s) => !s.account.archived);
  const archived = snapshot.accounts.filter((s) => s.account.archived);

  return (
    <>
      <PageHeader
        title="Comptes"
        subtitle={`${pluralize(active.length, 'compte')} · patrimoine net ${formatMoney(snapshot.netWorth, { decimals: 0 })}`}
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus /> Nouveau compte
          </Button>
        }
      />

      {active.length === 0 ? (
        <Card>
          <EmptyState title="Aucun compte" action={<Button variant="primary" onClick={() => setOpen(true)}>Créer un compte</Button>} className="py-16">
            Compte courant, livret, PEA, assurance-vie, bien immobilier ou crédit.
          </EmptyState>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {KIND_ORDER.map((kind) => {
            const list = active.filter((s) => s.kind === kind).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
            if (!list.length) return null;
            const total = list.reduce((s, x) => s + x.value, 0);
            return (
              <section key={kind} aria-labelledby={`kind-${kind}`}>
                <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
                  <h2 id={`kind-${kind}`} className="wide text-[15px] font-semibold text-ink">
                    {KIND_LABELS[kind]}
                  </h2>
                  <span className="money tnum text-sm font-medium text-ink-2">{formatMoney(total, { decimals: 0 })}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((s) => (
                    <AccountCard key={s.account.id} summary={s} />
                  ))}
                </div>
              </section>
            );
          })}

          {archived.length > 0 && (
            <section>
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex items-center gap-2 px-1 text-[13px] font-medium text-ink-3 hover:text-ink"
              >
                <ChevronDown className={cn('size-4 transition-transform', showArchived && 'rotate-180')} />
                Comptes archivés ({archived.length})
              </button>
              {showArchived && (
                <div className="mt-3 grid gap-3 opacity-80 sm:grid-cols-2 xl:grid-cols-3">
                  {archived.map((s) => (
                    <AccountCard key={s.account.id} summary={s} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <AccountDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AccountCard({ summary }: { summary: AccountSummary }) {
  const { account, kind } = summary;
  const meta = ACCOUNT_TYPES[account.type];
  return (
    <Link
      to={`/comptes/${account.id}`}
      className="group flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition-[border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-field/60"
    >
      <div className="flex items-center gap-3">
        <IconChip icon={meta.icon} color={account.color} />
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold text-ink">{account.name}</p>
          <p className="truncate text-xs text-ink-3">{[meta.label, account.institution].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className={cn('wide money text-[22px] font-semibold leading-none', summary.value < 0 ? 'text-ink-2' : 'text-ink')}>
          {formatMoney(summary.value, { decimals: 'auto' })}
        </p>
        <div className="text-right text-xs text-ink-3">
          {kind === 'invest' && summary.contributions > 0 && <Delta value={summary.gain} pct={summary.gainPct} decimals={0} className="text-[12.5px]" />}
          {kind === 'invest' && summary.positions.length > 0 && <p className="mt-0.5">{pluralize(summary.positions.length, 'ligne')}</p>}
          {(kind === 'asset' || kind === 'liability') && summary.lastValuation && <p>Estimé le {formatDate(summary.lastValuation.date)}</p>}
        </div>
      </div>
    </Link>
  );
}
