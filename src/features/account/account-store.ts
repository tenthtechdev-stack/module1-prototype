'use client';

import { useCallback, useSyncExternalStore } from 'react';

const ACCOUNT_STORAGE_EVENT = 'stock-supplies:account-storage-change';

export const ACCOUNT_PROFILE_STORAGE_KEY = 'stock-supplies:account-profile:v1';
export const ACCOUNT_SECURITY_STORAGE_KEY = 'stock-supplies:account-security:v1';
export const NOTIFICATION_PREFERENCES_STORAGE_KEY = 'stock-supplies:notification-preferences:v1';
export const NOTIFICATION_READ_STORAGE_KEY = 'stock-supplies:notification-read:v1';
export const DEFAULT_NOTIFICATION_READ_IDS = ['notification-invitation', 'notification-security'];

export interface AccountProfile {
  name: string;
  email: string;
  jobTitle: string;
  timezone: string;
  avatarDataUrl: string | null;
}

export interface AccountSecurityState {
  twoFactorEnabled: boolean;
  otherSessionsActive: boolean;
}

export type NotificationPreferenceKey =
  | 'financialApprovals'
  | 'cogsIssues'
  | 'marketplaceSync'
  | 'marketplaceAuthentication'
  | 'userActivity'
  | 'securityAlerts';

export interface NotificationChannelPreference {
  inApp: boolean;
  email: boolean;
}

export type NotificationPreferences = Record<NotificationPreferenceKey, NotificationChannelPreference>;

export const DEFAULT_ACCOUNT_PROFILE: AccountProfile = {
  name: 'Zara Rahman',
  email: 'zara.rahman@stocksupplies.co.uk',
  jobTitle: 'Head of Commerce',
  timezone: 'Europe/London',
  avatarDataUrl: null,
};

export const DEFAULT_ACCOUNT_SECURITY: AccountSecurityState = {
  twoFactorEnabled: false,
  otherSessionsActive: true,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  financialApprovals: { inApp: true, email: true },
  cogsIssues: { inApp: true, email: true },
  marketplaceSync: { inApp: true, email: false },
  marketplaceAuthentication: { inApp: true, email: true },
  userActivity: { inApp: true, email: false },
  securityAlerts: { inApp: true, email: true },
};

const valueCache = new Map<string, { raw: string | null; value: unknown }>();
const memoryValues = new Map<string, unknown>();

function mergeStoredValue<T>(parsed: unknown, fallback: T): T {
  if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
  if (fallback && typeof fallback === 'object' && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...fallback, ...parsed } as T;
  }
  return (parsed ?? fallback) as T;
}

function readStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    const cached = valueCache.get(key);
    if (cached?.raw === raw) return cached.value as T;
    const value = raw ? mergeStoredValue(JSON.parse(raw), fallback) : (memoryValues.get(key) as T | undefined) ?? fallback;
    valueCache.set(key, { raw, value });
    return value;
  } catch {
    return (memoryValues.get(key) as T | undefined) ?? fallback;
  }
}

export function useLocalAccountState<T>(key: string, fallback: T) {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) onStoreChange();
    };
    const onAccountStorage = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) onStoreChange();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(ACCOUNT_STORAGE_EVENT, onAccountStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(ACCOUNT_STORAGE_EVENT, onAccountStorage);
    };
  }, [key]);

  const getSnapshot = useCallback(() => readStoredValue(key, fallback), [fallback, key]);
  const getServerSnapshot = useCallback(() => fallback, [fallback]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const persist = useCallback((next: T) => {
    memoryValues.set(key, next);
    try {
      const raw = JSON.stringify(next);
      valueCache.set(key, { raw, value: next });
      window.localStorage.setItem(key, raw);
    } catch {
      // The current session can still reflect the change if browser storage is unavailable.
    }
    window.dispatchEvent(new CustomEvent(ACCOUNT_STORAGE_EVENT, { detail: key }));
  }, [key]);

  return [value, persist] as const;
}

export function useAccountProfile() {
  return useLocalAccountState(ACCOUNT_PROFILE_STORAGE_KEY, DEFAULT_ACCOUNT_PROFILE);
}

export function useAccountSecurity() {
  return useLocalAccountState(ACCOUNT_SECURITY_STORAGE_KEY, DEFAULT_ACCOUNT_SECURITY);
}

export function useNotificationPreferences() {
  return useLocalAccountState(NOTIFICATION_PREFERENCES_STORAGE_KEY, DEFAULT_NOTIFICATION_PREFERENCES);
}
