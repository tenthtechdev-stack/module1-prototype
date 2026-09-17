import type { TransactionCopilotSnapshot } from '@/src/domain/models';
import { formatDate, formatMoney, formatPercentage } from '@/src/domain/calculations';
import type { CopilotPanelData } from '@/src/services/contracts';

export const TRANSACTION_PROMPTS = [
  'Why did this transaction lose money?',
  'Explain the marketplace fees.',
  'Where did the COGS come from?',
  'Was this transaction refunded?',
  'Why is profitability incomplete?',
  'Which cost had the biggest impact?',
];

const money = (value: number | null) => value === null ? 'unavailable' : formatMoney(value);

function outcome(t: TransactionCopilotSnapshot) {
  if (t.knownNetProfitMinor === null) return `A complete Net Profit is unavailable. ${t.completenessExplanation}`;
  return `This transaction ${t.knownNetProfitMinor < 0 ? 'lost' : 'made'} ${formatMoney(Math.abs(t.knownNetProfitMinor))}, with ${formatPercentage(t.marginBps)} margin on ${money(t.netRevenueMinor)} Net Revenue. ${t.expenseExplanation}`;
}

function costs(t: TransactionCopilotSnapshot) {
  return [
    { label: 'COGS', amountMinor: t.cogsMinor },
    { label: 'Marketplace fees', amountMinor: t.marketplaceFeesMinor },
    { label: 'Advertising', amountMinor: t.advertisingMinor },
    { label: 'Shipping', amountMinor: t.shippingMinor },
    { label: 'Other direct costs', amountMinor: t.otherDirectCostsMinor },
    { label: 'Allocated expenses', amountMinor: t.allocatedExpensesMinor },
  ];
}

export function explainTransaction(question: string, t: TransactionCopilotSnapshot) {
  const q = question.toLowerCase();
  const scope = `${t.productTitle} (${t.internalSku}), ${formatDate(t.transactionDate)}; transaction ${t.id}.`;
  if (/\b(edit|change|modify|approve|create|issue|process|delete|update|cancel)\b/.test(q)) {
    return `Transactions are analytical. Copilot can explain values and navigate to supporting records; it cannot change sales, fees, costs, orders or refunds. ${scope}`;
  }
  if (q.includes('incomplete') || q.includes('complete')) return `${t.completenessExplanation} ${t.expenseExplanation} ${scope}`;
  if (q.includes('cogs') || q.includes('cost come') || q.includes('cost source')) return `${t.costExplanation} Transaction COGS is ${money(t.cogsMinor)} for ${t.quantity} sold Product units. ${scope}`;
  if (q.includes('fee')) return `Marketplace fees total ${money(t.marketplaceFeesMinor)}: ${t.feeBreakdown.map((f) => `${f.label} ${money(f.amountMinor)}`).join('; ') || 'no fee events for this sale'}. Each represented component links to a financial source event. No automatic fee reversal is assumed for refunds. ${scope}`;
  if (q.includes('refund')) return `${t.refundsMinor > 0 ? `This sale has a ${t.refundsMinor >= t.revenueMinor ? 'full' : 'partial'} refund of ${money(t.refundsMinor)}. Revenue is ${money(t.revenueMinor)} and Net Revenue is ${money(t.netRevenueMinor)}. The canonical model retains COGS and recorded fees; it does not model inventory return reversals.` : 'No refund is recorded for this transaction.'} ${scope}`;
  if (q.includes('biggest') || q.includes('impact')) {
    const largest = costs(t).filter((c) => c.amountMinor !== null).sort((a, b) => (b.amountMinor as number) - (a.amountMinor as number))[0];
    return `${largest ? `${largest.label} is the largest visible recorded deduction at ${money(largest.amountMinor)}.` : 'No covered costs are available.'} ${t.allocatedExpensesMinor === null ? 'Sensitive allocated expenses are restricted and cannot be ranked here.' : ''} ${t.completenessExplanation} ${scope}`;
  }
  return `${outcome(t)} Revenue ${money(t.revenueMinor)}, refunds ${money(t.refundsMinor)}. ${costs(t).filter((c) => c.label !== 'Allocated expenses' || c.amountMinor !== null).map((c) => `${c.label} ${money(c.amountMinor)}`).join('; ')}. ${t.costExplanation} Advertising follows the fixture attribution model and is not a claim of exact marketplace attribution. ${scope}`;
}

export function transactionCopilotOverview(t: TransactionCopilotSnapshot): CopilotPanelData {
  return {
    prompts: TRANSACTION_PROMPTS,
    summary: outcome(t),
    findings: [
      { id: 'transaction-revenue', title: `${money(t.revenueMinor)} revenue · ${t.quantity} sold Product units`, detail: `${money(t.refundsMinor)} refunds; ${money(t.netRevenueMinor)} Net Revenue.`, tone: 'neutral' },
      { id: 'transaction-cost', title: `COGS ${money(t.cogsMinor)}`, detail: t.costExplanation, tone: t.cogsMinor === null ? 'warning' : 'neutral' },
      { id: 'transaction-result', title: t.complete ? 'Profitability complete' : 'Profitability incomplete', detail: t.completenessExplanation, tone: !t.complete ? 'warning' : (t.knownNetProfitMinor ?? 0) < 0 ? 'negative' : 'positive' },
    ],
    references: t.references,
    dataCompleteness: `${t.expenseExplanation} These are the repository-calculated transaction values and historical cost provenance. Missing costs remain unknown.`,
    finding: { title: `${t.productTitle} · ${t.id}`, affectedRevenuePence: t.complete ? 0 : t.revenueMinor },
    anomaly: !t.complete ? { title: 'Incomplete profitability', detail: t.completenessExplanation } : null,
    approval: null,
  };
}
