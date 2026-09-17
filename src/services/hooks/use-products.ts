'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess } from '@/src/components/rbac/access';
import type { AccessDecision } from '@/src/domain/permissions';
import type { ProductListOptions } from '@/src/domain/products';
import type { ProductDetailQuery, ProductQuery } from '@/src/services/contracts';
import { queryKeys } from '@/src/services/query-keys';
import { services } from '@/src/services/runtime';

export interface ProductSectionHookOptions {
  enabled?: boolean;
}

export interface ProductTransactionsHookOptions extends ProductSectionHookOptions {
  limit?: number;
}

function combineAccess(capability: AccessDecision, scope: AccessDecision): AccessDecision {
  return capability.allowed ? scope : capability;
}

function useProductEnvironment() {
  const { context, scopeDecision, authorisedCompanies, authorisedAccounts, workspace, workspaceLoading } = useAnalysisContext();
  const { scenarioId, realmKey, runtime } = usePrototype();
  const sensitiveExpenses = useAccess('expenses.view_sensitive');
  const effectiveAccounts = runtime.accountMode === 'none' ? [] : authorisedAccounts;
  const authorisedCompanyIds = authorisedCompanies.map((company) => company.id);
  const authorisedAccountIds = effectiveAccounts.map((account) => account.id);
  const marketplaceState = runtime.accountMode === 'none' || workspace.marketplaceAccounts.length === 0
    ? 'none-connected' as const
    : authorisedCompanies.length === 0 || authorisedAccounts.length === 0
      ? 'no-authorised' as const
      : 'available' as const;
  const baseInput = {
    context,
    organisation: workspace.organisation,
    scenarioId,
    companies: workspace.companies,
    // Build the deterministic organisation catalogue from the full workspace
    // account topology. The authorised ID sets below remain the data boundary;
    // keeping the structural dataset stable lets lookups distinguish a real,
    // out-of-assignment product from a genuinely unknown ID.
    marketplaceAccounts: workspace.marketplaceAccounts,
    authorisedCompanyIds,
    authorisedAccountIds,
    reportingCurrency: workspace.organisation.reportingCurrency,
    canViewSensitiveExpenses: sensitiveExpenses.allowed,
    cogsReadiness: workspace.cogsReadiness,
  } satisfies Omit<ProductDetailQuery, 'productId'>;
  const keyScope = { context, scenarioId, realmKey, authorisedCompanyIds, authorisedAccountIds };
  return { baseInput, keyScope, marketplaceState, realmKey, scopeDecision, scenarioId, workspaceLoading };
}

export function useProducts(options: ProductListOptions = {}) {
  const environment = useProductEnvironment();
  const capabilityAccess = useAccess('products.view');
  const cogsViewAccess = useAccess('cogs.view');
  const cogsEditAccess = useAccess('cogs.edit');
  const profitabilityAccess = useAccess('profitability.view');
  const copilotAccess = useAccess('copilot.use');
  const access = combineAccess(capabilityAccess, environment.scopeDecision);
  const normalized = {
    search: options.search ?? '',
    cogsStatus: options.cogsStatus ?? 'all',
    listingStatus: options.listingStatus ?? 'all',
    profitabilityStatus: options.profitabilityStatus ?? 'all',
    categories: options.categories ?? [],
    sorting: options.sorting ?? [{ field: 'revenue', direction: 'desc' }],
    page: Math.max(0, Math.trunc(options.page ?? 0)),
    pageSize: Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 25))),
  } satisfies Omit<ProductQuery, keyof ProductDetailQuery>;
  const input: ProductQuery = { ...environment.baseInput, ...normalized };
  const query = useQuery({
    queryKey: queryKeys.products.list({ ...environment.keyScope, ...normalized }),
    queryFn: ({ signal }) => services.products.list(input, signal),
    enabled: access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    placeholderData: keepPreviousData,
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  const exportMutation = useMutation({ mutationFn: () => services.products.exportRows(input) });

  return {
    access,
    query,
    marketplaceState: environment.marketplaceState,
    categories: query.data?.categories ?? [],
    exportMatching: exportMutation.mutateAsync,
    exportMutation,
    permissions: {
      // Product CSVs contain revenue, covered profit and margin fields. Keep the
      // export capability aligned with the financial values it serialises.
      canExport: access.allowed && profitabilityAccess.allowed && cogsViewAccess.allowed,
      canManageCogs: cogsEditAccess.allowed,
      canViewCogs: cogsViewAccess.allowed,
      canViewProfitability: profitabilityAccess.allowed,
      canUseCopilot: copilotAccess.allowed,
    },
  };
}

function useProductSectionAccess(capability: Parameters<typeof useAccess>[0]) {
  const environment = useProductEnvironment();
  const capabilityAccess = useAccess(capability);
  const access = combineAccess(capabilityAccess, environment.scopeDecision);
  return { environment, access };
}

export function useProduct(productId: string, options: ProductSectionHookOptions = {}) {
  const { environment, access } = useProductSectionAccess('products.view');
  const input: ProductDetailQuery = { ...environment.baseInput, productId };
  const query = useQuery({
    queryKey: queryKeys.products.detail(productId, environment.keyScope),
    queryFn: ({ signal }) => services.products.getById(input, signal),
    enabled: Boolean(productId) && options.enabled !== false && access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  return { access, query, marketplaceState: environment.marketplaceState };
}

export function useProductProfitability(productId: string, options: ProductSectionHookOptions = {}) {
  const { environment, access } = useProductSectionAccess('profitability.view');
  const input: ProductDetailQuery = { ...environment.baseInput, productId };
  const query = useQuery({
    queryKey: queryKeys.products.section(productId, 'profitability', environment.keyScope),
    queryFn: ({ signal }) => services.products.getProfitability(input, signal),
    enabled: Boolean(productId) && options.enabled !== false && access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  return { access, query };
}

export function useProductCosts(productId: string, options: ProductSectionHookOptions = {}) {
  const { environment, access } = useProductSectionAccess('cogs.view');
  const input: ProductDetailQuery = { ...environment.baseInput, productId };
  const query = useQuery({
    queryKey: queryKeys.products.section(productId, 'costs', environment.keyScope),
    queryFn: ({ signal }) => services.products.getCosts(input, signal),
    enabled: Boolean(productId) && options.enabled !== false && access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  return { access, query };
}

export function useProductListings(productId: string, options: ProductSectionHookOptions = {}) {
  const { environment, access } = useProductSectionAccess('products.view');
  const input: ProductDetailQuery = { ...environment.baseInput, productId };
  const query = useQuery({
    queryKey: queryKeys.products.section(productId, 'listings', environment.keyScope),
    queryFn: ({ signal }) => services.products.getListings(input, signal),
    enabled: Boolean(productId) && options.enabled !== false && access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  return { access, query };
}

export function useProductTransactions(productId: string, options: ProductTransactionsHookOptions = {}) {
  const { environment, access } = useProductSectionAccess('transactions.view');
  const limit = Math.min(25, Math.max(1, Math.trunc(options.limit ?? 15)));
  const input = { ...environment.baseInput, productId, limit };
  const query = useQuery({
    queryKey: queryKeys.products.section(productId, 'transactions', { ...environment.keyScope, limit }),
    queryFn: ({ signal }) => services.products.getTransactions(input, signal),
    enabled: Boolean(productId) && options.enabled !== false && access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  return { access, query };
}

export function useProductTrend(productId: string, options: ProductSectionHookOptions = {}) {
  const { environment, access } = useProductSectionAccess('profitability.view');
  const input: ProductDetailQuery = { ...environment.baseInput, productId };
  const query = useQuery({
    queryKey: queryKeys.products.section(productId, 'trend', environment.keyScope),
    queryFn: ({ signal }) => services.products.getTrend(input, signal),
    enabled: Boolean(productId) && options.enabled !== false && access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  return { access, query };
}

export function useProductActivity(productId: string, options: ProductSectionHookOptions = {}) {
  const { environment, access } = useProductSectionAccess('audit.view');
  const input: ProductDetailQuery = { ...environment.baseInput, productId };
  const query = useQuery({
    queryKey: queryKeys.products.section(productId, 'activity', environment.keyScope),
    queryFn: ({ signal }) => services.products.getActivity(input, signal),
    enabled: Boolean(productId) && options.enabled !== false && access.allowed && !environment.workspaceLoading && environment.marketplaceState === 'available',
    retry: environment.scenarioId === 'repository-error' ? false : 1,
  });
  return { access, query };
}
