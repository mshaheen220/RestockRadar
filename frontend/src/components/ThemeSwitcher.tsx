import { useTheme, type ThemePreference } from '../hooks/useTheme';

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'night', label: 'Night' },
  { value: 'system', label: 'System' },
];

export default function ThemeSwitcher() {
  const { preference, setTheme } = useTheme();

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
