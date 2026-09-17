'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, RefreshCw, X, XCircle } from 'lucide-react';
import type { Marketplace } from '@/src/domain/models';
import type { DatePresetKey } from '@/src/domain/date-ranges';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { DateRangeControl } from '@/src/components/ui/forms';
import { Popover } from '@/src/components/ui/overlays';

function ContextSelect({ label, value, onChange, children, icon, disabled = false }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; icon?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className="context-select">
      <small>{label}</small>
      <span>{icon}<select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>{children}</select><ChevronDown size={12} /></span>
    </label>
  );
}

function ContextControls({ mobile = false }: { mobile?: boolean }) {
  const { context, authorisedCompanies, availableAccounts, workspaceLoading, companyNameFor, setCompany, setMarketplace, setAccount, setDatePreset, setDateRange, datePreset } = useAnalysisContext();
  return (
    <div className={mobile ? 'context-controls mobile' : 'context-controls'}>
      <ContextSelect label="Company" value={context.companyId} disabled={workspaceLoading} onChange={(value) => setCompany(value)}>
        <option value="all">All authorised companies</option>
        {authorisedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </ContextSelect>
      <ContextSelect label="Marketplace" value={context.marketplace} onChange={(value) => setMarketplace(value as Marketplace | 'all')}>
        <option value="all">Amazon + eBay + Temu</option><option value="amazon">Amazon</option><option value="ebay">eBay</option><option value="temu">Temu</option>
      </ContextSelect>
      <ContextSelect label="Account" value={context.marketplaceAccountIds[0] ?? 'all'} disabled={workspaceLoading || availableAccounts.length === 0} onChange={setAccount}>
        <option value="all">{availableAccounts.length ? 'All matching accounts' : 'No matching accounts'}</option>
        {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName} · {companyNameFor(account.companyId)}</option>)}
      </ContextSelect>
      <ContextSelect label="Date range" value={datePreset} onChange={(value) => value !== 'custom' && setDatePreset(value as DatePresetKey)} icon={<CalendarDays size={13} />}>
        <option value="30d">Last 30 days</option><option value="month">1 Aug – 27 Aug 2026</option><option value="quarter">Quarter to date</option><option value="custom" disabled>Custom: {context.dateRange.from} – {context.dateRange.to}</option>
      </ContextSelect>
      {mobile ? <div className="context-custom-range"><small>Custom range</small><DateRangeControl from={context.dateRange.from} to={context.dateRange.to} onChange={setDateRange} /></div> : <Popover label="Custom dates" contentLabel="Choose a custom analysis date range"><div className="context-date-popover"><strong>Custom analysis range</strong><DateRangeControl from={context.dateRange.from} to={context.dateRange.to} onChange={setDateRange} /><small>Both dates are inclusive.</small></div></Popover>}
    </div>
  );
}

function Freshness() {
  const { runtime, scenarioId } = usePrototype();
  const { context, availableAccounts } = useAnalysisContext();
  const scopedAccounts = context.marketplaceAccountIds.length ? availableAccounts.filter((account) => context.marketplaceAccountIds.includes(account.id)) : availableAccounts;
  const accountStatuses = scopedAccounts.map((account) => account.status);
  const onboardingFreshness = accountStatuses.some((status) => status === 'authentication_required' || status === 'failed')
    ? { state: 'error' as const, label: 'Marketplace attention', detail: 'Authentication or sync failed' }
    : accountStatuses.some((status) => status === 'delayed')
      ? { state: 'warning' as const, label: 'Marketplace data delayed', detail: 'Some data remains partial' }
      : accountStatuses.some((status) => status === 'syncing' || status === 'connected' || status === 'pending' || status === 'retrying')
        ? { state: 'syncing' as const, label: 'Initial sync running', detail: 'Historical data is still partial' }
        : scopedAccounts.length ? { state: 'fresh' as const, label: 'Data up to date', detail: 'Updated 8 minutes ago' } : runtime.freshness;
  const globallyRelevant = scenarioId === 'import-errors' || scenarioId === 'past-due' || scenarioId === 'no-marketplace';
  const { state, label, detail } = globallyRelevant ? runtime.freshness : onboardingFreshness;
  const Icon = state === 'fresh' ? CheckCircle2 : state === 'error' ? XCircle : state === 'syncing' ? RefreshCw : AlertTriangle;
  return <div className={`freshness ${state}`}><Icon size={15} className={state === 'syncing' ? 'spin' : undefined} /><span><strong>{label}</strong><small>{detail}</small></span></div>;
}

export function ContextBar() {
  const { context, authorisedCompanies, accountNameFor, datePreset } = useAnalysisContext();
  const company = context.companyId === 'all' ? 'All Companies' : authorisedCompanies.find((item) => item.id === context.companyId)?.name ?? 'Assigned company';
  const marketplace = context.marketplace === 'all' ? 'All marketplaces' : context.marketplace === 'ebay' ? 'eBay' : context.marketplace[0].toUpperCase() + context.marketplace.slice(1);
  const account = context.marketplaceAccountIds[0] ? accountNameFor(context.marketplaceAccountIds[0]) : 'All matching accounts';
  const dateLabel = datePreset === '30d' ? 'Last 30 days' : datePreset === 'month' ? 'Month to date' : datePreset === 'quarter' ? 'Quarter to date' : `${context.dateRange.from} – ${context.dateRange.to}`;
  return (
    <section className="context-bar" aria-label="Analysis context">
      <div className="desktop-context"><ContextControls /></div>
      <Dialog.Root>
        <Dialog.Trigger asChild><button className="context-summary-trigger"><span>{company}</span><small>{marketplace} · {account} · {dateLabel}</small><ChevronDown size={14} /></button></Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="drawer-overlay" />
          <Dialog.Content className="context-sheet" aria-describedby={undefined}>
            <div className="drawer-heading"><div><p className="eyebrow">Analysis context</p><Dialog.Title>Choose data scope</Dialog.Title></div><Dialog.Close asChild><button className="icon-button" aria-label="Close context selector"><X size={18} /></button></Dialog.Close></div>
            <ContextControls mobile />
            <Dialog.Close asChild><button className="primary-button context-done">Apply scope</button></Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Freshness />
    </section>
  );
}
