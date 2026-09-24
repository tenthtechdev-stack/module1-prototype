import type {
  ModuleEntitlement,
  Subscription,
  User,
} from '@/src/domain/models';
import type {
  CostImportPreview,
  OnboardingCompany,
  OnboardingCostState,
  OnboardingInvitation,
  OnboardingMarketplaceAccount,
  OnboardingOrganisation,
  OnboardingSession,
  OnboardingStep,
  RegisteredAccount,
  SyncDatasetProgress,
} from '@/src/domain/onboarding';
import { ONBOARDING_STEPS } from '@/src/domain/onboarding';
import type { WorkspaceSnapshot } from '@/src/services/contracts';

export const ONBOARDING_STORAGE_VERSION = 2 as const;
export const ONBOARDING_STORAGE_KEY = `stock-supplies:mock:v${ONBOARDING_STORAGE_VERSION}`;

export type OnboardingErrorCode =
  | 'not_found'
  | 'validation'
  | 'conflict'
  | 'prerequisite'
  | 'dependency'
  | 'payment_declined'
  | 'processing_failed'
  | 'authentication_required'
  | 'expired';

export class OnboardingServiceError extends Error {
  constructor(public readonly code: OnboardingErrorCode, message: string) {
    super(message);
    this.name = 'OnboardingServiceError';
  }
}

export interface PersistedAccountSync {
  marketplaceAccountId: string;
  startedAt: string;
  datasets: SyncDatasetProgress[];
}

export interface PersistedInitialSync {
  organisationId: string;
  startedAt: string;
  accounts: PersistedAccountSync[];
}

export interface MockOnboardingState {
  version: typeof ONBOARDING_STORAGE_VERSION;
  activeSessionId: string | null;
  activeUserId: string | null;
  accounts: Record<string, RegisteredAccount>;
  sessions: Record<string, OnboardingSession>;
  organisations: Record<string, OnboardingOrganisation>;
  subscriptions: Record<string, Subscription>;
  entitlements: Record<string, ModuleEntitlement[]>;
  companies: Record<string, OnboardingCompany>;
  marketplaceAccounts: Record<string, OnboardingMarketplaceAccount>;
  users: Record<string, User>;
  syncs: Record<string, PersistedInitialSync>;
  cogs: Record<string, OnboardingCostState>;
  costImports: Record<string, CostImportPreview>;
  invitations: Record<string, OnboardingInvitation>;
}

function emptyState(): MockOnboardingState {
  return {
    version: ONBOARDING_STORAGE_VERSION,
    activeSessionId: null,
    activeUserId: null,
    accounts: {},
    sessions: {},
    organisations: {},
    subscriptions: {},
    entitlements: {},
    companies: {},
    marketplaceAccounts: {},
    users: {},
    syncs: {},
    cogs: {},
    costImports: {},
    invitations: {},
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPersistedState(value: unknown): value is MockOnboardingState {
  if (!isRecord(value) || value.version !== ONBOARDING_STORAGE_VERSION) return false;
  if (value.activeSessionId !== null && typeof value.activeSessionId !== 'string') return false;
  if (value.activeUserId !== undefined && value.activeUserId !== null && typeof value.activeUserId !== 'string') return false;
  return [
    'accounts',
    'sessions',
    'organisations',
    'subscriptions',
    'entitlements',
    'companies',
    'marketplaceAccounts',
    'users',
    'syncs',
    'cogs',
    'costImports',
    'invitations',
  ].every((key) => isRecord(value[key]));
}

function clone<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export class MockOnboardingStore {
  private state = emptyState();
  private hydrated = false;

  constructor(
    private readonly now: () => Date = () => new Date(),
    private readonly storage: () => Storage | null = browserStorage,
  ) {}

  nowIso() {
    return this.now().toISOString();
  }

  createId(prefix: string) {
    const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replaceAll('-', '').slice(0, 12)
      : `${this.now().getTime().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return `${prefix}-${randomPart}`;
  }

  private hydrate() {
    const storage = this.storage();
    if (!storage) {
      this.hydrated = true;
      return;
    }
    try {
      const serialized = storage.getItem(ONBOARDING_STORAGE_KEY);
      if (!serialized) {
        if (this.hydrated) this.state = emptyState();
        this.hydrated = true;
        return;
      }
      const parsed: unknown = JSON.parse(serialized);
      if (isPersistedState(parsed)) this.state = clone(parsed);
      else {
        storage.removeItem(ONBOARDING_STORAGE_KEY);
        this.state = emptyState();
      }
    } catch {
      storage.removeItem(ONBOARDING_STORAGE_KEY);
      this.state = emptyState();
    }
    this.hydrated = true;
  }

  read(): MockOnboardingState {
    // localStorage is the canonical prototype boundary. Re-reading it keeps
    // owner setup and invite acceptance coherent when they run in two tabs.
    this.hydrate();
    return clone(this.state);
  }

  transaction<T>(mutate: (draft: MockOnboardingState) => T): T {
    // Merge from the latest durable snapshot immediately before applying a
    // mutation so a stale tab cannot overwrite newer onboarding progress.
    this.hydrate();
    const draft = clone(this.state);
    const result = mutate(draft);
    this.state = draft;
    const storage = this.storage();
    if (storage) {
      try {
        storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // The in-memory prototype remains usable if browser storage is unavailable.
      }
    }
    return clone(result);
  }

  /** Restore a previously read snapshot after a coordinated multi-store write fails. */
  restore(snapshot: MockOnboardingState) {
    this.state = clone(snapshot);
    this.hydrated = true;
    const storage = this.storage();
    if (storage) {
      try {
        storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(this.state));
      } catch {
        // The in-memory snapshot still prevents a partially committed bridge write.
      }
    }
  }

  reset() {
    this.state = emptyState();
    this.hydrated = true;
    this.storage()?.removeItem(ONBOARDING_STORAGE_KEY);
  }

  /** Focus a reviewer-selected stage without weakening the normal step guards. */
  previewStep(sessionId: string, step: OnboardingStep) {
    return this.transaction((draft) => {
      const session = requireSession(draft, sessionId);
      session.currentStep = step;
      if (step !== 'complete') {
        session.status = 'in_progress';
        session.completedAt = null;
        session.completedSteps = session.completedSteps.filter((item) => item !== 'complete');
      }
      // Advance the existing simulation for later stages so COGS uses the same
      // imported products as a sequential onboarding journey.
      if (session.organisationId && ONBOARDING_STEPS.indexOf(step) > ONBOARDING_STEPS.indexOf('sync')) {
        const sync = draft.syncs[session.organisationId];
        if (sync) {
          const elapsedStart = new Date(Date.parse(this.nowIso()) - 60_000).toISOString();
          sync.startedAt = sync.startedAt < elapsedStart ? sync.startedAt : elapsedStart;
          for (const account of sync.accounts) {
            account.startedAt = account.startedAt < elapsedStart ? account.startedAt : elapsedStart;
          }
        }
      }
      return touchSession(this, session);
    });
  }

  findWorkspaceBySlug(orgSlug: string): WorkspaceSnapshot | null {
    const state = this.read();
    const organisation = Object.values(state.organisations).find((item) => item.slug === orgSlug);
    if (!organisation) return null;
    const subscription = state.subscriptions[organisation.id];
    if (!subscription) return null;
    const users = Object.values(state.users).filter((user) => user.organisationId === organisation.id);
    const ownerUserId = Object.values(state.sessions).find((session) => session.organisationId === organisation.id)?.ownerUserId;
    const activeUser = users.find((user) => user.id === state.activeUserId)
      ?? users.find((user) => user.id === ownerUserId)
      ?? users[0]
      ?? null;
    const cogs = state.cogs[organisation.id];
    const productsImported = cogs?.importedProductCount ?? 0;
    const cogsComplete = Math.min(productsImported, Math.max(0, cogs?.coveredProductCount ?? 0));
    return {
      organisation,
      subscription,
      entitlements: clone(state.entitlements[organisation.id] ?? []),
      companies: Object.values(state.companies).filter((company) => company.organisationId === organisation.id),
      marketplaceAccounts: Object.values(state.marketplaceAccounts).filter((account) => account.organisationId === organisation.id),
      users,
      activeUser,
      cogsReadiness: cogs ? {
        productsImported,
        cogsComplete,
        cogsMissing: Math.max(0, productsImported - cogsComplete),
        coveragePercent: productsImported ? Math.round((cogsComplete / productsImported) * 100) : 0,
        reliableProfitability: productsImported > 0 && cogsComplete === productsImported,
      } : null,
    };
  }
}

export const mockOnboardingStore = new MockOnboardingStore();

export function requireSession(state: MockOnboardingState, sessionId: string) {
  const session = state.sessions[sessionId];
  if (!session) throw new OnboardingServiceError('not_found', 'The onboarding session could not be found.');
  return session;
}

export function requireOrganisationId(state: MockOnboardingState, sessionId: string) {
  const session = requireSession(state, sessionId);
  if (!session.organisationId) throw new OnboardingServiceError('prerequisite', 'Create the organisation before continuing.');
  return session.organisationId;
}

export function touchSession(store: MockOnboardingStore, session: OnboardingSession) {
  session.revision += 1;
  session.updatedAt = store.nowIso();
  return session;
}
