import { PROTOTYPE_ENABLED_MODULES } from '@/src/domain/permissions';
import type { DataFreshness, ModuleEntitlementKey, SubscriptionStatus } from '@/src/domain/models';

export const SCENARIOS = [
  { id: 'healthy', label: 'Healthy Business', description: 'Complete data and fresh marketplace syncs' },
  { id: 'first-sync', label: 'First Marketplace Sync', description: 'A newly connected account is importing' },
  { id: 'no-marketplace', label: 'No Marketplace Connected', description: 'Exercises the connection empty state' },
  { id: 'cogs-none', label: 'COGS 0% Complete', description: 'Profitability is unavailable until costs are added' },
  { id: 'partial-cogs', label: 'Partial COGS Coverage', description: 'Some product costs need attention' },
  { id: 'amazon-delayed', label: 'Amazon Sync Delayed', description: 'Fees are stale by two hours' },
  { id: 'ebay-auth-failed', label: 'eBay Authentication Failed', description: 'Reconnect is required' },
  { id: 'temu-import-running', label: 'Temu Historical Import Running', description: 'Historical data import is in progress' },
  { id: 'past-due', label: 'Past Due Subscription', description: 'Tenant access is restricted to billing' },
  { id: 'module-unavailable', label: 'Module Entitlement Disabled', description: 'Marketplace Profitability & Analytics is unavailable for this organisation' },
  { id: 'cogs-awaiting-approval', label: 'COGS Copilot Awaiting Approval', description: 'A suggestion is ready for human review' },
  { id: 'import-errors', label: 'Import Contains Errors', description: 'Duplicate SKUs and invalid cost rows' },
  { id: 'no-results', label: 'No Results', description: 'Exercises a successful empty result' },
  { id: 'repository-error', label: 'Mock Service Error', description: 'Exercises retry and error handling' },
  { id: 'sensitive-expenses-restricted', label: 'Sensitive Expenses Restricted', description: 'Reports withhold allocated costs and profit to prevent inference of sensitive expenses' },
  { id: 'unallocated-expense', label: 'Unallocated Expense', description: 'An expense has no eligible same-day transaction basis' },
  { id: 'backdated-expense-change', label: 'Backdated Expense Change', description: 'Review effective-dated corrections and preserved audit evidence' },
  { id: 'scheduled-expense', label: 'Scheduled Expense', description: 'A future expense is configured without affecting earlier profitability' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

export interface ScenarioRuntime {
  subscriptionStatus: SubscriptionStatus;
  entitlements: ReadonlySet<ModuleEntitlementKey>;
  freshness: DataFreshness;
  accountMode: 'normal' | 'none';
  cogsMode: 'normal' | 'none' | 'partial';
  copilotMode: 'standard' | 'awaiting_approval';
  importMode: 'idle' | 'running' | 'errors';
  resultMode: 'normal' | 'empty' | 'error';
  notice: string;
}

export function getScenarioRuntime(scenarioId: ScenarioId): ScenarioRuntime {
  const entitlements = new Set<ModuleEntitlementKey>(PROTOTYPE_ENABLED_MODULES);
  if (scenarioId === 'module-unavailable') entitlements.delete('marketplace-profitability');

  const runtime: ScenarioRuntime = {
    subscriptionStatus: scenarioId === 'past-due' ? 'past_due' : 'active',
    entitlements,
    freshness: { state: 'fresh', label: 'Data up to date', detail: 'Updated 8 minutes ago' },
    accountMode: scenarioId === 'no-marketplace' ? 'none' : 'normal',
    cogsMode: scenarioId === 'cogs-none' ? 'none' : scenarioId === 'partial-cogs' ? 'partial' : 'normal',
    copilotMode: scenarioId === 'cogs-awaiting-approval' ? 'awaiting_approval' : 'standard',
    importMode: scenarioId === 'temu-import-running' ? 'running' : scenarioId === 'import-errors' ? 'errors' : 'idle',
    resultMode: scenarioId === 'no-results' ? 'empty' : scenarioId === 'repository-error' ? 'error' : 'normal',
    notice: SCENARIOS.find((scenario) => scenario.id === scenarioId)?.description ?? 'Prototype scenario active',
  };

  if (scenarioId === 'past-due') runtime.freshness = { state: 'warning', label: 'Access restricted', detail: 'Payment is past due' };
  if (scenarioId === 'first-sync') runtime.freshness = { state: 'syncing', label: 'Initial sync running', detail: '18,420 records imported' };
  if (scenarioId === 'no-marketplace') runtime.freshness = { state: 'warning', label: 'No data source', detail: 'Connect a marketplace account' };
  if (scenarioId === 'amazon-delayed') runtime.freshness = { state: 'warning', label: 'Amazon data delayed', detail: 'Last successful sync 2 hours ago' };
  if (scenarioId === 'ebay-auth-failed') runtime.freshness = { state: 'error', label: 'eBay disconnected', detail: 'Authentication required' };
  if (scenarioId === 'temu-import-running') runtime.freshness = { state: 'syncing', label: 'Temu import 68%', detail: 'Historical data is still partial' };
  if (scenarioId === 'import-errors') runtime.freshness = { state: 'warning', label: 'Import needs review', detail: 'Cost import rows contain blocking errors' };

  return runtime;
}
