'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, Mail, Plus, ShieldAlert, ShieldCheck, Store, Trash2, UserPlus, Users } from 'lucide-react';
import { CAPABILITY_LABELS, getEffectiveCapabilities, getUserRoleAssignments } from '@/src/domain/permissions';
import type { RoleAssignmentLevel, UserRoleAssignment } from '@/src/domain/models';
import { formatDate } from '@/src/domain/calculations';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Checkbox, Field, Input, SearchInput, Select } from '@/src/components/ui/forms';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { Drawer, DropdownMenu } from '@/src/components/ui/overlays';
import { useAdmin, type AdminRole, type AdminUser } from './admin-context';
import './users-roles.css';

const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
const marketplaceName = (value: string) => value === 'ebay' ? 'eBay' : value === 'amazon' ? 'Amazon' : 'Temu';
const statusLabel = (status: AdminUser['status']) => status[0].toUpperCase() + status.slice(1);
const roleName = (id: string, roles: readonly AdminRole[]) => roles.find((role) => role.id === id)?.label ?? id;
const hasOrganisationAdmin = (user: AdminUser) => getUserRoleAssignments(user).some((assignment) => assignment.roleId === 'admin');

function cloneAssignments(user: AdminUser): UserRoleAssignment[] {
  return getUserRoleAssignments(user).map((assignment) => ({
    ...assignment,
    companyIds: assignment.companyIds === 'all' ? 'all' : [...assignment.companyIds],
    marketplaceAccountIds: assignment.marketplaceAccountIds === 'all' ? 'all' : [...assignment.marketplaceAccountIds],
  }));
}

function scopeLabel(
  assignment: UserRoleAssignment,
  companyName: (id: string) => string,
  accountName: (id: string) => string,
) {
  if (assignment.scope === 'organisation') return 'Organisation · all companies and marketplace accounts';
  if (assignment.scope === 'company') {
    const companies = assignment.companyIds === 'all' ? 'All companies' : assignment.companyIds.map(companyName).join(', ');
    return 'Company · ' + (companies || 'No companies selected');
  }
  const accounts = assignment.marketplaceAccountIds === 'all'
    ? 'All accounts'
    : assignment.marketplaceAccountIds.map(accountName).join(', ');
  return 'Marketplace Account · ' + (accounts || 'No accounts selected');
}

function UserEditor({ user, initialCompany, onClose }: { user: AdminUser | null; initialCompany: string; onClose: () => void }) {
  const { organisation, companies, accounts, users, roles, setUsers, recordAudit, companyName } = useAdmin();
  const { showToast } = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [status, setStatus] = useState<AdminUser['status']>(user?.status ?? 'invited');
  const [assignments, setAssignments] = useState<UserRoleAssignment[]>(() => user ? cloneAssignments(user) : [{
    id: 'draft-primary',
    roleId: 'analyst',
    scope: initialCompany === 'all' ? 'organisation' : 'company',
    companyIds: initialCompany === 'all' ? 'all' : [initialCompany],
    marketplaceAccountIds: 'all',
  }]);
  const [error, setError] = useState('');
  const activeRoles = roles.filter((role) => role.status === 'active');
  const effectiveCapabilities = getEffectiveCapabilities(assignments, activeRoles);
  const accountName = (id: string) => accounts.find((account) => account.id === id)?.displayName ?? id;
  const otherActiveAdmins = users.filter((candidate) => candidate.id !== user?.id && candidate.status === 'active' && hasOrganisationAdmin(candidate)).length;
  const isLastActiveAdmin = Boolean(user && user.status === 'active' && hasOrganisationAdmin(user) && otherActiveAdmins === 0);

  function updateAssignment(id: string, update: Partial<UserRoleAssignment>) {
    setAssignments((current) => current.map((assignment) => assignment.id === id ? { ...assignment, ...update } : assignment));
  }

  function changeRole(assignment: UserRoleAssignment, roleId: string) {
    if (roleId === 'admin') {
      updateAssignment(assignment.id, { roleId, scope: 'organisation', companyIds: 'all', marketplaceAccountIds: 'all' });
      return;
    }
    updateAssignment(assignment.id, { roleId });
  }

  function changeScope(assignment: UserRoleAssignment, scope: RoleAssignmentLevel) {
    if (scope === 'organisation') {
      updateAssignment(assignment.id, { scope, companyIds: 'all', marketplaceAccountIds: 'all' });
      return;
    }
    const companyIds = assignment.companyIds === 'all' ? [] : assignment.companyIds;
    updateAssignment(assignment.id, {
      scope,
      companyIds,
      marketplaceAccountIds: scope === 'company' ? 'all' : [],
    });
  }

  function toggleCompany(assignment: UserRoleAssignment, companyId: string, checked: boolean) {
    const current = assignment.companyIds === 'all' ? [] : assignment.companyIds;
    const companyIds = checked ? [...current, companyId] : current.filter((id) => id !== companyId);
    const marketplaceAccountIds = assignment.marketplaceAccountIds === 'all'
      ? 'all'
      : assignment.marketplaceAccountIds.filter((id) => accounts.some((account) => account.id === id && companyIds.includes(account.companyId)));
    updateAssignment(assignment.id, { companyIds, marketplaceAccountIds });
  }

  function addAssignment() {
    setAssignments((current) => [...current, {
      id: 'draft-' + crypto.randomUUID(),
      roleId: 'analyst',
      scope: 'organisation',
      companyIds: 'all',
      marketplaceAccountIds: 'all',
    }]);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() || !email.trim()) { setError('Enter a name and work email.'); return; }
    if (!assignments.length) { setError('Add at least one role assignment.'); return; }
    const invalidCompany = assignments.some((assignment) => assignment.scope !== 'organisation' && (assignment.companyIds === 'all' || !assignment.companyIds.length));
    if (invalidCompany) { setError('Choose at least one Company for every scoped assignment.'); return; }
    const invalidAccount = assignments.some((assignment) => assignment.scope === 'marketplace-account' && (assignment.marketplaceAccountIds === 'all' || !assignment.marketplaceAccountIds.length));
    if (invalidAccount) { setError('Choose at least one Marketplace Account for every account-scoped assignment.'); return; }
    if (assignments.some((assignment) => assignment.roleId === 'admin' && assignment.scope !== 'organisation')) {
      setError('Organisation Admin must use Organisation scope.');
      return;
    }
    const willRemainActiveAdmin = status === 'active' && assignments.some((assignment) => assignment.roleId === 'admin');
    if (isLastActiveAdmin && !willRemainActiveAdmin) {
      setError('Assign another active Organisation Admin before removing or suspending this administrator.');
      return;
    }

    const savedAssignments = assignments.map((assignment) => ({
      ...assignment,
      companyIds: assignment.companyIds === 'all' ? 'all' as const : [...assignment.companyIds],
      marketplaceAccountIds: assignment.marketplaceAccountIds === 'all' ? 'all' as const : [...assignment.marketplaceAccountIds],
    }));
    const primary = savedAssignments[0];
    const next: AdminUser = {
      id: user?.id ?? 'usr-invite-' + crypto.randomUUID(),
      organisationId: organisation.id,
      name: name.trim(),
      email: email.trim(),
      jobTitle: user?.jobTitle ?? '',
      roleId: primary.roleId,
      companyIds: primary.companyIds,
      marketplaceAccountIds: primary.marketplaceAccountIds,
      roleAssignments: savedAssignments,
      status,
      lastActiveAt: user?.lastActiveAt ?? null,
    };
    setUsers((current) => user ? current.map((item) => item.id === user.id ? next : item) : [next, ...current]);
    const before = user ? cloneAssignments(user).map((assignment) => roleName(assignment.roleId, roles) + ' · ' + scopeLabel(assignment, companyName, accountName)).join(' | ') : undefined;
    const after = savedAssignments.map((assignment) => roleName(assignment.roleId, roles) + ' · ' + scopeLabel(assignment, companyName, accountName)).join(' | ');
    recordAudit({
      action: user ? 'User role assignments updated' : 'User invited',
      area: 'Users',
      entity: next.name,
      companyId: primary.companyIds !== 'all' && primary.companyIds.length === 1 ? primary.companyIds[0] : null,
      before,
      after: after + ' · ' + statusLabel(status),
      reason: user ? 'Updated in Tenant Administration' : 'Mock invitation; no email delivered',
    });
    showToast(user ? 'User access updated' : 'Invitation sent');
    onClose();
  }

  return <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} title={user ? 'Manage user access' : 'Invite user'} description={user ? 'Add, remove or rescope role assignments for ' + user.name.split(' ')[0] + '.' : 'Invite a colleague with one or more scoped roles.'}>
    <form className="admin-form admin-user-form" onSubmit={submit}>
      {error ? <Alert tone="negative" title="Review user details">{error}</Alert> : null}
      {isLastActiveAdmin ? <Alert tone="warning" title="Last active Organisation Admin">This administrator cannot be suspended or lose the Organisation Admin assignment until another active administrator exists.</Alert> : null}
      <div className="admin-form-grid">
        <Field label="Name"><Input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" /></Field>
        <Field label="Work email"><Input required type="email" value={email} readOnly={!!user} onChange={(event) => setEmail(event.target.value)} placeholder="alex@company.co.uk" /></Field>
      </div>

      <section className="admin-role-assignment-editor" aria-labelledby="role-assignments-heading">
        <header><div><h3 id="role-assignments-heading">Role assignments</h3><p>Each role has its own Organisation, Company or Marketplace Account scope.</p></div><Button type="button" size="compact" onClick={addAssignment}><Plus size={13} /> Add role assignment</Button></header>
        <div className="admin-role-assignment-list">{assignments.map((assignment, index) => {
          const chosenRole = roles.find((role) => role.id === assignment.roleId);
          const companyIds = assignment.companyIds === 'all' ? [] : assignment.companyIds;
          const eligibleAccounts = accounts.filter((account) => companyIds.includes(account.companyId));
          const protectedAdminAssignment = isLastActiveAdmin && assignment.roleId === 'admin';
          return <fieldset className="admin-role-assignment-card" key={assignment.id}>
            <legend>Assignment {index + 1}</legend>
            <div className="admin-role-assignment-heading"><div><Badge tone={chosenRole?.kind === 'custom' ? 'info' : 'neutral'}>{chosenRole?.kind === 'custom' ? 'Custom Role' : 'Default Role'}</Badge>{chosenRole?.status === 'inactive' ? <Badge tone="warning">Inactive</Badge> : null}</div><Button type="button" size="compact" variant="ghost" disabled={assignments.length === 1 || protectedAdminAssignment} onClick={() => setAssignments((current) => current.filter((item) => item.id !== assignment.id))}><Trash2 size={13} /> Remove</Button></div>
            <div className="admin-form-grid">
              <Field label="Role" hint={chosenRole?.description}><Select value={assignment.roleId} disabled={protectedAdminAssignment} onChange={(event) => changeRole(assignment, event.target.value)}>{roles.map((role) => <option value={role.id} key={role.id} disabled={role.status === 'inactive' && role.id !== assignment.roleId}>{role.label}{role.kind === 'custom' ? ' · Custom' : ' · Default'}{role.status === 'inactive' ? ' · Inactive' : ''}</option>)}</Select></Field>
              <Field label="Scope" hint={assignment.roleId === 'admin' ? 'Organisation Admin is always Organisation-scoped.' : 'Permissions apply only inside this boundary.'}><Select value={assignment.scope} disabled={assignment.roleId === 'admin'} onChange={(event) => changeScope(assignment, event.target.value as RoleAssignmentLevel)}><option value="organisation">Organisation</option><option value="company">Company</option><option value="marketplace-account">Marketplace Account</option></Select></Field>
            </div>
            {assignment.scope !== 'organisation' ? <fieldset className="admin-assignment-fieldset"><legend><Building2 size={14} /> Companies</legend><div className="admin-assignment-options">{companies.map((company) => <Checkbox key={company.id} label={company.name} checked={companyIds.includes(company.id)} onChange={(event) => toggleCompany(assignment, company.id, event.target.checked)} />)}</div></fieldset> : <p className="admin-assignment-scope-note"><Building2 size={14} /> Applies across every Company and Marketplace Account in this Organisation.</p>}
            {assignment.scope === 'marketplace-account' ? <fieldset className="admin-assignment-fieldset"><legend><Store size={14} /> Marketplace Accounts</legend><p>Accounts are limited to the Companies selected above.</p><div className="admin-assignment-options">{eligibleAccounts.length ? eligibleAccounts.map((account) => {
              const selectedAccountIds = assignment.marketplaceAccountIds === 'all' ? [] : assignment.marketplaceAccountIds;
              return <Checkbox key={account.id} label={account.displayName + ' · ' + marketplaceName(account.marketplace)} checked={selectedAccountIds.includes(account.id)} onChange={(event) => updateAssignment(assignment.id, { marketplaceAccountIds: event.target.checked ? [...selectedAccountIds, account.id] : selectedAccountIds.filter((id) => id !== account.id) })} />;
            }) : <span className="admin-inline-note">Choose a Company to reveal its Marketplace Accounts.</span>}</div></fieldset> : null}
          </fieldset>;
        })}</div>
      </section>

      {user ? <Field label="User status"><Select value={status} onChange={(event) => setStatus(event.target.value as AdminUser['status'])}><option value="active">Active</option><option value="invited">Invited</option><option value="suspended" disabled={isLastActiveAdmin}>Suspended{isLastActiveAdmin ? ' · another admin required' : ''}</option></Select></Field> : null}
      <aside className="admin-effective-access">
        <header><ShieldCheck size={17} /><strong>Effective access preview</strong><Badge tone="info">Union · no deny precedence</Badge></header>
        <div className="admin-effective-assignment-list">{assignments.map((assignment) => <div key={assignment.id}><strong>{roleName(assignment.roleId, roles)}</strong><span>{scopeLabel(assignment, companyName, accountName)}</span></div>)}</div>
        <div className="admin-effective-capabilities"><span>Effective capabilities</span><div>{effectiveCapabilities.length ? effectiveCapabilities.map((capability) => <small key={capability}>{CAPABILITY_LABELS[capability]}</small>) : <small>No active role capabilities</small>}</div></div>
        <p>{status === 'suspended' ? 'Suspended users cannot enter the workspace. Assignments are retained for reactivation.' : 'Capabilities are combined across active assigned roles, then constrained by each assignment’s scope. Operational access still requires an enabled module and active subscription.'}</p>
      </aside>
      {!user ? <p className="admin-inline-note"><Mail size={14} /> This prototype previews invitation access locally. No real email is sent.</p> : null}
      <div className="admin-form-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button variant="primary" type="submit">{user ? <ShieldCheck size={14} /> : <Mail size={14} />}{user ? 'Save access' : 'Send invite'}</Button></div>
    </form>
  </Drawer>;
}

export function UsersPage() {
  const { users, roles, companies, accounts, companyName, setUsers, recordAudit } = useAdmin();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const companyQuery = searchParams.get('company');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [companyFilter, setCompanyFilter] = useState(companyQuery && companies.some((company) => company.id === companyQuery) ? companyQuery : 'all');
  const [editor, setEditor] = useState<{ user: AdminUser | null } | null>(null);
  const activeAdminCount = users.filter((user) => user.status === 'active' && hasOrganisationAdmin(user)).length;
  const filtered = useMemo(() => users.filter((user) => {
    const assignments = getUserRoleAssignments(user);
    const matchesCompany = companyFilter === 'all' || assignments.some((assignment) => assignment.companyIds === 'all' || assignment.companyIds.includes(companyFilter));
    const roleText = assignments.map((assignment) => roleName(assignment.roleId, roles)).join(' ');
    return (status === 'all' || user.status === status) && matchesCompany && (user.name + ' ' + user.email + ' ' + roleText).toLowerCase().includes(search.toLowerCase());
  }), [companyFilter, roles, search, status, users]);

  function updateStatus(user: AdminUser, nextStatus: AdminUser['status']) {
    if (nextStatus === 'suspended' && user.status === 'active' && hasOrganisationAdmin(user) && activeAdminCount <= 1) {
      showToast('Assign another active Organisation Admin before suspending this user.', 'warning');
      return;
    }
    setUsers((current) => current.map((item) => item.id === user.id ? { ...item, status: nextStatus } : item));
    recordAudit({ action: nextStatus === 'suspended' ? 'User suspended' : 'User reactivated', area: 'Users', entity: user.name, before: statusLabel(user.status), after: statusLabel(nextStatus), reason: 'Updated in Tenant Administration' });
    showToast(nextStatus === 'suspended' ? 'User suspended' : 'User reactivated', nextStatus === 'suspended' ? 'info' : 'positive');
  }

  function resendInvite(user: AdminUser) {
    recordAudit({ action: 'Invitation resent', area: 'Users', entity: user.name, after: 'Invitation pending for ' + user.email, reason: 'Mock invitation; no email delivered' });
    showToast('Invitation resent');
  }

  return <div className="admin-page">
    <PageHeader eyebrow="Tenant administration" title="Users" description="Combine one or more default or custom roles, each with an explicit Organisation, Company or Marketplace Account scope." actions={<Button variant="primary" onClick={() => setEditor({ user: null })}><UserPlus size={15} /> Invite user</Button>} />
    <section className="admin-stats" aria-label="Team overview"><article><small>Total users</small><strong>{users.length}</strong><span>Across the Organisation</span></article><article><small>Active</small><strong>{users.filter((user) => user.status === 'active').length}</strong><span>Workspace access enabled</span></article><article><small>Invited</small><strong>{users.filter((user) => user.status === 'invited').length}</strong><span>Awaiting acceptance</span></article><article><small>Role assignments</small><strong>{users.reduce((count, user) => count + getUserRoleAssignments(user).length, 0)}</strong><span>Permissions combine by union</span></article></section>
    {activeAdminCount === 1 ? <Alert tone="warning" title="Organisation Admin safeguard active"><ShieldAlert size={14} /> The last active Organisation Admin cannot be suspended or have that assignment removed.</Alert> : null}
    <section className="admin-panel"><header className="admin-panel-heading"><div><h2>People &amp; access</h2><p>Manage Organisation membership separately from each person’s global account profile.</p></div><Badge>{filtered.length} {filtered.length === 1 ? 'user' : 'users'}</Badge></header>
      <div className="admin-toolbar"><SearchInput aria-label="Search users" placeholder="Search name, email or role" value={search} onChange={(event) => setSearch(event.target.value)} /><Select aria-label="Filter users by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="invited">Invited</option><option value="suspended">Suspended</option></Select><Select aria-label="Filter users by company" value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}><option value="all">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</Select></div>
      {filtered.length ? <div className="admin-table-wrap"><table className="admin-table admin-users-table"><thead><tr><th>User</th><th>Role assignments</th><th>Scope</th><th>Status</th><th>Last active</th><th>Actions</th></tr></thead><tbody>{filtered.map((user) => {
        const assignments = getUserRoleAssignments(user);
        const isLastAdmin = user.status === 'active' && hasOrganisationAdmin(user) && activeAdminCount <= 1;
        return <tr key={user.id}><td data-label="User"><div className="admin-person"><span className="admin-avatar">{initials(user.name)}</span><div><button className="admin-user-name" type="button" onClick={() => setEditor({ user })}>{user.name}</button><small>{user.email}</small></div></div></td><td data-label="Role assignments"><div className="admin-user-role-list">{assignments.map((assignment) => {
          const assignedRole = roles.find((role) => role.id === assignment.roleId);
          return <span key={assignment.id}>{assignedRole?.label ?? assignment.roleId}{assignedRole?.status === 'inactive' ? ' · Inactive' : ''}</span>;
        })}</div></td><td data-label="Scope"><div className="admin-user-scope-list">{assignments.map((assignment) => <span key={assignment.id}>{scopeLabel(assignment, companyName, (id) => accounts.find((account) => account.id === id)?.displayName ?? id)}</span>)}</div></td><td data-label="Status"><Badge tone={user.status === 'active' ? 'positive' : user.status === 'invited' ? 'info' : 'warning'}>{statusLabel(user.status)}</Badge></td><td data-label="Last active"><span className="admin-user-date">{user.lastActiveAt ? formatDate(user.lastActiveAt) : 'Not yet active'}</span></td><td data-label="Actions"><div className="admin-row-actions"><DropdownMenu label="Manage" accessibleLabel={'Manage ' + user.name} items={[{ label: 'Edit role assignments', onSelect: () => setEditor({ user }) }, ...(user.status === 'invited' ? [{ label: 'Resend invite', onSelect: () => resendInvite(user) }] : []), user.status === 'suspended' ? { label: 'Reactivate user', onSelect: () => updateStatus(user, 'active') } : { label: isLastAdmin ? 'Suspend user · another admin required' : 'Suspend user', danger: !isLastAdmin, disabled: isLastAdmin, onSelect: () => updateStatus(user, 'suspended') }]} /></div></td></tr>;
      })}</tbody></table></div> : <div className="admin-empty"><Users size={24} /><strong>No users match these filters</strong><p>Try another name or clear the status and company filters.</p><Button onClick={() => { setSearch(''); setStatus('all'); setCompanyFilter('all'); }}>Clear filters</Button></div>}
    </section>
    <aside className="admin-access-equation" aria-label="How access is determined"><span><ShieldCheck size={15} /> One or more roles</span><b>+</b><span><Building2 size={15} /> Assignment scope</span><b>+</b><span><Store size={15} /> Companies / accounts</span><b>=</b><strong>Effective access (union)</strong></aside>
    {editor ? <UserEditor key={editor.user?.id ?? 'new'} user={editor.user} initialCompany={companyFilter} onClose={() => setEditor(null)} /> : null}
  </div>;
}
