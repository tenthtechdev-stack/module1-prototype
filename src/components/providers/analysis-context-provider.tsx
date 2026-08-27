'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AnalysisContext, Marketplace } from '@/src/domain/models';
import { companies, marketplaceAccounts, organisation } from '@/src/fixtures/data';
import { usePrototype } from '@/src/components/providers/prototype-provider';

interface AnalysisContextValue {
  context: AnalysisContext;
  authorisedCompanies: typeof companies;
  availableAccounts: typeof marketplaceAccounts;
  setCompany: (companyId: string | 'all') => void;
  setMarketplace: (marketplace: Marketplace | 'all') => void;
  setAccount: (accountId: string | 'all') => void;
  setDatePreset: (preset: '30d' | 'month' | 'quarter') => void;
  datePreset: '30d' | 'month' | 'quarter';
}

const AnalysisContextStore = createContext<AnalysisContextValue | null>(null);
const ranges = {
  '30d': { from: '2026-07-29', to: '2026-08-28' },
  month: { from: '2026-08-01', to: '2026-08-28' },
  quarter: { from: '2026-06-01', to: '2026-08-28' },
} as const;

export function AnalysisContextProvider({ orgSlug, children }: { orgSlug: string; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { role } = usePrototype();
  const authorisedCompanies = useMemo(() => companies.filter((company) => role.companyIds === 'all' || role.companyIds.includes(company.id)), [role]);
  const authorisedCompanyIds = useMemo(() => authorisedCompanies.map((company) => company.id), [authorisedCompanies]);
  const authorisedAccounts = useMemo(() => marketplaceAccounts.filter((account) =>
    authorisedCompanyIds.includes(account.companyId) && (role.accountIds === 'all' || role.accountIds.includes(account.id))), [authorisedCompanyIds, role]);

  const requestedCompany = searchParams.get('company') ?? 'all';
  const companyId = requestedCompany === 'all' || authorisedCompanyIds.includes(requestedCompany) ? requestedCompany : 'all';
  const requestedMarketplace = searchParams.get('marketplace');
  const marketplace: Marketplace | 'all' = requestedMarketplace === 'amazon' || requestedMarketplace === 'ebay' || requestedMarketplace === 'temu' ? requestedMarketplace : 'all';
  const availableAccounts = useMemo(() => authorisedAccounts.filter((account) =>
    (companyId === 'all' || account.companyId === companyId) &&
    (marketplace === 'all' || account.marketplace === marketplace)), [authorisedAccounts, companyId, marketplace]);
  const allowedAccountIds = useMemo(() => new Set(availableAccounts.map((account) => account.id)), [availableAccounts]);
  const marketplaceAccountIds = (searchParams.get('accounts') ?? searchParams.get('account') ?? '')
    .split(',')
    .filter((id) => id && allowedAccountIds.has(id))
    .sort();
  const datePreset = (searchParams.get('range') === 'month' || searchParams.get('range') === 'quarter' ? searchParams.get('range') : '30d') as '30d' | 'month' | 'quarter';

  const context = useMemo<AnalysisContext>(() => ({
    organisationId: orgSlug === organisation.slug ? organisation.id : `org-${orgSlug}`,
    companyId,
    marketplace,
    marketplaceAccountIds,
    dateRange: ranges[datePreset],
  }), [companyId, datePreset, marketplace, marketplaceAccountIds, orgSlug]);

  const update = useCallback((values: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(values).forEach(([key, value]) => value === null ? next.delete(key) : next.set(key, value));
    next.delete('account');
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const setCompany = useCallback((value: string | 'all') => {
    const remaining = marketplaceAccountIds.filter((id) => {
      const account = marketplaceAccounts.find((item) => item.id === id);
      return account && (value === 'all' || account.companyId === value);
    });
    update({ company: value, accounts: remaining.length ? remaining.join(',') : null });
  }, [marketplaceAccountIds, update]);

  const setMarketplace = useCallback((value: Marketplace | 'all') => {
    const remaining = marketplaceAccountIds.filter((id) => {
      const account = marketplaceAccounts.find((item) => item.id === id);
      return account && (value === 'all' || account.marketplace === value);
    });
    update({ marketplace: value, accounts: remaining.length ? remaining.join(',') : null });
  }, [marketplaceAccountIds, update]);

  const setAccount = useCallback((value: string | 'all') => update({ accounts: value === 'all' ? null : value }), [update]);
  const setDatePreset = useCallback((value: '30d' | 'month' | 'quarter') => update({ range: value === '30d' ? null : value, from: ranges[value].from, to: ranges[value].to }), [update]);

  const value = useMemo<AnalysisContextValue>(() => ({
    context,
    authorisedCompanies,
    availableAccounts,
    setCompany,
    setMarketplace,
    setAccount,
    setDatePreset,
    datePreset,
  }), [authorisedCompanies, availableAccounts, context, datePreset, setAccount, setCompany, setDatePreset, setMarketplace]);

  return <AnalysisContextStore.Provider value={value}>{children}</AnalysisContextStore.Provider>;
}

export function useAnalysisContext() {
  const value = useContext(AnalysisContextStore);
  if (!value) throw new Error('useAnalysisContext must be used inside AnalysisContextProvider.');
  return value;
}
