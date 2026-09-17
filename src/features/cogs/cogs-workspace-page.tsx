'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from 'react';
import { createColumnHelper, type PaginationState } from '@tanstack/react-table';
import { CalendarClock, ClipboardPaste, FileSpreadsheet, History, MoreHorizontal, Percent, Plus, Store } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { EmptyState, ErrorState } from '@/src/components/states/states';
import { EnterpriseDataGrid, gridFeatures } from '@/src/components/tables/enterprise-data-grid';
import { MarketplaceBadge, PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Badge, Skeleton, useToast, type Tone } from '@/src/components/ui/feedback';
import { Select } from '@/src/components/ui/forms';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { DropdownMenu } from '@/src/components/ui/overlays';
import { cogsChangeBps, cogsSourceLabel, type CogsWorkspaceRow, type CogsWorkspaceStatus, type CogsWorkspaceSummary } from '@/src/domain/cogs';
import { formatDate, formatInteger, formatMoney, formatPercentage } from '@/src/domain/calculations';
import { ProductThumbnail } from '@/src/features/products/product-thumbnail';
import { BulkCostEditor, CogsHistoryDrawer, PasteCostsModal, PercentageAdjustmentModal, SingleCostDrawer } from '@/src/features/cogs/cogs-edit-flows';
import { CogsSubNavigation } from '@/src/features/cogs/product-groups/cogs-sub-navigation';
import { useCogsWorkspace } from '@/src/services/hooks/use-cogs';

const columnHelper = createColumnHelper<typeof gridFeatures, CogsWorkspaceRow>();
const EMPTY_ROWS: CogsWorkspaceRow[] = [];

function SelectionCheckbox({ checked, indeterminate = false, label, onChange }: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />;
}

function statusLabel(status: CogsWorkspaceStatus) {
  if (status === 'partial_history') return 'Partial history';
  if (status === 'needs_review') return 'Needs review';
  if (status === 'pending_approval') return 'Pending approval';
  return status[0].toUpperCase() + status.slice(1);
}

function statusTone(status: CogsWorkspaceStatus): Tone {
  if (status === 'complete') return 'positive';
  if (status === 'missing') return 'negative';
  if (status === 'pending_approval') return 'info';
  return 'warning';
}

function CogsSummary({ summary, loading, onFilter }: { summary?: CogsWorkspaceSummary; loading: boolean; onFilter: (status: CogsWorkspaceStatus | 'all') => void }) {
  if (loading || !summary) return <section className="cogs-summary-strip loading" aria-label="Loading COGS summary" aria-busy="true">{Array.from({ length: 6 }, (_, index) => <article key={index}><Skeleton /><Skeleton /></article>)}</section>;
  const items = [
    { label: 'Products', value: formatInteger(summary.products), detail: 'In authorised scope', status: 'all' as const },
    { label: 'COGS complete', value: formatInteger(summary.complete), detail: 'Valid current cost', status: 'complete' as const },
    { label: 'COGS missing', value: formatInteger(summary.missing), detail: 'No approved current cost', status: 'missing' as const, attention: summary.missing > 0 },
    { label: 'Product coverage', value: formatPercentage(summary.productCoverageBps), detail: 'Product-count coverage', status: 'all' as const },
    { label: 'Needs review', value: formatInteger(summary.needsReview + summary.pendingApproval), detail: `${summary.pendingApproval} pending approval`, status: 'pending_approval' as const, attention: summary.needsReview + summary.pendingApproval > 0 },
    { label: 'Profitability coverage', value: formatPercentage(summary.profitabilityCoverageBps), detail: 'Revenue weighted', status: 'all' as const },
  ];
  return <section className="cogs-summary-strip" aria-label="COGS status summary">{items.map((item) => <button type="button" key={item.label} className={item.attention ? 'attention' : undefined} onClick={() => onFilter(item.status)}><small>{item.label}</small><strong>{item.value}</strong><span>{item.detail}</span></button>)}</section>;
}

function canonicalStatus(value: string | null): CogsWorkspaceStatus | 'all' {
  return value === 'complete' || value === 'missing' || value === 'partial_history' || value === 'needs_review' || value === 'pending_approval' ? value : 'all';
}

export function CogsWorkspacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedStatus = searchParams.get('status');
  const { workspace, context, authorisedCompanies, setCompany } = useAnalysisContext();
  const { showToast } = useToast();
  const marketplaceManagement = useAccess('marketplaces.manage');
  const status = canonicalStatus(requestedStatus);
  const source = searchParams.get('source') ?? 'all';
  const requestedEffectiveDate = searchParams.get('effective');
  const effectiveDate: 'all' | 'current' | 'future' | 'historical' = requestedEffectiveDate === 'current' || requestedEffectiveDate === 'future' || requestedEffectiveDate === 'historical' ? requestedEffectiveDate : 'all';
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [actionRows, setActionRows] = useState<CogsWorkspaceRow[]>([]);
  const cogs = useCogsWorkspace({ search, status, source, effectiveDate, page: pagination.pageIndex, pageSize: pagination.pageSize });
  const rows = cogs.query.data?.rows ?? EMPTY_ROWS;
  const allRows = cogs.query.data?.allRows ?? EMPTY_ROWS;
  const orgSlug = workspace.organisation.slug;
  const action = searchParams.get('action');
  const productId = searchParams.get('product');
  const requestedProductIds = (searchParams.get('products') ?? '').split(',').filter(Boolean);
  const activeRow = allRows.find((row) => row.id === productId) ?? null;

  function updateUrl(values: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    router.replace(`${window.location.pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  function setStatus(value: CogsWorkspaceStatus | 'all') {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    updateUrl({ status: value === 'all' ? null : value });
  }
  function openAction(nextAction: 'edit' | 'history' | 'bulk' | 'percentage' | 'paste', row?: CogsWorkspaceRow) {
    updateUrl({ action: nextAction, product: row?.id ?? null });
  }
  function closeAction() { updateUrl({ action: null, product: null, products: null }); }
  function sameCompanyRows(selected: CogsWorkspaceRow[], notify = true) {
    const companyId = selected[0]?.product.ownerCompanyId;
    const scoped = selected.filter((row) => row.product.ownerCompanyId === companyId);
    if (notify && selected.length !== scoped.length) showToast('Bulk proposals are Company-scoped. Products outside the first selected Company were left out.', 'warning');
    return scoped;
  }
  function openBulk(kind: 'bulk' | 'percentage', selected: CogsWorkspaceRow[]) {
    setActionRows(sameCompanyRows(selected));
    openAction(kind);
  }

  const columns = useMemo(() => columnHelper.columns([
    ...(cogs.permissions.canEdit ? [columnHelper.display({
      id: 'select', size: 44, enableHiding: false, enableSorting: false,
      header: ({ table }) => <SelectionCheckbox label="Select all Products on this page" checked={table.getIsAllPageRowsSelected()} indeterminate={table.getIsSomePageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />,
      cell: ({ row }) => <SelectionCheckbox label={`Select ${row.original.product.title}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
    })] : []),
    columnHelper.accessor((row) => row.product.title, {
      id: 'product', header: 'Product', size: 270, enableHiding: false,
      cell: ({ row }) => <Link className="product-cell" href={`/o/${orgSlug}/products/${encodeURIComponent(row.original.id)}?tab=costs`}><ProductThumbnail category={row.original.product.category} /><span><strong>{row.original.product.title}</strong><small>{row.original.product.internalSku}</small></span></Link>,
    }),
    columnHelper.accessor((row) => row.product.internalSku, { id: 'internalSku', header: 'Internal SKU', size: 135, cell: ({ getValue }) => <span className="mono muted">{getValue()}</span> }),
    columnHelper.accessor('companyName', { id: 'company', header: 'Company', size: 175 }),
    columnHelper.accessor((row) => row.product.marketplaces.join(', '), { id: 'marketplaces', header: 'Marketplaces', size: 150, enableSorting: false, cell: ({ row }) => <span className="cogs-marketplaces">{row.original.product.marketplaces.map((marketplace) => <MarketplaceBadge key={marketplace} marketplace={marketplace} />)}</span> }),
    columnHelper.accessor((row) => row.current?.unitCostMinor ?? null, { id: 'currentCogs', header: 'Current COGS', size: 145, cell: ({ row }) => <span className="cogs-current-cell"><strong className="numeric">{row.original.current ? formatMoney(row.original.current.unitCostMinor, row.original.current.currency) : 'Missing'}</strong>{row.original.pendingBatchId ? <Link href={`/o/${orgSlug}/cogs/import/${encodeURIComponent(row.original.pendingBatchId)}`}><Badge tone="info">{row.original.pendingUnitCostMinor === undefined ? 'Pending change' : `${formatMoney(row.original.pendingUnitCostMinor, row.original.current?.currency ?? 'GBP')} proposed`}</Badge></Link> : row.original.scheduled ? <Badge tone="info">Scheduled {formatDate(row.original.scheduled.effectiveFrom)}</Badge> : null}</span> }),
    columnHelper.accessor((row) => row.current?.currency ?? null, { id: 'currency', header: 'Currency', size: 86, enableSorting: false, cell: ({ getValue }) => getValue() ?? '—' }),
    columnHelper.accessor((row) => row.current?.effectiveFrom ?? null, { id: 'effectiveFrom', header: 'Effective from', size: 128, cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '—' }),
    columnHelper.accessor((row) => row.previous?.unitCostMinor ?? null, { id: 'previousCogs', header: 'Previous COGS', size: 120, cell: ({ row }) => row.original.previous ? <span className="numeric">{formatMoney(row.original.previous.unitCostMinor, row.original.previous.currency)}</span> : '—' }),
    columnHelper.accessor((row) => cogsChangeBps(row.previous?.unitCostMinor, row.current?.unitCostMinor), { id: 'change', header: 'Change', size: 90, cell: ({ getValue }) => getValue() === null ? '—' : <span className={(getValue() as number) > 0 ? 'delta negative' : 'delta positive'}>{formatPercentage(getValue() as number, { signed: true })}</span> }),
    columnHelper.accessor((row) => row.current ? cogsSourceLabel(row.current.source) : '—', { id: 'source', header: 'Source', size: 155 }),
    columnHelper.accessor('status', { id: 'cogsStatus', header: 'COGS status', size: 138, cell: ({ getValue }) => <Badge tone={statusTone(getValue())}>{statusLabel(getValue())}</Badge> }),
    columnHelper.accessor((row) => row.product.profitabilityCoverageBps, { id: 'profitabilityCoverage', header: 'Profit coverage', size: 122, cell: ({ getValue }) => <span className="numeric">{formatPercentage(getValue())}</span> }),
    columnHelper.accessor((row) => row.current?.createdAt ?? null, { id: 'lastChanged', header: 'Last changed', size: 120, cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '—' }),
    columnHelper.accessor((row) => row.current?.createdByName ?? '—', { id: 'changedBy', header: 'Changed by', size: 145 }),
  ]), [cogs.permissions.canEdit, orgSlug]);

  if (!cogs.access.allowed) return <AccessState decision={cogs.access} />;
  if (cogs.marketplaceState === 'no-authorised') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;
  if (cogs.marketplaceState === 'none-connected') return <div className="cogs-page"><Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'COGS' }]} /><PageHeader eyebrow="Cost management" title="COGS" description="Controlled, effective-dated unit costs for company-owned Products." /><section className="cogs-empty-state"><Store size={25} /><h2>No Products available for COGS setup.</h2><p>Connect and sync a marketplace first.</p>{marketplaceManagement.allowed ? <Link className="ui-button primary compact" href={`/o/${orgSlug}/admin/marketplace-accounts`}>Connect marketplace</Link> : null}</section></div>;

  const importHref = `/o/${orgSlug}/cogs/import${context.companyId !== 'all' ? `?company=${encodeURIComponent(context.companyId)}` : ''}`;
  const defaultActionRows = sameCompanyRows(rows.slice(0, 12), false);
  const deepLinkedRows = sameCompanyRows(allRows.filter((row) => requestedProductIds.includes(row.id)), false);
  const modalRows = actionRows.length ? actionRows : deepLinkedRows;
  return <div className="cogs-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'COGS' }]} />
    <PageHeader eyebrow="Cost management" title="COGS" description="Maintain approved current and historical Product costs without overwriting financial history." actions={<div className="cogs-header-actions">
      {cogs.permissions.canImport ? <Button size="compact" onClick={() => openAction('paste')}><ClipboardPaste size={14} /> Paste from Excel</Button> : null}
      {cogs.permissions.canEdit ? <Button size="compact" onClick={() => { setActionRows(defaultActionRows); openAction('bulk'); }}><Plus size={14} /> Bulk update</Button> : null}
      {cogs.permissions.canImport ? <Link className="ui-button primary compact" href={importHref}><FileSpreadsheet size={14} /> Import costs</Link> : null}
    </div>} />
    <CogsSummary summary={cogs.query.data?.summary} loading={cogs.query.isPending} onFilter={setStatus} />
    <section className="cogs-filter-bar" aria-label="COGS filters">
      <label><span>Company</span><Select value={context.companyId} onChange={(event) => { setPagination((current) => ({ ...current, pageIndex: 0 })); setCompany(event.target.value); }}><option value="all">All authorised companies</option>{authorisedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select></label>
      <label><span>COGS status</span><Select value={status} onChange={(event) => setStatus(event.target.value as CogsWorkspaceStatus | 'all')}><option value="all">All statuses</option><option value="complete">Complete</option><option value="missing">Missing</option><option value="partial_history">Partial history</option><option value="needs_review">Needs review</option><option value="pending_approval">Pending approval</option></Select></label>
      <label><span>Source</span><Select value={source} onChange={(event) => { const value = event.target.value; setPagination((current) => ({ ...current, pageIndex: 0 })); updateUrl({ source: value === 'all' ? null : value }); }}><option value="all">All sources</option><option value="initial-import">Initial import</option><option value="csv-import">CSV import</option><option value="excel-import">Excel import</option><option value="paste">Paste from Excel</option><option value="bulk-edit">Bulk update</option><option value="single-edit">Single edit</option><option value="percentage-adjustment">Percentage adjustment</option></Select></label>
      <label><span>Effective date</span><Select value={effectiveDate} onChange={(event) => { const value = event.target.value as typeof effectiveDate; setPagination((current) => ({ ...current, pageIndex: 0 })); updateUrl({ effective: value === 'all' ? null : value }); }}><option value="all">Any date</option><option value="current">Effective today</option><option value="future">Future scheduled</option><option value="historical">Has history</option></Select></label>
      <Button variant="ghost" size="compact" onClick={() => { setSearch(''); setPagination((current) => ({ ...current, pageIndex: 0 })); updateUrl({ status: null, source: null, effective: null }); }}>Clear</Button>
    </section>
    <CogsSubNavigation orgSlug={orgSlug} active={status === 'pending_approval' ? 'pending' : 'current'} companyId={context.companyId} pendingCount={cogs.query.data?.summary.pendingApproval} />
    <EnterpriseDataGrid
      data={rows}
      columns={columns}
      ariaLabel="Current approved Product COGS"
      exportFileName="current-product-cogs.csv"
      initialPinnedColumns={cogs.permissions.canEdit ? ['select', 'product'] : ['product']}
      responsivePriorityColumns={['product', 'currentCogs', 'effectiveFrom', 'cogsStatus', 'actions']}
      pagination={pagination}
      onPaginationChange={(updater) => setPagination((current) => typeof updater === 'function' ? updater(current) : updater)}
      manualPagination
      manualFiltering
      rowCount={cogs.query.data?.total ?? 0}
      pageCount={cogs.query.data?.pageCount ?? 0}
      search={search}
      onSearchChange={(updater) => setSearch((current) => String(typeof updater === 'function' ? updater(current) : updater))}
      loading={cogs.query.isPending}
      error={cogs.query.isError ? cogs.query.error : null}
      onRetry={() => { void cogs.query.refetch(); }}
      errorState={<ErrorState title="COGS data could not be loaded" description="Approved Product cost history remains unchanged. Retry the query." onRetry={() => { void cogs.query.refetch(); }} />}
      emptyState={<EmptyState title={search || status !== 'all' || source !== 'all' || effectiveDate !== 'all' ? 'No COGS records match this view' : 'No product costs have been added yet'} description={search || status !== 'all' || source !== 'all' || effectiveDate !== 'all' ? 'Clear the search or filters to return to the current approved cost list.' : 'Import a cost file, paste from Excel, bulk edit Products, or add costs individually.'} actions={!search && status === 'all' && cogs.permissions.canImport ? <Link className="ui-button primary compact" href={importHref}>Import costs</Link> : undefined} />}
      searchPlaceholder="Search Product, internal SKU, marketplace SKU or identifier"
      renderBulkActions={({ selectedRows }) => cogs.permissions.canEdit ? <><Button size="compact" onClick={() => openBulk('bulk', selectedRows)}><Plus size={13} /> Edit {selectedRows.length}</Button><Button size="compact" onClick={() => openBulk('percentage', selectedRows)}><Percent size={13} /> Percentage adjustment</Button><Button size="compact" onClick={() => openBulk('bulk', selectedRows)}><CalendarClock size={13} /> Set effective date</Button></> : null}
      renderRowActions={(row) => <DropdownMenu label={<MoreHorizontal size={16} />} accessibleLabel={`Actions for ${row.product.title}`} items={[
        { label: 'View cost history', onSelect: () => openAction('history', row) },
        ...(cogs.permissions.canEdit ? [{ label: row.current ? 'Update COGS' : 'Add COGS', onSelect: () => openAction('edit', row) }] : []),
        ...(row.pendingBatchId ? [{ label: 'Open pending proposal', onSelect: () => router.push(`/o/${orgSlug}/cogs/import/${encodeURIComponent(row.pendingBatchId!)}`) }] : []),
      ]} />}
      virtualize
    />
    {cogs.query.data?.recentImports.length ? <section className="cogs-recent-imports" aria-label="Recent COGS imports"><div><span className="eyebrow">Recent governed activity</span><h2>Imports and proposals</h2></div>{cogs.query.data.recentImports.slice(0, 3).map((batch) => <Link key={batch.id} href={`/o/${orgSlug}/cogs/import/${encodeURIComponent(batch.id)}`}><FileSpreadsheet size={16} /><span><strong>{batch.fileName}</strong><small>{batch.createdByName} · {formatDate(batch.updatedAt)}</small></span><Badge tone={batch.status === 'applied' ? 'positive' : batch.status === 'failed' ? 'negative' : batch.status === 'awaiting-approval' ? 'info' : 'warning'}>{batch.status.replaceAll('-', ' ')}</Badge></Link>)}</section> : null}
    <p className="cogs-governance-note"><History size={14} /> Current COGS is today’s approved Product cost. Historical profitability continues to use the cost effective on each transaction date; draft proposals are excluded.</p>
    {action === 'edit' && cogs.permissions.canEdit && activeRow ? <SingleCostDrawer row={activeRow} open orgSlug={orgSlug} onClose={closeAction} /> : null}
    {action === 'history' && activeRow ? <CogsHistoryDrawer row={activeRow} open orgSlug={orgSlug} onClose={closeAction} /> : null}
    {action === 'bulk' && cogs.permissions.canEdit && (modalRows.length > 0 || requestedProductIds.length === 0) ? <BulkCostEditor key={modalRows.map((row) => row.id).join(':')} rows={modalRows} open orgSlug={orgSlug} onClose={closeAction} /> : null}
    {action === 'percentage' && cogs.permissions.canEdit && (modalRows.length > 0 || requestedProductIds.length === 0) ? <PercentageAdjustmentModal key={modalRows.map((row) => row.id).join(':')} rows={modalRows} open orgSlug={orgSlug} onClose={closeAction} /> : null}
    {action === 'paste' && cogs.permissions.canImport ? <PasteCostsModal open orgSlug={orgSlug} defaultCompanyId={context.companyId === 'all' ? undefined : context.companyId} sampleRows={allRows} onClose={closeAction} /> : null}
  </div>;
}
