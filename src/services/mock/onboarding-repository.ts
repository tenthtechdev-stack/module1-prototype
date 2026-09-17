import { ONBOARDING_STEPS, type OnboardingSession, type OnboardingSnapshot, type OnboardingStep } from '@/src/domain/onboarding';
import type { ScenarioId } from '@/src/fixtures/scenarios';
import type { OnboardingRepository } from '@/src/services/onboarding-contracts';
import { MockInitialCogsRepository } from '@/src/services/mock/cogs-repository';
import { MockCogsManagementStore, mockCogsManagementStore } from '@/src/services/mock/cogs-management-store';
import { mockDelay } from '@/src/services/mock/mock-delay';
import {
  MockOnboardingStore,
  OnboardingServiceError,
  mockOnboardingStore,
  requireOrganisationId,
  requireSession,
  touchSession,
} from '@/src/services/mock/onboarding-store';

const SKIPPABLE_STEPS = new Set<OnboardingStep>(['marketplaces', 'sync', 'cogs', 'users']);

function nextStep(step: OnboardingStep): OnboardingStep {
  return ONBOARDING_STEPS[Math.min(ONBOARDING_STEPS.length - 1, ONBOARDING_STEPS.indexOf(step) + 1)];
}

function assertStepCanComplete(store: MockOnboardingStore, state: ReturnType<MockOnboardingStore['read']>, session: OnboardingSession, step: OnboardingStep) {
  if (step === 'account') return;
  if (step === 'subscription' && !session.pendingBilling) throw new OnboardingServiceError('prerequisite', 'Select the Test Plan before continuing.');
  if (step === 'payment' && session.pendingBilling?.paymentStatus !== 'accepted') throw new OnboardingServiceError('prerequisite', 'Complete the test payment before continuing.');
  if (step === 'organisation' && !session.organisationId) throw new OnboardingServiceError('prerequisite', 'Create the organisation before continuing.');
  if (step === 'companies') {
    const organisationId = requireOrganisationId(state, session.id);
    if (!Object.values(state.companies).some((company) => company.organisationId === organisationId)) {
      throw new OnboardingServiceError('prerequisite', 'Create at least one company before continuing.');
    }
  }
  if (step === 'marketplaces') return;
  if (step === 'sync') {
    const organisationId = requireOrganisationId(state, session.id);
    if (!state.syncs[organisationId]) throw new OnboardingServiceError('prerequisite', 'Start the initial marketplace sync before continuing.');
    if ((state.cogs[organisationId]?.importedProductCount ?? 0) < 1) {
      throw new OnboardingServiceError('prerequisite', 'Wait until marketplace products are available before continuing to COGS.');
    }
  }
  if (step === 'complete') throw new OnboardingServiceError('validation', 'Use complete onboarding to finish setup.');
  void store;
}

export class MockOnboardingRepository implements OnboardingRepository {
  private readonly cogs: MockInitialCogsRepository;

  constructor(
    private readonly store: MockOnboardingStore = mockOnboardingStore,
    private readonly canonicalStore: MockCogsManagementStore = mockCogsManagementStore,
  ) {
    this.cogs = new MockInitialCogsRepository(store, canonicalStore);
  }

  async getActiveSession(signal?: AbortSignal) {
    await mockDelay(180, signal);
    const state = this.store.read();
    return state.activeSessionId ? state.sessions[state.activeSessionId] ?? null : null;
  }

  async getSession(sessionId: string, signal?: AbortSignal) {
    await mockDelay(160, signal);
    return this.store.read().sessions[sessionId] ?? null;
  }

  async getSnapshot(sessionId: string, scenarioId: ScenarioId = 'healthy', signal?: AbortSignal): Promise<OnboardingSnapshot> {
    await mockDelay(180, signal);
    const state = this.store.read();
    const session = requireSession(state, sessionId);
    const account = state.accounts[session.ownerAccountId];
    if (!account) throw new OnboardingServiceError('not_found', 'The registered account could not be found.');
    const organisationId = session.organisationId;
    return {
      session,
      account,
      organisation: organisationId ? state.organisations[organisationId] ?? null : null,
      companies: organisationId ? Object.values(state.companies).filter((company) => company.organisationId === organisationId) : [],
      marketplaceAccounts: organisationId ? Object.values(state.marketplaceAccounts).filter((marketplaceAccount) => marketplaceAccount.organisationId === organisationId) : [],
      invitations: organisationId ? Object.values(state.invitations).filter((invitation) => invitation.organisationId === organisationId) : [],
      cogsCoverage: organisationId ? await this.cogs.getCoverage(sessionId, scenarioId, signal) : null,
    };
  }

  async completeStep(sessionId: string, step: OnboardingStep, signal?: AbortSignal) {
    await mockDelay(180, signal);
    return this.store.transaction((draft) => {
      const session = requireSession(draft, sessionId);
      assertStepCanComplete(this.store, draft, session, step);
      if (!session.completedSteps.includes(step)) session.completedSteps.push(step);
      session.skippedSteps = session.skippedSteps.filter((item) => item !== step);
      if (ONBOARDING_STEPS.indexOf(session.currentStep) <= ONBOARDING_STEPS.indexOf(step)) session.currentStep = nextStep(step);
      return touchSession(this.store, session);
    });
  }

  async skipStep(sessionId: string, step: OnboardingStep, signal?: AbortSignal) {
    await mockDelay(160, signal);
    if (!SKIPPABLE_STEPS.has(step)) throw new OnboardingServiceError('prerequisite', `${step} cannot be skipped.`);
    return this.store.transaction((draft) => {
      const session = requireSession(draft, sessionId);
      if (!session.skippedSteps.includes(step)) session.skippedSteps.push(step);
      session.completedSteps = session.completedSteps.filter((item) => item !== step);
      if (ONBOARDING_STEPS.indexOf(session.currentStep) <= ONBOARDING_STEPS.indexOf(step)) session.currentStep = nextStep(step);
      return touchSession(this.store, session);
    });
  }

  async complete(sessionId: string, signal?: AbortSignal) {
    await mockDelay(360, signal);
    this.store.transaction((draft) => {
      const session = requireSession(draft, sessionId);
      for (const required of ['account', 'subscription', 'payment', 'organisation', 'companies'] as const) {
        assertStepCanComplete(this.store, draft, session, required);
        if (!session.completedSteps.includes(required)) throw new OnboardingServiceError('prerequisite', `Complete ${required} before finishing setup.`);
      }
      for (const optional of ['marketplaces', 'sync', 'cogs', 'users'] as const) {
        if (!session.completedSteps.includes(optional) && !session.skippedSteps.includes(optional)) {
          throw new OnboardingServiceError('prerequisite', `Complete or skip ${optional} before finishing setup.`);
        }
      }
      const organisationId = requireOrganisationId(draft, sessionId);
      const organisation = draft.organisations[organisationId];
      if (!organisation) throw new OnboardingServiceError('not_found', 'The organisation could not be found.');
      organisation.onboardingStatus = 'active';
      session.status = 'complete';
      session.currentStep = 'complete';
      if (session.ownerUserId) draft.activeUserId = session.ownerUserId;
      if (!session.completedSteps.includes('complete')) session.completedSteps.push('complete');
      session.completedAt = this.store.nowIso();
      touchSession(this.store, session);
    });
    return this.getSnapshot(sessionId, 'healthy', signal);
  }

  async reset(signal?: AbortSignal) {
    await mockDelay(120, signal);
    const onboardingBefore = this.store.read();
    const canonicalBefore = this.canonicalStore.read();
    try {
      this.cogs.resetPublishedRecords(onboardingBefore);
      this.store.reset();
    } catch (error) {
      this.store.restore(onboardingBefore);
      this.canonicalStore.restore(canonicalBefore);
      throw error;
    }
  }
}
