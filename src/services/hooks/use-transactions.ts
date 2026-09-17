'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess, useAccessRuntime } from '@/src/components/rbac/access';
import type { TransactionListOptions } from '@/src/domain/transactions';
import type { TransactionQuery, TransactionRepositoryInput } from '@/src/services/transactions-contracts';
import { services } from '@/src/services/runtime';

function useTransactionEnvironment() {
  const { context, scopeDecision, authorisedCompanies, authorisedAccounts, workspace, workspaceLoading } = useAnalysisContext();
  const { scenarioId, realmKey, runtime } = usePrototype();
  const accessRuntime = useAccessRuntime();
  const view = useAccess('transactions.view');
  const profitability = useAccess('profitability.view');
  const cogs = useAccess('cogs.view');
  const manageCogs = useAccess('cogs.edit');
  const copilot = useAccess('copilot.use');
  const audit = useAccess('audit.view');
  const sensitive = useAccess('expenses.view_sensitive');
  const access = !view.allowed ? view : !profitability.allowed ? profitability : scopeDecision;
  const authorisedCompanyIds = authorisedCompanies.map((company) => company.id);
  const authorisedAccountIds = runtime.accountMode === 'none' ? [] : authorisedAccounts.map((account) => account.id);
  const marketplaceState = runtime.accountMode === 'none' || workspace.marketplaceAccounts.length === 0 ? 'none-connected' as const
    : authorisedCompanyIds.length === 0 || authorisedAccountIds.length === 0 ? 'no-authorised' as const : 'available' as const;
  const baseInput: TransactionRepositoryInput = {
    context, organisation: workspace.organisation, scenarioId,
    companies: workspace.companies, marketplaceAccounts: workspace.marketplaceAccounts,
    authorisedCompanyIds, authorisedAccountIds, reportingCurrency: workspace.organisation.reportingCurrency,
    canViewSensitiveExpenses: sensitive.allowed, cogsReadiness: workspace.cogsReadiness,
    principal: { ...accessRuntime, entitlements: [...accessRuntime.entitlements] },
  };
  return {
    access, marketplaceState, baseInput, workspaceLoading, scenarioId,
    keyScope: { context, realmKey, scenarioId, authorisedCompanyIds, authorisedAccountIds, principal: baseInput.principal },
    permissions: { canExport: access.allowed, canViewCogs: cogs.allowed, canManageCogs: manageCogs.allowed, canViewProfitability: profitability.allowed, canUseCopilot: copilot.allowed, canViewAudit: audit.allowed, canViewSensitiveExpenses: sensitive.allowed },
  };
}

export function useTransactions(options: TransactionListOptions = {}) {
  const environment = useTransactionEnvironment();
  const input: TransactionQuery = { ...environment.baseInput, ...options };
  const query = useQuery({
    queryKey: ['transactions', 'list', environment.keyScope, options],
    queryFn: ({ signal }) => services.transactions.listTransactions(input, signal),
    enabled: environment.access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  const exportMutation = useMutation({ mutationFn: (selectedIds?: string[]) => services.transactions.exportTransactions({ ...input, selectedIds }) });
  return { access: environment.access, marketplaceState: environment.marketplaceState, permissions: environment.permissions, query, exportMutation, exportMatching: exportMutation.mutateAsync };
}

export function useTransaction(transactionId: string, options: { enabled?: boolean } = {}) {
  const environment = useTransactionEnvironment();
  const query = useQuery({
    queryKey: ['transactions', 'detail', transactionId, environment.keyScope],
    queryFn: ({ signal }) => services.transactions.getTransaction({ ...environment.baseInput, transactionId }, signal),
    enabled: options.enabled !== false && Boolean(transactionId) && environment.access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  return { access: environment.access, marketplaceState: environment.marketplaceState, permissions: environment.permissions, query };
}
