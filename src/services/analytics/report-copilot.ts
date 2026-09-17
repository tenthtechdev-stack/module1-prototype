import type { ReportResult, ReportStatementRow, ReportRow } from '@/src/domain/reports';
import type { CopilotPanelData } from '@/src/services/contracts';
import { formatMoney, formatPercentage, formatDate } from '@/src/domain/calculations';

export interface ReportCopilotSnapshot extends Pick<ReportResult, 'kind' | 'title' | 'context' | 'currency' | 'totals' | 'statement' | 'comparison' | 'freshness' | 'healthNotes' | 'sensitiveExpensesVisible' | 'expenseSummary' | 'allocationNote' | 'refundNote' | 'columns' | 'rows' | 'total' | 'groupBy'> { href: string; }
/** Project an authorised repository response; no fixture access or financial recomputation. */
export function reportCopilotSnapshot(result: ReportResult, href: string): ReportCopilotSnapshot {
  return {
    kind: result.kind, title: result.title, context: result.context, currency: result.currency,
    totals: result.totals, statement: result.statement, comparison: result.comparison, freshness: result.freshness,
    healthNotes: result.healthNotes, sensitiveExpensesVisible: result.sensitiveExpensesVisible, expenseSummary: result.expenseSummary,
    allocationNote: result.allocationNote, refundNote: result.refundNote, columns: result.columns, rows: result.rows,
    total: result.total, groupBy: result.groupBy, href,
  };
}
export const REPORT_PROMPTS = {
  'p-and-l': ['Summarise this P&L.', 'Why did Net Profit decrease?', 'Which cost increased most?', 'Is profitability complete?'],
  'product-profitability': ['Which Products contribute the most profit?', 'Which Product Groups are loss-making?', 'Which Products have incomplete profitability?'],
  'marketplace-profitability': ['Compare Amazon with eBay.', 'Which marketplace has the highest margin?', 'Why are Amazon fees higher this period?'],
  fees: ['Which fee type contributes the most cost?', 'Which Products have unusually high fees?', 'Explain these marketplace fees.'],
  refunds: ['Which Products drive refunds?', 'Compare Amazon and eBay refunds.', 'Explain the refund reporting basis.'],
  expenses: ['Explain how expenses are allocated.', 'Which expenses increased this period?', 'Which expenses are unallocated?'],
  transactions: ['Summarise these transactions.', 'Which transactions have incomplete profitability?', 'Explain these transaction costs.'],
};
function coverage(snapshot: ReportCopilotSnapshot) {
  if (!snapshot.sensitiveExpensesVisible) return 'Expense totals, Net Profit and Margin are restricted to prevent inference of sensitive values.';
  return snapshot.totals.profitabilityComplete ? 'Profitability coverage is complete.' : 'Profitability is incomplete: ' + formatPercentage(snapshot.totals.profitabilityCoverageBps) + ' of net revenue is covered. Missing costs remain unknown.';
}
function scope(snapshot: ReportCopilotSnapshot) {
  return snapshot.title + ' · ' + formatDate(snapshot.context.dateRange.from) + ' to ' + formatDate(snapshot.context.dateRange.to) + ' · ' + ({ amazon: 'Amazon', ebay: 'eBay', temu: 'Temu', all: 'All marketplaces' })[snapshot.context.marketplace] + ' · company ' + snapshot.context.companyId + '.';
}
function value(snapshot: ReportCopilotSnapshot, row: ReportRow, key: string) {
  const cell = row.values[key] ?? null, column = snapshot.columns.find((candidate) => candidate.key === key);
  if (cell === null) return 'unavailable';
  if (typeof cell !== 'number') return column?.format === 'date' ? formatDate(cell) : ({ amazon: 'Amazon', ebay: 'eBay', temu: 'Temu' } as Record<string, string>)[cell.toLowerCase()] ?? cell;
  return column?.format === 'money' ? formatMoney(cell) : column?.format === 'percent' ? formatPercentage(cell) : String(cell);
}
function firstKey(snapshot: ReportCopilotSnapshot, pattern: RegExp) {
  return snapshot.columns.find((column) => pattern.test(column.key))?.key;
}
function ranked(snapshot: ReportCopilotSnapshot, key: string, direction: 'highest' | 'lowest' = 'highest') {
  return [...snapshot.rows].filter((row) => typeof row.values[key] === 'number').sort((a, b) => direction === 'highest' ? Number(b.values[key]) - Number(a.values[key]) : Number(a.values[key]) - Number(b.values[key])).slice(0, 3);
}
function rowAnswer(snapshot: ReportCopilotSnapshot, key: string, direction: 'highest' | 'lowest' = 'highest') {
  const rows = ranked(snapshot, key, direction);
  return rows.length ? 'Among the currently displayed ' + snapshot.groupBy + ' rows: ' + rows.map((row) => row.label + ': ' + value(snapshot, row, key)).join('; ') + '. Change grouping or sort the full report to investigate all ' + snapshot.total + ' matching rows.' : 'No authorised values for this measure are available in the displayed rows.';
}
export function explainReport(question: string, snapshot: ReportCopilotSnapshot): string {
  const ask = question.toLowerCase(), totals = snapshot.totals;
  const ending = ' ' + coverage(snapshot) + ' ' + scope(snapshot);
  if (/create|update|delete|approve|change.*expense|end.*expense/.test(ask) && !/changed|increased|decreased/.test(ask)) return 'Copilot explains authorised report results. Expense changes require the governed Expenses form and explicit confirmation.' + ending;
  if (/allocat|unallocat/.test(ask)) {
    const amounts = snapshot.expenseSummary;
    return snapshot.allocationNote + ' ' + (amounts.allocatedMinor === null ? 'Allocation totals are restricted.' : 'Allocated expense is ' + formatMoney(amounts.allocatedMinor) + '; unallocated expense is ' + formatMoney(amounts.unallocatedMinor) + '. Unallocated expenses have no eligible transaction on their occurrence date; review the Expense Report and linked expense record.') + ending;
  }
  if (/complete|coverage|missing/.test(ask)) {
    const key = firstKey(snapshot, /profitabilityCoverage|coverage/i);
    return (key ? rowAnswer(snapshot, key, 'lowest') : '') + ending;
  }
  if (/cost.*increase|expense.*increase|which cost/.test(ask)) {
    const costs = snapshot.statement.filter((row) => row.operation === 'subtract' && row.deltaBps !== null).sort((a, b) => (b.deltaBps ?? 0) - (a.deltaBps ?? 0));
    return (costs.length && snapshot.comparison ? costs[0].label + ' has the largest percentage change among available statement deductions: ' + formatPercentage(costs[0].deltaBps) + '. Current ' + formatMoney(costs[0].amountMinor) + '; previous ' + formatMoney(costs[0].previousMinor) + '.' : 'Enable previous-period comparison on Operational P&L to inspect repository-calculated cost changes. Expense History shows effective-dated amount changes.') + ending;
  }
  if (/decrease|profit change|why.*profit/.test(ask)) {
    const profit = snapshot.statement.find((row) => /netProfit/i.test(row.key));
    return (!snapshot.sensitiveExpensesVisible ? 'Profit comparison is restricted.' : !snapshot.comparison?.status.available ? 'Profit and margin comparison is withheld: ' + (snapshot.comparison?.status.reason ?? 'enable the previous equivalent period comparison.') : profit ? profit.label + ' is ' + formatMoney(profit.amountMinor) + ' versus ' + formatMoney(profit.previousMinor) + '; change ' + formatPercentage(profit.deltaBps) + '. The report does not establish a causal explanation.' : 'Open Operational P&L to inspect the comparable statement lines.') + ending;
  }
  if (/refund/.test(ask)) {
    const key = firstKey(snapshot, /refund|amount/i);
    return 'Canonical refunds are ' + formatMoney(totals.refundsMinor) + '. ' + snapshot.refundNote + (key ? ' ' + rowAnswer(snapshot, key) : '') + ending;
  }
  if (/fee/.test(ask)) {
    const key = firstKey(snapshot, /marketplaceFees|fees|amount/i);
    return 'Marketplace Fees are ' + formatMoney(totals.marketplaceFeesMinor) + '.' + (key ? ' ' + rowAnswer(snapshot, key) : '') + ' Source events provide the traceable fee evidence; they do not establish the business cause of a change.' + ending;
  }
  if (/compare.*amazon|ebay|marketplace|highest margin/.test(ask) && snapshot.rows.length) {
    const key = firstKey(snapshot, /knownMargin|margin/i);
    return (key ? rowAnswer(snapshot, key) : 'Use Marketplace or Marketplace Account grouping to compare authorised channel results.') + ending;
  }
  if (/product|loss|most profit/.test(ask)) {
    const key = firstKey(snapshot, /knownNetProfit|netProfit|profit/i);
    return (key ? rowAnswer(snapshot, key, /loss/.test(ask) ? 'lowest' : 'highest') : 'Use Product or Product Group grouping to inspect the authorised profitability rows.') + ending;
  }
  return 'Revenue ' + formatMoney(totals.revenueMinor) + '; Refunds ' + formatMoney(totals.refundsMinor) + '; Net Revenue ' + formatMoney(totals.netRevenueMinor) + '; ' + (totals.profitabilityComplete ? 'Net Profit ' : 'Known Net Profit ') + formatMoney(totals.knownNetProfitMinor) + '; ' + (totals.profitabilityComplete ? 'Margin ' : 'Known Margin ') + formatPercentage(totals.knownMarginBps) + '.' + ending;
}
export function reportCopilotOverview(snapshot: ReportCopilotSnapshot): CopilotPanelData {
  const findings: CopilotPanelData['findings'] = snapshot.healthNotes.map((detail, index) => ({ id: 'report-health-' + index, title: 'Report completeness', detail, tone: 'warning' }));
  const expense = snapshot.expenseSummary;
  if (expense.unallocatedMinor !== null && expense.unallocatedMinor > 0) findings.push({ id: 'report-unallocated', title: 'Unallocated expense ' + formatMoney(expense.unallocatedMinor), detail: 'Review expense allocation evidence for this exact reporting scope.', tone: 'warning' });
  return {
    prompts: REPORT_PROMPTS[snapshot.kind], summary: explainReport('Summarise this report.', snapshot), findings,
    references: [{ label: snapshot.title, href: snapshot.href }],
    dataCompleteness: coverage(snapshot) + ' ' + snapshot.freshness.label + ': ' + snapshot.freshness.detail + '. Uses the authorised Reports Repository result directly.',
    finding: { title: snapshot.title + ' · ' + snapshot.total + ' matching rows', affectedRevenuePence: 0 },
    anomaly: null, approval: null,
  };
}
export function flattenReportStatement(rows: ReportStatementRow[]): ReportStatementRow[] { return rows.flatMap((row) => [row, ...flattenReportStatement(row.children ?? [])]); }

