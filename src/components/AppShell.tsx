import {
  ArrowLeftRight,
  ChartLine,
  CircleAlert,
  Eye,
  EyeOff,
  LayoutDashboard,
  Moon,
  Plus,
  Settings,
  Sun,
  SunMoon,
  Target,
  Wallet,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router';
import { cn } from '../lib/cn';
import { formatDateTime } from '../lib/dates';
import { resolveConflict, useDb } from '../store/db';
import { openTransaction, setTheme, togglePrivacy, useUi, type ThemePref } from '../store/ui';
import { Logo } from './Guilloche';
import { Button } from './ui/Button';
import { Kbd, Spinner } from './ui/misc';

const NAV = [
  { to: '/', label: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budget', label: 'Budget', icon: Target },
  { to: '/investissements', label: 'Investissements', icon: ChartLine },
  { to: '/comptes', label: 'Comptes', icon: Wallet },
];

const THEME_NEXT: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_LABEL: Record<ThemePref, string> = {
  system: 'Thème : automatique',
  light: 'Thème : clair',
  dark: 'Thème : sombre',
};

function SaveStatus() {
  const { saveStatus, savedAt, saveError, location } = useDb();
  let content: ReactNode;
  switch (saveStatus) {
    case 'pending':
    case 'saving':
      content = (
        <>
          <Spinner className="size-3" /> Enregistrement…
        </>
      );
      break;
    case 'error':
      content = (
        <>
          <CircleAlert className="size-3.5 text-bad" /> Non enregistré, nouvel essai…
        </>
      );
      break;
    case 'conflict':
      content = (
        <>
          <CircleAlert className="size-3.5 text-warn" /> Conflit à résoudre
        </>
      );
      break;
    case 'saved':
      content = (
        <>
          <span className="size-1.5 rounded-full bg-good" /> Enregistré {savedAt ? formatDateTime(savedAt) : ''}
        </>
      );
      break;
    default:
      content = null;
  }
  if (!content) return null;
  return (
    <p
      className="flex items-center gap-1.5 truncate px-2 text-[11px] text-ink-3"
      title={saveError ?? (location ? `Fichier : ${location}` : undefined)}
      aria-live="polite"
    >
      {content}
    </p>
  );
}

function ConflictBanner() {
  const conflict = useDb((s) => s.conflict);
  if (!conflict) return null;
  return (
    <div
      role="alert"
      className="mb-6 flex flex-col gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-ink sm:flex-row sm:items-center"
    >
      <CircleAlert className="size-5 shrink-0 text-warn" />
      <p className="flex-1">
        Les données ont été modifiées ailleurs (un autre onglet ?) le {formatDateTime(conflict.savedAt)}. Choisir la
        version à conserver.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void resolveConflict('theirs')}>
          Charger l'autre version
        </Button>
        <Button size="sm" variant="primary" onClick={() => void resolveConflict('mine')}>
          Garder celle-ci
        </Button>
      </div>
    </div>
  );
}

function QuickToggles({ compact }: { compact?: boolean }) {
  const { theme, privacy } = useUi();
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : SunMoon;
  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size={compact ? 'icon-sm' : 'icon'}
        onClick={togglePrivacy}
        aria-pressed={privacy}
        aria-label={privacy ? 'Afficher les montants' : 'Masquer les montants'}
        title={privacy ? 'Afficher les montants' : 'Masquer les montants'}
      >
        {privacy ? <EyeOff /> : <Eye />}
      </Button>
      <Button
        variant="ghost"
        size={compact ? 'icon-sm' : 'icon'}
        onClick={() => setTheme(THEME_NEXT[theme])}
        aria-label={THEME_LABEL[theme]}
        title={THEME_LABEL[theme]}
      >
        <ThemeIcon />
      </Button>
    </div>
  );
}

export function AppShell() {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-line px-3 py-5 lg:flex">
        <div className="px-2">
          <Logo />
        </div>
        <Button variant="primary" className="mx-1 justify-between" onClick={() => openTransaction()}>
          <span className="flex items-center gap-2">
            <Plus /> Nouvelle transaction
          </span>
          <Kbd className="border-white/25 bg-white/10 text-on-brand/80 dark:border-black/20 dark:bg-black/10">N</Kbd>
        </Button>
        <nav aria-label="Navigation principale" className="flex flex-col gap-0.5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'group flex h-10 items-center gap-3 rounded-lg px-3 text-[14px] font-medium transition-colors',
                  isActive ? 'bg-surface text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:bg-surface-3/60 hover:text-ink',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('size-[18px]', isActive ? 'text-brand-text' : 'text-ink-3 group-hover:text-ink-2')} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-2">
          <SaveStatus />
          <div className="flex items-center justify-between border-t border-line pt-3">
            <NavLink
              to="/reglages"
              className={({ isActive }) =>
                cn(
                  'flex h-9 items-center gap-2.5 rounded-lg px-3 text-[14px] font-medium transition-colors',
                  isActive ? 'bg-surface text-ink ring-1 ring-line' : 'text-ink-2 hover:bg-surface-3/60 hover:text-ink',
                )
              }
            >
              <Settings className="size-[18px] text-ink-3" /> Réglages
            </NavLink>
            <QuickToggles />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-paper/85 px-4 py-2.5 backdrop-blur-md lg:hidden">
          <Logo />
          <div className="flex items-center gap-1">
            <QuickToggles compact />
            <NavLink to="/reglages" aria-label="Réglages" className="flex size-8 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-3">
              <Settings className="size-4" />
            </NavLink>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] px-4 pb-32 pt-6 sm:px-6 lg:px-10 lg:pb-16 lg:pt-9">
          <ConflictBanner />
          <Outlet />
        </main>
      </div>

      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-line bg-surface/92 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 backdrop-blur-md lg:hidden"
      >
        {[NAV[0], NAV[1]].map(({ to, label, icon: Icon, end }) => (
          <MobileTab key={to} to={to} label={label} end={end} icon={<Icon className="size-5" />} />
        ))}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => openTransaction()}
            aria-label="Nouvelle transaction"
            className="-mt-6 flex size-13 items-center justify-center rounded-2xl bg-brand text-on-brand shadow-float transition-transform active:scale-95"
          >
            <Plus className="size-6" />
          </button>
        </div>
        {[NAV[2], NAV[3]].map(({ to, label, icon: Icon }) => (
          <MobileTab key={to} to={to} label={label === 'Investissements' ? 'Placements' : label} icon={<Icon className="size-5" />} />
        ))}
      </nav>
    </div>
  );
}

function MobileTab({ to, label, icon, end }: { to: string; label: string; icon: ReactNode; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-0.5 rounded-lg py-1 text-[10.5px] font-medium',
          isActive ? 'text-brand-text' : 'text-ink-3',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}
