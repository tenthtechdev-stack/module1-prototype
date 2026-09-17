import type {
  AnalysisContext,
  Company,
  DateRange,
  Expense,
  Marketplace,
  MarketplaceAccount,
  MarketplaceListing,
  Organisation,
  Product,
} from '@/src/domain/models';
import type { ScenarioId } from '@/src/fixtures/scenarios';

export type CurrencyCode = 'GBP' | 'EUR' | 'USD';
export type DataCompleteness = 'complete' | 'partial' | 'unavailable';

/**
 * Provenance attached only to effective rates derived from a Product Group.
 * The base ratio is retained for transparent display and audit. Financial
 * calculations must continue to use HistoricalCogsRate.unitCostMinor, which is
 * rounded once from the full base-cost/pack/base-quantity ratio.
 */
export interface ProductGroupCogsInheritance {
  productGroupId: string;
  productGroupName: string;
  membershipId: string;
  groupCostRecordId: string;
  packQuantity: number;
  baseQuantity: number;
  baseCostMinor: number;
  currency: CurrencyCode;
  membershipEffectiveFrom: string;
  groupCostEffectiveFrom: string;
}

/** Analytics references the canonical catalogue entities; it does not own a second model. */
export type AnalyticsProduct = Product;
export type AnalyticsListing = MarketplaceListing;

export interface HistoricalCogsRate {
  id: string;
  productId: string;
  unitCostMinor: number;
  currency: CurrencyCode;
  effectiveFrom: string;
  /** Exclusive. Null means the rate remains current. */
  effectiveTo: string | null;
  source?: import('@/src/domain/models').COGSSource;
  sourceReferenceId?: string;
  reason?: string;
  createdByUserId?: string;
  createdByName?: string;
  createdAt?: string;
  approvedByUserId?: string;
  approvedByName?: string;
  approvedAt?: string;
  /** Present only when this rate resolved through active Group membership. */
  inheritance?: ProductGroupCogsInheritance;
}

export interface MarketplaceFeeComponents {
  referralMinor: number;
  fulfilmentMinor: number;
  storageMinor: number;
  promotedListingMinor: number;
  otherMinor: number;
}

/**
 * A deterministic daily/product/account financial record. Source amounts stay in
 * their transaction currency; COGS is resolved in the organisation reporting
 * currency from the historical rate that was effective on occurredOn.
 */
export interface ProfitabilityRecord {
  id: string;
  transactionId: string;
  occurredOn: string;
  organisationId: string;
  companyId: string;
  marketplace: Marketplace;
  marketplaceAccountId: string;
  productId: string;
  listingId: string;
  orders: number;
  refundedOrders: number;
  units: number;
  sourceCurrency: CurrencyCode;
  reportingCurrency: 'GBP';
  /** Source-currency minor units multiplied by this rate / 10_000 become GBP minor units. */
  sourceToReportingRateBps: number;
  grossSalesMinor: number;
  discountsMinor: number;
  refundsMinor: number;
  cogsMinor: number | null;
  marketplaceFeeComponents: MarketplaceFeeComponents;
  advertisingMinor: number | null;
  advertisingDataState: DataCompleteness;
  shippingMinor: number;
  otherDirectCostsMinor: number;
}

export interface AnalyticsDataset {
  products: AnalyticsProduct[];
  listings: AnalyticsListing[];
  cogsHistory: HistoricalCogsRate[];
  records: ProfitabilityRecord[];
  expenses: Expense[];
  generatedRange: DateRange;
}

export interface DashboardRepositoryInput {
  context: AnalysisContext;
  organisation: Organisation;
  scenarioId: ScenarioId;
  companies: Company[];
  marketplaceAccounts: MarketplaceAccount[];
  authorisedCompanyIds: string[];
  authorisedAccountIds: string[];
  reportingCurrency: 'GBP';
  canViewSensitiveExpenses: boolean;
  cogsReadiness: {
    productsImported: number;
    cogsComplete: number;
    cogsMissing: number;
    coveragePercent: number;
    reliableProfitability: boolean;
  } | null;
}

export interface DashboardDelta {
  valueBps: number | null;
  kind: 'percentage' | 'points';
}

export interface CoveredProfitabilityTotals {
  grossSalesMinor: number;
  discountsMinor: number;
  revenueMinor: number;
  refundsMinor: number;
  netRevenueMinor: number;
  cogsMinor: number;
  marketplaceFeesMinor: number;
  advertisingMinor: number;
  shippingMinor: number;
  otherDirectCostsMinor: number;
  allocatedExpensesMinor: number | null;
  grossProfitMinor: number;
  netProfitMinor: number | null;
  marginBps: number | null;
  orders: number;
  units: number;
}

export interface DashboardFinancialTotals {
  currency: 'GBP';
  grossSalesMinor: number;
  discountsMinor: number;
  revenueMinor: number;
  refundsMinor: number;
  netRevenueMinor: number;
  cogsKnownMinor: number;
  marketplaceFeesMinor: number;
  advertisingKnownMinor: number;
  shippingMinor: number;
  otherDirectCostsMinor: number;
  allocatedExpensesMinor: number | null;
  grossProfitKnownMinor: number | null;
  knownNetProfitMinor: number | null;
  netProfitMinor: number | null;
  marginBps: number | null;
  knownMarginBps: number | null;
  orders: number;
  units: number;
  refundedOrders: number;
  refundRateBps: number | null;
  cogsCoverageBps: number;
  advertisingCoverageBps: number;
  profitabilityCoverageBps: number;
  covered: CoveredProfitabilityTotals;
  profitabilityComplete: boolean;
}

/** Internal engine accumulator; redaction happens only after calculation. */
export interface CanonicalFinancialTotals extends DashboardFinancialTotals {
  allocatedExpensesMinor: number;
  covered: CoveredProfitabilityTotals & { allocatedExpensesMinor: number; netProfitMinor: number };
}
export interface ProfitabilityComparisonStatus {
  available: boolean;
  reason: 'equivalent_coverage' | 'coverage_mismatch' | 'no_covered_sales' | 'restricted_expenses';
  coverageDifferenceBps: number;
}

export type DashboardMetricKey =
  | 'revenue'
  | 'orders'
  | 'units'
  | 'refunds'
  | 'cogs'
  | 'marketplaceFees'
  | 'advertising'
  | 'shipping'
  | 'otherCosts'
  | 'grossProfit'
  | 'netProfit'
  | 'margin';

export interface DashboardMetricComparison {
  key: DashboardMetricKey;
  currentMinor: number | null;
  previousMinor: number | null;
  currentCount?: number;
  previousCount?: number;
  currentBps?: number | null;
  previousBps?: number | null;
  delta: DashboardDelta;
  complete: boolean;
}

export interface DashboardTrendPoint {
  key: string;
  label: string;
  revenueMinor: number;
  previousRevenueMinor: number | null;
  knownNetProfitMinor: number | null;
  previousKnownNetProfitMinor: number | null;
  marginBps: number | null;
  previousMarginBps: number | null;
  cogsCoverageBps: number;
}

export interface ProfitBridgeRow {
  key:
    | 'revenue'
    | 'refunds'
    | 'netRevenue'
    | 'cogs'
    | 'marketplaceFees'
    | 'advertising'
    | 'shipping'
    | 'otherDirectCosts'
    | 'allocatedExpenses'
    | 'netProfit';
  label: string;
  amountMinor: number | null;
  operation: 'start' | 'subtract' | 'subtotal' | 'result';
  complete: boolean;
  sensitive?: boolean;
}

export interface PerformanceComparisonRow {
  id: string;
  label: string;
  kind: 'marketplace' | 'company' | 'account';
  marketplace?: Marketplace;
  totals: DashboardFinancialTotals;
}

export interface DashboardProductPerformance {
  id: string;
  companyId: string;
  sku: string;
  name: string;
  marketplaces: Marketplace[];
  units: number;
  revenueMinor: number;
  refundsMinor: number;
  refundRateBps: number | null;
  advertisingKnownMinor: number;
  netProfitMinor: number | null;
  knownNetProfitMinor: number | null;
  marginBps: number | null;
  cogsCoverageBps: number;
  cogsStatus: 'complete' | 'missing';
  issue: 'missing_cogs' | 'loss_making' | 'low_margin' | 'high_refunds' | 'high_advertising' | null;
}

export interface DashboardAttentionItem {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'medium' | 'high';
  href: string;
  scope: 'selected' | 'organisation';
}

export interface DashboardSyncItem {
  marketplace: Marketplace;
  label: string;
  state: 'synced' | 'partial' | 'failed' | 'syncing';
  detail: string;
}

export interface DashboardHealth {
  state: 'healthy' | 'partial' | 'critical' | 'syncing';
  title: string;
  description: string;
  revenueCompletenessBps: number;
  cogsCoverageBps: number;
  syncCompletenessBps: number;
  missingCogsProducts: number;
  affectedRevenueMinor: number;
}

export interface DashboardAnalytics {
  context: AnalysisContext;
  comparisonRange: DateRange;
  generatedRange: DateRange;
  granularity: 'day' | 'week' | 'month';
  current: DashboardFinancialTotals;
  previous: DashboardFinancialTotals;
  profitabilityComparison: ProfitabilityComparisonStatus;
  metrics: Record<DashboardMetricKey, DashboardMetricComparison>;
  trend: DashboardTrendPoint[];
  bridge: ProfitBridgeRow[];
  marketplaceComparison: PerformanceComparisonRow[];
  companyComparison: PerformanceComparisonRow[];
  accountComparison: PerformanceComparisonRow[];
  productPerformance: DashboardProductPerformance[];
  topProducts: DashboardProductPerformance[];
  needsReview: DashboardProductPerformance[];
  attention: DashboardAttentionItem[];
  sync: DashboardSyncItem[];
  health: DashboardHealth;
  sensitiveExpensesVisible: boolean;
}
