import { TenantShell } from '@/src/components/layout/tenant-shell';

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  return <TenantShell orgSlug={orgSlug}>{children}</TenantShell>;
}
