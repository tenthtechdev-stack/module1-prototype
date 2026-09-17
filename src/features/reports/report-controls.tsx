'use client';

import { useId, useState, type FormEvent } from 'react';
import { RotateCcw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { ReportDimension, ReportKind, ReportResult } from '@/src/domain/reports';
import type { ReportSavedView } from '@/src/domain/report-saved-views';
import { Button } from '@/src/components/ui/actions';
import { Badge } from '@/src/components/ui/feedback';
import { Input, Select } from '@/src/components/ui/forms';
import { Drawer, Popover } from '@/src/components/ui/overlays';

export const DIMENSION_LABELS: Record<ReportDimension, string> = {
  none: 'Individual records', company: 'Company', marketplace: 'Marketplace', account: 'Marketplace Account',
  product: 'Product', sku: 'SKU', 'product-group': 'Product Group', date: 'Date', week: 'Week', month: 'Month',
  'expense-category': 'Expense Category', 'expense-type': 'Expense Type', 'fee-type': 'Fee Type',
};
export interface ReportFilters {
  productId: string;
  productGroupId: string;
  completeness: 'all' | 'complete' | 'incomplete';
  category: string;
  feeType: string;
  expenseType: 'all' | 'recurring' | 'one-off';
}
export const EMPTY_REPORT_FILTERS: ReportFilters = { productId: '', productGroupId: '', completeness: 'all', category: '', feeType: '', expenseType: 'all' };
export function reportFilterCount(filters: ReportFilters) { return Object.values(filters).filter((value) => value && value !== 'all').length; }

function FilterFields({ kind, data, filters, canViewCogs, onChange }: {
  kind: ReportKind; data?: ReportResult; filters: ReportFilters; canViewCogs: boolean; onChange: (filters: ReportFilters) => void;
}) {
  return <div className="report-filter-fields">
    <label><span>Product</span><Select aria-label="Filter by Product" value={filters.productId} onChange={(event) => onChange({ ...filters, productId: event.target.value })}><option value="">All Products</option>{filters.productId && !data?.products.some((item) => item.id === filters.productId) ? <option value={filters.productId}>Selected Product</option> : null}{data?.products.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.internalSku}</option>)}</Select></label>
    <label><span>Product Group</span><Select aria-label="Filter by Product Group" value={filters.productGroupId} onChange={(event) => onChange({ ...filters, productGroupId: event.target.value })}><option value="">All Product Groups</option><option value="ungrouped">Ungrouped</option>{filters.productGroupId && filters.productGroupId !== 'ungrouped' && !data?.productGroups.some((item) => item.id === filters.productGroupId) ? <option value={filters.productGroupId}>Selected Product Group</option> : null}{data?.productGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></label>
    {canViewCogs && kind !== 'expenses' ? <label><span>Profitability completeness</span><Select aria-label="Filter by profitability completeness" value={filters.completeness} onChange={(event) => onChange({ ...filters, completeness: event.target.value as ReportFilters['completeness'] })}><option value="all">All coverage</option><option value="complete">Complete</option><option value="incomplete">Incomplete</option></Select></label> : null}
    {kind === 'fees' ? <label><span>Fee Type</span><Select aria-label="Filter by Fee Type" value={filters.feeType} onChange={(event) => onChange({ ...filters, feeType: event.target.value })}><option value="">All fee types</option>{filters.feeType && !data?.feeTypes.includes(filters.feeType) ? <option value={filters.feeType}>{filters.feeType}</option> : null}{data?.feeTypes.map((type) => <option key={type} value={type}>{type}</option>)}</Select></label> : null}
    {kind === 'expenses' ? <><label><span>Category</span><Select aria-label="Filter by Expense Category" value={filters.category} onChange={(event) => onChange({ ...filters, category: event.target.value })}><option value="">All categories</option>{filters.category && !data?.categories.includes(filters.category) ? <option value={filters.category}>Selected category</option> : null}{data?.categories.map((category) => <option key={category} value={category}>{category}</option>)}</Select></label><label><span>Expense Type</span><Select aria-label="Filter by Expense Type" value={filters.expenseType} onChange={(event) => onChange({ ...filters, expenseType: event.target.value as ReportFilters['expenseType'] })}><option value="all">All expense types</option><option value="recurring">Recurring</option><option value="one-off">One-off</option></Select></label></> : null}
  </div>;
}

export function ReportFilterBar(props: Parameters<typeof FilterFields>[0] & { onClear: () => void }) {
  const count = reportFilterCount(props.filters);
  return <><section className="report-filter-bar report-desktop-filters" aria-label="Report filters"><FilterFields {...props} />{count ? <Button size="compact" variant="ghost" onClick={props.onClear}>Clear filters <Badge>{count}</Badge></Button> : null}</section><div className="report-mobile-filters"><Drawer title="Report filters" description="Refine this report within the Company, marketplace, account and exact dates selected above." trigger={<Button><SlidersHorizontal size={14} /> Filters {count ? <Badge>{count}</Badge> : null}</Button>}><div className="report-filter-sheet"><FilterFields {...props} />{count ? <Button onClick={props.onClear}>Clear filters</Button> : null}</div></Drawer></div></>;
}

export function SavedReportViews({ views, activeViewId, onApply, onCreate, onSave, onRename, onDelete }: {
  views: ReportSavedView[]; activeViewId: string; onApply: (view: ReportSavedView) => void;
  onCreate: (name: string) => void; onSave: () => void; onRename: (name: string) => void; onDelete: () => void;
}) {
  const active = views.find((view) => view.id === activeViewId) ?? views[0];
  const [name, setName] = useState('');
  const id = useId();
  const create = (event: FormEvent) => { event.preventDefault(); if (name.trim()) { onCreate(name.trim().slice(0, 80)); setName(''); } };
  return <Popover label={active.name} contentLabel="Manage saved report configurations"><div className="report-saved-views"><header><strong>Saved configurations</strong><small>Personal report filters, grouping, sorting and columns. Global authorised scope stays selected.</small></header><div className="report-saved-list">{views.map((view) => <button type="button" key={view.id} aria-current={view.id === active.id ? 'true' : undefined} onClick={() => onApply(view)}><span>{view.name}</span><small>{view.builtIn ? 'Default' : 'Personal'}</small></button>)}</div><div className="report-saved-actions"><Button size="compact" onClick={onSave}><Save size={13} /> Save current</Button><Button size="compact" variant="ghost" onClick={() => onApply(active)}><RotateCcw size={13} /> Restore</Button></div><form onSubmit={create}><label htmlFor={id}>Create named configuration</label><div><Input id={id} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Monthly Product Group review" /><Button type="submit" size="compact" disabled={!name.trim()}>Create</Button></div></form>{!active.builtIn ? <form onSubmit={(event) => { event.preventDefault(); const next = String(new FormData(event.currentTarget).get('name') ?? '').trim().slice(0, 80); if (next) onRename(next); }}><label htmlFor={`${id}-rename`}>Rename configuration</label><div><Input name="name" id={`${id}-rename`} key={active.id} defaultValue={active.name} maxLength={80} /><Button type="submit" size="compact">Rename</Button><Button size="compact" variant="danger" aria-label={`Delete ${active.name}`} onClick={onDelete}><Trash2 size={14} /></Button></div></form> : null}</div></Popover>;
}
