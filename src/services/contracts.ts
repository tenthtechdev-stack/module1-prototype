import type {
  AnalysisContext,
  Company,
  CopilotContext,
  MarketplaceAccount,
  ModuleEntitlement,
  Organisation,
  Subscription,
  User,
} from '@/src/domain/models';
import type { DashboardAnalytics, DashboardRepositoryInput } from '@/src/domain/analytics';
import type { AuditEvent } from '@/src/domain/models';
import type {
  CogsActor,
  CogsColumnMapping,
  CogsImportBatch,
  CogsProposalInput,
  CogsReviewStatus,
  CogsWorkspaceResult,
  CogsWorkspaceStatus,
} from '@/src/domain/cogs';
import type {
  ProductActivityResult,
  ProductCogsStatus,
  ProductCostHistory,
  ProductListItem,
  ProductLookupResult,
  ProductPage as ProductPageModel,
  ProductProfitabilityDetail,
  ProductProfitabilityStatus,
  ProductSorting,
  ProductTransactionsResult,
  ProductTrendResult,
  ProductListingsResult,
  ProductExportRow,
} from '@/src/domain/products';
import type { MarketplaceListingStatus } from '@/src/domain/models';
import type { ScenarioId } from '@/src/fixtures/scenarios';

export interface AccessScope {
  authorisedCompanyIds: string[];
  authorisedAccountIds: string[];
}

export interface ProductQuery extends DashboardRepositoryInput {
  search: string;
  cogsStatus: ProductCogsStatus | 'all';
  listingStatus: MarketplaceListingStatus | 'all';
  profitabilityStatus: ProductProfitabilityStatus | 'all';
  categories: string[];
  sorting: ProductSorting[];
  page: number;
  pageSize: number;
}

/** @deprecated Phase 1 name retained for existing consumers. */
export type ProductFilters = ProductQuery;
export type ProductPage = ProductPageModel;

export interface ProductDetailQuery extends DashboardRepositoryInput {
  productId: string;
}

export interface ProductTransactionsQuery extends ProductDetailQuery {
  limit: number;
}

export interface ProductRepository {
  list(filters: ProductQuery, signal?: AbortSignal): Promise<ProductPage>;
  exportRows(filters: ProductQuery, signal?: AbortSignal): Promise<ProductExportRow[]>;
  getById(query: ProductDetailQuery, signal?: AbortSignal): Promise<ProductLookupResult>;
  getProfitability(query: ProductDetailQuery, signal?: AbortSignal): Promise<ProductProfitabilityDetail>;
  getCosts(query: ProductDetailQuery, signal?: AbortSignal): Promise<ProductCostHistory>;
  getListings(query: ProductDetailQuery, signal?: AbortSignal): Promise<ProductListingsResult>;
  getTransactions(query: ProductTransactionsQuery, signal?: AbortSignal): Promise<ProductTransactionsResult>;
  getTrend(query: ProductDetailQuery, signal?: AbortSignal): Promise<ProductTrendResult>;
  getActivity(query: ProductDetailQuery, signal?: AbortSignal): Promise<ProductActivityResult>;
  /** @deprecated Use getById with a complete tenant-safe query. */
  get(id: string, context: AnalysisContext, scope: AccessScope, signal?: AbortSignal): Promise<ProductListItem | null>;
}

export interface WorkspaceCogsReadiness {
  productsImported: number;
  cogsComplete: number;
  cogsMissing: number;
  coveragePercent: number;
  reliableProfitability: boolean;
}

export interface WorkspaceSnapshot {
  organisation: Organisation;
  subscription: Subscription;
  entitlements: ModuleEntitlement[];
  companies: Company[];
  marketplaceAccounts: MarketplaceAccount[];
  users: User[];
  activeUser: User | null;
  /** Present for tenants materialised by Phase 2 onboarding. */
  cogsReadiness: WorkspaceCogsReadiness | null;
}

export interface WorkspaceRepository {
  getByOrganisationSlug(orgSlug: string, scenarioId: ScenarioId, signal?: AbortSignal): Promise<WorkspaceSnapshot | null>;
}

export interface DashboardAnalyticsRepository {
  getDashboard(input: DashboardRepositoryInput, signal?: AbortSignal): Promise<DashboardAnalytics>;
}

export interface CogsWorkspaceQuery extends DashboardRepositoryInput {
  search: string;
  status: CogsWorkspaceStatus | 'all';
  source: string | 'all';
  effectiveDate: 'all' | 'current' | 'future' | 'historical';
  changedBy: string | 'all';
  needsReview: boolean;
  page: number;
  pageSize: number;
}

export interface CreateCogsImportInput extends DashboardRepositoryInput {
  companyId: string;
  fileName: string;
  fileType: 'csv' | 'xlsx' | 'paste';
  fileSize: number;
  sheetNames: string[];
  selectedSheet: string | null;
  headers: string[];
  rawRows: Record<string, string>[];
  mapping: CogsColumnMapping[];
  batchCurrency?: string;
  batchEffectiveDate?: string;
  actor: CogsActor;
  reason?: string;
  note?: string;
}

export interface CreateCogsProposalBatchInput extends DashboardRepositoryInput {
  companyId: string;
  kind: 'single' | 'bulk' | 'percentage';
  proposals: CogsProposalInput[];
  actor: CogsActor;
  label: string;
}

export interface CogsRepository {
  getWorkspace(input: CogsWorkspaceQuery, signal?: AbortSignal): Promise<CogsWorkspaceResult>;
  getBatch(input: DashboardRepositoryInput, batchId: string, signal?: AbortSignal): Promise<CogsImportBatch | null>;
  createImport(input: CreateCogsImportInput, signal?: AbortSignal): Promise<CogsImportBatch>;
  createProposalBatch(input: CreateCogsProposalBatchInput, signal?: AbortSignal): Promise<CogsImportBatch>;
  updateMapping(input: DashboardRepositoryInput, batchId: string, mapping: CogsColumnMapping[], actor: CogsActor, batchCurrency?: string, batchEffectiveDate?: string): Promise<CogsImportBatch>;
  updateBatchDetails(input: DashboardRepositoryInput, batchId: string, values: { reason?: string; note?: string; stage?: CogsImportBatch['stage'] }, actor: CogsActor): Promise<CogsImportBatch>;
  reviewRow(input: DashboardRepositoryInput, batchId: string, rowId: string, status: CogsReviewStatus, actor: CogsActor): Promise<CogsImportBatch>;
  manualMatch(input: DashboardRepositoryInput, batchId: string, rowId: string, productId: string, actor: CogsActor): Promise<CogsImportBatch>;
  acceptSafeExact(input: DashboardRepositoryInput, batchId: string, actor: CogsActor): Promise<CogsImportBatch>;
  submitForApproval(input: DashboardRepositoryInput, batchId: string, actor: CogsActor): Promise<CogsImportBatch>;
  applyBatch(input: DashboardRepositoryInput, batchId: string, actor: CogsActor, canApprove: boolean, simulateFailure?: boolean): Promise<CogsImportBatch>;
  cancelBatch(input: DashboardRepositoryInput, batchId: string, actor: CogsActor): Promise<CogsImportBatch>;
  getAuditEvents(organisationId: string): Promise<AuditEvent[]>;
}

export interface CopilotPanelData {
  prompts: string[];
  summary: string;
  findings: Array<{
    id: string;
    title: string;
    detail: string;
    tone: 'neutral' | 'warning' | 'negative' | 'positive';
  }>;
  references: Array<{ label: string; href: string }>;
  dataCompleteness: string;
  finding: {
    title: string;
    affectedRevenuePence: number;
  };
  anomaly: null | {
    title: string;
    detail: string;
  };
  approval: null | {
    title: string;
    detail: string;
  };
}

export interface CopilotRepository {
  overview(context: CopilotContext, scenarioId: ScenarioId, signal?: AbortSignal): Promise<CopilotPanelData>;
  ask(question: string, context: CopilotContext): Promise<string>;
}
