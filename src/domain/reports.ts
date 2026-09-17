import type { DashboardFinancialTotals, ProfitabilityComparisonStatus } from '@/src/domain/analytics';
import type { AnalysisContext, DataFreshness, DateRange } from '@/src/domain/models';

export const REPORT_TITLES = {
  'p-and-l': 'Operational P&L', 'product-profitability': 'Product Profitability',
  'marketplace-profitability': 'Marketplace Profitability', fees: 'Fee Report',
  refunds: 'Refund Report', expenses: 'Expense Report', transactions: 'Transaction Report',
} as const;
export type ReportKind = keyof typeof REPORT_TITLES;
export type ReportDimension = 'none' | 'company' | 'marketplace' | 'account' | 'product' | 'sku' | 'product-group' | 'date' | 'week' | 'month' | 'expense-category' | 'expense-type' | 'fee-type';
export type ReportValue = string | number | null;
export interface ReportColumn { key: string; label: string; format: 'text' | 'money' | 'number' | 'percent' | 'date' }
export interface ReportRow {
  id: string;
  label: string;
  values: Record<string, ReportValue>;
  productId?: string;
  productGroupId?: string;
  transactionId?: string;
  expenseId?: string;
}
/** Covered records never leave this boundary: restricted deductions cannot be inferred. */
export interface ReportFinancialTotals extends Omit<DashboardFinancialTotals, 'covered' | 'allocatedExpensesMinor'> {
  allocatedExpensesMinor: number | null;
  transactions: number;
}
export interface ReportStatementRow {
  key: string;
  label: string;
  amountMinor: number | null;
  previousMinor: number | null;
  deltaBps: number | null;
  format?: 'percent';
  operation: 'start' | 'subtract' | 'subtotal' | 'result';
  complete: boolean;
  children?: ReportStatementRow[];
  reportKind?: ReportKind;
}
export interface ReportResult {
  kind: ReportKind;
  title: string;
  organisationName: string;
  organisationSlug: string;
  appliedFilters?: Array<{ label: string; value: string }>;
  context: AnalysisContext;
  currency: 'GBP';
  columns: ReportColumn[];
  rows: ReportRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  totals: ReportFinancialTotals;
  statement: ReportStatementRow[];
  comparison: null | { range: DateRange; totals: ReportFinancialTotals; status: ProfitabilityComparisonStatus };
  freshness: DataFreshness;
  healthNotes: string[];
  sensitiveExpensesVisible: boolean;
  expenseSummary: { configuredMinor: number | null; allocatedMinor: number | null; unallocatedMinor: number | null };
  products: Array<{ id: string; title: string; internalSku: string }>;
  productGroups: Array<{ id: string; name: string }>;
  categories: string[];
  feeTypes: string[];
  groups: ReportDimension[];
  groupBy: ReportDimension;
  allocationNote: string;
  refundNote: string;
  disclaimer: string;
}

export const REPORT_DIMENSIONS: Record<ReportKind, ReportDimension[]> = {
  'p-and-l': ['none'],
  'product-profitability': ['product', 'sku', 'product-group', 'company', 'marketplace', 'account', 'date', 'week', 'month'],
  'marketplace-profitability': ['marketplace', 'account', 'company', 'date', 'week', 'month'],
  fees: ['none', 'fee-type', 'marketplace', 'account', 'product', 'product-group', 'company', 'date', 'week', 'month'],
  refunds: ['none', 'marketplace', 'account', 'product', 'product-group', 'company', 'date', 'week', 'month'],
  expenses: ['none', 'expense-category', 'expense-type', 'company', 'marketplace', 'account', 'product', 'product-group'],
  transactions: ['none', 'product', 'sku', 'product-group', 'company', 'marketplace', 'account', 'date', 'week', 'month'],
};

export const OPERATIONAL_REPORT_DISCLAIMER = 'Operational profitability based on marketplace transactions, approved Product costs and configured expenses. This is not a statutory accounting statement.';

