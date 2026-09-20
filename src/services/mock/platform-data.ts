import type { Company, Marketplace, MarketplaceAccount, ModuleEntitlementKey, SyncStatus, User } from '@/src/domain/models';
import { workspaceFixtures } from '@/src/fixtures/data';

export const PLATFORM_REFERENCE_TIME = '2026-09-19T10:00:00Z';

export interface PlatformOrganisation {
  id: string;
  slug: string;
  name: string;
  status: 'Active' | 'Trial / Test Plan' | 'Suspended' | 'Setup Incomplete';
  subscription: {
    status: 'active' | 'trialing' | 'suspended' | 'cancelled';
    planName: string;
    startsAt: string;
    reviewAt: string;
  };
  modules: ModuleEntitlementKey[];
  companies: Company[];
  accounts: MarketplaceAccount[];
  users: User[];
  lastActivity: string;
}

export interface PlatformJob {
  id: string;
  organisationId: string;
  companyId: string;
  accountId: string;
  marketplace: Marketplace;
  accountName: string;
  status: 'Healthy' | 'Syncing' | 'Delayed' | 'Failed' | 'Authentication Required';
  lastSuccess: string | null;
  lastAttempt: string;
  issue: string;
  attempts: { at: string; status: string; detail: string }[];
}

export interface PlatformAuditEvent {
  id: string;
  at: string;
  actor: string;
  action: string;
  organisationId: string;
  area: string;
  details: string;
}

export interface PlatformUsage {
  id: string;
  organisationId: string;
  feature: string;
  context: string;
  requests: number;
  at: string;
}

export const PLATFORM_MODULES: { key: ModuleEntitlementKey; name: string; number: string; available: boolean }[] = [
  { key: 'marketplace-profitability', name: 'Marketplace Profitability & Analytics', number: '01', available: true },
  { key: 'products-inventory', name: 'Products & Inventory', number: '02', available: false },
  { key: 'purchasing-suppliers', name: 'Purchasing & Suppliers', number: '03', available: false },
  { key: 'sales-customers', name: 'Sales & Customers', number: '04', available: false },
  { key: 'warehouse', name: 'Warehouse', number: '05', available: false },
  { key: 'fulfilment', name: 'Fulfilment', number: '06', available: false },
  { key: 'finance', name: 'Finance', number: '07', available: false },
  { key: 'communications', name: 'Communications', number: '08', available: false },
  { key: 'platform-completion', name: 'Platform Completion', number: '09', available: false },
];

type JobSnapshot = Pick<PlatformJob, 'status' | 'lastSuccess' | 'lastAttempt' | 'issue'>;

// Platform-only snapshots retain the existing tenant hierarchy and identifiers.
const jobSnapshots: Record<string, JobSnapshot> = {
  'acct-stock-amazon': { status: 'Healthy', lastSuccess: '2026-09-19T09:52:00Z', lastAttempt: '2026-09-19T09:52:00Z', issue: 'Latest incremental sync completed successfully.' },
  'acct-stock-ebay': { status: 'Syncing', lastSuccess: '2026-09-19T09:25:00Z', lastAttempt: '2026-09-19T09:58:00Z', issue: 'Incremental orders sync is in progress.' },
  'acct-stock-temu': { status: 'Healthy', lastSuccess: '2026-09-19T09:46:00Z', lastAttempt: '2026-09-19T09:46:00Z', issue: 'Latest incremental sync completed successfully.' },
  'acct-proserve-amazon': { status: 'Healthy', lastSuccess: '2026-09-19T09:50:00Z', lastAttempt: '2026-09-19T09:50:00Z', issue: 'Latest incremental sync completed successfully.' },
  'acct-proserve-temu': { status: 'Delayed', lastSuccess: '2026-09-19T06:15:00Z', lastAttempt: '2026-09-19T09:35:00Z', issue: 'Marketplace rate limit reached. The account is awaiting another attempt.' },
  'acct-northbridge-amazon': { status: 'Failed', lastSuccess: '2026-09-18T22:15:00Z', lastAttempt: '2026-09-19T09:32:00Z', issue: 'The marketplace report timed out before download completed.' },
  'acct-harbour-amazon': { status: 'Delayed', lastSuccess: '2026-09-17T15:40:00Z', lastAttempt: '2026-09-17T16:00:00Z', issue: 'Sync is paused while the Organisation is suspended.' },
  'acct-harbour-ebay': { status: 'Authentication Required', lastSuccess: '2026-09-16T14:25:00Z', lastAttempt: '2026-09-17T15:50:00Z', issue: 'Marketplace authorisation expired. Resume the Organisation and reconnect this account in its workspace.' },
  'acct-brightforge-amazon': { status: 'Authentication Required', lastSuccess: null, lastAttempt: '2026-09-19T08:45:00Z', issue: 'The initial marketplace authorisation has not been completed.' },
  'acct-brightforge-temu': { status: 'Delayed', lastSuccess: null, lastAttempt: '2026-09-19T08:40:00Z', issue: 'Initial import is waiting for setup completion and Module 01 access.' },
};

const accountStatuses: Record<PlatformJob['status'], SyncStatus> = {
  Healthy: 'synced', Syncing: 'syncing', Delayed: 'delayed', Failed: 'failed', 'Authentication Required': 'authentication_required',
};

const organisationSnapshots: Record<string, Pick<PlatformOrganisation, 'status' | 'subscription' | 'modules' | 'lastActivity'>> = {
  'org-stock-supplies': {
    status: 'Active',
    subscription: { status: 'active', planName: 'Test Plan', startsAt: '2026-08-20T09:00:00Z', reviewAt: '2026-09-27' },
    modules: ['marketplace-profitability'],
    lastActivity: '2026-09-19T09:58:00Z',
  },
  'org-harbour-homewares': {
    status: 'Suspended',
    subscription: { status: 'suspended', planName: 'Test Plan', startsAt: '2026-08-25T10:00:00Z', reviewAt: '2026-10-04' },
    modules: ['marketplace-profitability'],
    lastActivity: '2026-09-17T16:00:00Z',
  },
  'org-brightforge-tools': {
    status: 'Setup Incomplete',
    subscription: { status: 'trialing', planName: 'Test Plan', startsAt: '2026-09-15T10:00:00Z', reviewAt: '2026-09-30' },
    modules: [],
    lastActivity: '2026-09-19T08:45:00Z',
  },
};

export const initialOrganisations: PlatformOrganisation[] = workspaceFixtures.map((workspace) => {
  const snapshot = organisationSnapshots[workspace.organisation.id];
  return {
    id: workspace.organisation.id,
    slug: workspace.organisation.slug,
    name: workspace.organisation.name,
    ...snapshot,
    subscription: { ...snapshot.subscription },
    modules: [...snapshot.modules],
    companies: workspace.companies.map((company) => ({ ...company })),
    accounts: workspace.marketplaceAccounts.map((account) => ({
      ...account,
      status: accountStatuses[jobSnapshots[account.id].status],
      lastSuccessfulSyncAt: jobSnapshots[account.id].lastSuccess,
    })),
    users: workspace.users.map((user) => ({
      ...user,
      companyIds: user.companyIds === 'all' ? 'all' : [...user.companyIds],
      marketplaceAccountIds: user.marketplaceAccountIds === 'all' ? 'all' : [...user.marketplaceAccountIds],
    })),
  };
});

export const initialJobs: PlatformJob[] = initialOrganisations.flatMap((organisation) => organisation.accounts.map((account) => {
  const snapshot = jobSnapshots[account.id];
  const previousSuccess = snapshot.lastSuccess && snapshot.lastSuccess !== snapshot.lastAttempt
    ? [{ at: snapshot.lastSuccess, status: 'Succeeded', detail: 'Previous marketplace sync completed successfully.' }]
    : [];
  return {
    id: `job-${account.id}`,
    organisationId: organisation.id,
    companyId: account.companyId,
    accountId: account.id,
    marketplace: account.marketplace,
    accountName: account.displayName,
    ...snapshot,
    attempts: [
      { at: snapshot.lastAttempt, status: snapshot.status === 'Healthy' ? 'Succeeded' : snapshot.status, detail: snapshot.issue },
      ...previousSuccess,
    ],
  };
}));

export const initialAudit: PlatformAuditEvent[] = [
  { id: 'platform-audit-09', at: '2026-09-19T09:40:00Z', actor: 'Alex Morgan', action: 'Platform Admin opened Organisation', organisationId: 'org-stock-supplies', area: 'Workspace access', details: 'Opened the Stock Supplies workspace in clearly labelled Platform Admin support context.' },
  { id: 'platform-audit-08', at: '2026-09-19T09:32:00Z', actor: 'Alex Morgan', action: 'Sync retry triggered', organisationId: 'org-stock-supplies', area: 'Sync Health', details: 'Requested a mock retry for Northbridge Amazon UK. The marketplace report timed out again.' },
  { id: 'platform-audit-07', at: '2026-09-19T08:30:00Z', actor: 'Alex Morgan', action: 'Entitlement changed', organisationId: 'org-brightforge-tools', area: 'Modules', details: 'Kept Module 01 disabled pending completion of setup. Test Plan remains trialing; customer roles are unchanged.' },
  { id: 'platform-audit-06', at: '2026-09-18T11:00:00Z', actor: 'Alex Morgan', action: 'Subscription activated', organisationId: 'org-stock-supplies', area: 'Subscriptions', details: 'Confirmed the Test Plan as active following a platform review. No payment was collected.' },
  { id: 'platform-audit-05', at: '2026-09-17T16:00:00Z', actor: 'Alex Morgan', action: 'Organisation suspended', organisationId: 'org-harbour-homewares', area: 'Organisations', details: 'Suspended the Organisation and its Test Plan during a customer-requested pause. Module 01 entitlement is retained.' },
  { id: 'platform-audit-04', at: '2026-09-15T10:00:00Z', actor: 'Alex Morgan', action: 'Organisation created', organisationId: 'org-brightforge-tools', area: 'Organisations', details: 'Added Brightforge Tools Ltd to the illustrative platform directory. Setup and marketplace authorisation remain incomplete.' },
  { id: 'platform-audit-03', at: '2026-08-25T10:10:00Z', actor: 'Alex Morgan', action: 'Module enabled', organisationId: 'org-harbour-homewares', area: 'Modules', details: 'Enabled Marketplace Profitability & Analytics for the Test Plan. Customer RBAC remains managed within the Organisation.' },
  { id: 'platform-audit-02', at: '2026-08-20T09:10:00Z', actor: 'Alex Morgan', action: 'Module enabled', organisationId: 'org-stock-supplies', area: 'Modules', details: 'Enabled Module 01 across the Organisation’s three Companies.' },
  { id: 'platform-audit-01', at: '2026-08-20T09:00:00Z', actor: 'Alex Morgan', action: 'Organisation created', organisationId: 'org-stock-supplies', area: 'Organisations', details: 'Added Stock Supplies Group with its existing Companies, marketplace accounts and workspace users.' },
];

// Illustrative request counts only; no provider billing, tokens or cost estimates.
export const initialUsage: PlatformUsage[] = [
  { id: 'usage-09', organisationId: 'org-stock-supplies', feature: 'Dashboard', context: 'Profitability summary', requests: 18, at: '2026-09-19T09:35:00Z' },
  { id: 'usage-08', organisationId: 'org-stock-supplies', feature: 'COGS', context: 'Import mapping assistance', requests: 11, at: '2026-09-18T14:20:00Z' },
  { id: 'usage-07', organisationId: 'org-stock-supplies', feature: 'Products', context: 'Product performance explanation', requests: 24, at: '2026-09-17T11:40:00Z' },
  { id: 'usage-06', organisationId: 'org-harbour-homewares', feature: 'Reports', context: 'Report summary before suspension', requests: 9, at: '2026-09-17T10:15:00Z' },
  { id: 'usage-05', organisationId: 'org-harbour-homewares', feature: 'Expenses', context: 'Expense allocation explanation', requests: 6, at: '2026-09-14T15:10:00Z' },
  { id: 'usage-04', organisationId: 'org-stock-supplies', feature: 'Transactions', context: 'Transaction profit explanation', requests: 31, at: '2026-09-10T13:45:00Z' },
  { id: 'usage-03', organisationId: 'org-harbour-homewares', feature: 'Dashboard', context: 'Marketplace performance summary', requests: 17, at: '2026-09-05T09:20:00Z' },
  { id: 'usage-02', organisationId: 'org-stock-supplies', feature: 'Reports', context: 'Monthly performance summary', requests: 22, at: '2026-08-29T10:30:00Z' },
  { id: 'usage-01', organisationId: 'org-stock-supplies', feature: 'Dashboard', context: 'Initial profitability review', requests: 8, at: '2026-08-20T14:00:00Z' },
];
