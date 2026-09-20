import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface StatProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  className?: string;
  valueClassName?: string;
}

/** Chiffre clé : libellé, valeur (chiffres proportionnels), précision éventuelle. */
export function Stat({ label, value, sub, className, valueClassName }: StatProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
      <p className={cn('wide mt-1 truncate text-[22px] font-semibold leading-tight text-ink', valueClassName)}>{value}</p>
      {sub && <div className="mt-1 text-[12.5px] text-ink-3">{sub}</div>}
    </div>
  );
}
