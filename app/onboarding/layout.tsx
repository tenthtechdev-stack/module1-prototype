import { OnboardingShell } from '@/src/features/onboarding/onboarding-shell';
import type { Metadata } from 'next';
import './onboarding.css';
import './steps.css';
import './advanced-steps.css';
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <OnboardingShell>{children}</OnboardingShell>;
}
