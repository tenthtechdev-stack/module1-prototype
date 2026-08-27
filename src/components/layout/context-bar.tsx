'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronDown, RefreshCw, X, XCircle } from 'lucide-react';
import type { Marketplace } from '@/src/domain/models';
import { companies } from '@/src/fixtures/data';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { usePrototype } from '@/src/components/providers/prototype-provider';

function ContextSelect({ label, value, onChange, children, icon }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <label className="context-select">
      <small>{label}</small>
      <span>{icon}<select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{children}</select><ChevronDown size={12} /></span>
    </label>
  );
}

function ContextControls({ mobile = false }: { mobile?: boolean }) {
  const { context, authorisedCompanies, availableAccounts, setCompany, setMarketplace, setAccount, setDatePreset, datePreset } = useAnalysisContext();
  return (
    <div className={mobile ? 'context-controls mobile' : 'context-controls'}>
      <ContextSelect label="Company" value={context.companyId} onChange={(value) => setCompany(value)}>
        <option value="all">All authorised companies</option>
        {authorisedCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
      </ContextSelect>
      <ContextSelect label="Marketplace" value={context.marketplace} onChange={(value) => setMarketplace(value as Marketplace | 'all')}>
        <option value="all">Amazon + eBay + Temu</option><option value="amazon">Amazon</option><option value="ebay">eBay</option><option value="temu">Temu</option>
      </ContextSelect>
      <ContextSelect label="Account" value={context.marketplaceAccountIds[0] ?? 'all'} onChange={setAccount}>
        <option value="all">All accounts</option>
        {availableAccounts.map((account) => <option key={account.id} value={account.id}>{account.displayName} · {companies.find((company) => company.id === account.companyId)?.name}</option>)}
      </ContextSelect>
      <ContextSelect label="Date range" value={datePreset} onChange={(value) => setDatePreset(value as '30d' | 'month' | 'quarter')} icon={<CalendarDays size={13} />}>
        <option value="30d">Last 30 days</option><option value="month">1 Aug – 27 Aug 2026</option><option value="quarter">Quarter to date</option>
      </ContextSelect>
    </div>
  );
}

function Freshness() {
  const { runtime } = usePrototype();
  const { state, label, detail } = runtime.freshness;
  const Icon = state === 'fresh' ? CheckCircle2 : state === 'error' ? XCircle : state === 'syncing' ? RefreshCw : AlertTriangle;
  return <div className={`freshness ${state}`}><Icon size={15} className={state === 'syncing' ? 'spin' : undefined} /><span><strong>{label}</strong><small>{detail}</small></span></div>;
}

export function ContextBar() {
  const { context, authorisedCompanies } = useAnalysisContext();
  const company = context.companyId === 'all' ? 'All Companies' : authorisedCompanies.find((item) => item.id === context.companyId)?.name ?? 'Assigned company';
  const marketplace = context.marketplace === 'all' ? 'All marketplaces' : context.marketplace[0].toUpperCase() + context.marketplace.slice(1);
  return (
    <section className="context-bar" aria-label="Analysis context">
      <div className="desktop-context"><ContextControls /></div>
      <Dialog.Root>
        <Dialog.Trigger asChild><button className="context-summary-trigger"><span>{company}</span><small>{marketplace} · 30d</small><ChevronDown size={14} /></button></Dialog.Trigger>
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
