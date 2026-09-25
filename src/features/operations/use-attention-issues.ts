'use client';

import { useMemo } from 'react';
import { useAccess } from '@/src/components/rbac/access';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useDashboardAnalytics } from '@/src/services/hooks/use-dashboard-analytics';
import { selectVisibleAttentionIssues } from '@/src/features/operations/attention-issues';
import { useMarketplaceStatusOverrides } from '@/src/services/mock/marketplace-status-store';

export function useVisibleAttentionIssues() {
  const syncAccess = useAccess('sync.view');
  const cogsAccess = useAccess('cogs.view');
  const expensesAccess = useAccess('expenses.view');
  const marketplaceManagement = useAccess('marketplaces.manage');
  const { workspace, context, scopeDecision, authorisedCompanies, authorisedAccounts, availableAccounts, companyNameFor } = useAnalysisContext();
  const { runtime, scenarioId, scenarioRevision } = usePrototype();
  const { statusOverrides } = useMarketplaceStatusOverrides(workspace.organisation.id, scenarioId, scenarioRevision);
  const { access: analyticsAccess, query, marketplaceState } = useDashboardAnalytics({ enabled: syncAccess.allowed && scopeDecision.allowed });
  const financialCompany = context.companyId === 'all'
    ? `${authorisedCompanies.length.toLocaleString('en-GB')} assigned ${authorisedCompanies.length === 1 ? 'Company' : 'Companies'}`
    : companyNameFor(context.companyId);
  const queryEnabled = syncAccess.allowed && scopeDecision.allowed && analyticsAccess.allowed && marketplaceState === 'available';
  const selectedAccountIds = useMemo(() => new Set(context.marketplaceAccountIds), [context.marketplaceAccountIds]);
  const visibleAccounts = useMemo(() => {
    const scopedAccounts = selectedAccountIds.size ? availableAccounts.filter((account) => selectedAccountIds.has(account.id)) : availableAccounts;
    return scopedAccounts.flatMap((account) => {
      const status = statusOverrides[account.id];
      if (status === 'paused') return [];
      return [status ? { ...account, status } : account];
    });
  }, [availableAccounts, selectedAccountIds, statusOverrides]);
  const issues = useMemo(() => {
    if (!syncAccess.allowed || !scopeDecision.allowed) return [];
    // keepPreviousData must never expose rows from a previous role, scenario or context.
    const currentFinancialAttention = query.isPlaceholderData ? [] : (query.data?.attention ?? []);
    return selectVisibleAttentionIssues({
      financialAttention: currentFinancialAttention,
      financialCompany,
      missingCogsProducts: query.isPlaceholderData ? 0 : (query.data?.health.missingCogsProducts ?? 0),
      visibleAccounts,
      authorisedAccountCount: authorisedAccounts.length,
      accountMode: runtime.accountMode,
      orgSlug: workspace.organisation.slug,
      canViewCogs: cogsAccess.allowed,
      canViewExpenses: expensesAccess.allowed,
      canManageMarketplace: marketplaceManagement.allowed,
      companyNameFor,
    });
  }, [authorisedAccounts.length, cogsAccess.allowed, companyNameFor, expensesAccess.allowed, financialCompany, marketplaceManagement.allowed, query.data, query.isPlaceholderData, runtime.accountMode, scopeDecision.allowed, syncAccess.allowed, visibleAccounts, workspace.organisation.slug]);

  return { issues, query, queryEnabled, syncAccess, scopeDecision };
}
