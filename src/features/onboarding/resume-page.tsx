'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { OnboardingStep } from '@/src/domain/onboarding';
import { useOnboarding } from '@/src/components/providers/onboarding-provider';
import { Skeleton } from '@/src/components/ui/feedback';

const STEP_ROUTES: Record<OnboardingStep, string> = {
  account: '/auth/register',
  subscription: '/onboarding/subscription',
  payment: '/onboarding/payment',
  organisation: '/onboarding/organisation',
  companies: '/onboarding/companies',
  marketplaces: '/onboarding/marketplaces',
  sync: '/onboarding/sync',
  cogs: '/onboarding/cogs',
  users: '/onboarding/users',
  complete: '/onboarding/complete',
};

export function OnboardingResumePage() {
  const router = useRouter();
  const { resume } = useOnboarding();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void resume().then((snapshot) => {
      router.replace(snapshot ? STEP_ROUTES[snapshot.session.currentStep] : '/auth/register');
    });
  }, [resume, router]);

  return <section className="onboarding-step-card onboarding-resume-page" aria-live="polite" aria-busy="true"><p className="eyebrow">Resuming setup</p><h1>Loading saved progress</h1><p>We are returning you to the next safe onboarding step.</p><Skeleton className="onboarding-panel-skeleton" /></section>;
}
