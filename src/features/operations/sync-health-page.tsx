'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, Clock3, Info, RefreshCw, ShieldCheck, Store, TriangleAlert } from 'lucide-react';
import type { Marketplace, MarketplaceAccount, SyncStatus } from '@/src/domain/models';
import { formatDate } from '@/src/domain/calculations';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { MarketplaceBadge, PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Select } from '@/src/components/ui/forms';
import { Alert, Badge, useToast, type Tone } from '@/src/components/ui/feedback';
import { Drawer } from '@/src/components/ui/overlays';
import './operations.css';

type TenantSyncStatus = SyncStatus | 'paused';

interface SyncOverride {
  status: TenantSyncStatus;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string;
}

interface SyncRow {
  account: MarketplaceAccount;
  status: TenantSyncStatus;
  company: string;
  connection: 'Connected' | 'Authentication required' | 'Disconnected';
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  issue: string;
}

const STATUS_LABELS: Record<TenantSyncStatus, string> = {
  connected: 'Pending',
  synced: 'Healthy',
  syncing: 'Syncing',
  pending: 'Pending',
  delayed: 'Delayed',
  failed: 'Failed',
  retrying: 'Syncing',
  disconnected: 'Paused',
  authentication_required: 'Authentication Required',
  paused: 'Paused',
};

const STATUS_TONES: Record<TenantSyncStatus, Tone> = {
  connected: 'neutral',
  synced: 'positive',
  syncing: 'info',
  pending: 'neutral',
  delayed: 'warning',
  failed: 'negative',
  retrying: 'info',
  disconnected: 'neutral',
  authentication_required: 'negative',
  paused: 'neutral',
};

const STATUS_ISSUES: Record<TenantSyncStatus, string> = {
  connected: 'Connected and waiting for the first import.',
  synced: 'No issues detected.',
  syncing: 'Marketplace activity is currently importing.',
  pending: 'The account is waiting for its next import.',
  delayed: 'The marketplace response is taking longer than expected.',
  failed: 'The latest marketplace import could not complete.',
  retrying: 'A mock retry is currently in progress.',
  disconnected: 'Imports are paused because this account is disconnected.',
  authentication_required: 'Marketplace authorisation has expired. Reconnect to resume imports.',
  paused: 'Imports are paused. Previously imported data remains available.',
};

const STATUS_ORDER: Record<TenantSyncStatus, number> = {
  authentication_required: 0,
  failed: 1,
  delayed: 2,
  disconnected: 3,
  paused: 3,
  syncing: 4,
  retrying: 4,
  connected: 5,
  pending: 5,
  synced: 6,
};

function addMinutes(value: string | null, minutes: number) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

function lastAttempt(account: MarketplaceAccount, status: TenantSyncStatus) {
  if (status === 'synced') return account.lastSuccessfulSyncAt;
  const offset = status === 'delayed' ? 126 : status === 'authentication_required' ? 54 : status === 'failed' ? 38 : 12;
  return addMinutes(account.lastSuccessfulSyncAt, offset);
}

function displayTime(value: string | null) {
  return value ? `${formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC` : 'Not yet';
}

function connectionFor(status: TenantSyncStatus): SyncRow['connection'] {
  if (status === 'authentication_required') return 'Authentication required';
  if (status === 'disconnected') return 'Disconnected';
  return 'Connected';
}

function connectionTone(connection: SyncRow['connection']): Tone {
  return connection === 'Connected' ? 'positive' : connection === 'Authentication required' ? 'negative' : 'neutral';
}

function attemptStatus(status: TenantSyncStatus) {
  if (status === 'synced') return 'Succeeded';
  if (status === 'syncing' || status === 'retrying') return 'Running';
  if (status === 'delayed') return 'Delayed';
  if (status === 'failed' || status === 'authentication_required') return 'Failed';
  return 'Paused';
}

export function TenantSyncHealthPage() {
  const syncAccess = useAccess('sync.view');
  const retryAccess = useAccess('sync.retry');
  const marketplaceManagement = useAccess('marketplaces.manage');
  const { showToast } = useToast();
  const { workspace, context, scopeDecision, authorisedAccounts, availableAccounts, authorisedCompanies, setCompany, setMarketplace, companyNameFor } = useAnalysisContext();
  const { runtime } = usePrototype();
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, SyncOverride>>({});

  const scopedAccounts = useMemo(() => runtime.accountMode === 'none' ? [] : availableAccounts, [availableAccounts, runtime.accountMode]);
  const rows = useMemo<SyncRow[]>(() => scopedAccounts.map((account) => {
    const override = overrides[account.id];
    const status = override?.status ?? account.status;
    return {
      account,
      status,
      company: companyNameFor(account.companyId),
      connection: connectionFor(status),
      lastSuccessfulSyncAt: override?.lastSuccessfulSyncAt ?? account.lastSuccessfulSyncAt,
      lastAttemptAt: override?.lastAttemptAt ?? lastAttempt(account, status),
      issue: STATUS_ISSUES[status],
    };
  }).sort((left, right) => STATUS_ORDER[left.status] - STATUS_ORDER[right.status] || left.account.displayName.localeCompare(right.account.displayName)), [companyNameFor, overrides, scopedAccounts]);

  const filtered = rows.filter((row) => statusFilter === 'all' || STATUS_LABELS[row.status] === statusFilter);
  const allAuthorisedRows = useMemo<SyncRow[]>(() => (runtime.accountMode === 'none' ? [] : authorisedAccounts).map((account) => {
    const override = overrides[account.id];
    const status = override?.status ?? account.status;
    return { account, status, company: companyNameFor(account.companyId), connection: connectionFor(status), lastSuccessfulSyncAt: override?.lastSuccessfulSyncAt ?? account.lastSuccessfulSyncAt, lastAttemptAt: override?.lastAttemptAt ?? lastAttempt(account, status), issue: STATUS_ISSUES[status] };
  }), [authorisedAccounts, companyNameFor, overrides, runtime.accountMode]);
  const selected = allAuthorisedRows.find((row) => row.account.id === selectedId);
  const healthyCount = rows.filter((row) => row.status === 'synced').length;
  const syncingCount = rows.filter((row) => row.status === 'syncing' || row.status === 'retrying').length;
  const attentionCount = rows.filter((row) => ['delayed', 'failed', 'authentication_required'].includes(row.status)).length;
  const allHealthy = rows.length > 0 && rows.every((row) => row.status === 'synced');
  const hasFilters = context.companyId !== 'all' || context.marketplace !== 'all' || statusFilter !== 'all';

  function retry(row: SyncRow) {
    const startedAt = new Date().toISOString();
    setOverrides((current) => ({ ...current, [row.account.id]: { status: 'retrying', lastSuccessfulSyncAt: row.lastSuccessfulSyncAt, lastAttemptAt: startedAt } }));
    showToast(`Mock retry started for ${row.account.displayName}`, 'info');
    window.setTimeout(() => {
      const completedAt = new Date().toISOString();
      setOverrides((current) => ({ ...current, [row.account.id]: { status: 'synced', lastSuccessfulSyncAt: completedAt, lastAttemptAt: completedAt } }));
      showToast(`${row.account.displayName} is up to date`);
    }, 1200);
  }

  function clearFilters() {
    setCompany('all');
    setMarketplace('all');
    setStatusFilter('all');
  }

  if (!syncAccess.allowed) return <AccessState decision={syncAccess} />;
  if (!scopeDecision.allowed) return <AccessState decision={scopeDecision} />;

  return <div className="operations-page sync-health-workspace">
    <Breadcrumbs items={[{ label: workspace.organisation.name, href: `/o/${workspace.organisation.slug}/dashboard` }, { label: 'Operations' }, { label: 'Sync Health' }]} />
    <PageHeader eyebrow="Operational health" title="Sync Health" description="Marketplace connection, import and freshness status for accounts in your current tenant assignment." actions={<Badge tone="info">Mock sync activity</Badge>} />

    <section className="operations-summary-grid" aria-label="Sync health summary">
      <article><span className="operations-stat-icon positive"><CheckCircle2 size={17} /></span><div><small>Healthy</small><strong>{healthyCount}</strong><span>Latest import completed</span></div></article>
      <article><span className="operations-stat-icon negative"><TriangleAlert size={17} /></span><div><small>Need attention</small><strong>{attentionCount}</strong><span>Delayed, failed or reconnect</span></div></article>
      <article><span className="operations-stat-icon info"><RefreshCw size={17} /></span><div><small>Syncing</small><strong>{syncingCount}</strong><span>Imports currently in progress</span></div></article>
      <article><span className="operations-stat-icon neutral"><Store size={17} /></span><div><small>Accounts monitored</small><strong>{rows.length}</strong><span>Within the selected scope</span></div></article>
    </section>

    {allHealthy ? <Alert tone="positive" title="All visible marketplace accounts are healthy">The latest imports completed successfully and no connection action is required.</Alert> : null}

    <section className="operations-panel" aria-labelledby="tenant-sync-table-title">
      <header className="operations-panel-header"><div><h2 id="tenant-sync-table-title">Tenant marketplace accounts</h2><p>Only accounts allowed by your Company and Marketplace Account assignment are shown.</p></div><Badge>{filtered.length} of {rows.length} accounts</Badge></header>
      <div className="operations-filter-bar sync-health-filters">
        <label><span>Company</span><Select aria-label="Filter sync health by Company" value={context.companyId} onChange={(event) => setCompany(event.target.value)}><option value="all">All assigned Companies</option>{authorisedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select></label>
        <label><span>Marketplace</span><Select aria-label="Filter sync health by marketplace" value={context.marketplace} onChange={(event) => setMarketplace(event.target.value as Marketplace | 'all')}><option value="all">All marketplaces</option><option value="amazon">Amazon</option><option value="ebay">eBay</option><option value="temu">Temu</option></Select></label>
        <label><span>Sync status</span><Select aria-label="Filter sync health by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option>Healthy</option><option>Syncing</option><option>Delayed</option><option>Failed</option><option>Authentication Required</option><option>Paused</option><option>Pending</option></Select></label>
        {hasFilters ? <Button variant="ghost" size="compact" onClick={clearFilters}>Clear filters</Button> : null}
      </div>

      {filtered.length ? <div className="operations-table-wrap"><table className="operations-table sync-health-table"><thead><tr><th>Marketplace</th><th>Marketplace Account</th><th>Company</th><th>Connection status</th><th>Sync status</th><th>Last successful sync</th><th>Last attempt</th><th>Issue</th><th>Action</th></tr></thead><tbody>{filtered.map((row) => <tr key={row.account.id}>
        <td data-label="Marketplace"><MarketplaceBadge marketplace={row.account.marketplace} /></td>
        <td data-label="Marketplace Account" className="operations-account-cell"><button type="button" onClick={() => setSelectedId(row.account.id)}>{row.account.displayName}</button></td>
        <td data-label="Company">{row.company}</td>
        <td data-label="Connection status"><Badge tone={connectionTone(row.connection)}>{row.connection}</Badge></td>
        <td data-label="Sync status"><Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge></td>
        <td data-label="Last successful sync"><time dateTime={row.lastSuccessfulSyncAt ?? undefined}>{displayTime(row.lastSuccessfulSyncAt)}</time></td>
        <td data-label="Last attempt"><time dateTime={row.lastAttemptAt ?? undefined}>{displayTime(row.lastAttemptAt)}</time></td>
        <td data-label="Issue" className="operations-sync-issue">{row.issue}</td>
        <td data-label="Action" className="operations-action-cell"><div className="operations-row-actions"><Button size="compact" variant="ghost" onClick={() => setSelectedId(row.account.id)}>View details</Button>{retryAccess.allowed && ['failed', 'delayed'].includes(row.status) ? <Button size="compact" onClick={() => retry(row)}><RefreshCw size={13} /> Retry</Button> : ['authentication_required', 'disconnected'].includes(row.status) && marketplaceManagement.allowed ? <Link className="ui-button secondary compact" href={`/o/${workspace.organisation.slug}/admin/marketplace-accounts?marketplace=${row.account.marketplace}&company=${row.account.companyId}`}>Reconnect</Link> : null}</div></td>
      </tr>)}</tbody></table></div> : rows.length ? <div className="operations-filter-empty"><Info size={22} /><h3>No accounts match these filters</h3><p>Choose another Company, marketplace or sync status.</p><Button size="compact" onClick={clearFilters}>Clear filters</Button></div> : <div className="operations-empty-state" role="status"><span><Store size={24} /></span><h3>{workspace.marketplaceAccounts.length && !authorisedAccounts.length ? 'No marketplace accounts are in your assignment' : 'No marketplace accounts are connected'}</h3><p>{workspace.marketplaceAccounts.length && !authorisedAccounts.length ? 'Your role does not include any Marketplace Account assignments in this Organisation.' : 'Connect Amazon, eBay or Temu to begin importing marketplace activity.'}</p>{marketplaceManagement.allowed ? <Link className="ui-button primary compact" href={`/o/${workspace.organisation.slug}/admin/marketplace-accounts?connect=1`}>Open Marketplace Accounts</Link> : null}</div>}
      <footer className="operations-panel-note"><ShieldCheck size={14} /><span>Retries and recent attempts are local prototype interactions. No marketplace API or background queue is called.</span></footer>
    </section>

    <Drawer open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected?.account.displayName ?? 'Sync details'} description="Connection status, freshness and recent mocked attempts for this marketplace account.">
      {selected ? <div className="operations-drawer">
        <div className="operations-drawer-badges"><MarketplaceBadge marketplace={selected.account.marketplace} /><Badge tone={connectionTone(selected.connection)}>{selected.connection}</Badge><Badge tone={STATUS_TONES[selected.status]}>{STATUS_LABELS[selected.status]}</Badge></div>
        <Alert tone={selected.status === 'synced' ? 'positive' : selected.status === 'delayed' ? 'warning' : ['failed', 'authentication_required'].includes(selected.status) ? 'negative' : 'info'} title={selected.status === 'synced' ? 'This account is up to date' : STATUS_LABELS[selected.status]}>{selected.issue}</Alert>
        <dl className="operations-detail-list">
          <div><dt>Company</dt><dd>{selected.company}</dd></div>
          <div><dt>Marketplace</dt><dd><MarketplaceBadge marketplace={selected.account.marketplace} /></dd></div>
          <div><dt>Marketplace Account</dt><dd>{selected.account.displayName}</dd></div>
          <div><dt>Connection status</dt><dd>{selected.connection}</dd></div>
          <div><dt>Sync status</dt><dd>{STATUS_LABELS[selected.status]}</dd></div>
          <div><dt>Last successful sync</dt><dd>{displayTime(selected.lastSuccessfulSyncAt)}</dd></div>
          <div><dt>Last attempt</dt><dd>{displayTime(selected.lastAttemptAt)}</dd></div>
          <div><dt>Latest issue</dt><dd>{selected.issue}</dd></div>
        </dl>
        <section className="operations-attempt-section"><h3>Recent mocked attempts</h3><ol className="operations-attempts"><li><span className={`operations-attempt-dot ${selected.status}`} /><div><header><strong>{attemptStatus(selected.status)}</strong><time dateTime={selected.lastAttemptAt ?? undefined}>{displayTime(selected.lastAttemptAt)}</time></header><p>{selected.issue}</p></div></li>{selected.lastSuccessfulSyncAt ? <><li><span className="operations-attempt-dot synced" /><div><header><strong>Succeeded</strong><time dateTime={selected.lastSuccessfulSyncAt}>{displayTime(selected.lastSuccessfulSyncAt)}</time></header><p>Products, orders, transactions, fees and refunds were imported.</p></div></li><li><span className="operations-attempt-dot synced" /><div><header><strong>Succeeded</strong><time>{displayTime(addMinutes(selected.lastSuccessfulSyncAt, -1440))}</time></header><p>Scheduled incremental marketplace import completed.</p></div></li></> : null}</ol></section>
        <div className="operations-drawer-actions">{retryAccess.allowed && ['failed', 'delayed'].includes(selected.status) ? <Button variant="primary" onClick={() => retry(selected)}><RefreshCw size={14} /> Retry mock sync</Button> : null}{['authentication_required', 'disconnected'].includes(selected.status) && marketplaceManagement.allowed ? <Link className="ui-button primary" href={`/o/${workspace.organisation.slug}/admin/marketplace-accounts?marketplace=${selected.account.marketplace}&company=${selected.account.companyId}`}>Reconnect <ArrowUpRight size={14} /></Link> : null}{marketplaceManagement.allowed ? <Link className="operations-action-link" href={`/o/${workspace.organisation.slug}/admin/marketplace-accounts?marketplace=${selected.account.marketplace}&company=${selected.account.companyId}`}>Open Marketplace Account <ArrowUpRight size={13} /></Link> : null}</div>
        {!marketplaceManagement.allowed && ['authentication_required', 'disconnected'].includes(selected.status) ? <p className="operations-permission-note">Ask an Organisation Admin to reconnect this marketplace account.</p> : null}
        <p className="operations-prototype-note"><Clock3 size={13} /> Prototype history only · no live marketplace job queue</p>
      </div> : null}
    </Drawer>
  </div>;
}
