import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'day' | 'night' | 'system';

const STORAGE_KEY = 'restockradar-theme';

function resolvesToDark(preference: ThemePreference): boolean {
  if (preference === 'night') return true;
  if (preference === 'day') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme(preference: ThemePreference): void {
  document.documentElement.classList.toggle('dark', resolvesToDark(preference));
}

/** Persists day/night/system to localStorage and reacts to OS-level changes when set to 'system'. */
export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'day' || stored === 'night' || stored === 'system' ? stored : 'system';
  });

  useEffect(() => {
    applyTheme(preference);
    localStorage.setItem(STORAGE_KEY, preference);

    if (preference !== 'system') return;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);

    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  const setTheme = useCallback((next: ThemePreference) => setPreference(next), []);

  return { preference, setTheme };
}
