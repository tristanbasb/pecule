import { LoaderCircle } from 'lucide-react';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { getIcon } from '../../lib/icons';
import { colorVar } from '../../lib/meta';
import type { ColorKey } from '../../lib/types';

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('rounded-2xl border border-line bg-surface shadow-card', className)} {...props} />;
}

interface CardHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}

export function CardHeader({ title, subtitle, action, className, as: Tag = 'h2' }: CardHeaderProps) {
  return (
    <header className={cn('flex items-start justify-between gap-3 px-5 pt-4', className)}>
      <div className="min-w-0">
        <Tag className="wide text-[15px] font-semibold text-ink">{title}</Tag>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </header>
  );
}

interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}

export function PageHeader({ title, subtitle, actions, children }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="display text-[28px] leading-[1.1] text-ink sm:text-[32px]">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-ink-3">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)}>
      {icon && (
        <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-surface-3 text-ink-2 [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="wide text-[15px] font-semibold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-ink-3">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

type BadgeTone = 'neutral' | 'good' | 'bad' | 'warn' | 'brand';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-ink-2',
  good: 'bg-good-soft text-good',
  bad: 'bg-bad-soft text-bad',
  warn: 'bg-warn-soft text-warn',
  brand: 'bg-brand-soft text-brand-text',
};

export function Badge({ tone = 'neutral', className, children }: { tone?: BadgeTone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold [&_svg]:size-3',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

interface IconChipProps {
  icon: string | undefined;
  color: ColorKey | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/** Pastille d'identité d'une catégorie ou d'un compte : icône teintée sur un lavis de sa couleur. */
export function IconChip({ icon, color, size = 'md', className }: IconChipProps) {
  const Icon = getIcon(icon);
  const c = colorVar(color);
  const style: CSSProperties = {
    backgroundColor: `color-mix(in srgb, ${c} 14%, transparent)`,
    color: `color-mix(in srgb, ${c} 78%, var(--ink))`,
  };
  const sizes = {
    xs: 'size-5 rounded-md [&_svg]:size-3',
    sm: 'size-7 rounded-lg [&_svg]:size-3.5',
    md: 'size-9 rounded-[10px] [&_svg]:size-[18px]',
    lg: 'size-11 rounded-xl [&_svg]:size-5',
  };
  return (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center', sizes[size], className)} style={style}>
      <Icon strokeWidth={2} />
    </span>
  );
}

export function ColorDot({ color, className }: { color: ColorKey | undefined; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-block size-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: colorVar(color) }} />
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-surface-2 px-1 font-mono text-[10px] font-medium text-ink-3',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn('size-4 animate-spin', className)} />;
}

/** Valeur secondaire en petites capitales espacées, pour les libellés de chiffres clés. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('text-[12px] font-medium text-ink-3', className)}>{children}</span>;
}
