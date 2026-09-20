import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { normalizeText } from '../../lib/format';
import { inputClass } from './fields';

export interface PickerOption {
  value: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  group?: string;
  keywords?: string;
}

interface PickerProps {
  id?: string;
  value: string | undefined;
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  describedBy?: string;
  invalid?: boolean;
  className?: string;
  /** Contenu ajouté sous la liste (ex. bouton « Créer… »). */
  footer?: (close: () => void) => ReactNode;
}

/** Liste de choix avec recherche, affichée au-dessus de tout (y compris des fenêtres modales). */
export function Picker({
  id,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder = 'Rechercher…',
  emptyText = 'Aucun résultat',
  describedBy,
  invalid,
  className,
  footer,
}: PickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return options;
    const haystacks = options.map((o) => normalizeText(`${o.label} ${o.description ?? ''} ${o.group ?? ''} ${o.keywords ?? ''}`));
    const exact = options.filter((_, i) => haystacks[i].includes(q));
    if (exact.length) return exact;
    // Repli tolérant : les lettres saisies apparaissent dans l'ordre (« resto » → « Restaurants & sorties »).
    const needle = q.replace(/\s+/g, '');
    return options.filter((o, i) => {
      const label = normalizeText(o.label);
      if (label[0] !== needle[0]) return false;
      let j = 0;
      for (const ch of haystacks[i]) if (ch === needle[j] && ++j === needle.length) return true;
      return false;
    });
  }, [options, query]);

  const place = () => {
    const trigger = triggerRef.current;
    const pop = popRef.current;
    if (!trigger || !pop) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, 260);
    const left = Math.min(rect.left, window.innerWidth - width - 8);
    const spaceBelow = window.innerHeight - rect.bottom;
    const maxHeight = Math.min(360, Math.max(spaceBelow, rect.top) - 16);
    pop.style.width = `${width}px`;
    pop.style.left = `${Math.max(8, left)}px`;
    pop.style.maxHeight = `${maxHeight}px`;
    if (spaceBelow < 300 && rect.top > spaceBelow) {
      pop.style.top = 'auto';
      pop.style.bottom = `${window.innerHeight - rect.top + 6}px`;
    } else {
      pop.style.bottom = 'auto';
      pop.style.top = `${rect.bottom + 6}px`;
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    const onMove = () => place();
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const index = Math.max(0, filtered.findIndex((o) => o.value === value));
    setActive(query ? 0 : index);
  }, [open, query, filtered, value]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const close = () => popRef.current?.hidePopover();

  const toggle = () => {
    const pop = popRef.current;
    if (!pop) return;
    if (open) {
      pop.hidePopover();
      return;
    }
    setQuery('');
    pop.showPopover();
    place();
    // Focus immédiat (la liste est déjà affichée), puis filet de sécurité après le rendu.
    searchRef.current?.focus();
    setTimeout(() => searchRef.current?.focus(), 30);
  };

  const choose = (option: PickerOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    close();
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(filtered[active]);
    } else if (e.key === 'Tab') {
      close();
    }
  };

  let lastGroup: string | undefined;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            toggle();
          }
        }}
        className={cn(inputClass, 'flex items-center gap-2 text-left', className)}
      >
        {selected?.icon}
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-ink-3')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-ink-3" />
      </button>
      <div
        ref={popRef}
        popover="auto"
        className="floating flex-col"
        style={{ position: 'fixed', inset: 'auto', display: open ? 'flex' : undefined }}
        onToggle={(e) => setOpen((e as unknown as ToggleEvent).newState === 'open')}
      >
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search aria-hidden className="size-4 text-ink-3" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink outline-none"
          />
        </div>
        <ul ref={listRef} id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-3">{emptyText}</li>}
          {filtered.map((o, i) => {
            const heading = o.group && o.group !== lastGroup ? o.group : null;
            lastGroup = o.group;
            return (
              <li key={o.value} role="presentation">
                {heading && (
                  <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">
                    {heading}
                  </div>
                )}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  data-index={i}
                  aria-selected={o.value === value}
                  onMouseMove={() => setActive(i)}
                  onClick={() => choose(o)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm',
                    i === active ? 'bg-surface-3/80 text-ink' : 'text-ink-2',
                  )}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-ink">{o.label}</span>
                    {o.description && <span className="block truncate text-xs text-ink-3">{o.description}</span>}
                  </span>
                  {o.value === value && <Check aria-hidden className="size-4 text-brand-text" />}
                </div>
              </li>
            );
          })}
        </ul>
        {footer && <div className="border-t border-line p-1">{footer(close)}</div>}
      </div>
    </>
  );
}
