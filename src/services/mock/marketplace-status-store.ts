'use client';

import { useCallback, useSyncExternalStore } from 'react';
import type { SyncStatus } from '@/src/domain/models';

const MARKETPLACE_STATUS_EVENT = 'stock-supplies:marketplace-status-change';
const MARKETPLACE_STATUS_PREFIX = 'stock-supplies:marketplace-status:v1';
const VALID_STATUSES = new Set<SyncStatus>([
  'connected', 'synced', 'syncing', 'pending', 'delayed', 'failed', 'retrying', 'disconnected', 'authentication_required',
]);

export type MarketplacePrototypeStatus = SyncStatus | 'paused';
export type MarketplaceStatusOverrides = Readonly<Record<string, MarketplacePrototypeStatus>>;

const EMPTY_OVERRIDES: MarketplaceStatusOverrides = {};
const valueCache = new Map<string, { raw: string | null; value: MarketplaceStatusOverrides }>();
const memoryValues = new Map<string, MarketplaceStatusOverrides>();

function storageKey(organisationId: string, scenarioId: string, scenarioRevision: number) {
  return `${MARKETPLACE_STATUS_PREFIX}:${organisationId}:${scenarioId}:${scenarioRevision}`;
}

function validStatus(value: unknown): value is MarketplacePrototypeStatus {
  return value === 'paused' || VALID_STATUSES.has(value as SyncStatus);
}

function normalise(value: unknown): MarketplaceStatusOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_OVERRIDES;
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, MarketplacePrototypeStatus] => typeof entry[0] === 'string' && validStatus(entry[1])));
}

function readOverrides(key: string): MarketplaceStatusOverrides {
  if (typeof window === 'undefined') return EMPTY_OVERRIDES;
  try {
    const raw = window.localStorage.getItem(key);
    const cached = valueCache.get(key);
    if (cached?.raw === raw) return cached.value;
    const value = raw ? normalise(JSON.parse(raw)) : memoryValues.get(key) ?? EMPTY_OVERRIDES;
    valueCache.set(key, { raw, value });
    return value;
  } catch {
    return memoryValues.get(key) ?? EMPTY_OVERRIDES;
  }
}

export function resetMarketplaceStatusOverrides() {
  const removedKeys = new Set([...valueCache.keys(), ...memoryValues.keys()]);
  valueCache.clear();
  memoryValues.clear();
  if (typeof window === 'undefined') return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(`${MARKETPLACE_STATUS_PREFIX}:`)) {
        removedKeys.add(key);
        window.localStorage.removeItem(key);
      }
    }
  } catch { /* The in-memory prototype state is still reset. */ }
  removedKeys.forEach((key) => window.dispatchEvent(new CustomEvent(MARKETPLACE_STATUS_EVENT, { detail: key })));
}

export function useMarketplaceStatusOverrides(organisationId: string, scenarioId: string, scenarioRevision: number) {
  const key = storageKey(organisationId, scenarioId, scenarioRevision);
  const subscribe = useCallback((onStoreChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) onStoreChange();
    };
    const onMarketplaceStatus = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) onStoreChange();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(MARKETPLACE_STATUS_EVENT, onMarketplaceStatus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(MARKETPLACE_STATUS_EVENT, onMarketplaceStatus);
    };
  }, [key]);
  const getSnapshot = useCallback(() => readOverrides(key), [key]);
  const overrides = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_OVERRIDES);
  const setStatusOverride = useCallback((accountId: string, status: MarketplacePrototypeStatus) => {
    const next = { ...readOverrides(key), [accountId]: status };
    memoryValues.set(key, next);
    try {
      const raw = JSON.stringify(next);
      valueCache.set(key, { raw, value: next });
      window.localStorage.setItem(key, raw);
    } catch {
      valueCache.set(key, { raw: null, value: next });
    }
    window.dispatchEvent(new CustomEvent(MARKETPLACE_STATUS_EVENT, { detail: key }));
  }, [key]);
  return { statusOverrides: overrides, setStatusOverride };
}
