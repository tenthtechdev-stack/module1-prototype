import type {
  COGSRecord,
  Company,
  Marketplace,
  MarketplaceAccount,
  Organisation,
  Product,
  SyncStatus,
  User,
} from '@/src/domain/models';

export const ONBOARDING_STEPS = [
  'account',
  'subscription',
  'payment',
  'organisation',
  'companies',
  'marketplaces',
  'sync',
  'cogs',
  'users',
  'complete',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type OnboardingSessionStatus = 'in_progress' | 'complete';

export interface RegisteredAccount {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  termsAcceptedAt: string;
  createdAt: string;
}

export type TestPaymentMethodToken = 'pm_test_success' | 'pm_test_declined' | 'pm_test_failure';

export interface PendingBillingResult {
  provider: 'stripe_test';
  planKey: 'test-plan';
  planName: 'Test Plan';
  paymentStatus: 'not_started' | 'processing' | 'accepted' | 'declined' | 'failed';
  providerReference: string | null;
  billingEmail: string;
  billingCountryCode: string;
  acceptedAt: string | null;
  errorCode: 'card_declined' | 'processing_failed' | null;
}

export interface OnboardingSession {
  id: string;
  revision: number;
  ownerAccountId: string;
  ownerUserId: string | null;
  organisationId: string | null;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedSteps: OnboardingStep[];
  status: OnboardingSessionStatus;
  pendingBilling: PendingBillingResult | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface OnboardingOrganisation extends Organisation {
  countryCode: string;
  businessAddress: string | null;
  financeEmail: string | null;
  onboardingStatus: 'provisioning' | 'active';
}

export interface OnboardingCompany extends Company {
  legalName: string;
  tradingName: string | null;
  countryCode: string;
  reportingCurrency: string;
}

export type MarketplaceConnectionStatus = 'connecting' | 'connected' | 'failed' | 'disconnected';
export type MarketplaceAuthenticationStatus = 'authorised' | 'required' | 'rejected';

export interface OnboardingMarketplaceAccount extends MarketplaceAccount {
  organisationId: string;
  regionCode: string;
  connectionStatus: MarketplaceConnectionStatus;
  authenticationStatus: MarketplaceAuthenticationStatus;
  connectedAt: string | null;
}

export const SYNC_DATASETS = [
  'products',
  'orders',
  'transactions',
  'fees',
  'refunds',
  'advertising',
] as const;

export type SyncDataset = (typeof SYNC_DATASETS)[number];

export interface SyncDatasetProgress {
  dataset: SyncDataset;
  status: SyncStatus;
  recordsImported: number;
  totalRecords: number;
  startedAt: string | null;
  completedAt: string | null;
  lastSuccessfulSyncAt: string | null;
  retryStartedAt: string | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export interface MarketplaceSyncProgress {
  marketplaceAccountId: string;
  marketplace: Marketplace;
  status: SyncStatus;
  progressPercent: number;
  startedAt: string;
  updatedAt: string;
  datasets: SyncDatasetProgress[];
}

export interface InitialSyncProgress {
  organisationId: string;
  status: SyncStatus;
  progressPercent: number;
  canContinue: boolean;
  startedAt: string | null;
  updatedAt: string;
  accounts: MarketplaceSyncProgress[];
  imported: {
    products: number;
    listings: number;
    orders: number;
    transactions: number;
  };
}

export interface CogsCoverage {
  organisationId: string;
  productsImported: number;
  cogsComplete: number;
  cogsMissing: number;
  coveragePercent: number;
  reliableProfitability: boolean;
}

export type CostImportMatchStatus = 'exact' | 'suggested' | 'unmatched' | 'invalid';

export interface CostImportPreviewRow {
  id: string;
  productId: string | null;
  sku: string;
  asin: string | null;
  productName: string;
  unitCostMinor: number | null;
  currency: string;
  effectiveFrom: string;
  matchStatus: CostImportMatchStatus;
  confidence: number | null;
  anomaly: string | null;
}

export interface CostImportPreview {
  id: string;
  organisationId: string;
  fileName: string;
  rows: CostImportPreviewRow[];
  exactMatches: number;
  suggestedMatches: number;
  unmatchedRows: number;
  suspiciousValues: number;
  createdAt: string;
  appliedAt: string | null;
}

export type InvitationStatus = 'pending' | 'accepted' | 'cancelled' | 'failed' | 'expired';

export interface OnboardingInvitation {
  id: string;
  token: string;
  organisationId: string;
  name: string;
  email: string;
  roleId: string;
  companyIds: 'all' | string[];
  marketplaceAccountIds: 'all' | string[];
  status: InvitationStatus;
  invitedAt: string;
  acceptedAt: string | null;
  expiresAt: string;
  errorCode: string | null;
}

export interface OnboardingSnapshot {
  session: OnboardingSession;
  account: RegisteredAccount;
  organisation: OnboardingOrganisation | null;
  companies: OnboardingCompany[];
  marketplaceAccounts: OnboardingMarketplaceAccount[];
  invitations: OnboardingInvitation[];
  cogsCoverage: CogsCoverage | null;
}

export interface OnboardingProduct extends Product {
  asin: string | null;
}

export interface OnboardingCostState {
  organisationId: string;
  importedProductCount: number;
  coveredProductCount: number;
  costedProductIds: string[];
  sampleProducts: OnboardingProduct[];
  records: COGSRecord[];
}

export interface InvitationAcceptance {
  invitation: OnboardingInvitation;
  user: User;
  organisationSlug: string;
}
