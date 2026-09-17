import type { AnalyticsDataset } from '@/src/domain/analytics';
import { REPORT_DIMENSIONS, REPORT_TITLES } from '@/src/domain/reports';
import { evaluateAccess, type Capability } from '@/src/domain/permissions';
import { generateAnalyticsDataset } from '@/src/fixtures/analytics-data';
import { getScenarioRuntime } from '@/src/fixtures/scenarios';
import { aggregateReport } from '@/src/services/analytics/report-aggregation';
import type { ReportQuery, ReportsRepository } from '@/src/services/reports-contracts';
import { materializeApprovedCogsDataset } from '@/src/services/mock/cogs-dataset';
import { authoriseTransactionInput, TransactionRepositoryError } from '@/src/services/mock/transactions-repository';

export class ReportRepositoryError extends Error {
  constructor(public readonly code: 'access_denied' | 'invalid_query' | 'repository_unavailable') {
    super(code === 'repository_unavailable' ? 'Reports could not be loaded. Please retry.' : code === 'invalid_query' ? 'The report query is invalid.' : 'Report access is unavailable.');
    this.name = 'ReportRepositoryError';
  }
}
function permitted(query: ReportQuery, capability: Capability) {
  return Boolean(query.principal && evaluateAccess({ ...query.principal, entitlements: new Set(query.principal.entitlements), capability }).allowed);
}
export function authoriseReportInput(input: ReportQuery): ReportQuery {
  if (!permitted(input, 'reports.view') || input.kind === 'expenses' && !permitted(input, 'expenses.view')) throw new ReportRepositoryError('access_denied');
  if (!Object.hasOwn(REPORT_TITLES, input.kind) || input.groupBy && !REPORT_DIMENSIONS[input.kind].includes(input.groupBy)
    || input.page !== undefined && (!Number.isInteger(input.page) || input.page < 0)
    || input.pageSize !== undefined && (!Number.isInteger(input.pageSize) || input.pageSize < 1 || input.pageSize > 250)
    || input.sorting?.some((sort) => !['asc', 'desc'].includes(sort.direction))) throw new ReportRepositoryError('invalid_query');
  try {
    const query = authoriseTransactionInput(input);
    if (query.context.companyId !== 'all' && !query.authorisedCompanyIds.includes(query.context.companyId)
      || query.context.marketplaceAccountIds.some((id) => !query.authorisedAccountIds.includes(id))) throw new ReportRepositoryError('access_denied');
    return query;
  } catch (error) {
    if (error instanceof TransactionRepositoryError) throw new ReportRepositoryError(error.code);
    throw error;
  }
}
function pause(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Request aborted', 'AbortError')); return; }
    const onAbort = () => { clearTimeout(timer); reject(new DOMException('Request aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, 150);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
export class MockReportsRepository implements ReportsRepository {
  private readonly datasets = new Map<string, AnalyticsDataset>();
  private dataset(query: ReportQuery) {
    const key = JSON.stringify([query.organisation.id, query.companies.map((item) => item.id), query.marketplaceAccounts.map((item) => [item.id, item.companyId, item.marketplace])]);
    let base = this.datasets.get(key);
    if (!base) { base = generateAnalyticsDataset(query); this.datasets.set(key, base); }
    return materializeApprovedCogsDataset(base, query.organisation.id);
  }
  private async report(input: ReportQuery, exportAll: boolean, signal?: AbortSignal) {
    const query = authoriseReportInput(input);
    await pause(signal);
    if (getScenarioRuntime(query.scenarioId).resultMode === 'error') throw new ReportRepositoryError('repository_unavailable');
    return aggregateReport(this.dataset(query), query, exportAll);
  }
  getReport(query: ReportQuery, signal?: AbortSignal) { return this.report(query, false, signal); }
  exportReport(query: ReportQuery, signal?: AbortSignal) { return this.report(query, true, signal); }
}
