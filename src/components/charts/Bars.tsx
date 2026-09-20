import { CircleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { formatMoney, formatPct } from '../../lib/format';
import type { BudgetStatus } from '../../lib/finance';
import { axisMoney, ChartTooltip, Legend, niceTicks, useSize } from './core';

/* ------------------------------------------------------------ Colonnes groupées */

export interface ColumnGroup {
  key: string;
  label: string;
  /** Titre complet pour l'infobulle. */
  title: string;
  values: number[];
  /** Ligne supplémentaire de l'infobulle (ex. solde). */
  extra?: { label: string; value: string };
}

interface ColumnChartProps {
  groups: ColumnGroup[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  ariaLabel: string;
  activeKey?: string;
  onSelect?: (key: string) => void;
  className?: string;
}

const CPAD = { top: 10, right: 52, bottom: 24, left: 2 };

export function ColumnChart({ groups, series, height = 200, ariaLabel, activeKey, onSelect, className }: ColumnChartProps) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const all = groups.flatMap((g) => g.values);
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all), 3);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const plotW = Math.max(10, width - CPAD.left - CPAD.right);
  const plotH = height - CPAD.top - CPAD.bottom;
  const y = (v: number) => CPAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
  const band = plotW / Math.max(1, groups.length);
  const gap = 2;
  const barW = Math.max(3, Math.min(24, (band * 0.62 - gap * (series.length - 1)) / series.length));
  const groupW = barW * series.length + gap * (series.length - 1);

  const bar = (x: number, v: number, w: number) => {
    const y0 = y(0);
    const y1 = y(v);
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return '';
    const r = Math.min(4, h, w / 2);
    if (v >= 0) {
      return `M${x} ${y0}V${y1 + r}Q${x} ${y1} ${x + r} ${y1}H${x + w - r}Q${x + w} ${y1} ${x + w} ${y1 + r}V${y0}Z`;
    }
    return `M${x} ${y0}V${y1 - r}Q${x} ${y1} ${x + r} ${y1}H${x + w - r}Q${x + w} ${y1} ${x + w} ${y1 - r}V${y0}Z`;
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {series.length > 1 && <Legend items={series.map((s) => ({ ...s, shape: 'rect' as const }))} />}
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} role="img" aria-label={ariaLabel} className="block">
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={CPAD.left}
                  x2={CPAD.left + plotW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? 'var(--axis)' : 'var(--grid)'}
                  strokeWidth={1}
                />
                <text x={width - 4} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-3)" className="money tnum">
                  {axisMoney(t)}
                </text>
              </g>
            ))}
            {groups.map((g, gi) => {
              const x0 = CPAD.left + gi * band + (band - groupW) / 2;
              const dim = (hover !== null && hover !== gi) || (activeKey !== undefined && hover === null && activeKey !== g.key);
              return (
                <g key={g.key} opacity={dim ? 0.45 : 1} style={{ transition: 'opacity .15s' }}>
                  {g.values.map((v, si) => (
                    <path key={si} d={bar(x0 + si * (barW + gap), v, barW)} fill={series[si].color} />
                  ))}
                  <text
                    x={CPAD.left + gi * band + band / 2}
                    y={height - 6}
                    fontSize={11}
                    textAnchor="middle"
                    fill={activeKey === g.key ? 'var(--ink)' : 'var(--ink-3)'}
                    fontWeight={activeKey === g.key ? 600 : 400}
                  >
                    {g.label}
                  </text>
                </g>
              );
            })}
            {groups.map((g, gi) => (
              <rect
                key={`hit-${g.key}`}
                x={CPAD.left + gi * band}
                y={CPAD.top}
                width={band}
                height={plotH + CPAD.bottom}
                fill="transparent"
                tabIndex={onSelect ? 0 : -1}
                role={onSelect ? 'button' : undefined}
                aria-label={`${g.title} : ${g.values.map((v, i) => `${series[i].label} ${formatMoney(v)}`).join(', ')}`}
                style={{ cursor: onSelect ? 'pointer' : 'default', outline: 'none' }}
                onPointerEnter={() => setHover(gi)}
                onPointerLeave={() => setHover(null)}
                onFocus={() => setHover(gi)}
                onBlur={() => setHover(null)}
                onClick={() => onSelect?.(g.key)}
                onKeyDown={(e) => {
                  if (onSelect && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    onSelect(g.key);
                  }
                }}
              />
            ))}
          </svg>
        )}
        {hover !== null && groups[hover] && (
          <ChartTooltip
            x={CPAD.left + hover * band + band / 2 + groupW / 2}
            y={CPAD.top}
            containerWidth={width}
            title={groups[hover].title}
            rows={[
              ...groups[hover].values.map((v, i) => ({
                key: series[i].key,
                label: series[i].label,
                value: formatMoney(v),
                color: series[i].color,
              })),
              ...(groups[hover].extra
                ? [{ key: 'extra', label: groups[hover].extra!.label, value: groups[hover].extra!.value, strong: true }]
                : []),
            ]}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Barre empilée (100 %) */

export interface StackSegment {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface StackedBarProps {
  segments: StackSegment[];
  ariaLabel: string;
  height?: number;
  legend?: 'values' | 'none';
  className?: string;
  formatValue?: (v: number) => string;
}

/** Répartition d'un tout : segments séparés par un filet de 2 px, légende avec valeurs et parts. */
export function StackedBar({ segments, ariaLabel, height = 12, legend = 'values', className, formatValue }: StackedBarProps) {
  const [hover, setHover] = useState<string | null>(null);
  const fmt = formatValue ?? ((v: number) => formatMoney(v, { decimals: 'auto' }));
  const positive = segments.filter((s) => s.value > 0.005);
  const total = positive.reduce((s, x) => s + x.value, 0);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div role="img" aria-label={ariaLabel} className="flex w-full gap-[2px] overflow-hidden rounded-full" style={{ height }}>
        {total > 0 ? (
          positive.map((s) => (
            <div
              key={s.key}
              title={`${s.label} · ${fmt(s.value)} · ${formatPct(s.value / total)}`}
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
              className="h-full min-w-[3px] transition-opacity duration-150"
              style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: s.color, opacity: hover && hover !== s.key ? 0.45 : 1 }}
            />
          ))
        ) : (
          <div className="h-full w-full bg-surface-3" />
        )}
      </div>
      {legend === 'values' && total > 0 && (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-2">
          {positive.map((s) => (
            <li
              key={s.key}
              onPointerEnter={() => setHover(s.key)}
              onPointerLeave={() => setHover(null)}
              className={cn('flex items-center gap-2 text-[13px] transition-opacity', hover && hover !== s.key && 'opacity-60')}
            >
              <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: s.color }} />
              <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
              <span className="money tnum font-medium text-ink">{fmt(s.value)}</span>
              <span className="tnum w-12 text-right text-ink-3">{formatPct(s.value / total, { decimals: 0 })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- Jauge */

const METER_COLORS: Record<BudgetStatus, { fill: string; track: string }> = {
  ok: { fill: 'var(--series-1)', track: 'color-mix(in srgb, var(--series-1) 16%, transparent)' },
  none: { fill: 'var(--series-1)', track: 'color-mix(in srgb, var(--series-1) 16%, transparent)' },
  warning: { fill: 'var(--warn-fill)', track: 'color-mix(in srgb, var(--warn-fill) 22%, transparent)' },
  over: { fill: 'var(--bad)', track: 'color-mix(in srgb, var(--bad) 18%, transparent)' },
};

interface MeterProps {
  value: number;
  max: number;
  status: BudgetStatus;
  /** Part du mois écoulée (0 à 1) : repère « aujourd'hui ». */
  marker?: number;
  label: string;
  className?: string;
}

export function Meter({ value, max, status, marker, label, className }: MeterProps) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const { fill, track } = METER_COLORS[status];
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, max)}
      aria-valuenow={Math.max(0, Math.min(value, max))}
      aria-valuetext={`${formatMoney(value)} sur ${formatMoney(max)}`}
      className={cn('relative h-2 w-full rounded-full', className)}
      style={{ backgroundColor: track }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${ratio * 100}%`, backgroundColor: fill }}
      />
      {marker !== undefined && marker > 0 && marker < 1 && (
        <span
          aria-hidden
          title="Aujourd'hui"
          className="absolute -top-1 h-4 w-[2px] rounded-full bg-ink-2/70 ring-2 ring-surface"
          style={{ left: `calc(${marker * 100}% - 1px)` }}
        />
      )}
    </div>
  );
}

export function BudgetNote({ status, remaining }: { status: BudgetStatus; remaining: number }): ReactNode {
  if (status === 'none') return null;
  if (status === 'over') {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-bad">
        <CircleAlert aria-hidden className="size-3.5" />
        Dépassé de <span className="money tnum">{formatMoney(-remaining)}</span>
      </span>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-1', status === 'warning' ? 'font-medium text-warn' : 'text-ink-3')}>
      {status === 'warning' && <CircleAlert aria-hidden className="size-3.5" />}
      Reste <span className="money tnum">{formatMoney(remaining)}</span>
    </span>
  );
}

/* ----------------------------------------------------------------- Sparkline */

export function Sparkline({ values, className, color = 'var(--ink-3)', accent = 'var(--series-1)' }: { values: number[]; className?: string; color?: string; accent?: string }) {
  const [ref, { width, height }] = useSize<HTMLDivElement>();
  const pts = values.filter(Number.isFinite);
  let d = '';
  let last: [number, number] | null = null;
  if (width && height && pts.length > 1) {
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const x = (i: number) => 2 + (i / (pts.length - 1)) * (width - 6);
    const y = (v: number) => 3 + (1 - (v - min) / (max - min || 1)) * (height - 6);
    d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
    last = [x(pts.length - 1), y(pts[pts.length - 1])];
  }
  return (
    <div ref={ref} aria-hidden className={cn('h-7 w-20', className)}>
      {d && (
        <svg width={width} height={height} className="block overflow-visible">
          <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
          {last && <circle cx={last[0]} cy={last[1]} r={2.5} fill={accent} />}
        </svg>
      )}
    </div>
  );
}
