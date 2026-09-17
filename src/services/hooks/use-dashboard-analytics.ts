'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess } from '@/src/components/rbac/access';
import { queryKeys } from '@/src/services/query-keys';
import { services } from '@/src/services/runtime';

export function useDashboardAnalytics(options: { enabled?: boolean } = {}) {
  const { context, scopeDecision, authorisedCompanies, authorisedAccounts, workspace, workspaceLoading } = useAnalysisContext();
  const { scenarioId, realmKey, runtime } = usePrototype();
  const capabilityAccess = useAccess('profitability.view');
  const sensitiveExpenses = useAccess('expenses.view_sensitive');
  const access = capabilityAccess.allowed ? scopeDecision : capabilityAccess;
  const authorisedCompanyIds = authorisedCompanies.map((company) => company.id);
  const effectiveAccounts = runtime.accountMode === 'none' ? [] : authorisedAccounts;
  const authorisedAccountIds = effectiveAccounts.map((account) => account.id);
  const marketplaceState = runtime.accountMode === 'none' || workspace.marketplaceAccounts.length === 0
    ? 'none-connected'
    : authorisedCompanies.length === 0 || authorisedAccounts.length === 0
      ? 'no-authorised'
      : 'available';
  const query = useQuery({
    queryKey: queryKeys.dashboard({ context, scenarioId, realmKey, authorisedCompanyIds, authorisedAccountIds }),
    queryFn: ({ signal }) => services.dashboard.getDashboard({
      context,
      organisation: workspace.organisation,
      scenarioId,
      companies: workspace.companies,
      marketplaceAccounts: effectiveAccounts,
      authorisedCompanyIds,
      authorisedAccountIds,
      reportingCurrency: workspace.organisation.reportingCurrency,
      canViewSensitiveExpenses: sensitiveExpenses.allowed,
      cogsReadiness: workspace.cogsReadiness,
    }, signal),
    enabled: options.enabled !== false && access.allowed && !workspaceLoading && marketplaceState === 'available',
    placeholderData: keepPreviousData,
    retry: scenarioId === 'repository-error' ? false : 1,
  });
  return { access, query, marketplaceState };
}
