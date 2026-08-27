import type { AnalysisContext, ProductListItem } from '@/src/domain/models';

export interface ProductFilters {
  context: AnalysisContext;
  search: string;
  page: number;
  pageSize: number;
  scenarioId: string;
  authorisedCompanyIds: string[];
  authorisedAccountIds: string[];
}

export interface ProductPage {
  rows: ProductListItem[];
  total: number;
  missingCogs: number;
}

export interface ProductRepository {
  list(filters: ProductFilters, signal?: AbortSignal): Promise<ProductPage>;
  get(id: string, context: AnalysisContext, signal?: AbortSignal): Promise<ProductListItem | null>;
}
