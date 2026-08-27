'use client';

import { useMemo, useRef } from 'react';
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
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ChevronDown, Columns3, Download, Search, Star, X } from 'lucide-react';
import { EmptyState } from '@/src/components/states/states';

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

type GridColumn<TData extends { id: string }> = ColumnDef<typeof gridFeatures, TData, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

interface EnterpriseDataGridProps<TData extends { id: string }> {
  data: TData[];
  columns: GridColumn<TData>[];
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  canExport?: boolean;
  virtualize?: boolean;
}

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function EnterpriseDataGrid<TData extends { id: string }>({
  data,
  columns,
  searchPlaceholder = 'Search records',
  emptyTitle,
  emptyDescription,
  canExport = true,
  virtualize = false,
}: EnterpriseDataGridProps<TData>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stableColumns = useMemo(() => columns, [columns]);
  const table = useTable({
    features: gridFeatures,
    data,
    columns: stableColumns,
    getRowId: (row) => row.id,
    globalFilterFn: 'includesString',
    columnResizeMode: 'onChange',
    enableSortingRemoval: false,
    initialState: {
      pagination: { pageIndex: 0, pageSize: 10 },
      columnPinning: { start: ['select', 'name'], end: [] },
      columnVisibility: { marketplace: false, company: false },
    },
  });
  const rows = table.getRowModel().rows;
  // TanStack Virtual intentionally exposes imperative measurement functions.
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 44,
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 6,
  });
  const visibleRows = virtualize ? virtualizer.getVirtualItems().map((item) => ({ row: rows[item.index], item })) : rows.map((row) => ({ row, item: null }));
  const selectedCount = table.getSelectedRowIds().length;

  function exportCsv(selectedOnly = false) {
    const exportColumns = table.getVisibleLeafColumns().filter((column) => column.id !== 'select');
    const exportRows = selectedOnly ? table.getSelectedRowModel().rows : table.getPrePaginatedRowModel().rows;
    const contents = [
      exportColumns.map((column) => csvCell(typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id)).join(','),
      ...exportRows.map((row) => exportColumns.map((column) => csvCell(row.getValue(column.id))).join(',')),
    ].join('\n');
    const url = URL.createObjectURL(new Blob([contents], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'stock-supplies-export.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  function saveView() {
    localStorage.setItem('stock-supplies:saved-view:v1:products', JSON.stringify({
      columnVisibility: table.state.columnVisibility,
      sorting: table.state.sorting,
      globalFilter: table.state.globalFilter,
    }));
  }

  return (
    <section className="data-panel enterprise-grid" aria-label="Product data grid">
      <div className="table-toolbar">
        <label className="grid-search"><Search size={15} /><input value={String(table.state.globalFilter ?? '')} onChange={(event) => table.setGlobalFilter(event.target.value)} aria-label="Search table" placeholder={searchPlaceholder} />{table.state.globalFilter ? <button onClick={() => table.setGlobalFilter('')} aria-label="Clear search"><X size={13} /></button> : null}</label>
        <div className="grid-actions">
          {selectedCount ? <button onClick={() => exportCsv(true)}><Download size={14} /> Export {selectedCount} selected</button> : null}
          <button onClick={saveView}><Star size={14} /> Save view</button>
          <details className="column-menu"><summary><Columns3 size={14} /> Columns <ChevronDown size={12} /></summary><div>{table.getAllLeafColumns().filter((column) => column.getCanHide()).map((column) => <label key={column.id}><input type="checkbox" checked={column.getIsVisible()} onChange={column.getToggleVisibilityHandler()} /> {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}</label>)}</div></details>
          {canExport ? <button onClick={() => exportCsv()}><Download size={14} /> Export</button> : null}
        </div>
      </div>
      {rows.length ? (
        <div className={`table-scroll${virtualize ? ' virtualized' : ''}`} ref={scrollRef}>
          <table style={{ width: table.getTotalSize() }}>
            <thead>{table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>{headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              return <th key={header.id} style={{ width: header.getSize() }} className={`column-${header.column.id}`}><button className="sort-button" disabled={!header.column.getCanSort()} onClick={header.column.getToggleSortingHandler()}>{header.isPlaceholder ? null : <table.FlexRender header={header} />}{sorted === 'asc' ? <ArrowUp size={12} /> : sorted === 'desc' ? <ArrowDown size={12} /> : null}</button>{header.column.getCanResize() ? <span className={`resize-handle${header.column.getIsResizing() ? ' resizing' : ''}`} onMouseDown={header.getResizeHandler()} onTouchStart={header.getResizeHandler()} /> : null}</th>;
            })}</tr>)}</thead>
            <tbody style={virtualize ? { height: virtualizer.getTotalSize(), position: 'relative', display: 'grid' } : undefined}>
              {visibleRows.map(({ row, item }) => <tr key={row.id} data-index={item?.index} ref={item ? virtualizer.measureElement : undefined} className={row.getIsSelected() ? 'selected' : undefined} style={item ? { position: 'absolute', transform: `translateY(${item.start}px)`, display: 'flex', width: '100%' } : undefined}>{row.getVisibleCells().map((cell) => <td key={cell.id} className={`column-${cell.column.id}`} style={{ width: cell.column.getSize() }}><table.FlexRender cell={cell} /></td>)}</tr>)}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title={emptyTitle} description={emptyDescription} />}
      <footer className="grid-footer"><span>{selectedCount ? `${selectedCount} selected · ` : ''}{table.getPrePaginatedRowModel().rows.length} matching records</span><label>Rows <select value={table.state.pagination.pageSize} onChange={(event) => table.setPageSize(Number(event.target.value))}><option value="10">10</option><option value="25">25</option><option value="50">50</option></select></label><span>Page {table.state.pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span><div><button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>Previous</button><button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>Next</button></div></footer>
    </section>
  );
}
