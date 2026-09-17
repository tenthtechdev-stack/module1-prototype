import type { ExpenseDetail } from '@/src/domain/expenses';
import type { DateRange } from '@/src/domain/models';
import type { CopilotPanelData } from '@/src/services/contracts';
import { formatMoney, formatDate } from '@/src/domain/calculations';

export interface ExpenseCopilotSnapshot {
  id: string; name: string; type: string; category: string; scope: string; status: string;
  amountMinor: number; currency: string; effectiveFrom: string; effectiveTo: string | null;
  source: string; reason: string; periodAmountMinor: number; allocatedMinor: number; unallocatedMinor: number;
  history: Array<{ effectiveFrom: string; effectiveTo: string | null; amountMinor: number; currency: string; reason: string; superseded: boolean }>;
  dateRange: DateRange; href: string;
}
/** Receives a repository-authorised detail only; no lookup or allocation calculation. */
export function expenseCopilotSnapshot(detail: ExpenseDetail, dateRange: DateRange, href: string): ExpenseCopilotSnapshot {
  return { id: detail.id, name: detail.expense.name, type: detail.expense.type, category: detail.expense.category,
    scope: detail.scopeLabel, status: detail.status, amountMinor: detail.version.amountMinor, currency: detail.version.currency,
    effectiveFrom: detail.version.effectiveFrom, effectiveTo: detail.version.effectiveTo,
    source: detail.version.source, reason: detail.version.reason, periodAmountMinor: detail.periodAmountMinor,
    allocatedMinor: detail.allocatedMinor, unallocatedMinor: detail.unallocatedMinor,
    history: detail.versions.map(version => ({ effectiveFrom: version.effectiveFrom, effectiveTo: version.effectiveTo,
      amountMinor: version.amountMinor, currency: version.currency, reason: version.reason, superseded: Boolean(version.supersededAt) })),
    dateRange, href };
}
export function explainExpense(question: string, snapshot: ExpenseCopilotSnapshot): string {
  const scope = `${snapshot.name} · ${snapshot.scope} · ${formatDate(snapshot.dateRange.from)} to ${formatDate(snapshot.dateRange.to)}.`;
  if (/create|update|delete|approve|change|end/i.test(question) && !/changed|change history|why|history/i.test(question)) return `Expense changes require the governed form and explicit confirmation. Copilot cannot make or approve a financial change. ${scope}`;
  if (/history|previous|changed|increase/i.test(question)) return `${snapshot.history.map(version => `${formatDate(version.effectiveFrom)} to ${version.effectiveTo ? `${formatDate(version.effectiveTo)} (exclusive)` : 'open-ended'}: ${formatMoney(version.amountMinor, version.currency)}${version.superseded ? ' · superseded audit evidence' : ''}. ${version.reason}`).join(' ')} Earlier active versions apply on their own effective dates. ${scope}`;
  if (/source|reason/i.test(question)) return `Source: ${snapshot.source}. Recorded reason: ${snapshot.reason}. This is a configured operational expense, separate from marketplace source events. ${scope}`;
  return `${snapshot.type === 'recurring' ? 'Monthly recurring' : 'One-off'} expense of ${formatMoney(snapshot.amountMinor, snapshot.currency)}, effective from ${formatDate(snapshot.effectiveFrom)}. In the selected period, configured amount is ${formatMoney(snapshot.periodAmountMinor)}, allocated amount is ${formatMoney(snapshot.allocatedMinor)}, and unallocated amount is ${formatMoney(snapshot.unallocatedMinor)} in GBP. The canonical allocator uses non-negative Net Revenue on the occurrence date within the eligible scope; its existing equal-share fallback applies when eligible weights are all zero. No eligible transaction leaves the expense unallocated. ${scope}`;
}
export function expenseCopilotOverview(snapshot: ExpenseCopilotSnapshot): CopilotPanelData {
  return { prompts: ['Explain how this expense is allocated.', 'Show this expense’s history.', 'What source and reason support this expense?'],
    summary: explainExpense('Explain allocation', snapshot), findings: snapshot.unallocatedMinor > 0 ? [{ id: 'expense-unallocated', title: 'Unallocated expense', detail: `${formatMoney(snapshot.unallocatedMinor)} has no eligible transaction basis in this period.`, tone: 'warning' }] : [],
    references: [{ label: snapshot.name, href: snapshot.href }], dataCompleteness: 'Uses the authorised Expense Detail repository output. No hidden expense records or independent financial calculation are used.',
    finding: { title: snapshot.name, affectedRevenuePence: 0 }, anomaly: null, approval: null };
}
