'use client';

import { useMemo, useState } from 'react';
import type { DashboardAnalytics, PerformanceComparisonRow } from '@/src/domain/analytics';
import { formatInteger, formatMoney, formatPercentage } from '@/src/domain/calculations';
import { MarketplaceBadge } from '@/src/components/product/patterns';

type Dimension = 'marketplace' | 'company' | 'account';

const LABELS: Record<Dimension, string> = { marketplace: 'Marketplace', company: 'Company', account: 'Account' };

export function PerformanceComparison({ analytics }: { analytics: DashboardAnalytics }) {
  const dimensions = useMemo(() => {
    const values: Dimension[] = [];
    if (analytics.marketplaceComparison.length) values.push('marketplace');
    if (analytics.context.companyId === 'all' && analytics.companyComparison.length > 1) values.push('company');
    if (analytics.accountComparison.length > 1) values.push('account');
    return values;
  }, [analytics]);
  const preferred = analytics.context.marketplace !== 'all' && dimensions.includes('account') ? 'account' : dimensions[0] ?? 'marketplace';
  const [selected, setSelected] = useState<Dimension>(preferred);
  const active = dimensions.includes(selected) ? selected : preferred;
  const rows: PerformanceComparisonRow[] = active === 'marketplace' ? analytics.marketplaceComparison : active === 'company' ? analytics.companyComparison : analytics.accountComparison;
  const maxRevenue = Math.max(1, ...rows.map((row) => row.totals.revenueMinor));
  return <section className="dashboard-section comparison-section" aria-labelledby="comparison-title">
    <header className="dashboard-section-heading"><div><h2 id="comparison-title">Performance by {LABELS[active].toLowerCase()}</h2><p>Revenue, orders and profitability from the same selected dataset.</p></div>{dimensions.length > 1 ? <div className="chart-metric-tabs" role="group" aria-label="Comparison dimension">{dimensions.map((dimension) => <button key={dimension} type="button" aria-pressed={active === dimension} onClick={() => setSelected(dimension)}>{LABELS[dimension]}</button>)}</div> : null}</header>
    <div className="comparison-bars" aria-hidden="true">{rows.map((row) => <div key={row.id}><span>{row.label}</span><i><b style={{ width: `${Math.max(4, row.totals.revenueMinor / maxRevenue * 100)}%` }} /></i><strong>{formatMoney(row.totals.revenueMinor)}</strong></div>)}</div>
    <div className="compact-table-scroll"><table className="dashboard-table comparison-table"><thead><tr><th>{LABELS[active]}</th><th>Revenue</th><th>Orders</th><th>Net Profit</th><th>Margin</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td data-label={LABELS[active]}><span className="comparison-name">{row.marketplace ? <MarketplaceBadge marketplace={row.marketplace} /> : row.label}</span></td><td data-label="Revenue">{formatMoney(row.totals.revenueMinor)}</td><td data-label="Orders">{formatInteger(row.totals.orders)}</td><td data-label={row.totals.profitabilityComplete ? 'Net Profit' : 'Known Profit'} className={(row.totals.knownNetProfitMinor ?? 0) < 0 ? 'negative-text' : ''}>{formatMoney(row.totals.knownNetProfitMinor)}{!row.totals.profitabilityComplete ? <small>{formatPercentage(row.totals.profitabilityCoverageBps)} covered</small> : null}</td><td data-label="Margin">{formatPercentage(row.totals.knownMarginBps)}{!row.totals.profitabilityComplete ? <small>covered sales</small> : null}</td></tr>)}</tbody></table></div>
  </section>;
}
