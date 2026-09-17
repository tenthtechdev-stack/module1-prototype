import { financialDisclosureAllowed } from '@/src/services/mappers/financial-disclosure';
import type { AnalyticsDataset, DashboardFinancialTotals } from '@/src/domain/analytics';
import type { Expense } from '@/src/domain/models';
import { bucketKey, percentageDeltaBps, marginPointDeltaBps, previousEquivalentPeriod, safeRatioBps } from '@/src/domain/financial-calculations';
import { resolveProductGroupMembership } from '@/src/domain/product-groups';
import { OPERATIONAL_REPORT_DISCLAIMER, REPORT_DIMENSIONS, REPORT_TITLES, type ReportColumn, type ReportDimension, type ReportFinancialTotals, type ReportResult, type ReportRow, type ReportStatementRow } from '@/src/domain/reports';
import type { ProfitabilityTransaction } from '@/src/domain/transactions';
import type { ReportQuery } from '@/src/services/reports-contracts';
import { getScenarioRuntime } from '@/src/fixtures/scenarios';
import { calculateDashboardTotals, expenseReportingMinor, prepareProfitabilityRecords, profitabilityComparisonStatus, projectExpenseAllocations } from './analytics-aggregation';
import { createTransactionAnalyticsSnapshot, transactionSourceEvents, TRANSACTION_ALLOCATION_NOTE, TRANSACTION_REFUND_NOTE, type TransactionAnalyticsSnapshot } from './transaction-aggregation';

const labels = { amazon: 'Amazon', ebay: 'eBay', temu: 'Temu' };
const column = (key: string, label: string, format: ReportColumn['format'] = 'text'): ReportColumn => ({ key, label, format });
const money = (key: string, label: string) => column(key, label, 'money');
const financialColumns = [column('units', 'Units', 'number'), money('revenueMinor', 'Revenue'), money('refundsMinor', 'Refunds'), money('cogsKnownMinor', 'Known COGS'), money('marketplaceFeesMinor', 'Fees'), money('advertisingKnownMinor', 'Known Advertising'), money('shippingMinor', 'Shipping'), money('otherDirectCostsMinor', 'Other Direct Costs'), money('allocatedExpensesMinor', 'Allocated Expenses'), money('knownNetProfitMinor', 'Known Net Profit'), column('knownMarginBps', 'Known Margin', 'percent'), column('profitabilityCoverageBps', 'Profitability Coverage', 'percent')];
const identityColumns = [column('transactionDate', 'Date', 'date'), column('marketplace', 'Marketplace'), column('marketplaceAccountName', 'Account'), column('marketplaceOrderId', 'Order'), column('title', 'Product'), column('internalSku', 'Internal SKU'), column('productGroupName', 'Product Group')];

/** Report DTOs omit covered internals; no restricted deduction is recoverable from profit. */
function publicTotals(totals: DashboardFinancialTotals, transactions: number, sensitive: boolean): ReportFinancialTotals {
  const { covered: _covered, ...result } = totals;
  void _covered;
  return { ...result, transactions, allocatedExpensesMinor: sensitive ? totals.allocatedExpensesMinor : null,
    grossProfitKnownMinor: sensitive ? totals.grossProfitKnownMinor : null,
    knownNetProfitMinor: sensitive ? totals.knownNetProfitMinor : null, netProfitMinor: sensitive ? totals.netProfitMinor : null,
    marginBps: sensitive ? totals.marginBps : null, knownMarginBps: sensitive ? totals.knownMarginBps : null };
}

function snapshotFor(dataset: AnalyticsDataset, query: ReportQuery) {
  const snapshot = createTransactionAnalyticsSnapshot(dataset, query);
  const memberships = Object.values(snapshot.groupState.membershipsByGroup).flat();
  // Reporting identity follows the membership date, independently of direct COGS precedence.
  snapshot.transactions = snapshot.transactions.map((transaction) => {
    const membership = resolveProductGroupMembership(memberships, transaction.transactionDate, transaction.productId);
    const group = membership ? snapshot.groupState.groups[membership.groupId] : null;
    const valid = group && group.organisationId === query.organisation.id && group.companyId === transaction.companyId;
    return { ...transaction, productGroupId: valid ? group.id : null, productGroupName: valid ? group.name : null };
  });
  return snapshot;
}
function selectTransactions(snapshot: TransactionAnalyticsSnapshot, query: ReportQuery) {
  const productIds = new Set([...(query.productIds ?? []), ...(query.productId ? [query.productId] : [])].filter((id) => id !== 'all'));
  const groupIds = new Set([...(query.productGroupIds ?? []), ...(query.productGroupId ? [query.productGroupId] : [])].filter((id) => id !== 'all'));
  return snapshot.transactions.filter((row) => (!productIds.size || productIds.has(row.productId))
    && (!groupIds.size || groupIds.has(row.productGroupId ?? 'ungrouped'))
    && (!query.completeness || query.completeness === 'all' || (row.completenessState === 'complete') === (query.completeness === 'complete'))
    && (query.kind === 'expenses' || query.kind === 'fees' || !query.search || `${row.title} ${row.internalSku} ${row.productGroupName ?? 'Ungrouped'} ${row.companyName} ${row.marketplaceAccountName} ${row.marketplaceOrderId}`.toLowerCase().includes(query.search.toLowerCase())));
}
function totalsFor(snapshot: TransactionAnalyticsSnapshot, rows: ProfitabilityTransaction[]) {
  const ids = new Set(rows.map((row) => row.id));
  return calculateDashboardTotals(snapshot.lines.filter((line) => ids.has(line.id)));
}
function transactionValues(row: ProfitabilityTransaction, sensitive: boolean) {
  return { transactionDate: row.transactionDate, companyId: row.companyId, companyName: row.companyName,
    marketplace: row.marketplace, marketplaceAccountId: row.marketplaceAccountId, accountId: row.marketplaceAccountId,
    marketplaceAccountName: row.marketplaceAccountName, marketplaceOrderId: row.marketplaceOrderId, title: row.title, internalSku: row.internalSku,
    productGroupName: row.productGroupName ?? 'Ungrouped', units: row.quantity, revenueMinor: row.revenueMinor, refundsMinor: row.refundsMinor,
    netRevenueMinor: row.netRevenueMinor, cogsKnownMinor: row.cogsMinor, marketplaceFeesMinor: row.marketplaceFeesMinor,
    advertisingKnownMinor: row.advertisingMinor, shippingMinor: row.shippingMinor, otherDirectCostsMinor: row.otherDirectCostsMinor,
    allocatedExpensesMinor: sensitive ? row.allocatedExpensesMinor : null, knownNetProfitMinor: sensitive ? row.knownNetProfitMinor : null,
    knownMarginBps: sensitive ? row.knownMarginBps : null, profitabilityCoverageBps: row.profitabilityCoverageBps,
    cogsSource: row.cogsSourceLabel, completeness: row.completenessState, syncStatus: row.freshness.label };
}
function dimension(row: ProfitabilityTransaction, groupBy: ReportDimension) {
  switch (groupBy) {
    case 'company': return { id: row.companyId, label: row.companyName };
    case 'marketplace': return { id: row.marketplace, label: labels[row.marketplace] };
    case 'account': return { id: row.marketplaceAccountId, label: row.marketplaceAccountName };
    case 'product-group': return { id: row.productGroupId ?? 'ungrouped', label: row.productGroupName ?? 'Ungrouped' };
    case 'sku': return { id: row.productId, label: row.internalSku };
    case 'date': return { id: row.transactionDate, label: row.transactionDate };
    case 'week': { const key = bucketKey(row.transactionDate, 'week'); return { id: key, label: `Week of ${key}` }; }
    case 'month': { const key = bucketKey(row.transactionDate, 'month'); return { id: key, label: key }; }
    default: return { id: row.productId, label: row.title };
  }
}
function financialRows(snapshot: TransactionAnalyticsSnapshot, selected: ProfitabilityTransaction[], query: ReportQuery, groupBy: ReportDimension): ReportRow[] {
  if (groupBy === 'none') return selected.map((row) => ({ id: row.id, label: row.title, transactionId: row.id, productId: row.productId, productGroupId: row.productGroupId ?? undefined, values: transactionValues(row, query.canViewSensitiveExpenses) }));
  const groups = new Map<string, { label: string; rows: ProfitabilityTransaction[] }>();
  selected.forEach((row) => { const group = dimension(row, groupBy); const entry = groups.get(group.id) ?? { label: group.label, rows: [] }; entry.rows.push(row); groups.set(group.id, entry); });
  return [...groups].map(([id, group]) => {
    const first = group.rows[0];
    const totals = publicTotals(totalsFor(snapshot, group.rows), group.rows.length, query.canViewSensitiveExpenses);
    const groupNames = [...new Set(group.rows.map((row) => row.productGroupName ?? 'Ungrouped'))];
    return { id, label: group.label, productId: groupBy === 'product' || groupBy === 'sku' ? first.productId : undefined,
      productGroupId: groupBy === 'product-group' && id !== 'ungrouped' ? id : undefined,
      values: { ...Object.fromEntries(Object.entries(totals).filter(([, value]) => typeof value !== 'boolean')), internalSku: ['product', 'sku'].includes(groupBy) ? first.internalSku : '',
        companyName: ['product', 'sku'].includes(groupBy) ? first.companyName : '',
        productGroupName: groupNames.join('; '), marketplaceCount: new Set(group.rows.map((row) => row.marketplace)).size,
        companyId: groupBy === 'company' ? id : null, marketplace: groupBy === 'marketplace' ? id : null,
        accountId: groupBy === 'account' ? id : null, marketplaceAccountId: groupBy === 'account' ? id : null,
        syncStatus: [...new Set(group.rows.map((row) => row.freshness.label))].join('; ') } as ReportRow['values'] };
  });
}

interface FeeRecord { transaction: ProfitabilityTransaction; type: string; amount: number; row: ReportRow }
function feeRecords(snapshot: TransactionAnalyticsSnapshot, selected: ProfitabilityTransaction[], query: ReportQuery): FeeRecord[] {
  const rows = new Map(selected.map((row) => [row.id, row]));
  return snapshot.lines.flatMap((line) => {
    const transaction = rows.get(line.id); if (!transaction) return [];
    return transactionSourceEvents(line).filter((event) => event.component === 'marketplaceFees').flatMap((event) => {
      if (query.feeType && query.feeType !== 'all' && query.feeType !== event.label) return [];
      if (query.search && !`${event.label} ${transaction.title} ${transaction.internalSku} ${transaction.marketplaceOrderId} ${event.sourceReference}`.toLowerCase().includes(query.search.toLowerCase())) return [];
      const amount = -event.reportingAmountMinor;
      return [{ transaction, type: event.label, amount, row: { id: event.id, label: event.label, transactionId: transaction.id, productId: transaction.productId,
        productGroupId: transaction.productGroupId ?? undefined, values: { ...transactionValues(transaction, query.canViewSensitiveExpenses), feeType: event.label,
          sourceReference: event.sourceReference, sourceCurrency: event.currency, sourceAmountMinor: -event.amountMinor, reportingAmountMinor: amount } } }];
    });
  });
}
function feeRows(records: FeeRecord[], groupBy: ReportDimension): ReportRow[] {
  if (groupBy === 'none') return records.map((record) => record.row);
  const groups = new Map<string, ReportRow>();
  records.forEach((record) => {
    const key = groupBy === 'fee-type' ? { id: record.type, label: record.type } : dimension(record.transaction, groupBy);
    const row = groups.get(key.id) ?? { id: key.id, label: key.label, productId: ['product', 'sku'].includes(groupBy) ? record.transaction.productId : undefined,
      productGroupId: groupBy === 'product-group' ? record.transaction.productGroupId ?? undefined : undefined,
      values: { reportingAmountMinor: 0, feeEvents: 0, companyId: groupBy === 'company' ? key.id : null, marketplace: groupBy === 'marketplace' ? key.id : null, accountId: groupBy === 'account' ? key.id : null } };
    row.values.reportingAmountMinor = Number(row.values.reportingAmountMinor) + record.amount;
    row.values.feeEvents = Number(row.values.feeEvents) + 1;
    groups.set(key.id, row);
  });
  return [...groups.values()];
}


function expenseReadable(expense: Expense, dataset: AnalyticsDataset, query: ReportQuery) {
  if (expense.organisationId !== query.organisation.id || expense.sensitive && !query.canViewSensitiveExpenses) return false;
  const scope = expense.scope;
  const accounts = query.marketplaceAccounts.filter((account) => query.companies.some((company) => company.id === account.companyId && company.organisationId === query.organisation.id));
  const allowed = (id: string) => query.authorisedAccountIds.includes(id);
  if (scope.type === 'organisation') return query.companies.every((company) => query.authorisedCompanyIds.includes(company.id)) && accounts.every((account) => allowed(account.id));
  if (scope.type === 'company') return query.authorisedCompanyIds.includes(scope.companyId) && accounts.filter((account) => account.companyId === scope.companyId).every((account) => allowed(account.id));
  if (scope.type === 'marketplace') return accounts.some((account) => account.marketplace === scope.marketplace) && accounts.filter((account) => account.marketplace === scope.marketplace).every((account) => allowed(account.id));
  if (scope.type === 'marketplace_account') return allowed(scope.marketplaceAccountId);
  const product = dataset.products.find((item) => item.id === scope.productId && item.organisationId === query.organisation.id);
  return Boolean(product && query.authorisedCompanyIds.includes(product.ownerCompanyId) && dataset.listings.filter((listing) => listing.productId === product.id).every((listing) => allowed(listing.marketplaceAccountId)));
}
function scopeLabel(expense: Expense, dataset: AnalyticsDataset, query: ReportQuery) {
  const scope = expense.scope;
  if (scope.type === 'organisation') return query.organisation.name;
  if (scope.type === 'company') return query.companies.find((company) => company.id === scope.companyId)?.name ?? 'Company';
  if (scope.type === 'marketplace') return labels[scope.marketplace];
  if (scope.type === 'marketplace_account') return query.marketplaceAccounts.find((account) => account.id === scope.marketplaceAccountId)?.displayName ?? 'Marketplace Account';
  return dataset.products.find((product) => product.id === scope.productId)?.title ?? 'Product';
}
function expenseMatchesQuery(expense: Expense, query: ReportQuery) {
  return (!query.category || query.category === 'all' || query.category === expense.category)
    && (!query.expenseType || query.expenseType === 'all' || query.expenseType === (expense.expenseType ?? 'one-off'))
    && (!query.search || `${expense.name ?? expense.category} ${expense.category}`.toLowerCase().includes(query.search.toLowerCase()));
}
function expenseInContext(expense: Expense, dataset: AnalyticsDataset, snapshot: TransactionAnalyticsSnapshot, query: ReportQuery) {
  const scope = expense.scope;
  const productIds = new Set([...(query.productIds ?? []), ...(query.productId && query.productId !== 'all' ? [query.productId] : [])]);
  const groupIds = new Set([...(query.productGroupIds ?? []), ...(query.productGroupId && query.productGroupId !== 'all' ? [query.productGroupId] : [])]);
  const memberships = Object.values(snapshot.groupState.membershipsByGroup).flat();
  const products = dataset.products.filter((product) => product.organisationId === query.organisation.id && query.authorisedCompanyIds.includes(product.ownerCompanyId)
    && (query.context.companyId === 'all' || query.context.companyId === product.ownerCompanyId) && (!productIds.size || productIds.has(product.id))
    && (!groupIds.size || groupIds.has(resolveProductGroupMembership(memberships, expense.occurredAt.slice(0, 10), product.id)?.groupId ?? 'ungrouped')));
  const accounts = query.marketplaceAccounts.filter((account) => query.authorisedAccountIds.includes(account.id)
    && (query.context.companyId === 'all' || query.context.companyId === account.companyId)
    && (query.context.marketplace === 'all' || query.context.marketplace === account.marketplace)
    && (!query.context.marketplaceAccountIds.length || query.context.marketplaceAccountIds.includes(account.id)));
  const eligibleListings = dataset.listings.filter((listing) => products.some((product) => product.id === listing.productId) && accounts.some((account) => account.id === listing.marketplaceAccountId));
  if (scope.type === 'organisation') return accounts.length > 0 && products.length > 0;
  if (scope.type === 'company') return products.some((product) => product.ownerCompanyId === scope.companyId) && accounts.some((account) => account.companyId === scope.companyId);
  if (scope.type === 'marketplace') return eligibleListings.some((listing) => listing.marketplace === scope.marketplace);
  if (scope.type === 'marketplace_account') return eligibleListings.some((listing) => listing.marketplaceAccountId === scope.marketplaceAccountId);
  return products.some((product) => product.id === scope.productId) && eligibleListings.some((listing) => listing.productId === scope.productId);
}
function expenseProjection(dataset: AnalyticsDataset, snapshot: TransactionAnalyticsSnapshot, selected: ProfitabilityTransaction[], query: ReportQuery) {
  const prepared = prepareProfitabilityRecords({ ...dataset, expenses: [] }, query);
  const projection = projectExpenseAllocations(prepared, dataset.expenses);
  const selectedIds = new Set(selected.map((row) => row.id));
  const parentTransactions = new Map<string, ProfitabilityTransaction>();
  const txById = new Map(selected.map((row) => [row.id, row]));
  snapshot.lines.filter((line) => selectedIds.has(line.id)).forEach((line) => { parentTransactions.set(line.parentRecordId, txById.get(line.id)!); });
  const occurrences = dataset.expenses.filter((expense) => expense.occurredAt.slice(0, 10) >= query.context.dateRange.from && expense.occurredAt.slice(0, 10) <= query.context.dateRange.to
    && expenseReadable(expense, dataset, query) && expenseInContext(expense, dataset, snapshot, query) && expenseMatchesQuery(expense, query));
  const byExpense = new Map(occurrences.map((expense) => [expense.id, expense]));
  const allocations = projection.allocations.flatMap((allocation) => {
    const expense = byExpense.get(allocation.expenseId); const transaction = parentTransactions.get(allocation.recordId);
    return expense && transaction ? [{ ...allocation, expense, transaction }] : [];
  });
  const unallocated = projection.unallocated.filter((item) => byExpense.has(item.expenseId));
  return { occurrences, allocations, unallocated, summary: {
    configuredMinor: occurrences.reduce((sum, expense) => sum + expenseReportingMinor(expense), 0),
    allocatedMinor: allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0),
    unallocatedMinor: unallocated.reduce((sum, item) => sum + item.amountMinor, 0),
  } };
}
type ExpenseProjection = ReturnType<typeof expenseProjection>;
function expenseRows(projection: ExpenseProjection, dataset: AnalyticsDataset, query: ReportQuery, groupBy: ReportDimension): ReportRow[] {
  const allocated = query.expenseView === 'allocated';
  if (groupBy === 'none' && !allocated) return projection.occurrences.map((expense) => ({ id: expense.id, label: expense.name ?? expense.category, expenseId: expense.expenseDefinitionId ?? expense.id,
    values: { category: expense.category, type: expense.expenseType ?? 'one-off', scope: scopeLabel(expense, dataset, query), amountMinor: expense.amountMinor,
      currency: expense.currency, reportingAmountMinor: expenseReportingMinor(expense), effectivePeriod: expense.occurredAt.slice(0, 10),
      status: projection.unallocated.some((item) => item.expenseId === expense.id) ? 'Unallocated' : 'Applied',
      sensitivity: expense.sensitive ? 'Sensitive' : 'Standard',
      allocatedMinor: projection.allocations.filter((item) => item.expenseId === expense.id).reduce((sum, item) => sum + item.amountMinor, 0),
      unallocatedMinor: projection.unallocated.filter((item) => item.expenseId === expense.id).reduce((sum, item) => sum + item.amountMinor, 0) } }));
  if (groupBy === 'none') return projection.allocations.map((allocation) => ({ id: `${allocation.expenseId}:${allocation.recordId}`, label: allocation.expense.name ?? allocation.expense.category,
    expenseId: allocation.expense.expenseDefinitionId ?? allocation.expense.id, productId: allocation.transaction.productId,
    productGroupId: allocation.transaction.productGroupId ?? undefined, values: { companyName: allocation.transaction.companyName, marketplace: allocation.transaction.marketplace,
      marketplaceAccountName: allocation.transaction.marketplaceAccountName, title: allocation.transaction.title, productGroupName: allocation.transaction.productGroupName ?? 'Ungrouped',
      category: allocation.expense.category, type: allocation.expense.expenseType ?? 'one-off', scope: scopeLabel(allocation.expense, dataset, query),
      transactionDate: allocation.transaction.transactionDate, allocatedMinor: allocation.amountMinor, allocationBasis: 'Net Revenue within eligible scope on the expense date' } }));
  const rows = new Map<string, ReportRow>();
  if (groupBy === 'expense-category' || groupBy === 'expense-type') {
    projection.occurrences.forEach((expense) => {
      const id = groupBy === 'expense-category' ? expense.category : expense.expenseType ?? 'one-off';
      const row = rows.get(id) ?? { id, label: id, values: { reportingAmountMinor: 0, allocatedMinor: 0, unallocatedMinor: 0, expenseCount: 0 } };
      row.values.reportingAmountMinor = Number(row.values.reportingAmountMinor) + expenseReportingMinor(expense);
      row.values.expenseCount = Number(row.values.expenseCount) + 1;
      row.values.allocatedMinor = Number(row.values.allocatedMinor) + projection.allocations.filter((item) => item.expenseId === expense.id).reduce((sum, item) => sum + item.amountMinor, 0);
      row.values.unallocatedMinor = Number(row.values.unallocatedMinor) + projection.unallocated.filter((item) => item.expenseId === expense.id).reduce((sum, item) => sum + item.amountMinor, 0);
      rows.set(id, row);
    });
  } else {
    // Entity dimensions describe allocations, never a new ownership scope.
    projection.allocations.forEach((allocation) => {
      const group = dimension(allocation.transaction, groupBy);
      const row = rows.get(group.id) ?? { id: group.id, label: group.label,
        productId: groupBy === 'product' ? allocation.transaction.productId : undefined,
        productGroupId: groupBy === 'product-group' ? allocation.transaction.productGroupId ?? undefined : undefined,
        values: { allocatedMinor: 0, companyId: groupBy === 'company' ? group.id : null, marketplace: groupBy === 'marketplace' ? group.id : null, accountId: groupBy === 'account' ? group.id : null } };
      row.values.allocatedMinor = Number(row.values.allocatedMinor) + allocation.amountMinor; rows.set(group.id, row);
    });
  }
  return [...rows.values()];
}

function reportColumns(kind: ReportQuery['kind'], groupBy: ReportDimension, expenseView: ReportQuery['expenseView']): ReportColumn[] {
  const entity = column('label', groupBy === 'none' ? kind === 'fees' ? 'Fee' : kind === 'expenses' ? 'Expense' : 'Product' : groupBy.replaceAll('-', ' '));
  if (kind === 'p-and-l') return [];
  if (kind === 'fees') return groupBy === 'none' ? [entity, ...identityColumns, column('feeType', 'Fee Type'), column('sourceReference', 'Source Reference'), column('sourceCurrency', 'Source Currency'), column('sourceAmountMinor', 'Source Amount (minor units)', 'number'), money('reportingAmountMinor', 'Fee Amount (GBP)')]
    : [entity, money('reportingAmountMinor', 'Fee Amount'), column('feeEvents', 'Fee Events', 'number')];
  if (kind === 'expenses') {
    if (groupBy !== 'none') return [entity, ...(groupBy === 'expense-category' || groupBy === 'expense-type' ? [column('expenseCount', 'Expenses', 'number'), money('reportingAmountMinor', 'Configured Amount')] : []), money('allocatedMinor', 'Allocated Amount'), ...(groupBy === 'expense-category' || groupBy === 'expense-type' ? [money('unallocatedMinor', 'Unallocated Amount')] : [])];
    return expenseView === 'allocated'
      ? [entity, column('category', 'Category'), column('type', 'Type'), column('companyName', 'Company'), column('marketplace', 'Marketplace'), column('marketplaceAccountName', 'Account'), column('title', 'Product'), column('productGroupName', 'Product Group'), column('transactionDate', 'Allocation Date', 'date'), money('allocatedMinor', 'Allocated Amount'), column('allocationBasis', 'Allocation Basis')]
      : [entity, column('category', 'Category'), column('type', 'Type'), column('scope', 'Scope'), column('amountMinor', 'Source Amount (minor units)', 'number'), column('currency', 'Source Currency'), money('reportingAmountMinor', 'Reporting Amount (GBP)'), column('effectivePeriod', 'Effective Date', 'date'), column('status', 'Status'), column('sensitivity', 'Sensitivity'), money('allocatedMinor', 'Allocated Amount'), money('unallocatedMinor', 'Unallocated Amount')];
  }
  if (kind === 'refunds') return groupBy === 'none'
    ? [entity, ...identityColumns, column('refundState', 'Refund Status'), money('refundsMinor', 'Refund Amount'), money('revenueImpactMinor', 'Revenue Impact'), column('refundRateBps', 'Refund Rate', 'percent'), money('knownNetProfitMinor', 'Known Net Profit'), column('sourceReference', 'Source Reference')]
    : [entity, money('refundsMinor', 'Refund Amount'), column('refundedOrders', 'Refunded Sales', 'number'), column('refundRateBps', 'Refund Rate', 'percent'), money('knownNetProfitMinor', 'Known Net Profit'), column('profitabilityCoverageBps', 'Profitability Coverage', 'percent')];
  return groupBy === 'none' ? [entity, ...identityColumns, ...financialColumns, column('cogsSource', 'COGS Source'), column('completeness', 'Completeness'), column('syncStatus', 'Sync Status')]
    : [entity, ...(['product', 'sku', 'product-group'].includes(groupBy) ? [column('internalSku', 'Internal SKU'), column('productGroupName', 'Product Group')] : []), ...financialColumns, column('refundRateBps', 'Refund Rate', 'percent'), column('marketplaceCount', 'Marketplaces', 'number'), column('syncStatus', 'Sync Status')];
}

function statementFor(current: DashboardFinancialTotals, previous: DashboardFinancialTotals | null, snapshot: TransactionAnalyticsSnapshot,
  selected: ProfitabilityTransaction[], priorSnapshot: TransactionAnalyticsSnapshot | null, priorSelected: ProfitabilityTransaction[],
  expenses: ExpenseProjection, priorExpenses: ExpenseProjection | null, sensitive: boolean): ReportStatementRow[] {
  const profitComparable = Boolean(sensitive && previous && profitabilityComparisonStatus(current, previous).available);
  const line = (key: string, label: string, amount: number | null, prior: number | null, operation: ReportStatementRow['operation'], complete = true, reportKind?: ReportQuery['kind'], comparable = true, format?: 'percent'): ReportStatementRow => ({
    key, label, amountMinor: amount, previousMinor: previous && comparable ? prior : null,
    deltaBps: previous && comparable ? format === 'percent' ? marginPointDeltaBps(amount, prior) : percentageDeltaBps(amount, prior) : null,
    operation, complete, reportKind, format,
  });
  const cogsRows = (rows: ProfitabilityTransaction[], source: string) => rows.filter((row) => row.cogsSource === source).reduce((total, row) => total + (row.cogsMinor ?? 0), 0);
  const cogs = line('cogs', 'COGS', current.cogsKnownMinor, previous?.cogsKnownMinor ?? null, 'subtract', current.cogsCoverageBps === 10000, 'product-profitability', !previous || current.cogsCoverageBps === previous.cogsCoverageBps);
  cogs.children = ['direct', 'inherited'].map((source) => line(`cogs-${source}`, source === 'direct' ? 'Direct Product COGS' : 'Inherited Product Group COGS', cogsRows(selected, source), previous ? cogsRows(priorSelected, source) : null, 'subtract', current.cogsCoverageBps === 10000, 'product-profitability', !previous || current.cogsCoverageBps === previous.cogsCoverageBps));
  const fees = line('marketplaceFees', 'Marketplace Fees', current.marketplaceFeesMinor, previous?.marketplaceFeesMinor ?? null, 'subtract', true, 'fees');
  const feeTotals = (source: TransactionAnalyticsSnapshot | null, rows: ProfitabilityTransaction[]) => {
    const ids = new Set(rows.map((row) => row.id)), totals = new Map<string, number>();
    source?.lines.filter((row) => ids.has(row.id)).forEach((row) => transactionSourceEvents(row).filter((event) => event.component === 'marketplaceFees').forEach((event) => totals.set(event.label, (totals.get(event.label) ?? 0) - event.reportingAmountMinor)));
    return totals;
  };
  const feeCurrent = feeTotals(snapshot, selected), feePrevious = feeTotals(priorSnapshot, priorSelected);
  fees.children = [...new Set([...feeCurrent.keys(), ...feePrevious.keys()])].sort().map((type) => line(`fee-${type}`, type, feeCurrent.get(type) ?? 0, previous ? feePrevious.get(type) ?? 0 : null, 'subtract', true, 'fees'));
  const expenseLine = line('allocatedExpenses', sensitive ? 'Allocated Expenses' : 'Restricted Expenses', sensitive ? current.allocatedExpensesMinor : null, sensitive ? previous?.allocatedExpensesMinor ?? null : null, 'subtract', sensitive, 'expenses');
  if (sensitive) {
    const byCategory = (projection: ExpenseProjection | null) => {
      const result = new Map<string, number>();
      projection?.allocations.forEach((allocation) => result.set(allocation.expense.category, (result.get(allocation.expense.category) ?? 0) + allocation.amountMinor));
      return result;
    };
    const now = byCategory(expenses), before = byCategory(priorExpenses);
    expenseLine.children = [...new Set([...now.keys(), ...before.keys()])].sort().map((category) => line(`expense-${category}`, category, now.get(category) ?? 0, previous ? before.get(category) ?? 0 : null, 'subtract', true, 'expenses'));
  }
  return [line('revenue', 'Revenue', current.revenueMinor, previous?.revenueMinor ?? null, 'start', true, 'transactions'),
    line('refunds', 'Refunds', current.refundsMinor, previous?.refundsMinor ?? null, 'subtract', true, 'refunds'),
    line('netRevenue', 'Net Revenue', current.netRevenueMinor, previous?.netRevenueMinor ?? null, 'subtotal'), cogs,
    line('grossProfit', current.cogsCoverageBps === 10000 ? 'Gross Profit' : 'Known Gross Profit', current.grossProfitKnownMinor, previous?.grossProfitKnownMinor ?? null, 'subtotal', current.cogsCoverageBps === 10000, undefined, !previous || current.cogsCoverageBps === previous.cogsCoverageBps), fees,
    line('advertising', 'Advertising', current.advertisingKnownMinor, previous?.advertisingKnownMinor ?? null, 'subtract', current.advertisingCoverageBps === 10000, 'transactions', !previous || current.advertisingCoverageBps === previous.advertisingCoverageBps),
    line('shipping', 'Shipping', current.shippingMinor, previous?.shippingMinor ?? null, 'subtract', true, 'transactions'),
    line('otherDirectCosts', 'Other Direct Costs', current.otherDirectCostsMinor, previous?.otherDirectCostsMinor ?? null, 'subtract', true, 'transactions'), expenseLine,
    line('netProfit', current.profitabilityComplete ? 'Net Profit' : 'Known Net Profit', sensitive ? current.knownNetProfitMinor : null, sensitive ? previous?.knownNetProfitMinor ?? null : null, 'result', current.profitabilityComplete && sensitive, 'transactions', profitComparable),
    line('margin', current.profitabilityComplete ? 'Margin' : 'Known Margin', sensitive ? current.knownMarginBps : null, sensitive ? previous?.knownMarginBps ?? null : null, 'result', current.profitabilityComplete && sensitive, undefined, profitComparable, 'percent')];
}

/** Projection of the canonical transaction snapshot. No report-specific financial engine. */
export function aggregateReport(dataset: AnalyticsDataset, query: ReportQuery, exportAll = false): ReportResult {
  const sensitive = financialDisclosureAllowed(query);
  const snapshot = snapshotFor(dataset, query);
  const scoped = selectTransactions(snapshot, query);
  const selected = query.kind === 'refunds' ? scoped.filter((row) => row.refundsMinor > 0) : scoped;
  const current = totalsFor(snapshot, selected);
  const expenses = expenseProjection(dataset, snapshot, selected, query);
  const groupBy = query.groupBy && REPORT_DIMENSIONS[query.kind].includes(query.groupBy) ? query.groupBy : REPORT_DIMENSIONS[query.kind][0];
  const safeQuery = { ...query, canViewSensitiveExpenses: sensitive };
  const fees = query.kind === 'fees' ? feeRecords(snapshot, selected, safeQuery) : [];
  const columns = reportColumns(query.kind, groupBy, query.expenseView);
  let rows = query.kind === 'p-and-l' ? [] : query.kind === 'expenses' ? expenseRows(expenses, dataset, query, groupBy)
    : query.kind === 'fees' ? feeRows(fees, groupBy) : financialRows(snapshot, selected, safeQuery, groupBy);
  if (query.kind === 'refunds' && groupBy === 'none') {
    const sources = new Map(snapshot.lines.map((line) => [line.id, line]));
    const transactions = new Map(selected.map((row) => [row.id, row]));
    rows = rows.map((row) => { const transaction = transactions.get(row.id)!; const event = transactionSourceEvents(sources.get(row.id)!).find((item) => item.component === 'refunds');
      return { ...row, values: { ...row.values, refundState: transaction.refundState, revenueImpactMinor: -transaction.refundsMinor, refundRateBps: safeRatioBps(transaction.refundsMinor, transaction.revenueMinor), sourceReference: event?.sourceReference ?? '', sourceCurrency: event?.currency ?? transaction.sourceCurrency, sourceAmountMinor: event ? -event.amountMinor : null } };
    });
  }
  rows = rows.map((row) => ({ ...row, values: { ...row.values, label: row.label } }));
  const allowedSort = new Set(['label', ...columns.map((item) => item.key)]);
  const sorting = query.sorting?.filter((item) => allowedSort.has(item.field)) ?? [];
  rows.sort((left, right) => {
    for (const sort of sorting.length ? sorting : [{ field: 'label', direction: 'asc' }]) {
      const a = left.values[sort.field], b = right.values[sort.field];
      if (a == null && b != null) return 1;
      if (b == null && a != null) return -1;
      if (a == null || b == null) continue;
      const difference = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      if (difference) return sort.direction === 'asc' ? difference : -difference;
    }
    return left.id.localeCompare(right.id);
  });
  const total = rows.length, pageSize = Math.max(1, Math.min(250, Math.floor(query.pageSize ?? 25))), pageCount = Math.ceil(total / pageSize);
  const page = exportAll ? 0 : Math.max(0, Math.min(Math.floor(query.page ?? 0), Math.max(0, pageCount - 1)));
  const previousRange = previousEquivalentPeriod(query.context.dateRange);
  const priorQuery = { ...query, context: { ...query.context, dateRange: previousRange } };
  const priorSnapshot = query.comparePreviousPeriod ? snapshotFor(dataset, priorQuery) : null;
  const priorSelected = priorSnapshot ? selectTransactions(priorSnapshot, priorQuery).filter((row) => query.kind !== 'refunds' || row.refundsMinor > 0) : [];
  const previous = priorSnapshot ? totalsFor(priorSnapshot, priorSelected) : null;
  const priorExpenses = priorSnapshot ? expenseProjection(dataset, priorSnapshot, priorSelected, priorQuery) : null;
  const totals = publicTotals(current, selected.length, sensitive);
  if (query.kind === 'fees') totals.marketplaceFeesMinor = fees.reduce((sum, record) => sum + record.amount, 0);
  const priorTotals = previous ? publicTotals(previous, priorSelected.length, sensitive) : null;
  if (priorTotals && priorSnapshot && query.kind === 'fees') priorTotals.marketplaceFeesMinor = feeRecords(priorSnapshot, priorSelected, { ...priorQuery, canViewSensitiveExpenses: sensitive }).reduce((sum, record) => sum + record.amount, 0);
  const status = previous ? profitabilityComparisonStatus(current, previous) : null;
  const rank = { fresh: 0, warning: 1, syncing: 2, error: 3 };
  const freshness = [...snapshot.transactions.map((row) => row.freshness), getScenarioRuntime(query.scenarioId).freshness].sort((a, b) => rank[b.state] - rank[a.state])[0];
  const healthNotes = [!current.profitabilityComplete ? 'Profitability is incomplete. Known Net Profit and Margin use covered sales only; unknown costs are not treated as zero.' : '',
    freshness.state !== 'fresh' ? freshness.detail : '', sensitive && expenses.summary.unallocatedMinor > 0 ? 'Some configured expenses have no eligible financial records on their expense date. They remain unallocated and are excluded from transaction profit.' : '',
    !sensitive ? 'Expense totals, Net Profit and Margin are restricted by the financial disclosure policy.' : '',
    status && !status.available ? 'Profit and Margin comparisons are unavailable because sales coverage is not comparable.' : ''].filter(Boolean);
  const productMap = new Map(snapshot.transactions.map((row) => [row.productId, { id: row.productId, title: row.title, internalSku: row.internalSku }]));
  const groupMap = new Map(snapshot.transactions.filter((row) => row.productGroupId).map((row) => [row.productGroupId!, { id: row.productGroupId!, name: row.productGroupName! }]));
  const appliedFilters: NonNullable<ReportResult['appliedFilters']> = [
    { label: 'Company', value: query.context.companyId === 'all' ? 'All authorised Companies' : query.companies.find((item) => item.id === query.context.companyId && query.authorisedCompanyIds.includes(item.id))?.name ?? 'Unavailable Company' },
    { label: 'Marketplace', value: query.context.marketplace === 'all' ? 'All marketplaces' : labels[query.context.marketplace] },
    { label: 'Accounts', value: query.context.marketplaceAccountIds.length ? query.marketplaceAccounts.filter((item) => query.context.marketplaceAccountIds.includes(item.id) && query.authorisedAccountIds.includes(item.id)).map((item) => item.displayName).join(', ') || 'Unavailable accounts' : 'All authorised accounts' },
    { label: 'Group by', value: groupBy.replaceAll('-', ' ') },
  ];
  const requestedProducts = [...(query.productIds ?? []), ...(query.productId && query.productId !== 'all' ? [query.productId] : [])];
  const requestedGroups = [...(query.productGroupIds ?? []), ...(query.productGroupId && query.productGroupId !== 'all' ? [query.productGroupId] : [])];
  if (requestedProducts.length) appliedFilters.push({ label: 'Products', value: requestedProducts.map((id) => productMap.get(id)?.title).filter(Boolean).join(', ') || 'No matching authorised Product' });
  if (requestedGroups.length) appliedFilters.push({ label: 'Product Groups', value: requestedGroups.map((id) => id === 'ungrouped' ? 'Ungrouped' : groupMap.get(id)?.name).filter(Boolean).join(', ') || 'No matching authorised Product Group' });
  for (const [label, value] of [['Search', query.search], ['Completeness', query.completeness], ['Category', query.category], ['Fee Type', query.feeType], ['Expense Type', query.expenseType], ['Expense View', query.kind === 'expenses' ? query.expenseView ?? 'ledger' : undefined]]) if (value && value !== 'all') appliedFilters.push({ label: label!, value });
  return { kind: query.kind, title: REPORT_TITLES[query.kind], organisationName: query.organisation.name, organisationSlug: query.organisation.slug,
    context: query.context, currency: 'GBP', columns, rows: exportAll ? rows : rows.slice(page * pageSize, (page + 1) * pageSize), total, page, pageSize: exportAll ? Math.max(1, total) : pageSize, pageCount: exportAll ? Number(total > 0) : pageCount,
    totals, statement: query.kind === 'p-and-l' ? statementFor(current, previous, snapshot, selected, priorSnapshot, priorSelected, expenses, priorExpenses, sensitive) : [],
    comparison: previous && priorTotals && status ? { range: previousRange, totals: priorTotals, status: sensitive ? status : { ...status, available: false, reason: 'restricted_expenses' } } : null,
    freshness, healthNotes, sensitiveExpensesVisible: sensitive, expenseSummary: sensitive ? expenses.summary : { configuredMinor: null, allocatedMinor: null, unallocatedMinor: null },
    products: [...productMap.values()].sort((a, b) => a.title.localeCompare(b.title)), productGroups: [...groupMap.values()].sort((a, b) => a.name.localeCompare(b.name)),
    categories: [...new Set(expenses.occurrences.map((expense) => expense.category))].sort(), feeTypes: [...new Set(feeRecords(snapshot, snapshot.transactions, { ...safeQuery, search: undefined, feeType: undefined }).map((record) => record.type))].sort(),
    groups: REPORT_DIMENSIONS[query.kind], groupBy, allocationNote: TRANSACTION_ALLOCATION_NOTE, refundNote: TRANSACTION_REFUND_NOTE, disclaimer: OPERATIONAL_REPORT_DISCLAIMER, appliedFilters };
}

