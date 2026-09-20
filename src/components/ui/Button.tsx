import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand shadow-sm hover:bg-brand-hover',
  secondary: 'bg-surface text-ink border border-line shadow-sm hover:bg-surface-2 hover:border-field/50',
  ghost: 'text-ink-2 hover:text-ink hover:bg-surface-3/70',
  soft: 'bg-brand-soft text-brand-text hover:bg-brand-soft/70',
  danger: 'bg-bad text-on-bad shadow-sm hover:brightness-110',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
  icon: 'h-9 w-9',
  'icon-sm': 'h-8 w-8',
};

export function buttonClass(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-lg font-medium',
    'transition-[background-color,color,border-color,box-shadow,filter] duration-150 active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}
