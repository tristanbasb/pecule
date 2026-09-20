import { Minus, Pencil, Plus, Tag, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/cn';
import { formatDate } from '../lib/dates';
import type { PositionView } from '../lib/finance';
import { formatMoney, formatNumber, formatPct, formatPrice } from '../lib/format';
import type { Account, Asset, ID } from '../lib/types';
import { setManualPrice } from '../store/actions';
import { notifyDone } from '../store/feedback';
import { useMarket } from '../store/market';
import { openOperation } from '../store/ui';
import { openAssetDialog } from './dialogs/AssetDialog';
import { ValueDialog } from './dialogs/ValueDialog';
import { Button } from './ui/Button';

interface PositionsTableProps {
  positions: PositionView[];
  /** Base du poids de chaque ligne. */
  totalValue: number;
  accounts?: Map<ID, Account>;
  showAccount?: boolean;
  cash?: number;
}

export function PositionsTable({ positions, totalValue, accounts, showAccount, cash }: PositionsTableProps) {
  const errors = useMarket((s) => s.errors);
  const [priceAsset, setPriceAsset] = useState<Asset | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-3">
            <th scope="col" className="py-2 pl-5 pr-3 font-medium">Titre</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Quantité</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">PRU</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Cours</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Valeur</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Plus-value latente</th>
            <th scope="col" className="px-3 py-2 text-right font-medium">Poids</th>
            <th scope="col" className="py-2 pl-3 pr-5">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {positions.map((p) => {
            const error = errors[p.asset.id];
            const change = p.priceSource === 'market' ? p.asset.changePct : null;
            return (
              <tr key={`${p.accountId}:${p.assetId}`} className="group hover:bg-surface-2/60">
                <td className="max-w-[280px] py-2.5 pl-5 pr-3">
                  <p className="truncate font-medium text-ink" title={p.asset.name}>
                    {p.asset.name}
                  </p>
                  <p className="truncate text-xs text-ink-3">
                    {p.asset.symbol && <span className="font-mono text-[11px]">{p.asset.symbol}</span>}
                    {p.asset.symbol && showAccount && accounts ? ' · ' : ''}
                    {showAccount && accounts?.get(p.accountId)?.name}
                  </p>
                </td>
                <td className="tnum px-3 py-2.5 text-right text-ink-2">{formatNumber(p.quantity, 6)}</td>
                <td className="money tnum px-3 py-2.5 text-right text-ink-2">{formatPrice(p.avgPrice)}</td>
                <td className="px-3 py-2.5 text-right">
                  {p.price === null ? (
                    <span className="inline-flex items-center gap-1 text-warn" title="Cours inconnu : valorisé au prix de revient">
                      <TriangleAlert className="size-3.5" /> —
                    </span>
                  ) : (
                    <>
                      <span className="money tnum text-ink">{formatPrice(p.price)}</span>
                      <span className="block text-[11.5px] leading-tight">
                        {error ? (
                          <span className="inline-flex items-center gap-1 text-warn" title={error}>
                            <TriangleAlert className="size-3" /> non actualisé
                          </span>
                        ) : typeof change === 'number' ? (
                          <span className={cn('tnum', change > 0 ? 'text-good' : change < 0 ? 'text-bad' : 'text-ink-3')}>
                            {formatPct(change / 100, { sign: true })}
                          </span>
                        ) : p.priceSource === 'operation' ? (
                          <span className="text-ink-3">dernière opération</span>
                        ) : p.priceSource === 'manual' && p.priceDate ? (
                          <span className="text-ink-3">saisi le {formatDate(p.priceDate.slice(0, 10))}</span>
                        ) : null}
                      </span>
                    </>
                  )}
                </td>
                <td className="money tnum px-3 py-2.5 text-right font-semibold text-ink">{formatMoney(p.value)}</td>
                <td className="px-3 py-2.5 text-right">
                  <span className={cn('money tnum font-medium', p.unrealized > 0.004 ? 'text-good' : p.unrealized < -0.004 ? 'text-bad' : 'text-ink-2')}>
                    {formatMoney(p.unrealized, { sign: true })}
                  </span>
                  <span className="tnum block text-[11.5px] text-ink-3">{p.unrealizedPct === null ? '—' : formatPct(p.unrealizedPct, { sign: true })}</span>
                </td>
                <td className="tnum px-3 py-2.5 text-right text-ink-2">{totalValue > 0 ? formatPct(p.value / totalValue) : '—'}</td>
                <td className="py-2 pl-3 pr-5">
                  <div className="flex justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon-sm" title="Acheter" aria-label={`Acheter ${p.asset.name}`} onClick={() => openOperation({ draft: { type: 'buy', accountId: p.accountId, assetId: p.assetId } })}>
                      <Plus />
                    </Button>
                    <Button variant="ghost" size="icon-sm" title="Vendre" aria-label={`Vendre ${p.asset.name}`} onClick={() => openOperation({ draft: { type: 'sell', accountId: p.accountId, assetId: p.assetId, quantity: p.quantity } })}>
                      <Minus />
                    </Button>
                    {p.asset.provider === 'manual' && (
                      <Button variant="ghost" size="icon-sm" title="Mettre à jour le cours" aria-label={`Mettre à jour le cours de ${p.asset.name}`} onClick={() => setPriceAsset(p.asset)}>
                        <Tag />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon-sm" title="Modifier le titre" aria-label={`Modifier ${p.asset.name}`} onClick={() => openAssetDialog({ editId: p.assetId })}>
                      <Pencil />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
          {cash !== undefined && Math.abs(cash) > 0.004 && (
            <tr>
              <td className="py-2.5 pl-5 pr-3 font-medium text-ink-2">Espèces</td>
              <td colSpan={3} />
              <td className="money tnum px-3 py-2.5 text-right font-semibold text-ink">{formatMoney(cash)}</td>
              <td />
              <td className="tnum px-3 py-2.5 text-right text-ink-2">{totalValue > 0 ? formatPct(cash / totalValue) : '—'}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>

      <ValueDialog
        open={Boolean(priceAsset)}
        onClose={() => setPriceAsset(null)}
        title="Mettre à jour le cours"
        description={priceAsset?.name}
        label="Cours unitaire"
        submitLabel="Enregistrer le cours"
        initialValue={priceAsset?.manualPrices?.[priceAsset.manualPrices.length - 1]?.[1]}
        onSubmit={(date, value) => {
          if (!priceAsset) return;
          setManualPrice(priceAsset.id, date, value);
          notifyDone('Cours mis à jour');
        }}
      />
    </div>
  );
}
