'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, Building2, Check, ShieldCheck, Store, Users } from 'lucide-react';
import { ROLE_PRESETS, type Capability, type RolePreset } from '@/src/domain/permissions';
import { PageHeader } from '@/src/components/product/patterns';
import { Badge } from '@/src/components/ui/feedback';
import { Select } from '@/src/components/ui/forms';
import { useAdmin } from './admin-context';
import './users-roles.css';

const roles = ROLE_PRESETS.filter((role) => role.surface === 'tenant');
type PermissionLevel = 'View' | 'Manage' | 'Approve' | 'No Access';
interface PermissionArea { label: string; view?: Capability; manage?: Capability; approve?: Capability }
const areas: PermissionArea[] = [
  { label: 'Dashboard', view: 'profitability.view' },
  { label: 'Products', view: 'products.view' },
  { label: 'COGS', view: 'cogs.view', manage: 'cogs.edit', approve: 'cogs.approve' },
  { label: 'Product Groups', view: 'cogs.view', manage: 'cogs.edit' },
  { label: 'Transactions', view: 'transactions.view' },
  { label: 'Expenses', view: 'expenses.view', manage: 'expenses.edit' },
  { label: 'Reports', view: 'reports.view' },
  { label: 'Companies', manage: 'companies.manage' },
  { label: 'Marketplace Accounts', manage: 'marketplaces.manage' },
  { label: 'Users', manage: 'users.manage' },
  { label: 'Roles & Permissions', manage: 'roles.manage' },
  { label: 'Billing & Modules', manage: 'billing.manage' },
  { label: 'Audit', view: 'audit.view' },
];

function permissionFor(role: RolePreset, area: PermissionArea): PermissionLevel {
  if (area.approve && role.capabilities.includes(area.approve)) return 'Approve';
  if (area.manage && role.capabilities.includes(area.manage)) return 'Manage';
  if (area.view && role.capabilities.includes(area.view)) return 'View';
  return 'No Access';
}

function PermissionPill({ value }: { value: PermissionLevel }) {
  return <span className={`admin-permission-pill ${value.toLowerCase().replace(' ', '-')}`}>{value === 'No Access' ? <span aria-hidden="true">—</span> : <Check size={10} aria-hidden="true" />}{value}</span>;
}

const scopeDescriptions: Record<string, string> = {
  admin: 'Organisation administration, with operational data limited by the user’s company and account assignments.',
  'company-manager': 'Assigned companies and their permitted marketplace accounts. Company assignment does not grant Organisation administration.',
  finance: 'Financial workflows within assigned companies and accounts. Sensitive Expense access is included.',
  'marketplace-manager': 'Assigned marketplace accounts within assigned companies. No COGS, Expense or Tenant Admin management.',
  'cost-user': 'Cost maintenance within assigned companies and accounts. Cost approval remains a separate permission.',
  analyst: 'Read-only analysis within assigned companies and accounts, including sensitive Expenses.',
  auditor: 'Read-only review within assigned companies and accounts. Sensitive Expense details remain restricted.',
};

export function RolesPage() {
  const { users, orgSlug, accounts, companyName } = useAdmin();
  const [selectedRole, setSelectedRole] = useState('all');
  const exampleAccount = accounts.find((account) => account.marketplace === 'amazon') ?? accounts[0];
  return <div className="admin-page admin-roles-page">
    <PageHeader eyebrow="Tenant administration" title="Roles & Permissions" description="Seven default roles define what a colleague can do. Assignments determine where they can do it." actions={<Link className="ui-button secondary" href={`/o/${orgSlug}/admin/users`}><Users size={14} /> Manage users</Link>} />
    <section className="admin-role-access-model" aria-label="How access is determined">
      <div className="admin-access-equation"><span><ShieldCheck size={16} /> Role</span><b>+</b><span><Building2 size={16} /> Company assignment</span><b>+</b><span><Store size={16} /> Marketplace account assignment</span><b>=</b><strong>Effective access</strong></div>
      <p>{exampleAccount ? <>For example, a <strong>Marketplace Manager</strong> assigned to <strong>{companyName(exampleAccount.companyId)}</strong> and <strong>{exampleAccount.displayName}</strong> can use permitted marketplace views within that account.</> : <>Choose a role, then assign the companies and marketplace accounts a colleague can work with.</>} Operational access also requires an active subscription and an enabled module.</p>
    </section>
    <section aria-labelledby="admin-default-roles-heading" className="admin-default-roles">
      <div className="admin-section-heading"><div><h2 id="admin-default-roles-heading">Default roles</h2><p>Assign these roles in Users. Permissions are fixed in this prototype.</p></div><Badge>{roles.length} default roles</Badge></div>
      <div className="admin-role-grid">{roles.map((role) => {
        const members = users.filter((user) => user.roleId === role.id);
        const managed = areas.filter((area) => ['Manage', 'Approve'].includes(permissionFor(role, area))).map((area) => area.label);
        const viewed = areas.filter((area) => permissionFor(role, area) === 'View').map((area) => area.label);
        return <article key={role.id} className={`admin-role-card${role.id === 'admin' ? ' organisation-admin' : ''}`}>
          <header><span className="admin-role-icon"><ShieldCheck size={18} /></span><Badge>Default</Badge></header>
          <div><h3>{role.label}</h3><p className="admin-role-purpose">{role.id === 'company-manager' ? 'Operational oversight across assigned companies.' : role.description}</p></div>
          <div className="admin-role-members"><Users size={13} /><strong>{members.length}</strong> {members.length === 1 ? 'user' : 'users'}<span>including pending invitations</span></div>
          <dl className="admin-role-capabilities"><div><dt>Can view</dt><dd>{viewed.join(', ') || 'Included in management permissions.'}</dd></div><div><dt>Can manage</dt><dd>{managed.length ? managed.join(', ') : 'No management actions'}{role.capabilities.includes('cogs.approve') ? <span className="admin-role-approval">Includes COGS approval</span> : null}{role.capabilities.includes('sync.retry') && !role.capabilities.includes('marketplaces.manage') ? <span className="admin-role-approval">Can retry authorised marketplace syncs</span> : null}</dd></div></dl>
          <p className="admin-role-scope"><Building2 size={13} /><span>{scopeDescriptions[role.id]}</span></p>
          <a href="#admin-permission-matrix" className="admin-role-matrix-link" onClick={() => setSelectedRole(role.id)}>View permissions <ArrowDown size={12} /></a>
        </article>;
      })}</div>
    </section>
    <section id="admin-permission-matrix" className="admin-panel admin-permission-panel" aria-labelledby="admin-matrix-heading">
      <header className="admin-panel-heading"><div><h2 id="admin-matrix-heading">Permission matrix</h2><p>Existing role capabilities, before company and account assignments are applied.</p></div><Select aria-label="Highlight role in permission matrix" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="all">All roles</option>{roles.map((role) => <option value={role.id} key={role.id}>{role.label}</option>)}</Select></header>
      <div className="admin-permission-legend">{(['View', 'Manage', 'Approve', 'No Access'] as PermissionLevel[]).map((value) => <PermissionPill key={value} value={value} />)}<small>Highest available permission shown. Manage includes viewing; Approve includes the permitted COGS workflow.</small></div>
      <div className="admin-permission-scroll" tabIndex={0} role="region" aria-label="Permissions by role; scroll horizontally for all roles"><table className="admin-permission-matrix"><thead><tr><th scope="col">Workspace area</th>{roles.map((role) => <th scope="col" className={selectedRole === role.id ? 'selected-role' : ''} key={role.id}>{role.label}</th>)}</tr></thead><tbody>{areas.map((area) => <tr key={area.label}><th scope="row">{area.label}</th>{roles.map((role) => <td className={selectedRole === role.id ? 'selected-role' : ''} key={role.id}><PermissionPill value={permissionFor(role, area)} /></td>)}</tr>)}</tbody></table></div>
      <p className="admin-matrix-note">Marketplace account administration is separate from viewing or retrying syncs. Sensitive Expense visibility follows each role’s existing capability. This matrix describes the default roles; a user’s assignments may narrow their access further.</p>
    </section>
  </div>;
}
