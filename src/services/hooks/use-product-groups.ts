'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess } from '@/src/components/rbac/access';
import type { DashboardRepositoryInput } from '@/src/domain/analytics';
import { COGS_TODAY } from '@/src/domain/cogs';
import type {
  CreateProductGroupInput,
  ProductGroupActor,
  ProductGroupCostProposalInput,
  ProductGroupCogsStatus,
  ProductGroupMembershipChangeInput,
  ProductGroupStatus,
} from '@/src/domain/product-groups';
import type { AccessDecision } from '@/src/domain/permissions';
import { queryKeys } from '@/src/services/query-keys';
import { services } from '@/src/services/runtime';

const ACTORS: Record<string, Pick<ProductGroupActor, 'id' | 'name'>> = {
  admin: { id: 'usr-zara', name: 'Zara Rahman' },
  finance: { id: 'usr-emma-richardson', name: 'Emma Richardson' },
  'cost-user': { id: 'usr-daniel', name: 'Daniel Price' },
  'company-manager': { id: 'usr-james-carter', name: 'James Carter' },
  analyst: { id: 'usr-sophie', name: 'Sophie Turner' },
  auditor: { id: 'usr-auditor', name: 'Alex Morgan' },
  'marketplace-manager': { id: 'usr-marketplace', name: 'Maya Clarke' },
  'platform-admin': { id: 'usr-platform', name: 'Platform administrator' },
};

function combineAccess(capability: AccessDecision, scope: AccessDecision): AccessDecision {
  return capability.allowed ? scope : capability;
}

function useProductGroupEnvironment() {
  const { context, scopeDecision, authorisedCompanies, authorisedAccounts, workspace, workspaceLoading } = useAnalysisContext();
  const prototype = usePrototype();
  const viewAccess = useAccess('cogs.view');
  const editAccess = useAccess('cogs.edit');
  const approveAccess = useAccess('cogs.approve');
  const profitabilityAccess = useAccess('profitability.view');
  const auditAccess = useAccess('audit.view');
  const sensitiveExpenses = useAccess('expenses.view_sensitive');
  const effectiveAccounts = prototype.runtime.accountMode === 'none' ? [] : authorisedAccounts;
  const authorisedCompanyIds = authorisedCompanies.map((company) => company.id);
  const authorisedAccountIds = effectiveAccounts.map((account) => account.id);
  const principal = !prototype.enabled && workspace.activeUser
    ? { id: workspace.activeUser.id, name: workspace.activeUser.name }
    : ACTORS[prototype.roleId] ?? ACTORS.admin;
  const actor: ProductGroupActor = {
    ...principal,
    companyIds: authorisedCompanyIds,
    permissions: { edit: editAccess.allowed, approve: approveAccess.allowed },
  };
  const baseInput: DashboardRepositoryInput = {
    context,
    organisation: workspace.organisation,
    scenarioId: prototype.scenarioId,
    companies: workspace.companies,
    marketplaceAccounts: workspace.marketplaceAccounts,
    authorisedCompanyIds,
    authorisedAccountIds,
    reportingCurrency: workspace.organisation.reportingCurrency,
    canViewSensitiveExpenses: sensitiveExpenses.allowed,
    cogsReadiness: workspace.cogsReadiness,
  };
  return {
    access: combineAccess(viewAccess, scopeDecision),
    actor,
    baseInput,
    keyScope: { context, scenarioId: prototype.scenarioId, realmKey: prototype.realmKey, authorisedCompanyIds, authorisedAccountIds },
    organisationId: workspace.organisation.id,
    realmKey: prototype.realmKey,
    workspaceLoading,
    marketplaceState: prototype.runtime.accountMode === 'none' || workspace.marketplaceAccounts.length === 0
      ? 'none-connected' as const
      : authorisedCompanyIds.length === 0 || authorisedAccountIds.length === 0
        ? 'no-authorised' as const
        : 'available' as const,
    permissions: {
      canView: viewAccess.allowed,
      canEdit: editAccess.allowed,
      canApprove: approveAccess.allowed,
      canViewProfitability: profitabilityAccess.allowed,
      canViewAudit: auditAccess.allowed,
    },
  };
}

function useInvalidateProductGroups(organisationId: string) {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.productGroups.root(organisationId) }),
      client.invalidateQueries({ queryKey: queryKeys.products.root(organisationId) }),
      client.invalidateQueries({ queryKey: queryKeys.cogs.root(organisationId) }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
      client.invalidateQueries({ queryKey: ['transactions'] }),
      client.invalidateQueries({ queryKey: ['reports'] }),
      client.invalidateQueries({ queryKey: ['expenses'] }),
      client.invalidateQueries({ queryKey: ['copilot'] }),
    ]);
  };
}

export interface ProductGroupsHookOptions {
  search?: string;
  companyId?: string | 'all';
  marketplace?: import('@/src/domain/models').Marketplace | 'all';
  marketplaceAccountId?: string | 'all';
  status?: ProductGroupCogsStatus | ProductGroupStatus | 'all';
  asOf?: string;
  page?: number;
  pageSize?: number;
}

export function useProductGroups(options: ProductGroupsHookOptions = {}) {
  const environment = useProductGroupEnvironment();
  const normalized = {
    search: options.search ?? '',
    companyId: options.companyId ?? environment.baseInput.context.companyId,
    marketplace: options.marketplace ?? environment.baseInput.context.marketplace,
    marketplaceAccountId: options.marketplaceAccountId ?? 'all',
    status: options.status ?? 'all',
    asOf: options.asOf ?? COGS_TODAY,
    page: Math.max(0, Math.trunc(options.page ?? 0)),
    pageSize: Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 25))),
  };
  const input = {
    ...environment.baseInput,
    ...normalized,
    organisationId: environment.organisationId,
    authorisedCompanyIds: environment.baseInput.authorisedCompanyIds,
    authorisedAccountIds: environment.baseInput.authorisedAccountIds,
  };
  const query = useQuery({
    queryKey: queryKeys.productGroups.list({ ...environment.keyScope, ...normalized }),
    queryFn: ({ signal }) => services.productGroups.list(input, signal),
    enabled: environment.access.allowed && !environment.workspaceLoading && environment.baseInput.authorisedCompanyIds.length > 0,
    placeholderData: keepPreviousData,
    retry: environment.baseInput.scenarioId === 'repository-error' ? false : 1,
  });
  return { ...environment, normalized, query };
}

export function useProductGroup(groupId: string, asOf = COGS_TODAY) {
  const environment = useProductGroupEnvironment();
  const query = useQuery({
    queryKey: queryKeys.productGroups.detail(environment.organisationId, groupId, asOf, environment.realmKey),
    queryFn: ({ signal }) => services.productGroups.getById({ ...environment.baseInput, groupId, asOf }, signal),
    enabled: Boolean(groupId) && environment.access.allowed && !environment.workspaceLoading,
    retry: environment.baseInput.scenarioId === 'repository-error' ? false : 1,
  });
  return { ...environment, query };
}

export function useProductGroupCompanyProducts(companyId: string, search = '', groupId?: string, asOf = COGS_TODAY) {
  const environment = useProductGroupEnvironment();
  const query = useQuery({
    queryKey: queryKeys.productGroups.products(environment.organisationId, companyId, search, asOf, groupId, environment.realmKey),
    queryFn: ({ signal }) => services.productGroups.searchCompanyProducts({ ...environment.baseInput, companyId, search, groupId, asOf, limit: 100 }, signal),
    enabled: Boolean(companyId) && environment.access.allowed && !environment.workspaceLoading,
    retry: environment.baseInput.scenarioId === 'repository-error' ? false : 1,
  });
  return { ...environment, query };
}

type CreateValues = Omit<CreateProductGroupInput, 'organisationId' | 'actor'>;
type ProposalValues = Omit<ProductGroupCostProposalInput, 'organisationId' | 'actor'>;
type MembershipValues = Omit<ProductGroupMembershipChangeInput, 'organisationId' | 'actor'>;

export function useProductGroupActions() {
  const environment = useProductGroupEnvironment();
  const invalidate = useInvalidateProductGroups(environment.organisationId);
  const createGroupMutation = useMutation({
    mutationFn: (values: CreateValues) => services.productGroups.create({ ...environment.baseInput, ...values, organisationId: environment.organisationId, actor: environment.actor }),
    onSuccess: invalidate,
  });
  const createCostProposalMutation = useMutation({
    mutationFn: (values: ProposalValues) => services.productGroups.createCostProposal({ ...environment.baseInput, ...values, organisationId: environment.organisationId, actor: environment.actor }),
    onSuccess: invalidate,
  });
  const applyCostProposalMutation = useMutation({
    mutationFn: (proposalId: string) => services.productGroups.applyCostProposal(environment.baseInput, proposalId, environment.actor, environment.permissions.canApprove),
    onSuccess: invalidate,
  });
  const changeMembershipMutation = useMutation({
    mutationFn: (values: MembershipValues) => services.productGroups.changeMembership({ ...environment.baseInput, ...values, organisationId: environment.organisationId, actor: environment.actor }),
    onSuccess: invalidate,
  });
  return {
    ...environment,
    createGroup: createGroupMutation.mutateAsync,
    createGroupMutation,
    createCostProposal: createCostProposalMutation.mutateAsync,
    createCostProposalMutation,
    applyCostProposal: applyCostProposalMutation.mutateAsync,
    applyCostProposalMutation,
    changeMembership: changeMembershipMutation.mutateAsync,
    changeMembershipMutation,
  };
}
