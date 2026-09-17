import type {
  AnalysisContext,
  AuditActor,
  Company,
  DataFreshness,
  Marketplace,
  MarketplaceAccount,
  MarketplaceListing,
  MarketplaceListingStatus,
  MoneyAmount,
  Product,
  SyncStatus,
} from '@/src/domain/models';
import type {
  DashboardFinancialTotals,
  ProductGroupCogsInheritance,
  ProfitBridgeRow,
} from '@/src/domain/analytics';

/** Prototype UX policy. It is intentionally shared with Dashboard analytics. */
export const LOW_MARGIN_THRESHOLD_BPS = 1_000;
export const SUFFICIENT_PROFITABILITY_COVERAGE_BPS = 10_000;

/**
 * Locked Phase 4 ownership graph. This is deliberately company-owned; there is
 * no organisation-level shared Product master in Module 01.
 */
export interface CatalogueOwnershipSnapshot {
  organisationId: string;
  companies: readonly Pick<Company, 'id' | 'organisationId'>[];
  marketplaceAccounts: readonly Pick<MarketplaceAccount, 'id' | 'companyId' | 'marketplace'>[];
  products: readonly Product[];
  listings: readonly MarketplaceListing[];
}

export type CatalogueOwnershipViolationCode =
  | 'product_organisation_mismatch'
  | 'product_owner_cardinality'
  | 'product_owner_organisation_mismatch'
  | 'product_owner_alias_mismatch'
  | 'duplicate_company_internal_sku'
  | 'listing_product_cardinality'
  | 'listing_product_company_mismatch'
  | 'listing_account_cardinality'
  | 'listing_account_company_mismatch'
  | 'listing_marketplace_mismatch';

export interface CatalogueOwnershipViolation {
  code: CatalogueOwnershipViolationCode;
  entityId: string;
  relatedEntityId?: string;
}

/** SKU equality is trimmed and case-insensitive inside one owning Company. */
export function normaliseInternalSkuForUniqueness(internalSku: string) {
  return internalSku.trim().toUpperCase();
}

/** The persistence uniqueness key. Organisation ID is intentionally absent. */
export function companyScopedInternalSkuKey(ownerCompanyId: string, internalSku: string) {
  return JSON.stringify([ownerCompanyId, normaliseInternalSkuForUniqueness(internalSku)]);
}

function groupById<T extends { id: string }>(values: readonly T[]) {
  const grouped = new Map<string, T[]>();
  values.forEach((value) => grouped.set(value.id, [...(grouped.get(value.id) ?? []), value]));
  return grouped;
}

/**
 * Pure relational guard used by deterministic validation and import boundaries.
 * Cross-company SKU reuse is valid because duplicate detection uses the
 * Company-scoped key above.
 */
export function findCatalogueOwnershipViolations(snapshot: CatalogueOwnershipSnapshot) {
  const violations: CatalogueOwnershipViolation[] = [];
  const companiesById = groupById(snapshot.companies);
  const accountsById = groupById(snapshot.marketplaceAccounts);
  const productsById = groupById(snapshot.products);
  const productByCompanySku = new Map<string, string>();

  snapshot.products.forEach((product) => {
    if (product.organisationId !== snapshot.organisationId) {
      violations.push({ code: 'product_organisation_mismatch', entityId: product.id });
    }
    const owners = companiesById.get(product.ownerCompanyId) ?? [];
    if (owners.length !== 1) {
      violations.push({ code: 'product_owner_cardinality', entityId: product.id, relatedEntityId: product.ownerCompanyId });
    } else if (owners[0].organisationId !== product.organisationId) {
      violations.push({ code: 'product_owner_organisation_mismatch', entityId: product.id, relatedEntityId: owners[0].id });
    }
    if (product.companyId !== product.ownerCompanyId) {
      violations.push({ code: 'product_owner_alias_mismatch', entityId: product.id, relatedEntityId: product.companyId });
    }
    const skuKey = companyScopedInternalSkuKey(product.ownerCompanyId, product.internalSku);
    const existingProductId = productByCompanySku.get(skuKey);
    if (existingProductId) {
      violations.push({ code: 'duplicate_company_internal_sku', entityId: product.id, relatedEntityId: existingProductId });
    } else {
      productByCompanySku.set(skuKey, product.id);
    }
  });

  snapshot.listings.forEach((listing) => {
    const products = productsById.get(listing.productId) ?? [];
    const accounts = accountsById.get(listing.marketplaceAccountId) ?? [];
    if (products.length !== 1) {
      violations.push({ code: 'listing_product_cardinality', entityId: listing.id, relatedEntityId: listing.productId });
    }
    if (accounts.length !== 1) {
      violations.push({ code: 'listing_account_cardinality', entityId: listing.id, relatedEntityId: listing.marketplaceAccountId });
    }
    const product = products[0];
    const account = accounts[0];
    if (product && listing.companyId !== product.ownerCompanyId) {
      violations.push({ code: 'listing_product_company_mismatch', entityId: listing.id, relatedEntityId: product.id });
    }
    if (product && account && (account.companyId !== product.ownerCompanyId || listing.companyId !== account.companyId)) {
      violations.push({ code: 'listing_account_company_mismatch', entityId: listing.id, relatedEntityId: account.id });
    }
    if (account && listing.marketplace !== account.marketplace) {
      violations.push({ code: 'listing_marketplace_mismatch', entityId: listing.id, relatedEntityId: account.id });
    }
  });

  return violations;
}

export type ProductCogsStatus = 'complete' | 'missing' | 'partial_history' | 'needs_review';
export type ProductProfitabilityStatus = 'profitable' | 'loss_making' | 'low_margin' | 'incomplete';
export type ProductMarketplaceState = 'available' | 'none-connected' | 'no-authorised';
export type ProductDetailSection = 'overview' | 'profitability' | 'costs' | 'listings' | 'transactions' | 'trend' | 'activity';
export type ProductCogsSourceLabel =
  | 'Inherited from Product Group'
  | 'Manual COGS'
  | 'Imported COGS'
  | 'Missing COGS';

export interface ProductGroupCogsReference {
  id: string;
  name: string;
}

export type ProductSortField =
  | 'product'
  | 'internalSku'
  | 'units'
  | 'revenue'
  | 'currentCogs'
  | 'netProfit'
  | 'margin'
  | 'cogsStatus'
  | 'updatedAt';

export interface ProductSorting {
  field: ProductSortField;
  direction: 'asc' | 'desc';
}

export interface ProductListOptions {
  search?: string;
  cogsStatus?: ProductCogsStatus | 'all';
  listingStatus?: MarketplaceListingStatus | 'all';
  profitabilityStatus?: ProductProfitabilityStatus | 'all';
  categories?: string[];
  sorting?: ProductSorting[];
  /** Zero-based, matching TanStack Table pagination. */
  page?: number;
  pageSize?: number;
}

export interface ProductPriceRange {
  /** Source currency for a single listing; GBP reporting currency for combined ranges. */
  currency: string;
  minimumMinor: number | null;
  maximumMinor: number | null;
}

export interface ProductExportRow {
  internalProductId: string;
  organisationId: string;
  ownerCompanyId: string;
  internalSku: string;
  internalTitle: string;
  category: string | null;
  brand: string | null;
  productStatus: Product['status'];
  marketplaces: string;
  marketplaceAccountIds: string;
  marketplaceSkus: string;
  asins: string;
  ebayItemIds: string;
  temuListingIds: string;
  listingStatuses: string;
  units: number;
  revenueMinor: number;
  currentCogsMinor: number | null;
  productGroupId: string;
  productGroupName: string;
  packQuantity: number | null;
  cogsSource: ProductCogsSourceLabel;
  inheritedCogs: 'Yes' | 'No';
  knownNetProfitMinor: number | null;
  marginBps: number | null;
  cogsStatus: ProductCogsStatus;
  profitabilityStatus: ProductProfitabilityStatus;
  profitabilityCoverageBps: number;
}

/** List projection. Compatibility aliases keep the locked Phase 3 grid compiling. */
export interface ProductListItem {
  id: string;
  product: Product;
  organisationId: string;
  ownerCompanyId: string;
  internalSku: string;
  title: string;
  imageUrl?: string;
  category?: string;
  brand?: string;
  status: Product['status'];
  createdAt: string;
  updatedAt: string;
  listings: MarketplaceListing[];
  marketplaces: Marketplace[];
  /** Listing-company projection only; ownership remains product.ownerCompanyId. */
  companyIds: string[];
  marketplaceAccountIds: string[];
  listingCount: number;
  activeListingCount: number;
  priceRange: ProductPriceRange;
  orders: number;
  units: number;
  revenueMinor: number;
  currentCogsMinor: number | null;
  /** Current effective Group provenance; null for direct or missing COGS. */
  productGroup: ProductGroupCogsReference | null;
  packQuantity: number | null;
  cogsSource: ProductCogsSourceLabel;
  inheritedCogs: boolean;
  knownNetProfitMinor: number | null;
  marginBps: number | null;
  cogsStatus: ProductCogsStatus;
  profitabilityStatus: ProductProfitabilityStatus;
  cogsCoverageBps: number;
  profitabilityCoverageBps: number;
  dataFreshness: DataFreshness;
  rawExport: ProductExportRow;
  /** @deprecated Phase 3 compatibility aliases. */
  companyId: string;
  sku: string;
  name: string;
  grossRevenuePence: number;
  refundsPence: number;
  cogsPence: number | null;
  marketplaceFeesPence: number;
  advertisingPence: number;
  shippingPence: number;
  otherDirectCostsPence: number;
  allocatedExpensesPence: number | null;
  priorProfitPence: number | null;
  netRevenuePence: number;
  netProfitPence: number | null;
  deltaBps: number | null;
}

export interface ProductListSummary {
  products: number;
  activeListings: number;
  units: number;
  revenueMinor: number;
  knownNetProfitMinor: number | null;
  /** Product-count COGS coverage; deliberately not revenue weighted. */
  cogsCoverageBps: number;
  /** Revenue-weighted covered-profit cohort from the Phase 3 engine. */
  profitabilityCoverageBps: number;
  profitabilityComplete: boolean;
}

export interface ProductPage {
  rows: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  categories: string[];
  summary: ProductListSummary;
}

export interface ProductCompanyReference {
  id: string;
  name: string;
}

export interface ProductAccountReference {
  id: string;
  companyId: string;
  marketplace: Marketplace;
  name: string;
  status: SyncStatus;
}

export interface ProductDetailOverview {
  product: Product;
  listings: MarketplaceListing[];
  marketplaces: Marketplace[];
  /** Companies represented by accessible listings; never a second owner list. */
  companies: ProductCompanyReference[];
  accounts: ProductAccountReference[];
  listingCount: number;
  activeListingCount: number;
  priceRange: ProductPriceRange;
  currentCogs: ProductCostPeriod | null;
  cogsStatus: ProductCogsStatus;
  profitabilityStatus: ProductProfitabilityStatus;
  selectedPeriod: DashboardFinancialTotals;
  dataFreshness: DataFreshness;
  inCurrentScope: boolean;
}

export type ProductLookupResult =
  | { status: 'found'; data: ProductDetailOverview }
  | { status: 'not_found' }
  | { status: 'assignment_denied' };

export interface ProductChannelPerformance {
  id: string;
  label: string;
  kind: 'marketplace' | 'account';
  marketplace: Marketplace;
  marketplaceAccountId?: string;
  totals: DashboardFinancialTotals;
}

export interface ProductProfitabilityDetail {
  productId: string;
  context: AnalysisContext;
  totals: DashboardFinancialTotals;
  roiBps: number | null;
  bridge: ProfitBridgeRow[];
  byMarketplace: ProductChannelPerformance[];
  byAccount: ProductChannelPerformance[];
  cogsStatus: ProductCogsStatus;
  profitabilityStatus: ProductProfitabilityStatus;
}

export interface ProductCostPeriod {
  id: string;
  productId: string;
  unitCost: MoneyAmount;
  effectiveFrom: string;
  /** Exclusive; null is the current rate. */
  effectiveTo: string | null;
  source: string;
  sourceReferenceId?: string;
  changedBy: { id: string; name: string };
  changedAt: string;
  approvedBy?: { id: string; name: string };
  approvedAt?: string;
  state?: 'historical' | 'effective' | 'scheduled';
  reason: string;
  cogsSource: ProductCogsSourceLabel;
  inheritance?: ProductGroupCogsInheritance;
}

export interface ProductCostHistory {
  productId: string;
  status: ProductCogsStatus;
  current: ProductCostPeriod | null;
  history: ProductCostPeriod[];
  selectedPeriodCoverageBps: number;
  message: string;
  cogsSource: ProductCogsSourceLabel;
  /** Mirrors current.inheritance for a concise detail-panel contract. */
  inheritance: ProductGroupCogsInheritance | null;
}

export interface ProductListingDetail extends MarketplaceListing {
  companyName: string;
  accountName: string;
  accountStatus: MarketplaceAccount['status'];
  inCurrentScope: boolean;
  dataFreshness: DataFreshness;
}

export interface ProductListingsResult {
  productId: string;
  listings: ProductListingDetail[];
  accessibleListingCount: number;
  scopedListingCount: number;
}

export interface ProductTransactionPreview {
  id: string;
  orderId: string;
  occurredAt: string;
  listingId: string;
  marketplace: Marketplace;
  marketplaceAccountId: string;
  accountName: string;
  quantity: number;
  revenueMinor: number;
  cogsMinor: number | null;
  marketplaceFeesMinor: number;
  netProfitMinor: number | null;
  profitabilityComplete: boolean;
  status: 'completed' | 'partially_refunded' | 'refunded';
}

export interface ProductTransactionsResult {
  productId: string;
  rows: ProductTransactionPreview[];
  total: number;
  limit: number;
  hasMore: boolean;
}

export interface ProductTrendPoint {
  key: string;
  label: string;
  revenueMinor: number;
  units: number;
  knownNetProfitMinor: number | null;
  marginBps: number | null;
  profitabilityCoverageBps: number;
}

export interface ProductTrendResult {
  productId: string;
  granularity: 'day' | 'week' | 'month';
  points: ProductTrendPoint[];
}

export interface ProductActivityEvent {
  id: string;
  productId: string;
  actor: AuditActor;
  actorName: string;
  timestamp: string;
  action: 'cogs_changed' | 'listing_imported' | 'account_linked' | 'listing_status_changed' | 'category_changed' | 'cogs_import_approved';
  previousValue: unknown;
  newValue: unknown;
  reason: string | null;
}

export interface ProductActivityResult {
  productId: string;
  events: ProductActivityEvent[];
}
