import { notFound } from 'next/navigation';
import { TenantShell } from '@/src/components/layout/tenant-shell';

export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  if (orgSlug !== 'stock-supplies') notFound();
  return <TenantShell orgSlug={orgSlug}>{children}</TenantShell>;
}
