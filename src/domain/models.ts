export type Marketplace = 'amazon' | 'ebay' | 'temu';
export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'cancelled' | 'suspended';

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
  status: 'connected' | 'syncing' | 'delayed' | 'reauth_required' | 'disabled';
  lastSuccessfulSyncAt: string | null;
}

export interface ProductPerformance {
  id: string;
  companyId: string;
  marketplaceAccountIds: string[];
  marketplaces: Marketplace[];
  sku: string;
  name: string;
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

export interface ProductListItem extends ProductPerformance {
  netRevenuePence: number;
  netProfitPence: number | null;
  marginBps: number | null;
  deltaBps: number | null;
  cogsStatus: 'complete' | 'missing';
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

export interface CopilotSuggestion {
  id: string;
  kind: 'cogs_change';
  status: 'awaiting_review' | 'approved' | 'rejected';
  productId: string;
  suggestedUnitCostPence: number;
  rationale: string;
}
