import type { AnalyticsDataset, DashboardAttentionItem, DashboardRepositoryInput } from '@/src/domain/analytics';
import { prepareProfitabilityRecords, projectExpenseAllocations } from '@/src/services/analytics/analytics-aggregation';
import { financialDisclosureAllowed } from '@/src/services/mappers/financial-disclosure';

/** The existing allocator supplies the evidence; this projection adds only a scoped link. */
export function expenseAttention(dataset: AnalyticsDataset, input: DashboardRepositoryInput): DashboardAttentionItem | null {
  if (!financialDisclosureAllowed(input)) return null;
  const { context } = input;
  const accounts = input.marketplaceAccounts.filter(account => input.authorisedAccountIds.includes(account.id)
    && (context.companyId === 'all' || account.companyId === context.companyId)
    && (context.marketplace === 'all' || account.marketplace === context.marketplace)
    && (!context.marketplaceAccountIds.length || context.marketplaceAccountIds.includes(account.id)));
  const expenses = dataset.expenses.filter(expense => {
    if (expense.organisationId !== input.organisation.id || expense.occurredAt < context.dateRange.from || expense.occurredAt > context.dateRange.to) return false;
    const scope = expense.scope;
    if (scope.type === 'organisation') return true;
    if (scope.type === 'company') return accounts.some(account => account.companyId === scope.companyId);
    if (scope.type === 'marketplace') return accounts.some(account => account.marketplace === scope.marketplace);
    if (scope.type === 'marketplace_account') return accounts.some(account => account.id === scope.marketplaceAccountId);
    return dataset.listings.some(listing => listing.productId === scope.productId && accounts.some(account => account.id === listing.marketplaceAccountId));
  });
  if (!expenses.length) return null;
  const prepared = prepareProfitabilityRecords({ ...dataset, expenses: [] }, input);
  const evidence = projectExpenseAllocations(prepared, expenses).unallocated;
  if (!evidence.some(item => item.amountMinor > 0)) return null;
  const query = new URLSearchParams({ company: context.companyId, marketplace: context.marketplace,
    from: context.dateRange.from, to: context.dateRange.to, needsReview: 'true' });
  if (context.marketplaceAccountIds.length) query.set('accounts', context.marketplaceAccountIds.join(','));
  return { id: 'unallocated-expenses', title: 'Unallocated expenses need review',
    detail: 'Configured expenses have no eligible transaction on their occurrence date. Review the allocation evidence.',
    severity: 'medium', scope: 'organisation', href: `/o/${input.organisation.slug}/expenses?${query}` };
}
