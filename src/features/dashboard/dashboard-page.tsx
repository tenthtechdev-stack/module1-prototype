'use client';

import Link from 'next/link';
import { RefreshCw, Store } from 'lucide-react';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { ErrorState } from '@/src/components/states/states';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { useDashboardAnalytics } from '@/src/services/hooks/use-dashboard-analytics';
import { DashboardHealthBanner } from '@/src/features/dashboard/dashboard-health';
import { DashboardLoading } from '@/src/features/dashboard/dashboard-loading';
import { KpiStrip } from '@/src/features/dashboard/kpi-strip';
import { ProfitabilityTrend } from '@/src/features/dashboard/profitability-trend';
import { DashboardActions } from '@/src/features/dashboard/dashboard-actions';
import { ProfitBreakdown } from '@/src/features/dashboard/profit-breakdown';
import { PerformanceComparison } from '@/src/features/dashboard/performance-comparison';
import { NeedsReviewProducts, TopProducts } from '@/src/features/dashboard/product-performance';
import { AttentionSyncSummary } from '@/src/features/dashboard/attention-sync-summary';

export function DashboardPage() {
  const { workspace, context } = useAnalysisContext();
  const { access, query, marketplaceState } = useDashboardAnalytics();
  const marketplaceManagement = useAccess('marketplaces.manage');
  if (!access.allowed) return <AccessState decision={access} />;
  if (marketplaceState === 'no-authorised') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;
  if (marketplaceState === 'none-connected') return <div className="dashboard-page"><Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Marketplace Profitability' }]} /><PageHeader title="Marketplace Profitability" description="Understand revenue, costs and net profitability across your connected marketplaces." /><section className="dashboard-empty" role="status"><span><Store size={22} /></span><h2>Connect a marketplace to begin analysing profitability.</h2><p>Connect Amazon, eBay or Temu to import sales, fees and cost coverage.</p>{marketplaceManagement.allowed ? <Link className="primary-button" href={`/o/${workspace.organisation.slug}/admin/marketplace-accounts`}>Connect marketplace</Link> : <small>Ask an organisation administrator to connect a marketplace account.</small>}</section></div>;
  if (query.isPending) return <DashboardLoading />;
  if (query.isError) return <div className="dashboard-page"><PageHeader title="Marketplace Profitability" description="Understand revenue, costs and net profitability across your connected marketplaces." /><ErrorState title="Profitability data could not be loaded" description="Marketplace source data remains available. Retry the analytics request." onRetry={() => { void query.refetch(); }} /></div>;
  const analytics = query.data;
  if (!analytics.current.orders) return <div className="dashboard-page"><Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Marketplace Profitability' }]} /><PageHeader title="Marketplace Profitability" description="Understand revenue, costs and net profitability across your connected marketplaces." /><section className="dashboard-empty" role="status"><span><Store size={22} /></span><h2>No marketplace activity was found for this period.</h2><p>Try a broader date range or choose another company, marketplace or account.</p><Button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Change date range</Button></section></div>;
  return <div className="dashboard-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Marketplace Profitability' }]} />
    <PageHeader title="Marketplace Profitability" description="Understand revenue, costs and net profitability across your connected marketplaces." actions={<DashboardActions analytics={analytics} organisationName={workspace.organisation.name} />} />
    {query.isFetching ? <div className="dashboard-updating" role="status"><RefreshCw size={13} className="spin" /> Updating profitability…</div> : null}
    <DashboardHealthBanner health={analytics.health} orgSlug={workspace.organisation.slug} />
    <KpiStrip metrics={analytics.metrics} cogsCoverageBps={analytics.current.cogsCoverageBps} profitabilityCoverageBps={analytics.current.profitabilityCoverageBps} />
    <ProfitabilityTrend analytics={analytics} />
    <div className="dashboard-analysis-grid">
      <ProfitBreakdown rows={analytics.bridge} orgSlug={workspace.organisation.slug} />
      <PerformanceComparison analytics={analytics} />
    </div>
    <div className="dashboard-product-grid">
      <TopProducts products={analytics.topProducts} orgSlug={workspace.organisation.slug} />
      <NeedsReviewProducts products={analytics.needsReview} orgSlug={workspace.organisation.slug} />
    </div>
    <AttentionSyncSummary attention={analytics.attention} sync={analytics.sync} orgSlug={workspace.organisation.slug} />
    <p className="sr-only">Selected scope: {context.companyId}, {context.marketplace}, {context.dateRange.from} to {context.dateRange.to}.</p>
  </div>;
}
