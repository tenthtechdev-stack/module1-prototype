'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, RefreshCw, X, XCircle } from 'lucide-react';
import type { Marketplace } from '@/src/domain/models';
import type { DatePresetKey } from '@/src/domain/date-ranges';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { DateRangeControl, SelectMenu, type SelectMenuOption } from '@/src/components/ui/forms';
import { Popover } from '@/src/components/ui/overlays';

function ContextSelect({ label, value, onChange, options, icon, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: SelectMenuOption[]; icon?: React.ReactNode; disabled?: boolean }) {
  return (
    <div className="context-select">
      <small>{label}</small>
      <SelectMenu ariaLabel={label} value={value} options={options} disabled={disabled} startIcon={icon} onValueChange={onChange} />
    </div>
  );
}

function ContextControls({ mobile = false }: { mobile?: boolean }) {
  const { context, authorisedCompanies, availableAccounts, workspaceLoading, companyNameFor, setCompany, setMarketplace, setAccount, setDatePreset, setDateRange, datePreset } = useAnalysisContext();
  const companyOptions = [{ value: 'all', label: 'All authorised companies' }, ...authorisedCompanies.map((company) => ({ value: company.id, label: company.name }))];
  const marketplaceOptions = [{ value: 'all', label: 'Amazon + eBay + Temu' }, { value: 'amazon', label: 'Amazon' }, { value: 'ebay', label: 'eBay' }, { value: 'temu', label: 'Temu' }];
  const accountOptions = [{ value: 'all', label: availableAccounts.length ? 'All matching accounts' : 'No matching accounts', disabled: availableAccounts.length === 0 }, ...availableAccounts.map((account) => ({ value: account.id, label: `${account.displayName} · ${companyNameFor(account.companyId)}` }))];
  const dateOptions = [{ value: '30d', label: 'Last 30 days' }, { value: 'month', label: '1 Aug – 27 Aug 2026' }, { value: 'quarter', label: 'Quarter to date' }, { value: 'custom', label: `Custom: ${context.dateRange.from} – ${context.dateRange.to}`, disabled: true }];
  return (
    <div className={mobile ? 'context-controls mobile' : 'context-controls'}>
      <ContextSelect label="Company" value={context.companyId} options={companyOptions} disabled={workspaceLoading} onChange={setCompany} />
      <ContextSelect label="Marketplace" value={context.marketplace} options={marketplaceOptions} onChange={(value) => setMarketplace(value as Marketplace | 'all')} />
      <ContextSelect label="Account" value={context.marketplaceAccountIds[0] ?? 'all'} options={accountOptions} disabled={workspaceLoading || availableAccounts.length === 0} onChange={setAccount} />
      <ContextSelect label="Date range" value={datePreset} options={dateOptions} onChange={(value) => value !== 'custom' && setDatePreset(value as DatePresetKey)} icon={<CalendarDays size={13} />} />
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
