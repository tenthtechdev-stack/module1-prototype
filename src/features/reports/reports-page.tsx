'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper, type ColumnPinningState, type ColumnSizingState, type ColumnVisibilityState, type SortingState } from '@tanstack/react-table';
import { Download, FileBarChart, Info, Printer, RotateCcw } from 'lucide-react';
import { REPORT_DIMENSIONS, REPORT_TITLES, type ReportKind, type ReportRow } from '@/src/domain/reports';
import { decodeReportViews, REPORT_LOCAL_PARAMS, type ReportSavedView } from '@/src/domain/report-saved-views';
import { formatDate, formatInteger } from '@/src/domain/calculations';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { AccessState } from '@/src/components/rbac/access';
import { EmptyState, ErrorState } from '@/src/components/states/states';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Badge, useToast } from '@/src/components/ui/feedback';
import { Select } from '@/src/components/ui/forms';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { Drawer, DropdownMenu } from '@/src/components/ui/overlays';
import { EnterpriseDataGrid, gridFeatures, type EnterpriseDataGridViewState } from '@/src/components/tables/enterprise-data-grid';
import { useReport, type ReportExportFormat } from '@/src/services/hooks/use-reports';
import { DIMENSION_LABELS, EMPTY_REPORT_FILTERS, ReportFilterBar, SavedReportViews, type ReportFilters } from './report-controls';
import { OperationalStatement, ReportHealth, ReportSummary, ReportUpdating, ReportValueDisplay, StatementSkeleton } from './report-presentation';
import { reportOptionsFromSearch } from './report-query';
import './reports.css';

const helper = createColumnHelper<typeof gridFeatures, ReportRow>();
const NO_ROWS: ReportRow[] = [];
const INITIAL_VISIBILITY: ColumnVisibilityState = {
  internalSku: false, sku: false, productGroup: false, productGroupName: false, marketplaceCount: false, transactions: false,
  company: false, companyName: false, account: false, accountName: false, marketplaceAccountName: false, sourceReference: false, sourceCurrency: false,
  originalSaleDate: false, advertising: false, advertisingMinor: false, advertisingKnownMinor: false, shipping: false, shippingMinor: false,
  otherDirectCosts: false, otherDirectCostsMinor: false, grossProfit: false, grossProfitKnownMinor: false,
  allocatedExpenses: false, allocatedExpensesMinor: false, sourceAmount: false, sourceAmountMinor: false,
};
const DESCRIPTIONS: Record<ReportKind, string> = {
  'p-and-l': 'Trace marketplace revenue through refunds, approved costs and configured expenses to operational profitability.',
  'product-profitability': 'Compare Product profitability across marketplaces and historical Product Group membership.',
  'marketplace-profitability': 'Compare marketplace, account and Company performance within one consistent reporting scope.',
  fees: 'Trace marketplace fee components to the transactions and source events that produced them.',
  refunds: 'Review canonical refunds alongside their original sales and transaction evidence.',
  expenses: 'Review configured expense history and how eligible expenses contribute to profitability.',
  transactions: 'Explore canonical sale lines as a filtered, grouped and exportable report.',
};
function resolveUpdate<T>(value: T | ((previous: T) => T), previous: T): T { return typeof value === 'function' ? (value as (previous: T) => T)(previous) : value; }

export function ReportsPage({ kind }: { kind: ReportKind }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const paramsString = params.toString();
  const { workspace, context, companyNameFor, accountNameFor } = useAnalysisContext();
  const { roleId, scenarioId } = usePrototype();
  const { showToast } = useToast();
  const options = useMemo(() => reportOptionsFromSearch(kind, new URLSearchParams(paramsString)), [kind, paramsString]);
  const { query, access, marketplaceState, permissions, exportMutation } = useReport(options);
  const data = query.data;
  const search = options.search ?? '';
  const [draft, setDraft] = useState({ source: search, value: search });
  const searchValue = draft.source === search ? draft.value : search;
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [visibility, setVisibility] = useState<ColumnVisibilityState>(INITIAL_VISIBILITY);
  const [sizing, setSizing] = useState<ColumnSizingState>({});
  const [pinning, setPinning] = useState<ColumnPinningState>({ start: ['label'], end: [] });
  const [personalViews, setPersonalViews] = useState<ReportSavedView[]>([]);
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>('csv');
  const sorting: SortingState = (options.sorting ?? []).map((sort) => ({ id: sort.field, desc: sort.direction === 'desc' }));
  const pagination = { pageIndex: options.page ?? 0, pageSize: options.pageSize ?? 25 };
  const filters: ReportFilters = { productId: options.productId ?? '', productGroupId: options.productGroupId ?? '', completeness: options.completeness ?? 'all', category: options.category ?? '', feeType: options.feeType ?? '', expenseType: options.expenseType ?? 'all' };
  const storageKey = `${workspace.organisation.id}:${workspace.activeUser?.id ?? roleId}:report-saved-views:${kind}:v1`;
  const activeViewId = params.get('view') ?? 'default';
  const defaultView: ReportSavedView = { id: 'default', name: 'Default configuration', builtIn: true, configuration: { version: 1, kind, groupBy: REPORT_DIMENSIONS[kind][0], search: '', filters: { ...EMPTY_REPORT_FILTERS, expenseView: 'ledger' }, comparePreviousPeriod: false, sorting: [], columnFilters: [], columnVisibility: INITIAL_VISIBILITY, columnSizing: {}, columnPinning: { start: ['label'], end: [] }, pageSize: 25 } };
  const views = [defaultView, ...personalViews];
  const activeView = views.find((view) => view.id === activeViewId) ?? defaultView;

  useEffect(() => () => { if (searchTimer.current) clearTimeout(searchTimer.current); }, []);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (cancelled) return; try { setPersonalViews(decodeReportViews(localStorage.getItem(storageKey), kind)); } catch { setPersonalViews([]); } });
    return () => { cancelled = true; };
  }, [kind, storageKey]);
  useEffect(() => {
    const saved = personalViews.find((view) => view.id === activeViewId);
    if (!saved) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) { setVisibility(saved.configuration.columnVisibility); setSizing(saved.configuration.columnSizing); setPinning(saved.configuration.columnPinning); } });
    return () => { cancelled = true; };
  }, [activeViewId, personalViews]);

  const updateUrl = useCallback((edit: (next: URLSearchParams) => void, replace = false) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const next = new URLSearchParams(paramsString); edit(next);
    if (next.toString() !== paramsString) router[replace ? 'replace' : 'push'](next.size ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [paramsString, pathname, router]);
  const scopeKey = `${context.companyId}:${context.marketplace}:${context.marketplaceAccountIds.join(',')}:${context.dateRange.from}:${context.dateRange.to}`;
  const previousScope = useRef(scopeKey);
  useEffect(() => { if (previousScope.current !== scopeKey) { previousScope.current = scopeKey; if (options.page) updateUrl((next) => next.delete('page'), true); } }, [options.page, scopeKey, updateUrl]);
  const href = useCallback((path: string, extra: Record<string, string> = {}) => {
    const next = new URLSearchParams(paramsString);
    REPORT_LOCAL_PARAMS.forEach((key) => { if (!['productId', 'productGroupId', 'completeness'].includes(key)) next.delete(key); });
    next.delete('tab'); next.set('from', context.dateRange.from); next.set('to', context.dateRange.to);
    Object.entries(extra).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    return `/o/${workspace.organisation.slug}${path}?${next}`;
  }, [context.dateRange.from, context.dateRange.to, paramsString, workspace.organisation.slug]);
  const reportHref = (report: ReportKind) => href(`/reports/${report}`);
  function changeFilters(nextFilters: ReportFilters) { updateUrl((next) => { Object.entries(nextFilters).forEach(([key, value]) => value && value !== 'all' ? next.set(key, value) : next.delete(key)); next.delete('page'); }); }
  function configuration(grid?: EnterpriseDataGridViewState): ReportSavedView['configuration'] { return { version: 1, kind, groupBy: options.groupBy ?? REPORT_DIMENSIONS[kind][0], search: grid?.search ?? searchValue, filters: { ...filters, expenseView: options.expenseView ?? 'ledger' }, comparePreviousPeriod: Boolean(options.comparePreviousPeriod), sorting: grid?.sorting ?? sorting, columnFilters: [], columnVisibility: grid?.columnVisibility ?? visibility, columnSizing: grid?.columnSizing ?? sizing, columnPinning: grid?.columnPinning ?? pinning, pageSize: grid?.pageSize ?? pagination.pageSize }; }
  function persist(next: ReportSavedView[]) { setPersonalViews(next); try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { showToast('This browser could not persist the configuration.', 'warning'); } }
  function applyView(view: ReportSavedView) {
    const config = view.configuration;
    setVisibility(config.columnVisibility); setSizing(config.columnSizing); setPinning(config.columnPinning); setDraft({ source: config.search, value: config.search });
    updateUrl((next) => { REPORT_LOCAL_PARAMS.forEach((key) => next.delete(key)); Object.entries(config.filters).forEach(([key, value]) => { if (value && value !== 'all') next.set(key, value); }); if (config.search) next.set('q', config.search); next.set('groupBy', config.groupBy); if (config.comparePreviousPeriod) next.set('compare', 'true'); if (config.sorting[0]) { next.set('sort', config.sorting[0].id); next.set('direction', config.sorting[0].desc ? 'desc' : 'asc'); } next.set('pageSize', String(config.pageSize)); next.set('view', view.id); });
    showToast(`${view.name} restored`, 'info');
  }
  function createView(name: string, grid?: EnterpriseDataGridViewState) { const view: ReportSavedView = { id: `report-view-${Date.now()}`, name, builtIn: false, configuration: configuration(grid) }; persist([...personalViews, view]); updateUrl((next) => next.set('view', view.id)); showToast(`${name} saved`); }
  function saveView(grid?: EnterpriseDataGridViewState) { if (activeView.builtIn) createView(`${REPORT_TITLES[kind]} configuration`, grid); else { persist(personalViews.map((view) => view.id === activeView.id ? { ...view, configuration: configuration(grid) } : view)); showToast('Report configuration updated'); } }
  function clearFilters() { setDraft({ source: '', value: '' }); updateUrl((next) => { Object.keys(EMPTY_REPORT_FILTERS).forEach((key) => next.delete(key)); next.delete('q'); next.delete('page'); }); }
  async function exportReport(format: ReportExportFormat) {
    setExportFormat(format);
    try { const result = await exportMutation.mutateAsync({ format, visibleColumns: data?.columns.filter((column) => visibility[column.key] !== false).map((column) => column.key) }); const url = URL.createObjectURL(new Blob([result.bytes], { type: result.mimeType })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = result.fileName; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); showToast(`${format.toUpperCase()} report ready · ${formatInteger(result.recordCount)} authorised rows`); }
    catch { showToast('Report export failed. Retry to prepare it again.', 'negative'); }
  }
  function rowScope(row: ReportRow) { const extra: Record<string, string> = {}; if (row.productId) extra.productId = row.productId; if (row.productGroupId) extra.productGroupId = row.productGroupId; else if (options.groupBy === 'product-group' && row.id === 'ungrouped') extra.productGroupId = 'ungrouped'; if (options.groupBy === 'marketplace') { const market = String(row.values.marketplace ?? row.id).toLowerCase(); if (['amazon', 'ebay', 'temu'].includes(market)) { extra.marketplace = market; extra.accounts = ''; } } if (options.groupBy === 'company' && typeof row.values.companyId === 'string') { extra.company = row.values.companyId; extra.accounts = ''; } if (options.groupBy === 'account' && typeof row.values.accountId === 'string') extra.accounts = row.values.accountId; return extra; }
  function rowLink(row: ReportRow) { if (row.expenseId && permissions.canViewExpenses) return href(`/expenses/${encodeURIComponent(row.expenseId)}`); if (row.transactionId && permissions.canViewTransactions) return href(`/transactions/${encodeURIComponent(row.transactionId)}`, kind === 'fees' ? { tab: 'source-events' } : {}); if (row.productId && permissions.canViewProducts) return href(`/products/${encodeURIComponent(row.productId)}`); if (row.productGroupId && row.productGroupId !== 'ungrouped' && permissions.canViewCogs) return href(`/cogs/groups/${encodeURIComponent(row.productGroupId)}`); return permissions.canViewTransactions ? href('/transactions', rowScope(row)) : undefined; }
  const columns = helper.columns((data?.columns ?? []).map((column, index) => helper.accessor((row) => row.values[column.key], { id: column.key, header: kind === 'expenses' && column.key === 'amountMinor' ? 'Source Amount' : column.label, size: index === 0 ? 265 : column.format === 'text' ? 170 : 140, enableHiding: index !== 0, enableColumnFilter: false, cell: ({ row, getValue }) => { const link = index === 0 ? rowLink(row.original) : undefined; return link ? <Link className="report-identity" href={link}><ReportValueDisplay value={getValue()} format={kind === 'expenses' && column.key === 'amountMinor' ? 'money' : column.format} currency={column.key === 'sourceAmountMinor' ? String(row.original.values.sourceCurrency ?? 'GBP') : column.key === 'amountMinor' ? String(row.original.values.currency ?? 'GBP') : 'GBP'} />{kind === 'product-profitability' && row.original.productId ? <small className="report-product-context">{String(row.original.values.internalSku ?? '')}{row.original.values.companyName ? ` · ${row.original.values.companyName}` : ''}</small> : null}</Link> : <ReportValueDisplay value={getValue()} format={kind === 'expenses' && column.key === 'amountMinor' ? 'money' : column.format} currency={column.key === 'sourceAmountMinor' ? String(row.original.values.sourceCurrency ?? 'GBP') : column.key === 'amountMinor' ? String(row.original.values.currency ?? 'GBP') : 'GBP'} />; } })));
  const priorityColumns = data ? [...new Set([data.columns[0]?.key, ...(kind === 'expenses' ? ['reportingAmountMinor', 'allocatedMinor', 'unallocatedMinor', 'scope', 'type', 'status'] : kind === 'fees' ? ['reportingAmountMinor', 'feeType', 'marketplace', 'title'] : kind === 'refunds' ? ['refundsMinor', 'refundRateBps', 'marketplace', 'title', 'originalSaleDate'] : ['revenueMinor', 'knownNetProfitMinor', 'knownMarginBps', 'profitabilityCoverageBps', 'marketplace', 'syncStatus'])])].filter((key): key is string => Boolean(key) && data.columns.some((column) => column.key === key)) : [];
  const empty = <EmptyState title={scenarioId === 'first-sync' ? 'Marketplace activity is still importing' : marketplaceState === 'none-connected' ? 'No marketplace activity yet' : 'No report data for this period'} description={marketplaceState === 'none-connected' ? 'Connect a marketplace and complete an initial sync to report on sales.' : 'Change the period or marketplace above, or clear the Product and report filters.'} actions={<Button size="compact" onClick={clearFilters}>Clear report filters</Button>} />;
  if (!access.allowed) return access.reason === 'assignment_out_of_scope' ? <div className="reports-page"><PageHeader title={REPORT_TITLES[kind]} /><EmptyState title="Report scope unavailable" description="This reporting scope is not available within your current assignment." /></div> : <AccessState decision={access} />;
  if (marketplaceState === 'no-authorised') return <div className="reports-page"><PageHeader title={REPORT_TITLES[kind]} /><EmptyState title="Report scope unavailable" description="No marketplace accounts are available within your current assignment." /></div>;

  return <div className={`reports-page report-${kind}`}>
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Reports', href: href('/reports') }, { label: REPORT_TITLES[kind] }]} />
    <PageHeader eyebrow="Operational financial reporting" title={REPORT_TITLES[kind]} description={DESCRIPTIONS[kind]} actions={<div className="report-header-actions">
      <SavedReportViews views={views} activeViewId={activeViewId} onApply={applyView} onCreate={createView} onSave={() => saveView()} onRename={(name) => { if (!activeView.builtIn) { persist(personalViews.map((view) => view.id === activeView.id ? { ...view, name } : view)); showToast('Configuration renamed'); } }} onDelete={() => { if (!activeView.builtIn) { persist(personalViews.filter((view) => view.id !== activeView.id)); applyView(defaultView); showToast('Configuration deleted'); } }} />
      {permissions.canExport ? <DropdownMenu accessibleLabel="Export report" label={<><Download size={14} /> {exportMutation.isPending ? 'Preparing…' : 'Export'}</>} items={[{ label: 'Export CSV', disabled: !data || exportMutation.isPending, onSelect: () => { void exportReport('csv'); } }, { label: 'Export Excel', disabled: !data || exportMutation.isPending, onSelect: () => { void exportReport('xlsx'); } }, ...(kind === 'p-and-l' ? [{ label: 'Export PDF', disabled: !data || exportMutation.isPending, onSelect: () => { void exportReport('pdf'); } }] : [])]} /> : null}
      {kind === 'p-and-l' ? <Button onClick={() => window.print()} disabled={!data} aria-label="Print Operational P&L"><Printer size={14} /> Print</Button> : null}
    </div>} />
    <div className="report-scope" aria-label="Selected reporting scope"><span><strong>{formatDate(context.dateRange.from)} – {formatDate(context.dateRange.to)}</strong></span><span>{context.companyId === 'all' ? 'All authorised Companies' : companyNameFor(context.companyId)}</span><span>{context.marketplace === 'all' ? 'All marketplaces' : context.marketplace === 'ebay' ? 'eBay' : context.marketplace === 'amazon' ? 'Amazon' : 'Temu'}</span><span>{context.marketplaceAccountIds.length ? context.marketplaceAccountIds.map(accountNameFor).join(', ') : 'All authorised accounts'}</span><Badge>GBP</Badge></div>
    <div className="report-toolbar"><label><span>Report</span><Select aria-label="Choose report" value={kind} onChange={(event) => router.push(reportHref(event.target.value as ReportKind))}>{Object.entries(REPORT_TITLES).filter(([report]) => report !== 'expenses' || permissions.canViewExpenses).map(([report, title]) => <option key={report} value={report}>{title}</option>)}</Select></label>{kind !== 'p-and-l' ? <label><span>Group by</span><Select aria-label="Group by" value={options.groupBy} onChange={(event) => updateUrl((next) => { next.set('groupBy', event.target.value); next.delete('page'); next.delete('sort'); next.delete('direction'); })}>{(kind === 'expenses' && options.expenseView !== 'allocated' ? ['none', 'expense-category', 'expense-type'] as const : data?.groups ?? REPORT_DIMENSIONS[kind]).map((dimension) => <option key={dimension} value={dimension}>{DIMENSION_LABELS[dimension]}</option>)}</Select></label> : <label className="report-compare"><input type="checkbox" checked={Boolean(options.comparePreviousPeriod)} onChange={(event) => updateUrl((next) => event.target.checked ? next.set('compare', 'true') : next.delete('compare'))} /><span>Compare with previous equivalent period</span></label>}<Button size="compact" variant="ghost" onClick={() => applyView(defaultView)}><RotateCcw size={13} /> Reset report</Button></div>
    <ReportFilterBar kind={kind} data={data} filters={filters} canViewCogs={permissions.canViewCogs} onChange={changeFilters} onClear={clearFilters} />
    {kind === 'expenses' ? <div className="report-expense-views" role="group" aria-label="Expense report view"><Button variant={options.expenseView === 'ledger' ? 'primary' : 'secondary'} aria-pressed={options.expenseView === 'ledger'} onClick={() => updateUrl((next) => { next.set('expenseView', 'ledger'); next.set('groupBy', 'none'); next.delete('page'); })}>Expense Ledger</Button><Button variant={options.expenseView === 'allocated' ? 'primary' : 'secondary'} aria-pressed={options.expenseView === 'allocated'} onClick={() => updateUrl((next) => { next.set('expenseView', 'allocated'); next.delete('page'); })}>Allocated View</Button><span>{options.expenseView === 'allocated' ? 'How eligible expenses contributed to the selected transactions.' : 'Configured expenses and their effective-dated history.'}</span></div> : null}
    {exportMutation.isPending || exportMutation.isSuccess || exportMutation.isError ? <div className={`report-export-state${exportMutation.isError ? ' failed' : ''}`} role="status" aria-live="polite"><Download size={14} />{exportMutation.isPending ? 'Preparing export…' : exportMutation.isError ? 'Export failed. Please retry.' : `Ready · ${exportFormat.toUpperCase()} report downloaded`} {exportMutation.isError ? <Button size="compact" onClick={() => { void exportReport(exportFormat); }}>Retry export</Button> : null}</div> : null}
    {data ? <ReportHealth data={data} href={href} canManageCogs={permissions.canManageCogs} canViewSync={permissions.canViewSync} canViewExpenses={permissions.canViewExpenses} /> : null}
    {data && !data.sensitiveExpensesVisible ? <section className="report-restricted" role="status"><Info size={16} /><div><strong>Sensitive expense access is restricted</strong><p>Only authorised expense details are available. Total expenses, Net Profit and Margin are unavailable where displaying them could reveal restricted amounts.</p></div></section> : null}
    {(query.isFetching && !query.isPending) || searchValue !== search ? <ReportUpdating /> : null}
    <ReportSummary data={data} loading={query.isPending && kind !== 'p-and-l'} />
    {kind === 'p-and-l' ? query.isPending ? <StatementSkeleton /> : query.isError ? <ErrorState title="Report could not be loaded" description="The reporting service is temporarily unavailable. Retry this authorised scope." onRetry={() => { void query.refetch(); }} /> : data && (data.totals.transactions > 0 || Boolean(data.expenseSummary.configuredMinor)) ? <OperationalStatement data={data} reportHref={reportHref} /> : empty : <EnterpriseDataGrid data={data?.rows ?? NO_ROWS} columns={columns} ariaLabel={REPORT_TITLES[kind]} responsivePriorityColumns={priorityColumns} pagination={pagination} onPaginationChange={(value) => { const next = resolveUpdate(value, pagination); updateUrl((target) => { target.set('page', String(next.pageSize !== pagination.pageSize ? 1 : next.pageIndex + 1)); target.set('pageSize', String(next.pageSize)); }); }} sorting={sorting} onSortingChange={(value) => { const next = resolveUpdate(value, sorting).slice(-1)[0]; updateUrl((target) => { if (next) { target.set('sort', next.id); target.set('direction', next.desc ? 'desc' : 'asc'); } else { target.delete('sort'); target.delete('direction'); } target.delete('page'); }); }} search={searchValue} onSearchChange={(value) => { const next = resolveUpdate(value, searchValue); setDraft({ source: search, value: next }); if (searchTimer.current) clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => updateUrl((target) => { if (next) target.set('q', next); else target.delete('q'); target.delete('page'); }, true), 280); }} columnVisibility={visibility} onColumnVisibilityChange={setVisibility} columnSizing={sizing} onColumnSizingChange={setSizing} columnPinning={pinning} onColumnPinningChange={setPinning} onSaveView={saveView} manualPagination manualSorting manualFiltering rowCount={data?.total ?? 0} pageCount={data?.pageCount ?? 0} loading={query.isPending} error={query.isError ? query.error : null} onRetry={() => { void query.refetch(); }} emptyState={empty} errorState={<ErrorState title="Report could not be loaded" description="The reporting service is temporarily unavailable. Retry this authorised scope." onRetry={() => { void query.refetch(); }} />} searchPlaceholder="Search this authorised report" canExport={false} renderRowActions={(row) => <Drawer title={row.label} description="Reported values within the selected period and authorised scope." trigger={<Button size="compact" variant="ghost">Details</Button>}><dl className="report-record-details">{data?.columns.map((column) => <div key={column.key}><dt>{kind === 'expenses' && column.key === 'amountMinor' ? 'Source Amount' : column.label}</dt><dd><ReportValueDisplay value={row.values[column.key]} format={kind === 'expenses' && column.key === 'amountMinor' ? 'money' : column.format} currency={column.key === 'sourceAmountMinor' ? String(row.values.sourceCurrency ?? 'GBP') : column.key === 'amountMinor' ? String(row.values.currency ?? 'GBP') : 'GBP'} /></dd></div>)}</dl><div className="report-record-links">{rowLink(row) ? <Link className="ui-button secondary" href={rowLink(row)!}>Open source record</Link> : null}{permissions.canViewTransactions && !row.expenseId ? <Link className="ui-button secondary" href={href('/transactions', rowScope(row))}>View Transactions</Link> : null}{row.productId && permissions.canViewProducts ? <Link className="ui-button secondary" href={href(`/products/${encodeURIComponent(row.productId)}`)}>View Product</Link> : null}{row.productGroupId && row.productGroupId !== 'ungrouped' && permissions.canViewCogs ? <Link className="ui-button secondary" href={href(`/cogs/groups/${encodeURIComponent(row.productGroupId)}`)}>View Product Group</Link> : null}</div></Drawer>} />}
    {data && kind !== 'p-and-l' ? <p className="report-footnote"><FileBarChart size={14} /><span>{kind === 'expenses' ? data.allocationNote : kind === 'refunds' ? data.refundNote : kind === 'product-profitability' && options.groupBy === 'product-group' ? 'Product Group membership is resolved on each transaction date. Ungrouped includes Products without applicable membership. Direct Product COGS overrides do not change Group identity.' : 'Open a report row to trace its values to canonical Products, Transactions or Expenses. All amounts are reported in GBP.'}</span></p> : null}
  </div>;
}


