'use client';

import { useId, useState, type FormEvent } from 'react';
import { RotateCcw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { EnterpriseDataGridViewState } from '@/src/components/tables/enterprise-data-grid';
import type { TransactionListOptions } from '@/src/domain/transactions';
import { Button } from '@/src/components/ui/actions';
import { Badge } from '@/src/components/ui/feedback';
import { Input, Select } from '@/src/components/ui/forms';
import { Drawer, Popover } from '@/src/components/ui/overlays';

export interface TransactionFilters extends Required<Pick<TransactionListOptions, 'profitabilityStatus' | 'cogsSource' | 'refundState' | 'marginState' | 'completeness' | 'highFees'>> {
  productId: string;
  productGroupId: string;
  costRecordId: string;
}

export const EMPTY_TRANSACTION_FILTERS: TransactionFilters = {
  productId: '', productGroupId: '', costRecordId: '', profitabilityStatus: 'all', cogsSource: 'all',
  refundState: 'all', marginState: 'all', completeness: 'all', highFees: false,
};

export interface TransactionSavedView {
  id: string;
  name: string;
  builtIn: boolean;
  configuration: EnterpriseDataGridViewState & { filters: TransactionFilters; marketplace?: string };
}

export function transactionFilterCount(filters: TransactionFilters) {
  return Object.entries(filters).filter(([key, value]) => key === 'highFees' ? value === true : Boolean(value) && value !== 'all').length;
}

const FILTER_FIELDS = [
  { key: 'profitabilityStatus', label: 'Profitability', options: [['all', 'All profitability'], ['profitable', 'Profitable'], ['low_margin', 'Low margin'], ['loss_making', 'Loss-making'], ['incomplete', 'Incomplete'], ['refunded', 'Refunded']] },
  { key: 'cogsSource', label: 'COGS source', options: [['all', 'All cost sources'], ['direct', 'Direct Product COGS'], ['inherited', 'Product Group'], ['missing', 'Missing COGS']] },
  { key: 'refundState', label: 'Refund status', options: [['all', 'All refunds'], ['refunded', 'Any refund'], ['none', 'No refund'], ['partial', 'Partial refund'], ['full', 'Full refund']] },
  { key: 'marginState', label: 'Margin', options: [['all', 'All margins'], ['profitable', 'Profitable'], ['loss_making', 'Loss-making'], ['low_margin', 'Low margin']] },
  { key: 'completeness', label: 'Completeness', options: [['all', 'All coverage'], ['complete', 'Complete'], ['incomplete', 'Incomplete']] },
] as const;

function TransactionFilterFields({ filters, products, groups, canViewCogs, onChange }: {
  filters: TransactionFilters;
  products: readonly { id: string; name: string }[];
  groups: readonly { id: string; name: string }[];
  canViewCogs: boolean;
  onChange: (next: TransactionFilters) => void;
}) {
  return <div className="transaction-filter-fields">
    <label><span>Product</span><Select aria-label="Filter by Product" value={filters.productId} onChange={(event) => onChange({ ...filters, productId: event.target.value })}>
      <option value="">All Products</option>
      {filters.productId && !products.some((item) => item.id === filters.productId) ? <option value={filters.productId}>Selected Product</option> : null}
      {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </Select></label>
    {canViewCogs ? <label><span>Product Group</span><Select aria-label="Filter by Product Group" value={filters.productGroupId} onChange={(event) => onChange({ ...filters, productGroupId: event.target.value })}>
      <option value="">All Product Groups</option>
      {filters.productGroupId && !groups.some((item) => item.id === filters.productGroupId) ? <option value={filters.productGroupId}>Selected Product Group</option> : null}
      {groups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
    </Select></label> : null}
    {FILTER_FIELDS.filter((field) => field.key !== 'cogsSource' || canViewCogs).map((field) => <label key={field.key}><span>{field.label}</span><Select aria-label={`Filter by ${field.label}`} value={filters[field.key]} onChange={(event) => onChange({ ...filters, [field.key]: event.target.value })}>{field.options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></label>)}
  </div>;
}

export function TransactionFilterBar(props: Parameters<typeof TransactionFilterFields>[0] & { onClear: () => void }) {
  const count = transactionFilterCount(props.filters);
  return <>
    <section className="transaction-filters transaction-desktop-filters" aria-label="Transaction filters">
      <TransactionFilterFields {...props} />
      {count > 0 ? <Button variant="ghost" size="compact" onClick={props.onClear}>Clear filters <Badge>{count}</Badge></Button> : null}
    </section>
    <div className="transaction-mobile-filters">
      <Drawer title="Transaction filters" description="Refine sale lines within the Company, marketplace, account and dates selected above." trigger={<Button><SlidersHorizontal size={14} /> Filters {count ? <Badge>{count}</Badge> : null}</Button>}>
        <div className="transaction-filter-sheet"><TransactionFilterFields {...props} />{count ? <Button variant="ghost" onClick={props.onClear}>Clear filters</Button> : null}</div>
      </Drawer>
    </div>
  </>;
}

/** Shares the Phase 4 personal-view persistence shape and browser storage boundary. */
export function decodeTransactionViews(raw: string | null): TransactionSavedView[] {
  if (!raw) return [];
  try {
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values)) return [];
    return values.filter((value): value is TransactionSavedView => {
      if (!value || typeof value !== 'object' || typeof value.id !== 'string' || typeof value.name !== 'string' || value.builtIn !== false) return false;
      const config = value.configuration;
      return config?.version === 1 && typeof config.search === 'string'
        && Array.isArray(config.sorting) && config.sorting.every((sort: { id?: unknown; desc?: unknown }) => typeof sort?.id === 'string' && typeof sort.desc === 'boolean')
        && config.columnVisibility && typeof config.columnVisibility === 'object' && Object.values(config.columnVisibility).every((visible) => typeof visible === 'boolean')
        && config.columnSizing && typeof config.columnSizing === 'object' && Object.values(config.columnSizing).every((size) => typeof size === 'number' && size > 0 && Number.isFinite(size))
        && Array.isArray(config.columnPinning?.start) && Array.isArray(config.columnPinning?.end)
        && [...config.columnPinning.start, ...config.columnPinning.end].every((id) => typeof id === 'string')
        && [10, 25, 50, 100].includes(config.pageSize)
        && config.filters && Object.keys(EMPTY_TRANSACTION_FILTERS).every((key) => typeof config.filters[key] === (key === 'highFees' ? 'boolean' : 'string'))
        && (config.marketplace === undefined || ['all', 'amazon', 'ebay', 'temu'].includes(config.marketplace));
    }).slice(0, 50);
  } catch { return []; }
}

export function SavedTransactionViews({ views, activeViewId, onApply, onCreate, onSave, onRename, onDelete }: {
  views: readonly TransactionSavedView[];
  activeViewId: string;
  onApply: (view: TransactionSavedView) => void;
  onCreate: (name: string) => void;
  onSave: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const active = views.find((view) => view.id === activeViewId) ?? views[0];
  const [name, setName] = useState('');
  const inputId = useId();
  function create(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim().slice(0, 80));
    setName('');
  }
  return <Popover label={active?.name ?? 'Saved views'} contentLabel="Manage transaction saved views">
    <div className="saved-product-views">
      <header><strong>Saved views</strong><small>Restore filters, sorting, columns and marketplace scope.</small></header>
      <div className="saved-product-view-list">{views.map((view) => <button key={view.id} type="button" className={view.id === active.id ? 'active' : undefined} aria-current={view.id === active.id ? 'true' : undefined} onClick={() => onApply(view)}><span>{view.name}</span><small>{view.builtIn ? 'Preset' : 'Personal'}</small></button>)}</div>
      <div className="saved-product-view-actions"><Button size="compact" onClick={onSave}><Save size={13} /> Save current</Button><Button size="compact" variant="ghost" onClick={() => onApply(active)}><RotateCcw size={13} /> Restore</Button></div>
      <form className="saved-product-view-create" onSubmit={create}><label htmlFor={inputId}>Create named view</label><div><Input id={inputId} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Weekly margin review" /><Button size="compact" type="submit" disabled={!name.trim()}>Create</Button></div></form>
      {!active.builtIn ? <form className="saved-product-view-edit" onSubmit={(event) => { event.preventDefault(); const next = String(new FormData(event.currentTarget).get('viewName') ?? '').trim().slice(0, 80); if (next) onRename(next); }}><label htmlFor={`${inputId}-rename`}>Rename personal view</label><div><Input id={`${inputId}-rename`} name="viewName" key={active.id} defaultValue={active.name} maxLength={80} /><Button size="compact" type="submit">Rename</Button><Button type="button" size="compact" variant="danger" onClick={onDelete} aria-label={`Delete ${active.name}`}><Trash2 size={13} /></Button></div></form> : null}
    </div>
  </Popover>;
}
