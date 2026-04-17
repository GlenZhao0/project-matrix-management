import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

import { getSystemSettings } from '../api/system';

export type ThemeSetting = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  themeSetting: ThemeSetting;
  resolvedTheme: ResolvedTheme;
  setThemeSetting: (theme: ThemeSetting) => void;
}

const THEME_STORAGE_KEY = 'pdm-theme-setting';

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readStoredThemeSetting = (): ThemeSetting => {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return 'system';
};

const getSystemResolvedTheme = (): ResolvedTheme => {
  if (typeof window === 'undefined') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themeSetting, setThemeSettingState] = useState<ThemeSetting>(readStoredThemeSetting);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemResolvedTheme);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const settings = await getSystemSettings();
        if (!active) {
          return;
        }

        setThemeSettingState(settings.theme);
      } catch (_err) {
        // Fallback to local storage / system preference when settings are unavailable.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, themeSetting);
  }, [themeSetting]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? 'dark' : 'light');
    };

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const resolvedTheme: ResolvedTheme = themeSetting === 'system' ? systemTheme : themeSetting;

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const value = useMemo(
    () => ({
      themeSetting,
      resolvedTheme,
      setThemeSetting: setThemeSettingState,
    }),
    [resolvedTheme, themeSetting],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
};
