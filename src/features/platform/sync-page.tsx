'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, Info, RefreshCw } from 'lucide-react';
import { MarketplaceBadge } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge } from '@/src/components/ui/feedback';
import { Select } from '@/src/components/ui/forms';
import { Drawer } from '@/src/components/ui/overlays';
import { usePlatform } from './platform-context';
import { OrganisationLink, PlatformEmpty, PlatformPage, PlatformPanel, StatusBadge, formatPlatformDate } from './platform-ui';
import type { PlatformOrganisation } from '@/src/services/mock/platform-data';
import './operations.css';

const STATUSES = ['Healthy', 'Syncing', 'Delayed', 'Failed', 'Authentication Required'];

function retryBlockReason(owner: PlatformOrganisation | undefined) {
  if (!owner) return 'Organisation unavailable.';
  if (owner.status === 'Suspended') return 'Reactivate the organisation before retrying.';
  if (owner.status === 'Setup Incomplete') return 'Complete organisation setup before retrying.';
  if (!['active', 'trialing'].includes(owner.subscription.status)) return 'Activate the Test Plan before retrying.';
  if (!owner.modules.includes('marketplace-profitability')) return 'Enable Module 01 before retrying.';
  return '';
}
export function PlatformSyncPage() {
  const { organisations, jobs, retryJob } = usePlatform();
  const searchParams = useSearchParams();
  const [organisation, setOrganisation] = useState(searchParams.get('organisation') ?? 'all');
  const [marketplace, setMarketplace] = useState('all');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const filtered = jobs.filter(job => (organisation === 'all' || job.organisationId === organisation)
    && (marketplace === 'all' || job.marketplace === marketplace)
    && (status === 'all' || job.status === status));
  const selected = jobs.find(job => job.id === selectedId);
  const selectedOrganisation = organisations.find(item => item.id === selected?.organisationId);
  const attentionCount = jobs.filter(job => ['Delayed', 'Failed', 'Authentication Required'].includes(job.status)).length;
  const hasFilters = organisation !== 'all' || marketplace !== 'all' || status !== 'all';

  function clearFilters() { setOrganisation('all'); setMarketplace('all'); setStatus('all'); }

  return <PlatformPage title="Sync Health" description="Monitor marketplace imports across Organisations, Companies and accounts." actions={<Badge tone="info">Mock sync activity</Badge>}>
    <div className="platform-stat-grid">
      <article className="platform-stat"><small>Healthy accounts</small><strong>{jobs.filter(job => job.status === 'Healthy').length}</strong><span>Latest imports completed</span></article>
      <article className="platform-stat"><small>Need attention</small><strong>{attentionCount}</strong><span>Delayed, failed or authentication required</span></article>
      <article className="platform-stat"><small>Syncing</small><strong>{jobs.filter(job => job.status === 'Syncing').length}</strong><span>Imports currently in progress</span></article>
      <article className="platform-stat"><small>Accounts monitored</small><strong>{jobs.length}</strong><span>Across {new Set(jobs.map(job => job.organisationId)).size} Organisations</span></article>
    </div>

    <PlatformPanel title="Marketplace jobs" description="Each account belongs to a Company within its Organisation." actions={<Badge>{filtered.length} of {jobs.length} jobs</Badge>}>
      <div className="platform-filters">
        <Select aria-label="Filter sync jobs by Organisation" value={organisation} onChange={event => setOrganisation(event.target.value)}><option value="all">All Organisations</option>{organisations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
        <Select aria-label="Filter sync jobs by marketplace" value={marketplace} onChange={event => setMarketplace(event.target.value)}><option value="all">All marketplaces</option><option value="amazon">Amazon</option><option value="ebay">eBay</option><option value="temu">Temu</option></Select>
        <Select aria-label="Filter sync jobs by status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{STATUSES.map(item => <option key={item} value={item}>{item}</option>)}</Select>
        {hasFilters ? <Button variant="ghost" size="compact" onClick={clearFilters}>Clear filters</Button> : null}
      </div>
      {filtered.length ? <div className="platform-table-wrap"><table className="platform-table platform-operation-table"><thead><tr><th>Organisation / Company</th><th>Account / Marketplace</th><th>Status</th><th>Sync activity</th><th>Issue</th><th>Actions</th></tr></thead><tbody>{filtered.map(job => {
        const owner = organisations.find(item => item.id === job.organisationId);
        const company = owner?.companies.find(item => item.id === job.companyId);
        return <tr key={job.id}>
          <td data-label="Organisation / Company"><div className="platform-operation-identity">{owner ? <OrganisationLink organisation={owner} /> : <strong>Unknown Organisation</strong>}<small>{company?.name ?? 'Company unavailable'}</small></div></td>
          <td data-label="Account / Marketplace"><div className="platform-operation-identity"><button type="button" className="platform-operation-action" onClick={() => setSelectedId(job.id)}>{job.accountName}</button><MarketplaceBadge marketplace={job.marketplace} /></div></td>
          <td data-label="Status"><StatusBadge status={job.status} /></td>
          <td data-label="Sync activity"><div className="platform-operation-times"><span><small>Last successful sync</small>{formatPlatformDate(job.lastSuccess)}</span><span><small>Last attempt</small>{formatPlatformDate(job.lastAttempt)}</span></div></td>
          <td data-label="Issue"><div className="platform-operation-issue">{job.issue || (job.status === 'Syncing' ? 'Import is in progress.' : 'No issues detected.')}</div></td>
          <td data-label="Actions"><div className="platform-row-actions"><Button size="compact" onClick={() => setSelectedId(job.id)} aria-label={`View sync details for ${job.accountName}`}>View details</Button>{['Failed', 'Delayed'].includes(job.status) ? <Button size="compact" variant="ghost" onClick={() => retryJob(job.id)} disabled={Boolean(retryBlockReason(owner))} title={retryBlockReason(owner)} aria-label={`Retry sync for ${job.accountName}`}><RefreshCw size={13} /> Retry</Button> : job.status === 'Syncing' ? <span className="platform-muted">In progress</span> : null}</div></td>
        </tr>;
      })}</tbody></table></div> : <PlatformEmpty title="No jobs match these filters" description="Choose another Organisation, marketplace or status to see its sync activity." />}
      <div className="platform-operation-caption"><Info size={14} /><span>Retry simulates a new import and records a Platform Audit event. Authentication issues require the Organisation to reconnect its account.</span></div>
    </PlatformPanel>

    <Drawer open={Boolean(selected)} onOpenChange={open => { if (!open) setSelectedId(null); }} title={selected?.accountName ?? 'Sync details'} description="Marketplace import status and recent attempts in this prototype.">
      {selected ? <div className="platform-operation-drawer">
        <div className="platform-row-actions"><MarketplaceBadge marketplace={selected.marketplace} /><StatusBadge status={selected.status} /></div>
        <Alert tone={selected.status === 'Failed' || selected.status === 'Authentication Required' ? 'negative' : selected.status === 'Delayed' ? 'warning' : selected.status === 'Healthy' ? 'positive' : 'info'} title={selected.status === 'Authentication Required' ? 'Account reconnection required' : selected.status === 'Failed' ? 'Latest import failed' : selected.status === 'Delayed' ? 'Import is delayed' : selected.status === 'Healthy' ? 'This account is up to date' : 'Import in progress'}>{selected.issue || (selected.status === 'Syncing' ? 'The simulated import is running. Its status will update here.' : 'The latest import completed successfully.')}</Alert>
        <dl className="platform-detail-list">
          <div><dt>Organisation</dt><dd>{selectedOrganisation ? <OrganisationLink organisation={selectedOrganisation} /> : 'Unavailable'}</dd></div>
          <div><dt>Company</dt><dd>{selectedOrganisation?.companies.find(item => item.id === selected.companyId)?.name ?? 'Unavailable'}</dd></div>
          <div><dt>Marketplace Account</dt><dd>{selected.accountName}</dd></div>
          <div><dt>Job</dt><dd>{selected.id}</dd></div>
          <div><dt>Status</dt><dd><StatusBadge status={selected.status} /></dd></div>
          <div><dt>Last successful sync</dt><dd>{formatPlatformDate(selected.lastSuccess)}</dd></div>
          <div><dt>Last attempt</dt><dd>{formatPlatformDate(selected.lastAttempt)}</dd></div>
          <div><dt>Latest error</dt><dd>{selected.issue || 'No current error'}</dd></div>
        </dl>
        <section><h3>Recent attempts</h3><ol className="platform-operation-attempts">{[...selected.attempts].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map((attempt, index) => <li key={`${attempt.at}-${index}`}><div><StatusBadge status={attempt.status} /><time dateTime={attempt.at}>{formatPlatformDate(attempt.at)}</time></div><p>{attempt.detail}</p></li>)}</ol></section>
        {selected.status === 'Authentication Required' ? <p className="platform-note">The Organisation Admin needs to reconnect this marketplace account in its workspace. Retrying cannot restore expired authorisation.</p> : null}
        {retryBlockReason(selectedOrganisation) ? <p className="platform-note">{retryBlockReason(selectedOrganisation)}</p> : null}<div className="platform-operation-drawer-actions"><Button variant="primary" disabled={!['Failed', 'Delayed'].includes(selected.status) || Boolean(retryBlockReason(selectedOrganisation))} loading={selected.status === 'Syncing'} onClick={() => retryJob(selected.id)}>{selected.status === 'Syncing' ? 'Sync in progress' : selected.status === 'Healthy' ? 'No retry needed' : <><RefreshCw size={14} /> Retry sync</>}</Button>{selectedOrganisation ? <Link className="platform-text-link" href={`/platform/organisations/${selectedOrganisation.id}`}>Open Organisation <ArrowUpRight size={14} /></Link> : null}</div>
        <p className="platform-muted">Simulated job history · no marketplace API or live queue</p>
      </div> : null}
    </Drawer>
  </PlatformPage>;
}
