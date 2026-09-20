import { ArrowLeftRight, Repeat, StickyNote } from 'lucide-react';
import { cn } from '../lib/cn';
import { formatDate, today } from '../lib/dates';
import { txEffect } from '../lib/finance';
import { formatMoney } from '../lib/format';
import type { Account, Category, ID, Transaction } from '../lib/types';
import { openTransaction } from '../store/ui';
import { Badge, IconChip } from './ui/misc';

interface TransactionRowProps {
  tx: Transaction;
  accounts: Map<ID, Account>;
  categories: Map<ID, Category>;
  /** Montant vu depuis ce compte (utile pour les virements). */
  perspective?: ID;
  showDate?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  className?: string;
}

export function TransactionRow({ tx, accounts, categories, perspective, showDate, selected, onToggleSelect, className }: TransactionRowProps) {
  const category = tx.categoryId ? categories.get(tx.categoryId) : undefined;
  const from = accounts.get(tx.accountId);
  const to = tx.toAccountId ? accounts.get(tx.toAccountId) : undefined;
  const isTransfer = tx.kind === 'transfer';
  const signed = perspective ? txEffect(tx, perspective) : isTransfer ? -tx.amount : tx.kind === 'income' ? tx.amount : -tx.amount;
  const future = tx.date > today();

  const meta = isTransfer
    ? `${from?.name ?? 'Compte supprimé'} → ${to?.name ?? 'Compte supprimé'}`
    : [tx.adjustment ? 'Correction de solde' : (category?.name ?? 'Sans catégorie'), from?.name].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-surface-2',
        selected && 'bg-brand-soft/60 hover:bg-brand-soft/80',
        className,
      )}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={onToggleSelect}
          aria-label={`Sélectionner ${tx.label}`}
          className="size-4 shrink-0 accent-[var(--brand)]"
        />
      )}
      <button
        type="button"
        onClick={() => openTransaction({ editId: tx.id })}
        className="flex min-w-0 flex-1 items-center gap-3 text-left outline-offset-4"
      >
        {isTransfer ? (
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-3 text-ink-2">
            <ArrowLeftRight className="size-[18px]" />
          </span>
        ) : (
          <IconChip icon={tx.adjustment ? 'scale' : category?.icon} color={category?.color} className={cn(!category && 'opacity-60')} />
        )}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-medium text-ink">{tx.label}</span>
            {tx.recurringId && <Repeat aria-label="Récurrente" className="size-3.5 shrink-0 text-ink-3" />}
            {tx.note && <StickyNote aria-label="Avec une note" className="size-3.5 shrink-0 text-ink-3" />}
            {future && <Badge tone="brand">À venir</Badge>}
          </span>
          <span className="block truncate text-[12.5px] text-ink-3">
            {showDate && `${formatDate(tx.date)} · `}
            {meta}
          </span>
        </span>
        <span
          className={cn(
            'money tnum shrink-0 whitespace-nowrap text-[14px] font-semibold',
            signed > 0 && !isTransfer ? 'text-good' : isTransfer && !perspective ? 'text-ink-2' : signed > 0 ? 'text-good' : 'text-ink',
          )}
        >
          {isTransfer && !perspective ? formatMoney(tx.amount) : formatMoney(signed, { sign: true })}
        </span>
      </button>
    </div>
  );
}
