import type { ReportDimension, ReportKind, ReportResult } from '@/src/domain/reports';
import type { TransactionRepositoryInput } from '@/src/services/transactions-contracts';

export interface ReportQuery extends TransactionRepositoryInput {
  kind: ReportKind;
  groupBy?: ReportDimension;
  productId?: string;
  productIds?: string[];
  productGroupId?: string;
  productGroupIds?: string[];
  search?: string;
  category?: string;
  feeType?: string;
  expenseType?: 'all' | 'recurring' | 'one-off';
  completeness?: 'all' | 'complete' | 'incomplete';
  expenseView?: 'ledger' | 'allocated';
  comparePreviousPeriod?: boolean;
  sorting?: Array<{ field: string; direction: 'asc' | 'desc' }>;
  page?: number;
  pageSize?: number;
}
export interface ReportsRepository {
  getReport(query: ReportQuery, signal?: AbortSignal): Promise<ReportResult>;
  /** Reauthorises the same query and returns all filtered rows before pagination. */
  exportReport(query: ReportQuery, signal?: AbortSignal): Promise<ReportResult>;
}
