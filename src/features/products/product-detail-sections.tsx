'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  ExternalLink,
  History,
  HelpCircle,
  Info,
  Link2,
  RefreshCw,
  Store,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Marketplace } from '@/src/domain/models';
import type {
  ProductActivityResult,
  ProductCostHistory,
  ProductDetailOverview,
  ProductListingsResult,
  ProductProfitabilityDetail,
  ProductTrendPoint,
  ProductTrendResult,
} from '@/src/domain/products';
import { formatDate, formatInteger, formatMoney, formatMoneyCompact, formatPercentage } from '@/src/domain/calculations';
import { MarketplaceBadge, MetricValue, SectionHeader } from '@/src/components/product/patterns';
import { ProfitBreakdown } from '@/src/features/dashboard/profit-breakdown';
import { Alert, Badge } from '@/src/components/ui/feedback';
import { Tooltip } from '@/src/components/ui/overlays';
import { TransactionsLink } from '@/src/features/transactions/transaction-links';
import { ProductThumbnail } from '@/src/features/products/product-thumbnail';

function formatPeriod(from: string, to: string | null) {
  const start = formatDate(from, { day: 'numeric', month: 'short', year: 'numeric' });
  if (!to) return `${start} – Current`;
  const inclusiveEnd = new Date(`${to.slice(0, 10)}T00:00:00.000Z`);
  inclusiveEnd.setUTCDate(inclusiveEnd.getUTCDate() - 1);
  return `${start} – ${formatDate(inclusiveEnd.toISOString(), { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not set';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.unitCostMinor === 'number') return formatMoney(record.unitCostMinor, typeof record.currency === 'string' ? record.currency : 'GBP');
    return Object.entries(record).map(([key, item]) => `${key.replaceAll('_', ' ')}: ${valueText(item)}`).join(' · ');
  }
  return String(value).replaceAll('_', ' ');
}

function HelpLabel({ label, help }: { label: string; help: string }) {
  return <span className="metric-inline-label"><span>{label}</span><Tooltip label={help}><button type="button" className="metric-help" aria-label={`About ${label}`}><HelpCircle size={13} /></button></Tooltip></span>;
}

function StatusPill({ status }: { status: string }) {
  const tone = status === 'active' || status === 'completed' ? 'positive'
    : status === 'issue' || status === 'suppressed' || status === 'refunded' ? 'negative'
      : status === 'inactive' || status === 'ended' || status === 'partially_refunded' ? 'warning'
        : 'neutral';
  return <Badge tone={tone}>{status.replaceAll('_', ' ')}</Badge>;
}

function ListingIdentifier({ marketplace, asin, ebayItemId, temuListingId }: {
  marketplace: Marketplace;
  asin?: string;
  ebayItemId?: string;
  temuListingId?: string;
}) {
  if (marketplace === 'amazon') return <><small>ASIN</small><span className="mono-cell">{asin ?? 'Unavailable'}</span></>;
  if (marketplace === 'ebay') return <><small>eBay Item ID</small><span className="mono-cell">{ebayItemId ?? 'Unavailable'}</span></>;
  return <><small>Temu Listing ID</small><span className="mono-cell">{temuListingId ?? 'Unavailable'}</span></>;
}

export function ProductOverviewPanel({
  overview,
  listings,
  orgSlug,
  canViewProfitability,
  canViewCogs,
}: {
  overview: ProductDetailOverview;
  listings?: ProductListingsResult;
  orgSlug: string;
  canViewProfitability: boolean;
  canViewCogs: boolean;
}) {
  const searchParams = useSearchParams();
  const totals = overview.selectedPeriod;
  const marketplaceHref = useMemo(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.set('tab', 'marketplace');
    return `?${next.toString()}`;
  }, [searchParams]);
  const scopedListings = listings?.listings.filter((listing) => listing.inCurrentScope) ?? [];
  const issues = [
    canViewCogs && overview.cogsStatus !== 'complete' ? 'COGS is incomplete for the selected period' : null,
    canViewProfitability && overview.profitabilityStatus === 'loss_making' ? 'This product is loss-making in the current scope' : null,
    canViewProfitability && overview.profitabilityStatus === 'low_margin' ? 'Margin is below the 10% prototype threshold' : null,
    listings?.listings.some((listing) => listing.issue) ? 'At least one marketplace listing needs attention' : null,
  ].filter(Boolean) as string[];
  return <div className="product-tab-stack">
    {canViewProfitability ? <section className="product-metric-strip" aria-label="Selected-period product summary">
      <MetricValue label="Revenue" value={formatMoneyCompact(totals.revenueMinor)} detail="Current analytical scope" />
      <MetricValue label="Units" value={formatInteger(totals.units)} detail={`${formatInteger(totals.orders)} orders`} />
      <MetricValue label={totals.profitabilityComplete ? 'Net Profit' : 'Known Net Profit'} value={formatMoneyCompact(totals.knownNetProfitMinor)} detail={`${formatPercentage(totals.profitabilityCoverageBps)} coverage`} help="Net Revenue minus COGS, fees, advertising, shipping, other direct costs and permitted allocated expenses. In incomplete views, only covered transactions contribute." />
      <MetricValue label={totals.profitabilityComplete ? 'Margin' : 'Known Margin'} value={formatPercentage(totals.knownMarginBps)} detail={totals.profitabilityComplete ? 'Cost complete' : 'Covered sales only'} help="Net Profit divided by Net Revenue. Known Margin uses only the fully cost-covered cohort." />
    </section> : null}
    <div className="product-overview-grid">
      <section className="product-panel product-identity-panel" aria-labelledby="identity-title">
        <SectionHeader title="Internal product" description="Company-owned catalogue information maintained inside Stock Supplies." />
        <div className="product-profile">
          <ProductThumbnail category={overview.product.category} size="large" label={`${overview.product.title} product thumbnail`} />
          <dl>
            <div><dt>Internal SKU</dt><dd className="mono-cell">{overview.product.internalSku}</dd></div>
            <div><dt>Category</dt><dd>{overview.product.category ?? 'Not categorised'}</dd></div>
            <div><dt>Brand</dt><dd>{overview.product.brand ?? 'Not set'}</dd></div>
            <div><dt>Company</dt><dd>{overview.companies.map((company) => company.name).join(', ')}</dd></div>
            <div><dt>Product status</dt><dd><StatusPill status={overview.product.status} /></dd></div>
            <div><dt>Last updated</dt><dd>{formatDate(overview.product.updatedAt)}</dd></div>
          </dl>
        </div>
      </section>
      <section className="product-panel product-health-panel" aria-labelledby="health-title">
        <SectionHeader title="Data and cost health" description="Status for the selected analytical scope." />
        <div className="product-health-summary">
          {canViewCogs ? <div><span className={`health-icon ${overview.cogsStatus === 'complete' ? 'positive' : 'warning'}`}>{overview.cogsStatus === 'complete' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}</span><p><small>COGS status</small><strong>{overview.cogsStatus.replaceAll('_', ' ')}</strong></p></div> : null}
          <div><span className="health-icon info"><RefreshCw size={18} /></span><p><small>Freshness</small><strong>{overview.dataFreshness.label}</strong><em>{overview.dataFreshness.detail}</em></p></div>
          <div><span className="health-icon neutral"><Store size={18} /></span><p><small>Listings in scope</small><strong>{overview.activeListingCount} active of {overview.listingCount}</strong></p></div>
        </div>
        {issues.length ? <ul className="product-attention-list">{issues.map((issue) => <li key={issue}><AlertTriangle size={14} /><span>{issue}</span></li>)}</ul> : <Alert tone="positive" title="No product issues in this scope">{canViewProfitability ? 'Listings, costs and profitability are ready for analysis.' : 'Listings and product costs are ready for review.'}</Alert>}
      </section>
    </div>
    <section className="product-panel" aria-labelledby="overview-listings-title">
      <SectionHeader title="Marketplace listing summary" description={scopedListings.length === (listings?.listings.length ?? 0) ? 'All accessible listings match the current analytical scope.' : `${scopedListings.length} of ${listings?.accessibleListingCount ?? overview.listingCount} accessible listings match the current analytical scope.`} actions={<Link href={marketplaceHref}>View marketplace details <ArrowRight size={13} /></Link>} />
      <div className="product-table-scroll"><table className="product-detail-table"><thead><tr><th>Marketplace</th><th>Account</th><th><HelpLabel label="Marketplace SKU" help="The seller SKU supplied by the source marketplace listing; it is separate from the internal product SKU." /></th><th>Price</th><th>Status</th></tr></thead><tbody>{(scopedListings.length ? scopedListings : listings?.listings ?? []).slice(0, 5).map((listing) => <tr key={listing.id}><td data-label="Marketplace"><MarketplaceBadge marketplace={listing.marketplace} /></td><td data-label="Account"><strong>{listing.accountName}</strong><small>{listing.companyName}</small></td><td data-label="Marketplace SKU" className="mono-cell">{listing.marketplaceSku}</td><td data-label="Price" className="numeric">{formatMoney(listing.price.amountMinor, listing.price.currency)}</td><td data-label="Status"><StatusPill status={listing.listingStatus} /></td></tr>)}</tbody></table></div>
      {!listings ? <p className="section-inline-note"><Clock3 size={13} /> Listing details are loading independently.</p> : null}
    </section>
    {!totals.orders ? <Alert tone="info" title="No sales in this period">Product identity, current COGS and marketplace listing information remain available.</Alert> : null}
    <p className="section-footnote"><Info size={13} /> Current analytical scope respects the selected company, marketplace, account and date range. Product identity can include all authorised linked listings.</p>
    <Link className="text-link" href={`/o/${orgSlug}/operations/attention`}>Review related Needs Attention items <ArrowRight size={13} /></Link>
  </div>;
}

export function ProductProfitabilityPanel({ detail, orgSlug }: { detail: ProductProfitabilityDetail; orgSlug: string }) {
  const totals = detail.totals;
  return <div className="product-tab-stack">
    {!totals.profitabilityComplete ? <Alert tone="warning" title="Product profitability is incomplete">Known Net Profit uses only transactions with complete product cost and advertising data. Coverage is {formatPercentage(totals.profitabilityCoverageBps)}.</Alert> : null}
    <section className="product-profit-metrics" aria-label="Product profitability metrics">
      <MetricValue label="Revenue" value={formatMoneyCompact(totals.revenueMinor)} detail={`${formatInteger(totals.orders)} orders`} />
      <MetricValue label="Orders" value={formatInteger(totals.orders)} detail="Completed order records" />
      <MetricValue label="Units" value={formatInteger(totals.units)} detail="Units sold in scope" />
      <MetricValue label="Refunds" value={formatMoneyCompact(totals.refundsMinor)} detail={`${formatPercentage(totals.refundRateBps)} refund rate`} />
      <MetricValue label="Net Revenue" value={formatMoneyCompact(totals.netRevenueMinor)} />
      <MetricValue label={totals.cogsCoverageBps === 10_000 ? 'COGS' : 'Known COGS'} value={totals.cogsCoverageBps ? formatMoneyCompact(totals.cogsKnownMinor) : 'Incomplete'} detail={`${formatPercentage(totals.cogsCoverageBps)} coverage`} help="Historical unit cost effective on each transaction date. Known COGS excludes transactions without a valid effective-dated cost." />
      <MetricValue label="Gross Profit" value={formatMoneyCompact(totals.grossProfitKnownMinor)} detail={totals.cogsCoverageBps === 10_000 ? 'Cost complete' : 'Known cohort'} />
      <MetricValue label={totals.profitabilityComplete ? 'Net Profit' : 'Known Net Profit'} value={formatMoneyCompact(totals.knownNetProfitMinor)} detail={detail.profitabilityStatus.replaceAll('_', ' ')} help="Gross Profit minus fees, advertising, shipping, other direct costs and permitted allocated expenses. Known Net Profit excludes uncovered transactions." />
      <MetricValue label={totals.profitabilityComplete ? 'Margin' : 'Known Margin'} value={formatPercentage(totals.knownMarginBps)} detail="Net Profit ÷ Net Revenue" help="Net Profit divided by Net Revenue. Known Margin uses only the fully cost-covered cohort." />
      <MetricValue label="ROI" value={formatPercentage(detail.roiBps)} detail={detail.roiBps === null ? 'Requires complete positive COGS' : 'Net Profit ÷ COGS'} help="Return on investment is Net Profit divided by COGS and is shown only with complete, positive product cost." />
    </section>
    <ProfitBreakdown rows={detail.bridge} orgSlug={orgSlug} />
    <section className="product-panel" aria-labelledby="channel-profit-title">
      <SectionHeader title="Marketplace profitability" description="Can this product sell profitably in every selected channel?" />
      <div className="product-table-scroll"><table className="product-detail-table"><thead><tr><th>Channel</th><th>Revenue</th><th>Units</th><th>Known Net Profit</th><th>Margin</th><th>Coverage</th></tr></thead><tbody>{detail.byMarketplace.map((channel) => <tr key={channel.id}><td data-label="Channel"><MarketplaceBadge marketplace={channel.marketplace} /><strong>{channel.label}</strong></td><td data-label="Revenue" className="numeric">{formatMoney(channel.totals.revenueMinor)}</td><td data-label="Units" className="numeric">{formatInteger(channel.totals.units)}</td><td data-label="Known Net Profit" className={`numeric ${(channel.totals.knownNetProfitMinor ?? 0) < 0 ? 'negative-text' : ''}`}>{formatMoney(channel.totals.knownNetProfitMinor)}</td><td data-label="Margin" className="numeric">{formatPercentage(channel.totals.knownMarginBps)}</td><td data-label="Coverage">{formatPercentage(channel.totals.profitabilityCoverageBps)}</td></tr>)}</tbody></table></div>
    </section>
    {detail.byAccount.length > 1 ? <section className="product-panel" aria-labelledby="account-profit-title">
      <SectionHeader title="Account profitability" description="Performance for each authorised marketplace account in the selected scope." />
      <div className="product-table-scroll"><table className="product-detail-table"><thead><tr><th>Account</th><th>Marketplace</th><th>Revenue</th><th>Units</th><th>Known Net Profit</th><th>Known Margin</th><th>Coverage</th></tr></thead><tbody>{detail.byAccount.map((account) => <tr key={account.id}><td data-label="Account"><strong>{account.label}</strong></td><td data-label="Marketplace"><MarketplaceBadge marketplace={account.marketplace} /></td><td data-label="Revenue" className="numeric">{formatMoney(account.totals.revenueMinor)}</td><td data-label="Units" className="numeric">{formatInteger(account.totals.units)}</td><td data-label="Known Net Profit" className={`numeric ${(account.totals.knownNetProfitMinor ?? 0) < 0 ? 'negative-text' : ''}`}>{formatMoney(account.totals.knownNetProfitMinor)}</td><td data-label="Known Margin" className="numeric">{formatPercentage(account.totals.knownMarginBps)}</td><td data-label="Coverage">{formatPercentage(account.totals.profitabilityCoverageBps)}</td></tr>)}</tbody></table></div>
    </section> : null}
  </div>;
}

export function ProductCostsPanel({ costs, canManage, cogsHref, orgSlug }: { costs: ProductCostHistory; canManage: boolean; cogsHref: string; orgSlug: string }) {
  if (!costs.current) return <div className="product-tab-stack"><section className="product-missing-cost"><span><CircleDollarSign size={24} /></span><h2>COGS missing</h2><p>{costs.message}</p>{canManage ? <Link className="primary-button" href={cogsHref}>Manage COGS <ArrowRight size={14} /></Link> : <small>Ask a cost user or organisation administrator to add an effective-dated cost.</small>}</section></div>;
  const inheritance = costs.inheritance;
  return <div className="product-tab-stack">
    {inheritance ? <section className="product-inherited-cost-card" aria-label="Inherited Product Group COGS source">
      <header><span><CircleDollarSign size={19} /></span><div><small>COGS Source</small><h2>Product Group</h2><p>This Product inherits its effective-dated COGS from an approved Company-scoped costing basis.</p></div><Badge tone="info">Inherited from Product Group</Badge></header>
      <dl>
        <div><dt>Group</dt><dd>{inheritance.productGroupName}</dd></div>
        <div><dt>Pack Quantity</dt><dd>{formatInteger(inheritance.packQuantity)}</dd></div>
        <div><dt>Base Quantity</dt><dd>{formatInteger(inheritance.baseQuantity)}</dd></div>
        <div><dt>Base Cost</dt><dd>{formatMoney(inheritance.baseCostMinor, inheritance.currency)}</dd></div>
        <div><dt>Base Unit Cost</dt><dd>{new Intl.NumberFormat('en-GB', { style: 'currency', currency: inheritance.currency, minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(inheritance.baseCostMinor / inheritance.baseQuantity / 100)}</dd></div>
        <div><dt>Calculated COGS</dt><dd>{formatMoney(costs.current.unitCost.amountMinor, costs.current.unitCost.currency)}</dd></div>
      </dl>
      <Link className="secondary-button" href={`/o/${orgSlug}/cogs/groups/${encodeURIComponent(inheritance.productGroupId)}`}>View Product Group <ArrowRight size={14} /></Link>
    </section> : null}
    <section className="current-cost-card" aria-label="Current product COGS">
      <div><HelpLabel label="Current COGS" help="The currently effective unit cost record. Historical profitability uses the cost effective on each transaction date." /><strong>{formatMoney(costs.current.unitCost.amountMinor, costs.current.unitCost.currency)}</strong><span>Effective from {formatDate(costs.current.effectiveFrom)}</span></div>
      <dl><div><dt>Currency</dt><dd>{costs.current.unitCost.currency}</dd></div><div><dt>Source</dt><dd>{costs.cogsSource}</dd></div><div><dt>Changed by</dt><dd>{costs.current.changedBy.name}</dd></div><div><dt>Approved by</dt><dd>{costs.current.approvedBy?.name ?? costs.current.changedBy.name}</dd></div><div><dt>Approval date</dt><dd>{costs.current.approvedAt ? formatDate(costs.current.approvedAt) : formatDate(costs.current.changedAt)}</dd></div><div><dt>Selected-period coverage</dt><dd>{formatPercentage(costs.selectedPeriodCoverageBps)}</dd></div></dl>
      {canManage ? <Link className="secondary-button" href={cogsHref}>Manage COGS</Link> : null}
    </section>
    {costs.status !== 'complete' ? <Alert tone="warning" title={costs.status === 'partial_history' ? 'Partial cost history' : 'Cost history needs review'}>{costs.message}</Alert> : null}
    <section className="product-panel" aria-labelledby="cost-history-title">
      <SectionHeader title="Effective-date cost history" description="Historical values remain visible and are applied to transactions by their effective dates." />
      <div className="product-table-scroll"><table className="product-detail-table"><thead><tr><th>Effective period</th><th>State</th><th>Unit cost</th><th>Currency</th><th>Source</th><th>Changed by</th><th>Approved by</th><th>Reason</th></tr></thead><tbody>{costs.history.map((period) => <tr key={period.id}><td data-label="Effective period"><CalendarClock size={13} /> {formatPeriod(period.effectiveFrom, period.effectiveTo)}<TransactionsLink costRecordId={period.id}>Transactions using this cost</TransactionsLink></td><td data-label="State"><Badge tone={period.state === 'scheduled' ? 'info' : period.state === 'effective' ? 'positive' : 'neutral'}>{period.state ?? 'historical'}</Badge></td><td data-label="Unit cost" className="numeric strong">{formatMoney(period.unitCost.amountMinor, period.unitCost.currency)}</td><td data-label="Currency">{period.unitCost.currency}</td><td data-label="Source"><strong>{period.source}</strong>{period.sourceReferenceId ? <small className="mono-cell">{period.sourceReferenceId}</small> : null}</td><td data-label="Changed by">{period.changedBy.name}<small>{formatDate(period.changedAt)}</small></td><td data-label="Approved by">{period.approvedBy?.name ?? 'Approved source'}{period.approvedAt ? <small>{formatDate(period.approvedAt)}</small> : null}</td><td data-label="Reason">{period.reason}</td></tr>)}</tbody></table></div>
    </section>
    <p className="section-footnote"><History size={13} /> Current COGS is today’s active record. Historical profitability uses the cost effective on each transaction date.</p>
  </div>;
}

export function ProductMarketplacePanel({ result, orgSlug }: { result: ProductListingsResult; orgSlug: string }) {
  const groups = useMemo(() => {
    const map = new Map<string, ProductListingsResult['listings']>();
    result.listings.forEach((listing) => map.set(listing.marketplaceAccountId, [...(map.get(listing.marketplaceAccountId) ?? []), listing]));
    return [...map.values()];
  }, [result.listings]);
  return <div className="product-tab-stack">
    <Alert tone="info" title="Marketplace-sourced information is read-only">Listing titles, identifiers, prices, status and fulfilment are synchronised from their source accounts.</Alert>
    <div className="listing-account-groups">{groups.map((listings) => {
      const first = listings[0];
      return <section className="product-panel listing-account-card" key={first.marketplaceAccountId}>
        <header><div><MarketplaceBadge marketplace={first.marketplace} /><h2>{first.accountName}</h2><p>{first.companyName} · {listings.length} linked listing{listings.length === 1 ? '' : 's'}</p></div><StatusPill status={first.accountStatus} /></header>
        {first.issue === 'account_authentication' ? <Alert tone="negative" title="Marketplace authentication unavailable">Reconnect this account before the listing can refresh.</Alert> : null}
        {listings.map((listing) => <article className="marketplace-listing-record" key={listing.id}>
          <div className="listing-record-heading"><div><strong>{listing.title}</strong><span>{listing.inCurrentScope ? 'In current analytical scope' : 'Outside current analytical scope'}</span></div><StatusPill status={listing.listingStatus} /></div>
          <dl>
            <div><dt>Marketplace SKU</dt><dd className="mono-cell">{listing.marketplaceSku}</dd></div>
            <div><dt>Marketplace identifier</dt><dd><ListingIdentifier marketplace={listing.marketplace} asin={listing.asin} ebayItemId={listing.ebayItemId} temuListingId={listing.temuListingId} /></dd></div>
            <div><dt>Price</dt><dd>{formatMoney(listing.price.amountMinor, listing.price.currency)}</dd></div>
            <div><dt>Fulfilment</dt><dd>{listing.fulfilmentType ?? 'Marketplace managed'}</dd></div>
            <div><dt>Last sync</dt><dd>{listing.lastSyncedAt ? formatDate(listing.lastSyncedAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Not available'}</dd></div>
            <div><dt>Source reference</dt><dd className="mono-cell">{listing.sourceReference ?? listing.marketplaceProductId ?? 'Not available'}</dd></div>
          </dl>
          {listing.issue ? <p className="listing-issue"><AlertTriangle size={13} /> {listing.issue.replaceAll('_', ' ')}</p> : null}
        </article>)}
      </section>;
    })}</div>
    <div className="inline-actions"><Link className="secondary-button" href={`/o/${orgSlug}/operations/sync-health`}>Open Sync Health <ExternalLink size={13} /></Link><Link className="secondary-button" href={`/o/${orgSlug}/admin/marketplace-accounts`}>Marketplace Accounts <ExternalLink size={13} /></Link></div>
  </div>;
}

type ProductTrendMetric = 'revenue' | 'units' | 'netProfit' | 'margin';

const TREND_METRICS: Array<{ id: ProductTrendMetric; label: string }> = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'units', label: 'Units' },
  { id: 'netProfit', label: 'Net Profit' },
  { id: 'margin', label: 'Margin' },
];

function trendValue(point: ProductTrendPoint, metric: ProductTrendMetric) {
  if (metric === 'revenue') return point.revenueMinor;
  if (metric === 'units') return point.units;
  if (metric === 'netProfit') return point.knownNetProfitMinor;
  return point.marginBps;
}

function formatTrendValue(value: number, metric: ProductTrendMetric) {
  if (metric === 'units') return formatInteger(value);
  if (metric === 'margin') return formatPercentage(value);
  return formatMoney(value);
}

export function ProductTrendsPanel({ result }: { result: ProductTrendResult }) {
  const [metric, setMetric] = useState<ProductTrendMetric>('revenue');
  const chartData = useMemo(() => result.points.map((point) => ({ ...point, value: trendValue(point, metric) })), [metric, result.points]);
  const coverageWeight = result.points.reduce((sum, point) => sum + Math.max(0, point.revenueMinor), 0);
  const coverage = coverageWeight ? Math.round(result.points.reduce((sum, point) => sum + point.profitabilityCoverageBps * Math.max(0, point.revenueMinor), 0) / coverageWeight) : 0;
  return <section className="product-panel product-trend-panel" aria-labelledby="product-trend-title">
    <header className="dashboard-section-heading"><div><h2 id="product-trend-title">Product trend</h2><p>{result.granularity[0].toUpperCase() + result.granularity.slice(1)} buckets for the selected global date range.</p></div><div className="chart-metric-tabs" role="group" aria-label="Product trend metric">{TREND_METRICS.map((option) => <button type="button" key={option.id} aria-pressed={metric === option.id} onClick={() => setMetric(option.id)}>{option.label}</button>)}</div></header>
    {chartData.length ? <div className="stock-chart" role="img" aria-label={`${TREND_METRICS.find((item) => item.id === metric)?.label} trend for this product`}><ResponsiveContainer width="100%" height={310} minWidth={0}><LineChart data={chartData} margin={{ top: 18, right: 12, bottom: 0, left: 0 }}><CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4" /><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} /><YAxis width={60} tickLine={false} axisLine={false} domain={metric === 'netProfit' || metric === 'margin' ? ['auto', 'auto'] : [0, 'auto']} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} tickFormatter={(value: number) => metric === 'units' ? new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(value) : metric === 'margin' ? `${Math.round(value / 100)}%` : new Intl.NumberFormat('en-GB', { notation: 'compact', style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value / 100)} /><RechartsTooltip formatter={(value) => [typeof value === 'number' ? formatTrendValue(value, metric) : '—', TREND_METRICS.find((item) => item.id === metric)?.label]} contentStyle={{ border: '1px solid var(--border)', borderRadius: 6, boxShadow: 'var(--shadow-md)', fontSize: 11 }} /><Line type="monotone" dataKey="value" name={TREND_METRICS.find((item) => item.id === metric)?.label} stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} /></LineChart></ResponsiveContainer></div> : <div className="product-inline-empty"><Clock3 size={20} /><strong>No trend data for this period</strong></div>}
    <p className="chart-summary">The chart uses the same date bucketing and covered-profit semantics as Marketplace Profitability.</p>
    {metric === 'netProfit' || metric === 'margin' ? <p className="chart-annotation">Known profitability coverage across the displayed buckets averages {formatPercentage(coverage)}. Missing-cost transactions are not presented as profit.</p> : null}
  </section>;
}

export function ProductActivityPanel({ result }: { result: ProductActivityResult }) {
  return <section className="product-panel" aria-labelledby="activity-title">
    <SectionHeader title="Product activity" description="Read-only audit history for internal changes and marketplace events." />
    {result.events.length ? <ol className="product-activity-timeline">{result.events.map((event) => <li key={event.id}><span className="activity-marker"><History size={14} /></span><div><header><strong>{event.action.replaceAll('_', ' ')}</strong><time dateTime={event.timestamp}>{formatDate(event.timestamp, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></header><p>By {event.actorName}</p><div className="activity-change"><span>{valueText(event.previousValue)}</span><ArrowRight size={13} /><strong>{valueText(event.newValue)}</strong></div>{event.reason ? <small>Reason: {event.reason}</small> : null}</div></li>)}</ol> : <div className="product-inline-empty"><History size={20} /><strong>No activity recorded</strong></div>}
    <p className="section-footnote"><Link2 size={13} /> Audit entries cannot be edited or deleted from the Products workspace.</p>
  </section>;
}
