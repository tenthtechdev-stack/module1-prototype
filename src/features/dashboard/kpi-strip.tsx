import { ArrowDownRight, ArrowUpRight, HelpCircle, Minus } from 'lucide-react';
import type { DashboardMetricComparison, DashboardMetricKey } from '@/src/domain/analytics';
import { formatInteger, formatMoney, formatMoneyCompact, formatPercentage, formatPoints, normaliseDisplayBps } from '@/src/domain/calculations';
import { Tooltip } from '@/src/components/ui/overlays';

const LABELS: Record<DashboardMetricKey, string> = {
  revenue: 'Revenue', orders: 'Orders', units: 'Units', refunds: 'Refunds', cogs: 'COGS',
  marketplaceFees: 'Marketplace Fees', advertising: 'Advertising', shipping: 'Shipping',
  otherCosts: 'Other Costs', grossProfit: 'Gross Profit', netProfit: 'Net Profit', margin: 'Margin',
};

const HELP: Record<DashboardMetricKey, string> = {
  revenue: 'Gross sales after discounts, before refunds.',
  orders: 'Marketplace orders in the selected reporting scope.',
  units: 'Units sold across the selected marketplace accounts.',
  refunds: 'Refund value. Refund rate uses refunded orders divided by orders.',
  cogs: 'Historical unit cost effective on each transaction date.',
  marketplaceFees: 'Referral, fulfilment, storage, promoted-listing and other seller fees.',
  advertising: 'Marketplace advertising and promoted-listing spend where available.',
  shipping: 'Marketplace fulfilment and direct delivery cost shown as one Dashboard category.',
  otherCosts: 'Other direct costs plus allocated operating expenses available to your role.',
  grossProfit: 'Net Revenue minus COGS.',
  netProfit: 'Gross Profit minus fees, advertising, shipping, other direct costs and allocated expenses.',
  margin: 'Net Profit divided by Net Revenue.',
};

const POSITIVE_KEYS = new Set<DashboardMetricKey>(['revenue', 'orders', 'units', 'grossProfit', 'netProfit', 'margin']);
const NEGATIVE_KEYS = new Set<DashboardMetricKey>(['refunds']);

function displayValue(metric: DashboardMetricComparison, compact = false) {
  if (metric.key === 'orders' || metric.key === 'units') return formatInteger(metric.currentCount ?? metric.currentMinor);
  if (metric.key === 'margin') return formatPercentage(metric.currentBps ?? metric.currentMinor);
  return compact ? formatMoneyCompact(metric.currentMinor) : formatMoney(metric.currentMinor);
}

function Delta({ metric, compact = false }: { metric: DashboardMetricComparison; compact?: boolean }) {
  const value = normaliseDisplayBps(metric.delta.valueBps);
  const Icon = value === null || value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = value === null || value === 0 ? 'neutral'
    : POSITIVE_KEYS.has(metric.key) ? value > 0 ? 'positive' : 'negative'
      : NEGATIVE_KEYS.has(metric.key) ? value > 0 ? 'negative' : 'positive'
        : 'contextual';
  const formatted = metric.delta.kind === 'points' ? formatPoints(value, { signed: true }) : formatPercentage(value, { signed: true });
  const label = value === null ? 'No prior comparison' : `${formatted} vs previous period`;
  return <span className={`kpi-delta ${tone}`} aria-label={label} title={compact ? label : undefined}><Icon size={13} aria-hidden="true" />{compact && value !== null ? formatted : label}</span>;
}

function MetricCard({ metric, primary = false, coverage }: { metric: DashboardMetricComparison; primary?: boolean; coverage?: string }) {
  const incompleteLabel = metric.key === 'netProfit' ? 'Known Net Profit'
    : metric.key === 'margin' ? 'Known Margin'
      : metric.key === 'cogs' ? 'Known COGS'
        : metric.key === 'grossProfit' ? 'Known Gross Profit'
          : metric.key === 'advertising' ? 'Known Advertising'
            : LABELS[metric.key];
  const title = metric.key === 'orders' || metric.key === 'units' ? undefined : metric.key === 'margin' ? formatPercentage(metric.currentBps ?? metric.currentMinor) : formatMoney(metric.currentMinor);
  return <article className={`dashboard-kpi metric-${metric.key} ${primary ? 'primary' : 'secondary'} ${metric.complete ? '' : 'incomplete'}`}>
    <header><span>{metric.complete ? LABELS[metric.key] : incompleteLabel}</span><Tooltip label={HELP[metric.key]}><button className="metric-help" aria-label={`About ${LABELS[metric.key]}`}><HelpCircle size={13} /></button></Tooltip></header>
    <strong title={title}>{displayValue(metric, primary)}</strong>
    <Delta metric={metric} compact={!primary} />
    {metric.key === 'refunds' && metric.currentBps !== undefined ? <small className="metric-context">{formatPercentage(metric.currentBps)} refund rate</small> : null}
    {!metric.complete ? <small className="metric-completeness">{metric.key === 'otherCosts' ? 'Sensitive allocated costs hidden' : metric.key === 'advertising' ? 'Partial marketplace coverage' : coverage}</small> : null}
  </article>;
}

export function KpiStrip({ metrics, cogsCoverageBps, profitabilityCoverageBps }: { metrics: Record<DashboardMetricKey, DashboardMetricComparison>; cogsCoverageBps: number; profitabilityCoverageBps: number }) {
  const cogsCoverage = `${formatPercentage(cogsCoverageBps)} revenue-weighted COGS coverage`;
  const profitCoverage = `Based on ${formatPercentage(profitabilityCoverageBps)} cost-covered sales`;
  const marginCoverage = `Cost-complete sales only · ${formatPercentage(profitabilityCoverageBps)} coverage`;
  return <section className="kpi-section" aria-labelledby="kpi-heading">
    <h2 id="kpi-heading" className="sr-only">Profitability overview</h2>
    <div className="primary-kpis">
      <MetricCard metric={metrics.revenue} primary />
      <MetricCard metric={metrics.orders} primary />
      <MetricCard metric={metrics.netProfit} primary coverage={profitCoverage} />
      <MetricCard metric={metrics.margin} primary coverage={marginCoverage} />
    </div>
    <div className="secondary-kpis">
      {(['units', 'refunds', 'cogs', 'marketplaceFees', 'advertising', 'shipping', 'otherCosts', 'grossProfit'] as DashboardMetricKey[]).map((key) => <MetricCard key={key} metric={metrics[key]} coverage={key === 'cogs' || key === 'grossProfit' ? cogsCoverage : undefined} />)}
    </div>
  </section>;
}
