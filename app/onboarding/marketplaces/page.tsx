import { MarketplacesStep } from '@/src/features/onboarding/marketplace-sync-steps';
import { SetupGuard } from '@/src/features/onboarding/basic-steps';

export default function Page() { return <SetupGuard requires={['account', 'subscription', 'payment', 'organisation', 'companies']}><MarketplacesStep /></SetupGuard>; }
