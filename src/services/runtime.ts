import type { ReportsRepository } from '@/src/services/reports-contracts';
import { MockReportsRepository } from '@/src/services/mock/reports-repository';
import type { ExpensesRepository } from '@/src/services/expenses-contracts';
import { MockExpensesRepository } from '@/src/services/mock/expenses-repository';
import type { CogsRepository, CopilotRepository, DashboardAnalyticsRepository, ProductRepository, WorkspaceRepository } from '@/src/services/contracts';
import type { ProductGroupRepository } from '@/src/services/product-groups-contracts';
import type { TransactionsRepository } from '@/src/services/transactions-contracts';
import { MockTransactionsRepository } from '@/src/services/mock/transactions-repository';
import type {
  AuthRepository,
  BillingRepository,
  CompanySetupRepository,
  InitialCogsRepository,
  InitialSyncRepository,
  InvitationRepository,
  MarketplaceSetupRepository,
  OnboardingCoordinator,
  OnboardingRepository,
  OrganisationSetupRepository,
} from '@/src/services/onboarding-contracts';
import { MockCopilotRepository } from '@/src/services/mock/copilot-repository';
import { MockProductRepository } from '@/src/services/mock/product-repository';
import { MockWorkspaceRepository } from '@/src/services/mock/workspace-repository';
import { MockAuthRepository } from '@/src/services/mock/auth-repository';
import { MockBillingRepository } from '@/src/services/mock/billing-repository';
import { MockCompanySetupRepository } from '@/src/services/mock/company-repository';
import { MockInitialCogsRepository } from '@/src/services/mock/cogs-repository';
import { MockInvitationRepository } from '@/src/services/mock/invitation-repository';
import { MockMarketplaceSetupRepository } from '@/src/services/mock/marketplace-repository';
import { MockOnboardingCoordinator } from '@/src/services/mock/onboarding-coordinator';
import { MockOnboardingRepository } from '@/src/services/mock/onboarding-repository';
import { mockOnboardingStore } from '@/src/services/mock/onboarding-store';
import { MockOrganisationSetupRepository } from '@/src/services/mock/organisation-repository';
import { MockInitialSyncRepository } from '@/src/services/mock/sync-repository';
import { MockDashboardAnalyticsRepository } from '@/src/services/mock/dashboard-analytics-repository';
import { MockCogsManagementRepository } from '@/src/services/mock/cogs-management-repository';
import { mockProductGroupsRepository } from '@/src/services/mock/product-groups-repository';

export interface OnboardingServices {
  auth: AuthRepository;
  billing: BillingRepository;
  organisation: OrganisationSetupRepository;
  companies: CompanySetupRepository;
  marketplaces: MarketplaceSetupRepository;
  sync: InitialSyncRepository;
  cogs: InitialCogsRepository;
  invitations: InvitationRepository;
  session: OnboardingRepository;
  coordinator: OnboardingCoordinator;
}

export interface ServiceContainer {
  reports: ReportsRepository;
  expenses: ExpensesRepository;
  dashboard: DashboardAnalyticsRepository;
  products: ProductRepository;
  transactions: TransactionsRepository;
  workspace: WorkspaceRepository;
  copilot: CopilotRepository;
  cogs: CogsRepository;
  productGroups: ProductGroupRepository;
  onboarding: OnboardingServices;
}

const onboardingSession = new MockOnboardingRepository(mockOnboardingStore);

export const services: ServiceContainer = {
  reports: new MockReportsRepository(),
  expenses: new MockExpensesRepository(),
  dashboard: new MockDashboardAnalyticsRepository(),
  products: new MockProductRepository(),
  transactions: new MockTransactionsRepository(),
  workspace: new MockWorkspaceRepository(),
  copilot: new MockCopilotRepository(),
  cogs: new MockCogsManagementRepository(),
  productGroups: mockProductGroupsRepository,
  onboarding: {
    auth: new MockAuthRepository(mockOnboardingStore),
    billing: new MockBillingRepository(mockOnboardingStore),
    organisation: new MockOrganisationSetupRepository(mockOnboardingStore),
    companies: new MockCompanySetupRepository(mockOnboardingStore),
    marketplaces: new MockMarketplaceSetupRepository(mockOnboardingStore),
    sync: new MockInitialSyncRepository(mockOnboardingStore),
    cogs: new MockInitialCogsRepository(mockOnboardingStore),
    invitations: new MockInvitationRepository(mockOnboardingStore),
    session: onboardingSession,
    coordinator: new MockOnboardingCoordinator(onboardingSession),
  },
};
