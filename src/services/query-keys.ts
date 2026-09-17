import type { AnalysisContext, CopilotContext } from '@/src/domain/models';
import type { ProductCogsStatus, ProductProfitabilityStatus, ProductSorting } from '@/src/domain/products';
import type { MarketplaceListingStatus } from '@/src/domain/models';
import type { CogsWorkspaceStatus } from '@/src/domain/cogs';

interface ProductScopeKeyInput {
  context: AnalysisContext;
  scenarioId: string;
  realmKey: string;
  authorisedCompanyIds: string[];
  authorisedAccountIds: string[];
}

function productScopeKey(input: ProductScopeKeyInput) {
  return {
    organisationId: input.context.organisationId,
    companyId: input.context.companyId,
    marketplace: input.context.marketplace,
    accountIds: [...input.context.marketplaceAccountIds].sort(),
    from: input.context.dateRange.from,
    to: input.context.dateRange.to,
    scenarioId: input.scenarioId,
    realmKey: input.realmKey,
    authorisedCompanyIds: [...input.authorisedCompanyIds].sort(),
    authorisedAccountIds: [...input.authorisedAccountIds].sort(),
  };
}

export const queryKeys = {
  workspace: (orgSlug: string, scenarioId: string) => ['workspace', orgSlug, 'foundation', scenarioId] as const,
  onboarding: {
    root: ['onboarding'] as const,
    active: () => ['onboarding', 'active'] as const,
    session: (sessionId: string, scenarioId: string) => ['onboarding', 'session', sessionId, scenarioId] as const,
    sync: (sessionId: string, scenarioId: string) => ['onboarding', 'sync', sessionId, scenarioId] as const,
    cogs: (sessionId: string, scenarioId: string) => ['onboarding', 'cogs', sessionId, scenarioId] as const,
    invitations: (sessionId: string) => ['onboarding', 'invitations', sessionId] as const,
  },
  copilot: (context: CopilotContext, scenarioId: string) => ['copilot', 'overview', context, scenarioId] as const,
  dashboard: (input: {
    context: AnalysisContext;
    scenarioId: string;
    realmKey: string;
    authorisedCompanyIds: string[];
    authorisedAccountIds: string[];
  }) => ['dashboard', {
    organisationId: input.context.organisationId,
    companyId: input.context.companyId,
    marketplace: input.context.marketplace,
    accountIds: [...input.context.marketplaceAccountIds].sort(),
    from: input.context.dateRange.from,
    to: input.context.dateRange.to,
    scenarioId: input.scenarioId,
    realmKey: input.realmKey,
    authorisedCompanyIds: [...input.authorisedCompanyIds].sort(),
    authorisedAccountIds: [...input.authorisedAccountIds].sort(),
  }] as const,
  cogs: {
    root: (organisationId: string) => ['cogs', organisationId] as const,
    workspace: (input: ProductScopeKeyInput & {
      search: string;
      status: CogsWorkspaceStatus | 'all';
      source: string | 'all';
      effectiveDate: 'all' | 'current' | 'future' | 'historical';
      changedBy: string | 'all';
      needsReview: boolean;
      page: number;
      pageSize: number;
    }) => ['cogs', input.context.organisationId, 'workspace', {
      ...productScopeKey(input),
      search: input.search.trim().toLocaleLowerCase('en-GB'),
      status: input.status,
      source: input.source,
      effectiveDate: input.effectiveDate,
      changedBy: input.changedBy,
      needsReview: input.needsReview,
      page: input.page,
      pageSize: input.pageSize,
    }] as const,
    batch: (organisationId: string, batchId: string, realmKey: string) => ['cogs', organisationId, 'batch', batchId, realmKey] as const,
    audit: (organisationId: string) => ['cogs', organisationId, 'audit'] as const,
  },
  productGroups: {
    root: (organisationId: string) => ['product-groups', organisationId] as const,
    list: (input: ProductScopeKeyInput & {
      search: string;
      companyId: string | 'all';
      marketplace: import('@/src/domain/models').Marketplace | 'all';
      marketplaceAccountId: string | 'all';
      status: import('@/src/domain/product-groups').ProductGroupCogsStatus | import('@/src/domain/product-groups').ProductGroupStatus | 'all';
      asOf: string;
      page: number;
      pageSize: number;
    }) => ['product-groups', input.context.organisationId, 'list', {
      ...productScopeKey(input),
      search: input.search.trim().toLocaleLowerCase('en-GB'),
      companyId: input.companyId,
      marketplace: input.marketplace,
      marketplaceAccountId: input.marketplaceAccountId,
      status: input.status,
      asOf: input.asOf,
      page: input.page,
      pageSize: input.pageSize,
    }] as const,
    detail: (organisationId: string, groupId: string, asOf: string, realmKey: string) => [
      'product-groups', organisationId, 'detail', groupId, asOf, realmKey,
    ] as const,
    products: (organisationId: string, companyId: string, search: string, asOf: string, groupId: string | undefined, realmKey: string) => [
      'product-groups', organisationId, 'company-products', companyId, search.trim().toLocaleLowerCase('en-GB'), asOf, groupId ?? null, realmKey,
    ] as const,
  },
  products: {
    root: (organisationId: string) => ['products', organisationId] as const,
    list: (input: ProductScopeKeyInput & {
      search: string;
      cogsStatus: ProductCogsStatus | 'all';
      listingStatus: MarketplaceListingStatus | 'all';
      profitabilityStatus: ProductProfitabilityStatus | 'all';
      categories: string[];
      sorting: ProductSorting[];
      page: number;
      pageSize: number;
    }) => ['products', input.context.organisationId, 'list', {
      ...productScopeKey(input),
      search: input.search.trim().toLocaleLowerCase('en-GB'),
      cogsStatus: input.cogsStatus,
      listingStatus: input.listingStatus,
      profitabilityStatus: input.profitabilityStatus,
      categories: [...input.categories].sort(),
      sorting: input.sorting,
      page: input.page,
      pageSize: input.pageSize,
    }] as const,
    detail: (productId: string, input: ProductScopeKeyInput) => [
      'products', input.context.organisationId, 'detail', productId, productScopeKey(input),
    ] as const,
    section: (productId: string, section: string, input: ProductScopeKeyInput & { limit?: number }) => [
      'products', input.context.organisationId, 'detail', productId, section, { ...productScopeKey(input), limit: input.limit },
    ] as const,
  },
};
