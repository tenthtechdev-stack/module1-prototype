import type { COGSRecord, Marketplace, ModuleEntitlement, Subscription, User } from '@/src/domain/models';
import type {
  CogsCoverage,
  CostImportPreview,
  InitialSyncProgress,
  InvitationAcceptance,
  OnboardingCompany,
  OnboardingInvitation,
  OnboardingMarketplaceAccount,
  OnboardingOrganisation,
  OnboardingProduct,
  OnboardingSession,
  OnboardingSnapshot,
  OnboardingStep,
  RegisteredAccount,
  SyncDataset,
  TestPaymentMethodToken,
} from '@/src/domain/onboarding';
import type { ScenarioId } from '@/src/fixtures/scenarios';

export interface RegisterAccountInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  termsAccepted: boolean;
}

export interface RegistrationResult {
  account: RegisteredAccount;
  session: OnboardingSession;
}

export interface AuthRepository {
  register(input: RegisterAccountInput, signal?: AbortSignal): Promise<RegistrationResult>;
  activateOwner(sessionId: string, signal?: AbortSignal): Promise<User>;
}

export interface SelectTestPlanInput {
  sessionId: string;
  billingEmail?: string;
  billingCountryCode?: string;
}

export interface ConfirmTestPaymentInput {
  sessionId: string;
  paymentMethodToken: TestPaymentMethodToken;
  billingEmail: string;
  billingCountryCode: string;
}

export interface BillingRepository {
  selectTestPlan(input: SelectTestPlanInput, signal?: AbortSignal): Promise<OnboardingSession>;
  confirmTestPayment(input: ConfirmTestPaymentInput, signal?: AbortSignal): Promise<OnboardingSession>;
}

export interface SaveOrganisationInput {
  sessionId: string;
  name: string;
  countryCode: string;
  reportingCurrency: string;
  timeZone: string;
  businessAddress?: string;
  financeEmail?: string;
}

export interface OrganisationMaterialisation {
  organisation: OnboardingOrganisation;
  owner: User;
  subscription: Subscription;
  entitlement: ModuleEntitlement;
  session: OnboardingSession;
}

export interface OrganisationSetupRepository {
  save(input: SaveOrganisationInput, signal?: AbortSignal): Promise<OrganisationMaterialisation>;
}

export interface SaveCompanyInput {
  sessionId: string;
  companyId?: string;
  legalName: string;
  tradingName?: string;
  countryCode: string;
  reportingCurrency: string;
}

export interface CompanySetupRepository {
  list(sessionId: string, signal?: AbortSignal): Promise<OnboardingCompany[]>;
  save(input: SaveCompanyInput, signal?: AbortSignal): Promise<OnboardingCompany>;
  remove(sessionId: string, companyId: string, signal?: AbortSignal): Promise<void>;
}

export interface ConnectMarketplaceInput {
  sessionId: string;
  companyId: string;
  marketplace: Marketplace;
  displayName: string;
  regionCode: string;
  outcome?: 'success' | 'failed' | 'authentication_required';
}

export interface MarketplaceSetupRepository {
  list(sessionId: string, scenarioId?: ScenarioId, signal?: AbortSignal): Promise<OnboardingMarketplaceAccount[]>;
  connect(input: ConnectMarketplaceInput, signal?: AbortSignal): Promise<OnboardingMarketplaceAccount>;
  retry(sessionId: string, marketplaceAccountId: string, signal?: AbortSignal): Promise<OnboardingMarketplaceAccount>;
  disconnect(sessionId: string, marketplaceAccountId: string, signal?: AbortSignal): Promise<void>;
}

export interface InitialSyncRepository {
  start(sessionId: string, signal?: AbortSignal): Promise<InitialSyncProgress>;
  getProgress(sessionId: string, scenarioId: ScenarioId, signal?: AbortSignal): Promise<InitialSyncProgress>;
  retryDataset(sessionId: string, marketplaceAccountId: string, dataset: SyncDataset, signal?: AbortSignal): Promise<InitialSyncProgress>;
}

export interface PreviewCostImportInput {
  sessionId: string;
  file: { name: string; size: number; mediaType: string };
  scenarioId: ScenarioId;
}

export interface ApplyCostImportInput {
  sessionId: string;
  previewId: string;
  approvedRowIds: string[];
  /** Explicit human approval for every safe exact match represented by the preview. */
  approveAllExactMatches?: boolean;
  changedByUserId: string;
}

export interface SaveInitialCostInput {
  sessionId: string;
  productId: string;
  unitCostMinor: number;
  currency: string;
  effectiveFrom: string;
  changedByUserId: string;
  reason?: string;
}

export interface InitialCogsRepository {
  getCoverage(sessionId: string, scenarioId?: ScenarioId, signal?: AbortSignal): Promise<CogsCoverage>;
  listProducts(sessionId: string, signal?: AbortSignal): Promise<OnboardingProduct[]>;
  previewImport(input: PreviewCostImportInput, signal?: AbortSignal): Promise<CostImportPreview>;
  applyImport(input: ApplyCostImportInput, signal?: AbortSignal): Promise<{ coverage: CogsCoverage; records: COGSRecord[] }>;
  saveCost(input: SaveInitialCostInput, signal?: AbortSignal): Promise<{ coverage: CogsCoverage; record: COGSRecord }>;
  discardImport(sessionId: string, previewId: string, signal?: AbortSignal): Promise<void>;
}

export interface InviteUserInput {
  sessionId: string;
  name: string;
  email: string;
  roleId: string;
  companyIds: 'all' | string[];
  marketplaceAccountIds: 'all' | string[];
  outcome?: 'success' | 'failure';
}

export interface AcceptInvitationInput {
  token: string;
  firstName: string;
  lastName: string;
  password: string;
}

export interface InvitationRepository {
  list(sessionId: string, signal?: AbortSignal): Promise<OnboardingInvitation[]>;
  invite(input: InviteUserInput, signal?: AbortSignal): Promise<OnboardingInvitation>;
  resend(sessionId: string, invitationId: string, outcome?: 'success' | 'failure', signal?: AbortSignal): Promise<OnboardingInvitation>;
  remove(sessionId: string, invitationId: string, signal?: AbortSignal): Promise<void>;
  getByToken(token: string, signal?: AbortSignal): Promise<OnboardingInvitation | null>;
  accept(input: AcceptInvitationInput, signal?: AbortSignal): Promise<InvitationAcceptance>;
}

export interface OnboardingRepository {
  getActiveSession(signal?: AbortSignal): Promise<OnboardingSession | null>;
  getSession(sessionId: string, signal?: AbortSignal): Promise<OnboardingSession | null>;
  getSnapshot(sessionId: string, scenarioId?: ScenarioId, signal?: AbortSignal): Promise<OnboardingSnapshot>;
  completeStep(sessionId: string, step: OnboardingStep, signal?: AbortSignal): Promise<OnboardingSession>;
  skipStep(sessionId: string, step: OnboardingStep, signal?: AbortSignal): Promise<OnboardingSession>;
  complete(sessionId: string, signal?: AbortSignal): Promise<OnboardingSnapshot>;
  reset(signal?: AbortSignal): Promise<void>;
}

export interface OnboardingCoordinator {
  resume(signal?: AbortSignal): Promise<OnboardingSnapshot | null>;
  goForward(sessionId: string, step: OnboardingStep, signal?: AbortSignal): Promise<OnboardingSession>;
  skip(sessionId: string, step: OnboardingStep, signal?: AbortSignal): Promise<OnboardingSession>;
  finish(sessionId: string, signal?: AbortSignal): Promise<OnboardingSnapshot>;
  reset(signal?: AbortSignal): Promise<void>;
}
