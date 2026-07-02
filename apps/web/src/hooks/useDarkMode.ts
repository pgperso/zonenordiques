'use client';

import { useState, useEffect, useCallback } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';
const CYCLE: ThemePref[] = ['light', 'dark', 'system'];

function systemDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

function readPref(): ThemePref {
  if (typeof window === 'undefined') return 'system';
  const t = localStorage.getItem(STORAGE_KEY);
  return t === 'light' || t === 'dark' || t === 'system' ? t : 'system';
}

function applyDark(dark: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', dark);
}

/**
 * Three-way theme preference: an explicit "follow system" option keeps the
 * site in sync with the OS even after the user has interacted with the
 * toggle. The actual `dark` boolean is derived; consumers usually want that
 * for rendering, and `theme` for showing the right toggle icon.
 *
 * A blocking inline script in [locale]/layout.tsx applies the dark class
 * before paint, so this hook just synchronises React state with reality —
 * no flash of the wrong theme on load.
 */
export function useDarkMode() {
  const [theme, setThemeState] = useState<ThemePref>('system');
  const [dark, setDark] = useState(false);

  // Sync state from storage + media query after mount.
  useEffect(() => {
    const t = readPref();
    const isDark = t === 'dark' || (t === 'system' && systemDark());
    setThemeState(t);
    setDark(isDark);
    applyDark(isDark);
  }, []);

  // When following the system, react to OS theme changes in real time.
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      setDark(e.matches);
      applyDark(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next: ThemePref) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage unavailable — runtime preference is enough */
    }
    const isDark = next === 'dark' || (next === 'system' && systemDark());
    setDark(isDark);
    applyDark(isDark);
  }, []);

  const cycle = useCallback(() => {
    setTheme(CYCLE[(CYCLE.indexOf(theme) + 1) % CYCLE.length]);
  }, [theme, setTheme]);

  // Back-compat for callers that only knew the binary toggle.
  const toggle = useCallback(() => {
    setTheme(dark ? 'light' : 'dark');
  }, [dark, setTheme]);

  return { theme, dark, setTheme, cycle, toggle };
}
