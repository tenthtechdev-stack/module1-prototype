'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AccessDecision } from '@/src/domain/permissions';
import type { AnalysisContext, Company, DateRange, Marketplace, MarketplaceAccount } from '@/src/domain/models';
import { DATE_PRESET_RANGES, resolveDateRange, type DatePreset, type DatePresetKey } from '@/src/domain/date-ranges';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import type { WorkspaceSnapshot } from '@/src/services/contracts';

export interface AnalysisContextValue {
  context: AnalysisContext;
  workspace: WorkspaceSnapshot;
  scopeDecision: AccessDecision;
  authorisedCompanies: Company[];
  authorisedAccounts: MarketplaceAccount[];
  availableAccounts: MarketplaceAccount[];
  workspaceLoading: boolean;
  companyNameFor: (companyId: string) => string;
  accountNameFor: (accountId: string) => string;
  setCompany: (companyId: string | 'all') => void;
  setMarketplace: (marketplace: Marketplace | 'all') => void;
  setAccount: (accountId: string | 'all') => void;
  setDatePreset: (preset: DatePresetKey) => void;
  setDateRange: (range: DateRange) => void;
  datePreset: DatePreset;
}

interface AnalysisContextProviderProps {
  orgSlug: string;
  workspace: WorkspaceSnapshot;
  children: React.ReactNode;
}

const AnalysisContextStore = createContext<AnalysisContextValue | null>(null);
const EMPTY_ACCOUNTS: MarketplaceAccount[] = [];

export function AnalysisContextProvider({ workspace, children }: AnalysisContextProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { enabled: prototypeEnabled, assignment: prototypeAssignment, runtime } = usePrototype();
  const assignment = useMemo(() => !prototypeEnabled && workspace.activeUser ? {
    companyIds: workspace.activeUser.companyIds,
    accountIds: workspace.activeUser.marketplaceAccountIds,
  } : prototypeAssignment, [prototypeAssignment, prototypeEnabled, workspace.activeUser]);
  const allCompanies = workspace.companies;
  const allAccounts = workspace.marketplaceAccounts;

  const authorisedCompanies = useMemo(
    () => allCompanies.filter((company) => assignment.companyIds === 'all' || assignment.companyIds.includes(company.id)),
    [allCompanies, assignment],
  );
  const authorisedCompanyIds = useMemo(() => authorisedCompanies.map((company) => company.id), [authorisedCompanies]);
  const authorisedAccounts = useMemo(
    () => allAccounts.filter((account) => authorisedCompanyIds.includes(account.companyId) && (assignment.accountIds === 'all' || assignment.accountIds.includes(account.id))),
    [allAccounts, assignment, authorisedCompanyIds],
  );

  const requestedCompany = searchParams.get('company') ?? 'all';
  const companyAllowed = requestedCompany === 'all' || authorisedCompanyIds.includes(requestedCompany);
  const companyId = companyAllowed ? requestedCompany : 'all';
  const requestedMarketplace = searchParams.get('marketplace');
  const marketplace: Marketplace | 'all' = requestedMarketplace === 'amazon' || requestedMarketplace === 'ebay' || requestedMarketplace === 'temu' ? requestedMarketplace : 'all';
  const scenarioAccounts = useMemo(() => runtime.accountMode === 'none' ? EMPTY_ACCOUNTS : authorisedAccounts, [authorisedAccounts, runtime.accountMode]);
  const availableAccounts = useMemo(
    () => scenarioAccounts.filter((account) => (companyId === 'all' || account.companyId === companyId) && (marketplace === 'all' || account.marketplace === marketplace)),
    [companyId, marketplace, scenarioAccounts],
  );
  const authorisedAccountIds = useMemo(() => new Set(authorisedAccounts.map((account) => account.id)), [authorisedAccounts]);
  const availableAccountIds = useMemo(() => new Set(availableAccounts.map((account) => account.id)), [availableAccounts]);
  const requestedAccountIds = (searchParams.get('accounts') ?? searchParams.get('account') ?? '').split(',').filter(Boolean);
  const accountAllowed = requestedAccountIds.every((id) => authorisedAccountIds.has(id) && availableAccountIds.has(id));
  const marketplaceAccountIds = requestedAccountIds.filter((id) => availableAccountIds.has(id)).sort();
  const requestedDatePreset = searchParams.get('range');
  const requestedDateFrom = searchParams.get('from');
  const requestedDateTo = searchParams.get('to');
  const { datePreset, dateRange } = useMemo(() => resolveDateRange({
    range: requestedDatePreset,
    from: requestedDateFrom,
    to: requestedDateTo,
  }), [requestedDateFrom, requestedDatePreset, requestedDateTo]);
  const scopeDecision = useMemo<AccessDecision>(() => companyAllowed && accountAllowed ? { allowed: true } : { allowed: false, reason: 'assignment_out_of_scope' }, [accountAllowed, companyAllowed]);

  const context = useMemo<AnalysisContext>(() => ({
    organisationId: workspace.organisation.id,
    companyId,
    marketplace,
    marketplaceAccountIds,
    dateRange,
  }), [companyId, dateRange, marketplace, marketplaceAccountIds, workspace.organisation.id]);

  const update = useCallback((values: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(values).forEach(([key, value]) => value === null ? next.delete(key) : next.set(key, value));
    next.delete('account');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const setCompany = useCallback((value: string | 'all') => {
    const remaining = marketplaceAccountIds.filter((id) => {
      const account = allAccounts.find((item) => item.id === id);
      return account && (value === 'all' || account.companyId === value);
    });
    update({ company: value, accounts: remaining.length ? remaining.join(',') : null });
  }, [allAccounts, marketplaceAccountIds, update]);

  const setMarketplace = useCallback((value: Marketplace | 'all') => {
    const remaining = marketplaceAccountIds.filter((id) => {
      const account = allAccounts.find((item) => item.id === id);
      return account && (value === 'all' || account.marketplace === value);
    });
    update({ marketplace: value, accounts: remaining.length ? remaining.join(',') : null });
  }, [allAccounts, marketplaceAccountIds, update]);

  const value = useMemo<AnalysisContextValue>(() => ({
    context,
    workspace,
    scopeDecision,
    authorisedCompanies,
    authorisedAccounts,
    availableAccounts,
    workspaceLoading: false,
    companyNameFor: (id) => allCompanies.find((company) => company.id === id)?.name ?? 'Unknown company',
    accountNameFor: (id) => allAccounts.find((account) => account.id === id)?.displayName ?? 'Unknown account',
    setCompany,
    setMarketplace,
    setAccount: (value) => update({ accounts: value === 'all' ? null : value }),
    setDatePreset: (value) => update({
      range: value === '30d' ? null : value,
      from: DATE_PRESET_RANGES[value].from,
      to: DATE_PRESET_RANGES[value].to,
    }),
    setDateRange: (range) => update({ range: null, from: range.from, to: range.to }),
    datePreset,
  }), [allAccounts, allCompanies, authorisedAccounts, authorisedCompanies, availableAccounts, context, datePreset, scopeDecision, setCompany, setMarketplace, update, workspace]);

  return <AnalysisContextStore.Provider value={value}>{children}</AnalysisContextStore.Provider>;
}

export function useAnalysisContext() {
  const value = useContext(AnalysisContextStore);
  if (!value) throw new Error('useAnalysisContext must be used inside AnalysisContextProvider.');
  return value;
}

export function useOptionalAnalysisContext() {
  return useContext(AnalysisContextStore);
}
