'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, CircleDollarSign, Clock3, Gauge, ListFilter, ShieldAlert, TriangleAlert } from 'lucide-react';
import { AccessState } from '@/src/components/rbac/access';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Select } from '@/src/components/ui/forms';
import { Alert, Badge, type Tone } from '@/src/components/ui/feedback';
import type { AttentionArea, AttentionPriority } from '@/src/features/operations/attention-issues';
import { useVisibleAttentionIssues } from '@/src/features/operations/use-attention-issues';
import './operations.css';

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

export function TenantAttentionPage() {
  const [area, setArea] = useState<'all' | AttentionArea>('all');
  const [priority, setPriority] = useState<'all' | AttentionPriority>('all');
  const { issues: rows, query, queryEnabled, syncAccess, scopeDecision } = useVisibleAttentionIssues();
  const { workspace } = useAnalysisContext();

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
