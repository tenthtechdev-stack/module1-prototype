import type {
  AnalyticsDataset,
  CanonicalFinancialTotals,
  DashboardAnalytics,
  DashboardAttentionItem,
  DashboardFinancialTotals,
  DashboardHealth,
  DashboardMetricComparison,
  DashboardMetricKey,
  DashboardProductPerformance,
  DashboardRepositoryInput,
  DashboardSyncItem,
  PerformanceComparisonRow,
  ProfitBridgeRow,
  ProfitabilityRecord,
} from '@/src/domain/analytics';
import type { AnalysisContext, Expense, Marketplace, MarketplaceAccount } from '@/src/domain/models';
import {
  bucketKey,
  bucketLabel,
  deriveDetailedProfitability,
  marginPointDeltaBps,
  normaliseMinor,
  percentageDeltaBps,
  previousEquivalentPeriod,
  safeRatioBps,
  sumFeeComponents,
  trendGranularity,
} from '@/src/domain/financial-calculations';
import { getScenarioRuntime } from '@/src/fixtures/scenarios';
import { stableHash } from '@/src/fixtures/analytics-data';
import { LOW_MARGIN_THRESHOLD_BPS } from '@/src/domain/products';

export interface PreparedProfitabilityRecord extends Omit<ProfitabilityRecord,
  | 'grossSalesMinor'
  | 'discountsMinor'
  | 'refundsMinor'
  | 'marketplaceFeeComponents'
  | 'advertisingMinor'
  | 'shippingMinor'
  | 'otherDirectCostsMinor'> {
  grossSalesMinor: number;
  discountsMinor: number;
  refundsMinor: number;
  marketplaceFeesMinor: number;
  advertisingMinor: number | null;
  shippingMinor: number;
  otherDirectCostsMinor: number;
  allocatedExpensesMinor: number;
}

const MARKETPLACE_LABEL: Record<Marketplace, string> = { amazon: 'Amazon', ebay: 'eBay', temu: 'Temu' };
const PROFITABILITY_COVERAGE_TOLERANCE_BPS = 500;

function recordNetRevenue(record: PreparedProfitabilityRecord) {
  return record.grossSalesMinor - record.discountsMinor - record.refundsMinor;
}

export function expenseMatchesRecord(expense: Expense, record: PreparedProfitabilityRecord) {
  if (expense.organisationId !== record.organisationId) return false;
  if (expense.scope.type === 'organisation') return true;
  if (expense.scope.type === 'company') return expense.scope.companyId === record.companyId;
  if (expense.scope.type === 'marketplace') return expense.scope.marketplace === record.marketplace;
  if (expense.scope.type === 'marketplace_account') return expense.scope.marketplaceAccountId === record.marketplaceAccountId;
  return expense.scope.productId === record.productId;
}

export function expenseReportingMinor(expense: Pick<Expense, 'amountMinor' | 'currency'>) {
  const rate = expense.currency === 'EUR' ? 8_600 : expense.currency === 'USD' ? 7_800 : 10_000;
  return normaliseMinor(expense.amountMinor, rate);
}

/** Shared Phase 3 allocation evidence, used by profitability and Expense reports. */
export function projectExpenseAllocations(records: PreparedProfitabilityRecord[], expenses: Expense[]) {
  // Prototype policy only: allocate each scoped expense deterministically across
  // matching same-day records in proportion to non-negative net revenue. This is
  // intentionally simple and is not presented as the final accounting policy.
  const allocations: Array<{ expenseId: string; recordId: string; amountMinor: number }> = [];
  const unallocated: Array<{ expenseId: string; amountMinor: number; reason: string }> = [];
  const sortedRecords = [...records].sort((a, b) => a.id.localeCompare(b.id));
  expenses.forEach((expense) => {
    const candidates = sortedRecords.filter((record) => record.occurredOn === expense.occurredAt.slice(0, 10) && expenseMatchesRecord(expense, record));
    const amountMinor = expenseReportingMinor(expense);
    if (!candidates.length) {
      unallocated.push({ expenseId: expense.id, amountMinor, reason: 'No eligible financial records on the expense date. The expense remains configured and has not been deducted from transaction profitability.' });
      return;
    }
    const weights = candidates.map((record) => Math.max(0, recordNetRevenue(record)));
    const totalWeight = weights.reduce((sum, value) => sum + value, 0);
    let assigned = 0;
    candidates.forEach((record, index) => {
      const share = index === candidates.length - 1
        ? amountMinor - assigned
        : totalWeight > 0
          ? Math.floor((amountMinor * weights[index]) / totalWeight)
          : Math.floor(amountMinor / candidates.length);
      assigned += share;
      allocations.push({ expenseId: expense.id, recordId: record.id, amountMinor: share });
    });
  });
  return { allocations, unallocated };
}

function allocateExpenses(records: PreparedProfitabilityRecord[], expenses: Expense[]) {
  const allocation = new Map<string, number>();
  projectExpenseAllocations(records, expenses).allocations.forEach(({ recordId, amountMinor }) => {
    allocation.set(recordId, (allocation.get(recordId) ?? 0) + amountMinor);
  });
  return records.map((record) => ({ ...record, allocatedExpensesMinor: allocation.get(record.id) ?? 0 }));
}

function withinRange(record: Pick<PreparedProfitabilityRecord, 'occurredOn'>, from: string, to: string) {
  return record.occurredOn >= from && record.occurredOn <= to;
}

/**
 * Scenario COGS gaps model the imported baseline. A persisted, approved change
 * carries its governed batch reference into the analytics history and therefore
 * supersedes that synthetic gap for the dates its effective range covers.
 */
function approvedCogsOverrideCovers(dataset: AnalyticsDataset, productId: string, onDate: string) {
  return dataset.cogsHistory.some((rate) => rate.productId === productId
    && Boolean(rate.sourceReferenceId)
    && rate.effectiveFrom <= onDate
    && (rate.effectiveTo === null || onDate < rate.effectiveTo));
}

export function filterProfitabilityRecords(records: PreparedProfitabilityRecord[], context: AnalysisContext) {
  const accountIds = new Set(context.marketplaceAccountIds);
  return records
    .filter((record) => withinRange(record, context.dateRange.from, context.dateRange.to))
    .filter((record) => context.companyId === 'all' || record.companyId === context.companyId)
    .filter((record) => context.marketplace === 'all' || record.marketplace === context.marketplace)
    .filter((record) => accountIds.size === 0 || accountIds.has(record.marketplaceAccountId));
}

export function prepareProfitabilityRecords(dataset: AnalyticsDataset, input: DashboardRepositoryInput) {
  const runtime = getScenarioRuntime(input.scenarioId);
  const authorisedCompanies = new Set(input.authorisedCompanyIds);
  const authorisedAccounts = new Set(input.authorisedAccountIds);
  const targetCoverageBps = runtime.cogsMode === 'none'
    ? 0
    : runtime.cogsMode === 'partial'
      ? 6_400
      : input.cogsReadiness
        ? input.cogsReadiness.coveragePercent * 100
        : 10_000;
  const prepared: PreparedProfitabilityRecord[] = dataset.records
    .filter((record) => authorisedCompanies.has(record.companyId) && authorisedAccounts.has(record.marketplaceAccountId))
    .filter((record) => input.scenarioId !== 'first-sync' || record.occurredOn >= '2026-08-16')
    .filter((record) => input.scenarioId !== 'temu-import-running' || record.marketplace !== 'temu' || record.occurredOn >= '2026-07-15')
    .map((record) => {
      const sourceRate = record.sourceToReportingRateBps;
      const productCoverageSignal = stableHash(record.productId) % 10_000;
      // Partial COGS intentionally includes products whose present-day cost is
      // known but whose earlier transactions pre-date a usable cost. This makes
      // partial_history materially different from a wholly missing product.
      const partialHistory = runtime.cogsMode === 'partial'
        && productCoverageSignal >= Math.max(0, targetCoverageBps - 1_400)
        && productCoverageSignal < Math.min(10_000, targetCoverageBps + 900);
      const approvedOverride = record.cogsMinor !== null
        && approvedCogsOverrideCovers(dataset, record.productId, record.occurredOn);
      const cogsAvailable = approvedOverride || (productCoverageSignal < targetCoverageBps
        && (!partialHistory || record.occurredOn >= '2026-08-01'));
      const advertisingPartial = (input.scenarioId === 'first-sync' || input.scenarioId === 'temu-import-running')
        && record.marketplace === 'temu'
        && stableHash(record.id) % 3 === 0;
      return {
        ...record,
        grossSalesMinor: normaliseMinor(record.grossSalesMinor, sourceRate),
        discountsMinor: normaliseMinor(record.discountsMinor, sourceRate),
        refundsMinor: normaliseMinor(record.refundsMinor, sourceRate),
        cogsMinor: cogsAvailable ? record.cogsMinor : null,
        marketplaceFeesMinor: normaliseMinor(sumFeeComponents(record.marketplaceFeeComponents), sourceRate),
        advertisingMinor: advertisingPartial || record.advertisingMinor === null ? null : normaliseMinor(record.advertisingMinor, sourceRate),
        advertisingDataState: advertisingPartial ? 'partial' as const : record.advertisingDataState,
        shippingMinor: normaliseMinor(record.shippingMinor, sourceRate),
        otherDirectCostsMinor: normaliseMinor(record.otherDirectCostsMinor, sourceRate),
        allocatedExpensesMinor: 0,
      };
    });
  const expenses = dataset.expenses.filter((expense) => expense.organisationId === input.context.organisationId);
  return allocateExpenses(prepared, expenses);
}

export function calculateDashboardTotals(records: PreparedProfitabilityRecord[]): CanonicalFinancialTotals {
  const totals: CanonicalFinancialTotals = {
    currency: 'GBP', grossSalesMinor: 0, discountsMinor: 0, revenueMinor: 0, refundsMinor: 0,
    netRevenueMinor: 0, cogsKnownMinor: 0, marketplaceFeesMinor: 0, advertisingKnownMinor: 0,
    shippingMinor: 0, otherDirectCostsMinor: 0, allocatedExpensesMinor: 0,
    grossProfitKnownMinor: null, knownNetProfitMinor: null, netProfitMinor: null, marginBps: null,
    knownMarginBps: null, orders: 0, units: 0, refundedOrders: 0, refundRateBps: null,
    cogsCoverageBps: records.length ? 0 : 10_000, advertisingCoverageBps: records.length ? 0 : 10_000,
    profitabilityCoverageBps: records.length ? 0 : 10_000,
    covered: {
      grossSalesMinor: 0, discountsMinor: 0, revenueMinor: 0, refundsMinor: 0, netRevenueMinor: 0,
      cogsMinor: 0, marketplaceFeesMinor: 0, advertisingMinor: 0, shippingMinor: 0,
      otherDirectCostsMinor: 0, allocatedExpensesMinor: 0, grossProfitMinor: 0,
      netProfitMinor: 0, marginBps: null, orders: 0, units: 0,
    },
    profitabilityComplete: true,
  };
  let grossProfitKnownMinor = 0;
  let totalCoverageRevenue = 0;
  let cogsCoveredRevenue = 0;
  let advertisingCoveredRevenue = 0;
  let profitabilityCoveredRevenue = 0;
  let cogsCoveredRecords = 0;
  let advertisingCoveredRecords = 0;
  let profitabilityCoveredRecords = 0;
  records.forEach((record) => {
    const result = deriveDetailedProfitability({
      grossSalesMinor: record.grossSalesMinor,
      discountsMinor: record.discountsMinor,
      refundsMinor: record.refundsMinor,
      cogsMinor: record.cogsMinor,
      marketplaceFeesMinor: record.marketplaceFeesMinor,
      advertisingMinor: record.advertisingMinor,
      shippingMinor: record.shippingMinor,
      otherDirectCostsMinor: record.otherDirectCostsMinor,
      allocatedExpensesMinor: record.allocatedExpensesMinor,
    });
    totals.grossSalesMinor += record.grossSalesMinor;
    totals.discountsMinor += record.discountsMinor;
    totals.revenueMinor += result.revenueMinor;
    totals.refundsMinor += record.refundsMinor;
    totals.netRevenueMinor += result.netRevenueMinor;
    totals.cogsKnownMinor += result.cogsKnownMinor ?? 0;
    totals.marketplaceFeesMinor += record.marketplaceFeesMinor;
    totals.advertisingKnownMinor += result.advertisingKnownMinor ?? 0;
    totals.shippingMinor += record.shippingMinor;
    totals.otherDirectCostsMinor += record.otherDirectCostsMinor;
    totals.allocatedExpensesMinor += record.allocatedExpensesMinor;
    grossProfitKnownMinor += result.grossProfitKnownMinor ?? 0;
    totals.orders += record.orders;
    totals.units += record.units;
    totals.refundedOrders += record.refundedOrders;
    const coverageRevenue = Math.max(0, result.netRevenueMinor);
    totalCoverageRevenue += coverageRevenue;
    if (record.cogsMinor !== null) {
      cogsCoveredRevenue += coverageRevenue;
      cogsCoveredRecords += 1;
    }
    if (record.advertisingMinor !== null) {
      advertisingCoveredRevenue += coverageRevenue;
      advertisingCoveredRecords += 1;
    }
    if (result.complete && result.knownNetProfitMinor !== null && record.cogsMinor !== null && record.advertisingMinor !== null) {
      profitabilityCoveredRevenue += coverageRevenue;
      profitabilityCoveredRecords += 1;
      totals.covered.grossSalesMinor += record.grossSalesMinor;
      totals.covered.discountsMinor += record.discountsMinor;
      totals.covered.revenueMinor += result.revenueMinor;
      totals.covered.refundsMinor += record.refundsMinor;
      totals.covered.netRevenueMinor += result.netRevenueMinor;
      totals.covered.cogsMinor += record.cogsMinor;
      totals.covered.marketplaceFeesMinor += record.marketplaceFeesMinor;
      totals.covered.advertisingMinor += record.advertisingMinor;
      totals.covered.shippingMinor += record.shippingMinor;
      totals.covered.otherDirectCostsMinor += record.otherDirectCostsMinor;
      totals.covered.allocatedExpensesMinor += record.allocatedExpensesMinor;
      totals.covered.grossProfitMinor += result.grossProfitKnownMinor ?? 0;
      totals.covered.netProfitMinor += result.knownNetProfitMinor;
      totals.covered.orders += record.orders;
      totals.covered.units += record.units;
    }
    totals.profitabilityComplete = totals.profitabilityComplete && result.complete;
  });
  const coverageBps = (coveredRevenue: number, coveredRecords: number) => !records.length
    ? 10_000
    : totalCoverageRevenue > 0
      ? Math.min(10_000, Math.round((coveredRevenue * 10_000) / totalCoverageRevenue))
      : Math.round((coveredRecords * 10_000) / records.length);
  totals.cogsCoverageBps = coverageBps(cogsCoveredRevenue, cogsCoveredRecords);
  totals.advertisingCoverageBps = coverageBps(advertisingCoveredRevenue, advertisingCoveredRecords);
  totals.profitabilityCoverageBps = coverageBps(profitabilityCoveredRevenue, profitabilityCoveredRecords);
  totals.refundRateBps = safeRatioBps(totals.refundedOrders, totals.orders);
  totals.covered.marginBps = safeRatioBps(totals.covered.netProfitMinor, totals.covered.netRevenueMinor);
  totals.grossProfitKnownMinor = cogsCoveredRecords > 0 ? grossProfitKnownMinor : null;
  totals.knownNetProfitMinor = profitabilityCoveredRecords > 0 ? totals.covered.netProfitMinor : null;
  totals.knownMarginBps = profitabilityCoveredRecords > 0 ? totals.covered.marginBps : null;
  totals.netProfitMinor = totals.profitabilityComplete ? totals.knownNetProfitMinor : null;
  totals.marginBps = totals.profitabilityComplete ? totals.knownMarginBps : null;
  return totals;
}

export function profitabilityComparisonStatus(current: DashboardFinancialTotals, previous: DashboardFinancialTotals) {
  const coverageDifferenceBps = Math.abs(current.profitabilityCoverageBps - previous.profitabilityCoverageBps);
  if (current.covered.netRevenueMinor <= 0 || previous.covered.netRevenueMinor <= 0) {
    return { available: false, reason: 'no_covered_sales' as const, coverageDifferenceBps };
  }
  if (coverageDifferenceBps > PROFITABILITY_COVERAGE_TOLERANCE_BPS) {
    return { available: false, reason: 'coverage_mismatch' as const, coverageDifferenceBps };
  }
  return { available: true, reason: 'equivalent_coverage' as const, coverageDifferenceBps };
}

function metricComparison(
  key: DashboardMetricKey,
  current: number | null,
  previous: number | null,
  complete: boolean,
  kind: 'percentage' | 'points' = 'percentage',
  comparisonAvailable = true,
): DashboardMetricComparison {
  return {
    key,
    currentMinor: current,
    previousMinor: previous,
    delta: { valueBps: comparisonAvailable ? kind === 'points' ? marginPointDeltaBps(current, previous) : percentageDeltaBps(current, previous) : null, kind },
    complete,
  };
}

function buildMetrics(current: DashboardFinancialTotals, previous: DashboardFinancialTotals, sensitiveExpensesVisible: boolean, profitComparisonAvailable: boolean) {
  const values = {
    revenue: metricComparison('revenue', current.revenueMinor, previous.revenueMinor, true),
    orders: { ...metricComparison('orders', current.orders, previous.orders, true), currentCount: current.orders, previousCount: previous.orders },
    units: { ...metricComparison('units', current.units, previous.units, true), currentCount: current.units, previousCount: previous.units },
    refunds: {
      ...metricComparison('refunds', current.refundsMinor, previous.refundsMinor, true),
      currentBps: current.refundRateBps,
      previousBps: previous.refundRateBps,
    },
    cogs: metricComparison('cogs', current.cogsCoverageBps === 0 ? null : current.cogsKnownMinor, previous.cogsCoverageBps === 0 ? null : previous.cogsKnownMinor, current.cogsCoverageBps === 10_000),
    marketplaceFees: metricComparison('marketplaceFees', current.marketplaceFeesMinor, previous.marketplaceFeesMinor, true),
    advertising: metricComparison('advertising', current.advertisingKnownMinor, previous.advertisingKnownMinor, current.advertisingCoverageBps === 10_000),
    shipping: metricComparison('shipping', current.shippingMinor, previous.shippingMinor, true),
    otherCosts: metricComparison('otherCosts', current.otherDirectCostsMinor + (sensitiveExpensesVisible ? (current.allocatedExpensesMinor ?? 0) : 0), previous.otherDirectCostsMinor + (sensitiveExpensesVisible ? (previous.allocatedExpensesMinor ?? 0) : 0), sensitiveExpensesVisible),
    grossProfit: metricComparison('grossProfit', current.grossProfitKnownMinor, previous.grossProfitKnownMinor, current.cogsCoverageBps === 10_000),
    netProfit: metricComparison('netProfit', current.knownNetProfitMinor, previous.knownNetProfitMinor, current.profitabilityComplete, 'percentage', profitComparisonAvailable),
    margin: {
      ...metricComparison('margin', current.knownMarginBps, previous.knownMarginBps, current.profitabilityComplete, 'points', profitComparisonAvailable),
      currentBps: current.knownMarginBps,
      previousBps: previous.knownMarginBps,
    },
  } satisfies Record<DashboardMetricKey, DashboardMetricComparison>;
  return values;
}

function comparisonRows(
  records: PreparedProfitabilityRecord[],
  kind: PerformanceComparisonRow['kind'],
  labelFor: (id: string) => string,
) {
  const groups = new Map<string, PreparedProfitabilityRecord[]>();
  records.forEach((record) => {
    const id = kind === 'marketplace' ? record.marketplace : kind === 'company' ? record.companyId : record.marketplaceAccountId;
    groups.set(id, [...(groups.get(id) ?? []), record]);
  });
  return [...groups.entries()].map(([id, grouped]) => ({
    id,
    label: labelFor(id),
    kind,
    marketplace: kind === 'marketplace' ? id as Marketplace : undefined,
    totals: calculateDashboardTotals(grouped),
  })).sort((a, b) => b.totals.revenueMinor - a.totals.revenueMinor);
}

function productPerformance(records: PreparedProfitabilityRecord[], dataset: AnalyticsDataset) {
  const productById = new Map(dataset.products.map((product) => [product.id, product]));
  const groups = new Map<string, PreparedProfitabilityRecord[]>();
  records.forEach((record) => groups.set(record.productId, [...(groups.get(record.productId) ?? []), record]));
  return [...groups.entries()].flatMap(([productId, grouped]): DashboardProductPerformance[] => {
    const product = productById.get(productId);
    if (!product) return [];
    const totals = calculateDashboardTotals(grouped);
    const adRate = safeRatioBps(totals.advertisingKnownMinor, totals.revenueMinor);
    const issue = totals.profitabilityCoverageBps < 10_000 ? 'missing_cogs'
      : (totals.netProfitMinor ?? 0) < 0 ? 'loss_making'
        : (totals.marginBps ?? 10_000) < LOW_MARGIN_THRESHOLD_BPS ? 'low_margin'
          : (totals.refundRateBps ?? 0) > 1_200 ? 'high_refunds'
            : (adRate ?? 0) > 1_800 ? 'high_advertising'
              : null;
    return [{
      id: product.id,
      companyId: product.companyId,
      sku: product.sku,
      name: product.name,
      marketplaces: [...new Set(grouped.map((record) => record.marketplace))],
      units: totals.units,
      revenueMinor: totals.revenueMinor,
      refundsMinor: totals.refundsMinor,
      refundRateBps: totals.refundRateBps,
      advertisingKnownMinor: totals.advertisingKnownMinor,
      netProfitMinor: totals.netProfitMinor,
      knownNetProfitMinor: totals.knownNetProfitMinor,
      marginBps: totals.marginBps,
      cogsCoverageBps: totals.cogsCoverageBps,
      cogsStatus: totals.cogsCoverageBps === 10_000 ? 'complete' : 'missing',
      issue,
    }];
  });
}

function syncItems(accounts: MarketplaceAccount[]): DashboardSyncItem[] {
  const byMarketplace = new Map<Marketplace, MarketplaceAccount[]>();
  accounts.forEach((account) => byMarketplace.set(account.marketplace, [...(byMarketplace.get(account.marketplace) ?? []), account]));
  return [...byMarketplace.entries()].map(([marketplace, grouped]) => {
    const statuses = grouped.map((account) => account.status);
    const state: DashboardSyncItem['state'] = statuses.some((status) => status === 'failed' || status === 'authentication_required') ? 'failed'
      : statuses.some((status) => status === 'delayed') ? 'partial'
        : statuses.some((status) => status === 'syncing' || status === 'connected' || status === 'pending' || status === 'retrying') ? 'syncing'
          : 'synced';
    const detail = state === 'failed' ? 'Authentication or sync action required'
      : state === 'partial' ? 'Some source data is delayed'
        : state === 'syncing' ? 'Historical data is still importing'
          : 'All selected accounts are up to date';
    return { marketplace, label: MARKETPLACE_LABEL[marketplace], state, detail };
  }).sort((a, b) => ['amazon', 'ebay', 'temu'].indexOf(a.marketplace) - ['amazon', 'ebay', 'temu'].indexOf(b.marketplace));
}

function buildAttention(
  input: DashboardRepositoryInput,
  products: DashboardProductPerformance[],
  sync: DashboardSyncItem[],
  missingCount: number,
) {
  const items: DashboardAttentionItem[] = [];
  const prefix = `/o/${input.organisation.slug}`;
  if (missingCount > 0) items.push({
    id: 'missing-cogs', title: `${missingCount.toLocaleString('en-GB')} missing product costs`,
    detail: 'Known profit uses cost-complete sales only; transactions with missing COGS are excluded.', severity: 'high', href: `${prefix}/cogs?status=missing`, scope: 'selected',
  });
  sync.forEach((item) => {
    if (item.state === 'synced') return;
    items.push({
      id: `sync-${item.marketplace}`,
      title: item.state === 'failed' ? `${item.label} authentication required` : `${item.label} data ${item.state === 'syncing' ? 'importing' : 'delayed'}`,
      detail: item.detail,
      severity: item.state === 'failed' ? 'high' : item.state === 'partial' ? 'medium' : 'info',
      href: `${prefix}/operations/sync-health`, scope: 'selected',
    });
  });
  if (input.scenarioId === 'cogs-awaiting-approval') items.push({ id: 'cogs-approval', title: 'COGS suggestion awaiting approval', detail: 'A proposed unit-cost change needs authorised review.', severity: 'medium', href: `${prefix}/cogs?status=pending_approval`, scope: 'organisation' });
  if (input.scenarioId === 'import-errors') items.push({ id: 'import-errors', title: 'Cost import rows need review', detail: 'Duplicate SKUs and invalid cost values were not applied.', severity: 'medium', href: `${prefix}/cogs/import?view=history`, scope: 'organisation' });
  const losses = products.filter((product) => product.issue === 'loss_making').length;
  if (losses) items.push({ id: 'losses', title: `${losses} products are loss-making`, detail: 'Complete-cost products with negative net profit in this scope.', severity: 'medium', href: `${prefix}/products`, scope: 'selected' });
  return items.slice(0, 5);
}

function buildHealth(
  input: DashboardRepositoryInput,
  current: DashboardFinancialTotals,
  sync: DashboardSyncItem[],
  missingProducts: number,
  affectedRevenueMinor: number,
  revenueCompletenessBps: number,
): DashboardHealth {
  const runtime = getScenarioRuntime(input.scenarioId);
  const failed = sync.some((item) => item.state === 'failed');
  const syncing = sync.some((item) => item.state === 'syncing');
  const delayed = sync.some((item) => item.state === 'partial');
  const syncCompletenessBps = sync.length
    ? Math.round((sync.filter((item) => item.state === 'synced').length * 10_000) / sync.length)
    : 0;
  const wholeAuthorisedScope = input.context.companyId === 'all'
    && input.context.marketplace === 'all'
    && input.context.marketplaceAccountIds.length === 0;
  const cogsCoverageBps = wholeAuthorisedScope && input.cogsReadiness && input.scenarioId === 'healthy'
    ? input.cogsReadiness.coveragePercent * 100
    : current.cogsCoverageBps;
  const freshnessError = runtime.freshness.state === 'error';
  const freshnessWarning = runtime.freshness.state === 'warning';
  const freshnessSyncing = runtime.freshness.state === 'syncing';
  const state = failed || freshnessError || cogsCoverageBps === 0 ? 'critical'
    : syncing || freshnessSyncing ? 'syncing'
      : delayed || freshnessWarning || cogsCoverageBps < 10_000 || !current.profitabilityComplete ? 'partial'
        : 'healthy';
  const title = state === 'healthy' ? 'Data up to date'
    : state === 'critical' && cogsCoverageBps === 0 ? 'Profitability is unavailable'
      : state === 'critical' ? 'Marketplace data needs attention'
        : state === 'syncing' ? 'Historical data is still importing'
          : freshnessWarning && !delayed && missingProducts === 0 ? runtime.freshness.label : 'Profitability is incomplete';
  const description = state === 'healthy'
    ? 'All selected marketplace accounts are synced and COGS coverage is complete.'
    : cogsCoverageBps === 0
      ? 'Revenue and orders are available, but profit cannot be completed until product costs are added.'
        : failed
          ? 'At least one selected marketplace account requires action. Displayed figures use the available source data.'
        : missingProducts > 0
          ? `${missingProducts.toLocaleString('en-GB')} product costs are missing. Known profit uses cost-complete sales only.`
          : runtime.freshness.state !== 'fresh'
            ? runtime.freshness.detail
          : 'Displayed figures use the source data currently available for this scope.';
  return {
    state, title, description, revenueCompletenessBps,
    cogsCoverageBps, syncCompletenessBps, missingCogsProducts: missingProducts, affectedRevenueMinor,
  };
}

export function buildProfitBridge(current: DashboardFinancialTotals, sensitiveVisible: boolean): ProfitBridgeRow[] {
  const covered = current.covered;
  const coveredLabel = !current.profitabilityComplete;
  return [
    { key: 'revenue', label: coveredLabel ? 'Covered Revenue' : 'Revenue', amountMinor: covered.revenueMinor, operation: 'start', complete: true },
    { key: 'refunds', label: 'Refunds', amountMinor: covered.refundsMinor, operation: 'subtract', complete: true },
    { key: 'netRevenue', label: coveredLabel ? 'Covered Net Revenue' : 'Net Revenue', amountMinor: covered.netRevenueMinor, operation: 'subtotal', complete: true },
    { key: 'cogs', label: 'COGS', amountMinor: covered.cogsMinor, operation: 'subtract', complete: true },
    { key: 'marketplaceFees', label: 'Marketplace Fees', amountMinor: covered.marketplaceFeesMinor, operation: 'subtract', complete: true },
    { key: 'advertising', label: 'Advertising', amountMinor: covered.advertisingMinor, operation: 'subtract', complete: true },
    { key: 'shipping', label: 'Shipping', amountMinor: covered.shippingMinor, operation: 'subtract', complete: true },
    { key: 'otherDirectCosts', label: 'Other Direct Costs', amountMinor: covered.otherDirectCostsMinor, operation: 'subtract', complete: true },
    { key: 'allocatedExpenses', label: sensitiveVisible ? 'Allocated Expenses' : 'Restricted allocated costs', amountMinor: covered.allocatedExpensesMinor, operation: 'subtract', complete: true, sensitive: !sensitiveVisible },
    { key: 'netProfit', label: current.profitabilityComplete ? 'Net Profit' : 'Known Net Profit', amountMinor: current.knownNetProfitMinor, operation: 'result', complete: current.profitabilityComplete },
  ];
}

function buildTrend(currentRecords: PreparedProfitabilityRecord[], previousRecords: PreparedProfitabilityRecord[], context: AnalysisContext, profitComparisonAvailable: boolean) {
  const granularity = trendGranularity(context.dateRange);
  const aggregateBuckets = (records: PreparedProfitabilityRecord[]) => {
    const groups = new Map<string, PreparedProfitabilityRecord[]>();
    records.forEach((record) => {
      const key = bucketKey(record.occurredOn, granularity);
      groups.set(key, [...(groups.get(key) ?? []), record]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, grouped]) => ({ key, totals: calculateDashboardTotals(grouped) }));
  };
  const currentBuckets = aggregateBuckets(currentRecords);
  const previousBuckets = aggregateBuckets(previousRecords);
  return currentBuckets.map((bucket, index) => ({
    key: bucket.key,
    label: bucketLabel(bucket.key, granularity),
    revenueMinor: bucket.totals.revenueMinor,
    previousRevenueMinor: previousBuckets[index]?.totals.revenueMinor ?? null,
    knownNetProfitMinor: bucket.totals.knownNetProfitMinor,
    previousKnownNetProfitMinor: profitComparisonAvailable ? previousBuckets[index]?.totals.knownNetProfitMinor ?? null : null,
    marginBps: bucket.totals.knownMarginBps,
    previousMarginBps: profitComparisonAvailable ? previousBuckets[index]?.totals.knownMarginBps ?? null : null,
    cogsCoverageBps: bucket.totals.cogsCoverageBps,
  }));
}

export function aggregateDashboardAnalytics(dataset: AnalyticsDataset, input: DashboardRepositoryInput): DashboardAnalytics {
  const prepared = prepareProfitabilityRecords(dataset, input);
  const runtime = getScenarioRuntime(input.scenarioId);
  const comparisonRange = previousEquivalentPeriod(input.context.dateRange);
  const currentContext = input.context;
  const previousContext = { ...input.context, dateRange: comparisonRange };
  const currentRecords = runtime.resultMode === 'empty' ? [] : filterProfitabilityRecords(prepared, currentContext);
  const previousRecords = runtime.resultMode === 'empty' ? [] : filterProfitabilityRecords(prepared, previousContext);
  const current = calculateDashboardTotals(currentRecords);
  const previous = calculateDashboardTotals(previousRecords);
  const profitabilityComparison = profitabilityComparisonStatus(current, previous);
  const baselinePrepared = input.scenarioId === 'first-sync' || input.scenarioId === 'temu-import-running'
    ? prepareProfitabilityRecords(dataset, { ...input, scenarioId: 'healthy' })
    : prepared;
  const baselineRevenueMinor = calculateDashboardTotals(filterProfitabilityRecords(baselinePrepared, currentContext)).revenueMinor;
  const revenueCompletenessBps = baselineRevenueMinor > 0
    ? Math.min(10_000, Math.round((current.revenueMinor * 10_000) / baselineRevenueMinor))
    : currentRecords.length ? 10_000 : 0;
  const scopedAccounts = input.marketplaceAccounts
    .filter((account) => input.authorisedAccountIds.includes(account.id))
    .filter((account) => currentContext.companyId === 'all' || account.companyId === currentContext.companyId)
    .filter((account) => currentContext.marketplace === 'all' || account.marketplace === currentContext.marketplace)
    .filter((account) => currentContext.marketplaceAccountIds.length === 0 || currentContext.marketplaceAccountIds.includes(account.id));
  const products = productPerformance(currentRecords, dataset);
  const actualMissing = products.filter((product) => product.cogsStatus === 'missing').length;
  const wholeAuthorisedScope = currentContext.companyId === 'all'
    && currentContext.marketplace === 'all'
    && currentContext.marketplaceAccountIds.length === 0;
  const missingProducts = wholeAuthorisedScope && input.scenarioId === 'cogs-none'
    ? (input.cogsReadiness?.productsImported ?? dataset.products.length)
    : wholeAuthorisedScope && input.cogsReadiness && input.scenarioId === 'healthy'
      ? input.cogsReadiness.cogsMissing
      : actualMissing;
  const affectedRevenueMinor = products.filter((product) => product.cogsStatus === 'missing').reduce((sum, product) => sum + product.revenueMinor, 0);
  const sync = syncItems(scopedAccounts);
  const topProducts = products.filter((product) => product.cogsStatus === 'complete' && product.netProfitMinor !== null)
    .sort((a, b) => (b.netProfitMinor ?? 0) - (a.netProfitMinor ?? 0));
  const needsReview = products.filter((product) => product.issue !== null)
    .sort((a, b) => {
      const priority = { missing_cogs: 0, loss_making: 1, high_refunds: 2, high_advertising: 3, low_margin: 4 } as const;
      return priority[a.issue!] - priority[b.issue!] || (a.knownNetProfitMinor ?? 0) - (b.knownNetProfitMinor ?? 0);
    }).slice(0, 6);
  return {
    context: input.context,
    comparisonRange,
    generatedRange: dataset.generatedRange,
    granularity: trendGranularity(input.context.dateRange),
    current,
    previous,
    profitabilityComparison,
    metrics: buildMetrics(current, previous, input.canViewSensitiveExpenses, profitabilityComparison.available),
    trend: buildTrend(currentRecords, previousRecords, input.context, profitabilityComparison.available),
    bridge: buildProfitBridge(current, input.canViewSensitiveExpenses),
    marketplaceComparison: comparisonRows(currentRecords, 'marketplace', (id) => MARKETPLACE_LABEL[id as Marketplace]),
    companyComparison: comparisonRows(currentRecords, 'company', (id) => input.companies.find((company) => company.id === id)?.name ?? id),
    accountComparison: comparisonRows(currentRecords, 'account', (id) => input.marketplaceAccounts.find((account) => account.id === id)?.displayName ?? id),
    productPerformance: products,
    topProducts,
    needsReview,
    attention: buildAttention(input, products, sync, missingProducts),
    sync,
    health: buildHealth(input, current, sync, missingProducts, affectedRevenueMinor, revenueCompletenessBps),
    sensitiveExpensesVisible: input.canViewSensitiveExpenses,
  };
}
