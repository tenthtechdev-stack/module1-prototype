import type { TransactionCopilotSnapshot } from '@/src/domain/models';
import type { TransactionDetail } from '@/src/domain/transactions';
import { formatDate, formatMoney } from '@/src/domain/calculations';

export function transactionCopilotSnapshot(detail: TransactionDetail, detailHref: string, canViewCogs: boolean): TransactionCopilotSnapshot {
  const t = detail.transaction;
  const cost = detail.costProvenance;
  const rate = cost.record;
  const inheritance = rate?.inheritance;
  const url = new URL(detailHref, 'https://stock-supplies.invalid');
  const link = (tab: string) => { const next = new URLSearchParams(url.search); next.set('tab', tab); return `${url.pathname}?${next}`; };
  const complete = t.completenessState === 'complete' && detail.sensitiveExpensesVisible;
  const completenessExplanation = !detail.sensitiveExpensesVisible ? 'Expense totals, Net Profit and Margin are restricted for this role and scope. Available cost coverage does not grant access to sensitive financial deductions.' : complete ? 'Profitability is complete: effective-dated COGS and advertising are available for this transaction.'
    : `Profitability is incomplete because ${t.cogsMinor === null ? 'COGS is not available for this Product on the transaction date' : ''}${t.cogsMinor === null && t.advertisingMinor === null ? ' and ' : ''}${t.advertisingMinor === null ? 'advertising is unavailable' : ''}. Missing costs are not treated as zero.`;
  const costExplanation = !canViewCogs ? 'Historical cost records require COGS access. The transaction deduction is included in the canonical profitability calculation.'
    : t.cogsMinor === null ? completenessExplanation
      : `${cost.label}: ${formatMoney(cost.unitCostMinor)} per sold Product, effective ${rate ? formatDate(rate.effectiveFrom) : formatDate(t.transactionDate)}.${inheritance ? ` Inherited from ${inheritance.productGroupName}, ${inheritance.packQuantity} base units per pack, ${formatMoney(inheritance.baseCostMinor, inheritance.currency)} per ${inheritance.baseQuantity} base units. Group cost effective ${formatDate(inheritance.groupCostEffectiveFrom)}.` : ''}${rate?.createdByName ? ` Changed by ${rate.createdByName}.` : ''}${rate?.approvedByName ? ` Approved by ${rate.approvedByName}.` : ''}${rate?.sourceReferenceId ? ` Supporting record: ${rate.sourceReferenceId}.` : ''}`;
  return {
    id: t.id, productTitle: t.title, internalSku: t.internalSku, marketplace: t.marketplace,
    transactionDate: t.transactionDate, quantity: t.quantity, revenueMinor: t.revenueMinor,
    refundsMinor: t.refundsMinor, netRevenueMinor: t.netRevenueMinor, cogsMinor: t.cogsMinor,
    marketplaceFeesMinor: t.marketplaceFeesMinor, advertisingMinor: t.advertisingMinor,
    shippingMinor: t.shippingMinor, otherDirectCostsMinor: t.otherDirectCostsMinor,
    allocatedExpensesMinor: t.allocatedExpensesMinor, knownNetProfitMinor: t.knownNetProfitMinor,
    marginBps: t.knownMarginBps, complete, completenessExplanation, costExplanation,
    expenseExplanation: detail.sensitiveExpensesVisible ? detail.allocationNote : 'Expense totals, Net Profit and Margin are withheld to prevent inference of sensitive expense amounts.',
    feeBreakdown: detail.fees.map((fee) => ({ label: fee.label, amountMinor: fee.amountMinor })),
    references: [{ label: 'Profitability', href: link('profitability') }, { label: 'Source Events', href: link('source-events') }, ...(canViewCogs ? [{ label: 'Product & Cost', href: link('product-cost') }] : [])],
  };
}
