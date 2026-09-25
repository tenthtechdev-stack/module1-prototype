'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
} from 'react';
import {
  createColumnHelper,
  type ColumnVisibilityState,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import {
  Clipboard,
  Download,
  FileWarning,
  HelpCircle,
  Layers3,
  Pencil,
  RefreshCw,
  Store,
  Wrench,
  X,
} from 'lucide-react';
import type { MarketplaceListing, MarketplaceListingStatus } from '@/src/domain/models';
import type {
  ProductCogsStatus,
  ProductExportRow,
  ProductListItem,
  ProductListSummary,
  ProductProfitabilityStatus,
  ProductSortField,
  ProductSorting,
} from '@/src/domain/products';
import { decodePersonalProductViews, encodePersonalProductViews } from '@/src/domain/product-saved-views';
import {
  formatDate,
  formatInteger,
  formatMoney,
  formatMoneyCompact,
  formatPercentage,
} from '@/src/domain/calculations';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { EmptyState, ErrorState, StatusIndicator } from '@/src/components/states/states';
import {
  EnterpriseDataGrid,
  gridFeatures,
  type EnterpriseDataGridBulkActionContext,
  type EnterpriseDataGridViewState,
} from '@/src/components/tables/enterprise-data-grid';
import { MarketplaceBadge, PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Badge, Skeleton, useToast, type Tone } from '@/src/components/ui/feedback';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { DropdownMenu, Tooltip } from '@/src/components/ui/overlays';
import { useProducts } from '@/src/services/hooks/use-products';
import { ProductThumbnail } from '@/src/features/products/product-thumbnail';
import {
  EMPTY_PRODUCT_FILTERS,
  ProductsFilterBar,
  SavedProductViews,
  type ProductSavedView,
  type ProductViewConfiguration,
  type ProductsListFilterState,
} from '@/src/features/products/products-list-controls';

const columnHelper = createColumnHelper<typeof gridFeatures, ProductListItem>();
const EMPTY_ROWS: ProductListItem[] = [];
const SEARCH_DELAY_MS = 320;
const DEFAULT_PAGE_SIZE = 25;
const SORTABLE_COLUMNS = new Set<ProductSortField>([
  'product',
  'internalSku',
  'units',
  'revenue',
  'currentCogs',
  'netProfit',
  'margin',
  'cogsStatus',
  'updatedAt',
]);
const FINANCIAL_COLUMN_IDS = new Set(['units', 'revenue', 'netProfit', 'margin', 'profitabilityStatus']);
const COGS_COLUMN_IDS = new Set(['currentCogs', 'productGroup', 'packQuantity', 'cogsSource', 'cogsStatus']);

function canUseSort(field: string | undefined, canViewProfitability: boolean, canViewCogs: boolean) {
  if (!field || !SORTABLE_COLUMNS.has(field as ProductSortField)) return false;
  if (FINANCIAL_COLUMN_IDS.has(field)) return canViewProfitability;
  if (COGS_COLUMN_IDS.has(field)) return canViewCogs;
  return true;
}

const BROAD_COLUMN_VISIBILITY: ColumnVisibilityState = {
  productGroup: false,
  packQuantity: false,
  cogsSource: true,
  category: false,
  marketplaceSku: false,
  marketplaceIdentifier: false,
  account: false,
  price: false,
  listingStatus: false,
  profitabilityStatus: false,
  updatedAt: false,
};

const LISTING_COLUMN_VISIBILITY: ColumnVisibilityState = {
  productGroup: false,
  packQuantity: false,
  cogsSource: true,
  marketplaces: false,
  category: false,
  marketplaceSku: true,
  marketplaceIdentifier: true,
  account: true,
  price: true,
  listingStatus: true,
  profitabilityStatus: false,
  updatedAt: false,
};

const COGS_STATUSES = new Set<ProductCogsStatus>(['complete', 'missing', 'partial_history', 'needs_review']);
const LISTING_STATUSES = new Set<MarketplaceListingStatus>(['active', 'inactive', 'suppressed', 'ended', 'issue']);
const PROFIT_STATUSES = new Set<ProductProfitabilityStatus>(['profitable', 'loss_making', 'low_margin', 'incomplete']);
const PRODUCT_EXPORT_COLUMNS: Array<{ key: keyof ProductExportRow; label: string }> = [
  { key: 'internalProductId', label: 'Internal Product ID' },
  { key: 'organisationId', label: 'Organisation ID' },
  { key: 'ownerCompanyId', label: 'Owner Company ID' },
  { key: 'internalSku', label: 'Internal SKU' },
  { key: 'internalTitle', label: 'Internal Title' },
  { key: 'category', label: 'Category' },
  { key: 'brand', label: 'Brand' },
  { key: 'productStatus', label: 'Product Status' },
  { key: 'marketplaces', label: 'Marketplaces' },
  { key: 'marketplaceAccountIds', label: 'Marketplace Account IDs' },
  { key: 'marketplaceSkus', label: 'Marketplace SKUs' },
  { key: 'asins', label: 'ASINs' },
  { key: 'ebayItemIds', label: 'eBay Item IDs' },
  { key: 'temuListingIds', label: 'Temu Listing IDs' },
  { key: 'listingStatuses', label: 'Listing Statuses' },
  { key: 'units', label: 'Units' },
  { key: 'revenueMinor', label: 'Revenue (minor units)' },
  { key: 'currentCogsMinor', label: 'Current COGS (minor units)' },
  { key: 'productGroupId', label: 'Product Group ID' },
  { key: 'productGroupName', label: 'Product Group' },
  { key: 'packQuantity', label: 'Pack Quantity' },
  { key: 'cogsSource', label: 'COGS Source' },
  { key: 'inheritedCogs', label: 'Inherited COGS' },
  { key: 'knownNetProfitMinor', label: 'Known Net Profit (minor units)' },
  { key: 'marginBps', label: 'Margin (basis points)' },
  { key: 'cogsStatus', label: 'COGS Status' },
  { key: 'profitabilityStatus', label: 'Profitability Status' },
  { key: 'profitabilityCoverageBps', label: 'Profitability Coverage (basis points)' },
];

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePageSize(value: string | null) {
  const parsed = Number(value);
  return parsed === 25 || parsed === 50 || parsed === 100 ? parsed : DEFAULT_PAGE_SIZE;
}

function parseFilters(searchParams: URLSearchParams): ProductsListFilterState {
  const requestedCogs = searchParams.get('cogs');
  const requestedListing = searchParams.get('listing');
  const requestedProfitability = searchParams.get('profitability');
  return {
    cogsStatus: requestedCogs && COGS_STATUSES.has(requestedCogs as ProductCogsStatus) ? requestedCogs as ProductCogsStatus : 'all',
    listingStatus: requestedListing && LISTING_STATUSES.has(requestedListing as MarketplaceListingStatus) ? requestedListing as MarketplaceListingStatus : 'all',
    profitabilityStatus: requestedProfitability && PROFIT_STATUSES.has(requestedProfitability as ProductProfitabilityStatus) ? requestedProfitability as ProductProfitabilityStatus : 'all',
    category: searchParams.get('category') || 'all',
  };
}

function parseSorting(searchParams: URLSearchParams): SortingState {
  const field = searchParams.get('sort');
  if (!field || !SORTABLE_COLUMNS.has(field as ProductSortField)) return [{ id: 'revenue', desc: true }];
  return [{ id: field, desc: searchParams.get('direction') !== 'asc' }];
}

function repositorySorting(sorting: SortingState): ProductSorting[] {
  return sorting
    .filter((item) => SORTABLE_COLUMNS.has(item.id as ProductSortField))
    .map((item) => ({ field: item.id as ProductSortField, direction: item.desc ? 'desc' : 'asc' }));
}

function nextState<T>(update: T | ((current: T) => T), current: T) {
  return typeof update === 'function' ? (update as (value: T) => T)(current) : update;
}

function setOptionalParam(params: URLSearchParams, key: string, value: string, emptyValue = 'all') {
  if (!value || value === emptyValue) params.delete(key);
  else params.set(key, value);
}

function listStateParams(
  source: URLSearchParams,
  state: {
    search: string;
    filters: ProductsListFilterState;
    sorting: SortingState;
    pagination: PaginationState;
    activeViewId: string;
  },
) {
  const params = new URLSearchParams(source.toString());
  setOptionalParam(params, 'q', state.search, '');
  setOptionalParam(params, 'cogs', state.filters.cogsStatus);
  setOptionalParam(params, 'listing', state.filters.listingStatus);
  setOptionalParam(params, 'profitability', state.filters.profitabilityStatus);
  setOptionalParam(params, 'category', state.filters.category);
  const firstSort = state.sorting[0];
  if (firstSort && SORTABLE_COLUMNS.has(firstSort.id as ProductSortField)) {
    params.set('sort', firstSort.id);
    params.set('direction', firstSort.desc ? 'desc' : 'asc');
  } else {
    params.delete('sort');
    params.delete('direction');
  }
  if (state.pagination.pageIndex) params.set('page', String(state.pagination.pageIndex + 1));
  else params.delete('page');
  if (state.pagination.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(state.pagination.pageSize));
  else params.delete('pageSize');
  setOptionalParam(params, 'view', state.activeViewId, 'all-products');
  return params;
}

function loadPersonalViews(raw: string | null): ProductSavedView[] {
  return decodePersonalProductViews(raw) as ProductSavedView[];
}

function defaultViewConfiguration(columnVisibility: ColumnVisibilityState, canViewProfitability: boolean): ProductViewConfiguration {
  return {
    search: '',
    filters: { ...EMPTY_PRODUCT_FILTERS },
    sorting: canViewProfitability ? [{ id: 'revenue', desc: true }] : [{ id: 'product', desc: false }],
    columnVisibility: { ...columnVisibility },
    pageSize: DEFAULT_PAGE_SIZE,
  };
}

function builtInViews(columnVisibility: ColumnVisibilityState, canViewProfitability: boolean, canViewCogs: boolean): ProductSavedView[] {
  const base = defaultViewConfiguration(columnVisibility, canViewProfitability);
  const common = [
    { id: 'all-products', name: 'All Products', builtIn: true, configuration: { ...base, marketplace: 'all' } },
    ...(canViewCogs ? [{ id: 'missing-cogs', name: 'Missing COGS', builtIn: true, configuration: { ...base, filters: { ...base.filters, cogsStatus: 'missing' as const } } }] : []),
    { id: 'amazon-products', name: 'Amazon Products', builtIn: true, configuration: { ...base, marketplace: 'amazon' } },
  ] satisfies ProductSavedView[];
  if (!canViewProfitability) return common;
  return [
    ...common,
    { id: 'loss-making', name: 'Loss-making', builtIn: true, configuration: { ...base, filters: { ...base.filters, profitabilityStatus: 'loss_making' }, sorting: [{ id: 'netProfit', desc: false }] } },
    { id: 'high-revenue', name: 'High Revenue', builtIn: true, configuration: { ...base, sorting: [{ id: 'revenue', desc: true }] } },
    { id: 'low-margin', name: 'Low Margin', builtIn: true, configuration: { ...base, filters: { ...base.filters, profitabilityStatus: 'low_margin' }, sorting: [{ id: 'margin', desc: false }] } },
  ];
}

function permissionSafeView(configuration: ProductViewConfiguration, canViewProfitability: boolean, canViewCogs: boolean): ProductViewConfiguration {
  const safeSorting = configuration.sorting.filter((item) => canUseSort(item.id, canViewProfitability, canViewCogs));
  return {
    ...configuration,
    filters: {
      ...configuration.filters,
      cogsStatus: canViewCogs ? configuration.filters.cogsStatus : 'all',
      profitabilityStatus: canViewProfitability ? configuration.filters.profitabilityStatus : 'all',
    },
    sorting: safeSorting.length ? safeSorting : [canViewProfitability ? { id: 'revenue', desc: true } : { id: 'product', desc: false }],
    columnVisibility: {
      ...configuration.columnVisibility,
      ...(!canViewProfitability ? { units: false, revenue: false, netProfit: false, margin: false, profitabilityStatus: false } : {}),
      ...(!canViewCogs ? { currentCogs: false, productGroup: false, packQuantity: false, cogsSource: false, cogsStatus: false } : {}),
    },
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadExportRows(rows: readonly ProductExportRow[], fileName: string) {
  if (!rows.length) return;
  const contents = [
    PRODUCT_EXPORT_COLUMNS.map((column) => csvCell(column.label)).join(','),
    ...rows.map((row) => PRODUCT_EXPORT_COLUMNS.map((column) => csvCell(row[column.key])).join(',')),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />;
}

function ColumnHeader({ label, help }: { label: string; help: string }) {
  return <span className="product-column-header"><span>{label}</span><Tooltip label={help}><button type="button" className="metric-help" aria-label={`About ${label}`}><HelpCircle size={13} /></button></Tooltip></span>;
}

function cogsTone(status: ProductCogsStatus): Tone {
  return status === 'complete' ? 'positive' : status === 'missing' ? 'negative' : 'warning';
}

function listingTone(status: MarketplaceListingStatus): Tone {
  return status === 'active' ? 'positive' : status === 'issue' || status === 'suppressed' ? 'negative' : status === 'inactive' ? 'warning' : 'neutral';
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function listingIdentifier(listing: MarketplaceListing) {
  if (listing.marketplace === 'amazon') return listing.asin ?? listing.marketplaceProductId ?? null;
  if (listing.marketplace === 'ebay') return listing.ebayItemId ?? listing.marketplaceProductId ?? null;
  return listing.temuListingId ?? listing.marketplaceProductId ?? null;
}

function identifierHeader(marketplace: 'all' | 'amazon' | 'ebay' | 'temu') {
  return marketplace === 'amazon' ? 'ASIN' : marketplace === 'ebay' ? 'eBay Item ID' : marketplace === 'temu' ? 'Temu Listing ID' : 'Marketplace ID';
}

function formatPriceRange(row: ProductListItem) {
  const { minimumMinor, maximumMinor, currency } = row.priceRange;
  if (minimumMinor === null || maximumMinor === null) return 'Unavailable';
  if (minimumMinor === maximumMinor) return formatMoney(minimumMinor, currency);
  return `${formatMoney(minimumMinor, currency)}–${formatMoney(maximumMinor, currency)}`;
}

function ProductsSummaryStrip({ summary, loading, canViewProfitability, canViewCogs }: { summary?: ProductListSummary; loading: boolean; canViewProfitability: boolean; canViewCogs: boolean }) {
  if (loading) {
    const metricCount = 2 + (canViewProfitability ? 2 : 0) + (canViewCogs ? 1 : 0);
    return <section className="products-summary-strip loading" aria-label="Loading product summary" aria-busy="true">{Array.from({ length: metricCount }, (_, index) => <article key={index}><Skeleton /><Skeleton /></article>)}</section>;
  }
  if (!summary) return null;
  const hasProducts = summary.products > 0;
  const profitCoverage = `${formatPercentage(summary.profitabilityCoverageBps)} profitability coverage`;
  return (
    <section className="products-summary-strip" aria-label="Filtered product summary">
      <article><small>Products</small><strong>{formatInteger(summary.products)}</strong><span>Internal catalogue records</span></article>
      <article><small>Active listings</small><strong>{formatInteger(summary.activeListings)}</strong><span>Across matching accounts</span></article>
      {canViewProfitability ? <article><small>Revenue</small><strong>{formatMoneyCompact(summary.revenueMinor)}</strong><span>{hasProducts ? `${formatInteger(summary.units)} units in period` : 'No matching products'}</span></article> : null}
      {canViewProfitability ? <article className={hasProducts && !summary.profitabilityComplete ? 'incomplete' : undefined}><small>{hasProducts && summary.profitabilityComplete ? 'Net profit' : 'Known net profit'}</small><strong>{!hasProducts ? 'N/A' : summary.knownNetProfitMinor === null ? 'Incomplete' : formatMoneyCompact(summary.knownNetProfitMinor)}</strong><span>{hasProducts ? profitCoverage : 'No coverage denominator'}</span></article> : null}
      {canViewCogs ? <article className={hasProducts && summary.cogsCoverageBps < 10_000 ? 'incomplete' : undefined}><small>COGS coverage</small><strong>{hasProducts ? formatPercentage(summary.cogsCoverageBps) : 'N/A'}</strong><span>{hasProducts ? 'Product-count coverage' : 'No matching products'}</span></article> : null}
    </section>
  );
}

function ProductsEmptyState({ filtered, canClear, onClear }: { filtered: boolean; canClear: boolean; onClear: () => void }) {
  return <EmptyState
    title={filtered ? 'No products match this view' : 'No products in this scope'}
    description={filtered ? 'Clear a filter, broaden your search, or choose another saved view.' : 'Connect and sync a marketplace account, or choose another authorised scope.'}
    actions={canClear ? <Button size="compact" variant="ghost" onClick={onClear}>Clear search and filters</Button> : undefined}
  />;
}

function NoMarketplaceProductsState({ orgSlug, canManage }: { orgSlug: string; canManage: boolean }) {
  return (
    <section className="products-empty-state" role="status">
      <span><Store size={22} /></span>
      <h2>Connect a marketplace to import products.</h2>
      <p>Products are created as internal catalogue records and linked to Amazon, eBay and Temu listings during sync.</p>
      {canManage ? <Link className="primary-button" href={`/o/${orgSlug}/admin/marketplace-accounts`}>Connect marketplace</Link> : <small>Ask an organisation administrator to connect a marketplace account.</small>}
    </section>
  );
}

export function ProductsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { workspace, context, companyNameFor, accountNameFor } = useAnalysisContext();
  const { scenarioId } = usePrototype();
  const { showToast } = useToast();
  const cogsAccess = useAccess('cogs.edit');
  const cogsViewAccess = useAccess('cogs.view');
  const marketplaceManagement = useAccess('marketplaces.manage');
  const profitabilityAccess = useAccess('profitability.view');
  const broadScope = context.marketplace === 'all' && context.marketplaceAccountIds.length !== 1;
  const initialColumnVisibility = useMemo(() => ({
    ...(broadScope ? BROAD_COLUMN_VISIBILITY : LISTING_COLUMN_VISIBILITY),
    company: context.companyId === 'all',
    ...(!profitabilityAccess.allowed ? {
      units: false,
      revenue: false,
      netProfit: false,
      margin: false,
      profitabilityStatus: false,
    } : {}),
    ...(!cogsViewAccess.allowed ? { currentCogs: false, productGroup: false, packQuantity: false, cogsSource: false, cogsStatus: false } : {}),
  }), [broadScope, cogsViewAccess.allowed, context.companyId, profitabilityAccess.allowed]);
  const initialParams = useMemo(() => new URLSearchParams(searchParams.toString()), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [search, setSearch] = useState(() => initialParams.get('q') ?? '');
  const debouncedSearch = useDebouncedValue(search, SEARCH_DELAY_MS);
  const [filters, setFilters] = useState<ProductsListFilterState>(() => {
    const parsed = parseFilters(initialParams);
    return {
      ...parsed,
      cogsStatus: cogsViewAccess.allowed ? parsed.cogsStatus : 'all',
      profitabilityStatus: profitabilityAccess.allowed ? parsed.profitabilityStatus : 'all',
    };
  });
  const [sorting, setSorting] = useState<SortingState>(() => {
    const parsed = parseSorting(initialParams);
    return canUseSort(parsed[0]?.id, profitabilityAccess.allowed, cogsViewAccess.allowed)
      ? parsed
      : [profitabilityAccess.allowed ? { id: 'revenue', desc: true } : { id: 'product', desc: false }];
  });
  const [pagination, setPagination] = useState<PaginationState>(() => ({
    pageIndex: parsePositiveInteger(initialParams.get('page'), 1) - 1,
    pageSize: parsePageSize(initialParams.get('pageSize')),
  }));
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>(initialColumnVisibility);
  const [activeViewId, setActiveViewId] = useState(() => initialParams.get('view') || 'all-products');
  const [personalViews, setPersonalViews] = useState<ProductSavedView[]>([]);
  const [viewsLoaded, setViewsLoaded] = useState(false);
  const columnModeRef = useRef(broadScope ? 'broad' : 'listing');
  const suppressNextUrlSyncRef = useRef(false);
  const analyticalScopeKey = `${context.companyId}:${context.marketplace}:${context.marketplaceAccountIds.join(',')}:${context.dateRange.from}:${context.dateRange.to}`;
  const analyticalScopeKeyRef = useRef(analyticalScopeKey);
  const savedViewsKey = `${workspace.organisation.id}:${workspace.activeUser?.id ?? 'anonymous'}:product-saved-views:v1`;
  const presets = useMemo(() => builtInViews(initialColumnVisibility, profitabilityAccess.allowed, cogsViewAccess.allowed), [cogsViewAccess.allowed, initialColumnVisibility, profitabilityAccess.allowed]);
  const views = useMemo(() => [...presets, ...personalViews], [personalViews, presets]);
  const productQuery = useProducts({
    search: debouncedSearch,
    cogsStatus: cogsViewAccess.allowed ? filters.cogsStatus : 'all',
    listingStatus: filters.listingStatus,
    profitabilityStatus: profitabilityAccess.allowed ? filters.profitabilityStatus : 'all',
    categories: filters.category === 'all' ? [] : [filters.category],
    sorting: repositorySorting(sorting),
    page: pagination.pageIndex,
    pageSize: pagination.pageSize,
  });
  const { access, query, marketplaceState, categories, exportMatching, exportMutation, permissions } = productQuery;

  useEffect(() => {
    try {
      setPersonalViews(loadPersonalViews(localStorage.getItem(savedViewsKey)));
    } finally {
      setViewsLoaded(true);
    }
  }, [savedViewsKey]);

  useEffect(() => {
    if (!viewsLoaded || activeViewId === 'all-products') return;
    const active = views.find((view) => view.id === activeViewId);
    if (!active) return;
    const timeout = window.setTimeout(() => setColumnVisibility(active.configuration.columnVisibility), 0);
    return () => window.clearTimeout(timeout);
  }, [activeViewId, views, viewsLoaded]);

  useEffect(() => {
    const mode = broadScope ? 'broad' : 'listing';
    if (columnModeRef.current === mode) return;
    columnModeRef.current = mode;
    setColumnVisibility((current) => ({ ...current, ...initialColumnVisibility }));
  }, [broadScope, initialColumnVisibility]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setFilters((current) => ({
        ...current,
        cogsStatus: cogsViewAccess.allowed ? current.cogsStatus : 'all',
        profitabilityStatus: profitabilityAccess.allowed ? current.profitabilityStatus : 'all',
      }));
      setSorting((current) => {
        const safe = current.filter((item) => canUseSort(item.id, profitabilityAccess.allowed, cogsViewAccess.allowed));
        return safe.length ? safe : [profitabilityAccess.allowed ? { id: 'revenue', desc: true } : { id: 'product', desc: false }];
      });
      setColumnVisibility((current) => ({
        ...current,
        ...(!profitabilityAccess.allowed ? { units: false, revenue: false, netProfit: false, margin: false, profitabilityStatus: false } : {}),
        ...(!cogsViewAccess.allowed ? { currentCogs: false, cogsStatus: false } : {}),
      }));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [cogsViewAccess.allowed, profitabilityAccess.allowed]);

  useEffect(() => {
    if (analyticalScopeKeyRef.current === analyticalScopeKey) return;
    analyticalScopeKeyRef.current = analyticalScopeKey;
    const timeout = window.setTimeout(() => setPagination((current) => ({ ...current, pageIndex: 0 })), 0);
    return () => window.clearTimeout(timeout);
  }, [analyticalScopeKey]);

  useEffect(() => {
    if (suppressNextUrlSyncRef.current) {
      suppressNextUrlSyncRef.current = false;
      return;
    }
    const next = listStateParams(new URLSearchParams(searchParams.toString()), {
      search: debouncedSearch,
      filters,
      sorting,
      pagination,
      activeViewId,
    });
    const current = searchParams.toString();
    if (next.toString() !== current) router.replace(next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [activeViewId, debouncedSearch, filters, pagination, pathname, router, searchParams, sorting]);

  const persistPersonalViews = useCallback((next: ProductSavedView[]) => {
    setPersonalViews(next);
    try {
      localStorage.setItem(savedViewsKey, encodePersonalProductViews(next.filter((view) => !view.builtIn) as Array<ProductSavedView & { builtIn: false }>));
    } catch {
      showToast('This browser could not persist the saved view.', 'warning');
    }
  }, [savedViewsKey, showToast]);

  const currentConfiguration = useCallback((gridView?: EnterpriseDataGridViewState): ProductViewConfiguration => ({
    search: gridView?.search ?? search,
    filters: { ...filters },
    sorting: gridView?.sorting ?? sorting,
    columnVisibility: gridView?.columnVisibility ?? columnVisibility,
    pageSize: gridView?.pageSize ?? pagination.pageSize,
    marketplace: context.marketplace,
  }), [columnVisibility, context.marketplace, filters, pagination.pageSize, search, sorting]);

  const applyView = useCallback((view: ProductSavedView) => {
    const configuration = permissionSafeView(view.configuration, profitabilityAccess.allowed, cogsViewAccess.allowed);
    setActiveViewId(view.id);
    setSearch(configuration.search);
    setFilters({ ...configuration.filters });
    setSorting([...configuration.sorting]);
    setColumnVisibility({ ...configuration.columnVisibility });
    setPagination({ pageIndex: 0, pageSize: configuration.pageSize });
    if (configuration.marketplace !== undefined && configuration.marketplace !== context.marketplace) {
      const nextParams = listStateParams(new URLSearchParams(searchParams.toString()), {
        search: configuration.search,
        filters: configuration.filters,
        sorting: configuration.sorting,
        pagination: { pageIndex: 0, pageSize: configuration.pageSize },
        activeViewId: view.id,
      });
      setOptionalParam(nextParams, 'marketplace', configuration.marketplace);
      nextParams.delete('accounts');
      nextParams.delete('account');
      suppressNextUrlSyncRef.current = true;
      router.replace(nextParams.size ? `${pathname}?${nextParams}` : pathname, { scroll: false });
    }
    showToast(`${view.name} view restored`, 'info');
  }, [cogsViewAccess.allowed, context.marketplace, pathname, profitabilityAccess.allowed, router, searchParams, showToast]);

  const saveCurrentView = useCallback((gridView?: EnterpriseDataGridViewState) => {
    const active = views.find((view) => view.id === activeViewId);
    const configuration = currentConfiguration(gridView);
    if (!active || active.builtIn) {
      const name = `${active?.name ?? 'Products'} copy`;
      const created: ProductSavedView = { id: `view-${Date.now()}`, name, builtIn: false, configuration };
      persistPersonalViews([...personalViews, created]);
      setActiveViewId(created.id);
      showToast(`${name} saved`);
      return;
    }
    persistPersonalViews(personalViews.map((view) => view.id === active.id ? { ...view, configuration } : view));
    showToast(`${active.name} updated`);
  }, [activeViewId, currentConfiguration, persistPersonalViews, personalViews, showToast, views]);

  const createView = useCallback((name: string) => {
    const created: ProductSavedView = {
      id: `view-${Date.now()}`,
      name,
      builtIn: false,
      configuration: currentConfiguration(),
    };
    persistPersonalViews([...personalViews, created]);
    setActiveViewId(created.id);
    showToast(`${name} created`);
  }, [currentConfiguration, persistPersonalViews, personalViews, showToast]);

  const activeView = views.find((view) => view.id === activeViewId) ?? presets[0];
  const detailQuery = useMemo(() => listStateParams(new URLSearchParams(searchParams.toString()), {
    search,
    filters,
    sorting,
    pagination,
    activeViewId,
  }).toString(), [activeViewId, filters, pagination, search, searchParams, sorting]);
  const detailHref = useCallback((productId: string) => `/o/${workspace.organisation.slug}/products/${productId}${detailQuery ? `?${detailQuery}` : ''}`, [detailQuery, workspace.organisation.slug]);

  const columns = useMemo(() => columnHelper.columns([
    columnHelper.display({
      id: 'select',
      size: 46,
      enableHiding: false,
      enableSorting: false,
      header: ({ table }) => <SelectionCheckbox label="Select all products on this page" checked={table.getIsAllPageRowsSelected()} indeterminate={table.getIsSomePageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />,
      cell: ({ row }) => <SelectionCheckbox label={`Select ${row.original.product.title}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
    }),
    columnHelper.accessor((row) => row.product.title, {
      id: 'product',
      header: 'Product',
      size: 285,
      enableHiding: false,
      cell: ({ row }) => <Link className="product-cell product-identity-cell" href={detailHref(row.original.product.id)}><ProductThumbnail category={row.original.product.category} /><span><strong>{row.original.product.title}</strong><small>{row.original.product.internalSku}{context.companyId === 'all' ? ` · ${companyNameFor(row.original.product.ownerCompanyId)}` : ''}</small></span></Link>,
    }),
    columnHelper.accessor((row) => row.product.internalSku, {
      id: 'internalSku',
      header: 'Internal SKU',
      size: 145,
      cell: ({ getValue }) => <span className="mono muted">{getValue()}</span>,
    }),
    columnHelper.accessor((row) => row.marketplaces.join(', '), {
      id: 'marketplaces',
      header: 'Marketplaces',
      size: 175,
      enableSorting: false,
      cell: ({ row }) => <span className="product-marketplaces">{row.original.marketplaces.map((marketplace) => <MarketplaceBadge key={marketplace} marketplace={marketplace} />)}<small>{row.original.listingCount} listing{row.original.listingCount === 1 ? '' : 's'}</small></span>,
    }),
    columnHelper.accessor((row) => companyNameFor(row.product.ownerCompanyId), {
      id: 'company',
      header: 'Company',
      size: 190,
      enableSorting: false,
      cell: ({ row, getValue }) => <span className="product-company-cell"><strong>{getValue()}</strong><small>{unique(row.original.companyIds).length > 1 ? `${unique(row.original.companyIds).length} listing companies` : 'Internal product owner'}</small></span>,
    }),
    columnHelper.accessor((row) => row.product.category ?? 'Uncategorised', {
      id: 'category',
      header: 'Category',
      size: 160,
      enableSorting: false,
    }),
    columnHelper.accessor('units', {
      id: 'units',
      header: 'Units',
      size: 90,
      cell: ({ getValue }) => <span className="numeric">{formatInteger(getValue())}</span>,
    }),
    columnHelper.accessor('revenueMinor', {
      id: 'revenue',
      header: 'Revenue',
      size: 120,
      cell: ({ getValue }) => <span className="numeric">{formatMoney(getValue())}</span>,
    }),
    columnHelper.accessor('currentCogsMinor', {
      id: 'currentCogs',
      header: () => <ColumnHeader label="Current COGS" help="The currently effective unit cost. Historical profitability uses the cost effective on each transaction date." />,
      size: 120,
      cell: ({ getValue, row }) => {
        const value = getValue();
        const label = value === null ? 'Missing' : formatMoney(value);
        return cogsAccess.allowed
          ? <button type="button" className={`product-inline-cogs${value === null ? ' missing' : ''}`} aria-label={`Update Current COGS for ${row.original.product.title}`} title="Open the governed COGS update" onClick={() => router.push(`/o/${workspace.organisation.slug}/cogs?product=${encodeURIComponent(row.original.product.id)}&action=edit`)}><span className={value === null ? 'product-value-incomplete' : 'numeric'}>{label}</span><Pencil size={12} aria-hidden="true" /></button>
          : value === null ? <span className="product-value-incomplete">Missing</span> : <span className="numeric">{label}</span>;
      },
    }),
    columnHelper.accessor((row) => row.productGroup?.name ?? '', {
      id: 'productGroup',
      header: 'Product Group',
      size: 180,
      enableSorting: false,
      cell: ({ row }) => row.original.productGroup
        ? <Link className="product-group-list-link" href={`/o/${workspace.organisation.slug}/cogs/groups/${encodeURIComponent(row.original.productGroup.id)}`}><Layers3 size={13} /> {row.original.productGroup.name}</Link>
        : <span className="muted">Ungrouped</span>,
    }),
    columnHelper.accessor('packQuantity', {
      id: 'packQuantity',
      header: 'Pack Quantity',
      size: 112,
      enableSorting: false,
      cell: ({ getValue }) => getValue() === null ? <span className="muted">—</span> : <span className="numeric">{formatInteger(getValue()!)}</span>,
    }),
    columnHelper.accessor('cogsSource', {
      id: 'cogsSource',
      header: 'COGS Source',
      size: 205,
      enableSorting: false,
      cell: ({ getValue, row }) => <Badge tone={getValue() === 'Missing COGS' ? 'warning' : row.original.inheritedCogs ? 'info' : 'neutral'}>{row.original.inheritedCogs ? <Layers3 size={12} /> : null}{getValue()}</Badge>,
    }),
    columnHelper.accessor('knownNetProfitMinor', {
      id: 'netProfit',
      header: () => <ColumnHeader label="Known Net Profit" help="Net Revenue minus cost-covered COGS, fees, advertising, shipping, other direct costs and permitted allocated expenses. Missing cost is never treated as zero." />,
      size: 140,
      cell: ({ getValue, row }) => getValue() === null ? <span className="product-value-incomplete">Incomplete</span> : <span className={`numeric strong${getValue()! < 0 ? ' negative-text' : ''}`} title={`${formatPercentage(row.original.profitabilityCoverageBps)} profitability coverage`}>{formatMoney(getValue())}</span>,
    }),
    columnHelper.accessor('marginBps', {
      id: 'margin',
      header: () => <ColumnHeader label="Known Margin" help="Known Net Profit divided by the Net Revenue represented by the cost-covered cohort." />,
      size: 100,
      cell: ({ getValue }) => getValue() === null ? <span className="product-value-incomplete">Incomplete</span> : <span className={`numeric${getValue()! < 0 ? ' negative-text' : ''}`}>{formatPercentage(getValue())}</span>,
    }),
    columnHelper.accessor('cogsStatus', {
      id: 'cogsStatus',
      header: 'COGS status',
      size: 125,
      cell: ({ getValue }) => <Badge tone={cogsTone(getValue())}>{statusLabel(getValue())}</Badge>,
    }),
    columnHelper.accessor('profitabilityStatus', {
      id: 'profitabilityStatus',
      header: 'Profitability',
      size: 130,
      enableSorting: false,
      cell: ({ getValue }) => <Badge tone={getValue() === 'profitable' ? 'positive' : getValue() === 'loss_making' ? 'negative' : 'warning'}>{statusLabel(getValue())}</Badge>,
    }),
    columnHelper.accessor((row) => unique(row.listings.map((listing) => listing.marketplaceSku)).join(' · '), {
      id: 'marketplaceSku',
      header: () => <ColumnHeader label="Marketplace SKU" help="The seller SKU supplied by the source marketplace listing; it is separate from the internal product SKU." />,
      size: 175,
      enableSorting: false,
      cell: ({ getValue }) => <span className="mono product-listing-value" title={getValue()}>{getValue() || 'Unavailable'}</span>,
    }),
    columnHelper.accessor((row) => unique(row.listings.map(listingIdentifier).filter((value): value is string => Boolean(value))).join(' · '), {
      id: 'marketplaceIdentifier',
      header: identifierHeader(context.marketplace),
      size: 165,
      enableSorting: false,
      cell: ({ getValue }) => <span className="mono product-listing-value" title={getValue()}>{getValue() || 'Unavailable'}</span>,
    }),
    columnHelper.accessor((row) => unique(row.marketplaceAccountIds.map(accountNameFor)).join(' · '), {
      id: 'account',
      header: 'Account',
      size: 210,
      enableSorting: false,
      cell: ({ getValue }) => <span className="product-listing-value" title={getValue()}>{getValue()}</span>,
    }),
    columnHelper.accessor((row) => row.priceRange.minimumMinor ?? -1, {
      id: 'price',
      header: 'Selling price',
      size: 135,
      enableSorting: false,
      cell: ({ row }) => <span className="numeric">{formatPriceRange(row.original)}</span>,
    }),
    columnHelper.accessor((row) => unique(row.listings.map((listing) => listing.listingStatus)).join(', '), {
      id: 'listingStatus',
      header: 'Listing status',
      size: 165,
      enableSorting: false,
      cell: ({ row }) => <span className="product-listing-statuses">{unique(row.original.listings.map((listing) => listing.listingStatus)).map((status) => <Badge tone={listingTone(status)} key={status}>{statusLabel(status)}</Badge>)}</span>,
    }),
    columnHelper.accessor((row) => row.product.updatedAt, {
      id: 'updatedAt',
      header: 'Data freshness',
      size: 150,
      cell: ({ row, getValue }) => <span className="product-freshness-cell"><StatusIndicator tone={row.original.dataFreshness.state === 'fresh' ? 'positive' : row.original.dataFreshness.state === 'warning' ? 'warning' : row.original.dataFreshness.state === 'error' ? 'negative' : 'info'} label={row.original.dataFreshness.label} /><small>{formatDate(getValue(), { day: 'numeric', month: 'short' })}</small></span>,
    }),
  ]).filter((column) => (profitabilityAccess.allowed || !FINANCIAL_COLUMN_IDS.has(column.id ?? '')) && (cogsViewAccess.allowed || !COGS_COLUMN_IDS.has(column.id ?? ''))), [accountNameFor, cogsAccess.allowed, cogsViewAccess.allowed, companyNameFor, context.companyId, context.marketplace, detailHref, profitabilityAccess.allowed, router, workspace.organisation.slug]);

  const rowActions = useCallback((row: ProductListItem) => {
    const identifier = row.listings.map(listingIdentifier).find(Boolean);
    const items = [
      { label: 'View product', onSelect: () => router.push(detailHref(row.product.id)) },
      { label: 'Copy internal SKU', onSelect: () => { void navigator.clipboard.writeText(row.product.internalSku).then(() => showToast('Internal SKU copied')).catch(() => showToast('SKU could not be copied', 'warning')); } },
      ...(identifier ? [{ label: 'Copy marketplace ID', onSelect: () => { void navigator.clipboard.writeText(identifier).then(() => showToast('Marketplace ID copied')).catch(() => showToast('ID could not be copied', 'warning')); } }] : []),
      ...(cogsAccess.allowed ? [{ label: 'Manage COGS', onSelect: () => router.push(`/o/${workspace.organisation.slug}/cogs?product=${encodeURIComponent(row.product.id)}&action=edit`) }] : []),
    ];
    return <DropdownMenu label="Actions" items={items} />;
  }, [cogsAccess.allowed, detailHref, router, showToast, workspace.organisation.slug]);

  const bulkActions = useCallback(({ selectedRows, clearSelection }: EnterpriseDataGridBulkActionContext<ProductListItem>) => (
    <>
      {permissions.canExport ? <button type="button" onClick={() => { downloadExportRows(selectedRows.map((row) => row.rawExport), 'products-selected.csv'); showToast(`${selectedRows.length} selected products exported`); }}><Download size={14} /> Export selected</button> : null}
      {cogsAccess.allowed ? <button type="button" onClick={() => router.push(`/o/${workspace.organisation.slug}/cogs?products=${encodeURIComponent(selectedRows.map((row) => row.product.id).join(','))}&action=bulk`)}><Wrench size={14} /> Manage COGS</button> : null}
      <button type="button" onClick={clearSelection}><X size={14} /> Clear</button>
    </>
  ), [cogsAccess.allowed, permissions.canExport, router, showToast, workspace.organisation.slug]);

  const handleSearchChange = useCallback((update: string | ((current: string) => string)) => {
    setSearch((current) => nextState(update, current));
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, []);
  const handleFiltersChange = useCallback((next: ProductsListFilterState) => {
    setFilters(next);
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, []);
  const handleSortingChange = useCallback((update: SortingState | ((current: SortingState) => SortingState)) => {
    setSorting((current) => nextState(update, current).slice(-1));
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, []);
  const handlePaginationChange = useCallback((update: PaginationState | ((current: PaginationState) => PaginationState)) => {
    setPagination((current) => nextState(update, current));
  }, []);
  const handleVisibilityChange = useCallback((update: ColumnVisibilityState | ((current: ColumnVisibilityState) => ColumnVisibilityState)) => {
    setColumnVisibility((current) => nextState(update, current));
  }, []);

  if (!access.allowed) return <AccessState decision={access} />;
  if (marketplaceState === 'no-authorised') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;
  if (marketplaceState === 'none-connected') return <div className="products-page"><Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Products' }]} /><PageHeader title="Products" description="View internal products, marketplace listings, profitability and COGS readiness across your connected channels." /><NoMarketplaceProductsState orgSlug={workspace.organisation.slug} canManage={marketplaceManagement.allowed} /></div>;

  const rows = query.data?.rows ?? EMPTY_ROWS;
  const filterCount = Number(Boolean(search.trim()))
    + Number(cogsViewAccess.allowed && filters.cogsStatus !== 'all')
    + Number(filters.listingStatus !== 'all')
    + Number(profitabilityAccess.allowed && filters.profitabilityStatus !== 'all')
    + Number(filters.category !== 'all');
  const updating = (query.isFetching && !query.isPending) || search !== debouncedSearch;

  return (
    <div className="products-page">
      <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Products' }]} />
      <PageHeader
        eyebrow="Catalogue performance"
        title="Products"
        description="View internal products, marketplace listings, profitability and COGS readiness across your connected channels."
        actions={<div className="products-header-actions"><SavedProductViews
          views={views}
          activeViewId={activeViewId}
          onApply={applyView}
          onCreate={createView}
          onSave={() => saveCurrentView()}
          onRestore={() => activeView && applyView(activeView)}
          onRename={(name) => {
            if (!activeView || activeView.builtIn) return;
            persistPersonalViews(personalViews.map((view) => view.id === activeView.id ? { ...view, name } : view));
            showToast('View renamed');
          }}
          onDelete={() => {
            if (!activeView || activeView.builtIn) return;
            persistPersonalViews(personalViews.filter((view) => view.id !== activeView.id));
            applyView(presets[0]);
            showToast('Saved view deleted', 'warning');
          }}
        />{permissions.canExport ? <Button loading={exportMutation.isPending} disabled={!query.data?.total} title="Export every product matching the current scope, search and filters" onClick={() => { void exportMatching().then((exportRows) => { downloadExportRows(exportRows, 'products-current-view.csv'); showToast(`${exportRows.length} matching products exported`); }).catch(() => showToast('Products could not be exported', 'negative')); }}><Download size={14} /> Export current view</Button> : null}{cogsAccess.allowed ? <Link className="ui-button primary compact" href={`/o/${workspace.organisation.slug}/cogs`}><Wrench size={14} /> Manage COGS</Link> : null}</div>}
      />
      {query.data?.summary && query.data.summary.cogsCoverageBps < 10_000 ? <section className="products-cogs-notice"><FileWarning size={17} /><div><strong>Some product costs need attention</strong><span>{profitabilityAccess.allowed ? `Known Net Profit covers ${formatPercentage(query.data.summary.profitabilityCoverageBps)} of revenue in this filtered scope. Missing cost is never treated as zero.` : `COGS records cover ${formatPercentage(query.data.summary.cogsCoverageBps)} of matching products in this scope.`}</span></div>{cogsAccess.allowed ? <Link href={`/o/${workspace.organisation.slug}/cogs?status=missing`}>Review COGS</Link> : null}</section> : null}
      <ProductsSummaryStrip summary={query.data?.summary} loading={query.isPending} canViewProfitability={profitabilityAccess.allowed} canViewCogs={cogsViewAccess.allowed} />
      <ProductsFilterBar filters={filters} categories={categories} showCogs={cogsViewAccess.allowed} showProfitability={profitabilityAccess.allowed} onChange={handleFiltersChange} onClear={() => handleFiltersChange({ ...EMPTY_PRODUCT_FILTERS })} />
      {updating ? <div className="products-updating" role="status" aria-live="polite"><RefreshCw size={13} className="spin" /> Updating products…</div> : null}
      <EnterpriseDataGrid
        data={rows}
        columns={columns}
        ariaLabel="Products and marketplace listing profitability"
        initialPinnedColumns={['select', 'product']}
        responsivePriorityColumns={profitabilityAccess.allowed ? ['product', 'marketplaces', 'revenue', 'netProfit', 'margin', ...(cogsViewAccess.allowed ? ['cogsStatus'] : [])] : ['product', 'marketplaces', ...(cogsViewAccess.allowed ? ['currentCogs', 'cogsStatus'] : [])]}
        pagination={pagination}
        onPaginationChange={handlePaginationChange}
        sorting={sorting}
        onSortingChange={handleSortingChange}
        search={search}
        onSearchChange={handleSearchChange}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={handleVisibilityChange}
        manualPagination
        manualSorting
        manualFiltering
        rowCount={query.data?.total ?? 0}
        pageCount={query.data?.pageCount ?? 0}
        renderBulkActions={bulkActions}
        renderRowActions={rowActions}
        onSaveView={saveCurrentView}
        loading={query.isPending}
        error={query.isError ? query.error : null}
        onRetry={() => { void query.refetch(); }}
        errorState={<ErrorState title="Products could not be loaded" description="Marketplace source data remains unchanged. Retry the product query." onRetry={() => { void query.refetch(); }} />}
        emptyState={<ProductsEmptyState filtered={Boolean(filterCount) || scenarioId === 'no-results'} canClear={Boolean(filterCount)} onClear={() => { setSearch(''); handleFiltersChange({ ...EMPTY_PRODUCT_FILTERS }); }} />}
        searchPlaceholder="Search title, internal SKU, marketplace SKU, ASIN, eBay or Temu ID"
        canExport={false}
      />
      <p className="products-architecture-note"><Clipboard size={14} /> Each row is one company-owned internal product. Marketplace badges and listing columns show the authorised source listings linked to it.</p>
    </div>
  );
}
