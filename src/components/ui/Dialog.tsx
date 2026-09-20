import { X } from 'lucide-react';
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { Button } from './Button';

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'range', 'color']);

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** Élément placé à gauche du titre (icône, pastille). */
  leading?: ReactNode;
}

/** Fenêtre modale accessible (focus piégé, Échap, clic sur le fond) ; feuille du bas sur mobile. */
export function Dialog({ open, onClose, title, description, children, footer, width = 560, leading }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // autoFocus de React s'exécute avant l'ouverture : on cible explicitement le champ voulu.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={titleId}
      style={{ '--sheet-width': `${width}px` } as CSSProperties}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Chrome peut ignorer une demande de fermeture native (événement cancel) :
          // Échap est géré ici, sauf si une liste déroulante ouverte doit se fermer d'abord.
          const target = e.target as HTMLElement;
          if (e.defaultPrevented || target.closest('[popover]') || ref.current?.querySelector(':popover-open')) return;
          e.preventDefault();
          e.stopPropagation();
          onClose();
          return;
        }
        // Les boutons d'envoi sont dans le pied de la fenêtre (attribut form) : la validation
        // implicite par Entrée n'est pas fiable, on la déclenche donc explicitement.
        if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return;
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        const target = e.target;
        if (!(target instanceof HTMLInputElement) || !target.form) return;
        if (NON_TEXT_INPUTS.has(target.type) || target.dataset.enter === 'ignore' || target.closest('[popover]')) return;
        e.preventDefault();
        target.form.requestSubmit();
      }}
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (pressedBackdrop.current && e.target === ref.current) onClose();
        pressedBackdrop.current = false;
      }}
    >
      {open && (
        <>
          <header className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-5 sm:px-6">
            {leading}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="wide text-[17px] font-semibold leading-tight text-ink">
                {title}
              </h2>
              {description && <p className="mt-1 text-[13px] text-ink-3">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Fermer" onClick={onClose} className="-mr-2 -mt-1">
              <X />
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 sm:px-6">{children}</div>
          {footer && (
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2/60 px-5 py-3 sm:px-6">
              {footer}
            </footer>
          )}
        </>
      )}
    </dialog>
  );
}

interface ConfirmProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
  danger?: boolean;
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose, danger = true }: ConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-2">{message}</div>
    </Dialog>
  );
}
