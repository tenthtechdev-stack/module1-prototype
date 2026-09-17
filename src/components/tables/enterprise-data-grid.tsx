'use client';

import { useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  columnFilteringFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
  type ColumnPinningState,
  type ColumnSizingState,
  type ColumnVisibilityState,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronDown, Columns3, Download, Search, Star, X } from 'lucide-react';
import { EmptyState, ErrorState } from '@/src/components/states/states';

const DEFAULT_COLUMN_MIN_SIZE = 48;
const DEFAULT_COLUMN_MAX_SIZE = 1200;
const MOBILE_GRID_QUERY = '(max-width: 760px)';
const EMPTY_COLUMN_IDS: readonly string[] = [];
export const GRID_ROW_ACTIONS_COLUMN_ID = '__row-actions';

export const gridFeatures = tableFeatures({
  columnVisibilityFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnPinningFeature,
  rowSelectionFeature,
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: { includesString: filterFn_includesString },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

export type GridColumn<TData extends { id: string }> = ColumnDef<typeof gridFeatures, TData, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface EnterpriseDataGridViewState {
  version: 1;
  sorting: SortingState;
  columnFilters: ColumnFiltersState;
  search: string;
  columnVisibility: ColumnVisibilityState;
  columnSizing: ColumnSizingState;
  columnPinning: ColumnPinningState;
  pageSize: number;
}

export interface EnterpriseDataGridBulkActionContext<TData extends { id: string }> {
  selectedRows: TData[];
  selectedRowIds: string[];
  clearSelection: () => void;
}

export interface EnterpriseDataGridProps<TData extends { id: string }> {
  data: ReadonlyArray<TData>;
  columns: GridColumn<TData>[];
  ariaLabel?: string;
  exportFileName?: string;
  savedViewKey?: string;
  initialViewState?: Partial<Omit<EnterpriseDataGridViewState, 'version'>>;
  onSaveView?: (view: EnterpriseDataGridViewState) => void;
  initialColumnVisibility?: ColumnVisibilityState;
  initialPinnedColumns?: string[];
  mobileColumns?: readonly string[];
  responsivePriorityColumns?: readonly string[];
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>;
  search?: string;
  onSearchChange?: OnChangeFn<string>;
  columnVisibility?: ColumnVisibilityState;
  onColumnVisibilityChange?: OnChangeFn<ColumnVisibilityState>;
  columnSizing?: ColumnSizingState;
  onColumnSizingChange?: OnChangeFn<ColumnSizingState>;
  columnPinning?: ColumnPinningState;
  onColumnPinningChange?: OnChangeFn<ColumnPinningState>;
  manualPagination?: boolean;
  manualSorting?: boolean;
  manualFiltering?: boolean;
  rowCount?: number;
  pageCount?: number;
  renderBulkActions?: (context: EnterpriseDataGridBulkActionContext<TData>) => ReactNode;
  renderRowActions?: (row: TData) => ReactNode;
  loading?: boolean;
  error?: Error | string | null;
  onRetry?: () => void;
  loadingState?: ReactNode;
  emptyState?: ReactNode;
  errorState?: ReactNode;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  canExport?: boolean;
  virtualize?: boolean;
}

type ParsedGridViewState = Partial<Omit<EnterpriseDataGridViewState, 'version'>> & { version: 1 };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSorting(value: unknown): SortingState | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => isRecord(item) && typeof item.id === 'string' && typeof item.desc === 'boolean')
    ? value.map((item) => ({ id: item.id as string, desc: item.desc as boolean }))
    : undefined;
}

function parseColumnFilters(value: unknown): ColumnFiltersState | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => isRecord(item) && typeof item.id === 'string' && Object.hasOwn(item, 'value'))
    ? value.map((item) => ({ id: item.id as string, value: item.value }))
    : undefined;
}

function parseBooleanRecord(value: unknown): Record<string, boolean> | undefined {
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === 'boolean')) return undefined;
  return Object.fromEntries(Object.entries(value)) as Record<string, boolean>;
}

function parseNumberRecord(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value) || !Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item) && item > 0)) return undefined;
  return Object.fromEntries(Object.entries(value)) as Record<string, number>;
}

function parseColumnPinning(value: unknown): ColumnPinningState | undefined {
  if (!isRecord(value) || !Array.isArray(value.start) || !Array.isArray(value.end)) return undefined;
  if (!value.start.every((item) => typeof item === 'string') || !value.end.every((item) => typeof item === 'string')) return undefined;
  return { start: [...value.start] as string[], end: [...value.end] as string[] };
}

function parseSavedView(raw: string): ParsedGridViewState | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || (value.version !== undefined && value.version !== 1)) return null;
    const parsed: ParsedGridViewState = { version: 1 };
    const sorting = parseSorting(value.sorting);
    const columnFilters = parseColumnFilters(value.columnFilters);
    const columnVisibility = parseBooleanRecord(value.columnVisibility);
    const columnSizing = parseNumberRecord(value.columnSizing);
    const columnPinning = parseColumnPinning(value.columnPinning);
    if (sorting) parsed.sorting = sorting;
    if (columnFilters) parsed.columnFilters = columnFilters;
    if (typeof value.search === 'string') parsed.search = value.search;
    else if (typeof value.globalFilter === 'string') parsed.search = value.globalFilter;
    if (columnVisibility) parsed.columnVisibility = columnVisibility;
    if (columnSizing) parsed.columnSizing = columnSizing;
    if (columnPinning) parsed.columnPinning = columnPinning;
    if (typeof value.pageSize === 'number' && Number.isInteger(value.pageSize) && value.pageSize > 0 && value.pageSize <= 1000) parsed.pageSize = value.pageSize;
    return parsed;
  } catch {
    return null;
  }
}

function subscribeToMobileGrid(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  const query = window.matchMedia(MOBILE_GRID_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}

function getMobileGridSnapshot() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_GRID_QUERY).matches;
}

function getServerMobileGridSnapshot() {
  return false;
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function GridLoadingState({ ariaLabel }: { ariaLabel: string }) {
  return (
    <div className="rows-skeleton" role="status" aria-label={`Loading ${ariaLabel}`}>
      <div className="table-toolbar"><span className="skeleton skeleton-input" /><span className="skeleton skeleton-actions" /></div>
      {Array.from({ length: 6 }, (_, index) => <div className="skeleton-row" key={index}><span /><span /><span /><span /></div>)}
    </div>
  );
}

export function EnterpriseDataGrid<TData extends { id: string }>({
  data,
  columns,
  ariaLabel = 'Data grid',
  exportFileName = 'export.csv',
  savedViewKey,
  initialViewState,
  onSaveView,
  initialColumnVisibility = {},
  initialPinnedColumns = [],
  mobileColumns = EMPTY_COLUMN_IDS,
  responsivePriorityColumns,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  columnFilters,
  onColumnFiltersChange,
  search,
  onSearchChange,
  columnVisibility,
  onColumnVisibilityChange,
  columnSizing,
  onColumnSizingChange,
  columnPinning,
  onColumnPinningChange,
  manualPagination = false,
  manualSorting = false,
  manualFiltering = false,
  rowCount,
  pageCount,
  renderBulkActions,
  renderRowActions,
  loading = false,
  error = null,
  onRetry,
  loadingState,
  emptyState,
  errorState,
  searchPlaceholder = 'Search records',
  emptyTitle,
  emptyDescription,
  canExport = true,
  virtualize = false,
}: EnterpriseDataGridProps<TData>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedViewKeyRef = useRef<string | null>(null);
  const isMobileGrid = useSyncExternalStore(subscribeToMobileGrid, getMobileGridSnapshot, getServerMobileGridSnapshot);
  const shouldVirtualize = virtualize && !isMobileGrid;
  const responsiveColumns = responsivePriorityColumns ?? mobileColumns;
  const mobileColumnSet = useMemo(() => new Set(responsiveColumns), [responsiveColumns]);
  const stableColumns = useMemo<GridColumn<TData>[]>(() => {
    if (!renderRowActions) return columns;
    const actionsColumn: GridColumn<TData> = {
      id: GRID_ROW_ACTIONS_COLUMN_ID,
      header: 'Actions',
      size: 92,
      minSize: 72,
      maxSize: 140,
      enableColumnFilter: false,
      enableGlobalFilter: false,
      enableHiding: false,
      enablePinning: false,
      enableResizing: false,
      enableSorting: false,
      cell: ({ row }) => renderRowActions(row.original),
    };
    return [...columns, actionsColumn];
  }, [columns, renderRowActions]);
  const controlledState = {
    ...(pagination !== undefined ? { pagination } : {}),
    ...(sorting !== undefined ? { sorting } : {}),
    ...(columnFilters !== undefined ? { columnFilters } : {}),
    ...(search !== undefined ? { globalFilter: search } : {}),
    ...(columnVisibility !== undefined ? { columnVisibility } : {}),
    ...(columnSizing !== undefined ? { columnSizing } : {}),
    ...(columnPinning !== undefined ? { columnPinning } : {}),
  };
  const stateChangeHandlers = {
    ...(onPaginationChange !== undefined ? { onPaginationChange } : {}),
    ...(onSortingChange !== undefined ? { onSortingChange } : {}),
    ...(onColumnFiltersChange !== undefined ? { onColumnFiltersChange } : {}),
    ...(onSearchChange !== undefined ? { onGlobalFilterChange: onSearchChange } : {}),
    ...(onColumnVisibilityChange !== undefined ? { onColumnVisibilityChange } : {}),
    ...(onColumnSizingChange !== undefined ? { onColumnSizingChange } : {}),
    ...(onColumnPinningChange !== undefined ? { onColumnPinningChange } : {}),
  };
  const table = useTable({
    features: gridFeatures,
    data,
    columns: stableColumns,
    getRowId: (row) => row.id,
    globalFilterFn: 'includesString',
    columnResizeMode: 'onChange',
    defaultColumn: { minSize: DEFAULT_COLUMN_MIN_SIZE, maxSize: DEFAULT_COLUMN_MAX_SIZE },
    enableSortingRemoval: false,
    manualPagination,
    manualSorting,
    manualFiltering,
    rowCount,
    pageCount,
    state: controlledState,
    ...stateChangeHandlers,
    initialState: {
      pagination: { pageIndex: 0, pageSize: initialViewState?.pageSize ?? 10 },
      sorting: initialViewState?.sorting ?? [],
      columnFilters: initialViewState?.columnFilters ?? [],
      globalFilter: initialViewState?.search ?? '',
      columnPinning: initialViewState?.columnPinning ?? { start: [...initialPinnedColumns], end: [] },
      columnVisibility: initialViewState?.columnVisibility ?? initialColumnVisibility,
      columnSizing: initialViewState?.columnSizing ?? {},
    },
  });
  const rows = table.getRowModel().rows;
  const mobilePrimaryColumn = responsiveColumns[0] ?? table.getVisibleLeafColumns().find((column) => column.id !== 'select' && column.id !== GRID_ROW_ACTIONS_COLUMN_ID)?.id;
  // TanStack Virtual intentionally exposes imperative measurement functions.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: shouldVirtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 6,
  });
  const visibleRows = shouldVirtualize
    ? virtualizer.getVirtualItems().map((item) => ({ row: rows[item.index], item }))
    : rows.map((row) => ({ row, item: null }));
  const selectedRowIds = table.getSelectedRowIds();
  const selectedRows = table.getSelectedRowModel().rows.map((row) => row.original);
  const selectedCount = selectedRowIds.length;
  const matchingCount = table.getRowCount();
  const resolvedPageCount = table.getPageCount();
  const pageSizeOptions = Array.from(new Set([10, 25, 50, 100, table.state.pagination.pageSize])).sort((a, b) => a - b);

  useEffect(() => {
    if (!savedViewKey) {
      loadedViewKeyRef.current = null;
      return;
    }
    if (loadedViewKeyRef.current === savedViewKey) return;
    loadedViewKeyRef.current = savedViewKey;
    try {
      const stored = localStorage.getItem(savedViewKey);
      if (!stored) return;
      const saved = parseSavedView(stored);
      if (!saved) {
        localStorage.removeItem(savedViewKey);
        return;
      }
      if (saved.columnVisibility) table.setColumnVisibility(saved.columnVisibility);
      if (saved.sorting) table.setSorting(saved.sorting);
      if (saved.columnFilters) table.setColumnFilters(saved.columnFilters);
      if (saved.search !== undefined) table.setGlobalFilter(saved.search);
      if (saved.columnSizing) table.setColumnSizing(saved.columnSizing);
      if (saved.columnPinning) table.setColumnPinning(saved.columnPinning);
      if (saved.pageSize !== undefined) table.setPageSize(saved.pageSize);
    } catch {
      // Storage may be unavailable in privacy-restricted browser contexts.
    }
  }, [savedViewKey, table]);

  function createViewState(): EnterpriseDataGridViewState {
    return {
      version: 1,
      sorting: [...table.state.sorting],
      columnFilters: [...table.state.columnFilters],
      search: String(table.state.globalFilter ?? ''),
      columnVisibility: { ...table.state.columnVisibility },
      columnSizing: { ...table.state.columnSizing },
      columnPinning: { start: [...table.state.columnPinning.start], end: [...table.state.columnPinning.end] },
      pageSize: table.state.pagination.pageSize,
    };
  }

  function exportCsv(selectedOnly = false) {
    const exportColumns = table.getVisibleLeafColumns().filter((column) => column.id !== 'select' && column.id !== GRID_ROW_ACTIONS_COLUMN_ID);
    const exportRows = selectedOnly ? table.getSelectedRowModel().rows : table.getPrePaginatedRowModel().rows;
    const contents = [
      exportColumns.map((column) => csvCell(typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id)).join(','),
      ...exportRows.map((row) => exportColumns.map((column) => csvCell(row.getValue(column.id))).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  function saveView() {
    const view = createViewState();
    onSaveView?.(view);
    if (!savedViewKey) return;
    try {
      localStorage.setItem(savedViewKey, JSON.stringify(view));
    } catch {
      // The external callback still receives the state if local storage is unavailable.
    }
  }

  if (loading) {
    return <section className="data-panel enterprise-grid" aria-label={ariaLabel} aria-busy="true">{loadingState ?? <GridLoadingState ariaLabel={ariaLabel} />}</section>;
  }

  if (error !== null) {
    const description = error instanceof Error ? error.message : error || undefined;
    return <section className="data-panel enterprise-grid" aria-label={ariaLabel}>{errorState ?? <ErrorState description={description} onRetry={onRetry} />}</section>;
  }

  return (
    <section className="data-panel enterprise-grid" aria-label={ariaLabel}>
      <div className="table-toolbar">
        <label className="grid-search">
          <Search size={15} />
          <input value={String(table.state.globalFilter ?? '')} onChange={(event) => table.setGlobalFilter(event.target.value)} aria-label="Search table" placeholder={searchPlaceholder} />
          {table.state.globalFilter ? <button type="button" onClick={() => table.setGlobalFilter('')} aria-label="Clear search"><X size={13} /></button> : null}
        </label>
        <div className="grid-actions">
          {selectedCount && renderBulkActions ? <div className="grid-bulk-actions">{renderBulkActions({ selectedRows, selectedRowIds, clearSelection: () => table.resetRowSelection(true) })}</div> : null}
          {canExport && selectedCount ? <button type="button" onClick={() => exportCsv(true)}><Download size={14} /> Export {selectedCount} selected</button> : null}
          {savedViewKey || onSaveView ? <button type="button" onClick={saveView}><Star size={14} /> Save view</button> : null}
          <details className="column-menu"><summary><Columns3 size={14} /> Columns <ChevronDown size={12} /></summary><div>{table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => <label key={column.id}><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} /> {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}</label>)}</div></details>
          {canExport ? <button type="button" onClick={() => exportCsv()}><Download size={14} /> {manualPagination ? 'Export page' : 'Export'}</button> : null}
        </div>
      </div>
      {rows.length ? (
        <div className={`table-scroll${shouldVirtualize ? ' virtualized' : ''}`} ref={scrollRef}>
          <table style={{ width: table.getTotalSize() }}>
            <caption className="sr-only">{ariaLabel}</caption>
            <thead>{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              const headerContent = <>{header.isPlaceholder ? null : <table.FlexRender header={header} />}{sorted === 'asc' ? <ArrowUp size={12} /> : sorted === 'desc' ? <ArrowDown size={12} /> : null}</>;
              const pinned = header.column.getIsPinned();
              const columnLabel = typeof header.column.columnDef.header === 'string' ? header.column.columnDef.header : header.column.id;
              const minSize = header.column.columnDef.minSize ?? DEFAULT_COLUMN_MIN_SIZE;
              const maxSize = header.column.columnDef.maxSize ?? DEFAULT_COLUMN_MAX_SIZE;
              const currentSize = header.column.getSize();
              return <th key={header.id} style={{ width: currentSize, position: pinned ? 'sticky' : undefined, left: pinned === 'start' ? header.column.getStart('start') : undefined, right: pinned === 'end' ? header.column.getAfter('end') : undefined }} className={`column-${header.column.id}${pinned ? ` pinned-column pinned-${pinned}` : ''}`} aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : header.column.getCanSort() ? 'none' : undefined}>{header.column.getCanSort() ? <button type="button" className="sort-button" onClick={header.column.getToggleSortingHandler()}>{headerContent}</button> : <div className="sort-button static">{headerContent}</div>}{header.column.getCanResize() ? <span className={`resize-handle${header.column.getIsResizing() ? ' resizing' : ''}`} role="separator" tabIndex={0} aria-orientation="vertical" aria-label={`Resize ${columnLabel} column`} aria-valuemin={minSize} aria-valuemax={maxSize} aria-valuenow={currentSize} aria-valuetext={`${currentSize} pixels`} onKeyDown={(event) => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const nextSize = Math.min(maxSize, Math.max(minSize, currentSize + (event.key === 'ArrowRight' ? 8 : -8))); table.setColumnSizing((current) => ({ ...current, [header.column.id]: nextSize })); } }} onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} /> : null}</th>;
            })}</tr>)}</thead>
            <tbody style={shouldVirtualize ? { width: table.getTotalSize(), height: virtualizer.getTotalSize(), position: 'relative', display: 'grid' } : undefined}>
              {visibleRows.map(({ row, item }) => <tr key={row.id} data-index={item?.index} ref={item ? virtualizer.measureElement : undefined} className={row.getIsSelected() ? 'selected' : undefined} style={item ? { position: 'absolute', transform: `translateY(${item.start}px)`, display: 'flex', width: '100%' } : undefined}>{row.getVisibleCells().map((cell) => {
                const pinned = cell.column.getIsPinned();
                const mobileVisible = mobileColumnSet.size === 0 || mobileColumnSet.has(cell.column.id) || cell.column.id === GRID_ROW_ACTIONS_COLUMN_ID;
                const mobilePrimary = cell.column.id === mobilePrimaryColumn;
                const label = typeof cell.column.columnDef.header === 'string' ? cell.column.columnDef.header : cell.column.id;
                return <td key={cell.id} className={`column-${cell.column.id}${pinned ? ` pinned-column pinned-${pinned}` : ''}${mobileVisible ? ' mobile-visible' : ''}${mobilePrimary ? ' mobile-primary' : ''}`} style={{ width: cell.column.getSize(), position: pinned ? 'sticky' : undefined, left: pinned === 'start' ? cell.column.getStart('start') : undefined, right: pinned === 'end' ? cell.column.getAfter('end') : undefined }}>{mobileVisible && !mobilePrimary ? <span className="mobile-cell-label">{label}</span> : null}<table.FlexRender cell={cell} /></td>;
              })}</tr>)}
            </tbody>
          </table>
        </div>
      ) : emptyState ?? <EmptyState title={emptyTitle} description={emptyDescription} />}
      <footer className="grid-footer">
        <span>{selectedCount ? `${selectedCount} selected · ` : ''}{matchingCount} matching records</span>
        <label>Rows <select value={table.state.pagination.pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))}>{pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <span>Page {table.state.pagination.pageIndex + 1}{resolvedPageCount < 0 ? '' : ` of ${Math.max(1, resolvedPageCount)}`}</span>
        <div><button type="button" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button><button type="button" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button></div>
      </footer>
    </section>
  );
}
