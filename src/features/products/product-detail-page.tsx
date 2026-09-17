'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CircleDollarSign, Download, Info, Sparkles, Store, Wrench } from 'lucide-react';
import type { QueryObserverResult } from '@tanstack/react-query';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { Button } from '@/src/components/ui/actions';
import { Alert, Skeleton } from '@/src/components/ui/feedback';
import { EmptyState, ErrorState } from '@/src/components/states/states';
import { MarketplaceBadge } from '@/src/components/product/patterns';
import { formatMoney } from '@/src/domain/calculations';
import type { AccessDecision } from '@/src/domain/permissions';
import type {
  ProductActivityResult,
  ProductCostHistory,
  ProductDetailOverview,
  ProductListingsResult,
  ProductProfitabilityDetail,
  ProductTrendResult,
} from '@/src/domain/products';
import {
  useProduct,
  useProductActivity,
  useProductCosts,
  useProductListings,
  useProductProfitability,
  useProductTrend,
} from '@/src/services/hooks/use-products';
import { ProductThumbnail } from '@/src/features/products/product-thumbnail';
import {
  ProductActivityPanel,
  ProductCostsPanel,
  ProductMarketplacePanel,
  ProductOverviewPanel,
  ProductProfitabilityPanel,
  ProductTrendsPanel,
} from '@/src/features/products/product-detail-sections';
import { ProductTransactionPreview } from '@/src/features/transactions/product-transaction-preview';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'costs', label: 'Costs' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'transactions', label: 'Transactions' },
  { id: 'trends', label: 'Trends' },
  { id: 'activity', label: 'Activity' },
] as const;

type ProductTab = (typeof TABS)[number]['id'];

function isProductTab(value: string | null): value is ProductTab {
  return TABS.some((tab) => tab.id === value);
}

function formatPriceRange(overview: ProductDetailOverview) {
  const { minimumMinor, maximumMinor, currency } = overview.priceRange;
  if (minimumMinor === null || maximumMinor === null) return 'Unavailable';
  if (minimumMinor === maximumMinor) return formatMoney(minimumMinor, currency);
  return `${formatMoney(minimumMinor, currency)}–${formatMoney(maximumMinor, currency)}`;
}

function downloadProduct(overview: ProductDetailOverview) {
  const rows = [
    ['Internal Product ID', overview.product.id],
    ['Internal SKU', overview.product.internalSku],
    ['Product Title', overview.product.title],
    ['Company', overview.companies.map((company) => company.name).join(' | ')],
    ['Marketplaces', overview.marketplaces.join(' | ')],
    ['Active Listings', overview.activeListingCount],
    ['Revenue GBP Minor', overview.selectedPeriod.revenueMinor],
    ['Units', overview.selectedPeriod.units],
    ['Current COGS GBP Minor', overview.currentCogs?.unitCost.amountMinor ?? ''],
    ['Known Net Profit GBP Minor', overview.selectedPeriod.knownNetProfitMinor ?? ''],
    ['Margin Bps', overview.selectedPeriod.knownMarginBps ?? ''],
    ['Profitability Coverage Bps', overview.selectedPeriod.profitabilityCoverageBps],
    ['COGS Status', overview.cogsStatus],
  ];
  const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${overview.product.internalSku}-product-summary.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ProductDetailLoading() {
  return <div className="product-detail-page" aria-busy="true" aria-label="Loading product"><section className="product-detail-header"><div className="product-detail-identity"><Skeleton className="product-detail-thumb-skeleton" /><div><Skeleton className="skeleton-title" /><Skeleton className="skeleton-subtitle" /></div></div></section><section className="product-detail-tabs"><div className="product-section-loading"><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div></section></div>;
}

function ProductSectionLoading({ label }: { label: string }) {
  return <div className="product-section-loading" role="status" aria-label={`Loading ${label}`}><Skeleton /><Skeleton /><Skeleton /><Skeleton /></div>;
}

function SectionDenied({ decision }: { decision: AccessDecision }) {
  return decision.allowed ? null : <AccessState decision={decision} />;
}

function SectionError({ title, query }: { title: string; query: Pick<QueryObserverResult<unknown, Error>, 'error' | 'refetch'> }) {
  return <ErrorState title={`${title} could not be loaded`} description={query.error instanceof Error ? query.error.message : 'Retry this section without leaving the product.'} onRetry={() => { void query.refetch(); }} />;
}

function NoMarketplaceProductDetail({ orgSlug, canManage }: { orgSlug: string; canManage: boolean }) {
  return <section className="products-empty-state" role="status"><span><Store size={22} /></span><h2>No marketplace products yet</h2><p>Connect Amazon, eBay or Temu to import internal products and their source listings.</p>{canManage ? <Link className="primary-button" href={`/o/${orgSlug}/admin/marketplace-accounts`}>Connect marketplace</Link> : <small>Ask an organisation administrator to connect a marketplace account.</small>}</section>;
}

export function ProductDetailPage({ productId }: { productId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace, context, companyNameFor, accountNameFor } = useAnalysisContext();
  const requestedTab = searchParams.get('tab');
  const activeTab: ProductTab = isProductTab(requestedTab) ? requestedTab : 'overview';
  const product = useProduct(productId);
  const profitability = useProductProfitability(productId, { enabled: activeTab === 'profitability' });
  const costs = useProductCosts(productId, { enabled: activeTab === 'costs' });
  const listings = useProductListings(productId, { enabled: activeTab === 'overview' || activeTab === 'marketplace' });
  const trends = useProductTrend(productId, { enabled: activeTab === 'trends' });
  const activity = useProductActivity(productId, { enabled: activeTab === 'activity' });
  const cogsEdit = useAccess('cogs.edit');
  const cogsView = useAccess('cogs.view');
  const marketplaceManagement = useAccess('marketplaces.manage');
  const copilotAccess = useAccess('copilot.use');
  const profitabilityAccess = useAccess('profitability.view');

  const listHref = useMemo(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete('tab');
    const query = next.toString();
    return `/o/${workspace.organisation.slug}/products${query ? `?${query}` : ''}`;
  }, [searchParams, workspace.organisation.slug]);

  function selectTab(tab: ProductTab) {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    const query = next.toString();
    router.replace(query ? `?${query}` : '?', { scroll: false });
  }

  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex = index;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = TABS.length - 1;
    else return;
    event.preventDefault();
    const next = TABS[nextIndex];
    selectTab(next.id);
    document.getElementById(`product-tab-${next.id}`)?.focus();
  }

  if (!product.access.allowed) return <AccessState decision={product.access} />;
  if (product.marketplaceState === 'no-authorised') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;
  if (product.marketplaceState === 'none-connected') return <div className="product-detail-page"><Breadcrumbs items={[{ label: 'Products', href: listHref }, { label: 'Product' }]} /><NoMarketplaceProductDetail orgSlug={workspace.organisation.slug} canManage={marketplaceManagement.allowed} /></div>;
  if (product.query.isPending) return <ProductDetailLoading />;
  if (product.query.isError) return <div className="product-detail-page"><Breadcrumbs items={[{ label: 'Products', href: listHref }, { label: 'Product' }]} /><ErrorState title="Product could not be loaded" description={product.query.error instanceof Error ? product.query.error.message : undefined} onRetry={() => { void product.query.refetch(); }} /></div>;
  const lookup = product.query.data;
  if (lookup.status === 'assignment_denied') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;
  if (lookup.status === 'not_found') return <div className="product-detail-page"><Breadcrumbs items={[{ label: 'Products', href: listHref }, { label: 'Product not found' }]} /><EmptyState title="Product not found" description="This product ID does not exist in the organisation catalogue. Return to Products and choose another record." /><Link className="secondary-button product-return-link" href={listHref}><ArrowLeft size={14} /> Back to Products</Link></div>;
  const overview = lookup.data;
  const companyScope = context.companyId === 'all' ? 'All authorised companies' : companyNameFor(context.companyId);
  const marketplaceScope = context.marketplace === 'all' ? 'All marketplaces' : context.marketplace === 'ebay' ? 'eBay' : context.marketplace[0].toUpperCase() + context.marketplace.slice(1);
  const accountScope = context.marketplaceAccountIds.length ? context.marketplaceAccountIds.map(accountNameFor).join(', ') : 'All matching accounts';
  const cogsHref = `/o/${workspace.organisation.slug}/cogs?product=${encodeURIComponent(productId)}&action=edit`;

  let panel: React.ReactNode;
  if (activeTab === 'overview') {
    panel = listings.access.allowed && listings.query.isError
      ? <div className="product-tab-stack"><SectionError title="Marketplace listing summary" query={listings.query} /><ProductOverviewPanel overview={overview} orgSlug={workspace.organisation.slug} canViewProfitability={profitabilityAccess.allowed} canViewCogs={cogsView.allowed} /></div>
      : <ProductOverviewPanel overview={overview} listings={listings.query.data} orgSlug={workspace.organisation.slug} canViewProfitability={profitabilityAccess.allowed} canViewCogs={cogsView.allowed} />;
  } else if (activeTab === 'profitability') {
    panel = !profitability.access.allowed ? <SectionDenied decision={profitability.access} />
      : profitability.query.isPending ? <ProductSectionLoading label="product profitability" />
        : profitability.query.isError ? <SectionError title="Product profitability" query={profitability.query} />
          : <ProductProfitabilityPanel detail={profitability.query.data as ProductProfitabilityDetail} orgSlug={workspace.organisation.slug} />;
  } else if (activeTab === 'costs') {
    panel = !costs.access.allowed ? <SectionDenied decision={costs.access} />
      : costs.query.isPending ? <ProductSectionLoading label="product cost history" />
        : costs.query.isError ? <SectionError title="Product cost history" query={costs.query} />
          : <ProductCostsPanel costs={costs.query.data as ProductCostHistory} canManage={cogsEdit.allowed} cogsHref={cogsHref} orgSlug={workspace.organisation.slug} />;
  } else if (activeTab === 'marketplace') {
    panel = !listings.access.allowed ? <SectionDenied decision={listings.access} />
      : listings.query.isPending ? <ProductSectionLoading label="marketplace listings" />
        : listings.query.isError ? <SectionError title="Marketplace listings" query={listings.query} />
          : <ProductMarketplacePanel result={listings.query.data as ProductListingsResult} orgSlug={workspace.organisation.slug} />;
  } else if (activeTab === 'transactions') {
    panel = <ProductTransactionPreview productId={productId} />;
  } else if (activeTab === 'trends') {
    panel = !trends.access.allowed ? <SectionDenied decision={trends.access} />
      : trends.query.isPending ? <ProductSectionLoading label="product trends" />
        : trends.query.isError ? <SectionError title="Product trends" query={trends.query} />
          : <ProductTrendsPanel result={trends.query.data as ProductTrendResult} />;
  } else {
    panel = !activity.access.allowed ? <SectionDenied decision={activity.access} />
      : activity.query.isPending ? <ProductSectionLoading label="product activity" />
        : activity.query.isError ? <SectionError title="Product activity" query={activity.query} />
          : <ProductActivityPanel result={activity.query.data as ProductActivityResult} />;
  }

  return <div className="product-detail-page">
    <Breadcrumbs items={[{ label: 'Products', href: listHref }, { label: overview.product.title }]} />
    <section className="product-detail-header" aria-labelledby="product-detail-title">
      <div className="product-detail-identity"><ProductThumbnail category={overview.product.category} size="large" label={`${overview.product.title} product thumbnail`} /><div><h1 id="product-detail-title">{overview.product.title}</h1><p>Internal SKU <span className="mono-cell">{overview.product.internalSku}</span> · {overview.companies.map((company) => company.name).join(', ')}</p><div className="product-detail-marketplaces">{overview.marketplaces.map((marketplace) => <MarketplaceBadge marketplace={marketplace} key={marketplace} />)}</div></div></div>
      <div className="product-detail-side"><div className="product-detail-quick-stats"><div><small>Listings</small><strong>{overview.activeListingCount} active</strong></div>{cogsView.allowed ? <div title="The currently effective unit cost record; historical profitability uses the cost effective on each transaction date."><small>Current COGS</small><strong>{overview.currentCogs ? formatMoney(overview.currentCogs.unitCost.amountMinor, overview.currentCogs.unitCost.currency) : 'Missing'}</strong></div> : null}<div><small>Selling price</small><strong>{formatPriceRange(overview)}</strong></div><div><small>Status</small><strong>{overview.product.status}</strong></div></div><div className="product-detail-actions">{cogsEdit.allowed ? <Link className="ui-button primary compact" href={cogsHref}><Wrench size={14} /> Manage COGS</Link> : null}{profitabilityAccess.allowed && cogsView.allowed ? <Button size="compact" onClick={() => downloadProduct(overview)}><Download size={14} /> Export</Button> : null}{copilotAccess.allowed ? <Button size="compact" onClick={() => document.querySelector<HTMLButtonElement>('.copilot-button')?.click()}><Sparkles size={14} /> Ask Copilot</Button> : null}</div></div>
    </section>
    <div className="product-scope-banner" role="status"><Info size={14} /><span><strong>Current analytical scope:</strong> {companyScope} · {marketplaceScope} · {accountScope} · {context.dateRange.from} to {context.dateRange.to}. Identity and Marketplace can show all authorised linked listings.</span></div>
    {!overview.inCurrentScope ? <Alert tone="info" title="No matching activity in the current analytical scope">This product is authorised and its identity remains available, but its listings or sales do not match the selected company, marketplace or account.</Alert> : null}
    {overview.cogsStatus !== 'complete' ? <div className="sr-only" role="status"><CircleDollarSign /> Product COGS is {overview.cogsStatus.replaceAll('_', ' ')} and profitability may be incomplete.</div> : null}
    <section className="product-detail-tabs">
      <div role="tablist" aria-label="Product detail sections">{TABS.map((tab, index) => <button id={`product-tab-${tab.id}`} key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`product-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)} onKeyDown={(event) => handleTabKey(event, index)}>{tab.label}</button>)}</div>
      <div id={`product-panel-${activeTab}`} role="tabpanel" aria-labelledby={`product-tab-${activeTab}`} tabIndex={0}>{panel}</div>
    </section>
  </div>;
}
