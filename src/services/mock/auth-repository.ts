import { workspaceFixtures } from '@/src/fixtures/data';
import type { AuthRepository, RegisterAccountInput, RegistrationResult } from '@/src/services/onboarding-contracts';
import { mockDelay } from '@/src/services/mock/mock-delay';
import { MockOnboardingStore, OnboardingServiceError, mockOnboardingStore } from '@/src/services/mock/onboarding-store';

function normalizedEmail(value: string) {
  return value.trim().toLowerCase();
}

export class MockAuthRepository implements AuthRepository {
  constructor(private readonly store: MockOnboardingStore = mockOnboardingStore) {}

  async register(input: RegisterAccountInput, signal?: AbortSignal): Promise<RegistrationResult> {
    await mockDelay(480, signal);
    const email = normalizedEmail(input.email);
    if (!input.firstName.trim() || !input.lastName.trim()) {
      throw new OnboardingServiceError('validation', 'Enter your first and last name.');
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      throw new OnboardingServiceError('validation', 'Enter a valid work email address.');
    }
    if (input.password.length < 8 || !/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
      throw new OnboardingServiceError('validation', 'Use at least 8 characters including a letter and a number.');
    }
    if (input.password !== input.confirmPassword) {
      throw new OnboardingServiceError('validation', 'The passwords do not match.');
    }
    if (!input.termsAccepted) {
      throw new OnboardingServiceError('validation', 'Accept the terms to create an account.');
    }
    if (email === 'failure@registration.test') {
      throw new OnboardingServiceError('processing_failed', 'Account creation is temporarily unavailable. Please try again.');
    }

    const fixtureEmailExists = workspaceFixtures.some((workspace) => workspace.users.some((user) => user.email.toLowerCase() === email));
    const state = this.store.read();
    const storedEmailExists = Object.values(state.accounts).some((account) => account.email === email)
      || Object.values(state.users).some((user) => user.email.toLowerCase() === email);
    if (fixtureEmailExists || storedEmailExists) {
      throw new OnboardingServiceError('conflict', 'An account already exists for this email address.');
    }

    return this.store.transaction((draft) => {
      const now = this.store.nowIso();
      const accountId = this.store.createId('account');
      const sessionId = this.store.createId('onboarding');
      const account = {
        id: accountId,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        email,
        termsAcceptedAt: now,
        createdAt: now,
      };
      const session = {
        id: sessionId,
        revision: 1,
        ownerAccountId: accountId,
        ownerUserId: null,
        organisationId: null,
        currentStep: 'subscription' as const,
        completedSteps: ['account' as const],
        skippedSteps: [],
        status: 'in_progress' as const,
        pendingBilling: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      draft.accounts[accountId] = account;
      draft.sessions[sessionId] = session;
      draft.activeSessionId = sessionId;
      return { account, session };
    });
  }

  async activateOwner(sessionId: string, signal?: AbortSignal) {
    await mockDelay(120, signal);
    return this.store.transaction((draft) => {
      const session = draft.sessions[sessionId];
      const owner = session?.ownerUserId ? draft.users[session.ownerUserId] : null;
      if (!session || !owner) throw new OnboardingServiceError('not_found', 'The organisation owner could not be resolved.');
      draft.activeSessionId = session.id;
      draft.activeUserId = owner.id;
      return owner;
    });
  }
}
