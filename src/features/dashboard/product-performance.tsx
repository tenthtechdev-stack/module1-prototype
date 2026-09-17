'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownUp, CircleDollarSign, PackageOpen } from 'lucide-react';
import type { DashboardProductPerformance } from '@/src/domain/analytics';
import { formatInteger, formatMoney, formatPercentage } from '@/src/domain/calculations';
import { MarketplaceBadge } from '@/src/components/product/patterns';
import { Badge } from '@/src/components/ui/feedback';
import { useAccess } from '@/src/components/rbac/access';

type ProductSort = 'netProfit' | 'revenue' | 'units' | 'margin';

const ISSUE_COPY: Record<Exclude<DashboardProductPerformance['issue'], null>, string> = {
  missing_cogs: 'Missing COGS',
  loss_making: 'Negative net profit',
  low_margin: 'Low margin',
  high_refunds: 'High refund rate',
  high_advertising: 'High advertising cost',
};

export function TopProducts({ products, orgSlug }: { products: DashboardProductPerformance[]; orgSlug: string }) {
  const [sort, setSort] = useState<ProductSort>('netProfit');
  const sorted = useMemo(() => [...products].sort((a, b) => {
    if (sort === 'revenue') return b.revenueMinor - a.revenueMinor;
    if (sort === 'units') return b.units - a.units;
    if (sort === 'margin') return (b.marginBps ?? -Infinity) - (a.marginBps ?? -Infinity);
    return (b.netProfitMinor ?? -Infinity) - (a.netProfitMinor ?? -Infinity);
  }).slice(0, 7), [products, sort]);
  return <section className="dashboard-section products-section" aria-labelledby="top-products-title">
    <header className="dashboard-section-heading"><div><h2 id="top-products-title">Top products</h2><p>Complete-cost products ranked by {sort === 'netProfit' ? 'Net Profit' : sort}.</p></div><label className="compact-sort"><ArrowDownUp size={13} /><span className="sr-only">Sort products by</span><select value={sort} onChange={(event) => setSort(event.target.value as ProductSort)}><option value="netProfit">Net Profit</option><option value="revenue">Revenue</option><option value="units">Units</option><option value="margin">Margin</option></select></label></header>
    <div className="compact-table-scroll"><table className="dashboard-table product-table"><thead><tr><th>Product</th><th>Marketplace</th><th>Units</th><th>Revenue</th><th>Net Profit</th><th>Margin</th></tr></thead><tbody>{sorted.map((product) => <tr key={product.id}><td data-label="Product"><Link href={`/o/${orgSlug}/products/${product.id}`}><strong>{product.name}</strong><small>{product.sku}</small></Link></td><td data-label="Marketplace"><span className="marketplace-list">{product.marketplaces.map((marketplace) => <MarketplaceBadge key={marketplace} marketplace={marketplace} />)}</span></td><td data-label="Units">{formatInteger(product.units)}</td><td data-label="Revenue">{formatMoney(product.revenueMinor)}</td><td data-label="Net Profit" className={(product.netProfitMinor ?? 0) < 0 ? 'negative-text' : ''}>{formatMoney(product.netProfitMinor)}</td><td data-label="Margin">{formatPercentage(product.marginBps)}</td></tr>)}</tbody></table></div>
    <footer className="section-link"><Link href={`/o/${orgSlug}/products`}>View products</Link></footer>
  </section>;
}

export function NeedsReviewProducts({ products, orgSlug }: { products: DashboardProductPerformance[]; orgSlug: string }) {
  const cogsAccess = useAccess('cogs.view');
  return <section className="dashboard-section review-products" aria-labelledby="review-products-title">
    <header className="dashboard-section-heading"><div><h2 id="review-products-title">Needs review</h2><p>Incomplete profitability and material performance issues.</p></div><Badge tone={products.length ? 'warning' : 'positive'}>{products.length ? `${products.length} surfaced` : 'No issues'}</Badge></header>
    {products.length ? <div className="review-list">{products.map((product) => <Link href={`/o/${orgSlug}/products/${product.id}`} key={product.id} className={product.issue === 'missing_cogs' ? 'incomplete' : ''}><span className="review-icon">{product.issue === 'missing_cogs' ? <PackageOpen size={15} /> : product.issue === 'loss_making' ? <CircleDollarSign size={15} /> : <AlertTriangle size={15} />}</span><span className="review-copy"><strong>{product.name}</strong><small>{product.sku} · {product.issue ? ISSUE_COPY[product.issue] : 'Review'}</small></span><span className="review-value"><b>{product.cogsStatus === 'missing' ? 'Profit incomplete' : formatMoney(product.netProfitMinor)}</b><small>{product.cogsStatus === 'missing' ? 'Unknown cost ≠ loss' : formatPercentage(product.marginBps)}</small></span></Link>)}</div> : <div className="mini-empty"><PackageOpen size={18} /><span>Nothing requires product-level review in this scope.</span></div>}
    {cogsAccess.allowed ? <footer className="section-link"><Link href={`/o/${orgSlug}/cogs?status=missing`}>Review missing COGS</Link></footer> : null}
  </section>;
}
