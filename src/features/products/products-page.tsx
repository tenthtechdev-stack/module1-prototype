'use client';

import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import { AlertTriangle, Boxes, PackageSearch } from 'lucide-react';
import type { ProductListItem } from '@/src/domain/models';
import { formatMoney, formatPercentage } from '@/src/domain/calculations';
import { companies } from '@/src/fixtures/data';
import { useProducts } from '@/src/services/hooks/use-products';
import { AccessState, PermissionBoundary } from '@/src/components/rbac/access';
import { EmptyState, ErrorState, StatusIndicator } from '@/src/components/states/states';
import { EnterpriseDataGrid, gridFeatures } from '@/src/components/tables/enterprise-data-grid';

const helper = createColumnHelper<typeof gridFeatures, ProductListItem>();
const productColumns = helper.columns([
  helper.display({
    id: 'select',
    size: 42,
    enableHiding: false,
    enableSorting: false,
    header: ({ table }) => <input type="checkbox" aria-label="Select all products on page" checked={table.getIsAllPageRowsSelected()} onChange={table.getToggleAllPageRowsSelectedHandler()} />,
    cell: ({ row }) => <input type="checkbox" aria-label={`Select ${row.original.name}`} checked={row.getIsSelected()} onChange={row.getToggleSelectedHandler()} />,
  }),
  helper.accessor('name', {
    header: 'Product',
    size: 290,
    enableHiding: false,
    cell: ({ row, getValue }) => <Link className="product-cell" href={`/o/stock-supplies/products/${row.original.id}`}><span className="product-icon"><PackageSearch size={16} /></span><span><strong>{getValue()}</strong><small>{row.original.sku}</small></span></Link>,
  }),
  helper.accessor('sku', { header: 'SKU', size: 145, cell: ({ getValue }) => <span className="mono muted">{getValue()}</span> }),
  helper.accessor('netRevenuePence', { header: 'Net revenue', size: 130, cell: ({ getValue }) => <span className="numeric">{formatMoney(getValue())}</span> }),
  helper.accessor('netProfitPence', { header: 'Net profit', size: 125, cell: ({ getValue }) => <span className="numeric strong">{formatMoney(getValue())}</span> }),
  helper.accessor('marginBps', { header: 'Margin', size: 100, cell: ({ getValue }) => <span className="numeric">{formatPercentage(getValue())}</span> }),
  helper.accessor('deltaBps', { header: 'vs prior', size: 105, cell: ({ getValue }) => <span className={getValue() !== null && getValue()! < 0 ? 'negative-text' : 'positive'}>{formatPercentage(getValue())}</span> }),
  helper.accessor('cogsStatus', { header: 'COGS', size: 115, cell: ({ getValue }) => getValue() === 'missing' ? <span className="warning-badge">Missing</span> : <StatusIndicator tone="positive" label="Complete" /> }),
  helper.accessor((row) => row.marketplaces.join(', '), { id: 'marketplace', header: 'Marketplace', size: 120, cell: ({ getValue }) => <span className="marketplace-badge">{getValue()}</span> }),
  helper.accessor((row) => companies.find((company) => company.id === row.companyId)?.name ?? 'Unknown', { id: 'company', header: 'Company', size: 180 }),
]);

function ProductRowsSkeleton() {
  return <div className="data-panel rows-skeleton" aria-busy="true" aria-label="Loading products"><div className="table-toolbar"><span className="skeleton skeleton-input" /><span className="skeleton skeleton-actions" /></div>{Array.from({ length: 7 }, (_, index) => <div className="skeleton-row" key={index}><span /><span /><span /><span /></div>)}</div>;
}

export function ProductsPage() {
  const { access, query } = useProducts();
  if (!access.allowed) return <AccessState decision={access} />;

  return (
    <div className="feature-page products-page">
      <header className="page-heading"><div><p>Catalogue performance</p><h1>Products</h1><span>Profitability across every authorised product in the current scope.</span></div><div className="page-heading-actions"><StatusIndicator tone={query.isFetching ? 'info' : 'positive'} label={query.isFetching ? 'Refreshing' : 'Repository connected'} /><PermissionBoundary capability="cogs.edit"><button className="primary-button">Add product</button></PermissionBoundary></div></header>
      {query.data?.missingCogs ? <section className="scope-notice"><AlertTriangle size={17} /><div><strong>Profitability is incomplete for {query.data.missingCogs} products</strong><span>Add missing COGS to include them in net profit calculations. Missing cost is never treated as zero.</span></div><Link className="notice-action" href="/o/stock-supplies/cogs">Review missing COGS</Link></section> : null}
      {query.isPending ? <ProductRowsSkeleton /> : query.isError ? <ErrorState onRetry={() => query.refetch()} description={query.error instanceof Error ? query.error.message : undefined} /> : query.data && query.data.rows.length ? <EnterpriseDataGrid data={query.data.rows} columns={productColumns} searchPlaceholder="Search products or SKU" emptyTitle="No matching products" emptyDescription="Try a different product name, SKU, or scope." canExport /> : <EmptyState title="No products in this scope" description="Connect a marketplace or change the active analysis context." />}
      <p className="architecture-note"><Boxes size={14} /> Values are derived from revenue, refunds, COGS, marketplace fees, advertising, shipping, other direct costs and allocated expenses.</p>
    </div>
  );
}
