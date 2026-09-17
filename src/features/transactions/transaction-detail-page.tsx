'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight, CheckCircle2, CircleHelp, Sparkles } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState, useAccess } from '@/src/components/rbac/access';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { Alert, Badge, Skeleton } from '@/src/components/ui/feedback';
import { Button } from '@/src/components/ui/actions';
import { EmptyState, ErrorState } from '@/src/components/states/states';
import { MarketplaceBadge } from '@/src/components/product/patterns';
import { ProductThumbnail } from '@/src/features/products/product-thumbnail';
import { useTransaction } from '@/src/services/hooks/use-transactions';
import {
  TRANSACTION_DETAIL_TABS,
  TransactionActivityPanel,
  TransactionIncompleteNotice,
  TransactionMarketplacePanel,
  TransactionMetricBand,
  TransactionOverviewPanel,
  TransactionProductCostPanel,
  TransactionProfitabilityPanel,
  TransactionSourceEventsPanel,
  TransactionStatusBadge,
  askTransactionCopilot,
  transactionDate,
  type TransactionDetailLinks,
  type TransactionDetailTab,
} from '@/src/features/transactions/transaction-detail-components';
import '@/src/features/transactions/transaction-detail.css';

function TransactionDetailLoading() {
  return <div className="transaction-detail-loading" aria-busy="true" role="status" aria-label="Loading transaction identity and profitability"><section><Skeleton /><Skeleton /><Skeleton /></section><section><Skeleton /><Skeleton /><Skeleton /><Skeleton /><Skeleton /><Skeleton /></section></div>;
}

export function TransactionDetailPage({ transactionId }: { transactionId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspace } = useAnalysisContext();
  const transaction = useTransaction(transactionId);
  const productAccess = useAccess('products.view');
  const cogsAccess = useAccess('cogs.view');
  const cogsEdit = useAccess('cogs.edit');
  const auditAccess = useAccess('audit.view');
  const syncAccess = useAccess('sync.view');
  const copilotAccess = useAccess('copilot.use');
  const profitabilityAccess = useAccess('profitability.view');
  const requestedTab = searchParams.get('tab');
  const activeTab: TransactionDetailTab = TRANSACTION_DETAIL_TABS.find((tab) => tab.id === requestedTab)?.id ?? 'overview';
  const base = `/o/${workspace.organisation.slug}`;
  const backParams = new URLSearchParams(searchParams.toString());
  backParams.delete('tab');
  const listHref = `${base}/transactions${backParams.size ? `?${backParams}` : ''}`;

  function tabHref(tab: TransactionDetailTab, anchor?: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === 'overview') next.delete('tab'); else next.set('tab', tab);
    return `${base}/transactions/${encodeURIComponent(transactionId)}${next.size ? `?${next}` : ''}${anchor ? `#${encodeURIComponent(anchor)}` : ''}`;
  }

  function selectTab(tab: TransactionDetailTab) {
    router.replace(tabHref(tab), { scroll: false });
  }

  function handleTabKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TRANSACTION_DETAIL_TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TRANSACTION_DETAIL_TABS.length) % TRANSACTION_DETAIL_TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TRANSACTION_DETAIL_TABS.length - 1;
    else return;
    event.preventDefault();
    const tab = TRANSACTION_DETAIL_TABS[next];
    selectTab(tab.id);
    document.getElementById(`transaction-tab-${tab.id}`)?.focus();
  }

  const notFound = <div className="transaction-detail-page"><Breadcrumbs items={[{ label: 'Transactions', href: listHref }, { label: 'Transaction not found' }]} /><EmptyState title="Transaction not found" description="This transaction does not exist or falls outside your assigned scope." /><Link className="transaction-detail-back" href={listHref}><ArrowLeft size={13} /> Back to Transactions</Link></div>;
  if (!transaction.access.allowed) return transaction.access.reason === 'assignment_out_of_scope' ? notFound : <AccessState decision={transaction.access} />;
  if (transaction.marketplaceState !== 'available') return notFound;
  if (transaction.query.isPending) return <TransactionDetailLoading />;
  if (transaction.query.isError) return <div className="transaction-detail-page"><Link className="transaction-detail-back" href={listHref}><ArrowLeft size={13} /> Back to Transactions</Link><ErrorState title="Transaction could not be loaded" description="We could not retrieve this transaction. Retry to load its financial details." onRetry={() => { void transaction.query.refetch(); }} /></div>;
  const detail = transaction.query.data;
  if (!detail) return notFound;
  const row = detail.transaction;
  const linkedParams = new URLSearchParams(backParams.toString());
  for (const key of ['page', 'pageSize', 'sort', 'direction', 'view', 'search', 'q', 'profitability', 'profitabilityStatus', 'refundState', 'refund', 'cogsSource', 'completeness', 'marginState', 'highFees']) linkedParams.delete(key);
  const linkedQuery = linkedParams.size ? `?${linkedParams}` : '';
  const cogsParams = new URLSearchParams(linkedParams.toString());
  cogsParams.set('product', row.productId);
  if (cogsEdit.allowed) cogsParams.set('action', 'edit');
  const links: TransactionDetailLinks = {
    product: `${base}/products/${encodeURIComponent(row.productId)}${linkedQuery}`,
    group: row.productGroupId ? `${base}/cogs/groups/${encodeURIComponent(row.productGroupId)}${linkedQuery}` : null,
    cogs: `${base}/cogs?${cogsParams}`,
    sync: `${base}/operations/sync-health${linkedQuery}`,
    tab: tabHref,
    transaction: (id) => `${base}/transactions/${encodeURIComponent(id)}${backParams.size ? `?${backParams}` : ''}`,
  };
  const permissions = { canViewProduct: productAccess.allowed, canViewCogs: cogsAccess.allowed, canManageCogs: cogsEdit.allowed, canViewAudit: auditAccess.allowed, canViewSync: syncAccess.allowed, canUseCopilot: copilotAccess.allowed };
  const props = { detail, links, permissions };
  let panel: React.ReactNode;
  if (activeTab === 'product-cost') panel = cogsAccess.allowed ? <TransactionProductCostPanel {...props} /> : <AccessState decision={cogsAccess} />;
  else if (activeTab === 'activity') panel = auditAccess.allowed ? <TransactionActivityPanel {...props} /> : <AccessState decision={auditAccess} />;
  else if (activeTab === 'source-events') panel = <TransactionSourceEventsPanel {...props} />;
  else if (activeTab === 'marketplace') panel = <TransactionMarketplacePanel {...props} />;
  else if (!profitabilityAccess.allowed) panel = <AccessState decision={profitabilityAccess} />;
  else if (activeTab === 'profitability') panel = <TransactionProfitabilityPanel {...props} />;
  else panel = <TransactionOverviewPanel {...props} />;

  return <div className="transaction-detail-page">
    <Breadcrumbs items={[{ label: 'Transactions', href: listHref }, { label: row.marketplaceOrderId }]} />
    <Link className="transaction-detail-back" href={listHref}><ArrowLeft size={13} /> Back to Transactions</Link>
    <section className="transaction-detail-hero" aria-labelledby="transaction-detail-title"><div className="transaction-detail-hero-top"><div className="transaction-detail-identity"><ProductThumbnail category={row.product.category} size="large" /><div><div className="transaction-detail-order"><MarketplaceBadge marketplace={row.marketplace} /><span>Order <span className="mono-cell">{row.marketplaceOrderId}</span></span></div><h1 id="transaction-detail-title">{row.title}</h1><p>Internal SKU <span className="mono-cell">{row.internalSku}</span><span aria-hidden="true">·</span>Marketplace SKU <span className="mono-cell">{row.marketplaceSku}</span></p><div className="transaction-detail-status"><TransactionStatusBadge transaction={row} /><Badge tone={row.completenessState === 'complete' ? 'positive' : 'warning'}>{row.completenessState === 'complete' ? <CheckCircle2 size={11} /> : <CircleHelp size={11} />}{row.completenessState === 'complete' ? 'Profitability complete' : 'Profitability incomplete'}</Badge></div></div></div><div className="transaction-detail-actions">{productAccess.allowed ? <Link className="ui-button secondary compact" href={links.product}>View Product <ArrowUpRight size={12} /></Link> : null}{copilotAccess.allowed ? <Button size="compact" onClick={() => askTransactionCopilot(row.knownNetProfitMinor === null ? 'Why is profitability incomplete?' : row.knownNetProfitMinor < 0 ? 'Why did this transaction lose money?' : 'Explain this transaction’s profitability.')}><Sparkles size={13} /> Ask Copilot</Button> : null}</div></div><dl className="transaction-detail-meta"><div><dt>Company</dt><dd>{row.companyName}</dd></div><div><dt>Marketplace account</dt><dd>{row.marketplaceAccountName}</dd></div><div><dt>Transaction date</dt><dd>{transactionDate(row.transactionDate)}</dd></div><div><dt>Transaction / line reference</dt><dd className="mono-cell">{row.id}</dd></div></dl></section>
    {row.freshness.state !== 'fresh' ? <Alert tone={row.freshness.state === 'error' ? 'negative' : row.freshness.state === 'syncing' ? 'info' : 'warning'} title={row.freshness.label}>{row.freshness.detail} {syncAccess.allowed ? <Link className="transaction-detail-link" href={links.sync}>View Sync Health <ArrowUpRight size={11} /></Link> : null}</Alert> : null}
    {profitabilityAccess.allowed ? <><TransactionMetricBand transaction={row} /><TransactionIncompleteNotice {...props} /></> : null}
    <section className="transaction-detail-tabs"><div role="tablist" aria-label="Transaction detail sections">{TRANSACTION_DETAIL_TABS.map((tab, index) => <button type="button" role="tab" id={`transaction-tab-${tab.id}`} key={tab.id} aria-selected={activeTab === tab.id} aria-controls={`transaction-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)} onKeyDown={(event) => handleTabKey(event, index)}>{tab.label}</button>)}</div><div role="tabpanel" id={`transaction-panel-${activeTab}`} aria-labelledby={`transaction-tab-${activeTab}`} tabIndex={0}>{panel}</div></section>
  </div>;
}
