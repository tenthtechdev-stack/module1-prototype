'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowUpRight, Building2 } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Badge } from '@/src/components/ui/feedback';
import { Field, SearchInput, Select } from '@/src/components/ui/forms';
import { usePlatform } from './platform-context';
import { PLATFORM_MODULES, type PlatformJob } from '@/src/services/mock/platform-data';
import { formatPlatformDate, OrganisationLink, PlatformEmpty, PlatformPage, PlatformPanel, StatusBadge } from './platform-ui';
import './organisations.css';

const statuses = ['Active', 'Trial / Test Plan', 'Suspended', 'Setup Incomplete'] as const;

export function organisationSyncState(jobs: PlatformJob[]) {
  if (!jobs.length) return 'No connections';
  return ['Authentication Required', 'Failed', 'Delayed', 'Syncing'].find(status => jobs.some(job => job.status === status)) ?? 'Healthy';
}

export function OrganisationsPage() {
  const params = useSearchParams();
  return <OrganisationDirectory key={params.toString()} initialSearch={params.get('q') ?? ''} initialStatus={params.get('status') ?? 'all'} />;
}
function OrganisationDirectory({ initialSearch, initialStatus }: { initialSearch: string; initialStatus: string }) {
  const { organisations, jobs, openWorkspace } = usePlatform();
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState(initialStatus);
  const [moduleKey, setModuleKey] = useState('all');
  const filtered = organisations.filter(organisation => {
    const matchesSearch = `${organisation.name} ${organisation.slug}`.toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (status === 'all' || organisation.status === status) && (moduleKey === 'all' || organisation.modules.some(key => key === moduleKey));
  });
  const hasFilters = search !== '' || status !== 'all' || moduleKey !== 'all';

  return <PlatformPage title="Organisations" description="Customer workspaces, access and operational health across the platform.">
    <div className="platform-stat-grid">
      <article className="platform-stat"><small>Organisations</small><strong>{organisations.length}</strong><span>Customer workspaces</span></article>
      <article className="platform-stat"><small>Active</small><strong>{organisations.filter(organisation => organisation.status === 'Active').length}</strong><span>Ready for their teams</span></article>
      <article className="platform-stat"><small>Trial / Test Plan</small><strong>{organisations.filter(organisation => organisation.subscription.status === 'trialing').length}</strong><span>Evaluating the platform</span></article>
      <article className="platform-stat"><small>Needs attention</small><strong>{organisations.filter(organisation => organisation.status === 'Suspended' || organisation.status === 'Setup Incomplete').length}</strong><span>Suspended or setup incomplete</span></article>
    </div>
    <PlatformPanel title="Organisation directory" description="Open a tenant to inspect its companies, marketplace accounts and people." actions={<Badge>{organisations.length} organisations</Badge>}>
      <div className="platform-filters platform-organisation-filters">
        <Field label="Search organisations"><SearchInput placeholder="Search name or workspace…" value={search} onChange={event => setSearch(event.target.value)} /></Field>
        <Field label="Status"><Select value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option>{statuses.map(value => <option key={value} value={value}>{value}</option>)}</Select></Field>
        <Field label="Enabled module"><Select value={moduleKey} onChange={event => setModuleKey(event.target.value)}><option value="all">All modules</option>{PLATFORM_MODULES.map(module => <option key={module.key} value={module.key}>{module.number} · {module.name}</option>)}</Select></Field>
        {hasFilters ? <Button size="compact" onClick={() => { setSearch(''); setStatus('all'); setModuleKey('all'); }}>Clear filters</Button> : null}
      </div>
      <p className="platform-organisation-result-count" role="status">Showing {filtered.length} of {organisations.length} organisations</p>
      {filtered.length ? <div className="platform-table-wrap"><table className="platform-table platform-organisations-table"><thead><tr><th>Organisation</th><th>Status</th><th>Subscription</th><th>Enabled modules</th><th>Companies</th><th>Accounts</th><th>Users</th><th>Last activity</th><th>Sync health</th><th>Actions</th></tr></thead><tbody>{filtered.map(organisation => {
        const organisationJobs = jobs.filter(job => job.organisationId === organisation.id);
        const enabledModules = PLATFORM_MODULES.filter(module => organisation.modules.includes(module.key));
        return <tr key={organisation.id}>
          <td data-label="Organisation"><div className="platform-organisation-name"><span className="platform-organisation-avatar"><Building2 size={17} /></span><div><OrganisationLink organisation={organisation} /><small>{organisation.slug}</small></div></div></td>
          <td data-label="Status"><StatusBadge status={organisation.status} /></td>
          <td data-label="Subscription"><div className="platform-cell-stack"><strong>{organisation.subscription.planName}</strong><StatusBadge status={organisation.subscription.status} /></div></td>
          <td data-label="Enabled modules"><div className="platform-organisation-modules">{enabledModules.length ? enabledModules.map(module => <span key={module.key} title={module.name}><Badge tone={module.available ? 'info' : 'neutral'}>Module {module.number}</Badge></span>) : <span className="platform-muted">Not enabled</span>}</div></td>
          <td data-label="Companies">{organisation.companies.length}</td>
          <td data-label="Accounts">{organisation.accounts.length}</td>
          <td data-label="Users">{organisation.users.length}</td>
          <td data-label="Last activity">{formatPlatformDate(organisation.lastActivity)}</td>
          <td data-label="Sync health"><StatusBadge status={organisationSyncState(organisationJobs)} /></td>
          <td data-label="Actions"><div className="platform-row-actions"><Link className="platform-text-link" href={`/platform/organisations/${organisation.id}`}>View details</Link><Button size="compact" variant="ghost" onClick={() => openWorkspace(organisation.id)} aria-label={`View ${organisation.name} workspace`}>Workspace <ArrowUpRight size={13} /></Button></div></td>
        </tr>;
      })}</tbody></table></div> : <PlatformEmpty title="No organisations found" description="Try another name, status or module, or clear your filters to see all organisations." />}
    </PlatformPanel>
    <p className="platform-note">Workspace opens a clearly marked Platform Admin support preview. Organisation lifecycle, subscriptions and module access are managed independently.</p>
  </PlatformPage>;
}
