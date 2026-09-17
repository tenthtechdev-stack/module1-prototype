import type { ReportResult, ReportStatementRow } from '@/src/domain/reports';
import type { ReportQuery } from '@/src/services/reports-contracts';
import { csvBytes, pdfBytes, xlsxBytes, type ExportCell, type ExportSheet, type PdfLine } from '@/src/services/export-formats';

export type ReportExportFormat = 'csv' | 'xlsx' | 'pdf';
export interface ReportExportFile { fileName: string; mimeType: string; bytes: Uint8Array<ArrayBuffer>; recordCount: number }
const money = (value: number | null) => value === null ? 'Unavailable' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100);
const percent = (value: number | null) => value === null ? 'Unavailable' : (value / 100).toFixed(2) + '%';
function statementRows(rows: ReportStatementRow[], level = 0): ExportCell[][] {
  return rows.flatMap((row) => [[('  '.repeat(level)) + row.label, row.format === 'percent' ? percent(row.amountMinor) : row.amountMinor === null ? null : row.operation === 'subtract' ? -Math.abs(row.amountMinor) : row.amountMinor, row.format === 'percent' ? percent(row.previousMinor) : row.previousMinor === null ? null : row.operation === 'subtract' ? -Math.abs(row.previousMinor) : row.previousMinor, row.format === 'percent' ? 'percent' : 'GBP minor units'], ...statementRows(row.children ?? [], level + 1)]);
}
/** Accepts only already-authorised repository results. It never reads fixtures or calculates profitability. */
export function serializeReportExport(result: ReportResult, format: ReportExportFormat, visibleColumns?: string[], generatedAt = new Date().toISOString()): ReportExportFile {
  if (format === 'pdf' && result.kind !== 'p-and-l') throw new Error('PDF export is available for Operational P&L.');
  const columns = result.columns.filter((column) => !visibleColumns || visibleColumns.includes(column.key));
  const dataRows: ExportCell[][] = [columns.map((column) => column.label + (column.format === 'money' ? ' (GBP minor units)' : column.format === 'percent' ? ' (basis points)' : '')), ...result.rows.map((row) => columns.map((column) => row.values[column.key] ?? null))];
  const statement = statementRows(result.statement);
  const summary: ExportCell[][] = [
    ['Report information', 'Value'], ['Organisation', result.organisationName], ['Report', result.title],
    ['From', result.context.dateRange.from], ['To', result.context.dateRange.to],
    ['Company scope', result.context.companyId], ['Marketplace scope', result.context.marketplace],
    ['Account scope', result.context.marketplaceAccountIds.join(', ') || 'All authorised accounts'],
    ['Reporting currency', result.currency], ['Group by', result.groupBy], ['Authorised report rows', result.total],
    ['Profitability coverage (basis points)', result.totals.profitabilityCoverageBps],
    ['Sensitive expense access', result.sensitiveExpensesVisible ? 'Permitted' : 'Restricted; total expenses and profit unavailable'],
    ['Generated at', generatedAt], ['Statement basis', result.disclaimer],
  ];
  const health: ExportCell[][] = [['Data health', 'Detail'], ['Source freshness', result.freshness.label + ': ' + result.freshness.detail], ...result.healthNotes.map((note): ExportCell[] => ['Note', note]), ['Allocation', result.allocationNote]];
  let bytes: Uint8Array<ArrayBuffer>;
  if (format === 'csv') bytes = csvBytes(result.kind === 'p-and-l' ? [...summary, [], ['Statement line', 'Amount (GBP minor units)', 'Previous (GBP minor units)', 'Unit'], ...statement] : dataRows);
  else if (format === 'xlsx') {
    const sheets: ExportSheet[] = [{ name: 'Summary', rows: summary }];
    if (result.kind === 'p-and-l') {
      sheets.push({ name: 'P&L', rows: [['Statement line', 'Selected period', 'Previous period', 'Unit'], ...statement.map((row) => [row[0], row[1], row[2], row[3] === 'GBP minor units' ? 'GBP' : row[3]])], formats: ['text', 'money', 'money', 'text'] });
      const expenseLine = result.statement.find((row) => row.key === 'allocatedExpenses');
      sheets.push({ name: 'Expense Breakdown', rows: [['Expense line', 'Selected period', 'Previous period', 'Unit'], ...statementRows(expenseLine?.children ?? []).map((row) => [row[0], row[1], row[2], row[3] === 'GBP minor units' ? 'GBP' : row[3]])], formats: ['text', 'money', 'money', 'text'] });
    } else sheets.push({ name: 'Report Data', rows: [columns.map((column) => column.label), ...dataRows.slice(1)], formats: columns.map((column) => column.format) });
    sheets.push({ name: 'Data Health', rows: health }); bytes = xlsxBytes(sheets);
  } else {
    const lines: PdfLine[] = [
      { label: result.organisationName, emphasis: true },
      { label: 'Period: ' + result.context.dateRange.from + ' to ' + result.context.dateRange.to },
      { label: 'Company: ' + result.context.companyId + ' | Marketplace: ' + result.context.marketplace },
      { label: 'Accounts: ' + (result.context.marketplaceAccountIds.join(', ') || 'All authorised accounts') },
      { label: 'Reporting currency: GBP | Generated: ' + generatedAt }, { label: '' },
      ...result.statement.map((row) => ({ label: row.label, value: row.format === 'percent' ? percent(row.amountMinor) : money(row.amountMinor === null ? null : row.operation === 'subtract' ? -Math.abs(row.amountMinor) : row.amountMinor), emphasis: row.operation === 'subtotal' || row.operation === 'result' })),
      { label: '' }, { label: 'Profitability coverage: ' + percent(result.totals.profitabilityCoverageBps), emphasis: true },
      { label: result.freshness.label + '. ' + result.freshness.detail },
      ...result.healthNotes.map((label) => ({ label })),
      ...(result.comparison ? [{ label: 'Comparison: ' + result.comparison.range.from + ' to ' + result.comparison.range.to }, ...result.statement.map((row) => ({ label: 'Previous ' + row.label, value: row.format === 'percent' ? percent(row.previousMinor) : money(row.previousMinor === null ? null : row.operation === 'subtract' ? -Math.abs(row.previousMinor) : row.previousMinor) }))] : []),
      { label: '' }, { label: result.disclaimer },
    ];
    bytes = pdfBytes(result.title, lines);
  }
  return { fileName: result.organisationSlug + '-' + result.kind + '-' + result.context.dateRange.from + '-to-' + result.context.dateRange.to + '.' + format, mimeType: format === 'csv' ? 'text/csv;charset=utf-8' : format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf', bytes, recordCount: result.total };
}
export async function prepareReportExport(query: ReportQuery, format: ReportExportFormat, visibleColumns?: string[]): Promise<ReportExportFile> {
  const { services } = await import('@/src/services/runtime');
  const result = await services.reports.exportReport(query);
  // Yield before serialisation so the preparing state paints even for larger results.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  return serializeReportExport(result, format, visibleColumns);
}

