import type { OnboardingCoordinator } from '@/src/services/onboarding-contracts';
import type { OnboardingStep } from '@/src/domain/onboarding';
import { MockOnboardingRepository } from '@/src/services/mock/onboarding-repository';

export class MockOnboardingCoordinator implements OnboardingCoordinator {
  constructor(private readonly sessions: MockOnboardingRepository) {}

  async resume(signal?: AbortSignal) {
    const session = await this.sessions.getActiveSession(signal);
    return session ? this.sessions.getSnapshot(session.id, 'healthy', signal) : null;
  }

  goForward(sessionId: string, step: OnboardingStep, signal?: AbortSignal) {
    return this.sessions.completeStep(sessionId, step, signal);
  }

  skip(sessionId: string, step: OnboardingStep, signal?: AbortSignal) {
    return this.sessions.skipStep(sessionId, step, signal);
  }

  finish(sessionId: string, signal?: AbortSignal) {
    return this.sessions.complete(sessionId, signal);
  }

  reset(signal?: AbortSignal) {
    return this.sessions.reset(signal);
  }
}
