import type { DashboardAttentionItem } from '@/src/domain/analytics';
import type { MarketplaceAccount, SyncStatus } from '@/src/domain/models';

export type AttentionArea = 'financial' | 'sync' | 'setup';
export type AttentionPriority = 'critical' | 'high' | 'medium' | 'low';

export interface AttentionIssue {
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

export interface VisibleAttentionInput {
  financialAttention: DashboardAttentionItem[];
  financialCompany: string;
  missingCogsProducts: number;
  visibleAccounts: MarketplaceAccount[];
  authorisedAccountCount: number;
  accountMode: 'normal' | 'none';
  orgSlug: string;
  canViewCogs: boolean;
  canViewExpenses: boolean;
  canManageMarketplace: boolean;
  companyNameFor: (companyId: string) => string;
}

const PRIORITY_ORDER: Record<AttentionPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function firstCount(value: string) {
  return value.match(/[\d,]+/)?.[0] ?? null;
}

function financialIssue(item: DashboardAttentionItem, company: string, missingCogsProducts: number): AttentionIssue | null {
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

function syncIssue(account: MarketplaceAccount, company: string, orgSlug: string, canManageMarketplace: boolean): AttentionIssue | null {
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
  const issues: Partial<Record<SyncStatus, Omit<AttentionIssue, keyof typeof base>>> = {
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
  return issue ? { ...base, ...issue } as AttentionIssue : null;
}

/** The single issue projection used by both the workspace and navigation badge. */
export function selectVisibleAttentionIssues(input: VisibleAttentionInput): AttentionIssue[] {
  const financial = input.financialAttention
    .map((item) => financialIssue(item, input.financialCompany, input.missingCogsProducts))
    .filter((item): item is AttentionIssue => Boolean(item))
    .filter((item) => item.id === 'unallocated-expenses' ? input.canViewExpenses : input.canViewCogs);
  const sync = (input.accountMode === 'none' ? [] : input.visibleAccounts)
    .map((account) => syncIssue(account, input.companyNameFor(account.companyId), input.orgSlug, input.canManageMarketplace))
    .filter((item): item is AttentionIssue => Boolean(item));
  const setup: AttentionIssue[] = input.accountMode === 'none' || !input.authorisedAccountCount
    ? [{
        id: 'marketplace-setup',
        priority: 'high',
        title: 'Marketplace setup incomplete',
        detail: input.accountMode === 'none'
          ? 'No marketplace account is connected in this prototype scenario.'
          : 'There are no marketplace accounts in your current assignment.',
        area: 'setup',
        company: 'Organisation-wide',
        account: '—',
        affected: 'Amazon, eBay and Temu',
        status: 'Setup required',
        actionLabel: input.canManageMarketplace ? 'Open Marketplace Accounts' : 'Open Sync Health',
        href: input.canManageMarketplace
          ? `/o/${input.orgSlug}/admin/marketplace-accounts`
          : `/o/${input.orgSlug}/operations/sync-health`,
      }]
    : [];
  return [...financial, ...sync, ...setup].sort((left, right) => PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority]);
}
