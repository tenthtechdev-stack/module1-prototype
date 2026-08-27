'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { companies, marketplaceAccounts } from '@/src/fixtures/data';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAccess } from '@/src/components/rbac/access';
import { productRepository } from '@/src/services/mock/product-repository';
import { queryKeys } from '@/src/services/query-keys';

export function useProducts() {
  const { context } = useAnalysisContext();
  const { role, scenarioId, realmKey } = usePrototype();
  const access = useAccess('products.view');
  const authorisedCompanyIds = companies.filter((company) => role.companyIds === 'all' || role.companyIds.includes(company.id)).map((company) => company.id);
  const authorisedAccountIds = marketplaceAccounts.filter((account) => authorisedCompanyIds.includes(account.companyId) && (role.accountIds === 'all' || role.accountIds.includes(account.id))).map((account) => account.id);

  const query = useQuery({
    queryKey: queryKeys.products.list({ context, search: '', page: 0, pageSize: 100, realmKey }),
    queryFn: ({ signal }) => productRepository.list({
      context,
      search: '',
      page: 0,
      pageSize: 100,
      scenarioId,
      authorisedCompanyIds,
      authorisedAccountIds,
    }, signal),
    enabled: access.allowed,
    placeholderData: keepPreviousData,
    retry: scenarioId === 'repository-error' ? false : 1,
  });

  return { access, query };
}
