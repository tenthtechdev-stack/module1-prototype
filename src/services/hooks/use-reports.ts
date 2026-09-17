'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess, useAccessRuntime } from '@/src/components/rbac/access';
import type { ReportQuery } from '@/src/services/reports-contracts';
import type { TransactionRepositoryInput } from '@/src/services/transactions-contracts';
import { services } from '@/src/services/runtime';
import { prepareReportExport } from '@/src/services/report-export';

export type ReportOptions = Omit<ReportQuery, keyof TransactionRepositoryInput>;
export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf';

/** Reporting pages never receive canonical fixtures or perform financial aggregation. */
export function useReport(options: ReportOptions, controls: { enabled?: boolean } = {}) {
  const { context, scopeDecision, authorisedCompanies, authorisedAccounts, workspace, workspaceLoading } = useAnalysisContext();
  const { scenarioId, realmKey, runtime } = usePrototype();
  const principal = useAccessRuntime();
  const reportAccess = useAccess('reports.view');
  const profitability = useAccess('profitability.view');
  const expenses = useAccess('expenses.view');
  const sensitive = useAccess('expenses.view_sensitive');
  const cogs = useAccess('cogs.view');
  const cogsEdit = useAccess('cogs.edit');
  const copilot = useAccess('copilot.use');
  const products = useAccess('products.view');
  const sync = useAccess('sync.view');
  const transactions = useAccess('transactions.view');
  const manageExpenses = useAccess('expenses.edit');
  const manageMarketplaces = useAccess('marketplaces.manage');
  const access = !reportAccess.allowed ? reportAccess : !profitability.allowed ? profitability
    : options.kind === 'expenses' && !expenses.allowed ? expenses : scopeDecision;
  const authorisedCompanyIds = authorisedCompanies.map((company) => company.id);
  const authorisedAccountIds = runtime.accountMode === 'none' ? [] : authorisedAccounts.map((account) => account.id);
  const marketplaceState = runtime.accountMode === 'none' || workspace.marketplaceAccounts.length === 0 ? 'none-connected' as const
    : !authorisedCompanyIds.length || !authorisedAccountIds.length ? 'no-authorised' as const : 'available' as const;
  const input: ReportQuery = {
    context, organisation: workspace.organisation, scenarioId,
    companies: workspace.companies, marketplaceAccounts: workspace.marketplaceAccounts,
    authorisedCompanyIds, authorisedAccountIds, reportingCurrency: workspace.organisation.reportingCurrency,
    canViewSensitiveExpenses: sensitive.allowed, cogsReadiness: workspace.cogsReadiness,
    principal: { ...principal, entitlements: [...principal.entitlements] }, ...options,
  };
  const query = useQuery({
    queryKey: ['reports', 'result', { context, realmKey, scenarioId, authorisedCompanyIds, authorisedAccountIds, principal: input.principal }, options],
    queryFn: ({ signal }) => services.reports.getReport(input, signal),
    enabled: controls.enabled !== false && access.allowed && !workspaceLoading && marketplaceState !== 'no-authorised',
    retry: scenarioId === 'repository-error' ? false : 1,
  });
  const exportMutation = useMutation({
    mutationFn: ({ format, visibleColumns }: { format: ReportExportFormat; visibleColumns?: string[] }) => prepareReportExport(input, format, visibleColumns),
  });
  return {
    access, marketplaceState, query, exportMutation, input,
    permissions: {
      canExport: access.allowed, canViewCogs: cogs.allowed, canManageCogs: cogsEdit.allowed,
      canViewExpenses: expenses.allowed, canManageExpenses: manageExpenses.allowed,
      canUseCopilot: copilot.allowed, canViewProducts: products.allowed, canViewSync: sync.allowed,
      canViewTransactions: transactions.allowed, canManageMarketplaces: manageMarketplaces.allowed,
    },
  };
}
