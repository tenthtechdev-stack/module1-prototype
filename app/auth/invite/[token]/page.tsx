import { InviteAcceptanceRouteExperience } from '@/src/features/auth/auth-routes';

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteAcceptanceRouteExperience token={token} />;
}
