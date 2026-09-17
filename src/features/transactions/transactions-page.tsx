'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import { createColumnHelper, type ColumnPinningState, type ColumnSizingState, type ColumnVisibilityState, type PaginationState, type SortingState } from '@tanstack/react-table';
import { AlertTriangle, ArrowDownRight, CircleHelp, Download, FileWarning, Layers3, ReceiptText, RefreshCw, RotateCcw, Store, X } from 'lucide-react';
import type { ProfitabilityTransaction, TransactionExportResult, TransactionSortField, TransactionSummary } from '@/src/domain/transactions';
import { formatDate, formatInteger, formatMoney, formatPercentage } from '@/src/domain/calculations';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { EmptyState, ErrorState } from '@/src/components/states/states';
import { EnterpriseDataGrid, gridFeatures, type EnterpriseDataGridBulkActionContext, type EnterpriseDataGridViewState } from '@/src/components/tables/enterprise-data-grid';
import { MarketplaceBadge, PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Badge, Skeleton, useToast } from '@/src/components/ui/feedback';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { DropdownMenu, Tooltip } from '@/src/components/ui/overlays';
import { useTransactions } from '@/src/services/hooks/use-transactions';
import { ProductThumbnail } from '@/src/features/products/product-thumbnail';
import { decodeTransactionViews, EMPTY_TRANSACTION_FILTERS, SavedTransactionViews, TransactionFilterBar, transactionFilterCount, type TransactionFilters, type TransactionSavedView } from './transactions-list-controls';
import { TransactionStatusBadge } from './transactions-presentation';
import './transactions.css';

const helper = createColumnHelper<typeof gridFeatures, ProfitabilityTransaction>();
const NO_ROWS: ProfitabilityTransaction[] = [];
const SORT_FIELDS = new Set<TransactionSortField>(['date', 'revenue', 'netProfit', 'margin', 'refunds', 'fees', 'cogs']);
const INITIAL_VISIBILITY: ColumnVisibilityState = {
  internalSku: false, marketplaceSku: false, company: false, listingId: false, productGroup: false,
  cogsSource: false, otherCosts: false, allocatedExpenses: false, grossProfit: false,
  currency: false, refundRate: false, eventCount: false, freshness: false,
};
const FILTER_KEYS: Record<keyof TransactionFilters, string> = {
  productId: 'productId', productGroupId: 'productGroupId', costRecordId: 'costRecordId', profitabilityStatus: 'profitability',
  cogsSource: 'cogsSource', refundState: 'refund', marginState: 'margin', completeness: 'completeness', highFees: 'highFees',
};

function allowedValue<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  const normalized = value?.replaceAll('-', '_');
  return allowed.includes(normalized as T) ? normalized as T : fallback;
}

function readFilters(params: URLSearchParams): TransactionFilters {
  return {
    productId: params.get('productId') ?? '', productGroupId: params.get('productGroupId') ?? '', costRecordId: params.get('costRecordId') ?? '',
    profitabilityStatus: allowedValue(params.get('profitability') ?? params.get('profitabilityStatus'), ['all', 'profitable', 'low_margin', 'loss_making', 'incomplete', 'refunded'], 'all'),
    cogsSource: allowedValue(params.get('cogsSource') ?? params.get('cogs'), ['all', 'direct', 'inherited', 'missing'], 'all'),
    refundState: allowedValue(params.get('refund') ?? params.get('refundState'), ['all', 'refunded', 'none', 'partial', 'full'], 'all'),
    marginState: allowedValue(params.get('margin'), ['all', 'profitable', 'low_margin', 'loss_making'], 'all'),
    completeness: allowedValue(params.get('completeness'), ['all', 'complete', 'incomplete'], 'all'), highFees: params.get('highFees') === 'true',
  };
}

function writeFilters(params: URLSearchParams, filters: TransactionFilters) {
  for (const [key, param] of Object.entries(FILTER_KEYS)) {
    const value = filters[key as keyof TransactionFilters];
    if (value === false || value === '' || value === 'all') params.delete(param);
    else params.set(param, String(value));
  }
  ['profitabilityStatus', 'cogs', 'refundState'].forEach((key) => params.delete(key));
}

function resolveUpdate<T>(value: T | ((previous: T) => T), previous: T): T {
  return typeof value === 'function' ? (value as (previous: T) => T)(previous) : value;
}

function SelectionCheckbox({ checked, indeterminate = false, label, onChange }: {
  checked: boolean; indeterminate?: boolean; label: string; onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />;
}

function MoneyCell({ value, unknown = 'Unknown', profit = false }: { value: number | null; unknown?: string; profit?: boolean }) {
  if (value === null) return <span className="transaction-unknown">{unknown}</span>;
  return <span className={`numeric${profit ? ' strong' : ''}${value < 0 ? ' negative-text' : ''}`} aria-label={value < 0 ? `Negative ${formatMoney(Math.abs(value))}` : undefined}>{formatMoney(value)}</span>;
}

function TransactionSummaryStrip({ summary, loading }: { summary?: TransactionSummary; loading: boolean }) {
  if (loading) return <section className="transaction-summary loading" aria-label="Loading transaction summary" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <article key={index}><Skeleton /><Skeleton /></article>)}</section>;
  if (!summary) return null;
  const hasSales = summary.transactions > 0;
  return <section className="transaction-summary" aria-label="Filtered transaction summary">
    <article><small>Transactions</small><strong>{formatInteger(summary.transactions)}</strong><span>{formatInteger(summary.units)} units · Sale lines</span></article>
    <article><small>Revenue</small><strong>{formatMoney(summary.revenueMinor)}</strong><span>After promotions, before refunds</span></article>
    <article><small>Refunds</small><strong>{formatMoney(summary.refundsMinor)}</strong><span>{formatInteger(summary.refundedTransactions)} refunded transactions</span></article>
    <article className={hasSales && !summary.profitabilityComplete ? 'incomplete' : undefined}><small>{summary.profitabilityComplete ? 'Net Profit' : 'Known Net Profit'}</small><strong className={summary.knownNetProfitMinor !== null && summary.knownNetProfitMinor < 0 ? 'negative-text' : undefined}>{!hasSales ? 'N/A' : summary.knownNetProfitMinor === null ? 'Unavailable' : formatMoney(summary.knownNetProfitMinor)}</strong><span>{formatInteger(summary.lossMakingTransactions)} loss-making transactions</span></article>
    <article><small>{summary.profitabilityComplete ? 'Margin' : 'Known margin'}</small><strong>{hasSales ? formatPercentage(summary.knownMarginBps) : 'N/A'}</strong><span>Of covered Net Revenue</span></article>
    <article className={hasSales && !summary.profitabilityComplete ? 'incomplete' : undefined}><small>Profitability coverage</small><strong>{hasSales ? formatPercentage(summary.profitabilityCoverageBps) : 'N/A'}</strong><span>{hasSales ? summary.profitabilityComplete ? 'All required costs available' : 'Unknown costs remain unknown' : 'No coverage denominator'}</span></article>
  </section>;
}

function downloadExport(result: TransactionExportResult) {
  const url = URL.createObjectURL(new Blob(['\uFEFF', result.csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function TransactionsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsString = params.toString();
  const { workspace, context } = useAnalysisContext();
  const { scenarioId, roleId } = usePrototype();
  const { showToast } = useToast();
  const cogsAccess = useAccess('cogs.view');
  const cogsEditAccess = useAccess('cogs.edit');
  const productAccess = useAccess('products.view');
  const marketplaceAccess = useAccess('marketplaces.manage');
  const sensitiveAccess = useAccess('expenses.view_sensitive');
  const search = params.get('q') ?? '';
  const [draft, setDraft] = useState({ source: search, value: search });
  const searchValue = draft.source === search ? draft.value : search;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filters = useMemo(() => readFilters(new URLSearchParams(paramsString)), [paramsString]);
  const sorting = useMemo<SortingState>(() => {
    const requested = params.get('sort');
    const id = SORT_FIELDS.has(requested as TransactionSortField) && (requested !== 'cogs' || cogsAccess.allowed) ? requested! : 'date';
    return [{ id, desc: params.get('direction') !== 'asc' }];
  }, [cogsAccess.allowed, params]);
  const pagination = useMemo<PaginationState>(() => {
    const requested = Number(params.get('page'));
    const size = Number(params.get('pageSize'));
    return { pageIndex: Number.isInteger(requested) && requested > 0 ? requested - 1 : 0, pageSize: [10, 25, 50, 100].includes(size) ? size : 25 };
  }, [params]);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(INITIAL_VISIBILITY);
  const [sizing, setSizing] = useState<ColumnSizingState>({});
  const [pinning, setPinning] = useState<ColumnPinningState>({ start: ['select', 'date', 'product'], end: [] });
  const [personalViews, setPersonalViews] = useState<TransactionSavedView[]>([]);
  const savedViewsKey = `${workspace.organisation.id}:${workspace.activeUser?.id ?? roleId}:transaction-saved-views:v1`;
  const activeViewId = params.get('view') ?? 'all-transactions';
  const hook = useTransactions({ ...filters, costRecordId: params.get('costRecordId') ?? undefined, search, sorting: sorting.map((item) => ({ field: item.id as TransactionSortField, direction: item.desc ? 'desc' : 'asc' })), page: pagination.pageIndex, pageSize: pagination.pageSize });
  const { query, access, marketplaceState, permissions, exportMatching, exportMutation } = hook;
  const scopeKey = `${context.companyId}:${context.marketplace}:${context.marketplaceAccountIds.join(',')}:${context.dateRange.from}:${context.dateRange.to}`;
  const previousScopeKey = useRef(scopeKey);

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try { setPersonalViews(decodeTransactionViews(localStorage.getItem(savedViewsKey))); }
      catch { setPersonalViews([]); }
    });
    return () => { cancelled = true; };
  }, [savedViewsKey]);

  const updateUrl = useCallback((edit: (next: URLSearchParams) => void, replace = false) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const next = new URLSearchParams(paramsString);
    edit(next);
    const href = next.size ? `${pathname}?${next}` : pathname;
    if (next.toString() !== paramsString) router[replace ? 'replace' : 'push'](href, { scroll: false });
  }, [paramsString, pathname, router]);

  useEffect(() => {
    if (previousScopeKey.current === scopeKey) return;
    previousScopeKey.current = scopeKey;
    if (pagination.pageIndex > 0) updateUrl((next) => next.delete('page'), true);
  }, [pagination.pageIndex, scopeKey, updateUrl]);

  const changeFilters = useCallback((next: TransactionFilters) => updateUrl((target) => {
    writeFilters(target, next); target.delete('page');
    if (searchValue) target.set('q', searchValue); else target.delete('q');
  }), [searchValue, updateUrl]);

  const configuration = useCallback((grid?: EnterpriseDataGridViewState): TransactionSavedView['configuration'] => ({
    version: 1, search: grid?.search ?? searchValue, filters: { ...filters }, sorting: grid?.sorting ?? sorting,
    columnFilters: [], columnVisibility: grid?.columnVisibility ?? visibility, columnSizing: grid?.columnSizing ?? sizing,
    columnPinning: grid?.columnPinning ?? pinning, pageSize: grid?.pageSize ?? pagination.pageSize, marketplace: context.marketplace,
  }), [context.marketplace, filters, pagination.pageSize, pinning, searchValue, sizing, sorting, visibility]);

  const presets = useMemo<TransactionSavedView[]>(() => {
    const base: TransactionSavedView['configuration'] = { version: 1, search: '', filters: { ...EMPTY_TRANSACTION_FILTERS }, sorting: [{ id: 'date', desc: true }], columnFilters: [], columnVisibility: INITIAL_VISIBILITY, columnSizing: {}, columnPinning: { start: ['select', 'date', 'product'], end: [] }, pageSize: 25 };
    return [
      { id: 'all-transactions', name: 'All transactions', builtIn: true, configuration: base },
      { id: 'loss-making', name: 'Loss-making transactions', builtIn: true, configuration: { ...base, filters: { ...base.filters, profitabilityStatus: 'loss_making' }, sorting: [{ id: 'netProfit', desc: false }] } },
      { id: 'refunded-sales', name: 'Refunded sales', builtIn: true, configuration: { ...base, filters: { ...base.filters, refundState: 'refunded' }, sorting: [{ id: 'refunds', desc: true }] } },
      ...(cogsAccess.allowed ? [{ id: 'missing-cogs', name: 'Missing COGS', builtIn: true, configuration: { ...base, filters: { ...base.filters, cogsSource: 'missing' as const } } }] : []),
      { id: 'amazon-high-fees', name: 'Amazon high-fee sales', builtIn: true, configuration: { ...base, marketplace: 'amazon', filters: { ...base.filters, highFees: true }, sorting: [{ id: 'fees', desc: true }] } },
    ];
  }, [cogsAccess.allowed]);
  const views = useMemo(() => [...presets, ...personalViews], [personalViews, presets]);
  const activeView = views.find((view) => view.id === activeViewId) ?? presets[0];
  useEffect(() => {
    if (activeViewId === 'all-transactions') return;
    const saved = views.find((view) => view.id === activeViewId);
    if (!saved) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setVisibility(saved.configuration.columnVisibility);
      setSizing(saved.configuration.columnSizing);
      setPinning(saved.configuration.columnPinning);
    });
    return () => { cancelled = true; };
  }, [activeViewId, views]);
  const persistViews = useCallback((next: TransactionSavedView[]) => {
    setPersonalViews(next);
    try { localStorage.setItem(savedViewsKey, JSON.stringify(next)); }
    catch { showToast('This browser could not persist the saved view.', 'warning'); }
  }, [savedViewsKey, showToast]);
  const applyView = useCallback((view: TransactionSavedView) => {
    const config = view.configuration;
    setVisibility(config.columnVisibility); setSizing(config.columnSizing); setPinning(config.columnPinning);
    setDraft({ source: config.search, value: config.search });
    updateUrl((next) => {
      writeFilters(next, config.filters);
      if (config.search) next.set('q', config.search); else next.delete('q');
      next.set('view', view.id); next.delete('page'); next.set('pageSize', String(config.pageSize));
      next.set('sort', config.sorting[0]?.id ?? 'date'); next.set('direction', config.sorting[0]?.desc === false ? 'asc' : 'desc');
      if (config.marketplace !== undefined && config.marketplace !== context.marketplace) { next.set('marketplace', config.marketplace); next.delete('account'); next.delete('accounts'); }
    });
    showToast(`${view.name} restored`, 'info');
  }, [context.marketplace, showToast, updateUrl]);
  const saveView = useCallback((grid?: EnterpriseDataGridViewState) => {
    const config = configuration(grid);
    if (!activeView.builtIn) {
      persistViews(personalViews.map((view) => view.id === activeView.id ? { ...view, configuration: config } : view));
      showToast(`${activeView.name} updated`);
    } else {
      const created = { id: `view-${Date.now()}`, name: `${activeView.name} copy`, builtIn: false, configuration: config };
      persistViews([...personalViews, created]); updateUrl((next) => next.set('view', created.id)); showToast(`${created.name} saved`);
    }
  }, [activeView, configuration, persistViews, personalViews, showToast, updateUrl]);

  const detailQuery = useMemo(() => {
    const next = new URLSearchParams(paramsString);
    next.delete('tab');
    // Pin the resolved exact dates so direct links do not drift when presets change.
    next.set('from', context.dateRange.from); next.set('to', context.dateRange.to);
    return next.toString();
  }, [context.dateRange.from, context.dateRange.to, paramsString]);
  const basePath = `/o/${workspace.organisation.slug}`;
  const detailHref = useCallback((id: string) => `${basePath}/transactions/${encodeURIComponent(id)}?${detailQuery}`, [basePath, detailQuery]);
  const productHref = useCallback((id: string) => `${basePath}/products/${encodeURIComponent(id)}?${detailQuery}`, [basePath, detailQuery]);
  const exportRows = useCallback(async (selectedIds?: string[]) => {
    try { const result = await exportMatching(selectedIds); downloadExport(result); showToast(`${formatInteger(result.recordCount)} authorised transactions exported`); }
    catch { showToast('Transactions could not be exported. Try again.', 'negative'); }
  }, [exportMatching, showToast]);

  const columns = useMemo(() => helper.columns([
    helper.display({ id: 'select', size: 42, enableHiding: false, enableSorting: false, header: ({ table }) => <SelectionCheckbox label="Select all transactions on this page" checked={table.getIsAllPageRowsSelected()} indeterminate={table.getIsSomePageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />, cell: ({ row }) => <SelectionCheckbox label={`Select transaction ${row.original.marketplaceOrderId}, ${row.original.title}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} /> }),
    helper.accessor('transactionDate', { id: 'date', header: 'Date', size: 122, enableHiding: false, cell: ({ getValue }) => <span className="transaction-date">{formatDate(getValue())}</span> }),
    helper.accessor('title', { id: 'product', header: 'Product / Order', size: 280, enableHiding: false, enableSorting: false, cell: ({ row }) => <Link className="product-cell transaction-identity" href={detailHref(row.original.id)}><ProductThumbnail category={row.original.product.category} /><span><strong>{row.original.title}</strong><small className="mono">{row.original.marketplaceOrderId}</small><small>{row.original.internalSku}</small></span></Link> }),
    helper.accessor('marketplace', { id: 'marketplace', header: 'Marketplace', size: 116, enableSorting: false, cell: ({ getValue }) => <MarketplaceBadge marketplace={getValue()} /> }),
    helper.accessor('marketplaceAccountName', { id: 'account', header: 'Marketplace account', size: 190, enableSorting: false, cell: ({ getValue }) => <span className="transaction-account" title={getValue()}>{getValue()}</span> }),
    helper.accessor('internalSku', { id: 'internalSku', header: 'Internal SKU', size: 160, enableSorting: false, cell: ({ getValue }) => <span className="mono">{getValue()}</span> }),
    helper.accessor('marketplaceSku', { id: 'marketplaceSku', header: 'Marketplace SKU', size: 180, enableSorting: false, cell: ({ getValue }) => <span className="mono">{getValue()}</span> }),
    helper.accessor('quantity', { id: 'quantity', header: 'Qty', size: 66, enableSorting: false, cell: ({ getValue }) => <span className="numeric">{formatInteger(getValue())}</span> }),
    helper.accessor('revenueMinor', { id: 'revenue', header: 'Revenue', size: 112, cell: ({ getValue }) => <MoneyCell value={getValue()} /> }),
    helper.accessor('refundsMinor', { id: 'refunds', header: 'Refunds', size: 105, cell: ({ getValue, row }) => <span title={row.original.refundState === 'none' ? 'No refund' : `${row.original.refundState === 'full' ? 'Full' : 'Partial'} refund`}><MoneyCell value={getValue()} /></span> }),
    helper.accessor('cogsMinor', { id: 'cogs', header: 'COGS', size: 110, cell: ({ getValue }) => <MoneyCell value={getValue()} unknown="Missing COGS" /> }),
    helper.accessor('marketplaceFeesMinor', { id: 'fees', header: 'Fees', size: 110, cell: ({ getValue, row }) => <span className="transaction-fees"><MoneyCell value={getValue()} />{row.original.highFees ? <Tooltip label="High fees relative to Revenue. Open profitability to inspect the source breakdown."><AlertTriangle size={12} aria-label="High fees" /></Tooltip> : null}</span> }),
    helper.accessor('advertisingMinor', { id: 'advertising', header: 'Advertising', size: 110, enableSorting: false, cell: ({ getValue }) => <MoneyCell value={getValue()} unknown="Unavailable" /> }),
    helper.accessor('shippingMinor', { id: 'shipping', header: 'Shipping', size: 110, enableSorting: false, cell: ({ getValue }) => <MoneyCell value={getValue()} /> }),
    helper.accessor('knownNetProfitMinor', { id: 'netProfit', header: 'Known Net Profit', size: 145, cell: ({ getValue, row }) => <Link className="transaction-profit-link" href={`${detailHref(row.original.id)}&tab=profitability`} aria-label={`${getValue() === null ? 'Incomplete profitability' : `${getValue()! < 0 ? 'Negative ' : ''}${formatMoney(Math.abs(getValue()!))} Net Profit`}, inspect deductions`}><MoneyCell value={getValue()} unknown="Incomplete" profit /></Link> }),
    helper.accessor('knownMarginBps', { id: 'margin', header: 'Margin', size: 96, cell: ({ getValue, row }) => getValue() === null ? <span className="transaction-unknown">{row.original.completenessState === 'complete' ? 'N/A' : 'Incomplete'}</span> : <span className={`numeric${getValue()! < 0 ? ' negative-text' : ''}`}>{formatPercentage(getValue())}</span> }),
    helper.accessor('profitabilityStatus', { id: 'status', header: 'Profitability status', size: 150, enableSorting: false, cell: ({ getValue }) => <TransactionStatusBadge status={getValue()} /> }),
    helper.accessor('companyName', { id: 'company', header: 'Company', size: 180, enableSorting: false }),
    helper.accessor('listingIdentifier', { id: 'listingId', header: 'Listing ID', size: 160, enableSorting: false, cell: ({ getValue }) => <span className="mono">{getValue()}</span> }),
    helper.accessor('productGroupName', { id: 'productGroup', header: 'Product Group', size: 180, enableSorting: false, cell: ({ getValue, row }) => row.original.productGroupId ? <Link className="transaction-group-link" href={`${basePath}/cogs/groups/${encodeURIComponent(row.original.productGroupId)}?${detailQuery}`}><Layers3 size={12} />{getValue()}</Link> : <span className="muted">Ungrouped</span> }),
    helper.accessor('cogsSourceLabel', { id: 'cogsSource', header: 'COGS source', size: 180, enableSorting: false, cell: ({ getValue }) => <span>{getValue()}</span> }),
    helper.accessor('otherDirectCostsMinor', { id: 'otherCosts', header: 'Other direct costs', size: 140, enableSorting: false, cell: ({ getValue }) => <MoneyCell value={getValue()} /> }),
    helper.accessor('allocatedExpensesMinor', { id: 'allocatedExpenses', header: 'Allocated expenses', size: 145, enableSorting: false, cell: ({ getValue }) => <MoneyCell value={getValue()} unknown="Restricted" /> }),
    helper.accessor('grossProfitKnownMinor', { id: 'grossProfit', header: 'Gross Profit', size: 125, enableSorting: false, cell: ({ getValue }) => <MoneyCell value={getValue()} unknown="Incomplete" /> }),
    helper.accessor('reportingCurrency', { id: 'currency', header: 'Currency', size: 90, enableSorting: false }),
    helper.accessor('refundRateBps', { id: 'refundRate', header: 'Refund rate', size: 115, enableSorting: false, cell: ({ getValue }) => <span className="numeric">{formatPercentage(getValue())}</span> }),
    helper.accessor('sourceEventCount', { id: 'eventCount', header: 'Source events', size: 110, enableSorting: false, cell: ({ getValue, row }) => <Link className="transaction-profit-link" href={`${detailHref(row.original.id)}&tab=source-events`}>{formatInteger(getValue())} events</Link> }),
    helper.accessor((row) => row.freshness.label, { id: 'freshness', header: 'Data freshness', size: 170, enableSorting: false, cell: ({ getValue, row }) => <Badge tone={row.original.freshness.state === 'fresh' ? 'positive' : row.original.freshness.state === 'error' ? 'negative' : 'warning'}>{getValue()}</Badge> }),
  ]).filter((column) => (cogsAccess.allowed || !['cogs', 'cogsSource', 'productGroup'].includes(column.id ?? '')) && (sensitiveAccess.allowed || column.id !== 'allocatedExpenses')), [basePath, cogsAccess.allowed, detailHref, detailQuery, sensitiveAccess.allowed]);

  const rowActions = useCallback((row: ProfitabilityTransaction) => <DropdownMenu label="Actions" items={[
    { label: 'View transaction', onSelect: () => router.push(detailHref(row.id)) },
    { label: 'Explain profitability', onSelect: () => router.push(`${detailHref(row.id)}&tab=profitability`) },
    ...(productAccess.allowed ? [{ label: 'View Product', onSelect: () => router.push(productHref(row.productId)) }] : []),
    { label: 'Copy Order reference', onSelect: () => { void navigator.clipboard.writeText(row.marketplaceOrderId).then(() => showToast('Order reference copied')).catch(() => showToast('Order reference could not be copied', 'warning')); } },
    ...(cogsEditAccess.allowed ? [{ label: 'Review COGS', onSelect: () => router.push(`${basePath}/cogs?${detailQuery}&product=${encodeURIComponent(row.productId)}`) }] : []),
  ]} />, [basePath, cogsEditAccess.allowed, detailHref, detailQuery, productAccess.allowed, productHref, router, showToast]);
  const bulkActions = useCallback(({ selectedRowIds, clearSelection }: EnterpriseDataGridBulkActionContext<ProfitabilityTransaction>) => <>
    {permissions.canExport ? <button type="button" disabled={exportMutation.isPending} onClick={() => { void exportRows(selectedRowIds); }}><Download size={14} /> Export {selectedRowIds.length} selected</button> : null}
    <button type="button" onClick={clearSelection}><X size={14} /> Clear</button>
  </>, [exportMutation.isPending, exportRows, permissions.canExport]);

  if (!access.allowed) return <AccessState decision={access} />;
  if (marketplaceState === 'no-authorised') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;
  if (marketplaceState === 'none-connected') return <div className="transactions-page"><PageHeader title="Transactions" description="Inspect marketplace sales at transaction level and follow every deduction from revenue to profit." /><section className="transaction-empty-source" role="status"><Store size={25} /><h2>Connect a marketplace to import transactions</h2><p>Sales and source financial events will appear here after your first marketplace sync.</p>{marketplaceAccess.allowed ? <Link className="ui-button primary" href={`${basePath}/admin/marketplace-accounts`}>Connect a marketplace</Link> : <small>Ask an organisation administrator to connect a marketplace account.</small>}</section></div>;

  const data = query.data;
  const freshness = data?.freshness;
  const firstSync = scenarioId === 'first-sync';
  const filterCount = transactionFilterCount(filters) + Number(Boolean(search));
  const clearFilters = () => { setDraft({ source: '', value: '' }); updateUrl((next) => { writeFilters(next, { ...EMPTY_TRANSACTION_FILTERS }); next.delete('q'); next.delete('page'); next.delete('view'); }); };

  return <div className="transactions-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Transactions' }]} />
    <PageHeader eyebrow="Transaction profitability" title="Transactions" description="Inspect marketplace sales at transaction level and follow every deduction from revenue to profit." actions={<div className="transaction-header-actions">
      <SavedTransactionViews views={views} activeViewId={activeViewId} onApply={applyView} onSave={() => saveView()} onCreate={(name) => { const created = { id: `view-${Date.now()}`, name, builtIn: false, configuration: configuration() }; persistViews([...personalViews, created]); updateUrl((next) => next.set('view', created.id)); showToast(`${name} created`); }} onRename={(name) => { if (activeView.builtIn) return; persistViews(personalViews.map((view) => view.id === activeView.id ? { ...view, name } : view)); showToast('Saved view renamed'); }} onDelete={() => { if (activeView.builtIn) return; persistViews(personalViews.filter((view) => view.id !== activeView.id)); applyView(presets[0]); showToast('Saved view deleted'); }} />
      {permissions.canExport ? <Button disabled={!data?.total} loading={exportMutation.isPending} onClick={() => { void exportRows(); }}><Download size={14} /> Export current view</Button> : null}
    </div>} />
    {freshness && freshness.state !== 'fresh' ? <section className={`transaction-notice ${freshness.state === 'error' ? 'error' : ''}`} role="status"><AlertTriangle size={17} /><div><strong>{freshness.label}</strong><span>{freshness.detail} Available transactions remain visible; later source events may change profitability.</span></div><Link href={`${basePath}/operations/sync-health?${detailQuery}`}>View Sync Health</Link></section> : null}
    {firstSync && data?.total === 0 ? <section className="transaction-empty-source" role="status"><RefreshCw size={25} className="spin" /><h2>Transactions are still importing</h2><p>No sale lines are available in this view yet. Financial events are still syncing; expand the date range or check back as the import progresses.</p><Badge tone="info">Initial sync in progress</Badge><Link className="ui-button secondary" href={`${basePath}/operations/sync-health?${detailQuery}`}>View sync progress</Link></section> : <>
      <TransactionSummaryStrip summary={data?.summary} loading={query.isPending} />
      {data && data.summary.transactions > 0 && !data.summary.profitabilityComplete ? <section className="transaction-notice" role="status"><FileWarning size={17} /><div><strong>Some profitability is incomplete</strong><span>Known Net Profit covers {formatPercentage(data.summary.profitabilityCoverageBps)} of Revenue. Open a sale line to see which cost is unavailable on its transaction date.</span></div>{cogsEditAccess.allowed ? <Link href={`${basePath}/cogs?${detailQuery}&status=missing`}>Review COGS</Link> : null}</section> : null}
      <div className="transaction-view-bar"><div><ReceiptText size={15} /><strong>Sale lines</strong><span>One Product per transaction</span></div><Tooltip label="Revenue is after discounts and before refunds. Known Net Profit uses only the covered cohort and includes the applicable allocated expenses."><button className="transaction-help" type="button"><CircleHelp size={14} /> About these figures</button></Tooltip></div>
      <div className="transaction-quick-filters" aria-label="Quick transaction filters">
        <button type="button" aria-pressed={filters.profitabilityStatus === 'loss_making'} onClick={() => changeFilters({ ...filters, profitabilityStatus: filters.profitabilityStatus === 'loss_making' ? 'all' : 'loss_making' })}><ArrowDownRight size={13} /> Loss-making</button>
        <button type="button" aria-pressed={filters.refundState === 'refunded'} onClick={() => changeFilters({ ...filters, refundState: filters.refundState === 'refunded' ? 'all' : 'refunded' })}><RotateCcw size={13} /> Refunded</button>
        {cogsAccess.allowed ? <button type="button" aria-pressed={filters.cogsSource === 'missing'} onClick={() => changeFilters({ ...filters, cogsSource: filters.cogsSource === 'missing' ? 'all' : 'missing' })}><FileWarning size={13} /> Missing COGS</button> : null}
        <button type="button" aria-pressed={filters.highFees} onClick={() => changeFilters({ ...filters, highFees: !filters.highFees })}><AlertTriangle size={13} /> High fees</button>
      </div>
      <TransactionFilterBar filters={filters} products={(data?.products ?? []).map((item) => ({ id: item.id, name: `${item.title} · ${item.internalSku}` }))} groups={data?.productGroups ?? []} canViewCogs={cogsAccess.allowed} onChange={changeFilters} onClear={clearFilters} />
      {filters.costRecordId ? <div className="transaction-cost-record-filter" role="status"><Layers3 size={13} /><span>Using historical COGS record</span><code title={filters.costRecordId}>{filters.costRecordId}</code><button type="button" aria-label="Remove historical COGS record filter" onClick={() => changeFilters({ ...filters, costRecordId: '' })}><X size={13} /></button></div> : null}
      {(query.isFetching && !query.isPending) || searchValue !== search ? <div className="transaction-updating" role="status" aria-live="polite"><RefreshCw size={13} className="spin" /> Updating transactions…</div> : null}
      <EnterpriseDataGrid data={data?.items ?? NO_ROWS} columns={columns} ariaLabel="Canonical sale-line profitability transactions" initialPinnedColumns={['select', 'date', 'product']} responsivePriorityColumns={['product', 'date', 'marketplace', 'revenue', 'netProfit', 'margin', 'status']}
        pagination={pagination} onPaginationChange={(value) => { const next = resolveUpdate(value, pagination); updateUrl((target) => { target.set('page', String(next.pageSize !== pagination.pageSize ? 1 : next.pageIndex + 1)); target.set('pageSize', String(next.pageSize)); }); }}
        sorting={sorting} onSortingChange={(value) => { const next = resolveUpdate(value, sorting).slice(-1)[0]; if (next) updateUrl((target) => { target.set('sort', next.id); target.set('direction', next.desc ? 'desc' : 'asc'); target.delete('page'); }); }}
        search={searchValue} onSearchChange={(value) => { const next = resolveUpdate(value, searchValue); setDraft({ source: search, value: next }); if (searchTimer.current) clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => updateUrl((target) => { if (next) target.set('q', next); else target.delete('q'); target.delete('page'); }, true), 280); }}
        columnVisibility={visibility} onColumnVisibilityChange={setVisibility} columnSizing={sizing} onColumnSizingChange={setSizing} columnPinning={pinning} onColumnPinningChange={setPinning}
        manualPagination manualSorting manualFiltering rowCount={data?.total ?? 0} pageCount={data?.pageCount ?? 0} renderBulkActions={bulkActions} renderRowActions={rowActions} onSaveView={saveView} loading={query.isPending} error={query.isError ? query.error : null} onRetry={() => { void query.refetch(); }}
        errorState={<ErrorState title="Transactions could not be loaded" description="The transaction service is temporarily unavailable. Retry to load this authorised view." onRetry={() => { void query.refetch(); }} />}
        emptyState={<EmptyState title="No transactions in this view" description={filterCount ? 'Clear a filter, broaden your search, or expand the date range above.' : 'Expand the date range or change the marketplace filter to find imported sales.'} actions={filterCount ? <Button size="compact" variant="ghost" onClick={clearFilters}>Clear search and filters</Button> : undefined} />}
        searchPlaceholder="Search Order ID, transaction, Product, SKU or listing ID" canExport={false} />
      <p className="transaction-footnote"><ReceiptText size={13} /><span>Transactions are sale lines for profitability analysis. Open a transaction to trace revenue, refunds and every deduction to its source.</span></p>
    </>}
  </div>;
}
