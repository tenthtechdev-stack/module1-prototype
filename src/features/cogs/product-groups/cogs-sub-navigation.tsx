import Link from 'next/link';
import { Badge } from '@/src/components/ui/feedback';

export type CogsSubNavigationView = 'current' | 'groups' | 'imports' | 'pending';

export function CogsSubNavigation({
  orgSlug,
  active,
  companyId = 'all',
  pendingCount,
}: {
  orgSlug: string;
  active: CogsSubNavigationView;
  companyId?: string;
  pendingCount?: number;
}) {
  const companyQuery = companyId !== 'all' ? `?company=${encodeURIComponent(companyId)}` : '';
  const importsQuery = companyId !== 'all'
    ? `?company=${encodeURIComponent(companyId)}&view=history`
    : '?view=history';
  const pendingQuery = companyId !== 'all'
    ? `?company=${encodeURIComponent(companyId)}&status=pending_approval`
    : '?status=pending_approval';

  return (
    <nav className="cogs-view-tabs" aria-label="COGS workspace views">
      <Link aria-current={active === 'current' ? 'page' : undefined} href={`/o/${orgSlug}/cogs${companyQuery}`}>Current Costs</Link>
      <Link aria-current={active === 'groups' ? 'page' : undefined} href={`/o/${orgSlug}/cogs/groups${companyQuery}`}>Product Groups</Link>
      <Link aria-current={active === 'imports' ? 'page' : undefined} href={`/o/${orgSlug}/cogs/import${importsQuery}`}>Imports</Link>
      <Link aria-current={active === 'pending' ? 'page' : undefined} href={`/o/${orgSlug}/cogs${pendingQuery}`}>Pending Approval {pendingCount ? <Badge tone="info">{pendingCount}</Badge> : null}</Link>
    </nav>
  );
}
