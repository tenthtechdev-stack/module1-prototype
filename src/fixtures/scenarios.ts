import { ALL_MODULES, type ModuleKey } from '@/src/domain/permissions';
import type { SubscriptionStatus } from '@/src/domain/models';

export const SCENARIOS = [
  { id: 'healthy', label: 'Healthy business', description: 'Complete data and fresh marketplace syncs' },
  { id: 'first-sync', label: 'First marketplace sync', description: 'A newly connected account is importing' },
  { id: 'cogs-missing-all', label: '100% COGS missing', description: 'Profitability is unavailable until costs are added' },
  { id: 'partial-cogs', label: 'Partial COGS coverage', description: 'Some product costs need attention' },
  { id: 'amazon-delayed', label: 'Amazon sync delayed', description: 'Fees are stale by two hours' },
  { id: 'ebay-auth-failed', label: 'eBay authentication failed', description: 'Reconnect is required' },
  { id: 'temu-import-running', label: 'Temu import running', description: 'Historical data import is in progress' },
  { id: 'past-due', label: 'Past-due subscription', description: 'Tenant access is restricted to billing' },
  { id: 'marketplace-restricted', label: 'Marketplace Manager view', description: 'One company and account are assigned' },
  { id: 'auditor-read-only', label: 'Auditor read-only view', description: 'No mutation capabilities' },
  { id: 'cogs-awaiting-approval', label: 'COGS Copilot approval', description: 'A suggestion is ready for human review' },
  { id: 'import-anomalies', label: 'Import with anomalies', description: 'Duplicate SKUs and invalid cost rows' },
  { id: 'no-search-results', label: 'No search results', description: 'Exercises the filtered empty state' },
  { id: 'module-unavailable', label: 'COGS module unavailable', description: 'Exercises the entitlement access state' },
  { id: 'repository-error', label: 'Product service error', description: 'Exercises retry and error handling' },
] as const;

export type ScenarioId = (typeof SCENARIOS)[number]['id'];

export interface ScenarioRuntime {
  subscriptionStatus: SubscriptionStatus;
  entitlements: ReadonlySet<ModuleKey>;
  freshness: {
    state: 'fresh' | 'warning' | 'error' | 'syncing';
    label: string;
    detail: string;
  };
}

export function getScenarioRuntime(scenarioId: ScenarioId): ScenarioRuntime {
  const entitlements = new Set<ModuleKey>(ALL_MODULES);
  if (scenarioId === 'module-unavailable') entitlements.delete('cogs');

  if (scenarioId === 'past-due') {
    return {
      subscriptionStatus: 'past_due',
      entitlements,
      freshness: { state: 'warning', label: 'Access restricted', detail: 'Payment is past due' },
    };
  }
  if (scenarioId === 'amazon-delayed') {
    return {
      subscriptionStatus: 'active',
      entitlements,
      freshness: { state: 'warning', label: 'Fees delayed', detail: 'Last successful sync 2h ago' },
    };
  }
  if (scenarioId === 'ebay-auth-failed') {
    return {
      subscriptionStatus: 'active',
      entitlements,
      freshness: { state: 'error', label: 'eBay disconnected', detail: 'Authentication required' },
    };
  }
  if (scenarioId === 'first-sync' || scenarioId === 'temu-import-running') {
    return {
      subscriptionStatus: 'active',
      entitlements,
      freshness: { state: 'syncing', label: scenarioId === 'first-sync' ? 'Initial sync running' : 'Historical import 68%', detail: 'Updated just now' },
    };
  }

  return {
    subscriptionStatus: 'active',
    entitlements,
    freshness: { state: 'fresh', label: 'Data up to date', detail: 'Updated 11 min ago' },
  };
}
