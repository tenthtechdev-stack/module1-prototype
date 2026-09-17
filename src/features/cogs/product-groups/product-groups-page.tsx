'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { createColumnHelper, type PaginationState } from '@tanstack/react-table';
import { ArrowRight, Boxes, Layers3, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState } from '@/src/components/rbac/access';
import { EmptyState, ErrorState } from '@/src/components/states/states';
import { EnterpriseDataGrid, gridFeatures } from '@/src/components/tables/enterprise-data-grid';
import { MarketplaceBadge, PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Badge, type Tone } from '@/src/components/ui/feedback';
import { Select } from '@/src/components/ui/forms';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { formatDate, formatInteger, formatMoney } from '@/src/domain/calculations';
import type { ProductGroupCogsStatus, ProductGroupListItem, ProductGroupStatus } from '@/src/domain/product-groups';
import { useProductGroups } from '@/src/services/hooks/use-product-groups';
import { CogsSubNavigation } from './cogs-sub-navigation';

type GroupGridRow = ProductGroupListItem & { id: string };
type GroupStatusFilter = ProductGroupCogsStatus | ProductGroupStatus | 'all';

const columnHelper = createColumnHelper<typeof gridFeatures, GroupGridRow>();
const EMPTY_ROWS: GroupGridRow[] = [];

function statusLabel(status: ProductGroupCogsStatus) {
  if (status === 'missing') return 'Missing COGS';
  if (status === 'scheduled') return 'Scheduled';
  return 'Complete';
}

function statusTone(status: ProductGroupCogsStatus): Tone {
  if (status === 'complete') return 'positive';
  if (status === 'scheduled') return 'info';
  return 'warning';
}

function formatUnitRatio(row: ProductGroupListItem) {
  if (!row.baseUnitCost || row.baseUnitCost.denominator <= 0) return 'Missing';
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: row.currentCost?.currency ?? row.group.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(row.baseUnitCost.numeratorMinor / row.baseUnitCost.denominator / 100);
}

export function ProductGroupsPage() {
  const { workspace, context, authorisedCompanies, authorisedAccounts, setCompany } = useAnalysisContext();
  const [search, setSearch] = useState('');
  const [marketplace, setMarketplace] = useState<'all' | 'amazon' | 'ebay' | 'temu'>('all');
  const [accountId, setAccountId] = useState('all');
  const [status, setStatus] = useState<GroupStatusFilter>('all');
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const groups = useProductGroups({
    search,
    companyId: context.companyId,
    marketplace,
    marketplaceAccountId: accountId,
    status,
    page: pagination.pageIndex,
    pageSize: pagination.pageSize,
  });
  const orgSlug = workspace.organisation.slug;
  const rows = useMemo(() => groups.query.data?.rows.map((row) => ({ ...row, id: row.group.id })) ?? EMPTY_ROWS, [groups.query.data?.rows]);

  const columns = useMemo(() => columnHelper.columns([
    columnHelper.accessor((row) => row.group.name, {
      id: 'groupName', header: 'Group Name', size: 220, enableHiding: false,
      cell: ({ row }) => <Link className="product-group-name-cell" href={`/o/${orgSlug}/cogs/groups/${encodeURIComponent(row.original.group.id)}`}><span><Layers3 size={15} /></span><span><strong>{row.original.group.name}</strong><small>{row.original.group.description}</small></span></Link>,
    }),
    columnHelper.accessor('companyName', { id: 'company', header: 'Company', size: 175 }),
    columnHelper.accessor((row) => row.group.baseProduct.title, {
      id: 'baseProduct', header: 'Base Product', size: 200,
      cell: ({ row }) => <span className="product-group-base-product"><strong>{row.original.group.baseProduct.title}</strong><small className="mono">{row.original.group.baseProduct.internalSku}</small></span>,
    }),
    columnHelper.accessor((row) => row.currentCost?.baseQuantity ?? row.group.baseQuantity, { id: 'baseQuantity', header: 'Base Quantity', size: 118, cell: ({ row, getValue }) => <span className="numeric">{formatInteger(getValue())} {row.original.group.unitOfMeasure}</span> }),
    columnHelper.accessor((row) => row.currentCost?.baseCostMinor ?? null, { id: 'currentBaseCost', header: 'Current Base Cost', size: 135, cell: ({ row, getValue }) => getValue() === null ? <Badge tone="warning">Missing</Badge> : <strong className="numeric">{formatMoney(getValue(), row.original.currentCost?.currency ?? row.original.group.currency)}</strong> }),
    columnHelper.accessor((row) => row.baseUnitCost?.numeratorMinor ?? null, { id: 'baseUnitCost', header: 'Base Unit Cost', size: 120, cell: ({ row }) => <span className="numeric">{formatUnitRatio(row.original)}</span> }),
    columnHelper.accessor('memberCount', { id: 'productCount', header: 'Products / SKUs', size: 115, cell: ({ getValue }) => <span className="numeric">{formatInteger(getValue())}</span> }),
    columnHelper.accessor('listingCount', { id: 'listingCount', header: 'Listings', size: 92, cell: ({ getValue }) => <span className="numeric">{formatInteger(getValue())}</span> }),
    columnHelper.accessor((row) => row.marketplaces.join(', '), { id: 'marketplaces', header: 'Marketplaces', size: 145, enableSorting: false, cell: ({ row }) => <span className="product-group-marketplaces">{row.original.marketplaces.map((item) => <MarketplaceBadge key={item} marketplace={item} />)}</span> }),
    columnHelper.accessor('effectiveFrom', { id: 'effectiveFrom', header: 'Effective From', size: 122, cell: ({ getValue }) => getValue() ? formatDate(getValue() as string) : '—' }),
    columnHelper.accessor('cogsStatus', { id: 'cogsStatus', header: 'COGS Status', size: 120, cell: ({ getValue }) => <Badge tone={statusTone(getValue())}>{statusLabel(getValue())}</Badge> }),
    columnHelper.accessor((row) => row.group.updatedAt, { id: 'lastUpdated', header: 'Last Updated', size: 116, cell: ({ getValue }) => formatDate(getValue()) }),
    columnHelper.accessor((row) => row.group.updatedByName, { id: 'updatedBy', header: 'Updated By', size: 145 }),
  ]), [orgSlug]);

  if (!groups.access.allowed) return <AccessState decision={groups.access} />;
  if (groups.marketplaceState === 'no-authorised') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;

  return <div className="cogs-page product-groups-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'COGS', href: `/o/${orgSlug}/cogs` }, { label: 'Product Groups' }]} />
    <PageHeader eyebrow="Inherited COGS" title="Product Groups" description="Manage Company-scoped costing groups without changing the company-owned Product catalogue." actions={groups.permissions.canEdit ? <Link className="ui-button primary compact" href={`/o/${orgSlug}/cogs/groups/new${context.companyId !== 'all' ? `?company=${encodeURIComponent(context.companyId)}` : ''}`}><Plus size={14} /> Create Product Group</Link> : <Badge>Read only</Badge>} />
    <CogsSubNavigation orgSlug={orgSlug} active="groups" companyId={context.companyId} />
    <section className="product-group-summary" aria-label="Product Group summary">
      <article><span><Layers3 size={16} /></span><div><small>Product Groups</small><strong>{formatInteger(groups.query.data?.total ?? 0)}</strong><em>In authorised scope</em></div></article>
      <article><span><Boxes size={16} /></span><div><small>Linked Products</small><strong>{formatInteger(rows.reduce((sum, row) => sum + row.memberCount, 0))}</strong><em>Effective-dated membership</em></div></article>
      <article className={rows.some((row) => row.cogsStatus === 'missing') ? 'attention' : undefined}><span><ShieldCheck size={16} /></span><div><small>Cost health</small><strong>{rows.filter((row) => row.cogsStatus === 'complete').length} complete</strong><em>{rows.filter((row) => row.cogsStatus === 'missing').length} missing cost</em></div></article>
    </section>
    <section className="product-group-copilot-suggestion" aria-label="Copilot Product Group suggestion">
      <span><Sparkles size={17} /></span>
      <div><span className="eyebrow">Copilot suggestion · no changes applied</span><h2>Disposable glove variants appear to share a purchasing basis</h2><p>Likely Group: <b>Disposable Gloves</b>. Possible Pack Quantities found in Product titles and listings:</p><span><small>25 units</small><small>50 units</small><small>100 units</small><small>Confidence: review required</small></span></div>
      <aside><Badge tone="info">Suggestion only</Badge><small>Copilot cannot create the Group, attach Products, decide quantities or costs, or approve a financial change.</small><Link className="ui-button secondary compact" href={`/o/${orgSlug}/cogs/groups/new${context.companyId !== 'all' ? `?company=${encodeURIComponent(context.companyId)}` : ''}`}>Review manually <ArrowRight size={13} /></Link></aside>
    </section>
    <section className="cogs-filter-bar product-group-filter-bar" aria-label="Product Group filters">
      <label><span>Company</span><Select value={context.companyId} onChange={(event) => { setPagination((current) => ({ ...current, pageIndex: 0 })); setCompany(event.target.value); }}><option value="all">All authorised companies</option>{authorisedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select></label>
      <label><span>Marketplace</span><Select value={marketplace} onChange={(event) => { setMarketplace(event.target.value as typeof marketplace); setAccountId('all'); setPagination((current) => ({ ...current, pageIndex: 0 })); }}><option value="all">All marketplaces</option><option value="amazon">Amazon</option><option value="ebay">eBay</option><option value="temu">Temu</option></Select></label>
      <label><span>Account</span><Select value={accountId} onChange={(event) => { setAccountId(event.target.value); setPagination((current) => ({ ...current, pageIndex: 0 })); }}><option value="all">All matching accounts</option>{authorisedAccounts.filter((account) => marketplace === 'all' || account.marketplace === marketplace).map((account) => <option key={account.id} value={account.id}>{account.displayName}</option>)}</Select></label>
      <label><span>Status</span><Select value={status} onChange={(event) => { setStatus(event.target.value as GroupStatusFilter); setPagination((current) => ({ ...current, pageIndex: 0 })); }}><option value="all">All statuses</option><option value="complete">Complete</option><option value="missing">Missing COGS</option><option value="scheduled">Scheduled</option><option value="active">Active Group</option><option value="inactive">Inactive Group</option></Select></label>
      <Button variant="ghost" size="compact" onClick={() => { setSearch(''); setMarketplace('all'); setAccountId('all'); setStatus('all'); setPagination((current) => ({ ...current, pageIndex: 0 })); }}>Clear</Button>
    </section>
    <EnterpriseDataGrid
      data={rows}
      columns={columns}
      ariaLabel="Product Groups"
      exportFileName="product-groups.csv"
      initialPinnedColumns={['groupName']}
      responsivePriorityColumns={['groupName', 'currentBaseCost', 'baseUnitCost', 'productCount', 'cogsStatus']}
      search={search}
      onSearchChange={(updater) => { setSearch((current) => String(typeof updater === 'function' ? updater(current) : updater)); setPagination((current) => ({ ...current, pageIndex: 0 })); }}
      searchPlaceholder="Search Group name, Base Product or SKU"
      pagination={pagination}
      onPaginationChange={(updater) => setPagination((current) => typeof updater === 'function' ? updater(current) : updater)}
      manualPagination
      manualFiltering
      rowCount={groups.query.data?.total ?? 0}
      pageCount={groups.query.data?.pageCount ?? 0}
      loading={groups.query.isPending}
      error={groups.query.isError ? groups.query.error : null}
      onRetry={() => { void groups.query.refetch(); }}
      errorState={<ErrorState title="Product Groups could not be loaded" description="No costs or memberships were changed. Retry the query." onRetry={() => { void groups.query.refetch(); }} />}
      emptyState={<EmptyState title="No Product Groups match this view" description={search || status !== 'all' || marketplace !== 'all' || accountId !== 'all' ? 'Clear the search or filters to return to all authorised Product Groups.' : 'Create a Company-scoped Product Group to share an effective-dated base cost across pack sizes.'} actions={!search && status === 'all' && groups.permissions.canEdit ? <Link className="ui-button primary compact" href={`/o/${orgSlug}/cogs/groups/new`}>Create Product Group</Link> : undefined} />}
      canExport={groups.permissions.canView}
    />
    <p className="cogs-governance-note"><ShieldCheck size={14} /> Direct Product COGS takes precedence from its own effective date. Group membership remains available for analytics and never rewrites historical profitability.</p>
  </div>;
}
