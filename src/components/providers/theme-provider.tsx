'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';

export type AppearancePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  preference: AppearancePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: AppearancePreference) => void;
}

export const APPEARANCE_STORAGE_KEY = 'stock-supplies:appearance';

const ThemeContext = createContext<ThemeContextValue | null>(null);
const APPEARANCE_EVENT = 'stock-supplies:appearance-change';
let memoryPreference: AppearancePreference = 'system';

function isAppearancePreference(value: string | null): value is AppearancePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

function isApplicationPath(pathname: string) {
  return /^\/(account|auth|onboarding|o|platform)(\/|$)/.test(pathname);
}

function resolveTheme(preference: AppearancePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
}

function currentPreference(): AppearancePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (isAppearancePreference(stored)) memoryPreference = stored;
    return memoryPreference;
  } catch { return memoryPreference; }
}

function subscribePreference(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === APPEARANCE_STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(APPEARANCE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(APPEARANCE_EVENT, onStoreChange);
  };
}

function currentSystemDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function subscribeSystemTheme(onStoreChange: () => void) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  media.addEventListener('change', onStoreChange);
  return () => media.removeEventListener('change', onStoreChange);
}

function applyDocumentTheme(preference: AppearancePreference, systemDark: boolean, pathname: string) {
  const root = document.documentElement;
  if (!isApplicationPath(pathname)) {
    delete root.dataset.theme;
    delete root.dataset.appearance;
    root.style.colorScheme = 'light';
    return;
  }

  const theme = resolveTheme(preference, systemDark);
  root.dataset.appearance = preference;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const preference = useSyncExternalStore(subscribePreference, currentPreference, (): AppearancePreference => 'system');
  const systemDark = useSyncExternalStore(subscribeSystemTheme, currentSystemDark, () => false);

  useEffect(() => {
    applyDocumentTheme(currentPreference(), currentSystemDark(), pathname);
  }, [pathname, preference, systemDark]);

  const setPreference = useCallback((nextPreference: AppearancePreference) => {
    memoryPreference = nextPreference;
    try { localStorage.setItem(APPEARANCE_STORAGE_KEY, nextPreference); } catch { /* In-memory selection still works. */ }
    applyDocumentTheme(nextPreference, window.matchMedia('(prefers-color-scheme: dark)').matches, pathname);
    window.dispatchEvent(new Event(APPEARANCE_EVENT));
  }, [pathname]);

  const value = useMemo<ThemeContextValue>(() => ({
    preference,
    resolvedTheme: resolveTheme(preference, systemDark),
    setPreference,
  }), [preference, setPreference, systemDark]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside ThemeProvider.');
  return value;
}
