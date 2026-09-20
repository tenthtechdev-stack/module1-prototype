'use client';

import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, Mail, ShieldCheck, Store, UserPlus, Users } from 'lucide-react';
import { ROLE_PRESETS } from '@/src/domain/permissions';
import { formatDate } from '@/src/domain/calculations';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Checkbox, Field, Input, SearchInput, Select } from '@/src/components/ui/forms';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { Drawer, DropdownMenu } from '@/src/components/ui/overlays';
import { useAdmin, type AdminUser } from './admin-context';
import './users-roles.css';

const roles = ROLE_PRESETS.filter((role) => role.surface === 'tenant');
const roleName = (id: string) => roles.find((role) => role.id === id)?.label ?? id;
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const marketplaceName = (value: string) => value === 'ebay' ? 'eBay' : value === 'amazon' ? 'Amazon' : 'Temu';
const statusLabel = (status: AdminUser['status']) => status[0].toUpperCase() + status.slice(1);

function UserEditor({ user, initialCompany, onClose }: { user: AdminUser | null; initialCompany: string; onClose: () => void }) {
  const { organisation, companies, accounts, setUsers, recordAudit, companyName } = useAdmin();
  const { showToast } = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [roleId, setRoleId] = useState(user?.roleId ?? 'marketplace-manager');
  const [status, setStatus] = useState<AdminUser['status']>(user?.status ?? 'invited');
  const [companyIds, setCompanyIds] = useState<'all' | string[]>(user?.companyIds ?? (initialCompany === 'all' ? 'all' : [initialCompany]));
  const [accountIds, setAccountIds] = useState<'all' | string[]>(user?.marketplaceAccountIds ?? 'all');
  const [error, setError] = useState('');
  const eligibleAccounts = accounts.filter((account) => companyIds === 'all' || companyIds.includes(account.companyId));
  const chosenRole = roles.find((role) => role.id === roleId)!;
  const companySummary = companyIds === 'all' ? 'All companies' : companyIds.length ? companyIds.map(companyName).join(', ') : 'No companies selected';
  const accountSummary = accountIds === 'all' ? `All ${eligibleAccounts.length} accounts within company scope` : accountIds.length ? eligibleAccounts.filter((account) => accountIds.includes(account.id)).map((account) => account.displayName).join(', ') : 'No accounts selected';

  function changeCompanies(next: 'all' | string[]) {
    setCompanyIds(next);
    if (accountIds !== 'all') setAccountIds(accountIds.filter((id) => accounts.some((account) => account.id === id && (next === 'all' || next.includes(account.companyId)))));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim()) { setError('Enter a name and work email.'); return; }
    if (companyIds !== 'all' && !companyIds.length) { setError('Choose at least one Company or select all companies.'); return; }
    if (accountIds !== 'all' && !accountIds.length && eligibleAccounts.length) { setError('Choose an account or select all accounts within the company scope.'); return; }
    const selectedAccountIds = accountIds === 'all' ? 'all' : accountIds.filter((id) => eligibleAccounts.some((account) => account.id === id));
    const next: AdminUser = {
      id: user?.id ?? `usr-invite-${crypto.randomUUID()}`, organisationId: organisation.id,
      name: name.trim(), email: email.trim(), jobTitle: user?.jobTitle ?? '', roleId,
      companyIds, marketplaceAccountIds: selectedAccountIds, status, lastActiveAt: user?.lastActiveAt ?? null,
    };
    setUsers((current) => user ? current.map((item) => item.id === user.id ? next : item) : [next, ...current]);
    recordAudit({
      action: user ? user.roleId !== roleId ? 'Role changed' : 'User access updated' : 'User invited', area: 'Users', entity: next.name,
      companyId: companyIds !== 'all' && companyIds.length === 1 ? companyIds[0] : null,
      before: user ? `${roleName(user.roleId)} · ${user.companyIds === 'all' ? 'All companies' : user.companyIds.map(companyName).join(', ')} · ${user.marketplaceAccountIds === 'all' ? 'All accounts in company scope' : accounts.filter((account) => user.marketplaceAccountIds.includes(account.id)).map((account) => account.displayName).join(', ')} · ${statusLabel(user.status)}` : undefined,
      after: `${chosenRole.label} · ${companySummary} · ${accountSummary} · ${statusLabel(status)}`,
      reason: user ? 'Updated in Tenant Administration' : 'Mock invitation; no email delivered',
    });
    showToast(user ? 'User access updated' : 'Invitation sent'); onClose();
  }

  return <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} title={user ? 'Manage user access' : 'Invite user'} description={user ? `Review ${user.name.split(' ')[0]}’s role and assignments.` : 'Invite a colleague to your Organisation and choose their access.'}>
    <form className="admin-form admin-user-form" onSubmit={submit}>
      {error ? <Alert tone="negative" title="Review user details">{error}</Alert> : null}
      <div className="admin-form-grid"><Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" /></Field><Field label="Work email"><Input required type="email" value={email} readOnly={!!user} onChange={(event) => setEmail(event.target.value)} placeholder="alex@company.co.uk" /></Field></div>
      <Field label="Role" hint={chosenRole.description}><Select value={roleId} onChange={(event) => setRoleId(event.target.value)}>{roles.map((role) => <option value={role.id} key={role.id}>{role.label}</option>)}</Select></Field>
      <fieldset className="admin-assignment-fieldset"><legend><Building2 size={14} /> Company assignment</legend><Checkbox label="All companies in this Organisation" checked={companyIds === 'all'} onChange={(event) => changeCompanies(event.target.checked ? 'all' : [])} />{companyIds !== 'all' ? <div className="admin-assignment-options">{companies.map((company) => <Checkbox key={company.id} label={company.name} checked={companyIds.includes(company.id)} onChange={(event) => changeCompanies(event.target.checked ? [...companyIds, company.id] : companyIds.filter((id) => id !== company.id))} />)}</div> : null}</fieldset>
      <fieldset className="admin-assignment-fieldset"><legend><Store size={14} /> Marketplace account assignment</legend><p>Only accounts belonging to the selected companies are available.</p><Checkbox label="All accounts within assigned companies" checked={accountIds === 'all'} onChange={(event) => setAccountIds(event.target.checked ? 'all' : [])} />{accountIds !== 'all' ? <div className="admin-assignment-options">{eligibleAccounts.length ? eligibleAccounts.map((account) => <Checkbox key={account.id} label={`${account.displayName} · ${marketplaceName(account.marketplace)}`} checked={accountIds.includes(account.id)} onChange={(event) => setAccountIds(event.target.checked ? [...accountIds, account.id] : accountIds.filter((id) => id !== account.id))} />) : <span className="admin-inline-note">No accounts in the selected company scope yet.</span>}</div> : null}</fieldset>
      {user ? <Field label="User status"><Select value={status} onChange={(event) => setStatus(event.target.value as AdminUser['status'])}><option value="active">Active</option><option value="invited">Invited</option><option value="suspended">Suspended</option></Select></Field> : null}
      <aside className="admin-effective-access"><header><ShieldCheck size={17} /><strong>Effective access</strong></header><dl><div><dt>Role</dt><dd>{chosenRole.label}</dd></div><div><dt>Companies</dt><dd>{companySummary}</dd></div><div><dt>Accounts</dt><dd>{accountSummary}</dd></div></dl><p>{status === 'suspended' ? 'Suspended users cannot enter the workspace. Assignments are retained for reactivation.' : 'Role permissions apply within these assignments. Operational access also requires an enabled module and active subscription.'}</p></aside>
      {!user ? <p className="admin-inline-note">This prototype demonstrates invitation delivery. No real email is sent.</p> : null}
      <div className="admin-form-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit">{user ? <ShieldCheck size={14} /> : <Mail size={14} />}{user ? 'Save access' : 'Send invite'}</Button></div>
    </form>
  </Drawer>;
}

export function UsersPage() {
  const { users, companies, accounts, companyName, setUsers, recordAudit } = useAdmin();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const companyQuery = searchParams.get('company');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [companyFilter, setCompanyFilter] = useState(companyQuery && companies.some((company) => company.id === companyQuery) ? companyQuery : 'all');
  const [editor, setEditor] = useState<{ user: AdminUser | null } | null>(null);
  const filtered = users.filter((user) => (status === 'all' || user.status === status) && (companyFilter === 'all' || user.companyIds === 'all' || user.companyIds.includes(companyFilter)) && `${user.name} ${user.email} ${roleName(user.roleId)}`.toLowerCase().includes(search.toLowerCase()));

  function updateStatus(user: AdminUser, nextStatus: AdminUser['status']) {
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, status: nextStatus } : item));
    recordAudit({ action: nextStatus === 'suspended' ? 'User suspended' : 'User reactivated', area: 'Users', entity: user.name, before: statusLabel(user.status), after: statusLabel(nextStatus), reason: 'Updated in Tenant Administration' });
    showToast(nextStatus === 'suspended' ? 'User suspended' : 'User reactivated', nextStatus === 'suspended' ? 'info' : 'positive');
  }
  function resendInvite(user: AdminUser) {
    recordAudit({ action: 'Invitation resent', area: 'Users', entity: user.name, after: `Invitation pending for ${user.email}`, reason: 'Mock invitation; no email delivered' }); showToast('Invitation resent');
  }

  return <div className="admin-page">
    <PageHeader eyebrow="Tenant administration" title="Users" description="Give every colleague the right role, companies and marketplace accounts." actions={<Button variant="primary" onClick={() => setEditor({ user: null })}><UserPlus size={15} /> Invite user</Button>} />
    <section className="admin-stats" aria-label="Team overview"><article><small>Total users</small><strong>{users.length}</strong><span>Across the Organisation</span></article><article><small>Active</small><strong>{users.filter((user) => user.status === 'active').length}</strong><span>Workspace access enabled</span></article><article><small>Invited</small><strong>{users.filter((user) => user.status === 'invited').length}</strong><span>Awaiting acceptance</span></article><article><small>Suspended</small><strong>{users.filter((user) => user.status === 'suspended').length}</strong><span>Access temporarily paused</span></article></section>
    <section className="admin-panel"><header className="admin-panel-heading"><div><h2>People &amp; access</h2><p>Manage membership without changing the Organisation subscription.</p></div><Badge>{filtered.length} {filtered.length === 1 ? 'user' : 'users'}</Badge></header>
      <div className="admin-toolbar"><SearchInput aria-label="Search users" placeholder="Search name, email or role" value={search} onChange={(event) => setSearch(event.target.value)} /><Select aria-label="Filter users by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="suspended">Suspended</option></Select><Select aria-label="Filter users by company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="all">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-table admin-users-table"><thead><tr><th>User</th><th>Role</th><th>Company / account assignments</th><th>Status</th><th>Last active</th><th>Actions</th></tr></thead><tbody>{filtered.map((user) => {
        const scopedAccounts = accounts.filter((account) => (user.companyIds === 'all' || user.companyIds.includes(account.companyId)) && (user.marketplaceAccountIds === 'all' || user.marketplaceAccountIds.includes(account.id)));
        return <tr key={user.id}><td data-label="User"><div className="admin-person"><span className="admin-avatar">{initials(user.name)}</span><div><button className="admin-user-name" type="button" onClick={() => setEditor({ user })}>{user.name}</button><small>{user.email}</small></div></div></td><td data-label="Role"><span className="admin-user-role">{roleName(user.roleId)}</span></td><td data-label="Assignments"><div className="admin-user-scope"><strong>{user.companyIds === 'all' ? 'All companies' : user.companyIds.map(companyName).join(', ')}</strong><small title={scopedAccounts.map((account) => account.displayName).join(', ')}>{user.marketplaceAccountIds === 'all' ? `All ${scopedAccounts.length} accounts in scope` : scopedAccounts.map((account) => account.displayName).join(', ') || 'No accounts assigned'}</small></div></td><td data-label="Status"><Badge tone={user.status === 'active' ? 'positive' : user.status === 'invited' ? 'info' : 'warning'}>{statusLabel(user.status)}</Badge></td><td data-label="Last active"><span className="admin-user-date">{user.lastActiveAt ? formatDate(user.lastActiveAt) : 'Not yet active'}</span></td><td data-label="Actions"><div className="admin-row-actions"><DropdownMenu label="Manage" accessibleLabel={`Manage ${user.name}`} items={[{ label: 'Edit role & assignments', onSelect: () => setEditor({ user }) }, ...(user.status === 'invited' ? [{ label: 'Resend invite', onSelect: () => resendInvite(user) }] : []), user.status === 'suspended' ? { label: 'Reactivate user', onSelect: () => updateStatus(user, 'active') } : { label: 'Suspend user', danger: true, onSelect: () => updateStatus(user, 'suspended') }]} /></div></td></tr>;
      })}</tbody></table></div> : <div className="admin-empty"><Users size={24} /><strong>No users match these filters</strong><p>Try another name or clear the status and company filters.</p><Button onClick={() => { setSearch(''); setStatus('all'); setCompanyFilter('all'); }}>Clear filters</Button></div>}
    </section>
    <aside className="admin-access-equation" aria-label="How access is determined"><span><ShieldCheck size={15} /> Role</span><b>+</b><span><Building2 size={15} /> Company assignment</span><b>+</b><span><Store size={15} /> Account assignment</span><b>=</b><strong>Effective access</strong></aside>
    {editor ? <UserEditor key={editor.user?.id ?? 'new'} user={editor.user} initialCompany={companyFilter} onClose={() => setEditor(null)} /> : null}
  </div>;
}
