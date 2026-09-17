'use client';

import { useState, type FormEvent } from 'react';
import { RotateCcw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { ColumnVisibilityState, SortingState } from '@tanstack/react-table';
import type { Marketplace, MarketplaceListingStatus } from '@/src/domain/models';
import type { ProductCogsStatus, ProductProfitabilityStatus } from '@/src/domain/products';
import type { StoredProductSavedView } from '@/src/domain/product-saved-views';
import { Button } from '@/src/components/ui/actions';
import { Input, Select } from '@/src/components/ui/forms';
import { Badge } from '@/src/components/ui/feedback';
import { Drawer, Popover } from '@/src/components/ui/overlays';

export interface ProductsListFilterState {
  cogsStatus: ProductCogsStatus | 'all';
  listingStatus: MarketplaceListingStatus | 'all';
  profitabilityStatus: ProductProfitabilityStatus | 'all';
  category: string;
}

export interface ProductViewConfiguration {
  search: string;
  filters: ProductsListFilterState;
  sorting: SortingState;
  columnVisibility: ColumnVisibilityState;
  pageSize: number;
  marketplace?: Marketplace | 'all';
}

export interface ProductSavedView extends Omit<StoredProductSavedView, 'builtIn' | 'configuration'> {
  id: string;
  name: string;
  builtIn: boolean;
  configuration: ProductViewConfiguration;
}

const COGS_OPTIONS: Array<{ value: ProductsListFilterState['cogsStatus']; label: string }> = [
  { value: 'all', label: 'All COGS states' },
  { value: 'complete', label: 'Complete' },
  { value: 'missing', label: 'Missing' },
  { value: 'partial_history', label: 'Partial history' },
  { value: 'needs_review', label: 'Needs review' },
];

const LISTING_OPTIONS: Array<{ value: ProductsListFilterState['listingStatus']; label: string }> = [
  { value: 'all', label: 'All listing states' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'suppressed', label: 'Suppressed' },
  { value: 'ended', label: 'Ended' },
  { value: 'issue', label: 'Issue' },
];

const PROFIT_OPTIONS: Array<{ value: ProductsListFilterState['profitabilityStatus']; label: string }> = [
  { value: 'all', label: 'All profitability' },
  { value: 'profitable', label: 'Profitable' },
  { value: 'loss_making', label: 'Loss-making' },
  { value: 'low_margin', label: 'Low margin' },
  { value: 'incomplete', label: 'Profit incomplete' },
];

export const EMPTY_PRODUCT_FILTERS: ProductsListFilterState = {
  cogsStatus: 'all',
  listingStatus: 'all',
  profitabilityStatus: 'all',
  category: 'all',
};

function ProductFilterFields({
  filters,
  categories,
  showCogs,
  showProfitability,
  onChange,
}: {
  filters: ProductsListFilterState;
  categories: readonly string[];
  showCogs: boolean;
  showProfitability: boolean;
  onChange: (filters: ProductsListFilterState) => void;
}) {
  return <div className="products-filter-fields">
    {showCogs ? <label>
      <span>COGS status</span>
      <Select aria-label="Filter by COGS status" value={filters.cogsStatus} onChange={(event) => onChange({ ...filters, cogsStatus: event.target.value as ProductsListFilterState['cogsStatus'] })}>
        {COGS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </label> : null}
    <label>
      <span>Listing status</span>
      <Select aria-label="Filter by listing status" value={filters.listingStatus} onChange={(event) => onChange({ ...filters, listingStatus: event.target.value as ProductsListFilterState['listingStatus'] })}>
        {LISTING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </label>
    {showProfitability ? <label>
      <span>Profitability</span>
      <Select aria-label="Filter by profitability" value={filters.profitabilityStatus} onChange={(event) => onChange({ ...filters, profitabilityStatus: event.target.value as ProductsListFilterState['profitabilityStatus'] })}>
        {PROFIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </label> : null}
    <label>
      <span>Category</span>
      <Select aria-label="Filter by category" value={filters.category} onChange={(event) => onChange({ ...filters, category: event.target.value })}>
        <option value="all">All categories</option>
        {categories.map((category) => <option key={category} value={category}>{category}</option>)}
      </Select>
    </label>
  </div>;
}

export function ProductsFilterBar({
  filters,
  categories,
  showCogs = true,
  showProfitability = true,
  onChange,
  onClear,
}: {
  filters: ProductsListFilterState;
  categories: readonly string[];
  showCogs?: boolean;
  showProfitability?: boolean;
  onChange: (filters: ProductsListFilterState) => void;
  onClear: () => void;
}) {
  const activeCount = Number(showCogs && filters.cogsStatus !== 'all')
    + Number(filters.listingStatus !== 'all')
    + Number(showProfitability && filters.profitabilityStatus !== 'all')
    + Number(filters.category !== 'all');

  return (
    <>
      <section className="products-filter-bar products-desktop-filters" aria-label="Product filters">
        <ProductFilterFields filters={filters} categories={categories} showCogs={showCogs} showProfitability={showProfitability} onChange={onChange} />
        {activeCount ? <Button className="products-clear-filters" size="compact" variant="ghost" onClick={onClear}>Clear filters <Badge>{activeCount}</Badge></Button> : null}
      </section>
      <div className="products-mobile-filter-trigger">
        <Drawer
          title="Product filters"
          description="Refine products inside the current company, marketplace and account context."
          trigger={<Button><SlidersHorizontal size={14} /> Filters {activeCount ? <Badge>{activeCount}</Badge> : null}</Button>}
        >
          <div className="products-mobile-filter-sheet">
            <ProductFilterFields filters={filters} categories={categories} showCogs={showCogs} showProfitability={showProfitability} onChange={onChange} />
            {activeCount ? <Button variant="ghost" onClick={onClear}>Clear all filters <Badge>{activeCount}</Badge></Button> : null}
          </div>
        </Drawer>
      </div>
    </>
  );
}

export function SavedProductViews({
  views,
  activeViewId,
  onApply,
  onCreate,
  onSave,
  onRestore,
  onRename,
  onDelete,
}: {
  views: readonly ProductSavedView[];
  activeViewId: string;
  onApply: (view: ProductSavedView) => void;
  onCreate: (name: string) => void;
  onSave: () => void;
  onRestore: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const active = views.find((view) => view.id === activeViewId) ?? views[0];
  const [newName, setNewName] = useState('');

  function create(event: FormEvent) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName('');
  }

  function rename(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(event.currentTarget as HTMLFormElement);
    const name = String(form.get('viewName') ?? '').trim();
    if (!name || name === active?.name) return;
    onRename(name);
  }

  return (
    <Popover label={active?.name ?? 'Saved views'} contentLabel="Manage product saved views">
      <div className="saved-product-views">
        <header>
          <strong>Saved views</strong>
          <small>Restore filters, sorting, columns and marketplace scope.</small>
        </header>
        <div className="saved-product-view-list" role="list">
          {views.map((view) => (
            <button
              type="button"
              key={view.id}
              className={view.id === active?.id ? 'active' : undefined}
              aria-current={view.id === active?.id ? 'true' : undefined}
              onClick={() => onApply(view)}
            >
              <span>{view.name}</span>
              {view.builtIn ? <small>Preset</small> : <small>Personal</small>}
            </button>
          ))}
        </div>
        <div className="saved-product-view-actions">
          <Button size="compact" onClick={onSave}><Save size={13} /> Save current</Button>
          <Button size="compact" variant="ghost" onClick={onRestore}><RotateCcw size={13} /> Restore</Button>
        </div>
        <form className="saved-product-view-create" onSubmit={create}>
          <label htmlFor="new-product-view">Create named view</label>
          <div><Input id="new-product-view" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Weekly cost review" /><Button size="compact" type="submit" disabled={!newName.trim()}>Create</Button></div>
        </form>
        {!active?.builtIn ? (
          <form className="saved-product-view-edit" onSubmit={rename}>
            <label htmlFor="rename-product-view">Rename personal view</label>
            <div><Input id="rename-product-view" key={active.id} name="viewName" defaultValue={active.name} /><Button size="compact" type="submit">Rename</Button><Button size="compact" variant="danger" type="button" onClick={onDelete} aria-label={`Delete ${active.name}`}><Trash2 size={13} /></Button></div>
          </form>
        ) : null}
      </div>
    </Popover>
  );
}
