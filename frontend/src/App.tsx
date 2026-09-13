import { useState } from 'react';
import { Radar } from 'lucide-react';
import Dashboard from './components/Dashboard';
import ThemeSwitcher from './components/ThemeSwitcher';
import VersionBadge from './components/VersionBadge';
import WatchlistManager from './components/WatchlistManager';

type Tab = 'dashboard' | 'manage';

const TABS: { id: Tab; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'manage', label: 'Manage Watchlist' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard');

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
        <ThemeSwitcher />
      </header>
      <main className="p-4 sm:p-6">{tab === 'dashboard' ? <Dashboard /> : <WatchlistManager />}</main>
    </div>
  );
}
