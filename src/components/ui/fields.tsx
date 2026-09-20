import { ChevronDown } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export const inputClass = cn(
  'h-9 w-full min-w-0 rounded-lg border border-field bg-surface px-3 text-sm text-ink shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)]',
  'transition-[border-color,box-shadow] duration-150 hover:border-field',
  'focus:border-brand focus:outline-none focus:ring-3 focus:ring-brand/20',
  'disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-bad aria-[invalid=true]:focus:ring-bad/20',
);

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  /** Élément à droite du libellé (lien, compteur…). */
  aside?: ReactNode;
}

export function Field({ label, hint, error, className, children, aside }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error || hint;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
          {label}
        </label>
        {aside}
      </div>
      {children(id, note ? noteId : undefined)}
      {note && (
        <p id={noteId} className={cn('text-xs', error ? 'text-bad' : 'text-ink-3')}>
          {note}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(inputClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(inputClass, 'h-auto min-h-20 py-2 leading-relaxed', className)} {...props} />;
}

/** Montant saisi en texte libre (virgule ou point), avec le symbole euro. */
export function AmountInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={cn(inputClass, 'tnum pr-8 text-right', className)}
        {...props}
      />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-3">
        €
      </span>
    </div>
  );
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative min-w-0">
      <select className={cn(inputClass, 'appearance-none pr-8', className)} {...props}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="text-xs text-ink-3">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150 disabled:opacity-50',
          checked ? 'border-brand bg-brand' : 'border-field bg-surface-3',
        )}
      >
        <span
          className={cn(
            'inline-block size-3.5 rounded-full shadow-sm transition-transform duration-150',
            checked ? 'translate-x-[17px] bg-on-brand' : 'translate-x-[2px] bg-surface',
          )}
        />
      </button>
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function Segmented<T extends string>({ value, onChange, options, label, size = 'md', className }: SegmentedProps<T>) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <label
            key={o.value}
            className={cn(
              'relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors duration-150',
              '[&_svg]:size-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              active ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-3 hover:text-ink',
            )}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={active}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            {o.icon}
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
