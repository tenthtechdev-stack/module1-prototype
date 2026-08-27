import { z } from 'zod';
import { baseProducts, materializeProduct } from '@/src/fixtures/data';
import type { ProductFilters, ProductPage, ProductRepository } from '@/src/services/contracts';

const productSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  marketplaceAccountIds: z.array(z.string()),
  marketplaces: z.array(z.enum(['amazon', 'ebay', 'temu'])),
  sku: z.string(),
  name: z.string(),
  grossRevenuePence: z.number().int().nonnegative(),
  refundsPence: z.number().int().nonnegative(),
  cogsPence: z.number().int().nonnegative().nullable(),
  marketplaceFeesPence: z.number().int().nonnegative(),
  advertisingPence: z.number().int().nonnegative(),
  shippingPence: z.number().int().nonnegative(),
  otherDirectCostsPence: z.number().int().nonnegative(),
  allocatedExpensesPence: z.number().int().nonnegative(),
  priorProfitPence: z.number().int().nullable(),
});

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) result = (result * 31 + value.charCodeAt(index)) | 0;
  return Math.abs(result);
}

function delay(key: string, signal?: AbortSignal) {
  const latency = 250 + (hash(key) % 951);
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, latency);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });
}

function isMissingCogs(index: number, scenarioId: string) {
  if (scenarioId === 'cogs-missing-all') return true;
  if (scenarioId === 'partial-cogs') return index % 4 === 0 || index % 9 === 0;
  return index % 17 === 0;
}

class MockProductRepository implements ProductRepository {
  async list(filters: ProductFilters, signal?: AbortSignal): Promise<ProductPage> {
    await delay(`products:list:${JSON.stringify(filters)}`, signal);
    if (filters.scenarioId === 'repository-error') throw new Error('The mock product service is unavailable.');

    const parsed = z.array(productSchema).parse(baseProducts);
    const scoped = parsed
      .filter((product) => filters.authorisedCompanyIds.includes(product.companyId))
      .filter((product) => product.marketplaceAccountIds.some((id) => filters.authorisedAccountIds.includes(id)))
      .filter((product) => filters.context.companyId === 'all' || product.companyId === filters.context.companyId)
      .filter((product) => filters.context.marketplace === 'all' || product.marketplaces.includes(filters.context.marketplace))
      .filter((product) => filters.context.marketplaceAccountIds.length === 0 || product.marketplaceAccountIds.some((id) => filters.context.marketplaceAccountIds.includes(id)))
      .map((product, index) => materializeProduct(product, isMissingCogs(index, filters.scenarioId)));

    const scenarioSearch = filters.scenarioId === 'no-search-results' ? 'definitely-no-product-matches-this' : filters.search;
    const query = scenarioSearch.trim().toLowerCase();
    const searched = query ? scoped.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(query)) : scoped;
    const start = filters.page * filters.pageSize;
    return {
      rows: searched.slice(start, start + filters.pageSize),
      total: searched.length,
      missingCogs: scoped.filter((product) => product.cogsStatus === 'missing').length,
    };
  }

  async get(id: string, _context: ProductFilters['context'], signal?: AbortSignal) {
    await delay(`products:get:${id}`, signal);
    const index = baseProducts.findIndex((product) => product.id === id);
    return index === -1 ? null : materializeProduct(baseProducts[index], index % 17 === 0);
  }
}

export const productRepository: ProductRepository = new MockProductRepository();
