'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, FileBarChart, Info } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState } from '@/src/components/rbac/access';
import { PageHeader } from '@/src/components/product/patterns';
import { EmptyState, ErrorState } from '@/src/components/states/states';
import { Badge, Skeleton } from '@/src/components/ui/feedback';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { REPORT_TITLES, type ReportKind } from '@/src/domain/reports';
import { REPORT_LOCAL_PARAMS } from '@/src/domain/report-saved-views';
import { formatDate, formatPercentage } from '@/src/domain/calculations';
import { useReport } from '@/src/services/hooks/use-reports';
import { ReportHealth } from './report-presentation';
import './reports.css';

const DIRECTORY: Array<{ section: string; reports: Array<{ kind: ReportKind; question: string; grouping: string }> }> = [
  { section: 'Financial', reports: [
    { kind: 'p-and-l', question: 'How does marketplace revenue become operational profit?', grouping: 'Financial statement · previous-period comparison' },
    { kind: 'expenses', question: 'Which configured expenses apply, and where are they allocated?', grouping: 'Expense ledger · category · type · allocation dimensions' },
  ] },
  { section: 'Profitability', reports: [
    { kind: 'product-profitability', question: 'Which Products and Product Groups contribute profit?', grouping: 'Product · SKU · historical Product Group · Company · marketplace · account' },
    { kind: 'marketplace-profitability', question: 'How do marketplaces, accounts and Companies compare?', grouping: 'Marketplace · account · Company · date · week · month' },
  ] },
  { section: 'Marketplace Activity', reports: [
    { kind: 'fees', question: 'Which marketplace fee components make up the reported cost?', grouping: 'Fee type · marketplace · account · Product · Product Group · Company' },
    { kind: 'refunds', question: 'Which sales and Products contributed canonical refunds?', grouping: 'Marketplace · account · Product · Product Group · Company' },
    { kind: 'transactions', question: 'Which canonical sale lines produced the reported totals?', grouping: 'Individual records · Product · Product Group · marketplace · date' },
  ] },
];

export function ReportsHub() {
  const params = useSearchParams();
  const { workspace, context, companyNameFor, accountNameFor } = useAnalysisContext();
  const { query, access, marketplaceState, permissions } = useReport({ kind: 'p-and-l' });
  const data = query.data;
  const href = (path: string, extra: Record<string, string> = {}) => {
    const next = new URLSearchParams(params.toString());
    REPORT_LOCAL_PARAMS.forEach((key) => { if (!['productId', 'productGroupId', 'completeness'].includes(key)) next.delete(key); });
    next.delete('tab'); next.set('from', context.dateRange.from); next.set('to', context.dateRange.to);
    Object.entries(extra).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    return `/o/${workspace.organisation.slug}${path}?${next}`;
  };
  if (!access.allowed) return <div className="reports-page"><PageHeader title="Reports" />{access.reason === 'assignment_out_of_scope' ? <EmptyState title="Report scope unavailable" description="This reporting scope is not available within your current assignment." /> : <AccessState decision={access} />}</div>;
  if (marketplaceState === 'no-authorised') return <div className="reports-page"><PageHeader title="Reports" /><EmptyState title="Report scope unavailable" description="No marketplace accounts are available within your current assignment." /></div>;
  return <div className="reports-page reports-hub">
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Reports' }]} />
    <PageHeader eyebrow="Operational financial reporting" title="Reports" description="Trace financial results to the Products, marketplace transactions and expenses behind them." />
    <div className="report-scope" aria-label="Selected reporting scope"><strong>{formatDate(context.dateRange.from)} – {formatDate(context.dateRange.to)}</strong><span>{context.companyId === 'all' ? 'All authorised Companies' : companyNameFor(context.companyId)}</span><span>{context.marketplace === 'all' ? 'All marketplaces' : context.marketplace === 'ebay' ? 'eBay' : context.marketplace === 'amazon' ? 'Amazon' : 'Temu'}</span><span>{context.marketplaceAccountIds.length ? context.marketplaceAccountIds.map(accountNameFor).join(', ') : 'All authorised accounts'}</span><Badge>GBP</Badge></div>
    {data ? <ReportHealth data={data} href={href} canManageCogs={permissions.canManageCogs} canViewSync={permissions.canViewSync} canViewExpenses={permissions.canViewExpenses} /> : null}
    {query.isError ? <ErrorState title="Report completeness could not be loaded" description="Retry the reporting service, or open a report below." onRetry={() => { void query.refetch(); }} /> : null}
    <div className="report-directory">{DIRECTORY.map(({ section, reports }) => <section key={section} aria-labelledby={`report-section-${section.replaceAll(' ', '-').toLowerCase()}`}><header><h2 id={`report-section-${section.replaceAll(' ', '-').toLowerCase()}`}>{section}</h2></header><ul>{reports.filter((report) => report.kind !== 'expenses' || permissions.canViewExpenses).map((report) => {
      const financial = ['p-and-l', 'product-profitability', 'marketplace-profitability', 'transactions'].includes(report.kind);
      const restricted = data && !data.sensitiveExpensesVisible && (financial || report.kind === 'expenses');
      const incomplete = financial && data && data.totals.transactions > 0 && !data.totals.profitabilityComplete;
      return <li key={report.kind}><Link href={href(`/reports/${report.kind}`)} className="report-directory-link"><FileBarChart size={19} aria-hidden="true" /><div className="report-directory-copy"><h3>{REPORT_TITLES[report.kind]}</h3><p>{report.question}</p><small><span className="sr-only">Available grouping: </span>{report.grouping}</small></div><div className="report-directory-health">{query.isPending ? <Skeleton /> : restricted ? <Badge tone="warning">Permission limited</Badge> : incomplete ? <Badge tone="warning">{formatPercentage(data.totals.profitabilityCoverageBps)} coverage</Badge> : data && !data.totals.transactions ? <Badge>No activity in period</Badge> : report.kind === 'expenses' && data?.expenseSummary.unallocatedMinor ? <Badge tone="warning">Allocation incomplete</Badge> : data ? <Badge tone={data.freshness.state === 'fresh' ? 'positive' : 'warning'}>{data.freshness.state === 'fresh' ? 'Available' : data.freshness.label}</Badge> : <Badge>Completeness unavailable</Badge>}</div><ArrowRight size={15} aria-hidden="true" /></Link></li>;
    })}</ul></section>)}</div>
    <p className="report-footnote"><Info size={14} /><span>Reports use the shared profitability engine. Missing costs stay unknown; each report preserves your authorised scope and exact dates.</span></p>
  </div>;
}