export type Marketplace = 'amazon' | 'ebay' | 'temu';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';
export type ModuleEntitlementKey =
  | 'marketplace-profitability'
  | 'products-inventory'
  | 'purchasing-suppliers'
  | 'sales-customers'
  | 'warehouse'
  | 'fulfilment'
  | 'finance'
  | 'communications'
  | 'platform-completion';
export type SyncStatus =
  | 'connected'
  | 'synced'
  | 'syncing'
  | 'pending'
  | 'delayed'
  | 'failed'
  | 'retrying'
  | 'disconnected'
  | 'authentication_required';

export interface DateRange {
  from: string;
  to: string;
}

export interface AnalysisContext {
  organisationId: string;
  companyId: string | 'all';
  marketplace: Marketplace | 'all';
  marketplaceAccountIds: string[];
  dateRange: DateRange;
}

export interface Organisation {
  id: string;
  slug: string;
  name: string;
  reportingCurrency: 'GBP';
  timeZone: string;
}

export interface Subscription {
  id: string;
  organisationId: string;
  status: SubscriptionStatus;
  planName: string;
  renewsAt: string | null;
}

export interface ModuleEntitlement {
  organisationId: string;
  moduleKey: ModuleEntitlementKey;
  enabled: boolean;
}

export interface Company {
  id: string;
  organisationId: string;
  name: string;
}

export interface MarketplaceAccount {
  id: string;
  companyId: string;
  marketplace: Marketplace;
  displayName: string;
  status: SyncStatus;
  lastSuccessfulSyncAt: string | null;
}

export interface Permission {
  key: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  permissionKeys: string[];
}

export type RoleAssignmentLevel = 'organisation' | 'company' | 'marketplace-account';

export interface UserRoleAssignment {
  id: string;
  roleId: string;
  scope: RoleAssignmentLevel;
  companyIds: 'all' | string[];
  marketplaceAccountIds: 'all' | string[];
}

export interface User {
  id: string;
  organisationId: string;
  name: string;
  email: string;
  jobTitle: string;
  roleId: string;
  companyIds: 'all' | string[];
  marketplaceAccountIds: 'all' | string[];
  /**
   * Prototype extension for flexible tenant RBAC. The legacy fields above remain
   * the primary assignment so existing single-role consumers keep working.
   */
  roleAssignments?: UserRoleAssignment[];
}

export interface MoneyAmount {
  amountMinor: number;
  /** ISO 4217 currency code. */
  currency: string;
}

export type ProductStatus = 'active' | 'inactive' | 'archived';
export type MarketplaceListingStatus = 'active' | 'inactive' | 'suppressed' | 'ended' | 'issue';

/**
 * A company-owned operational catalogue record.
 *
 * Phase 4 architecture lock:
 * Organisation -> Company -> Internal Product -> Marketplace Listings.
 * `organisationId` is the tenant boundary, not a shared Product-master owner.
 * `ownerCompanyId` identifies exactly one operational owner and `internalSku`
 * is unique inside that Company. A future organisation-level Product Family
 * may reference this stable Product ID; it must not replace or re-key it.
 *
 * Marketplace identity belongs to a MarketplaceListing, never to this record.
 * `companyId`, `sku`, and `name` are temporary Phase 1-3 aliases retained while
 * locked surfaces migrate.
 */
export interface Product {
  id: string;
  organisationId: string;
  /** Exactly one Company owns this operational Product. */
  ownerCompanyId: string;
  /** Company-local identity; it is not required to be unique organisation-wide. */
  internalSku: string;
  title: string;
  imageUrl?: string;
  category?: string;
  brand?: string;
  status: ProductStatus;
  createdAt: string;
  updatedAt: string;
  /** @deprecated Use ownerCompanyId. */
  companyId: string;
  /** @deprecated Use internalSku. */
  sku: string;
  /** @deprecated Use title. */
  name: string;
}

/**
 * A channel-specific, read-only projection linked to one internal Product.
 * `companyId`, the linked Product owner and the Marketplace Account owner must
 * all be the same Company.
 */
export interface MarketplaceListing {
  id: string;
  productId: string;
  companyId: string;
  marketplaceAccountId: string;
  marketplace: Marketplace;
  marketplaceSku: string;
  marketplaceProductId?: string;
  asin?: string;
  ean?: string;
  ebayItemId?: string;
  temuListingId?: string;
  title: string;
  price: MoneyAmount;
  listingStatus: MarketplaceListingStatus;
  fulfilmentType?: string;
  lastSyncedAt?: string;
  issue?: 'listing_suppressed' | 'stale_data' | 'account_authentication' | 'price_unavailable' | 'advertising_unavailable';
  sourceReference?: string;
}

/** @deprecated Use MarketplaceListing. */
export type Listing = MarketplaceListing;

export interface ProductPerformance extends Product {
  marketplaceAccountIds: string[];
  marketplaces: Marketplace[];
  grossRevenuePence: number;
  refundsPence: number;
  cogsPence: number | null;
  marketplaceFeesPence: number;
  advertisingPence: number;
  shippingPence: number;
  otherDirectCostsPence: number;
  allocatedExpensesPence: number;
  priorProfitPence: number | null;
}

export interface ProductListItem extends Omit<ProductPerformance, 'allocatedExpensesPence'> {
  allocatedExpensesPence: number | null;
  netRevenuePence: number;
  netProfitPence: number | null;
  marginBps: number | null;
  deltaBps: number | null;
  cogsStatus: 'complete' | 'missing' | 'partial_history' | 'needs_review';
}

export interface Transaction {
  id: string;
  companyId: string;
  marketplaceAccountId: string;
  productId: string;
  occurredAt: string;
  quantity: number;
  grossRevenuePence: number;
  refundsPence: number;
  cogsPence: number | null;
  marketplaceFeesPence: number;
  advertisingPence: number;
  shippingPence: number;
  otherDirectCostsPence: number;
  allocatedExpensesPence: number;
}

export type COGSSource =
  | 'initial-import'
  | 'csv-import'
  | 'excel-import'
  | 'paste'
  | 'bulk-edit'
  | 'single-edit'
  | 'percentage-adjustment'
  | 'copilot-assisted-import';

export interface COGSRecord {
  id: string;
  organisationId: string;
  companyId: string;
  productId: string;
  unitCostMinor: number;
  /** ISO 4217 currency code for unitCostMinor. */
  currency: string;
  effectiveFrom: string;
  /** Exclusive end date; null means the record remains current. */
  effectiveTo: string | null;
  status: 'draft' | 'active' | 'superseded';
  source: COGSSource;
  sourceReferenceId?: string;
  reason: string;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  /** @deprecated Compatibility alias for earlier audit consumers; use createdByUserId. */
  changedByUserId: string;
  approvedByUserId: string;
  approvedByName: string;
  approvedAt: string;
  approvalStatus: 'approved';
}

export type ExpenseScope =
  | { type: 'organisation' }
  | { type: 'company'; companyId: string }
  | { type: 'marketplace'; marketplace: Marketplace }
  | { type: 'marketplace_account'; marketplaceAccountId: string }
  | { type: 'product'; productId: string };

export interface Expense {
  /** Governed provenance; the occurrence remains the canonical engine input. */
  expenseDefinitionId?: string;
  expenseVersionId?: string;
  expenseType?: 'recurring' | 'one-off';
  name?: string;
  id: string;
  organisationId: string;
  scope: ExpenseScope;
  occurredAt: string;
  category: string;
  amountMinor: number;
  /** ISO 4217 currency code for amountMinor. */
  currency: string;
  sensitive: boolean;
}

export type SyncJobType = 'incremental_sync' | 'historical_import';
export type SyncJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'retrying' | 'cancelled';

export interface SyncJobError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface SyncJobRetry {
  attempt: number;
  maxAttempts: number;
  nextRetryAt: string | null;
}

export interface SyncJob {
  id: string;
  marketplaceAccountId: string;
  marketplace: Marketplace;
  jobType: SyncJobType;
  status: SyncJobStatus;
  startedAt: string | null;
  completedAt: string | null;
  lastSuccessfulRunAt: string | null;
  recordsProcessed: number;
  error: SyncJobError | null;
  retry: SyncJobRetry | null;
}

export interface AttentionItem {
  id: string;
  organisationId: string;
  kind: 'missing_cogs' | 'sync_failure' | 'approval' | 'subscription';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  createdAt: string;
}

export type AuditActor =
  | { type: 'user'; userId: string }
  | { type: 'system'; systemId: string };

export interface AuditTarget {
  type: string;
  id: string;
}

export interface AuditEvent {
  id: string;
  organisationId: string | null;
  actor: AuditActor;
  action: string;
  target: AuditTarget;
  occurredAt: string;
  previousValue: unknown;
  newValue: unknown;
  reason: string | null;
}

export interface DataFreshness {
  state: 'fresh' | 'warning' | 'error' | 'syncing';
  label: string;
  detail: string;
}

export interface CopilotContext {
  expenseSnapshot?: import('@/src/services/analytics/expense-copilot').ExpenseCopilotSnapshot;
  reportSnapshot?: import('@/src/services/analytics/report-copilot').ReportCopilotSnapshot;
  module: string;
  page: string;
  organisationId: string;
  companyScope?: string;
  marketplaceScope?: string;
  dateRange?: DateRange;
  selectedRecords?: string[];
  visibleMetrics?: string[];
  transactionSnapshot?: TransactionCopilotSnapshot;
  dashboardSnapshot?: { sensitiveExpensesVisible?: boolean;
    revenuePence: number;
    previousRevenuePence: number;
    knownNetProfitPence: number | null;
    previousKnownNetProfitPence: number | null;
    marginBps: number | null;
    previousMarginBps: number | null;
    refundsPence: number;
    previousRefundsPence: number;
    marketplaceFeesPence: number;
    previousMarketplaceFeesPence: number;
    advertisingPence: number;
    previousAdvertisingPence: number;
    cogsCoverageBps: number;
    profitabilityCoverageBps: number;
    previousProfitabilityCoverageBps: number;
    coveredNetRevenuePence: number;
    profitComparisonAvailable: boolean;
    missingCogsProducts: number;
    affectedRevenuePence: number;
    mostProfitableMarketplace: string | null;
    mostProfitableMarketplacePence: number | null;
    priorityProduct: string | null;
    priorityProductIssue: string | null;
    profitabilityComplete: boolean;
  };
  productSnapshot?: { sensitiveExpensesVisible?: boolean;
    productId: string;
    title: string;
    internalSku: string;
    marketplaces: Marketplace[];
    listingCount: number;
    canViewCogs: boolean;
    revenuePence: number;
    orders: number;
    units: number;
    refundsPence: number;
    cogsKnownPence: number;
    marketplaceFeesPence: number;
    advertisingPence: number;
    shippingPence: number;
    otherDirectCostsPence: number;
    allocatedExpensesPence: number | null;
    knownNetProfitPence: number | null;
    marginBps: number | null;
    cogsCoverageBps: number;
    profitabilityCoverageBps: number;
    profitabilityComplete: boolean;
    cogsStatus: 'complete' | 'missing' | 'partial_history' | 'needs_review';
    profitabilityStatus: 'profitable' | 'loss_making' | 'low_margin' | 'incomplete';
    currentCogsPence: number | null;
    costHistoryCount: number;
    listingIssues: string[];
    channelPerformance: Array<{
      marketplace: Marketplace;
      revenuePence: number;
      knownNetProfitPence: number | null;
      marginBps: number | null;
      profitabilityCoverageBps: number;
    }>;
  };
  /** Product-only context for users who can maintain costs but cannot view commercial profitability. */
  productCostSnapshot?: {
    productId: string;
    title: string;
    internalSku: string;
    marketplaces: Marketplace[];
    listingCount: number;
    cogsStatus: 'complete' | 'missing' | 'partial_history' | 'needs_review';
    currentCogsPence: number | null;
    costHistoryCount: number;
    listingIssues: string[];
  };
  /** Governed import context. Source-derived counts only; Copilot cannot mutate it. */
  cogsImportSnapshot?: {
    batchId: string;
    fileName: string;
    status: string;
    rowCount: number;
    exactCount: number;
    suggestedCount: number;
    unmatchedCount: number;
    anomalyCount: number;
    blockingCount: number;
    acceptedCount: number;
    pendingCount: number;
    rejectedCount: number;
    mappedColumns: Array<{ field: string; sourceColumn: string; confidence: number; detectedBy: 'copilot' | 'manual' }>;
    result?: {
      recordsCreated: number;
      beforeProductCoverageBps: number;
      afterProductCoverageBps: number;
      beforeProfitabilityCoverageBps: number;
      afterProfitabilityCoverageBps: number;
    };
  };
}

/** Permission-filtered read snapshot; all amounts come from TransactionsRepository. */
export interface TransactionCopilotSnapshot {
  id: string;
  productTitle: string;
  internalSku: string;
  marketplace: Marketplace;
  transactionDate: string;
  quantity: number;
  revenueMinor: number;
  refundsMinor: number;
  netRevenueMinor: number;
  cogsMinor: number | null;
  marketplaceFeesMinor: number;
  advertisingMinor: number | null;
  shippingMinor: number;
  otherDirectCostsMinor: number;
  allocatedExpensesMinor: number | null;
  knownNetProfitMinor: number | null;
  marginBps: number | null;
  complete: boolean;
  completenessExplanation: string;
  costExplanation: string;
  expenseExplanation: string;
  feeBreakdown: Array<{ label: string; amountMinor: number }>;
  references: Array<{ label: string; href: string }>;
}

export interface CopilotSuggestion {
  id: string;
  kind: 'cogs_change';
  status: 'awaiting_review' | 'approved' | 'rejected';
  productId: string;
  suggestedUnitCostPence: number;
  rationale: string;
}
