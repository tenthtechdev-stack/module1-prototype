'use client';

import { useState } from 'react';
import { Bell, Ellipsis, Info, PanelRight, Save, Trash2 } from 'lucide-react';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { AccessState, PermissionBoundary, useAccess, useAccessRuntime } from '@/src/components/rbac/access';
import { EmptyState, ErrorState, PageSkeleton } from '@/src/components/states/states';
import { Button, IconButton } from '@/src/components/ui/actions';
import { Checkbox, DateRangeControl, Field, Input, MultiSelect, Radio, SearchInput, Select, Switch, Textarea } from '@/src/components/ui/forms';
import { Alert, Badge, Skeleton, Spinner, useToast } from '@/src/components/ui/feedback';
import { ConfirmationDialog, Drawer, DropdownMenu, Modal, Popover, Tabs, Tooltip } from '@/src/components/ui/overlays';
import { Breadcrumbs, Pagination } from '@/src/components/ui/navigation';
import { CompanyBadge, MarketplaceBadge, MetricValue, PageHeader, SectionHeader, SyncStatusBadge } from '@/src/components/product/patterns';
import { ProductTableDemo } from '@/src/features/foundation/product-table-demo';
import { formatMoney } from '@/src/domain/calculations';

export function FoundationPage() {
  const { scenario, runtime } = usePrototype();
  const { role } = useAccessRuntime();
  const { context, scopeDecision, setDateRange, workspace } = useAnalysisContext();
  const pageAccess = useAccess('profitability.view');
  const { showToast } = useToast();
  const [enabled, setEnabled] = useState(true);
  const [page, setPage] = useState(1);
  const cogsReadiness = workspace.cogsReadiness;

  if (!pageAccess.allowed) return <AccessState decision={pageAccess} />;
  if (!scopeDecision.allowed) return <AccessState decision={scopeDecision} />;

  return <div className="foundation-page">
    <Breadcrumbs items={[{ label: workspace.organisation.name }, { label: 'Frontend foundation' }]} />
    <PageHeader eyebrow="Module 01 · Phase 1" title="Frontend foundation" description="The reusable visual, access, data-service and interaction system for later marketplace profitability screens." actions={<><Badge tone="info">Local prototype</Badge><Button variant="primary" onClick={() => showToast('Foundation settings saved') }><Save size={14} /> Save view</Button></>} />
    <Alert tone={runtime.freshness.state === 'error' ? 'negative' : runtime.freshness.state === 'warning' ? 'warning' : runtime.freshness.state === 'syncing' ? 'info' : 'positive'} title={`${scenario.label} scenario`}><>{runtime.notice}</></Alert>
    {cogsReadiness && !cogsReadiness.reliableProfitability ? <Alert tone="warning" title={`${cogsReadiness.cogsMissing.toLocaleString('en-GB')} product costs remain missing`}><>Onboarding preserved {cogsReadiness.coveragePercent}% COGS coverage for this tenant. Net Profit and margin remain incomplete wherever product cost is missing; detailed dashboard work remains outside Phase 2.</></Alert> : null}

    <section className="foundation-metrics" aria-label="Active prototype state">
      <MetricValue label="Preview role" value={role.label} detail={role.description} />
      <MetricValue label="Data freshness" value={runtime.freshness.label} detail={runtime.freshness.detail} />
      {cogsReadiness
        ? <MetricValue label="COGS coverage" value={`${cogsReadiness.coveragePercent}%`} detail={`${cogsReadiness.cogsComplete.toLocaleString('en-GB')} of ${cogsReadiness.productsImported.toLocaleString('en-GB')} products costed`} />
        : <MetricValue label="Visible revenue" value={formatMoney(18_420_942)} detail="Tabular GBP formatting" />}
      <PermissionBoundary capability="expenses.view_sensitive" fallback={<MetricValue label="Sensitive expenses" value="Restricted" detail="Capability: expenses.view_sensitive" />}><MetricValue label="Sensitive expenses" value={formatMoney(1_842_000)} detail="Visible for this role" /></PermissionBoundary>
    </section>

    <div className="foundation-grid-layout">
      <section className="foundation-section"><SectionHeader title="Controls" description="Compact shared inputs with consistent focus, disabled and validation states." />
        <div className="component-grid controls-grid">
          <Field label="Reference name" hint="Shared input pattern"><Input defaultValue="August profitability" /></Field>
          <Field label="Search"><SearchInput placeholder="Search SKUs or orders" /></Field>
          <Field label="Marketplace"><Select defaultValue="amazon"><option value="all">All marketplaces</option><option value="amazon">Amazon</option><option value="ebay">eBay</option><option value="temu">Temu</option></Select></Field>
          <Field label="Companies" hint="Native multi-select for the foundation"><MultiSelect defaultValue={workspace.companies.slice(0, 1).map((company) => company.id)}>{workspace.companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</MultiSelect></Field>
          <Field label="Internal note"><Textarea rows={3} defaultValue="Review missing COGS before month-end close." /></Field>
          <Field label="Date range"><DateRangeControl from={context.dateRange.from} to={context.dateRange.to} onChange={setDateRange} /></Field>
        </div>
        <div className="choice-row"><Checkbox label="Include refunded orders" defaultChecked /><Radio name="density" label="Comfortable" /><Radio name="density" label="Dense" defaultChecked /><Switch label="Auto-refresh data" checked={enabled} onCheckedChange={setEnabled} /></div>
        <div className="button-row"><Button variant="primary">Primary action</Button><Button>Secondary</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Destructive</Button><Button loading>Loading</Button><IconButton label="Notifications"><Bell size={16} /></IconButton></div>
      </section>

      <section className="foundation-section"><SectionHeader title="Statuses and identifiers" description="Shared product vocabulary keeps marketplace and sync states consistent." />
        <div className="badge-row"><MarketplaceBadge marketplace="amazon" /><MarketplaceBadge marketplace="ebay" /><MarketplaceBadge marketplace="temu" /><CompanyBadge name={workspace.companies[0]?.name ?? workspace.organisation.name} /><Badge tone="warning">7 need attention</Badge></div>
        <div className="badge-row"><SyncStatusBadge status="synced" /><SyncStatusBadge status="syncing" /><SyncStatusBadge status="delayed" /><SyncStatusBadge status="failed" /><SyncStatusBadge status="authentication_required" /></div>
        <Alert tone="info" title="Freshness remains visible">The shell always separates fresh, delayed, partial and failed data.</Alert>
        <div className="loading-demo"><Spinner label="Refreshing data" /><Skeleton className="demo-skeleton short" /><Skeleton className="demo-skeleton" /></div>
      </section>

      <section className="foundation-section"><SectionHeader title="Overlays and actions" description="Keyboard-accessible dialogs, drawers, menus, tooltips and notifications." />
        <div className="button-row">
          <Modal trigger={<Button>Open modal</Button>} title="Save foundation view" description="This is a mocked visual QA interaction." footer={<Button variant="primary" onClick={() => showToast('View saved')}>Save</Button>}><Field label="View name"><Input defaultValue="Executive review" /></Field></Modal>
          <Drawer trigger={<Button><PanelRight size={14} /> Open drawer</Button>} title="Context drawer" description="Responsive product-level drawer pattern."><Alert tone="info" title="Current scope">All authorised companies · Amazon · Last 30 days</Alert></Drawer>
          <ConfirmationDialog trigger={<Button variant="danger"><Trash2 size={14} /> Confirm action</Button>} title="Remove saved view?" description="This prototype action does not delete production data." onConfirm={() => showToast('Saved view removed', 'warning')} />
          <DropdownMenu label="Actions" items={[{ label: 'Duplicate view' }, { label: 'Export CSV' }, { label: 'Remove view', danger: true }]} />
          <Popover label="Scope note"><p>Popover content stays compact and anchored to its trigger.</p></Popover>
          <Tooltip label="More options"><IconButton label="More options"><Ellipsis size={16} /></IconButton></Tooltip>
          <Button onClick={() => showToast('Mock data refreshed')}>Show toast</Button>
        </div>
        <Pagination page={page} pageCount={5} onPageChange={setPage} />
      </section>
    </div>

    <ProductTableDemo />

    <section className="foundation-section"><SectionHeader title="Reusable application states" description="Subscription, entitlement, permission and assignment restrictions remain intentionally distinct." />
      <Tabs tabs={[
        { id: 'empty', label: 'Empty', content: <EmptyState title="No marketplace connected" description="Connect Amazon, eBay or Temu to begin importing data." /> },
        { id: 'error', label: 'Error', content: <ErrorState title="Mock service unavailable" onRetry={() => showToast('Retry started', 'info')} /> },
        { id: 'loading', label: 'Loading', content: <PageSkeleton /> },
        { id: 'subscription', label: 'Subscription', content: <AccessState decision={{ allowed: false, reason: 'subscription_restricted' }} /> },
        { id: 'entitlement', label: 'Entitlement', content: <AccessState decision={{ allowed: false, reason: 'module_not_entitled' }} /> },
        { id: 'permission', label: 'Permission', content: <AccessState decision={{ allowed: false, reason: 'capability_missing' }} /> },
        { id: 'assignment', label: 'Assignment', content: <AccessState decision={{ allowed: false, reason: 'assignment_out_of_scope' }} /> },
      ]} />
    </section>
    <p className="architecture-note"><Info size={14} /> This page is an internal Phase 1 QA surface. It does not implement later dashboard analytics.</p>
  </div>;
}
