import { CompleteStep } from '@/src/features/onboarding/users-complete-steps';
import { SetupGuard } from '@/src/features/onboarding/basic-steps';

export default function Page() { return <SetupGuard requires={['account', 'subscription', 'payment', 'organisation', 'companies', 'marketplaces', 'sync', 'cogs', 'users']}><CompleteStep /></SetupGuard>; }
