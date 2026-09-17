import type { BillingRepository, ConfirmTestPaymentInput, SelectTestPlanInput } from '@/src/services/onboarding-contracts';
import { mockDelay } from '@/src/services/mock/mock-delay';
import {
  MockOnboardingStore,
  OnboardingServiceError,
  mockOnboardingStore,
  requireSession,
  touchSession,
} from '@/src/services/mock/onboarding-store';

export class MockBillingRepository implements BillingRepository {
  constructor(private readonly store: MockOnboardingStore = mockOnboardingStore) {}

  async selectTestPlan(input: SelectTestPlanInput, signal?: AbortSignal) {
    await mockDelay(320, signal);
    return this.store.transaction((draft) => {
      const session = requireSession(draft, input.sessionId);
      const account = draft.accounts[session.ownerAccountId];
      if (!account) throw new OnboardingServiceError('not_found', 'The registered owner account could not be found.');
      session.pendingBilling = {
        provider: 'stripe_test',
        planKey: 'test-plan',
        planName: 'Test Plan',
        paymentStatus: 'not_started',
        providerReference: null,
        billingEmail: input.billingEmail?.trim().toLowerCase() || account.email,
        billingCountryCode: input.billingCountryCode?.trim().toUpperCase() || 'GB',
        acceptedAt: null,
        errorCode: null,
      };
      if (!session.completedSteps.includes('subscription')) session.completedSteps.push('subscription');
      session.currentStep = 'payment';
      return touchSession(this.store, session);
    });
  }

  async confirmTestPayment(input: ConfirmTestPaymentInput, signal?: AbortSignal) {
    if (!/^\S+@\S+\.\S+$/.test(input.billingEmail.trim())) {
      throw new OnboardingServiceError('validation', 'Enter a valid billing email address.');
    }
    this.store.transaction((draft) => {
      const session = requireSession(draft, input.sessionId);
      if (!session.pendingBilling) throw new OnboardingServiceError('prerequisite', 'Select the Test Plan before adding payment.');
      session.pendingBilling.paymentStatus = 'processing';
      session.pendingBilling.billingEmail = input.billingEmail.trim().toLowerCase();
      session.pendingBilling.billingCountryCode = input.billingCountryCode.trim().toUpperCase();
      session.pendingBilling.errorCode = null;
      touchSession(this.store, session);
    });

    await mockDelay(920, signal);
    const result = this.store.transaction((draft) => {
      const session = requireSession(draft, input.sessionId);
      const pending = session.pendingBilling;
      if (!pending) throw new OnboardingServiceError('prerequisite', 'Select the Test Plan before adding payment.');
      if (input.paymentMethodToken === 'pm_test_declined') {
        pending.paymentStatus = 'declined';
        pending.errorCode = 'card_declined';
      } else if (input.paymentMethodToken === 'pm_test_failure') {
        pending.paymentStatus = 'failed';
        pending.errorCode = 'processing_failed';
      } else {
        pending.paymentStatus = 'accepted';
        pending.providerReference = this.store.createId('pi_test');
        pending.acceptedAt = this.store.nowIso();
        pending.errorCode = null;
        if (!session.completedSteps.includes('payment')) session.completedSteps.push('payment');
        session.currentStep = 'organisation';
      }
      return touchSession(this.store, session);
    });

    if (result.pendingBilling?.paymentStatus === 'declined') {
      throw new OnboardingServiceError('payment_declined', 'The test card was declined. Check the details and retry.');
    }
    if (result.pendingBilling?.paymentStatus === 'failed') {
      throw new OnboardingServiceError('processing_failed', 'The test payment could not be processed. Please retry.');
    }
    return result;
  }
}
