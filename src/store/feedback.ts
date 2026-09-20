import { toast } from 'sonner';
import { undo, useDb } from './db';

/**
 * Confirme une modification et propose de l'annuler. L'annulation n'est proposée
 * que si rien d'autre n'a changé depuis, pour ne jamais défaire la mauvaise action.
 */
export function notifyDone(message: string, description?: string) {
  const after = useDb.getState().data;
  toast.success(message, {
    description,
    action: {
      label: 'Annuler',
      onClick: () => {
        if (useDb.getState().data === after && undo()) toast('Modification annulée');
        else toast('D’autres modifications ont eu lieu depuis : utiliser Ctrl+Z pour revenir en arrière.');
      },
    },
  });
}

export function notifyError(err: unknown, fallback = 'Une erreur est survenue') {
  toast.error(err instanceof Error ? err.message : fallback);
}
