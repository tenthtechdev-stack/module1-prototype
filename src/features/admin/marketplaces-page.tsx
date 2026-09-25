'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Link2, MoreHorizontal, Pause, RefreshCw, ShieldCheck, Store, Unplug } from 'lucide-react';
import { formatDate } from '@/src/domain/calculations';
import type { Marketplace } from '@/src/domain/models';
import { MarketplaceBadge, PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Field, Input, SearchInput, Select } from '@/src/components/ui/forms';
import { Alert, Badge, useToast, type Tone } from '@/src/components/ui/feedback';
import { Drawer, DropdownMenu, Modal } from '@/src/components/ui/overlays';
import { useAdmin, type AdminAccount } from './admin-context';
import './marketplaces.css';

const MARKETPLACES: Array<{ id: Marketplace; label: string; description: string }> = [
  { id: 'amazon', label: 'Amazon', description: 'Seller Central' },
  { id: 'ebay', label: 'eBay', description: 'Seller account' },
  { id: 'temu', label: 'Temu', description: 'Seller account' },
];
const STATUS_LABELS: Record<AdminAccount['status'], string> = {
  connected: 'Connected', synced: 'Connected', syncing: 'Syncing', delayed: 'Delayed',
  authentication_required: 'Authentication required', paused: 'Paused', disconnected: 'Disconnected',
  pending: 'Pending', failed: 'Failed', retrying: 'Retrying',
};
const STATUS_TONES: Record<AdminAccount['status'], Tone> = {
  connected: 'positive', synced: 'positive', syncing: 'info', delayed: 'warning',
  authentication_required: 'negative', paused: 'neutral', disconnected: 'neutral',
  pending: 'neutral', failed: 'negative', retrying: 'info',
};
const STATUS_DETAILS: Record<AdminAccount['status'], { title: string; description: string }> = {
  connected: { title: 'Your account is up to date', description: 'Products, orders and financial activity are available in Marketplace Profitability & Analytics.' },
  synced: { title: 'Your account is up to date', description: 'The latest marketplace activity has been imported successfully.' },
  syncing: { title: 'Importing marketplace activity', description: 'Products and listings are ready. Orders, fees and refunds are being imported. You can continue using the workspace.' },
  delayed: { title: 'The latest sync is delayed', description: 'The marketplace is taking longer than usual to respond. Existing data remains available and the next sync will retry automatically.' },
  authentication_required: { title: 'Reconnect to continue syncing', description: 'The marketplace authorisation has expired. Reconnect this account to resume imports. Previously imported data is retained.' },
  paused: { title: 'Sync is paused', description: 'No new marketplace data is being imported. Resume sync when you are ready; previously imported data remains available.' },
  disconnected: { title: 'Account is disconnected', description: 'This account no longer imports new data. Historical activity remains linked to its Company. Reconnect to start importing again.' },
  pending: { title: 'Waiting to start', description: 'This account is connected and waiting for its first marketplace import.' },
  failed: { title: 'The latest sync could not complete', description: 'Previously imported data remains available. Refresh sync status to retry this import.' },
  retrying: { title: 'Retrying the import', description: 'A new import is in progress. Previously imported data remains available.' },
};
function marketplaceName(value: Marketplace) { return MARKETPLACES.find((item) => item.id === value)?.label ?? value; }
function syncTime(value: string | null) { return value ? formatDate(value, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC' : 'Not yet synced'; }
function connectionLabel(account: AdminAccount) {
  if (account.status === 'authentication_required') return <Badge tone="negative">Needs reconnect</Badge>;
  if (account.status === 'disconnected') return <Badge>Disconnected</Badge>;
  return <Badge tone="positive">Connected</Badge>;
}
type ConnectionDraft = { accountId?: string; marketplace: Marketplace; companyId: string; displayName: string; step: 1 | 2 | 3 };
type AccountAction = { account: AdminAccount; type: 'pause' | 'resume' | 'disconnect' };

export function MarketplacesPage() {
  const { companies, accounts, setAccounts, publishAccountStatus, recordAudit, companyName } = useAdmin();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const activeCompanies = companies.filter((company) => company.status === 'active');
  const [companyFilter, setCompanyFilter] = useState(searchParams.get('company') ?? 'all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState<ConnectionDraft | null>(() => searchParams.get('connect') === '1' && activeCompanies.length ? { marketplace: 'amazon', companyId: activeCompanies.find((company) => company.id === searchParams.get('company'))?.id ?? activeCompanies[0].id, displayName: '', step: 1 } : null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<AccountAction | null>(null);
  const currentAccount = accounts.find((account) => account.id === viewId);
  const filtered = accounts.filter((account) => (companyFilter === 'all' || account.companyId === companyFilter)
    && (statusFilter === 'all' || account.status === statusFilter || (statusFilter === 'connected' && account.status === 'synced'))
    && `${account.displayName} ${marketplaceName(account.marketplace)} ${companyName(account.companyId)}`.toLowerCase().includes(search.trim().toLowerCase()));
  const attentionCount = accounts.filter((account) => ['delayed', 'authentication_required', 'failed'].includes(account.status)).length;

  function openConnect() {
    const selectedCompany = activeCompanies.find((company) => company.id === companyFilter) ?? activeCompanies[0];
    setDraft({ marketplace: 'amazon', companyId: selectedCompany?.id ?? '', displayName: '', step: 1 });
  }
  function reconnect(account: AdminAccount) {
    setViewId(null);
    setDraft({ accountId: account.id, marketplace: account.marketplace, companyId: account.companyId, displayName: account.displayName, step: 2 });
  }
  function authorise() {
    if (!draft) return;
    const accountId = draft.accountId ?? `admin-account-${Date.now()}`;
    const existing = accounts.find((account) => account.id === draft.accountId);
    const account: AdminAccount = { id: accountId, marketplace: draft.marketplace, companyId: draft.companyId, displayName: draft.displayName.trim(), status: 'syncing', lastSuccessfulSyncAt: null, listingCount: 0 };
    setAccounts((current) => draft.accountId ? current.map((item) => item.id === draft.accountId ? { ...item, status: 'syncing' } : item) : [...current, account]);
    if (draft.accountId) publishAccountStatus(draft.accountId, 'syncing');
    recordAudit({ action: draft.accountId ? 'Marketplace reconnected' : 'Marketplace connected', area: 'Marketplace Accounts', entity: draft.displayName.trim(), companyId: draft.companyId, before: existing ? STATUS_LABELS[existing.status] : 'Not connected', after: 'Connected · sync in progress', reason: 'Account authorised by Organisation Admin' });
    setDraft({ ...draft, accountId, step: 3 });
    showToast(`${draft.displayName.trim()} ${draft.accountId ? 'reconnected' : 'connected'}`);
  }
  function applyAction() {
    if (!confirmation) return;
    const { account, type } = confirmation;
    const status = type === 'pause' ? 'paused' : type === 'disconnect' ? 'disconnected' : 'syncing';
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, status } : item));
    publishAccountStatus(account.id, status);
    recordAudit({ action: type === 'pause' ? 'Marketplace sync paused' : type === 'resume' ? 'Marketplace sync resumed' : 'Marketplace disconnected', area: 'Marketplace Accounts', entity: account.displayName, companyId: account.companyId, before: STATUS_LABELS[account.status], after: STATUS_LABELS[status] });
    showToast(type === 'pause' ? `Sync paused for ${account.displayName}` : type === 'resume' ? `Sync resumed for ${account.displayName}` : `${account.displayName} disconnected`);
    setConfirmation(null);
  }
  function refreshSync(account: AdminAccount) {
    const lastSuccessfulSyncAt = new Date().toISOString();
    setAccounts((current) => current.map((item) => item.id === account.id ? { ...item, status: 'synced', lastSuccessfulSyncAt, listingCount: item.listingCount || 124 } : item));
    publishAccountStatus(account.id, 'synced');
    showToast(`${account.displayName} is up to date`);
  }
  function nextStep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft && draft.companyId && draft.displayName.trim()) setDraft({ ...draft, displayName: draft.displayName.trim(), step: 2 });
  }

  return <div className="admin-page admin-marketplaces-page">
    <PageHeader eyebrow="Tenant administration" title="Marketplace Accounts" description="Connect your stores and keep marketplace activity flowing into the right Company." actions={<Button variant="primary" onClick={openConnect} disabled={!activeCompanies.length}><Link2 size={15} /> Connect Account</Button>} />
    <div className="admin-stats">
      <article><small>Marketplace accounts</small><strong>{accounts.length}</strong><span>Across {new Set(accounts.map((account) => account.companyId)).size} Companies</span></article>
      <article><small>Connected</small><strong>{accounts.filter((account) => !['disconnected', 'authentication_required'].includes(account.status)).length}</strong><span>Authorisation is active</span></article>
      <article><small>Need attention</small><strong>{attentionCount}</strong><span>Connection or sync needs a look</span></article>
      <article><small>Paused</small><strong>{accounts.filter((account) => account.status === 'paused').length}</strong><span>Ready to resume when you are</span></article>
    </div>
    <section className="admin-panel">
      <header className="admin-panel-heading"><div><h2>Your marketplace accounts</h2><p>Amazon, eBay and Temu accounts within your Organisation.</p></div><Badge>{accounts.length} accounts</Badge></header>
      <div className="admin-toolbar">
        <SearchInput aria-label="Search marketplace accounts" placeholder="Search accounts or Companies" value={search} onChange={(event) => setSearch(event.target.value)} />
        <Select aria-label="Filter accounts by Company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="all">All Companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select>
        <Select aria-label="Filter accounts by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{(['connected', 'syncing', 'delayed', 'authentication_required', 'paused', 'disconnected'] as const).map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</Select>
        {(search || companyFilter !== 'all' || statusFilter !== 'all') ? <Button variant="ghost" size="compact" onClick={() => { setSearch(''); setCompanyFilter('all'); setStatusFilter('all'); }}>Clear</Button> : null}
      </div>
      <div className="admin-table-wrap"><table className="admin-table admin-marketplace-table"><thead><tr><th>Account / Marketplace</th><th>Company</th><th>Connection</th><th>Sync status</th><th>Last successful sync</th><th>Listings</th><th>Actions</th></tr></thead><tbody>{filtered.map((account) => <tr key={account.id}>
        <td data-label="Account"><button className="admin-account-name" onClick={() => setViewId(account.id)}>{account.displayName}</button><MarketplaceBadge marketplace={account.marketplace} /></td>
        <td data-label="Company">{companyName(account.companyId)}</td>
        <td data-label="Connection">{connectionLabel(account)}</td>
        <td data-label="Sync status"><Badge tone={STATUS_TONES[account.status]}>{account.status === 'connected' || account.status === 'synced' ? 'Up to date' : STATUS_LABELS[account.status]}</Badge></td>
        <td data-label="Last sync"><span className="admin-sync-time">{syncTime(account.lastSuccessfulSyncAt)}</span></td>
        <td data-label="Listings" className="numeric">{account.listingCount.toLocaleString('en-GB')}</td>
        <td data-label="Actions"><div className="admin-row-actions">
          {['authentication_required', 'disconnected'].includes(account.status) ? <Button size="compact" onClick={() => reconnect(account)}><RefreshCw size={12} /> Reconnect</Button> : <Button size="compact" variant="ghost" onClick={() => setViewId(account.id)}>View status</Button>}
          <DropdownMenu label={<MoreHorizontal size={15} />} accessibleLabel={`Actions for ${account.displayName}`} items={[
            { label: 'View sync status', onSelect: () => setViewId(account.id) },
            ...(account.status === 'paused' ? [{ label: 'Resume sync', onSelect: () => setConfirmation({ account, type: 'resume' }) }] : !['disconnected', 'authentication_required'].includes(account.status) ? [{ label: 'Pause sync', onSelect: () => setConfirmation({ account, type: 'pause' }) }] : []),
            ...(account.status !== 'disconnected' ? [{ label: 'Disconnect account', danger: true, onSelect: () => setConfirmation({ account, type: 'disconnect' }) }] : []),
          ]} />
        </div></td>
      </tr>)}</tbody></table></div>
      {!filtered.length ? <div className="admin-empty"><Store size={27} /><h3>No matching marketplace accounts</h3><p>Try another Company or status, or connect a new store.</p><Button onClick={openConnect} disabled={!activeCompanies.length}>Connect Account</Button></div> : null}
      <div className="admin-marketplace-footnote"><ShieldCheck size={15} /><span>Each store belongs to one Company. User assignments determine who can access its marketplace data.</span></div>
    </section>
    {!activeCompanies.length ? <Alert tone="warning" title="An active Company is required">Create or reactivate a Company before connecting a marketplace account.</Alert> : null}

    <Modal open={Boolean(draft)} onOpenChange={(open) => { if (!open) setDraft(null); }} title={draft?.accountId && draft.step !== 3 ? 'Reconnect Marketplace Account' : 'Connect Marketplace Account'} description="Link a store to its Company in three short steps.">
      {draft ? <div className="admin-connection-flow">
        <ol className="admin-connection-steps" aria-label="Connection progress">{['Account', 'Authorise', 'Ready'].map((label, index) => <li key={label} className={draft.step === index + 1 ? 'active' : draft.step > index + 1 ? 'complete' : ''}><span>{draft.step > index + 1 ? <Check size={12} /> : index + 1}</span>{label}</li>)}</ol>
        {draft.step === 1 ? <form className="admin-form" onSubmit={nextStep}>
          <fieldset className="admin-marketplace-choice"><legend>Select Marketplace</legend><div>{MARKETPLACES.map((marketplace) => <button type="button" key={marketplace.id} aria-pressed={draft.marketplace === marketplace.id} className={draft.marketplace === marketplace.id ? 'selected' : ''} onClick={() => setDraft({ ...draft, marketplace: marketplace.id })}><MarketplaceBadge marketplace={marketplace.id} /><small>{marketplace.description}</small>{draft.marketplace === marketplace.id ? <CheckCircle2 size={15} /> : null}</button>)}</div></fieldset>
          <Field label="Company" hint="This Company will own the account and its imported activity."><Select required value={draft.companyId} onChange={(event) => setDraft({ ...draft, companyId: event.target.value })}><option value="" disabled>Choose a Company</option>{activeCompanies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select></Field>
          <Field label="Account / Store Name" hint="Use a name your team will recognise."><Input autoComplete="off" required maxLength={100} placeholder={`${marketplaceName(draft.marketplace)} UK Store`} value={draft.displayName} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} /></Field>
          <div className="admin-form-actions"><Button type="button" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" variant="primary" disabled={!draft.displayName.trim() || !draft.companyId}>Continue <ArrowRight size={14} /></Button></div>
        </form> : draft.step === 2 ? <>
          <div className="admin-authorise-identity"><div className="admin-marketplace-icon"><Store size={24} /></div><MarketplaceBadge marketplace={draft.marketplace} /><h3>{draft.displayName}</h3><p>{companyName(draft.companyId)}</p></div>
          <div className="admin-connection-permissions"><strong>Allow Stock Supplies to import</strong><p><Check size={15} /> Products and listings</p><p><Check size={15} /> Orders, transactions and refunds</p><p><Check size={15} /> Marketplace fees and advertising activity</p></div>
          <p className="admin-inline-note"><ShieldCheck size={15} /> Prototype authorisation. No external marketplace account is accessed.</p>
          <div className="admin-form-actions">{draft.accountId ? <Button onClick={() => setDraft(null)}>Cancel</Button> : <Button onClick={() => setDraft({ ...draft, step: 1 })}><ArrowLeft size={14} /> Back</Button>}<Button variant="primary" onClick={authorise}>Authorise {marketplaceName(draft.marketplace)} <ArrowRight size={14} /></Button></div>
        </> : <>
          <div className="admin-connection-success"><CheckCircle2 size={39} /><h3>{draft.displayName} is connected</h3><p>Your account is linked to {companyName(draft.companyId)}.</p></div>
          <div className="admin-initial-sync"><div><RefreshCw size={17} /><strong>Initial sync in progress</strong><Badge tone="info">Syncing</Badge></div><div className="admin-sync-progress" role="progressbar" aria-label="Initial sync" aria-valuenow={40} aria-valuemin={0} aria-valuemax={100}><i /></div><p>Importing your marketplace activity. You can close this window and continue working.</p></div>
          <div className="admin-form-actions"><Button onClick={() => setDraft(null)}>Done</Button><Button variant="primary" onClick={() => { setViewId(draft.accountId ?? null); setDraft(null); }}>View sync status <ArrowRight size={14} /></Button></div>
        </>}
      </div> : null}
    </Modal>

    <Drawer open={Boolean(currentAccount)} onOpenChange={(open) => { if (!open) setViewId(null); }} title={currentAccount?.displayName ?? 'Sync status'} description="Connection and import activity for this marketplace account.">
      {currentAccount ? <div className="admin-form">
        <div className="admin-sync-detail-header"><MarketplaceBadge marketplace={currentAccount.marketplace} /><Badge tone={STATUS_TONES[currentAccount.status]}>{STATUS_LABELS[currentAccount.status]}</Badge></div>
        <Alert tone={currentAccount.status === 'authentication_required' || currentAccount.status === 'failed' ? 'negative' : currentAccount.status === 'delayed' ? 'warning' : ['connected', 'synced'].includes(currentAccount.status) ? 'positive' : 'info'} title={STATUS_DETAILS[currentAccount.status].title}>{STATUS_DETAILS[currentAccount.status].description}</Alert>
        <dl className="admin-detail-list"><div><dt>Company</dt><dd>{companyName(currentAccount.companyId)}</dd></div><div><dt>Connection</dt><dd>{connectionLabel(currentAccount)}</dd></div><div><dt>Last successful sync</dt><dd>{syncTime(currentAccount.lastSuccessfulSyncAt)}</dd></div><div><dt>Listings imported</dt><dd>{currentAccount.listingCount.toLocaleString('en-GB')}</dd></div><div><dt>Module</dt><dd>Marketplace Profitability &amp; Analytics</dd></div></dl>
        <section className="admin-sync-datasets"><h3>Marketplace data</h3>{['Products & listings', 'Orders & transactions', 'Fees, refunds & advertising'].map((label, index) => <div key={label}><span>{label}</span><Badge tone={currentAccount.status === 'connected' || currentAccount.status === 'synced' ? 'positive' : 'neutral'}>{['connected', 'synced'].includes(currentAccount.status) ? 'Up to date' : currentAccount.status === 'syncing' && index === 0 ? 'Ready' : currentAccount.status === 'syncing' ? 'Importing' : currentAccount.status === 'disconnected' ? 'Disconnected' : currentAccount.status === 'paused' ? 'Paused' : 'Awaiting sync'}</Badge></div>)}</section>
        <div className="admin-form-actions admin-sync-detail-actions">
          {['disconnected', 'authentication_required'].includes(currentAccount.status) ? <Button variant="primary" onClick={() => reconnect(currentAccount)}><RefreshCw size={14} /> Reconnect account</Button> : currentAccount.status === 'paused' ? <Button variant="primary" onClick={() => setConfirmation({ account: currentAccount, type: 'resume' })}><RefreshCw size={14} /> Resume sync</Button> : <><Button onClick={() => setConfirmation({ account: currentAccount, type: 'pause' })}><Pause size={14} /> Pause sync</Button><Button variant="primary" onClick={() => refreshSync(currentAccount)}><RefreshCw size={14} /> Refresh sync status</Button></>}
        </div>
        {currentAccount.status !== 'disconnected' ? <Button variant="ghost" onClick={() => setConfirmation({ account: currentAccount, type: 'disconnect' })}><Unplug size={14} /> Disconnect account</Button> : null}
        <p className="admin-inline-note"><Clock3 size={14} /> Historical records stay linked to their original Company and marketplace account.</p>
      </div> : null}
    </Drawer>

    <Modal open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }} title={confirmation ? `${confirmation.type === 'pause' ? 'Pause sync for' : confirmation.type === 'resume' ? 'Resume sync for' : 'Disconnect'} ${confirmation.account.displayName}?` : 'Update account'} description={confirmation?.type === 'disconnect' ? 'New imports will stop. Historical Products, transactions and reports remain available. You can reconnect this account later.' : confirmation?.type === 'pause' ? 'New imports will pause until you resume sync. Existing marketplace data remains available to your team.' : 'Marketplace imports will restart and bring this account up to date.'}>
      <div className="admin-form-actions"><Button onClick={() => setConfirmation(null)}>Cancel</Button><Button variant={confirmation?.type === 'disconnect' ? 'danger' : 'primary'} onClick={applyAction}>{confirmation?.type === 'pause' ? 'Pause sync' : confirmation?.type === 'resume' ? 'Resume sync' : 'Disconnect account'}</Button></div>
    </Modal>
  </div>;
}
