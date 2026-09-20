import { cn } from '../lib/cn';
import { formatDate } from '../lib/dates';
import { opDisplayAmount } from '../lib/finance';
import { formatMoney, formatNumber, formatPrice } from '../lib/format';
import { OP_TYPES } from '../lib/meta';
import type { Account, Asset, ID, InvestmentOp } from '../lib/types';
import { openOperation } from '../store/ui';
import { Badge } from './ui/misc';

interface OperationsListProps {
  operations: InvestmentOp[];
  accounts: Map<ID, Account>;
  assets: Map<ID, Asset>;
  showAccount?: boolean;
}

const TYPE_TONE: Record<InvestmentOp['type'], 'neutral' | 'good' | 'brand' | 'warn'> = {
  buy: 'brand',
  sell: 'neutral',
  dividend: 'good',
  interest: 'good',
  deposit: 'neutral',
  withdrawal: 'neutral',
  fee: 'warn',
};

export function OperationsList({ operations, accounts, assets, showAccount }: OperationsListProps) {
  return (
    <ul className="flex flex-col">
      {operations.map((op) => {
        const asset = op.assetId ? assets.get(op.assetId) : undefined;
        const amount = opDisplayAmount(op);
        const detail =
          op.type === 'buy' || op.type === 'sell'
            ? `${formatNumber(op.quantity ?? 0, 6)} × ${formatPrice(op.unitPrice ?? 0)}${op.fees ? ` · frais ${formatMoney(op.fees)}` : ''}`
            : op.note;
        return (
          <li key={op.id}>
            <button
              type="button"
              onClick={() => openOperation({ editId: op.id })}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
            >
              <span className="tnum w-16 shrink-0 text-[12.5px] text-ink-3">{formatDate(op.date)}</span>
              <Badge tone={TYPE_TONE[op.type]} className="w-[74px] justify-center">
                {OP_TYPES[op.type].label}
              </Badge>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-medium text-ink">
                  {asset?.name ?? (showAccount ? accounts.get(op.accountId)?.name : OP_TYPES[op.type].label)}
                  {op.newMoney && <span className="ml-2 text-xs font-normal text-ink-3">avec apport</span>}
                </span>
                <span className="block truncate text-xs text-ink-3">
                  {[detail, showAccount && asset ? accounts.get(op.accountId)?.name : undefined].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className={cn('money tnum shrink-0 text-[13.5px] font-semibold', amount > 0 ? 'text-good' : 'text-ink')}>
                {formatMoney(amount, { sign: true })}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
