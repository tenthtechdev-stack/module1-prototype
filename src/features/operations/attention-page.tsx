'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleDollarSign, Clock3, Gauge, ListFilter, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { DashboardAttentionItem } from '@/src/domain/analytics';
import type { MarketplaceAccount, SyncStatus } from '@/src/domain/models';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Select } from '@/src/components/ui/forms';
import { Alert, Badge, type Tone } from '@/src/components/ui/feedback';
import { useDashboardAnalytics } from '@/src/services/hooks/use-dashboard-analytics';
import './operations.css';

type AttentionArea = 'financial' | 'sync' | 'setup';
type AttentionPriority = 'critical' | 'high' | 'medium' | 'low';

interface AttentionRow {
  id: string;
  priority: AttentionPriority;
  title: string;
  detail: string;
  area: AttentionArea;
  company: string;
  account: string;
  affected: string;
  status: string;
  actionLabel: string;
  href: string;
}

const AREA_LABELS: Record<AttentionArea, string> = {
  financial: 'Financial',
  sync: 'Marketplace / Sync',
  setup: 'Access / Setup',
};

const PRIORITY_TONES: Record<AttentionPriority, Tone> = {
  critical: 'negative',
  high: 'negative',
  medium: 'warning',
  low: 'info',
};

const PRIORITY_ORDER: Record<AttentionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function firstCount(value: string) {
  return value.match(/[\d,]+/)?.[0] ?? null;
}

function financialRow(item: DashboardAttentionItem, company: string, missingCogsProducts: number): AttentionRow | null {
  const count = firstCount(item.title);
  if (item.id === 'missing-cogs') return {
    id: item.id,
    priority: 'high',
    title: 'Products missing COGS',
    detail: item.detail,
    area: 'financial',
    company,
    account: '—',
    affected: `${missingCogsProducts || count || 'Some'} products`,
    status: 'Review required',
    actionLabel: 'Review missing COGS',
    href: item.href,
  };
  if (item.id === 'cogs-approval') return {
    id: item.id,
    priority: 'high',
    title: 'COGS import awaiting approval',
    detail: item.detail,
    area: 'financial',
    company: 'Organisation-wide',
    account: '—',
    affected: count ? `${count} changes` : '1 import batch',
    status: 'Approval needed',
    actionLabel: 'Review import',
    href: item.href,
  };
  if (item.id === 'import-errors') return {
    id: item.id,
    priority: item.severity === 'high' ? 'high' : 'medium',
    title: 'COGS import needs review',
    detail: item.detail,
    area: 'financial',
    company: 'Organisation-wide',
    account: '—',
    affected: count ? `${count} import rows` : 'Import rows',
    status: 'Blocked',
    actionLabel: 'Review import',
    href: item.href,
  };
  if (item.id === 'unallocated-expenses') return {
    id: item.id,
    priority: 'medium',
    title: 'Expenses need review',
    detail: item.detail,
    area: 'financial',
    company,
    account: '—',
    affected: 'Unallocated expenses',
    status: 'Review required',
    actionLabel: 'Review expenses',
    href: item.href,
  };
  return null;
}

function syncRow(account: MarketplaceAccount, company: string, orgSlug: string, canManageMarketplace: boolean): AttentionRow | null {
  const openMarketplace = ['authentication_required', 'disconnected'].includes(account.status) && canManageMarketplace;
  const base = {
    id: `sync-${account.id}`,
    company,
    account: account.displayName,
    affected: 'Marketplace imports',
    href: openMarketplace
      ? `/o/${orgSlug}/admin/marketplace-accounts?marketplace=${account.marketplace}&company=${account.companyId}`
      : `/o/${orgSlug}/operations/sync-health?marketplace=${account.marketplace}`,
    actionLabel: openMarketplace ? 'Open Marketplace Account' : 'Open Sync Health',
  };
  const issues: Partial<Record<SyncStatus, Omit<AttentionRow, keyof typeof base>>> = {
    syncing: { priority: 'low', title: 'Marketplace import in progress', detail: 'Historical marketplace activity is still importing. Available records remain usable.', area: 'setup', status: 'In progress' },
    pending: { priority: 'medium', title: 'Marketplace sync has not started', detail: 'The account is connected and waiting for its first import.', area: 'setup', status: 'Waiting' },
    connected: { priority: 'low', title: 'Initial marketplace sync pending', detail: 'The connection is ready, but the first import has not completed.', area: 'setup', status: 'Connected' },
    retrying: { priority: 'low', title: 'Marketplace sync retrying', detail: 'A retry is in progress. Previously imported marketplace data remains available.', area: 'sync', status: 'Retrying' },
    delayed: { priority: 'medium', title: 'Marketplace sync delayed', detail: 'The latest marketplace response is taking longer than expected.', area: 'sync', status: 'Delayed' },
    failed: { priority: 'critical', title: 'Marketplace sync failed', detail: 'The latest import could not complete. Previously imported data remains available.', area: 'sync', status: 'Action required' },
    authentication_required: { priority: 'critical', title: 'Marketplace authentication required', detail: 'The marketplace authorisation has expired and imports are paused until reconnection.', area: 'sync', status: 'Reconnect' },
    disconnected: { priority: 'high', title: 'Marketplace account disconnected', detail: 'No new marketplace activity can be imported for this account.', area: 'setup', status: 'Disconnected' },
  };
  const issue = issues[account.status];
  return issue ? { ...base, ...issue } as AttentionRow : null;
}

export function TenantAttentionPage() {
  const [area, setArea] = useState<'all' | AttentionArea>('all');
  const [priority, setPriority] = useState<'all' | AttentionPriority>('all');
  const syncAccess = useAccess('sync.view');
  const cogsAccess = useAccess('cogs.view');
  const expensesAccess = useAccess('expenses.view');
  const marketplaceManagement = useAccess('marketplaces.manage');
  const { workspace, context, scopeDecision, authorisedCompanies, authorisedAccounts, availableAccounts, companyNameFor } = useAnalysisContext();
  const { runtime } = usePrototype();
  const { access: analyticsAccess, query, marketplaceState } = useDashboardAnalytics({ enabled: syncAccess.allowed });

  const financialCompany = context.companyId === 'all'
    ? `${authorisedCompanies.length.toLocaleString('en-GB')} assigned ${authorisedCompanies.length === 1 ? 'Company' : 'Companies'}`
    : companyNameFor(context.companyId);
  const queryEnabled = syncAccess.allowed && analyticsAccess.allowed && marketplaceState === 'available';

  const rows = useMemo(() => {
    const financial = (query.data?.attention ?? [])
      .map((item) => financialRow(item, financialCompany, query.data?.health.missingCogsProducts ?? 0))
      .filter((item): item is AttentionRow => Boolean(item))
      .filter((item) => item.id === 'unallocated-expenses' ? expensesAccess.allowed : cogsAccess.allowed);
    const sync = (runtime.accountMode === 'none' ? [] : availableAccounts)
      .map((account) => syncRow(account, companyNameFor(account.companyId), workspace.organisation.slug, marketplaceManagement.allowed))
      .filter((item): item is AttentionRow => Boolean(item));
    const setup: AttentionRow[] = runtime.accountMode === 'none' || !authorisedAccounts.length
      ? [{
          id: 'marketplace-setup',
          priority: 'high',
          title: 'Marketplace setup incomplete',
          detail: runtime.accountMode === 'none'
            ? 'No marketplace account is connected in this prototype scenario.'
            : 'There are no marketplace accounts in your current assignment.',
          area: 'setup',
          company: 'Organisation-wide',
          account: '—',
          affected: 'Amazon, eBay and Temu',
          status: 'Setup required',
          actionLabel: marketplaceManagement.allowed ? 'Open Marketplace Accounts' : 'Open Sync Health',
          href: marketplaceManagement.allowed
            ? `/o/${workspace.organisation.slug}/admin/marketplace-accounts`
            : `/o/${workspace.organisation.slug}/operations/sync-health`,
        }]
      : [];
    return [...financial, ...sync, ...setup].sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]);
  }, [authorisedAccounts.length, availableAccounts, cogsAccess.allowed, companyNameFor, expensesAccess.allowed, financialCompany, marketplaceManagement.allowed, query.data, runtime.accountMode, workspace.organisation.slug]);

  const filtered = rows.filter((item) => (area === 'all' || item.area === area) && (priority === 'all' || item.priority === priority));
  const areaCount = (target: AttentionArea) => rows.filter((item) => item.area === target).length;
  const highCount = rows.filter((item) => item.priority === 'critical' || item.priority === 'high').length;
  const hasFilters = area !== 'all' || priority !== 'all';

  if (!syncAccess.allowed) return <AccessState decision={syncAccess} />;
  if (!scopeDecision.allowed) return <AccessState decision={scopeDecision} />;

  return <div className="operations-page attention-workspace">
    <Breadcrumbs items={[{ label: workspace.organisation.name, href: `/o/${workspace.organisation.slug}/dashboard` }, { label: 'Operations' }, { label: 'Needs Attention' }]} />
    <PageHeader eyebrow="Operational health" title="Needs Attention" description="Prioritised data gaps, approvals and marketplace issues across your authorised Organisation scope." actions={<Link className="ui-button secondary" href={`/o/${workspace.organisation.slug}/operations/sync-health`}>Sync Health <ArrowRight size={14} /></Link>} />

    <section className="operations-summary-grid" aria-label="Attention summary">
      <article><span className="operations-stat-icon negative"><TriangleAlert size={17} /></span><div><small>Open issues</small><strong>{rows.length}</strong><span>In the selected scope</span></div></article>
      <article><span className="operations-stat-icon warning"><ShieldAlert size={17} /></span><div><small>High priority</small><strong>{highCount}</strong><span>Critical or high priority</span></div></article>
      <article><span className="operations-stat-icon info"><CircleDollarSign size={17} /></span><div><small>Financial</small><strong>{areaCount('financial')}</strong><span>COGS, imports or expenses</span></div></article>
      <article><span className="operations-stat-icon neutral"><Gauge size={17} /></span><div><small>Marketplace & setup</small><strong>{areaCount('sync') + areaCount('setup')}</strong><span>Connections and import health</span></div></article>
    </section>

    {queryEnabled && query.isError ? <Alert tone="negative" title="Financial attention checks could not be loaded">Marketplace and setup issues remain visible. Retry the existing analytics request from the Dashboard.</Alert> : null}
    {queryEnabled && query.isPending ? <div className="operations-loading" role="status"><Clock3 size={15} /> Checking financial approvals and data gaps…</div> : null}

    <section className="operations-panel" aria-labelledby="attention-queue-title">
      <header className="operations-panel-header"><div><h2 id="attention-queue-title">Organisation attention queue</h2><p>Each action opens an existing workspace; this page does not create a separate workflow.</p></div><Badge tone={rows.length ? 'warning' : 'positive'}>{rows.length ? `${rows.length} open` : 'All clear'}</Badge></header>
      <div className="operations-filter-bar">
        <div className="operations-area-filter" role="group" aria-label="Filter attention by area">
          {([
            ['all', 'All', rows.length],
            ['financial', 'Financial', areaCount('financial')],
            ['sync', 'Marketplace / Sync', areaCount('sync')],
            ['setup', 'Access / Setup', areaCount('setup')],
          ] as const).map(([value, label, count]) => <button type="button" key={value} aria-pressed={area === value} onClick={() => setArea(value)}>{label}<span>{count}</span></button>)}
        </div>
        <label className="operations-priority-filter"><span><ListFilter size={13} /> Priority</span><Select aria-label="Filter attention by priority" value={priority} onChange={(event) => setPriority(event.target.value as typeof priority)}><option value="all">All priorities</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></Select></label>
        {hasFilters ? <Button variant="ghost" size="compact" onClick={() => { setArea('all'); setPriority('all'); }}>Clear filters</Button> : null}
      </div>

      {filtered.length ? <div className="operations-table-wrap"><table className="operations-table attention-table"><thead><tr><th>Priority</th><th>Issue</th><th>Area</th><th>Company</th><th>Marketplace / Account</th><th>Affected records</th><th>Status</th><th>Action</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}>
        <td data-label="Priority"><Badge tone={PRIORITY_TONES[item.priority]}>{item.priority}</Badge></td>
        <td data-label="Issue" className="operations-issue-cell"><strong>{item.title}</strong><small>{item.detail}</small></td>
        <td data-label="Area"><span className="operations-area-label">{AREA_LABELS[item.area]}</span></td>
        <td data-label="Company">{item.company}</td>
        <td data-label="Marketplace / Account">{item.account}</td>
        <td data-label="Affected records">{item.affected}</td>
        <td data-label="Status"><span className="operations-status-copy">{item.status}</span></td>
        <td data-label="Action" className="operations-action-cell"><Link className="operations-action-link" href={item.href}>{item.actionLabel}<ArrowRight size={13} /></Link></td>
      </tr>)}</tbody></table></div> : rows.length ? <div className="operations-filter-empty"><ListFilter size={22} /><h3>No issues match these filters</h3><p>Choose another area or priority to review the remaining queue.</p><Button size="compact" onClick={() => { setArea('all'); setPriority('all'); }}>Clear filters</Button></div> : (!queryEnabled || (!query.isPending && !query.isError)) ? <div className="operations-healthy-state" role="status"><span><CheckCircle2 size={24} /></span><h3>No operational issues need attention</h3><p>COGS coverage, approvals and visible marketplace accounts are healthy in the current scope.</p><Link className="ui-button secondary compact" href={`/o/${workspace.organisation.slug}/dashboard`}>Return to Dashboard</Link></div> : null}
    </section>
  </div>;
}
