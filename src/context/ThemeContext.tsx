import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type ThemeMode = 'system' | 'light' | 'dark';
interface ThemeContextValue { theme: ThemeMode; setTheme: (theme: ThemeMode) => void; resolvedTheme: 'light' | 'dark'; }
const ThemeContext = createContext<ThemeContextValue>({ theme: 'system', setTheme: () => undefined, resolvedTheme: 'light' });
const KEY = 'voiceid-theme';

function getSystemTheme(): 'light' | 'dark' {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null;
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  });
  const [systemTheme, setSystemTheme] = useState<'light' | 'dark'>(() => getSystemTheme());

  const resolvedTheme = theme === 'system' ? systemTheme : theme;

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemTheme(media.matches ? 'dark' : 'light');
    onChange();
    media.addEventListener?.('change', onChange);
    return () => media.removeEventListener?.('change', onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolvedTheme === 'dark');
    root.dataset.theme = resolvedTheme;
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = (next: ThemeMode) => {
    setThemeState(next);
    window.localStorage.setItem(KEY, next);
  };

  const value = useMemo(() => ({ theme, setTheme, resolvedTheme }), [theme, resolvedTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
