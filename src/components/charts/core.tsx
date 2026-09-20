import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { formatMoney } from '../../lib/format';

export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (width: number, height: number) =>
      setSize((s) => (Math.abs(s.width - width) < 0.5 && Math.abs(s.height - height) < 0.5 ? s : { width, height }));
    update(el.clientWidth, el.clientHeight);
    const observer = new ResizeObserver(([entry]) => update(entry.contentRect.width, entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/** Graduations « rondes » couvrant [min, max]. */
export function niceTicks(min: number, max: number, count = 4): number[] {
  let lo = min;
  let hi = max;
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (hi - lo < 1e-9) {
    const pad = Math.abs(lo) * 0.05 || 1;
    lo -= pad;
    hi += pad;
  }
  const rough = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm >= 7 ? 10 : norm >= 3.5 ? 5 : norm >= 2.2 ? 2.5 : norm >= 1.4 ? 2 : 1) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2 && ticks.length < 20; v += step) ticks.push(Math.round(v / step) * step);
  return ticks;
}

export const axisMoney = (v: number) => formatMoney(v, { decimals: 0, compact: Math.abs(v) >= 10_000 });

export interface TooltipRow {
  key: string;
  label: string;
  value: string;
  /** Couleur de la clé (trait court) ; absente pour une ligne de total. */
  color?: string;
  strong?: boolean;
}

interface TooltipProps {
  x: number;
  y: number;
  containerWidth: number;
  title: string;
  rows: TooltipRow[];
}

/** Infobulle : la valeur prime, le libellé suit ; clés en trait court. */
export function ChartTooltip({ x, y, containerWidth, title, rows }: TooltipProps) {
  const flip = x > containerWidth - 190;
  const style: CSSProperties = {
    left: flip ? undefined : x + 14,
    right: flip ? containerWidth - x + 14 : undefined,
    top: Math.max(0, y),
  };
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-36 rounded-lg border border-line bg-surface px-3 py-2 text-xs text-ink shadow-float"
      style={style}
    >
      <p className="mb-1 text-[11px] font-medium text-ink-3">{title}</p>
      <div className="flex flex-col gap-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            {r.color ? (
              <span aria-hidden className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
            ) : (
              <span aria-hidden className="w-3 shrink-0" />
            )}
            <span className={cn('money tnum text-[13px] text-ink', r.strong ? 'font-semibold' : 'font-medium')}>{r.value}</span>
            <span className="ml-auto pl-3 text-ink-3">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({ items, className }: { items: { key: string; label: string; color: string; shape?: 'rect' | 'line' }[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2', className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn('shrink-0', item.shape === 'line' ? 'h-0.5 w-3.5 rounded-full' : 'size-2.5 rounded-[3px]')}
            style={{ backgroundColor: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

interface DataTableProps {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
  className?: string;
}

/** Équivalent tabulaire d'un graphique. */
export function DataTable({ caption, columns, rows, className }: DataTableProps) {
  return (
    <div className={cn('max-h-72 overflow-auto rounded-lg border border-line', className)}>
      <table className="w-full text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface-2 text-xs text-ink-3">
          <tr>
            {columns.map((c, i) => (
              <th key={c} scope="col" className={cn('px-3 py-2 font-medium', i > 0 && 'text-right')}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((cell, j) => (
                <td key={j} className={cn('money px-3 py-1.5', j > 0 ? 'tnum text-right text-ink' : 'text-ink-2')}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('relative w-full select-none', className)}>{children}</div>;
}
