import type {
  AnalyticsDataset,
  DashboardFinancialTotals,
  DashboardRepositoryInput,
  HistoricalCogsRate,
} from '@/src/domain/analytics';
import type {
  AnalysisContext,
  DataFreshness,
  Marketplace,
  MarketplaceAccount,
  MarketplaceListing,
  Product,
} from '@/src/domain/models';
import {
  LOW_MARGIN_THRESHOLD_BPS,
  SUFFICIENT_PROFITABILITY_COVERAGE_BPS,
  type ProductActivityEvent,
  type ProductActivityResult,
  type ProductCogsStatus,
  type ProductCostHistory,
  type ProductCostPeriod,
  type ProductCogsSourceLabel,
  type ProductDetailOverview,
  type ProductExportRow,
  type ProductListItem,
  type ProductListingDetail,
  type ProductListingsResult,
  type ProductLookupResult,
  type ProductPage,
  type ProductPriceRange,
  type ProductProfitabilityDetail,
  type ProductProfitabilityStatus,
  type ProductSorting,
  type ProductTransactionPreview,
  type ProductTransactionsResult,
  type ProductTrendResult,
} from '@/src/domain/products';
import {
  bucketKey,
  bucketLabel,
  deriveDetailedProfitability,
  normaliseMinor,
  safeRatioBps,
  trendGranularity,
} from '@/src/domain/financial-calculations';
import { getScenarioRuntime } from '@/src/fixtures/scenarios';
import { stableHash } from '@/src/fixtures/analytics-data';
import { COGS_TODAY, cogsSourceLabel } from '@/src/domain/cogs';
import {
  buildProfitBridge,
  calculateDashboardTotals,
  filterProfitabilityRecords,
  prepareProfitabilityRecords,
  type PreparedProfitabilityRecord,
} from '@/src/services/analytics/analytics-aggregation';
import type { ProductDetailQuery, ProductQuery } from '@/src/services/contracts';

const COGS_STATUS_ORDER: Record<ProductCogsStatus, number> = {
  missing: 0,
  partial_history: 1,
  needs_review: 2,
  complete: 3,
};

interface ProductAnalyticsSnapshot {
  input: DashboardRepositoryInput;
  dataset: AnalyticsDataset;
  prepared: PreparedProfitabilityRecord[];
  currentRecords: PreparedProfitabilityRecord[];
  accessibleProducts: Product[];
  accessibleListings: MarketplaceListing[];
  scopedListings: MarketplaceListing[];
  accountById: Map<string, MarketplaceAccount>;
}

function scopedListing(listing: MarketplaceListing, context: AnalysisContext) {
  return (context.companyId === 'all' || listing.companyId === context.companyId)
    && (context.marketplace === 'all' || listing.marketplace === context.marketplace)
    && (context.marketplaceAccountIds.length === 0 || context.marketplaceAccountIds.includes(listing.marketplaceAccountId));
}

export function createProductAnalyticsSnapshot(dataset: AnalyticsDataset, input: DashboardRepositoryInput): ProductAnalyticsSnapshot {
  const authorisedCompanyIds = new Set(input.authorisedCompanyIds);
  const authorisedAccountIds = new Set(input.authorisedAccountIds);
  const accountById = new Map(input.marketplaceAccounts.map((account) => [account.id, account]));
  const productById = new Map(dataset.products.map((product) => [product.id, product]));
  const accessibleListings = dataset.listings.filter((listing) => {
    const product = productById.get(listing.productId);
    const account = accountById.get(listing.marketplaceAccountId);
    if (!product || !account) return false;
    return product.organisationId === input.context.organisationId
      && product.ownerCompanyId === listing.companyId
      && account.companyId === product.ownerCompanyId
      && account.marketplace === listing.marketplace
      && authorisedCompanyIds.has(product.ownerCompanyId)
      && authorisedAccountIds.has(account.id);
  });
  const accessibleProductIds = new Set(accessibleListings.map((listing) => listing.productId));
  const accessibleProducts = dataset.products.filter((product) => product.organisationId === input.context.organisationId
    && authorisedCompanyIds.has(product.ownerCompanyId)
    && accessibleProductIds.has(product.id));
  const prepared = prepareProfitabilityRecords(dataset, input);
  return {
    input,
    dataset,
    prepared,
    currentRecords: filterProfitabilityRecords(prepared, input.context),
    accessibleProducts,
    accessibleListings,
    scopedListings: accessibleListings.filter((listing) => scopedListing(listing, input.context)),
    accountById,
  };
}

function productRecords(snapshot: ProductAnalyticsSnapshot, productId: string) {
  return snapshot.currentRecords.filter((record) => record.productId === productId);
}

function productListings(snapshot: ProductAnalyticsSnapshot, productId: string, currentScope = true) {
  const source = currentScope ? snapshot.scopedListings : snapshot.accessibleListings;
  return source.filter((listing) => listing.productId === productId);
}

function isNeedsReview(productId: string, input: DashboardRepositoryInput) {
  if (input.scenarioId === 'import-errors') return stableHash(`import-review:${productId}`) % 5 === 0;
  if (input.scenarioId === 'cogs-awaiting-approval') return stableHash(`approval-review:${productId}`) % 7 === 0;
  return false;
}

function baseCurrentRate(snapshot: ProductAnalyticsSnapshot, productId: string) {
  return snapshot.dataset.cogsHistory
    .filter((rate) => rate.productId === productId && rate.effectiveFrom <= COGS_TODAY && (rate.effectiveTo === null || COGS_TODAY < rate.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

function approvedCurrentRate(snapshot: ProductAnalyticsSnapshot, productId: string) {
  return snapshot.dataset.cogsHistory
    .filter((rate) => rate.productId === productId
      && Boolean(rate.sourceReferenceId)
      && rate.effectiveFrom <= COGS_TODAY
      && (rate.effectiveTo === null || COGS_TODAY < rate.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null;
}

function currentRateFor(
  snapshot: ProductAnalyticsSnapshot,
  productId: string,
  totals: DashboardFinancialTotals,
  records: PreparedProfitabilityRecord[],
) {
  const approvedCurrent = approvedCurrentRate(snapshot, productId);
  if (approvedCurrent) return approvedCurrent;
  if (getScenarioRuntime(snapshot.input.scenarioId).cogsMode === 'none') return null;
  if (records.length > 0 && totals.cogsCoverageBps === 0) return null;
  return baseCurrentRate(snapshot, productId);
}

export function productCogsStatus(
  snapshot: ProductAnalyticsSnapshot,
  productId: string,
  totals: DashboardFinancialTotals,
  records: PreparedProfitabilityRecord[],
): ProductCogsStatus {
  if (isNeedsReview(productId, snapshot.input)) return 'needs_review';
  const current = currentRateFor(snapshot, productId, totals, records);
  if (!current) return 'missing';
  if (records.length > 0 && totals.cogsCoverageBps < 10_000) return 'partial_history';
  return 'complete';
}

export function productProfitabilityStatus(
  totals: DashboardFinancialTotals,
  cogsStatus?: ProductCogsStatus,
): ProductProfitabilityStatus {
  // An empty sales cohort is mathematically "complete" in the Phase 3 totals,
  // but a Product with no current approved cost must not be presented as
  // profitable. Product cost readiness is an additional projection concern.
  if (totals.orders === 0 || totals.units === 0) return 'incomplete';
  if (cogsStatus && cogsStatus !== 'complete') return 'incomplete';
  if (!totals.profitabilityComplete || totals.profitabilityCoverageBps < SUFFICIENT_PROFITABILITY_COVERAGE_BPS) return 'incomplete';
  if ((totals.netProfitMinor ?? 0) < 0) return 'loss_making';
  if (totals.marginBps !== null && totals.marginBps < LOW_MARGIN_THRESHOLD_BPS) return 'low_margin';
  return 'profitable';
}

function listingPriceInGbp(listing: MarketplaceListing) {
  if (listing.price.currency === 'GBP') return listing.price.amountMinor;
  if (listing.price.currency === 'EUR') return normaliseMinor(listing.price.amountMinor, 8_600);
  return listing.price.amountMinor;
}

function priceRangeFor(listings: MarketplaceListing[]): ProductPriceRange {
  if (listings.length === 1) {
    return {
      minimumMinor: listings[0].price.amountMinor,
      maximumMinor: listings[0].price.amountMinor,
      currency: listings[0].price.currency,
    };
  }
  const values = listings.map(listingPriceInGbp).filter(Number.isFinite);
  return {
    currency: 'GBP',
    minimumMinor: values.length ? Math.min(...values) : null,
    maximumMinor: values.length ? Math.max(...values) : null,
  };
}

function productDataFreshness(snapshot: ProductAnalyticsSnapshot, listings: MarketplaceListing[]): DataFreshness {
  const runtime = getScenarioRuntime(snapshot.input.scenarioId);
  if (!['amazon-delayed', 'ebay-auth-failed', 'temu-import-running'].includes(snapshot.input.scenarioId)) return runtime.freshness;
  const freshness = listings.map((listing) => listingFreshness(listing, snapshot.accountById.get(listing.marketplaceAccountId), snapshot.input));
  const order: Record<DataFreshness['state'], number> = { fresh: 0, warning: 1, syncing: 2, error: 3 };
  return freshness.sort((left, right) => order[right.state] - order[left.state])[0]
    ?? { state: 'fresh', label: 'Up to date', detail: 'No channel-specific delay applies to this product.' };
}

const MANUAL_COGS_SOURCES = new Set(['single-edit', 'bulk-edit', 'percentage-adjustment']);

function cogsSourceFor(rate: HistoricalCogsRate | null): ProductCogsSourceLabel {
  if (!rate) return 'Missing COGS';
  if (rate.inheritance) return 'Inherited from Product Group';
  return rate.source && MANUAL_COGS_SOURCES.has(rate.source) ? 'Manual COGS' : 'Imported COGS';
}

function currentCostPeriod(rate: HistoricalCogsRate | null, productId: string): ProductCostPeriod | null {
  if (!rate) return null;
  return {
    id: rate.id,
    productId,
    unitCost: { amountMinor: rate.unitCostMinor, currency: rate.currency },
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo,
    source: rate.inheritance ? 'Product Group' : rate.source ? cogsSourceLabel(rate.source) : 'Supplier cost import',
    sourceReferenceId: rate.sourceReferenceId,
    changedBy: { id: rate.createdByUserId ?? 'usr-emma-richardson', name: rate.createdByName ?? 'Emma Richardson' },
    changedAt: rate.createdAt ?? `${rate.effectiveFrom}T09:15:00.000Z`,
    approvedBy: { id: rate.approvedByUserId ?? 'usr-emma-richardson', name: rate.approvedByName ?? 'Emma Richardson' },
    approvedAt: rate.approvedAt ?? `${rate.effectiveFrom}T09:15:00.000Z`,
    state: 'effective',
    reason: rate.reason ?? 'Updated supplier cost applied from its approved effective date.',
    cogsSource: cogsSourceFor(rate),
    inheritance: rate.inheritance,
  };
}

function exportRow(
  product: Product,
  listings: MarketplaceListing[],
  totals: DashboardFinancialTotals,
  currentCogsMinor: number | null,
  cogsStatus: ProductCogsStatus,
  profitabilityStatus: ProductProfitabilityStatus,
  currentRate: HistoricalCogsRate | null,
): ProductExportRow {
  const join = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))].join('; ');
  return {
    internalProductId: product.id,
    organisationId: product.organisationId,
    ownerCompanyId: product.ownerCompanyId,
    internalSku: product.internalSku,
    internalTitle: product.title,
    category: product.category ?? null,
    brand: product.brand ?? null,
    productStatus: product.status,
    marketplaces: join(listings.map((listing) => listing.marketplace)),
    marketplaceAccountIds: join(listings.map((listing) => listing.marketplaceAccountId)),
    marketplaceSkus: join(listings.map((listing) => listing.marketplaceSku)),
    asins: join(listings.map((listing) => listing.asin)),
    ebayItemIds: join(listings.map((listing) => listing.ebayItemId)),
    temuListingIds: join(listings.map((listing) => listing.temuListingId)),
    listingStatuses: join(listings.map((listing) => listing.listingStatus)),
    units: totals.units,
    revenueMinor: totals.revenueMinor,
    currentCogsMinor,
    productGroupId: currentRate?.inheritance?.productGroupId ?? '',
    productGroupName: currentRate?.inheritance?.productGroupName ?? '',
    packQuantity: currentRate?.inheritance?.packQuantity ?? null,
    cogsSource: cogsSourceFor(currentRate),
    inheritedCogs: currentRate?.inheritance ? 'Yes' : 'No',
    knownNetProfitMinor: totals.knownNetProfitMinor,
    marginBps: totals.knownMarginBps,
    cogsStatus,
    profitabilityStatus,
    profitabilityCoverageBps: totals.profitabilityCoverageBps,
  };
}

export function buildProductListItem(snapshot: ProductAnalyticsSnapshot, product: Product): ProductListItem {
  const listings = productListings(snapshot, product.id, true);
  const records = productRecords(snapshot, product.id);
  const totals = calculateDashboardTotals(records);
  const cogsStatus = productCogsStatus(snapshot, product.id, totals, records);
  const profitabilityStatus = productProfitabilityStatus(totals, cogsStatus);
  const currentRate = currentRateFor(snapshot, product.id, totals, records);
  const currentCogsMinor = currentRate?.unitCostMinor ?? null;
  const inheritance = currentRate?.inheritance ?? null;
  const marketplaces = [...new Set(listings.map((listing) => listing.marketplace))];
  const marketplaceAccountIds = [...new Set(listings.map((listing) => listing.marketplaceAccountId))];
  return {
    id: product.id,
    product,
    organisationId: product.organisationId,
    ownerCompanyId: product.ownerCompanyId,
    internalSku: product.internalSku,
    title: product.title,
    imageUrl: product.imageUrl,
    category: product.category,
    brand: product.brand,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    listings,
    marketplaces,
    companyIds: [...new Set(listings.map((listing) => listing.companyId))],
    marketplaceAccountIds,
    listingCount: listings.length,
    activeListingCount: listings.filter((listing) => listing.listingStatus === 'active').length,
    priceRange: priceRangeFor(listings),
    orders: totals.orders,
    units: totals.units,
    revenueMinor: totals.revenueMinor,
    currentCogsMinor,
    productGroup: inheritance ? { id: inheritance.productGroupId, name: inheritance.productGroupName } : null,
    packQuantity: inheritance?.packQuantity ?? null,
    cogsSource: cogsSourceFor(currentRate),
    inheritedCogs: Boolean(inheritance),
    knownNetProfitMinor: totals.knownNetProfitMinor,
    marginBps: totals.knownMarginBps,
    cogsStatus,
    profitabilityStatus,
    cogsCoverageBps: records.length ? totals.cogsCoverageBps : currentRate ? 10_000 : 0,
    profitabilityCoverageBps: totals.profitabilityCoverageBps,
    dataFreshness: productDataFreshness(snapshot, listings),
    rawExport: exportRow(product, listings, totals, currentCogsMinor, cogsStatus, profitabilityStatus, currentRate),
    // Phase 3 aliases delegate to the same totals; they are not a second engine.
    companyId: product.ownerCompanyId,
    sku: product.internalSku,
    name: product.title,
    grossRevenuePence: totals.grossSalesMinor,
    refundsPence: totals.refundsMinor,
    cogsPence: totals.cogsCoverageBps === 0 ? null : totals.cogsKnownMinor,
    marketplaceFeesPence: totals.marketplaceFeesMinor,
    advertisingPence: totals.advertisingKnownMinor,
    shippingPence: totals.shippingMinor,
    otherDirectCostsPence: totals.otherDirectCostsMinor,
    allocatedExpensesPence: snapshot.input.canViewSensitiveExpenses ? totals.allocatedExpensesMinor : 0,
    priorProfitPence: null,
    netRevenuePence: totals.netRevenueMinor,
    netProfitPence: totals.knownNetProfitMinor,
    deltaBps: null,
  };
}

function searchMatches(row: ProductListItem, search: string) {
  const query = search.trim().toLocaleLowerCase('en-GB');
  if (!query) return true;
  const listingFields = row.listings.flatMap((listing) => [
    listing.title,
    listing.marketplaceSku,
    listing.marketplaceProductId,
    listing.asin,
    listing.ebayItemId,
    listing.temuListingId,
  ]);
  return [row.product.title, row.product.internalSku, ...listingFields]
    .some((value) => value?.toLocaleLowerCase('en-GB').includes(query));
}

function compareNullable(left: number | string | null, right: number | string | null, direction: ProductSorting['direction']) {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  const compared = typeof left === 'number' && typeof right === 'number'
    ? left - right
    : String(left).localeCompare(String(right), 'en-GB', { numeric: true, sensitivity: 'base' });
  return direction === 'asc' ? compared : -compared;
}

function sortValue(row: ProductListItem, sorting: ProductSorting['field']) {
  if (sorting === 'product') return row.product.title;
  if (sorting === 'internalSku') return row.product.internalSku;
  if (sorting === 'units') return row.units;
  if (sorting === 'revenue') return row.revenueMinor;
  if (sorting === 'currentCogs') return row.currentCogsMinor;
  if (sorting === 'netProfit') return row.knownNetProfitMinor;
  if (sorting === 'margin') return row.marginBps;
  if (sorting === 'cogsStatus') return COGS_STATUS_ORDER[row.cogsStatus];
  return row.product.updatedAt;
}

function sortRows(rows: ProductListItem[], sorting: ProductSorting[]) {
  const effective = sorting.length ? sorting : [{ field: 'revenue' as const, direction: 'desc' as const }];
  return [...rows].sort((left, right) => {
    for (const sort of effective) {
      const compared = compareNullable(sortValue(left, sort.field), sortValue(right, sort.field), sort.direction);
      if (compared !== 0) return compared;
    }
    return left.product.id.localeCompare(right.product.id);
  });
}

export function aggregateProductPage(dataset: AnalyticsDataset, query: ProductQuery): ProductPage {
  const snapshot = createProductAnalyticsSnapshot(dataset, query);
  const scopedProductIds = new Set(snapshot.scopedListings.map((listing) => listing.productId));
  const categories = [...new Set(snapshot.accessibleProducts
    .filter((product) => scopedProductIds.has(product.id))
    .map((product) => product.category)
    .filter((value): value is string => Boolean(value)))].sort();
  const runtime = getScenarioRuntime(query.scenarioId);
  const allCandidates = runtime.resultMode === 'empty'
    ? []
    : snapshot.accessibleProducts.filter((product) => scopedProductIds.has(product.id));
  const candidates = query.scenarioId === 'first-sync'
    ? allCandidates.filter((product) => stableHash(`first-sync:${product.id}`) % 4 !== 0)
    : allCandidates;
  let rows = candidates.map((product) => buildProductListItem(snapshot, product));
  rows = rows
    .filter((row) => searchMatches(row, query.search))
    .filter((row) => query.cogsStatus === 'all' || row.cogsStatus === query.cogsStatus)
    .filter((row) => query.listingStatus === 'all' || row.listings.some((listing) => listing.listingStatus === query.listingStatus))
    .filter((row) => query.profitabilityStatus === 'all' || row.profitabilityStatus === query.profitabilityStatus)
    .filter((row) => query.categories.length === 0 || (row.product.category ? query.categories.includes(row.product.category) : false));

  const matchingProductIds = new Set(rows.map((row) => row.product.id));
  const matchingRecords = snapshot.currentRecords.filter((record) => matchingProductIds.has(record.productId));
  const totals = calculateDashboardTotals(matchingRecords);
  const activeListingIds = new Set(rows.flatMap((row) => row.listings
    .filter((listing) => listing.listingStatus === 'active')
    .map((listing) => listing.id)));
  const completeProducts = rows.filter((row) => row.cogsStatus === 'complete').length;
  const total = rows.length;
  const page = Math.max(0, Math.trunc(query.page));
  const pageSize = Math.min(100, Math.max(1, Math.trunc(query.pageSize)));
  const sorted = sortRows(rows, query.sorting);
  return {
    rows: sorted.slice(page * pageSize, page * pageSize + pageSize),
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize),
    categories,
    summary: {
      products: total,
      activeListings: activeListingIds.size,
      units: totals.units,
      revenueMinor: totals.revenueMinor,
      knownNetProfitMinor: totals.knownNetProfitMinor,
      cogsCoverageBps: total ? Math.round((completeProducts * 10_000) / total) : 10_000,
      profitabilityCoverageBps: totals.profitabilityCoverageBps,
      profitabilityComplete: totals.profitabilityComplete,
    },
  };
}

export function aggregateProductExportRows(dataset: AnalyticsDataset, query: ProductQuery): ProductExportRow[] {
  const first = aggregateProductPage(dataset, { ...query, page: 0, pageSize: 100 });
  const rows = [...first.rows];
  for (let page = 1; page < first.pageCount; page += 1) {
    rows.push(...aggregateProductPage(dataset, { ...query, page, pageSize: 100 }).rows);
  }
  return rows.map((row) => row.rawExport);
}

function lookup(snapshot: ProductAnalyticsSnapshot, productId: string) {
  const product = snapshot.dataset.products.find((candidate) => candidate.id === productId
    && candidate.organisationId === snapshot.input.context.organisationId);
  if (!product) return { status: 'not_found' as const };
  const accessible = snapshot.accessibleProducts.find((candidate) => candidate.id === productId);
  if (!accessible) return { status: 'assignment_denied' as const };
  return { status: 'found' as const, product: accessible };
}

export class ProductSectionAccessError extends Error {
  constructor(public readonly code: 'not_found' | 'assignment_denied', public readonly section: string) {
    super(code === 'not_found' ? 'The product could not be found.' : 'The product is outside your assignment.');
    this.name = 'ProductSectionAccessError';
  }
}

function requireProduct(snapshot: ProductAnalyticsSnapshot, productId: string, section: string) {
  const result = lookup(snapshot, productId);
  if (result.status !== 'found') throw new ProductSectionAccessError(result.status, section);
  return result.product;
}

export function aggregateProductOverview(dataset: AnalyticsDataset, query: ProductDetailQuery): ProductLookupResult {
  const snapshot = createProductAnalyticsSnapshot(dataset, query);
  const result = lookup(snapshot, query.productId);
  if (result.status !== 'found') return result;
  const product = result.product;
  const listings = productListings(snapshot, product.id, false);
  const scoped = productListings(snapshot, product.id, true);
  const records = productRecords(snapshot, product.id);
  const totals = calculateDashboardTotals(records);
  const cogsStatus = productCogsStatus(snapshot, product.id, totals, records);
  const currentRate = currentRateFor(snapshot, product.id, totals, records);
  const companies = query.companies
    .filter((company) => listings.some((listing) => listing.companyId === company.id))
    .map((company) => ({ id: company.id, name: company.name }));
  const accounts = query.marketplaceAccounts
    .filter((account) => listings.some((listing) => listing.marketplaceAccountId === account.id))
    .map((account) => ({ id: account.id, companyId: account.companyId, marketplace: account.marketplace, name: account.displayName, status: account.status }));
  const data: ProductDetailOverview = {
    product,
    listings,
    marketplaces: [...new Set(listings.map((listing) => listing.marketplace))],
    companies,
    accounts,
    listingCount: listings.length,
    activeListingCount: scoped.filter((listing) => listing.listingStatus === 'active').length,
    priceRange: priceRangeFor(scoped),
    currentCogs: currentCostPeriod(currentRate, product.id),
    cogsStatus,
    profitabilityStatus: productProfitabilityStatus(totals, cogsStatus),
    selectedPeriod: totals,
    dataFreshness: productDataFreshness(snapshot, scoped),
    inCurrentScope: scoped.length > 0,
  };
  return { status: 'found', data };
}

function groupRecords(records: PreparedProfitabilityRecord[], keyFor: (record: PreparedProfitabilityRecord) => string) {
  const groups = new Map<string, PreparedProfitabilityRecord[]>();
  records.forEach((record) => {
    const key = keyFor(record);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  });
  return groups;
}

export function aggregateProductProfitability(dataset: AnalyticsDataset, query: ProductDetailQuery): ProductProfitabilityDetail {
  const snapshot = createProductAnalyticsSnapshot(dataset, query);
  requireProduct(snapshot, query.productId, 'profitability');
  const records = productRecords(snapshot, query.productId);
  const totals = calculateDashboardTotals(records);
  const cogsStatus = productCogsStatus(snapshot, query.productId, totals, records);
  const marketplaceGroups = groupRecords(records, (record) => record.marketplace);
  const accountGroups = groupRecords(records, (record) => record.marketplaceAccountId);
  const marketplaceRows = [...marketplaceGroups.entries()].map(([marketplace, grouped]) => ({
    id: marketplace,
    label: marketplace === 'amazon' ? 'Amazon' : marketplace === 'ebay' ? 'eBay' : 'Temu',
    kind: 'marketplace' as const,
    marketplace: marketplace as Marketplace,
    totals: calculateDashboardTotals(grouped),
  })).sort((a, b) => b.totals.revenueMinor - a.totals.revenueMinor);
  const accountRows = [...accountGroups.entries()].flatMap(([accountId, grouped]) => {
    const account = snapshot.accountById.get(accountId);
    if (!account) return [];
    return [{
      id: accountId,
      label: account.displayName,
      kind: 'account' as const,
      marketplace: account.marketplace,
      marketplaceAccountId: accountId,
      totals: calculateDashboardTotals(grouped),
    }];
  }).sort((a, b) => b.totals.revenueMinor - a.totals.revenueMinor);
  const roiBps = totals.profitabilityComplete && totals.cogsKnownMinor > 0 && totals.netProfitMinor !== null
    ? safeRatioBps(totals.netProfitMinor, totals.cogsKnownMinor)
    : null;
  return {
    productId: query.productId,
    context: query.context,
    totals,
    roiBps,
    bridge: buildProfitBridge(totals, query.canViewSensitiveExpenses),
    byMarketplace: marketplaceRows,
    byAccount: accountRows,
    cogsStatus,
    profitabilityStatus: productProfitabilityStatus(totals, cogsStatus),
  };
}

function costPeriodsFor(rates: HistoricalCogsRate[]): ProductCostPeriod[] {
  const ascending = [...rates].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return ascending.map((rate, index): ProductCostPeriod => ({
    id: rate.id,
    productId: rate.productId,
    unitCost: { amountMinor: rate.unitCostMinor, currency: rate.currency },
    effectiveFrom: rate.effectiveFrom,
    effectiveTo: rate.effectiveTo,
    source: rate.source ? cogsSourceLabel(rate.source) : index === 0 ? 'Initial Import' : index === 1 ? 'Bulk Update' : 'Supplier cost import',
    sourceReferenceId: rate.sourceReferenceId,
    changedBy: rate.createdByUserId ? { id: rate.createdByUserId, name: rate.createdByName ?? rate.createdByUserId } : index === 1
      ? { id: 'usr-james-carter', name: 'James Carter' }
      : { id: 'usr-emma-richardson', name: 'Emma Richardson' },
    changedAt: rate.createdAt ?? `${rate.effectiveFrom}T09:15:00.000Z`,
    approvedBy: { id: rate.approvedByUserId ?? 'usr-emma-richardson', name: rate.approvedByName ?? 'Emma Richardson' },
    approvedAt: rate.approvedAt ?? `${rate.effectiveFrom}T09:15:00.000Z`,
    state: rate.effectiveFrom > COGS_TODAY ? 'scheduled' : rate.effectiveTo && rate.effectiveTo <= COGS_TODAY ? 'historical' : 'effective',
    reason: rate.reason ?? (index === 0 ? 'Initial approved product cost.' : 'Supplier pricing update approved for the effective period.'),
    cogsSource: cogsSourceFor(rate),
    inheritance: rate.inheritance,
  })).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
}

export function aggregateProductCosts(dataset: AnalyticsDataset, query: ProductDetailQuery): ProductCostHistory {
  const snapshot = createProductAnalyticsSnapshot(dataset, query);
  requireProduct(snapshot, query.productId, 'costs');
  const records = productRecords(snapshot, query.productId);
  const totals = calculateDashboardTotals(records);
  const status = productCogsStatus(snapshot, query.productId, totals, records);
  let rates = dataset.cogsHistory.filter((rate) => rate.productId === query.productId);
  if (status === 'missing') rates = rates.filter((rate) => Boolean(rate.sourceReferenceId));
  if (status === 'partial_history') rates = rates.filter((rate) => Boolean(rate.sourceReferenceId) || rate.effectiveFrom >= '2026-08-01');
  const history = costPeriodsFor(rates);
  const current = history.find((period) => period.effectiveFrom <= COGS_TODAY && (period.effectiveTo === null || COGS_TODAY < period.effectiveTo)) ?? null;
  const message = status === 'missing'
    ? 'COGS is missing. Product profitability cannot be fully calculated until a valid effective-date cost is added.'
    : status === 'partial_history'
      ? 'Current COGS is available, but part of the selected period has no effective cost history.'
      : status === 'needs_review'
        ? 'A cost or import exception needs review before this history is treated as approved.'
        : 'COGS history covers the selected period.';
  return {
    productId: query.productId,
    status,
    current,
    history,
    selectedPeriodCoverageBps: totals.cogsCoverageBps,
    message,
    cogsSource: cogsSourceFor(current ? rates.find((rate) => rate.id === current.id) ?? null : null),
    inheritance: current?.inheritance ?? null,
  };
}

function listingFreshness(listing: MarketplaceListing, account: MarketplaceAccount | undefined, query: DashboardRepositoryInput) {
  if (query.scenarioId === 'ebay-auth-failed' && listing.marketplace === 'ebay') {
    return { state: 'error' as const, label: 'Authentication unavailable', detail: 'Reconnect the marketplace account to resume updates.' };
  }
  if (account?.status === 'authentication_required' || account?.status === 'failed') {
    return { state: 'error' as const, label: 'Authentication unavailable', detail: 'The marketplace account needs attention.' };
  }
  if (query.scenarioId === 'amazon-delayed' && listing.marketplace === 'amazon') {
    return { state: 'warning' as const, label: 'Stale', detail: 'Amazon listing data is delayed by two hours.' };
  }
  if (query.scenarioId === 'temu-import-running' && listing.marketplace === 'temu') {
    return { state: 'syncing' as const, label: 'Importing', detail: 'Temu historical data is still importing.' };
  }
  return { state: 'fresh' as const, label: 'Up to date', detail: `Last synced ${listing.lastSyncedAt ?? 'recently'}.` };
}

export function aggregateProductListings(dataset: AnalyticsDataset, query: ProductDetailQuery): ProductListingsResult {
  const snapshot = createProductAnalyticsSnapshot(dataset, query);
  requireProduct(snapshot, query.productId, 'listings');
  const accessible = productListings(snapshot, query.productId, false);
  const scopedIds = new Set(productListings(snapshot, query.productId, true).map((listing) => listing.id));
  const listings: ProductListingDetail[] = accessible.map((listing) => {
    const account = snapshot.accountById.get(listing.marketplaceAccountId);
    const freshness = listingFreshness(listing, account, query);
    const issue = query.scenarioId === 'ebay-auth-failed' && listing.marketplace === 'ebay'
      ? 'account_authentication' as const
      : query.scenarioId === 'amazon-delayed' && listing.marketplace === 'amazon'
        ? 'stale_data' as const
        : query.scenarioId === 'temu-import-running' && listing.marketplace === 'temu'
          ? 'advertising_unavailable' as const
          : listing.issue;
    return {
      ...listing,
      issue,
      companyName: query.companies.find((company) => company.id === listing.companyId)?.name ?? listing.companyId,
      accountName: account?.displayName ?? listing.marketplaceAccountId,
      accountStatus: query.scenarioId === 'ebay-auth-failed' && listing.marketplace === 'ebay' ? 'authentication_required' : account?.status ?? 'disconnected',
      inCurrentScope: scopedIds.has(listing.id),
      dataFreshness: freshness,
    };
  });
  return { productId: query.productId, listings, accessibleListingCount: listings.length, scopedListingCount: scopedIds.size };
}

function splitInteger(total: number, count: number, index: number) {
  const quotient = Math.trunc(total / count);
  const remainder = total - quotient * count;
  return quotient + (index < Math.abs(remainder) ? Math.sign(remainder) : 0);
}

function splitRecord(record: PreparedProfitabilityRecord, accountName: string) {
  const count = Math.max(1, record.orders);
  return Array.from({ length: count }, (_, index): ProductTransactionPreview => {
    const grossSalesMinor = splitInteger(record.grossSalesMinor, count, index);
    const discountsMinor = splitInteger(record.discountsMinor, count, index);
    const refundsMinor = splitInteger(record.refundsMinor, count, index);
    const cogsMinor = record.cogsMinor === null ? null : splitInteger(record.cogsMinor, count, index);
    const marketplaceFeesMinor = splitInteger(record.marketplaceFeesMinor, count, index);
    const advertisingMinor = record.advertisingMinor === null ? null : splitInteger(record.advertisingMinor, count, index);
    const result = deriveDetailedProfitability({
      grossSalesMinor,
      discountsMinor,
      refundsMinor,
      cogsMinor,
      marketplaceFeesMinor,
      advertisingMinor,
      shippingMinor: splitInteger(record.shippingMinor, count, index),
      otherDirectCostsMinor: splitInteger(record.otherDirectCostsMinor, count, index),
      allocatedExpensesMinor: splitInteger(record.allocatedExpensesMinor, count, index),
    });
    const refunded = refundsMinor > 0;
    return {
      id: `${record.transactionId}:${index + 1}`,
      orderId: `${record.marketplace.toUpperCase()}-${record.occurredOn.replaceAll('-', '')}-${String(stableHash(`${record.id}:${index}`) % 1_000_000).padStart(6, '0')}`,
      occurredAt: `${record.occurredOn}T${String(8 + (index % 11)).padStart(2, '0')}:${String((index * 7) % 60).padStart(2, '0')}:00.000Z`,
      listingId: record.listingId,
      marketplace: record.marketplace,
      marketplaceAccountId: record.marketplaceAccountId,
      accountName,
      quantity: splitInteger(record.units, count, index),
      revenueMinor: result.revenueMinor,
      cogsMinor,
      marketplaceFeesMinor,
      netProfitMinor: result.knownNetProfitMinor,
      profitabilityComplete: result.complete,
      status: refunded ? (refundsMinor >= result.revenueMinor ? 'refunded' : 'partially_refunded') : 'completed',
    };
  });
}

export function aggregateProductTransactions(dataset: AnalyticsDataset, query: ProductDetailQuery, limit: number): ProductTransactionsResult {
  const snapshot = createProductAnalyticsSnapshot(dataset, query);
  requireProduct(snapshot, query.productId, 'transactions');
  const rows = productRecords(snapshot, query.productId)
    .flatMap((record) => splitRecord(record, snapshot.accountById.get(record.marketplaceAccountId)?.displayName ?? record.marketplaceAccountId))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id));
  const safeLimit = Math.min(25, Math.max(1, Math.trunc(limit)));
  return { productId: query.productId, rows: rows.slice(0, safeLimit), total: rows.length, limit: safeLimit, hasMore: rows.length > safeLimit };
}

export function aggregateProductTrend(dataset: AnalyticsDataset, query: ProductDetailQuery): ProductTrendResult {
  const snapshot = createProductAnalyticsSnapshot(dataset, query);
  requireProduct(snapshot, query.productId, 'trend');
  const granularity = trendGranularity(query.context.dateRange);
  const groups = groupRecords(productRecords(snapshot, query.productId), (record) => bucketKey(record.occurredOn, granularity));
  const points = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, records]) => {
    const totals = calculateDashboardTotals(records);
    return {
      key,
      label: bucketLabel(key, granularity),
      revenueMinor: totals.revenueMinor,
      units: totals.units,
      knownNetProfitMinor: totals.knownNetProfitMinor,
      marginBps: totals.knownMarginBps,
      profitabilityCoverageBps: totals.profitabilityCoverageBps,
    };
  });
  return { productId: query.productId, granularity, points };
}

export function aggregateProductActivity(dataset: AnalyticsDataset, query: ProductDetailQuery): ProductActivityResult {
  const snapshot = createProductAnalyticsSnapshot(dataset, query);
  const product = requireProduct(snapshot, query.productId, 'activity');
  const listings = productListings(snapshot, query.productId, false);
  const rates = dataset.cogsHistory.filter((rate) => rate.productId === query.productId).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const events: ProductActivityEvent[] = [];
  rates.forEach((rate, index) => {
    if (index === 0) return;
    events.push({
      id: `${product.id}:activity:${rate.id}`,
      productId: product.id,
      actor: { type: 'user', userId: rate.approvedByUserId ?? rate.createdByUserId ?? (index % 2 ? 'usr-james-carter' : 'usr-emma-richardson') },
      actorName: rate.approvedByName ?? rate.createdByName ?? (index % 2 ? 'James Carter' : 'Emma Richardson'),
      timestamp: rate.approvedAt ?? rate.createdAt ?? `${rate.effectiveFrom}T09:15:00.000Z`,
      action: 'cogs_changed',
      previousValue: { unitCostMinor: rates[index - 1].unitCostMinor, currency: rates[index - 1].currency },
      newValue: { unitCostMinor: rate.unitCostMinor, currency: rate.currency, source: rate.sourceReferenceId ?? rate.source },
      reason: rate.reason ?? 'Supplier pricing update approved for the new effective period.',
    });
  });
  listings.forEach((listing, index) => {
    events.push({
      id: `${listing.id}:activity:imported`,
      productId: product.id,
      actor: { type: 'system', systemId: `${listing.marketplace}-connector` },
      actorName: `${listing.marketplace === 'amazon' ? 'Amazon' : listing.marketplace === 'ebay' ? 'eBay' : 'Temu'} connector`,
      timestamp: `2026-02-${String(2 + (index % 20)).padStart(2, '0')}T11:20:00.000Z`,
      action: 'listing_imported',
      previousValue: null,
      newValue: { listingId: listing.id, marketplaceSku: listing.marketplaceSku },
      reason: 'Marketplace catalogue import linked the listing to its internal product.',
    });
  });
  events.push({
    id: `${product.id}:activity:category`,
    productId: product.id,
    actor: { type: 'user', userId: 'usr-emma-richardson' },
    actorName: 'Emma Richardson',
    timestamp: '2026-06-18T14:05:00.000Z',
    action: 'category_changed',
    previousValue: { category: 'Uncategorised' },
    newValue: { category: product.category ?? 'Uncategorised' },
    reason: 'Catalogue classification review.',
  });
  return { productId: product.id, events: events.sort((a, b) => b.timestamp.localeCompare(a.timestamp)) };
}
