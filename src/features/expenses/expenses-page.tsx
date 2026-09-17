'use client';
import Link from 'next/link';
import { formatDate } from '@/src/domain/calculations';
import { UnambiguousDateInput } from '@/src/components/ui/forms';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { createColumnHelper } from '@tanstack/react-table';
import { Plus, RefreshCw } from 'lucide-react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState } from '@/src/components/rbac/access';
import { PageHeader } from '@/src/components/product/patterns';
import { EnterpriseDataGrid, gridFeatures } from '@/src/components/tables/enterprise-data-grid';
import { EmptyState, ErrorState, PageSkeleton } from '@/src/components/states/states';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { Breadcrumbs } from '@/src/components/ui/navigation';
import { DropdownMenu } from '@/src/components/ui/overlays';
import { EXPENSE_ALLOCATION_BASIS, type ExpenseFilters, type ExpenseListItem, type ExpenseWorkspace } from '@/src/domain/expenses';
import { shiftIsoDate } from '@/src/domain/financial-calculations';
import { useExpenses } from '@/src/services/hooks/use-expenses';
import { EndExpenseDialog, ExpenseEditor, scopeTypeLabel, sourceMoney } from './expense-editor';
import './expenses.css';

const column = createColumnHelper<typeof gridFeatures, ExpenseListItem>();
export const expensePeriod = (item: ExpenseListItem) => `${formatDate(item.version.effectiveFrom)} — ${item.version.effectiveTo ? formatDate(shiftIsoDate(item.version.effectiveTo, -1)) : 'Ongoing'}`;
export function ExpenseStatusBadge({ item }: { item: ExpenseListItem }) { return <Badge tone={item.needsReview ? 'warning' : item.status === 'active' ? 'positive' : item.status === 'scheduled' ? 'info' : 'neutral'}>{item.needsReview ? 'Needs review' : item.status[0].toUpperCase() + item.status.slice(1)}</Badge>; }
export function ExpenseSummary({ summary, currency }: { summary: ExpenseWorkspace['summary']; currency: string }) {
  return <section className="expense-summary" aria-label="Expense summary"><div><span>Active recurring</span><strong>{summary.activeRecurring}</strong></div><div><span>One-off this period</span><strong>{summary.oneOffThisPeriod}</strong></div><div><span>Expense amount</span><strong>{sourceMoney(summary.amountMinor, currency)}</strong></div><div><span>Allocated</span><strong>{sourceMoney(summary.allocatedMinor, currency)}</strong></div><div><span>Unallocated</span><strong>{sourceMoney(summary.unallocatedMinor, currency)}</strong></div><div><span>Needs review</span><strong>{summary.needsReview}</strong></div></section>;
}

export function ExpensesPage() {
  const { workspace, context } = useAnalysisContext(); const searchParams = useSearchParams(); const router = useRouter(); const { showToast } = useToast();
  const [filters, setFilters] = useState<ExpenseFilters>(() => ({ needsReview: searchParams.get('needsReview') === 'true' || searchParams.get('needsReview') === '1', productId: searchParams.get('product') || undefined }));
  const [editing, setEditing] = useState<ExpenseListItem | 'new' | null>(null); const [ending, setEnding] = useState<ExpenseListItem | null>(null);
  const hook = useExpenses(filters); const data = hook.query.data;
  const base = `/o/${workspace.organisation.slug}/expenses`;
  const detailHref = (id: string, tab?: string) => { const params = new URLSearchParams(searchParams.toString()); params.delete('needsReview'); if (tab) params.set('tab', tab); else params.delete('tab'); return `${base}/${encodeURIComponent(id)}?${params}`; };
  const change = <K extends keyof ExpenseFilters>(key: K, value: ExpenseFilters[K]) => setFilters((current) => ({ ...current, [key]: value }));
  const columns = useMemo(() => [
    column.accessor((row) => row.expense.name, { id: 'expense', header: 'Expense', size: 290, cell: ({ row }) => <Link className="expense-name" href={detailHref(row.original.id)}>{row.original.expense.name}</Link> }),
    column.accessor((row) => row.expense.type, { id: 'type', header: 'Type', size: 105, cell: ({ getValue }) => getValue() === 'recurring' ? 'Recurring' : 'One-off' }),
    column.accessor((row) => row.expense.category, { id: 'category', header: 'Category', size: 175 }),
    column.accessor('scopeLabel', { header: 'Scope', size: 210, cell: ({ row }) => <span>{scopeTypeLabel(row.original.version.scope.type)}<small className="expense-cell-sub">{row.original.scopeLabel}</small></span> }),
    column.accessor((row) => row.version.amountMinor, { id: 'amount', header: 'Source amount', size: 145, cell: ({ row }) => <span className="numeric">{sourceMoney(row.original.version.amountMinor, row.original.version.currency)}</span> }),
    column.accessor((row) => row.version.currency, { id: 'currency', header: 'Currency', size: 92 }),
    column.accessor((row) => row.version.recurrence ?? 'One-off', { id: 'recurrence', header: 'Recurrence', size: 110 }),
    column.accessor((row) => row.version.effectiveFrom, { id: 'effectiveFrom', header: 'Effective from', size: 130, cell: ({ getValue }) => formatDate(getValue()) }),
    column.accessor((row) => row.version.effectiveTo ? shiftIsoDate(row.version.effectiveTo, -1) : 'Ongoing', { id: 'effectiveTo', header: 'Effective to', size: 130, cell: ({ getValue }) => getValue() === 'Ongoing' ? 'Ongoing' : formatDate(getValue()) }),
    column.accessor('status', { header: 'Status', size: 135, cell: ({ row }) => <ExpenseStatusBadge item={row.original} /> }),
    column.accessor((row) => row.expense.sensitive ? 'Sensitive' : 'Standard', { id: 'sensitivity', header: 'Sensitivity', size: 115 }),
    column.accessor((row) => row.expense.updatedAt, { id: 'updatedAt', header: 'Last updated', size: 130, cell: ({ getValue }) => formatDate(getValue()) }),
    column.accessor((row) => row.expense.updatedBy, { id: 'updatedBy', header: 'Updated by', size: 160 }),
  // Links retain the authoritative analysis context.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [base, searchParams]);
  const actions = (item: ExpenseListItem) => <DropdownMenu label="Actions" accessibleLabel={`Actions for ${item.expense.name}`} items={[{ label: 'View Expense', onSelect: () => router.push(detailHref(item.id)) }, { label: 'View History', onSelect: () => router.push(detailHref(item.id, 'history')) }, ...(hook.canEdit ? [{ label: 'Edit / Update Amount', disabled: hook.busy, onSelect: () => { hook.save.reset(); setEditing(item); } }, ...(item.expense.type === 'recurring' && item.status !== 'ended' ? [{ label: 'End Expense', disabled: hook.busy, danger: true, onSelect: () => { hook.end.reset(); setEnding(item); } }] : [])] : [])]} />;
  if (!hook.access.allowed) return <AccessState decision={hook.access} />;
  return <div className="expenses-page"><Breadcrumbs items={[{ label: workspace.organisation.name, href: `/o/${workspace.organisation.slug}/dashboard` }, { label: 'Expenses' }]} /><PageHeader eyebrow="Business analytics" title="Expenses" description="Maintain operational expenses and their scope without losing the history behind prior profitability." actions={<><Button size="compact" onClick={() => hook.query.refetch()} disabled={hook.query.isFetching || hook.busy}><RefreshCw size={14} />Refresh</Button>{hook.canEdit ? <Button variant="primary" disabled={!data || hook.busy} onClick={() => { hook.save.reset(); setEditing('new'); }}><Plus size={15} />Add expense</Button> : <Badge>Read only</Badge>}</>} />
    {!data && hook.query.isPending ? <PageSkeleton /> : hook.query.isError ? <ErrorState title="Expenses could not be loaded" description={hook.query.error.message} onRetry={() => hook.query.refetch()} /> : data ? <>
      {data.sensitiveRestricted ? <Alert title="Partial expense visibility">Only expenses permitted for your role are shown. The summary covers those visible records; complete profitability may be unavailable.</Alert> : null}
      <ExpenseSummary summary={data.summary} currency={workspace.organisation.reportingCurrency} />
      <p className="expense-context-note">Reporting period {formatDate(context.dateRange.from)} to {formatDate(context.dateRange.to)} · {workspace.organisation.reportingCurrency}. Company, Marketplace and Marketplace Account use the context bar above. Summary follows the filters below.</p>
      <section className="expense-filter-bar" aria-label="Expense filters"><label className="expense-search">Search<input type="search" value={filters.search ?? ''} onChange={(event) => change('search', event.target.value)} placeholder="Expense, category or scope" /></label><label>Product<select value={filters.productId ?? ''} onChange={(event) => change('productId', event.target.value || undefined)}><option value="">All products</option>{data.products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}</select></label><label>Type<select value={filters.type ?? 'all'} onChange={(event) => change('type', event.target.value as ExpenseFilters['type'])}><option value="all">All types</option><option value="recurring">Recurring</option><option value="one-off">One-off</option></select></label><label>Category<select value={filters.category ?? 'all'} onChange={(event) => change('category', event.target.value)}><option value="all">All categories</option>{data.categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Status<select value={filters.status ?? 'all'} onChange={(event) => change('status', event.target.value as ExpenseFilters['status'])}><option value="all">All statuses</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="ended">Ended</option></select></label>{hook.canViewSensitive ? <label>Sensitivity<select value={filters.sensitivity ?? 'all'} onChange={(event) => change('sensitivity', event.target.value as ExpenseFilters['sensitivity'])}><option value="all">All permitted</option><option value="standard">Standard</option><option value="sensitive">Sensitive</option></select></label> : null}<label>Effective on<UnambiguousDateInput aria-label="Effective on" value={filters.effectiveDate ?? ''} onChange={(event) => change('effectiveDate', event.target.value || undefined)} /></label><label className="expense-check"><input type="checkbox" checked={filters.needsReview ?? false} onChange={(event) => change('needsReview', event.target.checked)} />Needs review</label><Button size="compact" onClick={() => setFilters({})}>Clear filters</Button></section>
      {data.summary.needsReview ? <Alert tone="warning" title="Unallocated Expense">Some occurrences have no eligible transaction on their expense date. Review the Allocation tab to see the evidence; unallocated amounts remain visible.</Alert> : null}
      {!data.rows.length ? <EmptyState title={Object.values(filters).some(Boolean) ? 'No expenses match these filters' : 'No expenses configured'} description="Review the current scope and filters, or add an authorised operating expense." actions={hook.canEdit ? <Button onClick={() => setEditing('new')}>Add expense</Button> : undefined} /> : <><div className="expense-desktop-grid"><EnterpriseDataGrid key={`${workspace.organisation.id}:${hook.canViewSensitive}`} ariaLabel="Expenses" data={data.rows} columns={columns} canExport={false} search={filters.search ?? ''} onSearchChange={(updater) => change('search', typeof updater === 'function' ? updater(filters.search ?? '') : updater)} manualFiltering initialColumnVisibility={{ category: false, currency: false, recurrence: false, effectiveTo: false, updatedBy: false, sensitivity: hook.canViewSensitive }} initialPinnedColumns={['expense']} renderRowActions={actions} /></div><div className="expense-mobile-cards" aria-label="Expense cards">{data.rows.map((item) => <article className="expense-mobile-card" key={item.id}><div><Link className="expense-name" href={detailHref(item.id)}>{item.expense.name}</Link><ExpenseStatusBadge item={item} /></div><strong>{sourceMoney(item.version.amountMinor, item.version.currency)}<small>{item.expense.type === 'recurring' ? ' / month' : ' one-off'}</small></strong><p>{scopeTypeLabel(item.version.scope.type)} · {item.scopeLabel}</p><p>{expensePeriod(item)}</p><footer><span>{item.expense.type === 'recurring' ? 'Recurring' : 'One-off'}</span>{actions(item)}</footer></article>)}</div></>}
      <p className="expense-context-note">Allocation basis: {EXPENSE_ALLOCATION_BASIS}. Monthly recurring charges retain their billing day; no daily proration.</p>
    </> : null}
    {editing && data ? <ExpenseEditor key={editing === 'new' ? 'new' : editing.id} item={editing === 'new' ? undefined : editing} workspace={data} hook={hook} onClose={() => setEditing(null)} onSaved={(id) => { showToast(editing === 'new' ? 'Expense created. Profitability refreshed.' : 'Expense updated. History and audit evidence remain preserved.'); setEditing(null); router.push(detailHref(id)); }} /> : null}
    {ending ? <EndExpenseDialog item={ending} hook={hook} onClose={() => setEnding(null)} onSaved={() => { setEnding(null); showToast('Expense ended. Historical evidence remains available.'); }} /> : null}
  </div>;
}