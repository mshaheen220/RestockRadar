import type { ThemePreference } from '../hooks/useTheme';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
  { value: 'system', label: 'System' },
];

/**
 * Deliberately takes preference/setTheme as props rather than calling useTheme() itself — that
 * hook both reads AND applies the theme (toggles the `dark` class, syncs localStorage), so it
 * has to be called exactly once, at the app root where it's always mounted. Calling it again
 * here would only apply/persist the theme while this component happened to be on screen — which
 * is exactly the bug this replaced (moving this into Settings meant the theme reset on refresh
 * and only "took" again once you happened to open Settings).
 */
export default function ThemeSwitcher({
  preference,
  setTheme,
}: {
  preference: ThemePreference;
  setTheme: (next: ThemePreference) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex rounded-lg border border-brand-300 dark:border-brand-700 bg-white/60 dark:bg-stone-900/60 p-1 gap-1">
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            className={
              'px-3 py-1 text-sm rounded-md transition-colors ' +
              (selected
                ? 'bg-brand-500 text-white'
                : 'text-brand-700 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-800/40')
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
