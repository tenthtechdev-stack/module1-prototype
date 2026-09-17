/** Disclosure mapper only: canonical calculation and allocation results remain unchanged. */
const restrictedFields = new Set([
  'allocatedExpensesMinor', 'allocatedExpensesPence', 'netProfitMinor', 'knownNetProfitMinor',
  'netProfitPence', 'knownNetProfitPence', 'priorProfitPence', 'previousKnownNetProfitMinor',
  'previousKnownNetProfitPence', 'mostProfitableMarketplacePence', 'marginBps', 'knownMarginBps', 'previousMarginBps',
]);
/**
 * Repository response DTOs declare restricted financial values nullable. The traversal
 * also covers nested comparison, trend, export and transaction waterfall projections.
 */
export function redactFinancialDisclosure<T>(result: T, permitted: boolean): T {
  if (permitted) return result;
  function redact(value: unknown, parentKey = ''): unknown {
    if (Array.isArray(value)) return value.map((item) => redact(item));
    if (value === null || typeof value !== 'object') return value;
    const source = value as Record<string, unknown>;
    const isFinancialLine = source.key === 'netProfit' || source.key === 'allocatedExpenses' || source.key === 'margin';
    const isRestrictedMetric = parentKey === 'netProfit' || parentKey === 'margin' || parentKey === 'otherCosts';
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      if (restrictedFields.has(key)) output[key] = null;
      else if (isFinancialLine && ['amountMinor', 'previousMinor', 'deltaBps'].includes(key)) output[key] = null;
      else if (isRestrictedMetric && ['currentMinor', 'previousMinor', 'currentBps', 'previousBps'].includes(key)) output[key] = null;
      else if (isRestrictedMetric && key === 'delta') output[key] = { ...(item as object), valueBps: null };
      else if (key === 'profitabilityComparison') output[key] = { ...(item as object), available: false, reason: 'restricted_expenses' };
      else if (key === 'sensitiveExpensesVisible') output[key] = false;
      else output[key] = redact(item, key);
    }
    return output;
  }
  return redact(result) as T;
}


export function financialDisclosureAllowed(input: Pick<import('@/src/domain/analytics').DashboardRepositoryInput,
  'canViewSensitiveExpenses' | 'scenarioId' | 'organisation' | 'companies' | 'marketplaceAccounts' | 'authorisedCompanyIds' | 'authorisedAccountIds'>) {
  if (!input.canViewSensitiveExpenses || input.scenarioId === 'sensitive-expenses-restricted') return false;
  const companies = input.companies.filter((company) => company.organisationId === input.organisation.id);
  const companyIds = new Set(companies.map((company) => company.id));
  return companies.every((company) => input.authorisedCompanyIds.includes(company.id))
    && input.marketplaceAccounts.filter((account) => companyIds.has(account.companyId)).every((account) => input.authorisedAccountIds.includes(account.id));
}

