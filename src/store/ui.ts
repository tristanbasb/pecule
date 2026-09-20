import { create } from 'zustand';
import type { ID, InvestmentOp, Transaction } from '../lib/types';

export type ThemePref = 'system' | 'light' | 'dark';

interface DialogState<T> {
  open: boolean;
  editId?: ID;
  draft?: Partial<T>;
}

interface UiState {
  theme: ThemePref;
  privacy: boolean;
  txDialog: DialogState<Transaction>;
  opDialog: DialogState<InvestmentOp>;
  importOpen: boolean;
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible : préférence non mémorisée */
  }
};

const initialTheme = (read('pecule:theme') as ThemePref | null) ?? 'system';

export const useUi = create<UiState>(() => ({
  theme: initialTheme === 'light' || initialTheme === 'dark' ? initialTheme : 'system',
  privacy: read('pecule:privacy') === '1',
  txDialog: { open: false },
  opDialog: { open: false },
  importOpen: false,
}));

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function applyTheme() {
  const { theme, privacy } = useUi.getState();
  const dark = theme === 'dark' || (theme === 'system' && Boolean(media?.matches));
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.classList.toggle('privacy', privacy);
}

if (typeof window !== 'undefined') {
  applyTheme();
  media?.addEventListener('change', applyTheme);
  useUi.subscribe(applyTheme);
}

export function setTheme(theme: ThemePref) {
  write('pecule:theme', theme);
  useUi.setState({ theme });
}

export function togglePrivacy() {
  const privacy = !useUi.getState().privacy;
  write('pecule:privacy', privacy ? '1' : '0');
  useUi.setState({ privacy });
}

export const openTransaction = (opts: { editId?: ID; draft?: Partial<Transaction> } = {}) =>
  useUi.setState({ txDialog: { open: true, ...opts } });
export const closeTransaction = () => useUi.setState({ txDialog: { open: false } });

export const openOperation = (opts: { editId?: ID; draft?: Partial<InvestmentOp> } = {}) =>
  useUi.setState({ opDialog: { open: true, ...opts } });
export const closeOperation = () => useUi.setState({ opDialog: { open: false } });

export const setImportOpen = (importOpen: boolean) => useUi.setState({ importOpen });
