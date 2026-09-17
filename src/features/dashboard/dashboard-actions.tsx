'use client';

import { useRouter } from 'next/navigation';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { useAccess } from '@/src/components/rbac/access';
import { Download } from 'lucide-react';
import type { DashboardAnalytics } from '@/src/domain/analytics';
import { formatMoney, formatPercentage } from '@/src/domain/calculations';
import { DropdownMenu } from '@/src/components/ui/overlays';
import { useToast } from '@/src/components/ui/feedback';

function csvCell(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function DashboardActions({ analytics, organisationName }: { analytics: DashboardAnalytics; organisationName: string }) {
  const { showToast } = useToast();
  const router = useRouter();
  const { workspace } = useAnalysisContext();
  const reportsAccess = useAccess('reports.view');
  function openReports() {
    const { context } = analytics;
    const params = new URLSearchParams({ company: context.companyId, marketplace: context.marketplace, from: context.dateRange.from, to: context.dateRange.to });
    if (context.marketplaceAccountIds.length) params.set('accounts', context.marketplaceAccountIds.join(','));
    router.push('/o/' + workspace.organisation.slug + '/reports/p-and-l?' + params);
  }
  function exportCsv() {
    const rows = [
      ['Stock Supplies Marketplace Profitability'],
      ['Organisation', organisationName],
      ['From', analytics.context.dateRange.from],
      ['To', analytics.context.dateRange.to],
      ['Metric', 'Value'],
      ['Revenue', formatMoney(analytics.current.revenueMinor)],
      ['Orders', analytics.current.orders],
      ['Units', analytics.current.units],
      ['Refunds', formatMoney(analytics.current.refundsMinor)],
      ['Known COGS', formatMoney(analytics.current.cogsKnownMinor)],
      ['Marketplace Fees', formatMoney(analytics.current.marketplaceFeesMinor)],
      ['Advertising', formatMoney(analytics.current.advertisingKnownMinor)],
      ['Shipping', formatMoney(analytics.current.shippingMinor)],
      ['Covered Net Revenue', formatMoney(analytics.current.covered.netRevenueMinor)],
      ['Known Net Profit', formatMoney(analytics.current.knownNetProfitMinor)],
      ['Known Margin', formatPercentage(analytics.current.knownMarginBps)],
      ['COGS Coverage', formatPercentage(analytics.current.cogsCoverageBps)],
      ['Profitability Coverage', formatPercentage(analytics.current.profitabilityCoverageBps)],
    ];
    const content = rows.map((row) => row.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `marketplace-profitability-${analytics.context.dateRange.from}-${analytics.context.dateRange.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showToast('Dashboard summary CSV exported');
  }
  return <div className="dashboard-actions"><Download size={14} aria-hidden="true" /><DropdownMenu label="Export" items={[
    { label: 'Export dashboard summary CSV', onSelect: exportCsv },
    ...(reportsAccess.allowed ? [{ label: 'Open Operational P&L · PDF and Excel exports', onSelect: openReports }] : []),
  ]} /></div>;
}
