'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Building2, ChevronRight, CircleHelp, Pencil, Plus, Store, Users } from 'lucide-react';
import { PageHeader, MarketplaceBadge } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { Field, Input, SearchInput, Select, Textarea } from '@/src/components/ui/forms';
import { Drawer, Modal } from '@/src/components/ui/overlays';
import { formatDate } from '@/src/domain/calculations';
import { useAdmin, type AdminCompany } from '@/src/features/admin/admin-context';
import './companies.css';

type CompanyDraft = Pick<AdminCompany, 'name' | 'tradingName' | 'description' | 'status'>;
const blankDraft: CompanyDraft = { name: '', tradingName: '', description: '', status: 'active' };
const accountStatus = (status: string) => ({ authentication_required: 'Authentication required', connected: 'Connected', synced: 'Connected', syncing: 'Syncing', delayed: 'Delayed', paused: 'Paused', disconnected: 'Disconnected', failed: 'Needs attention', pending: 'Pending', retrying: 'Retrying' } as Record<string, string>)[status] ?? status;
const companyInitials = (name: string) => name.split(' ').slice(0, 2).map((part) => part[0]).join('');

export function CompaniesPage() {
  const { orgSlug, organisation, companies, accounts, users, setCompanies, recordAudit } = useAdmin();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminCompany | 'new' | null>(null);
  const [draft, setDraft] = useState<CompanyDraft>(blankDraft);
  const [error, setError] = useState('');
  const [deactivating, setDeactivating] = useState<{ company: AdminCompany; draft?: CompanyDraft } | null>(null);
  const [notice, setNotice] = useState('');
  const base = `/o/${orgSlug}/admin`;
  const visible = companies.filter((company) => (status === 'all' || company.status === status) && `${company.name} ${company.tradingName}`.toLowerCase().includes(search.trim().toLowerCase()));
  const selected = companies.find((company) => company.id === selectedId);
  const companyAccounts = (id: string) => accounts.filter((account) => account.companyId === id);
  const companyUsers = (id: string) => users.filter((user) => user.companyIds === 'all' || user.companyIds.includes(id));
  const selectedAccounts = selected ? companyAccounts(selected.id) : [];
  const selectedUsers = selected ? companyUsers(selected.id) : [];

  function openEditor(company: AdminCompany | 'new') {
    setSelectedId(null);
    setEditing(company);
    setDraft(company === 'new' ? { ...blankDraft } : { name: company.name, tradingName: company.tradingName, description: company.description, status: company.status });
    setError('');
  }

  function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = { ...draft, name: draft.name.trim(), tradingName: draft.tradingName.trim(), description: draft.description.trim() };
    if (!next.name) { setError('Enter a Company name.'); return; }
    if (companies.some((company) => company.name.toLowerCase() === next.name.toLowerCase() && (editing === 'new' || company.id !== editing?.id))) { setError('A Company with this name already exists. Choose a distinct Company name.'); return; }
    if (editing && editing !== 'new' && editing.status === 'active' && next.status === 'inactive') {
      setEditing(null);
      setDeactivating({ company: editing, draft: next });
      return;
    }
    if (editing === 'new') {
      const company: AdminCompany = { id: `company-${crypto.randomUUID()}`, organisationId: organisation.id, productCount: 0, ...next };
      setCompanies((current) => [...current, company]);
      recordAudit({ action: 'Company created', area: 'Companies', entity: company.name, companyId: company.id, after: `${company.name} · ${company.status}`, reason: 'Created from Tenant Administration.' });
      setNotice(`${company.name} created. You can now connect a marketplace account and assign users.`);
      showToast('Company created');
      setSelectedId(company.id);
    } else if (editing) {
      setCompanies((current) => current.map((company) => company.id === editing.id ? { ...company, ...next } : company));
      recordAudit({ action: editing.status === 'inactive' && next.status === 'active' ? 'Company reactivated' : 'Company updated', area: 'Companies', entity: next.name, companyId: editing.id, before: `${editing.name} · ${editing.status}`, after: `${next.name} · ${next.status}`, reason: 'Updated Company information.' });
      showToast('Company updated');
      setSelectedId(editing.id);
    }
    setEditing(null);
  }

  function deactivateCompany() {
    if (!deactivating) return;
    const { company, draft: pending } = deactivating;
    setCompanies((current) => current.map((item) => item.id === company.id ? { ...item, ...pending, status: 'inactive' } : item));
    recordAudit({ action: 'Company deactivated', area: 'Companies', entity: pending?.name ?? company.name, companyId: company.id, before: 'Active', after: 'Inactive', reason: 'Company marked inactive; historical records retained.' });
    showToast('Company deactivated. Historical records are retained.');
    setDeactivating(null);
    setSelectedId(company.id);
  }

  function requestDeactivation(company: AdminCompany) {
    setSelectedId(null);
    setDeactivating({ company });
  }

  return <div className="admin-page admin-companies">
    <PageHeader eyebrow="Tenant Administration" title="Companies" description="Manage the Companies, marketplace connections and people in your Organisation." actions={<Button variant="primary" onClick={() => openEditor('new')}><Plus size={15} />Create Company</Button>} />
    {notice ? <Alert tone="positive" title="Company created">{notice}</Alert> : null}
    <section className="admin-stats" aria-label="Company summary">
      <article><small>Companies</small><strong>{companies.length}</strong><span>Within {organisation.name}</span></article>
      <article><small>Active Companies</small><strong>{companies.filter((company) => company.status === 'active').length}</strong><span>Available to your team</span></article>
      <article><small>Marketplace accounts</small><strong>{accounts.length}</strong><span>Across Amazon, eBay and Temu</span></article>
      <article><small>Products</small><strong>{companies.reduce((sum, company) => sum + company.productCount, 0).toLocaleString('en-GB')}</strong><span>Owned by individual Companies</span></article>
    </section>
    <section className="admin-panel">
      <header className="admin-panel-heading"><div><h2>Your Companies</h2><p>Each Company owns its Products and marketplace accounts.</p></div><Badge>{visible.length} {visible.length === 1 ? 'Company' : 'Companies'}</Badge></header>
      <div className="admin-toolbar"><SearchInput aria-label="Search Companies" placeholder="Search Company or trading name" value={search} onChange={(event) => setSearch(event.target.value)} /><Select aria-label="Filter Companies by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></Select></div>
      {visible.length ? <div className="admin-table-wrap"><table className="admin-table admin-company-table"><thead><tr><th>Company</th><th>Status</th><th>Marketplace accounts</th><th>Products</th><th>Assigned users</th><th>Last successful sync</th><th>Actions</th></tr></thead><tbody>{visible.map((company) => {
        const linked = companyAccounts(company.id);
        const assigned = companyUsers(company.id);
        const lastSync = linked.map((account) => account.lastSuccessfulSyncAt).filter((date): date is string => Boolean(date)).sort().at(-1);
        return <tr key={company.id}>
          <td data-label="Company"><button className="admin-company-name" onClick={() => setSelectedId(company.id)}><span className="admin-avatar"><Building2 size={18} /></span><span><strong>{company.name}</strong><small>{company.tradingName || 'Company workspace'}</small></span></button></td>
          <td data-label="Status"><Badge tone={company.status === 'active' ? 'positive' : 'neutral'}>{company.status === 'active' ? 'Active' : 'Inactive'}</Badge></td>
          <td data-label="Marketplace accounts"><span className="admin-company-marketplaces">{[...new Set(linked.map((account) => account.marketplace))].map((marketplace) => <MarketplaceBadge key={marketplace} marketplace={marketplace} />)}</span><small className="admin-company-cell-note">{linked.length} {linked.length === 1 ? 'account' : 'accounts'}</small></td>
          <td data-label="Products">{company.productCount.toLocaleString('en-GB')}</td>
          <td data-label="Assigned users"><span className="admin-company-users"><Users size={14} />{assigned.length} {assigned.length === 1 ? 'user' : 'users'}</span></td>
          <td data-label="Last successful sync">{lastSync ? formatDate(lastSync) : 'No sync yet'}</td>
          <td data-label="Actions"><div className="admin-row-actions"><Button size="compact" onClick={() => setSelectedId(company.id)}>View</Button><Button size="compact" variant="ghost" aria-label={`Edit ${company.name}`} onClick={() => openEditor(company)}><Pencil size={14} />Edit</Button></div></td>
        </tr>;
      })}</tbody></table></div> : <div className="admin-empty"><Building2 size={26} /><h3>No Companies found</h3><p>Try a different search or create a Company for your Organisation.</p><Button onClick={() => { setSearch(''); setStatus('all'); }}>Clear filters</Button></div>}
      <div className="admin-inline-note"><CircleHelp size={15} /><span>Company assignments determine which Products and marketplace accounts a user can access. Inactive Companies retain their history.</span></div>
    </section>

    <Modal open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }} title={editing === 'new' ? 'Create Company' : 'Edit Company'} description={editing === 'new' ? 'Add a Company to your Organisation, then connect accounts and assign your team.' : 'Update Company information and its availability to your team.'}>
      <form className="admin-form" onSubmit={saveCompany}>
        <Field label="Company name" hint="The name shown across Stock Supplies."><Input required autoFocus value={draft.name} onChange={(event) => { setDraft({ ...draft, name: event.target.value }); setError(''); }} placeholder="e.g. Westfield Trading Ltd" /></Field>
        <div className="admin-form-grid"><Field label="Internal / trading name" hint="Optional short name for your team."><Input value={draft.tradingName} onChange={(event) => setDraft({ ...draft, tradingName: event.target.value })} placeholder="e.g. Westfield" /></Field><Field label="Status"><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as AdminCompany['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></Select></Field></div>
        <Field label="Description (optional)"><Textarea rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Describe this Company's purpose or area of operation." /></Field>
        <div className="admin-inline-note"><Building2 size={15} /><span>This Company belongs to {organisation.name}. Marketplace connections and user assignments are managed separately.</span></div>
        {error ? <Alert tone="negative" title="Check Company details">{error}</Alert> : null}
        <div className="admin-form-actions"><Button type="button" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" variant="primary">{editing === 'new' ? 'Create Company' : 'Save changes'}</Button></div>
      </form>
    </Modal>

    <Drawer open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }} title={selected?.name ?? 'Company details'} description="Company information, connected accounts and team access.">
      {selected ? <div className="admin-company-detail">
        <div className="admin-company-hero"><span className="admin-company-monogram">{companyInitials(selected.name)}</span><div><h3>{selected.name}</h3><p>{selected.tradingName || 'Company workspace'}</p><Badge tone={selected.status === 'active' ? 'positive' : 'neutral'}>{selected.status === 'active' ? 'Active' : 'Inactive'}</Badge></div></div>
        <div className="admin-row-actions"><Button onClick={() => openEditor(selected)}><Pencil size={14} />Edit Company</Button>{selected.status === 'active' ? <Button variant="ghost" onClick={() => requestDeactivation(selected)}>Deactivate Company</Button> : <Badge>History retained</Badge>}</div>
        <dl className="admin-detail-list"><div><dt>Organisation</dt><dd>{organisation.name}</dd></div><div><dt>Products</dt><dd>{selected.productCount.toLocaleString('en-GB')} Company-owned Products</dd></div><div><dt>Description</dt><dd>{selected.description || 'No description added.'}</dd></div></dl>
        <section className="admin-company-detail-section"><header><h3><Store size={16} />Marketplace accounts <span>{selectedAccounts.length}</span></h3><Link href={`${base}/marketplace-accounts?company=${encodeURIComponent(selected.id)}&connect=1`}>Add account<Plus size={13} /></Link></header>{selectedAccounts.length ? <ul>{selectedAccounts.map((account) => <li key={account.id}><div><strong>{account.displayName}</strong><small>{account.lastSuccessfulSyncAt ? `Last synced ${formatDate(account.lastSuccessfulSyncAt)}` : 'Awaiting first sync'}</small></div><div className="admin-company-account-meta"><MarketplaceBadge marketplace={account.marketplace} /><small>{accountStatus(account.status)}</small></div></li>)}</ul> : <p className="admin-company-empty-note">No marketplace accounts connected. Add an account to bring in this Company&apos;s listings.</p>}</section>
        <section className="admin-company-detail-section"><header><h3><Users size={16} />Assigned users <span>{selectedUsers.length}</span></h3><Link href={`${base}/users?company=${encodeURIComponent(selected.id)}`}>Manage assignments<ChevronRight size={13} /></Link></header>{selectedUsers.length ? <ul>{selectedUsers.map((user) => <li key={user.id}><div><strong>{user.name}</strong><small>{user.email}</small></div><Badge tone={user.status === 'active' ? 'positive' : user.status === 'invited' ? 'info' : 'neutral'}>{user.status[0].toUpperCase() + user.status.slice(1)}</Badge></li>)}</ul> : <p className="admin-company-empty-note">No assigned users. Manage assignments to give your team access.</p>}<p className="admin-company-footnote">Includes users assigned to all Companies in this Organisation.</p></section>
        <section className="admin-company-module"><Badge tone="info">Module 01</Badge><h3>Marketplace Profitability &amp; Analytics</h3><p>Products, COGS, Transactions, Expenses and Reports use this Company&apos;s marketplace and user assignments.</p><Link href={`${base}/billing`}>View subscription &amp; module access<ChevronRight size={14} /></Link></section>
      </div> : null}
    </Drawer>

    <Modal open={Boolean(deactivating)} onOpenChange={(open) => { if (!open) setDeactivating(null); }} title="Deactivate Company?" description={deactivating ? `Mark ${deactivating.company.name} as inactive.` : 'Review this Company status change.'}>
      <div className="admin-form"><Alert tone="warning" title="Historical records are retained">Products, financial records and audit history remain available. The Company can be reactivated from Edit Company.</Alert><p className="admin-company-deactivation-note">Marketplace connections are managed separately. Review any connected accounts before pausing their sync.</p><div className="admin-form-actions"><Button onClick={() => setDeactivating(null)}>Cancel</Button><Button variant="danger" onClick={deactivateCompany}>Deactivate Company</Button></div></div>
    </Modal>
  </div>;
}

