import { useState } from 'react';
import { LogOut, Radar } from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import CoverageView from './components/CoverageView';
import DealFinder from './components/DealFinder';
import Login from './components/Login';
import Settings from './components/Settings';
import ThemeSwitcher from './components/ThemeSwitcher';
import VersionBadge from './components/VersionBadge';
import WatchlistManager from './components/WatchlistManager';

type Tab = 'deal-finder' | 'manage' | 'purchases' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'deal-finder', label: 'Deal Finder' },
  { id: 'manage', label: 'Manage Watchlist' },
  { id: 'purchases', label: 'Purchases' },
  { id: 'settings', label: 'Settings' },
];

function AuthenticatedApp() {
  const [tab, setTab] = useState<Tab>('deal-finder');
  const { user, canWrite, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="bg-brand-100/70 dark:bg-brand-900/30 border-b-2 border-brand-300 dark:border-brand-700 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-7 h-7 rounded-md bg-brand-500 text-white" aria-hidden="true">
            <Radar size={16} strokeWidth={2.25} />
          </span>
          <h1 className="text-lg font-bold text-brand-700 dark:text-brand-400">RestockRadar</h1>
          <VersionBadge />
        </div>
        <nav aria-label="Sections" className="flex gap-1 rounded-lg border border-brand-300 dark:border-brand-700 bg-white/60 dark:bg-stone-900/60 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              onClick={() => setTab(t.id)}
              className={
                'px-3 py-1 text-sm rounded-md transition-colors ' +
                (tab === t.id
                  ? 'bg-brand-500 text-white'
                  : 'text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800/40')
              }
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-sm text-stone-500 dark:text-stone-400">
            {user?.username}
            {!canWrite && (
              <span
                className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-500 dark:text-stone-400"
                title="Your account can view everything but can't add, edit, link, or import anything."
              >
                read-only
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Sign out"
            title="Sign out"
            className="p-1.5 rounded text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
          >
            <LogOut size={16} />
          </button>
          <ThemeSwitcher />
        </div>
      </header>
      <main className="p-4 sm:p-6">
        {tab === 'deal-finder' && <DealFinder />}
        {tab === 'manage' && <WatchlistManager />}
        {tab === 'purchases' && <CoverageView />}
        {tab === 'settings' && <Settings />}
      </main>
    </div>
  );
}

function Gate() {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user) return <Login />;
  return <AuthenticatedApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
