import type { CurrencyCode, DashboardFinancialTotals, HistoricalCogsRate, ProfitBridgeRow } from '@/src/domain/analytics';
import type { DataFreshness, Marketplace, MarketplaceAccount, MarketplaceListing, Product } from '@/src/domain/models';

export type TransactionProfitabilityStatus = 'profitable' | 'low_margin' | 'loss_making' | 'incomplete' | 'refunded';
export type TransactionCompletenessState = 'complete' | 'missing_cogs' | 'advertising_unavailable' | 'missing_cogs_and_advertising';
export type TransactionCogsSource = 'direct' | 'inherited' | 'missing';
export type TransactionRefundState = 'none' | 'partial' | 'full';
export type TransactionSortField = 'date' | 'revenue' | 'netProfit' | 'margin' | 'refunds' | 'fees' | 'cogs';
export interface TransactionSorting { field: TransactionSortField; direction: 'asc' | 'desc' }
export interface TransactionListOptions {
  productId?: string;
  productGroupId?: string;
  costRecordId?: string;
  search?: string;
  profitabilityStatus?: TransactionProfitabilityStatus | 'all';
  cogsSource?: TransactionCogsSource | 'all';
  refundState?: TransactionRefundState | 'refunded' | 'all';
  completeness?: 'complete' | 'incomplete' | 'all';
  marginState?: 'profitable' | 'low_margin' | 'loss_making' | 'all';
  highFees?: boolean;
  sorting?: TransactionSorting[];
  page?: number;
  pageSize?: number;
}

/** One deterministic sale line, projected from the existing financial dataset. */
export interface ProfitabilityTransaction {
  id: string;
  organisationId: string;
  companyId: string;
  companyName: string;
  marketplace: Marketplace;
  marketplaceAccountId: string;
  marketplaceAccountName: string;
  marketplaceOrderId: string;
  marketplaceOrderLineId: string;
  transactionDate: string;
  productId: string;
  product: Product;
  title: string;
  listingId: string;
  listingIdentifier: string;
  internalSku: string;
  marketplaceSku: string;
  quantity: number;
  reportingCurrency: 'GBP';
  sourceCurrency: CurrencyCode;
  sourceToReportingRateBps: number;
  grossSalesMinor: number;
  discountsMinor: number;
  revenueMinor: number;
  refundsMinor: number;
  netRevenueMinor: number;
  cogsMinor: number | null;
  unitCogsMinor: number | null;
  marketplaceFeesMinor: number;
  advertisingMinor: number | null;
  shippingMinor: number;
  otherDirectCostsMinor: number;
  /** Null means restricted, never zero. Net Profit still includes the deduction. */
  allocatedExpensesMinor: number | null;
  grossProfitKnownMinor: number | null;
  knownNetProfitMinor: number | null;
  netProfitMinor: number | null;
  knownMarginBps: number | null;
  marginBps: number | null;
  profitabilityCoverageBps: number;
  completenessState: TransactionCompletenessState;
  profitabilityStatus: TransactionProfitabilityStatus;
  refundState: TransactionRefundState;
  refundRateBps: number | null;
  feeRateBps: number | null;
  highFees: boolean;
  cogsSource: TransactionCogsSource;
  cogsSourceLabel: string;
  productGroupId: string | null;
  productGroupName: string | null;
  sourceEventIds: string[];
  sourceEventCount: number;
  freshness: DataFreshness;
}

export interface FinancialSourceEvent {
  id: string;
  profitabilityTransactionId: string;
  organisationId: string;
  companyId: string;
  marketplace: Marketplace;
  marketplaceAccountId: string;
  eventType: 'sale' | 'refund' | 'marketplace-fee' | 'advertising' | 'shipping' | 'adjustment' | 'credit' | 'other-cost';
  component: 'revenue' | 'refunds' | 'marketplaceFees' | 'advertising' | 'shipping' | 'otherDirectCosts';
  label: string;
  sourceReference: string;
  sourceTimestamp: string;
  /** Signed source-currency minor units. Deductions are negative. */
  amountMinor: number;
  currency: CurrencyCode;
  /** Signed reporting-currency amount; authoritative for reconciliation. */
  reportingAmountMinor: number;
  reportingCurrency: 'GBP';
  sourceToReportingRateBps: number;
  description: string;
  syncJobId?: string;
  evidenceNote: string;
}

export interface TransactionCostProvenance {
  source: TransactionCogsSource;
  label: string;
  unitCostMinor: number | null;
  quantity: number;
  totalCogsMinor: number | null;
  record: HistoricalCogsRate | null;
  productGroupId: string | null;
  productGroupName: string | null;
  note: string;
}
export interface TransactionWaterfallRow extends ProfitBridgeRow {
  source: string;
  sourceDate: string;
  method: 'synced' | 'imported' | 'entered' | 'calculated' | 'unavailable' | 'restricted';
  sourceEventIds: string[];
  note: string;
}
export interface TransactionActivityEvent { id: string; occurredAt: string; title: string; description: string; actor: string; sourceReferenceId?: string }
export interface TransactionFeeBreakdown { key: string; label: string; amountMinor: number; sourceEventId: string }
export interface TransactionDetail {
  transaction: ProfitabilityTransaction;
  waterfall: TransactionWaterfallRow[];
  sourceEvents: FinancialSourceEvent[];
  fees: TransactionFeeBreakdown[];
  costProvenance: TransactionCostProvenance;
  listing: MarketplaceListing;
  account: MarketplaceAccount;
  activity: TransactionActivityEvent[];
  relatedTransactions: ProfitabilityTransaction[];
  orderTransactionCount: number;
  sensitiveExpensesVisible: boolean;
  refundNote: string;
  advertisingNote: string;
  allocationNote: string;
  fixtureNote: string;
}
export interface TransactionSummary extends Omit<DashboardFinancialTotals, 'allocatedExpensesMinor' | 'covered'> {
  allocatedExpensesMinor: number | null;
  covered: Omit<DashboardFinancialTotals['covered'], 'allocatedExpensesMinor'> & { allocatedExpensesMinor: number | null };
  transactions: number;
  lossMakingTransactions: number;
  refundedTransactions: number;
}
export interface TransactionPage {
  items: ProfitabilityTransaction[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  summary: TransactionSummary;
  products: Array<{ id: string; title: string; internalSku: string }>;
  productGroups: Array<{ id: string; name: string }>;
  freshness: DataFreshness;
  sensitiveExpensesVisible: boolean;
}
export interface TransactionExportResult { fileName: string; csv: string; recordCount: number; fields: string[] }
