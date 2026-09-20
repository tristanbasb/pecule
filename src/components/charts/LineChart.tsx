import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { cn } from '../../lib/cn';
import { diffDays, formatDate, parseISODate } from '../../lib/dates';
import { formatMoney } from '../../lib/format';
import type { ISODate } from '../../lib/types';
import { axisMoney, ChartTooltip, niceTicks, useSize, type TooltipRow } from './core';

export interface LineSeries {
  key: string;
  label: string;
  values: number[];
  color: string;
  /** Série principale : trait plein, lavis et marqueur de survol. */
  primary?: boolean;
}

interface LineChartProps {
  dates: ISODate[];
  series: LineSeries[];
  height?: number;
  /** Apparence sur le panneau sombre du patrimoine. */
  onVault?: boolean;
  ariaLabel: string;
  formatValue?: (v: number) => string;
  className?: string;
}

const PAD = { top: 12, right: 58, bottom: 26, left: 4 };

function dateTickLabel(date: ISODate, spanDays: number) {
  const d = parseISODate(date);
  if (spanDays > 300) return new Intl.DateTimeFormat('fr-FR', { month: 'short', year: 'numeric' }).format(d).replace('.', '');
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d).replace('.', '');
}

/** Courbe temporelle avec réticule : la valeur de chaque série s'affiche à la date survolée. */
export function LineChart({ dates, series, height = 200, onVault, ariaLabel, formatValue, className }: LineChartProps) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradientId = useId();
  const fmt = formatValue ?? ((v: number) => formatMoney(v, { decimals: 'auto' }));

  const geometry = useMemo(() => {
    const n = dates.length;
    if (!width || n === 0) return null;
    const all = series.flatMap((s) => s.values).filter(Number.isFinite);
    const min = Math.min(...all);
    const max = Math.max(...all);
    const pad = (max - min) * 0.08 || Math.abs(max) * 0.02 || 1;
    const ticks = niceTicks(min - pad, max + pad, 3);
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const plotW = Math.max(10, width - PAD.left - PAD.right);
    const plotH = height - PAD.top - PAD.bottom;
    const x = (i: number) => PAD.left + (n === 1 ? plotW : (i / (n - 1)) * plotW);
    const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    const paths = series.map((s) => {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join('');
      const area = `${d}L${x(n - 1).toFixed(1)} ${PAD.top + plotH}L${x(0).toFixed(1)} ${PAD.top + plotH}Z`;
      return { ...s, d, area };
    });
    const span = n > 1 ? diffDays(dates[0], dates[n - 1]) : 0;
    const tickCount = Math.max(2, Math.min(5, Math.floor(plotW / 110)));
    const xTicks = Array.from({ length: tickCount }, (_, k) => Math.round((k / (tickCount - 1)) * (n - 1)));
    return { ticks, x, y, paths, plotW, plotH, span, xTicks: [...new Set(xTicks)] };
  }, [dates, series, width, height]);

  const colors = onVault
    ? { grid: 'rgb(244 241 232 / 0.09)', text: 'var(--vault-ink-2)', cross: 'rgb(244 241 232 / 0.35)', ring: 'var(--vault)' }
    : { grid: 'var(--grid)', text: 'var(--ink-3)', cross: 'var(--axis)', ring: 'var(--surface)' };

  const pick = (clientX: number, target: Element) => {
    if (!geometry || dates.length === 0) return;
    const rect = target.getBoundingClientRect();
    const rel = (clientX - rect.left - PAD.left) / geometry.plotW;
    setActive(Math.max(0, Math.min(dates.length - 1, Math.round(rel * (dates.length - 1)))));
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = e.shiftKey ? 7 : 1;
      setActive((i) => {
        const base = i ?? dates.length - 1;
        return Math.max(0, Math.min(dates.length - 1, base + (e.key === 'ArrowLeft' ? -step : step)));
      });
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  const tooltipRows: TooltipRow[] =
    active === null ? [] : series.map((s) => ({ key: s.key, label: s.label, value: fmt(s.values[active]), color: s.color, strong: s.primary }));

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ height }}>
      {geometry && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className="block touch-pan-y rounded-md outline-offset-4"
          onPointerMove={(e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e: PointerEvent<SVGSVGElement>) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKey}
          onBlur={() => setActive(null)}
        >
          <defs>
            {geometry.paths
              .filter((p) => p.primary)
              .map((p) => (
                <linearGradient key={p.key} id={`${gradientId}-${p.key}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={p.color} stopOpacity={onVault ? 0.22 : 0.14} />
                  <stop offset="100%" stopColor={p.color} stopOpacity={0} />
                </linearGradient>
              ))}
          </defs>
          {geometry.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + geometry.plotW} y1={geometry.y(t)} y2={geometry.y(t)} stroke={colors.grid} strokeWidth={1} />
              <text
                x={width - 4}
                y={geometry.y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill={colors.text}
                className="money tnum"
              >
                {axisMoney(t)}
              </text>
            </g>
          ))}
          {geometry.xTicks.map((i, k) => (
            <text
              key={i}
              x={geometry.x(i)}
              y={height - 6}
              fontSize={11}
              fill={colors.text}
              textAnchor={k === 0 ? 'start' : k === geometry.xTicks.length - 1 ? 'end' : 'middle'}
            >
              {dateTickLabel(dates[i], geometry.span)}
            </text>
          ))}
          {geometry.paths.map((p) =>
            p.primary ? <path key={`${p.key}-area`} d={p.area} fill={`url(#${gradientId}-${p.key})`} /> : null,
          )}
          {geometry.paths.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill="none"
              stroke={p.color}
              strokeWidth={p.primary ? 2 : 1.5}
              strokeOpacity={p.primary ? 1 : 0.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {active !== null && (
            <g>
              <line
                x1={geometry.x(active)}
                x2={geometry.x(active)}
                y1={PAD.top}
                y2={PAD.top + geometry.plotH}
                stroke={colors.cross}
                strokeWidth={1}
              />
              {geometry.paths.map((p) => (
                <circle
                  key={p.key}
                  cx={geometry.x(active)}
                  cy={geometry.y(p.values[active])}
                  r={p.primary ? 4.5 : 3.5}
                  fill={p.color}
                  stroke={colors.ring}
                  strokeWidth={2}
                />
              ))}
            </g>
          )}
        </svg>
      )}
      {geometry && active !== null && (
        <ChartTooltip
          x={geometry.x(active)}
          y={PAD.top}
          containerWidth={width}
          title={formatDate(dates[active], 'long')}
          rows={tooltipRows}
        />
      )}
    </div>
  );
}
