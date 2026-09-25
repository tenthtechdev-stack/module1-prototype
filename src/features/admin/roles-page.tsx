'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowDown, Building2, Check, Copy, Pencil, Plus, ShieldCheck, Store, Users } from 'lucide-react';
import { CAPABILITY_LABELS, TENANT_CAPABILITY_GROUPS, getUserRoleAssignments, type Capability } from '@/src/domain/permissions';
import { PageHeader } from '@/src/components/product/patterns';
import { Button } from '@/src/components/ui/actions';
import { Checkbox, Field, Input, Select, Textarea } from '@/src/components/ui/forms';
import { Alert, Badge, useToast } from '@/src/components/ui/feedback';
import { Drawer, DropdownMenu } from '@/src/components/ui/overlays';
import { useAdmin, type AdminRole } from './admin-context';
import './users-roles.css';

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
  { label: 'Marketplace Accounts', view: 'sync.view', manage: 'marketplaces.manage' },
  { label: 'Users', manage: 'users.manage' },
  { label: 'Roles & Permissions', manage: 'roles.manage' },
  { label: 'Billing & Modules', manage: 'billing.manage' },
  { label: 'Audit', view: 'audit.view' },
];

function permissionFor(role: AdminRole, area: PermissionArea): PermissionLevel {
  if (area.approve && role.capabilities.includes(area.approve)) return 'Approve';
  if (area.manage && role.capabilities.includes(area.manage)) return 'Manage';
  if (area.view && role.capabilities.includes(area.view)) return 'View';
  return 'No Access';
}

function PermissionPill({ value }: { value: PermissionLevel }) {
  return <span className={'admin-permission-pill ' + value.toLowerCase().replace(' ', '-')}>{value === 'No Access' ? <span aria-hidden="true">—</span> : <Check size={10} aria-hidden="true" />}{value}</span>;
}

function RoleEditor({ role, source, onClose }: { role: AdminRole | null; source: AdminRole | null; onClose: () => void }) {
  const { organisation, roles, setCustomRoles, recordAudit } = useAdmin();
  const { showToast } = useToast();
  const seed = role ?? source;
  const [name, setName] = useState(role?.label ?? (source ? source.label + ' Copy' : ''));
  const [description, setDescription] = useState(role?.description ?? source?.description ?? '');
  const [templateId, setTemplateId] = useState(source?.id ?? '');
  const [capabilities, setCapabilities] = useState<Capability[]>(seed ? [...seed.capabilities] : []);
  const [error, setError] = useState('');

  function chooseTemplate(id: string) {
    setTemplateId(id);
    const template = roles.find((candidate) => candidate.id === id);
    setCapabilities(template ? [...template.capabilities] : []);
    if (template && !name.trim()) setName(template.label + ' Custom');
    if (template && !description.trim()) setDescription(template.description);
  }

  function toggleCapability(capability: Capability, checked: boolean) {
    setCapabilities((current) => checked ? [...current, capability] : current.filter((item) => item !== capability));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 3) { setError('Enter a role name with at least three characters.'); return; }
    if (!description.trim()) { setError('Describe what this role is intended to do.'); return; }
    if (!capabilities.length) { setError('Choose at least one capability.'); return; }
    const duplicateName = roles.some((candidate) => candidate.id !== role?.id && candidate.label.toLowerCase() === name.trim().toLowerCase());
    if (duplicateName) { setError('Choose a unique role name for this Organisation.'); return; }

    const next: AdminRole = role ? {
      ...role,
      label: name.trim(),
      description: description.trim(),
      capabilities,
    } : {
      id: 'custom-' + name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + crypto.randomUUID().slice(0, 6),
      label: name.trim(),
      description: description.trim(),
      surface: 'tenant',
      capabilities,
      kind: 'custom',
      status: 'active',
      organisationId: organisation.id,
    };
    setCustomRoles((current) => role ? current.map((candidate) => candidate.id === role.id ? next : candidate) : [next, ...current]);
    recordAudit({
      action: role ? 'Custom role updated' : source ? 'Custom role duplicated' : 'Custom role created',
      area: 'Roles & Permissions',
      entity: next.label,
      before: role ? role.capabilities.map((capability) => CAPABILITY_LABELS[capability]).join(', ') : undefined,
      after: next.capabilities.map((capability) => CAPABILITY_LABELS[capability]).join(', '),
      reason: source ? 'Duplicated from ' + source.label : 'Organisation-specific role',
    });
    showToast(role ? 'Custom role updated' : 'Custom role created');
    onClose();
  }

  return <Drawer open onOpenChange={(open) => { if (!open) onClose(); }} title={role ? 'Edit custom role' : source ? 'Duplicate as custom role' : 'Create custom role'} description="Custom roles belong only to this Organisation and reuse the prototype’s existing capability values.">
    <form className="admin-form admin-role-editor" onSubmit={submit}>
      {error ? <Alert tone="negative" title="Review role details">{error}</Alert> : null}
      {source?.kind === 'default' ? <Alert tone="info" title="Default template protected">The default role remains unchanged. Saving creates a separate Custom Role.</Alert> : null}
      <div className="admin-form-grid">
        <Field label="Role name"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Finance Manager" /></Field>
        {!role ? <Field label="Start from role" hint="Optional. Copies capabilities into an editable custom role."><Select value={templateId} onChange={(event) => chooseTemplate(event.target.value)}><option value="">Blank custom role</option>{roles.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.label} · {candidate.kind === 'default' ? 'Default' : 'Custom'}</option>)}</Select></Field> : <Field label="Role type"><Input value="Custom Role · editable" readOnly /></Field>}
      </div>
      <Field label="Purpose"><Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Explain when an Organisation Admin should assign this role." /></Field>
      <section className="admin-capability-editor" aria-labelledby="capability-editor-heading">
        <header><div><h3 id="capability-editor-heading">Permission editor</h3><p>Select allowed capabilities. Effective user access is the union of assigned roles; this prototype has no deny precedence.</p></div><Badge tone="info">{capabilities.length} selected</Badge></header>
        <div>{TENANT_CAPABILITY_GROUPS.map((group) => <fieldset key={group.label}><legend>{group.label}</legend><p>{group.description}</p>{group.capabilities.map((capability) => <Checkbox key={capability} label={CAPABILITY_LABELS[capability]} checked={capabilities.includes(capability)} onChange={(event) => toggleCapability(capability, event.target.checked)} />)}</fieldset>)}</div>
      </section>
      <div className="admin-form-actions"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary"><ShieldCheck size={14} /> {role ? 'Save role' : 'Create custom role'}</Button></div>
    </form>
  </Drawer>;
}

const scopeDescriptions: Record<string, string> = {
  admin: 'Organisation-wide administration. The Users experience prevents removal of the final active Organisation Admin.',
  'company-manager': 'Assigned companies and their permitted marketplace accounts. Company assignment does not grant Organisation administration.',
  finance: 'Financial workflows within assigned companies and accounts. Sensitive Expense access is included.',
  'marketplace-manager': 'Assigned marketplace accounts within assigned companies. No COGS, Expense or Tenant Admin management.',
  'cost-user': 'Cost maintenance within assigned companies and accounts. Cost approval remains a separate permission.',
  analyst: 'Read-only analysis within assigned companies and accounts, including sensitive Expenses.',
  auditor: 'Read-only review within assigned companies and accounts. Sensitive Expense details remain restricted.',
};

export function RolesPage() {
  const { users, orgSlug, accounts, companyName, roles, customRoles, setCustomRoles, recordAudit } = useAdmin();
  const { showToast } = useToast();
  const [selectedRole, setSelectedRole] = useState('all');
  const [editor, setEditor] = useState<{ role: AdminRole | null; source: AdminRole | null } | null>(null);
  const defaultRoles = roles.filter((role) => role.kind === 'default');
  const exampleAccount = accounts.find((account) => account.marketplace === 'amazon') ?? accounts[0];
  const memberCount = (roleId: string) => users.filter((user) => getUserRoleAssignments(user).some((assignment) => assignment.roleId === roleId)).length;

  function setRoleStatus(role: AdminRole, status: AdminRole['status']) {
    const assigned = memberCount(role.id);
    setCustomRoles((current) => current.map((candidate) => candidate.id === role.id ? { ...candidate, status } : candidate));
    recordAudit({
      action: status === 'inactive' ? 'Custom role deactivated' : 'Custom role reactivated',
      area: 'Roles & Permissions',
      entity: role.label,
      before: role.status,
      after: status,
      reason: assigned ? assigned + ' user assignment(s) retained for traceability' : 'Role availability updated',
    });
    showToast(status === 'inactive' ? 'Role deactivated; existing assignments no longer add permissions.' : 'Custom role reactivated', status === 'inactive' ? 'warning' : 'positive');
  }

  return <div className="admin-page admin-roles-page">
    <PageHeader eyebrow="Tenant administration" title="Roles & Permissions" description="Default role templates plus Organisation-specific Custom Roles can be combined in independently scoped user assignments." actions={<><Link className="ui-button secondary" href={'/o/' + orgSlug + '/admin/users'}><Users size={14} /> Manage users</Link><Button variant="primary" onClick={() => setEditor({ role: null, source: null })}><Plus size={14} /> Create custom role</Button></>} />
    <section className="admin-role-access-model" aria-label="How access is determined">
      <div className="admin-access-equation"><span><ShieldCheck size={16} /> Default + Custom Roles</span><b>+</b><span><Building2 size={16} /> Organisation / Company scope</span><b>+</b><span><Store size={16} /> Marketplace Account scope</span><b>=</b><strong>Effective access (union)</strong></div>
      <p>{exampleAccount ? <>For example, a <strong>Marketplace Manager</strong> assigned to <strong>{companyName(exampleAccount.companyId)}</strong> and <strong>{exampleAccount.displayName}</strong> can use permitted marketplace views within that account.</> : <>Add one or more scoped role assignments to a colleague.</>} No explicit deny precedence is introduced; subscription and module access still apply.</p>
    </section>

    <section aria-labelledby="admin-default-roles-heading" className="admin-default-roles">
      <div className="admin-section-heading"><div><h2 id="admin-default-roles-heading">Default role templates</h2><p>System templates are protected. Duplicate one as a Custom Role to change its permissions.</p></div><Badge>{defaultRoles.length} default roles</Badge></div>
      <div className="admin-role-grid">{defaultRoles.map((role) => {
        const members = memberCount(role.id);
        const managed = areas.filter((area) => ['Manage', 'Approve'].includes(permissionFor(role, area))).map((area) => area.label);
        const viewed = areas.filter((area) => permissionFor(role, area) === 'View').map((area) => area.label);
        return <article key={role.id} className={'admin-role-card' + (role.id === 'admin' ? ' organisation-admin' : '')}>
          <header><span className="admin-role-icon"><ShieldCheck size={18} /></span><div className="admin-role-card-badges"><Badge>Default Role</Badge><DropdownMenu label="Actions" accessibleLabel={'Actions for ' + role.label} items={[{ label: 'Duplicate as Custom Role', onSelect: () => setEditor({ role: null, source: role }) }, { label: 'View in permission matrix', onSelect: () => setSelectedRole(role.id) }]} /></div></header>
          <div><h3>{role.label}</h3><p className="admin-role-purpose">{role.id === 'company-manager' ? 'Operational oversight across assigned companies.' : role.description}</p></div>
          <div className="admin-role-members"><Users size={13} /><strong>{members}</strong> {members === 1 ? 'user' : 'users'}<span>Across primary and additional assignments</span></div>
          <dl className="admin-role-capabilities"><div><dt>Can view</dt><dd>{viewed.join(', ') || 'Included in management permissions.'}</dd></div><div><dt>Can manage</dt><dd>{managed.length ? managed.join(', ') : 'No management actions'}{role.capabilities.includes('cogs.import') ? <span className="admin-role-approval">Includes COGS import</span> : null}{role.capabilities.includes('cogs.approve') ? <span className="admin-role-approval">Includes COGS approval</span> : null}</dd></div></dl>
          <p className="admin-role-scope"><Building2 size={13} /><span>{scopeDescriptions[role.id]}</span></p>
          <div className="admin-role-card-actions"><a href="#admin-permission-matrix" className="admin-role-matrix-link" onClick={() => setSelectedRole(role.id)}>View permissions <ArrowDown size={12} /></a><Button size="compact" variant="ghost" onClick={() => setEditor({ role: null, source: role })}><Copy size={12} /> Duplicate</Button></div>
        </article>;
      })}</div>
    </section>

    <section aria-labelledby="admin-custom-roles-heading" className="admin-default-roles">
      <div className="admin-section-heading"><div><h2 id="admin-custom-roles-heading">Custom Roles</h2><p>Organisation-specific roles. Deactivation is reversible and preserves assigned-user references.</p></div><Badge tone="info">{customRoles.length} custom {customRoles.length === 1 ? 'role' : 'roles'}</Badge></div>
      {customRoles.length ? <div className="admin-role-grid">{customRoles.map((role) => {
        const members = memberCount(role.id);
        return <article key={role.id} className={'admin-role-card custom' + (role.status === 'inactive' ? ' inactive' : '')}>
          <header><span className="admin-role-icon"><Pencil size={18} /></span><div className="admin-role-card-badges"><Badge tone="info">Custom Role</Badge><Badge tone={role.status === 'active' ? 'positive' : 'warning'}>{role.status === 'active' ? 'Active' : 'Inactive'}</Badge><DropdownMenu label="Actions" accessibleLabel={'Actions for ' + role.label} items={[{ label: 'Edit role', onSelect: () => setEditor({ role, source: null }) }, { label: 'Duplicate role', onSelect: () => setEditor({ role: null, source: role }) }, { label: role.status === 'active' ? 'Deactivate role' : 'Reactivate role', danger: role.status === 'active', onSelect: () => setRoleStatus(role, role.status === 'active' ? 'inactive' : 'active') }]} /></div></header>
          <div><h3>{role.label}</h3><p className="admin-role-purpose">{role.description}</p></div>
          <div className="admin-role-members"><Users size={13} /><strong>{members}</strong> {members === 1 ? 'user' : 'users'}<span>{role.status === 'inactive' ? 'Assignments retained; capabilities inactive' : 'Eligible for new role assignments'}</span></div>
          <dl className="admin-role-capabilities"><div><dt>Capabilities</dt><dd>{role.capabilities.slice(0, 6).map((capability) => CAPABILITY_LABELS[capability]).join(', ')}{role.capabilities.length > 6 ? ' +' + (role.capabilities.length - 6) + ' more' : ''}</dd></div></dl>
          <p className="admin-role-scope"><Store size={13} /><span>May be assigned at Organisation, Company or Marketplace Account scope.</span></p>
          <div className="admin-role-card-actions"><Button size="compact" variant="ghost" onClick={() => setEditor({ role, source: null })}><Pencil size={12} /> Edit permissions</Button><Button size="compact" variant="ghost" onClick={() => setEditor({ role: null, source: role })}><Copy size={12} /> Duplicate</Button></div>
        </article>;
      })}</div> : <div className="admin-empty"><ShieldCheck size={24} /><strong>No Custom Roles yet</strong><p>Create a blank role or duplicate a protected default template.</p><Button variant="primary" onClick={() => setEditor({ role: null, source: null })}><Plus size={14} /> Create custom role</Button></div>}
    </section>

    <section id="admin-permission-matrix" className="admin-panel admin-permission-panel" aria-labelledby="admin-matrix-heading">
      <header className="admin-panel-heading"><div><h2 id="admin-matrix-heading">Permission matrix</h2><p>Role capabilities before each user assignment’s Organisation, Company or Marketplace Account scope is applied.</p></div><Select aria-label="Highlight role in permission matrix" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}><option value="all">All roles</option>{roles.map((role) => <option value={role.id} key={role.id}>{role.label} · {role.kind === 'default' ? 'Default' : role.status === 'active' ? 'Custom' : 'Inactive'}</option>)}</Select></header>
      <div className="admin-permission-legend">{(['View', 'Manage', 'Approve', 'No Access'] as PermissionLevel[]).map((value) => <PermissionPill key={value} value={value} />)}<small>Highest available permission shown. The Custom Role editor exposes every reused capability value, including import, sensitive-value and sync-retry permissions.</small></div>
      <div className="admin-permission-scroll" tabIndex={0} role="region" aria-label="Permissions by role; scroll horizontally for all roles"><table className="admin-permission-matrix"><thead><tr><th scope="col">Workspace area</th>{roles.map((role) => <th scope="col" className={selectedRole === role.id ? 'selected-role' : ''} key={role.id}>{role.label}{role.kind === 'custom' ? <small>Custom{role.status === 'inactive' ? ' · Inactive' : ''}</small> : <small>Default</small>}</th>)}</tr></thead><tbody>{areas.map((area) => <tr key={area.label}><th scope="row">{area.label}</th>{roles.map((role) => <td className={selectedRole === role.id ? 'selected-role' : ''} key={role.id}><PermissionPill value={permissionFor(role, area)} /></td>)}</tr>)}</tbody></table></div>
      <p className="admin-matrix-note">Default Role templates cannot be edited. Custom Role capabilities can be changed or deactivated, and effective user permissions are the union of all active assigned roles within their applicable scope. There is no deny precedence in this prototype.</p>
    </section>
    {editor ? <RoleEditor key={(editor.role?.id ?? 'new') + ':' + (editor.source?.id ?? 'blank')} role={editor.role} source={editor.source} onClose={() => setEditor(null)} /> : null}
  </div>;
}
