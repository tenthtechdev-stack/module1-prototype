import type { AuditEvent, COGSRecord } from '@/src/domain/models';
import type { CogsImportBatch } from '@/src/domain/cogs';

export const COGS_MANAGEMENT_STORAGE_KEY = 'stock-supplies:cogs-management:v1';

export interface OrganisationCogsState {
  recordsByProduct: Record<string, COGSRecord[]>;
  batches: Record<string, CogsImportBatch>;
  auditEvents: AuditEvent[];
}

export interface CogsManagementState {
  version: 1;
  sequence: number;
  organisations: Record<string, OrganisationCogsState>;
}

function emptyState(): CogsManagementState {
  return { version: 1, sequence: 0, organisations: {} };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function validState(value: unknown): value is CogsManagementState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<CogsManagementState>;
  return candidate.version === 1 && typeof candidate.sequence === 'number' && Boolean(candidate.organisations && typeof candidate.organisations === 'object');
}

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function organisationCogsState(state: CogsManagementState, organisationId: string): OrganisationCogsState {
  return state.organisations[organisationId] ?? { recordsByProduct: {}, batches: {}, auditEvents: [] };
}

export class MockCogsManagementStore {
  private memory = emptyState();

  read() {
    const storage = browserStorage();
    if (!storage) return clone(this.memory);
    try {
      const raw = storage.getItem(COGS_MANAGEMENT_STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed: unknown = JSON.parse(raw);
      if (!validState(parsed)) {
        storage.removeItem(COGS_MANAGEMENT_STORAGE_KEY);
        return emptyState();
      }
      this.memory = clone(parsed);
      return clone(parsed);
    } catch {
      return clone(this.memory);
    }
  }

  transaction<T>(operation: (draft: CogsManagementState) => T) {
    const draft = this.read();
    const result = operation(draft);
    this.memory = clone(draft);
    const storage = browserStorage();
    if (storage) {
      try { storage.setItem(COGS_MANAGEMENT_STORAGE_KEY, JSON.stringify(draft)); } catch { /* Memory remains the fallback. */ }
    }
    return result;
  }

  /** Restore a previously read snapshot after a coordinated multi-store write fails. */
  restore(snapshot: CogsManagementState) {
    this.memory = clone(snapshot);
    const storage = browserStorage();
    if (storage) {
      try { storage.setItem(COGS_MANAGEMENT_STORAGE_KEY, JSON.stringify(this.memory)); } catch { /* Memory remains the fallback. */ }
    }
  }

  ensureOrganisation(draft: CogsManagementState, organisationId: string) {
    if (!draft.organisations[organisationId]) draft.organisations[organisationId] = { recordsByProduct: {}, batches: {}, auditEvents: [] };
    return draft.organisations[organisationId];
  }

  createId(prefix: string) {
    return this.transaction((draft) => {
      draft.sequence += 1;
      return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${String(draft.sequence).padStart(4, '0')}`;
    });
  }

  reset() {
    this.memory = emptyState();
    browserStorage()?.removeItem(COGS_MANAGEMENT_STORAGE_KEY);
  }
}

export const mockCogsManagementStore = new MockCogsManagementStore();
