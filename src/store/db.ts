import { create } from 'zustand';
import { api, ApiError } from '../lib/api';
import { emptyData, sanitizeData } from '../lib/defaults';
import type { PeculeData } from '../lib/types';

/**
 * Données de l'application : chargées depuis le serveur local puis enregistrées
 * automatiquement (avec détection des modifications faites dans un autre onglet).
 */

export type LoadStatus = 'loading' | 'ready' | 'error';
export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict';

export interface Conflict {
  rev: number;
  data: PeculeData;
  savedAt: string;
}

interface DbState {
  status: LoadStatus;
  loadError: string | null;
  data: PeculeData;
  rev: number;
  location: string | null;
  saveStatus: SaveStatus;
  saveError: string | null;
  savedAt: string | null;
  conflict: Conflict | null;
  past: PeculeData[];
  future: PeculeData[];
}

const HISTORY_LIMIT = 60;
const SAVE_DELAY = 400;

export const useDb = create<DbState>(() => ({
  status: 'loading',
  loadError: null,
  data: emptyData(),
  rev: 0,
  location: null,
  saveStatus: 'idle',
  saveError: null,
  savedAt: null,
  conflict: null,
  past: [],
  future: [],
}));

let timer: ReturnType<typeof setTimeout> | undefined;
let saving = false;
let retryDelay = 0;

function scheduleSave(delay = SAVE_DELAY) {
  clearTimeout(timer);
  const { saveStatus } = useDb.getState();
  if (saveStatus !== 'conflict' && saveStatus !== 'saving') useDb.setState({ saveStatus: 'pending' });
  timer = setTimeout(() => void flush(), delay);
}

export async function flush(): Promise<void> {
  clearTimeout(timer);
  const state = useDb.getState();
  if (state.status !== 'ready' || state.conflict) return;
  if (saving) {
    scheduleSave();
    return;
  }
  saving = true;
  const { data, rev } = state;
  useDb.setState({ saveStatus: 'saving' });
  try {
    const result = await api.saveDb(rev, data);
    retryDelay = 0;
    const changedMeanwhile = useDb.getState().data !== data;
    useDb.setState({
      rev: result.rev,
      savedAt: result.savedAt,
      saveError: null,
      saveStatus: changedMeanwhile ? 'pending' : 'saved',
    });
    if (changedMeanwhile) scheduleSave();
  } catch (err) {
    const conflict = (err instanceof ApiError && err.status === 409
      ? (err.body as { conflict?: { rev: number; data: unknown; savedAt: string } })?.conflict
      : undefined);
    if (conflict) {
      useDb.setState({
        saveStatus: 'conflict',
        conflict: { rev: conflict.rev, data: sanitizeData(conflict.data), savedAt: conflict.savedAt },
      });
    } else {
      retryDelay = Math.min(retryDelay ? retryDelay * 2 : 3000, 60_000);
      useDb.setState({ saveStatus: 'error', saveError: err instanceof Error ? err.message : 'Erreur inconnue' });
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), retryDelay);
    }
  } finally {
    saving = false;
  }
}

export async function loadDb() {
  useDb.setState({ status: 'loading', loadError: null });
  try {
    const { file, location } = await api.loadDb();
    useDb.setState({
      status: 'ready',
      data: file ? sanitizeData(file.data) : emptyData(),
      rev: file?.rev ?? 0,
      savedAt: file?.savedAt ?? null,
      location,
      saveStatus: file ? 'saved' : 'idle',
      conflict: null,
      past: [],
      future: [],
    });
  } catch (err) {
    useDb.setState({ status: 'error', loadError: err instanceof Error ? err.message : 'Erreur inconnue' });
  }
}

export interface UpdateOptions {
  /** false : la modification n'entre pas dans l'historique d'annulation. */
  undoable?: boolean;
  /** Applique aussi la modification aux états annulables (ex. mise à jour des cours). */
  rebase?: boolean;
}

export function updateData(recipe: (d: PeculeData) => PeculeData, opts: UpdateOptions = {}) {
  const state = useDb.getState();
  const next = recipe(state.data);
  if (next === state.data) return;
  const undoable = opts.undoable ?? true;
  useDb.setState({
    data: next,
    past: undoable
      ? [...state.past, state.data].slice(-HISTORY_LIMIT)
      : opts.rebase
        ? state.past.map(recipe)
        : state.past,
    future: undoable ? [] : opts.rebase ? state.future.map(recipe) : state.future,
  });
  scheduleSave();
}

export function undo(): boolean {
  const s = useDb.getState();
  const prev = s.past[s.past.length - 1];
  if (!prev) return false;
  useDb.setState({ data: prev, past: s.past.slice(0, -1), future: [s.data, ...s.future].slice(0, HISTORY_LIMIT) });
  scheduleSave();
  return true;
}

export function redo(): boolean {
  const s = useDb.getState();
  const next = s.future[0];
  if (!next) return false;
  useDb.setState({ data: next, future: s.future.slice(1), past: [...s.past, s.data].slice(-HISTORY_LIMIT) });
  scheduleSave();
  return true;
}

/** « theirs » : reprendre la version enregistrée ailleurs · « mine » : l'écraser avec celle-ci. */
export async function resolveConflict(choice: 'theirs' | 'mine') {
  const s = useDb.getState();
  if (!s.conflict) return;
  if (choice === 'theirs') {
    useDb.setState({
      data: s.conflict.data,
      rev: s.conflict.rev,
      savedAt: s.conflict.savedAt,
      conflict: null,
      saveStatus: 'saved',
      past: [],
      future: [],
    });
    return;
  }
  useDb.setState({ rev: s.conflict.rev, conflict: null, saveStatus: 'pending' });
  await flush();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (event) => {
    const { saveStatus } = useDb.getState();
    if (saveStatus === 'pending' || saveStatus === 'saving' || saveStatus === 'error') {
      void flush();
      event.preventDefault();
    }
  });
}
