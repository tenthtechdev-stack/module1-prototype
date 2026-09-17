import { CogsStep } from '@/src/features/onboarding/cogs-step';
import { SetupGuard } from '@/src/features/onboarding/basic-steps';

export default function Page() { return <SetupGuard requires={['account', 'subscription', 'payment', 'organisation', 'companies', 'marketplaces', 'sync']}><CogsStep /></SetupGuard>; }
