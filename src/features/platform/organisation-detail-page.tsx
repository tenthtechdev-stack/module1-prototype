'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, Building2, Layers3, ShieldCheck, Store, Users } from 'lucide-react';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge } from '@/src/components/ui/feedback';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { ConfirmationDialog, Tabs } from '@/src/components/ui/overlays';
import { ROLE_PRESETS } from '@/src/domain/permissions';
import { usePlatform } from './platform-context';
import { PLATFORM_MODULES, type PlatformOrganisation } from '@/src/services/mock/platform-data';
import { formatPlatformDate, PlatformEmpty, PlatformPage, PlatformPanel, StatusBadge } from './platform-ui';
import { organisationSyncState } from './organisations-page';
import './organisations.css';

const marketplaceNames = { amazon: 'Amazon', ebay: 'eBay', temu: 'Temu' };

function LifecycleAction({ organisation }: { organisation: PlatformOrganisation }) {
  const { setOrganisationStatus } = usePlatform();
  const suspended = organisation.status === 'Suspended';
  const setup = organisation.status === 'Setup Incomplete';
  const action = suspended ? 'Reactivate organisation' : setup ? 'Activate organisation' : 'Suspend organisation';
  return <ConfirmationDialog
    title={`${action}?`}
    description={suspended || setup
      ? `Make ${organisation.name} active in the prototype. Its subscription and module settings will stay separately managed. This action is recorded in Platform Audit.`
      : `Mark ordinary tenant access as suspended for ${organisation.name} in the prototype. Its data, subscription and module settings are retained, and Platform Admin support preview stays available. This action is recorded in Platform Audit.`}
    trigger={<Button variant={suspended || setup ? 'secondary' : 'danger'}>{action}</Button>}
    confirmLabel={action}
    confirmVariant={suspended || setup ? 'primary' : 'danger'}
    onConfirm={() => setOrganisationStatus(organisation.id, suspended || setup ? 'Active' : 'Suspended')}
  />;
}

export function OrganisationDetailPage({ organisationId }: { organisationId: string }) {
  const { organisations, jobs, audit, openWorkspace } = usePlatform();
  const organisation = organisations.find(item => item.id === organisationId);

  if (!organisation) return <PlatformPage title="Organisation not found" description="This organisation is not available in the platform prototype." actions={<Link className="ui-button secondary default" href="/platform/organisations">Back to organisations</Link>}><PlatformEmpty title="Choose an available organisation" description="Return to the directory to open one of the existing customer workspaces." /></PlatformPage>;

  const organisationJobs = jobs.filter(job => job.organisationId === organisation.id);
  const organisationAudit = audit.filter(event => event.organisationId === organisation.id);
  const issues = organisationJobs.filter(job => ['Failed', 'Authentication Required', 'Delayed'].includes(job.status));
  const enabledModules = PLATFORM_MODULES.filter(module => organisation.modules.includes(module.key));
  const companyName = (id: string) => organisation.companies.find(company => company.id === id)?.name ?? 'Company unavailable';
  const accountName = (id: string) => organisation.accounts.find(account => account.id === id)?.displayName ?? 'Account unavailable';
  const subscriptionUrl = `/platform/subscriptions?organisation=${organisation.id}`;
  const modulesUrl = `/platform/modules?organisation=${organisation.id}`;
  const syncUrl = `/platform/integrations?organisation=${organisation.id}`;
  const subscriptionAvailable = organisation.subscription.status === 'active' || organisation.subscription.status === 'trialing';
  const module01Enabled = organisation.modules.includes('marketplace-profitability');

  const overview = <div className="platform-organisation-tab-content">
    <div className="platform-stat-grid">
      <article className="platform-stat"><small>Companies</small><strong>{organisation.companies.length}</strong><span>Trading entities</span></article>
      <article className="platform-stat"><small>Marketplace accounts</small><strong>{organisation.accounts.length}</strong><span>{[...new Set(organisation.accounts.map(account => marketplaceNames[account.marketplace]))].join(', ') || 'None connected'}</span></article>
      <article className="platform-stat"><small>Users</small><strong>{organisation.users.length}</strong><span>Tenant team members</span></article>
      <article className="platform-stat"><small>Sync issues</small><strong>{issues.length}</strong><span>{issues.length ? 'Connections need attention' : 'No issues reported'}</span></article>
    </div>
    <div className="platform-two-col">
      <PlatformPanel title="Organisation overview" description="Platform-level customer context.">
        <div className="platform-panel-body"><dl className="platform-detail-list">
          <div><dt>Organisation</dt><dd>{organisation.name}</dd></div>
          <div><dt>Workspace</dt><dd>{organisation.slug}</dd></div>
          <div><dt>Organisation status</dt><dd><StatusBadge status={organisation.status} /></dd></div>
          <div><dt>Subscription</dt><dd>{organisation.subscription.planName} <StatusBadge status={organisation.subscription.status} /></dd></div>
          <div><dt>Enabled modules</dt><dd>{enabledModules.length ? enabledModules.map(module => `Module ${module.number}`).join(', ') : 'No modules enabled'}</dd></div>
          <div><dt>Last activity</dt><dd>{formatPlatformDate(organisation.lastActivity)}</dd></div>
          <div><dt>Sync health</dt><dd><StatusBadge status={organisationSyncState(organisationJobs)} /></dd></div>
        </dl></div>
      </PlatformPanel>
      <PlatformPanel title="Support & access" description="Review the tenant, then take a platform action.">
        <div className="platform-organisation-links">
          <Link href={subscriptionUrl}><ShieldCheck size={19} /><span><strong>Manage subscription</strong><small>Test Plan status and review date</small></span><ArrowRight size={15} /></Link>
          <Link href={modulesUrl}><Layers3 size={19} /><span><strong>Manage module access</strong><small>Entitlements for this organisation</small></span><ArrowRight size={15} /></Link>
          <Link href={syncUrl}><Store size={19} /><span><strong>Inspect sync health</strong><small>{issues.length ? `${issues.length} connection${issues.length === 1 ? '' : 's'} need attention` : 'Review account jobs and attempts'}</small></span><ArrowRight size={15} /></Link>
          <button type="button" onClick={() => openWorkspace(organisation.id)}><Building2 size={19} /><span><strong>View organisation workspace</strong><small>Open in Platform Admin support context</small></span><ArrowUpRight size={15} /></button>
        </div>
      </PlatformPanel>
    </div>
    <div className="platform-organisation-hierarchy"><div><Building2 size={19} /><small>Organisation</small><strong>{organisation.name}</strong></div><ArrowRight size={17} /><div><Building2 size={19} /><small>Companies</small><strong>{organisation.companies.length} trading entities</strong></div><ArrowRight size={17} /><div><Store size={19} /><small>Marketplace accounts</small><strong>{organisation.accounts.length} connections</strong></div></div>
  </div>;

  const companies = <PlatformPanel title="Companies" description="Trading entities owned by this organisation.">
    {organisation.companies.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Company</th><th>Marketplace accounts</th><th>Marketplaces</th><th>Assigned users</th></tr></thead><tbody>{organisation.companies.map(company => {
      const accounts = organisation.accounts.filter(account => account.companyId === company.id);
      const users = organisation.users.filter(user => user.companyIds === 'all' || user.companyIds.includes(company.id));
      return <tr key={company.id}><td data-label="Company"><strong>{company.name}</strong></td><td data-label="Marketplace accounts">{accounts.length}</td><td data-label="Marketplaces">{[...new Set(accounts.map(account => marketplaceNames[account.marketplace]))].join(', ') || 'None connected'}</td><td data-label="Assigned users">{users.length}</td></tr>;
    })}</tbody></table></div> : <PlatformEmpty title="No companies set up" description="This organisation has not added a trading company yet." />}
  </PlatformPanel>;

  const accounts = <PlatformPanel title="Marketplace accounts" description="Connections and their owning companies." actions={<Link className="platform-text-link" href={syncUrl}>Open sync health <ArrowRight size={13} /></Link>}>
    {organisation.accounts.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Account</th><th>Company</th><th>Marketplace</th><th>Sync status</th><th>Last successful sync</th></tr></thead><tbody>{organisation.accounts.map(account => {
      const job = organisationJobs.find(item => item.accountId === account.id);
      return <tr key={account.id}><td data-label="Account"><strong>{account.displayName}</strong></td><td data-label="Company">{companyName(account.companyId)}</td><td data-label="Marketplace">{marketplaceNames[account.marketplace]}</td><td data-label="Sync status"><StatusBadge status={job?.status ?? account.status.replaceAll('_', ' ')} /></td><td data-label="Last successful sync">{formatPlatformDate(job ? job.lastSuccess : account.lastSuccessfulSyncAt)}</td></tr>;
    })}</tbody></table></div> : <PlatformEmpty title="No marketplace accounts" description="No marketplace connection has been added to this organisation." />}
  </PlatformPanel>;

  const users = <PlatformPanel title="Users" description="Customer roles and assigned scope. Tenant permissions remain managed in the organisation workspace.">
    {organisation.users.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>User</th><th>Role</th><th>Company scope</th><th>Marketplace account scope</th></tr></thead><tbody>{organisation.users.map(user => <tr key={user.id}>
      <td data-label="User"><div className="platform-cell-stack"><strong>{user.name}</strong><small className="platform-muted">{user.email}</small><small className="platform-muted">{user.jobTitle}</small></div></td>
      <td data-label="Role">{ROLE_PRESETS.find(role => role.id === user.roleId)?.label ?? user.roleId}</td>
      <td data-label="Company scope">{user.companyIds === 'all' ? 'All companies' : user.companyIds.map(companyName).join(', ') || 'No companies assigned'}</td>
      <td data-label="Marketplace account scope">{user.marketplaceAccountIds === 'all' ? 'All accounts' : user.marketplaceAccountIds.map(accountName).join(', ') || 'No accounts assigned'}</td>
    </tr>)}</tbody></table></div> : <PlatformEmpty title="No users yet" description="This organisation has not added team members." />}
  </PlatformPanel>;

  const subscription = <div className="platform-organisation-tab-content">
    <div className="platform-two-col">
      <PlatformPanel title="Subscription" description="Organisation-level Test Plan state." actions={<Link className="platform-text-link" href={subscriptionUrl}>Manage subscription <ArrowRight size={13} /></Link>}><div className="platform-panel-body"><dl className="platform-detail-list"><div><dt>Plan</dt><dd>{organisation.subscription.planName}</dd></div><div><dt>Status</dt><dd><StatusBadge status={organisation.subscription.status} /></dd></div><div><dt>Start date</dt><dd>{formatPlatformDate(organisation.subscription.startsAt)}</dd></div><div><dt>Test Plan review</dt><dd>{formatPlatformDate(organisation.subscription.reviewAt)}</dd></div><div><dt>Module 01 access</dt><dd><Badge tone={organisation.status !== 'Suspended' && organisation.status !== 'Setup Incomplete' && subscriptionAvailable && module01Enabled ? 'positive' : 'warning'}>{organisation.status === 'Suspended' ? 'Organisation suspended' : organisation.status === 'Setup Incomplete' ? 'Setup incomplete' : !subscriptionAvailable ? 'Subscription inactive' : module01Enabled ? 'Available' : 'Module not enabled'}</Badge></dd></div></dl></div></PlatformPanel>
      <PlatformPanel title="How access is determined" description="Three separate controls work together."><div className="platform-panel-body platform-access-explanation"><div><ShieldCheck size={18} /><span><strong>Subscription</strong><small>Whether the organisation has an active plan.</small></span></div><div><Layers3 size={18} /><span><strong>Module entitlement</strong><small>Which business modules the organisation can use.</small></span></div><div><Users size={18} /><span><strong>Customer role & scope</strong><small>What each user can do and which company data they can see.</small></span></div></div></PlatformPanel>
    </div>
    <PlatformPanel title="Module entitlements" description="Module 01 is currently available. Future modules remain visible for planning." actions={<Link className="ui-button secondary compact" href={modulesUrl}>Manage module access</Link>}><div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Module</th><th>Availability</th><th>Entitlement</th></tr></thead><tbody>{PLATFORM_MODULES.map(module => <tr key={module.key}><td data-label="Module"><div className="platform-cell-stack"><small className="platform-muted">Module {module.number}</small><strong>{module.name}</strong></div></td><td data-label="Availability"><Badge tone={module.available ? 'positive' : 'neutral'}>{module.available ? 'Available' : 'Future module'}</Badge></td><td data-label="Entitlement"><Badge tone={organisation.modules.includes(module.key) ? 'info' : 'neutral'}>{organisation.modules.includes(module.key) ? 'Enabled' : 'Not enabled'}</Badge></td></tr>)}</tbody></table></div></PlatformPanel>
  </div>;

  const sync = <PlatformPanel title="Sync health" description="Account jobs for this organisation. Retries and recent attempts are available in Sync Health." actions={<Link className="ui-button secondary compact" href={syncUrl}>Manage sync jobs <ArrowUpRight size={13} /></Link>}>
    {organisationJobs.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Account / Company</th><th>Status</th><th>Last successful sync</th><th>Last attempt</th><th>Issue</th></tr></thead><tbody>{organisationJobs.map(job => <tr key={job.id}><td data-label="Account / Company"><div className="platform-cell-stack"><strong>{job.accountName}</strong><small className="platform-muted">{companyName(job.companyId)}</small></div></td><td data-label="Status"><StatusBadge status={job.status} /></td><td data-label="Last successful sync">{formatPlatformDate(job.lastSuccess)}</td><td data-label="Last attempt">{formatPlatformDate(job.lastAttempt)}</td><td data-label="Issue">{job.issue || 'No issues reported'}</td></tr>)}</tbody></table></div> : <PlatformEmpty title="No sync jobs yet" description="Sync health will appear once this organisation connects a marketplace account." />}
  </PlatformPanel>;

  const activity = <PlatformPanel title="Platform activity" description="Recent platform actions for this organisation." actions={<Link className="platform-text-link" href={`/platform/audit?organisation=${organisation.id}`}>Open platform audit <ArrowRight size={13} /></Link>}>
    {organisationAudit.length ? <div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Timestamp</th><th>Platform Admin</th><th>Action</th><th>Area</th><th>Details</th></tr></thead><tbody>{organisationAudit.map(event => <tr key={event.id}><td data-label="Timestamp">{formatPlatformDate(event.at)}</td><td data-label="Platform Admin">{event.actor}</td><td data-label="Action"><strong>{event.action}</strong></td><td data-label="Area"><Badge>{event.area}</Badge></td><td data-label="Details">{event.details}</td></tr>)}</tbody></table></div> : <PlatformEmpty title="No platform activity yet" description="Platform changes and support workspace visits will appear here." />}
  </PlatformPanel>;

  return <PlatformPage title={organisation.name} description="Organisation detail · Platform Admin view" actions={<><LifecycleAction organisation={organisation} /><Button variant="primary" onClick={() => openWorkspace(organisation.id)}>View organisation workspace <ArrowUpRight size={15} /></Button></>}>
    <Breadcrumbs items={[{ label: 'Organisations', href: '/platform/organisations' }, { label: organisation.name }]} />
    <div className="platform-organisation-summary"><StatusBadge status={organisation.status} /><span>{organisation.subscription.planName}</span><span>{organisation.slug}</span><span>Last activity {formatPlatformDate(organisation.lastActivity)}</span></div>
    {organisation.status === 'Suspended' ? <Alert tone="warning" title="Organisation suspended">Ordinary tenant access is paused. Platform Admin can still inspect this organisation and open its support preview. Reactivation, subscription status and module entitlements are separate controls.</Alert> : null}
    {organisation.status === 'Setup Incomplete' ? <Alert tone="info" title="Organisation setup is incomplete">Review the subscription and module access, then activate the organisation when it is ready. Support preview is available to inspect its existing workspace.</Alert> : null}
    <div className="platform-organisation-tabs"><Tabs key={organisation.id} ariaLabel="Organisation detail sections" tabs={[{ id: 'overview', label: 'Overview', content: overview }, { id: 'companies', label: 'Companies', content: companies }, { id: 'accounts', label: 'Marketplace Accounts', content: accounts }, { id: 'users', label: 'Users', content: users }, { id: 'subscription', label: 'Subscription & Modules', content: subscription }, { id: 'sync', label: 'Sync Health', content: sync }, { id: 'activity', label: 'Activity', content: activity }]} /></div>
  </PlatformPage>;
}
