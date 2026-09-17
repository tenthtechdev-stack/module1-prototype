import type {
  ProductGroup,
  ProductGroupAuditEvent,
  ProductGroupCostProposal,
  ProductGroupCostRecord,
  ProductGroupMembership,
} from '@/src/domain/product-groups';

export const PRODUCT_GROUPS_STORAGE_KEY = 'stock-supplies:product-groups:v1';

export interface OrganisationProductGroupsState {
  groups: Record<string, ProductGroup>;
  costRecordsByGroup: Record<string, ProductGroupCostRecord[]>;
  membershipsByGroup: Record<string, ProductGroupMembership[]>;
  proposals: Record<string, ProductGroupCostProposal>;
  auditEvents: ProductGroupAuditEvent[];
}

export interface ProductGroupsState {
  version: 1;
  sequence: number;
  organisations: Record<string, OrganisationProductGroupsState>;
}

function emptyState(): ProductGroupsState {
  return { version: 1, sequence: 0, organisations: {} };
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function isPersistedState(value: unknown): value is ProductGroupsState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ProductGroupsState>;
  return candidate.version === 1
    && typeof candidate.sequence === 'number'
    && Boolean(candidate.organisations && typeof candidate.organisations === 'object');
}

function browserStorage() {
  return typeof window === 'undefined' ? null : window.localStorage;
}

export function emptyOrganisationProductGroupsState(): OrganisationProductGroupsState {
  return {
    groups: {},
    costRecordsByGroup: {},
    membershipsByGroup: {},
    proposals: {},
    auditEvents: [],
  };
}

export function organisationProductGroupsState(
  state: ProductGroupsState,
  organisationId: string,
): OrganisationProductGroupsState {
  return state.organisations[organisationId] ?? emptyOrganisationProductGroupsState();
}

/**
 * Prototype persistence for company-owned Product Groups. The Organisation key
 * is a hard tenant boundary; repositories must still enforce Company assignment
 * on every read and write rather than trusting persisted identifiers.
 */
export class MockProductGroupsStore {
  private memory = emptyState();

  read(): ProductGroupsState {
    const storage = browserStorage();
    if (!storage) return clone(this.memory);
    try {
      const raw = storage.getItem(PRODUCT_GROUPS_STORAGE_KEY);
      if (!raw) return emptyState();
      const parsed: unknown = JSON.parse(raw);
      if (!isPersistedState(parsed)) {
        storage.removeItem(PRODUCT_GROUPS_STORAGE_KEY);
        return emptyState();
      }
      this.memory = clone(parsed);
      return clone(parsed);
    } catch {
      return clone(this.memory);
    }
  }

  transaction<T>(operation: (draft: ProductGroupsState) => T): T {
    const draft = this.read();
    const result = operation(draft);
    this.memory = clone(draft);
    const storage = browserStorage();
    if (storage) {
      try {
        storage.setItem(PRODUCT_GROUPS_STORAGE_KEY, JSON.stringify(draft));
      } catch {
        // In-memory persistence remains available when browser quota is full.
      }
    }
    return clone(result);
  }

  ensureOrganisation(draft: ProductGroupsState, organisationId: string) {
    if (!draft.organisations[organisationId]) {
      draft.organisations[organisationId] = emptyOrganisationProductGroupsState();
    }
    return draft.organisations[organisationId];
  }

  restore(snapshot: ProductGroupsState) {
    this.memory = clone(snapshot);
    const storage = browserStorage();
    if (storage) {
      try {
        storage.setItem(PRODUCT_GROUPS_STORAGE_KEY, JSON.stringify(this.memory));
      } catch {
        // In-memory persistence remains the fallback.
      }
    }
  }

  reset() {
    this.memory = emptyState();
    browserStorage()?.removeItem(PRODUCT_GROUPS_STORAGE_KEY);
  }
}

export const mockProductGroupsStore = new MockProductGroupsStore();
