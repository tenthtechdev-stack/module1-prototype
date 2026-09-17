'use client';

import { useMemo, useState } from 'react';
import type { DashboardAnalytics } from '@/src/domain/analytics';
import { StockTrendChart, type TrendMetric } from '@/src/components/charts/stock-chart';
import { formatPercentage, normaliseDisplayBps } from '@/src/domain/calculations';

const OPTIONS: Array<{ id: TrendMetric; label: string }> = [
  { id: 'revenue', label: 'Revenue' },
  { id: 'netProfit', label: 'Net Profit' },
  { id: 'margin', label: 'Margin' },
];

export function ProfitabilityTrend({ analytics }: { analytics: DashboardAnalytics }) {
  const [metric, setMetric] = useState<TrendMetric>('revenue');
  const summary = useMemo(() => {
    const movement = (valueBps: number | null) => {
      const value = normaliseDisplayBps(valueBps);
      return value === null ? 'has no prior comparison'
        : value === 0 ? 'was unchanged'
          : `${value > 0 ? 'increased' : 'decreased'} ${formatPercentage(Math.abs(value))}`;
    };
    return `Revenue ${movement(analytics.metrics.revenue.delta.valueBps)} compared with the previous equivalent period. Covered net profit ${movement(analytics.metrics.netProfit.delta.valueBps)}.`;
  }, [analytics]);
  const profitComparisonUnavailable = metric !== 'revenue' && !analytics.profitabilityComparison.available;
  return <section className="dashboard-section trend-section" aria-labelledby="trend-title">
    <header className="dashboard-section-heading"><div><h2 id="trend-title">Profitability trend</h2><p>{profitComparisonUnavailable ? 'Current cost-complete cohort; the previous-period profitability comparison is unavailable.' : `Current period compared with the immediately preceding ${analytics.granularity === 'day' ? 'equivalent period' : `${analytics.granularity}ly pattern`}.`}</p></div>
      <div className="chart-metric-tabs" role="group" aria-label="Trend metric">{OPTIONS.map((option) => <button type="button" key={option.id} aria-pressed={metric === option.id} onClick={() => setMetric(option.id)}>{option.label}</button>)}</div>
    </header>
    <StockTrendChart data={analytics.trend} metric={metric} />
    <p className="chart-summary">{summary}</p>
    {!analytics.current.profitabilityComplete ? <p className="chart-annotation">Profit and margin use cost-complete sales only ({formatPercentage(analytics.current.profitabilityCoverageBps)} of selected net revenue).{!analytics.profitabilityComparison.available ? ' The previous-period profit comparison is withheld because coverage is not equivalent.' : ''}</p> : null}
  </section>;
}
