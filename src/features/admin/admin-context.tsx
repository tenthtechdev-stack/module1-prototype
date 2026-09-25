'use client';

import { createContext, useContext, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { useAnalysisContext } from '@/src/components/providers/analysis-context-provider';
import { useAccessRuntime } from '@/src/components/rbac/access';
import { usePrototype } from '@/src/components/providers/prototype-provider';
import { getUserRoleAssignments, ROLE_PRESETS, type Capability, type RolePreset } from '@/src/domain/permissions';
import type { Company, MarketplaceAccount, Organisation, User, UserRoleAssignment, SyncStatus } from '@/src/domain/models';
import type { WorkspaceSnapshot } from '@/src/services/contracts';

export interface AdminCompany extends Company { status: 'active' | 'inactive'; tradingName: string; description: string; productCount: number }
export interface AdminAccount extends Omit<MarketplaceAccount, 'status'> { status: SyncStatus | 'paused'; listingCount: number }
export interface AdminUser extends User { status: 'active' | 'invited' | 'suspended'; lastActiveAt: string | null }
export interface AdminRole extends RolePreset {
  kind: 'default' | 'custom';
  status: 'active' | 'inactive';
  organisationId: string | null;
}
export interface AdminAuditInput { action: string; area: string; entity: string; companyId?: string | null; before?: string; after?: string; reason?: string }
export interface AdminAuditEvent extends AdminAuditInput { id: string; timestamp: string; actor: string; source: string }
interface AdminContextValue {
  orgSlug: string;
  organisation: Organisation & { createdAt: string; status: 'active' };
  setOrganisation: Dispatch<SetStateAction<Organisation & { createdAt: string; status: 'active' }>>;
  companies: AdminCompany[];
  setCompanies: Dispatch<SetStateAction<AdminCompany[]>>;
  accounts: AdminAccount[];
  setAccounts: Dispatch<SetStateAction<AdminAccount[]>>;
  users: AdminUser[];
  setUsers: Dispatch<SetStateAction<AdminUser[]>>;
  roles: AdminRole[];
  customRoles: AdminRole[];
  setCustomRoles: Dispatch<SetStateAction<AdminRole[]>>;
  audit: AdminAuditEvent[];
  recordAudit: (input: AdminAuditInput) => void;
  companyName: (id: string) => string;
}
const AdminContext = createContext<AdminContextValue | null>(null);
const defaultRoles: AdminRole[] = ROLE_PRESETS
  .filter((role) => role.surface === 'tenant')
  .map((role) => ({ ...role, capabilities: [...role.capabilities], kind: 'default', status: 'active', organisationId: null }));

function copyAssignments(user: User): UserRoleAssignment[] {
  return getUserRoleAssignments(user).map((assignment) => ({
    ...assignment,
    companyIds: assignment.companyIds === 'all' ? 'all' : [...assignment.companyIds],
    marketplaceAccountIds: assignment.marketplaceAccountIds === 'all' ? 'all' : [...assignment.marketplaceAccountIds],
  }));
}

function seedUsers(workspace: WorkspaceSnapshot): AdminUser[] {
  const existing: AdminUser[] = workspace.users.map(user => ({ ...user, roleAssignments: copyAssignments(user), status: 'active', lastActiveAt: '2026-08-27T18:30:00Z' }));
  if (workspace.organisation.slug !== 'stock-supplies') return existing;
  const additions: Array<[string, string, string, AdminUser['status'], string[] | 'all']> = [
    ['Oliver Bennett', 'company-manager', 'oliver.bennett@stocksupplies.co.uk', 'active', ['cmp-stock', 'cmp-proserve']],
    ['Emma Richardson', 'finance', 'emma.richardson@stocksupplies.co.uk', 'invited', ['cmp-stock']],
    ['James Wilson', 'auditor', 'james.wilson@stocksupplies.co.uk', 'active', 'all'],
    ['Sophie Turner', 'marketplace-manager', 'sophie.turner@stocksupplies.co.uk', 'suspended', ['cmp-stock']],
    ['Noah Williams', 'analyst', 'noah.williams@proserve.co.uk', 'invited', ['cmp-proserve']],
  ];
  return [...existing, ...additions.map(([name, roleId, email, status, companyIds], index): AdminUser => {
    const marketplaceAccountIds = roleId === 'marketplace-manager' ? ['acct-stock-amazon'] : 'all';
    const primary: UserRoleAssignment = {
      id: `admin-demo-assignment-${index}-primary`,
      roleId,
      scope: companyIds === 'all' ? 'organisation' : roleId === 'marketplace-manager' ? 'marketplace-account' : 'company',
      companyIds,
      marketplaceAccountIds,
    };
    const roleAssignments = roleId === 'finance'
      ? [primary, { id: `admin-demo-assignment-${index}-analysis`, roleId: 'analyst', scope: 'company' as const, companyIds: ['cmp-proserve'], marketplaceAccountIds: 'all' as const }]
      : [primary];
    return {
      id: `admin-demo-user-${index}`, organisationId: workspace.organisation.id, name, roleId, email, status, companyIds,
      jobTitle: '', marketplaceAccountIds, roleAssignments,
      lastActiveAt: status === 'invited' ? null : '2026-08-26T14:20:00Z',
    };
  })];
}

function seedCustomRoles(organisationId: string): AdminRole[] {
  const capabilities: Capability[] = ['profitability.view', 'products.view', 'cogs.view', 'cogs.approve', 'expenses.view', 'expenses.view_sensitive', 'reports.view', 'audit.view'];
  return [{
    id: 'custom-finance-reviewer',
    label: 'Finance Reviewer',
    description: 'Reviews financial and cost information without editing operational records.',
    surface: 'tenant',
    capabilities,
    kind: 'custom',
    status: 'active',
    organisationId,
  }];
}

function seedAudit(workspace: WorkspaceSnapshot): AdminAuditEvent[] {
  const companyId = workspace.companies[0]?.id;
  const secondCompanyId = workspace.companies[1]?.id ?? companyId;
  const owner = workspace.users[0]?.name ?? 'Organisation Admin';
  const finance = workspace.users.find(user => user.roleId === 'finance')?.name ?? owner;
  const rows: Array<AdminAuditInput & { actor?: string }> = [
    { action: 'User invited', area: 'Users', entity: 'Emma Richardson', companyId, before: 'No membership', after: 'Invited · Finance / Accounts', reason: 'Quarter-end reporting support' },
    { action: 'Report exported', area: 'Reports', entity: 'Profit & Loss · August 2026', companyId, actor: finance, after: 'CSV prepared from the selected report view' },
    { action: 'Expense changed', area: 'Expenses', entity: 'Warehouse rent', companyId, actor: finance, before: 'Monthly · £1,200.00', after: 'Monthly · £1,250.00 from 01 Aug 2026', reason: 'Annual rent review' },
    { action: 'COGS approved', area: 'COGS', entity: 'Black Nitrile Gloves Large · BNGL-1010', companyId, actor: finance, before: '£4.20 per unit', after: '£4.35 per unit from 01 Aug 2026', reason: 'Approved supplier price update' },
    { action: 'Product Group updated', area: 'Product Groups', entity: 'Trade packaging multipacks', companyId: secondCompanyId, before: '3 members', after: '4 members', reason: 'Added the new case size' },
    { action: 'Role changed', area: 'Users', entity: 'Oliver Bennett', companyId, before: 'Analyst / Management Viewer', after: 'Company Manager', reason: 'Company operations responsibility' },
    { action: 'Marketplace connected', area: 'Marketplace Accounts', entity: workspace.marketplaceAccounts[0]?.displayName ?? 'Amazon UK', companyId, before: 'Disconnected', after: 'Connected · initial sync started' },
    { action: 'User suspended', area: 'Users', entity: 'Sophie Turner', companyId, before: 'Active', after: 'Suspended', reason: 'Temporary leave' },
    { action: 'Company created', area: 'Companies', entity: workspace.companies[1]?.name ?? workspace.companies[0]?.name ?? 'Company', companyId: secondCompanyId, after: 'Active' },
    { action: 'Organisation created', area: 'Organisation', entity: workspace.organisation.name, after: 'Active · GBP reporting · Europe/London' },
  ];
  return rows.map((row, index) => ({ ...row, id: `admin-demo-audit-${index}`, timestamp: `2026-08-${String(27 - Math.floor(index / 3)).padStart(2, '0')}T${String(18 - index).padStart(2, '0')}:20:00Z`, actor: row.actor ?? owner, source: 'Representative workspace activity' }));
}

function AdminState({ workspace, children }: { workspace: WorkspaceSnapshot; children: React.ReactNode }) {
  const { role } = useAccessRuntime();
  const { scenarioId } = usePrototype();
  const [organisation, setOrganisation] = useState<AdminContextValue['organisation']>({ ...workspace.organisation, createdAt: '2025-01-15', status: 'active' });
  const [companies, setCompanies] = useState<AdminCompany[]>(() => workspace.companies.map(company => ({ ...company, status: 'active', tradingName: company.name.replace(/ Ltd$/, ''), description: 'Marketplace trading company within the organisation.', productCount: workspace.organisation.slug === 'stock-supplies' ? 60 : 0 })));
  const [accounts, setAccounts] = useState<AdminAccount[]>(() => workspace.marketplaceAccounts.map((account, index) => ({
    ...account, status: scenarioId === 'healthy' && workspace.organisation.slug === 'stock-supplies' ? (['synced', 'authentication_required', 'delayed', 'syncing', 'paused', 'disconnected'] as AdminAccount['status'][])[index] ?? account.status : account.status,
    listingCount: workspace.organisation.slug === 'stock-supplies' ? [35, 20, 17, 45, 28, 63][index] ?? 0 : 0,
  })));
  const [users, setUsers] = useState<AdminUser[]>(() => seedUsers(workspace));
  const [customRoles, setCustomRoles] = useState<AdminRole[]>(() => seedCustomRoles(workspace.organisation.id));
  const roles = useMemo(() => [...defaultRoles, ...customRoles], [customRoles]);
  const [audit, setAudit] = useState<AdminAuditEvent[]>(() => seedAudit(workspace));
  function recordAudit(input: AdminAuditInput) {
    const actor = users.find(user => getUserRoleAssignments(user).some((assignment) => assignment.roleId === role.id) && user.status === 'active')?.name ?? role.label;
    setAudit(current => [{ ...input, id: crypto.randomUUID(), timestamp: new Date().toISOString(), actor, source: 'Tenant Administration · local prototype' }, ...current]);
  }
  return <AdminContext.Provider value={{ orgSlug: organisation.slug, organisation, setOrganisation, companies, setCompanies, accounts, setAccounts, users, setUsers, roles, customRoles, setCustomRoles, audit, recordAudit, companyName: id => companies.find(company => company.id === id)?.name ?? 'Organisation-wide' }}>{children}</AdminContext.Provider>;
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const { workspace } = useAnalysisContext();
  const { scenarioId } = usePrototype();
  return <AdminState key={`${workspace.organisation.id}:${scenarioId}`} workspace={workspace}>{children}</AdminState>;
}
export function useAdmin() {
  const context = useContext(AdminContext);
  if (!context) throw new Error('Admin pages must be inside AdminProvider.');
  return context;
}
