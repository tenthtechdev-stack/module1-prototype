'use client';

import { AlertTriangle, CheckCircle2, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import type { DashboardHealth } from '@/src/domain/analytics';
import { formatMoney, formatPercentage } from '@/src/domain/calculations';
import { useAccess } from '@/src/components/rbac/access';

export function DashboardHealthBanner({ health, orgSlug }: { health: DashboardHealth; orgSlug: string }) {
  const cogsAccess = useAccess('cogs.view');
  const syncAccess = useAccess('sync.view');
  const Icon = health.state === 'healthy' ? CheckCircle2 : health.state === 'syncing' ? LoaderCircle : AlertTriangle;
  return <section className={`dashboard-health ${health.state}`} role={health.state === 'critical' ? 'alert' : 'status'}>
    <Icon size={18} className={health.state === 'syncing' ? 'spin' : undefined} aria-hidden="true" />
    <div className="dashboard-health-copy"><strong>{health.title}</strong><p>{health.description}</p></div>
    <div className="health-measures" aria-label="Data completeness">
      <span><small>Revenue data</small><b>{formatPercentage(health.revenueCompletenessBps)}</b></span>
      <span><small>COGS coverage</small><b>{formatPercentage(health.cogsCoverageBps)}</b></span>
      <span><small>Marketplace sync</small><b>{formatPercentage(health.syncCompletenessBps)}</b></span>
    </div>
    {health.state !== 'healthy' ? <div className="health-actions">
      {health.missingCogsProducts && cogsAccess.allowed ? <Link href={`/o/${orgSlug}/cogs?status=missing`}>Review missing COGS</Link> : null}
      {syncAccess.allowed ? <Link href={`/o/${orgSlug}/operations/sync-health`}>View Sync Health</Link> : null}
    </div> : null}
    {health.affectedRevenueMinor > 0 ? <span className="sr-only">Missing COGS affects {formatMoney(health.affectedRevenueMinor)} of revenue.</span> : null}
  </section>;
}
