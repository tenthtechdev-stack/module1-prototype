'use client';

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis } from 'recharts';
import type { DashboardTrendPoint } from '@/src/domain/analytics';
import { formatMoney, formatPercentage } from '@/src/domain/calculations';

export type TrendMetric = 'revenue' | 'netProfit' | 'margin';

const METRICS: Record<TrendMetric, {
  label: string;
  currentKey: keyof DashboardTrendPoint;
  previousKey: keyof DashboardTrendPoint;
  format: (value: number) => string;
}> = {
  revenue: { label: 'Revenue', currentKey: 'revenueMinor', previousKey: 'previousRevenueMinor', format: (value) => formatMoney(value) },
  netProfit: { label: 'Net Profit', currentKey: 'knownNetProfitMinor', previousKey: 'previousKnownNetProfitMinor', format: (value) => formatMoney(value) },
  margin: { label: 'Margin', currentKey: 'marginBps', previousKey: 'previousMarginBps', format: (value) => formatPercentage(value) },
};

function ChartTooltipContent({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string }>;
  label?: string;
  formatter: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return <div className="stock-chart-tooltip"><strong>{label}</strong>{payload.map((item) => (
    <div key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><b>{typeof item.value === 'number' ? formatter(item.value) : '—'}</b></div>
  ))}</div>;
}

export function StockTrendChart({ data, metric }: { data: DashboardTrendPoint[]; metric: TrendMetric }) {
  const config = METRICS[metric];
  const values = data.flatMap((point) => {
    const current = point[config.currentKey];
    const previous = point[config.previousKey];
    return [typeof current === 'number' ? current : 0, typeof previous === 'number' ? previous : 0];
  });
  const includesNegative = values.some((value) => value < 0);
  return <div className="stock-chart" role="img" aria-label={`${config.label} trend for the selected and previous equivalent periods`}>
    <ResponsiveContainer width="100%" height={286} minWidth={0}>
      <LineChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="2 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={26} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
        <YAxis
          width={58}
          tickLine={false}
          axisLine={false}
          domain={includesNegative ? ['auto', 'auto'] : [0, 'auto']}
          tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
          tickFormatter={(value: number) => metric === 'margin' ? `${Math.round(value / 100)}%` : new Intl.NumberFormat('en-GB', { notation: 'compact', style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(value / 100)}
        />
        <RechartsTooltip content={<ChartTooltipContent formatter={config.format} />} cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }} />
        <Line type="monotone" dataKey={config.previousKey} name="Previous period" stroke="var(--chart-previous)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={{ r: 3 }} connectNulls isAnimationActive={false} />
        <Line type="monotone" dataKey={config.currentKey} name="Current period" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
