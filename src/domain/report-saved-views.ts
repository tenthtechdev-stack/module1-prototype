import type { EnterpriseDataGridViewState } from '@/src/components/tables/enterprise-data-grid';
import type { ReportDimension, ReportKind } from '@/src/domain/reports';

/** Uses the existing personal grid-view shape and organisation/user storage boundary. */
export interface ReportSavedView {
  id: string;
  name: string;
  builtIn: boolean;
  configuration: EnterpriseDataGridViewState & {
    kind: ReportKind;
    groupBy: ReportDimension;
    filters: Record<string, string>;
    comparePreviousPeriod: boolean;
  };
}

export const REPORT_LOCAL_PARAMS = ['q', 'productId', 'productGroupId', 'category', 'feeType', 'expenseType', 'completeness', 'expenseView', 'groupBy', 'compare', 'sort', 'direction', 'page', 'pageSize', 'view'] as const;

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Stored configurations are presentation only; repository authorization is reapplied on restore. */
export function decodeReportViews(raw: string | null, kind: ReportKind): ReportSavedView[] {
  if (!raw) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is ReportSavedView => {
      if (!record(value) || typeof value.id !== 'string' || typeof value.name !== 'string' || value.builtIn !== false) return false;
      const config = value.configuration;
      if (!record(config) || config.version !== 1 || config.kind !== kind || typeof config.search !== 'string' || typeof config.groupBy !== 'string' || typeof config.comparePreviousPeriod !== 'boolean') return false;
      return Array.isArray(config.sorting) && config.sorting.every((sort) => record(sort) && typeof sort.id === 'string' && typeof sort.desc === 'boolean')
        && Array.isArray(config.columnFilters)
        && record(config.filters) && Object.values(config.filters).every((filter) => typeof filter === 'string')
        && record(config.columnVisibility) && Object.values(config.columnVisibility).every((visible) => typeof visible === 'boolean')
        && record(config.columnSizing) && Object.values(config.columnSizing).every((size) => typeof size === 'number' && Number.isFinite(size) && size > 0)
        && record(config.columnPinning) && Array.isArray(config.columnPinning.start) && Array.isArray(config.columnPinning.end)
        && [...config.columnPinning.start, ...config.columnPinning.end].every((id) => typeof id === 'string')
        && typeof config.pageSize === 'number' && [10, 25, 50, 100].includes(config.pageSize);
    }).slice(0, 50);
  } catch { return []; }
}
