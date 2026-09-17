import { REPORT_DIMENSIONS, type ReportKind, type ReportDimension } from '@/src/domain/reports';
import type { ReportOptions } from '@/src/services/hooks/use-reports';

/** Shared by reporting pages and Copilot; exact dates remain in AnalysisContext. */
export function reportOptionsFromSearch(kind: ReportKind, params: Pick<URLSearchParams, 'get'>): ReportOptions {
  const requestedGroup = params.get('groupBy') as ReportDimension;
  const page = Number(params.get('page'));
  const size = Number(params.get('pageSize'));
  const completeness = params.get('completeness');
  const expenseType = params.get('expenseType');
  const defaults = kind === 'expenses' && params.get('expenseView') !== 'allocated' ? REPORT_DIMENSIONS.expenses.filter((dimension) => ['none', 'expense-category', 'expense-type'].includes(dimension)) : REPORT_DIMENSIONS[kind];
  return {
    kind, groupBy: defaults.includes(requestedGroup) ? requestedGroup : defaults[0],
    productId: params.get('productId') || undefined, productGroupId: params.get('productGroupId') || undefined,
    search: params.get('q') || undefined, category: params.get('category') || undefined, feeType: params.get('feeType') || undefined,
    completeness: completeness === 'complete' || completeness === 'incomplete' ? completeness : 'all',
    expenseType: expenseType === 'recurring' || expenseType === 'one-off' ? expenseType : 'all',
    expenseView: params.get('expenseView') === 'allocated' ? 'allocated' : 'ledger',
    comparePreviousPeriod: params.get('compare') === 'true',
    sorting: params.get('sort') ? [{ field: params.get('sort')!, direction: params.get('direction') === 'asc' ? 'asc' : 'desc' }] : [],
    page: Number.isInteger(page) && page > 0 ? page - 1 : 0, pageSize: [10, 25, 50, 100].includes(size) ? size : 25,
  };
}

