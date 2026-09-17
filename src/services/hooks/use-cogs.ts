'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess } from '@/src/components/rbac/access';
import type { DashboardRepositoryInput } from '@/src/domain/analytics';
import type {
  CogsActor,
  CogsColumnMapping,
  CogsImportBatch,
  CogsProposalInput,
  CogsReviewStatus,
  CogsWorkspaceStatus,
} from '@/src/domain/cogs';
import type { AccessDecision } from '@/src/domain/permissions';
import type { CreateCogsImportInput } from '@/src/services/contracts';
import { queryKeys } from '@/src/services/query-keys';
import { services } from '@/src/services/runtime';

export interface CogsWorkspaceOptions {
  search?: string;
  status?: CogsWorkspaceStatus | 'all';
  source?: string | 'all';
  effectiveDate?: 'all' | 'current' | 'future' | 'historical';
  changedBy?: string | 'all';
  needsReview?: boolean;
  page?: number;
  pageSize?: number;
  /** Read-only batch logs remain available when no current marketplace is connected. */
  allowUnavailableMarketplace?: boolean;
}

type NewImportValues = Omit<CreateCogsImportInput, keyof DashboardRepositoryInput | 'actor'>;

const PROTOTYPE_ACTORS: Record<string, Omit<CogsActor, 'permissions'>> = {
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

function useCogsEnvironment() {
  const { context, scopeDecision, authorisedCompanies, authorisedAccounts, workspace, workspaceLoading } = useAnalysisContext();
  const prototype = usePrototype();
  const viewAccess = useAccess('cogs.view');
  const editAccess = useAccess('cogs.edit');
  const importAccess = useAccess('cogs.import');
  const approveAccess = useAccess('cogs.approve');
  const copilotAccess = useAccess('copilot.use');
  const auditAccess = useAccess('audit.view');
  const sensitiveExpenses = useAccess('expenses.view_sensitive');
  const effectiveAccounts = prototype.runtime.accountMode === 'none' ? [] : authorisedAccounts;
  const authorisedCompanyIds = authorisedCompanies.map((company) => company.id);
  const authorisedAccountIds = effectiveAccounts.map((account) => account.id);
  const marketplaceState = prototype.runtime.accountMode === 'none' || workspace.marketplaceAccounts.length === 0
    ? 'none-connected' as const
    : authorisedCompanies.length === 0 || authorisedAccounts.length === 0
      ? 'no-authorised' as const
      : 'available' as const;
  const principal = !prototype.enabled && workspace.activeUser
    ? { id: workspace.activeUser.id, name: workspace.activeUser.name }
    : PROTOTYPE_ACTORS[prototype.roleId] ?? PROTOTYPE_ACTORS.admin;
  const actor: CogsActor = {
    ...principal,
    permissions: { edit: editAccess.allowed, import: importAccess.allowed, approve: approveAccess.allowed },
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
  const keyScope = {
    context,
    scenarioId: prototype.scenarioId,
    realmKey: prototype.realmKey,
    authorisedCompanyIds,
    authorisedAccountIds,
  };
  return {
    access: combineAccess(viewAccess, scopeDecision),
    actor,
    baseInput,
    keyScope,
    marketplaceState,
    organisationId: workspace.organisation.id,
    realmKey: prototype.realmKey,
    retry: prototype.scenarioId === 'repository-error' ? false : 1,
    workspaceLoading,
    companies: authorisedCompanies,
    permissions: {
      canView: viewAccess.allowed,
      canEdit: editAccess.allowed,
      canImport: importAccess.allowed,
      canApprove: approveAccess.allowed,
      canUseCopilot: copilotAccess.allowed,
      canViewAudit: auditAccess.allowed,
    },
  };
}

function useInvalidateCogs(organisationId: string) {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: queryKeys.cogs.root(organisationId) }),
      client.invalidateQueries({ queryKey: queryKeys.products.root(organisationId) }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
      client.invalidateQueries({ queryKey: ['transactions'] }),
      client.invalidateQueries({ queryKey: ['reports'] }),
      client.invalidateQueries({ queryKey: ['expenses'] }),
      client.invalidateQueries({ queryKey: ['copilot'] }),
    ]);
  };
}

export function useCogsWorkspace(options: CogsWorkspaceOptions = {}) {
  const environment = useCogsEnvironment();
  const normalized = {
    search: options.search ?? '',
    status: options.status ?? 'all',
    source: options.source ?? 'all',
    effectiveDate: options.effectiveDate ?? 'all',
    changedBy: options.changedBy ?? 'all',
    needsReview: options.needsReview ?? false,
    page: Math.max(0, Math.trunc(options.page ?? 0)),
    pageSize: Math.min(100, Math.max(1, Math.trunc(options.pageSize ?? 25))),
  };
  const input = { ...environment.baseInput, ...normalized };
  const query = useQuery({
    queryKey: queryKeys.cogs.workspace({ ...environment.keyScope, ...normalized }),
    queryFn: ({ signal }) => services.cogs.getWorkspace(input, signal),
    enabled: environment.access.allowed
      && !environment.workspaceLoading
      && (environment.marketplaceState === 'available' || options.allowUnavailableMarketplace === true),
    placeholderData: keepPreviousData,
    retry: environment.retry,
  });
  return { ...environment, normalized, query };
}

export function useCogsActions() {
  const environment = useCogsEnvironment();
  const invalidate = useInvalidateCogs(environment.organisationId);
  const createImportMutation = useMutation({
    mutationFn: (values: NewImportValues) => services.cogs.createImport({ ...environment.baseInput, ...values, actor: environment.actor }),
    onSuccess: invalidate,
  });
  const createProposalMutation = useMutation({
    mutationFn: (values: { companyId: string; kind: 'single' | 'bulk' | 'percentage'; proposals: CogsProposalInput[]; label: string }) => services.cogs.createProposalBatch({ ...environment.baseInput, ...values, actor: environment.actor }),
    onSuccess: invalidate,
  });
  return {
    ...environment,
    createImport: createImportMutation.mutateAsync,
    createImportMutation,
    createProposalBatch: createProposalMutation.mutateAsync,
    createProposalMutation,
  };
}

export function useCogsBatch(batchId: string) {
  const environment = useCogsEnvironment();
  const client = useQueryClient();
  const invalidate = useInvalidateCogs(environment.organisationId);
  const batchQueryKey = queryKeys.cogs.batch(environment.organisationId, batchId, environment.realmKey);
  const query = useQuery({
    queryKey: batchQueryKey,
    queryFn: ({ signal }) => services.cogs.getBatch(environment.baseInput, batchId, signal),
    enabled: Boolean(batchId) && environment.access.allowed && !environment.workspaceLoading,
    retry: environment.retry,
  });
  const save = async (operation: Promise<CogsImportBatch>) => {
    try {
      const result = await operation;
      client.setQueryData(batchQueryKey, result);
      await invalidate();
      return result;
    } catch (error) {
      // Some governed failures intentionally persist a refreshed review state
      // before rejecting (for example, an optimistic timeline conflict).
      await invalidate();
      throw error;
    }
  };
  return {
    ...environment,
    query,
    updateMapping: (mapping: CogsColumnMapping[], batchCurrency?: string, batchEffectiveDate?: string) => save(services.cogs.updateMapping(environment.baseInput, batchId, mapping, environment.actor, batchCurrency, batchEffectiveDate)),
    updateDetails: (values: { reason?: string; note?: string; stage?: NonNullable<typeof query.data>['stage'] }) => save(services.cogs.updateBatchDetails(environment.baseInput, batchId, values, environment.actor)),
    reviewRow: (rowId: string, status: CogsReviewStatus) => save(services.cogs.reviewRow(environment.baseInput, batchId, rowId, status, environment.actor)),
    manualMatch: (rowId: string, productId: string) => save(services.cogs.manualMatch(environment.baseInput, batchId, rowId, productId, environment.actor)),
    acceptSafeExact: () => save(services.cogs.acceptSafeExact(environment.baseInput, batchId, environment.actor)),
    submitForApproval: () => save(services.cogs.submitForApproval(environment.baseInput, batchId, environment.actor)),
    applyBatch: (simulateFailure = false) => save(services.cogs.applyBatch(environment.baseInput, batchId, environment.actor, environment.permissions.canApprove, simulateFailure)),
    cancelBatch: () => save(services.cogs.cancelBatch(environment.baseInput, batchId, environment.actor)),
  };
}

export function useCogsAudit() {
  const environment = useCogsEnvironment();
  const query = useQuery({
    queryKey: queryKeys.cogs.audit(environment.organisationId),
    queryFn: () => services.cogs.getAuditEvents(environment.organisationId),
    enabled: environment.permissions.canViewAudit,
  });
  return { ...environment, query };
}
