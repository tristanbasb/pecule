import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router';
import { Toaster, toast } from 'sonner';
import { AppShell } from './components/AppShell';
import { AssetDialogHost } from './components/dialogs/AssetDialog';
import { ImportDialog } from './components/dialogs/ImportDialog';
import { OperationDialog } from './components/dialogs/OperationDialog';
import { TransactionDialog } from './components/dialogs/TransactionDialog';
import { RosetteMark } from './components/Guilloche';
import { Button } from './components/ui/Button';
import { pluralize } from './lib/format';
import { materializeRecurring } from './lib/recurring';
import { AccountDetail } from './pages/AccountDetail';
import { Accounts } from './pages/Accounts';
import { Budget } from './pages/Budget';
import { Dashboard } from './pages/Dashboard';
import { Investments } from './pages/Investments';
import { NotFound } from './pages/NotFound';
import { Onboarding } from './pages/Onboarding';
import { SettingsPage } from './pages/Settings';
import { Transactions } from './pages/Transactions';
import { loadDb, redo, undo, updateData, useDb } from './store/db';
import { refreshQuotes } from './store/market';
import { openTransaction, useUi } from './store/ui';

const QUOTES_EVERY = 15 * 60_000;

function useStartupTasks(ready: boolean) {
  useEffect(() => {
    if (!ready) return;
    const result = materializeRecurring(useDb.getState().data);
    if (result) {
      updateData(() => result.data, { undoable: false });
      toast(pluralize(result.created.length, 'transaction récurrente ajoutée', 'transactions récurrentes ajoutées'));
    }
    const refresh = () => void refreshQuotes().catch(() => undefined);
    refresh();
    const timer = setInterval(refresh, QUOTES_EVERY);
    return () => clearInterval(timer);
  }, [ready]);
}

function useShortcuts(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      const typing = target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
      if (typing || document.querySelector('dialog[open]')) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && (key === 'z' || key === 'y')) {
        e.preventDefault();
        const isRedo = key === 'y' || e.shiftKey;
        if (isRedo ? redo() : undo()) toast(isRedo ? 'Modification rétablie' : 'Modification annulée');
        return;
      }
      if (!mod && !e.altKey && key === 'n') {
        e.preventDefault();
        openTransaction();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

function useResolvedTheme() {
  const theme = useUi((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

function Splash() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 text-ink-3">
      <RosetteMark className="size-10 animate-pulse text-brass" />
      <p className="text-sm">Chargement…</p>
    </div>
  );
}

function LoadError({ message }: { message: string | null }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-6 shadow-card">
        <h1 className="display text-2xl">Données inaccessibles</h1>
        <p className="mt-2 text-sm text-ink-2">{message}</p>
        <p className="mt-2 text-sm text-ink-3">
          L'application doit être lancée avec <code className="font-mono text-[12px]">npm start</code> (ou{' '}
          <code className="font-mono text-[12px]">npm run dev</code>) depuis son dossier.
        </p>
        <Button variant="primary" className="mt-5" onClick={() => void loadDb()}>
          <RefreshCw /> Réessayer
        </Button>
      </div>
    </div>
  );
}

export function App() {
  const status = useDb((s) => s.status);
  const loadError = useDb((s) => s.loadError);
  const onboarded = useDb((s) => s.data.settings.onboarded);
  const theme = useResolvedTheme();

  useEffect(() => {
    void loadDb();
  }, []);
  useStartupTasks(status === 'ready' && onboarded);
  useShortcuts(status === 'ready' && onboarded);

  return (
    <>
      {status === 'loading' && <Splash />}
      {status === 'error' && <LoadError message={loadError} />}
      {status === 'ready' && (
        <BrowserRouter>
          {onboarded ? (
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<Dashboard />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="budget" element={<Budget />} />
                <Route path="investissements" element={<Investments />} />
                <Route path="comptes" element={<Accounts />} />
                <Route path="comptes/:accountId" element={<AccountDetail />} />
                <Route path="reglages" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          ) : (
            <Onboarding />
          )}
          <TransactionDialog />
          <OperationDialog />
          <AssetDialogHost />
          <ImportDialog />
        </BrowserRouter>
      )}
      <Toaster
        theme={theme}
        position="bottom-right"
        offset={{ bottom: 24, right: 24 }}
        mobileOffset={{ bottom: 96 }}
        toastOptions={{
          style: {
            background: 'var(--surface)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            fontFamily: 'inherit',
            fontSize: '13.5px',
          },
        }}
      />
    </>
  );
}
