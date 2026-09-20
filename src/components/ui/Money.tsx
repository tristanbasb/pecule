import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { formatMoney, formatPct, type MoneyOptions } from '../../lib/format';

type Tone = 'none' | 'gain' | 'flow';

interface MoneyProps extends MoneyOptions {
  value: number;
  /** gain : vert/rouge selon le signe · flow : vert pour les entrées. */
  tone?: Tone;
  /** Chiffres à chasse fixe (colonnes). Désactiver pour les grands nombres isolés. */
  tabular?: boolean;
  className?: string;
}

const EPS = 0.004;

export function toneClass(value: number, tone: Tone) {
  if (tone === 'gain') return value > EPS ? 'text-good' : value < -EPS ? 'text-bad' : '';
  if (tone === 'flow') return value > EPS ? 'text-good' : '';
  return '';
}

export function Money({ value, tone = 'none', tabular = true, className, ...opts }: MoneyProps) {
  return (
    <span className={cn('money whitespace-nowrap', tabular && 'tnum', toneClass(value, tone), className)}>
      {formatMoney(value, opts)}
    </span>
  );
}

interface DeltaProps {
  value: number;
  pct?: number | null;
  className?: string;
  /** Variante pour le panneau sombre du patrimoine. */
  onVault?: boolean;
  decimals?: MoneyOptions['decimals'];
}

/** Variation signée avec flèche : la direction ne repose jamais sur la seule couleur. */
export function Delta({ value, pct, className, onVault, decimals = 'auto' }: DeltaProps) {
  const up = value > EPS;
  const down = value < -EPS;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : ArrowRight;
  const color = onVault
    ? up
      ? 'text-vault-good'
      : down
        ? 'text-vault-bad'
        : 'text-vault-ink-2'
    : up
      ? 'text-good'
      : down
        ? 'text-bad'
        : 'text-ink-3';
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap font-medium', color, className)}>
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
      <span className="money tnum">{formatMoney(value, { sign: true, decimals })}</span>
      {pct !== undefined && pct !== null && Number.isFinite(pct) && (
        <span className="tnum opacity-90">({formatPct(pct, { sign: true })})</span>
      )}
    </span>
  );
}
