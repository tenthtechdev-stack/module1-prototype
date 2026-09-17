import type { Marketplace, MarketplaceListingStatus } from '@/src/domain/models';
import type { ProductCogsStatus, ProductProfitabilityStatus } from '@/src/domain/products';

export interface StoredProductViewConfiguration {
  search: string;
  filters: {
    cogsStatus: ProductCogsStatus | 'all';
    listingStatus: MarketplaceListingStatus | 'all';
    profitabilityStatus: ProductProfitabilityStatus | 'all';
    category: string;
  };
  sorting: Array<{ id: string; desc: boolean }>;
  columnVisibility: Record<string, boolean>;
  pageSize: number;
  marketplace?: Marketplace | 'all';
}

export interface StoredProductSavedView {
  id: string;
  name: string;
  builtIn: false;
  configuration: StoredProductViewConfiguration;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSorting(value: unknown): value is StoredProductViewConfiguration['sorting'] {
  return Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.desc === 'boolean');
}

function isVisibility(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'boolean');
}

export function decodePersonalProductViews(raw: string | null): StoredProductSavedView[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredProductSavedView => {
      if (!isRecord(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || item.builtIn !== false || !isRecord(item.configuration)) return false;
      const configuration = item.configuration;
      const filters = configuration.filters;
      return typeof configuration.search === 'string'
        && isRecord(filters)
        && typeof filters.cogsStatus === 'string'
        && typeof filters.listingStatus === 'string'
        && typeof filters.profitabilityStatus === 'string'
        && typeof filters.category === 'string'
        && isSorting(configuration.sorting)
        && isVisibility(configuration.columnVisibility)
        && typeof configuration.pageSize === 'number'
        && Number.isInteger(configuration.pageSize)
        && configuration.pageSize > 0
        && (configuration.marketplace === undefined || ['all', 'amazon', 'ebay', 'temu'].includes(String(configuration.marketplace)));
    });
  } catch {
    return [];
  }
}

export function encodePersonalProductViews(views: readonly StoredProductSavedView[]) {
  return JSON.stringify(views);
}
