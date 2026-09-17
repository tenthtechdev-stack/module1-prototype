'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CostImportPreview,
  InitialSyncProgress,
  InvitationAcceptance,
  OnboardingCompany,
  OnboardingInvitation,
  OnboardingMarketplaceAccount,
  OnboardingProduct,
  OnboardingSnapshot,
  OnboardingStep,
  SyncDataset,
} from '@/src/domain/onboarding';
import type {
  AcceptInvitationInput,
  ApplyCostImportInput,
  ConfirmTestPaymentInput,
  ConnectMarketplaceInput,
  InviteUserInput,
  PreviewCostImportInput,
  RegisterAccountInput,
  SaveCompanyInput,
  SaveInitialCostInput,
  SaveOrganisationInput,
  SelectTestPlanInput,
} from '@/src/services/onboarding-contracts';
import { services } from '@/src/services/runtime';
import { usePrototype } from '@/src/components/providers/prototype-provider';

interface OnboardingContextValue {
  snapshot: OnboardingSnapshot | null;
  syncProgress: InitialSyncProgress | null;
  costPreview: CostImportPreview | null;
  loading: boolean;
  pendingAction: string | null;
  error: string | null;
  resume: () => Promise<OnboardingSnapshot | null>;
  refresh: () => Promise<OnboardingSnapshot | null>;
  register: (input: RegisterAccountInput) => Promise<OnboardingSnapshot>;
  selectPlan: (input?: Omit<SelectTestPlanInput, 'sessionId'>) => Promise<OnboardingSnapshot>;
  confirmPayment: (input: Omit<ConfirmTestPaymentInput, 'sessionId'>) => Promise<OnboardingSnapshot>;
  saveOrganisation: (input: Omit<SaveOrganisationInput, 'sessionId'>) => Promise<OnboardingSnapshot>;
  saveCompany: (input: Omit<SaveCompanyInput, 'sessionId'>) => Promise<OnboardingCompany>;
  removeCompany: (companyId: string) => Promise<void>;
  connectMarketplace: (input: Omit<ConnectMarketplaceInput, 'sessionId'>) => Promise<OnboardingMarketplaceAccount>;
  retryMarketplace: (marketplaceAccountId: string) => Promise<OnboardingMarketplaceAccount>;
  disconnectMarketplace: (marketplaceAccountId: string) => Promise<void>;
  startSync: () => Promise<InitialSyncProgress>;
  refreshSync: () => Promise<InitialSyncProgress | null>;
  retryDataset: (marketplaceAccountId: string, dataset: SyncDataset) => Promise<InitialSyncProgress>;
  previewCostImport: (input: Omit<PreviewCostImportInput, 'sessionId' | 'scenarioId'>) => Promise<CostImportPreview>;
  listCogsProducts: () => Promise<OnboardingProduct[]>;
  applyCostImport: (input: Omit<ApplyCostImportInput, 'sessionId'>) => Promise<OnboardingSnapshot>;
  saveInitialCost: (input: Omit<SaveInitialCostInput, 'sessionId'>) => Promise<OnboardingSnapshot>;
  discardCostImport: () => Promise<void>;
  inviteUser: (input: Omit<InviteUserInput, 'sessionId'>) => Promise<OnboardingInvitation>;
  removeInvitation: (invitationId: string) => Promise<void>;
  resendInvitation: (invitationId: string, outcome?: 'success' | 'failure') => Promise<OnboardingInvitation>;
  getInvitation: (token: string) => Promise<OnboardingInvitation | null>;
  acceptInvitation: (input: AcceptInvitationInput) => Promise<InvitationAcceptance>;
  completeStep: (step: OnboardingStep) => Promise<OnboardingSnapshot>;
  skipStep: (step: OnboardingStep) => Promise<OnboardingSnapshot>;
  finish: () => Promise<OnboardingSnapshot>;
  reset: () => Promise<void>;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function messageFor(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Saved setup progress could not be loaded.';
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { scenarioId } = usePrototype();
  const [snapshot, setSnapshot] = useState<OnboardingSnapshot | null>(null);
  const [syncProgress, setSyncProgress] = useState<InitialSyncProgress | null>(null);
  const [costPreview, setCostPreview] = useState<CostImportPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const activeSessionId = snapshot?.session.id ?? null;

  useEffect(() => () => { mounted.current = false; }, []);

  const loadSnapshot = useCallback(async (sessionId: string) => {
    let base = await services.onboarding.session.getSnapshot(sessionId, scenarioId);
    if (base.session.organisationId && base.session.completedSteps.includes('sync')) {
      try {
        const progress = await services.onboarding.sync.getProgress(sessionId, scenarioId);
        if (mounted.current) setSyncProgress(progress);
        if ((base.cogsCoverage?.productsImported ?? 0) !== progress.imported.products) {
          base = await services.onboarding.session.getSnapshot(sessionId, scenarioId);
        }
      } catch {
        // A sync error is rendered by the sync route. Keep the last durable
        // onboarding snapshot available so unrelated setup steps remain usable.
      }
    }
    const marketplaceAccounts = base.session.organisationId
      ? await services.onboarding.marketplaces.list(sessionId, scenarioId)
      : [];
    const next = { ...base, marketplaceAccounts };
    if (mounted.current) setSnapshot(next);
    return next;
  }, [scenarioId]);

  const resume = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const session = await services.onboarding.session.getActiveSession();
      if (!session) {
        if (mounted.current) {
          setSnapshot(null);
          setSyncProgress(null);
          setCostPreview(null);
        }
        return null;
      }
      return await loadSnapshot(session.id);
    } catch (resumeError) {
      if (mounted.current) setError(messageFor(resumeError));
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [loadSnapshot]);

  const refresh = useCallback(async () => {
    if (!activeSessionId) return resume();
    try {
      setError(null);
      return await loadSnapshot(activeSessionId);
    } catch (refreshError) {
      if (mounted.current) setError(messageFor(refreshError));
      return null;
    }
  }, [activeSessionId, loadSnapshot, resume]);

  const withAction = useCallback(async <T,>(label: string, action: () => Promise<T>) => {
    setPendingAction(label);
    try {
      return await action();
    } finally {
      if (mounted.current) setPendingAction(null);
    }
  }, []);

  const requireSessionId = useCallback(() => {
    if (!activeSessionId) throw new Error('Create or resume an owner account before continuing setup.');
    return activeSessionId;
  }, [activeSessionId]);

  const refreshAfterFailure = useCallback(async (sessionId: string, action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (actionError) {
      await loadSnapshot(sessionId).catch(() => undefined);
      throw actionError;
    }
  }, [loadSnapshot]);

  const value = useMemo<OnboardingContextValue>(() => ({
    snapshot,
    syncProgress,
    costPreview,
    loading,
    pendingAction,
    error,
    resume,
    refresh,
    register: (input) => withAction('register', async () => {
      const result = await services.onboarding.auth.register(input);
      return loadSnapshot(result.session.id);
    }),
    selectPlan: (input = {}) => withAction('subscription', async () => {
      const sessionId = requireSessionId();
      await services.onboarding.billing.selectTestPlan({ sessionId, ...input });
      return loadSnapshot(sessionId);
    }),
    confirmPayment: (input) => withAction('payment', async () => {
      const sessionId = requireSessionId();
      await refreshAfterFailure(sessionId, () => services.onboarding.billing.confirmTestPayment({ sessionId, ...input }));
      return loadSnapshot(sessionId);
    }),
    saveOrganisation: (input) => withAction('organisation', async () => {
      const sessionId = requireSessionId();
      await services.onboarding.organisation.save({ sessionId, ...input });
      return loadSnapshot(sessionId);
    }),
    saveCompany: (input) => withAction('company', async () => {
      const sessionId = requireSessionId();
      const company = await services.onboarding.companies.save({ sessionId, ...input });
      await loadSnapshot(sessionId);
      return company;
    }),
    removeCompany: (companyId) => withAction('company-remove', async () => {
      const sessionId = requireSessionId();
      await services.onboarding.companies.remove(sessionId, companyId);
      await loadSnapshot(sessionId);
    }),
    connectMarketplace: (input) => withAction('marketplace', async () => {
      const sessionId = requireSessionId();
      let connected: OnboardingMarketplaceAccount | null = null;
      await refreshAfterFailure(sessionId, async () => {
        connected = await services.onboarding.marketplaces.connect({ sessionId, ...input });
      });
      await loadSnapshot(sessionId);
      if (!connected) throw new Error('The marketplace account could not be connected.');
      return connected;
    }),
    retryMarketplace: (marketplaceAccountId) => withAction('marketplace-retry', async () => {
      const sessionId = requireSessionId();
      const account = await services.onboarding.marketplaces.retry(sessionId, marketplaceAccountId);
      await loadSnapshot(sessionId);
      return account;
    }),
    disconnectMarketplace: (marketplaceAccountId) => withAction('marketplace-disconnect', async () => {
      const sessionId = requireSessionId();
      await services.onboarding.marketplaces.disconnect(sessionId, marketplaceAccountId);
      await loadSnapshot(sessionId);
    }),
    startSync: () => withAction('sync-start', async () => {
      const sessionId = requireSessionId();
      const progress = await services.onboarding.sync.start(sessionId);
      setSyncProgress(progress);
      await loadSnapshot(sessionId);
      return progress;
    }),
    refreshSync: async () => {
      if (!activeSessionId) return null;
      const progress = await services.onboarding.sync.getProgress(activeSessionId, scenarioId);
      if (mounted.current) setSyncProgress(progress);
      if (progress.imported.products > (snapshot?.cogsCoverage?.productsImported ?? 0)) await loadSnapshot(activeSessionId);
      return progress;
    },
    retryDataset: (marketplaceAccountId, dataset) => withAction('sync-retry', async () => {
      const sessionId = requireSessionId();
      const progress = await services.onboarding.sync.retryDataset(sessionId, marketplaceAccountId, dataset);
      setSyncProgress(progress);
      return progress;
    }),
    previewCostImport: (input) => withAction('cogs-preview', async () => {
      const sessionId = requireSessionId();
      const preview = await services.onboarding.cogs.previewImport({ sessionId, scenarioId, ...input });
      setCostPreview(preview);
      return preview;
    }),
    listCogsProducts: () => withAction('cogs-products', () => services.onboarding.cogs.listProducts(requireSessionId())),
    applyCostImport: (input) => withAction('cogs-apply', async () => {
      const sessionId = requireSessionId();
      await services.onboarding.cogs.applyImport({ sessionId, ...input });
      setCostPreview(null);
      return loadSnapshot(sessionId);
    }),
    saveInitialCost: (input) => withAction('cogs-save', async () => {
      const sessionId = requireSessionId();
      await services.onboarding.cogs.saveCost({ sessionId, ...input });
      return loadSnapshot(sessionId);
    }),
    discardCostImport: () => withAction('cogs-discard', async () => {
      const sessionId = requireSessionId();
      if (costPreview) await services.onboarding.cogs.discardImport(sessionId, costPreview.id);
      setCostPreview(null);
    }),
    inviteUser: (input) => withAction('invitation', async () => {
      const sessionId = requireSessionId();
      let invitation: OnboardingInvitation | null = null;
      await refreshAfterFailure(sessionId, async () => {
        invitation = await services.onboarding.invitations.invite({ sessionId, ...input });
      });
      await loadSnapshot(sessionId);
      if (!invitation) throw new Error('The invitation could not be sent.');
      return invitation;
    }),
    removeInvitation: (invitationId) => withAction('invitation-remove', async () => {
      const sessionId = requireSessionId();
      await services.onboarding.invitations.remove(sessionId, invitationId);
      await loadSnapshot(sessionId);
    }),
    resendInvitation: (invitationId, outcome = 'success') => withAction('invitation-resend', async () => {
      const sessionId = requireSessionId();
      let invitation: OnboardingInvitation | null = null;
      await refreshAfterFailure(sessionId, async () => {
        invitation = await services.onboarding.invitations.resend(sessionId, invitationId, outcome);
      });
      await loadSnapshot(sessionId);
      if (!invitation) throw new Error('The invitation could not be resent.');
      return invitation;
    }),
    getInvitation: (token) => services.onboarding.invitations.getByToken(token),
    acceptInvitation: (input) => withAction('invitation-accept', () => services.onboarding.invitations.accept(input)),
    completeStep: (step) => withAction(`step-${step}`, async () => {
      const sessionId = requireSessionId();
      await services.onboarding.coordinator.goForward(sessionId, step);
      return loadSnapshot(sessionId);
    }),
    skipStep: (step) => withAction(`skip-${step}`, async () => {
      const sessionId = requireSessionId();
      await services.onboarding.coordinator.skip(sessionId, step);
      return loadSnapshot(sessionId);
    }),
    finish: () => withAction('finish', async () => {
      const sessionId = requireSessionId();
      await services.onboarding.coordinator.finish(sessionId);
      return loadSnapshot(sessionId);
    }),
    reset: () => withAction('reset', async () => {
      await services.onboarding.coordinator.reset();
      if (mounted.current) {
        setSnapshot(null);
        setSyncProgress(null);
        setCostPreview(null);
        setError(null);
      }
    }),
  }), [activeSessionId, costPreview, error, loadSnapshot, loading, pendingAction, refresh, refreshAfterFailure, requireSessionId, resume, scenarioId, snapshot, syncProgress, withAction]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const value = useContext(OnboardingContext);
  if (!value) throw new Error('useOnboarding must be used inside OnboardingProvider.');
  return value;
}
