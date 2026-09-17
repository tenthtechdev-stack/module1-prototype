import { financialDisclosureAllowed, redactFinancialDisclosure } from '@/src/services/mappers/financial-disclosure';
import type { AnalysisContext } from '@/src/domain/models';
import type { ProductListItem } from '@/src/domain/products';
import { generateAnalyticsDataset, stableHash } from '@/src/fixtures/analytics-data';
import { companies, marketplaceAccounts, organisation } from '@/src/fixtures/data';
import type {
  AccessScope,
  ProductDetailQuery,
  ProductQuery,
  ProductRepository,
  ProductTransactionsQuery,
} from '@/src/services/contracts';
import { materializeApprovedCogsDataset } from '@/src/services/mock/cogs-dataset';
import {
  aggregateProductActivity,
  aggregateProductCosts,
  aggregateProductExportRows,
  aggregateProductListings,
  aggregateProductOverview,
  aggregateProductPage,
  aggregateProductProfitability,
  aggregateProductTransactions,
  aggregateProductTrend,
  buildProductListItem,
  createProductAnalyticsSnapshot,
} from '@/src/services/analytics/product-aggregation';

export class ProductRepositorySectionError extends Error {
  readonly code = 'section_unavailable';

  constructor(public readonly section: 'list' | 'overview' | 'profitability' | 'costs' | 'listings' | 'transactions' | 'trend' | 'activity') {
    super(section === 'list' ? 'Products could not be loaded.' : `The product ${section} section could not be loaded.`);
    this.name = 'ProductRepositorySectionError';
  }
}

function delay(key: string, signal?: AbortSignal) {
  const latency = 180 + (stableHash(key) % 181);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, latency);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });
}

function deterministicSectionFailure(section: ProductRepositorySectionError['section'], query: ProductDetailQuery | ProductQuery) {
  if (query.scenarioId !== 'repository-error') return false;
  if (section === 'list' || section === 'activity') return true;
  if (section === 'overview' && 'productId' in query) return stableHash(query.productId) % 3 === 0;
  return false;
}

export class MockProductRepository implements ProductRepository {
  private readonly datasets = new Map<string, ReturnType<typeof generateAnalyticsDataset>>();

  private datasetFor(input: ProductDetailQuery | ProductQuery) {
    const shapeKey = JSON.stringify({
      organisationId: input.organisation.id,
      companies: input.companies.map((company) => company.id),
      accounts: input.marketplaceAccounts.map((account) => [account.id, account.companyId, account.marketplace, account.status]),
    });
    let dataset = this.datasets.get(shapeKey);
    if (!dataset) {
      dataset = generateAnalyticsDataset({
        organisation: input.organisation,
        companies: input.companies,
        marketplaceAccounts: input.marketplaceAccounts,
      });
      this.datasets.set(shapeKey, dataset);
    }
    return materializeApprovedCogsDataset(dataset, input.organisation.id);
  }

  private async ready(section: ProductRepositorySectionError['section'], query: ProductDetailQuery | ProductQuery, signal?: AbortSignal) {
    await delay(`products:${section}:${JSON.stringify({ context: query.context, scenarioId: query.scenarioId, productId: 'productId' in query ? query.productId : undefined })}`, signal);
    if (deterministicSectionFailure(section, query)) throw new ProductRepositorySectionError(section);
  }

  async list(query: ProductQuery, signal?: AbortSignal) {
    await this.ready('list', query, signal);
    return redactFinancialDisclosure(aggregateProductPage(this.datasetFor(query), query), financialDisclosureAllowed(query));
  }

  async exportRows(query: ProductQuery, signal?: AbortSignal) {
    await delay(`products:export:${JSON.stringify({ context: query.context, search: query.search, scenarioId: query.scenarioId })}`, signal);
    if (query.scenarioId === 'repository-error') throw new ProductRepositorySectionError('list');
    return redactFinancialDisclosure(aggregateProductExportRows(this.datasetFor(query), query), financialDisclosureAllowed(query));
  }

  async getById(query: ProductDetailQuery, signal?: AbortSignal) {
    await this.ready('overview', query, signal);
    return redactFinancialDisclosure(aggregateProductOverview(this.datasetFor(query), query), financialDisclosureAllowed(query));
  }

  async getProfitability(query: ProductDetailQuery, signal?: AbortSignal) {
    await this.ready('profitability', query, signal);
    return redactFinancialDisclosure(aggregateProductProfitability(this.datasetFor(query), query), financialDisclosureAllowed(query));
  }

  async getCosts(query: ProductDetailQuery, signal?: AbortSignal) {
    await this.ready('costs', query, signal);
    return aggregateProductCosts(this.datasetFor(query), query);
  }

  async getListings(query: ProductDetailQuery, signal?: AbortSignal) {
    await this.ready('listings', query, signal);
    return aggregateProductListings(this.datasetFor(query), query);
  }

  async getTransactions(query: ProductTransactionsQuery, signal?: AbortSignal) {
    await this.ready('transactions', query, signal);
    return redactFinancialDisclosure(aggregateProductTransactions(this.datasetFor(query), query, query.limit), financialDisclosureAllowed(query));
  }

  async getTrend(query: ProductDetailQuery, signal?: AbortSignal) {
    await this.ready('trend', query, signal);
    return redactFinancialDisclosure(aggregateProductTrend(this.datasetFor(query), query), financialDisclosureAllowed(query));
  }

  async getActivity(query: ProductDetailQuery, signal?: AbortSignal) {
    await this.ready('activity', query, signal);
    return aggregateProductActivity(this.datasetFor(query), query);
  }

  /** Locked Phase 1 compatibility adapter. New code must use getById. */
  async get(id: string, context: AnalysisContext, scope: AccessScope, signal?: AbortSignal): Promise<ProductListItem | null> {
    const query: ProductDetailQuery = {
      productId: id,
      context,
      organisation,
      scenarioId: 'healthy',
      companies,
      marketplaceAccounts,
      authorisedCompanyIds: scope.authorisedCompanyIds,
      authorisedAccountIds: scope.authorisedAccountIds,
      reportingCurrency: organisation.reportingCurrency,
      canViewSensitiveExpenses: true,
      cogsReadiness: null,
    };
    await delay(`products:get:${id}`, signal);
    const snapshot = createProductAnalyticsSnapshot(this.datasetFor(query), query);
    const product = snapshot.accessibleProducts.find((candidate) => candidate.id === id);
    return product ? buildProductListItem(snapshot, product) : null;
  }
}
