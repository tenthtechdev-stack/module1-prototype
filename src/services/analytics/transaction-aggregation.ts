import type { AnalyticsDataset, HistoricalCogsRate, MarketplaceFeeComponents, ProfitabilityRecord } from '@/src/domain/analytics';
import type { DataFreshness, Marketplace } from '@/src/domain/models';
import type { FinancialSourceEvent, ProfitabilityTransaction, TransactionDetail, TransactionFeeBreakdown, TransactionPage, TransactionProfitabilityStatus, TransactionSummary, TransactionWaterfallRow } from '@/src/domain/transactions';
import type { TransactionDetailQuery, TransactionQuery, TransactionRepositoryInput } from '@/src/services/transactions-contracts';
import { deriveDetailedProfitability, safeRatioBps, shiftIsoDate } from '@/src/domain/financial-calculations';
import { LOW_MARGIN_THRESHOLD_BPS } from '@/src/domain/products';
import { stableHash } from '@/src/fixtures/analytics-data';
import { getScenarioRuntime } from '@/src/fixtures/scenarios';
import { calculateDashboardTotals, filterProfitabilityRecords, prepareProfitabilityRecords, type PreparedProfitabilityRecord } from '@/src/services/analytics/analytics-aggregation';
import { mockProductGroupsStore, organisationProductGroupsState, type OrganisationProductGroupsState } from '@/src/services/mock/product-groups-store';

export const TRANSACTION_ALLOCATION_NOTE = 'Uses the Dashboard prototype rule: scoped expenses are allocated to same-day financial records by non-negative net revenue, then apportioned to their sale lines by non-negative net revenue. Integer remainders are retained so every penny reconciles.';
export const TRANSACTION_REFUND_NOTE = 'Refunds reduce revenue. COGS and recorded marketplace fees remain charged; this model does not assume an inventory return or an automatic marketplace fee reversal.';
export const TRANSACTION_FIXTURE_NOTE = 'Deterministic prototype sale lines are apportioned from the shared daily Product/account dataset. Source references identify that financial batch; they are illustrative evidence, not a live marketplace order feed.';
export const TRANSACTION_ADVERTISING_NOTE = 'Advertising is attributed from the shared Product/account financial batch across its sold quantities. This prototype attribution is an allocation, not an exact marketplace conversion match.';

/** Integer apportionment, not a financial formula. Preserves every parent minor unit. */
export function apportionTransactionMinor(total: number, weights: readonly number[]): number[] {
  if (!weights.length) return [];
  const denominator = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  let assigned = 0;
  return weights.map((weight, index) => {
    const amount = index === weights.length - 1 ? total - assigned
      : denominator > 0 ? Math.floor(total * Math.max(0, weight) / denominator) : Math.floor(total / weights.length);
    assigned += amount;
    return amount;
  });
}

interface SourceAmounts {
  grossSalesMinor: number;
  discountsMinor: number;
  refundsMinor: number;
  marketplaceFeeComponents: MarketplaceFeeComponents;
  advertisingMinor: number | null;
  shippingMinor: number;
  otherDirectCostsMinor: number;
}
export interface PreparedTransactionLine extends PreparedProfitabilityRecord {
  parentRecordId: string;
  lineIndex: number;
  sourceAmounts: SourceAmounts;
  reportingFeeComponents: MarketplaceFeeComponents;
}

const FEE_KEYS = ['referralMinor', 'fulfilmentMinor', 'storageMinor', 'promotedListingMinor', 'otherMinor'] as const;

/** Allocate represented non-negative fees without creating a credit as a rounding residual. */
function apportionFeeMinor(total: number, weights: readonly number[]): number[] {
  const denominator = weights.reduce((sum, value) => sum + value, 0);
  if (denominator === 0) return weights.map(() => 0);
  const parts = weights.map((weight) => Math.floor(total * weight / denominator));
  const remainder = total - parts.reduce((sum, value) => sum + value, 0);
  const priorities = weights.map((weight, index) => ({ index, fraction: total * weight % denominator }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  priorities.slice(0, remainder).forEach(({ index }) => { parts[index] += 1; });
  return parts;
}

/** Preserve both category totals and sale-line totals, bounded by each line's remaining fees. */
function splitFeeCategories(categoryTotals: readonly number[], lineTotals: readonly number[]): number[][] {
  const remaining = [...lineTotals];
  return categoryTotals.map((total) => {
    const parts = apportionFeeMinor(total, remaining);
    parts.forEach((amount, index) => { remaining[index] -= amount; });
    return parts;
  });
}

/**
 * A parent daily financial record can represent several sales. Split its order
 * count into distinct lines and conserve units and every normalized component.
 * COGS has already resolved through Phase 5 for the parent date; the same unit
 * rate is multiplied by each line's sold quantity. No present-day cost lookup.
 */
export function splitProfitabilityRecord(record: PreparedProfitabilityRecord, source: ProfitabilityRecord): PreparedTransactionLine[] {
  const count = Math.max(1, Math.min(record.orders, record.units));
  const quantities = Array.from({ length: count }, (_, index) => Math.floor(record.units / count) + (index < record.units % count ? 1 : 0));
  const gross = apportionTransactionMinor(record.grossSalesMinor, quantities);
  const discount = apportionTransactionMinor(record.discountsMinor, quantities);
  const revenue = gross.map((amount, index) => amount - discount[index]);
  // Preserve the parent refund total. Concentrating refunds within its refunded
  // sales gives full and partial refund examples without adding any new refund.
  const refunds = Array<number>(count).fill(0);
  let refundRemaining = record.refundsMinor;
  const refundableCount = Math.min(count, Math.max(record.refundedOrders, record.refundsMinor > 0 ? 1 : 0));
  for (let index = 0; index < refundableCount; index += 1) {
    const remainingSlots = refundableCount - index - 1;
    const amount = index === refundableCount - 1 ? refundRemaining : Math.min(revenue[index], Math.max(1, refundRemaining - remainingSlots));
    refunds[index] = amount;
    refundRemaining -= amount;
  }
  // Any sub-penny FX remainder lives on the last refunded sale as in the source
  // batch. No automatic fee credit or inventory reversal is synthesized.
  const netRevenue = revenue.map((value, index) => Math.max(0, value - refunds[index]));
  const split = (value: number) => apportionTransactionMinor(value, quantities);
  const fees = split(record.marketplaceFeesMinor);
  const advertising = record.advertisingMinor === null ? null : split(record.advertisingMinor);
  const shipping = split(record.shippingMinor);
  const other = split(record.otherDirectCostsMinor);
  const allocated = apportionTransactionMinor(record.allocatedExpensesMinor, netRevenue);
  const sourceGross = split(source.grossSalesMinor);
  const sourceDiscount = split(source.discountsMinor);
  const sourceRefund = apportionTransactionMinor(source.refundsMinor, refunds);
  const sourceAds = source.advertisingMinor === null ? null : split(source.advertisingMinor);
  const sourceShipping = split(source.shippingMinor);
  const sourceOther = split(source.otherDirectCostsMinor);
  const sourceFeeTotals = FEE_KEYS.map((key) => source.marketplaceFeeComponents[key]);
  const sourceFeeParts = splitFeeCategories(sourceFeeTotals, split(sourceFeeTotals.reduce((sum, value) => sum + value, 0)));
  // Normalize the total once, as Phase 3 does, then apportion represented fee
  // categories. Independent category FX rounding must not introduce pennies.
  const reportingFeeTotals = apportionFeeMinor(record.marketplaceFeesMinor, sourceFeeTotals);
  const reportingFeeParts = splitFeeCategories(reportingFeeTotals, fees);
  return quantities.map((quantity, index) => {
    const feeComponents = Object.fromEntries(FEE_KEYS.map((key, feeIndex) => [key, reportingFeeParts[feeIndex][index]])) as unknown as MarketplaceFeeComponents;
    return {
      ...record,
      id: `${record.transactionId}:line-${String(index + 1).padStart(2, '0')}`,
      transactionId: `${record.transactionId}:line-${String(index + 1).padStart(2, '0')}`,
      parentRecordId: record.id,
      lineIndex: index,
      orders: 1,
      refundedOrders: index < refundableCount ? 1 : 0,
      units: quantity,
      grossSalesMinor: gross[index],
      discountsMinor: discount[index],
      refundsMinor: refunds[index],
      cogsMinor: record.cogsMinor === null ? null : (record.cogsMinor / record.units) * quantity,
      marketplaceFeesMinor: fees[index],
      advertisingMinor: advertising?.[index] ?? null,
      shippingMinor: shipping[index],
      otherDirectCostsMinor: other[index],
      allocatedExpensesMinor: allocated[index],
      reportingFeeComponents: feeComponents,
      sourceAmounts: {
        grossSalesMinor: sourceGross[index], discountsMinor: sourceDiscount[index], refundsMinor: sourceRefund[index],
        marketplaceFeeComponents: Object.fromEntries(FEE_KEYS.map((key, feeIndex) => [key, sourceFeeParts[feeIndex][index]])) as unknown as MarketplaceFeeComponents,
        advertisingMinor: sourceAds?.[index] ?? null, shippingMinor: sourceShipping[index], otherDirectCostsMinor: sourceOther[index],
      },
    };
  });
}

function transactionFreshness(input: TransactionRepositoryInput, marketplace: Marketplace, accountId: string): DataFreshness {
  if ((input.scenarioId === 'amazon-delayed' && marketplace === 'amazon')
    || (input.scenarioId === 'ebay-auth-failed' && marketplace === 'ebay')
    || (input.scenarioId === 'temu-import-running' && marketplace === 'temu')
    || input.scenarioId === 'first-sync') return getScenarioRuntime(input.scenarioId).freshness;
  const selected = input.marketplaceAccounts.filter((account) => account.id === accountId && account.marketplace === marketplace
    && input.authorisedAccountIds.includes(account.id)
    && (input.context.companyId === 'all' || account.companyId === input.context.companyId)
    && (!input.context.marketplaceAccountIds.length || input.context.marketplaceAccountIds.includes(account.id)));
  if (selected.some((account) => account.status === 'authentication_required' || account.status === 'failed')) return { state: 'error', label: `${marketplace === 'ebay' ? 'eBay' : marketplace} authentication required`, detail: 'Previously imported transactions remain available. Reconnect the account to resume updates.' };
  if (selected.some((account) => account.status === 'delayed')) return { state: 'warning', label: 'Marketplace data delayed', detail: 'Available transactions are shown; the selected account has a delayed sync.' };
  if (selected.some((account) => ['syncing', 'pending', 'retrying'].includes(account.status))) return { state: 'syncing', label: 'Transactions are still importing', detail: 'Available transactions are shown while the financial import continues.' };
  return { state: 'fresh', label: 'Data up to date', detail: 'Using the last successful marketplace sync.' };
}

function worstFreshness(values: DataFreshness[], fallback: DataFreshness) {
  const rank = { fresh: 0, warning: 1, syncing: 2, error: 3 };
  return [...values].sort((a, b) => rank[b.state] - rank[a.state])[0] ?? fallback;
}

function rateFor(history: HistoricalCogsRate[], date: string) {
  return history.find((rate) => rate.effectiveFrom <= date && (rate.effectiveTo === null || date < rate.effectiveTo)) ?? null;
}

function sourceIds(line: PreparedTransactionLine) {
  return ['sale', ...(line.discountsMinor ? ['discount'] : []), ...(line.refundsMinor ? ['refund'] : []),
    ...FEE_KEYS.filter((key) => line.reportingFeeComponents[key] !== 0).map((key) => `fee-${key}`),
    ...(line.advertisingMinor !== null && line.advertisingMinor !== 0 ? ['advertising'] : []),
    ...(line.shippingMinor ? ['shipping'] : []), ...(line.otherDirectCostsMinor ? ['other-cost'] : [])]
    .map((key) => `${line.id}:event:${key}`);
}

export function transactionProfitabilityStatus(transaction: Pick<ProfitabilityTransaction, 'completenessState' | 'refundsMinor' | 'knownNetProfitMinor' | 'marginBps'>): TransactionProfitabilityStatus {
  if (transaction.completenessState !== 'complete') return 'incomplete';
  if (transaction.refundsMinor > 0) return 'refunded';
  if (transaction.knownNetProfitMinor !== null && transaction.knownNetProfitMinor < 0) return 'loss_making';
  if (transaction.marginBps !== null && transaction.marginBps < LOW_MARGIN_THRESHOLD_BPS) return 'low_margin';
  return 'profitable';
}

export interface TransactionAnalyticsSnapshot {
  input: TransactionRepositoryInput;
  dataset: AnalyticsDataset;
  groupState: OrganisationProductGroupsState;
  lines: PreparedTransactionLine[];
  transactions: ProfitabilityTransaction[];
  ratesByProduct: Map<string, HistoricalCogsRate[]>;
}

export function createTransactionAnalyticsSnapshot(dataset: AnalyticsDataset, input: TransactionRepositoryInput): TransactionAnalyticsSnapshot {
  const groupState = organisationProductGroupsState(mockProductGroupsStore.read(), input.organisation.id);
  const products = new Map(dataset.products.map((item) => [item.id, item]));
  const listings = new Map(dataset.listings.map((item) => [item.id, item]));
  const accounts = new Map(input.marketplaceAccounts.map((item) => [item.id, item]));
  const companies = new Map(input.companies.map((item) => [item.id, item]));
  const ratesByProduct = new Map<string, HistoricalCogsRate[]>();
  dataset.cogsHistory.forEach((rate) => ratesByProduct.set(rate.productId, [...(ratesByProduct.get(rate.productId) ?? []), rate]));
  ratesByProduct.forEach((rates) => rates.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)));
  const membershipsByProduct = new Map<string, Array<{ groupId: string; effectiveFrom: string; effectiveTo: string | null }>>();
  Object.values(groupState.membershipsByGroup).flat().filter((item) => item.status === 'active').forEach((membership) => {
    const product = products.get(membership.productId);
    const group = groupState.groups[membership.groupId];
    if (!product || !group || membership.organisationId !== input.organisation.id || group.organisationId !== input.organisation.id
      || membership.companyId !== product.ownerCompanyId || group.companyId !== product.ownerCompanyId) return;
    membershipsByProduct.set(membership.productId, [...(membershipsByProduct.get(membership.productId) ?? []), membership]);
  });
  const sources = new Map(dataset.records.map((record) => [record.id, record]));
  const noData = getScenarioRuntime(input.scenarioId).resultMode === 'empty' || getScenarioRuntime(input.scenarioId).accountMode === 'none';
  const parents = noData ? [] : filterProfitabilityRecords(prepareProfitabilityRecords(dataset, input), input.context).filter((record) => {
    const product = products.get(record.productId), listing = listings.get(record.listingId), account = accounts.get(record.marketplaceAccountId), company = companies.get(record.companyId);
    return record.organisationId === input.organisation.id && input.context.organisationId === input.organisation.id
      && product?.organisationId === input.organisation.id && company?.organisationId === input.organisation.id
      && product.ownerCompanyId === record.companyId && listing?.companyId === record.companyId
      && listing.productId === record.productId && listing.marketplaceAccountId === record.marketplaceAccountId
      && account?.companyId === record.companyId && account.marketplace === record.marketplace && listing.marketplace === record.marketplace;
  });
  const lines = parents.flatMap((record) => splitProfitabilityRecord(record, sources.get(record.id)!));
  const transactions = lines.map((line): ProfitabilityTransaction => {
    const product = products.get(line.productId)!, listing = listings.get(line.listingId)!, account = accounts.get(line.marketplaceAccountId)!;
    const profit = deriveDetailedProfitability(line);
    const rate = line.cogsMinor === null ? null : rateFor(ratesByProduct.get(line.productId) ?? [], line.occurredOn);
    const membership = (membershipsByProduct.get(line.productId) ?? []).find((item) => item.effectiveFrom <= line.occurredOn && (item.effectiveTo === null || line.occurredOn < item.effectiveTo));
    const group = membership ? groupState.groups[membership.groupId] : null;
    const cogsSource = line.cogsMinor === null ? 'missing' as const : rate?.inheritance ? 'inherited' as const : 'direct' as const;
    const completenessState = profit.missing.length === 2 ? 'missing_cogs_and_advertising' as const : profit.missing.includes('cogs') ? 'missing_cogs' as const : profit.missing.includes('advertising') ? 'advertising_unavailable' as const : 'complete' as const;
    const feeRateBps = safeRatioBps(line.marketplaceFeesMinor, profit.revenueMinor);
    const eventIds = sourceIds(line);
    const row: ProfitabilityTransaction = {
      id: line.id, organisationId: line.organisationId, companyId: line.companyId, companyName: companies.get(line.companyId)!.name,
      marketplace: line.marketplace, marketplaceAccountId: account.id, marketplaceAccountName: account.displayName,
      marketplaceOrderId: `${line.marketplace === 'amazon' ? 'AMZ' : line.marketplace === 'ebay' ? 'EB' : 'TM'}-${line.occurredOn.replaceAll('-', '')}-${stableHash(account.id).toString(36).slice(-4).toUpperCase()}-${String(Math.floor((stableHash(product.id) % 80) / 2)).padStart(2, '0')}-${String(line.lineIndex + 1).padStart(2, '0')}`,
      marketplaceOrderLineId: `${stableHash(line.listingId).toString(36).toUpperCase()}-${line.lineIndex + 1}`,
      transactionDate: line.occurredOn, productId: product.id, product, title: product.title,
      listingId: listing.id, listingIdentifier: listing.asin ?? listing.ebayItemId ?? listing.temuListingId ?? listing.marketplaceProductId ?? listing.id,
      internalSku: product.internalSku, marketplaceSku: listing.marketplaceSku, quantity: line.units,
      reportingCurrency: 'GBP', sourceCurrency: line.sourceCurrency, sourceToReportingRateBps: line.sourceToReportingRateBps,
      grossSalesMinor: line.grossSalesMinor, discountsMinor: line.discountsMinor, revenueMinor: profit.revenueMinor, refundsMinor: line.refundsMinor,
      netRevenueMinor: profit.netRevenueMinor, cogsMinor: line.cogsMinor, unitCogsMinor: line.cogsMinor === null ? null : line.cogsMinor / line.units,
      marketplaceFeesMinor: line.marketplaceFeesMinor, advertisingMinor: line.advertisingMinor, shippingMinor: line.shippingMinor,
      otherDirectCostsMinor: line.otherDirectCostsMinor, allocatedExpensesMinor: input.canViewSensitiveExpenses ? line.allocatedExpensesMinor : null,
      grossProfitKnownMinor: profit.grossProfitKnownMinor, knownNetProfitMinor: profit.knownNetProfitMinor, netProfitMinor: profit.netProfitMinor,
      marginBps: profit.marginBps, knownMarginBps: profit.knownMarginBps, profitabilityCoverageBps: profit.complete ? 10_000 : 0, completenessState,
      profitabilityStatus: 'incomplete', refundState: line.refundsMinor === 0 ? 'none' : line.refundsMinor >= profit.revenueMinor ? 'full' : 'partial',
      refundRateBps: safeRatioBps(line.refundsMinor, profit.revenueMinor), feeRateBps, highFees: (feeRateBps ?? 0) >= 1_650,
      cogsSource, cogsSourceLabel: cogsSource === 'missing' ? 'Missing COGS' : cogsSource === 'inherited' ? 'Inherited from Product Group' : rate?.source && ['single-edit', 'bulk-edit', 'percentage-adjustment'].includes(rate.source) ? 'Manual Product COGS' : 'Imported Product COGS',
      productGroupId: group?.id ?? rate?.inheritance?.productGroupId ?? null, productGroupName: group?.name ?? rate?.inheritance?.productGroupName ?? null,
      sourceEventIds: eventIds, sourceEventCount: eventIds.length, freshness: transactionFreshness(input, line.marketplace, account.id),
    };
    row.profitabilityStatus = transactionProfitabilityStatus(row);
    return row;
  });
  return { input, dataset, groupState, lines, transactions, ratesByProduct };
}

function matchesFilters(row: ProfitabilityTransaction, query: TransactionQuery, snapshot: TransactionAnalyticsSnapshot) {
  if (query.productId && row.productId !== query.productId) return false;
  if (query.productGroupId && row.productGroupId !== query.productGroupId) return false;
  if (query.costRecordId) {
    const rate = rateFor(snapshot.ratesByProduct.get(row.productId) ?? [], row.transactionDate);
    if (row.cogsMinor === null || (rate?.id !== query.costRecordId && rate?.inheritance?.groupCostRecordId !== query.costRecordId)) return false;
  }
  const search = query.search?.trim().toLocaleLowerCase('en-GB');
  if (search && ![row.id, row.marketplaceOrderId, row.marketplaceOrderLineId, row.title, row.internalSku, row.marketplaceSku, row.listingIdentifier].join(' ').toLocaleLowerCase('en-GB').includes(search)) return false;
  if (query.profitabilityStatus && query.profitabilityStatus !== 'all') {
    if (query.profitabilityStatus === 'refunded' ? row.refundsMinor === 0
      : query.profitabilityStatus === 'loss_making' ? row.knownNetProfitMinor === null || row.knownNetProfitMinor >= 0
        : query.profitabilityStatus === 'low_margin' ? row.marginBps === null || row.marginBps < 0 || row.marginBps >= LOW_MARGIN_THRESHOLD_BPS
          : query.profitabilityStatus === 'profitable' ? row.marginBps === null || row.marginBps < LOW_MARGIN_THRESHOLD_BPS
            : row.completenessState === 'complete') return false;
  }
  if (query.cogsSource && query.cogsSource !== 'all' && row.cogsSource !== query.cogsSource) return false;
  if (query.refundState && query.refundState !== 'all' && (query.refundState === 'refunded' ? row.refundsMinor === 0 : row.refundState !== query.refundState)) return false;
  if (query.completeness && query.completeness !== 'all' && (query.completeness === 'complete') !== (row.completenessState === 'complete')) return false;
  if (query.marginState && query.marginState !== 'all') {
    if (row.marginBps === null) return false;
    if (query.marginState === 'loss_making' && row.marginBps >= 0) return false;
    if (query.marginState === 'low_margin' && (row.marginBps < 0 || row.marginBps >= LOW_MARGIN_THRESHOLD_BPS)) return false;
    if (query.marginState === 'profitable' && row.marginBps < LOW_MARGIN_THRESHOLD_BPS) return false;
  }
  return !query.highFees || row.highFees;
}

export function filterTransactionSnapshot(snapshot: TransactionAnalyticsSnapshot, query: TransactionQuery) {
  const rows = snapshot.transactions.filter((row) => matchesFilters(row, query, snapshot));
  const sorting = query.sorting?.length ? query.sorting : [{ field: 'date' as const, direction: 'desc' as const }];
  const valueFor = (row: ProfitabilityTransaction, field: typeof sorting[number]['field']) => field === 'date' ? row.transactionDate : field === 'revenue' ? row.revenueMinor : field === 'netProfit' ? row.knownNetProfitMinor : field === 'margin' ? row.marginBps : field === 'refunds' ? row.refundsMinor : field === 'fees' ? row.marketplaceFeesMinor : row.cogsMinor;
  return rows.sort((a, b) => {
    for (const sort of sorting) {
      const av = valueFor(a, sort.field), bv = valueFor(b, sort.field);
      // Unknown values stay last in both directions; null is never zero.
      if (av === null && bv !== null) return 1;
      if (bv === null && av !== null) return -1;
      if (av === null || bv === null) continue;
      const difference = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv);
      if (difference) return sort.direction === 'asc' ? difference : -difference;
    }
    return a.id.localeCompare(b.id);
  });
}

export function transactionSummary(snapshot: TransactionAnalyticsSnapshot, rows: ProfitabilityTransaction[]): TransactionSummary {
  const ids = new Set(rows.map((row) => row.id));
  const totals = calculateDashboardTotals(snapshot.lines.filter((line) => ids.has(line.id)));
  return {
    ...totals, allocatedExpensesMinor: snapshot.input.canViewSensitiveExpenses ? totals.allocatedExpensesMinor : null,
    covered: { ...totals.covered, allocatedExpensesMinor: snapshot.input.canViewSensitiveExpenses ? totals.covered.allocatedExpensesMinor : null },
    transactions: rows.length, lossMakingTransactions: rows.filter((row) => row.knownNetProfitMinor !== null && row.knownNetProfitMinor < 0).length,
    refundedTransactions: rows.filter((row) => row.refundsMinor > 0).length,
  };
}

export function aggregateTransactionPage(dataset: AnalyticsDataset, query: TransactionQuery): TransactionPage {
  const snapshot = createTransactionAnalyticsSnapshot(dataset, query);
  const rows = filterTransactionSnapshot(snapshot, query);
  const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize ?? 25)));
  const pageCount = Math.ceil(rows.length / pageSize);
  const page = Math.min(Math.max(0, Math.trunc(query.page ?? 0)), Math.max(0, pageCount - 1));
  const products = [...new Map(snapshot.transactions.map((row) => [row.productId, { id: row.productId, title: row.title, internalSku: row.internalSku }])).values()].sort((a, b) => a.title.localeCompare(b.title));
  const productGroups = [...new Map(snapshot.transactions.flatMap((row) => row.productGroupId && row.productGroupName ? [[row.productGroupId, { id: row.productGroupId, name: row.productGroupName }] as const] : [])).values()];
  return {
    items: rows.slice(page * pageSize, (page + 1) * pageSize), total: rows.length, page, pageSize, pageCount,
    summary: transactionSummary(snapshot, rows), products, productGroups,
    freshness: worstFreshness(snapshot.transactions.map((row) => row.freshness), getScenarioRuntime(query.scenarioId).freshness),
    sensitiveExpensesVisible: query.canViewSensitiveExpenses,
  };
}

function feeLabel(key: typeof FEE_KEYS[number], marketplace: Marketplace) {
  return key === 'referralMinor' ? marketplace === 'amazon' ? 'Referral fee' : marketplace === 'ebay' ? 'Final value fee' : 'Marketplace fee'
    : key === 'fulfilmentMinor' ? 'Fulfilment fee' : key === 'storageMinor' ? 'Storage fee' : key === 'promotedListingMinor' ? 'Promoted listing fee' : 'Other marketplace fee';
}

export function transactionSourceEvents(line: PreparedTransactionLine): FinancialSourceEvent[] {
  const seed = stableHash(line.id);
  const time = `${String(8 + seed % 10).padStart(2, '0')}:${String((seed >>> 5) % 60).padStart(2, '0')}:00.000Z`;
  const event = (key: string, label: string, eventType: FinancialSourceEvent['eventType'], component: FinancialSourceEvent['component'], sourceAmount: number, amount: number, note: string, dayOffset = 0): FinancialSourceEvent => ({
    id: `${line.id}:event:${key}`, profitabilityTransactionId: line.id, organisationId: line.organisationId,
    companyId: line.companyId, marketplace: line.marketplace, marketplaceAccountId: line.marketplaceAccountId,
    eventType, component, label, sourceReference: `${line.parentRecordId}:${key}`,
    sourceTimestamp: `${shiftIsoDate(line.occurredOn, dayOffset)}T${time}`,
    amountMinor: sourceAmount, currency: line.sourceCurrency, reportingAmountMinor: amount,
    reportingCurrency: 'GBP', sourceToReportingRateBps: line.sourceToReportingRateBps,
    description: note, syncJobId: `${line.marketplaceAccountId}:financial-batch:${line.occurredOn}`,
    evidenceNote: 'Apportioned from the shared financial batch. Reporting totals use the canonical batch FX conversion; line-level rounding remainders are retained.',
  });
  const result = [event('sale', 'Gross sale', 'sale', 'revenue', line.sourceAmounts.grossSalesMinor, line.grossSalesMinor, 'Gross sale before represented discounts and refunds.')];
  if (line.discountsMinor) result.push(event('discount', 'Sales discount', 'adjustment', 'revenue', -line.sourceAmounts.discountsMinor, -line.discountsMinor, 'Promotion or discount recorded in the source financial batch.'));
  if (line.refundsMinor) result.push(event('refund', 'Customer refund', 'refund', 'refunds', -line.sourceAmounts.refundsMinor, -line.refundsMinor, TRANSACTION_REFUND_NOTE, 3));
  FEE_KEYS.forEach((key) => {
    if (!line.reportingFeeComponents[key]) return;
    result.push(event(`fee-${key}`, feeLabel(key, line.marketplace), line.reportingFeeComponents[key] < 0 ? 'credit' : 'marketplace-fee', 'marketplaceFees', -line.sourceAmounts.marketplaceFeeComponents[key], -line.reportingFeeComponents[key], 'Represented fee component apportioned from the marketplace financial batch.'));
  });
  if (line.advertisingMinor !== null && line.advertisingMinor !== 0) result.push(event('advertising', 'Advertising attribution', 'advertising', 'advertising', -(line.sourceAmounts.advertisingMinor ?? 0), -line.advertisingMinor, TRANSACTION_ADVERTISING_NOTE, 1));
  if (line.shippingMinor) result.push(event('shipping', 'Direct shipping cost', 'shipping', 'shipping', -line.sourceAmounts.shippingMinor, -line.shippingMinor, 'Direct delivery cost recorded in the financial dataset.'));
  if (line.otherDirectCostsMinor) result.push(event('other-cost', 'Other direct cost', 'other-cost', 'otherDirectCosts', -line.sourceAmounts.otherDirectCostsMinor, -line.otherDirectCostsMinor, 'Additional directly attributable cost, separate from marketplace fees and recurring expense allocations.'));
  return result.sort((a, b) => a.sourceTimestamp.localeCompare(b.sourceTimestamp) || a.id.localeCompare(b.id));
}

export function aggregateTransactionDetail(dataset: AnalyticsDataset, query: TransactionDetailQuery): TransactionDetail | null {
  const snapshot = createTransactionAnalyticsSnapshot(dataset, query);
  const transaction = snapshot.transactions.find((row) => row.id === query.transactionId);
  if (!transaction) return null;
  const line = snapshot.lines.find((row) => row.id === transaction.id)!;
  const rate = transaction.cogsMinor === null ? null : rateFor(snapshot.ratesByProduct.get(transaction.productId) ?? [], transaction.transactionDate);
  const sourceEvents = transactionSourceEvents(line);
  const fees: TransactionFeeBreakdown[] = FEE_KEYS.filter((key) => line.reportingFeeComponents[key] !== 0).map((key) => ({ key, label: feeLabel(key, line.marketplace), amountMinor: line.reportingFeeComponents[key], sourceEventId: `${line.id}:event:fee-${key}` }));
  const costNote = rate?.inheritance ? 'The effective Product Group base cost and historical membership pack quantity determine unit COGS. Sold quantity multiplies that unit cost.'
    : rate ? 'The approved direct Product cost effective on the transaction date takes precedence over Product Group inheritance.'
      : 'Profitability is incomplete because COGS is not available for this Product on the transaction date.';
  const componentEvents = (component: FinancialSourceEvent['component']) => sourceEvents.filter((event) => event.component === component).map((event) => event.id);
  const row = (key: TransactionWaterfallRow['key'], label: string, amountMinor: number | null, operation: TransactionWaterfallRow['operation'], source: string, method: TransactionWaterfallRow['method'], note: string, ids: string[] = [], date = transaction.transactionDate): TransactionWaterfallRow => ({ key, label, amountMinor, operation, complete: amountMinor !== null, source, sourceDate: date, method, sourceEventIds: ids, note });
  const waterfall: TransactionWaterfallRow[] = [
    row('revenue', 'Revenue', transaction.revenueMinor, 'start', 'Marketplace gross sale less recorded discounts', 'synced', 'Revenue equals gross sales less represented discounts.', componentEvents('revenue')),
    row('refunds', 'Refunds', transaction.refundsMinor, 'subtract', 'Marketplace refund evidence', 'synced', TRANSACTION_REFUND_NOTE, componentEvents('refunds'), sourceEvents.find((event) => event.eventType === 'refund')?.sourceTimestamp ?? transaction.transactionDate),
    row('netRevenue', 'Net Revenue', transaction.netRevenueMinor, 'subtotal', 'Canonical profitability calculation', 'calculated', 'Revenue less refunds.'),
    row('cogs', 'COGS', transaction.cogsMinor, 'subtract', transaction.cogsSourceLabel, rate?.inheritance ? 'calculated' : rate?.source && ['single-edit', 'bulk-edit', 'percentage-adjustment'].includes(rate.source) ? 'entered' : rate ? 'imported' : 'unavailable', costNote, [], rate?.effectiveFrom ?? transaction.transactionDate),
    row('marketplaceFees', 'Marketplace Fees', transaction.marketplaceFeesMinor, 'subtract', 'Marketplace fee components', 'synced', 'Total of the represented marketplace fee components below.', componentEvents('marketplaceFees')),
    row('advertising', 'Advertising', transaction.advertisingMinor, 'subtract', 'Product/account advertising attribution', transaction.advertisingMinor === null ? 'unavailable' : 'calculated', transaction.advertisingMinor === null ? 'Advertising data is not available for this sale; Net Profit is incomplete.' : TRANSACTION_ADVERTISING_NOTE, componentEvents('advertising')),
    row('shipping', 'Shipping', transaction.shippingMinor, 'subtract', 'Direct shipping financial event', 'synced', 'Recorded direct delivery cost.', componentEvents('shipping')),
    row('otherDirectCosts', 'Other Direct Costs', transaction.otherDirectCostsMinor, 'subtract', 'Direct cost financial event', 'synced', 'Direct costs are separate from allocated recurring or one-off expenses.', componentEvents('otherDirectCosts')),
    { ...row('allocatedExpenses', 'Allocated Expenses', transaction.allocatedExpensesMinor, 'subtract', query.canViewSensitiveExpenses ? 'Dashboard expense allocation' : 'Restricted expense amount', query.canViewSensitiveExpenses ? 'calculated' : 'restricted', query.canViewSensitiveExpenses ? TRANSACTION_ALLOCATION_NOTE : 'The amount is restricted by your role. Net Profit still includes the full allocated expense deduction.'), sensitive: true },
    row('netProfit', transaction.completenessState === 'complete' ? 'Net Profit' : 'Known Net Profit', transaction.knownNetProfitMinor, 'result', 'Canonical Phase 3 financial calculation', transaction.knownNetProfitMinor === null ? 'unavailable' : 'calculated', transaction.knownNetProfitMinor === null ? `Profitability is incomplete because ${[...(transaction.cogsMinor === null ? ['effective-dated COGS'] : []), ...(transaction.advertisingMinor === null ? ['advertising attribution'] : [])].join(' and ')} is unavailable. Missing costs are not treated as zero.` : 'Net Revenue less all represented costs and allocated expenses.'),
  ];
  const canViewAudit = query.principal.role.capabilities.includes('audit.view');
  const activity = canViewAudit && rate ? [{
    id: `${line.id}:applied:${rate.id}`, occurredAt: rate.approvedAt ?? `${rate.effectiveFrom}T09:15:00.000Z`,
    title: rate.inheritance ? 'Product Group cost applied' : 'Approved Product COGS applied',
    description: rate.reason ?? 'The effective cost record is applied to this sale using its transaction date.',
    actor: rate.approvedByName ?? 'Approved supplier cost import', sourceReferenceId: rate.sourceReferenceId ?? rate.id,
  }, ...snapshot.groupState.auditEvents.filter((event) => event.groupId === transaction.productGroupId
    && event.organisationId === transaction.organisationId && event.companyId === transaction.companyId)
    .map((event) => ({ id: event.id, occurredAt: event.occurredAt, title: event.action.replace('product-group.', '').replaceAll('-', ' '), description: event.reason, actor: event.actorName, sourceReferenceId: event.targetId }))]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) : [];
  return {
    transaction, waterfall, sourceEvents, fees,
    costProvenance: { source: transaction.cogsSource, label: transaction.cogsSourceLabel, unitCostMinor: transaction.unitCogsMinor, quantity: transaction.quantity, totalCogsMinor: transaction.cogsMinor, record: rate, productGroupId: transaction.productGroupId, productGroupName: transaction.productGroupName, note: costNote },
    listing: dataset.listings.find((listing) => listing.id === transaction.listingId)!,
    account: query.marketplaceAccounts.find((account) => account.id === transaction.marketplaceAccountId)!, activity,
    relatedTransactions: snapshot.transactions.filter((row) => row.marketplaceOrderId === transaction.marketplaceOrderId && row.id !== transaction.id).slice(0, 5),
    orderTransactionCount: snapshot.transactions.filter((row) => row.marketplaceOrderId === transaction.marketplaceOrderId).length,
    sensitiveExpensesVisible: query.canViewSensitiveExpenses, refundNote: TRANSACTION_REFUND_NOTE, advertisingNote: TRANSACTION_ADVERTISING_NOTE,
    allocationNote: TRANSACTION_ALLOCATION_NOTE, fixtureNote: TRANSACTION_FIXTURE_NOTE,
  };
}
