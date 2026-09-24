import type { OnboardingStep } from '@/src/domain/onboarding';
import { platformNavigation, tenantNavigation } from '@/src/config/navigation';

export interface PrototypeJourney {
  label: string;
  href: string;
  surface?: 'tenant' | 'platform';
  onboardingStep?: OnboardingStep;
}

export const PROTOTYPE_JOURNEYS: { label: string; items: PrototypeJourney[] }[] = [
  {
    label: 'Public Website',
    items: [
      { label: 'Home', href: '/' },
      { label: 'Marketplace Profitability', href: '/marketplace-profitability' },
      { label: 'COGS Management', href: '/cogs-management' },
      { label: 'Product Groups', href: '/product-groups' },
      { label: 'Copilot', href: '/copilot' },
      { label: 'Amazon', href: '/integrations/amazon' },
      { label: 'eBay', href: '/integrations/ebay' },
      { label: 'Temu', href: '/integrations/temu' },
      { label: 'Pricing / Access', href: '/pricing' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    label: 'Authentication',
    items: [
      { label: 'Sign In', href: '/auth/sign-in' },
      { label: 'Create Account', href: '/auth/register' },
      { label: 'Forgot Password', href: '/auth/forgot-password' },
      { label: 'Invitation', href: '/auth/invite/demo' },
    ],
  },
  {
    label: 'Onboarding',
    items: [
      { label: 'Start', href: '/onboarding', onboardingStep: 'account' },
      { label: 'Subscription', href: '/onboarding/subscription', onboardingStep: 'subscription' },
      { label: 'Payment', href: '/onboarding/payment', onboardingStep: 'payment' },
      { label: 'Organisation', href: '/onboarding/organisation', onboardingStep: 'organisation' },
      { label: 'Companies', href: '/onboarding/companies', onboardingStep: 'companies' },
      { label: 'Marketplaces', href: '/onboarding/marketplaces', onboardingStep: 'marketplaces' },
      { label: 'Initial Sync', href: '/onboarding/sync', onboardingStep: 'sync' },
      { label: 'COGS Setup', href: '/onboarding/cogs', onboardingStep: 'cogs' },
      { label: 'Invite Users', href: '/onboarding/users', onboardingStep: 'users' },
      { label: 'Complete', href: '/onboarding/complete', onboardingStep: 'complete' },
    ],
  },
  {
    label: 'Tenant Application',
    items: tenantNavigation[0].items.map(({ label, href }) => ({ label, href, surface: 'tenant' })),
  },
  {
    label: 'Tenant Administration',
    items: tenantNavigation[2].items.map(({ label, href }) => ({ label, href, surface: 'tenant' })),
  },
  {
    label: 'Platform Administration',
    items: platformNavigation[0].items.map(({ label, href }) => ({ label, href, surface: 'platform' })),
  },
];

export function journeyHref(journey: PrototypeJourney, organisationSlug: string) {
  return journey.surface === 'tenant' ? `/o/${organisationSlug}${journey.href}` : journey.href;
}

/** Detail identifiers belong to their original organisation; keep the surrounding list instead. */
export function equivalentWorkspacePath(pathname: string) {
  const path = pathname.replace(/^\/o\/[^/]+/, '');
  if (path.startsWith('/products/')) return '/products';
  if (path.startsWith('/transactions/')) return '/transactions';
  if (path.startsWith('/expenses/')) return '/expenses';
  if (path.startsWith('/cogs/import/')) return '/cogs/import';
  if (path.startsWith('/cogs/groups/')) return '/cogs/groups';
  return pathname.startsWith('/o/') && path ? path : '/dashboard';
}
