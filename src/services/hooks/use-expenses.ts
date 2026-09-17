'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess, useAccessRuntime } from '@/src/components/rbac/access';
import type { ExpenseDraft, ExpenseFilters, ExpenseRepositoryInput } from '@/src/domain/expenses';
import { services } from '@/src/services/runtime';

export function useExpenses(filters: ExpenseFilters = {}, expenseId?: string, options: { enabled?: boolean } = {}) {
  const { context, scopeDecision, authorisedCompanies, authorisedAccounts, workspace, workspaceLoading } = useAnalysisContext();
  const { scenarioId, realmKey } = usePrototype();
  const principal = useAccessRuntime();
  const view = useAccess('expenses.view'); const edit = useAccess('expenses.edit'); const sensitive = useAccess('expenses.view_sensitive');
  const access = !view.allowed ? view : scopeDecision;
  const input: ExpenseRepositoryInput = { context, organisation: workspace.organisation, scenarioId, companies: workspace.companies, marketplaceAccounts: workspace.marketplaceAccounts, authorisedCompanyIds: authorisedCompanies.map((company) => company.id), authorisedAccountIds: authorisedAccounts.map((account) => account.id), reportingCurrency: workspace.organisation.reportingCurrency, cogsReadiness: workspace.cogsReadiness, canViewSensitiveExpenses: sensitive.allowed, canViewExpenses: view.allowed, principal: { ...principal, entitlements: [...principal.entitlements] }, actor: { id: workspace.activeUser?.id ?? principal.role.id, name: workspace.activeUser?.name ?? principal.role.label, canEdit: edit.allowed } };
  const key = { realmKey, input };
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['expenses', 'list', key, filters], queryFn: ({ signal }) => services.expenses.list(input, filters, signal), enabled: options.enabled !== false && access.allowed && !workspaceLoading, retry: scenarioId === 'repository-error' ? false : 1 });
  const detailQuery = useQuery({ queryKey: ['expenses', 'detail', key, expenseId], queryFn: ({ signal }) => services.expenses.getDetail(input, expenseId!, signal), enabled: options.enabled !== false && Boolean(expenseId) && access.allowed && !workspaceLoading, retry: scenarioId === 'repository-error' ? false : 1 });
  const refresh = async () => { await queryClient.invalidateQueries({ predicate: (query) => !['workspace', 'onboarding'].includes(String(query.queryKey[0])) }); };
  const save = useMutation({ mutationFn: ({ draft, id }: { draft: ExpenseDraft; id?: string }) => id ? services.expenses.update(input, id, draft) : services.expenses.create(input, draft), onSuccess: refresh });
  const end = useMutation({ mutationFn: ({ id, ...values }: { id: string; endDate: string; reason: string; confirmed: boolean; backdatedConfirmed: boolean }) => services.expenses.end(input, id, values), onSuccess: refresh });
  return { access, canEdit: edit.allowed, canViewSensitive: sensitive.allowed && scenarioId !== 'sensitive-expenses-restricted', query, detailQuery, save, end, busy: save.isPending || end.isPending };
}

