'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createColumnHelper, type PaginationState, type SortingState } from '@tanstack/react-table';
import { Ellipsis, PackageSearch } from 'lucide-react';
import type { ProductListItem } from '@/src/domain/models';
import { formatMoney, formatPercentage } from '@/src/domain/calculations';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { useProducts } from '@/src/services/hooks/use-products';
import { useAccess, AccessState } from '@/src/components/rbac/access';
import { StatusIndicator } from '@/src/components/states/states';
import { EnterpriseDataGrid, gridFeatures, type EnterpriseDataGridBulkActionContext } from '@/src/components/tables/enterprise-data-grid';
import { MarketplaceBadge, MoneyValue, PercentageDelta, SectionHeader } from '@/src/components/product/patterns';
import { useToast } from '@/src/components/ui/feedback';

const helper = createColumnHelper<typeof gridFeatures, ProductListItem>();
const EMPTY_PRODUCTS: ProductListItem[] = [];

function SelectionCheckbox({ checked, indeterminate = false, label, onChange }: { checked: boolean; indeterminate?: boolean; label: string; onChange: React.ChangeEventHandler<HTMLInputElement> }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate; }, [indeterminate]);
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} />;
}

export function ProductTableDemo() {
  const { access, query } = useProducts();
  const sensitiveAccess = useAccess('expenses.view_sensitive');
  const { companyNameFor, workspace } = useAnalysisContext();
  const { showToast } = useToast();
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState<SortingState>([]);
  const [search, setSearch] = useState('');
  const columns = useMemo(() => helper.columns([
    helper.display({
      id: 'select', size: 48, enableHiding: false, enableSorting: false,
      header: ({ table }) => <SelectionCheckbox label="Select all products on this page" checked={table.getIsAllPageRowsSelected()} indeterminate={table.getIsSomePageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />,
      cell: ({ row }) => <SelectionCheckbox label={`Select ${row.original.name}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
    }),
    helper.accessor('name', {
      header: 'Product', size: 280, enableHiding: false,
      cell: ({ row, getValue }) => <span className="product-cell"><span className="product-icon"><PackageSearch size={16} /></span><span><strong>{getValue()}</strong><small>{row.original.sku}</small></span></span>,
    }),
    helper.accessor('sku', { header: 'SKU', size: 135, cell: ({ getValue }) => <span className="mono muted">{getValue()}</span> }),
    helper.accessor('netRevenuePence', { header: 'Net revenue', size: 125, cell: ({ getValue }) => <span className="numeric">{formatMoney(getValue())}</span> }),
    helper.accessor('netProfitPence', { header: 'Net profit', size: 120, cell: ({ getValue }) => <MoneyValue pence={getValue()} sensitive allowed={sensitiveAccess.allowed} /> }),
    helper.accessor('marginBps', { header: 'Margin', size: 90, cell: ({ getValue }) => <span className="numeric">{sensitiveAccess.allowed ? formatPercentage(getValue()) : 'Restricted'}</span> }),
    helper.accessor('deltaBps', { header: 'vs prior', size: 100, cell: ({ getValue }) => sensitiveAccess.allowed ? <PercentageDelta bps={getValue()} /> : <span className="muted">Restricted</span> }),
    helper.accessor('cogsStatus', { header: 'COGS', size: 105, cell: ({ getValue }) => getValue() === 'missing' ? <span className="warning-badge">Missing</span> : <StatusIndicator tone="positive" label="Complete" /> }),
    helper.accessor((row) => row.marketplaces[0], { id: 'marketplace', header: 'Marketplace', size: 120, cell: ({ getValue }) => <MarketplaceBadge marketplace={getValue()} /> }),
    helper.accessor((row) => companyNameFor(row.companyId), { id: 'company', header: 'Company', size: 190 }),
  ]), [companyNameFor, sensitiveAccess.allowed]);
  const renderBulkActions = useCallback(({ selectedRows, clearSelection }: EnterpriseDataGridBulkActionContext<ProductListItem>) => <button type="button" onClick={() => { showToast(`${selectedRows.length} products marked for prototype review`, 'info'); clearSelection(); }}>Review selected</button>, [showToast]);
  const renderRowActions = useCallback((row: ProductListItem) => <button type="button" className="grid-row-action" aria-label={`Open actions for ${row.name}`} onClick={() => showToast(`Actions opened for ${row.sku}`, 'info')}><Ellipsis size={15} /></button>, [showToast]);

  if (!access.allowed) return <AccessState decision={access} />;
  const hasSourceRows = Boolean(query.data?.rows.length);
  return <section className="foundation-section"><SectionHeader title="Enterprise data grid" description="A reusable proof of controlled sorting, search and pagination, generic actions, column controls, saved views and permission-aware values." /><EnterpriseDataGrid data={query.data?.rows ?? EMPTY_PRODUCTS} columns={columns} ariaLabel="Product profitability foundation table" exportFileName="product-foundation-demo.csv" savedViewKey={`${workspace.organisation.id}:saved-view:v1:foundation-products`} initialPinnedColumns={['select', 'name']} initialColumnVisibility={{ marketplace: false, company: false }} responsivePriorityColumns={['name', 'netRevenuePence', 'netProfitPence', 'cogsStatus']} pagination={pagination} onPaginationChange={setPagination} sorting={sorting} onSortingChange={setSorting} search={search} onSearchChange={setSearch} renderBulkActions={renderBulkActions} renderRowActions={renderRowActions} loading={query.isPending} error={query.isError ? query.error : null} onRetry={() => { void query.refetch(); }} searchPlaceholder="Search products or SKU" emptyTitle={hasSourceRows ? 'No matching products' : 'No products in this scenario'} emptyDescription={hasSourceRows ? 'Try a different search or analysis scope.' : 'Change the prototype scenario or connect a marketplace account.'} /></section>;
}
