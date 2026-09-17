'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState } from '@/src/components/rbac/access';
import { ErrorState, EmptyState } from '@/src/components/states/states';
import { MarketplaceBadge, SectionHeader } from '@/src/components/product/patterns';
import { Badge, Skeleton } from '@/src/components/ui/feedback';
import { formatDate, formatMoney, formatPercentage } from '@/src/domain/calculations';
import { useTransactions } from '@/src/services/hooks/use-transactions';
import { TransactionsLink } from '@/src/features/transactions/transaction-links';

export function ProductTransactionPreview({ productId }: { productId: string }) {
  const result = useTransactions({ productId, pageSize: 20, sorting: [{ field: 'date', direction: 'desc' }] });
  const { workspace, context } = useAnalysisContext();
  const search = useSearchParams();
  if (!result.access.allowed) return <AccessState decision={result.access} />;
  if (result.marketplaceState === 'no-authorised') return <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} />;
  if (result.marketplaceState === 'none-connected') return <EmptyState title="No marketplace connected" description="Product transactions will appear after a marketplace account is connected and its financial data has imported." />;
  if (result.query.isPending) return <div className="product-section-loading" role="status" aria-label="Loading Product transactions"><Skeleton /><Skeleton /><Skeleton /></div>;
  if (result.query.isError) return <ErrorState title="Recent transactions could not be loaded" onRetry={() => { void result.query.refetch(); }} />;
  const data = result.query.data;
  const params = new URLSearchParams(search.toString());
  params.delete('tab');
  params.set('productId', productId);
  params.set('from', context.dateRange.from);
  params.set('to', context.dateRange.to);
  return <div className="product-tab-stack"><section className="product-panel">
    <SectionHeader title="Recent transactions" description={`Showing ${data.items.length} of ${data.total.toLocaleString('en-GB')} sale-line transactions in the current analytical scope.`} actions={<TransactionsLink productId={productId}>View all transactions</TransactionsLink>} />
    {data.items.length ? <div className="product-table-scroll"><table className="product-detail-table"><thead><tr><th>Date</th><th>Order ID</th><th>Marketplace</th><th>Account</th><th>Qty</th><th>Revenue</th><th>Refunds</th><th>COGS</th><th>Fees</th><th>Known Net Profit</th><th>Margin</th><th>Status</th></tr></thead><tbody>{data.items.map((row) => <tr key={row.id}>
      <td data-label="Date">{formatDate(row.transactionDate)}</td><td data-label="Order ID"><Link className="mono-cell" href={`/o/${workspace.organisation.slug}/transactions/${encodeURIComponent(row.id)}?${params}`}>{row.marketplaceOrderId}</Link></td><td data-label="Marketplace"><MarketplaceBadge marketplace={row.marketplace} /></td><td data-label="Account">{row.marketplaceAccountName}</td><td data-label="Qty" className="numeric">{row.quantity}</td><td data-label="Revenue" className="numeric">{formatMoney(row.revenueMinor)}</td><td data-label="Refunds" className="numeric">{formatMoney(row.refundsMinor)}</td><td data-label="COGS" className="numeric">{row.cogsMinor === null ? 'Unknown' : formatMoney(row.cogsMinor)}</td><td data-label="Fees" className="numeric">{formatMoney(row.marketplaceFeesMinor)}</td><td data-label="Known Net Profit" className={`numeric ${(row.knownNetProfitMinor ?? 0) < 0 ? 'negative-text' : ''}`}>{row.knownNetProfitMinor === null ? 'Unavailable' : formatMoney(row.knownNetProfitMinor)}</td><td data-label="Margin">{formatPercentage(row.knownMarginBps)}</td><td data-label="Status"><Badge tone={row.profitabilityStatus === 'incomplete' ? 'warning' : row.profitabilityStatus === 'loss_making' ? 'negative' : 'neutral'}>{row.profitabilityStatus.replaceAll('_', ' ')}</Badge></td>
    </tr>)}</tbody></table></div> : <EmptyState title="No sales in this period" description="Expand the date range or change marketplace to find this Product’s transactions." />}
    <p className="section-footnote">Each row opens its profitability waterfall, financial source events and effective-dated cost provenance.</p>
  </section></div>;
}
