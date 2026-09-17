'use client';

import Link from 'next/link';
import { ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, CircleHelp, Clock3, FileText, History, Info, Layers3, ShieldCheck, Sparkles, TriangleAlert, Undo2 } from 'lucide-react';
import { Alert, Badge } from '@/src/components/ui/feedback';
import { EmptyState } from '@/src/components/states/states';
import { MarketplaceBadge } from '@/src/components/product/patterns';
import { formatDate, formatInteger, formatMoney, formatPercentage } from '@/src/domain/calculations';
import type { FinancialSourceEvent, ProfitabilityTransaction, TransactionDetail, TransactionWaterfallRow } from '@/src/domain/transactions';

export const TRANSACTION_DETAIL_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'profitability', label: 'Profitability' },
  { id: 'source-events', label: 'Source Events' },
  { id: 'product-cost', label: 'Product & Cost' },
  { id: 'marketplace', label: 'Marketplace' },
  { id: 'activity', label: 'Activity' },
] as const;
export type TransactionDetailTab = (typeof TRANSACTION_DETAIL_TABS)[number]['id'];

export interface TransactionDetailLinks {
  product: string;
  group: string | null;
  cogs: string;
  sync: string;
  tab: (tab: TransactionDetailTab, anchor?: string) => string;
  transaction: (id: string) => string;
}
export interface TransactionDetailPermissions {
  canViewProduct: boolean;
  canViewCogs: boolean;
  canManageCogs: boolean;
  canViewAudit: boolean;
  canViewSync: boolean;
  canUseCopilot: boolean;
}
interface PanelProps { detail: TransactionDetail; links: TransactionDetailLinks; permissions: TransactionDetailPermissions }

export function transactionDate(value: string, time = false) {
  return formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) });
}

export function TransactionStatusBadge({ transaction }: { transaction: ProfitabilityTransaction }) {
  const status = transaction.profitabilityStatus;
  const Icon = status === 'incomplete' ? CircleHelp : status === 'refunded' ? Undo2 : status === 'profitable' ? CheckCircle2 : TriangleAlert;
  const tone = status === 'loss_making' ? 'negative' : status === 'incomplete' || status === 'low_margin' ? 'warning' : status === 'refunded' ? 'info' : 'positive';
  const label = { profitable: 'Profitable', low_margin: 'Low margin', loss_making: 'Loss-making', incomplete: 'Incomplete', refunded: 'Refunded' }[status];
  return <Badge tone={tone}><Icon size={11} aria-hidden="true" />{label}</Badge>;
}

export function askTransactionCopilot(prompt: string) {
  window.dispatchEvent(new CustomEvent('stock-supplies:ask-copilot', { detail: { prompt } }));
  document.querySelector<HTMLButtonElement>('.copilot-button')?.click();
}

export function TransactionIncompleteNotice({ detail, links, permissions }: PanelProps) {
  const transaction = detail.transaction;
  if (transaction.completenessState === 'complete') return null;
  const missingCogs = transaction.cogsMinor === null;
  const missingAdvertising = transaction.advertisingMinor === null;
  return <Alert tone="warning" title="Profitability is incomplete">
    {missingCogs ? 'COGS is not available for this Product on the transaction date. ' : ''}
    {missingAdvertising ? 'Advertising attribution is unavailable for this transaction. ' : ''}
    Known Net Profit and margin are unavailable until the missing costs are covered.
    {missingCogs && permissions.canViewCogs ? <> <Link href={permissions.canManageCogs ? links.cogs : links.tab('product-cost')} className="transaction-detail-link">Review COGS <ArrowUpRight size={12} /></Link></> : null}
  </Alert>;
}

export function TransactionMetricBand({ transaction }: { transaction: ProfitabilityTransaction }) {
  return <dl className="transaction-detail-metrics" aria-label="Transaction financial summary">
    <div><dt>Revenue</dt><dd>{formatMoney(transaction.revenueMinor)}</dd><small>After discounts</small></div>
    <div><dt>Units sold</dt><dd>{formatInteger(transaction.quantity)}</dd><small>Listing quantity</small></div>
    <div><dt>Refunds</dt><dd>{formatMoney(transaction.refundsMinor)}</dd><small>{transaction.refundState === 'none' ? 'No refund' : transaction.refundState === 'full' ? 'Full refund' : 'Partial refund'}</small></div>
    <div><dt>{transaction.completenessState === 'complete' ? 'Net Profit' : 'Known Net Profit'}</dt><dd className={transaction.knownNetProfitMinor === null ? 'unavailable' : transaction.knownNetProfitMinor < 0 ? 'negative' : ''}>{transaction.knownNetProfitMinor === null ? 'Unavailable' : formatMoney(transaction.knownNetProfitMinor)}</dd><small>After applicable expenses</small></div>
    <div><dt>Margin</dt><dd className={transaction.knownMarginBps === null ? 'unavailable' : transaction.knownMarginBps < 0 ? 'negative' : ''}>{transaction.knownMarginBps === null ? 'Unavailable' : formatPercentage(transaction.knownMarginBps)}</dd><small>Net Profit ÷ Net Revenue</small></div>
    <div><dt>Profitability coverage</dt><dd>{formatPercentage(transaction.profitabilityCoverageBps)}</dd><small>{transaction.completenessState === 'complete' ? 'Profitability complete' : 'Profitability incomplete'}</small></div>
  </dl>;
}

function signedMoney(value: number, currency = 'GBP') {
  return `${value > 0 ? '+' : ''}${formatMoney(value, currency)}`;
}

function waterfallValue(row: TransactionWaterfallRow) {
  if (row.method === 'restricted') return 'Restricted';
  if (row.amountMinor === null) return row.operation === 'result' ? 'Unavailable' : 'Unknown';
  return formatMoney(row.operation === 'subtract' ? -row.amountMinor : row.amountMinor);
}

function WaterfallInspection({ row, detail, links, permissions }: PanelProps & { row: TransactionWaterfallRow }) {
  const events = detail.sourceEvents.filter((event) => row.sourceEventIds.includes(event.id));
  const record = detail.costProvenance.record;
  return <div className="transaction-waterfall-inspection">
    <p>{row.note}</p>
    <dl className="transaction-definition-list">
      <div><dt>Source</dt><dd>{row.source}</dd></div>
      <div><dt>Method</dt><dd>{row.method[0].toUpperCase() + row.method.slice(1)}</dd></div>
      <div><dt>{row.key === 'cogs' ? 'Cost effective from' : 'Applicable date'}</dt><dd>{transactionDate(row.sourceDate)}</dd></div>
      <div><dt>Reporting amount</dt><dd>{waterfallValue(row)}{row.amountMinor !== null ? ' GBP' : ''}</dd></div>
    </dl>
    {row.key === 'revenue' ? <div className="transaction-fee-lines"><div><span>Gross sales</span><strong>{formatMoney(detail.transaction.grossSalesMinor)}</strong></div><div><span>Discounts and promotions</span><strong>{formatMoney(-detail.transaction.discountsMinor)}</strong></div><div><span>Revenue</span><strong>{formatMoney(detail.transaction.revenueMinor)}</strong></div></div> : null}
    {row.key === 'marketplaceFees' ? <div className="transaction-fee-lines" aria-label="Marketplace fee breakdown">{detail.fees.map((fee) => <div key={fee.key}><span><Link className="transaction-detail-link" href={links.tab('source-events', `event-${fee.sourceEventId}`)}>{fee.label}<ArrowUpRight size={11} /></Link><small>Supported by a financial source event</small></span><strong>{formatMoney(-fee.amountMinor)}</strong></div>)}</div> : null}
    {row.key === 'refunds' ? <p>{detail.transaction.refundState === 'full' ? 'This sale has been fully refunded. ' : detail.transaction.refundState === 'partial' ? 'This sale has been partially refunded. ' : ''}{detail.refundNote}</p> : null}
    {row.key === 'advertising' ? <p>{detail.advertisingNote}</p> : null}
    {row.key === 'allocatedExpenses' ? <p>{detail.allocationNote}{!detail.sensitiveExpensesVisible ? ' Sensitive expense amounts are restricted for your role; the applicable deduction remains included in Net Profit.' : ''}</p> : null}
    {row.key === 'cogs' ? <>
      <p>{detail.costProvenance.note}</p>
      {permissions.canViewCogs && record ? <dl className="transaction-definition-list"><div><dt>Unit COGS per sold Product (GBP)</dt><dd>{formatMoney(detail.costProvenance.unitCostMinor)}</dd></div><div><dt>Sold quantity</dt><dd>{formatInteger(detail.transaction.quantity)} listing units</dd></div><div><dt>Cost record</dt><dd>{record.id}</dd></div><div><dt>Approval</dt><dd>{record.approvedByName ?? 'Approved cost record'}{record.approvedAt ? ` · ${transactionDate(record.approvedAt)}` : ''}</dd></div></dl> : null}
      {permissions.canViewCogs ? <Link className="transaction-detail-link" href={links.tab('product-cost')}>Inspect {detail.costProvenance.source === 'inherited' ? 'Product Group' : 'Product'} cost provenance <ArrowRight size={12} /></Link> : <p>Your role can inspect the transaction COGS deduction. Cost records require COGS access.</p>}
    </> : null}
    {events.length ? <div className="transaction-fee-lines" aria-label={`${row.label} source evidence`}>{events.map((event) => <div key={event.id}><span><Link className="transaction-detail-link" href={links.tab('source-events', `event-${event.id}`)}>{event.label}<ArrowUpRight size={11} /></Link><small>{transactionDate(event.sourceTimestamp, true)} · {event.sourceReference}</small></span><strong>{signedMoney(event.reportingAmountMinor)}</strong></div>)}</div> : null}
  </div>;
}

export function TransactionWaterfall(props: PanelProps) {
  const { detail } = props;
  const denominator = Math.max(1, ...detail.waterfall.map((row) => Math.abs(row.amountMinor ?? 0)));
  return <section className="transaction-waterfall" aria-labelledby="transaction-waterfall-title">
    <header><div><h2 id="transaction-waterfall-title">From revenue to Net Profit</h2><p>Every amount has a source. Expand a row to inspect the supporting record.</p></div><Badge>GBP</Badge></header>
    <div className="transaction-waterfall-list">{detail.waterfall.map((row) => <details id={`component-${row.key}`} className={`transaction-waterfall-row ${row.operation}${row.amountMinor === null ? ' unknown' : ''}`} key={row.key}>
      <summary aria-label={`${row.label}, ${waterfallValue(row)}${row.operation === 'subtract' && (row.amountMinor ?? 0) > 0 ? ', deduction' : ''}; inspect source`}><span className="transaction-waterfall-label">{row.label}<small>{row.method === 'restricted' ? 'Sensitive cost · included in total' : row.source}</small></span><span className="transaction-waterfall-bar" aria-hidden="true"><i style={{ width: `${row.amountMinor === null ? 0 : Math.max(2, Math.abs(row.amountMinor) / denominator * 100)}%` }} /></span><strong className={row.operation === 'result' && (row.amountMinor ?? 0) < 0 ? 'negative' : ''}>{waterfallValue(row)}</strong><ChevronDown size={14} aria-hidden="true" /></summary>
      <WaterfallInspection {...props} row={row} />
    </details>)}</div>
    <p className="transaction-detail-note" style={{ marginTop: 12 }}><ShieldCheck size={14} /><span>{detail.sensitiveExpensesVisible ? 'All deductions and the final total use the same canonical minor-unit calculation as Dashboard and Product profitability.' : 'Net Profit includes applicable expenses. Sensitive expense amounts are restricted for your role.'} {detail.transaction.completenessState !== 'complete' ? 'Unknown costs are never treated as zero.' : ''}</span></p>
  </section>;
}

function TransactionExplanation({ detail, links, permissions }: PanelProps) {
  const row = detail.transaction;
  return <aside className="transaction-detail-aside">
    <div className="transaction-detail-status"><TransactionStatusBadge transaction={row} />{row.highFees ? <Badge tone="warning">High fees</Badge> : null}</div>
    <h2>{row.knownNetProfitMinor === null ? 'A complete profit needs complete costs' : row.knownNetProfitMinor < 0 ? 'Understand the loss' : 'Understand this contribution'}</h2>
    <p>{row.knownNetProfitMinor === null ? 'A profit-critical cost is unavailable on the transaction date. Inspect the incomplete rows before using this sale in a profitability decision.' : <>This sale generated <strong>{formatMoney(row.netRevenueMinor)}</strong> in Net Revenue and <strong>{formatMoney(row.knownNetProfitMinor)}</strong> in Net Profit after applicable deductions.</>}</p>
    <dl className="transaction-definition-list"><div><dt>COGS source</dt><dd>{row.cogsSourceLabel}</dd></div><div><dt>Refund treatment</dt><dd>{row.refundState === 'none' ? 'No refund' : row.refundState === 'full' ? 'Full refund' : 'Partial refund'}</dd></div><div><dt>Financial source events</dt><dd>{formatInteger(row.sourceEventCount)}</dd></div><div><dt>Sold quantity</dt><dd>{formatInteger(row.quantity)} listing units</dd></div></dl>
    {permissions.canViewCogs ? <Link href={links.tab('product-cost')} className="transaction-detail-link">Trace COGS to its cost record <ArrowRight size={12} /></Link> : null}
    <Link href={links.tab('source-events')} className="transaction-detail-link">Inspect financial source events <ArrowRight size={12} /></Link>
    {permissions.canUseCopilot ? <><h2><Sparkles size={13} style={{ display: 'inline', marginRight: 5 }} /> Ask about this transaction</h2><div className="transaction-copilot-prompts">{[row.knownNetProfitMinor === null ? 'Why is profitability incomplete?' : row.knownNetProfitMinor < 0 ? 'Why did this transaction lose money?' : 'Which cost had the biggest impact?', 'Explain the marketplace fees.', ...(permissions.canViewCogs ? ['Where did the COGS come from?'] : [])].map((prompt) => <button type="button" key={prompt} onClick={() => askTransactionCopilot(prompt)}>{prompt}<ArrowRight size={13} /></button>)}</div></> : null}
  </aside>;
}

export function TransactionOverviewPanel(props: PanelProps) {
  const { detail, links, permissions } = props;
  return <div className="transaction-tab-stack">
    <div className="transaction-detail-columns"><TransactionWaterfall {...props} /><TransactionExplanation {...props} /></div>
    <section className="transaction-detail-section"><header><div><h2>Transaction identity</h2><p>A canonical sale line for profitability analysis.</p></div></header><dl className="transaction-definition-list"><div><dt>Marketplace Order ID</dt><dd className="mono-cell">{detail.transaction.marketplaceOrderId}</dd></div><div><dt>Transaction / line reference</dt><dd className="mono-cell">{detail.transaction.id} / {detail.transaction.marketplaceOrderLineId}</dd></div><div><dt>Product</dt><dd>{permissions.canViewProduct ? <Link className="transaction-detail-link" href={links.product}>{detail.transaction.title} <ArrowUpRight size={11} /></Link> : detail.transaction.title}</dd></div><div><dt>Listing identifier</dt><dd className="mono-cell">{detail.transaction.listingIdentifier}</dd></div></dl></section>
    {detail.orderTransactionCount > 1 ? <section className="transaction-detail-section"><header><div><h2>Other sale lines in this Order</h2><p>This marketplace Order contains {detail.orderTransactionCount} authorised profitability transactions.</p></div></header><div className="transaction-fee-lines">{detail.relatedTransactions.filter((row) => row.id !== detail.transaction.id && row.marketplaceOrderId === detail.transaction.marketplaceOrderId).map((row) => <div key={row.id}><span><Link className="transaction-detail-link" href={links.transaction(row.id)}>{row.title}<ArrowUpRight size={11} /></Link><small>{row.internalSku} · {formatInteger(row.quantity)} units</small></span><strong>{formatMoney(row.revenueMinor)}</strong></div>)}</div></section> : null}
  </div>;
}

export function TransactionProfitabilityPanel(props: PanelProps) {
  return <div className="transaction-tab-stack"><div className="transaction-detail-columns"><TransactionWaterfall {...props} /><TransactionExplanation {...props} /></div><p className="transaction-detail-note"><Info size={14} /><span>{props.detail.refundNote} {props.detail.advertisingNote}</span></p></div>;
}

function SourceEvent({ event }: { event: FinancialSourceEvent }) {
  const converted = event.currency !== event.reportingCurrency;
  return <details className="transaction-source-event" id={`event-${event.id}`}>
    <summary><div><strong>{event.label}</strong><small><time dateTime={event.sourceTimestamp}>{transactionDate(event.sourceTimestamp, true)}</time></small></div><span className={event.reportingAmountMinor > 0 ? 'credit' : ''} aria-label={`${event.reportingAmountMinor < 0 ? 'Deduction' : event.reportingAmountMinor > 0 ? 'Credit' : 'No charge'} ${formatMoney(Math.abs(event.reportingAmountMinor))}`}>{signedMoney(event.reportingAmountMinor)}</span><ChevronDown size={13} aria-hidden="true" /></summary>
    <div><p>{event.description}</p><dl className="transaction-definition-list"><div className="full"><dt>Source reference</dt><dd className="mono-cell">{event.sourceReference}</dd></div><div><dt>Event type</dt><dd>{event.eventType.replaceAll('-', ' ')}</dd></div><div><dt>Marketplace</dt><dd><MarketplaceBadge marketplace={event.marketplace} /></dd></div><div><dt>{converted ? 'Source amount' : 'Amount (GBP)'}</dt><dd>{signedMoney(event.amountMinor, event.currency)}</dd></div>{converted ? <><div><dt>Reporting amount (GBP)</dt><dd>{signedMoney(event.reportingAmountMinor)}</dd></div><div><dt>FX rate</dt><dd>1 {event.currency} = {(event.sourceToReportingRateBps / 10000).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} GBP</dd></div><div><dt>FX basis</dt><dd>Canonical deterministic reporting rate</dd></div></> : null}{event.syncJobId ? <div className="full"><dt>Source batch / sync reference</dt><dd className="mono-cell">{event.syncJobId}</dd></div> : null}</dl><p>{event.evidenceNote}</p></div>
  </details>;
}

export function TransactionSourceEventsPanel({ detail }: PanelProps) {
  const events = [...detail.sourceEvents].sort((left, right) => left.sourceTimestamp.localeCompare(right.sourceTimestamp) || left.id.localeCompare(right.id));
  return <section className="transaction-detail-section transaction-tab-stack"><header><div><h2>Financial source events</h2><p>Chronological evidence for this sale line. Positive amounts add contribution; negative amounts deduct it.</p></div><Badge>{events.length} events</Badge></header>{events.length ? <ol className="transaction-source-timeline" aria-label="Financial source event timeline">{events.map((event) => <li key={event.id}><span className="transaction-event-icon" aria-hidden="true">{event.eventType === 'refund' ? <Undo2 size={13} /> : <FileText size={13} />}</span><SourceEvent event={event} /></li>)}</ol> : <EmptyState title="No source events available" description="Source evidence has not arrived for this transaction." />}<p className="transaction-detail-note"><Info size={14} /><span>COGS and allocated expenses come from internal cost records and the canonical allocation rule. They are explained in Profitability and Product &amp; Cost.</span></p></section>;
}

function costPeriod(from: string, to: string | null) {
  if (!to) return `${transactionDate(from)} onward`;
  const end = new Date(`${to.slice(0, 10)}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  return `${transactionDate(from)} – ${transactionDate(end.toISOString())}`;
}

export function TransactionProductCostPanel({ detail, links, permissions }: PanelProps) {
  const cost = detail.costProvenance;
  const record = cost.record;
  const inherited = record?.inheritance;
  return <div className="transaction-tab-stack">
    <section className="transaction-detail-section"><header><div><h2>COGS applied to this sale</h2><p>Cost and Pack Quantity are resolved on {transactionDate(detail.transaction.transactionDate)}.</p></div><Badge tone={cost.source === 'missing' ? 'warning' : 'info'}>{cost.label}</Badge></header>
      <dl className="transaction-definition-list"><div><dt>Product</dt><dd>{permissions.canViewProduct ? <Link className="transaction-detail-link" href={links.product}>{detail.transaction.title}<ArrowUpRight size={11} /></Link> : detail.transaction.title}</dd></div><div><dt>Internal SKU</dt><dd className="mono-cell">{detail.transaction.internalSku}</dd></div><div><dt>Product Group</dt><dd>{cost.productGroupName ?? 'No applicable Group membership'}</dd></div><div><dt>Transaction date</dt><dd>{transactionDate(detail.transaction.transactionDate)}</dd></div></dl>
    </section>
    <div className="transaction-cost-calculation" aria-label="Quantity-adjusted transaction COGS in GBP"><div><small>COGS per sold Product (GBP)</small><strong>{cost.unitCostMinor === null ? 'Unknown' : formatMoney(cost.unitCostMinor)}</strong></div><span aria-label="multiplied by">×</span><div><small>Sold listing quantity</small><strong>{formatInteger(cost.quantity)}</strong></div><span aria-label="equals">=</span><div><small>Transaction COGS (GBP)</small><strong>{cost.totalCogsMinor === null ? 'Unknown' : formatMoney(cost.totalCogsMinor)}</strong></div></div>
    {record ? <section className="transaction-provenance-record"><header><div>{inherited ? <Layers3 size={16} /> : <FileText size={16} />}<h3>{inherited ? 'Inherited Product Group cost' : 'Direct Product cost record'}</h3></div><Badge tone="positive"><CheckCircle2 size={11} /> Approved</Badge></header>
      <dl className="transaction-definition-list"><div><dt>Cost source</dt><dd>{cost.label}{record.source ? ` · ${record.source.replaceAll('-', ' ')}` : ''}</dd></div><div><dt>Effective period</dt><dd>{costPeriod(record.effectiveFrom, record.effectiveTo)}</dd></div>{record.currency !== 'GBP' ? <div><dt>Source unit COGS ({record.currency})</dt><dd>{formatMoney(record.unitCostMinor, record.currency)}</dd></div> : null}
        {inherited ? <><div><dt>Product Group</dt><dd>{inherited.productGroupName}</dd></div><div><dt>Pack Quantity</dt><dd>{formatInteger(inherited.packQuantity)} base units per sold Product</dd></div><div><dt>Group Base Cost</dt><dd>{formatMoney(inherited.baseCostMinor, inherited.currency)}</dd></div><div><dt>Group Base Quantity</dt><dd>{formatInteger(inherited.baseQuantity)} base units</dd></div><div><dt>Group cost effective from</dt><dd>{transactionDate(inherited.groupCostEffectiveFrom)}</dd></div><div><dt>Pack Quantity effective from</dt><dd>{transactionDate(inherited.membershipEffectiveFrom)}</dd></div><div className="full"><dt>Applicable Group cost record</dt><dd className="mono-cell">{inherited.groupCostRecordId}</dd></div><div className="full"><dt>Applicable membership record</dt><dd className="mono-cell">{inherited.membershipId}</dd></div></> : null}
        <div><dt>Changed by</dt><dd>{record.createdByName ?? 'Approved costing source'}{record.createdAt ? ` · ${transactionDate(record.createdAt)}` : ''}</dd></div><div><dt>Approved by</dt><dd>{record.approvedByName ?? 'Approved costing source'}{record.approvedAt ? ` · ${transactionDate(record.approvedAt)}` : ''}</dd></div><div className="full"><dt>Cost record reference</dt><dd className="mono-cell">{record.id}</dd></div>{record.sourceReferenceId ? <div className="full"><dt>Import / source reference</dt><dd className="mono-cell">{record.sourceReferenceId}</dd></div> : null}{record.reason ? <div className="full"><dt>Reason</dt><dd>{record.reason}</dd></div> : null}</dl>
      <p className="transaction-detail-note"><Info size={14} /><span>{cost.note} {inherited ? `${formatInteger(cost.quantity)} sold listing units each contain ${formatInteger(inherited.packQuantity)} base units. Sold quantity and Pack Quantity are different.` : 'A direct Product cost takes precedence over an inherited Group cost only while its effective period applies.'}</span></p>
    </section> : <Alert tone="warning" title="No applicable COGS record">Profitability is incomplete because COGS is not available for this Product on the transaction date. {cost.note}</Alert>}
    <div className="transaction-detail-actions">{permissions.canViewProduct ? <Link href={links.product} className="ui-button secondary compact">View Product <ArrowUpRight size={12} /></Link> : null}{links.group ? <Link href={links.group} className="ui-button secondary compact">View Product Group <ArrowUpRight size={12} /></Link> : null}{permissions.canManageCogs ? <Link href={links.cogs} className="ui-button primary compact">Manage COGS <ArrowUpRight size={12} /></Link> : null}</div>
    <p className="transaction-detail-note"><History size={14} /><span>Historical transactions retain the cost and membership effective on the sale date. {detail.refundNote}</span></p>
  </div>;
}

export function TransactionMarketplacePanel({ detail, links, permissions }: PanelProps) {
  const row = detail.transaction;
  return <section className="transaction-detail-section transaction-tab-stack"><header><div><h2>Marketplace context</h2><p>Read-only marketplace identity and source freshness for this transaction.</p></div><MarketplaceBadge marketplace={row.marketplace} /></header><dl className="transaction-definition-list"><div><dt>Account / store</dt><dd>{row.marketplaceAccountName}</dd></div><div><dt>Company</dt><dd>{row.companyName}</dd></div><div><dt>Marketplace Order ID</dt><dd className="mono-cell">{row.marketplaceOrderId}</dd></div><div><dt>Order line</dt><dd className="mono-cell">{row.marketplaceOrderLineId}</dd></div><div><dt>Marketplace SKU</dt><dd className="mono-cell">{row.marketplaceSku}</dd></div><div><dt>Listing identifier</dt><dd className="mono-cell">{row.listingIdentifier}</dd></div>{detail.listing.fulfilmentType ? <div><dt>Fulfilment type</dt><dd>{detail.listing.fulfilmentType}</dd></div> : null}<div><dt>Source data status</dt><dd>{row.freshness.label}</dd></div><div><dt>Last successful marketplace sync</dt><dd>{detail.account.lastSuccessfulSyncAt ? transactionDate(detail.account.lastSuccessfulSyncAt, true) : 'No successful sync yet'}</dd></div><div><dt>Source currency</dt><dd>{row.sourceCurrency}</dd></div><div><dt>Reporting currency</dt><dd>GBP</dd></div></dl><p className="transaction-detail-note"><Clock3 size={14} /><span>{row.freshness.detail}</span></p>{permissions.canViewSync ? <Link className="transaction-detail-link" href={links.sync}>View Sync Health <ArrowRight size={12} /></Link> : null}</section>;
}

export function TransactionActivityPanel({ detail }: PanelProps) {
  return <section className="transaction-detail-section transaction-tab-stack"><header><div><h2>Internal activity &amp; cost provenance</h2><p>Stock Supplies cost approval and recalculation history. Marketplace financial events are shown in Source Events.</p></div></header>{detail.activity.length ? <ol className="transaction-activity-timeline" aria-label="Internal transaction activity">{detail.activity.map((event) => <li key={event.id}><span className="transaction-event-icon" aria-hidden="true"><History size={13} /></span><article><header><strong>{event.title}</strong><time dateTime={event.occurredAt}>{transactionDate(event.occurredAt, true)}</time></header><p>{event.description}</p><p>{event.actor}{event.sourceReferenceId ? ` · ${event.sourceReferenceId}` : ''}</p></article></li>)}</ol> : <EmptyState title="No internal activity" description="Applicable cost approvals and relevant recalculation activity will appear here." />}</section>;
}
